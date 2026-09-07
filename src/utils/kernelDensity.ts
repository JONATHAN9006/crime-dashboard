// Kernel Density Estimation geográficamente fijo — a diferencia de
// leaflet.heat (que recalcula el radio en PÍXELES DE PANTALLA cada vez que
// cambia el zoom, haciendo que la misma cantidad de puntos "cubra" más o
// menos área real según qué tan cerca estés), este módulo calcula la
// densidad UNA SOLA VEZ sobre una grilla de coordenadas geográficas reales
// (lat/lon), y el resultado se convierte en una IMAGEN anclada a esas
// coordenadas (L.imageOverlay). El zoom del mapa solo escala esa imagen como
// cualquier otra capa geográfica — nunca vuelve a calcular el kernel.

export interface PuntoDensidad {
  lat: number;
  lon: number;
}

export interface ResultadoKernel {
  dataUrl: string; // PNG en base64, listo para L.imageOverlay
  bounds: [[number, number], [number, number]]; // [[latSur, lonOeste], [latNorte, lonEste]]
  clases: { color: string; etiqueta: string; desde: number; hasta: number }[];
}

// Paleta de 5 clases — el color de cada celda depende del valor REAL del
// kernel en esa celda (por cuantiles), nunca del nivel de zoom.
function paletaPorDefecto(): string[] {
  return ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'];
}

// Bandwidth en METROS (no en píxeles) — el radio real de influencia de cada
// punto sobre sus vecinos. Se convierte internamente a grados de lat/lon
// según la latitud del área analizada, para que la distancia real sea
// consistente sin importar en qué parte del mapa esté.
//
// Ajustado de 350m a 120m: con 350m, el desenfoque alcanzaba a "contagiar"
// densidad varias cuadras a la redonda, dando el efecto de nube difusa que
// se veía en el mapa (comparado contra la referencia de ArcGIS Pro, cuyos
// núcleos son mucho más compactos). 120m corresponde aproximadamente a 1-2
// cuadras urbanas — un punto ya no "calienta" zonas lejanas, y los núcleos
// quedan compactos y bien definidos, fusionándose solo cuando los puntos
// están realmente cerca entre sí.
const BANDWIDTH_METROS = 120;

function metrosAGradosLat(metros: number): number {
  return metros / 111_320; // 1° de latitud ≈ 111.32 km, prácticamente constante
}
function metrosAGradosLon(metros: number, latitudReferencia: number): number {
  return metros / (111_320 * Math.cos((latitudReferencia * Math.PI) / 180));
}

