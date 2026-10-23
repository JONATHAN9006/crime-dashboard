// Acceso del ADMINISTRADOR (enlace principal "/").
//
// Valida usuario y contraseña EN EL SERVIDOR: la contraseña nunca viaja en
// el código del navegador; solo se guarda su hash (scrypt + sal).
//  · Si el administrador ya cambió su contraseña desde el panel «Cuentas de
//    acceso», se usa la de la tabla cuentas_acceso (fila "administrador").
//  · Si no, la de siempre: variables ADMIN_USUARIO / ADMIN_CLAVE_HASH de
//    Netlify (o, en su defecto, el hash inicial de abajo).
// La sesión es un token firmado (HMAC) que vence a las 12 horas. Cada
// ingreso e intento fallido queda en la bitácora (si Supabase está configurado).
import type { Handler } from '@netlify/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { firmarTokenAdmin, registrarEvento, secretoAdmin, tokenAdminValido, verificarClave } from '../lib/sesionesAcceso';

const USUARIO_ENV = (process.env.ADMIN_USUARIO || 'MEPOY_CIEPS').trim();
// Hash de la contraseña inicial (no la contraseña).
const CLAVE_HASH_ENV = process.env.ADMIN_CLAVE_HASH
  || 'scrypt$YcjGTKJeCpFujVNhBkojpg==$/q8zNPVJJ7kHRp2bRU9ewb+mGtbqJXFOo5LmIu9/34c+gjSUHwuspVn4OMvuXFm1XrVFb3qb1UYzz5obsRpSzQ==';
const DURACION_MS = 12 * 60 * 60 * 1000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const resp = (cuerpo: Record<string, unknown>, statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(cuerpo),
});

function baseDatos(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  });
}

/** Usuario y hash vigentes: los de la tabla si existen; si no, los de Netlify. */
async function credenciales(db: SupabaseClient | null): Promise<{ usuario: string; hash: string }> {
  if (db) {
    try {
      const { data } = await db.from('cuentas_acceso').select('*').eq('rol', 'administrador').maybeSingle();
      if (data?.clave_hash) return { usuario: String(data.usuario || USUARIO_ENV), hash: data.clave_hash };
      if (data?.usuario) return { usuario: String(data.usuario), hash: CLAVE_HASH_ENV };
    } catch { /* sin tabla todavía: credenciales de Netlify */ }
  }
  return { usuario: USUARIO_ENV, hash: CLAVE_HASH_ENV };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp({ ok: false, error: 'Método no permitido.' }, 405);
  if (!secretoAdmin()) return resp({ ok: false, error: 'Falta configurar en Netlify una clave secreta (ADMIN_SECRETO).' });
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(event.body || '{}');
  } catch {
    return resp({ ok: false, error: 'Solicitud mal formada.' }, 400);
  }
  const ip = String(event.headers?.['x-nf-client-connection-ip'] || event.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const dispositivo = String(event.headers?.['user-agent'] || '').slice(0, 300);
  if (c.accion === 'login') {
    const db = baseDatos();
    const { usuario: usuarioOk, hash } = await credenciales(db);
    const usuario = String(c.usuario ?? '').trim();
    const ok = usuario.toUpperCase() === usuarioOk.toUpperCase() && verificarClave(String(c.clave ?? ''), hash);
    if (!ok) {
      if (db) await registrarEvento(db, { rol: 'administrador', evento: 'fallido', detalle: 'Usuario o contraseña incorrectos', ip, dispositivo });
      // Pausa para frenar intentos repetidos.
      await new Promise((r) => setTimeout(r, 900));
      return resp({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    }
    if (db) await registrarEvento(db, { rol: 'administrador', evento: 'ingreso', ip, dispositivo });
    const expira = Date.now() + DURACION_MS;
    return resp({ ok: true, token: firmarTokenAdmin(expira), expira });
  }
  if (c.accion === 'verificar') {
    return tokenAdminValido(c.token) ? resp({ ok: true }) : resp({ ok: false, error: 'La sesión expiró. Vuelve a ingresar.' });
  }
  return resp({ ok: false, error: 'Acción no reconocida.' }, 400);
};
