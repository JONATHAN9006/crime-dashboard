import { useMemo } from 'react';
import type { CrimeRecord } from '../types/crime';
import { DIAS_ORDEN } from '../utils/aggregations';

export type VistaHeatmap = 'hora' | 'franja';

export const FRANJAS_ORDEN = [
  'Madrugada (00:00-05:59)',
  'Mañana (06:00-11:59)',
  'Tarde (12:00-17:59)',
  'Noche (18:00-23:59)',
];

const FRANJAS_ETIQUETA_CORTA = ['Madrugada', 'Mañana', 'Tarde', 'Noche'];

export interface CeldaHeatmap {
  diaIndex: number;
  dia: string; // identificador crudo (LUNES, MARTES...) para filtrar
  diaLabel: string; // etiqueta visual (Lunes, Martes...)
  columnaIndex: number;
  columna: string; // identificador para filtrar (hora exacta "0".."23", o franja completa)
  columnaLabel: string; // etiqueta visual corta
  valor: number;
  porcentaje: number;
  nivel: 'sin datos' | 'baja' | 'media' | 'alta' | 'crítica';
}

export interface HeatmapResumen {
  vista: VistaHeatmap;
  matriz: number[][];
  celdas: CeldaHeatmap[];
  diasLabel: string[];
  diasValor: string[];
  columnasLabel: string[];
  columnasValor: string[];
  max: number;
  totalGeneral: number;
  totalesFila: number[]; // total por día
  totalesColumna: number[]; // total por hora/franja
  diaMax: { label: string; valor: string; casos: number } | null;
  columnaMax: { label: string; valor: string; casos: number } | null;
  celdaMax: CeldaHeatmap | null;
  momentosCriticos: CeldaHeatmap[];
}

// Escala de color/nivel dinámica: se basa en cuantiles de los valores reales
// (distintos de cero) del conjunto filtrado actual, no en números fijos. Esto
// evita que un solo valor extremo "aplaste" la escala y deja que los colores
// reflejen la distribución real de los datos vigentes.
function calcularNiveles(valores: number[]): (v: number) => CeldaHeatmap['nivel'] {
  const positivos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (positivos.length === 0) return () => 'sin datos';
  const cuantil = (p: number) => positivos[Math.min(positivos.length - 1, Math.floor(p * (positivos.length - 1)))];
  const q50 = cuantil(0.5);
  const q80 = cuantil(0.8);
  const q95 = cuantil(0.95);
  return (v: number) => {
    if (v <= 0) return 'sin datos';
    if (v <= q50) return 'baja';
    if (v <= q80) return 'media';
    if (v <= q95) return 'alta';
    return 'crítica';
  };
}

export function useHeatmap(records: CrimeRecord[], vista: VistaHeatmap): HeatmapResumen {
  return useMemo(() => {
    const columnasValor = vista === 'hora' ? Array.from({ length: 24 }, (_, i) => String(i)) : FRANJAS_ORDEN;
    const columnasLabel = vista === 'hora' ? columnasValor.map((h) => h.padStart(2, '0')) : FRANJAS_ETIQUETA_CORTA;
    const nCols = columnasValor.length;

    const matriz: number[][] = DIAS_ORDEN.map(() => new Array(nCols).fill(0));

    for (const r of records) {
      if (r.diaSemanaIndex === null) continue;
      const colIndex = vista === 'hora'
        ? (r.hora === null ? -1 : r.hora)
        : FRANJAS_ORDEN.indexOf(r.franjaHoraria);
      if (colIndex < 0) continue;
      matriz[r.diaSemanaIndex][colIndex] += 1;
    }

    let max = 0;
    let totalGeneral = 0;
    const totalesFila = DIAS_ORDEN.map(() => 0);
    const totalesColumna = columnasValor.map(() => 0);
    for (let d = 0; d < DIAS_ORDEN.length; d++) {
      for (let c = 0; c < nCols; c++) {
        const v = matriz[d][c];
        if (v > max) max = v;
        totalGeneral += v;
        totalesFila[d] += v;
        totalesColumna[c] += v;
      }
    }

    const todosLosValores: number[] = [];
    matriz.forEach((fila) => fila.forEach((v) => todosLosValores.push(v)));
    const nivelDe = calcularNiveles(todosLosValores);

    const diasLabel = DIAS_ORDEN.map((d) => d.charAt(0) + d.slice(1).toLowerCase());

    const celdas: CeldaHeatmap[] = [];
    for (let d = 0; d < DIAS_ORDEN.length; d++) {
      for (let c = 0; c < nCols; c++) {
        const valor = matriz[d][c];
        celdas.push({
          diaIndex: d,
          dia: DIAS_ORDEN[d],
          diaLabel: diasLabel[d],
          columnaIndex: c,
          columna: columnasValor[c],
          columnaLabel: columnasLabel[c],
          valor,
          porcentaje: totalGeneral ? (valor / totalGeneral) * 100 : 0,
          nivel: nivelDe(valor),
        });
      }
    }

    const diaMaxIdx = totalesFila.reduce((best, v, i) => (v > totalesFila[best] ? i : best), 0);
    const columnaMaxIdx = totalesColumna.reduce((best, v, i) => (v > totalesColumna[best] ? i : best), 0);
    const celdaMax = celdas.reduce<CeldaHeatmap | null>((best, c) => (!best || c.valor > best.valor ? c : best), null);

    const momentosCriticos = [...celdas].filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 5);

    return {
      vista,
      matriz,
      celdas,
      diasLabel,
      diasValor: DIAS_ORDEN,
      columnasLabel,
      columnasValor,
      max,
      totalGeneral,
      totalesFila,
      totalesColumna,
      diaMax: totalesFila[diaMaxIdx] > 0 ? { label: diasLabel[diaMaxIdx], valor: DIAS_ORDEN[diaMaxIdx], casos: totalesFila[diaMaxIdx] } : null,
      columnaMax: totalesColumna[columnaMaxIdx] > 0 ? { label: columnasLabel[columnaMaxIdx], valor: columnasValor[columnaMaxIdx], casos: totalesColumna[columnaMaxIdx] } : null,
      celdaMax: celdaMax && celdaMax.valor > 0 ? celdaMax : null,
      momentosCriticos,
    };
  }, [records, vista]);
}
