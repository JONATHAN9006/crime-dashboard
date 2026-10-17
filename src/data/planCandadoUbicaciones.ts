import { obtenerConfig } from '../config';
import { pedirClaveSesion, revisarErrorDeClave, MENSAJE_SIN_CLAVE } from '../utils/claveSesion';
import { esCoordenadaValida } from '../utils/geodesia';
import { obtenerCliente } from './supabaseApi';
import { COORDENADAS_OFICIALES_PLAN_CANDADO } from './planCandado2026';

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
  const x = u as UbicacionPlanCandado;
  return !!x && typeof x.__id === 'string' && esCoordenadaValida(Number(x.lat), Number(x.lon));
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
