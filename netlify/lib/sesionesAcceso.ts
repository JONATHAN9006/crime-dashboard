// Utilidades COMPARTIDAS de autenticación del S2IP (las usan accesoAdmin,
// accesoCuentas y datosConsulta). Esta carpeta no es una función: esbuild la
// empaqueta dentro de cada función que la importa.
//
// TRES cuentas, TRES enlaces — nada más:
//   · administrador → "/"        (token propio firmado por accesoAdmin)
//   · interno       → "/interno" (sesión en sesiones_acceso)
//   · piloto        → "/piloto"  (sesión en sesiones_acceso)
// Las cuentas viven en la tabla cuentas_acceso, cuya llave primaria es el
// ROL con una restricción que solo admite esos tres valores: la base no
// permite crear una cuarta cuenta.
//
// Los tokens van FIRMADOS (HMAC-SHA256) con secretos que solo existen en el
// servidor: el navegador puede leerlos, pero no cambiar su rol sin que la
// firma deje de coincidir.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RolCuenta = 'administrador' | 'interno' | 'piloto';
export type RolSesion = 'interno' | 'piloto';
export const ROLES_SESION: RolSesion[] = ['interno', 'piloto'];
export const esRolSesion = (r: unknown): r is RolSesion => ROLES_SESION.includes(r as RolSesion);

export type AmbitoConsulta = 'popayan' | 'mepoy';
/** Ámbito territorial de la cuenta piloto. Ante cualquier duda, 'popayan' (lo más restrictivo). */
export const leerAmbito = (v: unknown): AmbitoConsulta => (v === 'mepoy' ? 'mepoy' : 'popayan');

const iguales = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ── Contraseñas (solo hash scrypt + sal; nunca la contraseña) ──────────────
export function hashClave(clave: string): string {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('base64')}$${scryptSync(clave, sal, 64).toString('base64')}`;
}
export function verificarClave(clave: string, guardado: string | null | undefined): boolean {
  if (!guardado) return false;
  const [tipo, salB64, hB64] = guardado.split('$');
  if (tipo !== 'scrypt' || !salB64 || !hB64) return false;
  const esperado = Buffer.from(hB64, 'base64');
  const h = scryptSync(clave, Buffer.from(salB64, 'base64'), esperado.length);
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

// ── Firma de tokens ────────────────────────────────────────────────────────
function firmarCon(secreto: string, datos: Record<string, unknown>): string {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  return `${cuerpo}.${createHmac('sha256', secreto).update(cuerpo).digest('base64url')}`;
}
function leerCon(secreto: string, token: unknown): Record<string, unknown> | null {
  if (!secreto || typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  if (!iguales(firma, createHmac('sha256', secreto).update(cuerpo).digest('base64url'))) return null;
  try {
    return JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  } catch {
    return null;
  }
}

// Administrador: mismo secreto de siempre (ADMIN_SECRETO o, si no existe, los anteriores).
export const secretoAdmin = () => process.env.ADMIN_SECRETO || process.env.CAI_SECRETO || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.UPDATE_TOKEN || '';
// Interno y piloto.
const secretoSesion = () => process.env.CAI_SECRETO || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function firmarTokenAdmin(exp: number): string {
  return firmarCon(secretoAdmin(), { rol: 'admin', exp });
}
/** ¿Token de administrador válido y vigente? */
export function tokenAdminValido(token: unknown): boolean {
  const d = leerCon(secretoAdmin(), token);
  return !!d && d.rol === 'admin' && typeof d.exp === 'number' && d.exp > Date.now();
}

export interface TokenSesion { r: RolSesion; s: string; exp: number }
export function firmarTokenSesion(datos: TokenSesion): string {
  return firmarCon(secretoSesion(), datos as unknown as Record<string, unknown>);
}
export function leerTokenSesion(token: unknown): TokenSesion | null {
  const d = leerCon(secretoSesion(), token);
  if (!d || !esRolSesion(d.r) || typeof d.s !== 'string' || typeof d.exp !== 'number') return null;
  return { r: d.r, s: d.s, exp: d.exp };
}

/**
 * Comprueba en la BASE (no solo en el token) que la sesión sigue viva y que
 * la cuenta está activa. Devuelve el rol y el ámbito guardados en la base
 * —nunca los que diga el navegador—, o el motivo del rechazo.
 */
export async function validarSesion(db: SupabaseClient, t: TokenSesion | null, rolEsperado?: RolSesion): Promise<{ motivo: string | null; rol: RolSesion | null; ambito: AmbitoConsulta }> {
  const no = (motivo: string) => ({ motivo, rol: null, ambito: 'popayan' as AmbitoConsulta });
  if (!t) return no('invalida');
  if (Date.now() > t.exp) return no('expirada');
  if (rolEsperado && t.r !== rolEsperado) return no('rol');
  const [{ data: ses }, { data: cuenta }] = await Promise.all([
    db.from('sesiones_acceso').select('rol').eq('sesion_id', t.s).maybeSingle(),
    db.from('cuentas_acceso').select('*').eq('rol', t.r).maybeSingle(),
  ]);
  if (!cuenta || !cuenta.activo) return no('desactivado');
  if (!ses || ses.rol !== t.r) return no('cerrada');
  return { motivo: null, rol: t.r, ambito: leerAmbito(cuenta.ambito) };
}

/**
 * Rol de quien hace una consulta de datos: administrador (token de
 * accesoAdmin) o una sesión de interno/piloto validada en la base.
 */
export async function resolverRol(db: SupabaseClient, token: unknown): Promise<{ motivo: string | null; rol: RolCuenta | null; ambito: AmbitoConsulta }> {
  if (tokenAdminValido(token)) return { motivo: null, rol: 'administrador', ambito: 'mepoy' };
  return validarSesion(db, leerTokenSesion(token));
}

/** Registro en la bitácora (best-effort: un fallo aquí nunca bloquea el ingreso). */
export async function registrarEvento(db: SupabaseClient, fila: { rol: RolCuenta | string; evento: string; detalle?: string | null; ip?: string; dispositivo?: string; distancia_km?: number | null }) {
  try { await db.from('bitacora_acceso').insert(fila); } catch { /* sin bitácora */ }
}
