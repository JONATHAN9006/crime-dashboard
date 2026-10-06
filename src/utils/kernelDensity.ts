// Kernel Density Estimation geográficamente fijo — replica el método de la
// herramienta "Densidad kernel" de ArcGIS Pro (fórmula de Silverman,
// kernel cuártico/biweight — NO un desenfoque gaussiano genérico).
//
// ES LA ÚNICA IMPLEMENTACIÓN DEL PROYECTO: la usan, sin cambiar nada más
// que los puntos de entrada, los mapas de calor de Delitos, Operatividad,
// IRISP1, Macri, RNMC, la capa temporal de archivo y las descargas de
// polígonos (exportarPoligonoMapa.ts).
//
// Parámetros (iguales para todas las capas):
//   - Radio de búsqueda (bandwidth): RADIO_BUSQUEDA_METROS = 200 m reales.
//   - Distancias: GEODÉSICAS — cada punto y cada celda se proyectan de
//     WGS84 (EPSG:4326) a una Transversa de Mercator local sobre el
//     elipsoide WGS84 (ver utils/geodesia.ts); la distancia se mide en
//     metros en esa proyección. Nada se calcula "en grados".
//   - Unidades de área: metros cuadrados. Valor de celda = densidad en
//     eventos/m²: Σ 3/(π·r²) · (1 − (d/r)²)² sobre los eventos a d ≤ r.
//   - Celda de salida: r/20 = 10 m (máx. 900 × 900 celdas).
//   - Cada evento se evalúa en su coordenada exacta (sin agruparlo antes a
//     la celda), y cada registro cuenta UNA vez: no se inventan ni se
//     duplican puntos.
//
// El resultado se calcula UNA SOLA VEZ por cambio de datos/filtros y se
// ancla al mapa como imagen georreferenciada (L.imageOverlay): el zoom solo
// escala esa imagen, nunca cambia el radio ni la clasificación.

import { maxDe, minDe } from './mathSeguro';
import { crearProyeccionMetricaLocal, esCoordenadaValida } from './geodesia';

export interface PuntoDensidad {
  lat: number;
  lon: number;
}

export interface MetadatosKernel {
  radioMetros: number;
  unidadDensidad: string;
  kernel: string;
  crs: string;
  tamanoCeldaMetros: { x: number; y: number };
  areaCeldaM2: number;
  areaAnalisisM2: number;
  columnas: number;
  filas: number;
  densidadMaxima: number; // eventos/m² en la celda más densa
  umbralMinimoFraccion: number;
  puntosUsados: number;
  puntosDescartados: number; // coordenadas nulas, (0,0) o fuera de rango
}

export interface ResultadoKernel {
  dataUrl: string; // PNG en base64, listo para L.imageOverlay
  bounds: [[number, number], [number, number]]; // [[latSur, lonOeste], [latNorte, lonEste]]
  clases: { color: string; etiqueta: string; desde: number; hasta: number }[];
  metadatos: MetadatosKernel;
}

function paletaPorDefecto(): (string | null)[] {
  return ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'];
}

/** Radio de búsqueda del kernel, en metros reales (no píxeles). */
export const RADIO_BUSQUEDA_METROS = 200;

// Los 5 puntos de corte de SIEMPRE (Muy baja/Baja/Media/Alta/Muy alta) — ya
// NO se recalculan según cuántos colores estén activos: cada banda tiene su
// color y su rango FIJOS; desactivar un color solo deja ESA banda
// transparente.
const ANCLAS_FRACCION_FIJAS = [0, 0.08, 0.22, 0.42, 0.68, 1];

// UMBRAL MÍNIMO — por debajo del 12 % del máximo la celda queda
// transparente (como la clase más baja de la simbología clasificada de
// ArcGIS, que empieza en un mínimo real y no en "cualquier rastro > 0").
const UMBRAL_MINIMO_FRACCION = 0.12;

/** Solo los puntos con coordenada utilizable (sin nulos, sin 0,0). */
export function puntosValidosParaKernel<T extends PuntoDensidad>(puntos: T[]): T[] {
  return puntos.filter((p) => esCoordenadaValida(p.lat, p.lon));
}

/**
 * Densidad (eventos/m²) en una coordenada cualquiera, con EXACTAMENTE la
 * misma fórmula, radio y proyección que la superficie — se usa para la
 * consulta al hacer clic sobre el mapa.
 */
