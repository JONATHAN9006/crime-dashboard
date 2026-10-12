// Acceso de los COMANDANTES DE CAI (enlace /cai) — Netlify Function.
//
// Hace todo lo que no puede hacer el navegador de forma confiable:
//  · Valida usuario y contraseña (cai1 … cai10). Las contraseñas se guardan
//    solo como hash (scrypt + sal) en la tabla cai_usuarios de Supabase —
//    nunca en el código ni en config.js.
//  · Exige que la ubicación del equipo esté dentro de Popayán (radio desde
//    el centro de la ciudad, configurable con CAI_RADIO_KM).
//  · Sesión ÚNICA por usuario: si la misma clave se usa en otro equipo, la
//    sesión anterior se cierra sola (así no sirve "pasar" el usuario).
//  · Deja registro de cada ingreso, intento fallido y salida (tabla
//    cai_accesos) para el contador del administrador.
//  · Acciones de administrador (ver registros, asignar contraseñas,
//    activar/desactivar, cerrar sesión), protegidas con la misma clave de
//    actualización de siempre (UPDATE_TOKEN).
//
// Las tres tablas tienen RLS activado y SIN políticas públicas (ver
// supabase/accesos_cai.sql): la llave pública del dashboard no puede
// leerlas; solo esta función, con la llave service_role.
import type { Handler } from '@netlify/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UPDATE_TOKEN = process.env.UPDATE_TOKEN || '';
const SECRETO = process.env.CAI_SECRETO || SUPABASE_SERVICE_ROLE_KEY;
// Centro de Popayán (Parque Caldas) y radio permitido.
const CENTRO = { lat: 2.4419, lon: -76.6063 };
const RADIO_KM = Number(process.env.CAI_RADIO_KM || 15);
// "no" desactiva la exigencia de ubicación (solo para pruebas o emergencias).
const EXIGIR_UBICACION = (process.env.CAI_EXIGIR_UBICACION || 'si').toLowerCase() !== 'no';
const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const EN_LINEA_MS = 7 * 60 * 1000;
const MAX_FALLIDOS = 5;
const VENTANA_FALLIDOS_MS = 15 * 60 * 1000;

type Cuerpo = Record<string, unknown> & { accion?: string };

const resp = (cuerpo: Record<string, unknown>, statusCode = 200) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(cuerpo),
});

