// Detecta el MODO DE ACCESO a partir de la URL — /jefe, /interno, /cai, o
// ninguno (la ruta raíz de siempre, cuyo comportamiento NO cambia).
//
// /jefe e /interno son control de PRESENTACIÓN (sin contraseña). /cai es
// distinto: exige usuario y contraseña de cada comandante de CAI, validados
// en el servidor (netlify/functions/accesoCai.ts) — ver cai/PuertaCai.tsx.
//
// /piloto: prueba piloto de los comandantes de las Estaciones Norte y Sur
// (perfil consulta_piloto). Mismo ingreso con usuario y contraseña que /cai,
// solo 6 módulos y todo lo geográfico restringido a Popayán.
export type ModoAcceso = 'jefe' | 'interno' | 'cai' | 'piloto' | null;

export function obtenerModoAcceso(): ModoAcceso {
  if (typeof window === 'undefined') return null;
  const ruta = window.location.pathname.toLowerCase();
  if (ruta === '/jefe' || ruta.startsWith('/jefe/')) return 'jefe';
  if (ruta === '/interno' || ruta.startsWith('/interno/')) return 'interno';
  if (ruta === '/cai' || ruta.startsWith('/cai/')) return 'cai';
  if (ruta === '/piloto' || ruta.startsWith('/piloto/')) return 'piloto';
  return null;
}
