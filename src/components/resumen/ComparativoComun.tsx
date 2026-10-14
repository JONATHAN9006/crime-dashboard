import clsx from 'clsx';
import { Percent } from 'lucide-react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Piezas compartidas por las tablas comparativas con la estética de la
// tabla institucional (Operatividad, Delitos, Casos por estación).

/** Variación % con su color según lo que signifique: en Operatividad subir
 *  es bueno (verde); en Delitos subir es malo (rojo). ▲ / ▼ indican el sentido. */
export function VariacionPct({ anterior, actual, subirEsBueno, negrita = false, compacta = false }: { anterior: number; actual: number; subirEsBueno: boolean; negrita?: boolean; compacta?: boolean }) {
  const dif = actual - anterior;
  const pct = anterior > 0 ? (dif / anterior) * 100 : null;
  const sinCambio = Math.abs(dif) < 1e-9;
  const bueno = subirEsBueno ? dif > 0 : dif < 0;
  const clase = sinCambio ? 'bg-slate-100 text-slate-500' : bueno ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700';
  return (
    <span className={clsx('inline-flex items-center justify-end rounded-md py-[2px] tabular-nums', compacta ? 'min-w-0 gap-0.5 px-1' : 'min-w-[74px] gap-1 px-1.5', clase, negrita ? 'font-extrabold' : 'font-bold')}>
      <span aria-hidden className="text-[11px]">{sinCambio ? '■' : dif > 0 ? '▲' : '▼'}</span>
      {pct === null ? (actual > 0 ? 'Nuevo' : '—') : `${pct > 0 ? '+' : ''}${formatDecimal(pct, 1)}%`}
    </span>
  );
}

/** Color del texto de la diferencia (mismo criterio que la variación %). */
export function claseDif(dif: number, subirEsBueno: boolean): string {
  if (Math.abs(dif) < 1e-9) return 'text-slate-500';
  return (subirEsBueno ? dif > 0 : dif < 0) ? 'text-emerald-700' : 'text-rose-600';
}

/** Botón «Aporte»: muestra u oculta la columna de aporte (oculta por defecto). */
export function BotonAporte({ activo, onChange }: { activo: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!activo)}
      aria-pressed={activo}
      title={activo ? 'Ocultar el aporte' : 'Mostrar el aporte de cada fila'}
      className={clsx('flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition', activo ? 'border-[#10233f] bg-[#10233f] text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}
    >
      <Percent size={12} /> Aporte
    </button>
  );
}

export interface FilaSimple { key: string; anterior: number; actual: number; totalAnterior?: number }

/** Tabla comparativa sencilla (una fila por elemento + TOTAL) con la estética
 *  institucional. Aporte = participación de la fila en `totalReferencia`
 *  (por defecto, el total del año actual de las filas mostradas). */
