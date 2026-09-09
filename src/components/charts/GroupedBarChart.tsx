import { Bar, ComposedChart, Legend, Line, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumero } from '../../utils/aggregations';

const COLORES = ['#94a3b8', '#159089', '#10233f', '#b45309', '#7c3aed', '#0891b2'];

// Paleta institucional: verde institucional y gris medio-oscuro alternados
// (reemplaza la paleta multicolor anterior), para las gráficas de una sola
// serie donde cada barra necesita distinguirse de la de al lado.
const PALETA_BARRAS = ['#159089', '#94a3b8'];
// La barra con más casos se resalta en un verde más oscuro que el
// institucional, con el recuadro punteado rojo para que se distinga de
// inmediato cuál es el máximo.
const VERDE_MAXIMO = '#0b4a46';

// Dibuja la barra normal (con color propio, o distinto por posición cuando
// corresponde) y, si su valor está entre los N valores más altos de TODA la
// gráfica (considerando todas las series), un recuadro punteado rojo con un
// pequeño margen alrededor (no pegado al borde). Con N=1 (el valor por
// defecto) el comportamiento es el de siempre: solo el máximo. Si varias
// barras empatan justo en el valor N-ésimo, TODAS esas barras se resaltan
// (regla de empate consistente: nunca se deja fuera un valor empatado con
// uno que sí califica).
function crearFormaBarra(colorBase: string, valoresDestacados: Set<number>, resaltar: boolean, colorPorBarra: boolean) {
  return (props: any) => {
    const { x, y, width, height, value, index } = props;
    const esDestacado = resaltar && valoresDestacados.has(Number(value)) && Number(value) > 0;
    const color = esDestacado ? VERDE_MAXIMO : (colorPorBarra ? PALETA_BARRAS[index % PALETA_BARRAS.length] : colorBase);
    const MARGEN = 4;
    return (
      <g>
        <rect x={x} y={y} width={Math.max(width, 1)} height={Math.max(height, 1)} fill={color} rx={3} />
        {esDestacado && (
          <rect
            x={x - MARGEN}
            y={y - MARGEN}
            width={Math.max(width, 1) + MARGEN * 2}
            height={Math.max(height, 1) + MARGEN * 2}
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

export function GroupedBarChart({ data, xKey, seriesKeys, height = 320, horizontal = false, seriesColors, resaltarMaximo = false, colorPorBarra = false, mostrarTendencia = false, onBarClick, anchoMaximoBarra, tamanoEtiqueta = 12, resaltarTopN = 1, espaciadoCategoria }: {
  data: Record<string, any>[];
  xKey: string;
  seriesKeys: string[];
  height?: number;
  horizontal?: boolean;
  seriesColors?: Record<string, string>;
  resaltarMaximo?: boolean;
  colorPorBarra?: boolean;
  anchoMaximoBarra?: number;
  tamanoEtiqueta?: number;
  resaltarTopN?: number;
  mostrarTendencia?: boolean;
  onBarClick?: (categoria: string) => void;
  // Espacio entre grupos de barras, como fracción (0 a 1) del ancho de cada
  // categoría — por defecto usa el 30% de Recharts (sin especificar); un
  // valor más bajo (ej. 0.1) junta las barras para que ocupen menos espacio
  // horizontal, útil cuando la gráfica se descarga como imagen.
  espaciadoCategoria?: number;
}) {
  const esUnaSolaSerie = seriesKeys.length === 1;
  // Los N valores más altos de toda la gráfica (todas las series juntas) —
  // con resaltarTopN=1 (por defecto) es exactamente el máximo de siempre.
  // Si hay empate justo en el límite, se incluyen todos los empatados (ver
  // crearFormaBarra).
  const valoresDestacados = new Set(
    data
      .flatMap((d) => seriesKeys.map((k) => Number(d[k]) || 0))
      .filter((v) => v > 0)
      .sort((a, b) => b - a)
      .slice(0, resaltarTopN),
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 34, right: 24, left: horizontal ? 8 : 0, bottom: 0 }} barCategoryGap={espaciadoCategoria !== undefined ? `${espaciadoCategoria * 100}%` : undefined}>
        {horizontal ? (
          <>
            {/* domain con margen del 12% para no dejar espacio excesivo, pero
                sin cortar la etiqueta de valor de la barra más larga. */}
            <XAxis type="number" domain={[0, (max: number) => Math.ceil(max * 1.12)]} tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis type="category" dataKey={xKey} width={140} tick={{ fontSize: 12, fill: '#334155' }} interval={0} />
          </>
        ) : (
          <>
            {/* interval={0} fuerza a mostrar TODAS las etiquetas del eje (ej.
                las 24 horas), en vez de que Recharts oculte automáticamente
                algunas por falta de espacio. */}
            <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#334155', fontWeight: 500 }} interval={0} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
          </>
        )}
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {seriesKeys.map((k, i) => {
          const color = seriesColors?.[k] ?? (esUnaSolaSerie ? '#116762' : COLORES[i % COLORES.length]);
          const usarFormaPersonalizada = resaltarMaximo || (esUnaSolaSerie && colorPorBarra);
          return (
            <Bar
              key={k}
              dataKey={k}
              fill={color}
              shape={(usarFormaPersonalizada ? crearFormaBarra(color, valoresDestacados, resaltarMaximo, esUnaSolaSerie && colorPorBarra) : undefined) as any}
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              cursor={onBarClick ? 'pointer' : 'default'}
              onClick={onBarClick ? (d: any) => onBarClick(d[xKey]) : undefined}
              maxBarSize={anchoMaximoBarra}
            >
              <LabelList
                dataKey={k}
                position={horizontal ? 'right' : 'top'}
                // offset=8 (en vez del valor por defecto, que las pegaba casi
                // encima de la barra o del punto de la línea de tendencia):
                // un pequeño espacio de aire entre el número y la barra, sin
                // tocar la altura real de la barra ni la escala del eje.
                offset={horizontal ? 6 : 14}
                formatter={((v: any) => (v ? formatNumero(Number(v)) : '')) as any}
                style={{ fontSize: tamanoEtiqueta, fill: '#1e293b', fontWeight: 700 }}
              />
            </Bar>
          );
        })}
        {mostrarTendencia && esUnaSolaSerie && (
          <Line
            type="monotone"
            dataKey={seriesKeys[0]}
            stroke="#0f172a"
            strokeWidth={2}
            dot={{ r: 3, fill: '#0f172a' }}
            activeDot={{ r: 5 }}
            legendType="none"
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
