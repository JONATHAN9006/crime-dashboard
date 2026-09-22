// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" — un PDF
// por TARJETAS (una por cada nodo seleccionado). Cada tarjeta trae: título,
// fila de métricas generales, y TRES bloques lado a lado (Trimestres |
// Delitos | Distribución por mes) — cada uno con su propio color, tal como
// se pidió — con letra más grande para que se lea bien impreso.
import { jsPDF } from 'jspdf';
import type { NodoMicrogerencia } from './microgerencia';

const MM_ANCHO = 297; // A4 horizontal
const MM_ALTO = 210;
const MARGEN = 14;
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
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
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
  filaDelitos: 7.8,
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

function altoBandaTresColumnas(nodo: NodoMicrogerencia, dim: Dimensiones): number {
  const altoMeses = dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 12 + dim.altoMargenInferiorBloque;
  const altoTrimestres = dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 4 + dim.altoMargenInferiorBloque;
  // Columna 1 apila Trimestres + Top 10 delitos (no todos) — así nunca
  // queda desproporcionadamente más alta que Meses o el mapa.
  const cantidadDelitosMostrados = Math.min(nodo.delitos.length, 10);
  const altoColumna1 = altoTrimestres + dim.paddingTarjeta + altoTablaDelitos(cantidadDelitosMostrados, dim);
  return Math.max(altoMeses, altoColumna1);
}

function altoDeTarjeta(nodo: NodoMicrogerencia, dim: Dimensiones): number {
  return dim.altoTituloTarjeta + dim.altoFilaMetricas + altoBandaTresColumnas(nodo, dim) + dim.paddingTarjeta * 3;
}

