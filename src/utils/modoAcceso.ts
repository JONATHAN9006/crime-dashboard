// Detecta el MODO DE ACCESO a partir de la URL — /jefe, /interno, /cai, o
// ninguno (la ruta raíz de siempre, cuyo comportamiento NO cambia).
//
// /jefe e /interno son control de PRESENTACIÓN (sin contraseña). /cai es
// distinto: exige usuario y contraseña de cada comandante de CAI, validados
// en el servidor (netlify/functions/accesoCai.ts) — ver cai/PuertaCai.tsx.
export type ModoAcceso = 'jefe' | 'interno' | 'cai' | null;

export function obtenerModoAcceso(): ModoAcceso {
  if (typeof window === 'undefined') return null;
  const ruta = window.location.pathname.toLowerCase();
  if (ruta === '/jefe' || ruta.startsWith('/jefe/')) return 'jefe';
  if (ruta === '/interno' || ruta.startsWith('/interno/')) return 'interno';
  if (ruta === '/cai' || ruta.startsWith('/cai/')) return 'cai';
  return null;
}
