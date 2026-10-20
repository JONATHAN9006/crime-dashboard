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
    <div className="flex items-stretch gap-3">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="grid min-w-[400px] gap-[2px] text-[10px]" style={{ gridTemplateColumns: '62px repeat(24, minmax(12px, 1fr)) 30px' }}>
          {m.map((fila, d) => (
            <FilaMatriz key={d} dia={d} fila={fila} max={max} total={totalesDia[d]} esMaxDia={totalesDia[d] === maxDia && totalesDia[d] > 0} onCelda={onCelda} />
          ))}
          <div />
          {Array.from({ length: 24 }, (_, h) => <div key={h} className={clsx('pt-1 text-center font-semibold', totalesHora[h] === maxHora && maxHora > 0 ? 'text-[#dc2626]' : 'text-slate-500')} title={`${totalesHora[h]} casos a las ${h}:00`}>{h}</div>)}
          <div className="pt-1 text-right font-extrabold tabular-nums text-[#10233f]" title="Total">{formatNumero(total)}</div>
        </div>
      </div>
      <div className="flex shrink-0 items-stretch gap-1.5 py-1 text-[10.5px] font-semibold leading-tight text-slate-600">
        <span className="w-3.5 rounded-sm" style={{ background: `linear-gradient(0deg, ${[0, 0.35, 0.55, 0.78, 1].map((f) => colorCalor(f)).join(',')})` }} />
        <span className="flex w-[62px] flex-col justify-between text-[10px]">
          <span>Mayor concentración<br /><span className="font-normal text-slate-400">{formatNumero(max)} por celda</span></span>
          <span>Menor concentración</span>
        </span>
      </div>
    </div>
  );
}

function FilaMatriz({ dia, fila, max, total, esMaxDia, onCelda }: { dia: number; fila: number[]; max: number; total: number; esMaxDia: boolean; onCelda?: (dia: number, hora: number) => void }) {
  return (
    <>
      <div className={clsx('flex items-center justify-end pr-1.5 text-[11.5px]', esMaxDia ? 'font-extrabold text-[#dc2626]' : 'font-semibold text-slate-700')}>{DIAS_MATRIZ[dia]}</div>
      {fila.map((v, h) => (
        <button
          key={h}
          type="button"
          disabled={!onCelda || v === 0}
          onClick={() => onCelda?.(dia, h)}
          title={`${DIAS_MATRIZ[dia]} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 · ${v} caso${v === 1 ? '' : 's'}`}
          className="h-[38px] rounded-[2px] transition hover:outline hover:outline-2 hover:outline-[#10233f] disabled:cursor-default"
          style={{ background: v > 0 ? colorCalor(v / max) : '#d5ece1' }}
        />
      ))}
      <div className="flex items-center justify-end text-[11px] font-bold tabular-nums text-[#10233f]">{formatNumero(total)}</div>
    </>
  );
}
