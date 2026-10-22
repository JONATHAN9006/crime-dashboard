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
import { registroEnPopayan, restringirGeojsonAPopayan, territorioPilotoValido } from '../../src/utils/territorioPiloto';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TAMANO_PAGINA = 1000;

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
  if (accion !== 'meta' && accion !== 'registros' && accion !== 'capas_fichas' && accion !== 'capa') {
    // Escrituras, borrados, descargas masivas o cualquier otra cosa: no existen para el piloto.
    return resp({ ok: false, error: 'Operación no autorizada para este perfil.' }, 403);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  });
  try {
    const motivo = await validarSesion(db, leerToken(c.token), 'consulta_piloto');
    if (motivo) return resp({ ok: false, motivo, error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
    if (!territorioPilotoValido()) return resp({ ok: false, motivo: 'territorio', error: 'Consulta no disponible.' }, 403);

    if (accion === 'meta') {
      const { data, error } = await db.from('dataset_meta').select('ultima_actualizacion, ultimo_usuario').eq('dataset', 'delictividad').maybeSingle();
      if (error) throw error;
      return resp({ ok: true, ultimaActualizacion: data?.ultima_actualizacion ?? null, ultimoUsuario: null });
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
      return resp({ ok: true, geojson: restringirGeojsonAPopayan(JSON.parse(pedazos.join(''))) });
    }

    // accion === 'registros' — paginado y ORDENADO (estable aunque otros
    // usuarios estén subiendo información al mismo tiempo).
    const desde = Math.max(0, Math.floor(Number(c.desde) || 0));
    const { data, error } = await db
      .from('crime_records')
      .select('datos')
      .eq('dataset', 'delictividad')
      .order('id_identidad', { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw error;
    const filas = data || [];
    const registros = filas
      .map((f) => (f as { datos: Record<string, unknown> }).datos)
      .filter((d) => registroEnPopayan(d as { lat?: unknown; lon?: unknown; estacion?: unknown }))
      // Sin el lote de carga (quién/qué archivo subió cada registro): no lo necesita el piloto.
      .map((d) => {
        const { loteId: _a, loteArchivo: _b, loteFecha: _c, loteUsuario: _d, ...resto } = d as Record<string, unknown>;
        return resto;
      });
    return resp({ ok: true, registros, siguiente: filas.length < TAMANO_PAGINA ? null : desde + TAMANO_PAGINA });
  } catch (e) {
    console.error('[datosPiloto]', e);
    return resp({ ok: false, error: 'No fue posible consultar la información.' }, 500);
  }
};
