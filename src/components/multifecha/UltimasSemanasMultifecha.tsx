import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CrimeRecord } from '../../types/crime';
import type { VigenciaMF } from '../../hooks/useMultifecha';
import { formatNumero } from '../../utils/aggregations';
import { VarAbs } from './TablaVigencias';

// Últimas 4 semanas en modo multifecha: para CADA vigencia, las 4 semanas
// (28 días) que terminan el último día de su rango de referencia — la más
// reciente es la serie principal; las demás son su ventana equivalente.
// Si los datos cargados no alcanzan a cubrir la ventana, se muestran los
// días disponibles y se advierte.

const MS_DIA = 86400000;
export const PALETA_VIGENCIAS = ['#9fd8cf', '#5fb8ad', '#94a3b8', '#159089', '#8a86da', '#0891b2', '#cbd5e1', '#14b8a6', '#6366f1', '#64748b', '#0ea5e9', '#a3a3a3'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`;

interface SemanaVig { inicio: Date; fin: Date; casos: number; dias: number }
interface VentanaVig { v: VigenciaMF; semanas: SemanaVig[]; total: number; incompleta: boolean; inicio: Date; fin: Date }

export function colorVigencia(i: number, n: number): string {
  if (i === n - 1) return '#10233f';
  if (i === n - 2) return '#159089';
  return PALETA_VIGENCIAS[i % PALETA_VIGENCIAS.length];
}

/** Etiqueta del eje: «Semana N» y debajo las fechas de la vigencia más reciente. */
function EtiquetaSemana({ x, y, payload, ventanas }: { x?: number; y?: number; payload?: { value: string; index: number }; ventanas: VentanaVig[] }) {
  const w = ventanas[ventanas.length - 1];
  const s = payload && w ? w.semanas[payload.index] : null;
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text dy={13} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#10233f">{payload?.value}</text>
      {s && <text dy={27} textAnchor="middle" fontSize={10} fill="#64748b">{corta(s.inicio)} – {corta(s.fin)}</text>}
    </g>
  );
}

export function UltimasSemanasMultifecha({ vigencias, base, fechaMin, fechaMax }: {
  vigencias: VigenciaMF[];
  /** Registros con los filtros generales aplicados y SIN fecha (fuente común). */
  base: CrimeRecord[];
  fechaMin: Date | null;
  fechaMax: Date | null;
}) {
  const ventanas: VentanaVig[] = useMemo(() => {
    const finDatos = fechaMax ? new Date(fechaMax.getFullYear(), fechaMax.getMonth(), fechaMax.getDate(), 23, 59, 59, 999) : null;
    const iniDatos = fechaMin ? new Date(fechaMin.getFullYear(), fechaMin.getMonth(), fechaMin.getDate()) : null;
    return vigencias.map((v) => {
      let fin = new Date(v.fin.getFullYear(), v.fin.getMonth(), v.fin.getDate(), 23, 59, 59, 999);
      let incompleta = false;
      if (finDatos && fin > finDatos) { fin = finDatos; incompleta = true; }
      const diaFin = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
      const semanas: SemanaVig[] = [3, 2, 1, 0].map((k) => {
        const ini = new Date(diaFin.getTime() - (k * 7 + 6) * MS_DIA);
        const f = new Date(diaFin.getTime() - k * 7 * MS_DIA); f.setHours(23, 59, 59, 999);
        let dias = 7;
        if (iniDatos && ini < iniDatos) { dias = Math.max(0, Math.round((f.getTime() - iniDatos.getTime()) / MS_DIA)); incompleta = true; }
        return { inicio: ini, fin: f, casos: 0, dias };
      });
      for (const r of base) {
        if (!r.fecha) continue;
        const t = new Date(r.fecha).getTime();
        for (const s of semanas) if (t >= s.inicio.getTime() && t <= s.fin.getTime()) { s.casos++; break; }
      }
      return { v, semanas, total: semanas.reduce((a, s) => a + s.casos, 0), incompleta, inicio: semanas[0].inicio, fin: semanas[3].fin };
    });
  }, [vigencias, base, fechaMin, fechaMax]);

  const n = ventanas.length;
  if (n === 0) return <p className="py-6 text-center text-sm text-slate-400">Seleccione al menos una vigencia con fechas completas.</p>;

  const datos = [0, 1, 2, 3].map((i) => {
    const fila: Record<string, string | number> = { semana: i === 3 ? 'Semana 4 · cierre' : `Semana ${i + 1}` };
    for (const w of ventanas) fila[w.v.etiqueta] = w.semanas[i].casos;
    return fila;
  });
  const incompletas = ventanas.filter((w) => w.incompleta);
  const reciente = ventanas[n - 1];

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-slate-500">
        Serie principal <b className="text-[#10233f]">{reciente.v.etiqueta}</b>: del {corta(reciente.inicio)} al {corta(reciente.fin)} {reciente.fin.getFullYear()} (cierra el último día de su periodo de referencia, {reciente.v.rango}).
        {n > 1 && ' Las demás vigencias se comparan con su ventana equivalente de 4 semanas, que cierra en el último día de su propio periodo.'}
      </p>
      <div className="grid grid-cols-1 items-center gap-4 xl:grid-cols-[1.25fr_1fr]">
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 22, right: 8, left: -14, bottom: 0 }} barCategoryGap="22%" barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="semana" tick={<EtiquetaSemana ventanas={ventanas} />} interval={0} height={40} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(17,103,98,0.06)' }}
              formatter={(valor, nombre) => [`${formatNumero(Number(valor))} casos`, String(nombre)]}
              labelFormatter={(l) => {
                const i = datos.findIndex((d) => d.semana === l);
                return i >= 0 ? `${l} · ${reciente.v.etiqueta}: ${corta(reciente.semanas[i].inicio)}–${corta(reciente.semanas[i].fin)}` : String(l);
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11.5 }} iconType="circle" />
            {ventanas.map((w, i) => (
              <Bar key={w.v.id} dataKey={w.v.etiqueta} fill={colorVigencia(i, n)} radius={[5, 5, 0, 0]} maxBarSize={46} isAnimationActive={false}>
                <LabelList dataKey={w.v.etiqueta} position="top" style={{ fontSize: i === n - 1 ? 12 : 10.5, fontWeight: i === n - 1 ? 800 : 600, fill: i === n - 1 ? '#10233f' : '#64748b' }} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-[12px]">
          <thead>
            <tr className="bg-slate-50 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
              <th className="rounded-l-md px-2 py-1.5 text-left">Vigencia</th>
              <th className="px-2 py-1.5 text-left">Ventana (4 semanas)</th>
              {[1, 2, 3, 4].map((s) => <th key={s} className="px-2 py-1.5 text-right">Sem. {s}</th>)}
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="rounded-r-md px-2 py-1.5 text-right" title="Semana 4 − Semana 1">Var. S1→S4</th>
            </tr>
          </thead>
          <tbody>
            {ventanas.map((w, i) => (
              <tr key={w.v.id} className="border-b border-slate-100">
                <td className="px-2 py-1"><span className="inline-flex items-center gap-1.5 font-bold" style={{ color: colorVigencia(i, n) }}><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorVigencia(i, n) }} />{w.v.etiqueta}</span></td>
                <td className="whitespace-nowrap px-2 py-1 text-slate-500">{corta(w.inicio)} – {corta(w.fin)}{w.incompleta && <span className="ml-1 text-amber-600" title="Ventana incompleta: los datos cargados no cubren las 4 semanas">*</span>}</td>
                {w.semanas.map((s, k) => <td key={k} className={`px-2 py-1 text-right tabular-nums ${k === 3 ? 'font-bold text-[#10233f]' : 'text-slate-600'}`}>{formatNumero(s.casos)}</td>)}
                <td className="px-2 py-1 text-right font-bold tabular-nums text-[#10233f]">{formatNumero(w.total)}</td>
                <td className="px-2 py-1 text-right"><VarAbs valor={w.semanas[3].casos - w.semanas[0].casos} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      {incompletas.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle size={13} className="mt-[1px] shrink-0" />
          Datos insuficientes para completar las 4 semanas en {incompletas.map((w) => w.v.etiqueta).join(', ')} (*): se muestran solo los días disponibles en la base cargada.
        </p>
      )}
    </div>
  );
}
