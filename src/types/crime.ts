// Tipos centrales de la aplicación.
// El dataset es dinámico: además de los campos "conocidos" que usamos activamente,
// conservamos el registro crudo completo (raw) para no perder columnas nuevas
// que puedan aparecer en futuras cargas.

export interface CrimeRecord {
  __id: string; // identificador único generado (para deduplicación)

  // Fecha / tiempo
  fecha: Date | null;
  fechaTexto: string;
  anio: number | null;
  mes: number | null; // 1-12
  nombreMes: string;
  anioMes: string; // "2026-03"
  semana: number | null;
  dia: number | null;
  diaSemana: string; // LUNES, MARTES...
  diaSemanaIndex: number | null; // 0=lunes ... 6=domingo
  hora: number | null; // 0-23
  franjaHoraria: string; // Madrugada / Mañana / Tarde / Noche
  turno: string; // Turno de vigilancia (3 turnos de 8 horas, ver "CICLOS TURNO 3D")

  // Métrica
  cantidad: number;

  // Delito
  delito: string;
  armas: string;
  modalidad: string;
  causaLesion: string;

  // Organizacional / territorial
  estacion: string;
  cai: string;
  cuadrante: string;
  barrioHecho: string;
  zona: string; // URBANO / RURAL
  claseSitio: string;

  // Demográfico
  genero: string;
  grupoEdad: string;
  edad: number | null;

  // Todo lo demás, sin procesar, para compatibilidad futura
  raw: Record<string, string>;
}

export interface DatasetMeta {
  totalRegistros: number;
  totalCasos: number;
  fechaMin: Date | null;
  fechaMax: Date | null;
  aniosDisponibles: number[];
  estacionesDisponibles: string[];
  barriosDisponibles: string[];
  delitosDisponibles: string[];
  ultimaActualizacion: Date | null;
  nombreArchivo: string;
  columnasDetectadas: string[];
  columnasDesconocidas: string[];
  calidad: DataQuality;
  // Fecha de corte OFICIAL del sistema de la unidad ("FECHA_MAX_PARAMETRO"
  // de la descarga DB2), cuando el archivo la trae — ver db2Transform.ts.
  fechaMaxParametro: Date | null;
}

export interface DataQuality {
  totalRegistros: number;
  fechaInvalida: number;
  sinDelito: number;
  sinBarrio: number;
  sinCantidad: number;
  noReportadoCount: number;
  duplicadosDetectados: number;
  porcentajeValidos: number;
}

export interface FilterState {
  estacion: string[];
  cai: string[];
  cuadrante: string[];
  barrioHecho: string[];
  delito: string[];
  zona: string[];
  genero: string[];
  armas: string[];
  modalidad: string[];
  claseSitio: string[];
  causaLesion: string[];
  grupoEdad: string[];
  franjaHoraria: string[];
  turno: string[];
  diaSemana: string[];
  horaExacta: string[];
  anio: string[];
  mes: string[];
  fechaInicial: string | null;
  fechaFinal: string | null;
}

export const emptyFilterState: FilterState = {
  estacion: [],
  cai: [],
  cuadrante: [],
  barrioHecho: [],
  delito: [],
  zona: [],
  genero: [],
  armas: [],
  modalidad: [],
  claseSitio: [],
  causaLesion: [],
  grupoEdad: [],
  franjaHoraria: [],
  turno: [],
  diaSemana: [],
  horaExacta: [],
  anio: [],
  mes: [],
  fechaInicial: null,
  fechaFinal: null,
};

export type UpdateMode = 'reemplazar' | 'agregar';

export interface UpdateSummary {
  nuevos: number;
  duplicados: number;
  incorporados: number;
  totalFinal: number;
  columnasNuevas: string[];
  columnasFaltantes: string[];
  // Presentes cuando el archivo cargado era una descarga DB2 cruda que se
  // transformó automáticamente (ver data/db2Transform.ts).
  formatoDetectado?: 'db2' | 'normalizado';
  filasConErroresDB2?: { indice: number; motivo: string }[];
  valoresNuevosDB2?: string[];
}
