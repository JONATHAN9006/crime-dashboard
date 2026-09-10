// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" — un PDF
// por TARJETAS (una por cada nodo seleccionado). Cada tarjeta trae: título,
// fila de métricas generales, Trimestres y Distribución por mes LADO A
// LADO, y debajo el desglose por Delito de ESE nodo específico — con un
// color distinto por sección para diferenciarlas de un vistazo.
import { jsPDF } from 'jspdf';
import type { NodoMicrogerencia } from './microgerencia';

const MM_ANCHO = 297; // A4 horizontal
const MM_ALTO = 210;
const MARGEN = 14;
const ANCHO_UTIL = MM_ANCHO - MARGEN * 2;

const COLOR_GREEN: [number, number, number] = [17, 103, 98];
const COLOR_GREEN_CLARO: [number, number, number] = [209, 240, 231];
const COLOR_AZUL_CLARO: [number, number, number] = [219, 234, 254];
const COLOR_AMBAR_CLARO: [number, number, number] = [254, 243, 199];
const COLOR_VIOLETA_CLARO: [number, number, number] = [237, 233, 254];
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

const ALTO_TITULO_TARJETA = 12;
const ALTO_FILA_METRICAS = 20;
const ALTO_FILA_TABLA = 5.2;
const ALTO_FILA_DELITOS = 4.4; // filas más ajustadas (letra ya más pequeña) — da margen extra cuando hay muchos delitos
const ALTO_ENCABEZADO_TABLA = 8;
const ALTO_TRIMESTRES_MESES = ALTO_ENCABEZADO_TABLA + ALTO_FILA_TABLA * 12; // el más alto de los dos (meses, 12 filas) manda el alto de la fila
const PADDING_TARJETA = 4;
const ESPACIO_ENTRE_TARJETAS = 8;

export type VistaMicrogerencia = 'general' | 'distrito1' | 'distrito2' | 'delitos';

