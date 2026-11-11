import type { CrimeRecord } from '../types/crime';
import type { DatasetRemoto, RemoteMeta, RemotePushResult } from './remoteApi';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { tokenSesionActual } from '../cuentas/apiCuentas';
import { recortarCoordenadasPiloto, registroEnPopayan } from '../utils/territorioPiloto';
import { restriccionPopayanActiva } from '../utils/restriccionTerritorial';
import { getDb, STORE_RECORDS } from './db';
import { rawDashboard } from './clavesIdentidad';

// ── LECTURA: siempre por el servidor, nunca directo a la base ──────────────
// La base ya no tiene lectura pública. Todas las lecturas (delitos, RNMC,
// IRISP1, MACRI, capas, Plan Candado) pasan por netlify/functions/
// datosConsulta, con el token de la cuenta que ingresó (administrador,
// interno o piloto); el SERVIDOR decide qué puede leer cada una.
const FUNCION_DATOS = '/.netlify/functions/datosConsulta';
const esPiloto = () => obtenerModoAcceso() === 'piloto';

export async function llamarDatos(cuerpo: Record<string, unknown>): Promise<any> {
  const token = tokenSesionActual();
  if (!token) throw new Error('Sesión no válida.');
  const r = await fetch(FUNCION_DATOS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, token }) });
  const texto = await r.text().catch(() => '');
  let j: any = null;
  try { j = JSON.parse(texto); } catch { /* respuesta no JSON (p. ej. función no publicada o respuesta demasiado grande) */ }
  // Enlace suspendido temporalmente: la puerta muestra la pantalla de servicio no disponible.
  if (j && j.motivo === 'suspendido') {
    try { window.dispatchEvent(new CustomEvent('mepoy-suspendido')); } catch { /* sin ventana */ }
  }
  if (!r.ok || !j || !j.ok) {
    // Diagnóstico en la consola (F12): estado HTTP y motivo, sin datos sensibles.
    console.error(`[Datos] ${String(cuerpo.accion)} ${String(cuerpo.dataset ?? '')} → HTTP ${r.status}`, j ? (j.motivo || j.detalle || j.error) : texto.slice(0, 200));
    throw new Error((j && j.error) || `Consulta no disponible (${r.status}).`);
  }
  return j;
}
/** Compatibilidad: así lo llama la sincronización de capas del piloto. */
export const llamarFuentePiloto = llamarDatos;

/** Progreso de la descarga (0–100) para la pantalla de carga. */
function avisarProgreso(pct: number) {
  try { window.dispatchEvent(new CustomEvent('mepoy-progreso-carga', { detail: Math.max(0, Math.min(100, Math.round(pct))) })); } catch { /* sin ventana */ }
}

async function conReintentos<T>(fn: () => Promise<T>, intentos = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); } catch (e) {
      ultimo = e;
      if (/Sesión no válida|no autorizada/.test(String((e as Error)?.message))) break;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw ultimo;
}

// Descarga por LLAVE (keyset): el rango de llaves (id_identidad) se reparte
// en VENTANAS que se piden en PARALELO (4 a la vez), cada consulta igual de
// rápida sin importar cuántos registros haya, y con reintentos. Las llaves
// de delitos son "R<número>-<largo>", así que se parte por el primer dígito;
// la primera y la última ventana quedan abiertas para cubrir cualquier otra
// forma de llave (RNMC, IRISP1, MACRI…).
const PARALELAS = 4;
const CORTES_LLAVE = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'S'];
async function descargarPorLlave<T>(dataset: string, campo: 'registros' | 'filas', total: number | null, progreso: boolean, extra: Record<string, unknown> = {}): Promise<T[]> {
  const ventanas: [string | null, string | null][] = [[null, CORTES_LLAVE[0]]];
  for (let i = 0; i < CORTES_LLAVE.length - 1; i++) ventanas.push([CORTES_LLAVE[i], CORTES_LLAVE[i + 1]]);
  ventanas.push([CORTES_LLAVE[CORTES_LLAVE.length - 1], null]);
  const porVentana: T[][] = new Array(ventanas.length);
  let recibidos = 0;
  let siguienteIndice = 0;
  async function trabajador() {
    while (siguienteIndice < ventanas.length) {
      const i = siguienteIndice++;
      const [desdeClave, hastaClave] = ventanas[i];
      const lote: T[] = [];
      let despuesDe: string | null = null;
      for (let vuelta = 0; vuelta < 5000; vuelta++) {
        const cuerpo: Record<string, unknown> = { accion: 'registros', dataset, desdeClave, hastaClave, despuesDe, ...extra };
        const j = await conReintentos(() => llamarDatos(cuerpo)) as Record<string, unknown> & { siguiente: string | null };
        const items = (j[campo] as T[]) || [];
        lote.push(...items);
        recibidos += items.length;
        if (progreso && total) avisarProgreso(Math.min(99, (recibidos / total) * 100));
        if (!j.siguiente) break;
        despuesDe = j.siguiente;
      }
      porVentana[i] = lote;
    }
  }
  if (progreso) avisarProgreso(0);
  await Promise.all(Array.from({ length: PARALELAS }, trabajador));
  if (progreso) avisarProgreso(100);
  return porVentana.flat();
}