export function densidadKernelEnPunto(puntos: PuntoDensidad[], lat: number, lon: number): { densidad: number; eventosEnRadio: number[] } {
  const proyeccion = crearProyeccionMetricaLocal(lat, lon);
  const r2 = RADIO_BUSQUEDA_METROS * RADIO_BUSQUEDA_METROS;
  const factor = 3 / (Math.PI * r2);
  let densidad = 0;
  const eventosEnRadio: number[] = [];
  puntos.forEach((p, i) => {
    if (!esCoordenadaValida(p.lat, p.lon)) return;
    const { x, y } = proyeccion.proyectar(p.lat, p.lon); // el origen (0,0) es la coordenada consultada
    const d2 = x * x + y * y;
    if (d2 > r2) return;
    const t2 = d2 / r2;
    densidad += factor * (1 - t2) ** 2;
    eventosEnRadio.push(i);
  });
  return { densidad, eventosEnRadio };
}

/**
 * Clase (0 = Muy baja … 4 = Muy alta) de un valor de densidad respecto al
 * máximo de la superficie, con los mismos cortes con los que se pinta.
 * null = por debajo del umbral (zona sin color en el mapa).
 */
export function claseDeDensidad(valor: number, maximo: number): number | null {
  if (!(maximo > 0) || valor <= maximo * UMBRAL_MINIMO_FRACCION) return null;
  const fraccion = Math.min(1, (valor / maximo - UMBRAL_MINIMO_FRACCION) / (1 - UMBRAL_MINIMO_FRACCION));
  for (let i = 0; i < ANCLAS_FRACCION_FIJAS.length - 1; i++) {
    if (fraccion >= ANCLAS_FRACCION_FIJAS[i] && fraccion <= ANCLAS_FRACCION_FIJAS[i + 1]) return i;
  }
  return ANCLAS_FRACCION_FIJAS.length - 2;
}

/**
 * Superficie de densidad (eventos/m²) sin pintar: grilla, proyección y
 * valores por celda. Separada del dibujo para poder verificarla en pruebas.
 */
export function calcularSuperficieKernel(validos: PuntoDensidad[]) {
  const lats = validos.map((p) => p.lat);
  const lons = validos.map((p) => p.lon);
  const latMin0 = minDe(lats);
  const latMax0 = maxDe(lats);
  const lonMin0 = minDe(lons);
  const lonMax0 = maxDe(lons);

  // 1) Proyección métrica (TM local WGS84) centrada en el área analizada.
  const proyeccion = crearProyeccionMetricaLocal((latMin0 + latMax0) / 2, (lonMin0 + lonMax0) / 2);

  // Margen igual al radio (en grados, calculado a partir de los METROS en
  // la proyección, con holgura) — el kernel de un punto en el borde no se
  // corta en seco.
  const metrosPorGradoLat = Math.abs(proyeccion.proyectar(proyeccion.lat0 + 0.01, proyeccion.lon0).y) / 0.01;
  const metrosPorGradoLon = Math.abs(proyeccion.proyectar(proyeccion.lat0, proyeccion.lon0 + 0.01).x) / 0.01;
  const margenLat = (RADIO_BUSQUEDA_METROS / metrosPorGradoLat) * 1.05;
  const margenLon = (RADIO_BUSQUEDA_METROS / metrosPorGradoLon) * 1.05;
  const latMin = latMin0 - margenLat;
  const latMax = latMax0 + margenLat;
  const lonMin = lonMin0 - margenLon;
  const lonMax = lonMax0 + margenLon;

  // Extensión real del área de análisis, en metros (medida en la proyección).
  const anchoMetros = Math.abs(proyeccion.proyectar(proyeccion.lat0, lonMax).x - proyeccion.proyectar(proyeccion.lat0, lonMin).x);
  const altoMetros = Math.abs(proyeccion.proyectar(latMax, proyeccion.lon0).y - proyeccion.proyectar(latMin, proyeccion.lon0).y);

  // 2) Grilla de salida: celdas de r/20 (10 m), máx. 900 × 900. La grilla
  // es regular en lat/lon porque así se ancla la imagen en Leaflet; su
  // tamaño real en metros se informa en los metadatos.
  const metrosPorCelda = Math.max(RADIO_BUSQUEDA_METROS / 20, 3);
  const COLS = Math.min(900, Math.max(60, Math.round(anchoMetros / metrosPorCelda)));
  const ROWS = Math.min(900, Math.max(40, Math.round(altoMetros / metrosPorCelda)));
  const metrosPorCeldaX = anchoMetros / COLS;
  const metrosPorCeldaY = altoMetros / ROWS;
  const gradosPorCeldaLon = (lonMax - lonMin) / COLS;
  const gradosPorCeldaLat = (latMax - latMin) / ROWS;
  const idx = (c: number, r: number) => r * COLS + c;

  // Centro de cada celda, proyectado a metros (una sola vez).
  const celdaX = new Float64Array(COLS * ROWS);
  const celdaY = new Float64Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    const lat = latMax - (r + 0.5) * gradosPorCeldaLat;
    for (let c = 0; c < COLS; c++) {
      const { x, y } = proyeccion.proyectar(lat, lonMin + (c + 0.5) * gradosPorCeldaLon);
      celdaX[idx(c, r)] = x;
      celdaY[idx(c, r)] = y;
    }
  }

  // 3) Densidad: para cada evento, se suma su kernel cuártico a cada celda
  // cuyo centro esté a ≤ 200 m (distancia en metros en la proyección).
  const r2 = RADIO_BUSQUEDA_METROS * RADIO_BUSQUEDA_METROS;
  const factorNormalizacion = 3 / (Math.PI * r2); // integra 1 sobre el círculo → unidades: eventos/m²
  const densidad = new Float64Array(COLS * ROWS);
  const alcanceCols = Math.ceil(margenLon / gradosPorCeldaLon) + 1;
  const alcanceRows = Math.ceil(margenLat / gradosPorCeldaLat) + 1;
  for (const p of validos) {
    const { x: px, y: py } = proyeccion.proyectar(p.lat, p.lon);
    const c0 = Math.floor((p.lon - lonMin) / gradosPorCeldaLon);
    const r0 = Math.floor((latMax - p.lat) / gradosPorCeldaLat);
    const cDesde = Math.max(0, c0 - alcanceCols), cHasta = Math.min(COLS - 1, c0 + alcanceCols);
    const rDesde = Math.max(0, r0 - alcanceRows), rHasta = Math.min(ROWS - 1, r0 + alcanceRows);
    for (let r = rDesde; r <= rHasta; r++) {
      for (let c = cDesde; c <= cHasta; c++) {
        const k = idx(c, r);
        const dx = celdaX[k] - px, dy = celdaY[k] - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const t2 = d2 / r2;
        densidad[k] += factorNormalizacion * (1 - t2) * (1 - t2); // fórmula de Silverman (kernel cuártico/biweight)
      }
    }
  }
  const idxCelda = (c: number, r: number) => r * COLS + c;
  return { densidad, COLS, ROWS, idx: idxCelda, latMin, latMax, lonMin, lonMax, metrosPorCeldaX, metrosPorCeldaY, anchoMetros, altoMetros, proyeccion };
}

