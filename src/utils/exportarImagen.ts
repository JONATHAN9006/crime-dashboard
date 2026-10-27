import { maxDe } from './mathSeguro';

// Tailwind v4 genera sus colores en formato oklch(), que html2canvas no sabe
// interpretar. Se probaron dos trucos "gratis" del navegador para
// convertirlo a rgb() (leer canvas.fillStyle de vuelta, y getComputedStyle)
// — ninguno de los dos sirve en navegadores recientes, porque ahora
// preservan oklch() tal cual en vez de normalizarlo a rgb como hacían antes.
// Por eso esta conversión se implementa a mano: es la misma fórmula
// matemática estándar (de Björn Ottosson, la que usan los propios
// navegadores) para pasar de OKLCH a sRGB.
function oklchARgb(L: number, C: number, H: number, alpha: number): string {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gamma = (c: number) => {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  r = Math.round(gamma(r) * 255);
  g = Math.round(gamma(g) * 255);
  bl = Math.round(gamma(bl) * 255);
  // SIEMPRE con canal alfa explícito (rgba, nunca rgb) — así un color
  // originalmente transparente (ej. oklch(0% 0 0 / 0), que Tailwind v4 usa
  // para "transparent") se preserva como REALMENTE transparente en vez de
  // volverse negro sólido. Antes esta función descartaba el alfa y devolvía
  // rgb(0,0,0) —negro puro— para cualquier oklch con L=0, sin importar que
  // ese color fuera transparente: esa es la causa exacta del fondo negro
  // reportado en las descargas.
  return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
}

function normalizarUnColor(expresion: string): string {
  const oklch = expresion.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?/i);
  if (oklch) {
    let L = parseFloat(oklch[1]);
    if (expresion.includes('%') || L > 1) L = L / 100;
    let alpha = 1;
    if (oklch[4] !== undefined) {
      alpha = parseFloat(oklch[4]);
      if (oklch[5] === '%') alpha = alpha / 100;
    }
    return oklchARgb(L, parseFloat(oklch[2]), parseFloat(oklch[3]), alpha);
  }
  // oklab(): conversión exacta (es la misma fórmula, con a/b ya dados en
  // vez de croma/tono). Antes se volvía transparente.
  const oklab = expresion.match(/^oklab\(\s*([\d.]+)(%?)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+)(%?))?/i);
  if (oklab) {
    let L = parseFloat(oklab[1]);
    if (oklab[2] === '%' || L > 1) L = L / 100;
    const a = parseFloat(oklab[3]), b = parseFloat(oklab[4]);
    let alpha = 1;
    if (oklab[5] !== undefined) { alpha = parseFloat(oklab[5]); if (oklab[6] === '%') alpha = alpha / 100; }
    const C = Math.sqrt(a * a + b * b);
    const H = (Math.atan2(b, a) * 180) / Math.PI;
    return oklchARgb(L, C, H, alpha);
  }
  // oklab()/lab()/lch()/color-mix()/color(): funciones mucho menos usadas en
  // este proyecto (aparecen sobre todo en efectos secundarios como
  // sombras/anillos con transparencia) — en vez de una conversión exacta,
  // se devuelve transparente para que no rompan la captura sin alterar
  // visiblemente el contenido principal (título y datos).
  return 'transparent';
}

/**
 * Busca cualquier función de color moderna (oklch, oklab, lab, lch,
 * color-mix, color) dentro de un texto más grande — respetando paréntesis
 * anidados, ej. "color-mix(in oklab, var(--x), transparent)" — y la
 * reemplaza por su equivalente en rgb(), dejando el resto del texto intacto.
 */
