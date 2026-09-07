import clsx from 'clsx';
import { AlertTriangle, Info, TrendingDown } from 'lucide-react';
import type { Insight } from '../../hooks/useInsights';

export function InsightList({ insights, titulo }: { insights: Insight[]; titulo?: string }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        No hay suficiente información para generar hallazgos con los filtros actuales.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {titulo && <h3 className="mb-3 text-sm font-semibold text-slate-800">{titulo}</h3>}
      <ul className="space-y-2.5">
        {insights.map((ins, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span
              className={clsx(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                ins.tipo === 'alerta' && 'bg-rose-50 text-rose-600',
                ins.tipo === 'positivo' && 'bg-emerald-50 text-emerald-600',
                ins.tipo === 'info' && 'bg-brand-navy/5 text-brand-navy',
              )}
            >
              {ins.tipo === 'alerta' && <AlertTriangle size={13} />}
              {ins.tipo === 'positivo' && <TrendingDown size={13} />}
              {ins.tipo === 'info' && <Info size={13} />}
            </span>
            <span className="text-slate-700">{ins.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
