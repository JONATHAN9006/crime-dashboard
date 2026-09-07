import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumero } from '../../utils/aggregations';

interface Item {
  key: string;
  casos: number;
  registros?: number;
  participacion?: number;
}

// Paleta institucional: verde institucional y gris medio-oscuro alternados
// para las barras normales — reemplaza la paleta multicolor anterior.
const PALETA_BARRAS = ['#159089', '#94a3b8'];
// La barra con más casos se resalta en un verde más oscuro que el
// institucional, con el recuadro punteado rojo para que se distinga de
// inmediato cuál es el máximo.
const VERDE_MAXIMO = '#0b4a46';

// Dibuja la barra normal y, si corresponde, un recuadro punteado rojo
// separado por un pequeño margen alrededor (no pegado al borde), para que
// contraste bien sin importar el color de relleno de la barra.
function crearFormaBarra(maxCasos: number, resaltarMaximo: boolean) {
  return (props: any) => {
    const { x, y, width, height, index, payload } = props;
    const esMaximo = resaltarMaximo && payload?.casos === maxCasos && maxCasos > 0;
    const color = esMaximo ? VERDE_MAXIMO : PALETA_BARRAS[index % PALETA_BARRAS.length];
    const MARGEN = 4;
    return (
      <g>
        <rect x={x} y={y} width={Math.max(width, 1)} height={height} fill={color} rx={4} />
        {esMaximo && (
          <rect
            x={x - MARGEN}
            y={y - MARGEN}
            width={Math.max(width, 1) + MARGEN * 2}
            height={height + MARGEN * 2}
            fill="none"
            stroke="#dc2626"
            strokeWidth={2}
            strokeDasharray="5 3"
            rx={6}
          />
        )}
      </g>
    );
  };
}

export function HorizontalBarChart({ data, height, color, onBarClick, alturaFila = 30, resaltarMaximo = true, formatoValor }: {
  data: Item[];
  height?: number;
  // "color" se conserva por compatibilidad pero ya no se usa como color único:
  // cada barra recibe un color distinto de PALETA_BARRAS automáticamente.
  color?: string;
  onBarClick?: (key: string) => void;
  alturaFila?: number;
  resaltarMaximo?: boolean;
  // Permite formatear el valor mostrado (ej. como porcentaje en la vista "Aporte").
  formatoValor?: (v: number) => string;
}) {
  const alto = height ?? Math.max(160, data.length * alturaFila);
  const maxCasos = data.length ? Math.max(...data.map((d) => d.casos)) : 0;
  const formatear = formatoValor ?? formatNumero;
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={data} layout="vertical" margin={{ top: 6, right: 34, left: 8, bottom: 6 }}>
        {/* domain ajustado al máximo real (no a un número redondo mayor) para
            no dejar espacio vacío al final de la gráfica. */}
        {/* domain con margen del 12% (no un número redondo mucho mayor) para
            aprovechar el espacio sin que la etiqueta del valor máximo quede
            cortada justo en el borde derecho. */}
        <XAxis type="number" domain={[0, (max: number) => Math.ceil(max * 1.12)]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickFormatter={((v: number) => formatear(v)) as any} />
        <YAxis
          type="category"
          dataKey="key"
          width={140}
          tick={{ fontSize: 12, fill: '#334155' }}
          axisLine={{ stroke: '#e2e8f0' }}
          interval={0}
        />
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
          formatter={((value: any, _name: any, entry: any) => [`${formatear(Number(value))}${entry?.payload?.participacion ? ` (${entry.payload.participacion.toFixed(1)}%)` : ''}`, 'Total']) as any}
        />
        <Bar
          dataKey="casos"
          shape={crearFormaBarra(maxCasos, resaltarMaximo) as any}
          cursor={onBarClick ? 'pointer' : 'default'}
          onClick={(d: any) => onBarClick?.(d.key)}
        >
          <LabelList
            dataKey="casos"
            position="right"
            content={((props: any) => {
              const { x, y, width, height, value, index } = props;
              const participacion = data[index]?.participacion;
              const texto = `${formatear(Number(value))}${participacion !== undefined ? ` · ${participacion.toFixed(1)}%` : ''}`;
              return (
                <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={13} fill="#1e293b" fontWeight={700}>
                  {texto}
                </text>
              );
            }) as any}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
