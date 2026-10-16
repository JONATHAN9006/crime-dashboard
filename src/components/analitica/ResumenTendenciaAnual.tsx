import { ArrowDown, BarChart3, CalendarDays, Target, TrendingUp, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { ordenarAniosPorCasos } from '../../utils/coloresAnio';

// Resumen de la Tendencia Anual: tarjetas (total, años, promedio, año con
// más y con menos casos) y los 3 años con más casos. Solo presenta los
// totales por año que ya calculó la tendencia — no cuenta registros.

function Tarjeta({ icono, fondo, titulo, valor, detalle, tono = 'text-[#10233f]' }: { icono: ReactNode; fondo: string; titulo: string; valor: string; detalle?: string; tono?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${fondo}`}>{icono}</span>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-slate-600" title={titulo}>{titulo}</p>
        <p className={`text-[20px] font-extrabold leading-tight tabular-nums ${tono}`}>{valor}</p>
        {detalle && <p className="truncate text-[11px] text-slate-500" title={detalle}>{detalle}</p>}
      </div>
    </div>
  );
}

export function ResumenTendenciaAnual({ datos, etiquetaTotal, notaTotal }: {
  datos: { anio: string; casos: number }[];
  etiquetaTotal: string; // ej. «Total de homicidios» / «Total de casos»
  notaTotal?: string; // ej. «periodo seleccionado» / «4 periodos»
}) {
  if (datos.length === 0) return null;
  const total = datos.reduce((a, d) => a + d.casos, 0);
  const ranking = ordenarAniosPorCasos(datos);
  const mayor = ranking[0];
  const menor = [...datos].sort((a, b) => a.casos - b.casos || Number(a.anio) - Number(b.anio))[0];
  const top = ranking.filter((d) => d.casos > 0).slice(0, 3);
  const anios = datos.map((d) => Number(d.anio)).sort((a, b) => a - b);
  return (
    <div className="mb-3 space-y-2.5">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Tarjeta icono={<Target size={20} className="text-[#0f5f57]" />} fondo="bg-[#e3f2ef]" titulo={etiquetaTotal} valor={formatNumero(total)} detalle={notaTotal ? `casos · ${notaTotal}` : 'casos'} />
        <Tarjeta icono={<CalendarDays size={20} className="text-[#1d4ed8]" />} fondo="bg-blue-50" titulo="Años analizados" valor={String(datos.length)} detalle={anios.length > 1 ? `${anios[0]} – ${anios[anios.length - 1]}` : String(anios[0])} />
        <Tarjeta icono={<BarChart3 size={20} className="text-[#1d4ed8]" />} fondo="bg-blue-50" titulo="Promedio anual" valor={formatDecimal(total / datos.length, 1)} detalle="casos por año" />
        <Tarjeta icono={<TrendingUp size={20} className="text-[#0f5f57]" />} fondo="bg-[#e3f2ef]" titulo="Año con más casos" valor={mayor.anio} detalle={`${formatNumero(mayor.casos)} casos`} tono="text-[#0f5f57]" />
        {datos.length > 1 && (
          <Tarjeta icono={<ArrowDown size={20} className="text-rose-600" />} fondo="bg-rose-50" titulo="Año con menos casos" valor={menor.anio} detalle={`${formatNumero(menor.casos)} casos`} tono="text-rose-600" />
        )}
      </div>
      {top.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2">
          <span className="flex items-center gap-2 pr-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100"><Trophy size={18} className="text-amber-600" /></span>
            <span className="text-[12.5px] font-bold leading-tight text-[#10233f]">Años con mayor<br className="hidden sm:block" /> número de casos</span>
          </span>
          {top.map((d, i) => (
            <span key={d.anio} className="flex items-center gap-2 rounded-lg border border-rose-100 bg-white px-2.5 py-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-[12px] font-extrabold text-white">{i + 1}</span>
              <span className="text-[12.5px] font-bold text-[#10233f]">{d.anio}</span>
              <span className="text-[16px] font-extrabold tabular-nums text-rose-600">{formatNumero(d.casos)}</span>
              <span className="text-[11px] text-slate-500">casos</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
