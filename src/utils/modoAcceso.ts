// Detecta el MODO DE ACCESO a partir de la URL — /jefe, /interno, o ninguno
// (la ruta raíz de siempre, cuyo comportamiento NO cambia con este sistema).
//
// IMPORTANTE: esto es control de PRESENTACIÓN, no de seguridad. No hay
// contraseña ni autenticación real detrás de /jefe — cualquiera que
// conozca la URL puede verla iguel que /interno. Nunca se debe usar para
// proteger información sensible.
export type ModoAcceso = 'jefe' | 'interno' | null;

export function obtenerModoAcceso(): ModoAcceso {
  if (typeof window === 'undefined') return null;
  const ruta = window.location.pathname;
  if (ruta === '/jefe' || ruta.startsWith('/jefe/')) return 'jefe';
  if (ruta === '/interno' || ruta.startsWith('/interno/')) return 'interno';
  return null;
}
