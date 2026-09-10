// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" — un PDF
// por TARJETAS (una por cada nodo seleccionado), con el mismo esquema de
// colores por sección que ya se ve en el modal (título en verde claro,
// trimestres en azul claro, distribución por mes en ámbar claro), para que
// no haya sorpresas entre lo que se ve en pantalla y lo que sale impreso.
import { jsPDF } from 'jspdf';
import type { NodoMicrogerencia } from './microgerencia';

const MM_ANCHO = 297; // A4 horizontal
const MM_ALTO = 210;
const MARGEN = 16; // más amplio que antes — se veía muy junto
const ANCHO_UTIL = MM_ANCHO - MARGEN * 2;

const COLOR_GREEN: [number, number, number] = [17, 103, 98];
const COLOR_GREEN_CLARO: [number, number, number] = [209, 240, 231];
const COLOR_AZUL_CLARO: [number, number, number] = [219, 234, 254];
const COLOR_AMBAR_CLARO: [number, number, number] = [254, 243, 199];
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

// Carga el escudo (ya usado en el Sidebar, mismo archivo) y lo convierte a
// base64 — jsPDF necesita los datos de la imagen, no solo su URL.
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
    return null; // si no se puede cargar, el PDF se genera igual, sin el escudo
  }
}

// Tamaños generosos (más grandes que la versión anterior, que se veía
// pequeña) — alto de cada bloque recalculado para que nada quede apretado.
const ALTO_TITULO_TARJETA = 12;
const ALTO_FILA_METRICAS = 20;
const ALTO_FILA_TABLA = 6;
const ALTO_ENCABEZADO_TABLA = 9;
const ALTO_TRIMESTRES = ALTO_ENCABEZADO_TABLA + ALTO_FILA_TABLA * 4 + 6;
const ALTO_MESES = ALTO_ENCABEZADO_TABLA + ALTO_FILA_TABLA * 12 + 6; // los 12 meses en UNA sola lista, no partida en columnas
const ESPACIO_ENTRE_TARJETAS = 10;
const PADDING_TARJETA = 4;