export function normalizarTextoConColores(texto: string): string {
  if (!texto || !/oklch|oklab|\blab\(|\blch\(|color-mix\(|\bcolor\(/i.test(texto)) return texto;
  const patronInicio = /\b(oklch|oklab|lab|lch|color-mix|color)\(/gi;
  let resultado = '';
  let ultimaPos = 0;
  let m: RegExpExecArray | null;
  while ((m = patronInicio.exec(texto))) {
    const inicio = m.index;
    let profundidad = 1;
    let fin = patronInicio.lastIndex;
    while (fin < texto.length && profundidad > 0) {
      if (texto[fin] === '(') profundidad++;
      else if (texto[fin] === ')') profundidad--;
      fin++;
    }
    resultado += texto.slice(ultimaPos, inicio) + normalizarUnColor(texto.slice(inicio, fin));
    ultimaPos = fin;
    patronInicio.lastIndex = fin;
  }
  resultado += texto.slice(ultimaPos);
  return resultado;
}

/**
 * Prepara un nodo (y todos sus descendientes) para ser capturado por
 * html2canvas: copia el estilo YA CALCULADO de cada elemento como estilo en
 * línea (con cualquier color oklch ya convertido a rgb), y quita la clase de
 * Tailwind — así html2canvas nunca necesita resolver ninguna clase ni hoja
 * de estilos por su cuenta, solo lee estilos en línea ya resueltos.
 */
const ATRIBUTO_ID_CAPTURA = 'data-export-uid';
// Separación horizontal entre columnas (etiqueta/barra/casos/aporte) SOLO
// en la exportación — se usa el MISMO valor en dos lugares que deben
// coincidir exactamente: (1) al medir dónde cae cada texto sobre el DOM
// real ANTES de capturar (ver ocultarYRegistrarTextosManuales) y (2) al
// congelar el estilo de la fila que sí ve html2canvas (más abajo). Si estos
// dos valores no coincidieran, el texto (medido con un espaciado) quedaría
// desalineado contra la barra (capturada con otro espaciado) — que fue
// exactamente la causa de la desalineación reportada.
const GAP_EXPORTACION_PX = 4;
// Ancho al que se reduce el contenedor de la barra (data-export-track)
// SOLO en la exportación — ver su uso en congelarEstilosParaCaptura
// ("width:74%"). Se define aquí, en un solo lugar, para que el cálculo del
// desplazamiento de "casos"/"aporte" (justo abajo) SIEMPRE corresponda
// exactamente al ancho real al que se reduce la barra, sin poder
// desincronizarse si alguno de los dos valores cambia por separado.
const ANCHO_BARRA_EXPORTACION_PCT = 74;

// Desplazamiento horizontal (hacia la barra) SOLO para las columnas de
// "casos" y "aporte" (incluyendo su encabezado "Aporte") — corrige el
// espacio vacío que queda entre el extremo visual de la barra (ya reducida
// a ANCHO_BARRA_EXPORTACION_PCT%) y donde empiezan esos dos textos.
//
// Antes este valor era un número fijo (10px), pensado para el ancho típico
// de columna en pantallas de escritorio — pero el hueco real que deja la
// barra al reducirse es un PORCENTAJE de su columna (26% = 100% - 74%), así
// que en columnas más anchas (dashboard grande, o el propio recuadro rojo
// de la barra máxima) 10px se quedaba corto y dejaba exactamente el espacio
// vacío reportado en la imagen exportada. Ahora se calcula de forma
// proporcional al ancho REAL medido de la columna de la barra en esa
// captura puntual, así el ajuste es correcto sin importar cuántas columnas,
// filtros o el tamaño de pantalla desde el que se exporte.
function calcularDesplazamientoCasosAporte(raiz: HTMLElement): number {
  // Todas las filas comparten el mismo COLUMNAS_GRID (ver AporteBarList),
  // así que basta con medir la columna de la barra en la PRIMERA fila con
  // datos — el mismo valor aplica también a la fila de encabezado
  // ("Aporte"), que no tiene su propia barra pero sí la misma columna.
  const contenedorBarra = raiz.querySelector<HTMLElement>('[data-export-track]');
  if (!contenedorBarra || !contenedorBarra.parentElement) return 0;
  const anchoColumnaBarra = contenedorBarra.parentElement.getBoundingClientRect().width;
  return anchoColumnaBarra * (1 - ANCHO_BARRA_EXPORTACION_PCT / 100);
}

/**
 * Oculta (visibility:hidden, NO display:none — así no se altera el layout)
 * cada elemento marcado con data-export-texto ANTES de que html2canvas
 * capture, y guarda toda la información necesaria (posición real medida
 * por el propio navegador vía getBoundingClientRect, texto, fuente, color,
 * alineación) para dibujarlo DESPUÉS directamente sobre el canvas con la
 * API Canvas 2D — el mismo mecanismo, ya confiable, que se usa para el
 * título. Esto evita por completo que html2canvas tenga que interpretar y
 * medir el texto HTML, que es donde parece originarse un recorte vertical
 * persistente en las etiquetas que no cedió ante ningún ajuste de CSS
 * (line-height, overflow, alto de fila, negrilla, tamaño de letra o
 * tipografía — se probó cada uno por separado, con evidencia, y el
 * problema persistía idéntico en todos los casos).
 */
interface TextoManual {
  x: number; y: number; anchoDisponible: number;
  texto: string; color: string; fontSize: number; fontWeight: string; fontFamily: string;
  align: 'left' | 'center' | 'right';
}

function ocultarYRegistrarTextosManuales(raiz: HTMLElement): { registros: TextoManual[]; restaurar: () => void } {
  // Se aplica el MISMO gap reducido directamente sobre el DOM real (no solo
  // sobre el clon que ve html2canvas) ANTES de medir las posiciones del
  // texto — así lo que se mide con getBoundingClientRect ya refleja
  // exactamente el layout compacto con el que también se captura la barra,
  // evitando que texto y barra terminen calculados sobre dos disposiciones
  // ligeramente distintas (esa diferencia acumulada, fila tras fila, era
  // la causa real de la desalineación reportada).
  const filas = Array.from(raiz.querySelectorAll<HTMLElement>('[data-export-fila]'));
  const gapsOriginales = filas.map((el) => ({ el, gap: el.style.gap }));
  filas.forEach((el) => { el.style.gap = `${GAP_EXPORTACION_PX}px`; });

  const elementos = Array.from(raiz.querySelectorAll<HTMLElement>('[data-export-texto]'));
  const rectRaiz = raiz.getBoundingClientRect();
  const desplazamientoCasosAporte = calcularDesplazamientoCasosAporte(raiz);
  const originales = elementos.map((el) => ({ el, visibility: el.style.visibility }));
  const registros: TextoManual[] = elementos.map((el) => {
    const estilo = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const alineacionCss = estilo.textAlign;
    const align: TextoManual['align'] = alineacionCss === 'right' ? 'right' : alineacionCss === 'center' ? 'center' : 'left';
    // Si el elemento trunca con "..." (tiene title con el texto completo),
    // se usa el texto YA MOSTRADO en pantalla (textContent, que en el DOM
    // real sigue siendo el texto completo — la elipsis es solo visual vía
    // CSS) para poder truncarlo nosotros mismos al dibujar, midiendo con
    // el canvas en vez de depender de html2canvas para eso.
    const texto = el.textContent ?? '';
    let x: number;
    if (align === 'right') x = rect.right - rectRaiz.left;
    else if (align === 'center') x = rect.left - rectRaiz.left + rect.width / 2;
    else x = rect.left - rectRaiz.left;
    // SOLO estas dos columnas (casos y aporte, incluyendo su encabezado) se
    // desplazan un poco hacia la barra — la barra en pantalla llena una
    // parte de su columna (el ancho reducido pedido antes), dejando un
    // espacio vacío entre su extremo visual y donde arranca "casos"; este
    // ajuste achica ÚNICAMENTE ese espacio, sin tocar la columna de la
    // etiqueta, la barra en sí, el recuadro rojo, la altura de fila ni el
    // centrado vertical — nada de eso se recalcula aquí, solo se resta una
    // distancia horizontal fija a la posición ya medida de estos dos
    // textos puntuales.
    const marcador = el.getAttribute('data-export-texto');
    if (marcador === 'valor' || marcador === 'aporte' || marcador === 'aporte-header') {
      x -= desplazamientoCasosAporte;
    }
    const y = rect.top - rectRaiz.top + rect.height / 2;
    return {
      x, y, anchoDisponible: rect.width,
      texto, color: estilo.color, fontSize: parseFloat(estilo.fontSize) || 12,
      fontWeight: estilo.fontWeight, fontFamily: estilo.fontFamily, align,
    };
  });
  elementos.forEach((el) => { el.style.visibility = 'hidden'; });
  return {
    registros,
    restaurar: () => {
      originales.forEach(({ el, visibility }) => { el.style.visibility = visibility; });
      gapsOriginales.forEach(({ el, gap }) => { el.style.gap = gap; });
    },
  };
}

/**
 * Dibuja sobre el canvas ya capturado (bordes, barras, colores — todo lo
 * que NO es texto, que html2canvas sí reproduce bien) cada texto
 * registrado por ocultarYRegistrarTextosManuales, con recorte manual tipo
 * "..." cuando no cabe en el ancho disponible, calculado con el propio
 * canvas (ctx.measureText), no con una aproximación.
 */
function dibujarTextosManuales(ctx: CanvasRenderingContext2D, registros: TextoManual[], escala: number, offsetX: number, offsetY: number) {
  registros.forEach((r) => {
    ctx.font = `${r.fontWeight} ${r.fontSize * escala}px ${r.fontFamily}`;
    // El color computado viene en formato oklch(...) (Tailwind v4) — el
    // fillStyle de Canvas 2D no interpreta ese formato (lo descarta en
    // silencio, sin dibujar nada, que es justo la causa de que el texto
    // desapareciera por completo al dibujarlo manualmente); se reutiliza
    // la misma conversión a rgb()/rgba() que ya usa el resto de la
    // exportación para los estilos HTML.
    ctx.fillStyle = normalizarTextoConColores(r.color);
    ctx.textAlign = r.align;
    ctx.textBaseline = 'middle';
    const anchoMaximoPx = r.anchoDisponible * escala;
    let texto = r.texto;
    if (ctx.measureText(texto).width > anchoMaximoPx) {
      while (texto.length > 1 && ctx.measureText(`${texto}…`).width > anchoMaximoPx) {
        texto = texto.slice(0, -1);
      }
      texto = `${texto}…`;
    }
    ctx.fillText(texto, r.x * escala + offsetX, r.y * escala + offsetY);
  });
}

/**
 * Marca "original" y cada uno de sus descendientes con un identificador
 * único (data-export-uid) — html2canvas preserva todos los atributos al
 * clonar, así que el clon queda con exactamente los mismos identificadores.
 * Esto permite que congelarEstilosParaCaptura empareje cada nodo del clon
 * con SU nodo original exacto por identidad, en vez de por posición en un
 * querySelectorAll('*') — el emparejamiento por posición era la causa raíz
 * de que las barras (y sus columnas) recibieran estilos de OTRA fila
 * distinta apenas la estructura del clon difería en un solo nodo de la del
 * original (algo que puede pasar por cualquier detalle interno de
 * html2canvas o de Recharts), desalineando todo lo que viniera después en
 * el recorrido.
 */
function etiquetarElementosParaCaptura(original: HTMLElement): () => void {
  const nodos = [original, ...Array.from(original.querySelectorAll<HTMLElement>('*'))];
  nodos.forEach((n, i) => n.setAttribute(ATRIBUTO_ID_CAPTURA, String(i)));
  return () => nodos.forEach((n) => n.removeAttribute(ATRIBUTO_ID_CAPTURA));
}

function tieneTextoPropio(el: Element): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);
}
function esDeUnaLinea(el: HTMLElement, estilo: CSSStyleDeclaration): boolean {
  if (estilo.whiteSpace === 'nowrap' || estilo.whiteSpace === 'pre') return false;
  const tamano = parseFloat(estilo.fontSize) || 12;
  const interlineado = parseFloat(estilo.lineHeight) || tamano * 1.35;
  const r = el.getBoundingClientRect();
  const relleno = (parseFloat(estilo.paddingTop) || 0) + (parseFloat(estilo.paddingBottom) || 0);
  return r.height > 0 && r.height - relleno < interlineado * 1.6;
}

export function congelarEstilosParaCaptura(original: HTMLElement, clon: HTMLElement) {
  const nodosOriginales: Element[] = [original, ...Array.from(original.querySelectorAll('*'))];
  // Mapa id -> nodo clonado, construido a partir del atributo estable en vez
  // de asumir que el orden del querySelectorAll('*') del clon coincide
  // exactamente con el del original.
  const mapaClonesPorId = new Map<string, HTMLElement>();
  [clon, ...Array.from(clon.querySelectorAll<HTMLElement>('*'))].forEach((n) => {
    const id = n.getAttribute(ATRIBUTO_ID_CAPTURA);
    if (id !== null) mapaClonesPorId.set(id, n);
  });

  const ETIQUETAS_CON_TRAZO_ANIMADO = new Set(['path', 'line', 'polyline']);
  nodosOriginales.forEach((nodoOriginal) => {
    const id = nodoOriginal.getAttribute(ATRIBUTO_ID_CAPTURA);
    const nodoClon = id !== null ? mapaClonesPorId.get(id) : undefined;
    if (!nodoClon || !nodoClon.style) return;
    const estilo = window.getComputedStyle(nodoOriginal);
    // Detecta texto truncado con "..." (ej. nombres largos de Z. Atención,
    // que en pantalla se acortan para no romper el layout, mostrando el
    // nombre completo solo al pasar el mouse). En la imagen exportada no
    // existe "pasar el mouse", así que se expande a su ancho real — se
    // identifica por "text-overflow: ellipsis" específicamente (nunca por
    // "overflow: hidden" solo, que también usan las barras de las gráficas
    // para recortar su relleno de color y NO debe tocarse).
    const esTextoTruncado = estilo.textOverflow === 'ellipsis';
    // Contenedor completo de una barra (fondo gris + relleno de color +
    // borde de la barra máxima) — marcado explícitamente desde el propio
    // componente (data-export-track) para reducir su ancho TOTAL solo en
    // la imagen exportada, nunca en pantalla. Se reduce el contenedor
    // completo (no solo el relleno de color por dentro) para que el fondo
    // gris se achique junto con el color, y como es un bloque normal que
    // arranca en el borde izquierdo de su columna, sigue empezando
    // exactamente en el mismo punto — solo termina antes.
    const esContenedorDeBarra = nodoOriginal.hasAttribute('data-export-track');
    // Los HIJOS de ese contenedor (el fondo gris y, dentro de él, el
    // relleno de color) NO deben copiar su "width" calculado en píxeles
    // absolutos — getComputedStyle().width siempre devuelve un número fijo
    // ya resuelto contra el ancho ACTUAL (sin reducir) del contenedor. Si
    // se copiara tal cual, el relleno quedaría con su tamaño de ANTES de
    // reducir el contenedor, sobresaliendo del recuadro rojo (que sí se
    // reduce) — exactamente el error reportado. La corrección: para estos
    // hijos, se usa el ancho ORIGINAL tal como fue escrito en el propio
    // elemento (nodoOriginal.style.width, ej. "46%", un valor relativo que
    // sigue siendo válido con el contenedor ya más angosto), o si no tiene
    // ningún ancho en línea (el fondo gris, que solo es un bloque normal),
    // no se copia nada — así hereda el 100% de su padre de forma natural,
    // que es justo lo que se necesita.
    const dentroDeBarra = !esContenedorDeBarra && nodoOriginal.closest('[data-export-track]');
    // Fila completa de una lista de barras (etiqueta + barra + valor +
    // aporte) — marcada desde el propio componente (data-export-fila) para
    // dos ajustes SOLO en la exportación:
    // 1) Más alto del necesario en pantalla, para que ninguna letra se
    //    recorte por arriba o por abajo — se mide el alto real actual y se
    //    le suma un margen generoso, en vez de dejar que el alto quede
    //    congelado exactamente al límite justo del contenido (que fue la
    //    causa del recorte reportado).
    // 2) Menos separación horizontal entre columnas (gap), para que
    //    "casos" quede más pegado a la barra y "aporte" más pegado a
    //    "casos", tal como se pidió.
    const esFilaDeExportacion = nodoOriginal.hasAttribute('data-export-fila');
    // Elementos SIN texto (íconos en círculo, puntos de color, separadores,
    // gráficas): conservan su alto fijo — su forma depende de él.
    const sinTexto = (nodoOriginal.textContent ?? '').trim().length === 0;
    let textoEstilo = '';
    for (let j = 0; j < estilo.length; j++) {
      const nombre = estilo[j];
      // El alto extra que antes se forzaba aquí (para que el texto HTML no
      // se recortara) ya no hace falta: el texto ahora se dibuja aparte,
      // directamente en el canvas (ver ocultarYRegistrarTextosManuales /
      // dibujarTextosManuales) — la fila conserva su alto NATURAL, igual
      // que en pantalla, evitando además el problema de que el texto (que
      // se mide en la posición ORIGINAL del DOM) quedara desalineado
      // contra una barra capturada con una fila ya más alta.
      if (esFilaDeExportacion && (nombre === 'gap' || nombre === 'column-gap' || nombre === 'row-gap')) {
        textoEstilo += `${nombre}:${GAP_EXPORTACION_PX}px;`;
        continue;
      }
      if (ETIQUETAS_CON_TRAZO_ANIMADO.has(nodoOriginal.tagName.toLowerCase()) && (nombre === 'stroke-dasharray' || nombre === 'stroke-dashoffset')) {
        continue;
      }
      if (esContenedorDeBarra && nombre === 'width') {
        textoEstilo += `width:${ANCHO_BARRA_EXPORTACION_PCT}%;`;
        continue;
      }
      if (dentroDeBarra && nombre === 'width') {
        const anchoEnLinea = (nodoOriginal as HTMLElement).style.width;
        // Si no tiene un ancho en línea propio (el fondo gris, que
        // normalmente hereda el 100% de su padre de forma implícita), se
        // fija "100%" EXPLÍCITAMENTE en vez de omitir la propiedad —
        // html2canvas no siempre reproduce bien el "ancho automático que
        // llena al padre" cuando no hay ningún valor de "width" declarado;
        // con un valor explícito no queda a su interpretación.
        textoEstilo += `width:${anchoEnLinea || '100%'};`;
        continue;
      }
      // Las etiquetas truncadas (esTextoTruncado) solo se excluyen de la
      // negrilla/aumento de tamaño cuando REALMENTE necesitan truncarse
      // (su texto no cabe) — para esas, la negrilla puede hacer que el
      // recorte con "..." de html2canvas no calcule bien y se salga de su
      // columna (ver más abajo). Las que sí caben sin truncar (ej.
      // "Centro") no tienen ese riesgo y sí reciben negrilla — además,
      // el peso normal mostraba un artefacto de renderizado propio de
      // html2canvas a esta escala que la negrilla evita.
      const truncadoQueDesborda = esTextoTruncado && nodoOriginal.scrollWidth > nodoOriginal.clientWidth + 1;
      // La clase "truncate" fija "overflow: hidden" genérico (horizontal Y
      // vertical a la vez). Si html2canvas mide el alto del texto de forma
      // ligeramente distinta a un navegador real (una diferencia de
      // sub-píxel en el motor de texto de html2canvas es suficiente), ese
      // "overflow: hidden" vertical recorta la parte de arriba de las
      // letras — la causa real del texto "cortado" en las etiquetas
      // reportado. La solución: separar el recorte en horizontal (que sí
      // hace falta, para el "...") del vertical (que no debería existir en
      // una fila de una sola línea) — así el "..." se sigue viendo cuando
      // el nombre es largo, pero nunca se recorta el alto de la letra.
      if (esTextoTruncado && (nombre === 'overflow' || nombre === 'overflow-x' || nombre === 'overflow-y')) {
        // getComputedStyle expone "overflow" (el shorthand) Y también
        // "overflow-x"/"overflow-y" (los longhand) como propiedades
        // SEPARADAS en el mismo recorrido — si solo se interceptaba
        // "overflow", el bucle seguía y copiaba "overflow-y:hidden" sin
        // modificar más adelante en el mismo texto de estilo, y esa
        // declaración posterior GANABA (así funciona CSS: la última
        // declaración de la misma propiedad en el mismo "style" es la que
        // aplica), deshaciendo el cambio por completo. Por eso se
        // interceptan las tres variantes del nombre aquí.
        if (nombre === 'overflow-x') textoEstilo += 'overflow-x:hidden;';
        else if (nombre === 'overflow-y') textoEstilo += 'overflow-y:visible;';
        else textoEstilo += 'overflow-x:hidden;overflow-y:visible;';
        continue;
      }
      // Antes aquí se forzaba negrilla y +8 % de tamaño a TODO el texto. Eso
      // hacía que el texto ocupara más ancho que en pantalla y terminara
      // saliéndose de su celda ("+100,4%"), partiéndose en dos líneas
      // ("CLASE DE / SITIO") o encimándose con lo de abajo. Ahora se copia
      // el tamaño y el peso tal cual; la nitidez la da la escala de captura.
      // Al agrandar la letra (arriba) sin tocar "height", el texto más
      // grande ya no cabía dentro del alto YA CONGELADO en píxeles (el que
      // tenía con la letra más chica) — y como "overflow" también se
      // copia, el exceso se recortaba por arriba, justo el problema
      // reportado. Se omite "height" para estos elementos (nunca son la
      // barra ni su contenedor, que sí necesitan un alto fijo): así el
      // texto agrandado define su propio alto natural en vez de quedar
      // encajado a la fuerza en uno más chico. OJO: también "block-size" y
      // "min-block-size" — son el MISMO alto con otro nombre (propiedades
      // lógicas) y getComputedStyle las trae aparte; si se copiaban, el alto
      // quedaba fijo igual y un texto que en la captura ocupara una línea
      // más se montaba sobre el de abajo.
      if ((nombre === 'height' || nombre === 'min-height' || nombre === 'block-size' || nombre === 'min-block-size') && !truncadoQueDesborda && !esContenedorDeBarra && !dentroDeBarra && !sinTexto) {
        continue;
      }
      // Se quitó por completo el halo blanco alrededor del texto — a
      // pedido explícito, el efecto se veía como un contorno/borde extraño
      // en la imagen exportada. El texto usa únicamente su color
      // institucional normal, tal como está definido, sin ningún efecto
      // adicional.
      if (nombre === 'text-shadow') {
        textoEstilo += 'text-shadow:none;';
        continue;
      }
      const valor = normalizarTextoConColores(estilo.getPropertyValue(nombre));
      textoEstilo += `${nombre}:${valor};`;
    }
    if (ETIQUETAS_CON_TRAZO_ANIMADO.has(nodoOriginal.tagName.toLowerCase())) {
      textoEstilo += 'stroke-dasharray:none;stroke-dashoffset:0;';
      nodoClon.removeAttribute('stroke-dasharray');
      nodoClon.removeAttribute('stroke-dashoffset');
    }
    // Las etiquetas truncadas con "..." (esTextoTruncado) YA NO se
    // ensanchan aquí — a pedido explícito, deben truncarse en la
    // descarga exactamente igual que en pantalla (con "...", nunca
    // invadiendo la barra de al lado); el nombre completo queda disponible
    // igual mediante el atributo title (tooltip), que si se conserva.
    // SIN transiciones ni animaciones en la copia. Causa real del error
    // "unsupported color function oklab" al descargar (ej. Matriz de
    // Calor): un elemento con la clase "transition" (o transition-colors)
    // pasa de su color original al color congelado ANIMANDO el cambio, y
    // durante esa animación el navegador reporta el color intermedio en
    // formato oklab() — que html2canvas no sabe leer. Con transition:none
    // el color congelado (rgba) se aplica de inmediato.
    // Textos de UNA sola línea en pantalla se fijan en una línea también en
    // la imagen: el motor de captura mide el texto unos píxeles más ancho que
    // el navegador y a veces lo partía en dos ("2025 · / comparar"), y la
    // segunda línea se montaba sobre lo de abajo.
    if (!(nodoOriginal instanceof SVGElement) && tieneTextoPropio(nodoOriginal) && esDeUnaLinea(nodoOriginal as HTMLElement, estilo)) {
      textoEstilo += 'white-space:nowrap;';
    }
    textoEstilo += 'transition:none !important;animation:none !important;';
    nodoClon.setAttribute('style', textoEstilo);
    nodoClon.removeAttribute('class');
    nodoClon.removeAttribute(ATRIBUTO_ID_CAPTURA);
    if (esTextoTruncado) nodoClon.removeAttribute('title');
  });
}

/**
 * Exporta una gráfica SVG (Recharts) como imagen PNG, con un título dibujado
 * arriba — de forma directa (sin html2canvas), ya que Recharts usa colores
 * explícitos (no clases de Tailwind), evitando por completo el problema de
 * oklch(). También es más fiel: nunca corre riesgo de que el contenido se
 * "pierda" al clonar/reescribir estilos, como sí puede pasar con HTML.
 */
export function exportarSvgComoImagen(svgOriginal: SVGElement, titulo: string | undefined, nombreArchivo: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const rect = svgOriginal.getBoundingClientRect();
    const ancho = Math.max(1, Math.round(rect.width));
    const alto = Math.max(1, Math.round(rect.height));

    const clon = svgOriginal.cloneNode(true) as SVGElement;
    clon.setAttribute('width', String(ancho));
    clon.setAttribute('height', String(alto));
    clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    // Recharts anima la aparición de las líneas de tendencia con
    // stroke-dasharray/stroke-dashoffset (revela el trazo progresivamente).
    // Si la descarga se hace justo cuando la gráfica recién se dibujó (ej.
    // apenas se cambió un filtro), esa animación puede seguir a medias y la
    // línea saldría cortada en la imagen exportada. Se elimina esa
    // propiedad de todo el clon para forzar que la línea se vea siempre
    // completa, sin importar el estado de la animación en pantalla.
    clon.querySelectorAll('path, line, polyline').forEach((el) => {
      el.removeAttribute('stroke-dasharray');
      el.removeAttribute('stroke-dashoffset');
      (el as SVGElement).style.strokeDasharray = 'none';
      (el as SVGElement).style.strokeDashoffset = '0';
    });
    const textoSvg = new XMLSerializer().serializeToString(clon);
    const dataUrlSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(textoSvg);

    const imagen = new Image();
    imagen.onload = () => {
      const escala = 2;
      const relleno = 20;
      const altoTitulo = titulo ? 34 : 0;
      const canvas = document.createElement('canvas');
      canvas.width = (ancho + relleno * 2) * escala;
      canvas.height = (alto + altoTitulo + relleno * 2) * escala;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.scale(escala, escala);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, ancho + relleno * 2, alto + altoTitulo + relleno * 2);
      if (titulo) {
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(titulo, relleno, relleno);
      }
      ctx.drawImage(imagen, relleno, relleno + altoTitulo, ancho, alto);
      const enlace = document.createElement('a');
      enlace.download = `${nombreArchivo}.png`;
      enlace.href = canvas.toDataURL('image/png');
      enlace.click();
      resolve();
    };
    imagen.onerror = () => reject(new Error('No se pudo cargar el SVG como imagen.'));
    imagen.src = dataUrlSvg;
  });
}

