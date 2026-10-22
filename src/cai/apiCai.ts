// Cliente del backend de acceso de los CAI (netlify/functions/accesoCai.ts).
const FUNCION = '/.netlify/functions/accesoCai';
import { obtenerModoAcceso } from '../utils/modoAcceso';

// Cada enlace guarda su PROPIA sesión: entrar por /piloto no reutiliza una
// sesión de /cai (ni al revés). El perfil real lo valida el servidor.
const perfilDelEnlace = () => (obtenerModoAcceso() === 'piloto' ? 'consulta_piloto' : 'cai');
const claveSesion = () => (perfilDelEnlace() === 'consulta_piloto' ? 'mepoy-piloto-sesion' : 'mepoy-cai-sesion');
const CLAVE_ADMIN = 'mepoy-admin-cai';

export interface SesionCai { token: string; usuario: string; nombre: string; expira: number }
export type ErrorUbicacion = 'denegada' | 'tiempo' | 'no-disponible';
export type Ubicacion = { lat: number; lon: number; precision: number } | { error: ErrorUbicacion };

async function llamar<T = Record<string, unknown>>(cuerpo: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  let r: Response;
  try {
    r = await fetch(FUNCION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  } catch {
    return { ok: false, error: 'Sin conexión con el servidor. Revisa el internet e intenta de nuevo.', sinConexion: true } as unknown as T & { ok: boolean; error?: string };
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

const datosUbicacion = (u: Ubicacion) => ('error' in u ? { errorUbicacion: u.error } : { lat: u.lat, lon: u.lon, precision: u.precision });

export function leerSesionGuardada(): SesionCai | null {
  try {
    const s = JSON.parse(localStorage.getItem(claveSesion()) || 'null');
    if (s && typeof s.token === 'string' && s.expira > Date.now()) return s;
  } catch { /* sin almacenamiento */ }
  return null;
}
function guardarSesion(s: SesionCai | null) {
  try { if (s) localStorage.setItem(claveSesion(), JSON.stringify(s)); else localStorage.removeItem(claveSesion()); } catch { /* sin almacenamiento */ }
}

export async function ingresar(usuario: string, clave: string, ubic: Ubicacion) {
  const r = await llamar<{ token?: string; usuario?: string; nombre?: string; expira?: number; requiereUbicacion?: boolean }>({
    accion: 'login', perfil: perfilDelEnlace(), usuario, clave, ...datosUbicacion(ubic), dispositivo: navigator.userAgent,
  });
  if (r.ok && r.token) guardarSesion({ token: r.token, usuario: r.usuario!, nombre: r.nombre!, expira: r.expira! });
  return r;
}

export async function verificarSesion(s: SesionCai, ubic: Ubicacion) {
  const r = await llamar<{ motivo?: string; sinConexion?: boolean }>({ accion: 'verificar', perfil: perfilDelEnlace(), token: s.token, ...datosUbicacion(ubic), dispositivo: navigator.userAgent });
  if (!r.ok && !r.sinConexion) guardarSesion(null);
  return r;
}

export async function salirCai(s: SesionCai | null) {
  guardarSesion(null);
  if (s) await llamar({ accion: 'salir', token: s.token, dispositivo: navigator.userAgent });
}

/** Token de la sesión del piloto (para netlify/functions/datosPiloto). */
export function tokenSesionActual(): string | null {
  return leerSesionGuardada()?.token ?? null;
}

/** Registra en la bitácora del servidor un evento de seguridad (código fijo). */
export function reportarEventoSeguridad(codigo: 'geo_denegado' | 'geo_fuera') {
  const token = tokenSesionActual();
  if (!token) return;
  llamar({ accion: 'evento', codigo, token, dispositivo: navigator.userAgent }).catch(() => { /* best-effort */ });
}

// ── Administrador ────────────────────────────────────────────────────────
export interface UsuarioCai { usuario: string; nombre: string; perfil?: 'cai' | 'consulta_piloto'; activo: boolean; tieneClave: boolean; enLinea: boolean; sesionInicio: string | null; ultimaActividad: string | null }
export interface AccesoCai { id: number; usuario: string; fecha: string; evento: string; detalle: string | null; distancia_km: number | null; precision_m: number | null; dispositivo: string | null; ip: string | null }
export interface ResumenAccesos { usuarios: UsuarioCai[]; accesos: AccesoCai[]; radioKm: number; exigeUbicacion: boolean }

export function leerClaveAdmin(): string {
  try { return sessionStorage.getItem(CLAVE_ADMIN) || ''; } catch { return ''; }
}
export function guardarClaveAdmin(clave: string | null) {
  try { if (clave) sessionStorage.setItem(CLAVE_ADMIN, clave); else sessionStorage.removeItem(CLAVE_ADMIN); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('mepoy-admin-cai'));
}
export function adminResumen(adminClave: string, dias = 30) {
  return llamar<Partial<ResumenAccesos>>({ accion: 'admin_resumen', adminClave, dias });
}
export function adminAsignarClave(adminClave: string, usuario: string, nuevaClave: string) {
  return llamar({ accion: 'admin_clave', adminClave, usuario, nuevaClave });
}
export function adminCambiarEstado(adminClave: string, usuario: string, activo: boolean) {
  return llamar({ accion: 'admin_estado', adminClave, usuario, activo });
}
export function adminCerrarSesion(adminClave: string, usuario: string) {
  return llamar({ accion: 'admin_cerrar', adminClave, usuario });
}
