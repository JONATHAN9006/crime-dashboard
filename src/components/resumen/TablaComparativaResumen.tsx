import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Tabla de los dos comparativos del Resumen (Delitos y Operatividad), con
// el mismo lenguaje visual de la imagen de referencia: encabezado verde
// petróleo, DIF y % en celda de color sólido, APORTE % con barra pequeña y
// fila TOTAL destacada. Solo presenta: las cifras llegan calculadas desde
// ResumenEjecutivo (no calcula nada por su cuenta).

export interface FilaComparativaResumen {
  key: string;
  totalAnioAnteriorCompleto: number;
  anterior: number;
  actual: number;
  diferencia: number;
  variacionPct: number | null;
  aportePct: number | null;
}

export function TablaComparativaResumen({ filas, etiqueta, anioAnterior, anioActual, invertirColores = false, alinearNombre = 'left', aporteTotal }: {
  filas: FilaComparativaResumen[];
  etiqueta: string;
  anioAnterior: number;
  anioActual: number;
  // Operatividad: más = favorable (verde). Delitos: más = desfavorable (rojo).
  invertirColores?: boolean;
  alinearNombre?: 'left' | 'center';
  // Texto de la celda APORTE % en la fila TOTAL (ej. "100%" o la suma visible).
  aporteTotal: string;
}) {
  const totalCompleto = filas.reduce((a, f) => a + f.totalAnioAnteriorCompleto, 0);
  const totalAnterior = filas.reduce((a, f) => a + f.anterior, 0);
  const totalActual = filas.reduce((a, f) => a + f.actual, 0);
  const totalDif = totalActual - totalAnterior;
  const totalPct = totalAnterior > 0 ? (totalDif / totalAnterior) * 100 : null;
  const maxAbs = Math.max(1, ...filas.map((f) => Math.abs(f.aportePct ?? 0)));

  const desfavorable = (v: number) => (invertirColores ? v < 0 : v > 0);
  const celda = (v: number | null) => {
    if (v === null || Math.abs(v) < 0.0001) return 'bg-amber-400 text-white';
    return desfavorable(v) ? 'bg-[#ef3e55] text-white' : 'bg-[#25b36a] text-white';
  };
  const pctTexto = (v: number | null) => (v === null ? 'N/A' : `${v > 0 ? '+' : ''}${formatDecimal(v, 1)}%`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-0 text-[13px]">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[11%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[11%]" />
          <col className="w-[26%]" />
        </colgroup>
        <thead>
          <tr className="text-[12px] font-semibold uppercase text-white">
            <th className="rounded-tl-md bg-[#0f5f57] px-2 py-2 text-center">{etiqueta}</th>
            <th className="bg-[#0f5f57] px-2 py-2 text-center">Total {anioAnterior}</th>
            <th className="bg-[#0f5f57] px-2 py-2 text-center">{anioAnterior}</th>
            <th className="bg-[#0f5f57] px-2 py-2 text-center">{anioActual}</th>
            <th className="bg-[#0f5f57] px-2 py-2 text-center">Dif</th>
            <th className="bg-[#0f5f57] px-2 py-2 text-center">%</th>
            <th className="rounded-tr-md bg-[#0f5f57] px-2 py-2 text-center">Aporte %</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const aporte = f.aportePct ?? 0;
            // Barra de aporte en azul claro en las dos tablas (a pedido); el
            // signo lo sigue indicando el número (negativo = el delito bajó).
            const colorBarra = Math.abs(aporte) < 0.0001 ? 'bg-slate-300' : 'bg-sky-400';
            return (
              <tr key={f.key}>
                <td className={`truncate border-b border-slate-100 px-3 py-[5px] text-slate-800 ${alinearNombre === 'center' ? 'text-center' : 'text-left'}`} title={f.key}>{f.key}</td>
                <td className="border-b border-slate-100 px-2 py-[5px] text-center text-slate-400">{formatNumero(f.totalAnioAnteriorCompleto)}</td>
                <td className="border-b border-slate-100 px-2 py-[5px] text-center text-slate-700">{formatNumero(f.anterior)}</td>
                <td className="border-b border-slate-100 px-2 py-[5px] text-center text-slate-700">{formatNumero(f.actual)}</td>
                <td className={`border-b border-white/60 px-2 py-[5px] text-center font-bold ${celda(f.diferencia)}`}>{f.diferencia > 0 ? '+' : ''}{formatNumero(f.diferencia)}</td>
                <td className={`border-b border-white/60 px-2 py-[5px] text-center font-bold ${celda(f.variacionPct)}`}>{pctTexto(f.variacionPct)}</td>
                <td className="border-b border-slate-100 px-2 py-[5px]">
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${colorBarra}`} style={{ width: `${Math.max(2, (Math.abs(aporte) / maxAbs) * 100)}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right text-slate-700">{f.aportePct === null ? '—' : `${formatDecimal(aporte, 1)}%`}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="text-[13.5px] font-bold text-white">
            <td className="rounded-bl-md bg-[#0f5f57] px-3 py-2 text-center">TOTAL</td>
            <td className="bg-[#0f5f57] px-2 py-2 text-center">{formatNumero(totalCompleto)}</td>
            <td className="bg-[#0f5f57] px-2 py-2 text-center">{formatNumero(totalAnterior)}</td>
            <td className="bg-[#0f5f57] px-2 py-2 text-center">{formatNumero(totalActual)}</td>
            <td className="bg-[#0f5f57] px-2 py-2 text-center">{totalDif > 0 ? '+' : ''}{formatNumero(totalDif)}</td>
            <td className="bg-[#0f5f57] px-2 py-2 text-center">{pctTexto(totalPct)}</td>
            <td className="rounded-br-md bg-[#0f5f57] px-2 py-2 text-center">{aporteTotal}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
