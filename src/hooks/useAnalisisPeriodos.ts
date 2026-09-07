import { useMemo } from 'react';
import type { CrimeRecord } from '../types/crime';
import { agruparPor, participacionPct, totalCasos, semanaIso } from '../utils/aggregations';

export interface PeriodoDef {
  etiqueta: string;
  inicio: Date;
  fin: Date;
}

export interface PeriodoConTotal extends PeriodoDef {
  total: number;
}

export interface DelitoPorPeriodo {
  delito: string;
  valores: number[]; // uno por periodo, mismo orden
  variacionAbs: number; // último periodo - primero
  variacionPct: number | null;
  tendencia: 'aumenta' | 'disminuye' | 'estable';
}

export interface ResumenPeriodos {
  disponible: boolean;
  periodos: PeriodoConTotal[];
  porDelito: DelitoPorPeriodo[];
  delitoMayorAumento: DelitoPorPeriodo | null;
  delitoMayorDisminucion: DelitoPorPeriodo | null;
  totalVentana: number;
  variacionTotalPct: number | null;
  estacionTop: { key: string; casos: number } | null;
  armasTop: { key: string; casos: number }[];
  horaTop: { key: string; casos: number } | null;
  cuadrantesTop: { key: string; casos: number }[];
  causaLesionTop: { key: string; casos: number }[];
  claseSitioTop: { key: string; casos: number }[];
  barriosTop: { key: string; casos: number; participacion: number }[];
  franjaTop: { key: string; casos: number; participacion: number } | null;
  registrosVentana: CrimeRecord[];
}

const RESUMEN_VACIO: ResumenPeriodos = {
  disponible: false, periodos: [], porDelito: [], delitoMayorAumento: null, delitoMayorDisminucion: null,
  totalVentana: 0, variacionTotalPct: null, estacionTop: null, armasTop: [], horaTop: null,
  cuadrantesTop: [], causaLesionTop: [], claseSitioTop: [], barriosTop: [], franjaTop: null, registrosVentana: [],
};

/**
 * Motor genérico de análisis por tramos de tiempo: recibe una lista arbitraria
 * de períodos (pueden ser 4 semanas, los días de un mes, o cualquier otra
 * definición) y calcula exactamente el mismo tipo de desglose (top delitos
 * por período, armas/cuadrantes/barrios/causa de lesión/clase de sitio más
 * frecuentes, franja horaria más afectada) — usado tanto por "Últimas 4
 * semanas" como por los modos "Semanas seleccionadas" y "Mes" del selector.
 */
export function useAnalisisPeriodos(records: CrimeRecord[], periodosDef: PeriodoDef[]): ResumenPeriodos {
  return useMemo(() => {
    if (periodosDef.length === 0) return RESUMEN_VACIO;
    const conFecha = records.filter((r) => r.fecha);
    if (conFecha.length === 0) return RESUMEN_VACIO;

    const inicioVentana = new Date(Math.min(...periodosDef.map((p) => p.inicio.getTime())));
    const finVentana = new Date(Math.max(...periodosDef.map((p) => p.fin.getTime())));
    const registrosVentana = conFecha.filter((r) => r.fecha! >= inicioVentana && r.fecha! <= finVentana);

    const periodos: PeriodoConTotal[] = periodosDef.map((p) => ({
      ...p,
      total: totalCasos(registrosVentana.filter((r) => r.fecha! >= p.inicio && r.fecha! <= p.fin)),
    }));

    const delitos = Array.from(new Set(registrosVentana.map((r) => r.delito)));
    const porDelito: DelitoPorPeriodo[] = delitos.map((delito) => {
      const valores = periodosDef.map((p) =>
        totalCasos(registrosVentana.filter((r) => r.delito === delito && r.fecha! >= p.inicio && r.fecha! <= p.fin)),
      );
      const primero = valores[0];
      const ultimo = valores[valores.length - 1];
      const variacionAbs = ultimo - primero;
      const variacionPct = primero > 0 ? (variacionAbs / primero) * 100 : (ultimo > 0 ? null : 0);
      let tendencia: DelitoPorPeriodo['tendencia'] = 'estable';
      if (variacionAbs > 0) tendencia = 'aumenta';
      else if (variacionAbs < 0) tendencia = 'disminuye';
      return { delito, valores, variacionAbs, variacionPct, tendencia };
    }).sort((a, b) => b.valores[b.valores.length - 1] - a.valores[a.valores.length - 1]);

    const conVariacion = porDelito.filter((d) => d.valores[0] + d.valores[d.valores.length - 1] >= 3);
    const delitoMayorAumento = [...conVariacion].sort((a, b) => b.variacionAbs - a.variacionAbs)[0] || null;
    const delitoMayorDisminucion = [...conVariacion].sort((a, b) => a.variacionAbs - b.variacionAbs)[0] || null;

    const totalVentana = totalCasos(registrosVentana);
    const totalPrimero = periodos[0]?.total ?? 0;
    const totalUltimo = periodos[periodos.length - 1]?.total ?? 0;
    const variacionTotalPct = totalPrimero > 0 ? ((totalUltimo - totalPrimero) / totalPrimero) * 100 : null;

    const porEstacion = agruparPor(registrosVentana, (r) => r.estacion);
    const porArma = agruparPor(registrosVentana, (r) => r.armas).filter((a) => a.key !== 'NO REPORTADO');
    const porHora = agruparPor(registrosVentana, (r) => (r.hora !== null ? `${String(r.hora).padStart(2, '0')}:00` : 'NO REPORTADO'));
    const porCuadrante = agruparPor(registrosVentana, (r) => r.cuadrante).filter((c) => c.key !== 'NO REPORTADO');
    const porCausaLesion = agruparPor(registrosVentana, (r) => r.causaLesion).filter((c) => c.key !== 'NO REPORTADO');
    const porClaseSitio = agruparPor(registrosVentana, (r) => r.claseSitio).filter((c) => c.key !== 'NO REPORTADO');
    const porBarrio = agruparPor(registrosVentana, (r) => r.barrioHecho).filter((b) => b.key !== 'NO REPORTADO');
    const porFranja = agruparPor(registrosVentana, (r) => r.franjaHoraria).filter((f) => f.key !== 'NO REPORTADO');
    const totalParaPct = totalCasos(registrosVentana);

    return {
      disponible: true,
      periodos,
      porDelito,
      delitoMayorAumento,
      delitoMayorDisminucion,
      totalVentana,
      variacionTotalPct,
      estacionTop: porEstacion[0] ? { key: porEstacion[0].key, casos: porEstacion[0].casos } : null,
      armasTop: porArma.slice(0, 5).map((a) => ({ key: a.key, casos: a.casos })),
      horaTop: porHora[0] ? { key: porHora[0].key, casos: porHora[0].casos } : null,
      cuadrantesTop: porCuadrante.slice(0, 5).map((c) => ({ key: c.key, casos: c.casos })),
      causaLesionTop: porCausaLesion.slice(0, 5).map((c) => ({ key: c.key, casos: c.casos })),
      claseSitioTop: porClaseSitio.slice(0, 5).map((c) => ({ key: c.key, casos: c.casos })),
      barriosTop: porBarrio.slice(0, 5).map((b) => ({ key: b.key, casos: b.casos, participacion: participacionPct(b.casos, totalParaPct) })),
      franjaTop: porFranja[0] ? { key: porFranja[0].key, casos: porFranja[0].casos, participacion: participacionPct(porFranja[0].casos, totalParaPct) } : null,
      registrosVentana,
    };
  }, [records, periodosDef]);
}