// ── Copia local SINCRONIZADA (administrador e interno) ─────────────────────
// Para gastar menos tráfico de Supabase (egress): en vez de bajar el dataset
// COMPLETO cada vez, se guarda una copia en este navegador y solo se piden
// las diferencias:
//   1. Fecha de actualización + conteo iguales a los de la copia → no se baja nada.
//   2. Si cambió: solo las filas modificadas desde la última vez («cambios»,
//      con 10 minutos de margen), y si el conteo no cuadra, solo las LLAVES
//      para quitar las que se borraron en el servidor.
//   3. Si algo no cuadra al final (o no hay copia) → descarga completa, como antes.
// La copia nunca se usa si su conteo no coincide EXACTO con el del servidor.
// Se borra al cerrar sesión (ver borrarCopiasConsulta).
type Fila = { id_identidad: string; datos: any };
interface CopiaSinc { v: 1; filas: [string, any][]; sello: string | null; conteo: number; marca: string | null }
const claveSinc = (dataset: string) => `sinc:${obtenerModoAcceso()}:${dataset}`;
const MARGEN_CAMBIOS_MS = 10 * 60 * 1000;

async function leerCopiaSinc(dataset: string): Promise<CopiaSinc | null> {
  try {
    const c = (await (await getDb()).get(STORE_RECORDS, claveSinc(dataset))) as CopiaSinc | undefined;
    return c && c.v === 1 && Array.isArray(c.filas) ? c : null;
  } catch { return null; }
}
async function guardarCopiaSinc(dataset: string, copia: CopiaSinc) {
  try { await (await getDb()).put(STORE_RECORDS, copia, claveSinc(dataset)); } catch { /* sin espacio: la próxima vez se descarga */ }
}
async function llavesServidor(dataset: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let despuesDe: string | null = null;
  for (let vuelta = 0; vuelta < 2000; vuelta++) {
    const j = await conReintentos(() => llamarDatos({ accion: 'ids', dataset, despuesDe })) as { ids: string[]; siguiente: string | null };
    for (const id of j.ids || []) ids.add(id);
    if (!j.siguiente) break;
    despuesDe = j.siguiente;
  }
  return ids;
}
const aFilas = (pares: [string, any][]): Fila[] => pares.map(([id_identidad, datos]) => ({ id_identidad, datos }));

/** Último resultado de la sincronización (para la consola: F12 → «[Copia local]»). */
function informar(dataset: string, modo: string, bajadas: number, total: number) {
  console.info(`[Copia local] ${dataset}: ${modo} — ${bajadas.toLocaleString('es-CO')} fila(s) descargada(s) de ${total.toLocaleString('es-CO')}.`);
}

