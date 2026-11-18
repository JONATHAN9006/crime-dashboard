// Informe territorial de Microgerencia: una lámina ejecutiva (el mismo
// diseño de la pantalla) por cada unidad elegida en el asistente, más un
// índice inicial y los anexos de siempre (Operatividad, RNMC, tablas).
//
// Las láminas se dibujan fuera de pantalla con el MISMO componente que se
// ve en «Lámina ejecutiva» (LaminaMicrogerencia) y se capturan igual que la
// exportación de imagen — no hay un segundo generador de gráficos.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { jsPDF } from 'jspdf';
import type { DatosMicrogerencia, NodoMicrogerencia } from '../../data/microgerencia';
import { generarPdfMicrogerencia, type OpcionesPdfMicrogerencia, type SeccionExtraMicrogerencia } from '../../data/pdfMicrogerencia';
import { LaminaOperatividad } from './LaminaOperatividad';
import { ALTO, ANCHO, LaminaMicrogerencia, capturarLamina, etiquetaUnidad, type FuenteLamina } from './InformeEjecutivoMicrogerencia';

export type GrupoSeccion = 'Microgerencia general' | 'Distritos' | 'Estaciones' | 'Zonas de atención' | 'CAI' | 'Barrios' | 'Operatividad';

export interface SeccionTerritorial {
  grupo: GrupoSeccion;
  /** Datos de la fuente de esta sección (Delictividad u Operatividad). */
  datos: DatosMicrogerencia;
  fuente: FuenteLamina;
  nodo: NodoMicrogerencia;
  esGeneral: boolean;
  /** Nombre de la unidad (zonas, CAI y barrios con su estación). */
  unidad: string;
  /** Sin registros en ninguno de los dos periodos: no se dibuja. */
  sinInformacion: boolean;
}

function grupoDe(nodo: NodoMicrogerencia, datos: DatosMicrogerencia): GrupoSeccion {
  if (nodo === datos.general || nodo.tipo === 'general') return 'Microgerencia general';
  if (nodo.tipo === 'distrito' || nodo === datos.distrito1 || nodo === datos.distrito2) return 'Distritos';
  if (nodo.tipo === 'zona') return 'Zonas de atención';
  if (nodo.tipo === 'cai') return 'CAI';
  if (nodo.tipo === 'barrio') return 'Barrios';
  return 'Estaciones';
}

/** Secciones del informe (una por unidad, sin repetir), en el orden recibido. */
export function seccionesDelInforme(datos: DatosMicrogerencia, nodos: NodoMicrogerencia[], fuente: FuenteLamina = 'delictividad'): SeccionTerritorial[] {
  const vistos = new Set<NodoMicrogerencia>();
  const salida: SeccionTerritorial[] = [];
  for (const nodo of nodos) {
    if (vistos.has(nodo)) continue;
    vistos.add(nodo);
    const esGeneral = nodo === datos.general;
    salida.push({
      grupo: fuente === 'operatividad' ? 'Operatividad' : grupoDe(nodo, datos), datos, fuente, nodo, esGeneral,
      unidad: etiquetaUnidad(nodo, esGeneral),
      sinInformacion: nodo.fecha2026 === 0 && nodo.fecha2025 === 0 && nodo.total2025 === 0,
    });
  }
  // Mismo orden en que se eligieron las hojas (General → Distrito →
  // Estación → sus CAI → sus zonas).
  return salida;
}

/**
 * Dibuja y captura la lámina de cada sección (fuera de pantalla). Devuelve
 * JPEG en el mismo orden; null si una sección no tiene información.
 */
