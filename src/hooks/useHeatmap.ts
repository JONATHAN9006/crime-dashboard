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

// ── Escala de concentración (metodología documentada) ──────────────────────
// ÍNDICE DE CONCENTRACIÓN = casos de la celda ÷ casos que tendría si el total
// se repartiera parejo entre todas las celdas (total ÷ 168 por hora, total ÷
// 28 por franja). 1,0× = lo esperado; 2,0× = el doble de lo esperado.
//   cero        → 0 casos (se distingue de «sin dato»: los registros sin día
//                 u hora no entran en ninguna celda y se informan aparte)
//   baja        → menos de 0,75×
//   media-baja  → 0,75× a 1,25×
//   media       → 1,25× a 1,75×
//   alta        → 1,75× a 2,5×
//   crítica     → más de 2,5×
// Como se mide contra el promedio del propio conjunto, un color significa lo
// mismo con cualquier año, periodo o filtro (es comparable), y no depende de
// cuántos casos haya en total.
export type NivelCalor = 'cero' | 'baja' | 'media-baja' | 'media' | 'alta' | 'crítica';
export const CORTES_INDICE: [number, number, number, number] = [0.75, 1.25, 1.75, 2.5];

export function nivelPorIndice(indice: number, valor: number): NivelCalor {
  if (valor <= 0) return 'cero';
  if (indice < CORTES_INDICE[0]) return 'baja';
  if (indice < CORTES_INDICE[1]) return 'media-baja';
  if (indice < CORTES_INDICE[2]) return 'media';
  if (indice < CORTES_INDICE[3]) return 'alta';
  return 'crítica';
}

/** Nivel de cada valor de un conjunto (celdas o totales), según su índice de concentración. */
export function calcularNiveles(valores: number[]): (v: number) => NivelCalor {
  const total = valores.reduce((a, b) => a + b, 0);
  const esperado = valores.length > 0 ? total / valores.length : 0;
  return (v: number) => (esperado > 0 ? nivelPorIndice(v / esperado, v) : 'cero');
}

export interface CeldaHeatmap {
  diaIndex: number;
  dia: string; // identificador crudo (LUNES, MARTES...) para filtrar
  diaLabel: string; // etiqueta visual (Lunes, Martes...)
  columnaIndex: number;
  columna: string; // identificador para filtrar (hora exacta "0".."23", o franja completa)
  columnaLabel: string; // etiqueta visual corta
  valor: number;
  porcentaje: number;
  /** Casos ÷ casos esperados si el total se repartiera parejo (1 = promedio). */
  indice: number;
  nivel: NivelCalor;
}

export interface MaximoHeatmap { label: string; valor: string; casos: number; /** Otras etiquetas con el mismo máximo (empates). */ empates: string[] }

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
  diaMax: MaximoHeatmap | null;
  columnaMax: MaximoHeatmap | null;
  celdaMax: CeldaHeatmap | null;
  /** Cuántas celdas comparten el valor máximo (1 = sin empate). */
  celdasEnMaximo: number;
  momentosCriticos: CeldaHeatmap[];
  /** Registros que no entran en ninguna celda porque les falta el día o la hora/franja. */
  sinDiaOHora: number;
  /** Casos esperados por celda si el total se repartiera parejo. */
  esperadoPorCelda: number;
}

function maximoConEmpates(totales: number[], etiquetas: string[], valores: string[]): MaximoHeatmap | null {
  const max = Math.max(0, ...totales);
  if (max <= 0) return null;
  const idx = totales.map((v, i) => (v === max ? i : -1)).filter((i) => i >= 0);
  return { label: etiquetas[idx[0]], valor: valores[idx[0]], casos: max, empates: idx.slice(1).map((i) => etiquetas[i]) };
}

export function useHeatmap(records: CrimeRecord[], vista: VistaHeatmap): HeatmapResumen {
  return useMemo(() => {
    const columnasValor = vista === 'hora' ? Array.from({ length: 24 }, (_, i) => String(i)) : FRANJAS_ORDEN;
    const columnasLabel = vista === 'hora' ? columnasValor.map((h) => h.padStart(2, '0')) : FRANJAS_ETIQUETA_CORTA;
    const nCols = columnasValor.length;

    const matriz: number[][] = DIAS_ORDEN.map(() => new Array(nCols).fill(0));
    let sinDiaOHora = 0;

    for (const r of records) {
      if (r.diaSemanaIndex === null || r.diaSemanaIndex === undefined) { sinDiaOHora++; continue; }
      const colIndex = vista === 'hora'
        ? (r.hora === null || r.hora === undefined ? -1 : r.hora)
        : FRANJAS_ORDEN.indexOf(r.franjaHoraria);
      if (colIndex < 0 || colIndex >= nCols) { sinDiaOHora++; continue; }
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

    const nCeldas = DIAS_ORDEN.length * nCols;
    const esperadoPorCelda = totalGeneral / nCeldas;
    const diasLabel = DIAS_ORDEN.map((d) => d.charAt(0) + d.slice(1).toLowerCase());

    const celdas: CeldaHeatmap[] = [];
    for (let d = 0; d < DIAS_ORDEN.length; d++) {
      for (let c = 0; c < nCols; c++) {
        const valor = matriz[d][c];
        const indice = esperadoPorCelda > 0 ? valor / esperadoPorCelda : 0;
        celdas.push({
          diaIndex: d,
          dia: DIAS_ORDEN[d],
          diaLabel: diasLabel[d],
          columnaIndex: c,
          columna: columnasValor[c],
          columnaLabel: columnasLabel[c],
          valor,
          porcentaje: totalGeneral ? (valor / totalGeneral) * 100 : 0,
          indice,
          nivel: nivelPorIndice(indice, valor),
        });
      }
    }

    const celdaMax = celdas.reduce<CeldaHeatmap | null>((best, c) => (!best || c.valor > best.valor ? c : best), null);
    const celdasEnMaximo = celdaMax && celdaMax.valor > 0 ? celdas.filter((c) => c.valor === celdaMax.valor).length : 0;
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
      diaMax: maximoConEmpates(totalesFila, diasLabel, DIAS_ORDEN),
      columnaMax: maximoConEmpates(totalesColumna, columnasLabel, columnasValor),
      celdaMax: celdaMax && celdaMax.valor > 0 ? celdaMax : null,
      celdasEnMaximo,
      momentosCriticos,
      sinDiaOHora,
      esperadoPorCelda,
    };
  }, [records, vista]);
}
