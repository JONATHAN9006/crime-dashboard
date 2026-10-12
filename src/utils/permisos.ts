import { DASHBOARD_ACCESS, type AccesoHerramientas } from '../config/dashboardAccess';
import { obtenerModoAcceso } from './modoAcceso';
import { esModoConsulta } from './modoConsulta';

/** ¿Está habilitada esta herramienta en el modo de acceso actual? (ruta raíz = todo, como siempre) */
export function tieneAcceso(clave: keyof AccesoHerramientas): boolean {
  const modo = obtenerModoAcceso();
  return !modo || DASHBOARD_ACCESS[modo][clave];
}

/** Solo lectura: ?vista=consulta de siempre, o cualquier modo sin "actualizarInformacion" (/cai). */
export function esSoloConsulta(): boolean {
  return esModoConsulta() || !tieneAcceso('actualizarInformacion');
}

export function puedeDescargar(): boolean {
  return tieneAcceso('descargas');
}
