import { useMemo } from 'react';
import type { CrimeRecord, FilterState } from '../types/crime';
import { agruparPor, participacionPct, totalCasos } from '../utils/aggregations';
import { useTendenciaDiaSemana, useDistribucionHoraria } from './useTemporalAnalysis';
import { useVentanaComparativa, useComparativoGeneral, useComparativoCategoria } from './useComparativoHomologo';

export interface Insight {
  tipo: 'info' | 'alerta' | 'positivo';
  texto: string;
}

// recordsBase = filtrado por todo excepto año/mes/fecha (ver DataContext).
// Con esto, la variación "frente al año anterior" usa exactamente el mismo
// motor homólogo (useComparativoHomologo) que Indicadores, Análisis por
// Unidad — así todos los módulos muestran la misma
// cifra para el mismo dato.
export function useHallazgosPrincipales(
  records: CrimeRecord[],
  recordsBase: CrimeRecord[],
  filters: FilterState,
  todosLosRegistros?: CrimeRecord[],
  fechaMaxParametro?: Date | null,
): Insight[] {
  const ventana = useVentanaComparativa(recordsBase, filters, todosLosRegistros, fechaMaxParametro);
  // Todos los hallazgos de "el X con mayor incidencia" deben reflejar
  // EXCLUSIVAMENTE la vigencia más reciente (2026 al momento de escribir
  // esto) — igual que ya corregimos en los KPI de arriba. Antes usaban
  // "records" tal cual, que mezclaba TODOS los años (verificado: "Hurto
  // Personas" daba 6.865 = 4.035 de 2025 completo + 2.830 de 2026, en vez
  // de mostrar solo el año en curso).
  const registrosVigenciaActual = useMemo(
    () => (ventana.disponible ? records.filter((r) => r.anio === ventana.anioActual) : records),
    [records, ventana.disponible, ventana.anioActual],
  );
  const porDia = useTendenciaDiaSemana(registrosVigenciaActual);
  const porHora = useDistribucionHoraria(registrosVigenciaActual);
  const comparativoGeneral = useComparativoGeneral(ventana);
  const comparativoDelitos = useComparativoCategoria(ventana, (r) => r.delito, 200);

  return useMemo(() => {
    const insights: Insight[] = [];
    if (registrosVigenciaActual.length === 0) return insights;

    const total = totalCasos(registrosVigenciaActual);
    const porDelito = agruparPor(registrosVigenciaActual, (r) => r.delito);
    const porEstacion = agruparPor(registrosVigenciaActual, (r) => r.estacion);
    const porBarrio = agruparPor(registrosVigenciaActual, (r) => r.barrioHecho);
    const porModalidad = agruparPor(registrosVigenciaActual, (r) => r.modalidad);

    if (porDelito[0]) {
      insights.push({ tipo: 'info', texto: `El delito con mayor incidencia es "${porDelito[0].key}", con ${porDelito[0].casos} casos (${participacionPct(porDelito[0].casos, total).toFixed(1)}% del total).` });
    }
    if (porEstacion[0]) {
      insights.push({ tipo: 'info', texto: `La estación con mayor incidencia es "${porEstacion[0].key}", concentrando el ${participacionPct(porEstacion[0].casos, total).toFixed(1)}% de los casos.` });
    }
    if (porBarrio[0]) {
      insights.push({ tipo: 'info', texto: `El barrio con mayor incidencia es "${porBarrio[0].key}", con ${porBarrio[0].casos} casos.` });
    }

    const diaCritico = [...porDia].sort((a, b) => b.casos - a.casos)[0];
    if (diaCritico) {
      insights.push({ tipo: 'info', texto: `El día con mayor incidencia es ${diaCritico.dia}, con ${diaCritico.casos} casos registrados.` });
    }

    const horaCritica = [...porHora].sort((a, b) => b.casos - a.casos)[0];
    if (horaCritica) {
      const finHora = (horaCritica.horaNum + 1) % 24;
      insights.push({ tipo: 'info', texto: `El horario con mayor incidencia es ${horaCritica.hora} - ${String(finHora).padStart(2, '0')}:59.` });
    }

    if (porModalidad[0] && porModalidad[0].key !== 'NO REPORTADO') {
      insights.push({ tipo: 'info', texto: `La modalidad predominante es "${porModalidad[0].key}", con ${porModalidad[0].casos} casos.` });
    }

    if (ventana.disponible && comparativoGeneral.casosAnterior > 0) {
      const pct = comparativoGeneral.variacionPct ?? 0;
      insights.push({
        tipo: pct > 0 ? 'alerta' : 'positivo',
        texto: `Frente a ${ventana.anioAnterior} (a la fecha), ${ventana.anioActual} presenta una variación de ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% en el total de casos.`,
      });
    }

    // Delitos con mayor crecimiento / disminución (comparación homóloga)
    const crecientes = [...comparativoDelitos].filter((d) => d.variacionPct !== null && d.anterior >= 3).sort((a, b) => (b.variacionPct ?? 0) - (a.variacionPct ?? 0));
    if (crecientes[0] && (crecientes[0].variacionPct ?? 0) > 0) {
      insights.push({ tipo: 'alerta', texto: `El delito "${crecientes[0].key}" presenta el mayor incremento relativo (${(crecientes[0].variacionPct ?? 0).toFixed(1)}%) respecto al año anterior, a la fecha.` });
    }
    const decrecientes = [...crecientes].reverse();
    if (decrecientes[0] && (decrecientes[0].variacionPct ?? 0) < 0) {
      insights.push({ tipo: 'positivo', texto: `El delito "${decrecientes[0].key}" presenta la mayor disminución relativa (${(decrecientes[0].variacionPct ?? 0).toFixed(1)}%) respecto al año anterior, a la fecha.` });
    }

    return insights;
  }, [registrosVigenciaActual, ventana, comparativoGeneral, comparativoDelitos, porDia, porHora]);
}

export function useCuadrantesCriticos(records: CrimeRecord[], limite = 5) {
  return useMemo(() => {
    const total = totalCasos(records);
    return agruparPor(records, (r) => r.cuadrante)
      .filter((c) => c.key && c.key !== 'NO REPORTADO')
      .slice(0, limite)
      .map((c) => ({ ...c, participacion: participacionPct(c.casos, total) }));
  }, [records, limite]);
}

export function useBarriosCriticos(records: CrimeRecord[], limite = 5) {
  return useMemo(() => {
    const total = totalCasos(records);
    return agruparPor(records, (r) => r.barrioHecho)
      .filter((c) => c.key && c.key !== 'NO REPORTADO')
      .slice(0, limite)
      .map((c) => ({ ...c, participacion: participacionPct(c.casos, total) }));
  }, [records, limite]);
}