export async function generarPdfMicrogerencia(nodos: NodoMicrogerencia[], tituloVista: string): Promise<void> {
  const escudoBase64 = await cargarEscudoBase64();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 0;

  function dibujarEncabezadoPagina() {
    pdf.setFillColor(...COLOR_GREEN);
    pdf.rect(0, 0, MM_ANCHO, 26, 'F');
    if (escudoBase64) {
      try { pdf.addImage(escudoBase64, 'PNG', MARGEN, 4, 18, 18); } catch { /* si falla, se sigue sin escudo */ }
    }
    const xTexto = escudoBase64 ? MARGEN + 22 : MARGEN;
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('Microgerencia y Proyección Delictiva MEPOY', xTexto, 10);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Centro de Información Estratégica Policial del Servicio (CIEPS)', xTexto, 16.5);
    pdf.setFontSize(9);
    pdf.text(tituloVista, xTexto, 22.5);
    y = 34;
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
      {
        etiqueta: 'PROY. VS 2025',
        valor: `${difProyeccion >= 0 ? '+' : ''}${formatearNumero(difProyeccion)} (${pctProyeccion === null ? 'N/A' : `${pctProyeccion >= 0 ? '+' : ''}${pctProyeccion.toFixed(1)}%`})`,
        color: colorPorDif(difProyeccion),
      },
    ];
    const anchoColumna = ANCHO_UTIL / columnas.length;
    columnas.forEach((c, i) => {
      const x = MARGEN + i * anchoColumna + PADDING_TARJETA;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...COLOR_MUTED);
      pdf.text(c.etiqueta, x, y);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...c.color);
      pdf.text(c.valor, x, y + 8);
    });
    y += ALTO_FILA_METRICAS;
  }

  // Una sola tabla, ancho completo — "trimestres" (4 filas) o "meses" (12
  // filas EN UNA SOLA LISTA, no partida en columnas, tal como se pidió).
  function dibujarTablaSeccion(titulo: string, filas: { etiqueta: string; anio2025: number; anio2026: number; dif: number }[], colorFondo: [number, number, number], colorTitulo: [number, number, number], altoBloque: number) {
    pdf.setFillColor(...colorFondo);
    pdf.roundedRect(MARGEN, y, ANCHO_UTIL, altoBloque, 2, 2, 'F');

    let fy = y + 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...colorTitulo);
    pdf.text(titulo, MARGEN + PADDING_TARJETA, fy);
    fy += 6;

    const colEtiqueta = MARGEN + PADDING_TARJETA;
    const colValor2025 = MARGEN + ANCHO_UTIL * 0.55;
    const colValor2026 = MARGEN + ANCHO_UTIL * 0.72;
    const colDif = MARGEN + ANCHO_UTIL * 0.89;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text('2025', colValor2025, fy, { align: 'right' });
    pdf.text('2026', colValor2026, fy, { align: 'right' });
    pdf.text('Dif', colDif, fy, { align: 'right' });
    fy += 5;

    for (const f of filas) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...COLOR_TEXTO);
      pdf.text(f.etiqueta, colEtiqueta, fy);
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

  function dibujarTarjetaNodo(nodo: NodoMicrogerencia, indice: number) {
    const altoTarjeta = ALTO_TITULO_TARJETA + ALTO_FILA_METRICAS + ALTO_TRIMESTRES + ALTO_MESES + PADDING_TARJETA * 2;
    // OJO: el chequeo usa SOLO el alto de la tarjeta (sin el espacio que va
    // DESPUÉS de ella) — incluir ese espacio aquí hacía que la primera
    // tarjeta pareciera "no caber" por unos pocos milímetros de más,
    // saltando a una página 2 y dejando la página 1 en blanco (con solo el
    // encabezado) — el bug exacto reportado.
    nuevaPaginaSiNoCabe(altoTarjeta + 4);

    pdf.setFillColor(...COLOR_TARJETA_FONDO);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, altoTarjeta + 3, 2.5, 2.5, 'FD');

    // Franja de título en verde claro — diferenciada del resto de la tarjeta.
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.roundedRect(MARGEN - 3, y - 3, ANCHO_UTIL + 6, ALTO_TITULO_TARJETA + PADDING_TARJETA, 2.5, 2.5, 'F');
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.rect(MARGEN - 3, y + ALTO_TITULO_TARJETA - 3, ANCHO_UTIL + 6, PADDING_TARJETA, 'F'); // tapa las esquinas redondeadas de abajo de esa franja

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...COLOR_GREEN);
    pdf.text(nodo.nombre, MARGEN + PADDING_TARJETA, y + 5);
    y += ALTO_TITULO_TARJETA + PADDING_TARJETA;

    dibujarMetricas(nodo);
    y += PADDING_TARJETA / 2;

    dibujarTablaSeccion('TRIMESTRES', nodo.trimestres, COLOR_AZUL_CLARO, [30, 64, 175], ALTO_TRIMESTRES);
    y += ALTO_TRIMESTRES + PADDING_TARJETA;

    dibujarTablaSeccion('DISTRIBUCIÓN POR MES', nodo.meses, COLOR_AMBAR_CLARO, [146, 64, 14], ALTO_MESES);
    y += ALTO_MESES + ESPACIO_ENTRE_TARJETAS;
  }

  dibujarEncabezadoPagina();
  nodos.forEach((nodo, i) => dibujarTarjetaNodo(nodo, i));

  const totalPaginas = (pdf as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...COLOR_MUTED);
    pdf.text(`Generado el ${new Date().toLocaleString('es-CO')}  ·  Página ${p} de ${totalPaginas}`, MARGEN, MM_ALTO - 6);
  }

  pdf.save('microgerencia-mepoy.pdf');
}
