import { MESES_NOMBRES } from './aggregations';

// Funciones de análisis de tendencia — todas puras y basadas exclusivamente
// en los datos que reciben. Ninguna conclusión está escrita de antemano:
// todo el texto se arma a partir de los resultados numéricos.

// Margen dentro del cual una variación se considera "sin cambio
// significativo" — declarado aquí, en un solo lugar, para que sea
// verificable y ajustable.
export const MARGEN_ESTABILIDAD_PCT = 3; // puntos porcentuales

function formatearEntero(n: number): string {
  return n.toLocaleString('es-CO');
}

export interface ResultadoTendenciaGeneral {
  clasificacion: 'baja' | 'alza' | 'estable';
  metodologia: 'polinomio_grado_2' | 'insuficiente';
  detalle: string;
  // Máximo y mínimo REALES del periodo (2025 y 2026 combinados) — nunca un
  // valor del eje ni una coordenada inventada, siempre un dato observado.
  maximoMes: string | null;
  maximoValor: number | null;
  minimoMes: string | null;
  minimoValor: number | null;
  // Compatibilidad con el resto del código (useAnalisisMensual): se
  // mantiene igual al máximo real, que sigue siendo el dato de referencia
  // que se muestra junto a "Máximo del periodo".
  anchorMes: string | null;
  anchorValor: number | null;
  // Línea de tendencia: los valores de la PARÁBOLA (polinomio de grado 2)
  // ajustada por mínimos cuadrados a los datos reales, evaluada ÚNICAMENTE
  // entre el primer y el último mes con dato real — nunca antes ni después
  // de ese rango (null fuera de él, para que la línea no se dibuje ahí).
  lineaTendencia: (number | null)[];
  // Coeficientes de la parábola (y = a·x² + b·x + c, x = índice del mes
  // dentro de la serie completa) — se usan para poder extrapolar la
  // PROYECCIÓN hacia los meses futuros sin dato real, continuando la MISMA
  // curva ya ajustada (nunca una recta aparte ni una pendiente distinta).
  coeficientes: { a: number; b: number; c: number } | null;
}

interface PuntoAncho { indice: number; mes: string; valor: number }

/**
 * Construye, para cada mes con dato real de 2026 (y SOLO 2026 — 2025 no
 * participa en el cálculo de la tendencia, únicamente se muestra como
 * referencia comparativa), la lista de puntos reales disponibles. Es sobre
 * esta secuencia — nunca mezclada con 2025 — que se ajusta la parábola y se
 * identifican máximo/mínimo.
 */
function construirPuntosReales(serie: { mes: string; valor: number | null }[]): PuntoAncho[] {
  const puntos: PuntoAncho[] = [];
  serie.forEach((p, indice) => {
    if (p.valor === null || p.valor === undefined) return;
    puntos.push({ indice, mes: p.mes, valor: p.valor });
  });
  return puntos;
}

// Determinante de una matriz 3×3, para resolver el sistema de ecuaciones
// normales de la regresión cuadrática por Cramer.
function determinante3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/**
 * Ajuste polinómico de grado 2 (y = a·x² + b·x + c) por MÍNIMOS CUADRADOS —
 * el método estándar para ajustar una parábola a un conjunto de puntos
 * reales, resolviendo el sistema de ecuaciones normales por Cramer. Se
 * necesitan al menos 3 puntos para que la parábola tenga sentido (con
 * menos, el sistema queda indeterminado).
 */
function ajustarPolinomioGrado2(puntos: PuntoAncho[]): { a: number; b: number; c: number } | null {
  const n = puntos.length;
  if (n < 3) return null;
  let Sx1 = 0, Sx2 = 0, Sx3 = 0, Sx4 = 0, Sy0 = 0, Sxy = 0, Sx2y = 0;
  for (const p of puntos) {
    const x = p.indice;
    const y = p.valor;
    const x2 = x * x;
    Sx1 += x;
    Sx2 += x2;
    Sx3 += x2 * x;
    Sx4 += x2 * x2;
    Sy0 += y;
    Sxy += x * y;
    Sx2y += x2 * y;
  }
  const M = [[Sx4, Sx3, Sx2], [Sx3, Sx2, Sx1], [Sx2, Sx1, n]];
  const D = determinante3x3(M);
  if (Math.abs(D) < 1e-9) return null; // puntos degenerados (ej. todos el mismo mes)
  const a = determinante3x3([[Sx2y, Sx3, Sx2], [Sxy, Sx2, Sx1], [Sy0, Sx1, n]]) / D;
  const b = determinante3x3([[Sx4, Sx2y, Sx2], [Sx3, Sxy, Sx1], [Sx2, Sy0, n]]) / D;
  const c = determinante3x3([[Sx4, Sx3, Sx2y], [Sx3, Sx2, Sxy], [Sx2, Sx1, Sy0]]) / D;
  return { a, b, c };
}

