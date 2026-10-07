import { useEffect, useMemo, useState } from 'react';
import { GeoJSON as GeoJSONLayer, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KernelHeatmapLayer } from '../mapa/KernelHeatmapLayer';
import { cargarCapas, type CapaGeografica } from '../../data/geoStorage';
import { sincronizarCapasDesdeServidor } from '../../data/geoSync';
import { esCoordenadaValida } from '../../utils/geodesia';

// Mini mapa de la "Distribución geográfica" de RNMC: la MISMA superficie
// Kernel del Mapa / Georreferenciación (radio 200 m, eventos/m²), con los
// comparendos que traen latitud/longitud. Si hay capas de estaciones
// cargadas en el mapa principal, se dibuja el contorno de Estación Norte y
// Sur como referencia.

const PALETA = ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'];
const CENTRO_POPAYAN: [number, number] = [2.4448, -76.6147];

type Feature = { type: 'Feature'; geometry: unknown; properties?: Record<string, unknown> };
const normalizar = (v: unknown) => String(v ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
const ESTACIONES = new Set(['ENORTE', 'ESUR', 'ESTACIONNORTE', 'ESTACIONSUR']);

function featuresDe(geojson: unknown): Feature[] {
  const g = geojson as { type?: string; features?: Feature[] } | Feature[] | null;
  if (!g) return [];
  if (Array.isArray(g)) return g.flatMap((x) => featuresDe(x));
  if (g.type === 'FeatureCollection' && Array.isArray(g.features)) return g.features;
  if (g.type === 'Feature') return [g as Feature];
  return [];
}

function Encuadrar({ contorno, puntos }: { contorno: Feature[]; puntos: { lat: number; lon: number }[] }) {
  const map = useMap();
  useEffect(() => {
    // El contenedor puede tomar su tamaño final después de montarse
    // (grilla de la página): se recalcula y se vuelve a encuadrar.
    const encuadrar = () => {
      map.invalidateSize();
      try {
        if (contorno.length > 0) { map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: contorno } as never).getBounds(), { padding: [4, 4] }); return; }
        if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [10, 10], maxZoom: 14 });
      } catch { /* geometría inválida */ }
    };
    const t = window.setTimeout(encuadrar, 250);
    const obs = new ResizeObserver(() => encuadrar());
    obs.observe(map.getContainer());
    return () => { window.clearTimeout(t); obs.disconnect(); };
  }, [contorno, map]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (contorno.length > 0) return;
    try {
      if (contorno.length > 0) {
        map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: contorno } as never).getBounds(), { padding: [4, 4] });
        return;
      }
      if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [10, 10], maxZoom: 14 });
    } catch { /* geometría inválida: se queda en Popayán */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contorno.length, puntos.length > 1, map]);
  return null;
}

export type CapaReferencia = 'zona' | 'comuna' | 'barrio';

function esCapaDe(capa: CapaGeografica, tipo: CapaReferencia): boolean {
  const n = normalizar(capa.nombre);
  if (tipo === 'zona') return capa.dimension === 'cuadrante' || /CUADRANTE|ZONA|ATENCION/.test(n);
  if (tipo === 'comuna') return /COMUNA/.test(n);
  return capa.dimension === 'barrioHecho' || /BARRIO/.test(n);
}

export function MapaRnmc({ registros, capaReferencia = null, conZoom = false, alto = 300 }: {
  registros: { lat: number | null; lon: number | null }[];
  /** Si se indica, se dibuja solo la capa de ese tipo (zona de atención, comuna o barrio), si existe. */
  capaReferencia?: CapaReferencia | null;
  conZoom?: boolean;
  alto?: number;
}) {
  const [capasCargadas, setCapasCargadas] = useState<CapaGeografica[]>([]);
  // Las MISMAS capas (shapefiles) del Mapa / Georreferenciación: primero
  // las guardadas en este equipo y, si no hay, las compartidas del servidor.
  // Se dibujan todas las capas visibles (contorno oscuro, sin relleno), y el
  // mapa se encuadra en ellas — así se ve la ciudad completa como en el
  // mapa principal, no un recuadro alrededor de los puntos.
  const [contorno, setContorno] = useState<Feature[]>([]);
  const [encuadre, setEncuadre] = useState<Feature[]>([]);
  useEffect(() => {
    let cancelado = false;
    const usar = (capas: CapaGeografica[] | null | undefined) => {
      if (cancelado || !capas || capas.length === 0) return false;
      const visibles = capas.filter((c) => c.visible !== false);
      const todas = (visibles.length > 0 ? visibles : capas).flatMap((c) => featuresDe(c.geojson));
      // Si existe la capa de estaciones (E-Norte / E-Sur), encuadra con ella.
      const estaciones = todas.filter((f) => Object.values(f.properties ?? {}).some((v) => ESTACIONES.has(normalizar(v))));
      setCapasCargadas(capas);
      setContorno(todas.length > 0 ? todas : estaciones);
      setEncuadre(estaciones.length > 0 ? estaciones : todas);
      return todas.length > 0;
    };
    (async () => {
      try {
        const locales = await cargarCapas();
        if (usar(locales)) return;
        usar(await sincronizarCapasDesdeServidor());
      } catch { /* sin capas: queda el mapa base */ }
    })();
    return () => { cancelado = true; };
  }, []);

  // Contorno según la capa de referencia elegida (si existe esa capa).
  const contornoVisible = useMemo(() => {
    if (!capaReferencia) return contorno;
    const elegidas = capasCargadas.filter((c) => esCapaDe(c, capaReferencia));
    return elegidas.length > 0 ? elegidas.flatMap((c) => featuresDe(c.geojson)) : contorno;
  }, [capaReferencia, capasCargadas, contorno]);

  const puntos = useMemo(
    () => registros.filter((r): r is { lat: number; lon: number } => esCoordenadaValida(r.lat, r.lon)).map((r) => ({ lat: r.lat, lon: r.lon })),
    [registros],
  );

  return (
    <div className="relative h-full overflow-hidden rounded-lg border border-slate-200" style={{ minHeight: alto }}>
      <MapContainer center={CENTRO_POPAYAN} zoom={13} zoomControl={conZoom} attributionControl={false} scrollWheelZoom className="h-full w-full" style={{ minHeight: alto }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {contornoVisible.length > 0 && (
          <GeoJSONLayer key={`${capaReferencia ?? 'todas'}-${contornoVisible.length}`} data={{ type: 'FeatureCollection', features: contornoVisible } as never} style={{ color: '#1f2937', weight: 1.4, fillColor: '#ffffff', fillOpacity: 0.04 }} />
        )}
        <KernelHeatmapLayer puntos={puntos} colores={PALETA} opacidad={0.75} />
        <Encuadrar contorno={encuadre} puntos={puntos} />
      </MapContainer>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[400] rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-600">
        {puntos.length.toLocaleString('es-CO')} con coordenadas
      </span>
    </div>
  );
}
