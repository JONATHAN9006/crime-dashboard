import type { CrimeRecord } from '../types/crime';

// ---------------------------------------------------------------------------
// MOTOR DE PRONÓSTICO ESPACIO-TEMPORAL — metodología estadística explícita y
// reproducible, NO una IA generativa "adivinando" en texto libre.
//
// Idea central (la misma que usa cualquier análisis de "hotspot" policial
// serio, tipo predictive policing basado en frecuencias históricas): un
// patrón espacio-temporal real se manifiesta como una CONCENTRACIÓN por
// encima de lo esperado si los casos se repartieran uniformemente entre
// zonas, días de la semana y franjas horarias. Se mide, se exige evidencia
// mínima, y se valida contra el futuro real (backtesting) antes de mostrar
// nada como "pronóstico".
//
// Por qué NO hay Random Forest/XGBoost/LSTM aquí: con los volúmenes reales
// de este dashboard (unos pocos miles de casos por año, repartidos entre
// ~15 delitos y ~10-20 zonas), la mayoría de combinaciones delito+zona+
// día+franja tiene MUY pocos casos históricos — a veces 0, rara vez más de
// 20-30. Un modelo de deep learning necesita órdenes de magnitud más datos
// para no memorizar ruido; entrenarlo aquí solo daría una ilusión de
// sofisticación sin mejorar (y probablemente empeorando) la fiabilidad real
// frente a un conteo de frecuencias bien hecho y validado. Esto es
// exactamente lo que pide la metodología: "no implementar Deep Learning
// solamente para decir que existe IA" si el histórico no lo justifica.
// ---------------------------------------------------------------------------

export type DimensionZona = 'estacion' | 'cai' | 'cuadrante';
export type Horizonte = 24 | 48 | 72 | 168; // horas — 168 = 7 días

// 6 franjas de 4 horas, alineadas a las 00:00 — reproducibles y estables
// (no dependen de a qué hora se generó el reporte).
const FRANJAS: { etiqueta: string; desde: number; hasta: number }[] = [
  { etiqueta: '00:00–04:00', desde: 0, hasta: 4 },
  { etiqueta: '04:00–08:00', desde: 4, hasta: 8 },
  { etiqueta: '08:00–12:00', desde: 8, hasta: 12 },
  { etiqueta: '12:00–16:00', desde: 12, hasta: 16 },
  { etiqueta: '16:00–20:00', desde: 16, hasta: 20 },
  { etiqueta: '20:00–00:00', desde: 20, hasta: 24 },
];
function franjaDeHora(hora: number): number {
  return Math.min(5, Math.floor(hora / 4));
}

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']; // coincide con diaSemanaIndex 0-6

// Evidencia mínima antes de considerar SIQUIERA un patrón — por debajo de
// esto, la variabilidad de contar unos pocos casos al azar es demasiado
// grande para decir nada con seriedad (regla obligatoria: "no generar
// falsos positivos").
const MIN_CASOS_TOTAL = 6;
const MIN_ANIOS_CON_CASOS = 2;

interface Combo {
  zona: string;
  diaSemanaIndex: number;
  franjaIndex: number;
  casosTotal: number;
  casosPorAnio: Map<number, number>;
  modalidades: Map<string, number>;
  armas: Map<string, number>;
}