export async function capturarLaminas(
  secciones: SeccionTerritorial[], topBarrios: 3 | 5, barrios: readonly string[],
  alAvanzar?: (hecho: number, total: number, unidad: string) => void,
  formato: 'jpeg' | 'png' = 'jpeg',
): Promise<(string | null)[]> {
  const caja = document.createElement('div');
  caja.setAttribute('aria-hidden', 'true');
  Object.assign(caja.style, { position: 'fixed', left: '-40000px', top: '0', width: `${ANCHO}px`, height: `${ALTO}px`, overflow: 'hidden', pointerEvents: 'none' });
  document.body.appendChild(caja);
  const raiz = createRoot(caja);
  // Muchas láminas: un poco menos de resolución para que el PDF no pese demasiado.
  const resolucion = formato === 'png' ? 2 : secciones.length > 12 ? 1.5 : 2;
  const salida: (string | null)[] = [];
  try {
    for (const [i, s] of secciones.entries()) {
      alAvanzar?.(i + 1, secciones.length, s.unidad);
      if (s.sinInformacion) { salida.push(null); continue; }
      let el: HTMLDivElement | null = null;
      flushSync(() => {
        raiz.render(s.fuente === 'operatividad'
          ? <LaminaOperatividad key={`${i}-${s.fuente}-${s.unidad}`} ref={(n) => { el = n; }} datos={s.datos} nodo={s.nodo} esGeneral={s.esGeneral} />
          : <LaminaMicrogerencia key={`${i}-${s.fuente}-${s.unidad}`} ref={(n) => { el = n; }} datos={s.datos} fuente={s.fuente} nodo={s.nodo} esGeneral={s.esGeneral} topBarrios={topBarrios} barriosFiltro={barrios} />);
      });
      // Las gráficas miden su caja en el siguiente cuadro.
      await new Promise((r) => setTimeout(r, 380));
      if (!el) { salida.push(null); continue; }
      const lienzo = await capturarLamina(el, resolucion);
      salida.push(formato === 'png' ? lienzo.toDataURL('image/png') : lienzo.toDataURL('image/jpeg', 0.86));
    }
  } finally {
    raiz.unmount();
    caja.remove();
  }
  return salida;
}

// ── PDF ────────────────────────────────────────────────────────────────
const PAG_W = 297;
const PAG_H = (PAG_W * ALTO) / ANCHO; // misma proporción de la lámina: sin franjas blancas
const VERDE: [number, number, number] = [14, 90, 60];
const VERDE_OSC: [number, number, number] = [11, 61, 44];
const LIMA: [number, number, number] = [140, 198, 63];
const TEXTO: [number, number, number] = [30, 42, 51];
const GRIS: [number, number, number] = [110, 122, 130];

async function imagenBase64(ruta: string): Promise<string | null> {
  try {
    const r = await fetch(ruta);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => ok(null); fr.readAsDataURL(blob); });
  } catch { return null; }
}

interface FilaIndice { tipo: 'grupo' | 'item'; texto: string; unidad?: string; detalle?: string; pagina?: number | null }

export interface ParametrosPdfTerritorial {
  titulo: string;
  ficha: string[];
  secciones: SeccionTerritorial[];
  laminas: (string | null)[];
  /** Anexos con el generador de siempre (tarjetas de Operatividad y secciones extra). */
  anexos?: { nodos: NodoMicrogerencia[]; imagenes: Map<string, string>; extras: SeccionExtraMicrogerencia[]; opciones: Partial<OpcionesPdfMicrogerencia> };
  nombreArchivo: string;
  /** Índice al inicio (por defecto NO: el informe va directo a las láminas). */
  indice?: boolean;
}

