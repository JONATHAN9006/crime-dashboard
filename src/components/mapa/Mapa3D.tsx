import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MapaGL, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import clsx from 'clsx';
import { Compass, Download, Eye, Layers, LocateFixed, Map as IconoMapa, Mountain, RotateCcw, RotateCw, Satellite, SlidersHorizontal, X } from 'lucide-react';
import { URL_DEM, ZOOM_MAX_DEM } from '../../utils/relieveDem';
import { MUNICIPIOS_MEPOY, FUENTE_MUNICIPIOS, COCONUCO, type NombreMunicipio } from '../../data/municipiosMepoy';

// ───────────────────────────────────────────────────────────────────────────
// VISTA 3D DEL TERRENO (MapLibre GL JS) — modo ADICIONAL del Mapa.
//
// El mapa operativo (Leaflet) sigue siendo el predeterminado y queda
// montado detrás, sin tocar: al volver, conserva capas, filtros, selección
// y zoom. Esta vista recibe lo que el mapa operativo ya calculó (polígonos
// con sus colores, la MISMA imagen del kernel de calor, puntos, marcadores)
// y lo dibuja sobre terreno 3D real:
//  · Elevación: Terrain Tiles (Mapzen/AWS, SRTM), exageración ajustable.
//  · Territorios: límites municipales reales del DANE (MGN 2020) para
//    Popayán, Timbío, Sotará y Puracé (Coconuco es la cabecera de Puracé).
//    Sus bordes se levantan como PAREDES 3D sobre el terreno (bloques
//    angostos a lo largo del límite, cada uno apoyado en la altura del
//    terreno en ese punto), con grosor y altura configurables. Eso es solo
//    visual: no cambia coordenadas ni áreas.
//  · «Aislar jurisdicción»: tapa lo que queda fuera de los 4 municipios
//    (efecto maqueta). Al descargar con fondo transparente, eso queda
//    realmente transparente en el PNG.
// ───────────────────────────────────────────────────────────────────────────

export type Modo3D = 'relieve3d' | 'satelite3d';

export interface Datos3D {
  poligonos: { type: 'FeatureCollection'; features: unknown[] }; // props: __fill, __op, __line, __ancho
  etiquetas: { lat: number; lon: number; texto: string; color: string }[];
  calores: { dataUrl: string; bounds: [[number, number], [number, number]]; opacidad: number }[];
  puntos: { lat: number; lon: number; color: string }[];
  marcadores: { lat: number; lon: number; color: string; texto: string; forma: 'pin' | 'cuadro' }[];
  leyenda: { etiqueta: string; color?: string; gradiente?: string[]; forma: 'relleno' | 'gradiente' | 'punto' | 'pin' }[];
}

const RAMPA_HIPSOMETRICA: (number | string)[] = [
  0, '#56a050', 500, '#6eb054', 1000, '#96c462', 1500, '#bad270', 1900, '#d6d680', 2300, '#debe74',
  2800, '#c8965a', 3300, '#aa7048', 3800, '#967868', 4300, '#cdc8c4', 4700, '#fafafa',
];

const COLORES_MUNICIPIO_DEFECTO: Record<NombreMunicipio, string> = {
  Popayán: '#e7e1d2',
  Timbío: '#d4c21c',
  Sotará: '#2f9e44',
  Puracé: '#f2711c',
};
const CLAVE_CONFIG = 'mepoy-3d-config';
interface Config3D {
  colores: Record<NombreMunicipio, string>;
  territorios: boolean;
  aislar: boolean;
  alturaParedes: number; // m sobre el terreno
  grosorBorde: number; // m de ancho de la pared
  etiquetasTerritorio: boolean;
  etiquetasOperativas: boolean;
  exageracion: number;
}
const CONFIG_DEFECTO: Config3D = { colores: COLORES_MUNICIPIO_DEFECTO, territorios: true, aislar: true, alturaParedes: 400, grosorBorde: 150, etiquetasTerritorio: true, etiquetasOperativas: false, exageracion: 1.3 };
const COLOR_FONDO_AISLADO = '#0e1a2b';
const COLOR_LLAVE = '#ff00ff'; // solo durante la descarga transparente (se vuelve alfa 0)

function leerConfig(): Config3D {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CONFIG) || '{}');
    return { ...CONFIG_DEFECTO, ...c, colores: { ...COLORES_MUNICIPIO_DEFECTO, ...(c.colores ?? {}) } };
  } catch { return CONFIG_DEFECTO; }
}

// ── Geometría auxiliar (solo visual) ──────────────────────────────────────
type Anillo = [number, number][];
const anillosExteriores = () => MUNICIPIOS_MEPOY.features.flatMap((f) => f.geometry.coordinates.map((p) => ({ municipio: f.properties.municipio, anillo: p[0] as Anillo })));

