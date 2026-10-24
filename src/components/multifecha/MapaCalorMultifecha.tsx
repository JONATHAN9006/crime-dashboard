import { useEffect, useMemo, useState } from 'react';
import { GeoJSON as GeoJSONLayer, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import clsx from 'clsx';
import { KernelHeatmapLayer } from '../mapa/KernelHeatmapLayer';
import { FlechasBarrios, type PosicionesRotulo } from '../mapa/FlechasBarrios';
import { cargarCapas, restringirCapasAPopayan, type CapaGeografica } from '../../data/geoStorage';
import { sincronizarCapasDesdeServidor } from '../../data/geoSync';
import { COCONUCO } from '../../data/municipiosMepoy';
import { CompuertaGeograficaPiloto, LimitarAPopayan, esPerfilPilotoActual, municipiosVisibles } from '../mapa/RestriccionPiloto';
import { puntoEnPopayan } from '../../utils/territorioPiloto';
import { calcularTopBarrios, normalizarNombre } from '../../utils/barriosAfectados';
import { esCoordenadaValida } from '../../utils/geodesia';
import type { CrimeRecord } from '../../types/crime';

// Mapa de calor del Multifecha: misma densidad Kernel del Mapa /
// Georreferenciación (radio 200 m), con los barrios (contorno y nombre),
// los límites municipales reales y las flechas a los barrios más afectados
// (rótulo arrastrable, igual que en Georreferenciación). Base Mapa /
// Satélite / Híbrido. Solo dibuja: los registros llegan ya filtrados.

const PALETA = ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'];
// Color del contorno de cada shapefile (no se usan rojos/verdes del calor).
const COLORES_CAPAS = ['#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#2dd4bf', '#fb923c', '#e2e8f0', '#818cf8'];
const CENTRO_POPAYAN: [number, number] = [2.4448, -76.6147];
type Base = 'mapa' | 'satelite' | 'hibrido';
type Feature = { type: 'Feature'; geometry: { type: string; coordinates: unknown }; properties?: Record<string, unknown> };

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

/** Centro aproximado (promedio del anillo exterior más grande). */
function centroDe(f: Feature): [number, number] | null {
  const geom = f.geometry;
  const pol = (geom?.type === 'Polygon' ? [geom.coordinates] : geom?.type === 'MultiPolygon' ? geom.coordinates : []) as number[][][][];
  let mejor: number[][] | null = null;
  for (const p of pol) if (p[0] && (!mejor || p[0].length > mejor.length)) mejor = p[0];
  if (!mejor?.length) return null;
  return [mejor.reduce((a, c) => a + c[1], 0) / mejor.length, mejor.reduce((a, c) => a + c[0], 0) / mejor.length];
}

const esCapaBarrios = (c: CapaGeografica) => c.dimension === 'barrioHecho' || /barrio/i.test(c.nombre) || (c.campoUnion != null && /BARRIO/i.test(c.campoUnion));
function nombreBarrio(c: CapaGeografica, f: Feature): string {
  const props = f.properties ?? {};
  const v = c.campoUnion && props[c.campoUnion] != null ? props[c.campoUnion] : Object.entries(props).find(([k]) => /BARRIO|NOMBRE|NOM_/i.test(k))?.[1];
  return String(v ?? '').trim();
}

function Encuadrar({ contorno, puntos, senal }: { contorno: Feature[]; puntos: { lat: number; lon: number }[]; senal: number }) {
  const map = useMap();
  useEffect(() => {
    const encuadrar = () => {
      map.invalidateSize();
      try {
        if (contorno.length > 0) { map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: contorno } as never).getBounds(), { padding: [6, 6] }); return; }
        if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [16, 16], maxZoom: 15 });
      } catch { /* geometría inválida */ }
    };
    const t = window.setTimeout(encuadrar, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contorno, map, senal]);
  return null;
}

/** Nivel de zoom actual (para mostrar u ocultar nombres según la escala). */
function useZoom(): number {
  const map = useMap();
  const [z, setZ] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZ(map.getZoom()) });
  return z;
}

