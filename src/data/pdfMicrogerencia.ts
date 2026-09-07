// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" —
// construido con las primitivas de jsPDF (texto/rectángulos), igual que ya
// hace utils/generarPdf.ts en el resto del dashboard, para mantener texto
// nítido (vectorial) en vez de una captura de pantalla del modal.
import { jsPDF } from 'jspdf';
import type { DatosMicrogerencia, NodoMicrogerencia } from './microgerencia';

const MM_ANCHO = 297; // A4 horizontal — la tabla tiene muchas columnas
const MM_ALTO = 210;
const MARGEN = 12;
const ALTO_FILA = 6.2;
const COLOR_NAVY: [number, number, number] = [16, 35, 63];
const COLOR_GREEN: [number, number, number] = [17, 103, 98];
const COLOR_GRIS_CLARO: [number, number, number] = [244, 246, 248];

// Ancho de cada columna (mm) — nombre se lleva el resto del espacio disponible.
const ANCHOS = { total2025: 22, fecha2025: 20, fecha2026: 20, dif: 18, pct: 18, aporte: 20, proyeccion: 26 };
const ANCHO_NOMBRE = MM_ANCHO - MARGEN * 2 - Object.values(ANCHOS).reduce((a, b) => a + b, 0);

function formatearNumero(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n));
}
function formatearPct(n: number | null): string {
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export function generarPdfMicrogerencia(datos: DatosMicrogerencia): void {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = MARGEN;

  function nuevaPagina() {
    pdf.addPage();
    y = MARGEN;
    dibujarEncabezadoColumnas();
  }

  function dibujarTituloPrincipal() {
    pdf.setFillColor(...COLOR_NAVY);
    pdf.rect(0, 0, MM_ANCHO, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('Microgerencia y Proyección Delictiva MEPOY', MARGEN, 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(`Periodo: ${datos.periodo}  ·  Días hasta la fecha: ${datos.diasHastaLaFecha}`, MARGEN, 17);
    y = 28;
  }

  function dibujarEncabezadoColumnas() {
    pdf.setFillColor(...COLOR_GREEN);
    pdf.rect(MARGEN, y, MM_ANCHO - MARGEN * 2, ALTO_FILA + 1, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    let x = MARGEN + 2;
    pdf.text('DEPENDENCIA / ZONA', x, y + 4.5);
    x = MARGEN + ANCHO_NOMBRE;
    const columnas: [string, number][] = [
      ['Total 2025', ANCHOS.total2025], ['2025 (a la fecha)', ANCHOS.fecha2025], ['2026 (a la fecha)', ANCHOS.fecha2026],
      ['DIF', ANCHOS.dif], ['%', ANCHOS.pct], ['Aporte %', ANCHOS.aporte], ['Proy. cierre 2026', ANCHOS.proyeccion],
    ];
    for (const [etiqueta, ancho] of columnas) {
      pdf.text(etiqueta, x + ancho - 2, y + 4.5, { align: 'right' });
      x += ancho;
    }
    y += ALTO_FILA + 1;
  }

  function dibujarFila(nodo: NodoMicrogerencia, profundidad: number, indiceFila: number) {
    if (y > MM_ALTO - MARGEN - ALTO_FILA) nuevaPagina();

    const esNivelSuperior = profundidad <= 2; // General / Distrito / Estación resaltados
    if (esNivelSuperior) {
      pdf.setFillColor(210, 227, 224);
      pdf.rect(MARGEN, y, MM_ANCHO - MARGEN * 2, ALTO_FILA, 'F');
    } else if (indiceFila % 2 === 0) {
      pdf.setFillColor(...COLOR_GRIS_CLARO);
      pdf.rect(MARGEN, y, MM_ANCHO - MARGEN * 2, ALTO_FILA, 'F');
    }

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', esNivelSuperior ? 'bold' : 'normal');
    pdf.setFontSize(esNivelSuperior ? 8.5 : 7.8);
    const sangria = profundidad * 5;
    pdf.text(nodo.nombre, MARGEN + 2 + sangria, y + 4.3, { maxWidth: ANCHO_NOMBRE - sangria - 3 });

    let x = MARGEN + ANCHO_NOMBRE;
    const valores: [string, number][] = [
      [formatearNumero(nodo.total2025), ANCHOS.total2025],
      [formatearNumero(nodo.fecha2025), ANCHOS.fecha2025],
      [formatearNumero(nodo.fecha2026), ANCHOS.fecha2026],
      [`${nodo.dif >= 0 ? '+' : ''}${formatearNumero(nodo.dif)}`, ANCHOS.dif],
      [formatearPct(nodo.pct), ANCHOS.pct],
      [`${nodo.aportePct.toFixed(1)}%`, ANCHOS.aporte],
      [formatearNumero(nodo.terminaAnio), ANCHOS.proyeccion],
    ];
    pdf.setFont('helvetica', esNivelSuperior ? 'bold' : 'normal');
    if (nodo.dif > 0) pdf.setTextColor(190, 30, 45); else if (nodo.dif < 0) pdf.setTextColor(15, 118, 90); else pdf.setTextColor(30, 41, 59);
    for (const [texto, ancho] of valores) {
      pdf.text(texto, x + ancho - 2, y + 4.3, { align: 'right' });
      x += ancho;
    }
    pdf.setTextColor(30, 41, 59);
    y += ALTO_FILA;
  }

  function recorrer(nodo: NodoMicrogerencia, profundidad: number, indiceFila: { n: number }) {
    dibujarFila(nodo, profundidad, indiceFila.n++);
    for (const hijo of nodo.hijos) recorrer(hijo, profundidad + 1, indiceFila);
  }

  dibujarTituloPrincipal();
  dibujarEncabezadoColumnas();
  recorrer(datos.general, 0, { n: 0 });

  // Pie de página con fecha de generación, en todas las páginas.
  const totalPaginas = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Generado el ${new Date().toLocaleString('es-CO')}  ·  Página ${p} de ${totalPaginas}`, MARGEN, MM_ALTO - 5);
  }

  pdf.save('microgerencia-proyeccion-delictiva-mepoy.pdf');
}
