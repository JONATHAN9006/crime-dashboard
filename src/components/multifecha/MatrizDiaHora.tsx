import { useMemo } from 'react';
import clsx from 'clsx';
import type { CrimeRecord } from '../../types/crime';
import { formatNumero } from '../../utils/aggregations';

// Matriz de calor Día × Hora (7 × 24) del multifecha. Recibe los registros
// de la vista elegida (todas las vigencias o una sola) y, si se indica,
// un máximo común para que la escala sea comparable entre vigencias.

export const DIAS_MATRIZ = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** Índice de día con lunes = 0 (desde la fecha real del registro). */
export function diaLunesCero(r: CrimeRecord): number | null {
  if (r.diaSemanaIndex != null && r.diaSemanaIndex >= 0 && r.diaSemanaIndex <= 6) return r.diaSemanaIndex;
  if (!r.fecha) return null;
  return (new Date(r.fecha).getDay() + 6) % 7;
}

export function matrizDiaHora(registros: CrimeRecord[]): number[][] {
  const m = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[]);
  for (const r of registros) {
    const d = diaLunesCero(r);
    if (d == null || r.hora == null || r.hora < 0 || r.hora > 23) continue;
    m[d][r.hora]++;
  }
  return m;
}

export function maxMatriz(m: number[][]): number {
  let max = 0;
  for (const fila of m) for (const v of fila) if (v > max) max = v;
  return max;
}

// Verde → amarillo → naranja → rojo (de menor a mayor concentración).
const PARADAS: [number, [number, number, number]][] = [
  [0, [31, 164, 122]],
  [0.35, [190, 214, 96]],
  [0.55, [246, 207, 58]],
  [0.78, [245, 154, 60]],
  [1, [214, 40, 46]],
];
export function colorCalor(f: number): string {
  const x = Math.max(0, Math.min(1, f));
  for (let i = 1; i < PARADAS.length; i++) {
    const [f1, c1] = PARADAS[i];
    if (x <= f1) {
      const [f0, c0] = PARADAS[i - 1];
      const t = (x - f0) / (f1 - f0 || 1);
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * t)},${Math.round(c0[1] + (c1[1] - c0[1]) * t)},${Math.round(c0[2] + (c1[2] - c0[2]) * t)})`;
    }
  }
  return 'rgb(214,40,46)';
}

export function MatrizDiaHora({ registros, maxEscala, onCelda }: {
  registros: CrimeRecord[];
  /** Máximo común (escala comparable). Si no se da, se usa el de esta matriz. */
  maxEscala?: number;
  onCelda?: (dia: number, hora: number) => void;
}) {
  const m = useMemo(() => matrizDiaHora(registros), [registros]);
  const propio = maxMatriz(m);
  const max = Math.max(1, maxEscala ?? propio, propio);
  const totalesDia = m.map((f) => f.reduce((a, b) => a + b, 0));
  const totalesHora = Array.from({ length: 24 }, (_, h) => m.reduce((a, f) => a + f[h], 0));
  const total = totalesDia.reduce((a, b) => a + b, 0);
  const maxHora = Math.max(1, ...totalesHora);
  const maxDia = Math.max(1, ...totalesDia);

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[620px] gap-[2px] text-[10.5px]" style={{ gridTemplateColumns: '68px repeat(24, minmax(18px, 1fr)) 40px' }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="text-center font-semibold text-slate-500">{h}</div>)}
        <div className="text-right font-bold text-slate-500">Total</div>
        {m.map((fila, d) => (
          <FilaMatriz key={d} dia={d} fila={fila} max={max} total={totalesDia[d]} esMaxDia={totalesDia[d] === maxDia && totalesDia[d] > 0} onCelda={onCelda} />
        ))}
        <div className="pt-0.5 text-right font-bold text-slate-500">Total</div>
        {totalesHora.map((v, h) => (
          <div key={h} className={clsx('pt-0.5 text-center tabular-nums', v === maxHora && v > 0 ? 'font-extrabold text-[#dc2626]' : 'text-slate-500')}>{v || ''}</div>
        ))}
        <div className="pt-0.5 text-right font-extrabold tabular-nums text-[#10233f]">{formatNumero(total)}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
        <span>Menor concentración</span>
        <span className="h-2.5 w-36 rounded-full" style={{ background: `linear-gradient(90deg, ${[0, 0.35, 0.55, 0.78, 1].map((f) => colorCalor(f)).join(',')})` }} />
        <span>Mayor ({formatNumero(max)} caso{max === 1 ? '' : 's'} por celda)</span>
        <span className="ml-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#eef2f0] ring-1 ring-slate-200" /> <span>sin casos</span>
      </div>
    </div>
  );
}

function FilaMatriz({ dia, fila, max, total, esMaxDia, onCelda }: { dia: number; fila: number[]; max: number; total: number; esMaxDia: boolean; onCelda?: (dia: number, hora: number) => void }) {
  return (
    <>
      <div className={clsx('flex items-center justify-end pr-1.5 text-[11px]', esMaxDia ? 'font-extrabold text-[#dc2626]' : 'font-semibold text-slate-600')}>{DIAS_MATRIZ[dia]}</div>
      {fila.map((v, h) => (
        <button
          key={h}
          type="button"
          disabled={!onCelda || v === 0}
          onClick={() => onCelda?.(dia, h)}
          title={`${DIAS_MATRIZ[dia]} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 · ${v} caso${v === 1 ? '' : 's'}`}
          className="flex h-[22px] items-center justify-center rounded-[3px] text-[9.5px] font-bold tabular-nums text-white/95 disabled:cursor-default"
          style={{ background: v > 0 ? colorCalor(v / max) : '#eef2f0' }}
        >
          {v > 0 && v / max >= 0.55 ? v : ''}
        </button>
      ))}
      <div className="flex items-center justify-end text-[11px] font-bold tabular-nums text-[#10233f]">{formatNumero(total)}</div>
    </>
  );
}
