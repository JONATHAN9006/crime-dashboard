import { useEffect, useMemo, useState } from 'react';
import { GeoJSON as GeoJSONLayer, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KernelHeatmapLayer } from '../mapa/KernelHeatmapLayer';
import { cargarCapas } from '../../data/geoStorage';
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
    try {
      if (contorno.length > 0) {
        map.fitBounds(L.geoJSON(contorno as unknown as GeoJSON.FeatureCollection['features']).getBounds(), { padding: [6, 6] });
        return;
      }
      if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [10, 10], maxZoom: 14 });
    } catch { /* geometría inválida: se queda en Popayán */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contorno.length, puntos.length > 1]);
  return null;
}

export function MapaRnmc({ registros }: { registros: { lat: number | null; lon: number | null }[] }) {
  const [contorno, setContorno] = useState<Feature[]>([]);
  useEffect(() => {
    cargarCapas().then((capas) => {
      for (const capa of capas) {
        const feats = featuresDe(capa.geojson).filter((f) => Object.values(f.properties ?? {}).some((v) => ESTACIONES.has(normalizar(v))));
        if (feats.length > 0) { setContorno(feats); return; }
      }
    }).catch(() => {});
  }, []);

  const puntos = useMemo(
    () => registros.filter((r): r is { lat: number; lon: number } => esCoordenadaValida(r.lat, r.lon)).map((r) => ({ lat: r.lat, lon: r.lon })),
    [registros],
  );

  return (
    <div className="relative h-full min-h-[250px] overflow-hidden rounded-lg border border-slate-200">
      <MapContainer center={CENTRO_POPAYAN} zoom={12} zoomControl={false} attributionControl={false} scrollWheelZoom={false} className="h-full w-full" style={{ minHeight: 250 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {contorno.length > 0 && (
          <GeoJSONLayer key={contorno.length} data={{ type: 'FeatureCollection', features: contorno } as never} style={{ color: '#111827', weight: 2, fillOpacity: 0.03 }} />
        )}
        <KernelHeatmapLayer puntos={puntos} colores={PALETA} opacidad={0.75} />
        <Encuadrar contorno={contorno} puntos={puntos} />
      </MapContainer>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 z-[400] rounded bg-white/85 px-1.5 py-0.5 text-[10px] text-slate-600">
        {puntos.length.toLocaleString('es-CO')} con coordenadas · Kernel 200 m
      </span>
    </div>
  );
}
