import { useMemo, useState } from 'react';
import { Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { direccionesHaciaAfuera, normalizarNombre, type FlechaBarrio } from '../../utils/barriosAfectados';

// Flechas a los barrios más afectados, con el RÓTULO ARRASTRABLE:
//  · La punta de la flecha queda clavada en el barrio.
//  · El rótulo se puede tomar con el mouse y soltar donde se quiera, para
//    que no se monte sobre otro — la flecha lo sigue mientras se arrastra.
//  · La posición elegida se guarda en coordenadas del mapa (lat/lon), así
//    la descarga dibuja cada rótulo EXACTAMENTE donde se dejó en pantalla.
//  · Los rótulos que nadie ha movido se ubican solos (hacia afuera del
//    grupo, a LARGO px de la punta).

export const LARGO_FLECHA_PX = 66;
const CABEZA = 13;

export type PosicionesRotulo = Record<string, { lat: number; lon: number }>;

export function claveRotulo(f: { barrio: string }): string {
  return normalizarNombre(f.barrio);
}

/**
 * Posición del rótulo de cada flecha: la que el usuario dejó al arrastrar,
 * o la automática calculada con el zoom/encuadre ACTUAL del mapa. Se usa
 * igual en pantalla y al descargar, para que ambas coincidan.
 */
export function posicionesEfectivasRotulo(flechas: FlechaBarrio[], mapa: L.Map, manuales: PosicionesRotulo): FlechaBarrio[] {
  const dirs = direccionesHaciaAfuera(flechas);
  return flechas.map((f, i) => {
    const manual = manuales[claveRotulo(f)];
    if (manual) return { ...f, rotuloLat: manual.lat, rotuloLon: manual.lon };
    const punta = mapa.latLngToContainerPoint([f.lat, f.lon]);
    const pos = mapa.containerPointToLatLng([punta.x + dirs[i].x * LARGO_FLECHA_PX, punta.y + dirs[i].y * LARGO_FLECHA_PX]);
    return { ...f, rotuloLat: pos.lat, rotuloLon: pos.lng };
  });
}

function htmlRotulo(f: FlechaBarrio): string {
  const texto = `${f.rango}. ${f.barrio}`.replace(/</g, '&lt;');
  const casos = `${f.casos.toLocaleString('es-CO')} caso${f.casos === 1 ? '' : 's'}`;
  return `<div title="Arrastra para reubicar" style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;background:#ffffff;border:2px solid #b91c1c;border-radius:6px;padding:2px 7px;box-shadow:0 2px 6px rgba(0,0,0,.25);font:700 11.5px/1.25 system-ui,Arial,sans-serif;color:#7f1d1d;text-align:center;cursor:grab;user-select:none">${texto}<br><span style="font-weight:600;color:#475569;font-size:10.5px">${casos}</span></div>`;
}

function htmlCabeza(angulo: number): string {
  // (Ojo: un <svg> de 0×0 NO se dibuja en Chrome aunque tenga overflow
  // visible — por eso mide 1×1.) Triángulo con la punta en (0,0), apuntando hacia la derecha; se rota
  // al ángulo de la línea rótulo → barrio.
  return `<svg width="1" height="1" style="position:absolute;left:0;top:0;overflow:visible;pointer-events:none"><g transform="rotate(${angulo.toFixed(1)})"><polygon points="0,0 ${-CABEZA},${-CABEZA * 0.55} ${-CABEZA},${CABEZA * 0.55}" fill="#b91c1c" stroke="#ffffff" stroke-width="1.5"/></g></svg>`;
}

function FlechaArrastrable({ f, onMover }: { f: FlechaBarrio & { rotuloLat: number; rotuloLon: number }; onMover: (pos: { lat: number; lon: number }) => void }) {
  const mapa = useMap();
  // Posición en vivo mientras se arrastra (la flecha sigue al rótulo).
  const [enVivo, setEnVivo] = useState<{ lat: number; lon: number } | null>(null);
  const rotulo = enVivo ?? { lat: f.rotuloLat, lon: f.rotuloLon };

  const pPunta = mapa.latLngToLayerPoint([f.lat, f.lon]);
  const pRotulo = mapa.latLngToLayerPoint([rotulo.lat, rotulo.lon]);
  const dx = pPunta.x - pRotulo.x, dy = pPunta.y - pRotulo.y;
  const dist = Math.hypot(dx, dy) || 1;
  const base = mapa.layerPointToLatLng([pPunta.x - (dx / dist) * CABEZA, pPunta.y - (dy / dist) * CABEZA]);
  const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;

  const iconoRotulo = useMemo(() => L.divIcon({ className: 'flecha-barrio', html: htmlRotulo(f), iconSize: [0, 0], iconAnchor: [0, 0] }), [f.rango, f.barrio, f.casos]); // eslint-disable-line react-hooks/exhaustive-deps
  const iconoCabeza = L.divIcon({ className: 'flecha-barrio', html: htmlCabeza(angulo), iconSize: [0, 0], iconAnchor: [0, 0] });
  const linea: [number, number][] = [[rotulo.lat, rotulo.lon], [base.lat, base.lng]];

  return (
    <>
      <Polyline positions={linea} pathOptions={{ color: '#ffffff', weight: 6, opacity: 1, lineCap: 'round' }} interactive={false} />
      <Polyline positions={linea} pathOptions={{ color: '#b91c1c', weight: 3.5, opacity: 1, lineCap: 'round' }} interactive={false} />
      <Marker position={[f.lat, f.lon]} icon={iconoCabeza} interactive={false} keyboard={false} zIndexOffset={900} />
      <Marker
        position={[rotulo.lat, rotulo.lon]}
        icon={iconoRotulo}
        draggable
        keyboard={false}
        zIndexOffset={1000}
        eventHandlers={{
          drag: (e) => { const ll = (e.target as L.Marker).getLatLng(); setEnVivo({ lat: ll.lat, lon: ll.lng }); },
          dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); setEnVivo(null); onMover({ lat: ll.lat, lon: ll.lng }); },
        }}
      />
    </>
  );
}

export function FlechasBarrios({ flechas, posiciones, onMover }: {
  flechas: FlechaBarrio[];
  posiciones: PosicionesRotulo;
  onMover: (clave: string, pos: { lat: number; lon: number }) => void;
}) {
  const mapa = useMap();
  // Re-render al hacer zoom: los rótulos que NO se han movido mantienen su
  // distancia en pantalla, y la cabeza de flecha recalcula su ángulo.
  const [, setZoom] = useState(0);
  useMapEvents({ zoomend: () => setZoom((z) => z + 1) });
  const conPosicion = posicionesEfectivasRotulo(flechas, mapa, posiciones) as (FlechaBarrio & { rotuloLat: number; rotuloLon: number })[];
  return (
    <>
      {conPosicion.map((f) => (
        <FlechaArrastrable key={claveRotulo(f)} f={f} onMover={(pos) => onMover(claveRotulo(f), pos)} />
      ))}
    </>
  );
}
