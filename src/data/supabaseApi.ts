import type { CrimeRecord } from '../types/crime';
import type { DatasetRemoto, RemoteMeta, RemotePushResult } from './remoteApi';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { tokenSesionActual } from '../cuentas/apiCuentas';
import { recortarCoordenadasPiloto, registroEnPopayan } from '../utils/territorioPiloto';
import { restriccionPopayanActiva } from '../utils/restriccionTerritorial';

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
async function descargarPorLlave<T>(dataset: string, campo: 'registros' | 'filas', total: number | null, progreso: boolean): Promise<T[]> {
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
        const cuerpo: Record<string, unknown> = { accion: 'registros', dataset, desdeClave, hastaClave, despuesDe };
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

/** Dataset completo como filas {id_identidad, datos} (administrador e interno). */
export async function leerDatasetCompleto(dataset: string): Promise<{ id_identidad: string; datos: any }[]> {
  return descargarPorLlave<{ id_identidad: string; datos: any }>(dataset, 'filas', null, false);
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
  // Administrador e interno: registros completos, verificados contra el
  // CONTEO EXACTO del servidor (si alguien sube información justo en medio,
  // se repite).
  for (let intento = 1; intento <= 3; intento++) {
    const { total } = await conReintentos(() => llamarDatos({ accion: 'conteo', dataset })) as { total: number };
    const esperado = Number(total) || 0;
    const filas = await descargarPorLlave<{ id_identidad: string; datos: any }>(dataset, 'filas', dataset === 'delictividad' ? esperado : null, dataset === 'delictividad');
    const porId = new Map<string, CrimeRecord>();
    for (const f of filas) porId.set(f.id_identidad, filaADistancia(f.datos));
    if (dataset === 'delictividad') ultimoConteoServidor = esperado;
    if (porId.size === esperado) return Array.from(porId.values());
    console.warn(`[Backend central] Descarga incompleta (intento ${intento}): ${porId.size} de ${esperado} registros. Se repite.`);
    if (intento === 3) throw new Error(`La descarga quedó incompleta (${porId.size} de ${esperado} registros). Intenta «Sincronizar» de nuevo en un momento.`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return [];
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
