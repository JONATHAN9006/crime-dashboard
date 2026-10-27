import React from 'react';
import clsx from 'clsx';

interface KpiCardProps {
  titulo: string;
  valor: string;
  subtitulo?: string;
  icono?: React.ReactNode;
  tendencia?: { pct: number | null; label?: string };
  acento?: 'navy' | 'green' | 'gray' | 'red';
  // Permite colorear el VALOR principal (no solo el ícono) — ej. para que
  // "Desfavorable"/"Favorable" o una variación % aparezcan en rojo/verde.
  colorValor?: 'red' | 'green' | 'default';
}

export function KpiCard({ titulo, valor, subtitulo, icono, tendencia, acento = 'navy', colorValor = 'default' }: KpiCardProps) {
  const acentoClasses: Record<string, string> = {
    navy: 'bg-brand-navy/5 text-brand-navy',
    green: 'bg-brand-green/10 text-brand-green',
    gray: 'bg-slate-100 text-slate-600',
    red: 'bg-rose-50 text-rose-600',
  };
  const valorClasses: Record<string, string> = {
    red: 'text-rose-600',
    green: 'text-emerald-600',
    default: 'text-slate-900',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
        {icono && <div className={clsx('rounded-lg p-2', acentoClasses[acento])}>{icono}</div>}
      </div>
      <p className={clsx('mt-2 text-2xl font-bold leading-tight line-clamp-2', valorClasses[colorValor])} title={typeof valor === 'string' ? valor : undefined}>{valor}</p>
      <div className="mt-1 flex items-center gap-2">
        {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        {tendencia && tendencia.pct !== null && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold',
              tendencia.pct > 0 ? 'bg-rose-50 text-rose-600' : tendencia.pct < 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500',
            )}
          >
            {tendencia.pct > 0 ? '▲' : tendencia.pct < 0 ? '▼' : '—'} {Math.abs(tendencia.pct).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
