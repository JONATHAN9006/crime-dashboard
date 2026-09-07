import type { FilaComparativaCategoria } from '../../hooks/useComparativoHomologo';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Tabla comparativa con el mismo formato de los reportes de referencia:
// [Categoría | TOTAL año anterior | Año anterior A LA FECHA | Año actual A
// LA FECHA | DIF | % | APORTE %]
// "TOTAL {anioAnterior}" es el total GENERAL de esa vigencia (el mismo
// valor en todas las filas, como referencia histórica) — no debe
// confundirse con la columna "{anioAnterior}" de cada fila, que sigue
// siendo el valor específico de esa categoría.
// DIF/% con fondo rojo cuando el comportamiento es desfavorable (aumento) y
// verde cuando es favorable (disminución), igual que en los reportes de Excel.
export function ComparativoCategoriaTable({
  data, etiqueta, anioActual, anioAnterior, onRowClick, limite = 10,
}: {
  data: FilaComparativaCategoria[];
  etiqueta: string;
  anioActual: number;
  anioAnterior: number;
  onRowClick?: (key: string) => void;
  limite?: number;
}) {
  const filas = data.slice(0, limite);
  const totalAnterior = filas.reduce((a, f) => a + f.anterior, 0);
  const totalActual = filas.reduce((a, f) => a + f.actual, 0);
  const totalDif = totalActual - totalAnterior;
  const totalPct = totalAnterior > 0 ? (totalDif / totalAnterior) * 100 : null;
  const totalAnioAnteriorCompletoGeneral = filas.reduce((a, f) => a + f.totalAnioAnteriorCompleto, 0);
  const maxAporte = Math.max(...filas.map((f) => f.aportePct), 1);

  function colorCelda(valor: number | null) {
    if (valor === null) return 'bg-slate-100 text-slate-500';
    if (valor > 0.01) return 'bg-rose-500 text-white';
    if (valor < -0.01) return 'bg-emerald-500 text-white';
    return 'bg-amber-400 text-white';
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col className="w-[24%]" />
          <col className="w-[13%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[12%]" />
          <col className="w-[11%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="rounded-tl-lg bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white truncate">{etiqueta.toUpperCase()}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[12px] font-semibold leading-tight text-white">TOTAL {anioAnterior}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">{anioAnterior}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">{anioActual}</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">DIF</th>
            <th className="bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">%</th>
            <th className="rounded-tr-lg bg-brand-green px-2 py-2 text-center text-[13px] font-semibold text-white">APORTE %</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr
              key={f.key}
              onClick={() => onRowClick?.(f.key)}
              className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} ${onRowClick ? 'cursor-pointer hover:bg-brand-green/5' : ''}`}
            >
              <td className="truncate px-2 py-2 text-center text-[15px] font-medium text-slate-800" title={f.key}>{f.key}</td>
              <td className="px-2 py-2 text-center text-[15px] text-slate-400">{formatNumero(f.totalAnioAnteriorCompleto)}</td>
              <td className="px-2 py-2 text-center text-[17px] text-slate-600">{formatNumero(f.anterior)}</td>
              <td className="px-2 py-2 text-center text-[17px] text-slate-600">{formatNumero(f.actual)}</td>
              <td className={`px-2 py-2 text-center text-[17px] font-semibold ${colorCelda(f.diferencia === 0 ? 0 : f.diferencia)}`}>
                {f.diferencia >= 0 ? '+' : ''}{formatNumero(f.diferencia)}
              </td>
              <td className={`px-2 py-2 text-center text-[17px] font-semibold ${colorCelda(f.variacionPct)}`}>
                {f.variacionPct === null ? 'N/A' : `${f.variacionPct >= 0 ? '+' : ''}${formatDecimal(f.variacionPct, 0)}%`}
              </td>
              <td className="px-2 py-2">
                <div className="flex items-center justify-center gap-1">
                  <span className="w-11 shrink-0 text-right text-[13px] text-slate-500">{formatDecimal(f.aportePct, 1)}%</span>
                  <div className="h-2 w-8 shrink-0 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${(f.aportePct / maxAporte) * 100}%` }} />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-brand-green-dark text-[15px] font-bold text-white">
            <td className="rounded-bl-lg px-2 py-2 text-center">TOTAL</td>
            <td className="px-2 py-2 text-center">{formatNumero(totalAnioAnteriorCompletoGeneral)}</td>
            <td className="px-2 py-2 text-center">{formatNumero(totalAnterior)}</td>
            <td className="px-2 py-2 text-center">{formatNumero(totalActual)}</td>
            <td className="px-2 py-2 text-center">{totalDif >= 0 ? '+' : ''}{formatNumero(totalDif)}</td>
            <td className="px-2 py-2 text-center">{totalPct === null ? 'N/A' : `${totalPct >= 0 ? '+' : ''}${formatDecimal(totalPct, 0)}%`}</td>
            <td className="rounded-br-lg px-2 py-2 text-center">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
