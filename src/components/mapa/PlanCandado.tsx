import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import clsx from 'clsx';
import { CheckCircle2, Crosshair, Download, FileUp, Lock, MapPin, Search, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import {
  PLAN_CANDADO_2026, CAI_PLAN_CANDADO, ARCHIVO_COORDENADAS_OFICIALES, COORDENADAS_OFICIALES_PLAN_CANDADO, grupoVisualPlanCandado, etiquetaNumeroPlanCandado,
  type PuntoPlanCandado, type CategoriaPlanCandado,
} from '../../data/planCandado2026';
import {
  leerUbicacionesLocales, guardarUbicaciones, quitarUbicacion, hayServidorPlanCandado,
  leerExtrasLocales, sincronizarPlanCandado, guardarPuntoNuevo, eliminarPuntoPlan, restaurarPuntoPlan,
  type MapaUbicaciones, type UbicacionPlanCandado, type ExtrasPlanCandado,
} from '../../data/planCandadoUbicaciones';
import { leerMatrizPlanCandado, type InformeMatriz } from '../../utils/planCandadoMatriz';
import { esCoordenadaValida } from '../../utils/geodesia';
import { formatNumero } from '../../utils/aggregations';
import { direccionesHaciaAfuera } from '../../utils/barriosAfectados';

// ───────────────────────────────────────────────────────────────────────────
// PLAN CANDADO 2026 en el mapa.
//  · Lee el filtro PRINCIPAL (Estación y CAI) sin escribirlo nunca: no
//    altera delitos, operatividad, IRISP1, MACRI, RNMC ni ninguna otra capa.
//  · Estado propio solo para lo exclusivo del plan: capa activa, modo
//    General / Por CAI, punto que se está ubicando.
//  · Sin coordenadas en el documento: cada punto queda PENDIENTE hasta que
//    alguien con permiso lo ubica (clic en el mapa o archivo con lat/lon).
// ───────────────────────────────────────────────────────────────────────────

export type ModoPlanCandado = 'general' | 'cai';

const PALETA_CAI_PLAN = ['#16a34a', '#2563eb', '#ea580c', '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#dc2626', '#0d9488', '#4f46e5'];
const COLOR_GENERAL = '#10233f';
export const COLOR_GENERAL_PLAN = COLOR_GENERAL;
export const COLORES_CATEGORIA: Record<Exclude<CategoriaPlanCandado, 'CAI'>, string> = {
  'Cierre general MEPOY': '#10233f',
  Carabineros: '#4d7c0f',
  'Terminal de Transportes': '#0e7490',
  'Guardia MEPOY (cierre perimetral)': '#475569',
  'Punto agregado': '#be185d',
};

// Colores por estación (vista General). Se pueden cambiar en «Capas».
export const COLORES_ESTACION_DEFECTO = { Norte: '#16a34a', Sur: '#d946ef' } as const;
export type ColoresEstacion = { Norte: string; Sur: string };

/** Datos de un punto nuevo, tal como se escriben en el formulario. */
export interface DatosPuntoNuevo {
  lugar: string;
  direccion: string;
  responsablePrincipal: string;
  responsableSecundario: string;
  estacion: 'Norte' | 'Sur' | null;
  estacionPorUbicacion: boolean;
  cai: string | null;
  lat: number;
  lon: number;
}

const ESTADO_PENDIENTE = 'Pendiente de georreferenciación';
export const NO_ESP = 'No especificado';

function normalizar(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function estacionDeFiltro(v: string): 'Norte' | 'Sur' | null {
  const n = normalizar(v);
  if (/NORTE/.test(n)) return 'Norte';
  if (/SUR/.test(n)) return 'Sur';
  return null;
}

function caiCanonico(v: string): string {
  const m = v.trim().match(/^CAI\s*-?\s*0*(\d+)/i);
  return m ? `CAI ${m[1]}` : v.trim();
}

export function estadoUbicacion(u: UbicacionPlanCandado | undefined): string {
  if (!u) return ESTADO_PENDIENTE;
  if (u.fuente === 'oficial') return `Georreferenciado (coordenada oficial, ${ARCHIVO_COORDENADAS_OFICIALES})`;
  return u.fuente === 'archivo' ? 'Georreferenciado (corregido con archivo)' : 'Georreferenciado (corregido en el mapa)';
}

// ── Hook: todo el estado y los cálculos del Plan Candado ──────────────────
export function usePlanCandado({ estacionFiltro, caiFiltro, coloresCaiPersonalizados, editable, puedeEliminar = false, siempreActivo = false, filtroExtra, firmaFiltroExtra = '' }: {
  // Retirar puntos (la «X»): solo el administrador.
  puedeEliminar?: boolean;
  estacionFiltro: string[];
  caiFiltro: string[];
  coloresCaiPersonalizados: Record<string, string>;
  editable: boolean;
  // Módulo propio del Plan Candado: la capa está siempre encendida.
  siempreActivo?: boolean;
  // Filtros exclusivos del módulo (búsqueda, zona, barrio, CAI del modo Por
  // CAI). Se SUMAN al filtro principal; firmaFiltroExtra cambia cuando cambian.
  filtroExtra?: (p: PuntoPlanCandado, u: UbicacionPlanCandado | undefined) => boolean;
  firmaFiltroExtra?: string;
}) {
  const [activoGuardado, setActivo] = useState(() => { try { return localStorage.getItem('mepoy-plan-candado-activo') === '1'; } catch { return false; } });
  const [modo, setModo] = useState<ModoPlanCandado>(() => { try { return localStorage.getItem('mepoy-plan-candado-modo') === 'cai' ? 'cai' : 'general'; } catch { return 'general'; } });
  const [ubicaciones, setUbicaciones] = useState<MapaUbicaciones>(() => leerUbicacionesLocales());
  const [colocandoId, setColocandoId] = useState<string | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Rótulos (etiquetas) de cada punto: visibles o no, y la posición donde el
  // usuario arrastró cada uno (lat/lon, para que la descarga coincida).
  const [etiquetas, setEtiquetas] = useState(() => { try { return localStorage.getItem('mepoy-plan-candado-etiquetas') !== '0'; } catch { return true; } });
  const [posicionesRotulo, setPosicionesRotulo] = useState<Record<string, { lat: number; lon: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('mepoy-plan-candado-rotulos') || '{}'); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem('mepoy-plan-candado-etiquetas', etiquetas ? '1' : '0'); } catch { /* opcional */ } }, [etiquetas]);
  useEffect(() => { try { localStorage.setItem('mepoy-plan-candado-rotulos', JSON.stringify(posicionesRotulo)); } catch { /* opcional */ } }, [posicionesRotulo]);
  const moverRotulo = useCallback((id: string, pos: { lat: number; lon: number }) => setPosicionesRotulo((prev) => ({ ...prev, [id]: pos })), []);
  const restablecerRotulos = useCallback(() => setPosicionesRotulo({}), []);

  const activo = siempreActivo || activoGuardado;
  useEffect(() => { if (!siempreActivo) { try { localStorage.setItem('mepoy-plan-candado-activo', activoGuardado ? '1' : '0'); } catch { /* opcional */ } } }, [activoGuardado, siempreActivo]);
  useEffect(() => { try { localStorage.setItem('mepoy-plan-candado-modo', modo); } catch { /* opcional */ } }, [modo]);

  // Puntos agregados a mano y puntos retirados (compartidos como las coordenadas).
  const [extras, setExtras] = useState<ExtrasPlanCandado>(() => leerExtrasLocales());
  const todos = useMemo(
    () => [...PLAN_CANDADO_2026, ...extras.puntos].filter((p) => !extras.eliminados.includes(p.id)),
    [extras],
  );
  const retirados = useMemo(() => PLAN_CANDADO_2026.filter((p) => extras.eliminados.includes(p.id)), [extras]);

  // Colores Norte / Sur (vista General).
  const [coloresEstacion, setColoresEstacion] = useState<ColoresEstacion>(() => {
    try { return { ...COLORES_ESTACION_DEFECTO, ...JSON.parse(localStorage.getItem('mepoy-plan-candado-colores-estacion') || '{}') }; } catch { return { ...COLORES_ESTACION_DEFECTO }; }
  });
  useEffect(() => { try { localStorage.setItem('mepoy-plan-candado-colores-estacion', JSON.stringify(coloresEstacion)); } catch { /* opcional */ } }, [coloresEstacion]);

  // Punto nuevo en preparación: mientras está activo, cada clic en el mapa
  // fija (o mueve) su coordenada, que se ve de inmediato en el formulario.
  const [capturandoNuevo, setCapturandoNuevo] = useState(false);
  const [coordNuevo, setCoordNuevo] = useState<{ lat: number; lon: number } | null>(null);

  const sincronizar = useCallback(async () => {
    try {
      const r = await sincronizarPlanCandado();
      if (r) { setUbicaciones(r.ubicaciones); setExtras(r.extras); }
    } catch (e) {
      console.warn('[Plan Candado] No se pudieron leer las ubicaciones compartidas:', e);
    }
  }, []);
  useEffect(() => { void sincronizar(); }, [sincronizar]);

  const colorCai = useCallback((cai: string) => {
    if (coloresCaiPersonalizados[cai]) return coloresCaiPersonalizados[cai];
    const n = parseInt(cai.replace(/\D/g, ''), 10);
    return PALETA_CAI_PLAN[(n - 1) % PALETA_CAI_PLAN.length] ?? '#116762';
  }, [coloresCaiPersonalizados]);

  const colorDePunto = useCallback((p: PuntoPlanCandado, m: ModoPlanCandado = modo) => {
    // General: color de su estación (Norte / Sur); sin estación, azul institucional.
    if (m === 'general') return p.estacion ? coloresEstacion[p.estacion] : COLOR_GENERAL;
    return p.cai ? colorCai(p.cai) : COLORES_CATEGORIA[p.categoria as Exclude<CategoriaPlanCandado, 'CAI'>];
  }, [colorCai, modo, coloresEstacion]);

  // Filtro principal → puntos de la selección. Solo se usan relaciones que
  // el documento sí trae; un cierre sin estación/CAI no se asigna a ninguna.
  const estacionesSel = useMemo(() => Array.from(new Set(estacionFiltro.map(estacionDeFiltro))), [estacionFiltro]);
  const caiSel = useMemo(() => new Set(caiFiltro.map(caiCanonico)), [caiFiltro]);
  const hayFiltroTerritorial = estacionFiltro.length > 0 || caiFiltro.length > 0;

  const puntosSeleccion = useMemo(() => todos.filter((p) => {
    if (estacionFiltro.length > 0 && (!p.estacion || !estacionesSel.includes(p.estacion))) return false;
    if (caiSel.size > 0 && (!p.cai || !caiSel.has(p.cai))) return false;
    if (filtroExtra && !filtroExtra(p, ubicaciones[p.id])) return false;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [todos, estacionFiltro.length, estacionesSel, caiSel, firmaFiltroExtra, filtroExtra ? ubicaciones : null]);

  const ubicados = useMemo(() => puntosSeleccion.filter((p) => ubicaciones[p.id]), [puntosSeleccion, ubicaciones]);
  const pendientes = useMemo(() => puntosSeleccion.filter((p) => !ubicaciones[p.id]), [puntosSeleccion, ubicaciones]);
  const sinRelacionOcultos = hayFiltroTerritorial ? todos.filter((p) => !p.estacion).length : 0;

  async function asignar(nuevas: UbicacionPlanCandado[], texto: string) {
    if (!editable) return;
    setGuardando(true);
    try {
      const m = await guardarUbicaciones(ubicaciones, nuevas);
      setUbicaciones(m);
      setMensaje({ tipo: 'ok', texto: hayServidorPlanCandado() ? `${texto} Guardado para todos los equipos.` : `${texto} Guardado en este navegador (no hay servidor central configurado).` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la ubicación.' });
    } finally {
      setGuardando(false);
    }
  }

  async function ubicarEn(id: string, lat: number, lon: number) {
    const p = todos.find((x) => x.id === id);
    setColocandoId(null);
    if (!p || !esCoordenadaValida(lat, lon)) return;
    await asignar([{ __id: id, lat, lon, fuente: 'mapa', actualizadoPor: 'Administrador', fecha: new Date().toISOString() }], `Punto ${etiquetaNumeroPlanCandado(p)} ubicado.`);
  }

  async function quitar(id: string) {
    if (!editable) return;
    const p = todos.find((x) => x.id === id);
    if (!p || !window.confirm(COORDENADAS_OFICIALES_PLAN_CANDADO[id] ? `¿Quitar la corrección del punto ${etiquetaNumeroPlanCandado(p)}? Vuelve a su coordenada oficial.` : `¿Quitar la ubicación del punto ${etiquetaNumeroPlanCandado(p)}? Vuelve a quedar pendiente; el registro del documento no se borra.`)) return;
    setGuardando(true);
    try {
      setUbicaciones(await quitarUbicacion(ubicaciones, id));
      setMensaje({ tipo: 'ok', texto: COORDENADAS_OFICIALES_PLAN_CANDADO[id] ? `Punto ${etiquetaNumeroPlanCandado(p)} vuelve a su coordenada oficial.` : `Punto ${etiquetaNumeroPlanCandado(p)} vuelve a pendientes.` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo quitar la ubicación.' });
    } finally {
      setGuardando(false);
    }
  }

  async function agregarPunto(d: DatosPuntoNuevo): Promise<boolean> {
    if (!editable || !esCoordenadaValida(d.lat, d.lon)) return false;
    const numero = Math.max(0, ...[...PLAN_CANDADO_2026, ...extras.puntos].filter((p) => p.categoria !== 'Cierre general MEPOY').map((p) => p.numero)) + 1;
    const cai = d.cai ? CAI_PLAN_CANDADO.find((c) => c.cai === d.cai) ?? null : null;
    const punto: PuntoPlanCandado = {
      id: `NUEVO-${Date.now().toString(36)}`,
      numero,
      categoria: cai ? 'CAI' : 'Punto agregado',
      estacion: d.estacion,
      cai: cai?.cai ?? null,
      caiNombre: cai?.nombre ?? null,
      unidad: null,
      direccion: d.direccion.trim() || null,
      lugar: d.lugar.trim() || null,
      responsablePrincipal: d.responsablePrincipal.trim() || null,
      responsableSecundario: d.responsableSecundario.trim() || null,
      enMatriz: false,
      agregado: true,
      estacionPorUbicacion: d.estacionPorUbicacion,
    };
    setGuardando(true);
    try {
      const r = await guardarPuntoNuevo(extras, ubicaciones, punto, { __id: punto.id, lat: d.lat, lon: d.lon, fuente: 'mapa', actualizadoPor: 'Administrador', fecha: new Date().toISOString() });
      setExtras(r.extras);
      setUbicaciones(r.ubicaciones);
      setCapturandoNuevo(false);
      setCoordNuevo(null);
      setMensaje({ tipo: 'ok', texto: `Punto ${numero} agregado (${d.lat.toFixed(6)}, ${d.lon.toFixed(6)}).${hayServidorPlanCandado() ? ' Guardado para todos los equipos.' : ' Guardado en este navegador (no hay servidor central configurado).'}` });
      return true;
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo agregar el punto.' });
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: string) {
    if (!puedeEliminar) return;
    const p = todos.find((x) => x.id === id);
    if (!p) return;
    const texto = p.agregado
      ? `¿Eliminar el punto ${etiquetaNumeroPlanCandado(p)} (${p.lugar ?? 'sin lugar'})? Se borra con su coordenada.`
      : `¿Retirar el punto ${etiquetaNumeroPlanCandado(p)} (${p.lugar ?? 'sin lugar'}) del Plan Candado? Deja de mostrarse y de contarse; se puede restaurar.`;
    if (!window.confirm(texto)) return;
    setGuardando(true);
    try {
      const r = await eliminarPuntoPlan(extras, ubicaciones, id);
      setExtras(r.extras);
      setUbicaciones(r.ubicaciones);
      if (seleccionadoId === id) setSeleccionadoId(null);
      setMensaje({ tipo: 'ok', texto: p.agregado ? `Punto ${etiquetaNumeroPlanCandado(p)} eliminado.` : `Punto ${etiquetaNumeroPlanCandado(p)} retirado. Puedes restaurarlo desde «Puntos retirados».` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo eliminar el punto.' });
    } finally {
      setGuardando(false);
    }
  }

  async function restaurar(id: string) {
    if (!puedeEliminar) return;
    setGuardando(true);
    try {
      setExtras(await restaurarPuntoPlan(extras, id));
      const p = PLAN_CANDADO_2026.find((x) => x.id === id);
      setMensaje({ tipo: 'ok', texto: `Punto ${p ? etiquetaNumeroPlanCandado(p) : id} restaurado.` });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo restaurar el punto.' });
    } finally {
      setGuardando(false);
    }
  }

  return {
    todos, retirados, extras, agregarPunto, eliminar, restaurar, puedeEliminar,
    coloresEstacion, setColoresEstacion, capturandoNuevo, setCapturandoNuevo, coordNuevo, setCoordNuevo,
    activo, setActivo, modo, setModo, ubicaciones, colocandoId, setColocandoId, seleccionadoId, setSeleccionadoId,
    mensaje, setMensaje, guardando, editable, colorCai, colorDePunto,
    puntosSeleccion, ubicados, pendientes, hayFiltroTerritorial, sinRelacionOcultos, estacionesSel, caiSel,
    ubicarEn, quitar, asignar, sincronizar,
    etiquetas, setEtiquetas, posicionesRotulo, moverRotulo, restablecerRotulos,
  };
}
export type PlanCandadoEstado = ReturnType<typeof usePlanCandado>;

// ── Marcadores ────────────────────────────────────────────────────────────
function iconoPunto(p: PuntoPlanCandado, color: string, dx: number, dy: number, resaltado: boolean): L.DivIcon {
  const num = etiquetaNumeroPlanCandado(p);
  const escala = resaltado ? 1.22 : 1;
  if (p.cai) {
    const w = Math.round(30 * escala), h = Math.round(40 * escala);
    return L.divIcon({
      className: 'mepoy-plan-candado',
      html: `<div style="position:relative;width:${w}px;height:${h}px;filter:drop-shadow(0 2px 3px rgba(15,23,42,.45))">
        <svg width="${w}" height="${h}" viewBox="0 0 30 40"><path d="M15 39C15 39 27.5 25.6 27.5 15A12.5 12.5 0 0 0 2.5 15C2.5 25.6 15 39 15 39Z" fill="${color}" stroke="#fff" stroke-width="2.2"/><circle cx="15" cy="15" r="8.6" fill="#fff"/></svg>
        <span style="position:absolute;left:0;top:${Math.round(8 * escala)}px;width:${w}px;text-align:center;font:800 ${num.length > 1 ? 10.5 : 12}px/${Math.round(14 * escala)}px system-ui,sans-serif;color:${color}">${num}</span></div>`,
      iconSize: [w, h],
      iconAnchor: [w / 2 - dx, h - 1 - dy],
      popupAnchor: [dx, -h + dy + 4],
    });
  }
  // Cierres que no dependen de un CAI: cuadro redondeado (otra forma, para
  // distinguirlos de los CAI sin depender solo del color).
  const s = Math.round(26 * escala);
  return L.divIcon({
    className: 'mepoy-plan-candado',
    html: `<div style="width:${s}px;height:${s}px;border-radius:7px;background:${color};border:2px solid #fff;box-shadow:0 2px 4px rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font:800 ${num.length > 2 ? 9.5 : 11}px system-ui,sans-serif;color:#fff">${num}</div>`,
    iconSize: [s, s],
    iconAnchor: [s / 2 - dx, s / 2 - dy],
    popupAnchor: [dx, -s / 2 + dy],
  });
}

// Puntos en el mismo sitio (ej. 43 y 44, misma glorieta) se abren en
// abanico unos píxeles — la coordenada guardada no cambia.
function desplazamientos(puntos: { id: string; lat: number; lon: number }[]): Map<string, [number, number]> {
  const grupos = new Map<string, string[]>();
  for (const p of puntos) {
    const k = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), p.id]);
  }
  const res = new Map<string, [number, number]>();
  for (const ids of grupos.values()) {
    ids.forEach((id, i) => {
      if (ids.length === 1) { res.set(id, [0, 0]); return; }
      const ang = (2 * Math.PI * i) / ids.length - Math.PI / 2;
      const r = 16 + ids.length * 2;
      res.set(id, [Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r)]);
    });
  }
  return res;
}

export function FichaPlanCandado({ p, u, acciones }: { p: PuntoPlanCandado; u?: UbicacionPlanCandado; acciones?: ReactNode }) {
  const filas: [string, string][] = [
    ['Estación', p.estacion ? `Estación ${p.estacion}` : NO_ESP],
    ['CAI', p.cai ? `${p.cai} - ${p.caiNombre}` : NO_ESP],
    ['Categoría', p.categoria],
    ...(p.enMatriz || p.agregado ? [
      ['Resp. principal', p.responsablePrincipal ?? NO_ESP],
      ['Resp. secundario', p.responsableSecundario ?? NO_ESP],
    ] as [string, string][] : []),
    ['Unidad (doc.)', p.unidad ?? NO_ESP],
    ['Dirección', p.direccion ?? NO_ESP],
    ['Lugar', p.lugar ?? NO_ESP],
    ['Estado', p.agregado ? (u ? 'Punto agregado, georreferenciado en el mapa' : 'Punto agregado, sin coordenada') : estadoUbicacion(u)],
  ];
  return (
    <div style={{ minWidth: 230, fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontWeight: 800, fontSize: 15, color: '#10233f', margin: '0 0 6px' }}>
        Punto {etiquetaNumeroPlanCandado(p)} <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>· Plan Candado 2026</span>
      </p>
      <table style={{ fontSize: 12, borderCollapse: 'collapse' }}>
        <tbody>
          {filas.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '1px 10px 1px 0', color: '#64748b', fontWeight: 700, verticalAlign: 'top' }}>{k}:</td>
              <td style={{ color: v === NO_ESP || v === ESTADO_PENDIENTE ? '#94a3b8' : '#0f172a', fontStyle: v === NO_ESP ? 'italic' : 'normal' }}>{v}</td>
            </tr>
          ))}
          {u && (
            <tr>
              <td style={{ padding: '1px 10px 1px 0', color: '#64748b', fontWeight: 700 }}>Latitud:</td>
              <td style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{u.lat.toFixed(7)}</td>
            </tr>
          )}
          {u && (
            <tr>
              <td style={{ padding: '1px 10px 1px 0', color: '#64748b', fontWeight: 700 }}>Longitud:</td>
              <td style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{u.lon.toFixed(7)}</td>
            </tr>
          )}
        </tbody>
      </table>
      {acciones}
    </div>
  );
}