/**
 * Exporta contenido HTML (ej. una tabla) como imagen PNG, con un título
 * dibujado arriba — usa html2canvas (con el congelado de estilos de arriba)
 * porque una tabla sí necesita el layout/CSS real para verse bien.
 */
/**
 * Antes de capturar, algunos textos se ven truncados en pantalla con "..."
 * (ej. nombres largos de Zonas de Atención o barrios) porque tienen un
 * ancho fijo — intencional para que la fila no se desborde EN PANTALLA. Pero
 * en la imagen exportada no hay ninguna razón para mantener ese límite: se
 * ensancha temporalmente cada texto truncado a su ancho natural completo
 * ANTES de llamar a html2canvas (así el contenedor mide su tamaño real ya
 * ensanchado y la imagen sale con el ancho que haga falta para que quepa
 * todo), y se revierte apenas termina la captura — la pantalla nunca
 * conserva ese cambio.
 */
function ensancharTextosTruncados(raiz: HTMLElement): () => void {
  // Los nombres largos (ej. "Barrio Pendiente Por Asignar") se truncan con
  // "..." exactamente igual que en pantalla — a propósito: forzar que cada
  // etiqueta se ensanche a su propio ancho natural fue lo que rompía la
  // alineación de las barras entre filas (cada nombre tiene un largo
  // distinto). El dato completo sigue disponible al pasar el mouse sobre
  // la imagen original en pantalla (atributo title); la imagen exportada
  // refleja fielmente lo que ya se ve truncado en el dashboard.
  //
  // Lo que SÍ se corrige aquí son dos casos distintos, que no son "texto
  // truncado con ellipsis" sino contenedores con su propio scroll/ancho
  // que un archivo estático no puede tener:
  // IMPORTANTE — orden de detección: antes se revisaba qué contenedores YA
  // tenían overflow ANTES de ensanchar ninguna tabla — así que un
  // contenedor que todavía NO desbordaba (porque la tabla de adentro
  // seguía angosta) nunca quedaba en la lista de "hay que ajustar este
  // contenedor". Al ensanchar la tabla DESPUÉS, esa tabla pasaba a ser más
  // ancha que su contenedor (que se quedaba con su overflow-x:auto
  // original, recortando lo que sobra) — resultado confirmado: las
  // últimas columnas de una tabla angosta (ej. "%" y "Aporte %" en
  // "Casos por Estación") quedaban recortadas/invisibles, sin que el
  // contenedor se enterara de que ahora tenía que ser más ancho.
  //
  // Se corrige detectando los CANDIDATOS a contenedor-con-scroll por su
  // ESTILO (overflow-x: auto/scroll), sin exigir que YA estén
  // desbordando — y revisando si desbordan (scrollWidth > clientWidth)
  // recién DESPUÉS de ensanchar las tablas angostas, momento en el que ya
  // se sabe con certeza si hace falta ajustarlos o no.
  const posiblesContenedoresScroll = [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))].filter((el) => {
    const estilo = window.getComputedStyle(el);
    return estilo.overflowX === 'auto' || estilo.overflowX === 'scroll';
  });
  // Ya no se fuerza un ancho mínimo a las tablas: el ancho necesario se
  // calcula del contenido real (ver ajustarAnchoPorDesbordeHorizontal).
  const ANCHO_MINIMO_TABLA = 0;
  const tablasAngostas = Array.from(raiz.querySelectorAll<HTMLTableElement>('table')).filter(
    (t) => t.getBoundingClientRect().width < ANCHO_MINIMO_TABLA,
  );
  const originales = [...posiblesContenedoresScroll, ...tablasAngostas].map((el) => ({
    el,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    minWidth: el.style.minWidth,
    overflow: el.style.overflow,
    overflowX: el.style.overflowX,
    transition: el.style.transition,
  }));
  // Transiciones CSS desactivadas ANTES de cambiar el ancho — a pedido
  // explícito: sin esto, si el elemento (o una clase de Tailwind como
  // transition-all) tenía una transición de "width" o "all", el cambio de
  // tamaño se veía como una animación visible de la información
  // agrandándose en pantalla, en vez de un ajuste instantáneo e
  // imperceptible antes de la captura.
  [...posiblesContenedoresScroll, ...tablasAngostas].forEach((el) => { el.style.transition = 'none'; });

  // PRIMERO se ensanchan las tablas angostas (si las hay)...
  tablasAngostas.forEach((t) => {
    t.style.width = `${ANCHO_MINIMO_TABLA}px`;
    t.style.minWidth = `${ANCHO_MINIMO_TABLA}px`;
  });
  // ...y RECIÉN AHORA se revisa cuáles contenedores de scroll de verdad
  // desbordan (con las tablas YA en su tamaño final) y se ajustan — nunca
  // antes, que es justo el orden que causaba el recorte.
  posiblesContenedoresScroll.forEach((el) => {
    if (el.scrollWidth <= el.clientWidth + 1) return; // este no desborda, no se toca
    // Se usa el ancho YA MEDIDO en píxeles (scrollWidth), no la palabra
    // clave CSS "max-content" — en una tabla, pedirle al navegador que
    // calcule "max-content" puede disparar un recálculo de layout que en
    // ciertas combinaciones (columnas con ancho en %, tablas anidadas)
    // termina en un ancho absurdamente grande, produciendo un canvas roto.
    // El valor medido es un número concreto, y ya refleja la tabla YA
    // ensanchada (gracias al orden de arriba).
    el.style.width = `${el.scrollWidth}px`;
    el.style.maxWidth = 'none';
    el.style.overflowX = 'visible';
    el.style.overflow = 'visible';
  });
  return () => {
    originales.forEach(({ el, width, maxWidth, minWidth, overflow, overflowX, transition }) => {
      el.style.width = width;
      el.style.maxWidth = maxWidth;
      el.style.minWidth = minWidth;
      el.style.overflow = overflow;
      el.style.overflowX = overflowX;
      el.style.transition = transition;
    });
  };
}


