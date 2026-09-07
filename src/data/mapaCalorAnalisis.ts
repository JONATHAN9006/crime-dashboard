// Análisis de densidad y coincidencia geográfica entre dos fuentes de puntos
// (Delitos e IRISP1), calculadas siempre por separado — nunca se combinan
// los registros de una fuente con los de la otra en un mismo conteo.

export interface PuntoSimple {
  lat: number;
  lon: number;
}

export interface CeldaComparativa {
  lat: number; // centro de la celda
  lon: number;
  casosDelitos: number;
  casosIrisp1: number;
  // Intensidad normalizada 0-1 respecto al máximo de SU PROPIA fuente — así
  // una fuente con 5.000 puntos y otra con 100 son comparables: lo que
  // importa es qué tan concentrado está CADA UNA en esa celda relativo a su
  // propio punto más caliente, no el conteo bruto.
  intensidadDelitos: number;
  intensidadIrisp1: number;
  // "Correspondencia espacial" = el MÍNIMO de las dos intensidades
  // normalizadas, en %. Es 100% solo si la celda es, a la vez, el punto más
  // caliente de AMBAS fuentes; es 0% si cualquiera de las dos no tiene
  // presencia ahí. Este es el criterio: una celda no puede llamarse "de
  // correspondencia" si una de las dos fuentes casi no tiene registros ahí,
  // sin importar qué tan fuerte esté la otra.
  coincidenciaPct: number;
  clasificacion: 'alta' | 'media' | 'baja';
}

// Tamaño de celda en grados — aprox. 0.003° ≈ 330m en latitudes de Colombia,
// un tamaño razonable para "sector/cuadra" sin ser ni demasiado fino (ruido)
// ni demasiado grueso (perder la localización).
const TAMANO_CELDA = 0.003;

function claveCelda(lat: number, lon: number): string {
  const fila = Math.round(lat / TAMANO_CELDA);
  const col = Math.round(lon / TAMANO_CELDA);
  return `${fila}:${col}`;
}

/**
 * Construye la grilla comparativa entre dos fuentes de puntos, calculando
 * para cada celda ocupada por AL MENOS UNA de las dos fuentes: cuántos casos
 * tiene cada una, su intensidad normalizada, y el % de coincidencia.
 *
 * IMPORTANTE: los puntos de `puntosDelitos` y `puntosIrisp1` se cuentan
 * siempre por separado — este análisis nunca fusiona ambas listas en un
 * único conteo, precisamente para poder comparar una fuente contra la otra.
 */
export function construirGrillaComparativa(puntosDelitos: PuntoSimple[], puntosIrisp1: PuntoSimple[]): CeldaComparativa[] {
  const celdas = new Map<string, { lat: number; lon: number; casosDelitos: number; casosIrisp1: number }>();

  function acumular(puntos: PuntoSimple[], campo: 'casosDelitos' | 'casosIrisp1') {
    for (const p of puntos) {
      const clave = claveCelda(p.lat, p.lon);
      let celda = celdas.get(clave);
      if (!celda) {
        // El centro de la celda se fija a la grilla (no al primer punto que
        // cae en ella), para que celdas vecinas de ambas fuentes coincidan
        // exactamente cuando corresponde al mismo sector geográfico.
        const fila = Math.round(p.lat / TAMANO_CELDA);
        const col = Math.round(p.lon / TAMANO_CELDA);
        celda = { lat: fila * TAMANO_CELDA, lon: col * TAMANO_CELDA, casosDelitos: 0, casosIrisp1: 0 };
        celdas.set(clave, celda);
      }
      celda[campo] += 1;
    }
  }
  acumular(puntosDelitos, 'casosDelitos');
  acumular(puntosIrisp1, 'casosIrisp1');

  const maxDelitos = Math.max(1, ...Array.from(celdas.values()).map((c) => c.casosDelitos));
  const maxIrisp1 = Math.max(1, ...Array.from(celdas.values()).map((c) => c.casosIrisp1));

  return Array.from(celdas.values()).map((c) => {
    const intensidadDelitos = c.casosDelitos / maxDelitos;
    const intensidadIrisp1 = c.casosIrisp1 / maxIrisp1;
    const coincidenciaPct = Math.min(intensidadDelitos, intensidadIrisp1) * 100;
    const clasificacion: CeldaComparativa['clasificacion'] =
      coincidenciaPct >= 66 ? 'alta' : coincidenciaPct >= 33 ? 'media' : 'baja';
    return { ...c, intensidadDelitos, intensidadIrisp1, coincidenciaPct, clasificacion };
  });
}

export const TAMANO_CELDA_METROS_APROX = 330;
