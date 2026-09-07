import { useMemo } from 'react';
import type { CrimeRecord } from '../types/crime';
import { agruparPor, participacionPct, totalCasos, semanaIso } from '../utils/aggregations';

const MS_DIA = 86400000;

export interface SemanaInfo {
  nombre: string;
  inicio: Date;
  fin: Date;
  total: number;
}

export interface DelitoSemanal {
  delito: string;
  semanas: number[]; // [s1, s2, s3, s4]
  variacionAbs: number; // semana4 - semana1
  variacionPct: number | null;
  tendencia: 'aumenta' | 'disminuye' | 'estable';
}

export interface UltimasSemanasResumen {
  disponible: boolean;
  semanas: SemanaInfo[];
  porDelito: DelitoSemanal[];
  delitoMayorAumento: DelitoSemanal | null;
  delitoMayorDisminucion: DelitoSemanal | null;
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

export function useUltimasSemanas(records: CrimeRecord[]): UltimasSemanasResumen {
  return useMemo(() => {
    const conFecha = records.filter((r) => r.fecha);
    if (conFecha.length === 0) {
      return {
        disponible: false, semanas: [], porDelito: [], delitoMayorAumento: null, delitoMayorDisminucion: null,
        totalVentana: 0, variacionTotalPct: null, estacionTop: null, armasTop: [], horaTop: null,
        cuadrantesTop: [], causaLesionTop: [], claseSitioTop: [], barriosTop: [], franjaTop: null, registrosVentana: [],
      };
    }

    const maxTs = Math.max(...conFecha.map((r) => r.fecha!.getTime()));
    const maxFecha = new Date(maxTs);
    const diaFin = new Date(maxFecha.getFullYear(), maxFecha.getMonth(), maxFecha.getDate());

    function ventana(offsetInicio: number, offsetFin: number): SemanaInfo {
      const inicio = new Date(diaFin.getTime() - offsetInicio * MS_DIA);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(diaFin.getTime() - offsetFin * MS_DIA);
      fin.setHours(23, 59, 59, 999);
      // Etiqueta con el número de semana ISO real (ej. "Semana 30"), calculado
      // a partir de la fecha de cierre de cada ventana — no un contador
      // genérico 1-4, para que coincida con la semana real del calendario.
      const nombre = `Semana ${semanaIso(fin)}`;
      return { nombre, inicio, fin, total: 0 };
    }

    const semanasBase = [
      ventana(27, 21),
      ventana(20, 14),
      ventana(13, 7),
      ventana(6, 0),
    ];
    // Marca la más reciente para quien la use en textos (ej. PowerPoint).
    semanasBase[3] = { ...semanasBase[3], nombre: `${semanasBase[3].nombre} (más reciente)` };

    const inicioVentana = semanasBase[0].inicio;
    const finVentana = semanasBase[3].fin;
    const registrosVentana = conFecha.filter((r) => r.fecha! >= inicioVentana && r.fecha! <= finVentana);

    const semanas = semanasBase.map((s) => ({
      ...s,
      total: totalCasos(registrosVentana.filter((r) => r.fecha! >= s.inicio && r.fecha! <= s.fin)),
    }));

    const delitos = Array.from(new Set(registrosVentana.map((r) => r.delito)));
    const porDelito: DelitoSemanal[] = delitos.map((delito) => {
      const valores = semanasBase.map((s) =>
        totalCasos(registrosVentana.filter((r) => r.delito === delito && r.fecha! >= s.inicio && r.fecha! <= s.fin)),
      );
      const [s1, , , s4] = valores;
      const variacionAbs = s4 - s1;
      const variacionPct = s1 > 0 ? (variacionAbs / s1) * 100 : (s4 > 0 ? null : 0);
      let tendencia: DelitoSemanal['tendencia'] = 'estable';
      if (variacionAbs > 0) tendencia = 'aumenta';
      else if (variacionAbs < 0) tendencia = 'disminuye';
      return { delito, semanas: valores, variacionAbs, variacionPct, tendencia };
    }).sort((a, b) => (b.semanas[3] - a.semanas[3]));

    const conVariacion = porDelito.filter((d) => d.semanas[0] + d.semanas[3] >= 3); // evita ruido de casos aislados
    const delitoMayorAumento = [...conVariacion].sort((a, b) => b.variacionAbs - a.variacionAbs)[0] || null;
    const delitoMayorDisminucion = [...conVariacion].sort((a, b) => a.variacionAbs - b.variacionAbs)[0] || null;

    const totalVentana = totalCasos(registrosVentana);
    const totalS1 = semanas[0].total;
    const totalS4 = semanas[3].total;
    const variacionTotalPct = totalS1 > 0 ? ((totalS4 - totalS1) / totalS1) * 100 : null;

    const porEstacion = agruparPor(registrosVentana, (r) => r.estacion);
    const porArma = agruparPor(registrosVentana, (r) => r.armas).filter((a) => a.key !== 'NO REPORTADO');
    const porHora = agruparPor(registrosVentana, (r) => (r.hora !== null ? `${String(r.hora).padStart(2, '0')}:00` : 'NO REPORTADO'));
    const porCuadrante = agruparPor(registrosVentana, (r) => r.cuadrante).filter((c) => c.key !== 'NO REPORTADO');
    const porCausaLesion = agruparPor(registrosVentana, (r) => r.causaLesion).filter((c) => c.key !== 'NO REPORTADO');
    const porClaseSitio = agruparPor(registrosVentana, (r) => r.claseSitio).filter((c) => c.key !== 'NO REPORTADO');
    const porBarrio = agruparPor(registrosVentana, (r) => r.barrioHecho).filter((b) => b.key !== 'NO REPORTADO');
    // Horario más afectado: por franja (Madrugada/Mañana/Tarde/Noche), no por hora exacta.
    const porFranja = agruparPor(registrosVentana, (r) => r.franjaHoraria).filter((f) => f.key !== 'NO REPORTADO');
    const totalVentanaParaPct = totalCasos(registrosVentana);

    return {
      disponible: true,
      semanas,
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
      barriosTop: porBarrio.slice(0, 5).map((b) => ({ key: b.key, casos: b.casos, participacion: participacionPct(b.casos, totalVentanaParaPct) })),
      franjaTop: porFranja[0] ? { key: porFranja[0].key, casos: porFranja[0].casos, participacion: participacionPct(porFranja[0].casos, totalVentanaParaPct) } : null,
      registrosVentana,
    };
  }, [records]);
}