// ── Corrección de la línea base del texto en html2canvas ────────────────
// CAUSA REAL del texto "corrido hacia abajo" (y de la última fila cortada)
// en TODAS las descargas de imagen y del PDF: para saber a qué altura
// dibujar cada texto, html2canvas mete en la página un <div> oculto con un
// texto de muestra y una <img> de 1×1 px alineada a la línea base, y mide
// la distancia entre ambos (FontMetrics.parseMetrics). Esa medición la hace
// sobre el documento REAL, no sobre el clon — y en el documento real rige
// el "preflight" de Tailwind, que pone `img { display: block }`. Con eso la
// imagen de muestra salta a la línea de abajo, la "línea base" medida
// queda una línea entera más abajo de lo real, y cada texto se dibuja
// varios píxeles más abajo de donde está en pantalla: queda pegado al
// borde inferior de su fila, y en la última fila se sale del área
// capturada (se ve cortado).
//
// La corrección es una sola regla CSS que devuelve SOLO esa imagen de
// muestra (1×1, GIF en base64, hija directa del <div> temporal que
// html2canvas cuelga del <body>) a display:inline — no toca ninguna otra
// imagen del dashboard. Se inserta una vez, la primera vez que se exporta.
const ID_ESTILO_METRICAS = 'correccion-metricas-html2canvas';
function asegurarCorreccionMetricasHtml2canvas() {
  if (document.getElementById(ID_ESTILO_METRICAS)) return;
  const estilo = document.createElement('style');
  estilo.id = ID_ESTILO_METRICAS;
  estilo.textContent = 'body > div > img[width="1"][height="1"][src^="data:image/gif"] { display: inline !important; }';
  document.head.appendChild(estilo);
}