/** Paredes: rectángulos angostos de ≤80 m a lo largo de cada límite. */
function paredes(grosorM: number) {
  const feats: unknown[] = [];
  const PASO = 80;
  for (const { municipio, anillo } of anillosExteriores()) {
    for (let i = 0; i < anillo.length - 1; i++) {
      const [x0, y0] = anillo[i], [x1, y1] = anillo[i + 1];
      const kx = 111320 * Math.cos((y0 * Math.PI) / 180), ky = 110540;
      const dx = (x1 - x0) * kx, dy = (y1 - y0) * ky;
      const largo = Math.hypot(dx, dy);
      if (largo === 0) continue;
      const n = Math.max(1, Math.ceil(largo / PASO));
      const nx = (-dy / largo) * (grosorM / 2) / kx, ny = (dx / largo) * (grosorM / 2) / ky;
      for (let j = 0; j < n; j++) {
        const a = j / n, b = (j + 1) / n;
        const ax = x0 + (x1 - x0) * a, ay = y0 + (y1 - y0) * a, bx = x0 + (x1 - x0) * b, by = y0 + (y1 - y0) * b;
        feats.push({ type: 'Feature', properties: { m: municipio }, geometry: { type: 'Polygon', coordinates: [[[ax - nx, ay - ny], [bx - nx, by - ny], [bx + nx, by + ny], [ax + nx, ay + ny], [ax - nx, ay - ny]]] } });
      }
    }
  }
  return { type: 'FeatureCollection', features: feats };
}

/** Máscara: todo el mundo menos los 4 municipios (efecto maqueta). */
function mascara() {
  const huecos = anillosExteriores().map(({ anillo }) => [...anillo].reverse());
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-179, -85], [179, -85], [179, 85], [-179, 85], [-179, -85]], ...huecos] } };
}

function centroDe(anillo: Anillo): [number, number] {
  // Centroide de área (fórmula del polígono), en grados — solo para ubicar la etiqueta.
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < anillo.length - 1; i++) {
    const [x0, y0] = anillo[i], [x1, y1] = anillo[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return a ? [cy / (3 * a), cx / (3 * a)] : [anillo[0][1], anillo[0][0]];
}

const LIMITES_JURISDICCION = (() => {
  const b = new maplibregl.LngLatBounds();
  for (const { anillo } of anillosExteriores()) for (const p of anillo) b.extend(p);
  return b;
})();
const LIMITES_POPAYAN_URBANO: [[number, number], [number, number]] = [[-76.66, 2.40], [-76.55, 2.50]];

function estilo(modo: Modo3D, vias: boolean, aislar: boolean, exageracion: number): StyleSpecification {
  const dem = { type: 'raster-dem' as const, tiles: [URL_DEM], encoding: 'terrarium' as const, tileSize: 256, maxzoom: ZOOM_MAX_DEM, attribution: 'Elevación: Terrain Tiles (Mapzen/AWS, SRTM)' };
  const fondo = aislar ? COLOR_FONDO_AISLADO : '#dfe7e4';
  return {
    version: 8,
    sources: {
      terreno: dem,
      sombreado: dem,
      satelite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' },
      vias: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
      lugares: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19, attribution: 'Vías y nombres © Esri' },
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': fondo } },
      ...(modo === 'satelite3d'
        ? [{ id: 'satelite', type: 'raster' as const, source: 'satelite' }]
        : [{ id: 'hipsometrico', type: 'color-relief' as const, source: 'sombreado', paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...RAMPA_HIPSOMETRICA] as never, 'color-relief-opacity': 1 } }]),
      { id: 'sombreado', type: 'hillshade', source: 'sombreado', paint: { 'hillshade-method': 'multidirectional', 'hillshade-exaggeration': modo === 'satelite3d' ? 0.35 : 0.7, 'hillshade-shadow-color': '#1f2a24', 'hillshade-highlight-color': '#ffffff' } as never },
      ...(vias ? [
        { id: 'vias', type: 'raster' as const, source: 'vias', paint: { 'raster-opacity': 0.9 } },
        { id: 'lugares', type: 'raster' as const, source: 'lugares' },
      ] : []),
    ],
    terrain: { source: 'terreno', exaggeration: exageracion },
    sky: (aislar
      ? { 'sky-color': fondo, 'horizon-color': fondo, 'fog-color': fondo, 'sky-horizon-blend': 0, 'horizon-fog-blend': 0, 'fog-ground-blend': 1, 'atmosphere-blend': 0 }
      : { 'sky-color': '#9cc7e8', 'horizon-color': '#e6f0f4', 'fog-color': '#e6f0f4', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.25 }) as never,
  } as StyleSpecification;
}