/**
 * Determina la dirección general del comportamiento de 2026 a partir de una
 * TENDENCIA POLINÓMICA DE GRADO 2 (parábola) ajustada por mínimos
 * cuadrados a los datos reales — no una regresión lineal ni un ajuste
 * anclado a un solo punto. Se calcula EXCLUSIVAMENTE con los datos de
 * 2026 (o el año que se esté analizando como "actual"): 2025 nunca
 * participa en este cálculo, solo se muestra en la gráfica como
 * referencia comparativa frente a 2026.
 *
 * Metodología:
 * 1) Se toman los meses de 2026 con dato real (construirPuntosReales) — el
 *    máximo y el mínimo REALES del periodo se identifican directamente
 *    sobre estos datos, sin ningún cálculo adicional.
 * 2) Se ajusta la parábola y = a·x² + b·x + c por mínimos cuadrados sobre
 *    esos puntos reales de 2026 (quien llama a esta función ya se encarga
 *    de excluir el mes actual si todavía está incompleto — ver
 *    analizarTendenciaMensual).
 * 3) La línea a graficar es esa parábola evaluada ÚNICAMENTE entre el
 *    primer y el último mes con dato real — nunca fuera de ese rango.
 * 4) Para clasificar la dirección SIN reducirla a solo "primer mes vs.
 *    último mes": se ubica el vértice de la parábola (x* = -b/2a).
 *    - Si el vértice cae FUERA del rango de datos (o la parábola es casi
 *      recta, "a" ≈ 0), la curva es monótona en todo el periodo: se
 *      compara el valor ajustado al inicio contra el valor ajustado al
 *      final, con el mismo margen de estabilidad del resto del dashboard.
 *    - Si el vértice cae DENTRO del rango de datos, la curva realmente
 *      cambia de dirección durante el periodo observado: se evalúan por
 *      separado el tramo "inicio → vértice" y el tramo "vértice → final".
 *      Si ambos tramos muestran un cambio significativo en sentidos
 *      OPUESTOS, no hay una dirección única y el resultado es "estable /
 *      sin patrón definido" — nunca se fuerza una conclusión. Si solo uno
 *      de los dos tramos es significativo, esa es la dirección que manda.
 */
