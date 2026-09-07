import { useMemo } from 'react';
import type { CrimeRecord } from '../types/crime';
import {
  agruparPor, minMaxDiario, participacionPct, promedioDiario, promedioMensual,
  totalCasos, totalRegistros,
} from '../utils/aggregations';

export interface KpiResumen {
  totalRegistros: number;
  totalCasos: number;
  delitoTop: { key: string; casos: number } | null;
  estacionTop: { key: string; casos: number } | null;
  barrioTop: { key: string; casos: number } | null;
  promedioDiario: number;
  promedioMensual: number;
  maxDiario: number;
  minDiario: number;
  participacionDelitoTop: number;
}

// Únicamente identifica qué años hay disponibles en los datos (para etiquetas
// de UI, selectores, etc). NO se debe usar para calcular totales "vigencia
// actual vs. anterior" — eso es responsabilidad exclusiva de
// hooks/useComparativoHomologo.ts, que aplica el corte "a la fecha" correcto.
// Mantener una única fuente evita que dos componentes muestren cifras distintas
// para el mismo dato (ver hooks/useComparativoHomologo.ts para el detalle).
export function useAniosComparables(records: CrimeRecord[]) {
  return useMemo(() => {
    const anios = Array.from(new Set(records.filter((r) => r.anio).map((r) => r.anio!))).sort((a, b) => b - a);
    const actual = anios[0] ?? null;
    const anterior = anios[1] ?? null;
    return { actual, anterior, todos: anios.sort((a, b) => a - b) };
  }, [records]);
}

// KPIs que NO dependen de comparar vigencias (esos casos van en
// useComparativoHomologo.ts). Estos sí reflejan literalmente los filtros
// aplicados (incluida la fecha), como corresponde a un "resumen de lo filtrado".
export function useKpis(records: CrimeRecord[]): KpiResumen {
  return useMemo(() => {
    const porDelito = agruparPor(records, (r) => r.delito);
    const porEstacion = agruparPor(records, (r) => r.estacion);
    const porBarrio = agruparPor(records, (r) => r.barrioHecho);

    const total = totalCasos(records);
    const { min, max } = minMaxDiario(records);

    return {
      totalRegistros: totalRegistros(records),
      totalCasos: total,
      delitoTop: porDelito[0] ? { key: porDelito[0].key, casos: porDelito[0].casos } : null,
      estacionTop: porEstacion[0] ? { key: porEstacion[0].key, casos: porEstacion[0].casos } : null,
      barrioTop: porBarrio[0] ? { key: porBarrio[0].key, casos: porBarrio[0].casos } : null,
      promedioDiario: promedioDiario(records),
      promedioMensual: promedioMensual(records),
      maxDiario: max,
      minDiario: min,
      participacionDelitoTop: porDelito[0] ? participacionPct(porDelito[0].casos, total) : 0,
    };
  }, [records]);
}