function AjustarEncuadre({ puntos, clave }: { puntos: { lat: number; lon: number }[]; clave: string }) {
  const map = useMap();
  const ultima = useRef('');
  useEffect(() => {
    if (!clave || clave === ultima.current) return;
    ultima.current = clave;
    if (puntos.length === 0) return;
    if (puntos.length === 1) map.flyTo([puntos[0].lat, puntos[0].lon], Math.max(map.getZoom(), 16), { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number])), { padding: [60, 60], maxZoom: 16, duration: 0.6 });
  }, [clave, puntos, map]);
  return null;
}

function ColocarConClic({ estado }: { estado: PlanCandadoEstado }) {
  const map = useMap();
  const activo = !!estado.colocandoId || estado.capturandoNuevo;
  useEffect(() => {
    const c = map.getContainer();
    c.style.cursor = activo ? 'crosshair' : '';
    if (!activo) return;
    // El botón «Ubicar» está en la tabla de abajo: llevar el mapa a la vista.
    if (estado.colocandoId) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') estado.setColocandoId(null); };
    window.addEventListener('keydown', esc);
    return () => { c.style.cursor = ''; window.removeEventListener('keydown', esc); };
  }, [activo, map, estado.setColocandoId]);
  // 'preclick' (y no 'click'): Leaflet detiene el clic cuando cae sobre un
  // polígono con ventana emergente, y casi todo el mapa está cubierto por
  // capas de CAI/barrios. preclick llega siempre, antes que esas capas.
  useMapEvents({
    preclick(e) {
      if (estado.capturandoNuevo && !estado.colocandoId) {
        estado.setCoordNuevo({ lat: e.latlng.lat, lon: e.latlng.lng });
        window.setTimeout(() => map.closePopup(), 0);
        return;
      }
      if (!estado.colocandoId) return;
      void estado.ubicarEn(estado.colocandoId, e.latlng.lat, e.latlng.lng);
      window.setTimeout(() => map.closePopup(), 0);
    },
  });
  return null;
}