export function calcularTendenciaGeneral(serie: { mes: string; valor: number | null }[]): ResultadoTendenciaGeneral {
  const serieMaximos = construirPuntosReales(serie);
  const lineaVacia = serie.map(() => null);
  const vacio: ResultadoTendenciaGeneral = {
    clasificacion: 'estable', metodologia: 'insuficiente', detalle: '',
    maximoMes: null, maximoValor: null, minimoMes: null, minimoValor: null,
    anchorMes: null, anchorValor: null, lineaTendencia: lineaVacia, coeficientes: null,
  };
  if (serieMaximos.length === 0) return vacio;

  // Paso 1: máximo y mínimo REALES del periodo completo.
  const maximo = serieMaximos.reduce((mejor, actual) => (actual.valor > mejor.valor ? actual : mejor), serieMaximos[0]);
  const minimo = serieMaximos.reduce((peor, actual) => (actual.valor < peor.valor ? actual : peor), serieMaximos[0]);

  // Paso 2: ajuste de la parábola sobre TODOS los puntos reales.
  const coef = ajustarPolinomioGrado2(serieMaximos);
  if (!coef) {
    return {
      ...vacio,
      detalle: 'no hay suficientes meses con datos reales para ajustar una tendencia (se necesitan al menos 3)',
      maximoMes: maximo.mes, maximoValor: maximo.valor, minimoMes: minimo.mes, minimoValor: minimo.valor,
      anchorMes: maximo.mes, anchorValor: maximo.valor,
    };
  }
  const { a, b, c } = coef;
  const evaluar = (x: number) => a * x * x + b * x + c;

  // Paso 3: la línea solo existe entre el primer y el último mes real.
  const primerIndice = serieMaximos[0].indice;
  const ultimoIndice = serieMaximos[serieMaximos.length - 1].indice;
  const lineaTendencia = serie.map((_, i) => (i >= primerIndice && i <= ultimoIndice ? evaluar(i) : null));

  // Paso 4: dirección — vértice dentro o fuera del rango observado.
  const valorInicio = evaluar(primerIndice);
  const valorFinal = evaluar(ultimoIndice);
  const vertice = Math.abs(a) > 1e-9 ? -b / (2 * a) : null;
  const varianteEstable = (base: number, comparado: number) => {
    if (base === 0) return Math.abs(comparado) < 1e-9;
    return Math.abs(((comparado - base) / base) * 100) < MARGEN_ESTABILIDAD_PCT;
  };

  let clasificacion: ResultadoTendenciaGeneral['clasificacion'];
  let detalle: string;

  const verticeDentroDelRango = vertice !== null && vertice > primerIndice && vertice < ultimoIndice;

  if (!verticeDentroDelRango) {
    // Curva monótona (o prácticamente recta) en todo el periodo observado.
    if (varianteEstable(valorInicio, valorFinal)) {
      clasificacion = 'estable';
      detalle = 'la tendencia ajustada a los datos reales no muestra un cambio significativo entre el inicio y el final del periodo';
    } else if (valorFinal < valorInicio) {
      clasificacion = 'baja';
      detalle = `la tendencia ajustada a los datos reales muestra una reducción sostenida a lo largo de todo el periodo, desde ${formatearEntero(Math.round(valorInicio))} hasta ${formatearEntero(Math.round(valorFinal))} casos`;
    } else {
      clasificacion = 'alza';
      detalle = `la tendencia ajustada a los datos reales muestra un aumento sostenido a lo largo de todo el periodo, desde ${formatearEntero(Math.round(valorInicio))} hasta ${formatearEntero(Math.round(valorFinal))} casos`;
    }
  } else {
    // El vértice de la parábola cae DENTRO del periodo observado: el
    // comportamiento realmente cambia de dirección a mitad de camino.
    const valorVertice = evaluar(vertice!);
    const cambioPrimerTramo = varianteEstable(valorInicio, valorVertice) ? 0 : (valorVertice < valorInicio ? -1 : 1);
    const cambioSegundoTramo = varianteEstable(valorVertice, valorFinal) ? 0 : (valorFinal < valorVertice ? -1 : 1);

    if (cambioPrimerTramo === 0 && cambioSegundoTramo === 0) {
      clasificacion = 'estable';
      detalle = 'la tendencia ajustada a los datos reales se mantiene prácticamente plana durante todo el periodo, sin un cambio significativo';
    } else if (cambioPrimerTramo !== 0 && cambioSegundoTramo !== 0 && cambioPrimerTramo !== cambioSegundoTramo) {
      // Cambia de sentido de forma significativa en ambos tramos: no hay
      // una única dirección — se reporta el punto de inflexión real.
      clasificacion = 'estable';
      const formaTexto = cambioPrimerTramo < 0 ? 'una baja seguida de un alza' : 'un alza seguida de una baja';
      detalle = `el comportamiento no sigue una dirección única durante el periodo: la tendencia ajustada muestra ${formaTexto}, con un punto de inflexión real cerca de ${serie[Math.round(vertice!)]?.mes ?? 'la mitad del periodo'}`;
    } else {
      // Solo uno de los dos tramos es significativo — esa es la dirección.
      const direccionDominante = cambioPrimerTramo !== 0 ? cambioPrimerTramo : cambioSegundoTramo;
      clasificacion = direccionDominante < 0 ? 'baja' : 'alza';
      detalle = `la tendencia ajustada a los datos reales muestra un comportamiento ${clasificacion === 'baja' ? 'descendente' : 'ascendente'} predominante a lo largo del periodo, con un cambio menor de dirección que no alcanza a revertir esa tendencia general`;
    }
  }

  return {
    clasificacion, metodologia: 'polinomio_grado_2', detalle,
    maximoMes: maximo.mes, maximoValor: maximo.valor,
    minimoMes: minimo.mes, minimoValor: minimo.valor,
    anchorMes: maximo.mes, anchorValor: maximo.valor,
    lineaTendencia, coeficientes: coef,
  };
}

