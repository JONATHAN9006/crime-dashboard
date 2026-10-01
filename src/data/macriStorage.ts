import { getDb, STORE_MACRI } from './db';
import type { ObjetivoMacri } from './macriParser';
import { obtenerCliente } from './supabaseApi';

// Dos datasets separados en la MISMA tabla crime_records de Supabase:
//
//  · 'macri'             → la matriz tal cual se cargó (se reemplaza COMPLETA
//                          en cada carga: es una foto de los objetivos vigentes).
//  · 'macri_seguimiento' → lo que se diligencia a mano en el dashboard (Se
//                          cumple SI/NO, Prórroga, Aporte en casos, Zona). NUNCA
//                          se borra al cargar una matriz nueva: se cruza por la
//                          clave del objetivo (nombre normalizado), así lo que
//                          ya se diligenció sigue ahí aunque se suba otra matriz.

export interface SeguimientoMacri {
  __id: string; // misma clave del objetivo
  seCumple: 'SI' | 'NO' | null;
  prorroga: boolean;
  aporte: string;
  zonaTexto: string | null; // null = usar la zona que trae la matriz
  observacion: string;
  actualizadoEn: string;
  actualizadoPor: string;
}

export interface ResumenCarga {
  fecha: string;
  archivo: string;
  total: number;
  nuevos: string[];
  retirados: string[];
  cambiosEstado: { nombre: string; de: string; a: string }[];
  cambiosFecha: { nombre: string; de: string; a: string }[];
}

const ID_RESUMEN = '__resumen_carga__';

// ── Local (IndexedDB) ─────────────────────────────────────────────────────

export async function guardarMacriLocal(datos: { objetivos: ObjetivoMacri[]; seguimiento: Record<string, SeguimientoMacri>; resumen: ResumenCarga | null }) {
  const db = await getDb();
  await db.put(STORE_MACRI, { ...datos, fecha: new Date().toISOString() }, 'macri');
}

export async function cargarMacriLocal(): Promise<{ objetivos: ObjetivoMacri[]; seguimiento: Record<string, SeguimientoMacri>; resumen: ResumenCarga | null } | null> {
  const db = await getDb();
  const d = await db.get(STORE_MACRI, 'macri');
  if (!d?.objetivos) return null;
  return { objetivos: d.objetivos, seguimiento: d.seguimiento ?? {}, resumen: d.resumen ?? null };
}

// ── Comparación entre cargas ─────────────────────────────────────────────

function fechaTexto(d: Date | null): string {
  return d ? d.toLocaleDateString('es-CO') : 'sin fecha';
}

export function compararCargas(anteriores: ObjetivoMacri[], nuevos: ObjetivoMacri[], archivo: string): ResumenCarga {
  const previo = new Map(anteriores.map((o) => [o.__id, o]));
  const actual = new Map(nuevos.map((o) => [o.__id, o]));
  const resumen: ResumenCarga = { fecha: new Date().toISOString(), archivo, total: nuevos.length, nuevos: [], retirados: [], cambiosEstado: [], cambiosFecha: [] };
  for (const o of nuevos) {
    const p = previo.get(o.__id);
    if (!p) { resumen.nuevos.push(o.nombreObjetivo); continue; }
    if (p.estadoActual !== o.estadoActual) resumen.cambiosEstado.push({ nombre: o.nombreObjetivo, de: p.estadoActual, a: o.estadoActual });
    if (fechaTexto(p.fechaFinal) !== fechaTexto(o.fechaFinal)) resumen.cambiosFecha.push({ nombre: o.nombreObjetivo, de: fechaTexto(p.fechaFinal), a: fechaTexto(o.fechaFinal) });
  }
  for (const p of anteriores) if (!actual.has(p.__id)) resumen.retirados.push(p.nombreObjetivo);
  // Primera carga: no hay contra qué comparar — no se listan todos como "nuevos".
  if (anteriores.length === 0) resumen.nuevos = [];
  return resumen;
}

// ── Servidor (Supabase) ──────────────────────────────────────────────────

function revivirObjetivo(d: any): ObjetivoMacri {
  return { ...d, fechaFinal: d.fechaFinalLocal ? new Date(d.fechaFinalLocal) : null } as ObjetivoMacri;
}

async function descargarDataset(url: string, anonKey: string, dataset: string): Promise<any[]> {
  const supabase = obtenerCliente(url, anonKey);
  const filas: any[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', dataset).range(desde, desde + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const f of data) filas.push((f as any).datos);
    if (data.length < 1000) break;
  }
  return filas;
}

export async function descargarMacriSupabase(url: string, anonKey: string) {
  const [crudos, seguimientoCrudo] = await Promise.all([descargarDataset(url, anonKey, 'macri'), descargarDataset(url, anonKey, 'macri_seguimiento')]);
  const resumenFila = crudos.find((d) => d.__id === ID_RESUMEN);
  const objetivos = crudos.filter((d) => d.__id !== ID_RESUMEN).map(revivirObjetivo);
  const seguimiento: Record<string, SeguimientoMacri> = {};
  for (const s of seguimientoCrudo) seguimiento[s.__id] = s;
  return { objetivos, seguimiento, resumen: (resumenFila?.resumen as ResumenCarga) ?? null };
}

async function enviar(functionUrl: string, cuerpo: Record<string, unknown>) {
  const resp = await fetch(functionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const r = await resp.json().catch(() => null);
  if (!resp.ok || !r || !r.ok) throw new Error((r && r.error) || `El backend respondió con error ${resp.status}.`);
  return r;
}

export async function subirMacriSupabase(functionUrl: string, token: string, objetivos: ObjetivoMacri[], resumen: ResumenCarga, usuario: string) {
  // 1) Borrar la matriz anterior completa, 2) subir la nueva + el resumen de cambios.
  await enviar(functionUrl, { token, usuario, dataset: 'macri', registros: [], reemplazarTodo: true });
  const registros = [
    ...objetivos.map((o) => ({
      ...o,
      // "fecha" va recortada para la columna indexada; la fecha real (local,
      // sin desfase de zona horaria) viaja aparte en fechaFinalLocal.
      fecha: o.fechaFinal ? `${o.fechaFinal.getFullYear()}-${String(o.fechaFinal.getMonth() + 1).padStart(2, '0')}-${String(o.fechaFinal.getDate()).padStart(2, '0')}` : null,
      fechaFinalLocal: o.fechaFinal ? o.fechaFinal.toISOString() : null,
      anio: o.fechaFinal ? o.fechaFinal.getFullYear() : null,
      delito: o.delitoPrincipal,
    })),
    { __id: ID_RESUMEN, resumen },
  ];
  return enviar(functionUrl, { token, usuario, dataset: 'macri', registros, esUltimoLote: true });
}

export async function subirSeguimientoSupabase(functionUrl: string, token: string, cambios: SeguimientoMacri[], usuario: string) {
  if (cambios.length === 0) return;
  return enviar(functionUrl, { token, usuario, dataset: 'macri_seguimiento', registros: cambios, esUltimoLote: true });
}
