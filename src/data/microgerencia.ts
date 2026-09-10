// Tipos de "Microgerencia y Proyección Delictiva" — el cálculo real vive en
// hooks/useMicrogerencia.ts (se computa EN VIVO a partir de los mismos
// datos ya cargados en el dashboard, nunca de un archivo aparte). Este
// archivo solo define la forma de los datos, compartida entre el hook, el
// modal y el generador de PDF.
export interface PuntoTrimestre {
  etiqueta: string; // "1er Trimestre", etc.
  anio2025: number;
  anio2026: number;
  dif: number;
}

export interface PuntoMes {
  etiqueta: string; // "Enero", etc.
  anio2025: number;
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
}

export interface DatosMicrogerencia {
  diasHastaLaFecha: number;
  periodo: string;
  anioActual: number;
  anioAnterior: number;
  delitoFiltrado: string | null;
  general: NodoMicrogerencia;
  distrito1: NodoMicrogerencia;
  distrito2: NodoMicrogerencia;
  delitos: NodoMicrogerencia[];
}