function normalizarUsuario(u: unknown): string {
  return String(u ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function hashClave(clave: string): string {
  const sal = randomBytes(16);
  const h = scryptSync(clave, sal, 64);
  return `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
}

function verificarClave(clave: string, guardado: string | null): boolean {
  if (!guardado) return false;
  const [tipo, salB64, hB64] = guardado.split('$');
  if (tipo !== 'scrypt' || !salB64 || !hB64) return false;
  const esperado = Buffer.from(hB64, 'base64');
  const h = scryptSync(clave, Buffer.from(salB64, 'base64'), esperado.length);
  return h.length === esperado.length && timingSafeEqual(h, esperado);
}

function firmar(datos: Record<string, unknown>): string {
  const cuerpo = Buffer.from(JSON.stringify(datos)).toString('base64url');
  const firma = createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

function leerToken(token: unknown): { u: string; s: string; exp: number } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (typeof datos.u !== 'string' || typeof datos.s !== 'string' || typeof datos.exp !== 'number') return null;
    return datos;
  } catch {
    return null;
  }
}

function distanciaKm(lat: number, lon: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat - CENTRO.lat);
  const dLon = rad(lon - CENTRO.lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(CENTRO.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function leerUbicacion(c: Cuerpo): { lat: number; lon: number; precision: number | null } | null {
  const lat = Number(c.lat);
  const lon = Number(c.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  const p = Number(c.precision);
  return { lat, lon, precision: Number.isFinite(p) ? p : null };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp({ ok: false, error: 'Método no permitido.' }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return resp({ ok: false, error: 'El acceso de los CAI aún no está configurado en el servidor (faltan las variables de Supabase en Netlify).' });
  }
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
      case 'admin_resumen':
      case 'admin_clave':
      case 'admin_estado':
      case 'admin_cerrar':
        if (!UPDATE_TOKEN || c.adminClave !== UPDATE_TOKEN) return resp({ ok: false, error: 'Clave de administrador incorrecta.' });
        return await admin(db, c);
      default:
        return resp({ ok: false, error: 'Acción no reconocida.' }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Tablas sin crear: mensaje claro para el administrador.
    if (/cai_(usuarios|sesiones|accesos)/.test(msg) && /does not exist|not find|schema cache/i.test(msg)) {
      return resp({ ok: false, error: 'Faltan las tablas de acceso de los CAI en Supabase (ejecuta supabase/accesos_cai.sql).' });
    }
    return resp({ ok: false, error: `Error del servidor: ${msg}` });
  }
};

async function registrar(db: SupabaseClient, fila: Record<string, unknown>) {
  await db.from('cai_accesos').insert(fila);
}

async function login(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  const usuario = normalizarUsuario(c.usuario);
  const clave = String(c.clave ?? '');
  const ubic = leerUbicacion(c);
  const distancia = ubic ? distanciaKm(ubic.lat, ubic.lon) : null;
  const base = { usuario: usuario || '(vacío)', lat: ubic?.lat ?? null, lon: ubic?.lon ?? null, precision_m: ubic?.precision ?? null, distancia_km: distancia, dispositivo, ip };

  const { data: u, error } = await db.from('cai_usuarios').select('usuario, nombre, clave_hash, activo').eq('usuario', usuario).maybeSingle();
  if (error) throw error;
  if (!u) {
    await registrar(db, { ...base, evento: 'fallido', detalle: 'Usuario no existe' });
    return resp({ ok: false, error: 'Usuario o contraseña incorrectos.' });
  }
  // Bloqueo temporal tras varios intentos fallidos seguidos.
  // (una contraseña nueva o una activación del administrador reinicia el conteo)
  const { data: ultAdmin } = await db.from('cai_accesos').select('fecha').eq('usuario', usuario).eq('evento', 'admin').order('fecha', { ascending: false }).limit(1).maybeSingle();
  const ventana = Date.now() - VENTANA_FALLIDOS_MS;
  const desde = new Date(Math.max(ventana, ultAdmin ? new Date(ultAdmin.fecha).getTime() + 1 : 0)).toISOString();
  const { count } = await db.from('cai_accesos').select('id', { count: 'exact', head: true }).eq('usuario', usuario).eq('evento', 'fallido').gte('fecha', desde);
  if ((count ?? 0) >= MAX_FALLIDOS) {
    await registrar(db, { ...base, evento: 'bloqueado', detalle: 'Demasiados intentos fallidos' });
    return resp({ ok: false, error: 'Demasiados intentos fallidos. Espera 15 minutos o comunícate con el administrador.' });
  }
  if (!u.activo) {
    await registrar(db, { ...base, evento: 'rechazado', detalle: 'Usuario desactivado' });
    return resp({ ok: false, error: 'Este usuario está desactivado. Comunícate con el administrador.' });
  }
  if (!u.clave_hash) {
    await registrar(db, { ...base, evento: 'rechazado', detalle: 'Sin contraseña asignada' });
    return resp({ ok: false, error: 'Este usuario todavía no tiene contraseña asignada. Comunícate con el administrador.' });
  }
  if (!verificarClave(clave, u.clave_hash)) {
    await registrar(db, { ...base, evento: 'fallido', detalle: 'Contraseña incorrecta' });
    return resp({ ok: false, error: 'Usuario o contraseña incorrectos.' });
  }
  if (EXIGIR_UBICACION) {
    if (!ubic) {
      await registrar(db, { ...base, evento: 'rechazado', detalle: `Sin ubicación (${String(c.errorUbicacion || 'no enviada')})` });
      return resp({ ok: false, error: 'Para ingresar debes permitir la ubicación del equipo. El acceso solo está habilitado dentro de Popayán.', requiereUbicacion: true });
    }
    if (distancia !== null && distancia > RADIO_KM) {
      await registrar(db, { ...base, evento: 'rechazado', detalle: `Fuera de Popayán (${distancia.toFixed(1)} km del centro)` });
      return resp({ ok: false, error: `El acceso solo está habilitado dentro de Popayán. Tu ubicación aparece a ${distancia.toFixed(1)} km del centro.` });
    }
  }
  // Sesión única: la nueva reemplaza a la anterior (si la había).
  const { data: previa } = await db.from('cai_sesiones').select('ultima_actividad, dispositivo').eq('usuario', usuario).maybeSingle();
  const reemplaza = previa && Date.now() - new Date(previa.ultima_actividad).getTime() < EN_LINEA_MS;
  const sesionId = randomBytes(16).toString('hex');
  const ahora = new Date().toISOString();
  const { error: e2 } = await db.from('cai_sesiones').upsert({
    usuario, sesion_id: sesionId, inicio: ahora, ultima_actividad: ahora, lat: ubic?.lat ?? null, lon: ubic?.lon ?? null, dispositivo, ip,
  });
  if (e2) throw e2;
  await registrar(db, { ...base, evento: 'ingreso', detalle: reemplaza ? 'Cerró una sesión que seguía abierta en otro equipo' : null });
  const exp = Date.now() + DURACION_SESION_MS;
  return resp({ ok: true, token: firmar({ u: usuario, s: sesionId, exp }), usuario, nombre: u.nombre || usuario.toUpperCase(), expira: exp });
}

async function verificar(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  const t = leerToken(c.token);
  if (!t) return resp({ ok: false, motivo: 'invalida', error: 'Sesión no válida. Vuelve a ingresar.' });
  if (Date.now() > t.exp) return resp({ ok: false, motivo: 'expirada', error: 'La sesión expiró. Vuelve a ingresar.' });
  const [{ data: ses }, { data: u }] = await Promise.all([
    db.from('cai_sesiones').select('sesion_id').eq('usuario', t.u).maybeSingle(),
    db.from('cai_usuarios').select('activo').eq('usuario', t.u).maybeSingle(),
  ]);
  if (!u || !u.activo) return resp({ ok: false, motivo: 'desactivado', error: 'Este usuario fue desactivado por el administrador.' });
  if (!ses || ses.sesion_id !== t.s) {
    return resp({ ok: false, motivo: 'otra-sesion', error: 'Tu usuario se abrió en otro equipo (o el administrador cerró la sesión). Vuelve a ingresar.' });
  }
  const ubic = leerUbicacion(c);
  if (EXIGIR_UBICACION) {
    // Ubicación denegada a mitad de la sesión = se cierra. Un fallo
    // puntual (tiempo agotado, sin señal) no la cierra.
    if (!ubic && c.errorUbicacion === 'denegada') {
      await db.from('cai_sesiones').delete().eq('usuario', t.u);
      await registrar(db, { usuario: t.u, evento: 'cerrada', detalle: 'Se desactivó el permiso de ubicación', dispositivo, ip });
      return resp({ ok: false, motivo: 'ubicacion', error: 'Se desactivó el permiso de ubicación. Para consultar el dashboard debe estar activa.' });
    }
    if (ubic) {
      const d = distanciaKm(ubic.lat, ubic.lon);
      if (d > RADIO_KM) {
        await db.from('cai_sesiones').delete().eq('usuario', t.u);
        await registrar(db, { usuario: t.u, evento: 'cerrada', detalle: `Salió de Popayán (${d.toFixed(1)} km del centro)`, lat: ubic.lat, lon: ubic.lon, precision_m: ubic.precision, distancia_km: d, dispositivo, ip });
        return resp({ ok: false, motivo: 'fuera', error: 'El dashboard solo se puede consultar dentro de Popayán.' });
      }
    }
  }
  await db.from('cai_sesiones').update({
    ultima_actividad: new Date().toISOString(),
    ...(ubic ? { lat: ubic.lat, lon: ubic.lon } : {}),
  }).eq('usuario', t.u);
  return resp({ ok: true });
}

async function salir(db: SupabaseClient, c: Cuerpo, ip: string, dispositivo: string) {
  const t = leerToken(c.token);
  if (!t) return resp({ ok: true });
  const { data: ses } = await db.from('cai_sesiones').select('sesion_id').eq('usuario', t.u).maybeSingle();
  if (ses && ses.sesion_id === t.s) {
    await db.from('cai_sesiones').delete().eq('usuario', t.u);
    await registrar(db, { usuario: t.u, evento: 'salida', detalle: null, dispositivo, ip });
  }
  return resp({ ok: true });
}

async function admin(db: SupabaseClient, c: Cuerpo) {
  if (c.accion === 'admin_clave') {
    const usuario = normalizarUsuario(c.usuario);
    const nueva = String(c.nuevaClave ?? '');
    if (nueva.length < 6) return resp({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
    const { data, error } = await db.from('cai_usuarios').update({ clave_hash: hashClave(nueva), actualizado: new Date().toISOString() }).eq('usuario', usuario).select('usuario');
    if (error) throw error;
    if (!data || data.length === 0) return resp({ ok: false, error: 'Ese usuario no existe.' });
    // Cambiar la contraseña cierra la sesión abierta con la anterior.
    await db.from('cai_sesiones').delete().eq('usuario', usuario);
    await registrar(db, { usuario, evento: 'admin', detalle: 'El administrador asignó una contraseña nueva' });
    return resp({ ok: true });
  }
  if (c.accion === 'admin_estado') {
    const usuario = normalizarUsuario(c.usuario);
    const activo = !!c.activo;
    const { error } = await db.from('cai_usuarios').update({ activo, actualizado: new Date().toISOString() }).eq('usuario', usuario);
    if (error) throw error;
    if (!activo) await db.from('cai_sesiones').delete().eq('usuario', usuario);
    await registrar(db, { usuario, evento: 'admin', detalle: activo ? 'Usuario activado' : 'Usuario desactivado' });
    return resp({ ok: true });
  }
  if (c.accion === 'admin_cerrar') {
    const usuario = normalizarUsuario(c.usuario);
    await db.from('cai_sesiones').delete().eq('usuario', usuario);
    await registrar(db, { usuario, evento: 'admin', detalle: 'El administrador cerró la sesión' });
    return resp({ ok: true });
  }
  // admin_resumen
  const dias = Math.min(Math.max(Number(c.dias) || 30, 1), 365);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const [{ data: usuarios, error: e1 }, { data: sesiones, error: e2 }, { data: accesos, error: e3 }] = await Promise.all([
    db.from('cai_usuarios').select('usuario, nombre, activo, clave_hash, actualizado').order('usuario'),
    db.from('cai_sesiones').select('usuario, inicio, ultima_actividad, dispositivo'),
    db.from('cai_accesos').select('id, usuario, fecha, evento, detalle, distancia_km, precision_m, dispositivo, ip').gte('fecha', desde).order('fecha', { ascending: false }).limit(2000),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  const ahora = Date.now();
  return resp({
    ok: true,
    radioKm: RADIO_KM,
    exigeUbicacion: EXIGIR_UBICACION,
    usuarios: (usuarios || []).map((u) => {
      const s = (sesiones || []).find((x) => x.usuario === u.usuario);
      return {
        usuario: u.usuario,
        nombre: u.nombre,
        activo: u.activo,
        tieneClave: !!u.clave_hash,
        enLinea: !!s && ahora - new Date(s.ultima_actividad).getTime() < EN_LINEA_MS,
        sesionInicio: s?.inicio ?? null,
        ultimaActividad: s?.ultima_actividad ?? null,
      };
    }),
    accesos: accesos || [],
  });
}
