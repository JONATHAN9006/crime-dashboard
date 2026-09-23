// Kernel Density Estimation geográficamente fijo — replica el método REAL
// de la herramienta "Densidad kernel" de ArcGIS Pro (fórmula de Silverman,
// kernel cuártico/biweight — NO un desenfoque gaussiano genérico), con los
// mismos parámetros que ya se usan en ArcGIS para este análisis:
//   - Radio de búsqueda: 250 metros.
//   - Unidades de área: metros cuadrados.
//   - Valores de celda de salida: densidades.
//   - Método: geodésico (la distancia real considera la curvatura de la
//     Tierra vía la corrección de longitud según la latitud).
//
// A diferencia de leaflet.heat (que recalcula el radio en PÍXELES DE
// PANTALLA cada vez que cambia el zoom), esto se calcula UNA SOLA VEZ sobre
// una grilla de coordenadas geográficas reales, y el resultado se convierte
// en una IMAGEN anclada a esas coordenadas (L.imageOverlay).

export interface PuntoDensidad {
  lat: number;
  lon: number;
}

import { maxDe, minDe } from './mathSeguro';

export interface ResultadoKernel {
  dataUrl: string; // PNG en base64, listo para L.imageOverlay
  bounds: [[number, number], [number, number]]; // [[latSur, lonOeste], [latNorte, lonEste]]
  clases: { color: string; etiqueta: string; desde: number; hasta: number }[];
}

function paletaPorDefecto(): (string | null)[] {
  return ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'];
}

// Los 5 puntos de corte de SIEMPRE (Muy baja/Baja/Media/Alta/Muy alta) — ya
// NO se recalculan según cuántos colores estén activos. Antes, al
// desactivar "Verde", los colores restantes se REPARTÍAN de nuevo en todo
// el rango — eso hacía que "Amarillo" ocupara el lugar de "Verde" (se veía
// como si Verde simplemente hubiera cambiado de nombre, no como si se
// hubiera apagado). Ahora cada banda tiene su color y su rango FIJOS
// siempre; lo único que cambia al desactivar un color es que ESA banda,
// puntualmente, deja de pintarse (queda transparente) — las demás no se
// mueven ni cambian.
const ANCLAS_FRACCION_FIJAS = [0, 0.08, 0.22, 0.42, 0.68, 1];

// Radio de búsqueda REAL, en metros — igual al parámetro "Radio de
// búsqueda: 250" de la herramienta de ArcGIS.
const RADIO_BUSQUEDA_METROS = 250;

function metrosAGradosLat(metros: number): number {
  return metros / 111_320;
}

/**
 * Calcula la superficie de Densidad Kernel usando la fórmula de Silverman
 * (kernel cuártico/biweight) — la misma que usa ArcGIS Pro — sobre una
 * grilla geográfica fija, la clasifica en 5 niveles por fracción del valor
 * máximo, y la renderiza como una imagen PNG anclada a coordenadas reales.
 *
 * Fórmula (por celda, "método geodésico" — distancia real en metros vía
 * corrección de longitud por latitud):
 *   densidad = Σ (3 / (π · radio²)) · (1 − (dist_i / radio)²)²   para cada
 *   punto i cuya distancia a la celda sea ≤ radio (fuera de ese radio, el
 *   punto no aporta nada — a diferencia de un gaussiano, este kernel tiene
 *   soporte compacto, lo que da núcleos definidos en vez de una nube que se
 *   difumina indefinidamente).
 */