/**
 * Calcula la superficie de Densidad Kernel (Silverman, cuártico) sobre una
 * grilla geográfica fija, la clasifica en 5 niveles por fracción del valor
 * máximo, y la renderiza como una imagen PNG anclada a coordenadas reales.
 */
export function calcularKernelDensidad(puntos: PuntoDensidad[], colores: (string | null)[] = paletaPorDefecto()): ResultadoKernel | null {
  // 0) Validación de coordenadas: fuera nulos, NaN, (0,0) y fuera de rango.
  const validos = puntosValidosParaKernel(puntos);
  if (validos.length === 0) return null;

  const { densidad, COLS, ROWS, idx, latMin, latMax, lonMin, lonMax, metrosPorCeldaX, metrosPorCeldaY, anchoMetros, altoMetros, proyeccion } = calcularSuperficieKernel(validos);

  // 3) Color por BANDAS FIJAS (ver ANCLAS_FRACCION_FIJAS más abajo) — a
  // propósito, para que el mapa se vea denso y sólido en vez de un
  // degradado "lavado". Los mismos puntos de corte de siempre (0%, 8%,
  // 22%, 42%, 68%, 100% del máximo real) definen 5 bandas; cada celda
  // toma el color de la banda a la que pertenece, sin mezclarse con la
  // vecina.
  const valoresConDensidad = Array.from(densidad).filter((v) => v > 1e-9);
  if (valoresConDensidad.length === 0) return null;

  const maxValor = maxDe(valoresConDensidad);
  // Siempre 5 bandas, siempre en el mismo rango fijo (ANCLAS_FRACCION_FIJAS)
  // — el array "colores" recibido debe tener 5 posiciones siempre (una por
  // banda); cada posición es su color de siempre, o null si el usuario la
  // desmarcó. Nunca se recalculan según cuántas estén activas — eso es
  // justo lo que causaba que apagar un color "corriera" a los demás.
  const coloresBandas: (string | null)[] = colores.length === 5 ? colores : paletaPorDefecto();

  // Bandas DISCRETAS, no interpoladas: cada valor cae en UNA banda y usa el
  // color de esa banda tal cual (sin mezclarse con la banda vecina). Así,
  // apagar "Amarillo" dejar transparente exactamente esa franja, sin que
  // "Naranja" se corra para ocupar su lugar ni se mezcle con ella.
  function colorDeBanda(v: number): [number, number, number] | null {
    const fraccion = Math.min(1, (v / maxValor - UMBRAL_MINIMO_FRACCION) / (1 - UMBRAL_MINIMO_FRACCION));
    for (let i = 0; i < ANCLAS_FRACCION_FIJAS.length - 1; i++) {
      const f0 = ANCLAS_FRACCION_FIJAS[i], f1 = ANCLAS_FRACCION_FIJAS[i + 1];
      if (fraccion >= f0 && fraccion <= f1) {
        const hex = coloresBandas[i];
        return hex ? hexARgb(hex) : null;
      }
    }
    const ultimo = coloresBandas[coloresBandas.length - 1];
    return ultimo ? hexARgb(ultimo) : null;
  }

  // La opacidad también sube de forma continua con la fracción (no por
  // bloques) — los núcleos de mayor densidad quedan más sólidos, y las
  // zonas de transición se leen más suaves, sin un salto de opacidad
  // abrupto entre niveles.
  function opacidadContinua(v: number): number {
    const fraccion = Math.min(1, (v / maxValor - UMBRAL_MINIMO_FRACCION) / (1 - UMBRAL_MINIMO_FRACCION));
    return Math.round(190 + fraccion * 65); // 190 (mínimo visible, ya bastante sólido) a 255 (opaco en el núcleo)
  }

  const canvas = document.createElement('canvas');
  canvas.width = COLS;
  canvas.height = ROWS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.createImageData(COLS, ROWS);

  const umbralMinimo = maxValor * UMBRAL_MINIMO_FRACCION;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = densidad[idx(c, r)];
      const p = (r * COLS + c) * 4;
      if (v <= umbralMinimo) {
        imgData.data[p + 3] = 0;
        continue;
      }
      const color = colorDeBanda(v);
      if (!color) {
        imgData.data[p + 3] = 0; // banda desactivada — transparente, no se repinta con la vecina
        continue;
      }
      const [rr, gg, bb] = color;
      imgData.data[p] = rr;
      imgData.data[p + 1] = gg;
      imgData.data[p + 2] = bb;
      imgData.data[p + 3] = opacidadContinua(v);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Los colores siguen siendo bandas FIJAS y discretas (no se mezclan
  // entre sí — ver ANCLAS_FRACCION_FIJAS más arriba, eso es lo que
  // mantiene el mapa "denso" y con colores sólidos, a pedido explícito).
  // Pero antes se reescalaba SIN suavizado (nearest-neighbor), y eso
  // dejaba ver el borde de cada celda de la cuadrícula como un cuadrito
  // individual al acercar el zoom — "pixelado", también a pedido
  // explícito de corregirlo. Con el suavizado de nuevo activado, los
  // bordes de cada celda se difuminan un poco entre sí (unos pocos
  // píxeles), lo suficiente para que no se vea la cuadrícula, sin que
  // el color dominante dentro de cada zona se aguade ni se mezcle con
  // el de una banda distinta.
  const canvasFinal = document.createElement('canvas');
  canvasFinal.width = COLS * 3;
  canvasFinal.height = ROWS * 3;
  const ctxFinal = canvasFinal.getContext('2d', { willReadFrequently: true })!;
  ctxFinal.imageSmoothingEnabled = true;
  ctxFinal.imageSmoothingQuality = 'high';
  ctxFinal.drawImage(canvas, 0, 0, canvasFinal.width, canvasFinal.height);

  const etiquetasClase = ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'];
  const clases = coloresBandas
    .map((color, i) => ({
      color,
      etiqueta: etiquetasClase[i],
      desde: ANCLAS_FRACCION_FIJAS[i] * maxValor,
      hasta: ANCLAS_FRACCION_FIJAS[i + 1] * maxValor,
    }))
    .filter((c): c is { color: string; etiqueta: string; desde: number; hasta: number } => c.color !== null);

  return {
    dataUrl: canvasFinal.toDataURL('image/png'),
    bounds: [[latMin, lonMin], [latMax, lonMax]],
    clases,
    metadatos: {
      radioMetros: RADIO_BUSQUEDA_METROS,
      unidadDensidad: 'eventos/m²',
      kernel: 'Cuártico (Silverman / biweight)',
      crs: `WGS84 (EPSG:4326) → ${proyeccion.proj4}`,
      tamanoCeldaMetros: { x: metrosPorCeldaX, y: metrosPorCeldaY },
      areaCeldaM2: metrosPorCeldaX * metrosPorCeldaY,
      areaAnalisisM2: anchoMetros * altoMetros,
      columnas: COLS,
      filas: ROWS,
      densidadMaxima: maxValor,
      umbralMinimoFraccion: UMBRAL_MINIMO_FRACCION,
      puntosUsados: validos.length,
      puntosDescartados: puntos.length - validos.length,
    },
  };
}

function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '');
  return [parseInt(limpio.slice(0, 2), 16), parseInt(limpio.slice(2, 4), 16), parseInt(limpio.slice(4, 6), 16)];
}
