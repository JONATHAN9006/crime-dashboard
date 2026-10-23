import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CrimeRecord } from '../types/crime';
import type { DatasetRemoto, RemoteMeta, RemotePushResult } from './remoteApi';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { tokenSesionActual } from '../cai/apiCai';
import { recortarCoordenadasPiloto, registroEnPopayan } from '../utils/territorioPiloto';

// ── Perfil piloto (/piloto) ────────────────────────────────────────────────
// El piloto NUNCA lee la base directamente con la llave pública: pide los
// datos a netlify/functions/datosPiloto con su token firmado, y el SERVIDOR
// entrega solo lo de Popayán. Aquí se vuelve a filtrar (defensa en
// profundidad) por si algo llegara distinto.
const FUNCION_PILOTO = '/.netlify/functions/datosPiloto';
const esPiloto = () => obtenerModoAcceso() === 'piloto';

export async function llamarFuentePiloto(cuerpo: Record<string, unknown>): Promise<any> {
  const token = tokenSesionActual();
  if (!token) throw new Error('Sesión no válida.');
  const r = await fetch(FUNCION_PILOTO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, token }) });
  const texto = await r.text().catch(() => '');
  let j: any = null;
  try { j = JSON.parse(texto); } catch { /* respuesta no JSON (p. ej. función no publicada o respuesta demasiado grande) */ }
  if (!r.ok || !j || !j.ok) {
    // Diagnóstico en la consola (F12): estado HTTP y motivo, sin datos sensibles.
    console.error(`[Piloto] ${String(cuerpo.accion)} → HTTP ${r.status}`, j ? (j.motivo || j.detalle || j.error) : texto.slice(0, 200));
    throw new Error((j && j.error) || `Consulta no disponible (${r.status}).`);
  }
  return j;
}

async function descargarRegistrosPiloto(): Promise<CrimeRecord[]> {
  const registros: CrimeRecord[] = [];
  let desde: number | null = 0;
  for (let vuelta = 0; desde !== null && vuelta < 500; vuelta++) {
    const j: { registros: any[]; siguiente: number | null } = await llamarFuentePiloto({ accion: 'registros', desde });
    for (const d of j.registros || []) if (registroEnPopayan(d)) registros.push(filaADistancia(recortarCoordenadasPiloto(d)));
    desde = j.siguiente;
  }
  return registros;
}

// Un solo cliente reutilizado — createClient no es caro, pero no hay
// necesidad de crear uno nuevo en cada llamada.
let clienteCache: { url: string; anonKey: string; cliente: SupabaseClient } | null = null;
export function obtenerCliente(url: string, anonKey: string): SupabaseClient {
  // El perfil piloto NUNCA consulta la base directamente (solo vía datosPiloto).
  if (obtenerModoAcceso() === 'piloto') throw new Error('Consulta directa no autorizada para este perfil.');
  if (clienteCache && clienteCache.url === url && clienteCache.anonKey === anonKey) return clienteCache.cliente;
  const cliente = createClient(url, anonKey);
  clienteCache = { url, anonKey, cliente };
  return cliente;
}

// Cada fila de la tabla trae el registro COMPLETO en "datos" (ver
// supabase/schema.sql) — se reconstruye el CrimeRecord tal cual el resto
// del dashboard lo espera, incluida la fecha como objeto Date (en la base
// se guarda como texto ISO, porque JSON no tiene un tipo de fecha propio).
function filaADistancia(datos: any): CrimeRecord {
  return {
    ...datos,
    fecha: datos.fecha ? new Date(datos.fecha) : null,
  } as CrimeRecord;
}

const TAMANO_PAGINA = 1000; // límite por defecto de PostgREST es 1000 filas por pedido

