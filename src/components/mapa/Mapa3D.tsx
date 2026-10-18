import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapaGL, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import clsx from 'clsx';
import { Compass, Download, Eye, Layers, LocateFixed, Mountain, RotateCcw, RotateCw, Satellite, X } from 'lucide-react';
import { URL_DEM, ZOOM_MAX_DEM } from '../../utils/relieveDem';

// ───────────────────────────────────────────────────────────────────────────
// VISTA 3D DEL TERRENO (MapLibre GL JS) — modo ADICIONAL del Mapa.
//
// El mapa operativo (Leaflet) sigue siendo el predeterminado y queda
// montado detrás, sin tocar: al volver, conserva capas, filtros, selección
// y zoom. Esta vista recibe lo que el mapa operativo ya calculó —
// polígonos con sus colores (CAI, intensidad, selección), mapas de calor
// (la MISMA imagen del kernel, con su radio en metros), puntos y
// marcadores del Plan Candado— y lo dibuja sobre terreno 3D real:
//  · Elevación: Terrain Tiles (Mapzen/AWS, SRTM), formato Terrarium, con
//    exageración vertical ajustable. No se inventa ninguna altura.
//  · «Relieve 3D»: tintes hipsométricos + sombreado del mismo DEM.
//  · «Satélite 3D»: imagen satelital de Esri sobre el terreno.
// Las coordenadas no cambian: todo se dibuja con su latitud/longitud real.
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

function estilo(modo: Modo3D, vias: boolean): StyleSpecification {
  const dem = { type: 'raster-dem' as const, tiles: [URL_DEM], encoding: 'terrarium' as const, tileSize: 256, maxzoom: ZOOM_MAX_DEM, attribution: 'Elevación: Terrain Tiles (Mapzen/AWS, SRTM)' };
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
      { id: 'fondo', type: 'background', paint: { 'background-color': '#dfe7e4' } },
      ...(modo === 'satelite3d'
        ? [{ id: 'satelite', type: 'raster' as const, source: 'satelite' }]
        : [{ id: 'hipsometrico', type: 'color-relief' as const, source: 'sombreado', paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...RAMPA_HIPSOMETRICA] as never, 'color-relief-opacity': 1 } }]),
      { id: 'sombreado', type: 'hillshade', source: 'sombreado', paint: { 'hillshade-method': 'multidirectional', 'hillshade-exaggeration': modo === 'satelite3d' ? 0.35 : 0.75, 'hillshade-shadow-color': '#1f2a24', 'hillshade-highlight-color': '#ffffff' } as never },
      ...(vias ? [
        { id: 'vias', type: 'raster' as const, source: 'vias', paint: { 'raster-opacity': 0.9 } },
        { id: 'lugares', type: 'raster' as const, source: 'lugares' },
      ] : []),
    ],
    terrain: { source: 'terreno', exaggeration: 1.6 },
    sky: { 'sky-color': '#9cc7e8', 'horizon-color': '#e6f0f4', 'fog-color': '#e6f0f4', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.25 } as never,
  } as StyleSpecification;
}

function htmlPin(color: string, texto: string, forma: 'pin' | 'cuadro') {
  if (forma === 'cuadro') return `<div style="width:24px;height:24px;border-radius:6px;background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:800 10.5px system-ui;color:#fff">${texto}</div>`;
  return `<div style="position:relative;width:28px;height:38px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))"><svg width="28" height="38" viewBox="0 0 30 40"><path d="M15 39C15 39 27.5 25.6 27.5 15A12.5 12.5 0 0 0 2.5 15C2.5 25.6 15 39 15 39Z" fill="${color}" stroke="#fff" stroke-width="2.2"/><circle cx="15" cy="15" r="8.6" fill="#fff"/></svg><span style="position:absolute;left:0;top:8px;width:28px;text-align:center;font:800 ${texto.length > 1 ? 10 : 11.5}px/13px system-ui;color:${color}">${texto}</span></div>`;
}

