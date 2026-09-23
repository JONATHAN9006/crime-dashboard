// Punto-en-polígono (ray-casting) — sin depender de ninguna librería nueva.
// Soporta geometrías GeoJSON "Polygon" y "MultiPolygon" (con o sin huecos:
// el primer anillo de cada polígono es el borde exterior, los siguientes
// son huecos que se restan).
type Anillo = [number, number][]; // [lon, lat][]

function puntoEnAnillo(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const interseca = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (interseca) dentro = !dentro;
  }
  return dentro;
}

function puntoEnPoligonoSimple(lon: number, lat: number, anillos: Anillo[]): boolean {
  if (anillos.length === 0) return false;
  if (!puntoEnAnillo(lon, lat, anillos[0])) return false; // fuera del borde exterior
  for (let i = 1; i < anillos.length; i++) {
    if (puntoEnAnillo(lon, lat, anillos[i])) return false; // cae en un hueco
  }
  return true;
}

/**
 * feature: un GeoJSON Feature (Polygon/MultiPolygon) — o, para verificar
 * pertenencia a VARIAS zonas a la vez (ej. todos los cuadrantes de un CAI
 * filtrado), una FeatureCollection con varios de esos features.
 *
 * Escrita de forma ITERATIVA (una pila propia) a propósito, no recursiva —
 * confirmado en producción: con ciertas capas (una FeatureCollection cuyos
 * "features" resultan ser, a su vez, más FeatureCollections anidadas —
 * pasó justo con una capa de municipios cargada como respaldo de
 * Estación), la versión recursiva original llegaba a "Maximum call stack
 * size exceeded" y tumbaba toda la página. Con una pila explícita, sin
 * importar qué tan anidada venga la geometría, nunca se desborda la pila
 * de llamadas de JavaScript.
 */
export function puntoEnFeatureGeoJSON(lon: number, lat: number, feature: any): boolean {
  const pendientes: any[] = [feature];
  while (pendientes.length > 0) {
    const actual = pendientes.pop();
    if (!actual) continue;
    if (actual.type === 'FeatureCollection') {
      for (const f of actual.features || []) pendientes.push(f);
      continue;
    }
    const geom = actual.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon' && puntoEnPoligonoSimple(lon, lat, geom.coordinates)) return true;
    if (geom.type === 'MultiPolygon' && geom.coordinates.some((poligono: Anillo[]) => puntoEnPoligonoSimple(lon, lat, poligono))) return true;
  }
  return false;
}
