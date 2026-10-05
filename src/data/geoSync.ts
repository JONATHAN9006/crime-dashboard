import { obtenerConfig } from '../config';
import { obtenerCliente } from './supabaseApi';
import { cargarCapas, guardarCapas, type CapaGeografica } from './geoStorage';

// Capas geográficas (shapefile / GeoJSON) COMPARTIDAS entre equipos.
//
// Antes cada shapefile se guardaba solo en el navegador donde se cargó, así
// que los demás equipos (link interno o jefe) no lo veían. Ahora se guarda
// también en el servidor central, en la misma tabla crime_records, dataset
// 'capas_geo', partido en filas:
//   · `${id}#meta`  → nombre, campo de unión, dimensión, colorear por casos,
//                     número de partes y una "versión" (fecha de la última
//                     subida). Es liviana: cambiar el campo de unión solo
//                     reescribe esta fila.
//   · `${id}#p0…pN` → el GeoJSON en texto, en pedazos de ~2,5 millones de
//                     caracteres (la función de Netlify no acepta solicitudes
//                     de más de ~6 MB, y un shapefile de barrios puede pesar
//                     más que eso).
// Al abrir el dashboard en otro equipo se bajan SOLO las capas que ese
// equipo no tiene o que cambiaron (se compara la versión de #meta), no
// todos los GeoJSON cada vez.
//
// La visibilidad (mostrar/ocultar la capa) sigue siendo de cada equipo.

const DATASET = 'capas_geo';
const FUNCION = '/.netlify/functions/subirRegistros';
const TAMANO_PARTE = 2_500_000;

export interface MetaCapaCompartida {
  __id: string;
  capaId: string;
  nombre: string;
  campoUnion: string | null;
  dimension: CapaGeografica['dimension'];
  colorearPorCasos: boolean;
  partes: number;
  version: string;
  subidaPor: string;
}

function servidor() {
  const { backendUrl, supabaseAnonKey, updatePassword } = obtenerConfig();
  return backendUrl && supabaseAnonKey ? { url: backendUrl, key: supabaseAnonKey, token: updatePassword || 'sin-clave' } : null;
}

export function hayServidorParaCapas(): boolean {
  return servidor() != null;
}

async function enviar(cuerpo: Record<string, unknown>) {
  const s = servidor();
  if (!s) throw new Error('No hay servidor central configurado.');
  const resp = await fetch(FUNCION, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: s.token, usuario: 'Mapa', dataset: DATASET, registros: [], ...cuerpo }),
  });
  const r = await resp.json().catch(() => null);
  if (!resp.ok || !r || !r.ok) throw new Error((r && r.error) || `El servidor respondió con error ${resp.status}.`);
}

/** Sube (o vuelve a subir) una capa completa: GeoJSON en partes + su ficha. */
export async function subirCapaCompartida(capa: CapaGeografica, usuario = 'No identificado'): Promise<string> {
  const texto = JSON.stringify(capa.geojson);
  const partes = Math.max(1, Math.ceil(texto.length / TAMANO_PARTE));
  for (let i = 0; i < partes; i++) {
    await enviar({ registros: [{ __id: `${capa.id}#p${i}`, capaId: capa.id, parte: i, contenido: texto.slice(i * TAMANO_PARTE, (i + 1) * TAMANO_PARTE) }], esUltimoLote: false });
  }
  const version = new Date().toISOString();
  // La ficha va AL FINAL: si la subida se corta a la mitad, los demás
  // equipos no ven una capa a medias (sin ficha, la capa no existe para ellos).
  await subirFichaCapa(capa, partes, version, usuario);
  return version;
}

/** Solo la ficha (nombre, campo de unión, dimensión…) — para cambios de configuración. */
export async function subirFichaCapa(capa: CapaGeografica, partes: number, version: string, usuario = 'No identificado') {
  const meta: MetaCapaCompartida = {
    __id: `${capa.id}#meta`,
    capaId: capa.id,
    nombre: capa.nombre,
    campoUnion: capa.campoUnion,
    dimension: capa.dimension,
    colorearPorCasos: capa.colorearPorCasos,
    partes,
    version,
    subidaPor: usuario,
  };
  await enviar({ registros: [meta], esUltimoLote: true });
}

/** Quita una capa del servidor (ficha + todas sus partes). */
export async function borrarCapaCompartida(capaId: string, partes: number) {
  const ids = [`${capaId}#meta`, ...Array.from({ length: Math.max(partes, 1) + 2 }, (_, i) => `${capaId}#p${i}`)];
  await enviar({ idsABorrar: ids });
}