export async function leerDatasetSincronizado(dataset: string, progreso = false): Promise<Fila[]> {
  const [metaJ, conteoJ] = await Promise.all([
    conReintentos(() => llamarDatos({ accion: 'meta', dataset })),
    conReintentos(() => llamarDatos({ accion: 'conteo', dataset })),
  ]);
  const sello: string | null = metaJ.ultimaActualizacion ?? null;
  let conteo = Number(conteoJ.total) || 0;
  const copia = await leerCopiaSinc(dataset);

  // 1. Nada cambió.
  if (copia && copia.sello === sello && copia.conteo === conteo && copia.filas.length === conteo) {
    informar(dataset, 'sin cambios', 0, conteo);
    return aFilas(copia.filas);
  }
  // 2. Solo las diferencias.
  if (copia && copia.marca && conteo > 0) {
    try {
      const { marca } = await conReintentos(() => llamarDatos({ accion: 'marca', dataset })) as { marca: string | null };
      const desdeMarca = new Date(Date.parse(copia.marca) - MARGEN_CAMBIOS_MS).toISOString();
      const cambios = await descargarPorLlave<Fila>(dataset, 'filas', null, false, { accion: 'cambios', desdeMarca });
      const mapa = new Map<string, any>(copia.filas);
      for (const f of cambios) mapa.set(f.id_identidad, f.datos);
      let llaves = 0;
      if (mapa.size !== conteo) {
        const enServidor = await llavesServidor(dataset);
        llaves = enServidor.size;
        for (const k of [...mapa.keys()]) if (!enServidor.has(k)) mapa.delete(k);
      }
      if (mapa.size === conteo) {
        const filas = [...mapa.entries()];
        await guardarCopiaSinc(dataset, { v: 1, filas, sello, conteo, marca: marca ?? copia.marca });
        informar(dataset, llaves ? `solo cambios (+ ${llaves.toLocaleString('es-CO')} llaves para detectar borrados)` : 'solo cambios', cambios.length, conteo);
        return aFilas(filas);
      }
      console.warn(`[Copia local] ${dataset}: la copia no cuadró (${mapa.size} de ${conteo}); se descarga completa.`);
    } catch (e) {
      console.warn(`[Copia local] ${dataset}: no se pudo actualizar por diferencias; se descarga completa.`, e);
    }
  }
  // 3. Completa (con la marca tomada ANTES de empezar, para no perder lo que cambie durante la descarga).
  for (let intento = 1; intento <= 3; intento++) {
    const { marca } = await conReintentos(() => llamarDatos({ accion: 'marca', dataset })).catch(() => ({ marca: null })) as { marca: string | null };
    const filas = await descargarPorLlave<Fila>(dataset, 'filas', progreso ? conteo : null, progreso);
    const mapa = new Map<string, any>(filas.map((f) => [f.id_identidad, f.datos]));
    if (mapa.size === conteo) {
      const pares = [...mapa.entries()];
      await guardarCopiaSinc(dataset, { v: 1, filas: pares, sello, conteo, marca });
      informar(dataset, 'descarga completa', pares.length, conteo);
      return aFilas(pares);
    }
    console.warn(`[Backend central] Descarga incompleta de ${dataset} (intento ${intento}): ${mapa.size} de ${conteo} registros. Se repite.`);
    if (intento === 3) throw new Error(`La descarga quedó incompleta (${mapa.size} de ${conteo} registros). Intenta «Sincronizar» de nuevo en un momento.`);
    await new Promise((r) => setTimeout(r, 1500));
    conteo = Number((await conReintentos(() => llamarDatos({ accion: 'conteo', dataset }))).total) || 0;
  }
  return [];
}

/** Dataset completo como filas {id_identidad, datos} (administrador e interno), vía la copia sincronizada. */
export async function leerDatasetCompleto(dataset: string): Promise<{ id_identidad: string; datos: any }[]> {
  return leerDatasetSincronizado(dataset);
}

/** Filas puntuales: por sufijo de la llave (p. ej. "#meta") o por lista de llaves. */
export async function leerFilasDataset(dataset: string, filtro: { sufijo?: string; ids?: string[] } = {}): Promise<{ id_identidad: string; datos: any }[]> {
  if (filtro.ids) {
    const salida: { id_identidad: string; datos: any }[] = [];
    for (let i = 0; i < filtro.ids.length; i += 200) {
      const j = await conReintentos(() => llamarDatos({ accion: 'filas', dataset, ids: filtro.ids!.slice(i, i + 200) }));
      salida.push(...(j.filas || []));
    }
    return salida;
  }
  const j = await conReintentos(() => llamarDatos({ accion: 'filas', dataset, sufijo: filtro.sufijo }));
  return j.filas || [];
}

// Cada fila trae el registro COMPLETO en "datos" (ver supabase/schema.sql);
// se reconstruye el CrimeRecord con la fecha como objeto Date.
function filaADistancia(datos: any): CrimeRecord {
  return {
    ...datos,
    fecha: datos.fecha ? new Date(datos.fecha) : null,
  } as CrimeRecord;
}

/** Filas que tenía el servidor en la última descarga completa (para validar la copia local). */
let ultimoConteoServidor: number | null = null;
export function conteoUltimaDescarga(): number | null {
  return ultimoConteoServidor;
}

