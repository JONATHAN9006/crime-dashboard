import { getDb, STORE_IRISP } from './db';
import type { RegistroIrisp } from './irispParser';
import { obtenerCliente } from './supabaseApi';
import type { RemotePushResult } from './remoteApi';

// Mismo esquema que RNMC: caché local en IndexedDB + copia compartida en
// Supabase (tabla crime_records, dataset 'irisp1', identidad = Codigo).
//
// Diferencia importante con RNMC: la matriz IRISP1 es una FOTO del estado
// actual de cada información (el Estado y la Existencia cambian con el
// tiempo), y cada descarga del aplicativo trae el año COMPLETO. Por eso al
// cargar un archivo se reemplazan por completo los años que trae — así una
// información que el aplicativo corrigió o anuló no se queda "pegada" con
// su estado viejo — y se conservan los demás años ya cargados.

const CAMPOS_FECHA: (keyof RegistroIrisp)[] = [
  'fecha', 'fechaAsignacionVerificacion', 'fechaRespuestaVerificacion',
  'fechaAsignacionInvestigacion', 'fechaRespuestaInvestigacion', 'fechaCorte',
];

function revivirFechas(datos: any): RegistroIrisp {
  const r = { ...datos };
  for (const c of CAMPOS_FECHA) r[c] = r[c] ? new Date(r[c]) : null;
  // "fecha" viaja recortada a AAAA-MM-DD (para la columna indexada), y
  // new Date('2026-08-25') se interpreta como medianoche UTC — en Colombia
  // eso cae el día ANTERIOR a las 7 p. m. La hora real va en fechaCompleta.
  if (datos.fechaCompleta) r.fecha = new Date(datos.fechaCompleta);
  delete r.fechaCompleta;
  return r as RegistroIrisp;
}

export async function guardarIrispLocal(registros: RegistroIrisp[]) {
  const db = await getDb();
  await db.put(STORE_IRISP, { registros, fecha: new Date().toISOString() }, 'informaciones');
}

export async function cargarIrispLocal(): Promise<{ registros: RegistroIrisp[]; fecha: string } | null> {
  const db = await getDb();
  const datos = await db.get(STORE_IRISP, 'informaciones');
  if (!datos?.registros) return null;
  return { registros: datos.registros, fecha: datos.fecha };
}

/** Une lo ya cargado con el archivo nuevo, reemplazando completos los años que trae el archivo. */
export function combinarPorAnio(existentes: RegistroIrisp[], nuevos: RegistroIrisp[]): { combinados: RegistroIrisp[]; aniosReemplazados: number[] } {
  const anios = Array.from(new Set(nuevos.map((r) => r.anio).filter((a): a is number => a != null))).sort();
  const conservados = existentes.filter((r) => r.anio == null || !anios.includes(r.anio));
  return { combinados: [...conservados, ...nuevos], aniosReemplazados: anios };
}

const TAMANO_PAGINA = 1000;
const TAMANO_LOTE_SUBIDA = 500;

export async function descargarIrispSupabase(url: string, anonKey: string): Promise<RegistroIrisp[]> {
  const supabase = obtenerCliente(url, anonKey);
  const registros: RegistroIrisp[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', 'irisp1').range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const fila of data) registros.push(revivirFechas((fila as any).datos));
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return registros;
}

export async function subirIrispSupabase(functionUrl: string, token: string, registros: RegistroIrisp[], aniosABorrar: number[], usuario: string): Promise<RemotePushResult> {
  async function enviar(cuerpo: Record<string, unknown>): Promise<RemotePushResult> {
    const resp = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, usuario, dataset: 'irisp1', ...cuerpo }),
    });
    const respuesta = await resp.json().catch(() => null);
    if (!resp.ok || !respuesta || !respuesta.ok) {
      throw new Error((respuesta && respuesta.error) || `El backend respondió con error ${resp.status} al subir el IRISP1.`);
    }
    return respuesta;
  }

  // 1) Borrar en el servidor los años que trae el archivo (llamada aparte,
  //    sin registros — mismo mecanismo que "reemplazar año" de Delictividad).
  if (aniosABorrar.length > 0) await enviar({ registros: [], aniosABorrar });

  // 2) Subir por lotes. "fecha" se manda como AAAA-MM-DD para la columna
  //    indexada; el objeto completo (con todas sus fechas ISO) va en "datos".
  let ultimo: RemotePushResult = { ok: true, mensaje: 'No había informaciones para sincronizar.', fecha: new Date().toISOString() };
  for (let i = 0; i < registros.length; i += TAMANO_LOTE_SUBIDA) {
    const lote = registros.slice(i, i + TAMANO_LOTE_SUBIDA).map((r) => ({
      ...r,
      fecha: r.fecha ? r.fecha.toISOString().slice(0, 10) : null,
      fechaCompleta: r.fecha ? r.fecha.toISOString() : null,
    }));
    ultimo = await enviar({ registros: lote, esUltimoLote: i + TAMANO_LOTE_SUBIDA >= registros.length });
  }
  return ultimo;
}
