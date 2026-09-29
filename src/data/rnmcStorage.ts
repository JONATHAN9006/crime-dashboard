import { getDb, STORE_RNMC } from './db';
import type { RegistroComparendo } from './rnmcParser';
import { obtenerCliente } from './supabaseApi';
import type { RemotePushResult } from './remoteApi';

// Guardado LOCAL (en este navegador) — sigue existiendo como caché rápida
// para no tener que volver a descargar todo del servidor en cada visita;
// la copia de verdad, compartida entre todas las personas, vive en
// Supabase (ver las funciones de abajo), igual que Delictividad.
export async function guardarComparendos(registros: RegistroComparendo[]) {
  const db = await getDb();
  await db.put(STORE_RNMC, { registros, fecha: new Date().toISOString() }, 'comparendos');
}

export async function cargarComparendos(): Promise<{ registros: RegistroComparendo[]; fecha: string } | null> {
  const db = await getDb();
  const datos = await db.get(STORE_RNMC, 'comparendos');
  if (!datos?.registros) return null;
  return { registros: datos.registros, fecha: datos.fecha };
}

// ---------------------------------------------------------------------------
// Servidor central (Supabase) — reutiliza LA MISMA tabla "crime_records" que
// ya usa Delictividad (ver supabase/schema.sql: "dataset" es un texto
// libre, así que "rnmc" es un valor tan válido ahí como "delictividad" —
// no hace falta una tabla nueva) y la MISMA función de Netlify para
// escribir. La identidad (__id) es el número de EXPEDIENTE de cada
// comparendo — confirmado único en las 6.619 filas del archivo real, así
// que a diferencia de Delictividad no hace falta ningún hash: es un
// identificador real que el propio sistema de origen ya garantiza único.
// ---------------------------------------------------------------------------

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE_SUBIDA = 500;

function filaComparendoADistancia(datos: any): RegistroComparendo {
  return { ...datos, fecha: datos.fecha ? new Date(datos.fecha) : null } as RegistroComparendo;
}

export async function descargarComparendosSupabase(url: string, anonKey: string): Promise<RegistroComparendo[]> {
  const supabase = obtenerCliente(url, anonKey);
  const registros: RegistroComparendo[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', 'rnmc').range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const fila of data) registros.push(filaComparendoADistancia((fila as any).datos));
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return registros;
}

export async function subirComparendosSupabase(functionUrl: string, token: string, registros: (RegistroComparendo & { __id: string })[], usuario: string): Promise<RemotePushResult> {
  if (registros.length === 0) return { ok: true, mensaje: 'No había comparendos para sincronizar.', fecha: new Date().toISOString() };
  let ultimoResultado: RemotePushResult = { ok: true, mensaje: '', fecha: new Date().toISOString() };
  for (let i = 0; i < registros.length; i += TAMANO_LOTE_SUBIDA) {
    const lote = registros.slice(i, i + TAMANO_LOTE_SUBIDA).map((r) => ({
      ...r,
      fecha: r.fecha ? r.fecha.toISOString().slice(0, 10) : null,
    }));
    const resp = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, registros: lote, usuario, dataset: 'rnmc', esUltimoLote: i + TAMANO_LOTE_SUBIDA >= registros.length }),
    });
    const cuerpo = await resp.json().catch(() => null);
    if (!resp.ok || !cuerpo || !cuerpo.ok) {
      throw new Error((cuerpo && cuerpo.error) || `El backend respondió con error ${resp.status} al subir los comparendos.`);
    }
    ultimoResultado = cuerpo;
  }
  return ultimoResultado;
}
