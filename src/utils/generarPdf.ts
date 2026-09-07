import { jsPDF } from 'jspdf';
import { capturarComponenteComoCanvas } from './exportarImagen';
import type { ComponenteRegistradoPdf } from '../context/RegistroPdfContext';

const MM_POR_PAGINA_ANCHO = 210; // A4 vertical
const MM_POR_PAGINA_ALTO = 297;
const MARGEN = 14; // mm en cada lado
const ANCHO_UTIL = MM_POR_PAGINA_ANCHO - MARGEN * 2;
const ALTO_UTIL = MM_POR_PAGINA_ALTO - MARGEN * 2;
const ESPACIO_ENTRE_COMPONENTES = 8; // mm

export interface OpcionesGenerarPdf {
  /**
   * Texto de encabezado configurable — por ahora vacío (nadie lo ha
   * definido todavía). Si en el futuro se define un texto fijo, basta con
   * pasarlo aquí; el resto de la lógica de paginación ya lo tiene en cuenta.
   */
  encabezado?: string;
  subtitulo?: string;
  nombreArchivo: string;
}

/**
 * Genera un PDF de varias páginas a partir de los componentes
 * seleccionados, reutilizando exactamente el mismo motor de captura que ya
 * usa la descarga en PNG (mismo fondo transparente compuesto sobre blanco
 * para el PDF, mismo manejo de texto truncado, misma detección de alto/ancho
 * real) — así ambas rutas de descarga se ven y se comportan igual.
 *
 * Cada componente se coloca COMPLETO en una sola página: si no cabe en el
 * espacio restante de la página actual, se mueve entero a la siguiente —
 * nunca se corta un componente a la mitad entre dos páginas.
 */
export async function generarPdfComponentes(
  componentes: ComponenteRegistradoPdf[],
  opciones: OpcionesGenerarPdf,
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let primeraPagina = true;
  let yActual = MARGEN;

  function nuevaPagina() {
    pdf.addPage();
    yActual = MARGEN;
  }

  if (opciones.encabezado) {
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(15, 46, 43); // verde institucional oscuro
    pdf.text(opciones.encabezado, MARGEN, yActual + 6);
    yActual += 10;
    if (opciones.subtitulo) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(opciones.subtitulo, MARGEN, yActual + 4);
      yActual += 8;
    }
    pdf.setDrawColor(226, 232, 240);
    pdf.line(MARGEN, yActual, MM_POR_PAGINA_ANCHO - MARGEN, yActual);
    yActual += 6;
  }

  for (const componente of componentes) {
    if (!componente.ref.current) continue;
    // capturarComponenteComoCanvas ahora devuelve el canvas con fondo
    // transparente real (RGBA) — correcto para la descarga en PNG, pero el
    // PDF no soporta transparencia de forma consistente entre lectores, así
    // que aquí (solo para el PDF) se compone sobre blanco antes de
    // insertarlo.
    const canvasTransparente = await capturarComponenteComoCanvas(componente.ref.current, componente.titulo);
    const canvas = document.createElement('canvas');
    canvas.width = canvasTransparente.width;
    canvas.height = canvasTransparente.height;
    const ctxBlanco = canvas.getContext('2d')!;
    ctxBlanco.fillStyle = '#ffffff';
    ctxBlanco.fillRect(0, 0, canvas.width, canvas.height);
    ctxBlanco.drawImage(canvasTransparente, 0, 0);

    // Tamaño NATURAL de impresión (no estirado a todo el ancho de la
    // página): el canvas se capturó a escala 2 (el doble de resolución,
    // para que se vea nítido), así que su tamaño real en pantalla era la
    // mitad de sus píxeles — se convierte esa medida a milímetros (96dpi).
    // Antes se forzaba cada componente al ancho completo de la página, lo
    // que agrandaba artificialmente hasta las tarjetas más pequeñas y las
    // hacía ocupar una página entera cada una en vez de compartir espacio.
    const PX_A_MM = 25.4 / 96;
    let anchoMm = (canvas.width / 2) * PX_A_MM;
    let altoMm = (canvas.height / 2) * PX_A_MM;
    // Si aun así el componente es más ancho que la página, sí se reduce
    // para que quepa (nunca se agranda más allá de su tamaño natural, solo
    // se achica cuando hace falta).
    if (anchoMm > ANCHO_UTIL) {
      const factorReduccion = ANCHO_UTIL / anchoMm;
      anchoMm *= factorReduccion;
      altoMm *= factorReduccion;
    }

    // Si el componente no cabe completo en lo que queda de la página
    // actual, se mueve entero a una página nueva — nunca se corta a la
    // mitad. Excepción: si ni siquiera cabe en una página completa nueva
    // (componente excepcionalmente alto), se reduce su escala para que
    // quepa en una sola página en vez de recortarlo.
    let altoFinal = altoMm;
    let anchoFinal = anchoMm;
    if (altoFinal > ALTO_UTIL) {
      const factor = ALTO_UTIL / altoFinal;
      altoFinal *= factor;
      anchoFinal *= factor;
    }
    if (!primeraPagina || yActual > MARGEN) {
      const espacioRestante = MM_POR_PAGINA_ALTO - MARGEN - yActual;
      if (altoFinal > espacioRestante && yActual > MARGEN) {
        nuevaPagina();
      }
    }
    primeraPagina = false;

    const x = MARGEN + (ANCHO_UTIL - anchoFinal) / 2; // centrado horizontalmente
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, yActual, anchoFinal, altoFinal, undefined, 'FAST');
    yActual += altoFinal + ESPACIO_ENTRE_COMPONENTES;
  }

  pdf.save(`${opciones.nombreArchivo}.pdf`);
}
