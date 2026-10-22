// Restricción geográfica del perfil consulta_piloto (/piloto) en los mapas.
//
//  · <CompuertaGeograficaPiloto>: si el límite de Popayán no se puede validar,
//    el mapa NO se abre: se muestra un aviso neutro y se registra el evento
//    en la bitácora del servidor (sin detalles internos para el usuario).
//  · <LimitarAPopayan />: dentro de un MapContainer, fija los límites de
//    desplazamiento (maxBounds + viscosidad 1) y el zoom mínimo al ámbito de
//    Popayán, y oscurece todo lo que queda fuera del límite municipal.
//  · Para cualquier otro perfil (administrador, /interno, /jefe, /cai) no
//    hacen nada: el mapa se comporta exactamente como siempre.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { GeoJSON as GeoJSONLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPinOff } from 'lucide-react';
import { obtenerModoAcceso } from '../../utils/modoAcceso';
import { featurePopayan, limitesPopayan, territorioPilotoValido } from '../../utils/territorioPiloto';
import { reportarEventoSeguridad } from '../../cai/apiCai';
import { MUNICIPIOS_MEPOY } from '../../data/municipiosMepoy';

export const esPerfilPilotoActual = () => obtenerModoAcceso() === 'piloto';

/** Margen alrededor del límite municipal para no cortar el borde en pantalla. */
const MARGEN_GRADOS = 0.02;
export const ZOOM_MINIMO_PILOTO = 11;

export function limitesLeafletPopayan(): L.LatLngBounds | null {
  const l = limitesPopayan();
  if (!l) return null;
  return L.latLngBounds([l.sur - MARGEN_GRADOS, l.oeste - MARGEN_GRADOS], [l.norte + MARGEN_GRADOS, l.este + MARGEN_GRADOS]);
}

/** Límites municipales visibles: en el piloto, solo Popayán. */
export function municipiosVisibles(): typeof MUNICIPIOS_MEPOY {
  if (!esPerfilPilotoActual()) return MUNICIPIOS_MEPOY;
  const p = featurePopayan();
  return { type: 'FeatureCollection', features: p ? [p] : [] };
}

export function VistaGeograficaNoDisponible({ alto = 320 }: { alto?: number }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-center" style={{ minHeight: alto }}>
      <MapPinOff size={26} className="text-slate-400" />
      <p className="text-[14px] font-semibold text-[#10233f]">Vista geográfica no disponible</p>
      <p className="max-w-sm text-[12.5px] text-slate-500">En este momento no es posible mostrar el mapa para tu perfil. Intenta más tarde o comunícate con el administrador.</p>
    </div>
  );
}

let eventoReportado = false;
export function CompuertaGeograficaPiloto({ children, alto }: { children: ReactNode; alto?: number }) {
  const denegado = esPerfilPilotoActual() && !territorioPilotoValido();
  useEffect(() => {
    if (denegado && !eventoReportado) { eventoReportado = true; reportarEventoSeguridad('geo_denegado'); }
  }, [denegado]);
  if (denegado) return <VistaGeograficaNoDisponible alto={alto} />;
  return <>{children}</>;
}

/** Va DENTRO del MapContainer. No hace nada fuera del perfil piloto. */
export function LimitarAPopayan({ mascara = true }: { mascara?: boolean }) {
  const map = useMap();
  const piloto = esPerfilPilotoActual();
  const limites = useMemo(() => (piloto ? limitesLeafletPopayan() : null), [piloto]);
  const ajustado = useRef(false);

  useEffect(() => {
    if (!piloto || !limites) return;
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(limites);
    map.setMinZoom(ZOOM_MINIMO_PILOTO);
    if (!ajustado.current) {
      ajustado.current = true;
      if (!limites.contains(map.getCenter()) || map.getZoom() < ZOOM_MINIMO_PILOTO) map.fitBounds(limites);
    }
    // Cualquier movimiento programático (buscador, "centrar", encuadres)
    // que intente salir del ámbito vuelve a Popayán.
    const volver = () => { if (!limites.contains(map.getCenter())) map.panInsideBounds(limites, { animate: false }); };
    map.on('moveend', volver);
    return () => { map.off('moveend', volver); };
  }, [map, piloto, limites]);

  // Máscara: todo lo que está fuera del límite de Popayán queda oscurecido.
  const datosMascara = useMemo(() => {
    const p = piloto && mascara ? featurePopayan() : null;
    if (!p) return null;
    const mundo: [number, number][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
    const huecos = p.geometry.coordinates.map((poligono) => poligono[0]);
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [mundo, ...huecos] } };
  }, [piloto, mascara]);

  if (!datosMascara) return null;
  return (
    <GeoJSONLayer
      key="mascara-piloto"
      data={datosMascara as never}
      interactive={false}
      style={{ color: '#10233f', weight: 2.2, opacity: 0.9, fillColor: '#0b1626', fillOpacity: 0.6, fillRule: 'evenodd' }}
    />
  );
}