/** Arma el PDF: índice → una lámina por unidad → anexos. Devuelve el número de páginas. */
export async function generarPdfTerritorial(p: ParametrosPdfTerritorial): Promise<{ paginas: number; laminas: number; omitidas: string[] }> {
  const escudo = await imagenBase64('/assets/escudo-policia.png');
  const incluidas = p.secciones.map((s, i) => ({ s, img: p.laminas[i] })).filter((x) => x.img);
  const omitidas = p.secciones.filter((_, i) => !p.laminas[i]).map((s) => s.unidad);
  const anexosNodos = p.anexos?.nodos ?? [];
  const anexosExtras = p.anexos?.extras ?? [];

  // Filas del índice (los números de página se completan al paginar).
  const filas: FilaIndice[] = [];
  let grupoActual = '';
  incluidas.forEach(({ s }, i) => {
    if (s.grupo !== grupoActual) { grupoActual = s.grupo; filas.push({ tipo: 'grupo', texto: s.grupo }); }
    const texto = s.fuente === 'operatividad' ? `Consolidado operativo — ${s.unidad}` : s.grupo === 'Microgerencia general' ? 'Lámina ejecutiva consolidada' : `Microgerencia — ${s.unidad}`;
    filas.push({ tipo: 'item', texto, unidad: s.unidad, detalle: s.grupo, pagina: i });
  });
  if (anexosNodos.length || anexosExtras.length) {
    filas.push({ tipo: 'grupo', texto: 'Anexos' });
    anexosNodos.forEach((n, i) => filas.push({ tipo: 'item', texto: 'Operatividad', unidad: n.nombre.replace(/\s*\(Operatividad\)$/, ''), detalle: 'Tarjeta de operatividad', pagina: incluidas.length + i }));
    anexosExtras.forEach((x, i) => filas.push({ tipo: 'item', texto: x.titulo ?? 'Sección adicional', unidad: '—', detalle: 'Anexo', pagina: incluidas.length + anexosNodos.length + i }));
  }
  if (omitidas.length) {
    filas.push({ tipo: 'grupo', texto: 'Unidades sin información suficiente (no se generó lámina)' });
    omitidas.forEach((u) => filas.push({ tipo: 'item', texto: 'Sin registros en el periodo', unidad: u, detalle: '—', pagina: null }));
  }

  // Paginación del índice.
  const ALTO_FILA = 6.2;
  const Y_TABLA_1 = 30 + (p.ficha.length ? 9 + p.ficha.length * 4.3 : 0) + 4;
  const Y_TABLA_N = 30;
  const Y_LIMITE = PAG_H - 16;
  const porPagina: FilaIndice[][] = [[]];
  let yy = Y_TABLA_1 + ALTO_FILA;
  for (const f of filas) {
    // Un título de grupo no queda solo al final de una página.
    const necesita = f.tipo === 'grupo' ? ALTO_FILA * 2 : ALTO_FILA;
    if (yy + necesita > Y_LIMITE) { porPagina.push([]); yy = Y_TABLA_N + ALTO_FILA; }
    porPagina[porPagina.length - 1].push(f);
    yy += ALTO_FILA;
  }
  const paginasIndice = p.indice ? porPagina.length : 0;
  const paginaDe = (k: number) => paginasIndice + 1 + k;

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [PAG_W, PAG_H] });
  const totalSinAnexos = paginasIndice + incluidas.length;

  // Página 1 ya creada por jsPDF: la usa el índice o la primera lámina.
  let paginaLibre = true;
  (p.indice ? porPagina : []).forEach((lista, ip) => {
    paginaLibre = false;
    if (ip > 0) pdf.addPage([PAG_W, PAG_H], 'landscape');
    // Encabezado institucional
    pdf.setFillColor(...VERDE_OSC); pdf.rect(0, 0, PAG_W, 22, 'F');
    pdf.setFillColor(...LIMA); pdf.rect(0, 22, PAG_W, 0.9, 'F');
    if (escudo) { try { pdf.addImage(escudo, 'PNG', 8, 3, 16, 16); } catch { /* sin escudo */ } }
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11.5);
    pdf.text('POLICÍA NACIONAL DE COLOMBIA', 28, 9.5);
    pdf.setFontSize(9); pdf.text('POLICÍA METROPOLITANA DE POPAYÁN – MEPOY', 28, 14.5);
    pdf.setFontSize(15); pdf.text('MICROGERENCIA', 150, 11);
    pdf.setTextColor(...LIMA); pdf.text(`|  ÍNDICE DEL INFORME${ip > 0 ? ' (cont.)' : ''}`, 150 + pdf.getTextWidth('MICROGERENCIA') + 2, 11);
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
    pdf.text(`Cobertura: ${p.titulo}`, 150, 17);

    let y = Y_TABLA_N;
    if (ip === 0 && p.ficha.length) {
      const alto = 6 + p.ficha.length * 4.3;
      pdf.setFillColor(236, 247, 240); pdf.roundedRect(10, 27, PAG_W - 20, alto, 2, 2, 'F');
      pdf.setTextColor(...VERDE); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
      pdf.text('Configuración del informe', 14, 31.5);
      pdf.setTextColor(...TEXTO); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.8);
      p.ficha.forEach((l, i) => pdf.text(l, 14, 35.8 + i * 4.3, { maxWidth: PAG_W - 28 }));
      y = Y_TABLA_1;
    }
    // Encabezado de la tabla
    const cols = { n: 12, seccion: 22, unidad: 132, detalle: 222, pag: PAG_W - 12 };
    pdf.setFillColor(...VERDE); pdf.rect(10, y - 4.3, PAG_W - 20, ALTO_FILA, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.6);
    pdf.text('N.°', cols.n, y); pdf.text('Sección', cols.seccion, y); pdf.text('Unidad territorial', cols.unidad, y); pdf.text('Tipo', cols.detalle, y); pdf.text('Página', cols.pag, y, { align: 'right' });
    y += ALTO_FILA;
    let impar = false;
    for (const f of lista) {
      if (f.tipo === 'grupo') {
        pdf.setTextColor(...VERDE); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
        pdf.text(f.texto.toUpperCase(), cols.n, y);
        pdf.setDrawColor(...LIMA); pdf.setLineWidth(0.4); pdf.line(10, y + 1.4, PAG_W - 10, y + 1.4);
        impar = false;
      } else {
        if (impar) { pdf.setFillColor(243, 247, 245); pdf.rect(10, y - 4.3, PAG_W - 20, ALTO_FILA, 'F'); }
        impar = !impar;
        pdf.setTextColor(...TEXTO); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.6);
        const num = f.pagina != null ? String(f.pagina + 1) : '—';
        pdf.text(num, cols.n, y);
        pdf.text(f.texto, cols.seccion, y, { maxWidth: cols.unidad - cols.seccion - 3 });
        pdf.setFont('helvetica', 'bold'); pdf.text(f.unidad ?? '', cols.unidad, y, { maxWidth: cols.detalle - cols.unidad - 3 });
        pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...GRIS); pdf.text(f.detalle ?? '', cols.detalle, y);
        pdf.setTextColor(...TEXTO); pdf.setFont('helvetica', 'bold');
        pdf.text(f.pagina != null ? String(paginaDe(f.pagina)) : '—', cols.pag, y, { align: 'right' });
      }
      y += ALTO_FILA;
    }
    // Nota metodológica y pie
    pdf.setTextColor(...GRIS); pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.2);
    pdf.text('Cada sección contiene únicamente los registros de su unidad territorial. Las secciones de distritos, estaciones, zonas, CAI y barrios son desgloses de la cobertura: sus cifras no se suman entre sí.', 10, PAG_H - 11, { maxWidth: PAG_W - 20 });
    pdf.setFillColor(...VERDE_OSC); pdf.rect(0, PAG_H - 6, PAG_W, 6, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7);
    pdf.text('Fuente: Aplicativo Los Andes. Información sujeta a variación.', 10, PAG_H - 2.2);
    pdf.text(`Página ${ip + 1}`, PAG_W - 10, PAG_H - 2.2, { align: 'right' });
  });

  // Láminas (página completa, sin márgenes) con su número de página.
  incluidas.forEach(({ s, img }, i) => {
    if (paginaLibre) paginaLibre = false; else pdf.addPage([PAG_W, PAG_H], 'landscape');
    pdf.addImage(img!, 'JPEG', 0, 0, PAG_W, PAG_H, undefined, 'FAST');
    // Rótulo de la sección (identifica la unidad aunque se imprima suelta).
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
    pdf.text(`${s.grupo} · ${s.unidad} · Página ${paginaDe(i)}`, 140, PAG_H - 3.6, { align: 'right', maxWidth: 60 });
  });

  if (p.anexos && (anexosNodos.length || anexosExtras.length)) {
    await generarPdfMicrogerencia(anexosNodos, p.titulo, p.anexos.imagenes, anexosExtras, { ...p.anexos.opciones, ficha: undefined, pdfBase: pdf }, p.nombreArchivo);
  }
  // Solo anexos (sin índice ni láminas): se quita la página inicial vacía.
  if (paginaLibre && pdf.getNumberOfPages() > 1) pdf.deletePage(1);
  const paginas = pdf.getNumberOfPages();
  if (paginas < totalSinAnexos) throw new Error('Paginación inconsistente del informe.');
  pdf.save(p.nombreArchivo);
  return { paginas, laminas: incluidas.length, omitidas };
}
