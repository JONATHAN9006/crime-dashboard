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
      if (nombre === 'font-weight' && !truncadoQueDesborda) {
        textoEstilo += 'font-weight:700;';
        continue;
      }
      if (nombre === 'font-size' && !truncadoQueDesborda) {
        const pxOriginal = parseFloat(estilo.getPropertyValue('font-size'));
        const pxNuevo = Number.isFinite(pxOriginal) ? pxOriginal * 1.08 : pxOriginal;
        textoEstilo += `font-size:${pxNuevo}px;`;
        continue;
      }
      // Al agrandar la letra (arriba) sin tocar "height", el texto más
      // grande ya no cabía dentro del alto YA CONGELADO en píxeles (el que
      // tenía con la letra más chica) — y como "overflow" también se
      // copia, el exceso se recortaba por arriba, justo el problema
      // reportado. Se omite "height" para estos elementos (nunca son la
      // barra ni su contenedor, que sí necesitan un alto fijo): así el
      // texto agrandado define su propio alto natural en vez de quedar
      // encajado a la fuerza en uno más chico.
      if ((nombre === 'height' || nombre === 'min-height') && !truncadoQueDesborda && !esContenedorDeBarra && !dentroDeBarra) {
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
      const ctx = canvas.getContext('2d')!;
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
  const candidatosScroll = [raiz, ...Array.from(raiz.querySelectorAll<HTMLElement>('*'))].filter((el) => {
    const estilo = window.getComputedStyle(el);
    return (estilo.overflowX === 'auto' || estilo.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  });
  const ANCHO_MINIMO_TABLA = 620;
  const tablasAngostas = Array.from(raiz.querySelectorAll<HTMLTableElement>('table')).filter(
    (t) => t.getBoundingClientRect().width < ANCHO_MINIMO_TABLA,
  );
  const candidatos = [...candidatosScroll, ...tablasAngostas];
  const originales = candidatos.map((el) => ({
    el,
    width: el.style.width,
    maxWidth: el.style.maxWidth,
    minWidth: el.style.minWidth,
    overflow: el.style.overflow,
    overflowX: el.style.overflowX,
  }));
  candidatosScroll.forEach((el) => {
    // Se usa el ancho YA MEDIDO en píxeles (scrollWidth), no la palabra
    // clave CSS "max-content" — en una tabla, pedirle al navegador que
    // calcule "max-content" puede disparar un recálculo de layout que en
    // ciertas combinaciones (columnas con ancho en %, tablas anidadas)
    // termina en un ancho absurdamente grande, produciendo un canvas roto.
    // El valor medido es un número concreto y ya sabemos que es el
    // correcto (es justamente lo que scrollWidth acababa de reportar).
    el.style.width = `${el.scrollWidth}px`;
    el.style.maxWidth = 'none';
    el.style.overflowX = 'visible';
    el.style.overflow = 'visible';
  });
  tablasAngostas.forEach((t) => {
    t.style.width = `${ANCHO_MINIMO_TABLA}px`;
    t.style.minWidth = `${ANCHO_MINIMO_TABLA}px`;
  });
  return () => {
    originales.forEach(({ el, width, maxWidth, minWidth, overflow, overflowX }) => {
      el.style.width = width;
      el.style.maxWidth = maxWidth;
      el.style.minWidth = minWidth;
      el.style.overflow = overflow;
      el.style.overflowX = overflowX;
    });
  };
}

/**
 * Núcleo de captura reutilizado tanto por la descarga en PNG como por la
 * generación de PDF — así ambas rutas comparten EXACTAMENTE la misma
 * lógica (fondo transparente real, sin cuadrícula de fondo, sin texto
 * truncado, alto/ancho medidos con margen de seguridad) en vez de mantener
 * dos implementaciones distintas que puedan desincronizarse.
 */
export async function capturarComponenteComoCanvas(elemento: HTMLElement, titulo: string | undefined): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;
  // Etiquetar ANTES de ensanchar/capturar, para que el emparejamiento
  // original->clon (ver congelarEstilosParaCaptura) sea por identidad
  // estable y no por posición en el árbol.
  const restaurarEtiquetas = etiquetarElementosParaCaptura(elemento);
  const restaurarAnchos = ensancharTextosTruncados(elemento);
  // Oculta las etiquetas/valores/aporte (data-export-texto) ANTES de
  // capturar — se dibujan aparte, directamente en el canvas, después, en
  // vez de dejar que html2canvas interprete y mida ese texto HTML.
  const { registros: textosManuales, restaurar: restaurarTextos } = ocultarYRegistrarTextosManuales(elemento);

  // Oculta, en el DOM REAL (temporalmente, con flash breve durante la
  // captura — el mismo compromiso que ya asume ensancharTextosTruncados),
  // cualquier elemento marcado a mano con data-ocultar-en-descarga —
  // usado por componentes puntuales que necesitan excluir contenido
  // específico de la imagen descargada (ej. los bloques de texto de
  // "Comportamiento del delito", ver ComportamientoDelDelito.tsx). Se hace
  // sobre el DOM real, ANTES de medir el alto, para que
  // medirAltoRealDelContenido calcule el alto ya SIN ese espacio — si solo
  // se ocultara en el clon (como la cuadrícula, más abajo), la altura
  // reservada quedaría de más y la imagen exportada tendría un hueco vacío
  // al final.
  const elementosOcultosManualmente = Array.from(elemento.querySelectorAll<HTMLElement>('[data-ocultar-en-descarga]'));
  const displaysOriginales = elementosOcultosManualmente.map((el) => el.style.display);
  elementosOcultosManualmente.forEach((el) => { el.style.display = 'none'; });
  const restaurarOcultamientoManual = () => {
    elementosOcultosManualmente.forEach((el, i) => { el.style.display = displaysOriginales[i]; });
  };

  // Especificación de leyenda "para exportación" (ver TrendChart.tsx): si
  // el componente trae elementos [data-export-leyenda-item], se dibuja una
  // leyenda propia sobre el canvas final (más abajo) en vez de depender de
  // la leyenda nativa de Recharts — que se posiciona con cálculos
  // absolutos pensados para el tamaño en pantalla y no se adapta de forma
  // confiable al canvas de exportación (texto cortado, mal distribuido).
  // Por eso, cuando existe esta especificación, la leyenda nativa
  // (".recharts-legend-wrapper") se oculta SOLO durante la captura — nunca
  // en pantalla — igual que los bloques de arriba.
  const especificacionLeyenda = Array.from(elemento.querySelectorAll<HTMLElement>('[data-export-leyenda-item]'))
    .map((el) => ({ texto: el.textContent?.trim() ?? '', color: el.getAttribute('data-color') ?? '#334155' }))
    .filter((it) => it.texto.length > 0);
  const wrappersLeyendaNativa = especificacionLeyenda.length > 0
    ? Array.from(elemento.querySelectorAll<HTMLElement>('.recharts-legend-wrapper'))
    : [];
  const displaysLeyendaOriginales = wrappersLeyendaNativa.map((el) => el.style.display);
  wrappersLeyendaNativa.forEach((el) => { el.style.display = 'none'; });
  const restaurarLeyendaNativa = () => {
    wrappersLeyendaNativa.forEach((el, i) => { el.style.display = displaysLeyendaOriginales[i]; });
  };

  const ESCALA = 2;
  let canvasContenido: HTMLCanvasElement;
  try {
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
    const alturaReal = medirAltoRealDelContenido(elemento) + MARGEN_SEGURIDAD_PX;
    const anchoReal = Math.ceil(elemento.scrollWidth) + 4;
    canvasContenido = await html2canvas(elemento, {
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
        // elemento del clon por su estilo YA CALCULADO del original (que
        // nunca está oculto) — si se ocultara la cuadrícula ANTES de esa
        // función, ese cambio se perdería al pisarse el "style". Por eso se
        // marca ANTES (con un atributo, que sí sobrevive) y se oculta
        // DESPUÉS de que el estilo ya quedó congelado.
        clonado.querySelectorAll('.recharts-cartesian-grid').forEach((n) => n.setAttribute('data-ocultar-en-descarga', '1'));
        congelarEstilosParaCaptura(elemento, clonado);
        doc.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => n.remove());
        // Las líneas de la cuadrícula de fondo (Recharts CartesianGrid) son
        // útiles en pantalla para leer valores, pero en la imagen exportada
        // se ven como rayas sueltas sin ese contexto interactivo.
        clonado.querySelectorAll('[data-ocultar-en-descarga]').forEach((n) => ((n as HTMLElement).style.display = 'none'));
      },
    });
  } finally {
    // Se revierte siempre, incluso si algo falla a mitad de la captura —
    // nunca debe quedar un cambio de ancho visible en pantalla, ni las
    // etiquetas temporales de emparejamiento, ni los elementos ocultados a
    // mano para esta descarga en particular.
    restaurarAnchos();
    restaurarEtiquetas();
    restaurarTextos();
    restaurarOcultamientoManual();
    restaurarLeyendaNativa();
  }

  // Los textos manuales (etiquetas, valores, aporte) se dibujan más abajo,
  // sobre el canvas FINAL — ver justo antes de "return canvasFinal".

  const altoTitulo = titulo ? 40 : 0;
  const relleno = 16;

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
  const ctxMedicion = document.createElement('canvas').getContext('2d')!;
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
  canvasFinal.width = canvasContenido.width + relleno * 2;
  canvasFinal.height = canvasContenido.height + altoTitulo + relleno * 2 + altoLeyenda;
  const ctx = canvasFinal.getContext('2d')!;
  // Sin fillRect: el canvas queda transparente donde no se dibuje nada
  // encima (fondo transparente real, a pedido explícito) — el título y el
  // contenido capturado sí se pintan normalmente encima.
  if (titulo) {
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    // Centrado horizontal SOLO en la imagen descargada — en pantalla el
    // título sigue exactamente donde estaba (alineado a la izquierda,
    // junto a sus botones); esto es un dibujo aparte, hecho a mano sobre
    // el canvas final, que no toca el DOM real del dashboard en absoluto.
    ctx.textAlign = 'center';
    ctx.fillText(titulo, canvasFinal.width / 2, relleno);
    ctx.textAlign = 'left';
  }
  ctx.drawImage(canvasContenido, relleno, altoTitulo + relleno);

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
    dibujarTextosManuales(ctx, textosManuales, ESCALA, relleno, altoTitulo + relleno);
  }
  return canvasFinal;
}

