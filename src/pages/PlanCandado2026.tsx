import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';
import clsx from 'clsx';
import {
  ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, Crosshair, Download, Eye, FileSpreadsheet, Filter, Layers, Lock,
  LocateFixed, MapPin, Maximize2, Minimize2, Plus, RotateCcw, Search, Tag, TriangleAlert, Undo2, Upload, UserRound, X,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { MultiSelect } from '../components/filters/MultiSelect';
import {
  usePlanCandado, CapaLeafletPlanCandado, COLOR_GENERAL_PLAN, ControlReact, SimboloLeyenda, filasLeyendaPlanCandado, filasExport, marcadoresParaExportar,
  resumenInformeMatriz, estadoUbicacion, NO_ESP, type PlanCandadoEstado,
} from '../components/mapa/PlanCandado';
import { CAI_PLAN_CANDADO, ARCHIVO_COORDENADAS_OFICIALES, etiquetaNumeroPlanCandado, grupoVisualPlanCandado, type PuntoPlanCandado } from '../data/planCandado2026';
import { leerMatrizPlanCandado, type InformeMatriz } from '../utils/planCandadoMatriz';
import { cargarCapas, type CapaGeografica } from '../data/geoStorage';
import { mapearCuadrante } from '../data/db2Transform';
import { puntoEnFeatureGeoJSON } from '../utils/puntoEnPoligono';
import { exportarPoligonoAislado } from '../utils/exportarPoligonoMapa';
import { esSoloConsulta, tieneAcceso, puedeDescargar } from '../utils/permisos';
import { formatNumero } from '../utils/aggregations';

// ───────────────────────────────────────────────────────────────────────────
// MÓDULO «PLAN CANDADO 2026 — Georreferenciación operativa».
// Solo presentación: reutiliza el mismo estado y los mismos cálculos del
// Plan Candado que ya usa el Mapa (usePlanCandado, coordenadas oficiales +
// correcciones compartidas, marcadores, etiquetas arrastrables, leyenda y
// descarga). Estación y CAI son los del FILTRO PRINCIPAL del dashboard;
// Zona de atención, Barrio, búsqueda y el CAI del modo «Por CAI» son
// filtros propios de este módulo y no tocan ningún otro.
// ───────────────────────────────────────────────────────────────────────────

const CENTRO_POPAYAN: [number, number] = [2.4448, -76.6147];

function normalizar(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function extraerFeatures(geojson: unknown): any[] {
  const g = geojson as any;
  if (!g) return [];
  if (Array.isArray(g)) return g.flatMap(extraerFeatures);
  if (g.type === 'FeatureCollection') return g.features ?? [];
  if (g.type === 'Feature') return [g];
  return [];
}

function anillosDe(feature: any): [number, number][][] {
  const geom = feature?.geometry;
  if (!geom) return [];
  if (geom.type === 'Polygon') return geom.coordinates as [number, number][][];
  if (geom.type === 'MultiPolygon') return (geom.coordinates as [number, number][][][]).flat();
  return [];
}

// Zona de atención y Barrio: el Plan Candado no trae esos campos. Se
// obtienen SOLO por ubicación, dentro de las capas oficiales cargadas
// (Cuadrantes / Barrios). Un punto sin coordenadas no tiene zona ni barrio.
type Territorio = { zona: string | null; barrio: string | null; estacion: 'Norte' | 'Sur' | null };
function nombreCuadrante(props: Record<string, unknown>, campo: string | null): string | null {
  const candidatos = campo ? [campo] : Object.keys(props);
  for (const k of candidatos) {
    const v = props[k];
    if (v == null || v === '') continue;
    const m = mapearCuadrante(v, new Set());
    if (m && m !== 'NO REPORTADO') return m;
  }
  return null;
}
function nombreBarrio(props: Record<string, unknown>, campo: string | null): string | null {
  const k = campo ?? Object.keys(props).find((x) => /barrio|nombre|nom_/i.test(x));
  const v = k ? props[k] : null;
  return v != null && String(v).trim() ? String(v).trim() : null;
}

/** Zona y barrio de una coordenada, según las capas oficiales cargadas (con caché). */
function crearLocalizador(capas: CapaGeografica[]) {
  const capasZona = capas.filter((c) => c.dimension === 'cuadrante' || /cuadrante|zona/i.test(c.nombre));
  const capasEstacion = capas.filter((c) => c.dimension === 'estacion' || /estaci|juris/i.test(c.nombre));
  const capasBarrio = capas.filter((c) => c.dimension === 'barrioHecho' || /barrio/i.test(c.nombre));
  const cache = new Map<string, Territorio>();
  function localizar(lat: number, lon: number): Territorio {
    const k = `${lat},${lon}`;
    const ya = cache.get(k);
    if (ya) return ya;
    let zona: string | null = null;
    let barrio: string | null = null;
    let estacion: 'Norte' | 'Sur' | null = null;
    for (const c of capasEstacion) {
      const f = extraerFeatures(c.geojson).find((ft) => puntoEnFeatureGeoJSON(lon, lat, ft));
      const props = (f?.properties ?? {}) as Record<string, unknown>;
      const valores = (c.campoUnion ? [props[c.campoUnion]] : Object.values(props)).map((v) => normalizar(v));
      if (valores.some((v) => /NORTE/.test(v))) { estacion = 'Norte'; break; }
      if (valores.some((v) => /\bSUR\b|-SUR/.test(v))) { estacion = 'Sur'; break; }
    }
    for (const c of capasZona) {
      const f = extraerFeatures(c.geojson).find((ft) => puntoEnFeatureGeoJSON(lon, lat, ft));
      if (f) { zona = nombreCuadrante(f.properties ?? {}, c.campoUnion); if (zona) break; }
    }
    for (const c of capasBarrio) {
      const f = extraerFeatures(c.geojson).find((ft) => puntoEnFeatureGeoJSON(lon, lat, ft));
      if (f) { barrio = nombreBarrio(f.properties ?? {}, c.campoUnion); if (barrio) break; }
    }
    const t = { zona, barrio, estacion };
    cache.set(k, t);
    return t;
  }
  return { localizar, hayCapaZona: capasZona.length > 0, hayCapaBarrio: capasBarrio.length > 0, hayCapaEstacion: capasEstacion.length > 0 };
}

// ── Piezas visuales ───────────────────────────────────────────────────────
function Tarjeta({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={clsx('rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,35,63,0.05)]', className)}>{children}</section>;
}

function Kpi({ icono, tono, titulo, valor, nota }: { icono: ReactNode; tono: string; titulo: string; valor: number; nota: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5">
      <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tono)}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-tight text-slate-500">{titulo}</p>
        <p className="text-[22px] font-extrabold leading-tight tabular-nums text-[#10233f]">{formatNumero(valor)}</p>
        <p className="text-[10.5px] leading-tight text-slate-400">{nota}</p>
      </div>
    </div>
  );
}

function CapturarMapa({ onMapa }: { onMapa: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onMapa(map); }, [map, onMapa]);
  return null;
}

function AjustarTamano({ clave }: { clave: string }) {
  const map = useMap();
  useEffect(() => { const t = window.setTimeout(() => map.invalidateSize(), 120); return () => window.clearTimeout(t); }, [clave, map]);
  return null;
}

type BaseMapa = 'mapa' | 'satelite' | 'hibrido';

