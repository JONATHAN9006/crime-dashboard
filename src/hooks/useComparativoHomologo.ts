import { useMemo } from 'react';
import type { CrimeRecord, FilterState } from '../types/crime';
import { agruparPor, totalCasos, variacion, participacionPct } from '../utils/aggregations';

export interface VentanaComparativa {
  disponible: boolean;
  actualInicio: Date;
  actualFin: Date;
  anteriorInicio: Date;
  anteriorFin: Date;
  anioActual: number;
  anioAnterior: number;
  esRangoPersonalizado: boolean;
  diasTranscurridos: number;
  recsActual: CrimeRecord[];
  recsAnterior: CrimeRecord[];
  // Vigencia 2025 COMPLETA (01/01–31/12), SIN el recorte "a la fecha" que sí
  // aplican recsAnterior/recsActual — es la base real para la columna "TOTAL
  // {añoAnterior}" de las tablas comparativas: ese total nunca debe moverse
  // aunque el usuario cambie el rango de fechas/mes que se está analizando
  // en el año actual.
  recsAnioAnteriorCompleto: CrimeRecord[];
}

function dentroDeRango(fecha: Date | null, inicio: Date, fin: Date): boolean {
  return !!fecha && fecha >= inicio && fecha <= fin;
}

// Corre el año hacia atrás manteniendo mes/día (maneja 29 de febrero cayendo al 28).
function restarUnAnio(fecha: Date): Date {
  const d = new Date(fecha);
  const anioOriginal = d.getFullYear();
  d.setFullYear(anioOriginal - 1);
  return d;
}

/**
 * Calcula la ventana de comparación "año actual vs. año anterior" de forma
 * homóloga, respetando los filtros de fecha inicial/final y mes — el filtro
 * de Año NO se usa para redefinir cuál es "el año actual": esa comparación
 * siempre se ancla a los dos años reales más recientes de la base de datos.
 * (Si se usara el Año seleccionado para esto, escoger un año que no sea el
 * más reciente —ej. 2025 cuando ya hay datos de 2026— retrocedería a un año
 * que no existe en la base —2024— produciendo una columna vacía y cifras
 * confusas; el filtro de Año simplemente restringe qué registros se cuentan
 * en el resto del dashboard, vía "filteredRecords".)
 *
 * IMPORTANTE: la fecha de referencia ("hoy", el corte de "a la fecha") se
 * calcula sobre TODOS los registros (parámetro `todosLosRegistros`), NUNCA
 * sobre `recordsBase` (que ya trae aplicado el filtro de Delito/Estación/etc).
 * Si se calculara sobre `recordsBase`, filtrar por un delito cuyo registro
 * más reciente sea, por ejemplo, unos días anterior al dato más reciente real
 * de la base, movería el corte "a la fecha" a esa fecha más temprana y
 * excluiría en silencio casos reales de los últimos días del año anterior
 * (bug verificado: con Delito=Homicidio, el corte se movía del 24 al 18 de
 * agosto, excluyendo 2 homicidios reales del 20 y 21 de agosto de 2025).
 *
 * Orden de prioridad:
 *   1. Fecha inicial + Fecha final explícitas → se usan tal cual.
 *   2. Mes(es) seleccionados → ventana = ese/esos mes(es) completos, dentro
 *      del año más reciente de la base (acotado a la fecha máxima real).
 *   3. Sin filtros temporales → por defecto, "1 de enero al último dato
 *      disponible" del año más reciente ("a la fecha").
 * En todos los casos, la ventana "anterior" es exactamente el mismo tramo,
 * un año atrás.
 */