// ── Ajustes de la COPIA antes de capturar (nunca tocan la pantalla) ──────
// Todo lo de abajo trabaja sobre la copia fuera de pantalla que arma
// capturarComponenteComoCanvas. Objetivo: que la imagen contenga el
// componente COMPLETO aunque en pantalla tenga scroll interno, altura
// máxima, "overflow: hidden" o textos acortados con "…".

const esperarCuadro = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

/** Elementos que nunca se deben "desplegar": mapas Leaflet, SVG y el interior de las barras. */
function esIntocable(el: Element): boolean {
  if (el instanceof SVGElement) return true;
  if (el.closest('.leaflet-container')) return true;
  if (el.hasAttribute('data-export-track') || el.closest('[data-export-track]')) return true;
  return false;
}

/**
 * Despliega cualquier contenedor que esté escondiendo contenido: listas con
 * altura máxima y scroll, cajas con alto fijo y overflow hidden/auto, tablas
 * con scroll horizontal. Usa min-height/min-width con el tamaño REAL del
 * contenido (scrollHeight/scrollWidth), así nada depende de medidas fijas.
 * Los textos con "…" no se tocan aquí (ver ensancharHastaQueQuepanLosTextos).
 */
function desplegarContenidoOculto(raiz: HTMLElement, permitirHorizontal = false) {
  // Varias pasadas: al desplegar un contenedor interno, su padre puede
  // pasar a desbordar también.
  for (let pasada = 0; pasada < 3; pasada++) {
    let cambios = 0;
    for (const el of [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))]) {
      if (esIntocable(el)) continue;
      const estilo = window.getComputedStyle(el);
      if (estilo.textOverflow === 'ellipsis') continue;
      const ocultaY = estilo.overflowY !== 'visible';
      const ocultaX = estilo.overflowX !== 'visible';
      if (ocultaY && el.scrollHeight > el.clientHeight + 1) {
        el.style.maxHeight = 'none';
        el.style.minHeight = `${el.scrollHeight}px`;
        el.style.overflowY = 'visible';
        cambios++;
      }
      if (permitirHorizontal && ocultaX && el.scrollWidth > el.clientWidth + 1 && el.tagName !== 'TD' && el.tagName !== 'TH') {
        el.style.maxWidth = 'none';
        el.style.minWidth = `${el.scrollWidth}px`;
        el.style.overflowX = 'visible';
        cambios++;
      }
    }
    if (cambios === 0) break;
  }
}

/** Textos que hoy se ven recortados (con "…" o cortados por su caja). */
function textosRecortados(raiz: HTMLElement): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>('*')).filter((el) => {
    if (esIntocable(el) || el.hasAttribute('data-ocultar-en-descarga')) return false;
    if (el.scrollWidth <= el.clientWidth + 1 || el.clientWidth === 0) return false;
    const estilo = window.getComputedStyle(el);
    if (estilo.overflowX === 'visible') return false;
    // Solo cuenta si de verdad contiene texto propio.
    return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);
  });
}

/**
 * Listas de barras (AporteBarList): la columna del nombre tiene un ancho
 * fijo en pantalla y los nombres largos se acortan con "…". En la copia se
 * ensancha esa columna al nombre más largo de la lista — igual en todas sus
 * filas, para que las barras sigan alineadas entre sí.
 */
function ensancharColumnaDeEtiquetas(raiz: HTMLElement) {
  // Filas de datos agrupadas por su lista (mismo padre).
  const listas = new Map<HTMLElement, HTMLElement[]>();
  raiz.querySelectorAll<HTMLElement>('[data-export-fila]').forEach((fila) => {
    if (!fila.querySelector('[data-export-texto="etiqueta"]') || !fila.parentElement) return;
    const filas = listas.get(fila.parentElement) ?? [];
    filas.push(fila);
    listas.set(fila.parentElement, filas);
  });
  listas.forEach((filas, padre) => {
    const etiquetas = filas.map((f) => f.querySelector<HTMLElement>('[data-export-texto="etiqueta"]')!);
    const necesario = Math.ceil(Math.max(...etiquetas.map((e) => e.scrollWidth))) + 4;
    const actual = Math.min(...etiquetas.map((e) => e.clientWidth));
    if (necesario <= actual) return;
    // El encabezado ("Aporte") es hermano de la lista: recibe la misma grilla.
    const encabezados = padre.parentElement
      ? Array.from(padre.parentElement.children).filter((h): h is HTMLElement => h instanceof HTMLElement && h.hasAttribute('data-export-fila'))
      : [];
    [...filas, ...encabezados].forEach((f) => {
      const columnas = window.getComputedStyle(f).gridTemplateColumns.split(' ').filter(Boolean);
      if (columnas.length < 4) return;
      f.style.gridTemplateColumns = `${necesario}px minmax(90px, 1fr) ${columnas.slice(2).join(' ')}`;
    });
  });
}

/** Cuánto contenido queda escondido a la derecha en contenedores con scroll/hidden horizontal. */
function deficitHorizontal(raiz: HTMLElement): number {
  let deficit = 0;
  for (const el of [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))]) {
    if (esIntocable(el) || el.tagName === 'TD' || el.tagName === 'TH') continue;
    const estilo = window.getComputedStyle(el);
    if (estilo.textOverflow === 'ellipsis' || estilo.overflowX === 'visible') continue;
    if (!tieneTextoPropio(el) || el.children.length > 0) {
      deficit = Math.max(deficit, el.scrollWidth - el.clientWidth);
    }
  }
  return deficit;
}

/**
 * Tablas y bloques con scroll horizontal: en vez de estirar solo ese bloque
 * (que se montaba encima de lo que tiene al lado, ej. el panel "Resumen de
 * la tendencia"), se ensancha TODA la copia lo necesario para que el bloque
 * quepa en su propia columna. Solo si se llega al tope se estira el bloque.
 */
async function ajustarAnchoPorDesbordeHorizontal(copia: HTMLElement) {
  const tope = 3200;
  for (let intento = 0; intento < 5; intento++) {
    const deficit = deficitHorizontal(copia);
    if (deficit <= 1) return;
    const actual = copia.getBoundingClientRect().width;
    if (actual >= tope) break;
    copia.style.width = `${Math.min(tope, Math.ceil(actual + deficit + 2))}px`;
    await esperarCuadro();
  }
  desplegarContenidoOculto(copia, true);
}

