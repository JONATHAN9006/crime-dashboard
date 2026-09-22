// Backend de ESCRITURA para el dataset central — Netlify Function.
//
// Reemplaza a apps-script/Code.gs (doPost) ahora que los datos viven en
// Supabase en vez de un CSV en Google Drive. Es la ÚNICA pieza que puede
// escribir: usa la llave "service_role" de Supabase (nunca expuesta al
// navegador — vive solo en la variable de entorno SUPABASE_SERVICE_ROLE_KEY
// de este sitio en Netlify) y valida la clave de actualización aquí, del
// lado del servidor, antes de tocar la base de datos.
//
// POR QUÉ ESTO YA NO NECESITA EL "SEGURO CONTRA CARRERAS" que tenía
// Code.gs: aquella corrección (rechazar una subida con MENOS filas que las
// ya guardadas) era un parche para un problema de fondo — Code.gs
// reemplazaba el ARCHIVO COMPLETO en cada subida, así que dos personas
// subiendo casi al mismo tiempo competían por machacar TODO el dataset.
// Aquí cada registro se guarda por separado (upsert, "insertar o
// actualizar SOLO esta fila"), identificado por su propio id — dos
// personas subiendo al mismo tiempo simplemente agregan/actualizan sus
// propias filas sin pisar las de la otra persona. Postgres resuelve solo
// el único caso donde sí compiten de verdad (las dos tocando EXACTAMENTE
// el mismo registro): gana la última escritura para ESA fila nada más,
// nunca para el resto del dataset.
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UPDATE_TOKEN = process.env.UPDATE_TOKEN || '';

// Insertar/actualizar de a poco, no las 11.000+ filas en una sola llamada
// — evita pasarse de los límites prácticos de tamaño de solicitud/tiempo
// de PostgREST, sin importar cuántos registros traiga una subida (una
// carga inicial completa, o solo un puñado de registros nuevos del día).
const TAMANO_LOTE = 500;

interface CuerpoSolicitud {
  token: string;
  usuario?: string;
  dataset?: 'delictividad' | 'operatividad';
  registros: Array<Record<string, unknown> & { __id: string; fecha?: string | null; anio?: number | null; delito?: string }>;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Método no permitido.' }) };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'El backend central aún no está configurado (faltan variables de entorno de Supabase en Netlify).' }) };
  }
  if (!UPDATE_TOKEN) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'El backend central aún no tiene configurada la clave de actualización (UPDATE_TOKEN) en Netlify.' }) };
  }

  let cuerpo: CuerpoSolicitud;
  try {
    cuerpo = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Solicitud mal formada.' }) };
  }

  if (!cuerpo.token || cuerpo.token !== UPDATE_TOKEN) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Clave de actualización incorrecta. No tienes autorización para actualizar el dashboard.' }) };
  }
  if (!Array.isArray(cuerpo.registros) || cuerpo.registros.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'No se recibió ningún registro para guardar.' }) };
  }

  const dataset = cuerpo.dataset === 'operatividad' ? 'operatividad' : 'delictividad';
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const filas = cuerpo.registros.map((r) => ({
      dataset,
      id_identidad: r.__id,
      fecha: r.fecha ? String(r.fecha).slice(0, 10) : null,
      anio: (r as any).anio ?? null,
      delito: (r as any).delito ?? null,
      datos: r,
      actualizado_en: new Date().toISOString(),
    }));

    for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
      const lote = filas.slice(i, i + TAMANO_LOTE);
      const { error } = await supabase.from('crime_records').upsert(lote, { onConflict: 'dataset,id_identidad' });
      if (error) throw new Error(error.message);
    }

    const { error: errorMeta } = await supabase
      .from('dataset_meta')
      .upsert(
        { dataset, ultima_actualizacion: new Date().toISOString(), ultimo_usuario: cuerpo.usuario || 'No identificado' },
        { onConflict: 'dataset' },
      );
    if (errorMeta) throw new Error(errorMeta.message);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        mensaje: `El dashboard central fue actualizado correctamente (dataset: ${dataset}, ${filas.length} registro(s)).`,
        fecha: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: 'Error guardando en la base de datos: ' + String(err instanceof Error ? err.message : err) }) };
  }
};