function htmlPin(color: string, texto: string, forma: 'pin' | 'cuadro') {
  if (forma === 'cuadro') return `<div style="width:24px;height:24px;border-radius:6px;background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:800 10.5px system-ui;color:#fff">${texto}</div>`;
  return `<div style="position:relative;width:28px;height:38px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))"><svg width="28" height="38" viewBox="0 0 30 40"><path d="M15 39C15 39 27.5 25.6 27.5 15A12.5 12.5 0 0 0 2.5 15C2.5 25.6 15 39 15 39Z" fill="${color}" stroke="#fff" stroke-width="2.2"/><circle cx="15" cy="15" r="8.6" fill="#fff"/></svg><span style="position:absolute;left:0;top:8px;width:28px;text-align:center;font:800 ${texto.length > 1 ? 10 : 11.5}px/13px system-ui;color:${color}">${texto}</span></div>`;
}
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function htmlEtiquetaOperativa(texto: string, color: string) {
  return `<div style="transform:translateY(-50%);white-space:nowrap;background:rgba(16,35,63,.85);border:1.5px solid ${color};border-radius:6px;padding:1px 6px;font:700 10.5px system-ui;color:#fff;box-shadow:0 2px 5px rgba(0,0,0,.35)">${esc(texto)}</div>`;
}
function htmlEtiquetaTerritorio(texto: string, sub?: string) {
  return `<div style="white-space:nowrap;text-align:center;background:rgba(9,17,29,.88);border:1.5px solid rgba(255,255,255,.75);border-radius:10px;padding:5px 14px;font:800 16px system-ui;letter-spacing:.2px;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.5)">${esc(texto)}${sub ? `<div style="font:600 10.5px system-ui;color:#cbd5e1">${esc(sub)}</div>` : ''}</div>`;
}

