import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Gráficos del módulo RNMC. Todos CUENTAN registros por fecha real (no hay
// estimaciones): un registro sin fecha simplemente no entra en la serie.

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const AZUL_TINTA = '#10233f';
const TEAL = '#159089';

interface ConFecha { fecha: Date | null }
const fechasValidas = (items: ConFecha[]) => items.map((r) => r.fecha).filter((f): f is Date => f instanceof Date && !Number.isNaN(f.getTime()));

/** Conteo por mes (año-mes), en orden, desde el primer hasta el último mes con datos. */
export function seriePorMes(items: ConFecha[]): { etiqueta: string; casos: number; anio: number; mes: number }[] {
  const fechas = fechasValidas(items);
  if (fechas.length === 0) return [];
  const conteo = new Map<number, number>();
  let min = Infinity, max = -Infinity;
  for (const f of fechas) {
    const k = f.getFullYear() * 12 + f.getMonth();
    conteo.set(k, (conteo.get(k) ?? 0) + 1);
    if (k < min) min = k;
    if (k > max) max = k;
  }
  const variosAnios = Math.floor(min / 12) !== Math.floor(max / 12);
  const salida = [];
  for (let k = min; k <= max; k++) {
    const anio = Math.floor(k / 12), mes = k % 12;
    salida.push({ etiqueta: variosAnios ? `${MESES[mes]} ${String(anio).slice(2)}` : MESES[mes], casos: conteo.get(k) ?? 0, anio, mes });
  }
  return salida;
}

function seriePorSemana(items: ConFecha[]): { etiqueta: string; casos: number }[] {
  const fechas = fechasValidas(items);
  if (fechas.length === 0) return [];
  const lunes = (d: Date) => { const f = new Date(d.getFullYear(), d.getMonth(), d.getDate()); f.setDate(f.getDate() - ((f.getDay() + 6) % 7)); return f; };
  const conteo = new Map<number, number>();
  let min = Infinity, max = -Infinity;
  for (const f of fechas) {
    const t = lunes(f).getTime();
    conteo.set(t, (conteo.get(t) ?? 0) + 1);
    if (t < min) min = t;
    if (t > max) max = t;
  }
  const salida = [];
  for (let d = new Date(min); d.getTime() <= max; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)) {
    salida.push({ etiqueta: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, casos: conteo.get(d.getTime()) ?? 0 });
  }
  return salida;
}

/** Barras mini "Tendencia general" (por mes). */
export function TendenciaMini({ items }: { items: ConFecha[] }) {
  const serie = useMemo(() => seriePorMes(items), [items]);
  if (serie.length === 0) return <p className="text-[11px] text-slate-400">Sin fechas.</p>;
  const max = Math.max(1, ...serie.map((s) => s.casos));
  return (
    <div>
      <div className="flex h-12 items-end gap-[3px]">
        {serie.map((s, i) => (
          <span
            key={i}
            title={`${s.etiqueta}: ${formatNumero(s.casos)}`}
            className="block min-w-[5px] flex-1 rounded-t-sm"
            style={{ height: `${Math.max(6, (s.casos / max) * 100)}%`, background: i === serie.length - 1 ? '#2563eb' : '#93b4f5' }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-slate-500">
        <span>{serie[0].etiqueta}</span>
        <span>{serie[serie.length - 1].etiqueta}</span>
      </div>
    </div>
  );
}

const TooltipSimple = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color?: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] shadow-md">
      <p className="mb-0.5 font-bold" style={{ color: AZUL_TINTA }}>{label}</p>
      {payload.filter((p) => p.value != null).map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <b style={{ color: AZUL_TINTA }}>{formatNumero(p.value)}</b>
        </p>
      ))}
    </div>
  );
};

// En series largas solo se rotula uno de cada "cada" puntos (y el último).
function EtiquetaEspaciada(cada: number) {
  return function Etiqueta(props: { x?: unknown; y?: unknown; value?: unknown; index?: number }) {
    const { x, y, value, index = 0 } = props;
    if (index % cada !== 0) return null;
    return <text x={Number(x)} y={Number(y) - 7} textAnchor="middle" fontSize={10} fontWeight={700} fill={AZUL_TINTA}>{formatNumero(Number(value))}</text>;
  };
}