export function useVentanaComparativa(
  recordsBase: CrimeRecord[],
  filters: FilterState,
  todosLosRegistros?: CrimeRecord[],
  fechaMaxParametro?: Date | null,
): VentanaComparativa {
  return useMemo(() => {
    const conFecha = recordsBase.filter((r) => r.fecha);
    if (conFecha.length === 0) {
      const hoy = new Date();
      return {
        disponible: false,
        actualInicio: hoy, actualFin: hoy, anteriorInicio: hoy, anteriorFin: hoy,
        anioActual: hoy.getFullYear(), anioAnterior: hoy.getFullYear() - 1,
        esRangoPersonalizado: false, diasTranscurridos: 0, recsActual: [], recsAnterior: [],
        recsAnioAnteriorCompleto: [],
      };
    }

    // Prioridad para "hoy": 1) el parámetro OFICIAL del sistema
    // (FECHA_MAX_PARAMETRO, extraído del archivo DB2 — ver db2Transform.ts),
    // que es lo que usa la Policía en sus propios reportes y normalmente cae
    // uno o más días antes del último dato bruto; 2) si el archivo no trae
    // ese parámetro (formato antiguo), se recurre a la fecha más reciente
    // encontrada en TODA la base (sin filtrar por delito/estación/etc.).
    let fechaMaxDatos: Date;
    if (fechaMaxParametro) {
      fechaMaxDatos = new Date(fechaMaxParametro);
    } else {
      const baseParaFecha = (todosLosRegistros ?? recordsBase).filter((r) => r.fecha);
      const maxTs = Math.max(...baseParaFecha.map((r) => r.fecha!.getTime()));
      fechaMaxDatos = new Date(maxTs);
    }
    fechaMaxDatos.setHours(23, 59, 59, 999);

    let actualInicio: Date;
    let actualFin: Date;
    let esRangoPersonalizado = false;

    // El año de referencia SIEMPRE es el más reciente presente en la base —
    // el filtro de Año no lo altera (ver nota arriba).
    const anioReferencia = fechaMaxDatos.getFullYear();
    const mesesSeleccionados = filters.mes.map(Number).filter((n) => !isNaN(n));

    if (filters.fechaInicial && filters.fechaFinal) {
      // 1) Rango explícito: máxima prioridad.
      actualInicio = new Date(filters.fechaInicial);
      actualInicio.setHours(0, 0, 0, 0);
      actualFin = new Date(filters.fechaFinal);
      actualFin.setHours(23, 59, 59, 999);
      esRangoPersonalizado = true;
    } else if (mesesSeleccionados.length > 0) {
      // 2) Mes(es) seleccionados dentro del año más reciente de la base.
      const mesMin = Math.min(...mesesSeleccionados);
      const mesMax = Math.max(...mesesSeleccionados);
      actualInicio = new Date(anioReferencia, mesMin - 1, 1);
      actualFin = new Date(anioReferencia, mesMax, 0, 23, 59, 59, 999);
      if (actualFin > fechaMaxDatos) actualFin = fechaMaxDatos;
      esRangoPersonalizado = true;
    } else {
      // 3) Por defecto: año más reciente, "a la fecha".
      actualFin = fechaMaxDatos;
      actualInicio = new Date(actualFin.getFullYear(), 0, 1);
    }

    const anteriorInicio = restarUnAnio(actualInicio);
    const anteriorFin = restarUnAnio(actualFin);
    anteriorFin.setHours(23, 59, 59, 999);

    const recsActual = recordsBase.filter((r) => dentroDeRango(r.fecha, actualInicio, actualFin));
    const recsAnterior = recordsBase.filter((r) => dentroDeRango(r.fecha, anteriorInicio, anteriorFin));
    // Vigencia anterior COMPLETA: todo el año calendario de anteriorFin,
    // sin usar actualInicio/actualFin para nada — así nunca se mueve
    // aunque cambie el periodo analizado del año actual.
    const anioAnteriorNum = anteriorFin.getFullYear();
    const recsAnioAnteriorCompleto = recordsBase.filter((r) => r.fecha && r.fecha.getFullYear() === anioAnteriorNum);
    const diasTranscurridos = Math.max(1, Math.round((actualFin.getTime() - actualInicio.getTime()) / 86400000));

    return {
      disponible: true,
      actualInicio, actualFin, anteriorInicio, anteriorFin,
      anioActual: actualFin.getFullYear(),
      anioAnterior: anteriorFin.getFullYear(),
      esRangoPersonalizado,
      diasTranscurridos,
      recsActual, recsAnterior, recsAnioAnteriorCompleto,
    };
  }, [recordsBase, todosLosRegistros, fechaMaxParametro, filters.fechaInicial, filters.fechaFinal, filters.mes, filters.anio]);
}

export interface ComparativoGeneral {
  disponible: boolean;
  casosActual: number;
  casosAnterior: number;
  registrosActual: number;
  registrosAnterior: number;
  totalGeneral: number;
  variacionAbs: number;
  variacionPct: number | null;
}

export function useComparativoGeneral(ventana: VentanaComparativa): ComparativoGeneral {
  return useMemo(() => {
    const casosActual = totalCasos(ventana.recsActual);
    const casosAnterior = totalCasos(ventana.recsAnterior);
    const { abs, pct } = variacion(casosActual, casosAnterior);
    return {
      disponible: ventana.disponible,
      casosActual,
      casosAnterior,
      registrosActual: ventana.recsActual.length,
      registrosAnterior: ventana.recsAnterior.length,
      totalGeneral: casosActual + casosAnterior,
      variacionAbs: abs,
      variacionPct: pct,
    };
  }, [ventana]);
}

