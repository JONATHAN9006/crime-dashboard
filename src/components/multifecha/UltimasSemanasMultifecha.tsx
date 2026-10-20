import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
export const PALETA_VIGENCIAS = ['#94a3b8', '#8a86da', '#0891b2', '#f59e0b', '#f97316', '#a3a3a3', '#14b8a6', '#6366f1', '#e879f9', '#84cc16', '#64748b', '#0ea5e9'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corta = (d: Date) => `${d.getDate()} ${MESES[d.getMonth()]}`;

interface SemanaVig { inicio: Date; fin: Date; casos: number; dias: number }
interface VentanaVig { v: VigenciaMF; semanas: SemanaVig[]; total: number; incompleta: boolean; inicio: Date; fin: Date }

export function colorVigencia(i: number, n: number): string {
  return i === n - 1 ? '#10233f' : PALETA_VIGENCIAS[i % PALETA_VIGENCIAS.length];
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
    const fila: Record<string, string | number> = { semana: i === 3 ? 'Semana 4 (cierre)' : `Semana ${i + 1}` };
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
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 11, fill: '#475569' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip
              formatter={(valor, nombre) => {
                const w = ventanas.find((x) => x.v.etiqueta === nombre);
                return [`${formatNumero(Number(valor))} casos`, w ? `${nombre}` : String(nombre)];
              }}
              labelFormatter={(l, payload) => {
                const i = datos.findIndex((d) => d.semana === l);
                const partes = (payload ?? []).map((p) => {
                  const w = ventanas.find((x) => x.v.etiqueta === p.dataKey);
                  return w && i >= 0 ? `${w.v.etiqueta}: ${corta(w.semanas[i].inicio)}–${corta(w.semanas[i].fin)}` : '';
                }).filter(Boolean);
                return `${l}${partes.length ? ` · ${partes.slice(-2).join(' · ')}` : ''}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {ventanas.map((w, i) => (
              <Line key={w.v.id} type="monotone" dataKey={w.v.etiqueta} stroke={colorVigencia(i, n)} strokeWidth={i === n - 1 ? 3 : 1.6} dot={{ r: i === n - 1 ? 4 : 2.5 }} isAnimationActive={false} label={i === n - 1 ? { position: 'top', fontSize: 11, fontWeight: 700, fill: '#10233f' } : undefined} />
            ))}
          </LineChart>
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
      {incompletas.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
          <AlertTriangle size={13} className="mt-[1px] shrink-0" />
          Datos insuficientes para completar las 4 semanas en {incompletas.map((w) => w.v.etiqueta).join(', ')} (*): se muestran solo los días disponibles en la base cargada.
        </p>
      )}
    </div>
  );
}
