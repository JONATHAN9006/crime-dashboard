import { useMemo, useState, type ReactNode } from 'react';
import { Card } from '../ui/Card';
import { TrendChart } from '../charts/TrendChart';
import { GroupedBarChart } from '../charts/GroupedBarChart';
import { TendenciaAnualChart } from '../charts/TendenciaAnualChart';
import { ResumenTendenciaAnual } from './ResumenTendenciaAnual';
import { CheckboxModo } from './ComportamientoDelDelito';
import { MESES_NOMBRES, formatNumero } from '../../utils/aggregations';
import { colorAnio } from '../../utils/coloresAnio';
import type { CrimeRecord } from '../../types/crime';

// Tendencia Mensual / Anual del ANÁLISIS MULTIFECHA. Recibe los registros
// ya recortados a los periodos elegidos (unión sin duplicar, con todos los
// filtros: delito, estación…) y solo los agrupa por año y mes:
//  · con un delito elegido → solo ese delito;
//  · sin delito → el total de todos los delitos (nunca vacío ni en cero).
// Cada año muestra únicamente los casos de los periodos de ese año.

export function TendenciaMultifecha({ registros, aniosPeriodos, sumaPorPeriodos, cantidadPeriodos, delitos, icono }: {
  registros: CrimeRecord[]; // unión de los periodos (registros únicos)
  aniosPeriodos: number[]; // años que tocan los periodos elegidos (aunque tengan 0 casos)
  sumaPorPeriodos: number; // suma de los conteos de cada periodo (para advertir solapes)
  cantidadPeriodos: number;
  delitos: string[]; // filtro de delito activo ([] = todos)
  icono?: ReactNode;
}) {
  const [modo, setModo] = useState<'mensual' | 'anual'>('anual');
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const sufijo = delitos.length === 0 ? 'Todos los Delitos' : delitos.join(', ');
  const titulo = `${modo === 'anual' ? 'Tendencia Anual' : 'Tendencia Mensual'} — ${sufijo}`;

  const { porAnio, mensual, meses } = useMemo(() => {
    const anios = Array.from(new Set([...aniosPeriodos, ...registros.map((r) => r.fecha?.getFullYear()).filter((a): a is number => !!a)])).sort((a, b) => a - b);
    const porAnio = new Map<number, number>(anios.map((a) => [a, 0]));
    const celdas = new Map<string, number>();
    const mesesUsados = new Set<number>();
    for (const r of registros) {
      if (!r.fecha) continue;
      const a = r.fecha.getFullYear();
      const m = r.fecha.getMonth();
      porAnio.set(a, (porAnio.get(a) ?? 0) + 1);
      celdas.set(`${a}-${m}`, (celdas.get(`${a}-${m}`) ?? 0) + 1);
      mesesUsados.add(m);
    }
    const meses = Array.from(mesesUsados).sort((a, b) => a - b);
    const mensual = meses.map((m) => {
      const fila: Record<string, string | number | null> = { mes: MESES_NOMBRES[m] };
      for (const a of anios) fila[String(a)] = celdas.get(`${a}-${m}`) ?? 0;
      return fila;
    });
    return { porAnio, mensual, meses };
  }, [registros, aniosPeriodos]);

  const seriesKeys = Array.from(porAnio.keys()).map(String);
  const visibles = seriesKeys.filter((k) => !ocultos.has(k));
  const colores = Object.fromEntries(seriesKeys.map((k, i) => [k, colorAnio(i, seriesKeys.length)]));
  const datosAnuales = visibles.map((k) => ({ anio: k, casos: porAnio.get(Number(k)) ?? 0, color: colores[k] }));
  const solape = sumaPorPeriodos - registros.length;

  return (
    <Card
      title={titulo}
      subtitle={`${modo === 'anual' ? 'Casos totales por año' : 'Casos por mes'} · solo las fechas de los ${cantidadPeriodos} periodo(s) elegidos`}
      descargable="tendencia-multifecha"
      icono={icono}
      claseTitulo="text-[15px] font-bold text-[#10233f]"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {seriesKeys.map((anio) => (
            <CheckboxModo key={anio} etiqueta={anio} color={colores[anio]} activo={!ocultos.has(anio)}
              onClick={() => setOcultos((prev) => { const n = new Set(prev); if (n.has(anio)) n.delete(anio); else if (n.size < seriesKeys.length - 1) n.add(anio); return n; })} />
          ))}
          <div role="radiogroup" aria-label="Vista de la tendencia" className="ml-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <CheckboxModo tipo="radio" etiqueta="Mensual" activo={modo === 'mensual'} onClick={() => setModo('mensual')} />
            <CheckboxModo tipo="radio" etiqueta="Anual" activo={modo === 'anual'} onClick={() => setModo('anual')} />
          </div>
        </div>
      }
    >
      {registros.length === 0 && aniosPeriodos.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Define al menos un periodo con fecha inicial y final.</p>
      ) : modo === 'anual' ? (
        <>
          <ResumenTendenciaAnual datos={datosAnuales} etiquetaTotal="Total de casos" notaTotal={`${sufijo} · ${cantidadPeriodos} periodo(s)`} />
          <TendenciaAnualChart datos={datosAnuales} top={Math.min(3, datosAnuales.length)} />
        </>
      ) : meses.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No hay casos en los periodos elegidos.</p>
      ) : (
        meses.length <= 2
          // Con 1 o 2 meses una línea no dice nada (los puntos quedan encimados):
          // barras agrupadas por mes, una por año, con su cifra encima.
          ? <GroupedBarChart data={mensual} xKey="mes" seriesKeys={visibles} seriesColors={colores} resaltarMaximo resaltarTopN={3} conservarColorDestacado height={320} />
          : <TrendChart data={mensual} xKey="mes" seriesKeys={visibles} seriesColors={colores} resaltarMaximos={Math.min(3, mensual.length)} />
      )}
      {solape > 0 && (
        <p data-ocultar-en-descarga="1" className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-800">
          Hay periodos que se superponen: la suma de los periodos es {formatNumero(sumaPorPeriodos)}, pero {formatNumero(solape)} registro(s) caen en más de uno. Aquí cada registro se cuenta una sola vez ({formatNumero(registros.length)}).
        </p>
      )}
    </Card>
  );
}