/**
 * Si después de todo lo anterior todavía quedan textos acortados (columnas
 * en %, tarjetas en grilla, encabezados), se ensancha la copia por pasos
 * hasta que quepan — con tope, para no producir imágenes absurdas. Es un
 * ensanche del lienzo, no un zoom: la letra conserva su tamaño real.
 */
async function ensancharHastaQueQuepanLosTextos(copia: HTMLElement, anchoBase: number) {
  const tope = Math.max(anchoBase, Math.min(2400, anchoBase * 2.2));
  for (const factor of [1.12, 1.25, 1.4, 1.6, 1.85, 2.2]) {
    if (textosRecortados(copia).length === 0) return;
    const nuevo = Math.min(tope, Math.round(anchoBase * factor));
    if (nuevo <= copia.getBoundingClientRect().width) continue;
    copia.style.width = `${nuevo}px`;
    await esperarCuadro();
    desplegarContenidoOculto(copia);
  }
}

/** Borde derecho real del contenido (lo que sobresale también cuenta). */
function medirAnchoRealDelContenido(raiz: HTMLElement): number {
  const rectRaiz = raiz.getBoundingClientRect();
  let maxDerecha = Math.max(rectRaiz.width, raiz.scrollWidth);
  raiz.querySelectorAll<HTMLElement>('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    maxDerecha = Math.max(maxDerecha, r.right - rectRaiz.left);
  });
  return Math.ceil(maxDerecha);
}

/** Parte un texto en líneas que quepan en "anchoMax" (para título/subtítulo). */
function partirEnLineas(ctx: CanvasRenderingContext2D, texto: string, anchoMax: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width <= anchoMax || !actual) actual = prueba;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export interface OpcionesExportacion {
  /** Texto pequeño bajo el título (ej. el subtítulo de la tarjeta). */
  subtitulo?: string;
}

/**
 * Núcleo de captura reutilizado tanto por la descarga en PNG como por la
 * generación de PDF — así ambas rutas comparten EXACTAMENTE la misma
 * lógica (fondo transparente real, sin cuadrícula de fondo, sin texto
 * truncado, alto/ancho medidos con margen de seguridad) en vez de mantener
 * dos implementaciones distintas que puedan desincronizarse.
 */