function Etiquetas({ barrios, municipios, satelital, nombresBarrios }: { barrios: { nombre: string; pos: [number, number] }[]; municipios: { nombre: string; pos: [number, number] }[]; satelital: boolean; nombresBarrios: boolean }) {
  const z = useZoom();
  const colorBarrio = satelital ? '#ffffff' : '#10233f';
  const halo = satelital ? '0 0 3px #000,0 0 2px #000,0 1px 2px #000' : '0 0 3px #fff,0 0 2px #fff,0 0 1px #fff';
  return (
    <>
      {z <= 13 && municipios.map((m) => (
        <Marker key={m.nombre} position={m.pos} interactive={false} icon={L.divIcon({ className: '', iconSize: [0, 0], html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:800 ${z <= 11 ? 15 : 17}px/1 system-ui,Arial,sans-serif;color:#fff;text-shadow:0 0 4px #000,0 1px 3px #000,0 0 8px rgba(0,0,0,.6);letter-spacing:.2px">${m.nombre}</div>` })} />
      ))}
      {nombresBarrios && z >= 14 && barrios.map((b) => (
        <Marker key={b.nombre} position={b.pos} interactive={false} icon={L.divIcon({ className: '', iconSize: [0, 0], html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:700 ${z >= 16 ? 11.5 : 10}px/1 system-ui,Arial,sans-serif;color:${colorBarrio};text-shadow:${halo};pointer-events:none">${b.nombre.replace(/</g, '&lt;')}</div>` })} />
      ))}
    </>
  );
}

interface PropsMapaMF {
  registros: CrimeRecord[];
  /** Máximo común de densidad (escala comparable entre vigencias). */
  maxFijo?: number;
  alto?: number;
}

/** Perfil piloto: sin validación del ámbito de Popayán, el mapa no se abre. */
export function MapaCalorMultifecha(props: PropsMapaMF) {
  return (
    <CompuertaGeograficaPiloto alto={props.alto ?? 380}>
      <MapaCalorMultifechaContenido {...props} />
    </CompuertaGeograficaPiloto>
  );
}

function MapaCalorMultifechaContenido({ registros, maxFijo, alto = 380 }: PropsMapaMF) {
  const [capasFuente, setCapas] = useState<CapaGeografica[]>([]);
  // Piloto: copia con solo los elementos de Popayán (las capas originales no se tocan).
  const capas = useMemo(() => (esPerfilPilotoActual() ? restringirCapasAPopayan(capasFuente) : capasFuente), [capasFuente]);
  const [base, setBase] = useState<Base>('hibrido');
  const [nombresBarrios, setNombresBarrios] = useState(true);
  const [top, setTop] = useState<0 | 3 | 5 | 10>(5);
  const [posiciones, setPosiciones] = useState<PosicionesRotulo>({});
  const [senalEncuadre, setSenalEncuadre] = useState(0);
  // Capas (shapefiles) que el usuario apagó en este mapa. Al abrir, todas
  // las capas de la nube se muestran; cada una se puede apagar aquí.
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  const capaVisible = (c: CapaGeografica) => !ocultas.has(c.id);
  const alternarCapa = (c: CapaGeografica) => setOcultas((prev) => {
    const n = new Set(prev);
    if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
    return n;
  });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      // Primero la copia local (rápido) y luego SIEMPRE las capas de la nube:
      // así aparecen todos los shapefiles compartidos aunque este equipo no
      // los tuviera guardados.
      try {
        const locales = await cargarCapas();
        if (!cancelado && locales?.length) setCapas(locales);
      } catch { /* sin copia local */ }
      try {
        const remotas = await sincronizarCapasDesdeServidor();
        if (!cancelado && remotas?.length) setCapas(remotas);
      } catch { /* sin conexión: queda lo local */ }
    })();
    return () => { cancelado = true; };
  }, []);

  const { estaciones, barriosFeatures, barriosEtiquetas, poligonosBarrio } = useMemo(() => {
    const todas = capas.flatMap((c) => featuresDe(c.geojson));
    const est = todas.filter((f) => Object.values(f.properties ?? {}).some((v) => ESTACIONES.has(normalizar(v))));
    const bf: Feature[] = [];
    const etiquetas: { nombre: string; pos: [number, number] }[] = [];
    const poligonos = new Map<string, unknown>();
    const vistos = new Set<string>();
    for (const c of capas.filter(esCapaBarrios)) {
      const dibujar = !ocultas.has(c.id);
      for (const f of featuresDe(c.geojson)) {
        if (dibujar) bf.push(f);
        const nombre = nombreBarrio(c, f);
        const clave = normalizarNombre(nombre);
        if (!nombre || vistos.has(clave)) continue;
        vistos.add(clave);
        poligonos.set(clave, f);
        const pos = centroDe(f);
        if (pos) etiquetas.push({ nombre, pos });
      }
    }
    return { estaciones: est, barriosFeatures: bf, barriosEtiquetas: etiquetas, poligonosBarrio: poligonos };
  }, [capas, ocultas]);
  const otrasCapas = useMemo(() => capas.filter((c) => !esCapaBarrios(c)), [capas]);

  const municipios = useMemo(() => {
    const m = municipiosVisibles().features.map((f) => ({ nombre: f.properties.municipio as string, pos: centroDe(f as unknown as Feature) })).filter((x): x is { nombre: string; pos: [number, number] } => x.pos != null);
    if (esPerfilPilotoActual()) return m; // piloto: solo el rótulo de Popayán
    return [...m.filter((x) => x.nombre !== 'Puracé'), ...m.filter((x) => x.nombre === 'Puracé'), { nombre: 'Coconuco', pos: COCONUCO }];
  }, []);

  const puntos = useMemo(() => registros.filter((r) => esCoordenadaValida(r.lat, r.lon) && (!esPerfilPilotoActual() || puntoEnPopayan(r.lat, r.lon))).map((r) => ({ lat: r.lat as number, lon: r.lon as number })), [registros]);
  const flechas = useMemo(() => (top === 0 ? [] : calcularTopBarrios(registros, top, { poligonosBarrio })), [registros, top, poligonosBarrio]);
  const satelital = base !== 'mapa';
  const trazo = satelital ? '#ffffff' : '#334155';

  return (
    <div className="relative h-full overflow-hidden rounded-xl border border-slate-200 bg-[#0e1a2b]" style={{ minHeight: alto }}>
      <MapContainer center={CENTRO_POPAYAN} zoom={13} zoomControl attributionControl={false} scrollWheelZoom className="h-full w-full" style={{ minHeight: alto, background: '#0e1a2b' }}>
        {base === 'mapa' && <TileLayer key="mapa" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={20} />}
        {base !== 'mapa' && <TileLayer key="sat" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} />}
        {base === 'hibrido' && <TileLayer key="vias" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} opacity={0.75} />}
        <LimitarAPopayan />
        <GeoJSONLayer key={`mun-${base}`} data={municipiosVisibles() as never} interactive={false} style={{ color: satelital ? '#ffffff' : '#10233f', weight: 2, opacity: 0.85, fillOpacity: 0, dashArray: '6 4' }} />
        {barriosFeatures.length > 0 && (
          <GeoJSONLayer key={`bar-${base}-${barriosFeatures.length}`} data={{ type: 'FeatureCollection', features: barriosFeatures } as never} interactive={false} style={{ color: trazo, weight: 0.8, opacity: satelital ? 0.55 : 0.5, fillOpacity: 0 }} />
        )}
        {/* Demás shapefiles de la nube (comunas, CAI, cuadrantes, zonas…), cada uno con su color. */}
        {otrasCapas.map((c, i) => capaVisible(c) && (
          <GeoJSONLayer
            key={`capa-${c.id}-${base}`}
            data={c.geojson as never}
            interactive={false}
            style={{ color: COLORES_CAPAS[i % COLORES_CAPAS.length], weight: 1.8, opacity: 0.9, fillOpacity: 0 }}
            pointToLayer={(_f, latlng) => L.circleMarker(latlng, { radius: 4, color: '#ffffff', weight: 1, fillColor: COLORES_CAPAS[i % COLORES_CAPAS.length], fillOpacity: 0.95 })}
          />
        ))}
        {estaciones.length > 0 && (
          <GeoJSONLayer key={`est-${base}-${estaciones.length}`} data={{ type: 'FeatureCollection', features: estaciones } as never} interactive={false} style={{ color: satelital ? '#ffffff' : '#10233f', weight: 2.4, opacity: 0.95, fillOpacity: 0 }} />
        )}
        <KernelHeatmapLayer puntos={puntos} colores={PALETA} opacidad={0.82} maxFijo={maxFijo} />
        <Etiquetas barrios={barriosEtiquetas} municipios={municipios} satelital={satelital} nombresBarrios={nombresBarrios} />
        <FlechasBarrios flechas={flechas} posiciones={posiciones} onMover={(k, p) => setPosiciones((prev) => ({ ...prev, [k]: p }))} />
        <Encuadrar contorno={estaciones} puntos={puntos} senal={senalEncuadre} />
      </MapContainer>

      {/* Controles (estilo panel blanco, esquina superior derecha) */}
      <div className="absolute right-2 top-2 z-[500] w-[178px] space-y-1 rounded-lg bg-white/95 p-2 text-[11.5px] text-[#10233f] shadow-lg">
        {([['mapa', 'Mapa'], ['satelite', 'Satélite'], ['hibrido', 'Híbrido']] as const).map(([v, t]) => (
          <label key={v} className="flex cursor-pointer items-center gap-1.5"><input type="radio" name="base-mf" className="accent-[#116762]" checked={base === v} onChange={() => setBase(v)} /> {t}</label>
        ))}
        {capas.length > 0 && (
          <>
            <div className="my-1 border-t border-slate-200" />
            <p className="font-semibold text-slate-500">Capas ({capas.length})</p>
            <div className="max-h-[132px] space-y-0.5 overflow-y-auto pr-0.5">
              {capas.map((c) => {
                const i = otrasCapas.indexOf(c);
                return (
                  <label key={c.id} className="flex cursor-pointer items-center gap-1.5" title={c.nombre}>
                    <input type="checkbox" className="accent-[#116762]" checked={capaVisible(c)} onChange={() => alternarCapa(c)} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm border" style={{ borderColor: i >= 0 ? COLORES_CAPAS[i % COLORES_CAPAS.length] : '#334155', background: i >= 0 ? 'transparent' : '#e2e8f0' }} />
                    <span className="truncate">{c.nombre}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
        <div className="my-1 border-t border-slate-200" />
        <label className="flex cursor-pointer items-center gap-1.5" title="Los nombres aparecen al acercar el mapa"><input type="checkbox" className="accent-[#116762]" checked={nombresBarrios} onChange={(e) => setNombresBarrios(e.target.checked)} /> Nombres de barrios</label>
        <div>
          <p className="mb-0.5 font-semibold text-slate-500">Señalar barrios</p>
          <div className="grid grid-cols-4 overflow-hidden rounded-md border border-slate-200">
            {([0, 3, 5, 10] as const).map((v) => (
              <button key={v} type="button" onClick={() => setTop(v)} aria-pressed={top === v} className={clsx('py-0.5 text-[10.5px] font-bold', top === v ? 'bg-[#116762] text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>{v === 0 ? 'No' : v}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Leyenda vertical */}
      <div className="absolute bottom-2 right-2 z-[500] rounded-lg bg-white/95 px-2.5 py-2 text-[10.5px] text-[#10233f] shadow-lg">
        <p className="mb-1 font-bold">Concentración de casos</p>
        <div className="flex items-stretch gap-1.5">
          <span className="w-3 rounded-sm" style={{ height: 72, background: `linear-gradient(0deg, ${PALETA.join(',')})` }} />
          <span className="flex flex-col justify-between font-semibold"><span>Alta</span><span>Baja</span></span>
        </div>
        {maxFijo ? <p className="mt-1 text-[9.5px] text-slate-500">Escala común entre vigencias</p> : null}
      </div>

      <button type="button" onClick={() => setSenalEncuadre((s) => s + 1)} title="Volver a encuadrar" className="absolute left-[11px] top-[84px] z-[500] flex h-[30px] w-[30px] items-center justify-center rounded border-2 border-black/20 bg-white text-[#10233f] hover:bg-slate-50">
        <Crosshair size={15} />
      </button>
      <span className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
        {puntos.length.toLocaleString('es-CO')} de {registros.length.toLocaleString('es-CO')} casos con coordenadas{!capas.some(esCapaBarrios) ? ' · sin capa de barrios cargada' : ''}
      </span>
    </div>
  );
}