// ------------------------------------------------------------------------
// Utilidades para construir las listas de "semanas disponibles" y "meses
// disponibles" a partir de los datos reales (nada se supone ni se escribe a mano).
// ------------------------------------------------------------------------

export interface SemanaDisponible {
  anio: number;
  semana: number;
  inicio: Date;
  fin: Date;
  etiqueta: string;
}

export function useSemanasDisponibles(records: CrimeRecord[]): SemanaDisponible[] {
  return useMemo(() => {
    const mapa = new Map<string, { anio: number; semana: number; fechas: Date[] }>();
    for (const r of records) {
      if (!r.fecha) continue;
      const semana = semanaIso(r.fecha);
      const anio = r.fecha.getFullYear();
      const clave = `${anio}-${semana}`;
      if (!mapa.has(clave)) mapa.set(clave, { anio, semana, fechas: [] });
      mapa.get(clave)!.fechas.push(r.fecha);
    }
    return Array.from(mapa.values())
      .map(({ anio, semana, fechas }) => {
        const inicio = new Date(Math.min(...fechas.map((f) => f.getTime())));
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(Math.max(...fechas.map((f) => f.getTime())));
        fin.setHours(23, 59, 59, 999);
        return { anio, semana, inicio, fin, etiqueta: `Semana ${semana} (${anio})` };
      })
      .sort((a, b) => (a.anio - b.anio) || (a.semana - b.semana));
  }, [records]);
}

export interface MesDisponible {
  anioMes: string; // "2026-08"
  etiqueta: string; // "Agosto 2026"
  inicio: Date;
  fin: Date;
}

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function useMesesDisponibles(records: CrimeRecord[]): MesDisponible[] {
  return useMemo(() => {
    const mapa = new Map<string, Date[]>();
    for (const r of records) {
      if (!r.fecha || r.anioMes === 'SIN FECHA') continue;
      if (!mapa.has(r.anioMes)) mapa.set(r.anioMes, []);
      mapa.get(r.anioMes)!.push(r.fecha);
    }
    return Array.from(mapa.entries())
      .map(([anioMes, fechas]) => {
        const [anioStr, mesStr] = anioMes.split('-');
        const inicio = new Date(Math.min(...fechas.map((f) => f.getTime())));
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(Math.max(...fechas.map((f) => f.getTime())));
        fin.setHours(23, 59, 59, 999);
        return { anioMes, etiqueta: `${NOMBRES_MES[Number(mesStr) - 1]} ${anioStr}`, inicio, fin };
      })
      .sort((a, b) => a.anioMes.localeCompare(b.anioMes));
  }, [records]);
}

// Divide un mes en tramos semanales (lunes a domingo dentro del mes, acotado
// a los extremos del mes) para poder graficar la evolución dentro del mes,
// igual que se hace con las 4 semanas.
export function dividirEnSemanas(inicio: Date, fin: Date): PeriodoDef[] {
  const tramos: PeriodoDef[] = [];
  let cursor = new Date(inicio);
  let n = 1;
  while (cursor <= fin) {
    const diaSemanaIdx = (cursor.getDay() + 6) % 7; // lunes=0
    const finTramo = new Date(cursor);
    finTramo.setDate(finTramo.getDate() + (6 - diaSemanaIdx));
    finTramo.setHours(23, 59, 59, 999);
    const finReal = finTramo > fin ? new Date(fin) : finTramo;
    tramos.push({ etiqueta: `Semana ${semanaIso(cursor)}`, inicio: new Date(cursor), fin: finReal });
    cursor = new Date(finReal);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
    n++;
    if (n > 10) break; // salvaguarda
  }
  return tramos;
}
