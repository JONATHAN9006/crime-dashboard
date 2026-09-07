import { useMemo } from 'react';
import type { CrimeRecord } from '../types/crime';
import { agruparPor, participacionPct, totalCasos } from '../utils/aggregations';

export function useRanking(records: CrimeRecord[], getter: (r: CrimeRecord) => string, limite?: number) {
  return useMemo(() => {
    const agrupado = agruparPor(records, getter);
    const total = totalCasos(records);
    const conParticipacion = agrupado.map((item, idx) => ({
      ...item,
      posicion: idx + 1,
      participacion: participacionPct(item.casos, total),
    }));
    return limite ? conParticipacion.slice(0, limite) : conParticipacion;
  }, [records, getter, limite]);
}

export function useUrbanoRural(records: CrimeRecord[]) {
  return useMemo(() => {
    const agrupado = agruparPor(records, (r) => (r.zona === 'RURAL' ? 'RURAL' : r.zona === 'URBANO' || r.zona === 'URBANA' ? 'URBANO' : 'NO REPORTADO'));
    const total = totalCasos(records);
    return agrupado.map((item) => ({ ...item, participacion: participacionPct(item.casos, total) }));
  }, [records]);
}

// NOTA: la comparación "vigencia actual vs. anterior" (por delito, estación,
// cuadrante, etc.) vive exclusivamente en hooks/useComparativoHomologo.ts
// (useComparativoCategoria), que aplica el corte "a la fecha" correcto y
// reacciona al filtro de fecha inicial/final. Antes existía aquí una versión
// que comparaba años calendario completos (01/01–31/12) sin ese corte, lo que
// producía cifras distintas a las de Análisis por Unidad / Ranking de
// Estaciones para el mismo dato — esa versión fue retirada para evitar
// exactamente ese tipo de inconsistencia.