/**
 * Calcula una superficie de densidad Kernel (Gaussiana) sobre una grilla
 * geográfica fija, la clasifica en 5 niveles por cuantiles, y la renderiza
 * como una imagen PNG anclada a coordenadas reales.
 *
 * Método: en vez de sumar la contribución gaussiana de CADA punto sobre CADA
 * celda (que sería extremadamente lento con miles de puntos), se usa la
 * técnica estándar equivalente: 1) se cuentan los puntos por celda de una
 * grilla fina (histograma 2D), 2) se aplica un desenfoque gaussiano
 * separable sobre esa grilla — matemáticamente equivalente a un KDE
 * gaussiano, pero muchísimo más eficiente (recalcula en función de las
 * celdas de la grilla, no de la cantidad de puntos).
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

  // Margen alrededor de los datos (para que el degradado se disipe suave en
  // los bordes, en vez de cortarse en seco justo donde termina el último
  // punto).
  const margenGrados = metrosAGradosLat(BANDWIDTH_METROS * 3);
  const latMin = latMin0 - margenGrados;
  const latMax = latMax0 + margenGrados;
  const lonMin = lonMin0 - margenGrados;
  const lonMax = lonMax0 + margenGrados;

  // Resolución de la grilla: fija en cantidad de celdas (no en metros), con
  // el ancho/alto ajustado a la proporción real del área para no deformar el
  // resultado. Se subió de 220 a 360 columnas — con un bandwidth más chico
  // (120m), una grilla de baja resolución no alcanza a "dibujar" núcleos
  // compactos con detalle; más columnas permiten que el núcleo se vea
  // definido en vez de pixelado o borroso.
  const COLS = 360;
  const anchoGrados = lonMax - lonMin;
  const altoGrados = latMax - latMin;
  const anchoMetros = anchoGrados * 111_320 * Math.cos((latitudRef * Math.PI) / 180);
  const altoMetros = altoGrados * 111_320;
  const filas = Math.max(20, Math.round(COLS * (altoMetros / anchoMetros)));
  const ROWS = Math.min(filas, 400); // límite de seguridad para no crear grillas gigantes

  const grilla = new Float64Array(COLS * ROWS);
  const idx = (c: number, r: number) => r * COLS + c;

  // 1) Histograma 2D: cada punto se cuenta en la celda que le corresponde.
  for (const p of puntos) {
    const c = Math.floor(((p.lon - lonMin) / (lonMax - lonMin)) * COLS);
    const r = Math.floor(((latMax - p.lat) / (latMax - latMin)) * ROWS); // fila 0 = norte
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) grilla[idx(c, r)] += 1;
  }

  // 2) Desenfoque gaussiano separable — el sigma se calcula en CELDAS a
  // partir del bandwidth en metros, así el radio real de influencia es
  // siempre el mismo sin importar la resolución de la grilla.
  const metrosPorCeldaX = anchoMetros / COLS;
  const metrosPorCeldaY = altoMetros / ROWS;
  const sigmaX = Math.max(0.6, BANDWIDTH_METROS / metrosPorCeldaX);
  const sigmaY = Math.max(0.6, BANDWIDTH_METROS / metrosPorCeldaY);
  const grillaSuavizada = desenfoqueGaussianoSeparable(grilla, COLS, ROWS, sigmaX, sigmaY);

  // 3) Clasificación por FRACCIÓN DEL VALOR MÁXIMO (no por cuantiles) — con
  // cuantiles, el color se repartía según la posición relativa de las
  // celdas entre sí, lo que "aplanaba" los núcleos (el rojo aparecía en
  // muchas zonas solo porque eran las "más altas de su entorno", no porque
  // fueran realmente muy densas). Clasificar contra el máximo real hace que
  // el rojo solo aparezca donde la concentración es genuinamente alta —
  // igual que la simbología clasificada de ArcGIS Pro — dando núcleos
  // compactos y bien definidos en vez de manchas difusas y extendidas.
  const valoresConDensidad = Array.from(grillaSuavizada).filter((v) => v > 1e-6);
  if (valoresConDensidad.length === 0) return null;

  const NUM_CLASES = 5;
  const maxValor = Math.max(...valoresConDensidad);
  const FRACCIONES_CORTE = [0.08, 0.22, 0.42, 0.68];
  const cortes = FRACCIONES_CORTE.map((f) => f * maxValor);

  function clasificar(v: number): number {
    for (let i = 0; i < cortes.length; i++) if (v <= cortes[i]) return i;
    return NUM_CLASES - 1;
  }

  // 4) Renderizado a canvas — cada celda pinta un color SÓLIDO según su
  // clase (opacidad fija por clase, no un degradado continuo dentro de la
  // misma clase) — así las bandas de color quedan definidas como en una
  // capa clasificada de ArcGIS, no como una nube con transparencia variable
  // punto a punto. Las celdas sin densidad quedan completamente
  // transparentes para que el mapa base se siga viendo debajo.
  const OPACIDAD_POR_CLASE = [110, 150, 185, 215, 240];
  const canvas = document.createElement('canvas');
  canvas.width = COLS;
  canvas.height = ROWS;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(COLS, ROWS);
  const coloresRgb = colores.map(hexARgb);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = grillaSuavizada[idx(c, r)];
      const p = (r * COLS + c) * 4;
      if (v <= 1e-6) {
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

  // El navegador escala esta imagen pequeña (220xROWS) al verse en el mapa —
  // se activa un suavizado nativo para que no se vea "a cuadros".
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

// Desenfoque gaussiano separable (horizontal, luego vertical) — matemática y
// visualmente equivalente a una convolución 2D completa, pero mucho más
// rápido de calcular.
function desenfoqueGaussianoSeparable(grilla: Float64Array, cols: number, filas: number, sigmaX: number, sigmaY: number): Float64Array {
  const pasoH = desenfoque1D(grilla, cols, filas, sigmaX, true);
  return desenfoque1D(pasoH, cols, filas, sigmaY, false);
}

function desenfoque1D(datos: Float64Array, cols: number, filas: number, sigma: number, horizontal: boolean): Float64Array {
  const radio = Math.max(1, Math.ceil(sigma * 3));
  const kernel: number[] = [];
  let sumaKernel = 0;
  for (let i = -radio; i <= radio; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(w);
    sumaKernel += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sumaKernel;

  const resultado = new Float64Array(cols * filas);
  if (horizontal) {
    for (let r = 0; r < filas; r++) {
      for (let c = 0; c < cols; c++) {
        let acc = 0;
        for (let k = -radio; k <= radio; k++) {
          const cc = c + k;
          if (cc >= 0 && cc < cols) acc += datos[r * cols + cc] * kernel[k + radio];
        }
        resultado[r * cols + c] = acc;
      }
    }
  } else {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < filas; r++) {
        let acc = 0;
        for (let k = -radio; k <= radio; k++) {
          const rr = r + k;
          if (rr >= 0 && rr < filas) acc += datos[rr * cols + c] * kernel[k + radio];
        }
        resultado[r * cols + c] = acc;
      }
    }
  }
  return resultado;
}
