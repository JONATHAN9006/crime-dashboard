// Registro de OPERATIVIDAD (capturas, incautaciones, recuperaciones) — un
// dataset SEPARADO del de delictividad (DB2/Matriz Base), pero que se
// filtra con los MISMOS filtros generales del dashboard cuando el campo
// tiene equivalente (Delito ↔ DELITO_ASOCIADO, Estación, Cuadrante,
// Barrio, Año, Mes, rango de fecha).
export interface OperatividadRecord {
  __id: string;

  // Categoría de la operatividad en sí (lo que trae la columna
  // "OPERATIVIDAD" del Excel): CAPTURAS, MERCANCIA INCAUTADA,
  // MOTOCICLETAS RECUPERADAS, MERCANCIA RECUPERADA, INCAUTACION ARMAS DE
  // FUEGO, AUTOMOTORES RECUPERADOS, INCAUTACION DROGA — u otras que traiga
  // el archivo, sin inventar categorías nuevas.
  categoria: string;

  // Fecha / tiempo
  fecha: Date | null;
  anio: number | null;
  mes: number | null;
  nombreMes: string;
  diaSemana: string;
  turno: string;

  // Métrica
  cantidad: number;

  // El delito con el que se relaciona esta operatividad (para poder
  // responder "¿cuántas capturas hay por Homicidio?").
  delitoAsociado: string;

  // Organizacional / territorial — mismos nombres de campo que
  // CrimeRecord, para poder cruzarlo con los filtros generales sin lógica
  // aparte.
  estacion: string;
  cuadrante: string;
  barrioHecho: string;
  zona: string;
  unidad: string;
  dependencia: string;

  // Detalle propio de operatividad (bienes, circunstancia, etc.)
  tipoBien: string;
  claseBien: string;
  marca: string;
  circunstanciaCaptura: string;
  situacionJuridica: string;
  valor: number | null;

  raw: Record<string, string>;
}

export interface OperatividadMeta {
  totalRegistros: number;
  ultimaActualizacion: Date | null;
  nombreArchivo: string;
}
