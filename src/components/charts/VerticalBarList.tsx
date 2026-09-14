import { formatNumero, formatDecimal } from '../../utils/aggregations';
import type { FilaAporte } from './AporteBarList';

const PALETA_BARRAS = ['#159089', '#94a3b8'];
const VERDE_MAXIMO = '#0b4a46';

/**
 * Mismo dato y mismo cálculo de "Aporte %" que AporteBarList, pero en
 * barras VERTICALES (categoría abajo, valor y % arriba de cada barra) —
 * para Operatividad, a pedido, en vez del formato horizontal que usa
 * Delictividad.
 */
export function VerticalBarList({ data, onBarClick, resaltarMaximo = true, colorMaximo = VERDE_MAXIMO, colorBordeMaximo = '#1d4ed8', paletaBarras }: {
  data: FilaAporte[];
  onBarClick?: (key: string) => void;
  resaltarMaximo?: boolean;
  colorMaximo?: string;
  colorBordeMaximo?: string;
  paletaBarras?: string[];
}) {
  if (data.length === 0) return <p className="py-4 text-center text-sm text-slate-400">Sin datos.</p>;

  const maxCasos = Math.max(1, ...data.map((d) => d.casos));
  const paleta = paletaBarras ?? PALETA_BARRAS;
  const ALTO_MAXIMO_PX = 140;

  return (
    <div className="flex items-end justify-around gap-2 overflow-x-auto pb-1" style={{ minHeight: ALTO_MAXIMO_PX + 60 }}>
      {data.map((d, i) => {
        const altoPct = Math.max(3, (d.casos / maxCasos) * 100);
        const esMaximo = resaltarMaximo && d.casos === maxCasos && maxCasos > 0;
        const color = esMaximo ? colorMaximo : paleta[i % paleta.length];
        return (
          <div
            key={d.key}
            className={`flex min-w-[56px] flex-1 flex-col items-center justify-end ${onBarClick ? 'cursor-pointer' : ''}`}
            onClick={() => onBarClick?.(d.key)}
          >
            <div className="mb-1 text-center text-sm font-bold text-slate-800">{formatNumero(d.casos)}</div>
            <div className="mb-1 text-center text-xs font-semibold text-slate-500">{formatDecimal(d.aportePct, 1)}%</div>
            <div
              className="flex w-full items-end justify-center rounded-t"
              style={{ height: ALTO_MAXIMO_PX, ...(esMaximo ? { border: `2px dashed ${colorBordeMaximo}`, padding: '1px' } : {}) }}
            >
              <div
                className="w-full rounded-t transition-all"
                style={{ height: `${altoPct}%`, backgroundColor: color, minHeight: 4 }}
              />
            </div>
            <div className="mt-1.5 max-w-[80px] truncate text-center text-xs font-medium text-slate-600" title={d.key}>{d.key}</div>
          </div>
        );
      })}
    </div>
  );
}