// --- Comparación año actual vs. año anterior, y proyección -----------------

export interface BloqueAnalisis {
  emoji: string;
  etiqueta: string; // encabezado corto, ej. "TENDENCIA A LA BAJA"
  texto: string; // explicación en una o dos frases, lenguaje sencillo
}

export interface AnalisisTendenciaMensual {
  disponible: boolean;
  // Curva anclada en los datos reales de 2026 — independiente de la
  // comparación contra el año anterior (ver "MUY IMPORTANTE — diferenciar
  // los tres conceptos": tendencia, comparación y proyección NUNCA se
  // mezclan, ni en el cálculo ni en el texto).
  tendenciaGeneral: ResultadoTendenciaGeneral;
  bloqueTendencia: BloqueAnalisis;
  // Comparación homóloga contra el año anterior — null solo cuando de
  // verdad no hay datos suficientes para compararla (nunca se inventa).
  variacionPct: number | null;
  bloqueComparacion: BloqueAnalisis | null;
  // Proyección de cierre, derivada de la comparación homóloga — lenguaje
  // siempre de ESTIMACIÓN ("si se mantiene", "se estima"), nunca como un
  // hecho consumado.
  proyeccionCierre: number | null;
  bloqueProyeccion: BloqueAnalisis | null;
  // Serie con la línea de tendencia añadida, lista para graficar (una key
  // "_tendencia" por mes, o null en los meses sin dato ajustado).
  serieConLineaTendencia: Record<string, any>[];
}

/**
 * Analiza el comportamiento del delito seleccionado: la curva ajustada a los
 * datos reales de 2026 por un lado, y la comparación contra el mismo corte
 * homólogo del año anterior por otro — son dos preguntas distintas
 * (TENDENCIA vs. COMPARACIÓN) y se responden en bloques separados, nunca
 * mezclados en una sola frase.
 */
