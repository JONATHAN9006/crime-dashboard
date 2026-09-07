// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" — un PDF
// por TARJETAS (una por cada nodo seleccionado), cada una con su fila de
// métricas generales y sus tablas de Trimestres y Meses — el mismo formato
// que ya se ve en el modal, para que no haya sorpresas entre lo que se ve
// en pantalla y lo que sale impreso. Construido con las primitivas de
// jsPDF (texto/rectángulos) para texto nítido, igual que el resto del
// dashboard.
import { jsPDF } from 'jspdf';
import type { NodoMicrogerencia } from './microgerencia';

const MM_ANCHO = 297; // A4 horizontal
const MM_ALTO = 210;
const MARGEN = 12;
const ANCHO_UTIL = MM_ANCHO - MARGEN * 2;
const COLOR_NAVY: [number, number, number] = [16, 35, 63];
const COLOR_GREEN: [number, number, number] = [17, 103, 98];
const COLOR_GRIS_CLARO: [number, number, number] = [244, 246, 248];
const COLOR_TEXTO: [number, number, number] = [30, 41, 59];
const COLOR_ROJO: [number, number, number] = [190, 30, 45];
const COLOR_VERDE: [number, number, number] = [15, 118, 90];
const COLOR_MUTED: [number, number, number] = [100, 116, 139];

function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n));
}
function formatearPct(n: number | null): string {
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}
function colorPorDif(dif: number): [number, number, number] {
  return dif > 0 ? COLOR_ROJO : dif < 0 ? COLOR_VERDE : COLOR_MUTED;
}

// Alto estimado (mm) que va a ocupar la tarjeta completa de un nodo —
// título + fila de métricas + tabla de trimestres (4 filas) + tabla de
// meses (6 filas × 2 columnas) + espaciado. Se calcula ANTES de dibujar
// para decidir si hace falta saltar de página (nunca se corta una tarjeta
// a la mitad entre dos páginas).
const ALTO_TITULO_TARJETA = 9;
const ALTO_FILA_METRICAS = 14;
const ALTO_FILA_TABLA = 5.2;
const ALTO_TRIMESTRES = 6 + ALTO_FILA_TABLA * 5; // encabezado + 4 trimestres + margen
const ALTO_MESES = 6 + ALTO_FILA_TABLA * 7; // encabezado + 6 filas (2 columnas de 6 meses)
const ESPACIO_ENTRE_TARJETAS = 8;
const ALTO_TARJETA_COMPLETA = ALTO_TITULO_TARJETA + ALTO_FILA_METRICAS + ALTO_TRIMESTRES + ALTO_MESES + ESPACIO_ENTRE_TARJETAS;

