// Tipos de "Microgerencia y Proyección Delictiva" — el cálculo real vive en
// hooks/useMicrogerencia.ts (se computa EN VIVO a partir de los mismos
// datos ya cargados en el dashboard, nunca de un archivo aparte). Este
// archivo solo define la forma de los datos, compartida entre el hook, el
// modal y el generador de PDF.
export interface PuntoTrimestre {
  etiqueta: string; // "1er Trimestre", etc.
  anio2025: number; // 2025 CERRADO (hasta el 31 de diciembre) — no el corte "a la fecha"
  anio2026: number;
  dif: number;
}

export interface PuntoMes {
  etiqueta: string; // "Enero", etc.
  anio2025: number; // 2025 CERRADO (mes completo)
  anio2026: number;
  dif: number;
}

export interface NodoMicrogerencia {
  nombre: string;
  total2025: number;
  fecha2025: number;
  fecha2026: number;
  dif: number;
  pct: number | null;
  aportePct: number;
  casosDia: number;
  terminaAnio: number;
  difConAnioAnterior: number;
  trimestres: PuntoTrimestre[];
  meses: PuntoMes[];
  // Desglose por delito DENTRO de este nodo específico (ej. los delitos que
  // se presentaron en "Distrito Uno", con las mismas columnas) — vacío para
  // los propios nodos de delito (evita anidar delito-dentro-de-delito).
  delitos: NodoMicrogerencia[];
  hijos: NodoMicrogerencia[];
  /** Código de estación del dataset (ej. "E-Norte") en nodos de estación, CAI y zona. */
  estacion?: string;
  /** Tipo de nodo (para armar la selección territorial del asistente). */
  tipo?: 'general' | 'distrito' | 'estacion' | 'cai' | 'zona' | 'delito';
  /** Barrios con más casos en el año actual a la fecha (solo nodos territoriales). */
  barrios?: { nombre: string; casos: number }[];
}

export interface DatosMicrogerencia {
  diasHastaLaFecha: number;
  periodo: string;
  // Mismo rango ("año actual a la fecha") que usan todos los números de la
  // Microgerencia, como fecha simple (aaaa-mm-dd) — para que el mapa de
  // calor filtre el mismo periodo que las tablas (ver ModalMicrogerencia.tsx).
  actualInicio: string;
  actualFin: string;
  anioActual: number;
  anioAnterior: number;
  /** Corte real de la información (último día con datos del año actual). */
  fechaCorte?: string;
  delitoFiltrado: string | null;
  general: NodoMicrogerencia;
  distrito1: NodoMicrogerencia;
  distrito2: NodoMicrogerencia;
  delitos: NodoMicrogerencia[];
  /** Zonas de atención por estación (una por estación + zona, sin partir por CAI). */
  zonas?: NodoMicrogerencia[];
  /** Delitos seleccionados (lista completa) — para filtrar mapas. */
  delitosSeleccionados?: string[];
}

/** Ajustes propios del asistente de Microgerencia sobre los filtros del dashboard. */
export interface AjustesMicrogerencia {
  /** Delitos (vacío = todos). */
  delitos: string[];
  /** Año de análisis (vacío = vigencia actual). */
  anio: string;
  fechaInicial: string | null;
  fechaFinal: string | null;
  /** Barrios (vacío = todos, como siempre). */
  barrios: string[];
}

/** Nombre para mostrar de una unidad (la estación de Sotará tiene sede en Paispamba). */
export function nombreVisibleUnidad(nombre: string): string {
  return nombre.replace(/Estación Sotara\b/g, 'Estación Paispamba').replace(/\bE-Sotara\b/g, 'E-Paispamba');
}