export function analizarTendenciaMensual(
  serieAnioActual: { mes: string; casos: number }[],
  serieAnioAnterior: { mes: string; casos: number }[],
  cmp: { casosActual: number; casosAnterior: number; variacionPct: number | null; disponible: boolean },
  // Total del año anterior COMPLETO (ene-dic), distinto de cmp.casosAnterior
  // (que es el corte homólogo "a la fecha") — es la base real para
  // proyectar un cierre de año; usar el corte homólogo aquí sería una
  // tautología matemática (devolvería siempre el mismo total actual).
  totalAnioAnteriorCompleto: number,
  // Si el ÚLTIMO mes de serieAnioActual todavía está en curso (ej. el
  // periodo filtrado llega hasta el 19 de agosto, no hasta el 31), debe
  // llegar en false — ese mes se sigue mostrando como dato real en la
  // gráfica (serie 2026), pero se EXCLUYE del cálculo de la tendencia para
  // que un mes a medio terminar no distorsione la dirección detectada.
  ultimoMesEsCompleto: boolean = true,
  // Años reales de cada serie — solo para nombrarlos en el texto (ej. "A la
  // fecha, 2026 registra..."); nunca participan en ningún cálculo numérico.
  anioActual: number,
  anioAnterior: number,
): AnalisisTendenciaMensual {
  // La tendencia se calcula EXCLUSIVAMENTE con los datos de 2026 (el año
  // "actual") — 2025 nunca participa en este cálculo, solo se sigue
  // mostrando en la gráfica como referencia comparativa frente a 2026,
  // completamente aparte de la línea de tendencia. Se indexa por la
  // posición ABSOLUTA del mes en el calendario (0=Enero...11=Diciembre,
  // vía MESES_NOMBRES) y no por la posición relativa dentro de
  // serieAnioActual — así el índice "x" usado para ajustar la parábola es
  // el mismo que después se usa para proyectar hacia los meses futuros,
  // sin importar en qué mes empiece el periodo filtrado.
  const mapaActualPorMes = new Map(serieAnioActual.map((p) => [p.mes, p.casos]));
  const ultimoMesDeLaSerie = serieAnioActual.length > 0 ? serieAnioActual[serieAnioActual.length - 1].mes : null;
  const serieParaTendencia = MESES_NOMBRES.map((mes) => {
    const casos = mapaActualPorMes.get(mes) ?? null;
    const esElMesParcial = !ultimoMesEsCompleto && mes === ultimoMesDeLaSerie;
    return { mes, valor: esElMesParcial ? null : casos };
  });

  const tendenciaGeneral = calcularTendenciaGeneral(serieParaTendencia);

  // ── BLOQUE 1: TENDENCIA ──────────────────────────────────────────────
  // Lenguaje sencillo y directo (nunca "la tendencia ajustada a los datos
  // reales muestra un comportamiento..."): se arma directamente a partir
  // del máximo/mínimo real y la clasificación ya calculada arriba — la
  // clasificación en sí ya considera pendiente, vértice de la parábola y
  // cambios de dirección (ver calcularTendenciaGeneral); aquí solo se
  // redacta el resultado en frases claras.
  let bloqueTendencia: BloqueAnalisis;
  if (tendenciaGeneral.metodologia === 'insuficiente') {
    bloqueTendencia = {
      emoji: '🟡',
      etiqueta: 'SIN DATOS SUFICIENTES',
      texto: 'No hay suficientes meses con datos reales disponibles para establecer una tendencia (se necesitan al menos 3).',
    };
  } else {
    const { clasificacion, maximoMes, maximoValor, minimoMes, minimoValor } = tendenciaGeneral;
    let emoji: string;
    let etiqueta: string;
    let texto: string;
    if (clasificacion === 'baja') {
      emoji = '🟢';
      etiqueta = 'TENDENCIA A LA BAJA';
      texto = `Durante el periodo se observa un comportamiento general descendente. El máximo se registra en ${maximoMes} con ${formatearEntero(maximoValor!)} casos, y posteriormente se presenta una reducción hasta ${minimoMes}, con ${formatearEntero(minimoValor!)} casos.`;
    } else if (clasificacion === 'alza') {
      emoji = '🔴';
      etiqueta = 'TENDENCIA AL ALZA';
      texto = `Durante el periodo se observa un comportamiento general ascendente. El mínimo se registra en ${minimoMes} con ${formatearEntero(minimoValor!)} casos, y posteriormente se presenta un incremento hasta ${maximoMes}, con ${formatearEntero(maximoValor!)} casos.`;
    } else {
      emoji = '🟡';
      etiqueta = 'TENDENCIA ESTABLE / SIN PATRÓN DEFINIDO';
      texto = `Durante el periodo no se observa un patrón sostenido de aumento o disminución. El máximo se registra en ${maximoMes} con ${formatearEntero(maximoValor!)} casos y el mínimo en ${minimoMes} con ${formatearEntero(minimoValor!)} casos.`;
    }
    if (!ultimoMesEsCompleto && serieAnioActual.length > 0) {
      const mesParcial = serieAnioActual[serieAnioActual.length - 1].mes;
      texto += ` ${mesParcial} todavía está en curso: se muestra como dato real en la gráfica, pero no se usó para calcular esta tendencia.`;
    }
    bloqueTendencia = { emoji, etiqueta, texto };
  }

  // La línea se construye sobre la serie del año ACTUAL (2026) — se toma el
  // valor de "lineaTendencia" correspondiente a cada mes de
  // serieParaTendencia, mapeado de vuelta por nombre de mes. El mes parcial
  // (si lo hay) queda sin valor de tendencia (null), tal como se pidió.
  const mapaLineaPorMes = new Map(serieParaTendencia.map((p, i) => [p.mes, tendenciaGeneral.lineaTendencia[i] !== null ? Math.round(tendenciaGeneral.lineaTendencia[i]!) : null]));
  const serieConLineaTendencia: { mes: string; casos: number | null; _tendencia: number | null; _proyeccion?: number | null }[] = serieAnioActual.map((p) => ({
    ...p,
    _tendencia: mapaLineaPorMes.get(p.mes) ?? null,
  }));

  // Proyección: continúa la MISMA parábola ya ajustada (mismos
  // coeficientes a, b, c) hacia los meses del año que todavía no tienen
  // datos reales — nunca se mezcla con "Tendencia": esta representa
  // exclusivamente lo ya observado (evaluada solo entre el primer y el
  // último mes real), mientras que "Proyección" es explícitamente una
  // estimación hacia adelante, diferenciada en la leyenda y en el estilo de
  // línea. El primer punto de la proyección coincide exactamente con el
  // último punto real de la tendencia, para que ambas líneas se conecten
  // sin dejar un salto visual entre ellas.
  if (tendenciaGeneral.coeficientes !== null && serieAnioActual.length > 0) {
    const { a, b, c } = tendenciaGeneral.coeficientes;
    const ultimoMesConDato = [...serieConLineaTendencia].reverse().find((p) => p._tendencia !== null)?.mes ?? null;
    const indiceUltimoMesReal = ultimoMesConDato ? MESES_NOMBRES.indexOf(ultimoMesConDato) : -1;
    if (indiceUltimoMesReal >= 0 && indiceUltimoMesReal < MESES_NOMBRES.length - 1) {
      const posicionUltimoConDato = serieConLineaTendencia.findIndex((p) => p.mes === ultimoMesConDato);
      if (posicionUltimoConDato >= 0) serieConLineaTendencia[posicionUltimoConDato]._proyeccion = serieConLineaTendencia[posicionUltimoConDato]._tendencia;
      for (let mesIdx = indiceUltimoMesReal + 1; mesIdx < MESES_NOMBRES.length; mesIdx++) {
        const valorProyectado = a * mesIdx * mesIdx + b * mesIdx + c;
        serieConLineaTendencia.push({ mes: MESES_NOMBRES[mesIdx], casos: null, _tendencia: null, _proyeccion: Math.round(Math.max(0, valorProyectado)) });
      }
    }
  }

  // ── BLOQUE 2: COMPARACIÓN CON EL AÑO ANTERIOR ───────────────────────
  // Pregunta distinta a la tendencia ("¿cómo está 2026 frente a 2025?"),
  // nunca mezclada con el cálculo de la parábola de arriba.
  if (!cmp.disponible || cmp.casosAnterior === 0 || cmp.variacionPct === null) {
    return {
      disponible: false, tendenciaGeneral, bloqueTendencia,
      variacionPct: null, bloqueComparacion: null,
      proyeccionCierre: null, bloqueProyeccion: null, serieConLineaTendencia,
    };
  }

  const variacionPct = cmp.variacionPct;
  const veredicto: 'favorable' | 'desfavorable' | 'estable' =
    Math.abs(variacionPct) < MARGEN_ESTABILIDAD_PCT ? 'estable' : variacionPct < 0 ? 'favorable' : 'desfavorable';

  let bloqueComparacion: BloqueAnalisis;
  if (veredicto === 'estable') {
    bloqueComparacion = {
      emoji: '🟡',
      etiqueta: 'SIN CAMBIO SIGNIFICATIVO',
      texto: `A la fecha, ${anioActual} no presenta una diferencia significativa frente al mismo periodo de ${anioAnterior} (${variacionPct >= 0 ? '+' : ''}${variacionPct.toFixed(1)}%).`,
    };
  } else if (veredicto === 'favorable') {
    bloqueComparacion = {
      emoji: '🟢',
      etiqueta: `COMPARACIÓN CON ${anioAnterior}`,
      texto: `A la fecha, ${anioActual} registra un ${Math.abs(variacionPct).toFixed(1)}% menos de casos frente al mismo periodo de ${anioAnterior}.`,
    };
  } else {
    bloqueComparacion = {
      emoji: '🔴',
      etiqueta: `COMPARACIÓN CON ${anioAnterior}`,
      texto: `A la fecha, ${anioActual} registra un ${variacionPct.toFixed(1)}% más de casos frente al mismo periodo de ${anioAnterior}.`,
    };
  }

  // ── BLOQUE 3: PROYECCIÓN DE CIERRE ──────────────────────────────────
  // Tercera pregunta, también separada: "¿cómo podría terminar el año si
  // se mantiene el comportamiento actual?" — siempre en lenguaje de
  // estimación, nunca como un hecho.
  const proyeccionCierre = totalAnioAnteriorCompleto > 0 ? Math.round(totalAnioAnteriorCompleto * (1 + variacionPct / 100)) : null;
  const bloqueProyeccion: BloqueAnalisis | null = proyeccionCierre !== null ? {
    emoji: '💡',
    etiqueta: 'PROYECCIÓN',
    texto: `Si el comportamiento actual se mantiene, se estima un cierre aproximado de ${formatearEntero(proyeccionCierre)} casos en ${anioActual}.`,
  } : null;

  return {
    disponible: true, tendenciaGeneral, bloqueTendencia, variacionPct,
    bloqueComparacion, proyeccionCierre, bloqueProyeccion, serieConLineaTendencia,
  };
}

