import { obtenerModoAcceso } from './modoAcceso';
import { ambitoSesionActual } from '../cai/apiCai';

/**
 * ¿Aplica la restricción territorial a Popayán? Solo en el enlace de consulta
 * (/piloto) y para usuarios de ámbito 'popayan' (Estaciones Norte y Sur).
 * Los jefes (ámbito 'mepoy') ven toda la jurisdicción. El servidor aplica la
 * misma regla con el ámbito guardado en la base.
 */
export function restriccionPopayanActiva(): boolean {
  return obtenerModoAcceso() === 'piloto' && ambitoSesionActual() !== 'mepoy';
}
