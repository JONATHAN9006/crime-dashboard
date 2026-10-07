import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Card } from '../ui/Card';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Ranking del módulo RNMC (y de su vista "Delitos vs RNMC"): # · nombre ·
// barra · registros · aporte. El CÁLCULO es el mismo de siempre (ver
// rankear): conteo por valor no vacío y aporte = casos / total de valores
// no vacíos. Aquí solo cambia la presentación.

export type TopModo = 5 | 10 | 'todos';

export interface FilaRanking { key: string; casos: number; aportePct: number }

export function rankear<T>(items: T[], campo: (r: T) => string, n: TopModo | number): FilaRanking[] {
  const conteo = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    const v = campo(it);
    if (!v) continue;
    conteo.set(v, (conteo.get(v) || 0) + 1);
    total++;
  }
  const ordenado = Array.from(conteo.entries())
    .map(([key, casos]) => ({ key, casos, aportePct: total > 0 ? (casos / total) * 100 : 0 }))
    .sort((a, b) => b.casos - a.casos);
  return n === 'todos' ? ordenado : ordenado.slice(0, n);
}

export const AZUL_TINTA = '#10233f';
const TEAL = '#159089';
const GRIS = '#94a3b8';
const MAXIMO = '#0b4a46';

export function SelectorTop({ valor, onChange }: { valor: TopModo; onChange: (v: TopModo) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-300">
      {([5, 10, 'todos'] as TopModo[]).map((m) => (
        <button
          key={String(m)}
          type="button"
          onClick={() => onChange(m)}
          className={`border-l border-slate-300 px-1.5 py-[3px] text-[10.5px] font-semibold first:border-l-0 ${valor === m ? 'bg-[#10233f] text-white' : 'bg-white text-[#10233f] hover:bg-slate-50'}`}
        >
          {m === 'todos' ? 'Todos' : `Top ${m}`}
        </button>
      ))}
    </div>
  );
}

/** Tabla de ranking (una sola grilla: todas las filas quedan alineadas). */
export function TablaRanking({ filas, encabezado, resaltarMaximo = false, conEncabezados = true }: {
  filas: FilaRanking[];
  encabezado?: string;
  resaltarMaximo?: boolean;
  conEncabezados?: boolean;
}) {
  if (filas.length === 0) return <p className="py-6 text-center text-xs text-slate-400">No hay registros disponibles para los filtros seleccionados.</p>;
  const max = Math.max(1, ...filas.map((f) => f.casos));
  return (
    <div className="grid items-center gap-x-2.5 gap-y-[5px] text-[12.5px]" style={{ gridTemplateColumns: '18px minmax(70px, max-content) minmax(50px, 1fr) auto 46px' }}>
      {conEncabezados && (
        <>
          <span className="text-[10.5px] font-semibold text-slate-500">#</span>
          <span className="text-[10.5px] font-semibold text-slate-500">{encabezado ?? ''}</span>
          <span />
          <span className="text-right text-[10.5px] font-semibold text-slate-500">Registros</span>
          <span className="text-right text-[10.5px] font-semibold text-slate-500">Aporte</span>
        </>
      )}
      {filas.map((f, i) => {
        const esMax = resaltarMaximo && i === 0 && f.casos === max;
        return (
          <Fragment key={f.key}>
            <span className="text-[12px] font-semibold tabular-nums text-slate-600">{i + 1}</span>
            <span className="max-w-[210px] truncate text-slate-700" title={f.key}>{f.key}</span>
            <span className={`block rounded ${esMax ? 'p-[2px]' : ''}`} style={esMax ? { border: '2px dashed #dc2626' } : undefined}>
              <span className="block h-[11px] overflow-hidden rounded bg-slate-100">
                <span className="block h-full rounded" style={{ width: `${Math.max(2, (f.casos / max) * 100)}%`, background: esMax ? MAXIMO : i % 2 === 0 ? TEAL : GRIS }} />
              </span>
            </span>
            <span className="text-right font-bold tabular-nums" style={{ color: AZUL_TINTA }}>{formatNumero(f.casos)}</span>
            <span className="text-right tabular-nums text-slate-500">{formatDecimal(f.aportePct, 1)}%</span>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Tarjeta de ranking completa: título con ícono, Top 5/10/Todos, descarga. */
export function TarjetaRanking<T>({ titulo, icono, registros, campo, encabezado, archivo, resaltarMaximo = false, topInicial = 10 }: {
  titulo: string;
  icono: ReactNode;
  registros: T[];
  campo: (r: T) => string;
  encabezado?: string;
  archivo: string;
  resaltarMaximo?: boolean;
  topInicial?: TopModo;
}) {
  const [top, setTop] = useState<TopModo>(topInicial);
  const filas = useMemo(() => rankear(registros, campo, top), [registros, campo, top]);
  return (
    <Card
      title={titulo}
      descargable={archivo}
      icono={icono}
      claseTitulo="text-[13.5px] font-bold leading-snug text-[#10233f]"
      actions={<SelectorTop valor={top} onChange={setTop} />}
    >
      <TablaRanking filas={filas} encabezado={encabezado} resaltarMaximo={resaltarMaximo} />
    </Card>
  );
}

/** Ícono de título en recuadro de color (como en las tarjetas de la referencia). */
export function IconoTitulo({ children, tono = 'bg-[#e6f0fb] text-[#1e4f8f]' }: { children: ReactNode; tono?: string }) {
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tono}`}>{children}</span>;
}