function agruparEnCombos(records: CrimeRecord[], dimensionZona: DimensionZona): Map<string, Combo> {
  const combos = new Map<string, Combo>();
  for (const r of records) {
    if (r.diaSemanaIndex == null || r.hora == null || r.anio == null) continue;
    const zona = (dimensionZona === 'estacion' ? r.estacion : dimensionZona === 'cai' ? r.cai : r.cuadrante) || '';
    if (!zona || zona.toUpperCase().includes('SIN ASIGNAR') || zona.toUpperCase().includes('NO REPORTADO')) continue;
    const franjaIndex = franjaDeHora(r.hora);
    const key = `${zona}|${r.diaSemanaIndex}|${franjaIndex}`;
    let combo = combos.get(key);
    if (!combo) {
      combo = { zona, diaSemanaIndex: r.diaSemanaIndex, franjaIndex, casosTotal: 0, casosPorAnio: new Map(), modalidades: new Map(), armas: new Map() };
      combos.set(key, combo);
    }
    combo.casosTotal += 1;
    combo.casosPorAnio.set(r.anio, (combo.casosPorAnio.get(r.anio) || 0) + 1);
    if (r.modalidad) combo.modalidades.set(r.modalidad, (combo.modalidades.get(r.modalidad) || 0) + 1);
    if (r.armas) combo.armas.set(r.armas, (combo.armas.get(r.armas) || 0) + 1);
  }
  return combos;
}

/**
 * Índice de concentración: casos observados / casos esperados si el mismo
 * total se repartiera uniformemente entre todas las combinaciones
 * zona×día×franja posibles. Un índice de 3.0 significa "3 veces más casos
 * de los que le tocarían a esta combinación por puro azar". Es la métrica
 * central de todo el módulo — todo lo demás (nivel, alertas) se deriva de
 * ella.
 */
function calcularIndices(combos: Map<string, Combo>, totalCasos: number, numZonas: number): Map<string, number> {
  const totalCombinacionesPosibles = Math.max(1, numZonas) * 7 * 6;
  const esperadoPorCombinacion = totalCasos / totalCombinacionesPosibles;
  const indices = new Map<string, number>();
  if (esperadoPorCombinacion <= 0) return indices;
  for (const [key, combo] of combos) {
    indices.set(key, combo.casosTotal / esperadoPorCombinacion);
  }
  return indices;
}

/**
 * Confianza (0-100%) — se deriva de DOS cosas medibles, nunca inventadas:
 * 1) Consistencia entre años: si el patrón aparece de forma pareja en
 *    cada año con datos (coeficiente de variación bajo), es más creíble
 *    que si fue un pico aislado de un solo año.
 * 2) Tamaño de muestra: más casos totales acumulados dan más certeza
 *    estadística sobre el conteo mismo.
 * La fórmula exacta queda documentada aquí mismo para que sea reproducible:
 * confianza = 100 × (1 − CV/2) × factorMuestra, recortado a [30, 95].
 * CV = desviación estándar de los casos por año / promedio de casos por año
 * (entre los años que sí tuvieron al menos un caso).
 * factorMuestra = min(1, casosTotal / 15) — se satura en 15+ casos.
 */
function calcularConfianza(combo: Combo): number {
  const valoresPorAnio = Array.from(combo.casosPorAnio.values());
  const aniosConDatos = valoresPorAnio.length;
  if (aniosConDatos < MIN_ANIOS_CON_CASOS || combo.casosTotal < MIN_CASOS_TOTAL) return 0;
  const promedio = valoresPorAnio.reduce((a, b) => a + b, 0) / aniosConDatos;
  const varianza = valoresPorAnio.reduce((a, b) => a + (b - promedio) ** 2, 0) / aniosConDatos;
  const cv = promedio > 0 ? Math.sqrt(varianza) / promedio : 1;
  const factorMuestra = Math.min(1, combo.casosTotal / 15);
  const confianza = 100 * (1 - cv / 2) * factorMuestra;
  return Math.max(30, Math.min(95, Math.round(confianza)));
}

function nivelDesdeIndice(indice: number): 'Alto' | 'Moderado' | 'Bajo' {
  if (indice >= 3) return 'Alto';
  if (indice >= 1.5) return 'Moderado';
  return 'Bajo';
}

export interface AlertaPredictiva {
  delito: string;
  zona: string;
  dimensionZona: DimensionZona;
  diaSemana: string;
  franjaHoraria: string;
  indiceConcentracion: number;
  nivel: 'Alto' | 'Moderado' | 'Bajo';
  confianza: number;
  casosHistoricos: number;
  aniosConEvidencia: number;
  modalidadPredominante: string | null;
  armaPredominante: string | null;
  factores: string[];
}