export function TablaComparativaSimple({ filas, etiqueta, anioAnterior, anioActual, subirEsBueno, mostrarAporte, totalReferencia, onRowClick, seleccionados = [], compacta = false }: {
  compacta?: boolean; // tarjetas angostas: letra y espacios un poco menores para que quepa sin desplazarse
  filas: FilaSimple[];
  etiqueta: string;
  anioAnterior: number;
  anioActual: number;
  subirEsBueno: boolean;
  mostrarAporte: boolean;
  totalReferencia?: number;
  onRowClick?: (key: string) => void;
  seleccionados?: string[];
}) {
  const totAnt = filas.reduce((a, f) => a + f.anterior, 0);
  const totAct = filas.reduce((a, f) => a + f.actual, 0);
  // Columna «Total año anterior» (año completo) solo si las filas la traen.
  const conTotal = filas.some((f) => f.totalAnterior !== undefined);
  const totTot = filas.reduce((a, f) => a + (f.totalAnterior ?? 0), 0);
  const ref = totalReferencia ?? totAct;
  const aporte = (n: number) => (ref > 0 ? `${formatDecimal((n / ref) * 100, 1)}%` : '—');
  const celda = compacta ? 'border-b border-slate-200 px-1.5 py-[6px]' : 'border-b border-slate-200 px-2 py-[7px]';
  const fmtDif = (n: number) => `${n > 0 ? '+' : ''}${formatNumero(n)}`;
  // En tarjetas angostas el aporte va debajo de la cifra del año actual (no
  // como columna aparte), para que la tabla quepa sin desplazarse.
  const columnaAporte = mostrarAporte && !compacta;
  const aporteDebajo = (n: number) => (mostrarAporte && compacta ? <span className="block whitespace-nowrap text-[11px] font-semibold text-[#1d4ed8]">{aporte(n)} aporte</span> : null);
  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full border-separate border-spacing-0', compacta ? 'text-[13.5px]' : 'min-w-[460px] text-[15px]')}>
        <thead>
          <tr className="text-white">
            <th rowSpan={2} className="rounded-tl-md bg-[#0f5f57] px-3 py-2 text-left text-[14px] font-bold uppercase">{etiqueta}</th>
            {conTotal && <th rowSpan={2} title={`Total del año ${anioAnterior} completo`} className="bg-[#1e3a5f] px-1.5 py-2 text-center text-[12px] font-bold uppercase leading-tight">Total<span className={`block ${compacta ? 'text-[14px]' : 'text-[15px]'}`}>{anioAnterior}</span></th>}
            <th rowSpan={2} className={`bg-[#10233f] px-2 py-2 text-center ${compacta ? 'text-[15px]' : 'text-[17px]'} font-bold`}>{anioAnterior}</th>
            <th rowSpan={2} className={`bg-[#10233f] px-2 py-2 text-center ${compacta ? 'text-[15px]' : 'text-[17px]'} font-bold`}>{anioActual}</th>
            <th colSpan={2} className={clsx('bg-[#0f5f57] px-1.5 pt-1.5 text-center text-[13px] font-bold uppercase', !columnaAporte && 'rounded-tr-md')}>Variación</th>
            {columnaAporte && <th rowSpan={2} className="rounded-tr-md bg-[#0f5f57] px-2 py-2 text-center text-[13px] font-bold uppercase">Aporte</th>}
          </tr>
          <tr className="text-white">
            <th className="bg-[#0f5f57] px-1.5 pb-1.5 text-center text-[12.5px] font-bold uppercase">Dif.</th>
            <th className="bg-[#0f5f57] px-1.5 pb-1.5 text-center text-[12.5px] font-bold">%</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const marcado = seleccionados.includes(f.key);
            return (
              <tr
                key={f.key}
                onClick={onRowClick ? () => onRowClick(f.key) : undefined}
                title={onRowClick ? (marcado ? 'Clic para quitar el filtro' : `Filtrar por ${f.key}`) : undefined}
                className={clsx(onRowClick && 'cursor-pointer hover:bg-slate-50', marcado && 'bg-[#e3f2ef]')}
              >
                <td className={`${celda} font-semibold text-[#10233f]`}>{marcado ? '✓ ' : ''}{f.key}</td>
                {conTotal && <td className={`${celda} text-center tabular-nums text-slate-500`}>{formatNumero(f.totalAnterior ?? 0)}</td>}
                <td className={`${celda} text-center tabular-nums text-slate-700`}>{formatNumero(f.anterior)}</td>
                <td className={`${celda} text-center tabular-nums text-slate-700`}>{formatNumero(f.actual)}{aporteDebajo(f.actual)}</td>
                <td className={`${celda} w-[1%] whitespace-nowrap text-center font-semibold tabular-nums ${claseDif(f.actual - f.anterior, subirEsBueno)}`}>{fmtDif(f.actual - f.anterior)}</td>
                <td className={`${celda} w-[1%] whitespace-nowrap text-right ${compacta ? 'text-[12.5px]' : 'text-[13.5px]'}`}><VariacionPct anterior={f.anterior} actual={f.actual} subirEsBueno={subirEsBueno} compacta /></td>
                {columnaAporte && <td className={`${celda} text-center tabular-nums text-slate-700`}>{aporte(f.actual)}</td>}
              </tr>
            );
          })}
          <tr className="bg-slate-200/70 font-bold text-[#10233f]">
            <td className="border-b-2 border-slate-300 px-3 py-[7px] text-[13.5px] uppercase">Total</td>
            {conTotal && <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums text-slate-600">{formatNumero(totTot)}</td>}
            <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{formatNumero(totAnt)}</td>
            <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{formatNumero(totAct)}{aporteDebajo(totAct)}</td>
            <td className={`whitespace-nowrap border-b-2 border-slate-300 px-1.5 py-[7px] text-center tabular-nums ${claseDif(totAct - totAnt, subirEsBueno)}`}>{fmtDif(totAct - totAnt)}</td>
            <td className="whitespace-nowrap border-b-2 border-slate-300 px-2 py-[7px] text-right text-[13.5px]"><VariacionPct anterior={totAnt} actual={totAct} subirEsBueno={subirEsBueno} negrita compacta /></td>
            {columnaAporte && <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{aporte(totAct)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