export function generarPdfMicrogerencia(nodos: NodoMicrogerencia[], tituloVista: string): void {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 0;

  function dibujarEncabezadoPagina() {
    pdf.setFillColor(...COLOR_NAVY);
    pdf.rect(0, 0, MM_ANCHO, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Microgerencia y Proyección Delictiva MEPOY', MARGEN, 9);
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Centro de Información Estratégica Policial del Servicio (CIEPS)', MARGEN, 15.5);
    pdf.setFontSize(8.5);
    pdf.text(tituloVista, MARGEN, 21);
    y = 30;
  }

  function nuevaPaginaSiNoCabe(altoNecesario: number) {
    if (y + altoNecesario > MM_ALTO - MARGEN) {
      pdf.addPage();
      dibujarEncabezadoPagina();
    }
  }

  function dibujarMetricas(nodo: NodoMicrogerencia) {
    const columnas: { etiqueta: string; valor: string; color: [number, number, number] }[] = [
      { etiqueta: 'TOTAL 2025', valor: formatearNumero(nodo.total2025), color: COLOR_TEXTO },
      { etiqueta: '2025 (A LA FECHA)', valor: formatearNumero(nodo.fecha2025), color: COLOR_TEXTO },
      { etiqueta: '2026 (A LA FECHA)', valor: formatearNumero(nodo.fecha2026), color: COLOR_NAVY },
      { etiqueta: 'DIF', valor: `${nodo.dif >= 0 ? '+' : ''}${formatearNumero(nodo.dif)}`, color: colorPorDif(nodo.dif) },
      { etiqueta: '%', valor: formatearPct(nodo.pct), color: colorPorDif(nodo.dif) },
      { etiqueta: 'APORTE %', valor: `${nodo.aportePct.toFixed(1)}%`, color: COLOR_TEXTO },
      { etiqueta: 'PROY. CIERRE', valor: formatearNumero(nodo.terminaAnio), color: COLOR_MUTED },
    ];
    const anchoColumna = ANCHO_UTIL / columnas.length;
    columnas.forEach((c, i) => {
      const x = MARGEN + i * anchoColumna;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(c.etiqueta, x, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...c.color);
      pdf.text(c.valor, x, y + 6.5);
    });
    y += ALTO_FILA_METRICAS;
  }

  function dibujarTablaGenerica(titulo: string, filas: { etiqueta: string; anio2025: number; anio2026: number; dif: number }[], x0: number, ancho: number) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text(titulo, x0, y);
    let fy = y + 4;
    const colEtiqueta = ancho * 0.42;
    const colValor = ancho * 0.19;
    pdf.setFontSize(6.5);
    pdf.text('', x0, fy);
    pdf.text('2025', x0 + colEtiqueta + colValor - 2, fy, { align: 'right' });
    pdf.text('2026', x0 + colEtiqueta + colValor * 2 - 2, fy, { align: 'right' });
    pdf.text('Dif', x0 + colEtiqueta + colValor * 3 - 2, fy, { align: 'right' });
    fy += 3.2;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(x0, fy, x0 + ancho - 3, fy);
    fy += 3.5;
    for (const f of filas) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(f.etiqueta, x0, fy);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(formatearNumero(f.anio2025), x0 + colEtiqueta + colValor - 2, fy, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(formatearNumero(f.anio2026), x0 + colEtiqueta + colValor * 2 - 2, fy, { align: 'right' });
      pdf.setTextColor(...colorPorDif(f.dif));
      pdf.text(`${f.dif >= 0 ? '+' : ''}${formatearNumero(f.dif)}`, x0 + colEtiqueta + colValor * 3 - 2, fy, { align: 'right' });
      fy += ALTO_FILA_TABLA;
    }
  }

  function dibujarTarjetaNodo(nodo: NodoMicrogerencia, indice: number) {
    nuevaPaginaSiNoCabe(ALTO_TARJETA_COMPLETA);

    // Fondo de la tarjeta completa, para separarla visualmente de la siguiente.
    const altoTarjeta = ALTO_TITULO_TARJETA + ALTO_FILA_METRICAS + ALTO_TRIMESTRES + ALTO_MESES;
    const colorFondo: [number, number, number] = indice % 2 === 0 ? [255, 255, 255] : COLOR_GRIS_CLARO;
    pdf.setFillColor(...colorFondo);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(MARGEN - 2, y - 4, ANCHO_UTIL + 4, altoTarjeta + 2, 2, 2, 'FD');

    pdf.setFillColor(...COLOR_GREEN);
    pdf.rect(MARGEN - 2, y - 4, 3, altoTarjeta + 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11.5);
    pdf.setTextColor(...COLOR_NAVY);
    pdf.text(nodo.nombre, MARGEN + 4, y + 2);
    y += ALTO_TITULO_TARJETA;

    dibujarMetricas(nodo);

    dibujarTablaGenerica('TRIMESTRES', nodo.trimestres, MARGEN, ANCHO_UTIL / 2 - 4);
    y += ALTO_TRIMESTRES;

    const mesesIzq = nodo.meses.slice(0, 6);
    const mesesDer = nodo.meses.slice(6, 12);
    const yInicioMeses = y;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('DISTRIBUCIÓN POR MES', MARGEN, y);
    y += 4;
    const yTrasTitulo = y;
    dibujarTablaGenerica('', mesesIzq, MARGEN, ANCHO_UTIL / 2 - 4);
    y = yTrasTitulo;
    dibujarTablaGenerica('', mesesDer, MARGEN + ANCHO_UTIL / 2 + 4, ANCHO_UTIL / 2 - 4);
    y = yInicioMeses + ALTO_MESES - 4 + ESPACIO_ENTRE_TARJETAS;
  }

  dibujarEncabezadoPagina();
  nodos.forEach((nodo, i) => dibujarTarjetaNodo(nodo, i));

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
