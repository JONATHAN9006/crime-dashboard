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

/** feature: un GeoJSON Feature con geometry.type "Polygon" o "MultiPolygon". */
export function puntoEnFeatureGeoJSON(lon: number, lat: number, feature: any): boolean {
  const geom = feature?.geometry;
  if (!geom) return false;
  if (geom.type === 'Polygon') return puntoEnPoligonoSimple(lon, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((poligono: Anillo[]) => puntoEnPoligonoSimple(lon, lat, poligono));
  return false;
}
