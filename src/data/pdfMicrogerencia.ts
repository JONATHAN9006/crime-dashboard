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

// Tamaños grandes, pensados para que se lean bien impresos.
const ALTO_TITULO_TARJETA = 13;
const ALTO_FILA_METRICAS = 22;
const ALTO_FILA_TRIM_MES = 6.2; // Trimestres/Meses: filas fijas (4 y 12), letra más grande
const ALTO_FILA_DELITOS = 5.6; // Delitos: cantidad variable, en 1 o 2 columnas según cuántos haya
const ALTO_ENCABEZADO_BLOQUE = 10;
const ALTO_MARGEN_INFERIOR_BLOQUE = 10; // espacio de sobra bajo la última fila, para que el texto nunca sobresalga del color de fondo
const PADDING_TARJETA = 4;
const ESPACIO_ENTRE_TARJETAS = 8;

function altoTablaDelitos(cantidad: number): number {
  if (cantidad === 0) return 0;
  return ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_DELITOS * cantidad + ALTO_MARGEN_INFERIOR_BLOQUE;
}

function altoTablaTop5(): number {
  return ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_DELITOS * 5 + ALTO_MARGEN_INFERIOR_BLOQUE;
}

function altoBandaTresColumnas(nodo: NodoMicrogerencia): number {
  const altoMeses = ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_TRIM_MES * 12 + ALTO_MARGEN_INFERIOR_BLOQUE;
  const altoTrimestres = ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_TRIM_MES * 4 + ALTO_MARGEN_INFERIOR_BLOQUE;
  // Columna 1 apila Trimestres + Top 10 delitos (no todos) — así nunca
  // queda desproporcionadamente más alta que Meses o el mapa.
  const cantidadDelitosMostrados = Math.min(nodo.delitos.length, 10);
  const altoColumna1 = altoTrimestres + PADDING_TARJETA + altoTablaDelitos(cantidadDelitosMostrados);
  return Math.max(altoMeses, altoColumna1);
}

