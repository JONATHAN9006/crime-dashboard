// Ingreso de las cuentas INTERNO (/interno) y PILOTO (/piloto), y las
// acciones del panel «Cuentas de acceso» del administrador — Netlify Function.
//
//  · Valida usuario y contraseña de la cuenta del enlace (solo hash scrypt
//    en cuentas_acceso; la contraseña nunca está en el código).
//  · Varias sesiones a la vez por cuenta (una fila por sesión en
//    sesiones_acceso); el administrador puede cerrarlas todas.
//  · Piloto: además puede exigir que el equipo esté en la jurisdicción
//    (PILOTO_EXIGIR_UBICACION, por defecto "si"; radio PILOTO_RADIO_KM,
//    por defecto 40 km desde Popayán, que cubre todo MEPOY). Es un control
//    COMPLEMENTARIO: la autorización real es la contraseña y el rol.
//  · Bitácora de ingresos, intentos fallidos y salidas (bitacora_acceso).
//  · Acciones del panel: solo con un token de ADMINISTRADOR vigente.
//
// No existe ninguna acción que cree cuentas: la base solo admite las tres
// filas de cuentas_acceso (administrador, interno, piloto).
import type { Handler } from '@netlify/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import {
  esRolSesion, firmarTokenSesion, hashClave, leerAmbito, leerTokenSesion, registrarEvento, tokenAdminValido,
  validarSesion, verificarClave, type RolCuenta, type RolSesion,
} from '../lib/sesionesAcceso';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CENTRO = { lat: 2.4419, lon: -76.6063 };
const RADIO_KM = Number(process.env.PILOTO_RADIO_KM || 40);
const EXIGIR_UBICACION_PILOTO = (process.env.PILOTO_EXIGIR_UBICACION || 'si').toLowerCase() !== 'no';
const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const EN_LINEA_MS = 7 * 60 * 1000;
const MAX_FALLIDOS = 5;
const VENTANA_FALLIDOS_MS = 15 * 60 * 1000;
const ROLES: RolCuenta[] = ['administrador', 'interno', 'piloto'];

type Cuerpo = Record<string, unknown> & { accion?: string };

const resp = (cuerpo: Record<string, unknown>, statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(cuerpo),
});

