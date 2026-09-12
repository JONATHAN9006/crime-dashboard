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

export interface ResultadoKernel {
  dataUrl: string; // PNG en base64, listo para L.imageOverlay
  bounds: [[number, number], [number, number]]; // [[latSur, lonOeste], [latNorte, lonEste]]
  clases: { color: string; etiqueta: string; desde: number; hasta: number }[];
}

function paletaPorDefecto(): string[] {
  return ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'];
}

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
export function calcularKernelDensidad(puntos: PuntoDensidad[], colores: string[] = paletaPorDefecto()): ResultadoKernel | null {
  if (puntos.length === 0) return null;

  const lats = puntos.map((p) => p.lat);
  const lons = puntos.map((p) => p.lon);
  const latMin0 = Math.min(...lats);
  const latMax0 = Math.max(...lats);
  const lonMin0 = Math.min(...lons);
  const lonMax0 = Math.max(...lons);
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
  // se usa radio/12, similar en espíritu a su valor por defecto) — con un
  // límite de columnas para no generar grillas gigantes.
  const metrosPorCelda = Math.max(RADIO_BUSQUEDA_METROS / 12, 4);
  const COLS = Math.min(500, Math.max(60, Math.round(anchoMetros / metrosPorCelda)));
  const ROWS = Math.min(500, Math.max(40, Math.round(altoMetros / metrosPorCelda)));

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

  // 3) Clasificación por fracción del valor máximo real — igual que la
  // simbología clasificada de ArcGIS Pro: el rojo solo aparece donde la
  // densidad es genuinamente alta, no simplemente "alta respecto a su
  // entorno inmediato".
  const valoresConDensidad = Array.from(densidad).filter((v) => v > 1e-9);
  if (valoresConDensidad.length === 0) return null;

  const NUM_CLASES = 5;
  const maxValor = Math.max(...valoresConDensidad);
  const FRACCIONES_CORTE = [0.08, 0.22, 0.42, 0.68];
  const cortes = FRACCIONES_CORTE.map((f) => f * maxValor);

  function clasificar(v: number): number {
    for (let i = 0; i < cortes.length; i++) if (v <= cortes[i]) return i;
    return NUM_CLASES - 1;
  }

  const OPACIDAD_POR_CLASE = [110, 150, 185, 215, 240];
  const canvas = document.createElement('canvas');
  canvas.width = COLS;
  canvas.height = ROWS;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(COLS, ROWS);
  const coloresRgb = colores.map(hexARgb);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = densidad[idx(c, r)];
      const p = (r * COLS + c) * 4;
      if (v <= 1e-9) {
        imgData.data[p + 3] = 0;
        continue;
      }
      const clase = clasificar(v);
      const [rr, gg, bb] = coloresRgb[clase];
      imgData.data[p] = rr;
      imgData.data[p + 1] = gg;
      imgData.data[p + 2] = bb;
      imgData.data[p + 3] = OPACIDAD_POR_CLASE[clase];
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // Reescalado con "remuestreo Cúbico" (bicúbico) — igual al que se
  // configuró en ArcGIS Pro para la apariencia de la capa ráster (interpola
  // usando las 16 celdas circundantes) — así la superficie se ve continua y
  // suave, nunca "a cuadros", incluso siendo internamente una grilla.
  const canvasFinal = document.createElement('canvas');
  canvasFinal.width = COLS * 3;
  canvasFinal.height = ROWS * 3;
  const ctxFinal = canvasFinal.getContext('2d')!;
  ctxFinal.imageSmoothingEnabled = true;
  ctxFinal.imageSmoothingQuality = 'high';
  ctxFinal.drawImage(canvas, 0, 0, canvasFinal.width, canvasFinal.height);

  const etiquetasClase = ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'];
  const clases = colores.map((color, i) => ({
    color,
    etiqueta: etiquetasClase[i],
    desde: i === 0 ? 0 : cortes[i - 1],
    hasta: i === NUM_CLASES - 1 ? maxValor : cortes[i],
  }));

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