export async function generarPdfMicrogerencia(nodos: NodoMicrogerencia[], tituloVista: string, imagenesPorNodo?: Map<string, string>): Promise<void> {
  const [escudoBase64, popayanBase64, iconosFooterBase64] = await Promise.all([
    cargarImagenBase64('/assets/escudo-policia.png'),
    cargarImagenBase64('/assets/popayan-territorio-seguro.png'),
    cargarImagenBase64('/assets/mepoy-footer-iconos.png'),
  ]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 0;

  // Colores muestreados directo de la plantilla institucional nueva
  // (banner "Microgerencia — Popayán Territorio Seguro").
  const VERDE_OSCURO_BANNER: [number, number, number] = [2, 90, 70];
  const VERDE_MAS_OSCURO_BANNER: [number, number, number] = [4, 50, 40];
  const LIMA_BANNER: [number, number, number] = [178, 241, 7];
  const ALTO_HEADER = 26;
  const ALTO_FOOTER = 13;

  function dibujarEncabezadoPagina() {
    // Degradado simple de dos tonos (izquierda más clara, derecha más
    // oscura) + una franja lima diagonal, para acercarse al banner real
    // sin depender de gradientes reales (jsPDF no los soporta nativo).
    pdf.setFillColor(...VERDE_MAS_OSCURO_BANNER);
    pdf.rect(0, 0, MM_ANCHO, ALTO_HEADER, 'F');
    pdf.setFillColor(...VERDE_OSCURO_BANNER);
    pdf.rect(0, 0, MM_ANCHO * 0.62, ALTO_HEADER, 'F');
    pdf.setFillColor(...LIMA_BANNER);
    pdf.triangle(MM_ANCHO * 0.58, 0, MM_ANCHO * 0.64, 0, MM_ANCHO * 0.60, ALTO_HEADER, 'F');

    if (escudoBase64) {
      try { pdf.addImage(escudoBase64, 'PNG', MARGEN, 3, 19, 19); } catch { /* sin escudo si falla */ }
    }
    const xTexto = escudoBase64 ? MARGEN + 22 : MARGEN;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.5);
    pdf.text('POLICÍA NACIONAL', xTexto, 8);
    pdf.text('METROPOLITANA DE POPAYÁN', xTexto, 12.5);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Centro de Información Estratégica', xTexto, 17.5);
    pdf.text('Policial del Servicio (CIEPS)', xTexto, 21);

    // Título de la vista (nodo actual), centrado en el tramo verde claro.
    // Se recorta según el ANCHO REAL del texto (no una cantidad fija de
    // caracteres) — un conteo de caracteres no es buen indicador del
    // ancho real (varía con el contenido y la fuente en negrita), y con
    // textos largos como "Selección personalizada (2 elementos)" se
    // encimaba con el logo de Popayán a la derecha.
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    const xTitulo = MM_ANCHO * 0.60 + 11;
    const anchoMaximoTitulo = MM_ANCHO - MARGEN - 24 - xTitulo; // hasta justo antes del logo
    let tituloMostrado = tituloVista;
    while (pdf.getTextWidth(tituloMostrado) > anchoMaximoTitulo && tituloMostrado.length > 1) {
      tituloMostrado = tituloMostrado.slice(0, -1);
    }
    if (tituloMostrado !== tituloVista) tituloMostrado = tituloMostrado.replace(/\s*$/, '') + '…';
    pdf.text(tituloMostrado, xTitulo, ALTO_HEADER / 2 + 1.5);

    if (popayanBase64) {
      try { pdf.addImage(popayanBase64, 'PNG', MM_ANCHO - MARGEN - 22, 2, 22, 22 * (190 / 215)); } catch { /* sin logo si falla */ }
    }
    y = ALTO_HEADER + 4;
  }

  function dibujarPiePagina() {
    const yFooter = MM_ALTO - ALTO_FOOTER;
    pdf.setFillColor(...VERDE_MAS_OSCURO_BANNER);
    pdf.rect(0, yFooter, MM_ANCHO, ALTO_FOOTER, 'F');
    pdf.setFillColor(...LIMA_BANNER);
    pdf.rect(0, yFooter, MM_ANCHO, 0.6, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bolditalic');
    pdf.setFontSize(9);
    pdf.text('"Un servicio de policía focalizado', MARGEN, yFooter + 5.5);
    pdf.text('para una Popayán más segura".', MARGEN, yFooter + 9.5);
    if (iconosFooterBase64) {
      // Proporción real del recorte (575x125) para no deformar los íconos.
      const anchoIconos = 95;
      try { pdf.addImage(iconosFooterBase64, 'PNG', MM_ANCHO - MARGEN - anchoIconos, yFooter + 1, anchoIconos, anchoIconos * (125 / 575)); } catch { /* sin íconos si falla */ }
    }
  }

  function altoDeTarjeta(nodo: NodoMicrogerencia): number {
    return ALTO_TITULO_TARJETA + ALTO_FILA_METRICAS + altoBandaTresColumnas(nodo) + PADDING_TARJETA * 3;
  }

  const Y_TOPE_PAGINA_FRESCA = ALTO_HEADER + 4; // el mismo valor que deja dibujarEncabezadoPagina() justo después de dibujar el encabezado

  function nuevaPaginaSiNoCabe(altoNecesario: number) {
    // Si ya estamos arriba de todo en una página recién empezada, NUNCA
    // saltar a una página nueva — aunque el contenido sea más alto de lo
    // que cabe, saltar solo produciría una página en blanco (el problema
    // sería exactamente el mismo en la página siguiente). Se deja dibujar
    // aquí mismo, aunque se pase un poco del margen inferior.
    if (y <= Y_TOPE_PAGINA_FRESCA) return;
    if (y + altoNecesario > MM_ALTO - MARGEN - ALTO_FOOTER) {
      pdf.addPage();
      dibujarEncabezadoPagina();
    }
  }

  function dibujarMetricas(nodo: NodoMicrogerencia) {
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
      const x = MARGEN + i * anchoColumna + PADDING_TARJETA;
      const anchoDisponible = anchoColumna - PADDING_TARJETA;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(c.etiqueta, x, y, { maxWidth: anchoDisponible });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...c.color);
      pdf.text(c.valor, x, y + 8, { maxWidth: anchoDisponible });
    });
    y += ALTO_FILA_METRICAS;
  }

  // Trimestres / Meses: una sola columna cada uno, en el ancho que se les dé.
  function dibujarBloqueTrimMes(titulo: string, filas: { etiqueta: string; anio2025: number; anio2026: number; dif: number }[], x0: number, ancho: number, alto: number, colorFondo: [number, number, number], colorFondoAlterno: [number, number, number], colorTitulo: [number, number, number]) {
    pdf.setFillColor(...colorFondo);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...colorTitulo);
    pdf.text(titulo, x0 + PADDING_TARJETA, y + 6);

    const colEtiqueta = x0 + PADDING_TARJETA;
    const colValor2025 = x0 + ancho * 0.55;
    const colValor2026 = x0 + ancho * 0.78;
    const colDif = x0 + ancho * 0.98;
    let fy = y + ALTO_ENCABEZADO_BLOQUE + 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('2025', colValor2025, fy, { align: 'right' });
    pdf.text('2026', colValor2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    fy += 5;

    filas.forEach((f, i) => {
      // Fila sombreada — un tono más oscuro y otro más claro, alternados,
      // para diferenciar cada fila igual que en el modal.
      pdf.setFillColor(...(i % 2 === 0 ? colorFondoAlterno : colorFondo));
      pdf.rect(x0 + 1, fy - 3.6, ancho - 2, ALTO_FILA_TRIM_MES, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(f.etiqueta.replace('Trimestre', 'Trim.'), colEtiqueta, fy, { maxWidth: ancho * 0.46 });
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(formatearNumero(f.anio2025), colValor2025, fy, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(formatearNumero(f.anio2026), colValor2026, fy, { align: 'right' });
      pdf.setTextColor(...colorPorDif(f.dif));
      pdf.text(`${f.dif >= 0 ? '+' : ''}${formatearNumero(f.dif)}`, colDif, fy, { align: 'right' });
      fy += ALTO_FILA_TRIM_MES;
    });
  }

  // Delitos: SIEMPRE en una sola columna — la tarjeta ya creció lo
  // necesario (ver altoBandaTresColumnas) para que quepan todos sin
  // comprimir, aprovechando el mismo espacio vertical que ya usan
  // Trimestres/Meses en vez de dejarlo en blanco.
  function dibujarBloqueDelitos(nodo: NodoMicrogerencia, x0: number, ancho: number, alto: number) {
    pdf.setFillColor(...COLOR_VIOLETA_CLARO);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(91, 33, 182);
    pdf.text(`DELITOS (${nodo.delitos.length})`, x0 + PADDING_TARJETA, y + 6);

    if (nodo.delitos.length === 0) return;

    const colDelito = x0 + PADDING_TARJETA;
    const colTotal2025 = x0 + ancho * 0.52;
    const col2025 = x0 + ancho * 0.64;
    const col2026 = x0 + ancho * 0.75;
    const colDif = x0 + ancho * 0.86;
    const colPct = x0 + ancho * 0.96;
    let fy = y + ALTO_ENCABEZADO_BLOQUE + 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('TOTAL 2025', colTotal2025, fy, { align: 'right' });
    pdf.text('2025', col2025, fy, { align: 'right' });
    pdf.text('2026', col2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    pdf.text('%', colPct, fy, { align: 'right' });
    fy += 5;

    nodo.delitos.forEach((d, i) => {
      pdf.setFillColor(...(i % 2 === 0 ? COLOR_VIOLETA_ALTERNO : COLOR_VIOLETA_CLARO));
      pdf.rect(x0 + 1, fy - 3.6, ancho - 2, ALTO_FILA_DELITOS, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
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
      fy += ALTO_FILA_DELITOS;
    });
  }

  // Versión COMPACTA de la tabla de delitos — solo el Top 5 (nodo.delitos
  // ya viene ordenado de mayor a menor), para la columna 1 debajo de
  // Trimestres.
  function dibujarTop5Delitos(nodo: NodoMicrogerencia, x0: number, ancho: number, alto: number) {
    pdf.setFillColor(...COLOR_VIOLETA_CLARO);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(91, 33, 182);
    pdf.text('TOP 5 DELITOS', x0 + PADDING_TARJETA, y + 6);

    const top5 = nodo.delitos.slice(0, 5);
    if (top5.length === 0) return;

    const colDelito = x0 + PADDING_TARJETA;
    const col2026 = x0 + ancho * 0.78;
    const colDif = x0 + ancho * 0.96;
    let fy = y + ALTO_ENCABEZADO_BLOQUE + 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('2026', col2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    fy += 5;

    top5.forEach((d, i) => {
      pdf.setFillColor(...(i % 2 === 0 ? COLOR_VIOLETA_ALTERNO : COLOR_VIOLETA_CLARO));
      pdf.rect(x0 + 1, fy - 3.6, ancho - 2, ALTO_FILA_DELITOS, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(d.nombre, colDelito, fy, { maxWidth: ancho * 0.65 });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(formatearNumero(d.fecha2026), col2026, fy, { align: 'right' });
      pdf.setTextColor(...colorPorDif(d.dif));
      pdf.text(`${d.dif >= 0 ? '+' : ''}${formatearNumero(d.dif)}`, colDif, fy, { align: 'right' });
      fy += ALTO_FILA_DELITOS;
    });
  }

  // Mapa + mapa de calor del nodo, si se pudo generar (ver
  // ModalMicrogerencia.tsx) — si no hay imagen disponible para este nodo
  // específico, se cae de vuelta a la lista completa de delitos, para que
  // el PDF nunca quede con un espacio vacío.
  function dibujarImagenMapaONodo(nodo: NodoMicrogerencia, imagenDataUrl: string | undefined, x0: number, ancho: number, alto: number) {
    if (!imagenDataUrl) {
      // Los delitos ya se muestran completos debajo de Trimestres (columna
      // 1) — aquí, si no hay mapa disponible para este nodo, se deja un
      // aviso simple en vez de repetir esa misma tabla dos veces.
      pdf.setFillColor(...COLOR_TARJETA_FONDO);
      pdf.setDrawColor(203, 213, 225);
      pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'FD');
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8.5);
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
    const altoTarjeta = altoDeTarjeta(nodo);
    nuevaPaginaSiNoCabe(altoTarjeta);

    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, altoTarjeta - PADDING_TARJETA + 3, 2.5, 2.5, 'FD');

    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, ALTO_TITULO_TARJETA, 2.5, 2.5, 'F');
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.rect(MARGEN - 3, y + ALTO_TITULO_TARJETA - 6, ANCHO_UTIL + 6, 3, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...COLOR_GREEN);
    pdf.text(nodo.nombre, MARGEN + PADDING_TARJETA, y + 5.5);
    y += ALTO_TITULO_TARJETA;

    dibujarMetricas(nodo);
    y += PADDING_TARJETA / 2;

    // Columna 1: Trimestres arriba, Top 5 delitos debajo. Columna 2:
    // Distribución por mes. Columna 3: mapa + mapa de calor del nodo (si
    // se pudo generar) — o, si no hay imagen disponible, la lista
    // completa de delitos como respaldo.
    const anchoTrimestres = ANCHO_UTIL * 0.25;
    const anchoTercera = ANCHO_UTIL * 0.42;
    const anchoMeses = ANCHO_UTIL - anchoTrimestres - anchoTercera - PADDING_TARJETA * 2;
    const altoBanda = altoBandaTresColumnas(nodo);

    const xMeses = MARGEN + anchoTrimestres + PADDING_TARJETA;
    const xTercera = xMeses + anchoMeses + PADDING_TARJETA;

    const altoTrimestres = ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_TRIM_MES * 4 + ALTO_MARGEN_INFERIOR_BLOQUE;
    dibujarBloqueTrimMes('TRIMESTRES', nodo.trimestres, MARGEN, anchoTrimestres, altoTrimestres, COLOR_AZUL_CLARO, COLOR_AZUL_ALTERNO, [30, 64, 175]);
    const yOriginal = y;
    y += altoTrimestres + PADDING_TARJETA;
    // Debajo de Trimestres: Top 10 delitos (no todos) — así la columna 1
    // nunca queda desproporcionadamente más alta que las otras dos.
    const delitosTop10 = { ...nodo, delitos: nodo.delitos.slice(0, 10) };
    dibujarBloqueDelitos(delitosTop10, MARGEN, anchoTrimestres, altoTablaDelitos(delitosTop10.delitos.length));
    y = yOriginal;

    // "Distribución por mes" usa su propia altura natural (12 filas fijas)
    // — NUNCA la altura compartida/estirada de toda la banda, que dejaba
    // un espacio vacío feo debajo de diciembre cuando la columna de
    // Delitos era más alta.
    const altoMesesPropio = ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_TRIM_MES * 12 + ALTO_MARGEN_INFERIOR_BLOQUE;
    dibujarBloqueTrimMes('DISTRIBUCIÓN POR MES', nodo.meses, xMeses, anchoMeses, altoMesesPropio, COLOR_AMBAR_CLARO, COLOR_AMBAR_ALTERNO, [146, 64, 14]);
    dibujarImagenMapaONodo(nodo, imagenMapaDataUrl, xTercera, anchoTercera, altoBanda);

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