function distanciaKm(lat: number, lon: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat - CENTRO.lat);
  const dLon = rad(lon - CENTRO.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(CENTRO.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function leerUbicacion(c: Cuerpo): { lat: number; lon: number } | null {
  const lat = Number(c.lat);
  const lon = Number(c.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}
const normalizar = (u: unknown) => String(u ?? '').trim().toLowerCase();

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp({ ok: false, error: 'Método no permitido.' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return resp({ ok: false, error: 'El acceso aún no está configurado en el servidor (faltan las variables de Supabase en Netlify).' });
  let c: Cuerpo;
  try {
    c = JSON.parse(event.body || '{}');
  } catch {
    return resp({ ok: false, error: 'Solicitud mal formada.' }, 400);
  }
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } },
  });
  const ip = String(event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const dispositivo = String(c.dispositivo || event.headers['user-agent'] || '').slice(0, 300);
  try {
    switch (c.accion) {
      case 'login': return await login(db, c, ip, dispositivo);
      case 'verificar': return await verificar(db, c, ip, dispositivo);
      case 'salir': return await salir(db, c, ip, dispositivo);
      case 'evento': return await evento(db, c, ip, dispositivo);
      case 'admin_resumen':
      case 'admin_clave':
      case 'admin_estado':
      case 'admin_ambito':
      case 'admin_cerrar':
        if (!tokenAdminValido(c.adminToken)) return resp({ ok: false, motivo: 'admin', error: 'La sesión de administrador expiró. Vuelve a ingresar.' }, 401);
        return await admin(db, c);
      default:
        return resp({ ok: false, error: 'Acción no reconocida.' }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    if (/cuentas_acceso|sesiones_acceso|bitacora_acceso/.test(msg) && /does not exist|not find|schema cache/i.test(msg)) {
      return resp({ ok: false, error: 'Faltan las tablas de cuentas en Supabase (ejecuta supabase/cuentas_acceso_1_crear.sql).' });
    }
    console.error('[accesoCuentas]', c.accion, msg);
    return resp({ ok: false, error: 'Error del servidor. Intenta de nuevo.' });
  }
};

async function login(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  if (!esRolSesion(c.rol)) return resp({ ok: false, error: 'Enlace no válido.' }, 400);
  const rol: RolSesion = c.rol;
  const ubic = leerUbicacion(c);
  const distancia = ubic ? distanciaKm(ubic.lat, ubic.lon) : null;
  const base = { rol, ip, dispositivo, distancia_km: distancia };

  // Bloqueo temporal por intentos fallidos desde el mismo equipo (IP).
  const desde = new Date(Date.now() - VENTANA_FALLIDOS_MS).toISOString();
  const { count } = await db.from('bitacora_acceso').select('id', { count: 'exact', head: true }).eq('rol', rol).eq('evento', 'fallido').eq('ip', ip).gte('fecha', desde);
  if ((count ?? 0) >= MAX_FALLIDOS) {
    await registrarEvento(db, { ...base, evento: 'bloqueado', detalle: 'Demasiados intentos fallidos' });
    return resp({ ok: false, error: 'Demasiados intentos fallidos. Espera 15 minutos o comunícate con el administrador.' });
  }

  const { data: cuenta, error } = await db.from('cuentas_acceso').select('*').eq('rol', rol).maybeSingle();
  if (error) throw error;
  const usuarioOk = !!cuenta && normalizar(c.usuario) === normalizar(cuenta.usuario);
  if (!cuenta || !usuarioOk || !verificarClave(String(c.clave ?? ''), cuenta.clave_hash)) {
    await registrarEvento(db, { ...base, evento: 'fallido', detalle: !cuenta?.clave_hash ? 'La cuenta no tiene contraseña asignada' : 'Usuario o contraseña incorrectos' });
    await new Promise((r) => setTimeout(r, 700));
    return resp({ ok: false, error: 'Usuario o contraseña incorrectos.' });
  }
  if (!cuenta.activo) {
    await registrarEvento(db, { ...base, evento: 'rechazado', detalle: 'Cuenta desactivada' });
    return resp({ ok: false, error: 'Esta cuenta está desactivada. Comunícate con el administrador.' });
  }
  if (rol === 'piloto' && EXIGIR_UBICACION_PILOTO) {
    if (!ubic) {
      await registrarEvento(db, { ...base, evento: 'rechazado', detalle: `Sin ubicación (${String(c.errorUbicacion || 'no enviada')})` });
      return resp({ ok: false, error: 'Para ingresar debes permitir la ubicación del equipo.', requiereUbicacion: true });
    }
    if (distancia !== null && distancia > RADIO_KM) {
      await registrarEvento(db, { ...base, evento: 'rechazado', detalle: `Fuera de la jurisdicción (${distancia.toFixed(1)} km)` });
      return resp({ ok: false, error: 'El acceso solo está habilitado dentro de la jurisdicción MEPOY.' });
    }
  }
  // Limpieza de sesiones vencidas (más de 12 horas).
  await db.from('sesiones_acceso').delete().lt('inicio', new Date(Date.now() - DURACION_SESION_MS).toISOString());
  const sesionId = randomBytes(16).toString('hex');
  const ahora = new Date().toISOString();
  const { error: e2 } = await db.from('sesiones_acceso').insert({ sesion_id: sesionId, rol, inicio: ahora, ultima_actividad: ahora, dispositivo, ip });
  if (e2) throw e2;
  await registrarEvento(db, { ...base, evento: 'ingreso', detalle: null });
  const exp = Date.now() + DURACION_SESION_MS;
  return resp({ ok: true, token: firmarTokenSesion({ r: rol, s: sesionId, exp }), usuario: cuenta.usuario, nombre: cuenta.nombre || cuenta.usuario, rol, ambito: leerAmbito(cuenta.ambito), expira: exp, requiereUbicacion: rol === 'piloto' && EXIGIR_UBICACION_PILOTO });
}

async function verificar(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  const t = leerTokenSesion(c.token);
  const rolPedido = esRolSesion(c.rol) ? c.rol : undefined;
  const v = await validarSesion(db, t, rolPedido);
  if (v.motivo || !t) {
    const error = v.motivo === 'expirada' ? 'La sesión expiró. Vuelve a ingresar.'
      : v.motivo === 'desactivado' ? 'Esta cuenta fue desactivada por el administrador.'
      : v.motivo === 'cerrada' ? 'El administrador cerró la sesión. Vuelve a ingresar.'
      : 'Sesión no válida. Vuelve a ingresar.';
    return resp({ ok: false, motivo: v.motivo, error });
  }
  const ubic = leerUbicacion(c);
  if (t.r === 'piloto' && EXIGIR_UBICACION_PILOTO && ubic) {
    const d = distanciaKm(ubic.lat, ubic.lon);
    if (d > RADIO_KM) {
      await db.from('sesiones_acceso').delete().eq('sesion_id', t.s);
      await registrarEvento(db, { rol: t.r, evento: 'cerrada', detalle: `Salió de la jurisdicción (${d.toFixed(1)} km)`, distancia_km: d, dispositivo, ip });
      return resp({ ok: false, motivo: 'fuera', error: 'El dashboard solo se puede consultar dentro de la jurisdicción MEPOY.' });
    }
  }
  await db.from('sesiones_acceso').update({ ultima_actividad: new Date().toISOString() }).eq('sesion_id', t.s);
  return resp({ ok: true, ambito: v.ambito });
}

async function salir(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  const t = leerTokenSesion(c.token);
  if (!t) return resp({ ok: true });
  await db.from('sesiones_acceso').delete().eq('sesion_id', t.s);
  await registrarEvento(db, { rol: t.r, evento: 'salida', dispositivo, ip });
  return resp({ ok: true });
}

// Eventos de seguridad que reporta el navegador de una sesión válida (solo códigos fijos).
const EVENTOS_PERMITIDOS: Record<string, string> = {
  geo_denegado: 'Mapa no habilitado: no se pudo validar el ámbito territorial',
  geo_fuera: 'Intento de consultar una ubicación fuera del territorio autorizado (rechazado)',
};
async function evento(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  const t = leerTokenSesion(c.token);
  const codigo = String(c.codigo || '');
  if (!t || Date.now() > t.exp || !EVENTOS_PERMITIDOS[codigo]) return resp({ ok: false, error: 'Evento no válido.' }, 400);
  await registrarEvento(db, { rol: t.r, evento: 'seguridad', detalle: EVENTOS_PERMITIDOS[codigo], dispositivo, ip });
  return resp({ ok: true });
}

async function admin(db: SupabaseClient, c: Cuerpo) {
  const rol = String(c.rol || '') as RolCuenta;
  if (c.accion === 'admin_clave') {
    if (!ROLES.includes(rol)) return resp({ ok: false, error: 'Cuenta no válida.' }, 400);
    const nueva = String(c.nuevaClave ?? '');
    if (nueva.length < 8) return resp({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
    const { data, error } = await db.from('cuentas_acceso').update({ clave_hash: hashClave(nueva), actualizado: new Date().toISOString() }).eq('rol', rol).select('rol');
    if (error) throw error;
    if (!data || data.length === 0) return resp({ ok: false, error: 'Esa cuenta no existe.' });
    if (rol !== 'administrador') await db.from('sesiones_acceso').delete().eq('rol', rol);
    await registrarEvento(db, { rol, evento: 'admin', detalle: 'El administrador asignó una contraseña nueva' });
    return resp({ ok: true });
  }
  if (c.accion === 'admin_estado') {
    if (!esRolSesion(rol)) return resp({ ok: false, error: 'La cuenta de administrador no se puede desactivar.' }, 400);
    const activo = !!c.activo;
    const { error } = await db.from('cuentas_acceso').update({ activo, actualizado: new Date().toISOString() }).eq('rol', rol);
    if (error) throw error;
    if (!activo) await db.from('sesiones_acceso').delete().eq('rol', rol);
    await registrarEvento(db, { rol, evento: 'admin', detalle: activo ? 'Cuenta activada' : 'Cuenta desactivada' });
    return resp({ ok: true });
  }
  if (c.accion === 'admin_ambito') {
    const ambito = c.ambito === 'mepoy' ? 'mepoy' : c.ambito === 'popayan' ? 'popayan' : null;
    if (!ambito) return resp({ ok: false, error: 'Ámbito no válido.' }, 400);
    const { error } = await db.from('cuentas_acceso').update({ ambito, actualizado: new Date().toISOString() }).eq('rol', 'piloto');
    if (error) throw error;
    await db.from('sesiones_acceso').delete().eq('rol', 'piloto');
    await registrarEvento(db, { rol: 'piloto', evento: 'admin', detalle: ambito === 'mepoy' ? 'Territorio: toda la jurisdicción MEPOY' : 'Territorio: solo Popayán (Estaciones Norte y Sur)' });
    return resp({ ok: true });
  }
  if (c.accion === 'admin_cerrar') {
    if (!esRolSesion(rol)) return resp({ ok: false, error: 'Cuenta no válida.' }, 400);
    await db.from('sesiones_acceso').delete().eq('rol', rol);
    await registrarEvento(db, { rol, evento: 'admin', detalle: 'El administrador cerró todas las sesiones' });
    return resp({ ok: true });
  }
  // admin_resumen
  const dias = Math.min(Math.max(Number(c.dias) || 30, 1), 365);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const [{ data: cuentas, error: e1 }, { data: sesiones, error: e2 }, { data: bitacora, error: e3 }] = await Promise.all([
    db.from('cuentas_acceso').select('*'),
    db.from('sesiones_acceso').select('rol, ultima_actividad'),
    db.from('bitacora_acceso').select('id, rol, fecha, evento, detalle, distancia_km, dispositivo, ip').gte('fecha', desde).order('fecha', { ascending: false }).limit(1000),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  const ahora = Date.now();
  const ultimos = new Map<string, string>();
  const { data: ingresos } = await db.from('bitacora_acceso').select('rol, fecha').eq('evento', 'ingreso').order('fecha', { ascending: false }).limit(200);
  for (const i of ingresos || []) if (!ultimos.has(i.rol)) ultimos.set(i.rol, i.fecha);
  return resp({
    ok: true,
    radioKm: RADIO_KM,
    exigeUbicacionPiloto: EXIGIR_UBICACION_PILOTO,
    cuentas: ROLES.map((r) => {
      const x = (cuentas || []).find((k) => k.rol === r);
      return {
        rol: r,
        usuario: x?.usuario ?? null,
        nombre: x?.nombre ?? null,
        existe: !!x,
        activo: !!x?.activo,
        tieneClave: !!x?.clave_hash,
        ambito: r === 'piloto' ? leerAmbito(x?.ambito) : null,
        sesionesActivas: (sesiones || []).filter((s) => s.rol === r && ahora - new Date(s.ultima_actividad).getTime() < EN_LINEA_MS).length,
        ultimoIngreso: ultimos.get(r) ?? null,
        enlace: r === 'administrador' ? '/' : `/${r}`,
      };
    }),
    bitacora: bitacora || [],
  });
}
