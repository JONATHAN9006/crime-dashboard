// Acceso del ADMINISTRADOR (enlace principal, sin /interno, /jefe ni /cai).
//
// Valida usuario y contraseña EN EL SERVIDOR: la contraseña nunca viaja en
// el código del navegador. Solo se guarda su hash (scrypt + sal). Para
// cambiarla, en Netlify → Site configuration → Environment variables:
//   ADMIN_USUARIO    (por defecto MEPOY_CIEPS)
//   ADMIN_CLAVE_HASH (hash scrypt; ver GUIA_ACCESO_ADMIN.md para generarlo)
// La sesión es un token firmado (HMAC) que vence a las 12 horas.
import type { Handler } from '@netlify/functions';
import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

const USUARIO = (process.env.ADMIN_USUARIO || 'MEPOY_CIEPS').trim();
// Hash de la contraseña inicial (no la contraseña).
const CLAVE_HASH = process.env.ADMIN_CLAVE_HASH
  || 'scrypt$YcjGTKJeCpFujVNhBkojpg==$/q8zNPVJJ7kHRp2bRU9ewb+mGtbqJXFOo5LmIu9/34c+gjSUHwuspVn4OMvuXFm1XrVFb3qb1UYzz5obsRpSzQ==';
const SECRETO = process.env.ADMIN_SECRETO || process.env.CAI_SECRETO || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.UPDATE_TOKEN || '';
const DURACION_MS = 12 * 60 * 60 * 1000;

const resp = (cuerpo: Record<string, unknown>, statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(cuerpo),
});

function verificarClave(clave: string, guardado: string): boolean {
  const [tipo, salB64, hB64] = guardado.split('$');
  if (tipo !== 'scrypt' || !salB64 || !hB64) return false;
  const esperado = Buffer.from(hB64, 'base64');
  const h = scryptSync(clave, Buffer.from(salB64, 'base64'), esperado.length);
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function firmar(datos: Record<string, unknown>): string {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', SECRETO).update(cuerpo).digest('base64url')}`;
}

function tokenValido(token: unknown): boolean {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [cuerpo, firma] = token.split('.');
  if (!iguales(firma, createHmac('sha256', SECRETO).update(cuerpo).digest('base64url'))) return false;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    return d.rol === 'admin' && typeof d.exp === 'number' && d.exp > Date.now();
  } catch {
    return false;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp({ ok: false, error: 'Método no permitido.' }, 405);
  if (!SECRETO) return resp({ ok: false, error: 'Falta configurar en Netlify una clave secreta (ADMIN_SECRETO).' });
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(event.body || '{}');
  } catch {
    return resp({ ok: false, error: 'Solicitud mal formada.' }, 400);
  }
  if (c.accion === 'login') {
    const usuario = String(c.usuario ?? '').trim();
    const clave = String(c.clave ?? '');
    const ok = iguales(usuario.toUpperCase(), USUARIO.toUpperCase()) && verificarClave(clave, CLAVE_HASH);
    if (!ok) {
      // Pausa para frenar intentos repetidos.
      await new Promise((r) => setTimeout(r, 900));
      return resp({ ok: false, error: 'Usuario o contraseña incorrectos.' });
    }
    const expira = Date.now() + DURACION_MS;
    return resp({ ok: true, token: firmar({ rol: 'admin', exp: expira }), expira });
  }
  if (c.accion === 'verificar') {
    return tokenValido(c.token) ? resp({ ok: true }) : resp({ ok: false, error: 'La sesión expiró. Vuelve a ingresar.' });
  }
  return resp({ ok: false, error: 'Acción no reconocida.' }, 400);
};
