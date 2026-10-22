import { obtenerConfig } from '../config';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { pedirClaveSesion, revisarErrorDeClave, MENSAJE_SIN_CLAVE } from '../utils/claveSesion';
import { esCoordenadaValida } from '../utils/geodesia';
import { obtenerCliente } from './supabaseApi';
import { COORDENADAS_OFICIALES_PLAN_CANDADO, type PuntoPlanCandado } from './planCandado2026';

/** Coordenadas oficiales (archivo entregado por MEPOY), base sobre la que se aplican las correcciones. */
export function ubicacionesOficiales(): MapaUbicaciones {
  return Object.fromEntries(Object.entries(COORDENADAS_OFICIALES_PLAN_CANDADO).map(([id, [lat, lon]]) => [
    id, { __id: id, lat, lon, fuente: 'oficial' as const, actualizadoPor: 'MEPOY', fecha: '2026-10-17' },
  ]));
}

// Coordenadas del PLAN CANDADO — guardadas APARTE de los registros del
// documento (planCandado2026.ts), una fila por punto con su id estable:
// asignar o corregir una ubicación reemplaza esa fila, nunca duplica el
// punto ni toca su dirección original.
//
// Se comparten con todos los equipos por la misma vía que las capas del
// mapa: tabla crime_records, dataset 'plan_candado' (escritura con la clave
// de actualización por la función subirRegistros; lectura con la llave
// pública). Además se guarda una copia en este navegador para que el mapa
// abra rápido y funcione sin servidor.

export interface UbicacionPlanCandado {
  __id: string; // = id del punto (MEPOY-1, PC-23…)
  lat: number;
  lon: number;
  fuente: 'mapa' | 'archivo' | 'oficial'; // oficial = Plan_candado_2026.xlsx, incluido en el dashboard
  actualizadoPor: string;
  fecha: string; // ISO
}

const DATASET = 'plan_candado';
const FUNCION = '/.netlify/functions/subirRegistros';
const CLAVE_LOCAL = 'mepoy-plan-candado-ubicaciones';

export type MapaUbicaciones = Record<string, UbicacionPlanCandado>;

function servidor() {
  const { backendUrl, supabaseAnonKey } = obtenerConfig();
  return backendUrl && supabaseAnonKey ? { url: backendUrl, key: supabaseAnonKey } : null;
}

export function hayServidorPlanCandado(): boolean {
  return servidor() != null;
}

function valida(u: unknown): u is UbicacionPlanCandado {
  const x = u as UbicacionPlanCandado & { tipo?: string };
  return !!x && !x.tipo && typeof x.__id === 'string' && esCoordenadaValida(Number(x.lat), Number(x.lon));
}

// ── Puntos AGREGADOS y puntos ELIMINADOS ─────────────────────────────────
// Mismo dataset, filas aparte (nunca tocan los registros del documento):
//  · `punto#ID`     → { tipo: 'punto', punto }  (punto agregado a mano)
//  · `eliminado#ID` → { tipo: 'eliminado', id } (punto del documento retirado;
//                      se puede restaurar borrando esta fila)
export interface ExtrasPlanCandado { puntos: PuntoPlanCandado[]; eliminados: string[] }
const CLAVE_EXTRAS = 'mepoy-plan-candado-extras';

export function leerExtrasLocales(): ExtrasPlanCandado {
  try {
    const e = JSON.parse(localStorage.getItem(CLAVE_EXTRAS) || '{}') as Partial<ExtrasPlanCandado>;
    return { puntos: Array.isArray(e.puntos) ? e.puntos : [], eliminados: Array.isArray(e.eliminados) ? e.eliminados : [] };
  } catch {
    return { puntos: [], eliminados: [] };
  }
}
function guardarExtrasLocal(e: ExtrasPlanCandado) {
  try { localStorage.setItem(CLAVE_EXTRAS, JSON.stringify(e)); } catch { /* solo en memoria */ }
}

/** Ubicaciones + puntos agregados + eliminados, desde el servidor (si hay). */
export async function sincronizarPlanCandado(): Promise<{ ubicaciones: MapaUbicaciones; extras: ExtrasPlanCandado } | null> {
  // Plan Candado es solo del administrador: el perfil piloto ni lo consulta.
  if (obtenerModoAcceso() === 'piloto') return null;
  const s = servidor();
  if (!s) return null;
  const supabase = obtenerCliente(s.url, s.key);
  const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', DATASET);
  if (error) throw new Error(error.message);
  const m: MapaUbicaciones = ubicacionesOficiales();
  const extras: ExtrasPlanCandado = { puntos: [], eliminados: [] };
  for (const f of data ?? []) {
    const d = (f as { datos: any }).datos;
    if (d?.tipo === 'punto' && d.punto?.id) extras.puntos.push(d.punto as PuntoPlanCandado);
    else if (d?.tipo === 'eliminado' && d.id) extras.eliminados.push(String(d.id));
    else if (valida(d)) m[d.__id] = { ...d, lat: Number(d.lat), lon: Number(d.lon) };
  }
  extras.puntos.sort((a, b) => a.numero - b.numero);
  guardarLocal(m);
  guardarExtrasLocal(extras);
  return { ubicaciones: m, extras };
}

