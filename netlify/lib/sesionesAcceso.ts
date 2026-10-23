// Utilidades COMPARTIDAS de las sesiones con usuario y contraseña (/cai y
// /piloto). Las usan netlify/functions/accesoCai.ts (ingreso) y
// netlify/functions/datosPiloto.ts (datos del piloto). Esta carpeta no es una
// función: esbuild la empaqueta dentro de cada función que la importa.
//
// El token va FIRMADO (HMAC-SHA256) con un secreto que solo existe en el
// servidor: el navegador puede leerlo, pero no cambiar su perfil ("p") ni
// su usuario sin que la firma deje de coincidir.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PerfilAcceso = 'cai' | 'consulta_piloto';
export const PERFILES: PerfilAcceso[] = ['cai', 'consulta_piloto'];
export const esPerfil = (p: unknown): p is PerfilAcceso => PERFILES.includes(p as PerfilAcceso);

const SECRETO = () => process.env.CAI_SECRETO || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface TokenAcceso { u: string; s: string; exp: number; p: PerfilAcceso }

export function firmar(datos: TokenAcceso): string {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const firma = createHmac('sha256', SECRETO()).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export function leerToken(token: unknown): TokenAcceso | null {
  const secreto = SECRETO();
  if (!secreto || typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (typeof datos.u !== 'string' || typeof datos.s !== 'string' || typeof datos.exp !== 'number') return null;
    // Tokens emitidos antes de existir los perfiles: eran todos de CAI.
    const p: PerfilAcceso = datos.p === undefined ? 'cai' : datos.p;
    if (!esPerfil(p)) return null;
    return { u: datos.u, s: datos.s, exp: datos.exp, p };
  } catch {
    return null;
  }
}

export type AmbitoConsulta = 'popayan' | 'mepoy';
/** Ámbito territorial del usuario: 'mepoy' (jefes, toda la jurisdicción) o 'popayan' (Estaciones Norte/Sur). Ante cualquier duda, 'popayan'. */
export const leerAmbito = (v: unknown): AmbitoConsulta => (v === 'mepoy' ? 'mepoy' : 'popayan');

/**
 * Comprueba en la BASE (no solo en el token) que la sesión sigue viva, que
 * el usuario está activo y que su perfil es el esperado. Devuelve el motivo
 * del rechazo (o null si todo está en orden) y el ÁMBITO guardado en la base
 * —nunca el que diga el navegador—.
 */
export async function validarSesion(db: SupabaseClient, t: TokenAcceso | null, perfilEsperado: PerfilAcceso): Promise<{ motivo: string | null; ambito: AmbitoConsulta }> {
  const no = (motivo: string) => ({ motivo, ambito: 'popayan' as AmbitoConsulta });
  if (!t) return no('invalida');
  if (Date.now() > t.exp) return no('expirada');
  if (t.p !== perfilEsperado) return no('perfil');
  const [{ data: ses }, { data: u }] = await Promise.all([
    db.from('cai_sesiones').select('sesion_id').eq('usuario', t.u).maybeSingle(),
    db.from('cai_usuarios').select('*').eq('usuario', t.u).maybeSingle(),
  ]);
  if (!u || !u.activo) return no('desactivado');
  if ((u.perfil || 'cai') !== perfilEsperado) return no('perfil');
  if (!ses || ses.sesion_id !== t.s) return no('otra-sesion');
  return { motivo: null, ambito: leerAmbito(u.ambito) };
}