function htmlEtiqueta(texto: string, color: string) {
  return `<div style="transform:translateY(-50%);white-space:nowrap;background:rgba(16,35,63,.88);border:2px solid ${color};border-radius:8px;padding:3px 9px;font:700 12px system-ui;color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.4)">${texto.replace(/</g, '&lt;')}</div>`;
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
  const contenedor = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaGL | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [inclinacion, setInclinacion] = useState(62);
  const [rotacion, setRotacion] = useState(-15);
  const [exageracion, setExageracion] = useState(1.6);
  const [vias, setVias] = useState(true);
  const [operativas, setOperativas] = useState(true);
  const [descargando, setDescargando] = useState(false);

  // Crear el mapa una sola vez.
  useEffect(() => {
    if (!contenedor.current) return;
    const mapa = new maplibregl.Map({
      container: contenedor.current,
      style: estilo(modo, vias),
      center: [centro[1], centro[0]],
      zoom: Math.max(1, zoom - 1), // Leaflet (256 px) → MapLibre (512 px)
      pitch: inclinacion,
      bearing: rotacion,
      maxPitch: 85,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      attributionControl: { compact: true },
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
    // El estilo ya está listo para agregar capas (no espera a que carguen todas las teselas).
    mapa.on('style.load', () => setListo(true));
    mapaRef.current = mapa;
    return () => { marcadoresRef.current.forEach((m) => m.remove()); mapa.remove(); mapaRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambiar Relieve 3D ↔ Satélite 3D o las vías: se cambia el estilo base y
  // se vuelven a poner las capas operativas encima (sin crear otro mapa).
  const primeraVez = useRef(true);
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    if (primeraVez.current) { primeraVez.current = false; return; }
    setListo(false);
    mapa.setStyle(estilo(modo, vias));
  }, [modo, vias]);

  useEffect(() => {
    const m = mapaRef.current;
    if (!m || !listo) return;
    try { m.setTerrain({ source: 'terreno', exaggeration: exageracion }); } catch (e) { console.warn('[Mapa 3D] terreno', e); }
  }, [exageracion, listo]);

  // Capas operativas: polígonos, calor y puntos (en el orden del mapa operativo).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !listo) return;
    const quitar = (id: string) => { if (mapa.getLayer(id)) mapa.removeLayer(id); };
    const quitarFuente = (id: string) => { if (mapa.getSource(id)) mapa.removeSource(id); };
    ['poligonos-relleno', 'poligonos-borde', 'puntos'].forEach(quitar);
    datos.calores.forEach((_, i) => quitar(`calor-${i}`));
    for (let i = 0; i < 12; i++) { quitar(`calor-${i}`); quitarFuente(`calor-${i}`); }
    ['poligonos', 'puntos'].forEach(quitarFuente);
    if (!operativas) return;
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
  }, [datos, listo, operativas]);

  // Marcadores (Plan Candado) y etiquetas (CAI / estaciones): HTML sobre el terreno.
  useEffect(() => {
    const mapa = mapaRef.current;
    marcadoresRef.current.forEach((m) => m.remove());
    marcadoresRef.current = [];
    if (!mapa || !operativas) return;
    for (const m of datos.marcadores) {
      const el = document.createElement('div');
      el.innerHTML = htmlPin(m.color, m.texto, m.forma);
      marcadoresRef.current.push(new maplibregl.Marker({ element: el, anchor: m.forma === 'pin' ? 'bottom' : 'center' }).setLngLat([m.lon, m.lat]).addTo(mapa));
    }
    for (const t of datos.etiquetas) {
      const el = document.createElement('div');
      el.innerHTML = htmlEtiqueta(t.texto, t.color);
      marcadoresRef.current.push(new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([t.lon, t.lat]).addTo(mapa));
    }
  }, [datos, operativas, listo]);

  const camara = (o: { pitch?: number; bearing?: number }) => mapaRef.current?.easeTo({ ...o, duration: 500 });

  function centrarPopayan() {
    mapaRef.current?.flyTo({ center: [-76.6147, 2.4448], zoom: 12.3, pitch: 62, bearing: -15, duration: 1200 });
  }

  function salir() {
    const m = mapaRef.current;
    if (!m) { onSalir(centro, zoom); return; }
    const c = m.getCenter();
    onSalir([c.lat, c.lng], Math.round(m.getZoom() + 1));
  }

  // Descarga: la imagen REAL de la vista 3D (perspectiva, terreno,
  // sombreado, capas) + pines, etiquetas y leyenda dibujados encima.
  async function descargar() {
    const mapa = mapaRef.current;
    if (!mapa || !puedeDescargar) return;
    setDescargando(true);
    try {
      // Espera a que terminen de cargar las teselas (máx. 6 s: si alguna fuente falla, se exporta lo que hay).
      await Promise.race([new Promise<void>((r) => { if (mapa.loaded()) r(); else mapa.once('idle', () => r()); }), new Promise<void>((r) => window.setTimeout(r, 6000))]);
      mapa.triggerRepaint();
      await Promise.race([new Promise<void>((r) => mapa.once('render', () => r())), new Promise<void>((r) => window.setTimeout(r, 1500))]);
      const gl = mapa.getCanvas();
      const k = gl.width / gl.clientWidth;
      const c = document.createElement('canvas');
      c.width = gl.width; c.height = gl.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(gl, 0, 0);
      ctx.scale(k, k);
      if (operativas) {
        for (const t of datos.etiquetas) {
          const p = mapa.project([t.lon, t.lat]);
          ctx.font = '700 12px system-ui, sans-serif';
          const w = ctx.measureText(t.texto).width + 18;
          ctx.fillStyle = 'rgba(16,35,63,0.88)'; ctx.strokeStyle = t.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.roundRect(p.x, p.y - 12, w, 24, 8); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(t.texto, p.x + 9, p.y);
        }
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
      // Título y leyenda
      const filas = operativas ? datos.leyenda : [];
      const anchoL = 250, altoL = 46 + filas.length * 20;
      ctx.fillStyle = 'rgba(16,35,63,0.9)';
      ctx.beginPath(); ctx.roundRect(14, 14, anchoL, altoL, 12); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui'; ctx.textBaseline = 'alphabetic'; ctx.fillText(titulo, 26, 36);
      ctx.font = '600 11px system-ui'; ctx.fillStyle = '#b8c7d6'; ctx.fillText(`${modo === 'satelite3d' ? 'Satélite 3D' : 'Relieve 3D'} · exageración ×${exageracion.toFixed(1)}`, 26, 52);
      filas.forEach((f, i) => {
        const y = 70 + i * 20;
        if (f.gradiente) {
          const g = ctx.createLinearGradient(26, 0, 60, 0);
          f.gradiente.forEach((col, j) => g.addColorStop(j / Math.max(1, f.gradiente!.length - 1), col));
          ctx.fillStyle = g; ctx.fillRect(26, y - 9, 34, 10);
        } else {
          ctx.fillStyle = f.color ?? '#fff';
          if (f.forma === 'punto' || f.forma === 'pin') { ctx.beginPath(); ctx.arc(34, y - 4, 5, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(26, y - 10, 16, 12);
        }
        ctx.fillStyle = '#fff'; ctx.font = '600 11.5px system-ui'; ctx.fillText(f.etiqueta, f.gradiente ? 68 : 50, y);
      });
      const a = document.createElement('a');
      a.download = `mapa-3d-mepoy.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    } catch (e) {
      console.error('[Mapa 3D] No se pudo descargar:', e);
      setErrorCarga('No fue posible generar la imagen 3D (alguna fuente del mapa no permite exportar).');
    } finally {
      setDescargando(false);
    }
  }

  const boton = 'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold';
  return (
    <div className="absolute inset-0 z-[1200] bg-[#dfe7e4]">
      <div ref={contenedor} className="h-full w-full" />
      {!listo && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-xl bg-white/90 px-4 py-2 text-[13px] font-semibold text-[#10233f] shadow">Cargando terreno 3D…</span></div>}

      {/* Barra superior */}
      <div className="pointer-events-none absolute left-3 right-3 top-3 flex items-start justify-between gap-2 [&>*]:pointer-events-auto">
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/40 bg-[#10233f]/90 p-1 text-white shadow-lg backdrop-blur">
          <button type="button" onClick={salir} className={clsx(boton, 'hover:bg-white/10')} title="Volver al mapa operativo (2D)"><X size={14} /> Mapa operativo</button>
          <span className="mx-0.5 h-5 w-px bg-white/20" />
          {([['relieve3d', 'Relieve 3D', <Mountain key="m" size={14} />], ['satelite3d', 'Satélite 3D', <Satellite key="s" size={14} />]] as const).map(([m, t, ic]) => (
            <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)} className={clsx(boton, modo === m ? 'bg-[#116762]' : 'hover:bg-white/10')}>{ic} {t}</button>
          ))}
        </div>
        <div className="flex max-w-[60%] flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-lg">
          <button type="button" onClick={() => camara({ pitch: 0, bearing: 0 })} className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')} title="Vista superior (sin inclinación)"><Eye size={14} /> Vista superior</button>
          <button type="button" onClick={centrarPopayan} className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')} title="Centrar en Popayán"><LocateFixed size={14} /> Popayán</button>
          <label className="flex items-center gap-1 px-1.5 text-[12px] font-semibold text-[#10233f]"><input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={operativas} onChange={(e) => setOperativas(e.target.checked)} /> <Layers size={13} /> Capas operativas</label>
          <label className="flex items-center gap-1 px-1.5 text-[12px] font-semibold text-[#10233f]"><input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={vias} onChange={(e) => setVias(e.target.checked)} /> Vías y nombres</label>
          {puedeDescargar && <button type="button" disabled={descargando || !listo} onClick={() => void descargar()} className={clsx(boton, 'bg-[#116762] text-white hover:bg-[#0f5f57] disabled:opacity-50')}><Download size={14} /> {descargando ? 'Generando…' : 'Descargar 3D'}</button>}
        </div>
        {/* Leyenda */}
      {operativas && datos.leyenda.length > 0 && (
        <div className="max-h-[40vh] w-[220px] overflow-y-auto rounded-xl border border-white/30 bg-[#10233f]/88 p-3 text-[11.5px] text-white shadow-lg backdrop-blur">
          <p className="mb-1.5 font-bold">Leyenda</p>
          {datos.leyenda.map((f) => (
            <div key={f.etiqueta} className="flex items-center gap-2 py-0.5">
              {f.gradiente ? <span className="h-2.5 w-8 rounded" style={{ background: `linear-gradient(90deg, ${f.gradiente.join(',')})` }} />
                : <span className={clsx('h-3 w-3 shrink-0', f.forma === 'relleno' ? 'rounded-[3px] ring-1 ring-white/60' : 'rounded-full ring-1 ring-white')} style={{ background: f.color }} />}
              <span className="truncate">{f.etiqueta}</span>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

      {/* Controles de cámara */}
      <div className="absolute bottom-10 left-3 w-[230px] rounded-xl border border-slate-200 bg-white/95 p-3 text-[12px] text-[#10233f] shadow-lg">
        <p className="mb-1.5 flex items-center gap-1.5 font-bold"><Compass size={14} className="text-[#116762]" /> Cámara y relieve</p>
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
        <label className="mt-1 block">Exageración del relieve <b className="float-right tabular-nums">×{exageracion.toFixed(1)}</b>
          <input type="range" min={1} max={3} step={0.1} value={exageracion} onChange={(e) => setExageracion(Number(e.target.value))} className="w-full accent-[#116762]" />
        </label>
        <p className="mt-1 text-[10.5px] leading-snug text-slate-400">Clic derecho y arrastrar (o dos dedos) también inclina y gira.</p>
      </div>

      {errorCarga && <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-900 shadow" role="status">{errorCarga}</div>}
    </div>
  );
}