// --- Mes más afectado y prioridad (Tendencia Diaria) — sin cambios --------

export interface MesAfectado {
  mes: string;
  casos: number;
  proporcionPct: number;
}

/**
 * Identifica, entre los meses seleccionados, cuál concentra más casos —
 * junto con la proporción que representa sobre el total del periodo
 * seleccionado (dato real, no una suposición).
 */
export function identificarMesMasAfectado(porMes: { mesNombre: string; casos: number }[]): MesAfectado | null {
  if (porMes.length === 0) return null;
  const total = porMes.reduce((a, p) => a + p.casos, 0);
  if (total === 0) return null;
  const max = porMes.reduce((a, b) => (b.casos > a.casos ? b : a));
  return { mes: max.mesNombre, casos: max.casos, proporcionPct: (max.casos / total) * 100 };
}

/**
 * Genera la recomendación de prioridad para el mes más afectado. Solo
 * menciona "comportamiento recurrente" si efectivamente se le pasan datos
 * del mismo mes en la vigencia anterior que lo respalden — nunca lo afirma
 * sin esa evidencia.
 */
export function generarPrioridad(mesAfectado: MesAfectado, casosMismoMesAnioAnterior: number | null): string {
  const base = `🎯 ${mesAfectado.mes} se identifica como el mes prioritario para la próxima vigencia debido a que concentra la mayor cantidad de casos dentro del periodo analizado (${mesAfectado.proporcionPct.toFixed(0)}% del total del periodo seleccionado)`;
  if (casosMismoMesAnioAnterior !== null && casosMismoMesAnioAnterior > 0 && mesAfectado.casos >= casosMismoMesAnioAnterior) {
    return `${base}, y presenta un comportamiento recurrente frente a la vigencia anterior (${formatearEntero(casosMismoMesAnioAnterior)} casos en el mismo mes).`;
  }
  return `${base}.`;
}