/**
 * Backtesting real — la parte "fundamental" que pide la metodología. Se
 * entrena con todos los años EXCEPTO el más reciente con datos, se generan
 * las top-K combinaciones previstas, y se revisa si esas mismas
 * combinaciones SÍ resultaron concentradas en el año dejado afuera. La
 * métrica (precision@K) es honesta: si sale baja, se muestra baja — no se
 * maquilla.
 */
export function backtestModelo(records: CrimeRecord[], delito: string | null, dimensionZona: DimensionZona, k = 5): { precisionEnK: number; aniosEvaluados: string; muestraSuficiente: boolean } {
  const filtrados = delito ? records.filter((r) => r.delito === delito) : records;
  const anios = Array.from(new Set(filtrados.map((r) => r.anio).filter((a): a is number => a != null))).sort();
  if (anios.length < 2) return { precisionEnK: 0, aniosEvaluados: '', muestraSuficiente: false };

  const anioPrueba = anios[anios.length - 1];
  const entrenamiento = filtrados.filter((r) => r.anio !== anioPrueba);
  const prueba = filtrados.filter((r) => r.anio === anioPrueba);
  if (entrenamiento.length < MIN_CASOS_TOTAL * k || prueba.length < MIN_CASOS_TOTAL) {
    return { precisionEnK: 0, aniosEvaluados: `${anios.slice(0, -1).join('+')} → ${anioPrueba}`, muestraSuficiente: false };
  }

  const zonasEntrenamiento = new Set(entrenamiento.map((r) => (dimensionZona === 'estacion' ? r.estacion : dimensionZona === 'cai' ? r.cai : r.cuadrante)));
  const combosEntreno = agruparEnCombos(entrenamiento, dimensionZona);
  const indicesEntreno = calcularIndices(combosEntreno, entrenamiento.length, zonasEntrenamiento.size);
  const topK = Array.from(indicesEntreno.entries())
    .filter(([key]) => combosEntreno.get(key)!.casosTotal >= MIN_CASOS_TOTAL)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([key]) => key);

  if (topK.length === 0) return { precisionEnK: 0, aniosEvaluados: `${anios.slice(0, -1).join('+')} → ${anioPrueba}`, muestraSuficiente: false };

  const zonasPrueba = new Set(prueba.map((r) => (dimensionZona === 'estacion' ? r.estacion : dimensionZona === 'cai' ? r.cai : r.cuadrante)));
  const combosPrueba = agruparEnCombos(prueba, dimensionZona);
  const indicesPrueba = calcularIndices(combosPrueba, prueba.length, zonasPrueba.size);

  // "Acierto" = la combinación que el modelo marcó como top en el
  // entrenamiento SIGUIÓ estando por encima de lo esperado (índice > 1.5)
  // en el año de prueba, que nunca vio durante el entrenamiento.
  const aciertos = topK.filter((key) => (indicesPrueba.get(key) ?? 0) >= 1.5).length;
  return { precisionEnK: aciertos / topK.length, aniosEvaluados: `${anios.slice(0, -1).join('+')} → ${anioPrueba}`, muestraSuficiente: true };
}

/**
 * Genera el pronóstico para un horizonte concreto — el punto de entrada
 * principal del módulo. Usa TODO el histórico disponible (ya filtrado por
 * lo que sea que el usuario tenga activo en los filtros del dashboard) para
 * calcular los índices, y los recorta a los días de la semana que caen
 * dentro del horizonte contado desde HOY.
 */