async function fichasRemotas(): Promise<MetaCapaCompartida[]> {
  const s = servidor();
  if (!s) return [];
  const supabase = obtenerCliente(s.url, s.key);
  const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', DATASET).like('id_identidad', '%#meta');
  if (error) throw new Error(error.message);
  return (data ?? []).map((f: any) => f.datos as MetaCapaCompartida);
}

async function geojsonRemoto(meta: MetaCapaCompartida): Promise<unknown> {
  const s = servidor()!;
  const supabase = obtenerCliente(s.url, s.key);
  const ids = Array.from({ length: meta.partes }, (_, i) => `${meta.capaId}#p${i}`);
  const pedazos: string[] = new Array(meta.partes).fill('');
  // De a 2 partes por consulta, para no pedir respuestas enormes de golpe.
  for (let i = 0; i < ids.length; i += 2) {
    const { data, error } = await supabase.from('crime_records').select('datos').eq('dataset', DATASET).in('id_identidad', ids.slice(i, i + 2));
    if (error) throw new Error(error.message);
    for (const f of data ?? []) {
      const d = (f as any).datos;
      pedazos[d.parte] = d.contenido;
    }
  }
  if (pedazos.some((p) => !p)) throw new Error(`La capa "${meta.nombre}" está incompleta en el servidor.`);
  return JSON.parse(pedazos.join(''));
}

/**
 * Trae del servidor las capas compartidas y las une con las de este equipo:
 *  · capa del servidor que este equipo no tiene (o tiene en versión vieja)
 *    → se baja y se guarda;
 *  · capa que este equipo tenía como compartida pero ya no está en el
 *    servidor (alguien la quitó) → se quita aquí también;
 *  · capa que solo existe en este equipo y nunca se compartió → se deja.
 * Devuelve la lista final (ya guardada en este navegador).
 */
// Una sola sincronización a la vez: la arranca el dashboard al abrir (para
// que Microgerencia tenga las capas aunque nunca se abra el mapa) y también
// el mapa al montarse — si coinciden, el segundo espera al primero en vez
// de bajar todo dos veces.
let enCurso: Promise<CapaGeografica[] | null> | null = null;
export function sincronizarCapasDesdeServidor(): Promise<CapaGeografica[] | null> {
  if (!enCurso) enCurso = sincronizarInterno().finally(() => { enCurso = null; });
  return enCurso;
}

async function sincronizarInterno(): Promise<CapaGeografica[] | null> {
  if (!servidor()) return null;
  const locales = await cargarCapas();
  const fichas = await fichasRemotas();
  const porId = new Map(locales.map((c) => [c.id, c]));
  const idsRemotos = new Set(fichas.map((f) => f.capaId));
  let cambio = false;

  const resultado: CapaGeografica[] = [];
  for (const c of locales) {
    if (c.compartida && !idsRemotos.has(c.id)) { cambio = true; continue; }
    resultado.push(c);
  }
  for (const f of fichas) {
    const local = porId.get(f.capaId);
    if (local && local.versionCompartida === f.version) {
      // Misma versión del GeoJSON — solo se refresca la ficha (por si
      // alguien cambió el campo de unión o la dimensión).
      const i = resultado.findIndex((c) => c.id === f.capaId);
      const actualizada = { ...local, nombre: f.nombre, campoUnion: f.campoUnion, dimension: f.dimension, colorearPorCasos: f.colorearPorCasos, compartida: true, partesCompartidas: f.partes };
      if (JSON.stringify(actualizada) !== JSON.stringify(local)) { resultado[i] = actualizada; cambio = true; }
      continue;
    }
    try {
      const geojson = await geojsonRemoto(f);
      const nueva: CapaGeografica = {
        id: f.capaId, nombre: f.nombre, geojson, visible: local?.visible ?? true,
        campoUnion: f.campoUnion, dimension: f.dimension, colorearPorCasos: f.colorearPorCasos,
        compartida: true, versionCompartida: f.version, partesCompartidas: f.partes,
      };
      const i = resultado.findIndex((c) => c.id === f.capaId);
      if (i >= 0) resultado[i] = nueva; else resultado.push(nueva);
      cambio = true;
    } catch (e) {
      console.warn('[Capas compartidas] No se pudo bajar una capa:', e);
    }
  }
  if (cambio) await guardarCapas(resultado);
  return resultado;
}
