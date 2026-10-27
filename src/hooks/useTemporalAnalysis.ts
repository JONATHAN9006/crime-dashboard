import { useMemo } from 'react';
import type { CrimeRecord } from '../types/crime';
import { DIAS_ORDEN, MESES_NOMBRES } from '../utils/aggregations';

export function useTendenciaMensual(records: CrimeRecord[]) {
  return useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const r of records) {
      if (!r.mes || !r.anio) continue;
      const key = String(r.mes);
      if (!map.has(key)) {
        map.set(key, { mes: MESES_NOMBRES[r.mes - 1], mesIndex: r.mes });
      }
      const entry = map.get(key)!;
      const anioKey = String(r.anio);
      entry[anioKey] = (entry[anioKey] || 0) + 1;
    }
    return Array.from(map.values()).sort((a, b) => a.mesIndex - b.mesIndex);
  }, [records]);
}

export function useTendenciaDiaSemana(records: CrimeRecord[]) {
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const dia of DIAS_ORDEN) map.set(dia, 0);
    for (const r of records) {
      if (!r.diaSemana) continue;
      map.set(r.diaSemana, (map.get(r.diaSemana) || 0) + 1);
    }
    return DIAS_ORDEN.map((dia) => ({ dia: dia.charAt(0) + dia.slice(1).toLowerCase(), casos: map.get(dia) || 0 }));
  }, [records]);
}

export function useDistribucionHoraria(records: CrimeRecord[]) {
  return useMemo(() => {
    const map = new Map<number, number>();
    for (let h = 0; h < 24; h++) map.set(h, 0);
    for (const r of records) {
      if (r.hora === null) continue;
      map.set(r.hora, (map.get(r.hora) || 0) + 1);
    }
    // Etiqueta visual simplificada ("12" en vez de "12:00") — solo cambia
    // cómo se ve en el eje/tooltip; "horaNum" (la hora real, sin formatear)
    // sigue intacto para cualquier cálculo u ordenamiento.
    return Array.from(map.entries()).map(([hora, casos]) => ({ hora: String(hora), horaNum: hora, casos }));
  }, [records]);
}

const NOMBRES_MES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// "r.fecha.toISOString()" convierte a UTC — como r.fecha se construye en
// hora LOCAL (medianoche local, ver csvParser.ts), en cualquier zona
// horaria con desfase negativo (ej. Colombia, UTC-5) eso corría la fecha
// un día hacia atrás (medianoche local del 15 se convertía en "14" al pasar
// a UTC). Esta función arma la clave "YYYY-MM-DD" a partir de los
// componentes LOCALES de la fecha, nunca de su representación UTC — la
// misma clave que usa el resto del dashboard para comparar fechas.
export function formatFechaISOLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function useTendenciaDiaria(records: CrimeRecord[]) {
  return useMemo(() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (!r.fecha) continue;
      const key = formatFechaISOLocal(r.fecha);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, casos]) => {
        const d = new Date(fecha + 'T00:00:00');
        return {
          fecha,
          dia: d.getDate(),
          mes: d.getMonth(), // 0-11
          anio: d.getFullYear(),
          mesNombre: NOMBRES_MES_LARGO[d.getMonth()],
          casos,
        };
      });
  }, [records]);
}
