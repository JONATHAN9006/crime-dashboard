import { formatDecimal, formatNumero } from '../../utils/aggregations';

export interface FilaDesglose {
  concepto: string;
  totalAnteriorCompleto: number;
  anterior: number; // año anterior a la misma fecha
  actual: number;
}

// Comparativo de Operatividad DESGLOSADO, como el informe institucional:
// [CONCEPTO | TOTAL año anterior | año anterior a la fecha | año actual | DIF | %].
// Sin fila de TOTAL ni columna de aporte: las filas mezclan unidades
// distintas (capturas, casos, armas, gramos, pastillas) y sumarlas o
// sacarles porcentaje de participación no tendría sentido.
// Colores como en Operatividad: más = verde (favorable), menos = rojo,
// igual = amarillo.
export function ComparativoOperatividadDesglosado({ filas, anioAnterior, anioActual }: { filas: FilaDesglose[]; anioAnterior: number; anioActual: number }) {
  function color(dif: number) {
    if (dif > 0) return 'bg-emerald-500 text-white';
    if (dif < 0) return 'bg-rose-500 text-white';
    return 'bg-amber-300 text-slate-800';
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col className="w-[37%]" />
          <col className="w-[13%]" />
          <col className="w-[12.5%]" />
          <col className="w-[12.5%]" />
          <col className="w-[13.5%]" />
          <col className="w-[11.5%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="rounded-tl-lg bg-brand-green px-2 py-2 text-left text-[13px] font-semibold text-white">CONCEPTO</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[12px] font-semibold leading-tight text-white">TOTAL {anioAnterior}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">{anioAnterior}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">{anioActual}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">DIF</th>
            <th className="rounded-tr-lg bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">%</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => {
            const dif = f.actual - f.anterior;
            const pct = f.anterior > 0 ? (dif / f.anterior) * 100 : f.actual > 0 ? null : 0;
            return (
              <tr key={f.concepto} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="border-b border-slate-100 px-2 py-1.5 text-left text-[12px] font-medium leading-tight text-slate-800" title={f.concepto}>
                  {/* Nombre en mayúsculas y la unidad tal cual — "COCAÍNA (Gr)", como en el informe. */}
                  {f.concepto.replace(/\s*\(.*\)$/, '').toUpperCase()}
                  {/\(.*\)$/.test(f.concepto) && <span className="ml-1 text-slate-500">{f.concepto.match(/\(.*\)$/)![0]}</span>}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-center text-[12px] text-slate-400">{formatNumero(Math.round(f.totalAnteriorCompleto))}</td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-center text-[13px] text-slate-600">{formatNumero(Math.round(f.anterior))}</td>
                <td className="border-b border-slate-100 px-2 py-1.5 text-center text-[13px] text-slate-600">{formatNumero(Math.round(f.actual))}</td>
                <td className={`border-b border-white/40 px-1 py-1.5 text-center text-[13px] font-semibold ${color(Math.round(dif))}`}>
                  {Math.round(dif) > 0 ? '+' : ''}{formatNumero(Math.round(dif))}
                </td>
                <td className="border-b border-slate-100 bg-slate-100 px-1 py-1.5 text-center text-[12px] font-semibold text-slate-700">
                  {pct === null ? 'N/A' : `${pct > 0 ? '+' : ''}${formatDecimal(pct, 0)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10.5px] text-slate-400">
        Capturas, recuperaciones, mercancía y armas: número de registros. Drogas: suma de la columna CANTIDAD (gramos; pastillas en drogas de síntesis).
      </p>
    </div>
  );
}
