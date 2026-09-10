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

async function cargarEscudoBase64(): Promise<string | null> {
  try {
    const resp = await fetch('/assets/escudo-policia.png');
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
const ALTO_MARGEN_INFERIOR_BLOQUE = 6; // espacio de sobra bajo la última fila, para que el texto nunca sobresalga del color de fondo
const PADDING_TARJETA = 4;
const ESPACIO_ENTRE_TARJETAS = 8;

function altoTablaDelitos(cantidad: number): number {
  if (cantidad === 0) return 0;
  return ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_DELITOS * cantidad + ALTO_MARGEN_INFERIOR_BLOQUE;
}

function altoBandaTresColumnas(nodo: NodoMicrogerencia): number {
  const altoMeses = ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_TRIM_MES * 12 + ALTO_MARGEN_INFERIOR_BLOQUE;
  const altoTrimestres = ALTO_ENCABEZADO_BLOQUE + ALTO_FILA_TRIM_MES * 4 + ALTO_MARGEN_INFERIOR_BLOQUE;
  const altoDelitos = altoTablaDelitos(nodo.delitos.length);
  // La banda usa la altura del MÁS ALTO de los tres — si hay muchos
  // delitos, la tarjeta completa crece para darles espacio en una sola
  // columna (ver dibujarBloqueDelitos), en vez de comprimirlos en dos
  // columnas y dejar espacio en blanco sin usar debajo de los otros dos.
  return Math.max(altoMeses, altoTrimestres, altoDelitos);
}

export async function generarPdfMicrogerencia(nodos: NodoMicrogerencia[], tituloVista: string): Promise<void> {
  const escudoBase64 = await cargarEscudoBase64();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 0;

  function dibujarEncabezadoPagina() {
    pdf.setFillColor(...COLOR_GREEN);
    pdf.rect(0, 0, MM_ANCHO, 24, 'F');
    if (escudoBase64) {
      try { pdf.addImage(escudoBase64, 'PNG', MARGEN, 3, 17, 17); } catch { /* sin escudo si falla */ }
    }
    const xTexto = escudoBase64 ? MARGEN + 21 : MARGEN;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Microgerencia y Proyección Delictiva MEPOY', xTexto, 9);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Centro de Información Estratégica Policial del Servicio (CIEPS)', xTexto, 15);
    pdf.setFontSize(8);
    pdf.text(tituloVista, xTexto, 20.5);
    y = 30;
  }

  function altoDeTarjeta(nodo: NodoMicrogerencia): number {
    return ALTO_TITULO_TARJETA + ALTO_FILA_METRICAS + altoBandaTresColumnas(nodo) + PADDING_TARJETA * 3;
  }

  function nuevaPaginaSiNoCabe(altoNecesario: number) {
    if (y + altoNecesario > MM_ALTO - MARGEN) {
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
<<<<<<< HEAD
  function dibujarBloqueTrimMes(titulo: string, filas: { etiqueta: string; anio2025: number; anio2026: number; dif: number }[], x0: number, ancho: number, alto: number, colorFondo: [number, number, number], colorFondoAlterno: [number, number, number], colorTitulo: [number, number, number]) {
=======
  function dibujarBloqueTrimMes(titulo: string, filas: { etiqueta: string; anio2025: number; total2025: number; anio2026: number; dif: number }[], x0: number, ancho: number, alto: number, colorFondo: [number, number, number], colorFondoAlterno: [number, number, number], colorTitulo: [number, number, number]) {
>>>>>>> e724705780d93774cd06590b1245d3325a08982c
    pdf.setFillColor(...colorFondo);
    pdf.roundedRect(x0, y, ancho, alto, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...colorTitulo);
    pdf.text(titulo, x0 + PADDING_TARJETA, y + 6);

    const colEtiqueta = x0 + PADDING_TARJETA;
<<<<<<< HEAD
    const colValor2025 = x0 + ancho * 0.55;
    const colValor2026 = x0 + ancho * 0.78;
    const colDif = x0 + ancho * 0.98;
=======
    const colTotal2025 = x0 + ancho * 0.46;
    const colValor2025 = x0 + ancho * 0.65;
    const colValor2026 = x0 + ancho * 0.83;
    const colDif = x0 + ancho * 0.99;
>>>>>>> e724705780d93774cd06590b1245d3325a08982c
    let fy = y + ALTO_ENCABEZADO_BLOQUE + 2;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.8);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('TOTAL 2025', colTotal2025, fy, { align: 'right' });
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
      pdf.setFontSize(8);
      pdf.setTextColor(...COLOR_TEXTO);
<<<<<<< HEAD
      pdf.text(f.etiqueta.replace('Trimestre', 'Trim.'), colEtiqueta, fy, { maxWidth: ancho * 0.46 });
=======
      pdf.text(f.etiqueta.replace('Trimestre', 'Trim.'), colEtiqueta, fy, { maxWidth: ancho * 0.35 });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colorTitulo);
      pdf.text(formatearNumero(f.total2025), colTotal2025, fy, { align: 'right' });
      pdf.setFont('helvetica', 'normal');
>>>>>>> e724705780d93774cd06590b1245d3325a08982c
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
<<<<<<< HEAD
    const colTotal2025 = x0 + ancho * 0.52;
    const col2025 = x0 + ancho * 0.64;
    const col2026 = x0 + ancho * 0.75;
    const colDif = x0 + ancho * 0.86;
    const colPct = x0 + ancho * 0.96;
=======
    const colTotal2025 = x0 + ancho * 0.56;
    const col2025 = x0 + ancho * 0.68;
    const col2026 = x0 + ancho * 0.79;
    const colDif = x0 + ancho * 0.9;
    const colPct = x0 + ancho * 1.0;
>>>>>>> e724705780d93774cd06590b1245d3325a08982c
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
<<<<<<< HEAD
      pdf.text(d.nombre, colDelito, fy, { maxWidth: ancho * 0.48 });
=======
      pdf.text(d.nombre, colDelito, fy, { maxWidth: ancho * 0.53 });
>>>>>>> e724705780d93774cd06590b1245d3325a08982c
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

  function dibujarTarjetaNodo(nodo: NodoMicrogerencia) {
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

    // Tres columnas lado a lado, en el orden pedido: Trimestres →
    // Distribución por mes → Delitos.
    const anchoTrimestres = ANCHO_UTIL * 0.25;
    const anchoDelitos = ANCHO_UTIL * 0.42;
    const anchoMeses = ANCHO_UTIL - anchoTrimestres - anchoDelitos - PADDING_TARJETA * 2;
    const altoBanda = altoBandaTresColumnas(nodo);

    const xMeses = MARGEN + anchoTrimestres + PADDING_TARJETA;
    const xDelitos = xMeses + anchoMeses + PADDING_TARJETA;

    dibujarBloqueTrimMes('TRIMESTRES', nodo.trimestres, MARGEN, anchoTrimestres, altoBanda, COLOR_AZUL_CLARO, COLOR_AZUL_ALTERNO, [30, 64, 175]);
    dibujarBloqueTrimMes('DISTRIBUCIÓN POR MES', nodo.meses, xMeses, anchoMeses, altoBanda, COLOR_AMBAR_CLARO, COLOR_AMBAR_ALTERNO, [146, 64, 14]);
    dibujarBloqueDelitos(nodo, xDelitos, anchoDelitos, altoBanda);

    y += altoBanda + ESPACIO_ENTRE_TARJETAS;
  }

  dibujarEncabezadoPagina();
  for (const nodo of nodos) dibujarTarjetaNodo(nodo);

  const totalPaginas = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text(`Generado el ${new Date().toLocaleString('es-CO')}  ·  Página ${p} de ${totalPaginas}`, MARGEN, MM_ALTO - 5);
  }

  pdf.save('microgerencia-mepoy.pdf');
}