export interface FilaComparativaCategoria {
  key: string;
  actual: number;
  anterior: number;
  diferencia: number;
  variacionPct: number | null;
  aportePct: number;
  // Total de ESA categoría durante la vigencia anterior COMPLETA (año
  // calendario entero), no el corte "a la fecha" que usa "anterior" — para
  // la columna "TOTAL {añoAnterior}" de las tablas comparativas. Nunca se
  // mueve aunque cambie el periodo analizado del año actual.
  totalAnioAnteriorCompleto: number;
}

export function useComparativoCategoria(
  ventana: VentanaComparativa,
  getter: (r: CrimeRecord) => string,
  limite?: number,
): FilaComparativaCategoria[] {
  return useMemo(() => {
    if (!ventana.disponible) return [];
    const actualAgrupado = agruparPor(ventana.recsActual, getter);
    const anteriorMap = new Map(agruparPor(ventana.recsAnterior, getter).map((i) => [i.key, i.casos]));
    const totalAnioAnteriorCompletoMap = new Map(agruparPor(ventana.recsAnioAnteriorCompleto, getter).map((i) => [i.key, i.casos]));
    const totalActual = totalCasos(ventana.recsActual);

    const claves = new Set<string>([...actualAgrupado.map((i) => i.key), ...anteriorMap.keys()]);
    const actualMap = new Map(actualAgrupado.map((i) => [i.key, i.casos]));

    const filas: FilaComparativaCategoria[] = Array.from(claves)
      .filter((k) => k !== 'NO REPORTADO')
      .map((key) => {
        const actual = actualMap.get(key) || 0;
        const anterior = anteriorMap.get(key) || 0;
        const diferencia = actual - anterior;
        const variacionPct = anterior > 0 ? (diferencia / anterior) * 100 : (actual > 0 ? 100 : 0);
        return {
          key, actual, anterior, diferencia, variacionPct,
          aportePct: participacionPct(actual, totalActual),
          totalAnioAnteriorCompleto: totalAnioAnteriorCompletoMap.get(key) || 0,
        };
      })
      .sort((a, b) => b.actual - a.actual);

    return limite ? filas.slice(0, limite) : filas;
  }, [ventana, getter, limite]);
}

export interface Proyeccion {
  disponible: boolean;
  casosActual: number;
  diasTranscurridos: number;
  casosPorDia: number;
  diasEnAnio: number;
  proyeccionFinAnio: number;
  casosAnioAnterior: number; // "a la fecha", mismo tramo — para la diferencia
  diferenciaConAnterior: number;
  anioActual: number;
  anioAnterior: number;
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * Proyección simple de fin de año: (casos del año actual "a la fecha" / días
 * transcurridos) × días del año, comparada contra el año anterior en el mismo
 * tramo. Fórmula y validación numérica tomadas de la matriz de referencia
 * suministrada (verificada exactamente: 2221 casos / 178 días × 365 = 4554,
 * diferencia contra 1838 = 2716).
 */
export function useProyeccion(ventana: VentanaComparativa): Proyeccion {
  return useMemo(() => {
    if (!ventana.disponible) {
      return {
        disponible: false, casosActual: 0, diasTranscurridos: 0, casosPorDia: 0, diasEnAnio: 365,
        proyeccionFinAnio: 0, casosAnioAnterior: 0, diferenciaConAnterior: 0,
        anioActual: ventana.anioActual, anioAnterior: ventana.anioAnterior,
      };
    }
    const casosActual = totalCasos(ventana.recsActual);
    const casosAnioAnterior = totalCasos(ventana.recsAnterior);
    const diasEnAnio = esBisiesto(ventana.anioActual) ? 366 : 365;
    const casosPorDia = ventana.diasTranscurridos > 0 ? casosActual / ventana.diasTranscurridos : 0;
    const proyeccionFinAnio = Math.round(casosPorDia * diasEnAnio);
    return {
      disponible: true,
      casosActual,
      diasTranscurridos: ventana.diasTranscurridos,
      casosPorDia,
      diasEnAnio,
      proyeccionFinAnio,
      casosAnioAnterior,
      diferenciaConAnterior: proyeccionFinAnio - casosAnioAnterior,
      anioActual: ventana.anioActual,
      anioAnterior: ventana.anioAnterior,
    };
  }, [ventana]);
}
