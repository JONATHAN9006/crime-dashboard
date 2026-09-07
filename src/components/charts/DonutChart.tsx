import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatNumero } from '../../utils/aggregations';

const COLORES = ['#10233f', '#116762', '#b45309', '#7c3aed', '#0891b2', '#be123c', '#64748b', '#059669', '#d97706'];

function acortar(texto: string, maxLargo = 16): string {
  return texto.length > maxLargo ? `${texto.slice(0, maxLargo - 1)}…` : texto;
}

// Renderiza el nombre + valor directamente afuera de cada porción, con una
// línea guía corta. Solo se etiquetan porciones con participación suficiente
// (>=4%) para evitar que los segmentos diminutos generen texto amontonado o
// superpuesto; esos casos siguen disponibles en la leyenda y el tooltip.
function renderEtiquetaExterna(mostrarCasos: boolean) {
  return (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, name, value } = props;
    if (percent < 0.04) return null;
    const RAD = Math.PI / 180;
    const radioLinea = outerRadius + 14;
    const radioTexto = outerRadius + 18;
    const xTexto = cx + radioTexto * Math.cos(-midAngle * RAD);
    const yTexto = cy + radioTexto * Math.sin(-midAngle * RAD);
    const anclaTexto = xTexto >= cx ? 'start' : 'end';
    const etiquetaValor = mostrarCasos ? formatNumero(Number(value)) : `${(percent * 100).toFixed(0)}%`;

    return (
      <text x={xTexto} y={yTexto} textAnchor={anclaTexto} dominantBaseline="central" fontSize={10.5} fill="#334155">
        {acortar(name)} ({etiquetaValor})
      </text>
    );
  };
}

export function DonutChart({ data, height = 300, mostrarCasos = false }: { data: { key: string; casos: number }[]; height?: number; mostrarCasos?: boolean }) {
  const total = data.reduce((a, d) => a + d.casos, 0);

  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <PieChart margin={{ top: 26, right: 26, bottom: 8, left: 26 }}>
        <Pie
          data={data}
          dataKey="casos"
          nameKey="key"
          innerRadius="42%"
          outerRadius="58%"
          paddingAngle={2}
          isAnimationActive={false}
          label={renderEtiquetaExterna(mostrarCasos)}
          labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORES[i % COLORES.length]} stroke="#fff" strokeWidth={1} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
          formatter={((value: any, name: any) => [`${formatNumero(Number(value))} (${total ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`, name]) as any}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, lineHeight: '1.6em' }}
          formatter={(value: string) => {
            const item = data.find((d) => d.key === value);
            if (!item) return value;
            const etiqueta = mostrarCasos ? formatNumero(item.casos) : `${total ? ((item.casos / total) * 100).toFixed(0) : 0}%`;
            return `${value} (${etiqueta})`;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
