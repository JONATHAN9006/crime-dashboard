// Genera el PDF de "Microgerencia y Proyección Delictiva MEPOY" — un PDF
// por TARJETAS (una por cada nodo seleccionado). Cada tarjeta trae: título,
// fila de métricas generales, y TRES bloques lado a lado (Trimestres |
// Delitos | Distribución por mes) — cada uno con su propio color, tal como
// se pidió — con letra más grande para que se lea bien impreso.
import { jsPDF } from 'jspdf';
import type { NodoMicrogerencia } from './microgerencia';

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
  // El encabezado y el pie de página son las imágenes REALES que
  // proporcionó el usuario. A su tamaño original (646×122 y 652×71)
  // ocupaban 56mm + 32mm = 88mm de una hoja de apenas 210mm de alto —
  // casi la mitad de la página — dejando muy poco para los datos.
  // Intentar "encogerlas" estirando menos la misma imagen (como se hizo
  // antes) las deforma (se ve el escudo ovalado, feo). La solución
  // correcta era otra: las dos imágenes tienen una franja de fondo
  // decorativo (el degradado verde) por ARRIBA y por ABAJO del
  // contenido real (escudo/texto/iconos) que no aporta nada — esa franja
  // se recortó de una vez en el archivo (ver public/assets/), así que
  // ahora la imagen en sí ya es más "panorámica" (más ancha en
  // proporción a su alto) y se puede seguir estirando a todo el ancho de
  // la página SIN deformar nada, y aun así queda más pequeña: encabezado
  // ~41mm (antes 56mm) y pie ~22mm (antes 32mm).
  const [encabezadoBase64, pieBase64] = await Promise.all([
    cargarImagenBase64('/assets/microgerencia-header.png'),
    cargarImagenBase64('/assets/microgerencia-footer.png'),
  ]);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 0;

  // Proporción REAL de cada imagen ya recortada (ver comentario arriba) —
  // se sigue calculando a partir del tamaño real del archivo (no un
  // número fijo "a ojo") para que, si el encabezado/pie se vuelve a
  // actualizar más adelante, esto se ajuste solo sin tocar código.
  const ALTO_HEADER = MM_ANCHO * (270 / 1938);
  const ALTO_FOOTER = MM_ANCHO * (144 / 1956);

  // Bajado un poco (era 0, pegado al borde absoluto) — a pedido explícito,
  // se veía "remontado"/cortado visualmente contra el filo de la hoja.
  const MARGEN_SUPERIOR_HEADER = 4;
  function dibujarEncabezadoPagina() {
    if (encabezadoBase64) {
      try { pdf.addImage(encabezadoBase64, 'PNG', 0, MARGEN_SUPERIOR_HEADER, MM_ANCHO, ALTO_HEADER); } catch { /* sin encabezado si falla */ }
    }
    y = MARGEN_SUPERIOR_HEADER + ALTO_HEADER + 5;
  }

  // Y donde terminó el contenido real de cada página — así el pie se
  // dibuja justo debajo (ver dibujarTarjetaNodo, que la va llenando), en
  // vez de siempre pegado al fondo físico de la hoja.
  const yFinalContenidoPorPagina = new Map<number, number>();

  function dibujarPiePagina(yContenido: number | undefined) {
    // Si por lo que sea no se registró un final de contenido para esta
    // página (no debería pasar), se cae al comportamiento de siempre
    // (pegado al fondo) — más seguro que no dibujar nada.
    const yFooter = yContenido != null ? Math.min(yContenido, MM_ALTO - ALTO_FOOTER) : MM_ALTO - ALTO_FOOTER;
    if (pieBase64) {
      try { pdf.addImage(pieBase64, 'PNG', 0, yFooter, MM_ANCHO, ALTO_FOOTER); } catch { /* sin pie si falla */ }
    }
  }

  const Y_TOPE_PAGINA_FRESCA = MARGEN_SUPERIOR_HEADER + ALTO_HEADER + 5; // el mismo valor que deja dibujarEncabezadoPagina() justo después de dibujar el encabezado
  // Alto máximo que puede ocupar una tarjeta en CUALQUIER página (recién
  // empezada o no) sin invadir el pie de página. Si una tarjeta no cabe
  // aquí a tamaño normal, se achica proporcionalmente (ver
  // calcularEscalaTarjeta) en vez de cortarse. Se deja un colchón chico
  // (6mm, no los 14mm del margen general de la página) entre el final de
  // la tarjeta y el pie — suficiente para que no se toquen, sin regalar
  // espacio de más que le haría falta a la letra.
  // Ya no reserva un espacio en blanco fijo — el pie ahora se dibuja
  // dinámicamente justo debajo del contenido real (ver
  // yFinalContenidoPorPagina). Este valor solo pone un TECHO de seguridad
  // a qué tan grande puede crecer una tarjeta antes de necesitar achicarse
  // o saltar de página — chico a propósito, para que el contenido
  // aproveche mejor el alto disponible en vez de dejarle un hueco grande
  // "por si acaso" al pie.
  const COLCHON_ANTES_DEL_PIE = 8;
  const ALTO_MAXIMO_TARJETA = MM_ALTO - COLCHON_ANTES_DEL_PIE - ALTO_FOOTER - Y_TOPE_PAGINA_FRESCA;

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
    if (y + altoNecesario > MM_ALTO - COLCHON_ANTES_DEL_PIE - ALTO_FOOTER) {
      pdf.addPage();
      dibujarEncabezadoPagina();
    }
  }

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
      { etiqueta: 'PROYECTADO 2026', valor: formatearNumero(nodo.terminaAnio), color: COLOR_TEXTO },
      { etiqueta: 'PROY. VS 2025', valor: `${difProyeccion >= 0 ? '+' : ''}${formatearNumero(difProyeccion)} (${pctProyeccion === null ? 'N/A' : `${pctProyeccion >= 0 ? '+' : ''}${pctProyeccion.toFixed(1)}%`})`, color: colorPorDif(difProyeccion) },
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
      pdf.text('Mapa no disponible para este elemento', x0 + ancho / 2, y + alto / 2, { align: 'center', maxWidth: ancho - 8 });
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
      pdf.addImage(imagenDataUrl, 'PNG', x0 + 6, y + 6, ancho - 12, alto - 12);
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
    pdf.roundedRect(MARGEN - 5, y - 3, ANCHO_UTIL + 10, altoTarjeta - dim.paddingTarjeta + 3, 2.5, 2.5, 'FD');

    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.roundedRect(MARGEN - 5, y - 3, ANCHO_UTIL + 10, dim.altoTituloTarjeta, 2.5, 2.5, 'F');
    pdf.setFillColor(...COLOR_GREEN_CLARO);
    pdf.rect(MARGEN - 5, y + dim.altoTituloTarjeta - 6, ANCHO_UTIL + 10, 3, 'F');

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
    // completa de delitos como respaldo. El mapa se redujo un poco (era
    // 0.42) y Trimestres/Delitos ganaron ese espacio (era 0.25) — a
    // pedido explícito: en vertical se veían muy pegados/angostos.
    // Trimestres/Delitos ganaron ancho (era 0.28) a costa de Distribución
    // por mes — a pedido explícito: Delitos tiene 6 columnas de datos
    // (nombre + 5 números) contra las 4 de Trimestres, así que necesita
    // más espacio; con el ancho anterior los números quedaban tan
    // apretados que se encimaban entre sí.
    const anchoTrimestres = ANCHO_UTIL * 0.36;
    const anchoTercera = ANCHO_UTIL * 0.38;
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

    y += altoBanda;
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
    const dim = crearDimensiones(calcularEscalaTarjeta(nodo));
    const anchoTercera = ANCHO_UTIL * 0.38;
    const altoBanda = altoBandaTresColumnas(nodo, dim);
    imagenesAjustadas.set(nodo.nombre, await recortarImagenParaCobertura(original, anchoTercera - 12, altoBanda - 12));
  }
  for (const nodo of nodos) dibujarTarjetaNodo(nodo, imagenesAjustadas.get(nodo.nombre));

  // El pie de página (banda institucional + fecha de generación) se
  // dibuja al final, sobre TODAS las páginas ya generadas — más simple
  // que ir intercalándolo mientras se agrega contenido dinámico.
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    dibujarPiePagina(yFinalContenidoPorPagina.get(p));
    // Franjita oscura propia (no parte de la imagen) detrás de la fecha
    // de generación — así el texto blanco SIEMPRE tiene contraste
    // garantizado, sin depender de qué color quedó justo ahí en la
    // imagen del pie (que puede variar si el pie se recorta o se
    // reemplaza más adelante).
    pdf.setFillColor(6, 30, 24);
    pdf.rect(0, MM_ALTO - 4, MM_ANCHO, 4, 'F');
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
