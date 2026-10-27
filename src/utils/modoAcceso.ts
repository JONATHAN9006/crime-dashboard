// Detecta el MODO DE ACCESO a partir de la URL. Solo existen TRES enlaces:
//   "/"         → administrador (usuario y contraseña: accesoAdmin)
//   "/interno"  → cuenta interna (usuario y contraseña: accesoCuentas)
//   "/piloto"   → cuenta piloto  (usuario y contraseña: accesoCuentas)
// El enlace solo elige QUÉ PANTALLA DE INGRESO se muestra; los permisos los
// decide el servidor según la cuenta con la que se ingresó (nunca la ruta).
// Cualquier otra ruta (p. ej. las antiguas /jefe o /cai) lleva a "/".
export type ModoAcceso = 'interno' | 'piloto' | null;

export function obtenerModoAcceso(): ModoAcceso {
  if (typeof window === 'undefined') return null;
  const ruta = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  if (ruta === '/interno') return 'interno';
  if (ruta === '/piloto') return 'piloto';
  return null;
}

/** ¿La ruta actual es uno de los tres enlaces válidos? */
export function rutaValida(): boolean {
  if (typeof window === 'undefined') return true;
  const ruta = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  return ruta === '' || ruta === '/interno' || ruta === '/piloto';
}
