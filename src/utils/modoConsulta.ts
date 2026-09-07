// Modo consulta / "vista del jefe": se activa agregando ?vista=consulta al
// final del enlace normal del dashboard (ej.
// https://dashboard-cieps.netlify.app/?vista=consulta). En este modo:
//   - El sidebar solo muestra las páginas de solo lectura permitidas.
//   - No aparece ningún botón de cargar, sincronizar, actualizar, descargar
//     ni exportar en ninguna pantalla.
//   - Los datos se siguen leyendo del mismo servidor central en vivo, así
//     que se actualizan solos cuando se sube información nueva — es
//     literalmente el mismo dashboard, solo que sin los controles de edición.
// Es una sola URL para compartir con los jefes: no requiere una carpeta ni
// un despliegue aparte en Netlify.
export function esModoConsulta(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('vista') === 'consulta';
}
