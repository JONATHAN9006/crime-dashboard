// Geodesia para los cálculos espaciales del mapa (Kernel Density).
//
// Sistema de entrada: WGS84 / EPSG:4326 (latitud, longitud en grados).
//
// Para medir distancias y áreas en METROS, los puntos se llevan a una
// proyección métrica: Transversa de Mercator sobre el elipsoide WGS84,
// con el meridiano central y la latitud de origen en el centro del área
// analizada y factor de escala k0 = 1 (una "TM local", el mismo principio
// de UTM o de MAGNA-SIRGAS Origen Nacional — EPSG:9377 —, pero centrada en
// Popayán). Centrarla en la zona de estudio hace que la deformación de
// escala sea prácticamente nula: a 10 km del centro, el error de distancia
// es del orden de 1 parte por millón (≈ 0,2 mm en los 200 m del kernel).
// Por comparación, EPSG:9377 tiene su meridiano central en −73°, a ~3,6°
// de Popayán, y ahí su escala ya se desvía ≈ 0,12 %.
//
// Fórmulas: Snyder, J. P. (1987), "Map Projections — A Working Manual",
// USGS Professional Paper 1395, ecuaciones 8-9 a 8-11 (TM elipsoidal).
// Validadas contra PROJ (pyproj, "+proj=tmerc +ellps=WGS84") — ver
// geodesia.test.ts.

const A_WGS84 = 6_378_137; // semieje mayor (m)
const F_WGS84 = 1 / 298.257223563; // achatamiento
const E2 = F_WGS84 * (2 - F_WGS84); // excentricidad²
const EP2 = E2 / (1 - E2); // segunda excentricidad²
const GRAD = Math.PI / 180;

function arcoMeridiano(phi: number): number {
  const e4 = E2 * E2, e6 = e4 * E2;
  return A_WGS84 * (
    (1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi
    - ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi)
    + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi)
    - ((35 * e6) / 3072) * Math.sin(6 * phi)
  );
}

export interface ProyeccionMetrica {
  /** Latitud/longitud de origen (grados) de la proyección. */
  lat0: number;
  lon0: number;
  /** WGS84 (grados) → metros (x al este, y al norte) en la TM local. */
  proyectar: (lat: number, lon: number) => { x: number; y: number };
  /** Descripción PROJ equivalente, para dejarla documentada/auditable. */
  proj4: string;
}

/** Transversa de Mercator local (k0 = 1) centrada en (lat0, lon0). */
export function crearProyeccionMetricaLocal(lat0: number, lon0: number): ProyeccionMetrica {
  const M0 = arcoMeridiano(lat0 * GRAD);
  const proyectar = (lat: number, lon: number) => {
    const phi = lat * GRAD;
    const sen = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi);
    const N = A_WGS84 / Math.sqrt(1 - E2 * sen * sen);
    const T = tan * tan;
    const C = EP2 * cos * cos;
    const A = (lon - lon0) * GRAD * cos;
    const A2 = A * A, A3 = A2 * A, A4 = A3 * A, A5 = A4 * A, A6 = A5 * A;
    const x = N * (A + ((1 - T + C) * A3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * A5) / 120);
    const y = arcoMeridiano(phi) - M0 + N * tan * (A2 / 2 + ((5 - T + 9 * C + 4 * C * C) * A4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * A6) / 720);
    return { x, y };
  };
  return {
    lat0,
    lon0,
    proyectar,
    proj4: `+proj=tmerc +lat_0=${lat0.toFixed(6)} +lon_0=${lon0.toFixed(6)} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m`,
  };
}

/**
 * Distancia geodésica sobre el elipsoide WGS84 (fórmula inversa de
 * Vincenty), en metros. Se usa para validar la proyección y para medir
 * distancias puntuales; el kernel usa la proyección (equivalente a escala
 * urbana y mucho más rápida sobre miles de celdas).
 */
export function distanciaGeodesicaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const b = A_WGS84 * (1 - F_WGS84);
  const L = (lon2 - lon1) * GRAD;
  const U1 = Math.atan((1 - F_WGS84) * Math.tan(lat1 * GRAD));
  const U2 = Math.atan((1 - F_WGS84) * Math.tan(lat2 * GRAD));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1), sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lambda = L, iter = 0;
  let sinSigma = 0, cosSigma = 0, sigma = 0, cos2Alpha = 0, cos2SigmaM = 0;
  for (;;) {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return 0; // puntos coincidentes
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cos2Alpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alpha : 0;
    const C = (F_WGS84 / 16) * cos2Alpha * (4 + F_WGS84 * (4 - 3 * cos2Alpha));
    const anterior = lambda;
    lambda = L + (1 - C) * F_WGS84 * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - anterior) < 1e-12 || ++iter > 200) break;
  }
  const u2 = (cos2Alpha * (A_WGS84 * A_WGS84 - b * b)) / (b * b);
  const Acoef = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const Bcoef = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const deltaSigma = Bcoef * sinSigma * (cos2SigmaM + (Bcoef / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (Bcoef / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return b * Acoef * (sigma - deltaSigma);
}

/**
 * Coordenada utilizable para análisis espacial: numérica, finita, dentro
 * de los rangos WGS84 y distinta de (0, 0) — el "punto nulo" que dejan
 * muchas exportaciones cuando la celda venía vacía.
 */
export function esCoordenadaValida(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}
