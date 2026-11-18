// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" — un PDF
// por TARJETAS (una por cada nodo seleccionado). Cada tarjeta trae: título,
// fila de métricas generales, y TRES bloques lado a lado (Trimestres |
// Delitos | Distribución por mes) — cada uno con su propio color, tal como
// se pidió — con letra más grande para que se lea bien impreso.
import { jsPDF } from 'jspdf';
import { nombreVisibleUnidad, type NodoMicrogerencia } from './microgerencia';
import { hallazgosNodo, notaCalidadDato } from './microgerenciaTextos';
import { obtenerMotivoSinMapa } from './microgerenciaMapas';

// Vertical (Carta/A4 en pie) en vez de horizontal — a pedido explícito:
// el contenido de esta tarjeta es naturalmente "alto" (meses apilados,
// delitos apilados) más que "ancho", así que una hoja vertical le da más
// alto disponible (297mm en vez de 210mm) justo donde hace falta, sin
// necesidad de achicar la letra — y de paso dejó de forzar el
// encabezado/pie a estirarse sobre un ancho tan grande.
const MM_ANCHO = 210; // A4 vertical
const MM_ALTO = 297;
// Margen del CONTENIDO (métricas, trimestres, delitos, meses, mapa) — se
// redujo (era 10) a pedido explícito: con el recuadro de fondo ya
// ensanchado (ver más abajo), el contenido seguía midiéndose con este
// margen más angosto, así que quedaba un espacio en blanco entre el borde
// del recuadro y donde de verdad arrancaba cada bloque. Como ANCHO_UTIL se
// calcula A PARTIR de este margen, achicarlo ensancha automáticamente
// TODOS los bloques por igual, sin tener que ajustar cada uno por separado.
const MARGEN = 7;
const ANCHO_UTIL = MM_ANCHO - MARGEN * 2;

const COLOR_GREEN: [number, number, number] = [17, 103, 98];
const COLOR_GREEN_CLARO: [number, number, number] = [209, 240, 231];
const COLOR_AZUL_CLARO: [number, number, number] = [219, 234, 254];
const COLOR_AZUL_ALTERNO: [number, number, number] = [191, 214, 254];
const COLOR_AMBAR_CLARO: [number, number, number] = [254, 243, 199];
const COLOR_AMBAR_ALTERNO: [number, number, number] = [253, 230, 138];
const COLOR_VIOLETA_CLARO: [number, number, number] = [237, 233, 254];
const COLOR_VIOLETA_ALTERNO: [number, number, number] = [221, 214, 254];
const COLOR_TARJETA_FONDO: [number, number, number] = [252, 253, 253];
const COLOR_TEXTO: [number, number, number] = [30, 41, 59];
const COLOR_ROJO: [number, number, number] = [190, 30, 45];
const COLOR_VERDE_TEXTO: [number, number, number] = [15, 118, 90];
const COLOR_MUTED: [number, number, number] = [100, 116, 139];