export async function exportarHtmlComoImagen(elemento: HTMLElement, titulo: string | undefined, nombreArchivo: string): Promise<void> {
  const canvasFinal = await capturarComponenteComoCanvas(elemento, titulo);
  const enlace = document.createElement('a');
  enlace.download = `${nombreArchivo}.png`;
  enlace.href = canvasFinal.toDataURL('image/png');
  enlace.click();
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
export async function exportarMapaComoImagen(elemento: HTMLElement, nombreArchivo: string, etiquetas?: string[]): Promise<void> {
  const html2canvasMod = (await import('html2canvas')).default;
  const canvas = await html2canvasMod(elemento, {
    backgroundColor: '#e5e7eb',
    scale: 1,
    useCORS: true,
    ignoreElements: (el) => el.classList?.contains('leaflet-tile') || el.classList?.contains('leaflet-tile-container'),
    onclone: (doc, clonado) => {
      // MISMA corrección que ya usa el resto del dashboard (ver
      // capturarComponenteComoCanvas más abajo): html2canvas no entiende
      // los colores modernos que usa Tailwind (oklab/oklch/color-mix, ej.
      // en clases como "bg-white/95") y truena con el error real que se
      // encontró: "Attempting to parse an unsupported color function
      // oklab". Se reemplaza el estilo de cada elemento por su color YA
      // CALCULADO por el navegador (nunca en oklab) y se quitan las hojas
      // de estilo del clon para que html2canvas no vuelva a toparse con
      // esas clases directamente.
      congelarEstilosParaCaptura(elemento, clonado);
      doc.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => n.remove());
    },
  });

  // Las etiquetas (una por delito, con su cantidad) se dibujan DIRECTO sobre
  // el lienzo ya capturado — quedan grabadas en el PNG final, no son un
  // elemento HTML aparte que se pueda perder.
  if (etiquetas && etiquetas.length > 0) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const tamanoFuente = 13;
      const alturaLinea = 19;
      const paddingX = 14;
      const paddingY = 10;
      ctx.font = `bold ${tamanoFuente}px Arial`;
      const anchoMaximoTexto = Math.max(...etiquetas.map((t) => ctx.measureText(t).width));
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