/** Agrega un punto nuevo con su coordenada (una sola operación). */
export async function guardarPuntoNuevo(extras: ExtrasPlanCandado, ubicaciones: MapaUbicaciones, punto: PuntoPlanCandado, u: UbicacionPlanCandado): Promise<{ extras: ExtrasPlanCandado; ubicaciones: MapaUbicaciones }> {
  if (!valida(u)) throw new Error('La coordenada del punto nuevo no es válida.');
  await enviar({ registros: [{ __id: `punto#${punto.id}`, tipo: 'punto', punto }, u] });
  const e = { ...extras, puntos: [...extras.puntos.filter((p) => p.id !== punto.id), punto] };
  const m = { ...ubicaciones, [u.__id]: u };
  guardarExtrasLocal(e);
  guardarLocal(m);
  return { extras: e, ubicaciones: m };
}

/**
 * Elimina un punto. Agregado a mano → se borra del todo (ficha y coordenada).
 * Del documento → queda retirado (no se muestra ni se cuenta) y se puede restaurar.
 */
export async function eliminarPuntoPlan(extras: ExtrasPlanCandado, ubicaciones: MapaUbicaciones, id: string): Promise<{ extras: ExtrasPlanCandado; ubicaciones: MapaUbicaciones }> {
  const esAgregado = extras.puntos.some((p) => p.id === id);
  if (esAgregado) {
    await enviar({ idsABorrar: [`punto#${id}`, id] });
    const e = { ...extras, puntos: extras.puntos.filter((p) => p.id !== id) };
    const m = { ...ubicaciones };
    delete m[id];
    guardarExtrasLocal(e);
    guardarLocal(m);
    return { extras: e, ubicaciones: m };
  }
  await enviar({ registros: [{ __id: `eliminado#${id}`, tipo: 'eliminado', id, fecha: new Date().toISOString() }] });
  const e = { ...extras, eliminados: Array.from(new Set([...extras.eliminados, id])) };
  guardarExtrasLocal(e);
  return { extras: e, ubicaciones };
}

/** Restaura un punto del documento que se había retirado. */
export async function restaurarPuntoPlan(extras: ExtrasPlanCandado, id: string): Promise<ExtrasPlanCandado> {
  await enviar({ idsABorrar: [`eliminado#${id}`] });
  const e = { ...extras, eliminados: extras.eliminados.filter((x) => x !== id) };
  guardarExtrasLocal(e);
  return e;
}

/** Oficiales + correcciones guardadas en este navegador (las correcciones mandan). */
export function leerUbicacionesLocales(): MapaUbicaciones {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || '{}') as MapaUbicaciones;
    return { ...ubicacionesOficiales(), ...Object.fromEntries(Object.entries(crudo).filter(([, u]) => valida(u) && u.fuente !== 'oficial')) };
  } catch {
    return ubicacionesOficiales();
  }
}

// En este navegador solo se guardan las correcciones (nunca las oficiales).
function guardarLocal(m: MapaUbicaciones) {
  const correcciones = Object.fromEntries(Object.entries(m).filter(([, u]) => u.fuente !== 'oficial'));
  try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(correcciones)); } catch { /* sin almacenamiento: solo en memoria */ }
}

/** Trae las coordenadas compartidas del servidor (si hay) y las guarda en este navegador. */
export async function sincronizarUbicaciones(): Promise<MapaUbicaciones | null> {
  const s = servidor();
  if (!s) return null;
  const supabase = obtenerCliente(s.url, s.key);
  const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', DATASET);
  if (error) throw new Error(error.message);
  const m: MapaUbicaciones = ubicacionesOficiales();
  for (const f of data ?? []) {
    const u = (f as { datos: unknown }).datos;
    if (valida(u)) m[u.__id] = { ...u, lat: Number(u.lat), lon: Number(u.lon) };
  }
  guardarLocal(m);
  return m;
}

async function enviar(cuerpo: Record<string, unknown>) {
  const s = servidor();
  if (!s) return; // sin servidor: queda solo en este navegador
  const token = pedirClaveSesion('guardar las ubicaciones del Plan Candado');
  if (!token) throw new Error(MENSAJE_SIN_CLAVE);
  const resp = await fetch(FUNCION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, usuario: 'Plan Candado', dataset: DATASET, registros: [], esUltimoLote: true, ...cuerpo }),
  });
  const r = await resp.json().catch(() => null);
  if (!resp.ok || !r || !r.ok) {
    const e = new Error((r && r.error) || `El servidor respondió con error ${resp.status}.`);
    revisarErrorDeClave(e);
    throw e;
  }
}

/** Asigna o corrige coordenadas (una o varias). Devuelve el mapa actualizado. */
export async function guardarUbicaciones(actual: MapaUbicaciones, nuevas: UbicacionPlanCandado[]): Promise<MapaUbicaciones> {
  const validas = nuevas.filter(valida);
  if (validas.length === 0) return actual;
  await enviar({ registros: validas });
  const m = { ...actual };
  for (const u of validas) m[u.__id] = u;
  guardarLocal(m);
  return m;
}

/** Quita la coordenada de un punto (vuelve a "pendiente"). El registro del documento no se toca. */
export async function quitarUbicacion(actual: MapaUbicaciones, id: string): Promise<MapaUbicaciones> {
  await enviar({ idsABorrar: [id] });
  const m = { ...actual };
  delete m[id];
  // Si el punto tiene coordenada oficial, vuelve a ella (no a pendiente).
  const oficial = ubicacionesOficiales()[id];
  if (oficial) m[id] = oficial;
  guardarLocal(m);
  return m;
}