function Variacion({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[11px] text-slate-400">—</span>;
  const Icono = Math.abs(pct) < 0.5 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  const color = pct > 0 ? 'text-[#0f766e]' : pct < 0 ? 'text-rose-600' : 'text-slate-500';
  return <span className={`inline-flex items-center gap-0.5 text-[12px] font-bold ${color}`}><Icono size={14} />{pct > 0 ? '+' : ''}{formatDecimal(pct, 0)}%</span>;
}

/**
 * Evolución temporal (Mensual / Semanal) + tres trimestres más recientes,
 * cada uno comparado con el trimestre anterior. Un trimestre que el corte
 * de datos deja incompleto se marca "(parcial)" y no se compara.
 */
export function EvolucionTemporalRnmc({ items, vista }: { items: ConFecha[]; vista: 'mensual' | 'semanal' }) {
  const mensual = useMemo(() => seriePorMes(items), [items]);
  const semanal = useMemo(() => seriePorSemana(items), [items]);
  const datos = vista === 'mensual' ? mensual : semanal;

  const trimestres = useMemo(() => {
    const fechas = fechasValidas(items);
    if (fechas.length === 0) return [];
    let maxF = fechas[0], minF = fechas[0];
    for (const f of fechas) { if (f > maxF) maxF = f; if (f < minF) minF = f; }
    const conteo = new Map<number, number>();
    for (const f of fechas) { const k = f.getFullYear() * 4 + Math.floor(f.getMonth() / 3); conteo.set(k, (conteo.get(k) ?? 0) + 1); }
    const kMin = minF.getFullYear() * 4 + Math.floor(minF.getMonth() / 3);
    const kMax = maxF.getFullYear() * 4 + Math.floor(maxF.getMonth() / 3);
    const lista: { k: number; anio: number; t: number; casos: number; parcial: boolean; rango: string }[] = [];
    for (let k = kMin; k <= kMax; k++) {
      const anio = Math.floor(k / 4), t = k % 4;
      const fin = new Date(anio, t * 3 + 3, 0);
      const inicio = new Date(anio, t * 3, 1);
      // Parcial: el último dato cae antes del último día del trimestre, o el primero después de su inicio.
      const parcial = maxF < fin || minF > inicio;
      lista.push({ k, anio, t, casos: conteo.get(k) ?? 0, parcial, rango: `${MESES[t * 3]} - ${MESES[t * 3 + 2]}` });
    }
    return lista.slice(-3).map((q) => {
      const previo = lista.find((x) => x.k === q.k - 1);
      const pct = !q.parcial && previo && !previo.parcial && previo.casos > 0 ? ((q.casos - previo.casos) / previo.casos) * 100 : null;
      return { ...q, pct };
    });
  }, [items]);

  if (datos.length === 0) return <p className="py-10 text-center text-sm text-slate-400">No hay registros con fecha para los filtros seleccionados.</p>;
  const NOMBRES_T = ['Primer trimestre', 'Segundo trimestre', 'Tercer trimestre', 'Cuarto trimestre'];

  return (
    <div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 24, right: 16, left: 16, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10.5, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.12)]} />
            <Tooltip content={<TooltipSimple />} />
            <Area type="linear" dataKey="casos" stroke="none" fill={TEAL} fillOpacity={0.14} isAnimationActive={false} tooltipType="none" legendType="none" />
            <Line type="linear" dataKey="casos" name="Registros" stroke={TEAL} strokeWidth={2.2} dot={{ r: 3.5, fill: TEAL, stroke: '#fff', strokeWidth: 1 }} activeDot={{ r: 5 }} isAnimationActive={false}>
              {/* Valor sobre cada punto (en vista semanal, uno de cada pocos para que no se monten). */}
              <LabelList dataKey="casos" position="top" offset={7} fontSize={10} fontWeight={700} fill={AZUL_TINTA}
                formatter={(v: unknown) => formatNumero(Number(v))}
                content={datos.length > 16 ? EtiquetaEspaciada(Math.ceil(datos.length / 12)) : undefined} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {trimestres.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {trimestres.map((q, i) => (
            <div key={q.k} className={`rounded-lg border px-2.5 py-2 ${i === 0 ? 'border-rose-100 bg-rose-50/50' : i === 1 ? 'border-sky-100 bg-sky-50/50' : 'border-teal-100 bg-teal-50/50'}`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[18px] font-bold tabular-nums" style={{ color: AZUL_TINTA }}>{formatNumero(q.casos)}</span>
                <Variacion pct={q.pct} />
              </div>
              <p className="text-[11px] font-medium leading-tight text-slate-600">{NOMBRES_T[q.t]} {q.anio}{q.parcial ? ' (parcial)' : ''}</p>
              <p className="text-[10px] leading-tight text-slate-400">{q.rango}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SelectorVista({ valor, onChange }: { valor: 'mensual' | 'semanal'; onChange: (v: 'mensual' | 'semanal') => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-300">
      {(['mensual', 'semanal'] as const).map((v) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`px-2.5 py-[3px] text-[11px] font-semibold ${valor === v ? 'bg-[#10233f] text-white' : 'bg-white text-[#10233f] hover:bg-slate-50'}`}>
          {v === 'mensual' ? 'Mensual' : 'Semanal'}
        </button>
      ))}
    </div>
  );
}

/** Tendencia mensual del delito: año anterior vs año actual, Ene–Dic. */
export function TendenciaAnualDelito({ items, anioA, anioB }: { items: { fecha: Date | null; anio: number | null }[]; anioA: number; anioB: number }) {
  const datos = useMemo(() => {
    const a = new Array(12).fill(0), b = new Array(12).fill(0);
    let ultimoMesB = -1;
    for (const r of items) {
      if (!r.fecha) continue;
      const m = r.fecha.getMonth();
      if (r.anio === anioA) a[m]++;
      else if (r.anio === anioB) { b[m]++; if (m > ultimoMesB) ultimoMesB = m; }
    }
    return MESES.map((mes, i) => ({ mes, [String(anioA)]: a[i], [String(anioB)]: i <= ultimoMesB ? b[i] : null }));
  }, [items, anioA, anioB]);
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={datos} margin={{ top: 8, right: 10, left: -14, bottom: 0 }}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 10.5, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fontSize: 10.5, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TooltipSimple />} />
          <Area type="linear" dataKey={String(anioA)} name={String(anioA)} stroke="#a5b4cb" strokeWidth={1.6} fill="#c7d2e3" fillOpacity={0.25} dot={{ r: 2.5, fill: '#a5b4cb' }} isAnimationActive={false} />
          <Area type="linear" dataKey={String(anioB)} name={String(anioB)} stroke={TEAL} strokeWidth={2.4} fill={TEAL} fillOpacity={0.14} dot={{ r: 3, fill: TEAL }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