// "url" y "anonKey" ya no se usan para leer (se conservan en la firma para
// no cambiar a quienes llaman); la lectura va por el servidor.
export async function descargarRegistrosSupabase(_url: string, _anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<CrimeRecord[]> {
  if (esPiloto()) {
    // Piloto: registros livianos; si su territorio es solo Popayán, el
    // servidor ya los recorta y aquí se vuelve a filtrar (segunda barrera).
    if (dataset !== 'delictividad') return [];
    const restringir = restriccionPopayanActiva();
    const { total } = await conReintentos(() => llamarDatos({ accion: 'conteo', dataset })) as { total: number };
    ultimoConteoServidor = Number(total) || 0;
    const items = await descargarPorLlave<any>(dataset, 'registros', ultimoConteoServidor, true);
    return items.flatMap((d) => (!restringir ? [filaADistancia(d)] : registroEnPopayan(d) ? [filaADistancia(recortarCoordenadasPiloto(d))] : []));
  }
  // Administrador e interno: copia sincronizada (solo las diferencias),
  // siempre verificada contra el CONTEO EXACTO del servidor.
  const filas = await leerDatasetSincronizado(dataset, dataset === 'delictividad');
  if (dataset === 'delictividad') ultimoConteoServidor = filas.length;
  return filas.map((f) => filaADistancia(f.datos));
}

/** Conteo exacto de filas en el servidor (petición liviana, sin datos). */
export async function contarRegistrosSupabase(_url: string, _anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<number | null> {
  const j = await llamarDatos({ accion: 'conteo', dataset });
  return Number(j.total) || 0;
}

export async function consultarMetaSupabase(_url: string, _anonKey: string, dataset: DatasetRemoto = 'delictividad'): Promise<RemoteMeta> {
  const j = await llamarDatos({ accion: 'meta', dataset });
  return { ok: true, ultimaActualizacion: j.ultimaActualizacion ?? null, ultimoUsuario: j.ultimoUsuario ?? null };
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

// ── Subida por diferencias ──────────────────────────────────────────────
// Antes, «reemplazar el año» borraba TODO el año en el servidor y lo volvía
// a subir completo. Cada registro quedaba con fecha de cambio nueva y TODOS
// los navegadores tenían que descargar el año entero otra vez (minutos de
// «cargando información» y mucho consumo de Supabase). Ahora solo se suben
// los registros nuevos o que cambiaron, y se borran solo los que ya no
// vienen en el archivo. El resultado en el servidor es el mismo.
const ordenarClaves = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(ordenarClaves);
  if (v && typeof v === 'object') {
    const salida: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) salida[k] = ordenarClaves((v as Record<string, unknown>)[k]);
    return salida;
  }
  return v;
};
/** Huella del contenido del registro (sin OBJECTID: el origen lo renumera en cada exportación y no está en las columnas que viajan). */
function huellaRegistro(r: unknown): string {
  const plano = JSON.parse(JSON.stringify(r)) as Record<string, any>;
  // Solo las columnas originales que viajan del servidor (las demás ya
  // están procesadas en los campos del registro); así una copia reducida y
  // un archivo completo con el mismo contenido dan la misma huella.
  if (plano.raw && typeof plano.raw === 'object') plano.raw = rawDashboard(plano.raw);
  return JSON.stringify(ordenarClaves(plano));
}

export async function planSubidaPorDiferencias(
  nuevos: CrimeRecord[],
  anios: number[],
  dataset: DatasetRemoto = 'delictividad',
): Promise<{ subir: CrimeRecord[]; borrarIds: string[] } | null> {
  if (esPiloto()) return null;
  // Referencia: la copia sincronizada (espejo exacto de lo que hay en el
  // servidor). Debe coincidir llave por llave con el servidor; si no, se usa
  // el reemplazo completo de siempre (más lento, pero seguro).
  const copia = await leerCopiaSinc(dataset);
  if (!copia || copia.filas.length === 0) return null;
  const enServidor = await llavesServidor(dataset);
  const previos = new Map<string, any>(copia.filas);
  if (enServidor.size !== previos.size) return null;
  for (const id of enServidor) if (!previos.has(id)) return null;

  const enAnios = (anio: unknown) => typeof anio === 'number' && anios.includes(anio);
  const nuevosAnio = nuevos.filter((r) => enAnios(r.anio));
  const idsNuevos = new Set(nuevosAnio.map((r) => r.__id));
  const subir = nuevosAnio.filter((r) => {
    const antes = previos.get(r.__id);
    return !antes || huellaRegistro(antes) !== huellaRegistro(r);
  });
  const borrarIds: string[] = [];
  for (const [id, datos] of previos) if (enAnios(datos?.anio) && !idsNuevos.has(id)) borrarIds.push(id);
  return { subir, borrarIds };
}
