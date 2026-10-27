// Límites MUNICIPALES reales de la jurisdicción MEPOY (sin inventar nada):
// DANE — Marco Geoestadístico Nacional (MGN 2020), tomado de geoBoundaries
// (COL-ADM2, licencia CC BY 4.0). Solo se extrajeron Popayán, Timbío,
// Sotará (Paispamba) y Puracé (Coconuco), simplificados a ~13 m para que el
// archivo sea liviano. Coconuco NO es un municipio: es la cabecera de Puracé.
import datos from './municipiosMepoy.json';

export type NombreMunicipio = 'Popayán' | 'Timbío' | 'Sotará' | 'Puracé';
export interface FeatureMunicipio {
  type: 'Feature';
  properties: { municipio: NombreMunicipio; nombreDane: string; shapeID: string };
  geometry: { type: 'MultiPolygon'; coordinates: [number, number][][][] };
}
export const MUNICIPIOS_MEPOY = datos as unknown as { type: 'FeatureCollection'; features: FeatureMunicipio[] };
export const FUENTE_MUNICIPIOS = 'Límites municipales: DANE MGN 2020 (vía geoBoundaries, CC BY 4.0)';

/** Cabecera de Puracé (Coconuco): 2°20′53″N 76°30′03″O. */
export const COCONUCO: [number, number] = [2.3481, -76.5008];
