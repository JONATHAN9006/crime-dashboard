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

  // 3) Color CONTINUO por interpolación — nunca "banding" de 5 bloques
  // fijos. Los mismos puntos de corte de siempre (0%, 8%, 22%, 42%, 68%,
  // 100% del máximo real) se usan como anclas de color, y CUALQUIER valor
  // intermedio se interpola linealmente entre las dos anclas más cercanas
  // — así la transición entre verde, amarillo, naranja y rojo es
  // genuinamente continua, no un salto brusco de un bloque a otro.
  const valoresConDensidad = Array.from(densidad).filter((v) => v > 1e-9);
  if (valoresConDensidad.length === 0) return null;

  const maxValor = Math.max(...valoresConDensidad);
  // Los puntos de transición del degradado se generan según la CANTIDAD
  // real de colores recibidos — antes estaban fijos asumiendo siempre
  // exactamente 5 (paleta original verde→rojo). Desde que la paleta es
  // personalizable (se pueden destildar colores y quedar con menos de 5,
  // ej. solo amarillo/naranja/rojo), un arreglo de posiciones fijo de 6
  // elementos se quedaba leyendo una posición que ya no existía —
  // "undefined is not iterable" — y tumbaba el mapa apenas se abría,
  // porque la preferencia de colores queda guardada en el navegador.
  // Con 5 colores (el caso de siempre) se conserva EXACTAMENTE la curva
  // original; con cualquier otra cantidad (incluido 1) se generan puntos
  // repartidos de forma pareja, sin romperse nunca.
  const ANCLAS_FRACCION: number[] = colores.length === 5
    ? [0, 0.08, 0.22, 0.42, 0.68, 1]
    : colores.length <= 1
      ? [0, 1]
      : [0, 0.08, ...Array.from({ length: colores.length - 1 }, (_, i) => 0.08 + 0.92 * ((i + 1) / (colores.length - 1)))];
  const coloresRgb = (colores.length > 0 ? colores : ['#dc2626']).map(hexARgb);
  const anclasRgb = [coloresRgb[0], ...coloresRgb]; // el color "0" se repite para el ancla en fracción 0

  function colorInterpolado(v: number): [number, number, number] {
    const fraccion = Math.min(1, (v / maxValor - UMBRAL_MINIMO_FRACCION) / (1 - UMBRAL_MINIMO_FRACCION));
    for (let i = 0; i < ANCLAS_FRACCION.length - 1; i++) {
      const f0 = ANCLAS_FRACCION[i], f1 = ANCLAS_FRACCION[i + 1];
      if (fraccion >= f0 && fraccion <= f1) {
        const t = f1 === f0 ? 0 : (fraccion - f0) / (f1 - f0);
        const [r0, g0, b0] = anclasRgb[i];
        const [r1, g1, b1] = anclasRgb[i + 1];
        return [Math.round(r0 + (r1 - r0) * t), Math.round(g0 + (g1 - g0) * t), Math.round(b0 + (b1 - b0) * t)];
      }
    }
    return anclasRgb[anclasRgb.length - 1];
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
      const [rr, gg, bb] = colorInterpolado(v);
      imgData.data[p] = rr;
      imgData.data[p + 1] = gg;
      imgData.data[p + 2] = bb;
      imgData.data[p + 3] = opacidadContinua(v);
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
    desde: ANCLAS_FRACCION[i] * maxValor,
    hasta: ANCLAS_FRACCION[i + 1] * maxValor,
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