export default function Mapa3D({ modo, setModo, datos, centro, zoom, onSalir, puedeDescargar, titulo }: {
  modo: Modo3D;
  setModo: (m: Modo3D) => void;
  datos: Datos3D;
  centro: [number, number];
  zoom: number; // zoom de Leaflet
  onSalir: (centro: [number, number], zoomLeaflet: number) => void;
  puedeDescargar: boolean;
  titulo: string;
}) {
  void centro; void zoom; // la vista 3D abre encuadrando la jurisdicción completa
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaGL | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [inclinacion, setInclinacion] = useState(55);
  const [rotacion, setRotacion] = useState(-12);
  const [vias, setVias] = useState(true);
  const [operativas, setOperativas] = useState(true);
  const [config, setConfig] = useState<Config3D>(leerConfig);
  const [panelConfig, setPanelConfig] = useState(false);
  const [panelCamara, setPanelCamara] = useState(() => typeof window === 'undefined' || window.innerHeight >= 860);
  const [descargando, setDescargando] = useState(false);
  const [opDescarga, setOpDescarga] = useState<{ ancho: 0 | 1920 | 3840; transparente: boolean; leyenda: boolean }>({ ancho: 1920, transparente: true, leyenda: false });
  useEffect(() => { try { localStorage.setItem(CLAVE_CONFIG, JSON.stringify(config)); } catch { /* opcional */ } }, [config]);
  const cfg = (c: Partial<Config3D>) => setConfig((p) => ({ ...p, ...c }));

  const geoParedes = useMemo(() => paredes(config.grosorBorde), [config.grosorBorde]);
  const geoMascara = useMemo(() => mascara(), []);

  function encuadrarJurisdiccion(animar = true) {
    mapaRef.current?.fitBounds(LIMITES_JURISDICCION, { padding: 60, pitch: 55, bearing: -12, duration: animar ? 1200 : 0 });
  }

  // Crear el mapa una sola vez, encuadrando la jurisdicción completa.
  useEffect(() => {
    if (!contenedor.current) return;
    const mapa = new maplibregl.Map({
      container: contenedor.current,
      style: estilo(modo, vias, config.aislar, config.exageracion),
      bounds: LIMITES_JURISDICCION,
      fitBoundsOptions: { padding: 60 },
      pitch: 55,
      bearing: -12,
      maxPitch: 85,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      attributionControl: { compact: true, customAttribution: FUENTE_MUNICIPIOS },
    });
    mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right');
    mapa.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapa.on('pitch', () => setInclinacion(Math.round(mapa.getPitch())));
    mapa.on('rotate', () => setRotacion(Math.round(mapa.getBearing())));
    let errores = 0;
    mapa.on('error', (e) => {
      errores++;
      if (errores > 4) setErrorCarga('Algunas teselas del terreno o del fondo no cargan (revisa la conexión a internet).');
      console.warn('[Mapa 3D]', e?.error?.message ?? e);
    });
    mapa.on('style.load', () => setListo(true));
    mapaRef.current = mapa;
    return () => { marcadoresRef.current.forEach((m) => m.remove()); mapa.remove(); mapaRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios del estilo base (Relieve/Satélite, vías, aislar): mismo mapa, otro estilo.
  const primeraVez = useRef(true);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (primeraVez.current) { primeraVez.current = false; return; }
    setListo(false);
    mapa.setStyle(estilo(modo, vias, config.aislar, config.exageracion));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, vias, config.aislar]);

  useEffect(() => {
    const m = mapaRef.current;
    if (!m || !listo) return;
    try { m.setTerrain({ source: 'terreno', exaggeration: config.exageracion }); } catch (e) { console.warn('[Mapa 3D] terreno', e); }
  }, [config.exageracion, listo]);

  // Capas: máscara, territorios (tinte + paredes), capas operativas.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;
    const quitar = (id: string) => { if (mapa.getLayer(id)) mapa.removeLayer(id); };
    const quitarFuente = (id: string) => { if (mapa.getSource(id)) mapa.removeSource(id); };
    ['mascara', 'territorio-tinte', 'territorio-linea', 'territorio-paredes', 'poligonos-relleno', 'poligonos-borde', 'puntos'].forEach(quitar);
    for (let i = 0; i < 12; i++) { quitar(`calor-${i}`); quitarFuente(`calor-${i}`); }
    ['mascara', 'municipios', 'paredes', 'poligonos', 'puntos'].forEach(quitarFuente);

    const colorPorMunicipio = ['match', ['get', 'municipio'], ...Object.entries(config.colores).flat(), '#ffffff'] as never;
    if (config.territorios) {
      mapa.addSource('municipios', { type: 'geojson', data: MUNICIPIOS_MEPOY as never });
      mapa.addLayer({ id: 'territorio-tinte', type: 'fill', source: 'municipios', paint: { 'fill-color': colorPorMunicipio, 'fill-opacity': ['match', ['get', 'municipio'], 'Popayán', 0.1, 0.24] as never } });
    }
    if (operativas) {
      mapa.addSource('poligonos', { type: 'geojson', data: datos.poligonos as never });
      mapa.addLayer({ id: 'poligonos-relleno', type: 'fill', source: 'poligonos', paint: { 'fill-color': ['get', '__fill'], 'fill-opacity': ['get', '__op'] } });
      datos.calores.forEach((c, i) => {
        const [[s, o], [n, e]] = c.bounds;
        mapa.addSource(`calor-${i}`, { type: 'image', url: c.dataUrl, coordinates: [[o, n], [e, n], [e, s], [o, s]] });
        mapa.addLayer({ id: `calor-${i}`, type: 'raster', source: `calor-${i}`, paint: { 'raster-opacity': c.opacidad, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
      });
      mapa.addLayer({ id: 'poligonos-borde', type: 'line', source: 'poligonos', paint: { 'line-color': ['get', '__line'], 'line-width': ['get', '__ancho'] } });
      mapa.addSource('puntos', { type: 'geojson', data: { type: 'FeatureCollection', features: datos.puntos.map((p) => ({ type: 'Feature', properties: { c: p.color }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) } as never });
      mapa.addLayer({ id: 'puntos', type: 'circle', source: 'puntos', paint: { 'circle-radius': 4, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });
    }
    if (config.aislar) {
      mapa.addSource('mascara', { type: 'geojson', data: geoMascara as never });
      mapa.addLayer({ id: 'mascara', type: 'fill', source: 'mascara', paint: { 'fill-color': COLOR_FONDO_AISLADO, 'fill-opacity': 1, 'fill-antialias': false } });
    }
    if (config.territorios) {
      mapa.addLayer({ id: 'territorio-linea', type: 'line', source: 'municipios', paint: { 'line-color': '#0b0f14', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 13, 4] as never } });
      if (config.alturaParedes > 0) {
        mapa.addSource('paredes', { type: 'geojson', data: geoParedes as never });
        mapa.addLayer({ id: 'territorio-paredes', type: 'fill-extrusion', source: 'paredes', paint: {
          'fill-extrusion-color': ['match', ['get', 'm'], ...Object.entries(config.colores).flat(), '#ffffff'] as never,
          'fill-extrusion-height': config.alturaParedes,
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        } });
      }
    }
  }, [datos, listo, operativas, config.territorios, config.aislar, config.alturaParedes, config.colores, geoParedes, geoMascara]);

  // Etiquetas (HTML sobre el terreno): territoriales grandes; operativas (CAI/
  // estaciones) pequeñas y apagadas por defecto; marcadores del Plan Candado.
  useEffect(() => {
    const mapa = mapaRef.current;
    marcadoresRef.current.forEach((m) => m.remove());
    marcadoresRef.current = [];
    if (!mapa) return;
    const agregar = (html: string, lon: number, lat: number, anchor: maplibregl.PositionAnchor) => {
      const el = document.createElement('div');
      el.innerHTML = html;
      marcadoresRef.current.push(new maplibregl.Marker({ element: el, anchor }).setLngLat([lon, lat]).addTo(mapa));
    };
    if (config.etiquetasTerritorio) {
      for (const f of MUNICIPIOS_MEPOY.features) {
        const [lat, lon] = centroDe(f.geometry.coordinates[0][0]);
        agregar(htmlEtiquetaTerritorio(f.properties.municipio), lon, lat, 'center');
      }
      agregar(htmlEtiquetaTerritorio('Coconuco', 'cabecera de Puracé'), COCONUCO[1], COCONUCO[0], 'center');
    }
    if (operativas) {
      for (const m of datos.marcadores) agregar(htmlPin(m.color, m.texto, m.forma), m.lon, m.lat, m.forma === 'pin' ? 'bottom' : 'center');
      if (config.etiquetasOperativas) for (const t of datos.etiquetas) agregar(htmlEtiquetaOperativa(t.texto, t.color), t.lon, t.lat, 'left');
    }
  }, [datos, operativas, listo, config.etiquetasTerritorio, config.etiquetasOperativas]);

  const camara = (o: { pitch?: number; bearing?: number }) => mapaRef.current?.easeTo({ ...o, duration: 500 });

  function salir() {
    const m = mapaRef.current;
    if (!m) { onSalir(centro, zoom); return; }
    const c = m.getCenter();
    onSalir([c.lat, c.lng], Math.round(m.getZoom() + 1));
  }

  // ── Descarga PNG: imagen REAL de la vista 3D (WebGL), en alta resolución y,
  // si se pide, con lo que queda fuera de la jurisdicción realmente transparente.
  async function esperarRender(mapa: MapaGL) {
    await Promise.race([new Promise<void>((r) => { if (mapa.loaded()) r(); else mapa.once('idle', () => r()); }), new Promise<void>((r) => window.setTimeout(r, 8000))]);
    mapa.triggerRepaint();
    await Promise.race([new Promise<void>((r) => mapa.once('render', () => r())), new Promise<void>((r) => window.setTimeout(r, 1500))]);
  }

  async function descargar() {
    const mapa = mapaRef.current;
    if (!mapa || !puedeDescargar) return;
    setDescargando(true);
    const ratioOriginal = mapa.getPixelRatio();
    // Con «Aislar jurisdicción», lo de afuera se pinta con un color llave para
    // poder RECORTAR la imagen justo a los municipios (y dejarla transparente
    // si se pide). Sin aislar, sale la vista completa.
    const usarLlave = config.aislar;
    const transparente = opDescarga.transparente && usarLlave;
    try {
      const css = mapa.getCanvas().clientWidth;
      const glCtx = (mapa.getCanvas().getContext('webgl2') ?? mapa.getCanvas().getContext('webgl')) as WebGLRenderingContext | null;
      const maxTex = glCtx ? (glCtx.getParameter(glCtx.MAX_RENDERBUFFER_SIZE) as number) : undefined;
      let ratio = opDescarga.ancho ? opDescarga.ancho / css : ratioOriginal;
      if (maxTex) ratio = Math.min(ratio, maxTex / Math.max(css, mapa.getCanvas().clientHeight));
      if (usarLlave) {
        // Color llave en lo que se volverá transparente (fondo, cielo y máscara).
        mapa.setPaintProperty('fondo', 'background-color', COLOR_LLAVE);
        if (mapa.getLayer('mascara')) mapa.setPaintProperty('mascara', 'fill-color', COLOR_LLAVE);
        mapa.setSky({ 'sky-color': COLOR_LLAVE, 'horizon-color': COLOR_LLAVE, 'fog-color': COLOR_LLAVE, 'sky-horizon-blend': 0, 'horizon-fog-blend': 0, 'fog-ground-blend': 1, 'atmosphere-blend': 0 } as never);
      }
      mapa.setPixelRatio(ratio);
      await esperarRender(mapa);
      const gl = mapa.getCanvas();
      const c = document.createElement('canvas');
      c.width = gl.width; c.height = gl.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(gl, 0, 0);
      if (usarLlave) {
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          // Distancia al magenta: 0 = fondo → transparente; bordes suavizados.
          const dist = Math.max(255 - d[i], d[i + 1], 255 - d[i + 2]);
          if (dist < 40) d[i + 3] = 0;
          else if (dist < 110) { const a = (dist - 40) / 70; d[i + 3] = Math.round(255 * a); d[i] = Math.min(255, d[i]); d[i + 1] = d[i + 1]; }
        }
        ctx.putImageData(img, 0, 0);
      }
      const k = gl.width / gl.clientWidth;
      ctx.scale(k, k);
      // Etiquetas y pines (HTML en pantalla) redibujados en su posición proyectada.
      const etiquetar = (texto: string, lon: number, lat: number, grande: boolean, color = 'rgba(255,255,255,.75)') => {
        const p = mapa.project([lon, lat]);
        ctx.font = grande ? '800 16px system-ui, sans-serif' : '700 10.5px system-ui, sans-serif';
        const w = ctx.measureText(texto).width + (grande ? 28 : 12), h = grande ? 30 : 18;
        const x = grande ? p.x - w / 2 : p.x, y = p.y - h / 2;
        ctx.fillStyle = grande ? 'rgba(9,17,29,0.88)' : 'rgba(16,35,63,0.85)'; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, grande ? 10 : 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillText(texto, x + w / 2, p.y + 0.5); ctx.textAlign = 'left';
      };
      if (config.etiquetasTerritorio) {
        for (const f of MUNICIPIOS_MEPOY.features) { const [lat, lon] = centroDe(f.geometry.coordinates[0][0]); etiquetar(f.properties.municipio, lon, lat, true); }
        etiquetar('Coconuco', COCONUCO[1], COCONUCO[0], true);
      }
      if (operativas) {
        if (config.etiquetasOperativas) for (const t of datos.etiquetas) etiquetar(t.texto, t.lon, t.lat, false, t.color);
        for (const m of datos.marcadores) {
          const p = mapa.project([m.lon, m.lat]);
          ctx.fillStyle = m.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          if (m.forma === 'pin') {
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.bezierCurveTo(p.x, p.y, p.x + 11.7, p.y - 12.5, p.x + 11.7, p.y - 22.4); ctx.arc(p.x, p.y - 22.4, 11.7, 0, Math.PI, true); ctx.bezierCurveTo(p.x - 11.7, p.y - 12.5, p.x, p.y, p.x, p.y); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y - 22.4, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = m.color; ctx.font = `800 ${m.texto.length > 1 ? 10 : 11.5}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.texto, p.x, p.y - 22);
          } else {
            ctx.beginPath(); ctx.roundRect(p.x - 12, p.y - 12, 24, 24, 6); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font = '800 10.5px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.texto, p.x, p.y);
          }
          ctx.textAlign = 'left';
        }
      }
      if (opDescarga.leyenda) {
        const filas: { etiqueta: string; color?: string; gradiente?: string[] }[] = [
          ...(config.territorios ? (Object.keys(config.colores) as NombreMunicipio[]).map((m) => ({ etiqueta: m, color: config.colores[m] })) : []),
          ...(operativas ? datos.leyenda : []),
        ];
        const anchoL = 270, altoL = 50 + filas.length * 20;
        ctx.fillStyle = 'rgba(16,35,63,0.9)';
        ctx.beginPath(); ctx.roundRect(14, 14, anchoL, altoL, 12); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui'; ctx.textBaseline = 'alphabetic'; ctx.fillText(titulo, 26, 36);
        ctx.font = '600 11px system-ui'; ctx.fillStyle = '#b8c7d6'; ctx.fillText(`${modo === 'satelite3d' ? 'Satélite 3D' : 'Relieve 3D'} · relieve ×${config.exageracion.toFixed(1)}`, 26, 52);
        filas.forEach((f, i) => {
          const y = 72 + i * 20;
          if (f.gradiente) {
            const g = ctx.createLinearGradient(26, 0, 60, 0);
            f.gradiente.forEach((col, j) => g.addColorStop(j / Math.max(1, f.gradiente!.length - 1), col));
            ctx.fillStyle = g; ctx.fillRect(26, y - 9, 34, 10);
          } else { ctx.fillStyle = f.color ?? '#fff'; ctx.fillRect(26, y - 10, 16, 12); }
          ctx.fillStyle = '#fff'; ctx.font = '600 11.5px system-ui'; ctx.fillText(f.etiqueta, f.gradiente ? 68 : 50, y);
        });
        ctx.font = '500 9.5px system-ui'; ctx.fillStyle = transparente ? '#334155' : '#e2e8f0';
        ctx.fillText(`${FUENTE_MUNICIPIOS} · Elevación: Terrain Tiles (SRTM)`, 16, c.height / k - 10);
      }
      // Recorte justo a lo dibujado (municipios, paredes y nombres), con un
      // margen pequeño; sin aislar, se deja la vista completa.
      let salida = c;
      if (usarLlave) {
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        if (x1 >= x0 && y1 >= y0) {
          const m = Math.round(Math.max(c.width, c.height) * 0.015);
          x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(c.width - 1, x1 + m); y1 = Math.min(c.height - 1, y1 + m);
          salida = document.createElement('canvas');
          salida.width = x1 - x0 + 1; salida.height = y1 - y0 + 1;
          const sc = salida.getContext('2d')!;
          if (!transparente) { sc.fillStyle = COLOR_FONDO_AISLADO; sc.fillRect(0, 0, salida.width, salida.height); }
          sc.drawImage(c, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height);
        }
      }
      const a = document.createElement('a');
      a.download = `mapa-3d-mepoy-${salida.width}x${salida.height}${transparente ? '-transparente' : ''}.png`;
      a.href = salida.toDataURL('image/png');
      a.click();
    } catch (e) {
      console.error('[Mapa 3D] No se pudo descargar:', e);
      setErrorCarga('No fue posible generar la imagen 3D (alguna fuente del mapa no permite exportar).');
    } finally {
      mapa.setPixelRatio(ratioOriginal);
      if (usarLlave) {
        mapa.setPaintProperty('fondo', 'background-color', COLOR_FONDO_AISLADO);
        if (mapa.getLayer('mascara')) mapa.setPaintProperty('mascara', 'fill-color', COLOR_FONDO_AISLADO);
        mapa.setSky({ 'sky-color': COLOR_FONDO_AISLADO, 'horizon-color': COLOR_FONDO_AISLADO, 'fog-color': COLOR_FONDO_AISLADO, 'sky-horizon-blend': 0, 'horizon-fog-blend': 0, 'fog-ground-blend': 1, 'atmosphere-blend': 0 } as never);
      }
      setDescargando(false);
    }
  }

  const boton = 'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold';
  const leyendaPantalla = [
    ...(config.territorios ? (Object.keys(config.colores) as NombreMunicipio[]).map((m) => ({ etiqueta: m, color: config.colores[m], forma: 'relleno' as const })) : []),
    ...(operativas ? datos.leyenda : []),
  ];
  return (
    <div className="absolute inset-0 z-[1200]" style={{ background: config.aislar ? COLOR_FONDO_AISLADO : '#dfe7e4' }}>
      <div ref={contenedor} className="h-full w-full" />
      {!listo && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-[#10233f] shadow">Cargando terreno 3D…</span></div>}

      <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-2 [&>*]:pointer-events-auto">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/40 bg-[#10233f]/90 p-1 text-white shadow-lg backdrop-blur">
          <button type="button" onClick={salir} className={clsx(boton, 'hover:bg-white/10')} title="Volver al mapa operativo (2D)"><X size={14} /> Mapa operativo</button>
          <span className="mx-0.5 h-5 w-px bg-white/20" />
          {([['relieve3d', 'Relieve 3D', <Mountain key="m" size={14} />], ['satelite3d', 'Satélite 3D', <Satellite key="s" size={14} />]] as const).map(([m, t, ic]) => (
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} className={clsx(boton, modo === m ? 'bg-[#116762]' : 'hover:bg-white/10')}>{ic} {t}</button>
          ))}
        </div>
        <div className="flex max-w-[62%] flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg">
            <button type="button" onClick={() => encuadrarJurisdiccion()} className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')} title="Ver los cuatro municipios completos"><IconoMapa size={14} /> Jurisdicción</button>
            <button type="button" onClick={() => mapaRef.current?.fitBounds(LIMITES_POPAYAN_URBANO, { padding: 40, pitch: 50, duration: 1200 })} className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')} title="Acercar al casco urbano de Popayán"><LocateFixed size={14} /> Popayán urbano</button>
            <button type="button" onClick={() => camara({ pitch: 0, bearing: 0 })} className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')} title="Vista superior (sin inclinación)"><Eye size={14} /> Vista superior</button>
            <label className="flex items-center gap-1 px-1.5 text-[12px] font-semibold text-[#10233f]"><input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={operativas} onChange={(e) => setOperativas(e.target.checked)} /> <Layers size={13} /> Capas operativas</label>
            <button type="button" aria-expanded={panelConfig} onClick={() => setPanelConfig((v) => !v)} className={clsx(boton, panelConfig ? 'bg-[#e3f2ef] text-[#0f5f57]' : 'text-[#10233f] hover:bg-slate-100')}><SlidersHorizontal size={14} /> Configurar</button>
          </div>
          {panelConfig && (
            <div className="max-h-[60vh] w-[290px] overflow-y-auto rounded-xl border border-slate-200 bg-white/97 p-3 text-[12px] text-[#10233f] shadow-lg">
              <p className="mb-1 font-bold">Territorios (límites DANE)</p>
              <label className="flex items-center gap-1.5 py-0.5"><input type="checkbox" className="accent-[#116762]" checked={config.territorios} onChange={(e) => cfg({ territorios: e.target.checked })} /> Mostrar municipios</label>
              <label className="flex items-center gap-1.5 py-0.5"><input type="checkbox" className="accent-[#116762]" checked={config.aislar} onChange={(e) => cfg({ aislar: e.target.checked })} /> Aislar jurisdicción (maqueta)</label>
              <label className="flex items-center gap-1.5 py-0.5"><input type="checkbox" className="accent-[#116762]" checked={config.etiquetasTerritorio} onChange={(e) => cfg({ etiquetasTerritorio: e.target.checked })} /> Nombres de municipios</label>
              <label className="flex items-center gap-1.5 py-0.5"><input type="checkbox" className="accent-[#116762]" checked={config.etiquetasOperativas} onChange={(e) => cfg({ etiquetasOperativas: e.target.checked })} /> Etiquetas de CAI y estaciones</label>
              <label className="flex items-center gap-1.5 py-0.5"><input type="checkbox" className="accent-[#116762]" checked={vias} onChange={(e) => setVias(e.target.checked)} /> Vías y nombres del mapa base</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {(Object.keys(config.colores) as NombreMunicipio[]).map((m) => (
                  <label key={m} className="flex items-center gap-1.5">
                    <input type="color" value={config.colores[m]} onChange={(e) => cfg({ colores: { ...config.colores, [m]: e.target.value } })} className="h-6 w-7 cursor-pointer rounded border border-slate-200 p-0" /> {m}
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => cfg({ colores: COLORES_MUNICIPIO_DEFECTO })} className="mt-1 text-[11px] font-semibold text-[#0f5f57] hover:underline">Colores por defecto</button>
              <label className="mt-2 block">Altura de las paredes <b className="float-right tabular-nums">{config.alturaParedes} m</b>
                <input type="range" min={0} max={800} step={20} value={config.alturaParedes} onChange={(e) => cfg({ alturaParedes: Number(e.target.value) })} className="w-full accent-[#116762]" />
              </label>
              <label className="block">Grosor del borde <b className="float-right tabular-nums">{config.grosorBorde} m</b>
                <input type="range" min={30} max={300} step={10} value={config.grosorBorde} onChange={(e) => cfg({ grosorBorde: Number(e.target.value) })} className="w-full accent-[#116762]" />
              </label>
              <p className="mt-1 text-[10.5px] leading-snug text-slate-400">Paredes y grosor son solo visuales: no cambian límites, coordenadas ni áreas. Coconuco es la cabecera de Puracé (no es municipio aparte).</p>
              {puedeDescargar && (
                <>
                  <p className="mb-1 mt-3 font-bold">Descarga PNG</p>
                  <div className="flex gap-1">
                    {([[0, 'Pantalla'], [1920, 'Full HD'], [3840, '4K']] as const).map(([v, t]) => (
                      <button key={t} type="button" aria-pressed={opDescarga.ancho === v} onClick={() => setOpDescarga((o) => ({ ...o, ancho: v }))} className={clsx('rounded-md px-2 py-1 font-semibold', opDescarga.ancho === v ? 'bg-[#10233f] text-white' : 'bg-slate-100 hover:bg-slate-200')}>{t}</button>
                    ))}
                  </div>
                  <label className="mt-1 flex items-center gap-1.5"><input type="checkbox" className="accent-[#116762]" checked={opDescarga.transparente} disabled={!config.aislar} onChange={(e) => setOpDescarga((o) => ({ ...o, transparente: e.target.checked }))} /> Fondo transparente {config.aislar ? '' : '(requiere «Aislar jurisdicción»)'}</label>
                  <p className="text-[10.5px] text-slate-400">{config.aislar ? 'La imagen se recorta justo a los municipios.' : 'Sin aislar sale la vista completa.'}</p>
                  <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-[#116762]" checked={opDescarga.leyenda} onChange={(e) => setOpDescarga((o) => ({ ...o, leyenda: e.target.checked }))} /> Incluir leyenda y créditos</label>
                </>
              )}
            </div>
          )}
          {!panelConfig && leyendaPantalla.length > 0 && (
            <div className="max-h-[40vh] w-[220px] overflow-y-auto rounded-xl border border-white/30 bg-[#10233f]/88 p-3 text-[11.5px] text-white shadow-lg backdrop-blur">
              <p className="mb-1.5 font-bold">Leyenda</p>
              {leyendaPantalla.map((f) => (
                <div key={f.etiqueta} className="flex items-center gap-2 py-0.5">
                  {'gradiente' in f && f.gradiente ? <span className="h-2.5 w-8 rounded" style={{ background: `linear-gradient(90deg, ${f.gradiente.join(',')})` }} />
                    : <span className={clsx('h-3 w-3 shrink-0', f.forma === 'relleno' ? 'rounded-[3px] ring-1 ring-white/60' : 'rounded-full ring-1 ring-white')} style={{ background: f.color }} />}
                  <span className="truncate">{f.etiqueta}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-10 left-3 w-[230px] max-w-[calc(100%-1.5rem)] rounded-xl border border-slate-200 bg-white/95 p-3 text-[12px] text-[#10233f] shadow-lg">
        <button type="button" onClick={() => setPanelCamara((v) => !v)} aria-expanded={panelCamara} className="mb-1 flex w-full items-center gap-1.5 font-bold"><Compass size={14} className="text-[#116762]" /> Cámara y relieve <span className="ml-auto text-[11px] font-semibold text-slate-400">{panelCamara ? 'Ocultar' : 'Mostrar'}</span></button>
        {panelCamara && <>
        <label className="block">Inclinación <b className="float-right tabular-nums">{inclinacion}°</b>
          <input type="range" min={0} max={85} value={inclinacion} onChange={(e) => camara({ pitch: Number(e.target.value) })} className="w-full accent-[#116762]" />
        </label>
        <label className="mt-1 block">Rotación <b className="float-right tabular-nums">{rotacion}°</b>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => camara({ bearing: rotacion - 30 })} aria-label="Girar a la izquierda" className="rounded p-0.5 hover:bg-slate-100"><RotateCcw size={14} /></button>
            <input type="range" min={-180} max={180} value={rotacion} onChange={(e) => camara({ bearing: Number(e.target.value) })} className="min-w-0 flex-1 accent-[#116762]" />
            <button type="button" onClick={() => camara({ bearing: rotacion + 30 })} aria-label="Girar a la derecha" className="rounded p-0.5 hover:bg-slate-100"><RotateCw size={14} /></button>
          </div>
        </label>
        <label className="mt-1 block">Exageración del relieve <b className="float-right tabular-nums">×{config.exageracion.toFixed(1)}</b>
          <input type="range" min={1} max={3} step={0.1} value={config.exageracion} onChange={(e) => cfg({ exageracion: Number(e.target.value) })} className="w-full accent-[#116762]" />
        </label>
        </>}
        {puedeDescargar && (
          <button type="button" disabled={descargando || !listo} onClick={() => void descargar()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#116762] py-1.5 text-[12px] font-bold text-white hover:bg-[#0f5f57] disabled:opacity-50">
            <Download size={14} /> {descargando ? 'Generando…' : `Descargar PNG ${opDescarga.ancho ? (opDescarga.ancho === 3840 ? '4K' : 'Full HD') : ''}${opDescarga.transparente && config.aislar ? ' · transparente' : ''}`}
          </button>
        )}
      </div>
      {errorCarga && <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-900 shadow" role="status">{errorCarga}</div>}
    </div>
  );
}
