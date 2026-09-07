import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useVentanaComparativa, useComparativoGeneral } from './useComparativoHomologo';
import { useTendenciaMensual, formatFechaISOLocal } from './useTemporalAnalysis';
import { useAniosComparables } from './useKpis';
import { analizarTendenciaMensual } from '../utils/analisisTendencia';
import { totalCasos } from '../utils/aggregations';
import { parsearFechaLocal } from '../utils/filters';

const NOMBRES_MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatDiaMes(d: Date): string {
  return `${d.getDate()} de ${NOMBRES_MES_LARGO[d.getMonth()]}`;
}

export type NivelDetalleTendencia = 'mensual' | 'diaria';

export interface PuntoDiarioComparado {
  dia: string; // "DD/MM", etiqueta del eje X
  [anio: string]: string | number; // claves de año agregadas dinámicamente
}

/**
 * Encapsula TODO el cálculo detrás de "Comportamiento del delito" /
 * "Tendencia Mensual": la serie mensual por año, la comparación homóloga
 * contra el año anterior, y el análisis de picos/valles — para que
 * Indicadores y Resumen usen exactamente la misma lógica, sin duplicarla.
 *
 * NIVEL DE DETALLE ADAPTATIVO: si el usuario fija un rango de fechas
 * específico (Fecha inicial + Fecha final) o selecciona un único Mes, la
 * vista pasa automáticamente de mensual a DIARIA — comparando día por día
 * el mismo rango calendario entre la vigencia actual y la anterior (mismo
 * día del mes, misma cantidad de días), rellenando con 0 los días sin
 * registros (nunca se elimina un día del eje X). Sin esos filtros
 * específicos, se mantiene la vista mensual de siempre.
 */
