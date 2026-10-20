import { Fragment } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
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

/** Variación entre dos años: flecha roja ↑ si aumenta, verde ↓ si se reduce. */
export function VariacionCasos({ actual, anterior }: { actual: number; anterior: number }) {
  const d = actual - anterior;
  if (d === 0) return <span className="inline-flex items-center justify-end gap-0.5 font-semibold text-slate-400" title="Sin variación">= 0</span>;
  const sube = d > 0;
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 font-bold tabular-nums ${sube ? 'text-[#dc2626]' : 'text-[#15803d]'}`} title={sube ? 'Aumento' : 'Reducción'}>
      {sube ? <ArrowUp size={13} strokeWidth={3} /> : <ArrowDown size={13} strokeWidth={3} />}
      {sube ? '+' : '−'}{formatNumero(Math.abs(d))}
    </span>
  );
}

export function RankingAporte({ data, cabeza, onClick, seleccionados = [], anios = [] }: {
  data: { key: string; casos: number; aportePct: number; porAnio?: Record<number, number> }[];
  /** Con dos o más años: columnas de casos por año + variación (sin aporte %). */
  anios?: number[];
  cabeza: string;
  /** Clic = filtrar por ese valor; segundo clic = quitar el filtro (lo maneja quien llama). */
  onClick?: (key: string) => void;
  /** Valores hoy filtrados: se marcan en la lista. */
  seleccionados?: string[];
}) {
  const max = Math.max(1, ...data.map((d) => d.casos));
  if (data.length === 0) return <p className="py-4 text-center text-sm text-slate-400">Sin datos.</p>;
  const porAnios = anios.length >= 2 && data.some((d) => d.porAnio);
  if (porAnios) return <RankingPorAnios data={data} cabeza={cabeza} onClick={onClick} seleccionados={seleccionados} anios={anios} max={max} />;
  return (
    <div className="grid items-center gap-x-2.5 text-[12.5px]" style={{ gridTemplateColumns: 'minmax(0, max-content) minmax(70px, 1fr) auto auto' }}>
      <div className="pb-1 pl-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cabeza}</div>
      <div />
      <div className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Casos</div>
      <div className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">Aporte</div>
      {data.map((d, i) => {
        const esMaximo = d.casos === max;
        const color = esMaximo ? VERDE_MAXIMO : PALETA[i % PALETA.length];
        const marcado = seleccionados.includes(d.key);
        const fila = onClick ? `cursor-pointer ${marcado ? 'bg-[#e3f2ef]' : 'hover:bg-slate-50'}` : '';
        const titulo = onClick ? (marcado ? `Quitar el filtro "${d.key}"` : `Filtrar por "${d.key}" (otro clic lo quita)`) : d.key;
        return (
          // Fragment (no un div "display: contents") — la exportación a
          // imagen no maneja bien ese modo; cada celda recibe su propio clic.
          <Fragment key={d.key}>
            <div onClick={() => onClick?.(d.key)} className={`max-w-[170px] truncate rounded-l py-[4px] pl-1 ${marcado ? 'font-bold text-[#0b4a46]' : 'text-slate-700'} ${fila}`} title={titulo}>{marcado ? '✓ ' : ''}{d.key}</div>
            <div onClick={() => onClick?.(d.key)} className={`py-[4px] ${fila}`}>
              <div className="rounded" style={esMaximo ? { border: '2.5px dashed #dc2626', padding: '1px' } : undefined}>
                <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded" style={{ width: `${Math.max(3, (d.casos / max) * 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            </div>
            <div onClick={() => onClick?.(d.key)} className={`py-[4px] text-right font-bold text-[#10233f] ${fila}`}>{formatNumero(d.casos)}</div>
            <div onClick={() => onClick?.(d.key)} className={`rounded-r py-[4px] pl-1 pr-1 text-right text-slate-500 ${fila}`}>{formatDecimal(d.aportePct, 1)}%</div>
          </Fragment>
        );
      })}
    </div>
  );
}

// Misma tabla, pero con los casos de CADA año (solo los de las fechas
// analizadas) y la variación entre los dos últimos años en vez del aporte.
function RankingPorAnios({ data, cabeza, onClick, seleccionados, anios, max }: {
  data: { key: string; casos: number; porAnio?: Record<number, number> }[];
  cabeza: string;
  onClick?: (key: string) => void;
  seleccionados: string[];
  anios: number[];
  max: number;
}) {
  const ultimo = anios[anios.length - 1];
  const penultimo = anios[anios.length - 2];
  const cab = 'pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400';
  return (
    <div className="grid items-center gap-x-2.5 text-[12.5px]" style={{ gridTemplateColumns: `minmax(0, max-content) minmax(50px, 1fr) ${anios.map(() => 'auto').join(' ')} auto` }}>
      <div className="pb-1 pl-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{cabeza}</div>
      <div />
      {anios.map((a) => <div key={a} className={cab}>{a}</div>)}
      <div className={cab} title={`Variación ${penultimo} → ${ultimo}`}>Var.</div>
      {data.map((d, i) => {
        const esMaximo = d.casos === max;
        const color = esMaximo ? VERDE_MAXIMO : PALETA[i % PALETA.length];
        const marcado = seleccionados.includes(d.key);
        const fila = onClick ? `cursor-pointer ${marcado ? 'bg-[#e3f2ef]' : 'hover:bg-slate-50'}` : '';
        const titulo = onClick ? (marcado ? `Quitar el filtro "${d.key}"` : `Filtrar por "${d.key}" (otro clic lo quita)`) : d.key;
        const clic = () => onClick?.(d.key);
        return (
          <Fragment key={d.key}>
            <div onClick={clic} className={`max-w-[170px] truncate rounded-l py-[4px] pl-1 ${marcado ? 'font-bold text-[#0b4a46]' : 'text-slate-700'} ${fila}`} title={titulo}>{marcado ? '✓ ' : ''}{d.key}</div>
            <div onClick={clic} className={`py-[4px] ${fila}`}>
              <div className="rounded" style={esMaximo ? { border: '2.5px dashed #dc2626', padding: '1px' } : undefined}>
                <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
                  <div className="h-full rounded" style={{ width: `${Math.max(3, (d.casos / max) * 100)}%`, backgroundColor: color }} />
                </div>
              </div>
            </div>
            {anios.map((a) => (
              <div key={a} onClick={clic} className={`py-[4px] text-right tabular-nums ${a === ultimo ? 'font-bold text-[#10233f]' : 'font-semibold text-slate-500'} ${fila}`}>{formatNumero(d.porAnio?.[a] ?? 0)}</div>
            ))}
            <div onClick={clic} className={`rounded-r py-[4px] pl-1 pr-1 text-right ${fila}`}>
              <VariacionCasos actual={d.porAnio?.[ultimo] ?? 0} anterior={d.porAnio?.[penultimo] ?? 0} />
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