function ControlesMapa({ base, setBase, capas, capasVisibles, alternarCapa, estado, onCentrar, pantallaCompleta, setPantallaCompleta }: {
  base: BaseMapa; setBase: (b: BaseMapa) => void;
  capas: CapaGeografica[]; capasVisibles: Set<string>; alternarCapa: (id: string) => void;
  estado: PlanCandadoEstado; onCentrar: () => void;
  pantallaCompleta: boolean; setPantallaCompleta: (v: boolean) => void;
}) {
  const [capasAbierto, setCapasAbierto] = useState(false);
  const boton = 'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold';
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-md backdrop-blur-sm">
        {([['mapa', 'Mapa'], ['satelite', 'Satélite'], ['hibrido', 'Híbrido']] as const).map(([b, t]) => (
          <button key={b} type="button" onClick={() => setBase(b)} aria-pressed={base === b} className={clsx(boton, base === b ? 'bg-[#10233f] text-white' : 'text-[#10233f] hover:bg-slate-100')}>{t}</button>
        ))}
        <span className="mx-0.5 h-5 w-px bg-slate-200" />
        <button type="button" onClick={() => setCapasAbierto((v) => !v)} aria-expanded={capasAbierto} className={clsx(boton, capasAbierto ? 'bg-[#e3f2ef] text-[#0f5f57]' : 'text-[#10233f] hover:bg-slate-100')}>
          <Layers size={14} /> Capas <ChevronDown size={13} className={clsx('transition', capasAbierto && 'rotate-180')} />
        </button>
        <button type="button" onClick={onCentrar} title="Volver a centrar en los puntos de la selección" className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')}><LocateFixed size={14} /></button>
        <button type="button" onClick={() => setPantallaCompleta(!pantallaCompleta)} title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'} className={clsx(boton, 'text-[#10233f] hover:bg-slate-100')}>
          {pantallaCompleta ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      {capasAbierto && (
        <div className="w-[250px] rounded-xl border border-slate-200 bg-white/97 p-3 text-[12px] text-slate-700 shadow-lg">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Plan Candado</p>
          <label className="flex cursor-pointer items-center gap-2 py-0.5">
            <input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={estado.etiquetas} onChange={(e) => estado.setEtiquetas(e.target.checked)} />
            Etiquetas (lugar y dirección)
          </label>
          {Object.keys(estado.posicionesRotulo).length > 0 && (
            <button type="button" onClick={estado.restablecerRotulos} className="ml-5 mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#0f5f57] hover:underline"><RotateCcw size={11} /> Reordenar etiquetas movidas</button>
          )}
          <p className="mb-1.5 mt-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Colores en vista General</p>
          <div className="flex items-center gap-3">
            {(['Norte', 'Sur'] as const).map((e) => (
              <label key={e} className="flex cursor-pointer items-center gap-1.5">
                <input type="color" value={estado.coloresEstacion[e]} onChange={(ev) => estado.setColoresEstacion({ ...estado.coloresEstacion, [e]: ev.target.value })} className="h-6 w-7 cursor-pointer rounded border border-slate-200 bg-white p-0" />
                Estación {e}
              </label>
            ))}
          </div>
          <p className="mb-1.5 mt-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Límites geográficos</p>
          {capas.length === 0 && <p className="text-[11px] text-slate-400">No hay capas cargadas (se cargan en Mapa / Georreferenciación).</p>}
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {capas.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={capasVisibles.has(c.id)} onChange={() => alternarCapa(c.id)} />
                <span className="truncate" title={c.nombre}>{c.nombre}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tabla completa ────────────────────────────────────────────────────────
type ColumnaOrden = 'no' | 'estacion' | 'cai' | 'rp' | 'rs' | 'direccion' | 'lugar' | 'lat' | 'lon' | 'estado';

function ThOrden({ col, orden, onOrdenar, children, className }: { col: ColumnaOrden; orden: { col: ColumnaOrden; asc: boolean }; onOrdenar: (c: ColumnaOrden) => void; children: ReactNode; className?: string }) {
  const activa = orden.col === col;
  return (
    <th className={clsx('whitespace-nowrap px-2.5 py-2.5 text-left', className)} aria-sort={activa ? (orden.asc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onOrdenar(col)} className="inline-flex items-center gap-1 font-bold text-[#10233f] hover:text-[#0f5f57]">
        {children}
        {activa ? (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="text-slate-300" />}
      </button>
    </th>
  );
}

function TablaPuntos({ estado, editable, puedeExportar, onExportar, pestana, setPestana }: {
  estado: PlanCandadoEstado; editable: boolean; puedeExportar: boolean; onExportar: () => void;
  pestana: 'todos' | 'pendientes'; setPestana: (p: 'todos' | 'pendientes') => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<{ col: ColumnaOrden; asc: boolean }>({ col: 'no', asc: true });
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(10);
  const { puntosSeleccion, pendientes, ubicaciones } = estado;

  const indiceOrden = (p: PuntoPlanCandado) => (p.categoria === 'Cierre general MEPOY' ? -100 + p.numero : p.numero);
  // null = sin dato: siempre al final, ordene como se ordene.
  const valor = (p: PuntoPlanCandado, col: ColumnaOrden): string | number | null => {
    const u = ubicaciones[p.id];
    switch (col) {
      case 'no': return indiceOrden(p);
      case 'estacion': return p.estacion;
      case 'cai': return p.cai ? parseInt(p.cai.replace(/\D/g, ''), 10) : null;
      case 'rp': return p.responsablePrincipal;
      case 'rs': return p.responsableSecundario;
      case 'direccion': return p.direccion;
      case 'lugar': return p.lugar;
      case 'lat': return u ? u.lat : null;
      case 'lon': return u ? u.lon : null;
      case 'estado': return u ? (u.fuente === 'oficial' ? 0 : 1) : 2;
    }
  };

  const base = pestana === 'todos' ? puntosSeleccion : pendientes;
  const q = normalizar(busqueda);
  const filas = useMemo(() => {
    const f = q ? base.filter((p) => normalizar([etiquetaNumeroPlanCandado(p), p.estacion, p.cai, p.caiNombre, p.categoria, p.responsablePrincipal, p.responsableSecundario, p.unidad, p.direccion, p.lugar].join(' ')).includes(q)) : base;
    return [...f].sort((a, b) => {
      const va = valor(a, orden.col), vb = valor(b, orden.col);
      if (va == null || vb == null) return va == null && vb == null ? indiceOrden(a) - indiceOrden(b) : va == null ? 1 : -1;
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true });
      return (orden.asc ? r : -r) || indiceOrden(a) - indiceOrden(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, q, orden, ubicaciones]);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina));
  const pag = Math.min(pagina, totalPaginas - 1);
  const visibles = filas.slice(pag * porPagina, (pag + 1) * porPagina);
  useEffect(() => { setPagina(0); }, [pestana, busqueda, porPagina, puntosSeleccion.length]);

  const ordenar = (col: ColumnaOrden) => setOrden((o) => ({ col, asc: o.col === col ? !o.asc : true }));

  const vacio = <i className="text-slate-400">{NO_ESP}</i>;
  const paginasVisibles = Array.from({ length: totalPaginas }, (_, i) => i).filter((i) => i === 0 || i === totalPaginas - 1 || Math.abs(i - pag) <= 1);

  return (
    <Tarjeta className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e3f2ef] text-[#0f5f57]"><FileSpreadsheet size={18} /></span>
          <div>
            <h2 className="text-[16px] font-extrabold leading-tight text-[#10233f]">Puntos del Plan Candado</h2>
            <p className="text-[12px] text-slate-500">Matriz oficial ({ARCHIVO_COORDENADAS_OFICIALES}) y documento del plan · {formatNumero(puntosSeleccion.length)} punto(s) en la selección</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-[230px] items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-[12.5px] focus-within:border-[#116762]">
            <Search size={14} className="text-slate-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la tabla…" className="w-full bg-transparent outline-none" />
            {busqueda && <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"><X size={13} className="text-slate-400" /></button>}
          </label>
          {puedeExportar && (
            <button type="button" onClick={onExportar} className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50"><Download size={14} /> Exportar tabla</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {([['todos', `Todos los puntos`, puntosSeleccion.length], ['pendientes', 'Pendientes de georreferenciar', pendientes.length]] as const).map(([k, t, n]) => (
          <button key={k} type="button" onClick={() => setPestana(k)} className={clsx('-mb-px flex items-center gap-2 rounded-t-lg border-b-2 px-3.5 py-2 text-[13px] font-bold', pestana === k ? 'border-[#116762] text-[#10233f]' : 'border-transparent text-slate-500 hover:text-[#10233f]')}>
            {t}
            <span className={clsx('rounded-full px-1.5 text-[11px] tabular-nums', pestana === k ? (k === 'pendientes' ? 'bg-amber-100 text-amber-800' : 'bg-[#e3f2ef] text-[#0f5f57]') : 'bg-slate-100 text-slate-500')}>{n}</span>
          </button>
        ))}
      </div>
      {pestana === 'pendientes' && pendientes.length > 0 && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          Sin coordenadas en la matriz oficial. {editable ? 'Usa «Ubicar» y haz clic en el sitio exacto del mapa, o actualiza la matriz con «Importar matriz».' : 'Un administrador debe completar su ubicación.'}
        </p>
      )}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[1180px] text-[12.5px]">
          <thead>
            <tr className="bg-slate-50 text-[11.5px]">
              <ThOrden orden={orden} onOrdenar={ordenar} col="no">No.</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="estacion">Estación</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="cai">CAI / Agrupación</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="rp">Responsable principal</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="rs">Responsable secundario</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="direccion">Dirección</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="lugar">Lugar de referencia</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="lat" className="text-right">Latitud</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="lon" className="text-right">Longitud</ThOrden>
              <ThOrden orden={orden} onOrdenar={ordenar} col="estado">Estado</ThOrden>
              <th className="px-2.5 py-2.5 text-right font-bold text-[#10233f]">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const u = ubicaciones[p.id];
              return (
                <tr key={p.id} onClick={() => { if (u) estado.setSeleccionadoId(p.id); }} className={clsx('border-t border-slate-100', u && 'cursor-pointer hover:bg-slate-50', estado.seleccionadoId === p.id && 'bg-[#e3f2ef]/70')}>
                  <td className="px-2.5 py-2 font-bold tabular-nums">
                    <span className="flex items-center gap-1.5"><SimboloLeyenda color={estado.colorDePunto(p, 'cai')} forma={p.cai ? 'pin' : 'cuadro'} />{etiquetaNumeroPlanCandado(p)}{p.agregado && <span className="rounded bg-amber-100 px-1 text-[9.5px] font-bold uppercase text-amber-800" title="Agregado desde el dashboard">nuevo</span>}</span>
                  </td>
                  <td className="px-2.5 py-2">{p.estacion ? <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ background: estado.coloresEstacion[p.estacion] }} />Estación {p.estacion}</span> : vacio}</td>
                  <td className="px-2.5 py-2">{p.cai ? `${p.cai} - ${p.caiNombre}` : p.categoria}</td>
                  <td className="px-2.5 py-2">{p.responsablePrincipal ?? (p.enMatriz || p.agregado ? vacio : <span className="text-slate-400" title={`Unidad según el documento: ${p.unidad ?? NO_ESP}`}>No está en la matriz</span>)}</td>
                  <td className="px-2.5 py-2">{p.responsableSecundario ?? vacio}</td>
                  <td className="px-2.5 py-2">{p.direccion ?? vacio}</td>
                  <td className="px-2.5 py-2">{p.lugar ?? vacio}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{u ? u.lat.toFixed(7) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{u ? u.lon.toFixed(7) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2.5 py-2" title={p.agregado ? 'Punto agregado y georreferenciado en el mapa' : estadoUbicacion(u)}>
                    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', !u ? 'bg-amber-50 text-amber-700' : u.fuente === 'oficial' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700')}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', !u ? 'bg-amber-500' : u.fuente === 'oficial' ? 'bg-emerald-500' : 'bg-sky-500')} />
                      {!u ? 'Pendiente' : p.agregado ? 'Agregado' : u.fuente === 'oficial' ? 'Georreferenciado' : 'Corregido'}
                    </span>
                  </td>
                  <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {u ? (
                        <button type="button" onClick={() => { estado.setSeleccionadoId(null); window.setTimeout(() => estado.setSeleccionadoId(p.id), 0); }} title="Localizar en el mapa" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-semibold text-[#0f5f57] hover:bg-[#e3f2ef]"><MapPin size={14} /> Ver</button>
                      ) : (
                        <span className="flex items-center gap-1 px-1.5 text-[11px] text-amber-700"><TriangleAlert size={13} /> Sin ubicar</span>
                      )}
                      {estado.puedeEliminar && (
                        <button type="button" disabled={estado.guardando} onClick={() => void estado.eliminar(p.id)} title={p.agregado ? 'Eliminar este punto' : 'Retirar este punto del plan (se puede restaurar)'} aria-label={`Eliminar punto ${etiquetaNumeroPlanCandado(p)}`} className="order-last rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={15} /></button>
                      )}
                      {editable && (
                        <button type="button" disabled={estado.guardando} onClick={() => estado.setColocandoId(p.id)} title={u ? 'Corregir ubicación: clic en el mapa' : 'Ubicar en el mapa'} className={clsx('flex items-center gap-1 rounded-md px-1.5 py-1 text-[11.5px] font-semibold', estado.colocandoId === p.id ? 'bg-amber-100 text-amber-800' : 'text-[#10233f] hover:bg-slate-100')}>
                          <Crosshair size={14} /> {u ? 'Corregir' : 'Ubicar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={11} className="px-2 py-8 text-center text-slate-400">{pestana === 'pendientes' ? 'No hay puntos pendientes en esta selección.' : 'Ningún punto coincide con la búsqueda.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500">
        <label className="flex items-center gap-1.5">Mostrar
          <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="rounded-md border border-slate-200 px-1.5 py-1 text-[#10233f]">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select> registros
        </label>
        <span>Mostrando <b className="text-[#10233f]">{filas.length === 0 ? 0 : pag * porPagina + 1}–{Math.min(filas.length, (pag + 1) * porPagina)}</b> de <b className="text-[#10233f]">{filas.length}</b> registros</span>
        <div className="flex items-center gap-1">
          <button type="button" disabled={pag === 0} onClick={() => setPagina(pag - 1)} className="h-7 rounded-md px-2 font-semibold hover:bg-slate-100 disabled:opacity-40">‹</button>
          {paginasVisibles.map((i, k) => (
            <span key={i} className="flex items-center gap-1">
              {k > 0 && i - paginasVisibles[k - 1] > 1 && <span className="px-0.5">…</span>}
              <button type="button" onClick={() => setPagina(i)} className={clsx('h-7 min-w-7 rounded-md px-2 font-semibold', i === pag ? 'bg-[#10233f] text-white' : 'bg-slate-100 text-[#10233f] hover:bg-slate-200')}>{i + 1}</button>
            </span>
          ))}
          <button type="button" disabled={pag >= totalPaginas - 1} onClick={() => setPagina(pag + 1)} className="h-7 rounded-md px-2 font-semibold hover:bg-slate-100 disabled:opacity-40">›</button>
        </div>
      </div>
    </Tarjeta>
  );
}

// ── Informe de importación ────────────────────────────────────────────────
function CeldaInforme({ t, v, tono }: { t: string; v: number; tono: string }) {
  return (
    <div className={clsx('rounded-xl px-3 py-2', tono)}>
      <p className="text-[11px] font-semibold opacity-80">{t}</p>
      <p className="text-[22px] font-extrabold tabular-nums">{v}</p>
    </div>
  );
}

function ModalInforme({ informe, onCerrar, onAplicar, aplicando }: { informe: InformeMatriz; onCerrar: () => void; onAplicar: () => void; aplicando: boolean }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label="Resultado de la importación">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-extrabold text-[#10233f]">Revisión de la matriz</h3>
            <p className="text-[12.5px] text-slate-500">«{informe.archivo}» — nada se guarda hasta que confirmes.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar"><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <CeldaInforme t="Registros procesados" v={informe.procesados} tono="bg-slate-50 text-[#10233f]" />
          <CeldaInforme t="Con coordenadas válidas" v={informe.conCoordenadas} tono="bg-emerald-50 text-emerald-800" />
          <CeldaInforme t="Pendientes (sin coordenadas)" v={informe.pendientes.length} tono="bg-amber-50 text-amber-800" />
          <CeldaInforme t="Errores" v={informe.errores.length} tono={informe.errores.length ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'} />
        </div>
        <ul className="mt-3 space-y-1 text-[12.5px] text-slate-700">
          <li><b>{informe.nuevas.length}</b> punto(s) se actualizarán con la coordenada del archivo.</li>
          <li><b>{informe.sinCambios}</b> punto(s) ya tienen exactamente esa coordenada (no se duplican ni se reescriben).</li>
          {informe.conservadasManuales.length > 0 && <li><b>{informe.conservadasManuales.length}</b> punto(s) corregidos a mano en el mapa se conservan: {informe.conservadasManuales.join(', ')}.</li>}
        </ul>
        {informe.pendientes.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[12px] text-amber-900">
            <p className="mb-1 font-bold">Sin coordenadas en el archivo</p>
            {informe.pendientes.map((p) => <p key={`${p.fila}-${p.punto}`}>Fila {p.fila} · punto {p.punto}: {p.texto}</p>)}
          </div>
        )}
        {informe.errores.length > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-[12px] text-red-800">
            <p className="mb-1 font-bold">Errores (estas filas no se aplican)</p>
            {informe.errores.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
        {informe.avisos.length > 0 && (
          <div className="mt-3 rounded-lg bg-sky-50 p-2.5 text-[12px] text-sky-900">
            {informe.avisos.map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="button" disabled={informe.nuevas.length === 0 || aplicando} onClick={onAplicar} className="flex items-center gap-1.5 rounded-lg bg-[#116762] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#0f5f57] disabled:opacity-50">
            <CheckCircle2 size={15} /> {aplicando ? 'Guardando…' : informe.nuevas.length === 0 ? 'Nada que actualizar' : `Confirmar actualización (${informe.nuevas.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agregar punto ─────────────────────────────────────────────────────────
function FormPuntoNuevo({ estado, localizar, caiSugerido, onCerrar }: {
  estado: PlanCandadoEstado;
  localizar: (lat: number, lon: number) => Territorio;
  caiSugerido: (zona: string | null) => string | null;
  onCerrar: () => void;
}) {
  const [lugar, setLugar] = useState('');
  const [direccion, setDireccion] = useState('');
  const [rp, setRp] = useState('');
  const [rs, setRs] = useState('');
  const [cai, setCai] = useState<string>('');
  const [caiTocado, setCaiTocado] = useState(false);
  const [estacionManual, setEstacionManual] = useState<'' | 'Norte' | 'Sur'>('');
  const c = estado.coordNuevo;
  const [latTxt, setLatTxt] = useState('');
  const [lonTxt, setLonTxt] = useState('');
  // La coordenada del clic aparece de una vez en las casillas.
  useEffect(() => { if (c) { setLatTxt(c.lat.toFixed(7)); setLonTxt(c.lon.toFixed(7)); } }, [c]);
  const t = c ? localizar(c.lat, c.lon) : null;
  const sugerido = t ? caiSugerido(t.zona) : null;
  useEffect(() => { if (!caiTocado) setCai(sugerido ?? ''); }, [sugerido, caiTocado]);
  // Estación: la del límite de estaciones donde cae el punto; si no hay
  // capa (o cae fuera), la del CAI elegido; si no, la que se escoja.
  const estacionCai = CAI_PLAN_CANDADO.find((x) => x.cai === cai)?.estacion ?? null;
  const estacion = estacionManual || t?.estacion || estacionCai || null;
  const origenEstacion = estacionManual ? 'elegida a mano' : t?.estacion ? 'según el límite de estaciones' : estacionCai ? `según ${cai}` : 'sin determinar';
  const color = estado.modo === 'general' ? (estacion ? estado.coloresEstacion[estacion] : COLOR_GENERAL_PLAN) : (cai ? estado.colorCai(cai) : '#be185d');

  function escribirCoord(latS: string, lonS: string) {
    setLatTxt(latS); setLonTxt(lonS);
    const lat = Number(latS.replace(',', '.')), lon = Number(lonS.replace(',', '.'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && latS && lonS) estado.setCoordNuevo({ lat, lon });
  }
  const valido = !!c && lugar.trim().length > 0;
  const campo = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[12.5px] outline-none focus:border-[#116762]';
  return (
    <Tarjeta className="border-amber-300 p-3.5 ring-2 ring-amber-200">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[14px] font-extrabold text-[#10233f]"><Plus size={15} className="text-amber-600" /> Agregar punto</p>
          <p className="text-[11.5px] text-slate-500">{c ? 'Clic en otro sitio del mapa (o arrastra el pin) para moverlo.' : 'Haz clic en el mapa donde va el punto.'}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cancelar"><X size={16} className="text-slate-400" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-[11.5px] font-semibold text-[#10233f]">Lugar de referencia *
          <input value={lugar} onChange={(e) => setLugar(e.target.value)} className={campo} placeholder="Ej. Glorieta del Terminal" />
        </label>
        <label className="col-span-2 text-[11.5px] font-semibold text-[#10233f]">Dirección
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campo} placeholder="Ej. Transversal 9N con Carrera 11" />
        </label>
        <label className="text-[11.5px] font-semibold text-[#10233f]">Responsable principal
          <input value={rp} onChange={(e) => setRp(e.target.value)} className={campo} />
        </label>
        <label className="text-[11.5px] font-semibold text-[#10233f]">Responsable secundario
          <input value={rs} onChange={(e) => setRs(e.target.value)} className={campo} />
        </label>
        <label className="text-[11.5px] font-semibold text-[#10233f]">Latitud
          <input value={latTxt} onChange={(e) => escribirCoord(e.target.value, lonTxt)} className={clsx(campo, 'tabular-nums', c && 'border-emerald-400 bg-emerald-50')} placeholder="Clic en el mapa" />
        </label>
        <label className="text-[11.5px] font-semibold text-[#10233f]">Longitud
          <input value={lonTxt} onChange={(e) => escribirCoord(latTxt, e.target.value)} className={clsx(campo, 'tabular-nums', c && 'border-emerald-400 bg-emerald-50')} placeholder="Clic en el mapa" />
        </label>
        <label className="text-[11.5px] font-semibold text-[#10233f]">CAI
          <select value={cai} onChange={(e) => { setCai(e.target.value); setCaiTocado(true); }} className={campo}>
            <option value="">Sin CAI</option>
            {CAI_PLAN_CANDADO.map((x) => <option key={x.cai} value={x.cai}>{x.cai} - {x.nombre}{x.cai === sugerido ? ' (sugerido)' : ''}</option>)}
          </select>
        </label>
        <label className="text-[11.5px] font-semibold text-[#10233f]">Estación
          <select value={estacionManual} onChange={(e) => setEstacionManual(e.target.value as '' | 'Norte' | 'Sur')} className={campo}>
            <option value="">{t?.estacion ? `Automática (${t.estacion})` : estacionCai ? `Automática (${estacionCai})` : 'Automática'}</option>
            <option value="Norte">Norte</option>
            <option value="Sur">Sur</option>
          </select>
        </label>
      </div>
      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px]">
        <SimboloLeyenda color={color} forma={cai ? 'pin' : 'cuadro'} />
        <span className="min-w-0 flex-1">
          {estacion ? <><b>Estación {estacion}</b> <span className="text-slate-500">({origenEstacion})</span></> : <span className="text-slate-500">Estación sin determinar</span>}
          {t?.zona && <span className="block text-[11px] text-slate-500">{t.zona}{t.barrio ? ` · ${t.barrio}` : ''}</span>}
        </span>
      </div>
      <div className="mt-2.5 flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button
          type="button"
          disabled={!valido || estado.guardando}
          onClick={async () => {
            if (!c) return;
            const ok = await estado.agregarPunto({ lugar, direccion, responsablePrincipal: rp, responsableSecundario: rs, estacion, estacionPorUbicacion: !estacionManual && !!t?.estacion, cai: cai || null, lat: c.lat, lon: c.lon });
            if (ok) onCerrar();
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#116762] px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#0f5f57] disabled:opacity-50"
          title={!c ? 'Primero haz clic en el mapa' : !lugar.trim() ? 'Escribe el lugar de referencia' : undefined}
        >
          <CheckCircle2 size={14} /> {estado.guardando ? 'Guardando…' : 'Guardar punto'}
        </button>
      </div>
    </Tarjeta>
  );
}

function PuntosRetirados({ estado }: { estado: PlanCandadoEstado }) {
  if (estado.retirados.length === 0 || !estado.puedeEliminar) return null;
  return (
    <Tarjeta className="p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-[#10233f]"><Undo2 size={14} className="text-slate-500" /> Puntos retirados ({estado.retirados.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {estado.retirados.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-[12px] text-slate-600">
            <b>{etiquetaNumeroPlanCandado(p)}</b> {p.lugar ?? NO_ESP}
            <button type="button" onClick={() => void estado.restaurar(p.id)} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#0f5f57] ring-1 ring-slate-200 hover:bg-[#e3f2ef]">Restaurar</button>
          </span>
        ))}
      </div>
    </Tarjeta>
  );
}

// ── Página ────────────────────────────────────────────────────────────────
export function PlanCandado2026() {
  const { records, filters, setFilters } = useData();
  const soloLectura = esSoloConsulta();
  const editable = !soloLectura && tieneAcceso('actualizarInformacion');
  const descargasPermitidas = puedeDescargar();

  // Filtros propios del módulo.
  const [busqueda, setBusqueda] = useState('');
  const [zonas, setZonas] = useState<string[]>([]);
  const [barrios, setBarrios] = useState<string[]>([]);
  const [caiPlan, setCaiPlan] = useState<string | null>(null);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(() => typeof window === 'undefined' || window.innerWidth >= 768);

  const [capas, setCapas] = useState<CapaGeografica[]>([]);
  const [capasVisibles, setCapasVisibles] = useState<Set<string>>(new Set());
  useEffect(() => {
    cargarCapas().then((c) => { setCapas(c); setCapasVisibles(new Set(c.filter((x) => x.visible).map((x) => x.id))); }).catch(() => setCapas([]));
  }, []);

  // Zona de atención y Barrio: por ubicación dentro de las capas oficiales.
  const territorio = useMemo(() => crearLocalizador(capas), [capas]);
  const coloresCai = useMemo<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('mepoy-colores-cai') || '{}'); } catch { return {}; } }, []);
  const q = normalizar(busqueda);
  const estado = usePlanCandado({
    estacionFiltro: filters.estacion,
    caiFiltro: filters.cai,
    coloresCaiPersonalizados: coloresCai,
    editable,
    puedeEliminar: !soloLectura && tieneAcceso('eliminarCapas'),
    siempreActivo: true,
    firmaFiltroExtra: `${q}|${zonas.join(',')}|${barrios.join(',')}|${caiPlan ?? ''}|${capas.length}`,
    filtroExtra: (p, u) => {
      if (q && !normalizar([etiquetaNumeroPlanCandado(p), p.direccion, p.lugar, p.responsablePrincipal, p.responsableSecundario, p.unidad].join(' ')).includes(q)) return false;
      if (zonas.length > 0 || barrios.length > 0) {
        // Sin coordenadas no hay zona ni barrio verificables.
        const t = u ? territorio.localizar(u.lat, u.lon) : null;
        if (zonas.length > 0 && (!t?.zona || !zonas.includes(t.zona))) return false;
        if (barrios.length > 0 && (!t?.barrio || !barrios.includes(t.barrio))) return false;
      }
      if (caiPlan && p.cai !== caiPlan) return false;
      return true;
    },
  });
  const territoriosConocidos = useMemo(
    () => estado.todos.map((p) => estado.ubicaciones[p.id]).filter(Boolean).map((u) => territorio.localizar(u.lat, u.lon)),
    [territorio, estado.ubicaciones, estado.todos],
  );
  const opcionesZona = useMemo(() => Array.from(new Set(territoriosConocidos.map((t) => t.zona).filter((z): z is string => !!z))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })), [territoriosConocidos]);
  const opcionesBarrio = useMemo(() => Array.from(new Set(territoriosConocidos.map((t) => t.barrio).filter((z): z is string => !!z))).sort((a, b) => a.localeCompare(b, 'es')), [territoriosConocidos]);
  const opcionesEstacion = useMemo(() => {
    const s = Array.from(new Set(records.map((r) => r.estacion).filter((e): e is string => !!e && /norte|sur/i.test(e)))).sort();
    return s.length > 0 ? s : ['E-Norte', 'E-Sur'];
  }, [records]);
  const opcionesCai = useMemo(() => {
    const s = Array.from(new Set(records.map((r) => r.cai).filter((c): c is string => !!c && /^CAI\s*\d+$/i.test(c.trim()))));
    const lista = s.length > 0 ? s : CAI_PLAN_CANDADO.map((c) => c.cai);
    return lista.sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
  }, [records]);
  const etiquetasCai = Object.fromEntries(opcionesCai.map((c) => {
    const info = CAI_PLAN_CANDADO.find((x) => x.cai === c.replace(/\s+/g, ' ').replace(/^cai/i, 'CAI'));
    return [c, info ? `${c} - ${info.nombre}` : c];
  }));

  const hayFiltros = filters.estacion.length > 0 || filters.cai.length > 0 || zonas.length > 0 || barrios.length > 0 || !!busqueda || !!caiPlan;
  function limpiarFiltros() {
    setFilters((prev) => ({ ...prev, estacion: [], cai: [] }));
    setZonas([]); setBarrios([]); setBusqueda(''); setCaiPlan(null);
  }

  // Mapa
  const mapaRef = useRef<L.Map | null>(null);
  const [base, setBase] = useState<BaseMapa>(() => { try { return (localStorage.getItem('mepoy-plan-candado-base') as BaseMapa) || 'mapa'; } catch { return 'mapa'; } });
  useEffect(() => { try { localStorage.setItem('mepoy-plan-candado-base', base); } catch { /* opcional */ } }, [base]);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  useEffect(() => {
    if (!pantallaCompleta) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !estado.colocandoId) setPantallaCompleta(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [pantallaCompleta, estado.colocandoId]);
  function centrar() {
    const m = mapaRef.current;
    const pts = estado.ubicados.map((p) => estado.ubicaciones[p.id]);
    if (!m || pts.length === 0) return;
    if (pts.length === 1) m.flyTo([pts[0].lat, pts[0].lon], 16, { duration: 0.5 });
    else m.flyToBounds(L.latLngBounds(pts.map((u) => [u.lat, u.lon] as [number, number])), { padding: [60, 60], maxZoom: 16, duration: 0.5 });
  }

  // Descarga del mapa
  const [opcDescarga, setOpcDescarga] = useState<{ leyenda: boolean; fondoTransparente: boolean }>(() => {
    try { return { leyenda: true, fondoTransparente: false, ...JSON.parse(localStorage.getItem('mepoy-plan-candado-descarga') || '{}') }; } catch { return { leyenda: true, fondoTransparente: false }; }
  });
  useEffect(() => { try { localStorage.setItem('mepoy-plan-candado-descarga', JSON.stringify(opcDescarga)); } catch { /* opcional */ } }, [opcDescarga]);
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function descargarMapa() {
    const m = mapaRef.current;
    if (!m || !descargasPermitidas) return;
    setDescargando(true);
    setAviso(null);
    try {
      const b = m.getBounds();
      const [s, n, o, e] = [b.getSouth(), b.getNorth(), b.getWest(), b.getEast()];
      const rect = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]] }, properties: {} };
      const margen = Math.max(n - s, e - o) * 0.25;
      const anillos = capas.filter((c) => capasVisibles.has(c.id))
        .flatMap((c) => extraerFeatures(c.geojson).flatMap(anillosDe))
        .filter((an) => an.some(([lon, lat]) => lon >= o - margen && lon <= e + margen && lat >= s - margen && lat <= n + margen));
      // Normal: sale exactamente lo que se ve en el mapa. Con «fondo
      // transparente», se recorta a los límites visibles (fuera, transparente)
      // e incluye todos los puntos que caen dentro de ese recorte.
      const recortar = opcDescarga.fondoTransparente && anillos.length > 0;
      const feature = recortar ? { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: anillos.map((a) => [a]) }, properties: {} } : rect;
      const area = recortar ? L.latLngBounds(anillos.flat().map(([lon, lat]) => [lat, lon] as [number, number])) : b;
      const t = m.getSize();
      const marcadores = marcadoresParaExportar(estado, m).filter((x) => area.contains([x.lat, x.lon]));
      const leyenda = filasLeyendaPlanCandado(estado).filter((f) => f.ubicados > 0);
      await exportarPoligonoAislado({
        feature,
        puntos: [],
        colores: [],
        etiquetas: [],
        gruposEtiquetas: opcDescarga.leyenda ? [{
          titulo: `Plan Candado 2026 — ${marcadores.length} punto(s) · ${estado.modo === 'general' ? 'General' : 'Por CAI'}`,
          lineas: [...leyenda.map((f) => `${f.etiqueta}: ${f.ubicados}`), ...(estado.pendientes.length ? [`Pendientes de georreferenciar: ${estado.pendientes.length}`] : [])],
        }] : [],
        nombreArchivo: 'plan-candado-2026',
        opacidadPoligono: 0,
        anillosInternos: anillos,
        colorBorde: '#1f2937',
        tamanoFuenteBase: 10,
        marcadores,
        escalaPantalla: { pxPorGradoLon: t.x / (e - o), pxPorGradoLat: t.y / (n - s) },
        ampliarParaMarcadores: 'todos',
        margen: recortar ? 0.04 : 0,
        fondoCompleto: !recortar,
      });
    } catch (err) {
      console.error('[Plan Candado] Falló la descarga del mapa:', err);
      setAviso('No fue posible generar la imagen del mapa. Revisa la consola del navegador (F12).');
    } finally {
      setDescargando(false);
    }
  }

  function exportarTabla() {
    if (!descargasPermitidas) return;
    const filas = filasExport(estado.puntosSeleccion, estado.ubicaciones).map((f, i) => {
      const u = estado.ubicaciones[estado.puntosSeleccion[i].id];
      const t = u ? territorio.localizar(u.lat, u.lon) : null;
      return { ...f, 'Zona de atención (por ubicación)': t?.zona ?? '', 'Barrio (por ubicación)': t?.barrio ?? '' };
    });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), 'Plan Candado 2026');
    XLSX.writeFile(libro, 'plan-candado-2026.xlsx');
  }

  // Importación de la matriz (con revisión antes de guardar)
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [informe, setInforme] = useState<InformeMatriz | null>(null);
  async function leerArchivo(file: File) {
    try {
      setInforme(await leerMatrizPlanCandado(file, estado.ubicaciones));
    } catch (e) {
      estado.setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    }
  }
  async function aplicarInforme() {
    if (!informe) return;
    await estado.asignar(informe.nuevas, `Matriz «${informe.archivo}» aplicada: ${resumenInformeMatriz(informe)}.`);
    setInforme(null);
  }

  // Punto nuevo
  const agregando = estado.capturandoNuevo;
  function iniciarAgregar() {
    estado.setColocandoId(null);
    estado.setCoordNuevo(null);
    estado.setCapturandoNuevo(true);
    mapaRef.current?.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function cerrarAgregar() { estado.setCapturandoNuevo(false); estado.setCoordNuevo(null); }
  // CAI sugerido para un punto nuevo: el CAI al que pertenece su zona de
  // atención según los propios registros del dashboard (el más frecuente).
  const caiPorZona = useMemo(() => {
    const clave = (z: string) => { const n = normalizar(z); const num = n.match(/\d+/)?.[0]; const lado = /NORTE/.test(n) ? 'N' : /SUR/.test(n) ? 'S' : ''; return num ? `${num}${lado}` : n; };
    const conteo = new Map<string, Map<string, number>>();
    for (const r of records) {
      if (!r.cuadrante || !r.cai || !/^CAI\s*\d+$/i.test(r.cai.trim())) continue;
      const k = clave(r.cuadrante);
      const m = conteo.get(k) ?? new Map<string, number>();
      const cai = `CAI ${parseInt(r.cai.replace(/\D/g, ''), 10)}`;
      m.set(cai, (m.get(cai) ?? 0) + 1);
      conteo.set(k, m);
    }
    return (zona: string | null) => {
      if (!zona) return null;
      const m = conteo.get(clave(zona));
      if (!m) return null;
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
  }, [records]);

  const [pestana, setPestana] = useState<'todos' | 'pendientes'>('todos');
  const tablaRef = useRef<HTMLDivElement>(null);
  function revisarPendientes() {
    setPestana('pendientes');
    tablaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Resúmenes (sobre los puntos de la selección = lo que se ve)
  const totalGeorref = estado.todos.filter((p) => estado.ubicaciones[p.id]).length;
  const enMatriz = estado.todos.filter((p) => p.enMatriz).length;
  const agregados = estado.todos.filter((p) => p.agregado).length;
  const soloDocumento = estado.todos.length - enMatriz - agregados;
  const resumenGrupos = useMemo(() => {
    const m = new Map<string, { etiqueta: string; color: string; forma: 'pin' | 'cuadro'; total: number; ubicados: number; orden: number }>();
    for (const p of estado.puntosSeleccion) {
      const k = grupoVisualPlanCandado(p);
      const g = m.get(k) ?? { etiqueta: k, color: estado.colorDePunto(p, 'cai'), forma: p.cai ? 'pin' as const : 'cuadro' as const, total: 0, ubicados: 0, orden: p.cai ? parseInt(p.cai.replace(/\D/g, ''), 10) : 50 };
      g.total++;
      if (estado.ubicaciones[p.id]) g.ubicados++;
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => a.orden - b.orden || a.etiqueta.localeCompare(b.etiqueta));
  }, [estado]);
  const maxGrupo = Math.max(1, ...resumenGrupos.map((g) => g.total));
  const porResponsable = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of estado.puntosSeleccion) {
      const k = p.responsablePrincipal ?? (p.enMatriz ? 'Sin responsable en la matriz' : 'No está en la matriz');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es', { numeric: true }));
  }, [estado.puntosSeleccion]);

  const caisDisponibles = useMemo(() => CAI_PLAN_CANDADO.filter((c) => estado.todos.some((p) => p.cai === c.cai && (filters.estacion.length === 0 || estado.estacionesSel.includes(p.estacion)))), [filters.estacion.length, estado.estacionesSel, estado.todos]);

  return (
    <div className="space-y-3.5">
      {/* ── ENCABEZADO ── */}
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-[#e3f2ef] px-4 py-3 shadow-[0_1px_2px_rgba(16,35,63,0.05)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#10233f] text-white"><Lock size={23} /></span>
        <div className="min-w-[240px] flex-1">
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-[#10233f]">Plan Candado 2026 — Georreferenciación operativa</h1>
          <p className="text-[13px] text-slate-500">Visualización y seguimiento de puntos de control, direcciones y responsables.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <input ref={inputArchivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leerArchivo(f); }} />
              <button type="button" onClick={iniciarAgregar} disabled={agregando} className="flex h-10 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-[13px] font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
                <Plus size={15} /> Agregar punto
              </button>
              <button type="button" onClick={() => inputArchivo.current?.click()} title="Excel con No., Responsable Principal, Responsable Secundario, Direccion, Lugar, Latitud y Longitud" className="flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-[#10233f] hover:bg-slate-50">
                <Upload size={15} /> Importar matriz
              </button>
            </>
          )}
          {descargasPermitidas && (
            <button type="button" onClick={() => void descargarMapa()} disabled={descargando} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#116762] px-4 text-[13px] font-bold text-white shadow-sm hover:bg-[#0f5f57] disabled:opacity-60">
              <Download size={15} /> {descargando ? 'Generando…' : 'Descargar mapa'}
            </button>
          )}
        </div>
      </header>

      {/* ── FILTROS ── */}
      <Tarjeta className="px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setFiltrosAbiertos((v) => !v)} aria-expanded={filtrosAbiertos} className="flex items-center gap-1.5 text-[13px] font-bold text-[#10233f]">
            <Filter size={15} className="text-[#116762]" /> Filtros
            <ChevronDown size={14} className={clsx('transition md:hidden', filtrosAbiertos && 'rotate-180')} />
          </button>
          <div role="radiogroup" aria-label="Modo de visualización" className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            {([['general', 'General', 'Todos los puntos'], ['cai', 'Por CAI', 'Agrupación por CAI']] as const).map(([m, t, s]) => (
              <button key={m} type="button" role="radio" aria-checked={estado.modo === m} onClick={() => { estado.setModo(m); if (m === 'general') setCaiPlan(null); }} className={clsx('rounded-lg px-3 py-1 text-left leading-tight', estado.modo === m ? 'bg-[#10233f] text-white shadow' : 'text-[#10233f] hover:bg-white')}>
                <span className="block text-[12.5px] font-bold">{t}</span>
                <span className={clsx('block text-[10px]', estado.modo === m ? 'text-slate-300' : 'text-slate-500')}>{s}</span>
              </button>
            ))}
          </div>
          {hayFiltros && (
            <button type="button" onClick={limpiarFiltros} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100"><RotateCcw size={13} /> Limpiar</button>
          )}
        </div>
        {filtrosAbiertos && (
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#10233f]">Vigencia</label>
              <select value="2026" disabled className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-[13px] text-[#10233f]" title="El Plan Candado documentado corresponde a la vigencia 2026">
                <option value="2026">2026</option>
              </select>
            </div>
            <MultiSelect institucional label="Estación" options={opcionesEstacion} selected={filters.estacion} onChange={(v) => setFilters((prev) => ({ ...prev, estacion: v }))} />
            <MultiSelect institucional label="CAI" options={opcionesCai} labels={etiquetasCai} selected={filters.cai} onChange={(v) => setFilters((prev) => ({ ...prev, cai: v }))} />
            <div title={territorio.hayCapaZona ? 'Según la ubicación del punto dentro de la capa de cuadrantes' : 'Requiere la capa de cuadrantes / zonas cargada en el mapa'}>
              {territorio.hayCapaZona
                ? <MultiSelect institucional label="Zona de atención" options={opcionesZona} selected={zonas} onChange={setZonas} />
                : <CampoDeshabilitado etiqueta="Zona de atención" texto="Sin capa de zonas" />}
            </div>
            <div title={territorio.hayCapaBarrio ? 'Según la ubicación del punto dentro de la capa de barrios' : 'Requiere la capa de barrios cargada en el mapa'}>
              {territorio.hayCapaBarrio
                ? <MultiSelect institucional label="Barrio" options={opcionesBarrio} selected={barrios} onChange={setBarrios} />
                : <CampoDeshabilitado etiqueta="Barrio" texto="Sin capa de barrios" />}
            </div>
            <div>
              <label htmlFor="pc-buscar" className="mb-1 block text-[12px] font-semibold text-[#10233f]">Buscar</label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-[#116762]">
                <Search size={15} className="shrink-0 text-slate-400" />
                <input id="pc-buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Dirección, lugar o responsable" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
                {busqueda && <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"><X size={14} className="text-slate-400" /></button>}
              </div>
            </div>
          </div>
        )}
        {estado.modo === 'cai' && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5" role="radiogroup" aria-label="CAI">
            <span className="mr-1 text-[12px] font-semibold text-slate-500">CAI:</span>
            <button type="button" role="radio" aria-checked={!caiPlan} onClick={() => setCaiPlan(null)} className={clsx('rounded-full px-3 py-1 text-[12px] font-semibold ring-1', !caiPlan ? 'bg-[#10233f] text-white ring-[#10233f]' : 'bg-white text-[#10233f] ring-slate-200 hover:bg-slate-50')}>Todos</button>
            {caisDisponibles.map((c) => (
              <button key={c.cai} type="button" role="radio" aria-checked={caiPlan === c.cai} onClick={() => setCaiPlan(caiPlan === c.cai ? null : c.cai)} className={clsx('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1', caiPlan === c.cai ? 'bg-[#e3f2ef] text-[#0f5f57] ring-[#116762]' : 'bg-white text-[#10233f] ring-slate-200 hover:bg-slate-50')}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: estado.colorCai(c.cai) }} />
                {c.cai} · {c.nombre}
              </button>
            ))}
          </div>
        )}
        {estado.hayFiltroTerritorial && estado.sinRelacionOcultos > 0 && (
          <p className="mt-2 text-[11.5px] text-slate-500">Con Estación o CAI filtrados no se incluyen los {estado.sinRelacionOcultos} cierres que el documento no asigna a ninguna estación (cierre general MEPOY, Carabineros, Terminal y Guardia MEPOY).</p>
        )}
      </Tarjeta>

      {(estado.mensaje || aviso) && (
        <div className={clsx('flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px]', estado.mensaje?.tipo === 'ok' && !aviso ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>
          {estado.mensaje?.tipo === 'ok' && !aviso ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <TriangleAlert size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{aviso ?? estado.mensaje?.texto}</span>
          <button type="button" onClick={() => { estado.setMensaje(null); setAviso(null); }} aria-label="Cerrar"><X size={14} /></button>
        </div>
      )}

      {/* ── MAPA + PANEL ── */}
      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
        <div className={clsx('overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm', pantallaCompleta && 'fixed inset-0 z-[9999] rounded-none border-0')}>
          <div className={clsx('relative', pantallaCompleta ? 'h-[100dvh]' : 'h-[clamp(640px,84vh,960px)]')}>
            <MapContainer center={CENTRO_POPAYAN} zoom={13} zoomControl style={{ height: '100%', width: '100%' }}>
              <CapturarMapa onMapa={(m) => { mapaRef.current = m; }} />
              <AjustarTamano clave={String(pantallaCompleta)} />
              {base === 'mapa' && <TileLayer key="calles" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />}
              {base !== 'mapa' && <TileLayer key="sat" attribution="Imágenes &copy; Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} />}
              {base === 'hibrido' && (
                <>
                  <TileLayer key="hib-vias" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} />
                  <TileLayer key="hib-lugares" url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} />
                </>
              )}
              {capas.filter((c) => capasVisibles.has(c.id)).map((c) => (
                <GeoJSONLayer key={`${c.id}-${base}`} data={c.geojson as any} interactive={false} style={{ color: base === 'mapa' ? '#10233f' : '#ffffff', weight: 1.6, opacity: 0.75, fillOpacity: 0 }} />
              ))}
              <CapaLeafletPlanCandado estado={estado} />
              <ControlReact posicion="topright">
                <ControlesMapa
                  base={base} setBase={setBase} capas={capas} capasVisibles={capasVisibles}
                  alternarCapa={(id) => setCapasVisibles((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; })}
                  estado={estado} onCentrar={centrar} pantallaCompleta={pantallaCompleta} setPantallaCompleta={setPantallaCompleta}
                />
              </ControlReact>
            </MapContainer>
          </div>
          {descargasPermitidas && !pantallaCompleta && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-3.5 py-2 text-[12px] text-slate-600">
              <span className="font-semibold text-slate-500">En la descarga:</span>
              <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={estado.etiquetas} onChange={(e) => estado.setEtiquetas(e.target.checked)} /> Etiquetas</label>
              <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={opcDescarga.leyenda} onChange={(e) => setOpcDescarga((o) => ({ ...o, leyenda: e.target.checked }))} /> Cuadro de leyenda y totales</label>
              <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={opcDescarga.fondoTransparente} onChange={(e) => setOpcDescarga((o) => ({ ...o, fondoTransparente: e.target.checked }))} /> Fondo transparente fuera de los límites</label>
              <span className="ml-auto text-[11px] text-slate-400">Sale lo que se ve en el mapa, con las etiquetas donde las dejaste.</span>
            </div>
          )}
        </div>

        {/* Panel lateral */}
        <aside className="space-y-3">
          {agregando && <FormPuntoNuevo estado={estado} localizar={territorio.localizar} caiSugerido={caiPorZona} onCerrar={cerrarAgregar} />}
          <div className="grid grid-cols-2 gap-2">
            <Kpi icono={<FileSpreadsheet size={17} />} tono="bg-[#e3f2ef] text-[#0f5f57]" titulo="Puntos registrados" valor={estado.todos.length} nota={[`${enMatriz} en la matriz`, soloDocumento ? `${soloDocumento} solo en el documento` : '', agregados ? `${agregados} agregado(s)` : ''].filter(Boolean).join(' · ')} />
            <Kpi icono={<CheckCircle2 size={17} />} tono="bg-emerald-50 text-emerald-700" titulo="Georreferenciados" valor={totalGeorref} nota="Con coordenadas válidas" />
            <Kpi icono={<TriangleAlert size={17} />} tono="bg-amber-50 text-amber-600" titulo="Pendientes" valor={estado.todos.length - totalGeorref} nota="Sin coordenadas válidas" />
            <Kpi icono={<Eye size={17} />} tono="bg-sky-50 text-sky-700" titulo="Puntos visibles" valor={estado.ubicados.length} nota={`De ${estado.puntosSeleccion.length} en la selección`} />
          </div>
          {estado.pendientes.length > 0 && (
            <button type="button" onClick={revisarPendientes} className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[12.5px] font-semibold text-amber-900 hover:bg-amber-100">
              <span className="flex items-center gap-1.5"><TriangleAlert size={14} /> Revisar {estado.pendientes.length} pendiente(s) de la selección</span>
              <ChevronDown size={14} className="-rotate-90" />
            </button>
          )}

          <Tarjeta className="p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-[#10233f]"><MapPin size={14} className="text-[#116762]" /> Resumen por CAI</p>
            {resumenGrupos.length === 0 && <p className="text-[12px] text-slate-400">Sin puntos en la selección.</p>}
            <div className="space-y-1.5">
              {resumenGrupos.map((g) => {
                const cai = CAI_PLAN_CANDADO.find((c) => g.etiqueta.startsWith(`${c.cai} -`));
                const elegible = estado.modo === 'cai' && !!cai;
                return (
                  <button key={g.etiqueta} type="button" disabled={!elegible} onClick={() => cai && setCaiPlan(caiPlan === cai.cai ? null : cai.cai)} className={clsx('block w-full text-left', elegible && 'rounded-md hover:bg-slate-50')} title={elegible ? 'Clic para ver solo este CAI' : undefined}>
                    <div className="flex items-center gap-2 text-[12px]">
                      <SimboloLeyenda color={g.color} forma={g.forma} />
                      <span className="min-w-0 flex-1 truncate" title={g.etiqueta}>{g.etiqueta}</span>
                      <span className="tabular-nums text-slate-500" title={`${g.ubicados} en el mapa de ${g.total}`}><b className="text-[#10233f]">{g.ubicados}</b>/{g.total}</span>
                    </div>
                    <div className="ml-5 mt-0.5 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full" style={{ width: `${(g.total / maxGrupo) * 100}%`, background: `linear-gradient(90deg, ${g.color} ${(g.ubicados / g.total) * 100}%, #fcd34d ${(g.ubicados / g.total) * 100}%)` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10.5px] text-slate-400">Barra: puntos del grupo · en amarillo, los que faltan por ubicar.</p>
          </Tarjeta>

          <Tarjeta className="p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-bold text-[#10233f]"><UserRound size={14} className="text-[#116762]" /> Distribución por responsable principal</p>
            <div className="max-h-56 space-y-[3px] overflow-y-auto pr-1 text-[12px] [scrollbar-width:thin]">
              {porResponsable.map(([r, n]) => (
                <div key={r} className="flex items-center gap-2">
                  <span className={clsx('min-w-0 flex-1 truncate', /matriz/.test(r) && 'italic text-slate-400')} title={r}>{r}</span>
                  <b className="tabular-nums text-[#10233f]">{n}</b>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-slate-400">Según la columna «Responsable Principal» de la matriz oficial.</p>
          </Tarjeta>

          <Tarjeta className="p-3.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-bold text-[#10233f]"><Tag size={14} className="text-[#116762]" /> Cómo usar el mapa</p>
            <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-slate-500">
              <li>Clic en un punto: ficha con responsables, dirección y coordenadas.</li>
              <li>Arrastra las etiquetas para que no se monten; la descarga las respeta.</li>
              <li>«Ver» en la tabla localiza el punto en el mapa.</li>
            </ul>
          </Tarjeta>
        </aside>
      </div>

      {/* ── TABLA ── */}
      <div ref={tablaRef}>
        <TablaPuntos estado={estado} editable={editable} puedeExportar={descargasPermitidas} onExportar={exportarTabla} pestana={pestana} setPestana={setPestana} />
      </div>
      <PuntosRetirados estado={estado} />

      {informe && <ModalInforme informe={informe} onCerrar={() => setInforme(null)} onAplicar={() => void aplicarInforme()} aplicando={estado.guardando} />}
    </div>
  );
}

function CampoDeshabilitado({ etiqueta, texto }: { etiqueta: string; texto: string }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-[#10233f]">{etiqueta}</label>
      <div className="flex h-10 items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 text-[12.5px] text-slate-400">{texto}</div>
    </div>
  );
}