export function useAnalisisMensual() {
  const { records, filteredRecords, recordsBase, filters, meta } = useData();
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const cmp = useComparativoGeneral(ventana);
  const { todos } = useAniosComparables(filteredRecords);
  const mensual = useTendenciaMensual(filteredRecords);

  const serieMensualAnioActual = useMemo(
    () => mensual.filter((m) => m[String(ventana.anioActual)] != null).map((m) => ({ mes: m.mes, casos: m[String(ventana.anioActual)] as number })),
    [mensual, ventana.anioActual],
  );
  const serieMensualAnioAnterior = useMemo(
    () => mensual.filter((m) => m[String(ventana.anioAnterior)] != null).map((m) => ({ mes: m.mes, casos: m[String(ventana.anioAnterior)] as number })),
    [mensual, ventana.anioAnterior],
  );
  // Total General = año COMPLETO (01/01–31/12) de la vigencia anterior — a
  // diferencia de "Casos año anterior" (cmp.casosAnterior), que usa el
  // corte homólogo "a la fecha". Es la base real para la proyección de
  // cierre (ver analizarTendenciaMensual).
  const totalGeneral = useMemo(
    () => totalCasos(recordsBase.filter((r) => r.anio === ventana.anioAnterior)),
    [recordsBase, ventana.anioAnterior],
  );

  // ¿El último mes de la serie actual ya terminó, o el periodo filtrado
  // corta a mitad de mes (ej. hasta el 19 de agosto)? Se compara el día de
  // "actualFin" contra el último día real de ese mes — si no coincide, ese
  // mes todavía está en curso y no debe usarse para calcular la tendencia
  // (ver analizarTendenciaMensual).
  const ultimoMesEsCompleto = useMemo(() => {
    if (!ventana.disponible) return true;
    const ultimoDiaDelMes = new Date(ventana.actualFin.getFullYear(), ventana.actualFin.getMonth() + 1, 0).getDate();
    return ventana.actualFin.getDate() === ultimoDiaDelMes;
  }, [ventana]);

  const analisisMensual = useMemo(
    () => analizarTendenciaMensual(serieMensualAnioActual, serieMensualAnioAnterior, cmp, totalGeneral, ultimoMesEsCompleto, ventana.anioActual, ventana.anioAnterior),
    [serieMensualAnioActual, serieMensualAnioAnterior, cmp, totalGeneral, ultimoMesEsCompleto, ventana.anioActual, ventana.anioAnterior],
  );

  const mensualConTendencia = useMemo(() => {
    const mapaTendencia = new Map(analisisMensual.serieConLineaTendencia.map((p) => [p.mes, p._tendencia]));
    const mapaProyeccion = new Map(analisisMensual.serieConLineaTendencia.map((p) => [p.mes, (p as any)._proyeccion ?? null]));
    return mensual.map((m) => ({ ...m, _tendencia: mapaTendencia.get(m.mes) ?? null, _proyeccion: mapaProyeccion.get(m.mes) ?? null }));
  }, [mensual, analisisMensual.serieConLineaTendencia]);

  // ── NIVEL DE DETALLE ADAPTATIVO (mensual → diaria) ──────────────────
  const rangoFechasExplicito = !!(filters.fechaInicial && filters.fechaFinal);
  const unSoloMesSeleccionado = filters.mes.length === 1 && !filters.fechaInicial && !filters.fechaFinal;
  const nivelDetalle: NivelDetalleTendencia = rangoFechasExplicito || unSoloMesSeleccionado ? 'diaria' : 'mensual';

  const { datosDiarios, tituloSufijoPeriodo } = useMemo(() => {
    if (nivelDetalle !== 'diaria') return { datosDiarios: [] as PuntoDiarioComparado[], tituloSufijoPeriodo: '' };

    let inicio: Date | null = null;
    let fin: Date | null = null;
    if (rangoFechasExplicito) {
      inicio = parsearFechaLocal(filters.fechaInicial!);
      fin = parsearFechaLocal(filters.fechaFinal!);
    } else {
      const mesNum = Number(filters.mes[0]);
      inicio = new Date(ventana.anioActual, mesNum - 1, 1);
      fin = new Date(ventana.anioActual, mesNum, 0); // día 0 del mes siguiente = último día de este mes
    }
    if (!inicio || !fin || inicio > fin) return { datosDiarios: [] as PuntoDiarioComparado[], tituloSufijoPeriodo: '' };

    // Conteo por fecha EXACTA (clave local, nunca UTC — ver
    // formatFechaISOLocal) a partir de "recordsBase": ya respeta todos los
    // demás filtros activos (delito, estación, zona, etc.) salvo
    // año/mes/fecha, que es justo lo que este bloque necesita reemplazar
    // por su propio rango calculado.
    const conteoPorFecha = new Map<string, number>();
    for (const r of recordsBase) {
      if (!r.fecha) continue;
      const k = formatFechaISOLocal(r.fecha);
      conteoPorFecha.set(k, (conteoPorFecha.get(k) || 0) + 1);
    }

    const claveAnioActual = String(ventana.anioActual);
    const claveAnioAnterior = String(ventana.anioAnterior);
    const datos: PuntoDiarioComparado[] = [];
    const cursor = new Date(inicio);
    const primerDia = new Date(inicio);
    while (cursor <= fin) {
      // Mismo día del mes, año anterior — corresponde exactamente (misma
      // posición calendario), tal como se pidió: "15 junio 2026 → 15 junio
      // 2025", nunca un desplazamiento por cantidad de días transcurridos.
      const diaAnioAnterior = new Date(ventana.anioAnterior, cursor.getMonth(), cursor.getDate());
      datos.push({
        dia: `${String(cursor.getDate()).padStart(2, '0')}/${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        [claveAnioActual]: conteoPorFecha.get(formatFechaISOLocal(cursor)) ?? 0,
        [claveAnioAnterior]: conteoPorFecha.get(formatFechaISOLocal(diaAnioAnterior)) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const sufijo = rangoFechasExplicito
      ? `${formatDiaMes(primerDia)} al ${formatDiaMes(fin)}`
      : NOMBRES_MES_LARGO[Number(filters.mes[0]) - 1].replace(/^./, (c) => c.toUpperCase());

    return { datosDiarios: datos, tituloSufijoPeriodo: sufijo };
  }, [nivelDetalle, rangoFechasExplicito, filters.fechaInicial, filters.fechaFinal, filters.mes, recordsBase, ventana.anioActual, ventana.anioAnterior]);

  return {
    ventana, todos, mensualConTendencia, analisisMensual,
    nivelDetalle, datosDiarios, tituloSufijoPeriodo,
    seriesKeysDiarias: [String(ventana.anioAnterior), String(ventana.anioActual)],
  };
}
