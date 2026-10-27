// FUENTE ÚNICA DE LECTURA del S2IP — Netlify Function.
//
// La base ya no tiene lectura pública: el navegador NUNCA consulta Supabase
// directamente. Todas las lecturas pasan por aquí, y cada una se autoriza
// según el ROL de quien pregunta (decidido en el servidor, no en la ruta):
//
//   administrador → token firmado de accesoAdmin
//   interno       → sesión de /interno validada en la base
//   piloto        → sesión de /piloto validada en la base
//
// Qué puede leer cada rol (DATASETS_POR_ROL):
//   · administrador: todo (delitos, RNMC, IRISP1, MACRI, capas, Plan Candado).
//   · interno: lo mismo excepto Plan Candado (solo del administrador).
//   · piloto: delitos (livianos, y recortados a Popayán si su ámbito es
//     'popayan') y capas geográficas (recortadas igual).
//
// SOLO LECTURA: cualquier otra acción se rechaza con 403. Las escrituras
// siguen pasando únicamente por subirRegistros (clave de actualización).
import type { Handler } from '@netlify/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolverRol, type RolCuenta } from '../lib/sesionesAcceso';
import { rawMinimo } from '../../src/data/clavesIdentidad';
import { recortarCoordenadasPiloto, registroEnPopayan, restringirGeojsonAPopayan, territorioPilotoValido } from '../../src/utils/territorioPiloto';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TAMANO_PAGINA = 1000;
// Netlify corta las respuestas de más de 6 MB: se responde por TAMAÑO
// (≈4 MB) y el navegador pide lo siguiente desde la última llave recibida.
const MAX_BYTES_RESPUESTA = 4_000_000;

const DATASETS_POR_ROL: Record<RolCuenta, string[]> = {
  administrador: ['delictividad', 'rnmc', 'irisp1', 'macri', 'macri_seguimiento', 'capas_geo', 'plan_candado'],
  interno: ['delictividad', 'rnmc', 'irisp1', 'macri', 'macri_seguimiento', 'capas_geo'],
  piloto: ['delictividad', 'capas_geo'],
};
const ACCIONES = ['meta', 'conteo', 'registros', 'filas', 'capas_fichas', 'capa'];

