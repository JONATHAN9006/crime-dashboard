import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, useYAxisScale } from 'recharts';
import { ordenarAniosPorCasos } from '../../utils/coloresAnio';
import { formatNumero } from '../../utils/aggregations';

// Tendencia ANUAL: una barra por año seleccionado (total de casos del delito
// filtrado o de todos), con la cifra encima, una línea roja punteada de
// tendencia (ajuste lineal sobre los totales reales) y los 3 años con más
// casos marcados con recuadro rojo punteado y su puesto (1, 2, 3).

export interface PuntoAnual { anio: string; casos: number; color: string }

function tendenciaLineal(valores: number[]): number[] {
  const n = valores.length;
  if (n < 2) return valores.slice();
  const xm = (n - 1) / 2;
  const ym = valores.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let den = 0;
  valores.forEach((v, i) => { num += (i - xm) * (v - ym); den += (i - xm) ** 2; });
  const m = den ? num / den : 0;
  return valores.map((_, i) => Math.max(0, ym + m * (i - xm)));
}

function CapaTopAnios({ datos, top }: { datos: PuntoAnual[]; top: number }) {
  const area = usePlotArea();
  const yScale = useYAxisScale();
  if (!area || !yScale || datos.length === 0) return null;
  // Eje de categorías sin relleno: cada año ocupa una franja igual del área.
  const franja = area.width / datos.length;
  const yAbajo = area.y + area.height;
  const ranking = ordenarAniosPorCasos(datos.filter((d) => d.casos > 0)).slice(0, top);
  return (
    <g>
      {ranking.map((d) => {
        const idx = datos.findIndex((x) => x.anio === d.anio);
        const yv = yScale(d.casos);
        if (idx < 0 || typeof yv !== 'number') return null;
        const centro = area.x + franja * (idx + 0.5);
        const ancho = Math.min(franja * 0.86, Math.max(48, franja * 0.72 + 24));
        const yTop = Math.max(area.y - 22, yv - 44);
        return (
          <g key={d.anio}>
            <rect x={centro - ancho / 2} y={yTop} width={ancho} height={yAbajo - yTop + 4} rx={7} fill="#ef4444" fillOpacity={0.05} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 4" />
          </g>
        );
      })}
    </g>
  );
}

// Eje Y con divisiones redondas (0, 200, 400, 600, 800…).
function ejeBonito(v: number): { techo: number; ticks: number[] } {
  const crudo = Math.max(1, v) / 4;
  const base = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * base).find((p) => p >= crudo) ?? 10 * base;
  const techo = Math.ceil(v / paso) * paso;
  const ticks: number[] = [];
  for (let t = 0; t <= techo + 1e-9; t += paso) ticks.push(Math.round(t));
  return { techo, ticks };
}


export function TendenciaAnualChart({ datos, height = 300, top = 3 }: { datos: PuntoAnual[]; height?: number; top?: number }) {
  const linea = tendenciaLineal(datos.map((d) => d.casos));
  const data = datos.map((d, i) => ({ ...d, _tendencia: Math.round(linea[i] * 10) / 10 }));
  const max = Math.max(1, ...datos.map((d) => d.casos));
  const ejeY = ejeBonito(max * 1.32);
  return (
    <div>
      {/* Leyenda para la imagen descargada (ver exportarImagen.ts). */}
      <div className="hidden">
        <span data-export-leyenda-item data-color="#dc2626">Tendencia</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 46, right: 16, left: 4, bottom: 4 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="anio" tick={{ fontSize: 12.5, fill: '#334155', fontWeight: 600 }} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} />
          <YAxis domain={[0, ejeY.techo]} ticks={ejeY.ticks} allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} width={40} />
          <Tooltip
            cursor={{ fill: '#f1f5f9' }}
            contentStyle={{ borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }}
            formatter={(v, n) => [formatNumero(Number(v)), n === '_tendencia' ? 'Tendencia' : 'Casos']}
          />
          <Bar dataKey="casos" name="Casos" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.anio} fill={d.color} />)}
            <LabelList dataKey="casos" position="top" offset={8} formatter={(v) => formatNumero(Number(v))} style={{ fontSize: 15, fontWeight: 800, fill: '#10233f', stroke: '#ffffff', strokeWidth: 4, paintOrder: 'stroke' }} />
          </Bar>
          {data.length >= 2 && (
            <Line type="linear" dataKey="_tendencia" name="Tendencia" stroke="#dc2626" strokeWidth={2.2} strokeDasharray="7 5" dot={{ r: 4, fill: '#fff', stroke: '#dc2626', strokeWidth: 2 }} activeDot={false} isAnimationActive={false} />
          )}
          <CapaTopAnios datos={datos} top={top} />
        </ComposedChart>
      </ResponsiveContainer>
      {data.length >= 2 && (
        <div className="mt-1 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#dc2626]">
          <svg width="26" height="8" aria-hidden><line x1="0" y1="4" x2="26" y2="4" stroke="#dc2626" strokeWidth="2" strokeDasharray="5 3" /><circle cx="13" cy="4" r="3" fill="#fff" stroke="#dc2626" strokeWidth="1.6" /></svg>
          Tendencia
        </div>
      )}
    </div>
  );
}