export async function descargarRegistrosSupabase(url: string, anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<CrimeRecord[]> {
  if (esPiloto()) return dataset === 'delictividad' ? descargarRegistrosPiloto() : [];
  const supabase = obtenerCliente(url, anonKey);
  // BUG REAL (registros que "faltaban" en algunos equipos, ej. 2016 o
  // homicidios que no cuadraban): se paginaba con .range() SIN ORDEN. Sin
  // ORDER BY, PostgreSQL no garantiza el mismo orden entre una página y la
  // siguiente (y menos si alguien está subiendo información), así que
  // algunas filas salían repetidas y otras nunca llegaban. Ahora:
  //  1) se ordena por la llave (id_identidad) — paginación estable;
  //  2) se compara lo recibido contra el CONTEO EXACTO del servidor y, si
  //     no coincide (alguien subió/borró justo en medio), se repite.
  for (let intento = 1; intento <= 3; intento++) {
    const { count: esperado, error: errorConteo } = await supabase
      .from('crime_records').select('id_identidad', { count: 'exact', head: true }).eq('dataset', dataset);
    if (errorConteo) throw new Error(errorConteo.message);
    const porId = new Map<string, CrimeRecord>();
    let filasRecibidas = 0;
    let desde = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('crime_records')
        .select('id_identidad, datos')
        .eq('dataset', dataset)
        .order('id_identidad', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA - 1);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const fila of data) porId.set((fila as any).id_identidad, filaADistancia((fila as any).datos));
      filasRecibidas += data.length;
      if (data.length < TAMANO_PAGINA) break;
      desde += TAMANO_PAGINA;
    }
    if (dataset === 'delictividad') ultimoConteoServidor = esperado ?? porId.size;
    if (esperado == null || porId.size === esperado) return Array.from(porId.values());
    console.warn(`[Backend central] Descarga incompleta (intento ${intento}): ${porId.size} de ${esperado} registros (${filasRecibidas} filas recibidas). Se repite.`);
    if (intento === 3) throw new Error(`La descarga quedó incompleta (${porId.size} de ${esperado} registros). Intenta «Sincronizar» de nuevo en un momento.`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
}

/** Filas que tenía el servidor en la última descarga completa (para validar la copia local). */
let ultimoConteoServidor: number | null = null;
export function conteoUltimaDescarga(): number | null {
  return ultimoConteoServidor;
}

/** Conteo exacto de filas en el servidor (petición liviana, sin datos). */
export async function contarRegistrosSupabase(url: string, anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<number | null> {
  if (esPiloto()) return null;
  const supabase = obtenerCliente(url, anonKey);
  const { count, error } = await supabase.from('crime_records').select('id_identidad', { count: 'exact', head: true }).eq('dataset', dataset);
  if (error) throw new Error(error.message);
  return count ?? null;
}

export async function consultarMetaSupabase(url: string, anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<RemoteMeta> {
  if (esPiloto()) {
    const j = await llamarFuentePiloto({ accion: 'meta' });
    return { ok: true, ultimaActualizacion: j.ultimaActualizacion ?? null, ultimoUsuario: null };
  }
  const supabase = obtenerCliente(url, anonKey);
  const { data, error } = await supabase
    .from('dataset_meta')
    .select('ultima_actualizacion, ultimo_usuario')
    .eq('dataset', dataset)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    ok: true,
    ultimaActualizacion: data?.ultima_actualizacion ?? null,
    ultimoUsuario: data?.ultimo_usuario ?? null,
  };
}

// La ESCRITURA no pasa por el cliente de Supabase del navegador — pasa por
// una función de Netlify (netlify/functions/subirRegistros.ts) que valida
// la clave de actualización y usa una llave secreta (service_role) que
// nunca se expone al público. Aquí solo se arma la llamada HTTP a esa
// función; se mantiene el mismo nombre/forma que subirCsvRemoto (en
// remoteApi.ts) para que DataContext.tsx casi no tenga que cambiar.
//
// Se manda en LOTES (no todos los registros en una sola petición) — con
// una carga inicial completa (miles de registros de una vez), una sola
// petición gigante se pasaría de los límites prácticos de tamaño/tiempo de
// una función de Netlify. En el uso normal del día a día (agregar solo los
// registros nuevos de una actualización) esto va a ser casi siempre un
// único lote de todas formas.
const TAMANO_LOTE_SUBIDA = 300;

export async function subirRegistrosSupabase(
  functionUrl: string,
  token: string,
  registros: CrimeRecord[],
  usuario: string,
  dataset?: DatasetRemoto,
  forzar?: boolean,
  aniosABorrar?: number[],
): Promise<RemotePushResult> {
  if (esPiloto()) throw new Error('Operación no autorizada para este perfil.');
  // Borrado por año — pedido en SU PROPIA llamada, antes de subir nada,
  // para el modo "reemplazar solo este año" (ver reemplazarAniosDelArchivo
  // en datasetOps.ts). Sin esto, un registro que ya no existe en el
  // archivo nuevo se quedaría guardado en el servidor para siempre — el
  // upsert de los lotes de abajo nunca borra nada por sí solo.
  if (aniosABorrar && aniosABorrar.length > 0) {
    const respBorrado = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, registros: [], usuario, dataset, aniosABorrar }),
    });
    const cuerpoBorrado = await respBorrado.json().catch(() => null);
    if (!respBorrado.ok || !cuerpoBorrado || !cuerpoBorrado.ok) {
      throw new Error((cuerpoBorrado && cuerpoBorrado.error) || `El backend respondió con error ${respBorrado.status} al borrar los años ${aniosABorrar.join(', ')}.`);
    }
  }
  if (registros.length === 0) {
    return { ok: true, mensaje: 'No había registros nuevos ni modificados para sincronizar.', fecha: new Date().toISOString() };
  }
  for (let i = 0; i < registros.length; i += TAMANO_LOTE_SUBIDA) {
    const lote = registros.slice(i, i + TAMANO_LOTE_SUBIDA);
    const esUltimoLote = i + TAMANO_LOTE_SUBIDA >= registros.length;
    const resp = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, registros: lote, usuario, dataset, forzar, esUltimoLote }),
    });
    const cuerpo = await resp.json().catch(() => null);
    if (!resp.ok || !cuerpo || !cuerpo.ok) {
      // Se corta apenas falla un lote — algunos lotes anteriores ya
      // pueden haber quedado guardados (el upsert por fila no es
      // "todo o nada" entre lotes), lo cual está bien: al reintentar,
      // esos mismos registros simplemente se vuelven a upsertear sin
      // duplicarse.
      throw new Error((cuerpo && cuerpo.error) || `El backend respondió con error ${resp.status}`);
    }
  }
  return { ok: true, mensaje: `El dashboard central fue actualizado correctamente (${registros.length} registro(s)).`, fecha: new Date().toISOString() };
}

/**
 * Borra registros del servidor central — por años completos (aniosABorrar)
 * o por identidad (idsABorrar, enviados en tandas de 2.000 para no armar
 * solicitudes enormes). Lo usa "Eliminar información".
 */
export async function borrarRegistrosSupabase(
  functionUrl: string,
  token: string,
  usuario: string,
  criterio: { aniosABorrar?: number[]; idsABorrar?: string[] },
  dataset: DatasetRemoto = 'delictividad',
): Promise<void> {
  if (esPiloto()) throw new Error('Operación no autorizada para este perfil.');
  const enviar = async (cuerpo: Record<string, unknown>) => {
    const resp = await fetch(functionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, usuario, dataset, registros: [], ...cuerpo }) });
    const r = await resp.json().catch(() => null);
    if (!resp.ok || !r || !r.ok) throw new Error((r && r.error) || `El backend respondió con error ${resp.status} al eliminar.`);
  };
  if (criterio.aniosABorrar && criterio.aniosABorrar.length > 0) await enviar({ aniosABorrar: criterio.aniosABorrar });
  const ids = criterio.idsABorrar ?? [];
  for (let i = 0; i < ids.length; i += 2000) await enviar({ idsABorrar: ids.slice(i, i + 2000) });
}
