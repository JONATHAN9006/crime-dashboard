import type { CrimeRecord, DatasetMeta, DataQuality, UpdateSummary } from '../types/crime';
import { COLUMNAS_REQUERIDAS } from './csvParser';

export function fusionarRegistros(
  existentes: CrimeRecord[],
  nuevos: CrimeRecord[],
  columnasNuevas: string[],
  columnasFaltantes: string[],
): { registros: CrimeRecord[]; resumen: UpdateSummary } {
  const idsExistentes = new Set(existentes.map((r) => r.__id));
  const paraAgregar: CrimeRecord[] = [];
  let duplicados = 0;

  for (const r of nuevos) {
    if (idsExistentes.has(r.__id)) {
      duplicados += 1;
    } else {
      paraAgregar.push(r);
      idsExistentes.add(r.__id);
    }
  }

  const registros = [...existentes, ...paraAgregar];

  return {
    registros,
    resumen: {
      nuevos: nuevos.length,
      duplicados,
      incorporados: paraAgregar.length,
      totalFinal: registros.length,
      columnasNuevas,
      columnasFaltantes,
    },
  };
}

export function calcularColumnasNuevas(previas: string[], actuales: string[]): string[] {
  const set = new Set(previas);
  return actuales.filter((c) => !set.has(c));
}

export function calcularCalidadDatos(records: CrimeRecord[]): DataQuality {
  const total = records.length;
  let fechaInvalida = 0;
  let sinDelito = 0;
  let sinBarrio = 0;
  let sinCantidad = 0;
  let noReportadoCount = 0;

  for (const r of records) {
    if (!r.fecha) fechaInvalida += 1;
    if (!r.delito || r.delito === 'NO REPORTADO') sinDelito += 1;
    if (!r.barrioHecho || r.barrioHecho === 'NO REPORTADO') sinBarrio += 1;
    if (!r.cantidad) sinCantidad += 1;
    if (
      r.armas === 'NO REPORTADO' ||
      r.modalidad === 'NO REPORTADO' ||
      r.genero === 'NO REPORTADO'
    ) {
      noReportadoCount += 1;
    }
  }

  const problematicos = new Set<number>();
  records.forEach((r, i) => {
    if (!r.fecha || (!r.delito || r.delito === 'NO REPORTADO') || !r.cantidad) {
      problematicos.add(i);
    }
  });

  const porcentajeValidos = total ? ((total - problematicos.size) / total) * 100 : 100;

  return {
    totalRegistros: total,
    fechaInvalida,
    sinDelito,
    sinBarrio,
    sinCantidad,
    noReportadoCount,
    duplicadosDetectados: 0,
    porcentajeValidos,
  };
}

export function construirMeta(
  records: CrimeRecord[],
  nombreArchivo: string,
  ultimaActualizacion: Date | null,
  columnasDetectadas: string[],
  fechaMaxParametro: Date | null = null,
): DatasetMeta {
  const fechas = records.filter((r) => r.fecha).map((r) => r.fecha!.getTime());
  const fechaMin = fechas.length ? new Date(Math.min(...fechas)) : null;
  const fechaMax = fechas.length ? new Date(Math.max(...fechas)) : null;

  const aniosDisponibles = Array.from(new Set(records.filter((r) => r.anio).map((r) => r.anio!))).sort((a, b) => a - b);
  const estacionesDisponibles = Array.from(new Set(records.map((r) => r.estacion).filter(Boolean))).sort();
  const barriosDisponibles = Array.from(new Set(records.map((r) => r.barrioHecho).filter(Boolean))).sort();
  const delitosDisponibles = Array.from(new Set(records.map((r) => r.delito).filter(Boolean))).sort();

  const columnasConocidas = new Set<string>([
    // Formato histórico
    'FECHA_HECHO', 'HORA HECHO', 'HORA_24', 'HORA_HECHO', 'CANTIDAD', 'DELITOS', 'MODALIDAD', 'ARMAS',
    'ESTACION', 'CAI', 'CUADRANTE', 'BARRIOS_HECHO', 'BARRIO-CIUDAD', 'ZONA', 'ZONA2', 'CLASE_SITIO',
    'GENERO', 'GRUPO EDAD LEY', 'EDAD', 'DIA_SEMANA', 'DIA_SEMANA (grupo)', 'ANIO', 'SEMANA', 'NoSEMANA',
    'CAUSA_LESION',
    // Formato oficial vigente (Base_de_Datos_General)
    'Año', 'Hora_24', 'Mes', 'Dia', 'Mes resumido', 'dia resumido', 'Fecha Dia', 'Semana2', 'Delito',
    'Total General Año Anterior', 'Estación Final', 'CAI Final', 'Cuadrante Final', 'Genero Final',
    'Zona Final', 'Clase Sitio Final', 'Arma Final', 'Modalidad Final', 'Causa Lesion Final',
    'Barrio Hecho Final', 'Grupo Edad Ley Final',
  ]);
  const columnasDesconocidas = columnasDetectadas.filter((c) => !columnasConocidas.has(c));

  return {
    totalRegistros: records.length,
    totalCasos: records.length,
    fechaMin,
    fechaMax,
    aniosDisponibles,
    estacionesDisponibles,
    barriosDisponibles,
    delitosDisponibles,
    ultimaActualizacion,
    nombreArchivo,
    columnasDetectadas,
    columnasDesconocidas,
    calidad: calcularCalidadDatos(records),
    fechaMaxParametro,
  };
}

export { COLUMNAS_REQUERIDAS };
