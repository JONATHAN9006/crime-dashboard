import { Fragment } from 'react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Ranking compacto de "Análisis por Unidad": NOMBRE · barra · CASOS · APORTE.
//  · Colores institucionales de siempre: la barra del MÁS AFECTADO en verde
//    oscuro con el recuadro rojo punteado; las demás alternan verde
//    petróleo y gris (igual que AporteBarList en el resto del dashboard).
//  · La columna de nombres mide lo que mide el nombre más largo (con un
//    tope), así la barra arranca pegada a las letras y no queda corrida
//    hacia el número de casos.
// Solo presenta: las cifras llegan ya calculadas.

const VERDE_MAXIMO = '#0b4a46';
const PALETA = ['#159089', '#94a3b8'];

export function RankingAporte({ data, cabeza, onClick }: {
  data: { key: string; casos: number; aportePct: number }[];
  cabeza: string;
  onClick?: (key: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.casos));
  if (data.length === 0) return <p className="py-4 text-center text-sm text-slate-400">Sin datos.</p>;
  return (
    <div className="grid items-center gap-x-2.5 text-[12.5px]" style={{ gridTemplateColumns: 'minmax(0, max-content) minmax(70px, 1fr) auto auto' }}>
      <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cabeza}</div>
      <div />
      <div className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Casos</div>
      <div className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Aporte</div>
      {data.map((d, i) => {
        const esMaximo = d.casos === max;
        const color = esMaximo ? VERDE_MAXIMO : PALETA[i % PALETA.length];
        const fila = onClick ? 'cursor-pointer' : '';
        return (
          // Fragment (no un div "display: contents") — la exportación a
          // imagen no maneja bien ese modo; cada celda recibe su propio clic.
          <Fragment key={d.key}>
            <div onClick={() => onClick?.(d.key)} className={`max-w-[170px] truncate py-[4px] text-slate-700 ${fila}`} title={d.key}>{d.key}</div>
            <div onClick={() => onClick?.(d.key)} className={`py-[4px] ${fila}`}>
              <div className="rounded" style={esMaximo ? { border: '2.5px dashed #dc2626', padding: '1px' } : undefined}>
                <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded" style={{ width: `${Math.max(3, (d.casos / max) * 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            </div>
            <div onClick={() => onClick?.(d.key)} className={`py-[4px] text-right font-bold text-[#10233f] ${fila}`}>{formatNumero(d.casos)}</div>
            <div onClick={() => onClick?.(d.key)} className={`py-[4px] pl-1 text-right text-slate-500 ${fila}`}>{formatDecimal(d.aportePct, 1)}%</div>
          </Fragment>
        );
      })}
    </div>
  );
}