export function calcularKernelDensidad(puntos: PuntoDensidad[], colores: (string | null)[] = paletaPorDefecto()): ResultadoKernel | null {
  if (puntos.length === 0) return null;

  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const latMin0 = minDe(lats);
  const latMax0 = maxDe(lats);
  const lonMin0 = minDe(lons);
  const lonMax0 = maxDe(lons);
  const latitudRef = (latMin0 + latMax0) / 2;
  const correccionLon = Math.cos((latitudRef * Math.PI) / 180); // "método geodésico": 1° de longitud pesa distinto según la latitud

  // Margen igual al radio de búsqueda — así el kernel de un punto cerca del
  // borde del área analizada no se corta en seco.
  const margenGrados = metrosAGradosLat(RADIO_BUSQUEDA_METROS);
  const latMin = latMin0 - margenGrados;
  const latMax = latMax0 + margenGrados;
  const lonMin = lonMin0 - margenGrados;
  const lonMax = lonMax0 + margenGrados;

  const anchoGrados = lonMax - lonMin;
  const altoGrados = latMax - latMin;
  const anchoMetros = anchoGrados * 111_320 * correccionLon;
  const altoMetros = altoGrados * 111_320;

  // Tamaño de celda: se ajusta según el radio de búsqueda (ArcGIS sugiere,
  // por defecto, un tamaño de celda bastante más fino que el radio — aquí
  // se usa radio/20 en vez de radio/12 de antes) — con un límite de
  // columnas más alto para no generar grillas gigantes. Antes, con celdas
  // más gruesas, el kernel (que sí es una convolución suave) terminaba
  // viéndose "a cuadros" en el mapa: cada celda ocupaba un área real
  // grande, así que su borde recto se notaba a simple vista. Con celdas
  // más finas, esa misma curva suave se representa con muchos más
  // escalones pequeños — se ve continua sin necesidad de difuminar
  // colores entre bandas (que fue justo lo que se quitó para que el mapa
  // se viera denso y no "lavado").
  const metrosPorCelda = Math.max(RADIO_BUSQUEDA_METROS / 20, 3);
  const COLS = Math.min(900, Math.max(60, Math.round(anchoMetros / metrosPorCelda)));
  const ROWS = Math.min(900, Math.max(40, Math.round(altoMetros / metrosPorCelda)));

  const metrosPorCeldaX = anchoMetros / COLS;
  const metrosPorCeldaY = altoMetros / ROWS;

  // 1) Histograma 2D — cuántos puntos caen en cada celda (permite tratar la
  // convolución del kernel sobre celdas en vez de sobre cada punto
  // individual, mucho más eficiente con miles de casos).
  const conteo = new Float64Array(COLS * ROWS);
  const idx = (c: number, r: number) => r * COLS + c;
  for (const p of puntos) {
    const c = Math.floor(((p.lon - lonMin) / (lonMax - lonMin)) * COLS);
    const r = Math.floor(((latMax - p.lat) / (latMax - latMin)) * ROWS);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) conteo[idx(c, r)] += 1;
  }

  // 2) Kernel cuártico (Silverman) discreto, radialmente simétrico —
  // precalculado UNA vez como una matriz pequeña, y convolucionado sobre la
  // grilla de conteos (convolución 2D real: este kernel no es separable,
  // porque depende de la distancia euclidiana real, no de X e Y por
  // separado).
  const radioCeldasX = RADIO_BUSQUEDA_METROS / metrosPorCeldaX;
  const radioCeldasY = RADIO_BUSQUEDA_METROS / metrosPorCeldaY;
  const radioCeldasMax = Math.max(1, Math.ceil(Math.max(radioCeldasX, radioCeldasY)));

  const pesosKernel: { dc: number; dr: number; peso: number }[] = [];
  const factorNormalizacion = 3 / (Math.PI * RADIO_BUSQUEDA_METROS * RADIO_BUSQUEDA_METROS);
  for (let dr = -radioCeldasMax; dr <= radioCeldasMax; dr++) {
    for (let dc = -radioCeldasMax; dc <= radioCeldasMax; dc++) {
      const distMetros = Math.sqrt((dc * metrosPorCeldaX) ** 2 + (dr * metrosPorCeldaY) ** 2);
      if (distMetros > RADIO_BUSQUEDA_METROS) continue;
      const t = distMetros / RADIO_BUSQUEDA_METROS;
      const peso = factorNormalizacion * (1 - t * t) ** 2; // fórmula de Silverman (kernel cuártico/biweight)
      pesosKernel.push({ dc, dr, peso });
    }
  }

  const densidad = new Float64Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const casosEnCelda = conteo[idx(c, r)];
      if (casosEnCelda === 0) continue;
      for (const { dc, dr, peso } of pesosKernel) {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS) {
          densidad[idx(cc, rr)] += casosEnCelda * peso;
        }
      }
    }
  }

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
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(COLS, ROWS);

  // UMBRAL MÍNIMO — antes se pintaba CUALQUIER rastro de densidad (por
  // mínimo que fuera) como verde sólido; con miles de puntos repartidos
  // por toda la ciudad, sus radios de 250m se solapan casi en todas
  // partes, y eso dejaba TODO el polígono con un lavado verde parejo (el
  // problema real que se detectó comparando contra ArcGIS: ahí, la mayor
  // parte del mapa queda SIN NINGÚN color, y el color solo aparece cerca
  // de las concentraciones genuinas). Por eso ahora cualquier valor por
  // debajo de este umbral se deja completamente transparente — igual que
  // la clase más baja de la simbología clasificada de ArcGIS, que empieza
  // en un mínimo real, no en "cualquier rastro mayor que cero".
  const UMBRAL_MINIMO_FRACCION = 0.12;
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
  const ctxFinal = canvasFinal.getContext('2d')!;
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
  };
}

function hexARgb(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '');
  return [parseInt(limpio.slice(0, 2), 16), parseInt(limpio.slice(2, 4), 16), parseInt(limpio.slice(4, 6), 16)];
}
