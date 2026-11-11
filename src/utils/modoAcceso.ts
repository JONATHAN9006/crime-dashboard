// Detecta el MODO DE ACCESO a partir de la URL. Solo existen TRES enlaces:
//   "/"         → administrador (usuario y contraseña: accesoAdmin)
//   RUTA_INTERNO (config/rutasAcceso.ts, antes "/interno") → cuenta interna (usuario y contraseña: accesoCuentas)
//   "/piloto"   → cuenta piloto  (usuario y contraseña: accesoCuentas)
// El enlace solo elige QUÉ PANTALLA DE INGRESO se muestra; los permisos los
// decide el servidor según la cuenta con la que se ingresó (nunca la ruta).
// Cualquier otra ruta (p. ej. la antigua /interno, /jefe o /cai) muestra «Página no disponible».
import { RUTA_INTERNO, RUTA_PILOTO } from '../config/rutasAcceso';

export type ModoAcceso = 'interno' | 'piloto' | null;

export function obtenerModoAcceso(): ModoAcceso {
  if (typeof window === 'undefined') return null;
  const ruta = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  if (ruta === RUTA_INTERNO) return 'interno';
  if (ruta === RUTA_PILOTO) return 'piloto';
  return null;
}

/** ¿La ruta actual es uno de los tres enlaces válidos? */
export function rutaValida(): boolean {
  if (typeof window === 'undefined') return true;
  const ruta = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  return ruta === '' || ruta === '/index.html' || ruta === RUTA_INTERNO || ruta === RUTA_PILOTO;
}