export function generarPronostico(records: CrimeRecord[], opciones: { delito: string | null; dimensionZona: DimensionZona; horizonteHoras: Horizonte; maxAlertas?: number }): { alertas: AlertaPredictiva[]; backtest: ReturnType<typeof backtestModelo>; totalCasosAnalizados: number } {
  const { delito, dimensionZona, horizonteHoras, maxAlertas = 5 } = opciones;
  const filtrados = delito ? records.filter((r) => r.delito === delito) : records;

  const backtest = backtestModelo(records, delito, dimensionZona);

  if (filtrados.length === 0) return { alertas: [], backtest, totalCasosAnalizados: 0 };

  const zonas = new Set(filtrados.map((r) => (dimensionZona === 'estacion' ? r.estacion : dimensionZona === 'cai' ? r.cai : r.cuadrante)));
  const combos = agruparEnCombos(filtrados, dimensionZona);
  const indices = calcularIndices(combos, filtrados.length, zonas.size);

  // Días de la semana cubiertos por el horizonte, contados desde hoy
  // (0=lunes...6=domingo, igual que diaSemanaIndex).
  const hoyIndex = (new Date().getDay() + 6) % 7; // JS: 0=domingo → se pasa a 0=lunes
  const diasCubiertos = new Set<number>();
  const diasEnHorizonte = horizonteHoras === 168 ? 7 : Math.ceil(horizonteHoras / 24);
  for (let i = 0; i < diasEnHorizonte; i++) diasCubiertos.add((hoyIndex + i) % 7);

  const candidatos = Array.from(combos.entries())
    .filter(([, combo]) => diasCubiertos.has(combo.diaSemanaIndex))
    .filter(([, combo]) => combo.casosTotal >= MIN_CASOS_TOTAL && combo.casosPorAnio.size >= MIN_ANIOS_CON_CASOS)
    .map(([key, combo]) => ({ key, combo, indice: indices.get(key) ?? 0 }))
    .filter((c) => c.indice >= 1.5) // por debajo de esto no es "concentración", es ruido
    .sort((a, b) => b.indice - a.indice)
    .slice(0, maxAlertas);

  const alertas: AlertaPredictiva[] = candidatos.map(({ combo, indice }) => {
    const confianzaLocal = calcularConfianza(combo);
    // La confianza final nunca puede ser más alta que lo que el propio
    // modelo demostró en el backtesting — si el modelo acertó poco en el
    // pasado reciente, ninguna alerta individual puede presentarse como
    // "muy confiable" solo porque esa combinación en particular se ve
    // consistente.
    const confianzaFinal = backtest.muestraSuficiente ? Math.round(confianzaLocal * (0.5 + 0.5 * backtest.precisionEnK)) : Math.round(confianzaLocal * 0.7);
    const modalidadTop = Array.from(combo.modalidades.entries()).sort((a, b) => b[1] - a[1])[0];
    const armaTop = Array.from(combo.armas.entries()).sort((a, b) => b[1] - a[1])[0];
    const factores = [
      `${combo.casosTotal} casos históricos en esta combinación exacta de zona, día y franja.`,
      `Presente en ${combo.casosPorAnio.size} de los años con datos disponibles.`,
      `Concentración ${indice.toFixed(1)}× por encima de lo esperado si los casos se repartieran uniformemente.`,
    ];
    if (backtest.muestraSuficiente) factores.push(`El modelo acertó ${Math.round(backtest.precisionEnK * 100)}% de sus zonas prioritarias al validarlas contra ${backtest.aniosEvaluados.split('→')[1]?.trim() ?? 'el año más reciente'}.`);
    return {
      delito: delito ?? 'Todos los delitos',
      zona: combo.zona,
      dimensionZona,
      diaSemana: DIAS_SEMANA[combo.diaSemanaIndex],
      franjaHoraria: FRANJAS[combo.franjaIndex].etiqueta,
      indiceConcentracion: indice,
      nivel: nivelDesdeIndice(indice),
      confianza: confianzaFinal,
      casosHistoricos: combo.casosTotal,
      aniosConEvidencia: combo.casosPorAnio.size,
      modalidadPredominante: modalidadTop ? modalidadTop[0] : null,
      armaPredominante: armaTop ? armaTop[0] : null,
      factores,
    };
  });

  return { alertas, backtest, totalCasosAnalizados: filtrados.length };
}