/**
 * Compara el mes más afectado de un periodo contra el mismo periodo del año
 * anterior — para saber si existe correlación (el mismo mes se repite como
 * el más crítico en ambos años) o si hay una diferencia real entre ellos.
 * Solo se usa con datos reales de ambos años; nunca se inventa una
 * comparación si falta alguno de los dos periodos.
 */
export function compararMesMasAfectadoEntreAnios(
  mesActual: MesAfectado,
  porMesAnioAnterior: { mesNombre: string; casos: number }[],
): string | null {
  const mesAnteriorMasAfectado = identificarMesMasAfectado(porMesAnioAnterior);
  if (!mesAnteriorMasAfectado) return null;
  if (mesAnteriorMasAfectado.mes === mesActual.mes) {
    return `📊 Comparado con el año anterior: ${mesAnteriorMasAfectado.mes} también fue el mes más afectado en ese periodo (${formatearEntero(mesAnteriorMasAfectado.casos)} casos) — hay correlación entre ambos años, el mismo mes se repite como el más crítico.`;
  }
  return `📊 Comparado con el año anterior: el mes más afectado fue ${mesAnteriorMasAfectado.mes} (${formatearEntero(mesAnteriorMasAfectado.casos)} casos), distinto al mes más crítico de este periodo (${mesActual.mes}) — hay una diferencia entre los meses más afectados de cada año.`;
}
