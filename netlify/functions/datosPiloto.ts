// FUENTE DE DATOS del perfil consulta_piloto (enlace /piloto) — Netlify Function.
//
// El navegador del piloto NO consulta la base directamente: pide los datos
// aquí, con su token de sesión firmado. Esta función:
//  · Valida el token (firma HMAC), que la sesión siga siendo la única viva,
//    que el usuario esté activo y que su perfil en la base sea
//    consulta_piloto (no basta con lo que diga el navegador).
//  · Lee crime_records con la llave service_role (que nunca sale del
//    servidor) y devuelve SOLO los registros de Popayán: con coordenadas
//    dentro del límite municipal oficial (DANE), o sin coordenadas pero de
//    las Estaciones Norte/Sur. Lo de Timbío, Sotará o Puracé nunca sale.
//  · Si el límite de Popayán no se puede validar, no entrega nada
//    (criterio de denegar por defecto).
//  · Es SOLO LECTURA: cualquier otra acción (subir, borrar, descargar
//    bases) se rechaza con 403.
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { leerToken, validarSesion } from '../lib/sesionesAcceso';
import { rawMinimo } from '../../src/data/clavesIdentidad';
import { recortarCoordenadasPiloto, registroEnPopayan, restringirGeojsonAPopayan, territorioPilotoValido } from '../../src/utils/territorioPiloto';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TAMANO_PAGINA = 1000;
// Netlify corta las respuestas de más de 6 MB. Cada registro trae todas las
// columnas originales del archivo (raw), así que una página de 1.000 filas
// puede pasar ese límite: se responde por TAMAÑO (≈4 MB) y el navegador pide
// la siguiente desde donde quedó.
const MAX_BYTES_RESPUESTA = 4_000_000;

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
  if (accion !== 'meta' && accion !== 'conteo' && accion !== 'registros' && accion !== 'capas_fichas' && accion !== 'capa') {
    // Escrituras, borrados, descargas masivas o cualquier otra cosa: no existen para el piloto.
    return resp({ ok: false, error: 'Operación no autorizada para este perfil.' }, 403);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  });
  try {
    const { motivo, ambito } = await validarSesion(db, leerToken(c.token), 'consulta_piloto');
    if (motivo) return resp({ ok: false, motivo, error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
    // Ámbito del usuario (lo decide la BASE): 'popayan' = Estaciones Norte/Sur
    // (todo recortado a Popayán); 'mepoy' = jefes (toda la jurisdicción).
    const soloPopayan = ambito !== 'mepoy';
    if (soloPopayan && !territorioPilotoValido()) return resp({ ok: false, motivo: 'territorio', error: 'Consulta no disponible.' }, 403);

    if (accion === 'meta') {
      const { data, error } = await db.from('dataset_meta').select('ultima_actualizacion, ultimo_usuario').eq('dataset', 'delictividad').maybeSingle();
      if (error) throw error;
      return resp({ ok: true, ultimaActualizacion: data?.ultima_actualizacion ?? null, ultimoUsuario: null });
    }

    // Total de filas (para repartir la descarga en ventanas paralelas).
    if (accion === 'conteo') {
      const { count, error } = await db.from('crime_records').select('id_identidad', { count: 'exact', head: true }).eq('dataset', 'delictividad');
      if (error) throw error;
      return resp({ ok: true, total: count ?? 0, ventana: TAMANO_PAGINA });
    }

    // Capas geográficas compartidas: la ficha (nombre, campo de unión…) y,
    // por separado, cada capa YA RECORTADA a Popayán en el servidor.
    if (accion === 'capas_fichas') {
      const { data, error } = await db.from('crime_records').select('datos').eq('dataset', 'capas_geo').like('id_identidad', '%#meta');
      if (error) throw error;
      const fichas = (data || []).map((f) => {
        const d = (f as { datos: Record<string, unknown> }).datos;
        return { capaId: d.capaId, nombre: d.nombre, campoUnion: d.campoUnion, dimension: d.dimension, colorearPorCasos: d.colorearPorCasos, partes: d.partes, version: d.version };
      });
      return resp({ ok: true, fichas });
    }
    if (accion === 'capa') {
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
        console.error(`[datosPiloto] Capa ${capaId} demasiado grande aun recortada (${cuerpo.length} bytes)`);
        return resp({ ok: false, error: 'Capa demasiado grande.' }, 413);
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: cuerpo };
    }

    // accion === 'registros' — paginado y ORDENADO (estable aunque otros
    // usuarios estén subiendo información al mismo tiempo).
    // «hasta» (opcional): fin EXCLUSIVO de la ventana que pidió el navegador;
    // así varias ventanas se descargan en paralelo sin pisarse.
    const desde = Math.max(0, Math.floor(Number(c.desde) || 0));
    const hastaPedido = Number(c.hasta);
    const limite = Number.isFinite(hastaPedido) && hastaPedido > desde ? Math.min(desde + TAMANO_PAGINA, Math.floor(hastaPedido)) : desde + TAMANO_PAGINA;
    const tamano = limite - desde;
    // Vista LIVIANA (supabase/consulta_jefes.sql): la base entrega cada
    // registro sin las ~100 columnas originales, así sale mucho menos
    // información de Supabase (cuida los 5 GB del mes). Si la vista aún no
    // existe, se usa la tabla completa y se aligera aquí.
    const pedir = (tabla: string) => db
      .from(tabla)
      .select('datos')
      .eq('dataset', 'delictividad')
      .order('id_identidad', { ascending: true })
      .range(desde, limite - 1);
    let { data, error } = await pedir('crime_records_ligero');
    if (error && /crime_records_ligero|does not exist|schema cache|not find/i.test(error.message || '')) ({ data, error } = await pedir('crime_records'));
    if (error) throw error;
    const filas = data || [];
    const registros: Record<string, unknown>[] = [];
    let bytes = 0;
    let consumidas = 0;
    for (const f of filas) {
      const d = (f as { datos: Record<string, unknown> }).datos;
      if (!soloPopayan || registroEnPopayan(d as { lat?: unknown; lon?: unknown; estacion?: unknown })) {
        // Sin el lote de carga (quién/qué archivo subió cada registro): no lo necesita el piloto.
        // y con solo las columnas originales que usa la identidad (mucho más liviano).
        const { loteId: _a, loteArchivo: _b, loteFecha: _c, loteUsuario: _d, raw, ...sinRaw } = soloPopayan ? recortarCoordenadasPiloto(d) : d;
        const resto = { ...sinRaw, raw: rawMinimo(raw) };
        const tam = JSON.stringify(resto).length + 1;
        if (bytes + tam > MAX_BYTES_RESPUESTA && registros.length > 0) break;
        registros.push(resto);
        bytes += tam;
      }
      consumidas++;
    }
    const finDeVentana = consumidas === filas.length && (filas.length < tamano || (Number.isFinite(hastaPedido) && limite >= hastaPedido));
    return resp({ ok: true, registros, siguiente: finDeVentana ? null : desde + consumidas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    console.error('[datosPiloto]', accion, msg);
    // «detalle» solo sirve para diagnosticar (consola del navegador, F12); no incluye llaves ni datos.
    return resp({ ok: false, error: 'No fue posible consultar la información.', detalle: msg.slice(0, 200) }, 500);
  }
};
