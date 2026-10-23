// Cliente de las cuentas de acceso del S2IP (netlify/functions/accesoCuentas.ts).
// Tres cuentas, tres enlaces: administrador "/", interno "/interno", piloto "/piloto".
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { borrarCopiasConsulta } from '../data/storage';

const FUNCION = '/.netlify/functions/accesoCuentas';
const CLAVE_SESION_ADMIN = 'mepoy-admin-sesion'; // la guarda PuertaAdmin

export type RolSesion = 'interno' | 'piloto';
export type RolCuenta = 'administrador' | RolSesion;
export type AmbitoConsulta = 'popayan' | 'mepoy';
export interface SesionCuenta { token: string; usuario: string; nombre: string; expira: number; rol: RolSesion; ambito?: AmbitoConsulta }
export type ErrorUbicacion = 'denegada' | 'tiempo' | 'no-disponible';
export type Ubicacion = { lat: number; lon: number; precision: number } | { error: ErrorUbicacion };

/** Rol de la cuenta del enlace actual (null en "/": administrador). */
export function rolDelEnlace(): RolSesion | null {
  const m = obtenerModoAcceso();
  return m === 'interno' || m === 'piloto' ? m : null;
}
// Cada enlace guarda su PROPIA sesión.
const claveSesion = () => `mepoy-sesion-${rolDelEnlace() ?? 'ninguna'}`;

async function llamar<T = Record<string, unknown>>(cuerpo: Record<string, unknown>): Promise<T & { ok: boolean; error?: string; sinConexion?: boolean; motivo?: string }> {
  let r: Response;
  try {
    r = await fetch(FUNCION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor. Revisa el internet e intenta de nuevo.', sinConexion: true } as T & { ok: boolean; error?: string; sinConexion?: boolean };
  }
  try {
    return await r.json();
  } catch {
    return { ok: false, error: `El servidor de acceso no respondió correctamente (HTTP ${r.status}).` } as T & { ok: boolean; error?: string };
  }
}

export function obtenerUbicacion(timeoutMs = 15000): Promise<Ubicacion> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve({ error: 'no-disponible' }); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }),
      (e) => resolve({ error: e.code === e.PERMISSION_DENIED ? 'denegada' : e.code === e.TIMEOUT ? 'tiempo' : 'no-disponible' }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
const datosUbicacion = (u: Ubicacion | null) => (!u ? {} : 'error' in u ? { errorUbicacion: u.error } : { lat: u.lat, lon: u.lon, precision: u.precision });

export function leerSesionGuardada(): SesionCuenta | null {
  if (!rolDelEnlace()) return null;
  try {
    const s = JSON.parse(localStorage.getItem(claveSesion()) || 'null');
    if (s && typeof s.token === 'string' && s.expira > Date.now() && s.rol === rolDelEnlace()) return s;
  } catch { /* sin almacenamiento */ }
  return null;
}
function guardarSesion(s: SesionCuenta | null) {
  try { if (s) localStorage.setItem(claveSesion(), JSON.stringify(s)); else localStorage.removeItem(claveSesion()); } catch { /* sin almacenamiento */ }
}

export async function ingresar(usuario: string, clave: string, ubic: Ubicacion | null) {
  const rol = rolDelEnlace();
  const r = await llamar<{ token?: string; usuario?: string; nombre?: string; expira?: number; ambito?: AmbitoConsulta; requiereUbicacion?: boolean }>({
    accion: 'login', rol, usuario, clave, ...datosUbicacion(ubic), dispositivo: navigator.userAgent,
  });
  if (r.ok && r.token && rol) guardarSesion({ token: r.token, usuario: r.usuario!, nombre: r.nombre!, expira: r.expira!, rol, ambito: r.ambito === 'popayan' ? 'popayan' : 'mepoy' });
  return r;
}

export async function verificarSesion(s: SesionCuenta, ubic: Ubicacion | null) {
  const r = await llamar<{ ambito?: AmbitoConsulta }>({ accion: 'verificar', rol: s.rol, token: s.token, ...datosUbicacion(ubic), dispositivo: navigator.userAgent });
  if (!r.ok && !r.sinConexion) guardarSesion(null);
  // El servidor confirma el ámbito en cada verificación (si el administrador lo cambió, se actualiza).
  if (r.ok && r.ambito) { const actual = leerSesionGuardada(); if (actual && actual.token === s.token && actual.ambito !== r.ambito) guardarSesion({ ...actual, ambito: r.ambito }); }
  return r;
}

export async function salirCuenta(s: SesionCuenta | null) {
  guardarSesion(null);
  // Al cerrar sesión no queda copia de la información en el equipo.
  await borrarCopiasConsulta();
  if (s) await llamar({ accion: 'salir', token: s.token, dispositivo: navigator.userAgent });
}

/**
 * Ámbito de la cuenta piloto. Solo decide qué restricciones VISUALES aplica
 * el navegador; los datos ya llegan recortados por el servidor según el
 * ámbito guardado en la base (cambiarlo aquí no da acceso a nada más).
 */
export function ambitoSesionActual(): AmbitoConsulta {
  return leerSesionGuardada()?.ambito === 'popayan' ? 'popayan' : 'mepoy';
}

/** Token del administrador (lo guarda PuertaAdmin al ingresar). */
export function tokenAdmin(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION_ADMIN) || 'null');
    if (s && typeof s.token === 'string' && s.expira > Date.now()) return s.token;
  } catch { /* sin almacenamiento */ }
  return null;
}

