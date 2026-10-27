import { useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

interface Row {
  key: string;
  actual: number;
  anterior: number;
  diferencia: number;
  variacionPct: number | null;
}

export function VariationTable({ data, etiqueta, anioActual, anioAnterior }: {
  data: Row[];
  etiqueta: string;
  anioActual: number | null;
  anioAnterior: number | null;
}) {
  const [orden, setOrden] = useState<'desc' | 'asc'>('desc');
  const ordenado = [...data].sort((a, b) => {
    const av = a.variacionPct ?? -Infinity;
    const bv = b.variacionPct ?? -Infinity;
    return orden === 'desc' ? bv - av : av - bv;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2">{etiqueta}</th>
            <th className="py-2 pr-2 text-right">{anioAnterior ?? 'Año anterior'}</th>
            <th className="py-2 pr-2 text-right">{anioActual ?? 'Año actual'}</th>
            <th className="py-2 pr-2 text-right">Diferencia</th>
            <th
              className="py-2 pr-2 text-right cursor-pointer select-none"
              onClick={() => setOrden(orden === 'desc' ? 'asc' : 'desc')}
            >
              Variación % {orden === 'desc' ? '↓' : '↑'}
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenado.map((row) => {
            const subiendo = (row.variacionPct ?? 0) > 0.01;
            const bajando = (row.variacionPct ?? 0) < -0.01;
            return (
              <tr key={row.key} className="border-b border-slate-100 last:border-0">
                <td className="py-2 pr-2 font-medium text-slate-800">{row.key}</td>
                <td className="py-2 pr-2 text-right text-slate-500">{formatNumero(row.anterior)}</td>
                <td className="py-2 pr-2 text-right text-slate-500">{formatNumero(row.actual)}</td>
                <td className="py-2 pr-2 text-right text-slate-500">{row.diferencia >= 0 ? '+' : ''}{formatNumero(row.diferencia)}</td>
                <td className="py-2 pr-2">
                  <div className={`flex items-center justify-end gap-1 font-semibold ${subiendo ? 'text-rose-600' : bajando ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {subiendo && <ArrowUp size={13} />}
                    {bajando && <ArrowDown size={13} />}
                    {!subiendo && !bajando && <Minus size={13} />}
                    {row.variacionPct === null ? 'N/A' : `${formatDecimal(Math.abs(row.variacionPct))}%`}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