function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n));
}
function formatearPct(n: number | null): string {
  if (n === null) return 'N/A';
  // Sin decimales (antes 1) — a pedido explícito: con delitos de poco
  // volumen, un solo caso de diferencia da porcentajes enormes (+5440.0%,
  // +4667.0%) que, sumados a la columna "Dif" justo al lado, no cabían y
  // se encimaban visualmente. Redondear a entero libera el espacio que
  // hacía falta, sin tocar el cálculo real (sigue siendo el mismo
  // porcentaje, solo se muestra sin la parte decimal).
  return `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
}
function colorPorDif(dif: number): [number, number, number] {
  return dif > 0 ? COLOR_ROJO : dif < 0 ? COLOR_VERDE_TEXTO : COLOR_MUTED;
}

async function cargarImagenBase64(ruta: string): Promise<string | null> {
  try {
    const resp = await fetch(ruta);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result as string);
      lector.onerror = reject;
      lector.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// El mapa (tercera columna de cada tarjeta) llegaba con SU PROPIA
// proporción (la del div del mapa en pantalla, normalmente más ancho que
// alto) y se dibujaba "contain" — completo, sin recortar, centrado — así
// que cuando esa proporción no coincidía con la del recuadro (casi nunca
// coincidía) quedaba una franja en blanco arriba/abajo o a los lados: el
// mapa "no se ajustaba". Esta función lo recorta al estilo "cover" —
// como el object-fit: cover de CSS — a la proporción EXACTA del recuadro
// de destino, así después se puede estirar para llenarlo por completo
// sin dejar ningún espacio vacío (se sacrifica un poco de borde del mapa,
// nunca el centro, que es donde está lo importante).
function recortarImagenParaCobertura(dataUrl: string, anchoDestMm: number, altoDestMm: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (!img.width || !img.height || anchoDestMm <= 0 || altoDestMm <= 0) {
        resolve(dataUrl);
        return;
      }
      const aspectoDestino = anchoDestMm / altoDestMm;
      const aspectoOrigen = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (aspectoOrigen > aspectoDestino) {
        // La imagen original es más ANCHA de lo necesario — se recortan
        // los costados (izquierda/derecha), se conserva el centro.
        sw = img.height * aspectoDestino;
        sx = (img.width - sw) / 2;
      } else {
        // La imagen original es más ALTA de lo necesario — se recorta
        // arriba/abajo, se conserva el centro.
        sh = img.width / aspectoDestino;
        sy = (img.height - sh) / 2;
      }
      const canvas = document.createElement('canvas');
      const anchoSalidaPx = 1000;
      canvas.width = anchoSalidaPx;
      canvas.height = Math.round(anchoSalidaPx / aspectoDestino);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl); // si falla, se usa la original tal cual — mejor eso que romper el PDF
    img.src = dataUrl;
  });
}

// Tamaños grandes, pensados para que se lean bien impresos. Son los
// tamaños BASE (escala 1) — cuando una tarjeta no cabe completa en una
// página (ver ESCALA más abajo), todos se multiplican por un mismo factor
// para achicarla de forma proporcional, en vez de cortarla.
const BASE_ALTO_TITULO_TARJETA = 13;
const BASE_ALTO_FILA_METRICAS = 22;
const BASE_ALTO_FILA_TRIM_MES = 6.2; // Trimestres/Meses: filas fijas (4 y 12), letra más grande
const BASE_ALTO_FILA_DELITOS = 5.6; // Delitos: cantidad variable, en 1 o 2 columnas según cuántos haya
const BASE_ALTO_ENCABEZADO_BLOQUE = 10;
const BASE_ALTO_MARGEN_INFERIOR_BLOQUE = 10; // espacio de sobra bajo la última fila, para que el texto nunca sobresalga del color de fondo
const BASE_PADDING_TARJETA = 4;
const ESPACIO_ENTRE_TARJETAS = 8; // separación entre tarjetas — no se escala

// Tamaños de fuente BASE (escala 1) de cada texto que dibuja una tarjeta.
const BASE_FS = {
  tituloTarjeta: 13,
  etiquetaMetrica: 7,
  valorMetrica: 11,
  tituloBloque: 9,
  encabezadoColumna: 7.5,
  filaTrimMes: 8.5,
  encabezadoDelitos: 6.5,
  filaDelitos: 7.2,
  mapaNoDisponible: 8.5,
};

// Dimensiones ya escaladas para UNA tarjeta — todo lo que depende del
// tamaño de letra o del alto de fila sale de aquí, nunca de las
// constantes BASE_* directamente, así toda la tarjeta se achica junta y
// de forma consistente.
interface Dimensiones {
  escala: number;
  altoTituloTarjeta: number;
  altoFilaMetricas: number;
  altoFilaTrimMes: number;
  altoFilaDelitos: number;
  altoEncabezadoBloque: number;
  altoMargenInferiorBloque: number;
  paddingTarjeta: number;
}

function crearDimensiones(escala: number): Dimensiones {
  return {
    escala,
    altoTituloTarjeta: BASE_ALTO_TITULO_TARJETA * escala,
    altoFilaMetricas: BASE_ALTO_FILA_METRICAS * escala,
    altoFilaTrimMes: BASE_ALTO_FILA_TRIM_MES * escala,
    altoFilaDelitos: BASE_ALTO_FILA_DELITOS * escala,
    altoEncabezadoBloque: BASE_ALTO_ENCABEZADO_BLOQUE * escala,
    altoMargenInferiorBloque: BASE_ALTO_MARGEN_INFERIOR_BLOQUE * escala,
    paddingTarjeta: BASE_PADDING_TARJETA * escala,
  };
}

function altoTablaDelitos(cantidad: number, dim: Dimensiones): number {
  if (cantidad === 0) return 0;
  return dim.altoEncabezadoBloque + dim.altoFilaDelitos * cantidad + dim.altoMargenInferiorBloque;
}

/**
 * Componentes que lleva cada tarjeta (asistente de Microgerencia). Sin
 * opciones, el PDF sale EXACTAMENTE como siempre (todo menos los bloques
 * nuevos de barrios, hallazgos y calidad del dato).
 */
export interface OpcionesPdfMicrogerencia {
  metricas: boolean;
  proyeccion: boolean;
  trimestres: boolean;
  meses: boolean;
  delitos: boolean;
  mapa: boolean;
  topBarrios: 0 | 3 | 5;
  hallazgos: boolean;
  calidad: boolean;
  /** Para los textos de hallazgos / calidad. */
  anioActual?: number;
  anioAnterior?: number;
  fechaCorte?: string;
  /** Líneas de la ficha del informe (fuentes, cobertura, periodo, delitos…), arriba de la primera página. */
  ficha?: string[];
  /**
   * PDF ya iniciado (informe territorial con índice y láminas): las páginas
   * se AGREGAN a ese documento y no se descarga nada aquí.
   */
  pdfBase?: jsPDF;
}
const OPCIONES_POR_DEFECTO: OpcionesPdfMicrogerencia = {
  metricas: true, proyeccion: true, trimestres: true, meses: true, delitos: true, mapa: true, topBarrios: 0, hallazgos: false, calidad: false,
};

interface ColumnaBanda { tipo: 'col1' | 'meses' | 'mapa'; x: number; ancho: number }
/** Columnas presentes en la banda (Trimestres+Delitos · Meses · Mapa), repartiendo el ancho entre las que haya. */
function layoutBanda(nodo: NodoMicrogerencia, dim: Dimensiones, op: OpcionesPdfMicrogerencia): { columnas: ColumnaBanda[]; alto: number; altoCol1: number; altoMeses: number } {
  const altoTrimestres = op.trimestres ? dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 4 + dim.altoMargenInferiorBloque : 0;
  // Columna 1 apila Trimestres + Top 10 delitos (no todos) — así nunca
  // queda desproporcionadamente más alta que Meses o el mapa.
  const cantidadDelitosMostrados = op.delitos ? Math.min(nodo.delitos.length, 10) : 0;
  const altoDel = altoTablaDelitos(cantidadDelitosMostrados, dim);
  const altoCol1 = altoTrimestres + (altoTrimestres && altoDel ? dim.paddingTarjeta : 0) + altoDel;
  const altoMeses = op.meses ? dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 12 + dim.altoMargenInferiorBloque : 0;
  const pesos: { tipo: ColumnaBanda['tipo']; peso: number }[] = [];
  if (altoCol1 > 0) pesos.push({ tipo: 'col1', peso: 0.34 });
  if (altoMeses > 0) pesos.push({ tipo: 'meses', peso: 0.26 });
  if (op.mapa) pesos.push({ tipo: 'mapa', peso: 0.40 });
  const total = pesos.reduce((a, p) => a + p.peso, 0) || 1;
  const anchoDisponible = ANCHO_UTIL - dim.paddingTarjeta * Math.max(0, pesos.length - 1);
  let x = MARGEN;
  const columnas = pesos.map((p) => {
    const ancho = (anchoDisponible * p.peso) / total;
    const col = { tipo: p.tipo, x, ancho };
    x += ancho + dim.paddingTarjeta;
    return col;
  });
  let alto = Math.max(altoCol1, altoMeses);
  if (op.mapa && alto === 0) alto = 95 * dim.escala; // solo mapa
  return { columnas, alto, altoCol1, altoMeses };
}

function altoBloqueEjecutivo(op: OpcionesPdfMicrogerencia, dim: Dimensiones): number {
  if (!op.topBarrios && !op.hallazgos && !op.calidad) return 0;
  return 50 * dim.escala + dim.paddingTarjeta;
}

function altoDeTarjeta(nodo: NodoMicrogerencia, dim: Dimensiones, op: OpcionesPdfMicrogerencia = OPCIONES_POR_DEFECTO): number {
  return dim.altoTituloTarjeta + (op.metricas ? dim.altoFilaMetricas : 0) + layoutBanda(nodo, dim, op).alto + altoBloqueEjecutivo(op, dim) + dim.paddingTarjeta * 3;
}

/**
 * Contenido de una página "resumen simple" para una fuente sin el árbol
 * Distrito/Estación/CAI de Delictividad (Operatividad, RNMC...) — título,
 * estadísticas clave, un par de rankings en texto plano, y el mapa general
 * de esa fuente a la derecha. Deliberadamente más sencilla que
 * dibujarTarjetaNodo — cubre lo esencial de un vistazo, sin intentar
 * replicar TODO el detalle de Delictividad para una fuente con una
 * estructura de datos distinta.
 */
export function dibujarSeccionResumenSimple(
  pdf: any,
  xInicio: number,
  yInicio: number,
  anchoUtil: number,
  opciones: {
    titulo: string;
    subtitulo: string;
    estadisticas: { etiqueta: string; valor: string }[];
    rankings: { titulo: string; filas: { etiqueta: string; valor: number }[] }[];
    imagenMapa?: string;
  },
): number {
  let y = yInicio;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text(opciones.titulo, xInicio, y);
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(opciones.subtitulo, xInicio, y);
  y += 8;

  // Fila de estadísticas clave.
  const anchoStat = anchoUtil / Math.max(1, opciones.estadisticas.length);
  opciones.estadisticas.forEach((s, i) => {
    const x = xInicio + i * anchoStat;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(21, 144, 137);
    pdf.text(s.valor, x, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(s.etiqueta, x, y + 4.5);
  });
  y += 12;

  const anchoColumnaIzquierda = opciones.imagenMapa ? anchoUtil * 0.55 : anchoUtil;
  const anchoMapa = anchoUtil - anchoColumnaIzquierda - 6;
  const yTablas = y;

  for (const ranking of opciones.rankings) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(ranking.titulo, xInicio, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    const max = Math.max(1, ...ranking.filas.map((f) => f.valor));
    for (const fila of ranking.filas.slice(0, 8)) {
      pdf.setTextColor(51, 65, 85);
      pdf.text(fila.etiqueta, xInicio, y, { maxWidth: anchoColumnaIzquierda * 0.62 });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(21, 144, 137);
      pdf.text(String(fila.valor), xInicio + anchoColumnaIzquierda - 2, y, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      // Barrita simple proporcional, debajo del nombre.
      const anchoBarra = (fila.valor / max) * (anchoColumnaIzquierda * 0.55);
      pdf.setFillColor(226, 232, 240);
      pdf.rect(xInicio, y + 1, anchoColumnaIzquierda * 0.55, 1.3, 'F');
      pdf.setFillColor(21, 144, 137);
      pdf.rect(xInicio, y + 1, Math.max(1, anchoBarra), 1.3, 'F');
      y += 6.5;
    }
    y += 3;
  }

  if (opciones.imagenMapa) {
    const altoMapa = Math.max(y - yTablas, 70);
    try {
      pdf.addImage(opciones.imagenMapa, 'PNG', xInicio + anchoColumnaIzquierda + 6, yTablas, anchoMapa, altoMapa);
    } catch { /* si falla la imagen, se deja la página sin mapa en vez de romper todo el PDF */ }
  }

  return y;
}

export interface SeccionExtraMicrogerencia {
  // Alto que necesita esta página (mismo criterio que alturaYEscalaParaNodo:
  // encabezado + contenido + pie) — quien arma la sección decide su propio
  // alto según cuánto contenido tenga.
  alturaPagina: number;
  // Dibuja el CONTENIDO de la página (todo lo que va debajo del
  // encabezado) — recibe el mismo "pdf" ya con la página activa y el
  // encabezado ya dibujado, y el ancho útil disponible; debe devolver la
  // posición Y donde terminó de dibujar, para que el pie se pueda ubicar
  // justo debajo (mismo mecanismo dinámico que ya usa el resto del PDF).
  dibujarContenido: (pdf: any, xInicio: number, yInicio: number, anchoUtil: number) => number;
  /** Nombre de la sección para el índice del informe. */
  titulo?: string;
}

export async function generarPdfMicrogerencia(nodos: NodoMicrogerencia[], tituloVista: string, imagenesPorNodo?: Map<string, string>, seccionesExtra?: SeccionExtraMicrogerencia[], opcionesPdf?: Partial<OpcionesPdfMicrogerencia>, nombreArchivo = 'microgerencia-mepoy.pdf'): Promise<void> {
  const op: OpcionesPdfMicrogerencia = { ...OPCIONES_POR_DEFECTO, ...(opcionesPdf ?? {}) };
  const ALTO_FICHA = op.ficha && op.ficha.length > 0 ? 8 + op.ficha.length * 4.6 : 0;
  const [encabezadoBase64, pieBase64] = await Promise.all([
    cargarImagenBase64('/assets/microgerencia-header.png'),
    cargarImagenBase64('/assets/microgerencia-footer.png'),
  ]);

  const ALTO_HEADER = MM_ANCHO * (270 / 1938);
  const ALTO_FOOTER = MM_ANCHO * (144 / 1956);
  const MARGEN_SUPERIOR_HEADER = 4;
  const Y_TOPE_PAGINA_FRESCA = MARGEN_SUPERIOR_HEADER + ALTO_HEADER + 5;

  // Techo de seguridad para el alto de UNA página — no debería alcanzarse
  // nunca en la práctica (Delitos siempre limita a los 10 principales,
  // Trimestres siempre son 4), pero evita que una página termine
  // absurdamente alta si algo cambia más adelante. Si el contenido natural
  // de una tarjeta se pasa de esto, se achica proporcionalmente en vez de
  // seguir creciendo la página sin límite.
  const MAX_ALTO_PAGINA = 400;

  // Cada página mide EXACTAMENTE lo que necesita su propia tarjeta — antes
  // todas las páginas eran una A4 de 297mm fija, y el pie de página SIEMPRE
  // quedaba pegado al fondo físico de esa hoja aunque el contenido real
  // terminara mucho antes, dejando un espacio en blanco grande entre el
  // contenido y el pie. Ahora la hoja termina justo donde termina el pie.
  function alturaYEscalaParaNodo(nodo: NodoMicrogerencia): { alturaPagina: number; escala: number } {
    const extraFicha = nodo === nodos[0] ? ALTO_FICHA : 0;
    const alturaNatural = Y_TOPE_PAGINA_FRESCA + extraFicha + altoDeTarjeta(nodo, crearDimensiones(1), op) + 6 + 8 + ALTO_FOOTER;
    if (alturaNatural <= MAX_ALTO_PAGINA) return { alturaPagina: alturaNatural, escala: 1 };
    return { alturaPagina: MAX_ALTO_PAGINA, escala: 1 - (alturaNatural - MAX_ALTO_PAGINA) / altoDeTarjeta(nodo, crearDimensiones(1), op) };
  }

  // Sin tarjetas (ej. solo RNMC): la primera página es la de la primera sección extra.
  const extrasIniciales = nodos.length === 0 && seccionesExtra && seccionesExtra.length > 0;
  const primeraAltura = nodos.length > 0 ? alturaYEscalaParaNodo(nodos[0]) : { alturaPagina: extrasIniciales ? seccionesExtra![0].alturaPagina + ALTO_FICHA : MM_ALTO, escala: 1 };
  const pdf = op.pdfBase ?? new jsPDF({ orientation: 'portrait', unit: 'mm', format: [MM_ANCHO, primeraAltura.alturaPagina] });
  if (op.pdfBase) op.pdfBase.addPage([MM_ANCHO, primeraAltura.alturaPagina]);
  // Primera página propia (en un documento compartido, las anteriores son de otro bloque).
  const paginaInicial = pdf.getNumberOfPages();
  let y = 0;

  function dibujarEncabezadoPagina() {
    if (encabezadoBase64) {
      try { pdf.addImage(encabezadoBase64, 'PNG', 0, MARGEN_SUPERIOR_HEADER, MM_ANCHO, ALTO_HEADER); } catch { /* sin encabezado si falla */ }
    }
    y = Y_TOPE_PAGINA_FRESCA;
  }

  // Y donde terminó el contenido real de cada página — el pie se dibuja
  // justo debajo (ver dibujarTarjetaNodo). Con el alto de página ya
  // ajustado al contenido, esto casi siempre coincide con "pegado al
  // fondo de la hoja" — pero se mantiene por si alguna tarjeta terminó
  // usando la escala reducida del techo de seguridad.
  const yFinalContenidoPorPagina = new Map<number, number>();

  function dibujarPiePagina(yContenido: number | undefined) {
    const altoPaginaActual = (pdf as any).internal.pageSize.getHeight();
    const yFooter = yContenido != null ? Math.min(yContenido, altoPaginaActual - ALTO_FOOTER) : altoPaginaActual - ALTO_FOOTER;
    if (pieBase64) {
      try { pdf.addImage(pieBase64, 'PNG', 0, yFooter, MM_ANCHO, ALTO_FOOTER); } catch { /* sin pie si falla */ }
    }
  }

  // Escala y alto de página YA calculados por nodo (una sola vez, antes de
  // dibujar nada) — dibujarTarjetaNodo los reutiliza en vez de recalcular,
  // para que la página que se creó para un nodo y la escala con la que se
  // dibuja su contenido SIEMPRE coincidan entre sí.
  const alturaYEscalaPorNodo = new Map<string, { alturaPagina: number; escala: number }>();
  for (const nodo of nodos) alturaYEscalaPorNodo.set(nodo.nombre, alturaYEscalaParaNodo(nodo));

  function dibujarMetricas(nodo: NodoMicrogerencia, dim: Dimensiones) {
    const difProyeccion = Math.round(nodo.difConAnioAnterior);
    const pctProyeccion = nodo.total2025 > 0 ? (difProyeccion / nodo.total2025) * 100 : null;
    const columnas: { etiqueta: string; valor: string; color: [number, number, number] }[] = [
      { etiqueta: 'TOTAL 2025', valor: formatearNumero(nodo.total2025), color: COLOR_TEXTO },
      { etiqueta: '2025', valor: formatearNumero(nodo.fecha2025), color: COLOR_TEXTO },
      { etiqueta: '2026', valor: formatearNumero(nodo.fecha2026), color: COLOR_GREEN },
      { etiqueta: 'DIF', valor: `${nodo.dif >= 0 ? '+' : ''}${formatearNumero(nodo.dif)}`, color: colorPorDif(nodo.dif) },
      { etiqueta: '%', valor: formatearPct(nodo.pct), color: colorPorDif(nodo.dif) },
      { etiqueta: 'APORTE %', valor: `${nodo.aportePct.toFixed(1)}%`, color: COLOR_TEXTO },
      ...(op.proyeccion ? [
        { etiqueta: 'PROYECTADO 2026', valor: formatearNumero(nodo.terminaAnio), color: COLOR_TEXTO },
        { etiqueta: 'PROY. VS 2025', valor: `${difProyeccion >= 0 ? '+' : ''}${formatearNumero(difProyeccion)} (${pctProyeccion === null ? 'N/A' : `${pctProyeccion >= 0 ? '+' : ''}${pctProyeccion.toFixed(1)}%`})`, color: colorPorDif(difProyeccion) },
      ] : []),
    ];
    const anchoColumna = ANCHO_UTIL / columnas.length;
    columnas.forEach((c, i) => {
      const x = MARGEN + i * anchoColumna + dim.paddingTarjeta;
      const anchoDisponible = anchoColumna - dim.paddingTarjeta;
      const tamanoEtiqueta = BASE_FS.etiquetaMetrica * dim.escala;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(tamanoEtiqueta);
      pdf.setTextColor(...COLOR_MUTED);
      // Etiquetas largas (ej. "TOTAL PROYECTADO 2026") no caben en una
      // columna tan angosta y se parten solas en 2 líneas — antes el
      // número de abajo se dibujaba siempre a la misma altura fija, así
      // que en esos casos quedaba encima de la segunda línea de la
      // etiqueta en vez de debajo. Ahora se mide cuántas líneas ocupa
      // REALMENTE cada etiqueta (pdf.splitTextToSize) y el número baja lo
      // que haga falta para nunca chocar.
      const lineasEtiqueta: string[] = pdf.splitTextToSize(c.etiqueta, anchoDisponible);
      pdf.text(lineasEtiqueta, x, y, { maxWidth: anchoDisponible });
      const altoLineaEtiqueta = tamanoEtiqueta * 0.4; // aprox. alto de línea en mm para este tamaño de fuente
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(BASE_FS.valorMetrica * dim.escala);
      pdf.setTextColor(...c.color);
      pdf.text(c.valor, x, y + lineasEtiqueta.length * altoLineaEtiqueta + 5 * dim.escala, { maxWidth: anchoDisponible });
    });
    y += dim.altoFilaMetricas;
  }

  // Trimestres / Meses: una sola columna cada uno, en el ancho que se les dé.
  function dibujarBloqueTrimMes(titulo: string, filas: { etiqueta: string; anio2025: number; anio2026: number; dif: number }[], x0: number, ancho: number, alto: number, colorFondo: [number, number, number], colorFondoAlterno: [number, number, number], colorTitulo: [number, number, number], dim: Dimensiones) {
    pdf.setFillColor(...colorFondo);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BASE_FS.tituloBloque * dim.escala);
    pdf.setTextColor(...colorTitulo);
    pdf.text(titulo, x0 + dim.paddingTarjeta, y + 6 * dim.escala, { align: 'left' });

    const colEtiqueta = x0 + dim.paddingTarjeta;
    const colValor2025 = x0 + ancho * 0.55;
    const colValor2026 = x0 + ancho * 0.78;
    const colDif = x0 + ancho * 0.98;
    let fy = y + dim.altoEncabezadoBloque + 2 * dim.escala;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BASE_FS.encabezadoColumna * dim.escala);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('2025', colValor2025, fy, { align: 'right' });
    pdf.text('2026', colValor2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    fy += 5 * dim.escala;

    filas.forEach((f, i) => {
      // Fila sombreada — un tono más oscuro y otro más claro, alternados,
      // para diferenciar cada fila igual que en el modal.
      pdf.setFillColor(...(i % 2 === 0 ? colorFondoAlterno : colorFondo));
      pdf.rect(x0 + 1, fy - 3.6 * dim.escala, ancho - 2, dim.altoFilaTrimMes, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(BASE_FS.filaTrimMes * dim.escala);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(f.etiqueta.replace('Trimestre', 'Trim.'), colEtiqueta, fy, { maxWidth: ancho * 0.46 });
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(formatearNumero(f.anio2025), colValor2025, fy, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(formatearNumero(f.anio2026), colValor2026, fy, { align: 'right' });
      pdf.setTextColor(...colorPorDif(f.dif));
      pdf.text(`${f.dif >= 0 ? '+' : ''}${formatearNumero(f.dif)}`, colDif, fy, { align: 'right' });
      fy += dim.altoFilaTrimMes;
    });
  }

  // Delitos: SIEMPRE en una sola columna — la tarjeta ya creció lo
  // necesario (ver altoBandaTresColumnas) para que quepan todos sin
  // comprimir, aprovechando el mismo espacio vertical que ya usan
  // Trimestres/Meses en vez de dejarlo en blanco.
  function dibujarBloqueDelitos(nodo: NodoMicrogerencia, x0: number, ancho: number, alto: number, dim: Dimensiones) {
    pdf.setFillColor(...COLOR_VIOLETA_CLARO);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BASE_FS.tituloBloque * dim.escala);
    pdf.setTextColor(91, 33, 182);
    pdf.text(`DELITOS (${nodo.delitos.length})`, x0 + dim.paddingTarjeta, y + 6 * dim.escala);

    if (nodo.delitos.length === 0) return;

    const colDelito = x0 + dim.paddingTarjeta;
    // Se le dio más separación a Dif/% (antes 0.86/0.96, casi pegadas) — a
    // pedido explícito: con números como "+466" seguido de "+17.0%" tan
    // cerca uno del otro, el texto quedaba encimado y parecía un solo
    // número sin sentido (ej. "+4667.0%"). El nombre del delito cede un
    // poco de su ancho máximo (era 0.48) para que alcance el espacio.
    const colTotal2025 = x0 + ancho * 0.48;
    const col2025 = x0 + ancho * 0.60;
    const col2026 = x0 + ancho * 0.72;
    const colDif = x0 + ancho * 0.85;
    const colPct = x0 + ancho * 1.0;
    let fy = y + dim.altoEncabezadoBloque + 2 * dim.escala;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BASE_FS.encabezadoDelitos * dim.escala);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('TOTAL 2025', colTotal2025, fy, { align: 'right' });
    pdf.text('2025', col2025, fy, { align: 'right' });
    pdf.text('2026', col2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    pdf.text('%', colPct, fy, { align: 'right' });
    fy += 5 * dim.escala;

    nodo.delitos.forEach((d, i) => {
      pdf.setFillColor(...(i % 2 === 0 ? COLOR_VIOLETA_ALTERNO : COLOR_VIOLETA_CLARO));
      pdf.rect(x0 + 1, fy - 3.6 * dim.escala, ancho - 2, dim.altoFilaDelitos, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(BASE_FS.filaDelitos * dim.escala);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(d.nombre, colDelito, fy, { maxWidth: ancho * 0.36 });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(91, 33, 182);
      pdf.text(formatearNumero(d.total2025), colTotal2025, fy, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(formatearNumero(d.fecha2025), col2025, fy, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(formatearNumero(d.fecha2026), col2026, fy, { align: 'right' });
      pdf.setTextColor(...colorPorDif(d.dif));
      pdf.text(`${d.dif >= 0 ? '+' : ''}${formatearNumero(d.dif)}`, colDif, fy, { align: 'right' });
      pdf.text(formatearPct(d.pct), colPct, fy, { align: 'right' });
      fy += dim.altoFilaDelitos;
    });
  }

  // Mapa + mapa de calor del nodo, si se pudo generar (ver
  // ModalMicrogerencia.tsx) — si no hay imagen disponible para este nodo
  // específico, se cae de vuelta a la lista completa de delitos, para que
  // el PDF nunca quede con un espacio vacío.
  function dibujarImagenMapaONodo(nodo: NodoMicrogerencia, imagenDataUrl: string | undefined, x0: number, ancho: number, alto: number, dim: Dimensiones) {
    if (!imagenDataUrl) {
      // Los delitos ya se muestran completos debajo de Trimestres (columna
      // 1) — aquí, si no hay mapa disponible para este nodo, se deja un
      // aviso simple en vez de repetir esa misma tabla dos veces.
      pdf.setFillColor(...COLOR_TARJETA_FONDO);
      pdf.setDrawColor(203, 213, 225);
      pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'FD');
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(BASE_FS.mapaNoDisponible * dim.escala);
      pdf.setTextColor(...COLOR_MUTED);
      // Con el motivo concreto cuando se conoce (ver microgerenciaMapas.ts).
      const motivo = obtenerMotivoSinMapa(nodo.nombre);
      pdf.text(motivo ? `Mapa no disponible: ${motivo}.` : 'Mapa no disponible para este elemento', x0 + ancho / 2, y + alto / 2, { align: 'center', maxWidth: ancho - 8 });
      return;
    }
    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'FD');
    pdf.saveGraphicsState();
    try {
      // La imagen ya llega recortada (ver recortarImagenParaCobertura,
      // llamado antes de dibujar las tarjetas) a la proporción EXACTA de
      // este recuadro — por eso ahora simplemente se estira para llenarlo
      // por completo, sin dejar franjas en blanco ni deformar nada.
      //
      // Recortada al mismo contorno REDONDEADO del recuadro (antes se
      // pegaba como un rectángulo derecho encima de un fondo con esquinas
      // redondeadas — sus propias esquinas cuadradas sobresalían un poco
      // por fuera de la curva, dando la sensación de que "se salía" del
      // recuadro).
      pdf.roundedRect(x0, y, ancho, alto, 2, 2);
      pdf.clip();
      pdf.discardPath();
      // Margen interno más grande (era 2mm) — a pedido explícito: pegada
      // borde a borde se sentía "recortada"; con más aire alrededor se ve
      // como una imagen completa dentro de su marco, no como un recorte.
      pdf.addImage(imagenDataUrl, 'PNG', x0 + 4, y + 4, ancho - 8, alto - 8);
    } catch {
      // Si la imagen viene corrupta o en un formato que jsPDF no acepta,
      // no se rompe el PDF entero — simplemente se deja el recuadro vacío.
    } finally {
      // SIEMPRE se restaura, incluso si addImage falló — de lo contrario
      // el recorte redondeado se quedaría activo para todo lo que se
      // dibuje después en la página (el resto de la tarjeta, la
      // siguiente tarjeta, etc.), cortándolo también a este mismo cuadro.
      pdf.restoreGraphicsState();
    }
  }

  // Bloque ejecutivo bajo la banda: Top barrios · Principales hallazgos ·
  // Nota de calidad del dato (solo los que se eligieron en el asistente).
  function dibujarBloqueEjecutivo(nodo: NodoMicrogerencia, dim: Dimensiones) {
    const alto = 50 * dim.escala;
    const partes: ('barrios' | 'hallazgos' | 'calidad')[] = [];
    if (op.topBarrios) partes.push('barrios');
    if (op.hallazgos) partes.push('hallazgos');
    if (op.calidad) partes.push('calidad');
    const pesos = { barrios: 0.28, hallazgos: 0.47, calidad: 0.25 };
    const total = partes.reduce((a, p) => a + pesos[p], 0) || 1;
    const anchoDisp = ANCHO_UTIL - dim.paddingTarjeta * (partes.length - 1);
    let x = MARGEN;
    const fs = 7.4 * dim.escala;
    const altoLinea = fs * 0.43;
    for (const parte of partes) {
      const ancho = (anchoDisp * pesos[parte]) / total;
      const fondo: [number, number, number] = parte === 'calidad' ? [251, 243, 223] : [236, 247, 240];
      pdf.setFillColor(...fondo);
      pdf.roundedRect(x, y, ancho, alto, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(BASE_FS.tituloBloque * dim.escala);
      pdf.setTextColor(...(parte === 'calidad' ? [146, 94, 14] as [number, number, number] : COLOR_GREEN));
      const titulo = parte === 'barrios' ? `TOP ${op.topBarrios} BARRIOS (${op.anioActual ?? ''})` : parte === 'hallazgos' ? 'PRINCIPALES HALLAZGOS' : 'CALIDAD DEL DATO';
      pdf.text(titulo, x + dim.paddingTarjeta, y + 6 * dim.escala);
      let fy = y + 11.5 * dim.escala;
      pdf.setFontSize(fs);
      if (parte === 'barrios') {
        const lista = (nodo.barrios ?? []).slice(0, op.topBarrios);
        if (lista.length === 0) {
          pdf.setFont('helvetica', 'italic'); pdf.setTextColor(...COLOR_MUTED);
          pdf.text('Sin barrios reportados en el periodo.', x + dim.paddingTarjeta, fy);
        }
        lista.forEach((b, i) => {
          pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...COLOR_GREEN);
          pdf.text(`${i + 1}.`, x + dim.paddingTarjeta, fy);
          pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...COLOR_TEXTO);
          pdf.text(b.nombre, x + dim.paddingTarjeta + 5 * dim.escala, fy, { maxWidth: ancho * 0.55 });
          pdf.setFont('helvetica', 'bold');
          const pct = nodo.fecha2026 > 0 ? (b.casos / nodo.fecha2026) * 100 : 0;
          pdf.text(`${formatearNumero(b.casos)} (${pct.toFixed(1)}%)`, x + ancho - dim.paddingTarjeta, fy, { align: 'right' });
          fy += 6.5 * dim.escala;
        });
      } else if (parte === 'hallazgos') {
        const items = hallazgosNodo(nodo, op.anioActual ?? new Date().getFullYear(), op.anioAnterior ?? new Date().getFullYear() - 1, op.fechaCorte ?? new Date().toISOString().slice(0, 10));
        for (const [i, h] of items.entries()) {
          const lineas: string[] = pdf.splitTextToSize(`${i + 1}. ${h.titulo}: ${h.texto}`, ancho - dim.paddingTarjeta * 2);
          pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...COLOR_TEXTO);
          for (const linea of lineas) {
            if (fy > y + alto - 2) break;
            pdf.text(linea, x + dim.paddingTarjeta, fy);
            fy += altoLinea + 0.4;
          }
          fy += 1.2 * dim.escala;
        }
      } else {
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...COLOR_TEXTO);
        const texto = notaCalidadDato(op.anioActual ?? new Date().getFullYear(), op.fechaCorte ?? new Date().toISOString().slice(0, 10));
        const lineas: string[] = pdf.splitTextToSize(texto, ancho - dim.paddingTarjeta * 2);
        for (const linea of lineas) {
          if (fy > y + alto - 2) break;
          pdf.text(linea, x + dim.paddingTarjeta, fy);
          fy += altoLinea + 0.4;
        }
      }
      x += ancho + dim.paddingTarjeta;
    }
  }

  function dibujarTarjetaNodo(nodo: NodoMicrogerencia, imagenMapaDataUrl?: string) {
    // La tarjeta se dibuja SIEMPRE completa en una sola página — si a
    // tamaño normal (escala 1) no cabría en el espacio disponible, se
    // calcula aquí una escala menor y TODO (letra, alto de fila, padding)
    // se reduce en la misma proporción, en vez de cortar el contenido que
    // sobre (que era exactamente lo que pasaba antes: la tabla de
    // "Distribución por mes" quedaba cortada antes de diciembre).
    const escala = alturaYEscalaPorNodo.get(nodo.nombre)!.escala;
    const dim = crearDimensiones(escala);
    const altoTarjeta = altoDeTarjeta(nodo, dim, op);

    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(MARGEN - 5, y - 3, ANCHO_UTIL + 10, altoTarjeta - dim.paddingTarjeta + 3, 2.5, 2.5, 'FD');

    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.roundedRect(MARGEN - 5, y - 3, ANCHO_UTIL + 10, dim.altoTituloTarjeta, 2.5, 2.5, 'F');
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.rect(MARGEN - 5, y + dim.altoTituloTarjeta - 6, ANCHO_UTIL + 10, 3, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BASE_FS.tituloTarjeta * dim.escala);
    pdf.setTextColor(...COLOR_GREEN);
    pdf.text(nombreVisibleUnidad(nodo.nombre), MARGEN + dim.paddingTarjeta, y + 5.5 * dim.escala);
    y += dim.altoTituloTarjeta;

    if (op.metricas) dibujarMetricas(nodo, dim);
    y += dim.paddingTarjeta / 2;

    // Columna 1: Trimestres arriba, Top 10 delitos debajo. Columna 2:
    // Distribución por mes. Columna 3: mapa + mapa de calor del nodo (si
    // se pudo generar) — o, si no hay imagen disponible, la lista
    // completa de delitos como respaldo. El mapa se redujo un poco (era
    // 0.42) y Trimestres/Delitos ganaron ese espacio (era 0.25) — a
    // pedido explícito: en vertical se veían muy pegados/angostos.
    // Trimestres/Delitos ganaron ancho (era 0.28) a costa de Distribución
    // por mes — a pedido explícito: Delitos tiene 6 columnas de datos
    // (nombre + 5 números) contra las 4 de Trimestres, así que necesita
    // más espacio; con el ancho anterior los números quedaban tan
    // apretados que se encimaban entre sí.
    const banda = layoutBanda(nodo, dim, op);
    const altoBanda = banda.alto;
    const yOriginal = y;
    for (const col of banda.columnas) {
      y = yOriginal;
      if (col.tipo === 'col1') {
        if (op.trimestres) {
          const altoTrimestres = dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 4 + dim.altoMargenInferiorBloque;
          dibujarBloqueTrimMes('TRIMESTRES', nodo.trimestres, col.x, col.ancho, altoTrimestres, COLOR_AZUL_CLARO, COLOR_AZUL_ALTERNO, [30, 64, 175], dim);
          y += altoTrimestres + dim.paddingTarjeta;
        }
        if (op.delitos) {
          // Top 10 delitos (no todos) — así la columna nunca queda
          // desproporcionadamente más alta que las otras dos.
          const delitosTop10 = { ...nodo, delitos: nodo.delitos.slice(0, 10) };
          dibujarBloqueDelitos(delitosTop10, col.x, col.ancho, altoTablaDelitos(delitosTop10.delitos.length, dim), dim);
        }
      } else if (col.tipo === 'meses') {
        // Su propia altura natural (12 filas fijas), nunca la de toda la banda.
        dibujarBloqueTrimMes('DISTRIBUCIÓN POR MES', nodo.meses, col.x, col.ancho, banda.altoMeses, COLOR_AMBAR_CLARO, COLOR_AMBAR_ALTERNO, [146, 64, 14], dim);
      } else {
        dibujarImagenMapaONodo(nodo, imagenMapaDataUrl, col.x, col.ancho, altoBanda, dim);
      }
    }
    y = yOriginal;
    y += altoBanda;
    if (altoBloqueEjecutivo(op, dim) > 0) {
      y += dim.paddingTarjeta;
      dibujarBloqueEjecutivo(nodo, dim);
      y += 50 * dim.escala;
    }
    // Fuente/atribución — chica y discreta, debajo de cada tarjeta.
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(6.5 * dim.escala);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('Fuente: Aplicativo Los Andes. La información está sujeta a variación.', MARGEN, y + 4 * dim.escala);
    y += 6 * dim.escala;

    // Dónde quedó el contenido en ESTA página, para que el pie se dibuje
    // justo debajo (no pegado al fondo físico de la hoja dejando un hueco
    // en blanco) — a pedido explícito. Se guarda por número de página
    // porque, si una tarjeta es chica, puede caber más de una en la misma
    // hoja; cada vez que se dibuja algo en esa página se actualiza con la
    // posición MÁS RECIENTE (la de más abajo), que es la que importa.
    yFinalContenidoPorPagina.set(pdf.getNumberOfPages(), y);

    y += ESPACIO_ENTRE_TARJETAS - 6 * dim.escala;
  }

  dibujarEncabezadoPagina();
  // Antes de dibujar, se recorta cada imagen de mapa a la proporción
  // EXACTA del recuadro donde va a caer en SU tarjeta (que varía un poco
  // según cuántos delitos tenga el nodo y la escala que le toque) — así
  // dibujarImagenMapaONodo ya no tiene que decidir entre dejar franjas en
  // blanco o deformar la imagen, porque llega lista para llenar el
  // recuadro por completo.
  const imagenesAjustadas = new Map<string, string>();
  for (const nodo of nodos) {
    const original = imagenesPorNodo?.get(nodo.nombre);
    if (!original) continue;
    if (!op.mapa) continue;
    const dim = crearDimensiones(alturaYEscalaPorNodo.get(nodo.nombre)!.escala);
    const banda = layoutBanda(nodo, dim, op);
    const colMapa = banda.columnas.find((c) => c.tipo === 'mapa');
    if (!colMapa) continue;
    imagenesAjustadas.set(nodo.nombre, await recortarImagenParaCobertura(original, colMapa.ancho - 8, banda.alto - 8));
  }
  if (ALTO_FICHA > 0 && op.ficha) {
    pdf.setFillColor(236, 247, 240);
    pdf.roundedRect(MARGEN - 5, y - 3, ANCHO_UTIL + 10, ALTO_FICHA - 2, 2.5, 2.5, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...COLOR_GREEN);
    pdf.text('Configuración del informe', MARGEN, y + 2.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.2);
    pdf.setTextColor(...COLOR_TEXTO);
    op.ficha.forEach((linea, i) => pdf.text(linea, MARGEN, y + 7.5 + i * 4.6, { maxWidth: ANCHO_UTIL }));
    y += ALTO_FICHA;
  }
  for (let i = 0; i < nodos.length; i++) {
    const nodo = nodos[i];
    if (i > 0) {
      // Cada tarjeta (salvo la primera, para la que ya se creó la hoja
      // con el tamaño correcto arriba) agrega su PROPIA página, ya medida
      // a su propio contenido — no una A4 genérica.
      pdf.addPage([MM_ANCHO, alturaYEscalaPorNodo.get(nodo.nombre)!.alturaPagina]);
      dibujarEncabezadoPagina();
    }
    dibujarTarjetaNodo(nodo, imagenesAjustadas.get(nodo.nombre));
  }

  // Secciones adicionales (Operatividad, RNMC...) — páginas propias, cada
  // una con SU alto ya calculado por quien la arma, agregadas DESPUÉS de
  // Delictividad pero ANTES del pie (para que el pie, dibujado más abajo
  // sobre TODAS las páginas, también les llegue a estas).
  if (seccionesExtra) {
    for (const [indice, seccion] of seccionesExtra.entries()) {
      if (!(extrasIniciales && indice === 0)) {
        pdf.addPage([MM_ANCHO, seccion.alturaPagina]);
        dibujarEncabezadoPagina();
      }
      const yFinal = seccion.dibujarContenido(pdf, MARGEN, y, ANCHO_UTIL);
      yFinalContenidoPorPagina.set(pdf.getNumberOfPages(), yFinal + 6);
    }
  }

  // El pie de página (banda institucional + fecha de generación) se
  // dibuja al final, sobre TODAS las páginas ya generadas — más simple
  // que ir intercalándolo mientras se agrega contenido dinámico.
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = paginaInicial; p <= totalPaginas; p++) {
    pdf.setPage(p);
    dibujarPiePagina(yFinalContenidoPorPagina.get(p));
    // Franjita oscura propia (no parte de la imagen) detrás de la fecha
    // de generación — así el texto blanco SIEMPRE tiene contraste
    // garantizado, sin depender de qué color quedó justo ahí en la
    // imagen del pie (que puede variar si el pie se recorta o se
    // reemplaza más adelante). Usa el alto REAL de esta página (ya no
    // son todas iguales) para pegarse a su propio borde inferior.
    const altoEstaPagina = (pdf as any).internal.pageSize.getHeight();
    pdf.setFillColor(6, 30, 24);
    pdf.rect(0, altoEstaPagina - 4, MM_ANCHO, 4, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`Generado el ${new Date().toLocaleString('es-CO')}  ·  Página ${p} de ${totalPaginas}`, MARGEN, altoEstaPagina - 1.5);
  }

  if (op.pdfBase) return;
  if ((globalThis as any).__TEST_OUTPUT_PATH__) {
    const fs = await import('fs');
    fs.writeFileSync((globalThis as any).__TEST_OUTPUT_PATH__, Buffer.from(pdf.output('arraybuffer')));
    return;
  }
  pdf.save(nombreArchivo);
}

/**
 * «Tablas estadísticas» del asistente: una página con la tabla consolidada
 * de TODAS las unidades del informe (mismas cifras de cada tarjeta).
 */
export function seccionTablaConsolidada(nodos: NodoMicrogerencia[], anioActual: number, anioAnterior: number): SeccionExtraMicrogerencia {
  const ALTO_FILA = 6.4;
  return {
    titulo: 'Tabla estadística consolidada',
    alturaPagina: 70 + 18 + nodos.length * ALTO_FILA + 40,
    dibujarContenido: (pdf, x, yInicio, ancho) => {
      let y = yInicio;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.setTextColor(...COLOR_GREEN);
      pdf.text('Tabla estadística consolidada', x, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(`Unidades incluidas en este informe — ${anioAnterior} vs. ${anioActual} (a la fecha) y proyección`, x, y);
      y += 7;
      const cols = [
        { t: 'Unidad', x: x + 2, a: 'left' as const },
        { t: `Total ${anioAnterior}`, x: x + ancho * 0.46, a: 'right' as const },
        { t: `${anioAnterior}`, x: x + ancho * 0.56, a: 'right' as const },
        { t: `${anioActual}`, x: x + ancho * 0.66, a: 'right' as const },
        { t: 'Dif.', x: x + ancho * 0.74, a: 'right' as const },
        { t: 'Var. %', x: x + ancho * 0.84, a: 'right' as const },
        { t: `Proy. ${anioActual}`, x: x + ancho - 2, a: 'right' as const },
      ];
      pdf.setFillColor(...COLOR_GREEN);
      pdf.rect(x, y - 4.2, ancho, 6.4, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(255, 255, 255);
      cols.forEach((c) => pdf.text(c.t, c.x, y, { align: c.a }));
      y += ALTO_FILA;
      nodos.forEach((n, i) => {
        if (i % 2 === 0) { pdf.setFillColor(240, 247, 244); pdf.rect(x, y - 4.2, ancho, ALTO_FILA, 'F'); }
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...COLOR_TEXTO);
        pdf.text(nombreVisibleUnidad(n.nombre), cols[0].x, y, { maxWidth: ancho * 0.36 });
        pdf.text(formatearNumero(n.total2025), cols[1].x, y, { align: 'right' });
        pdf.text(formatearNumero(n.fecha2025), cols[2].x, y, { align: 'right' });
        pdf.setFont('helvetica', 'bold');
        pdf.text(formatearNumero(n.fecha2026), cols[3].x, y, { align: 'right' });
        pdf.setTextColor(...colorPorDif(n.dif));
        pdf.text(`${n.dif >= 0 ? '+' : ''}${formatearNumero(n.dif)}`, cols[4].x, y, { align: 'right' });
        pdf.text(formatearPct(n.pct), cols[5].x, y, { align: 'right' });
        pdf.setTextColor(...COLOR_TEXTO);
        pdf.setFont('helvetica', 'normal');
        pdf.text(formatearNumero(n.terminaAnio), cols[6].x, y, { align: 'right' });
        y += ALTO_FILA;
      });
      return y;
    },
  };
}