/** Token con el que se piden los datos: el del administrador en "/", el de la sesión en /interno y /piloto. */
export function tokenSesionActual(): string | null {
  return rolDelEnlace() ? leerSesionGuardada()?.token ?? null : tokenAdmin();
}

/** Registra en la bitácora del servidor un evento de seguridad (código fijo). */
export function reportarEventoSeguridad(codigo: 'geo_denegado' | 'geo_fuera') {
  const token = rolDelEnlace() ? leerSesionGuardada()?.token : null;
  if (!token) return;
  llamar({ accion: 'evento', codigo, token, dispositivo: navigator.userAgent }).catch(() => { /* best-effort */ });
}

// ── Panel «Cuentas de acceso» (solo administrador) ──────────────────────
export interface CuentaAcceso {
  rol: RolCuenta; usuario: string | null; nombre: string | null; existe: boolean; activo: boolean; tieneClave: boolean;
  ambito: AmbitoConsulta | null; sesionesActivas: number; ultimoIngreso: string | null; enlace: string;
}
export interface EventoBitacora { id: number; rol: string; fecha: string; evento: string; detalle: string | null; distancia_km: number | null; dispositivo: string | null; ip: string | null }
export interface ResumenCuentas { cuentas: CuentaAcceso[]; bitacora: EventoBitacora[]; radioKm: number; exigeUbicacionPiloto: boolean }

const conAdmin = (cuerpo: Record<string, unknown>) => llamar({ ...cuerpo, adminToken: tokenAdmin() });
export const adminResumen = (dias = 30) => conAdmin({ accion: 'admin_resumen', dias }) as Promise<Partial<ResumenCuentas> & { ok: boolean; error?: string }>;
export const adminAsignarClave = (rol: RolCuenta, nuevaClave: string) => conAdmin({ accion: 'admin_clave', rol, nuevaClave });
export const adminCambiarEstado = (rol: RolSesion, activo: boolean) => conAdmin({ accion: 'admin_estado', rol, activo });
export const adminCambiarAmbito = (ambito: AmbitoConsulta) => conAdmin({ accion: 'admin_ambito', ambito });
export const adminCerrarSesiones = (rol: RolSesion) => conAdmin({ accion: 'admin_cerrar', rol });