export async function generarPdfMicrogerencia(nodos: NodoMicrogerencia[], tituloVista: string, imagenesPorNodo?: Map<string, string>): Promise<void> {
  // El encabezado y el pie de página ahora son las imágenes REALES que
  // proporcionó el usuario (public/assets/microgerencia-header.png y
  // microgerencia-footer.png) — se estampan tal cual, a todo el ancho de
  // la página, en vez de reconstruir el diseño con formas y texto por
  // separado (que nunca terminaba de verse idéntico: tono de verde,
  // tipografía, proporciones). Se preserva la proporción real de cada
  // imagen (646×122 el encabezado, 652×71 el pie) para no deformarlas.
  const [encabezadoBase64, pieBase64] = await Promise.all([
    cargarImagenBase64('/assets/microgerencia-header.png'),
    cargarImagenBase64('/assets/microgerencia-footer.png'),
  ]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 0;

  const ALTO_HEADER = MM_ANCHO * (122 / 646);
  const ALTO_FOOTER = MM_ANCHO * (71 / 652);

  function dibujarEncabezadoPagina() {
    if (encabezadoBase64) {
      try { pdf.addImage(encabezadoBase64, 'PNG', 0, 0, MM_ANCHO, ALTO_HEADER); } catch { /* sin encabezado si falla */ }
    }
    y = ALTO_HEADER + 4;
  }

  function dibujarPiePagina() {
    const yFooter = MM_ALTO - ALTO_FOOTER;
    if (pieBase64) {
      try { pdf.addImage(pieBase64, 'PNG', 0, yFooter, MM_ANCHO, ALTO_FOOTER); } catch { /* sin pie si falla */ }
    }
  }

  const Y_TOPE_PAGINA_FRESCA = ALTO_HEADER + 4; // el mismo valor que deja dibujarEncabezadoPagina() justo después de dibujar el encabezado
  // Alto máximo que puede ocupar una tarjeta en CUALQUIER página (recién
  // empezada o no) sin invadir el pie de página. Si una tarjeta no cabe
  // aquí a tamaño normal, se achica proporcionalmente (ver
  // calcularEscalaTarjeta) en vez de cortarse — ese recorte era justo el
  // problema reportado (la tabla de meses se cortaba antes de diciembre).
  const ALTO_MAXIMO_TARJETA = MM_ALTO - MARGEN - ALTO_FOOTER - Y_TOPE_PAGINA_FRESCA;

  function calcularEscalaTarjeta(nodo: NodoMicrogerencia): number {
    const alturaNatural = altoDeTarjeta(nodo, crearDimensiones(1));
    if (alturaNatural <= ALTO_MAXIMO_TARJETA) return 1;
    return ALTO_MAXIMO_TARJETA / alturaNatural;
  }

  function nuevaPaginaSiNoCabe(altoNecesario: number) {
    // Antes, si ya estábamos en una página recién empezada, nunca se
    // saltaba de página (para no dejar una en blanco) y el contenido que
    // sobraba simplemente se dibujaba encima del pie de página o se
    // recortaba al borde físico de la hoja. Ahora eso ya no puede pasar:
    // calcularEscalaTarjeta() garantiza que altoNecesario siempre quepa en
    // ALTO_MAXIMO_TARJETA, así que esta función solo decide si conviene
    // saltar a una página nueva por falta de espacio EN LO QUE QUEDA de la
    // actual (no por falta de espacio en general).
    if (y <= Y_TOPE_PAGINA_FRESCA) return;
    if (y + altoNecesario > MM_ALTO - MARGEN - ALTO_FOOTER) {
      pdf.addPage();
      dibujarEncabezadoPagina();
    }
  }

  function dibujarMetricas(nodo: NodoMicrogerencia, dim: Dimensiones) {
    const difProyeccion = Math.round(nodo.difConAnioAnterior);
    const pctProyeccion = nodo.total2025 > 0 ? (difProyeccion / nodo.total2025) * 100 : null;
    const columnas: { etiqueta: string; valor: string; color: [number, number, number] }[] = [
      { etiqueta: 'TOTAL 2025', valor: formatearNumero(nodo.total2025), color: COLOR_TEXTO },
      { etiqueta: '2025 (A LA FECHA)', valor: formatearNumero(nodo.fecha2025), color: COLOR_TEXTO },
      { etiqueta: '2026 (A LA FECHA)', valor: formatearNumero(nodo.fecha2026), color: COLOR_GREEN },
      { etiqueta: 'DIF', valor: `${nodo.dif >= 0 ? '+' : ''}${formatearNumero(nodo.dif)}`, color: colorPorDif(nodo.dif) },
      { etiqueta: '%', valor: formatearPct(nodo.pct), color: colorPorDif(nodo.dif) },
      { etiqueta: 'APORTE %', valor: `${nodo.aportePct.toFixed(1)}%`, color: COLOR_TEXTO },
      { etiqueta: 'TOTAL PROYECTADO 2026', valor: formatearNumero(nodo.terminaAnio), color: COLOR_TEXTO },
      { etiqueta: 'PROY. VS 2025', valor: `${difProyeccion >= 0 ? '+' : ''}${formatearNumero(difProyeccion)} (${pctProyeccion === null ? 'N/A' : `${pctProyeccion >= 0 ? '+' : ''}${pctProyeccion.toFixed(1)}%`})`, color: colorPorDif(difProyeccion) },
    ];
    const anchoColumna = ANCHO_UTIL / columnas.length;
    columnas.forEach((c, i) => {
      const x = MARGEN + i * anchoColumna + dim.paddingTarjeta;
      const anchoDisponible = anchoColumna - dim.paddingTarjeta;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(BASE_FS.etiquetaMetrica * dim.escala);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(c.etiqueta, x, y, { maxWidth: anchoDisponible });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(BASE_FS.valorMetrica * dim.escala);
      pdf.setTextColor(...c.color);
      pdf.text(c.valor, x, y + 8 * dim.escala, { maxWidth: anchoDisponible });
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
    pdf.text(titulo, x0 + dim.paddingTarjeta, y + 6 * dim.escala);

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
    const colTotal2025 = x0 + ancho * 0.52;
    const col2025 = x0 + ancho * 0.64;
    const col2026 = x0 + ancho * 0.75;
    const colDif = x0 + ancho * 0.86;
    const colPct = x0 + ancho * 0.96;
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
      pdf.text(d.nombre, colDelito, fy, { maxWidth: ancho * 0.48 });
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
      pdf.text('Mapa no disponible para este elemento', x0 + ancho / 2, y + alto / 2, { align: 'center', maxWidth: ancho - 8 });
      return;
    }
    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'FD');
    try {
      // Se calcula el tamaño respetando la proporción real de la imagen
      // para que no se vea estirada — se centra dentro del recuadro.
      const propsImg = (pdf as any).getImageProperties(imagenDataUrl);
      const proporcion = propsImg.width / propsImg.height;
      let anchoImg = ancho - 4;
      let altoImg = anchoImg / proporcion;
      if (altoImg > alto - 4) {
        altoImg = alto - 4;
        anchoImg = altoImg * proporcion;
      }
      const xImg = x0 + (ancho - anchoImg) / 2;
      const yImg = y + (alto - altoImg) / 2;
      pdf.addImage(imagenDataUrl, 'PNG', xImg, yImg, anchoImg, altoImg);
    } catch {
      // Si la imagen viene corrupta o en un formato que jsPDF no acepta,
      // no se rompe el PDF entero — simplemente se deja el recuadro vacío.
    }
  }

  function dibujarTarjetaNodo(nodo: NodoMicrogerencia, imagenMapaDataUrl?: string) {
    // La tarjeta se dibuja SIEMPRE completa en una sola página — si a
    // tamaño normal (escala 1) no cabría en el espacio disponible, se
    // calcula aquí una escala menor y TODO (letra, alto de fila, padding)
    // se reduce en la misma proporción, en vez de cortar el contenido que
    // sobre (que era exactamente lo que pasaba antes: la tabla de
    // "Distribución por mes" quedaba cortada antes de diciembre).
    const escala = calcularEscalaTarjeta(nodo);
    const dim = crearDimensiones(escala);
    const altoTarjeta = altoDeTarjeta(nodo, dim);
    nuevaPaginaSiNoCabe(altoTarjeta);

    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, altoTarjeta - dim.paddingTarjeta + 3, 2.5, 2.5, 'FD');

    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, dim.altoTituloTarjeta, 2.5, 2.5, 'F');
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.rect(MARGEN - 3, y + dim.altoTituloTarjeta - 6, ANCHO_UTIL + 6, 3, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(BASE_FS.tituloTarjeta * dim.escala);
    pdf.setTextColor(...COLOR_GREEN);
    pdf.text(nodo.nombre, MARGEN + dim.paddingTarjeta, y + 5.5 * dim.escala);
    y += dim.altoTituloTarjeta;

    dibujarMetricas(nodo, dim);
    y += dim.paddingTarjeta / 2;

    // Columna 1: Trimestres arriba, Top 10 delitos debajo. Columna 2:
    // Distribución por mes. Columna 3: mapa + mapa de calor del nodo (si
    // se pudo generar) — o, si no hay imagen disponible, la lista
    // completa de delitos como respaldo.
    const anchoTrimestres = ANCHO_UTIL * 0.25;
    const anchoTercera = ANCHO_UTIL * 0.42;
    const anchoMeses = ANCHO_UTIL - anchoTrimestres - anchoTercera - dim.paddingTarjeta * 2;
    const altoBanda = altoBandaTresColumnas(nodo, dim);

    const xMeses = MARGEN + anchoTrimestres + dim.paddingTarjeta;
    const xTercera = xMeses + anchoMeses + dim.paddingTarjeta;

    const altoTrimestres = dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 4 + dim.altoMargenInferiorBloque;
    dibujarBloqueTrimMes('TRIMESTRES', nodo.trimestres, MARGEN, anchoTrimestres, altoTrimestres, COLOR_AZUL_CLARO, COLOR_AZUL_ALTERNO, [30, 64, 175], dim);
    const yOriginal = y;
    y += altoTrimestres + dim.paddingTarjeta;
    // Debajo de Trimestres: Top 10 delitos (no todos) — así la columna 1
    // nunca queda desproporcionadamente más alta que las otras dos.
    const delitosTop10 = { ...nodo, delitos: nodo.delitos.slice(0, 10) };
    dibujarBloqueDelitos(delitosTop10, MARGEN, anchoTrimestres, altoTablaDelitos(delitosTop10.delitos.length, dim), dim);
    y = yOriginal;

    // "Distribución por mes" usa su propia altura natural (12 filas fijas)
    // — NUNCA la altura compartida/estirada de toda la banda, que dejaba
    // un espacio vacío feo debajo de diciembre cuando la columna de
    // Delitos era más alta.
    const altoMesesPropio = dim.altoEncabezadoBloque + dim.altoFilaTrimMes * 12 + dim.altoMargenInferiorBloque;
    dibujarBloqueTrimMes('DISTRIBUCIÓN POR MES', nodo.meses, xMeses, anchoMeses, altoMesesPropio, COLOR_AMBAR_CLARO, COLOR_AMBAR_ALTERNO, [146, 64, 14], dim);
    dibujarImagenMapaONodo(nodo, imagenMapaDataUrl, xTercera, anchoTercera, altoBanda, dim);

    y += altoBanda + ESPACIO_ENTRE_TARJETAS;
  }

  dibujarEncabezadoPagina();
  for (const nodo of nodos) dibujarTarjetaNodo(nodo, imagenesPorNodo?.get(nodo.nombre));

  // El pie de página (banda institucional + fecha de generación) se
  // dibuja al final, sobre TODAS las páginas ya generadas — más simple
  // que ir intercalándolo mientras se agrega contenido dinámico.
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    dibujarPiePagina();
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`Generado el ${new Date().toLocaleString('es-CO')}  ·  Página ${p} de ${totalPaginas}`, MARGEN, MM_ALTO - 1.5);
  }

  if ((globalThis as any).__TEST_OUTPUT_PATH__) {
    const fs = await import('fs');
    fs.writeFileSync((globalThis as any).__TEST_OUTPUT_PATH__, Buffer.from(pdf.output('arraybuffer')));
    return;
  }
  pdf.save('microgerencia-mepoy.pdf');
}