/** Redondea coordenadas a 6 decimales (~0,1 m): mismas formas, mucho menos peso. */
function redondearCoordenadas(g: unknown): unknown {
  if (Array.isArray(g)) {
    if (g.length >= 2 && typeof g[0] === 'number' && typeof g[1] === 'number') return g.map((v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
    return g.map(redondearCoordenadas);
  }
  if (g && typeof g === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(g as Record<string, unknown>)) o[k] = k === 'coordinates' || k === 'features' || k === 'geometry' || k === 'geometries' ? redondearCoordenadas(v) : v;
    return o;
  }
  return g;
}

const resp = (cuerpo: Record<string, unknown>, statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(cuerpo),
});
const texto = (v: unknown, max = 200) => (typeof v === 'string' && v.length > 0 && v.length < max ? v : null);

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp({ ok: false, error: 'Método no permitido.' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return resp({ ok: false, error: 'Servicio no configurado.' }, 503);
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(event.body || '{}');
  } catch {
    return resp({ ok: false, error: 'Solicitud mal formada.' }, 400);
  }
  const accion = String(c.accion || '');
  if (!ACCIONES.includes(accion)) return resp({ ok: false, error: 'Operación no autorizada.' }, 403);
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  });
  try {
    const { motivo, rol, ambito } = await resolverRol(db, c.token);
    if (motivo || !rol) return resp({ ok: false, motivo, error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
    const dataset = texto(c.dataset, 60) ?? 'delictividad';
    const permitidos = DATASETS_POR_ROL[rol];
    if (accion !== 'capas_fichas' && accion !== 'capa' && !permitidos.includes(dataset)) {
      return resp({ ok: false, error: 'Información no autorizada para esta cuenta.' }, 403);
    }
    // Piloto con ámbito Popayán: todo lo geográfico recortado; si el límite
    // no se puede validar, se niega (criterio de denegar por defecto).
    const soloPopayan = rol === 'piloto' && ambito !== 'mepoy';
    if (soloPopayan && !territorioPilotoValido()) return resp({ ok: false, motivo: 'territorio', error: 'Consulta no disponible.' }, 403);

    if (accion === 'meta') {
      const { data, error } = await db.from('dataset_meta').select('ultima_actualizacion, ultimo_usuario').eq('dataset', dataset).maybeSingle();
      if (error) throw error;
      return resp({ ok: true, ultimaActualizacion: data?.ultima_actualizacion ?? null, ultimoUsuario: rol === 'piloto' ? null : data?.ultimo_usuario ?? null });
    }
    if (accion === 'conteo') {
      const { count, error } = await db.from('crime_records').select('id_identidad', { count: 'exact', head: true }).eq('dataset', dataset);
      if (error) throw error;
      return resp({ ok: true, total: count ?? 0, ambito: rol === 'piloto' ? ambito : null });
    }
    if (accion === 'capas_fichas' || accion === 'capa') return await capas(db, c, accion, soloPopayan);
    if (accion === 'filas') {
      // Lecturas puntuales (fichas de capas por sufijo, partes por id, o un
      // dataset pequeño completo como Plan Candado). Solo administrador/interno.
      if (rol === 'piloto') return resp({ ok: false, error: 'Operación no autorizada.' }, 403);
      const sufijo = texto(c.sufijo, 30);
      const ids = Array.isArray(c.ids) ? (c.ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length < 200).slice(0, 200) : null;
      let q = db.from('crime_records').select('id_identidad, datos').eq('dataset', dataset);
      if (sufijo) q = q.like('id_identidad', `%${sufijo.replace(/[%_]/g, '')}`);
      if (ids) q = q.in('id_identidad', ids);
      const { data, error } = await q.order('id_identidad', { ascending: true }).limit(TAMANO_PAGINA);
      if (error) throw error;
      return resp({ ok: true, filas: data || [] });
    }
    return await registros(db, c, dataset, rol, soloPopayan);
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    console.error('[datosConsulta]', accion, msg);
    // «detalle» solo sirve para diagnosticar (consola del navegador, F12); no incluye llaves ni datos.
    return resp({ ok: false, error: 'No fue posible consultar la información.', detalle: msg.slice(0, 200) }, 500);
  }
};

// Paginación por LLAVE (keyset): cada consulta salta directo con el índice de
// id_identidad, así tarda lo mismo sin importar cuántos registros haya.
//  · desdeClave (incluida) / hastaClave (excluida): la ventana que pide el
//    navegador (varias ventanas van en paralelo sin pisarse);
//  · despuesDe: última llave ya recibida dentro de la ventana.
async function registros(db: SupabaseClient, c: Record<string, unknown>, dataset: string, rol: RolCuenta, soloPopayan: boolean) {
  const desdeClave = texto(c.desdeClave);
  const hastaClave = texto(c.hastaClave);
  const despuesDe = texto(c.despuesDe);
  const liviano = rol === 'piloto';
  // Piloto: vista LIVIANA (sin las ~100 columnas originales); si aún no
  // existe, la tabla completa (se aligera aquí).
  const pedir = (tabla: string) => {
    let q = db.from(tabla).select('id_identidad, datos').eq('dataset', dataset);
    if (desdeClave) q = q.gte('id_identidad', desdeClave);
    if (despuesDe) q = q.gt('id_identidad', despuesDe);
    if (hastaClave) q = q.lt('id_identidad', hastaClave);
    return q.order('id_identidad', { ascending: true }).limit(TAMANO_PAGINA);
  };
  let { data, error } = await pedir(liviano ? 'crime_records_ligero' : 'crime_records');
  if (liviano && error && /crime_records_ligero|does not exist|schema cache|not find/i.test(error.message || '')) ({ data, error } = await pedir('crime_records'));
  if (error) throw error;
  const filas = (data || []) as { id_identidad: string; datos: Record<string, unknown> }[];
  const salida: unknown[] = [];
  let bytes = 0;
  let ultimaClave: string | null = null;
  let consumidas = 0;
  for (const f of filas) {
    let item: unknown = null;
    if (!liviano) {
      item = { id_identidad: f.id_identidad, datos: f.datos };
    } else if (!soloPopayan || registroEnPopayan(f.datos as { lat?: unknown; lon?: unknown; estacion?: unknown })) {
      // Sin el lote de carga y con solo las columnas originales de la identidad.
      const { loteId: _a, loteArchivo: _b, loteFecha: _c, loteUsuario: _d, raw, ...sinRaw } = soloPopayan ? recortarCoordenadasPiloto(f.datos) : f.datos;
      item = { ...sinRaw, raw: rawMinimo(raw) };
    }
    if (item) {
      const tam = JSON.stringify(item).length + 1;
      if (bytes + tam > MAX_BYTES_RESPUESTA && salida.length > 0) break;
      salida.push(item);
      bytes += tam;
    }
    ultimaClave = f.id_identidad;
    consumidas++;
  }
  const hayMas = consumidas < filas.length || filas.length === TAMANO_PAGINA;
  // Piloto recibe los registros sueltos («registros»); administrador e
  // interno reciben {id_identidad, datos} («filas»), como venían de la base.
  return resp({ ok: true, [liviano ? 'registros' : 'filas']: salida, siguiente: hayMas ? ultimaClave : null });
}

// Capas geográficas compartidas: la ficha y cada capa ya armada (y, para
// el piloto de ámbito Popayán, recortada en el servidor).
async function capas(db: SupabaseClient, c: Record<string, unknown>, accion: string, soloPopayan: boolean) {
  if (accion === 'capas_fichas') {
    const { data, error } = await db.from('crime_records').select('datos').eq('dataset', 'capas_geo').like('id_identidad', '%#meta');
    if (error) throw error;
    const fichas = (data || []).map((f) => {
      const d = (f as { datos: Record<string, unknown> }).datos;
      return { capaId: d.capaId, nombre: d.nombre, campoUnion: d.campoUnion, dimension: d.dimension, colorearPorCasos: d.colorearPorCasos, partes: d.partes, version: d.version, subidaPor: d.subidaPor };
    });
    return resp({ ok: true, fichas });
  }
  const capaId = String(c.capaId || '');
  if (!capaId || capaId.includes('%') || capaId.includes(',')) return resp({ ok: false, error: 'Capa no válida.' }, 400);
  const { data: meta, error: e1 } = await db.from('crime_records').select('datos').eq('dataset', 'capas_geo').eq('id_identidad', `${capaId}#meta`).maybeSingle();
  if (e1) throw e1;
  const partes = Number((meta as { datos?: { partes?: number } } | null)?.datos?.partes) || 0;
  if (!meta || partes < 1 || partes > 40) return resp({ ok: false, error: 'Capa no disponible.' }, 404);
  const ids = Array.from({ length: partes }, (_, i) => `${capaId}#p${i}`);
  const { data: filas, error: e2 } = await db.from('crime_records').select('datos').eq('dataset', 'capas_geo').in('id_identidad', ids);
  if (e2) throw e2;
  const pedazos: string[] = new Array(partes).fill('');
  for (const f of filas || []) {
    const d = (f as { datos: { parte: number; contenido: string } }).datos;
    if (d && Number.isInteger(d.parte) && d.parte >= 0 && d.parte < partes) pedazos[d.parte] = d.contenido;
  }
  if (pedazos.some((x) => !x)) return resp({ ok: false, error: 'Capa no disponible.' }, 404);
  const completo = JSON.parse(pedazos.join(''));
  const geojson = redondearCoordenadas(soloPopayan ? restringirGeojsonAPopayan(completo) : completo);
  const cuerpo = JSON.stringify({ ok: true, geojson });
  if (cuerpo.length > 5_800_000) {
    console.error(`[datosConsulta] Capa ${capaId} demasiado grande (${cuerpo.length} bytes)`);
    return resp({ ok: false, error: 'Capa demasiado grande.' }, 413);
  }
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: cuerpo };
}
