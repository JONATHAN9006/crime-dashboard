import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, ChartLine, Minus } from 'lucide-react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Evolución temporal de la operatividad, con EXACTAMENTE los mismos
// registros que el resto de la página (mismos filtros). Solo cuenta
// registros por fecha real: si el período filtrado es corto (≤ 16 semanas)
// se agrupa por semana (lunes a domingo), si es más largo, por mes. Los
// tramos que el corte de datos deja incompletos se marcan como parciales y
// no entran en la comparación, para no leer como "caída" lo que es falta
// de datos.

const AZUL_TINTA = '#10233f';
const TEAL = '#0f5f57';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface Tramo { etiqueta: string; casos: number; parcial: boolean }

const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function lunesDe(d: Date): Date {
  const f = soloFecha(d);
  f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
  return f;
}

function calcularTramos(fechas: Date[]): { tramos: Tramo[]; unidad: 'semana' | 'mes' } {
  if (fechas.length === 0) return { tramos: [], unidad: 'mes' };
  let min = fechas[0], max = fechas[0];
  for (const f of fechas) { if (f < min) min = f; if (f > max) max = f; }
  const fMin = soloFecha(min), fMax = soloFecha(max);
  const dias = (fMax.getTime() - fMin.getTime()) / 86_400_000;

  if (dias <= 16 * 7) {
    const conteo = new Map<number, number>();
    for (const f of fechas) { const k = lunesDe(f).getTime(); conteo.set(k, (conteo.get(k) ?? 0) + 1); }
    const tramos: Tramo[] = [];
    for (let s = lunesDe(fMin); s <= fMax; s = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)) {
      const fin = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
      tramos.push({
        etiqueta: `${String(s.getDate()).padStart(2, '0')}/${String(s.getMonth() + 1).padStart(2, '0')}`,
        casos: conteo.get(s.getTime()) ?? 0,
        parcial: s < fMin || fin > fMax,
      });
    }
    return { tramos, unidad: 'semana' };
  }

  const conteo = new Map<string, number>();
  for (const f of fechas) { const k = `${f.getFullYear()}-${f.getMonth()}`; conteo.set(k, (conteo.get(k) ?? 0) + 1); }
  const variosAnios = fMin.getFullYear() !== fMax.getFullYear();
  const tramos: Tramo[] = [];
  for (let a = fMin.getFullYear(), m = fMin.getMonth(); a < fMax.getFullYear() || (a === fMax.getFullYear() && m <= fMax.getMonth()); m === 11 ? (a++, m = 0) : m++) {
    const ultimoDia = new Date(a, m + 1, 0).getDate();
    const esPrimero = a === fMin.getFullYear() && m === fMin.getMonth();
    const esUltimo = a === fMax.getFullYear() && m === fMax.getMonth();
    tramos.push({
      etiqueta: variosAnios ? `${MESES[m]} ${String(a).slice(2)}` : MESES[m],
      casos: conteo.get(`${a}-${m}`) ?? 0,
      parcial: (esPrimero && fMin.getDate() > 1) || (esUltimo && fMax.getDate() < ultimoDia),
    });
  }
  return { tramos, unidad: 'mes' };
}

export function EvolucionOperatividad({ registros }: { registros: { fecha: Date | null }[] }) {
  const { tramos, unidad } = useMemo(
    () => calcularTramos(registros.map((r) => r.fecha).filter((f): f is Date => f instanceof Date && !Number.isNaN(f.getTime()))),
    [registros],
  );

  if (tramos.length < 2) {
    return <p className="py-8 text-center text-sm text-slate-400">No hay suficientes fechas en los registros filtrados para mostrar una evolución.</p>;
  }

  const completos = tramos.filter((t) => !t.parcial);
  const ultimo = completos[completos.length - 1];
  const anterior = completos[completos.length - 2];
  const variacion = ultimo && anterior && anterior.casos > 0 ? ((ultimo.casos - anterior.casos) / anterior.casos) * 100 : null;
  const promedio = completos.length > 0 ? completos.reduce((a, t) => a + t.casos, 0) / completos.length : null;
  const nombreTramo = unidad === 'semana' ? 'semana' : 'mes';

  // Gráfico SVG (se exporta igual que se ve).
  const W = 360, H = 150, M = { izq: 14, der: 14, arr: 24, aba: 22 };
  const maxV = Math.max(1, ...tramos.map((t) => t.casos));
  const x = (i: number) => M.izq + (i * (W - M.izq - M.der)) / (tramos.length - 1);
  const y = (v: number) => M.arr + (1 - v / maxV) * (H - M.arr - M.aba);
  const linea = tramos.map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(t.casos).toFixed(1)}`).join(' ');
  const area = `${linea} L ${x(tramos.length - 1).toFixed(1)} ${H - M.aba} L ${x(0).toFixed(1)} ${H - M.aba} Z`;
  const cadaCuanto = Math.ceil(tramos.length / 8); // etiquetas sin amontonarse
  const mostrarValor = (i: number) => tramos.length <= 8 || i % cadaCuanto === 0 || i === tramos.length - 1;

  const IconoVar = variacion == null || Math.abs(variacion) < 0.05 ? Minus : variacion > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Operatividad por ${nombreTramo}`}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={M.izq} x2={W - M.der} y1={y(maxV * f)} y2={y(maxV * f)} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <path d={area} fill={TEAL} fillOpacity="0.08" />
        <path d={linea} fill="none" stroke={TEAL} strokeWidth="2" strokeLinejoin="round" />
        {tramos.map((t, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(t.casos)} r="3.2" fill={t.parcial ? '#ffffff' : TEAL} stroke={TEAL} strokeWidth="1.6" />
            {mostrarValor(i) && (
              <text x={x(i)} y={y(t.casos) - 7} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={AZUL_TINTA}>{formatNumero(t.casos)}</text>
            )}
            {(i % cadaCuanto === 0 || i === tramos.length - 1) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{t.etiqueta}</text>
            )}
          </g>
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
          <IconoVar size={18} className={variacion == null ? 'text-slate-400' : variacion > 0 ? 'text-emerald-600' : 'text-slate-500'} />
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight" style={{ color: AZUL_TINTA }}>
              {variacion == null ? '—' : `${variacion > 0 ? '+' : ''}${formatDecimal(variacion, 1)} %`}
            </p>
            <p className="truncate text-[10.5px] text-slate-500" title={`Último ${nombreTramo} completo frente al anterior`}>
              {ultimo && anterior ? `${ultimo.etiqueta} vs. ${anterior.etiqueta}` : `Sin dos ${nombreTramo === 'mes' ? 'meses' : 'semanas'} completos`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
          <ChartLine size={18} className="text-[#0f5f57]" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold leading-tight" style={{ color: AZUL_TINTA }}>{promedio == null ? '—' : formatNumero(Math.round(promedio))}</p>
            <p className="truncate text-[10.5px] text-slate-500" title={`Promedio por ${nombreTramo} completo`}>{unidad === 'semana' ? 'Promedio semanal' : 'Promedio mensual'}</p>
          </div>
        </div>
      </div>
      {tramos.some((t) => t.parcial) && (
        <p className="mt-1 text-[10px] text-slate-400">○ Punto vacío = {nombreTramo} incompleto (corte de datos); no entra en la comparación ni en el promedio.</p>
      )}
    </div>
  );
}