// Control de Leaflet con contenido de React (leyenda y aviso de ubicación).
export function ControlReact({ posicion, children }: { posicion: L.ControlPosition; children: ReactNode }) {
  const map = useMap();
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const control = new L.Control({ position: posicion });
    control.onAdd = () => {
      const div = L.DomUtil.create('div');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    control.addTo(map);
    setContenedor(control.getContainer() ?? null);
    return () => { control.remove(); };
  }, [map, posicion]);
  return contenedor ? createPortal(children, contenedor) : null;
}

// ── Rótulos arrastrables (como los de barrios) ────────────────────────────
// Texto tal como está en la tabla: «N. Lugar» y debajo la Dirección.
export const LARGO_ROTULO_PX = 62;

function textoRotulo(p: PuntoPlanCandado): { titulo: string; subtitulo: string | null } {
  return { titulo: `${etiquetaNumeroPlanCandado(p)}. ${p.lugar ?? NO_ESP}`, subtitulo: p.direccion };
}

function escapar(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function htmlRotuloPlan(p: PuntoPlanCandado, color: string): string {
  const { titulo, subtitulo } = textoRotulo(p);
  return `<div title="Arrastra para reubicar la etiqueta" style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;background:#ffffff;border:2px solid ${color};border-radius:6px;padding:2px 7px;box-shadow:0 2px 6px rgba(0,0,0,.25);font:700 11px/1.25 system-ui,Arial,sans-serif;color:#10233f;text-align:center;cursor:grab;user-select:none">${escapar(titulo)}${subtitulo ? `<br><span style="font-weight:600;color:#475569;font-size:10px">${escapar(subtitulo)}</span>` : ''}</div>`;
}

/** Tamaño en pantalla de la caja de un rótulo (px), medido con la misma letra. */
let medidorRotulos: CanvasRenderingContext2D | null = null;
function tamanoRotulo(p: PuntoPlanCandado): { w: number; h: number } {
  const { titulo, subtitulo } = textoRotulo(p);
  if (!medidorRotulos && typeof document !== 'undefined') medidorRotulos = document.createElement('canvas').getContext('2d');
  let w1 = titulo.length * 6.4, w2 = (subtitulo ?? '').length * 5.6;
  if (medidorRotulos) {
    medidorRotulos.font = '700 11px system-ui, Arial, sans-serif'; w1 = medidorRotulos.measureText(titulo).width;
    medidorRotulos.font = '600 10px system-ui, Arial, sans-serif'; w2 = subtitulo ? medidorRotulos.measureText(subtitulo).width : 0;
  }
  return { w: Math.max(w1, w2) + 18, h: subtitulo ? 34 : 21 };
}

type Caja = { x0: number; y0: number; x1: number; y1: number };
const solape = (a: Caja, b: Caja) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/**
 * Posición de cada rótulo: la que el usuario dejó al arrastrar, o una
 * automática que evita montarse sobre otros rótulos y pines (prueba varias
 * direcciones y distancias alrededor del punto y toma la primera libre; si
 * ninguna está libre, la que menos se cruza). Se recalcula con el zoom y es
 * la MISMA que usa la descarga.
 */
export function posicionesRotulosPlanCandado(estado: PlanCandadoEstado, mapa: L.Map): Map<string, { lat: number; lon: number }> {
  const puntos = estado.ubicados.map((p) => ({ p, ...estado.ubicaciones[p.id] }));
  const res = new Map<string, { lat: number; lon: number }>();
  const ocupadas: Caja[] = [];
  // Pines (la cabeza queda ~40 px por encima de la coordenada).
  for (const { lat, lon } of puntos) {
    const b = mapa.latLngToContainerPoint([lat, lon]);
    ocupadas.push({ x0: b.x - 15, y0: b.y - 41, x1: b.x + 15, y1: b.y + 2 });
  }
  const cajaEn = (cx: number, cy: number, t: { w: number; h: number }): Caja => ({ x0: cx - t.w / 2 - 3, y0: cy - t.h / 2 - 3, x1: cx + t.w / 2 + 3, y1: cy + t.h / 2 + 3 });
  // Primero los que el usuario movió (esas posiciones mandan).
  for (const { p } of puntos) {
    const manual = estado.posicionesRotulo[p.id];
    if (!manual) continue;
    res.set(p.id, manual);
    const c = mapa.latLngToContainerPoint([manual.lat, manual.lon]);
    ocupadas.push(cajaEn(c.x, c.y, tamanoRotulo(p)));
  }
  const dirs = direccionesHaciaAfuera(puntos);
  const angulos = [-90, -50, -130, -20, -160, 20, 160, 50, 130, 90];
  // De norte a sur: los de arriba eligen primero (más espacio hacia arriba).
  const orden = puntos.map((x, i) => ({ ...x, i })).filter(({ p }) => !estado.posicionesRotulo[p.id]).sort((a, b) => b.lat - a.lat);
  for (const { p, lat, lon, i } of orden) {
    const base = mapa.latLngToContainerPoint([lat, lon]);
    const t = tamanoRotulo(p);
    const preferido = (Math.atan2(dirs[i].y, dirs[i].x) * 180) / Math.PI;
    const candidatos: { x: number; y: number; costo: number }[] = [];
    for (const d of [LARGO_ROTULO_PX, LARGO_ROTULO_PX + 34, LARGO_ROTULO_PX + 72]) {
      for (const a of [preferido, ...angulos]) {
        const r = (a * Math.PI) / 180;
        const x = base.x + Math.cos(r) * (d + t.w / 4);
        const y = base.y - 20 + Math.sin(r) * d;
        const caja = cajaEn(x, y, t);
        candidatos.push({ x, y, costo: ocupadas.reduce((acc, o) => acc + solape(caja, o), 0) });
      }
    }
    const libre = candidatos.find((c) => c.costo === 0) ?? candidatos.reduce((m, c) => (c.costo < m.costo ? c : m));
    ocupadas.push(cajaEn(libre.x, libre.y, t));
    const ll = mapa.containerPointToLatLng([libre.x, libre.y]);
    res.set(p.id, { lat: ll.lat, lon: ll.lng });
  }
  return res;
}

function RotuloArrastrable({ p, color, punto, rotulo, onMover }: {
  p: PuntoPlanCandado; color: string; punto: { lat: number; lon: number }; rotulo: { lat: number; lon: number };
  onMover: (pos: { lat: number; lon: number }) => void;
}) {
  const [enVivo, setEnVivo] = useState<{ lat: number; lon: number } | null>(null);
  const r = enVivo ?? rotulo;
  const icono = useMemo(() => L.divIcon({ className: 'mepoy-rotulo-plan', html: htmlRotuloPlan(p, color), iconSize: [0, 0], iconAnchor: [0, 0] }), [p, color]);
  const linea: [number, number][] = [[r.lat, r.lon], [punto.lat, punto.lon]];
  return (
    <>
      <Polyline positions={linea} pathOptions={{ color: '#ffffff', weight: 4.5, opacity: 1, lineCap: 'round' }} interactive={false} />
      <Polyline positions={linea} pathOptions={{ color, weight: 2.2, opacity: 1, lineCap: 'round' }} interactive={false} />
      <Marker
        position={[r.lat, r.lon]}
        icon={icono}
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

function RotulosPlanCandado({ estado }: { estado: PlanCandadoEstado }) {
  const mapa = useMap();
  // Al hacer zoom, los rótulos que no se han movido conservan su distancia en pantalla.
  const [, setZoom] = useState(0);
  useMapEvents({ zoomend: () => setZoom((z) => z + 1) });
  const posiciones = posicionesRotulosPlanCandado(estado, mapa);
  return (
    <>
      {estado.ubicados.map((p) => {
        const pos = posiciones.get(p.id);
        const u = estado.ubicaciones[p.id];
        if (!pos || !u) return null;
        return <RotuloArrastrable key={`${p.id}-${estado.modo}`} p={p} color={estado.colorDePunto(p)} punto={u} rotulo={pos} onMover={(np) => estado.moverRotulo(p.id, np)} />;
      })}
    </>
  );
}

export function CapaLeafletPlanCandado({ estado }: { estado: PlanCandadoEstado }) {
  const { activo, modo, ubicados, ubicaciones, colorDePunto, seleccionadoId } = estado;
  const puntos = useMemo(() => ubicados.map((p) => ({ p, ...ubicaciones[p.id] })), [ubicados, ubicaciones]);
  const offsets = useMemo(() => desplazamientos(puntos.map(({ p, lat, lon }) => ({ id: p.id, lat, lon }))), [puntos]);
  // Reencuadra al activar la capa, cambiar General/Por CAI o cambiar la
  // Estación/CAI del filtro — NO cada vez que se ubica un punto (sería
  // molesto mientras se ubican varios seguidos).
  const claveEncuadre = activo ? `${modo}|${estado.puntosSeleccion.map((p) => p.id).join(',')}` : '';
  const marcadores = useRef(new Map<string, L.Marker>());

  // Al elegir un punto desde la tabla: centrar y abrir su ficha.
  const map = useMap();
  useEffect(() => {
    if (!activo || !seleccionadoId) return;
    const u = ubicaciones[seleccionadoId];
    if (!u) return;
    map.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.flyTo([u.lat, u.lon], Math.max(map.getZoom(), 16), { duration: 0.5 });
    const t = window.setTimeout(() => marcadores.current.get(seleccionadoId)?.openPopup(), 650);
    return () => window.clearTimeout(t);
  }, [seleccionadoId, activo, ubicaciones, map]);

  const colocando = estado.colocandoId ? estado.todos.find((p) => p.id === estado.colocandoId) : null;
  const nuevo = estado.capturandoNuevo ? estado.coordNuevo : null;

  return (
    <>
      {estado.editable && <ColocarConClic estado={estado} />}
      {nuevo && (
        <Marker
          position={[nuevo.lat, nuevo.lon]}
          draggable
          zIndexOffset={2000}
          icon={L.divIcon({ className: 'mepoy-plan-nuevo', html: `<div style="width:30px;height:40px;filter:drop-shadow(0 2px 4px rgba(15,23,42,.5))"><svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 39C15 39 27.5 25.6 27.5 15A12.5 12.5 0 0 0 2.5 15C2.5 25.6 15 39 15 39Z" fill="#f59e0b" stroke="#fff" stroke-width="2.2"/><path d="M15 9v12M9 15h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg></div>`, iconSize: [30, 40], iconAnchor: [15, 39] })}
          eventHandlers={{ dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); estado.setCoordNuevo({ lat: ll.lat, lon: ll.lng }); } }}
        />
      )}
      {colocando && (
        <ControlReact posicion="topright">
          <div className="max-w-[300px] rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 shadow-lg">
            <p className="font-bold">Ubicando punto {etiquetaNumeroPlanCandado(colocando)}</p>
            <p className="leading-snug">{colocando.direccion ?? NO_ESP} — {colocando.lugar ?? NO_ESP}</p>
            <p className="mt-1 text-[11px]">Haz clic en el sitio exacto del mapa. <button type="button" className="font-semibold underline" onClick={() => estado.setColocandoId(null)}>Cancelar (Esc)</button></p>
          </div>
        </ControlReact>
      )}
      {activo && (
        <>
          <AjustarEncuadre puntos={puntos} clave={claveEncuadre} />
          {estado.etiquetas && <RotulosPlanCandado estado={estado} />}
          {puntos.map(({ p, lat, lon }) => {
            const [dx, dy] = offsets.get(p.id) ?? [0, 0];
            const u = ubicaciones[p.id];
            return (
              <Marker
                key={`${p.id}-${modo}-${dx}-${dy}-${colorDePunto(p)}-${seleccionadoId === p.id}`}
                position={[lat, lon]}
                icon={iconoPunto(p, colorDePunto(p), dx, dy, seleccionadoId === p.id)}
                zIndexOffset={p.cai ? 600 : 500}
                ref={(m) => { if (m) marcadores.current.set(p.id, m); else marcadores.current.delete(p.id); }}
                eventHandlers={{ click: () => estado.setSeleccionadoId(p.id) }}
              >
                <Popup>
                  <FichaPlanCandado
                    p={p}
                    u={u}
                    acciones={estado.editable ? (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button type="button" onClick={() => { map.closePopup(); estado.setColocandoId(p.id); }} style={{ fontSize: 11.5, fontWeight: 700, color: '#0f5f57', border: '1px solid #99d5cb', borderRadius: 6, padding: '3px 8px', background: '#e3f2ef' }}>Corregir ubicación</button>
                        {estado.puedeEliminar && <button type="button" onClick={() => { map.closePopup(); void estado.eliminar(p.id); }} style={{ fontSize: 11.5, fontWeight: 600, color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 8px', background: '#fff' }}>{p.agregado ? 'Eliminar punto' : 'Retirar punto'}</button>}
                        {u?.fuente !== 'oficial' && !p.agregado && <button type="button" onClick={() => { map.closePopup(); void estado.quitar(p.id); }} style={{ fontSize: 11.5, fontWeight: 600, color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 8px', background: '#fff' }}>{COORDENADAS_OFICIALES_PLAN_CANDADO[p.id] ? 'Volver a la oficial' : 'Quitar'}</button>}
                      </div>
                    ) : null}
                  />
                </Popup>
              </Marker>
            );
          })}
          <ControlReact posicion="bottomleft">
            <LeyendaPlanCandado estado={estado} />
          </ControlReact>
        </>
      )}
    </>
  );
}

// ── Leyenda dinámica ──────────────────────────────────────────────────────
export function SimboloLeyenda({ color, forma }: { color: string; forma: 'pin' | 'cuadro' }) {
  return forma === 'pin' ? (
    <svg width="13" height="17" viewBox="0 0 30 40" aria-hidden className="shrink-0"><path d="M15 39C15 39 27.5 25.6 27.5 15A12.5 12.5 0 0 0 2.5 15C2.5 25.6 15 39 15 39Z" fill={color} stroke="#fff" strokeWidth="2.2" /><circle cx="15" cy="15" r="6" fill="#fff" /></svg>
  ) : (
    <span className="h-3 w-3 shrink-0 rounded-[3px] ring-1 ring-white" style={{ background: color }} />
  );
}

export function filasLeyendaPlanCandado(estado: PlanCandadoEstado): { etiqueta: string; color: string; forma: 'pin' | 'cuadro'; total: number; ubicados: number }[] {
  const grupos = new Map<string, { etiqueta: string; color: string; forma: 'pin' | 'cuadro'; total: number; ubicados: number }>();
  for (const p of estado.puntosSeleccion) {
    const etiqueta = estado.modo === 'general' ? (p.estacion ? `Estación ${p.estacion}` : 'Sin estación asignada') : grupoVisualPlanCandado(p);
    const g = grupos.get(etiqueta) ?? { etiqueta, color: estado.colorDePunto(p), forma: p.cai ? 'pin' : 'cuadro', total: 0, ubicados: 0 };
    g.total++;
    if (estado.ubicaciones[p.id]) g.ubicados++;
    grupos.set(etiqueta, g);
  }
  return Array.from(grupos.values());
}

export function LeyendaPlanCandado({ estado }: { estado: PlanCandadoEstado }) {
  const [abierta, setAbierta] = useState(true);
  // Solo lo que de verdad está dibujado; lo pendiente va en una línea aparte.
  const filas = filasLeyendaPlanCandado(estado).filter((f) => f.ubicados > 0);
  return (
    <div className="w-[236px] rounded-xl border border-slate-200 bg-white/95 text-[11.5px] text-slate-700 shadow-lg backdrop-blur-sm">
      <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-bold text-[#10233f]">
        <span className="flex items-center gap-1.5"><Lock size={13} /> Plan Candado 2026</span>
        <span className="text-[10.5px] font-semibold text-slate-400">{estado.modo === 'general' ? 'General' : 'Por CAI'}</span>
      </button>
      {abierta && (
        <div className="max-h-[260px] space-y-[3px] overflow-y-auto border-t border-slate-100 px-3 pb-2.5 pt-1.5 [scrollbar-width:thin]">
          {filas.length === 0 && <p className="text-slate-400">Aún no hay puntos ubicados en esta selección.</p>}
          {filas.map((f) => (
            <div key={f.etiqueta} className="flex items-center gap-2">
              <SimboloLeyenda color={f.color} forma={f.forma} />
              <span className="min-w-0 flex-1 truncate" title={f.etiqueta}>{f.etiqueta}</span>
              <span className="tabular-nums text-slate-500" title={`${f.ubicados} en el mapa de ${f.total}`}>{f.ubicados}/{f.total}</span>
            </div>
          ))}
          {estado.pendientes.length > 0 && (
            <div className="mt-1 flex items-center gap-2 border-t border-dashed border-slate-200 pt-1.5 text-amber-700">
              <TriangleAlert size={12} className="shrink-0" />
              <span className="flex-1">Pendientes de ubicar</span>
              <b className="tabular-nums">{estado.pendientes.length}</b>
            </div>
          )}
          <p className="pt-0.5 text-[10px] leading-snug text-slate-400">Cifra: en el mapa / del plan ({estado.puntosSeleccion.length} en la selección).</p>
        </div>
      )}
    </div>
  );
}

// ── Sección del panel izquierdo (oscuro) ──────────────────────────────────
export function ControlesPlanCandado({ estado }: { estado: PlanCandadoEstado }) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] hover:bg-white/5">
        <input type="checkbox" className="h-4 w-4 accent-[#22a67a]" checked={estado.activo} onChange={(e) => estado.setActivo(e.target.checked)} />
        <Lock size={13} className="shrink-0 text-emerald-300" />
        <span className="flex-1 truncate">Mostrar en el mapa</span>
        <span className="text-[11px] tabular-nums text-slate-400" title="En el mapa / puntos de la selección">{estado.ubicados.length}/{estado.puntosSeleccion.length}</span>
      </label>
      {estado.activo && (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-white/5 p-1" role="radiogroup" aria-label="Visualización del Plan Candado">
            {([['general', 'General', 'Todos los puntos'], ['cai', 'Por CAI', 'Agrupación por CAI']] as const).map(([m, t, s]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={estado.modo === m}
                onClick={() => estado.setModo(m)}
                className={clsx('rounded-md px-2 py-1.5 text-left leading-tight', estado.modo === m ? 'bg-white text-[#10233f]' : 'text-slate-200 hover:bg-white/10')}
              >
                <span className="block text-[12px] font-bold">{t}</span>
                <span className={clsx('block text-[10px]', estado.modo === m ? 'text-slate-500' : 'text-slate-400')}>{s}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-[12px] hover:bg-white/5">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[#22a67a]" checked={estado.etiquetas} onChange={(e) => estado.setEtiquetas(e.target.checked)} />
              Etiquetas de los puntos
            </label>
            {estado.etiquetas && Object.keys(estado.posicionesRotulo).length > 0 && (
              <button type="button" onClick={estado.restablecerRotulos} title="Vuelve a ubicar solas todas las etiquetas que moviste" className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-300 ring-1 ring-white/20 hover:bg-white/10">Reordenar</button>
            )}
          </div>
          {estado.etiquetas && <p className="text-[10.5px] leading-snug text-slate-400">Arrastra cada etiqueta para ubicarla donde quieras; la descarga las respeta.</p>}
          <p className="text-[10.5px] leading-snug text-slate-400">
            {estado.hayFiltroTerritorial
              ? `Según el filtro principal (Estación / CAI): ${estado.puntosSeleccion.length} de ${estado.todos.length} puntos.`
              : `Sin estación filtrada: los ${estado.todos.length} puntos del plan.`}
            {estado.pendientes.length > 0 && <span className="text-amber-300"> {estado.pendientes.length} pendiente(s) de ubicar.</span>}
          </p>
        </>
      )}
    </div>
  );
}

// ── Panel de información (debajo del mapa) ────────────────────────────────
function Kpi({ icono, titulo, valor, tono, nota }: { icono: ReactNode; titulo: string; valor: number; tono: string; nota?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tono)}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold leading-tight text-slate-500">{titulo}</p>
        <p className="text-[22px] font-extrabold leading-tight tabular-nums text-[#10233f]">{formatNumero(valor)}</p>
        {nota && <p className="text-[10.5px] leading-tight text-slate-400">{nota}</p>}
      </div>
    </div>
  );
}

function ListaConteo({ titulo, filas }: { titulo: string; filas: { etiqueta: string; color?: string; forma?: 'pin' | 'cuadro'; total: number; ubicados: number }[] }) {
  const suma = filas.reduce((a, f) => a + f.total, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-1.5 text-[13px] font-bold text-[#10233f]">{titulo}</p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-slate-400">
            <th className="pb-1 text-left font-semibold" />
            <th className="pb-1 text-right font-semibold">Puntos</th>
            <th className="pb-1 text-right font-semibold" title="Con coordenadas">Ubic.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta} className="border-t border-slate-100">
              <td className="py-[3px] pr-2">
                <span className="flex items-center gap-2">
                  {f.color && <SimboloLeyenda color={f.color} forma={f.forma ?? 'pin'} />}
                  <span className="truncate" title={f.etiqueta}>{f.etiqueta}</span>
                </span>
              </td>
              <td className="py-[3px] text-right font-bold tabular-nums">{f.total}</td>
              <td className="py-[3px] text-right tabular-nums text-slate-500">{f.ubicados}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 font-bold text-[#10233f]">
            <td className="pt-1">Total</td>
            <td className="pt-1 text-right tabular-nums">{suma}</td>
            <td className="pt-1 text-right tabular-nums">{filas.reduce((a, f) => a + f.ubicados, 0)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function conteo<T extends string>(puntos: PuntoPlanCandado[], ubic: MapaUbicaciones, clave: (p: PuntoPlanCandado) => T) {
  const m = new Map<T, { total: number; ubicados: number; ejemplo: PuntoPlanCandado }>();
  for (const p of puntos) {
    const k = clave(p);
    const g = m.get(k) ?? { total: 0, ubicados: 0, ejemplo: p };
    g.total++;
    if (ubic[p.id]) g.ubicados++;
    m.set(k, g);
  }
  return m;
}

export function filasExport(puntos: PuntoPlanCandado[], ubic: MapaUbicaciones) {
  return puntos.map((p) => {
    const u = ubic[p.id];
    return {
      ID: p.id,
      No: etiquetaNumeroPlanCandado(p),
      Categoria: p.categoria,
      Estacion: p.estacion ?? NO_ESP,
      CAI: p.cai ? `${p.cai} - ${p.caiNombre}` : NO_ESP,
      'Responsable Principal': p.responsablePrincipal ?? (p.enMatriz || p.agregado ? NO_ESP : 'No está en la matriz'),
      'Responsable Secundario': p.responsableSecundario ?? (p.enMatriz || p.agregado ? NO_ESP : 'No está en la matriz'),
      'Unidad (documento)': p.unidad ?? NO_ESP,
      Direccion: p.direccion ?? NO_ESP,
      Lugar: p.lugar ?? NO_ESP,
      Latitud: u ? u.lat : '',
      Longitud: u ? u.lon : '',
      Estado: p.agregado ? 'Punto agregado en el dashboard' : estadoUbicacion(u),
    };
  });
}

/** Texto corto con el resultado de leer una matriz (para avisos). */
export function resumenInformeMatriz(inf: InformeMatriz): string {
  const partes = [`${inf.procesados} fila(s) leídas`, `${inf.conCoordenadas} con coordenadas válidas`, `${inf.pendientes.length} sin coordenadas (pendientes)`];
  if (inf.sinCambios) partes.push(`${inf.sinCambios} sin cambios`);
  if (inf.conservadasManuales.length) partes.push(`${inf.conservadasManuales.length} corrección(es) manual(es) conservada(s): ${inf.conservadasManuales.join(', ')}`);
  if (inf.errores.length) partes.push(`${inf.errores.length} error(es)`);
  return partes.join(' · ');
}

export function PanelPlanCandado({ estado, puedeDescargar }: { estado: PlanCandadoEstado; puedeDescargar: boolean }) {
  const [pestana, setPestana] = useState<'tabla' | 'pendientes'>('tabla');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(10);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const { puntosSeleccion, ubicaciones, ubicados, pendientes } = estado;

  const base = pestana === 'tabla' ? puntosSeleccion : pendientes;
  const q = normalizar(busqueda);
  const filtrados = q
    ? base.filter((p) => normalizar([etiquetaNumeroPlanCandado(p), p.estacion, p.cai, p.caiNombre, p.categoria, p.unidad, p.direccion, p.lugar].join(' ')).includes(q))
    : base;
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const visibles = filtrados.slice(paginaActual * porPagina, (paginaActual + 1) * porPagina);
  useEffect(() => { setPagina(0); }, [pestana, busqueda, porPagina, puntosSeleccion.length]);

  const porEstacion = conteo(puntosSeleccion, ubicaciones, (p) => (p.estacion ? `Estación ${p.estacion}` : 'Sin estación (otros cierres)'));
  const porCai = conteo(puntosSeleccion.filter((p) => p.cai), ubicaciones, (p) => grupoVisualPlanCandado(p));
  const porCategoria = conteo(puntosSeleccion, ubicaciones, (p) => p.categoria);
  const ordenCai = (k: string) => parseInt(k.replace(/^CAI (\d+).*/, '$1'), 10);

  const tituloSeleccion = estado.hayFiltroTerritorial
    ? [...estado.estacionesSel.filter(Boolean).map((e) => `Estación ${e}`), ...Array.from(estado.caiSel)].join(' · ') || 'Selección sin estación identificada'
    : 'Todas las estaciones';

  function exportarTabla() {
    if (!puedeDescargar) return;
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasExport(puntosSeleccion, ubicaciones)), 'Plan Candado 2026');
    XLSX.writeFile(libro, 'plan-candado-2026.xlsx');
  }

  async function importar(file: File) {
    try {
      const inf = await leerMatrizPlanCandado(file, estado.ubicaciones);
      const resumen = `«${file.name}»: ${resumenInformeMatriz(inf)}.${inf.errores.length ? ` ${inf.errores.slice(0, 3).join(' ')}` : ''}`;
      if (inf.nuevas.length === 0) { estado.setMensaje({ tipo: inf.errores.length ? 'error' : 'ok', texto: `${resumen} No hubo coordenadas que actualizar.` }); return; }
      await estado.asignar(inf.nuevas, `${inf.nuevas.length} punto(s) actualizados. ${resumen}`);
    } catch (e) {
      estado.setMensaje({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo leer el archivo.' });
    }
  }

  return (
    <section data-panel-plan-candado className="@container rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,35,63,0.05)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#10233f] text-white"><Lock size={21} /></span>
          <div className="min-w-0">
            <h2 className="text-[18px] font-extrabold leading-tight text-[#10233f]">Plan Candado 2026 — {tituloSeleccion}</h2>
            <p className="text-[12.5px] text-slate-500">Puntos de control y cierre del documento «Plan Candado 2026» (agosto 2026) · vista {estado.modo === 'general' ? 'General' : 'Por CAI'}.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estado.editable && (
            <>
              <input ref={inputArchivo} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importar(f); }} />
              <button type="button" disabled={estado.guardando} onClick={() => inputArchivo.current?.click()} title="Excel o CSV con columnas ID (o No), Latitud y Longitud" className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-50">
                <Upload size={14} /> Importar coordenadas
              </button>
            </>
          )}
          {puedeDescargar && (
            <button type="button" onClick={exportarTabla} title="Tabla de la selección actual, con columnas Latitud/Longitud (sirve de plantilla para importar)" className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50">
              <Download size={14} /> Exportar tabla
            </button>
          )}
        </div>
      </div>

      {estado.mensaje && (
        <div className={clsx('mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]', estado.mensaje.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800')}>
          {estado.mensaje.tipo === 'ok' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{estado.mensaje.texto}</span>
          <button type="button" onClick={() => estado.setMensaje(null)} aria-label="Cerrar"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 @min-[520px]:grid-cols-2 @min-[960px]:grid-cols-4">
        <Kpi icono={<FileUp size={19} />} tono="bg-[#e3f2ef] text-[#0f5f57]" titulo="Registrados en el plan" valor={estado.todos.length} nota={`${estado.extras.puntos.length} agregado(s) · ${estado.retirados.length} retirado(s)`} />
        <Kpi icono={<MapPin size={19} />} tono="bg-sky-50 text-sky-700" titulo="En la selección actual" valor={puntosSeleccion.length} nota={estado.hayFiltroTerritorial ? 'Según Estación / CAI del filtro' : 'Sin filtro territorial'} />
        <Kpi icono={<CheckCircle2 size={19} />} tono="bg-emerald-50 text-emerald-700" titulo="Con coordenadas válidas" valor={ubicados.length} nota="De la selección actual" />
        <Kpi icono={<TriangleAlert size={19} />} tono="bg-amber-50 text-amber-600" titulo="Pendientes de georreferenciar" valor={pendientes.length} nota="De la selección actual" />
      </div>
      {estado.hayFiltroTerritorial && estado.sinRelacionOcultos > 0 && (
        <p className="mt-2 text-[11.5px] text-slate-500">
          {estado.sinRelacionOcultos} punto(s) del documento (cierre general MEPOY, Carabineros, Terminal, Guardia MEPOY) no indican estación ni CAI, por eso no entran en una selección por Estación/CAI.
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 items-start gap-2.5 @min-[860px]:grid-cols-3">
        <ListaConteo titulo="Puntos por estación" filas={Array.from(porEstacion.entries()).map(([k, g]) => ({ etiqueta: k, total: g.total, ubicados: g.ubicados }))} />
        <ListaConteo
          titulo="Puntos por CAI"
          filas={Array.from(porCai.entries()).sort((a, b) => ordenCai(a[0]) - ordenCai(b[0])).map(([k, g]) => ({ etiqueta: k, color: estado.colorDePunto(g.ejemplo, 'cai'), forma: 'pin' as const, total: g.total, ubicados: g.ubicados }))}
        />
        <ListaConteo
          titulo="Puntos por categoría operativa"
          filas={Array.from(porCategoria.entries()).map(([k, g]) => ({ etiqueta: k === 'CAI' ? 'CAI (estaciones Norte y Sur)' : k, color: estado.colorDePunto(g.ejemplo, 'cai'), forma: g.ejemplo.cai ? 'pin' as const : 'cuadro' as const, total: g.total, ubicados: g.ubicados }))}
        />
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200">
          <div className="flex gap-1">
            {([['tabla', `Tabla de puntos (${puntosSeleccion.length})`], ['pendientes', `Puntos pendientes (${pendientes.length})`]] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setPestana(k)} className={clsx('rounded-t-lg px-4 py-2 text-[13px] font-bold', pestana === k ? 'bg-[#10233f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{t}</button>
            ))}
          </div>
          <label className="mb-1.5 flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] sm:max-w-[360px]">
            <Search size={14} className="text-slate-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por CAI, dirección, lugar o unidad…" className="w-full bg-transparent outline-none" />
          </label>
        </div>
        {pestana === 'pendientes' && pendientes.length > 0 && (
          <p className="mt-2 text-[12px] text-slate-500">
            Estos puntos no tienen coordenada en el archivo oficial ({ARCHIVO_COORDENADAS_OFICIALES}). {estado.editable ? 'Usa «Ubicar en el mapa» y haz clic en el sitio exacto, o importa un Excel/CSV con ID, Latitud y Longitud (puedes partir de «Exportar tabla»).' : 'Un administrador debe asignar su ubicación.'}
          </p>
        )}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left text-[11.5px] font-bold text-[#10233f]">
                <th className="px-2 py-2">No.</th>
                <th className="px-2 py-2">Estación</th>
                <th className="px-2 py-2">CAI / Categoría</th>
                <th className="px-2 py-2">Unidad / Responsable</th>
                <th className="px-2 py-2">Dirección</th>
                <th className="px-2 py-2">Lugar de referencia</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const u = ubicaciones[p.id];
                return (
                  <tr key={p.id} className={clsx('border-t border-slate-100', estado.seleccionadoId === p.id && 'bg-[#e3f2ef]/60')}>
                    <td className="px-2 py-1.5 font-bold tabular-nums">
                      <span className="flex items-center gap-1.5"><SimboloLeyenda color={estado.colorDePunto(p, 'cai')} forma={p.cai ? 'pin' : 'cuadro'} />{etiquetaNumeroPlanCandado(p)}</span>
                    </td>
                    <td className="px-2 py-1.5">{p.estacion ?? <i className="text-slate-400">{NO_ESP}</i>}</td>
                    <td className="px-2 py-1.5">{p.cai ? `${p.cai} - ${p.caiNombre}` : p.categoria}</td>
                    <td className="px-2 py-1.5">{p.unidad ?? <i className="text-slate-400">{NO_ESP}</i>}</td>
                    <td className="px-2 py-1.5">{p.direccion ?? <i className="text-slate-400">{NO_ESP}</i>}</td>
                    <td className="px-2 py-1.5">{p.lugar ?? <i className="text-slate-400">{NO_ESP}</i>}</td>
                    <td className="px-2 py-1.5">
                      <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', u ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                        <span className={clsx('h-1.5 w-1.5 rounded-full', u ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {!u ? 'Pendiente' : u.fuente === 'oficial' ? 'Georreferenciado' : 'Corregido'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {u && (
                          <button type="button" title="Ver en el mapa" onClick={() => { estado.setActivo(true); estado.setSeleccionadoId(null); window.setTimeout(() => estado.setSeleccionadoId(p.id), 0); }} className="rounded p-1 text-[#0f5f57] hover:bg-[#e3f2ef]"><MapPin size={15} /></button>
                        )}
                        {estado.editable && (
                          <button type="button" title={u ? 'Corregir ubicación: clic en el mapa' : 'Ubicar en el mapa'} disabled={estado.guardando} onClick={() => { estado.setActivo(true); estado.setColocandoId(p.id); }} className={clsx('flex items-center gap-1 rounded px-1.5 py-1 text-[11.5px] font-semibold', estado.colocandoId === p.id ? 'bg-amber-100 text-amber-800' : 'text-[#10233f] hover:bg-slate-100')}>
                            <Crosshair size={14} /> {u ? '' : 'Ubicar'}
                          </button>
                        )}
                        {estado.puedeEliminar && (
                          <button type="button" title={p.agregado ? 'Eliminar punto' : 'Retirar punto del plan'} onClick={() => void estado.eliminar(p.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
                        )}
                        {estado.editable && u && u.fuente !== 'oficial' && (
                          <button type="button" title={COORDENADAS_OFICIALES_PLAN_CANDADO[p.id] ? 'Quitar la corrección (vuelve a la coordenada oficial)' : 'Quitar ubicación (vuelve a pendiente)'} onClick={() => void estado.quitar(p.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">{pestana === 'pendientes' ? 'No hay puntos pendientes en esta selección.' : 'Sin puntos para esta búsqueda.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500">
          <label className="flex items-center gap-1.5">Mostrar
            <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="rounded-md border border-slate-200 px-1.5 py-1">
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select> registros
          </label>
          <span>Mostrando {filtrados.length === 0 ? 0 : paginaActual * porPagina + 1} a {Math.min(filtrados.length, (paginaActual + 1) * porPagina)} de {filtrados.length} registros</span>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPaginas }, (_, i) => (
              <button key={i} type="button" onClick={() => setPagina(i)} className={clsx('h-7 min-w-7 rounded-md px-2 font-semibold', i === paginaActual ? 'bg-[#10233f] text-white' : 'bg-slate-100 hover:bg-slate-200')}>{i + 1}</button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Marcadores para la imagen descargada del mapa (mismo color y número que en pantalla). */
export function marcadoresParaExportar(estado: PlanCandadoEstado, mapa: L.Map | null): { lat: number; lon: number; color: string; texto: string; forma: 'pin' | 'cuadro'; rotulo?: { lat: number; lon: number; titulo: string; subtitulo: string | null } }[] {
  if (!estado.activo) return [];
  const rotulos = estado.etiquetas && mapa ? posicionesRotulosPlanCandado(estado, mapa) : null;
  return estado.ubicados.map((p) => ({
    rotulo: rotulos?.get(p.id) ? { ...rotulos.get(p.id)!, ...textoRotulo(p) } : undefined,
    lat: estado.ubicaciones[p.id].lat,
    lon: estado.ubicaciones[p.id].lon,
    color: estado.colorDePunto(p),
    texto: etiquetaNumeroPlanCandado(p),
    forma: p.cai ? 'pin' as const : 'cuadro' as const,
  }));
}

export { CAI_PLAN_CANDADO };