export async function capturarComponenteComoCanvas(elemento: HTMLElement, titulo: string | undefined, opciones: OpcionesExportacion = {}): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  asegurarCorreccionMetricasHtml2canvas();

  // TODA la preparación (ensanchar tablas angostas, ocultar textos
  // manuales, ocultar la cuadrícula, etc.) se hace sobre una COPIA fuera
  // de pantalla, nunca sobre el componente real — a pedido explícito,
  // confirmado que afectaba TODOS los componentes descargables de
  // Delictividad, no solo uno: antes, esos ajustes se aplicaban
  // directamente al componente que el usuario tenía en pantalla, así que
  // cualquier cambio de ancho o cualquier elemento que se ocultara
  // producía un movimiento/parpadeo visible ahí mismo, encima de lo que se
  // estaba viendo — y si la captura ocurría a mitad de ese movimiento (por
  // una transición CSS, o simplemente por la mecánica async de
  // html2canvas), la imagen resultante salía a medio ajustar, es decir,
  // cortada. Con la copia, la página real NUNCA cambia — el usuario ni se
  // entera de que algo se está preparando detrás de cámaras.
  const copia = elemento.cloneNode(true) as HTMLElement;
  const anchoOriginal = elemento.getBoundingClientRect().width;
  copia.style.position = 'fixed';
  copia.style.top = '0';
  copia.style.left = '-99999px';
  copia.style.margin = '0';
  copia.style.width = `${anchoOriginal}px`;
  copia.style.pointerEvents = 'none';
  document.body.appendChild(copia);
  // Dos esperas antes de tocar o medir nada:
  // 1) Que las fuentes ya estén listas — si el texto se mide/renderiza
  //    todavía con la fuente de repuesto del navegador (más ancha/alta que
  //    la definitiva), las líneas pueden calcularse con una altura
  //    equivocada y terminar encimadas unas sobre otras en el resultado.
  // 2) Un cuadro (requestAnimationFrame) para que el navegador termine de
  //    calcular el diseño interno de la copia recién insertada (barras de
  //    "aporte", gráficas que miden su propio contenedor, etc.).
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch { /* si falla, se sigue igual con la espera de abajo */ }
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // Mostrar TODO el contenido antes de medir: contenedores con scroll o
  // altura máxima, columnas de nombres de las barras y, si aún hace falta,
  // un lienzo más ancho para que ningún texto quede con "…".
  desplegarContenidoOculto(copia);
  await esperarCuadro();
  await ajustarAnchoPorDesbordeHorizontal(copia);
  ensancharColumnaDeEtiquetas(copia);
  await esperarCuadro();
  await ensancharHastaQueQuepanLosTextos(copia, copia.getBoundingClientRect().width);
  await ajustarAnchoPorDesbordeHorizontal(copia);
  desplegarContenidoOculto(copia);
  await esperarCuadro();

  // Resolución: mínimo 2× (o la densidad de la pantalla); los componentes
  // pequeños se capturan a más resolución para que la imagen tenga al menos
  // ~1400 px de ancho y se lea bien en informes, PDF o PowerPoint. Con tope
  // para no exceder el tamaño máximo de lienzo del navegador.
  const anchoMedido = medirAnchoRealDelContenido(copia);
  const altoMedido = Math.max(1, copia.getBoundingClientRect().height);
  let ESCALA = Math.min(4, Math.max(2, window.devicePixelRatio || 1, 1400 / Math.max(1, anchoMedido)));
  ESCALA = Math.max(1, Math.min(ESCALA, 12000 / Math.max(1, anchoMedido), 14000 / Math.max(1, altoMedido)));
  let canvasContenido: HTMLCanvasElement;
  let textosManuales: TextoManual[];
  let especificacionLeyenda: { texto: string; color: string }[];

  try {
    // Etiquetar ANTES de ensanchar/capturar, para que el emparejamiento
    // copia->clon-de-html2canvas (ver congelarEstilosParaCaptura) sea por
    // identidad estable y no por posición en el árbol.
    const restaurarEtiquetas = etiquetarElementosParaCaptura(copia);
    const restaurarAnchos = ensancharTextosTruncados(copia);
    // Oculta las etiquetas/valores/aporte (data-export-texto) ANTES de
    // capturar — se dibujan aparte, directamente en el canvas, después, en
    // vez de dejar que html2canvas interprete y mida ese texto HTML.
    const { registros: textosManualesEncontrados, restaurar: restaurarTextos } = ocultarYRegistrarTextosManuales(copia);
    textosManuales = textosManualesEncontrados;

    // Oculta (en la COPIA, nunca en el DOM real) cualquier elemento
    // marcado a mano con data-ocultar-en-descarga — usado por componentes
    // puntuales que necesitan excluir contenido específico de la imagen
    // descargada (ej. los bloques de texto de "Comportamiento del
    // delito", ver ComportamientoDelDelito.tsx). Se hace ANTES de medir el
    // alto, para que medirAltoRealDelContenido calcule el alto ya SIN ese
    // espacio.
    const elementosOcultosManualmente = Array.from(copia.querySelectorAll<HTMLElement>('[data-ocultar-en-descarga]'));
    elementosOcultosManualmente.forEach((el) => { el.style.display = 'none'; });

    // Especificación de leyenda "para exportación" (ver TrendChart.tsx): si
    // el componente trae elementos [data-export-leyenda-item], se dibuja una
    // leyenda propia sobre el canvas final (más abajo) en vez de depender de
    // la leyenda nativa de Recharts — que se posiciona con cálculos
    // absolutos pensados para el tamaño en pantalla y no se adapta de forma
    // confiable al canvas de exportación (texto cortado, mal distribuido).
    const especificacionLeyendaEncontrada = Array.from(copia.querySelectorAll<HTMLElement>('[data-export-leyenda-item]'))
      .map((el) => ({ texto: el.textContent?.trim() ?? '', color: el.getAttribute('data-color') ?? '#334155' }))
      .filter((it) => it.texto.length > 0);
    especificacionLeyenda = especificacionLeyendaEncontrada;
    if (especificacionLeyenda.length > 0) {
      copia.querySelectorAll<HTMLElement>('.recharts-legend-wrapper').forEach((el) => { el.style.display = 'none'; });
    }

    // Se le pasa a html2canvas el alto/ancho REAL medido justo antes de
    // capturar, en vez de dejar que lo adivine solo — sin esto, la última
    // fila de listas o tablas largas podía quedar recortada.
    //
    // "scrollHeight" resultó NO ser confiable para esto: en tablas con
    // esquinas redondeadas en la última fila (rounded-bl-lg/rounded-br-lg,
    // ej. la fila TOTAL de "Casos por estación") y border-spacing propio,
    // scrollHeight puede reportar un valor menor al alto realmente
    // renderizado — por más margen fijo que se le sume encima, seguía
    // quedando corto. En su lugar, se mide el punto más bajo REAL entre
    // TODOS los elementos dentro del contenido (getBoundingClientRect().bottom
    // de cada uno), que es la única medición que refleja exactamente dónde
    // termina el contenido visible sin importar cómo esté armado por dentro
    // (tabla, grid, flex, con o sin bordes redondeados).
    function medirAltoRealDelContenido(raiz: HTMLElement): number {
      const rectRaiz = raiz.getBoundingClientRect();
      let maxAbajo = rectRaiz.height;
      raiz.querySelectorAll<HTMLElement>('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        let abajoRelativo = rect.bottom - rectRaiz.top;
        // getBoundingClientRect() NUNCA incluye el "box-shadow" (solo refleja
        // la caja de borde) — pero html2canvas sí lo pinta. Una tarjeta con
        // sombra (shadow-sm, shadow-md, etc — casi todas la tienen) se
        // extiende unos píxeles más abajo de lo que esta medición reportaría
        // sin este ajuste, y esos píxeles quedaban recortados en la imagen.
        const sombra = window.getComputedStyle(el).boxShadow;
        if (sombra && sombra !== 'none') {
          // "boxShadow" puede traer varias sombras separadas por coma; se
          // toma el offsetY + blur + spread más grande de todas (offset-x,
          // offset-y, blur, spread — en ese orden — de cada una).
          for (const capa of sombra.split(/,(?![^(]*\))/)) {
            const valores = capa.trim().match(/(-?\d+(?:\.\d+)?)px/g);
            if (valores && valores.length >= 3) {
              const offsetY = parseFloat(valores[1]);
              const blur = parseFloat(valores[2]);
              const spread = valores[3] ? parseFloat(valores[3]) : 0;
              abajoRelativo = Math.max(abajoRelativo, rect.bottom - rectRaiz.top + offsetY + blur + spread);
            }
          }
        }
        if (abajoRelativo > maxAbajo) maxAbajo = abajoRelativo;
      });
      return Math.ceil(maxAbajo);
    }
    // Margen de seguridad más generoso que antes (10 → 24px): entre el
    // redondeo de "boxShadow" de arriba y pequeñas diferencias de
    // renderizado entre el DOM real y el clon que arma html2canvas, un
    // colchón más amplio es la forma más confiable de nunca volver a
    // recortar el final de ningún componente descargable.
    const MARGEN_SEGURIDAD_PX = 24;
    const alturaReal = medirAltoRealDelContenido(copia) + MARGEN_SEGURIDAD_PX;
    const anchoReal = medirAnchoRealDelContenido(copia) + 4;
    canvasContenido = await html2canvas(copia, {
      // null (en vez de blanco) para que la imagen exportada tenga fondo
      // null = fondo transparente real (RGBA), a pedido explícito — el
      // archivo se verificó correcto píxel por píxel (sin fugas de negro
      // en los bordes), así que se restaura la transparencia real en vez
      // del blanco sólido usado temporalmente.
      backgroundColor: null,
      scale: ESCALA,
      useCORS: true,
      height: alturaReal,
      width: anchoReal,
      windowHeight: alturaReal,
      windowWidth: anchoReal,
      onclone: (doc, clonado) => {
        // congelarEstilosParaCaptura reemplaza el atributo "style" de cada
        // elemento del clon por su estilo YA CALCULADO de la copia (que
        // nunca está oculta) — si se ocultara la cuadrícula ANTES de esa
        // función, ese cambio se perdería al pisarse el "style". Por eso se
        // marca ANTES (con un atributo, que sí sobrevive) y se oculta
        // DESPUÉS de que el estilo ya quedó congelado.
        clonado.querySelectorAll('.recharts-cartesian-grid').forEach((n) => n.setAttribute('data-ocultar-en-descarga', '1'));
        congelarEstilosParaCaptura(copia, clonado);
        doc.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => n.remove());
        // Las líneas de la cuadrícula de fondo (Recharts CartesianGrid) son
        // útiles en pantalla para leer valores, pero en la imagen exportada
        // se ven como rayas sueltas sin ese contexto interactivo.
        clonado.querySelectorAll('[data-ocultar-en-descarga]').forEach((n) => ((n as HTMLElement).style.display = 'none'));
      },
    });
    // No hace falta "restaurar" nada — la COPIA es la única que se tocó en
    // todo este proceso; el componente real, siempre intacto, ni se
    // enteró. Solo queda sacar la copia del documento.
    restaurarAnchos();
    restaurarEtiquetas();
    restaurarTextos();
  } finally {
    copia.remove();
  }

  // Los textos manuales (etiquetas, valores, aporte) se dibujan más abajo,
  // sobre el canvas FINAL — ver justo antes de "return canvasFinal".

  const relleno = Math.round(10 * ESCALA);
  // Título (y subtítulo) partidos en líneas según el ancho real de la imagen
  // — nunca se salen por los lados aunque sean más largos que el componente.
  const ctxTitulo = document.createElement('canvas').getContext('2d')!;
  const FUENTE_TITULO = `700 ${Math.round(15 * ESCALA)}px Inter, system-ui, sans-serif`;
  const FUENTE_SUBTITULO = `400 ${Math.round(11.5 * ESCALA)}px Inter, system-ui, sans-serif`;
  const anchoTexto = Math.max(canvasContenido.width, 200 * ESCALA);
  ctxTitulo.font = FUENTE_TITULO;
  const lineasTitulo = titulo ? partirEnLineas(ctxTitulo, titulo, anchoTexto) : [];
  ctxTitulo.font = FUENTE_SUBTITULO;
  const lineasSubtitulo = opciones.subtitulo ? partirEnLineas(ctxTitulo, opciones.subtitulo, anchoTexto) : [];
  const ALTO_LINEA_TITULO = Math.round(21 * ESCALA);
  const ALTO_LINEA_SUBTITULO = Math.round(16 * ESCALA);
  const altoTitulo = lineasTitulo.length * ALTO_LINEA_TITULO + lineasSubtitulo.length * ALTO_LINEA_SUBTITULO
    + (lineasTitulo.length + lineasSubtitulo.length > 0 ? Math.round(8 * ESCALA) : 0);

  // Leyenda propia (solo si el componente trajo especificacionLeyenda):
  // se calcula el ancho real de cada texto con measureText (nunca un ancho
  // fijo supuesto) para poder distribuir los elementos de forma uniforme,
  // centrada, y ajustar el alto del canvas exactamente a lo que ocupen —
  // incluyendo el caso de que no quepan todos en una sola línea (se pasa a
  // una segunda línea, en vez de cortar o superponer texto).
  const FUENTE_LEYENDA = `600 ${13 * ESCALA}px system-ui, sans-serif`;
  const DIAMETRO_PUNTO = 11 * ESCALA;
  const ESPACIO_PUNTO_TEXTO = 7 * ESCALA;
  const ESPACIO_ENTRE_ITEMS = 26 * ESCALA;
  const ALTO_POR_LINEA = 24 * ESCALA;
  const ctxMedicion = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  ctxMedicion.font = FUENTE_LEYENDA;
  const itemsConAncho = especificacionLeyenda.map((it) => ({
    ...it,
    anchoTotal: DIAMETRO_PUNTO + ESPACIO_PUNTO_TEXTO + ctxMedicion.measureText(it.texto).width,
  }));
  const anchoDisponibleLeyenda = canvasContenido.width; // mismo ancho que el contenido ya capturado
  const lineasLeyenda: (typeof itemsConAncho)[] = [];
  let anchoLineaActual = 0;
  for (const it of itemsConAncho) {
    const necesitaSeparador = lineasLeyenda.length > 0 && lineasLeyenda[lineasLeyenda.length - 1].length > 0;
    const anchoConSeparador = it.anchoTotal + (necesitaSeparador ? ESPACIO_ENTRE_ITEMS : 0);
    if (lineasLeyenda.length === 0 || (anchoLineaActual + anchoConSeparador > anchoDisponibleLeyenda && lineasLeyenda[lineasLeyenda.length - 1].length > 0)) {
      lineasLeyenda.push([it]);
      anchoLineaActual = it.anchoTotal;
    } else {
      lineasLeyenda[lineasLeyenda.length - 1].push(it);
      anchoLineaActual += anchoConSeparador;
    }
  }
  const altoLeyenda = especificacionLeyenda.length > 0 ? lineasLeyenda.length * ALTO_POR_LINEA + 10 * ESCALA : 0;

  const canvasFinal = document.createElement('canvas');
  canvasFinal.width = Math.max(canvasContenido.width, anchoTexto) + relleno * 2;
  canvasFinal.height = canvasContenido.height + altoTitulo + relleno * 2 + altoLeyenda;
  const ctx = canvasFinal.getContext('2d', { willReadFrequently: true })!;
  // Sin fillRect: el canvas queda transparente donde no se dibuje nada
  // encima (fondo transparente real, a pedido explícito) — el título y el
  // contenido capturado sí se pintan normalmente encima.
  if (lineasTitulo.length > 0 || lineasSubtitulo.length > 0) {
    // Centrado horizontal SOLO en la imagen descargada — en pantalla el
    // título sigue exactamente donde estaba; esto es un dibujo aparte sobre
    // el canvas final, que no toca el DOM real del dashboard.
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    let yTexto = relleno;
    ctx.fillStyle = '#10233f';
    ctx.font = FUENTE_TITULO;
    for (const linea of lineasTitulo) { ctx.fillText(linea, canvasFinal.width / 2, yTexto); yTexto += ALTO_LINEA_TITULO; }
    ctx.fillStyle = '#64748b';
    ctx.font = FUENTE_SUBTITULO;
    for (const linea of lineasSubtitulo) { ctx.fillText(linea, canvasFinal.width / 2, yTexto); yTexto += ALTO_LINEA_SUBTITULO; }
    ctx.textAlign = 'left';
  }
  const xContenido = Math.round((canvasFinal.width - canvasContenido.width) / 2);
  ctx.drawImage(canvasContenido, xContenido, altoTitulo + relleno);

  // Dibuja la leyenda propia, línea por línea, cada una centrada
  // horizontalmente respecto al ancho TOTAL de la imagen final — con el
  // punto de color de cada serie pegado a su nombre, tal como se pidió.
  if (lineasLeyenda.length > 0) {
    ctx.font = FUENTE_LEYENDA;
    ctx.textBaseline = 'middle';
    let yLinea = altoTitulo + relleno + canvasContenido.height + 10 * ESCALA + ALTO_POR_LINEA / 2;
    for (const linea of lineasLeyenda) {
      const anchoLinea = linea.reduce((acc, it, i) => acc + it.anchoTotal + (i > 0 ? ESPACIO_ENTRE_ITEMS : 0), 0);
      let x = (canvasFinal.width - anchoLinea) / 2;
      for (const it of linea) {
        const yPunto = yLinea;
        ctx.beginPath();
        ctx.arc(x + DIAMETRO_PUNTO / 2, yPunto, DIAMETRO_PUNTO / 2, 0, Math.PI * 2);
        ctx.fillStyle = it.color;
        ctx.fill();
        ctx.fillStyle = it.color;
        ctx.textAlign = 'left';
        ctx.fillText(it.texto, x + DIAMETRO_PUNTO + ESPACIO_PUNTO_TEXTO, yPunto + 0.5 * ESCALA);
        x += it.anchoTotal + ESPACIO_ENTRE_ITEMS;
      }
      yLinea += ALTO_POR_LINEA;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // Los textos manuales (etiquetas, valores, aporte) se dibujan sobre el
  // canvas FINAL (el mismo donde ya se dibuja el título arriba, que
  // funciona correctamente) — no sobre canvasContenido directamente, por
  // algún motivo que no se llegó a diagnosticar del todo (no arrojaba
  // ningún error, pero el texto no aparecía ahí). Se ajustan las
  // coordenadas sumando el mismo desplazamiento (relleno, altoTitulo) que
  // ya se usa para pegar canvasContenido en su lugar.
  if (textosManuales.length > 0) {
    dibujarTextosManuales(ctx, textosManuales, ESCALA, xContenido, altoTitulo + relleno);
  }
  // La escala usada viaja con el lienzo (la usa el PDF para calcular el tamaño de impresión).
  canvasFinal.dataset.escala = String(ESCALA);
  return canvasFinal;
}

export async function exportarHtmlComoImagen(elemento: HTMLElement, titulo: string | undefined, nombreArchivo: string, opciones: OpcionesExportacion = {}): Promise<void> {
  const canvasFinal = await capturarComponenteComoCanvas(elemento, titulo, opciones);
  const enlace = document.createElement('a');
  enlace.download = `${nombreArchivo}.png`;
  enlace.href = canvasFinal.toDataURL('image/png');
  enlace.click();
}

/**
 * Punto de entrada único para descargar cualquier componente como PNG.
 * (exportarHtmlComoImagen sigue existiendo con la misma firma de siempre.)
 */
export function exportarComponenteComoImagen(elemento: HTMLElement, opciones: OpcionesExportacion & { titulo?: string; nombreArchivo: string }): Promise<void> {
  return exportarHtmlComoImagen(elemento, opciones.titulo, opciones.nombreArchivo, { subtitulo: opciones.subtitulo });
}

// Exportación DEDICADA para el mapa (Georreferenciación) — separada del
// resto del dashboard a propósito. Las "tiles" del mapa base (imágenes de
// OpenStreetMap) llegan al navegador desde otro dominio; aunque se les pida
// CORS, algunos servidores/momentos no lo confirman, y ahí el lienzo queda
// "contaminado" — html2canvas entonces genera un PNG corrupto (justo el
// error "formato no compatible" que se reportó). La solución más confiable
// es simplemente NO intentar copiar esas imágenes de fondo al lienzo: se
// ignoran con "ignoreElements", y sí se capturan los polígonos, el mapa de
// calor y las etiquetas (que son SVG/HTML propios del dashboard, sin ese
// problema). El resultado sale con fondo gris liso en vez del mapa de
// calles — un cambio consciente para que la descarga SIEMPRE funcione.
// Recorta, de abajo hacia arriba, cualquier franja del lienzo que sea
// completamente uniforme (todo del mismo color, o transparente) — deja
// intacto todo lo que esté arriba de la primera fila con contenido real.
// Nunca asume ningún tamaño de antemano: revisa directamente los píxeles
// que sí se dibujaron.
function recortarFranjaInferiorVacia(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return canvas;
  const datos = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  function filaEsUniforme(y: number): boolean {
    const base = y * canvas.width * 4;
    const [r0, g0, b0, a0] = [datos[base], datos[base + 1], datos[base + 2], datos[base + 3]];
    for (let x = 1; x < canvas.width; x++) {
      const i = base + x * 4;
      if (datos[i] !== r0 || datos[i + 1] !== g0 || datos[i + 2] !== b0 || datos[i + 3] !== a0) return false;
    }
    return true;
  }

  let ultimaFilaConContenido = canvas.height - 1;
  while (ultimaFilaConContenido > 0 && filaEsUniforme(ultimaFilaConContenido)) {
    ultimaFilaConContenido--;
  }

  const nuevoAlto = ultimaFilaConContenido + 1;
  if (nuevoAlto >= canvas.height) return canvas; // no había nada que recortar

  const recortado = document.createElement('canvas');
  recortado.width = canvas.width;
  recortado.height = Math.max(1, nuevoAlto);
  recortado.getContext('2d', { willReadFrequently: true })!.drawImage(canvas, 0, 0);
  return recortado;
}

export async function exportarMapaComoImagen(
  elemento: HTMLElement,
  nombreArchivo: string,
  etiquetas?: string[],
): Promise<void> {
  const html2canvasMod = (await import('html2canvas')).default;
  asegurarCorreccionMetricasHtml2canvas();
  let canvas = await html2canvasMod(elemento, {
    backgroundColor: '#e5e7eb',
    scale: 1,
    useCORS: true,
    ignoreElements: (el) => el.classList?.contains('leaflet-tile') || el.classList?.contains('leaflet-tile-container'),
    onclone: (doc, clonado) => {
      congelarEstilosParaCaptura(elemento, clonado);
      doc.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => n.remove());
    },
  });

  // Recorta cualquier franja vacía sobrante ABAJO del contenido real —
  // revisando los píxeles de verdad (no adivinando ningún tamaño). Se
  // recorre el lienzo de abajo hacia arriba; mientras una fila completa
  // sea del mismo color de fondo (o transparente), se descarta; se
  // detiene en la primera fila que sí tenga algo distinto pintado encima
  // (calles, polígonos, mapa de calor, etc.).
  canvas = recortarFranjaInferiorVacia(canvas);

  // Las etiquetas (una por delito, con su cantidad) se dibujan DIRECTO sobre
  // el lienzo ya capturado — quedan grabadas en el PNG final, no son un
  // elemento HTML aparte que se pueda perder.
  if (etiquetas && etiquetas.length > 0) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const tamanoFuente = 13;
      const alturaLinea = 19;
      const paddingX = 14;
      const paddingY = 10;
      ctx.font = `bold ${tamanoFuente}px Arial`;
      const anchoMaximoTexto = maxDe(etiquetas.map((t) => ctx.measureText(t).width));
      const anchoCaja = anchoMaximoTexto + paddingX * 2;
      const altoCaja = paddingY * 2 + alturaLinea * etiquetas.length;
      const margen = 10;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(margen, margen, anchoCaja, altoCaja);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      etiquetas.forEach((texto, i) => {
        ctx.fillText(texto, margen + paddingX, margen + paddingY + alturaLinea * i + alturaLinea / 2);
      });
    }
  }

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (err) {
    console.error('[exportarMapaComoImagen] El lienzo del mapa quedó bloqueado (canvas "tainted"):', err);
    throw new Error('No fue posible generar la imagen del mapa (el lienzo quedó bloqueado por el navegador).');
  }
  const enlace = document.createElement('a');
  enlace.download = `${nombreArchivo}.png`;
  enlace.href = dataUrl;
  enlace.click();
}
