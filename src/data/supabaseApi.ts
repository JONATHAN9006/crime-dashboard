import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CrimeRecord } from '../types/crime';
import type { DatasetRemoto, RemoteMeta, RemotePushResult } from './remoteApi';

// Un solo cliente reutilizado — createClient no es caro, pero no hay
// necesidad de crear uno nuevo en cada llamada.
let clienteCache: { url: string; anonKey: string; cliente: SupabaseClient } | null = null;
function obtenerCliente(url: string, anonKey: string): SupabaseClient {
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
  const supabase = obtenerCliente(url, anonKey);
  const registros: CrimeRecord[] = [];
  let desde = 0;
  // Se pide página por página (en vez de todo de una) porque PostgREST
  // (la API que genera Supabase) nunca entrega más de 1000 filas por
  // pedido, sin importar qué límite se pida — es el mismo espíritu que
  // el "por pedazos" que ya se usaba con Apps Script, pero manejado por
  // la librería en vez de código propio contando caracteres a mano.
  for (;;) {
    const { data, error } = await supabase
      .from('crime_records')
      .select('datos')
      .eq('dataset', dataset)
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const fila of data) registros.push(filaADistancia((fila as any).datos));
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return registros;
}

export async function consultarMetaSupabase(url: string, anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<RemoteMeta> {
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
): Promise<RemotePushResult> {
  if (registros.length === 0) {
    return { ok: true, mensaje: 'No había registros nuevos ni modificados para sincronizar.', fecha: new Date().toISOString() };
  }
  for (let i = 0; i < registros.length; i += TAMANO_LOTE_SUBIDA) {
    const lote = registros.slice(i, i + TAMANO_LOTE_SUBIDA);
    const resp = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, registros: lote, usuario, dataset, forzar }),
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
