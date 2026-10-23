// ¿Un punto cae dentro de la jurisdicción MEPOY (Popayán, Timbío, Sotará y
// Puracé)? Se usa para NO dibujar en el mapa coordenadas con errores de
// digitación (p. ej. una longitud -79,8 en vez de -76,8, que deja el punto en
// el océano Pacífico). El recuadro sale de los límites municipales oficiales
// (DANE, data/municipiosMepoy) más un margen de ~3 km; los registros siguen
// contando en tablas y totales, solo no se ubican en el mapa.
import { MUNICIPIOS_MEPOY } from '../data/municipiosMepoy';

const MARGEN = 0.03;
const LIMITES = (() => {
  let sur = Infinity, oeste = Infinity, norte = -Infinity, este = -Infinity;
  for (const f of MUNICIPIOS_MEPOY.features) {
    for (const pol of f.geometry.coordinates) for (const anillo of pol) for (const [lon, lat] of anillo) {
      if (lat < sur) sur = lat; if (lat > norte) norte = lat; if (lon < oeste) oeste = lon; if (lon > este) este = lon;
    }
  }
  return { sur: sur - MARGEN, norte: norte + MARGEN, oeste: oeste - MARGEN, este: este + MARGEN };
})();

export function dentroDeMepoy(lat: unknown, lon: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return false;
  return la >= LIMITES.sur && la <= LIMITES.norte && lo >= LIMITES.oeste && lo <= LIMITES.este;
}

export const LIMITES_MEPOY = LIMITES;