const TITULOS_VISTA: Record<VistaMicrogerencia, string> = {
  general: 'MEPOY General — Consolidado',
  distrito1: 'Distrito Uno',
  distrito2: 'Distrito Dos',
  delitos: 'Comparativo por Delito',
};

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

  // Alto EXACTO que va a ocupar una tarjeta — se calcula ANTES de dibujar
  // (incluyendo el desglose de delitos, que varía de tamaño según el nodo)
  // para decidir si hace falta saltar de página SIN dejar nunca una página
  // en blanco ni cortar una tarjeta a la mitad.
  function altoDeTarjeta(nodo: NodoMicrogerencia): number {
    return ALTO_TITULO_TARJETA + ALTO_FILA_METRICAS + ALTO_TRIMESTRES_MESES + (nodo.delitos.length > 0 ? altoTablaDelitos(nodo.delitos.length) + PADDING_TARJETA : 0) + PADDING_TARJETA * 2;
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
    // 8 columnas, ancho parejo — a este tamaño de fuente (7/10.5) caben
    // holgadas dentro del ancho útil sin que ninguna se corte ni se encime.
    const anchoColumna = ANCHO_UTIL / columnas.length;
    columnas.forEach((c, i) => {
      const x = MARGEN + i * anchoColumna + PADDING_TARJETA;
      const anchoDisponible = anchoColumna - PADDING_TARJETA;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.3);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(c.etiqueta, x, y, { maxWidth: anchoDisponible });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(...c.color);
      pdf.text(c.valor, x, y + 7, { maxWidth: anchoDisponible });
    });
    y += ALTO_FILA_METRICAS;
  }

  // Tabla genérica de 4 columnas (etiqueta | 2025 | 2026 | Dif), usada por
  // Trimestres y Meses — reciben su PROPIO ancho para poder ir lado a lado.
  function dibujarTabla4Col(titulo: string, filas: { etiqueta: string; anio2025: number; anio2026: number; dif: number }[], x0: number, ancho: number, colorFondo: [number, number, number], colorTitulo: [number, number, number], altoBloque: number) {
    pdf.setFillColor(...colorFondo);
    pdf.roundedRect(x0, y, ancho, altoBloque, 2, 2, 'F');

    let fy = y + 5.5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...colorTitulo);
    pdf.text(titulo, x0 + PADDING_TARJETA, fy);
    fy += 5.5;

    const colEtiqueta = x0 + PADDING_TARJETA;
    const colValor2025 = x0 + ancho * 0.52;
    const colValor2026 = x0 + ancho * 0.71;
    const colDif = x0 + ancho * 0.94;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('2025', colValor2025, fy, { align: 'right' });
    pdf.text('2026', colValor2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    fy += 4.5;

    for (const f of filas) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(f.etiqueta, colEtiqueta, fy, { maxWidth: ancho * 0.48 });
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(formatearNumero(f.anio2025), colValor2025, fy, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(formatearNumero(f.anio2026), colValor2026, fy, { align: 'right' });
      pdf.setTextColor(...colorPorDif(f.dif));
      pdf.text(`${f.dif >= 0 ? '+' : ''}${formatearNumero(f.dif)}`, colDif, fy, { align: 'right' });
      fy += ALTO_FILA_TABLA;
    }
  }

  // Delitos: en UNA columna si son pocos, en DOS si son muchos — evita que
  // una tarjeta con 15-20 delitos (ej. "MEPOY General") termine siendo más
  // alta que una página entera, lo que dejaría contenido dibujado fuera del
  // margen inferior sin ninguna forma de recuperarlo.
  const UMBRAL_DOS_COLUMNAS_DELITOS = 10;

  function altoTablaDelitos(cantidad: number): number {
    if (cantidad === 0) return 0;
    const filas = cantidad > UMBRAL_DOS_COLUMNAS_DELITOS ? Math.ceil(cantidad / 2) : cantidad;
    return ALTO_ENCABEZADO_TABLA + ALTO_FILA_DELITOS * filas;
  }

  function dibujarTablaDelitos(nodo: NodoMicrogerencia, altoBloque: number) {
    pdf.setFillColor(...COLOR_VIOLETA_CLARO);
    pdf.roundedRect(MARGEN, y, ANCHO_UTIL, altoBloque, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(91, 33, 182);
    pdf.text(`DELITOS (${nodo.delitos.length})`, MARGEN + PADDING_TARJETA, y + 5.5);

    const dosColumnas = nodo.delitos.length > UMBRAL_DOS_COLUMNAS_DELITOS;
    const mitad = Math.ceil(nodo.delitos.length / 2);
    const columnasDelitos = dosColumnas
      ? [{ x0: MARGEN, ancho: ANCHO_UTIL / 2 - PADDING_TARJETA / 2, filas: nodo.delitos.slice(0, mitad) }, { x0: MARGEN + ANCHO_UTIL / 2 + PADDING_TARJETA / 2, ancho: ANCHO_UTIL / 2 - PADDING_TARJETA / 2, filas: nodo.delitos.slice(mitad) }]
      : [{ x0: MARGEN, ancho: ANCHO_UTIL, filas: nodo.delitos }];

    for (const col of columnasDelitos) {
      let fy = y + 11;
      const colDelito = col.x0 + PADDING_TARJETA;
      const col2025 = col.x0 + col.ancho * 0.62;
      const col2026 = col.x0 + col.ancho * 0.74;
      const colDif = col.x0 + col.ancho * 0.87;
      const colPct = col.x0 + col.ancho * 0.98;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text('2025', col2025, fy, { align: 'right' });
      pdf.text('2026', col2026, fy, { align: 'right' });
      pdf.text('Dif', colDif, fy, { align: 'right' });
      pdf.text('%', colPct, fy, { align: 'right' });
      fy += 4;

      for (const d of col.filas) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(...COLOR_TEXTO);
        pdf.text(d.nombre, colDelito, fy, { maxWidth: col.ancho * 0.58 });
        pdf.setTextColor(...COLOR_MUTED);
        pdf.text(formatearNumero(d.fecha2025), col2025, fy, { align: 'right' });
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...COLOR_TEXTO);
        pdf.text(formatearNumero(d.fecha2026), col2026, fy, { align: 'right' });
        pdf.setTextColor(...colorPorDif(d.dif));
        pdf.text(`${d.dif >= 0 ? '+' : ''}${formatearNumero(d.dif)}`, colDif, fy, { align: 'right' });
        pdf.text(formatearPct(d.pct), colPct, fy, { align: 'right' });
        fy += ALTO_FILA_DELITOS;
      }
    }
  }

  function dibujarTarjetaNodo(nodo: NodoMicrogerencia) {
    const altoTarjeta = altoDeTarjeta(nodo);
    nuevaPaginaSiNoCabe(altoTarjeta);

    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, altoTarjeta - PADDING_TARJETA * 2 + 3, 2.5, 2.5, 'FD');

    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, ALTO_TITULO_TARJETA, 2.5, 2.5, 'F');
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.rect(MARGEN - 3, y + ALTO_TITULO_TARJETA - 6, ANCHO_UTIL + 6, 3, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.5);
    pdf.setTextColor(...COLOR_GREEN);
    pdf.text(nodo.nombre, MARGEN + PADDING_TARJETA, y + 5);
    y += ALTO_TITULO_TARJETA;

    dibujarMetricas(nodo);
    y += PADDING_TARJETA / 2;

    const anchoTrimestres = ANCHO_UTIL * 0.32;
    const anchoMeses = ANCHO_UTIL - anchoTrimestres - PADDING_TARJETA;
    dibujarTabla4Col('TRIMESTRES', nodo.trimestres, MARGEN, anchoTrimestres, COLOR_AZUL_CLARO, [30, 64, 175], ALTO_TRIMESTRES_MESES);
    dibujarTabla4Col('DISTRIBUCIÓN POR MES', nodo.meses, MARGEN + anchoTrimestres + PADDING_TARJETA, anchoMeses, COLOR_AMBAR_CLARO, [146, 64, 14], ALTO_TRIMESTRES_MESES);
    y += ALTO_TRIMESTRES_MESES + PADDING_TARJETA;

    if (nodo.delitos.length > 0) {
      const altoDelitos = altoTablaDelitos(nodo.delitos.length);
      dibujarTablaDelitos(nodo, altoDelitos);
      y += altoDelitos;
    }

    y += ESPACIO_ENTRE_TARJETAS;
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
