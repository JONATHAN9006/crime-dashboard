import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, FileSpreadsheet } from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import { Card } from '../ui/Card';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { puedeDescargar } from '../../utils/permisos';
import { VariacionPct, claseDif } from '../resumen/ComparativoComun';
import type { FilaVigencias, VigenciaMF } from '../../hooks/useMultifecha';

// Tabla comparativa por vigencia: casos de CADA vigencia (solo dentro de su
// rango de fechas), variación absoluta y % entre la PRIMERA y la ÚLTIMA
// vigencia, y barra proporcional de la última. Solo presenta: las cifras
// llegan calculadas desde useMultifecha (fuente única).

export const COLOR_AUMENTO = '#dc2626';
export const COLOR_REDUCCION = '#15803d';

export function VarAbs({ valor, grande = false, flecha = true }: { valor: number; grande?: boolean; flecha?: boolean }) {
  if (valor === 0) return <span className={clsx('font-semibold text-slate-400', grande && 'text-[24px] leading-none')}>0</span>;
  const sube = valor > 0;
  return (
    <span className={clsx('inline-flex items-center justify-end gap-0.5 font-bold tabular-nums', grande && 'text-[24px] leading-none')} style={{ color: sube ? COLOR_AUMENTO : COLOR_REDUCCION }}>
      {flecha && (sube ? <ArrowUp size={grande ? 22 : 13} strokeWidth={3} /> : <ArrowDown size={grande ? 22 : 13} strokeWidth={3} />)}
      {sube ? '+' : '−'}{formatNumero(Math.abs(valor))}
    </span>
  );
}

export function VarPct({ valor, grande = false }: { valor: number | null; grande?: boolean }) {
  if (valor === null) return <span className={clsx('font-semibold text-slate-400', grande && 'text-[20px]')} title="La primera vigencia no tiene casos: no se puede calcular el porcentaje">N/A</span>;
  if (Math.abs(valor) < 0.05) return <span className={clsx('font-semibold text-slate-400', grande && 'text-[24px] leading-none')}>0,0 %</span>;
  const sube = valor > 0;
  return (
    <span className={clsx('inline-flex items-center justify-end gap-0.5 font-bold tabular-nums', grande && 'text-[24px] leading-none')} style={{ color: sube ? COLOR_AUMENTO : COLOR_REDUCCION }}>
      {sube ? <ArrowUp size={grande ? 22 : 13} strokeWidth={3} /> : <ArrowDown size={grande ? 22 : 13} strokeWidth={3} />}
      {sube ? '+' : '−'}{formatDecimal(Math.abs(valor), 1)} %
    </span>
  );
}

const OPCIONES_TOP: { label: string; valor: number | undefined }[] = [
  { label: 'Top 5', valor: 5 }, { label: 'Top 10', valor: 10 }, { label: 'Todas', valor: undefined },
];

export function exportarTablaVigencias(nombre: string, cabeza: string, filas: FilaVigencias[], vigencias: VigenciaMF[]) {
  const primera = vigencias[0];
  const ultima = vigencias[vigencias.length - 1];
  const datos = filas.map((f) => {
    const fila: Record<string, string | number> = { [cabeza]: f.key };
    vigencias.forEach((v, i) => { fila[`${v.etiqueta} (${v.rango})`] = f.porVigencia[i] ?? 0; });
    if (vigencias.length >= 2) {
      fila[`Var. abs. ${primera.etiqueta}→${ultima.etiqueta}`] = f.varAbs;
      fila[`Var. % ${primera.etiqueta}→${ultima.etiqueta}`] = f.varPct === null ? 'N/A' : Number(f.varPct.toFixed(1));
    }
    return fila;
  });
  const hoja = XLSX.utils.json_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, cabeza.slice(0, 30) || 'Tabla');
  XLSX.writeFile(libro, `multifecha-${nombre}.xlsx`);
}

export function TablaVigencias({ id, titulo, subtitulo, icono, cabeza, filas, vigencias, topInicial = 5, conTop = true, onFila, seleccionados = [], etiqueta, iconoFila, className }: {
  id: string;
  titulo: string;
  subtitulo?: string;
  icono: ReactNode;
  cabeza: string;
  filas: FilaVigencias[];
  vigencias: VigenciaMF[];
  topInicial?: number | undefined;
  conTop?: boolean;
  onFila?: (key: string) => void;
  seleccionados?: string[];
  /** Texto que se muestra para la clave (p. ej. la hora "7" → "07:00 – 07:59"). */
  etiqueta?: (key: string) => string;
  iconoFila?: (key: string) => ReactNode;
  className?: string;
}) {
  const [top, setTop] = useState<number | undefined>(topInicial);
  const visibles = conTop && top ? filas.slice(0, top) : filas;
  const n = vigencias.length;
  const comparable = n >= 2;
  const primera = vigencias[0];
  const ultima = vigencias[n - 1];
  const descarga = puedeDescargar();

  return (
    <Card
      className={clsx('flex h-full flex-col', className)}
      title={titulo}
      subtitle={subtitulo ?? `${conTop && top ? `Top ${top}` : 'Todos'} por casos de ${ultima?.etiqueta ?? '—'} · periodos equivalentes`}
      descargable={`multifecha-${id}`}
      icono={icono}
      claseTitulo="text-[15px] font-extrabold leading-tight text-[#10233f]"
      actions={
        <div className="flex items-center gap-1.5">
          {conTop && (
            <div className="flex overflow-hidden rounded-full border border-slate-200 bg-slate-50 p-0.5">
              {OPCIONES_TOP.map((o) => (
                <button key={o.label} type="button" onClick={() => setTop(o.valor)} aria-pressed={top === o.valor} className={clsx('rounded-full px-2.5 py-0.5 text-[11px] font-semibold', top === o.valor ? 'bg-[#116762] text-white' : 'text-slate-600 hover:bg-white')}>{o.label}</button>
              ))}
            </div>
          )}
          {descarga && filas.length > 0 && (
            <button type="button" onClick={() => exportarTablaVigencias(id, cabeza, filas, vigencias)} title="Exportar tabla a Excel" className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
              <FileSpreadsheet size={13} /> Excel
            </button>
          )}
        </div>
      }
    >
      {filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Sin casos en las vigencias seleccionadas.</p>
      ) : (
        // Misma estructura y colores que «Casos por estación» del panel
        // principal: encabezado institucional, años en azul oscuro,
        // VARIACIÓN (Dif. y %) con su color, y fila TOTAL.
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="text-white">
                <th rowSpan={comparable ? 2 : 1} className="sticky left-0 z-[1] rounded-tl-md bg-[#0f5f57] px-2.5 py-2 text-left text-[12.5px] font-bold uppercase">{cabeza}</th>
                {vigencias.map((v, i) => (
                  <th key={v.id} rowSpan={comparable ? 2 : 1} title={`${v.etiqueta}: ${v.rango}`} className={clsx('bg-[#10233f] px-1.5 py-2 text-center text-[14px] font-bold tabular-nums', !comparable && i === n - 1 && 'rounded-tr-md')}>{v.etiqueta}</th>
                ))}
                {comparable && <th colSpan={2} className="rounded-tr-md bg-[#0f5f57] px-1.5 pt-1.5 text-center text-[12px] font-bold uppercase">Variación</th>}
              </tr>
              {comparable && (
                <tr className="text-white">
                  <th className="bg-[#0f5f57] px-1.5 pb-1.5 text-center text-[11.5px] font-bold uppercase" title={`${ultima.etiqueta} − ${primera.etiqueta}`}>Dif.</th>
                  <th className="bg-[#0f5f57] px-1.5 pb-1.5 text-center text-[11.5px] font-bold" title={`(${ultima.etiqueta} − ${primera.etiqueta}) ÷ ${primera.etiqueta} × 100`}>%</th>
                </tr>
              )}
            </thead>
            <tbody>
              {visibles.map((f) => {
                const marcado = seleccionados.includes(f.key);
                const clic = onFila ? () => onFila(f.key) : undefined;
                const celda = 'border-b border-slate-200 px-1.5 py-[6px]';
                return (
                  <tr key={f.key} onClick={clic} title={onFila ? (marcado ? `Quitar el filtro "${f.key}"` : `Filtrar por "${f.key}" (otro clic lo quita)`) : undefined} className={clsx(onFila && 'cursor-pointer hover:bg-slate-50', marcado && 'bg-[#e3f2ef]')}>
                    <td className={clsx(celda, 'sticky left-0 z-[1] max-w-[180px] truncate px-2.5 font-semibold text-[#10233f]', marcado ? 'bg-[#e3f2ef]' : 'bg-white')}>
                      <span className="flex items-center gap-1.5">{iconoFila?.(f.key)}<span className="truncate">{marcado ? '✓ ' : ''}{etiqueta ? etiqueta(f.key) : f.key}</span></span>
                    </td>
                    {vigencias.map((v, i) => (
                      <td key={v.id} className={clsx(celda, 'text-center tabular-nums text-slate-700')}>{formatNumero(f.porVigencia[i] ?? 0)}</td>
                    ))}
                    {comparable && <td className={clsx(celda, 'w-[1%] whitespace-nowrap text-center font-semibold tabular-nums', claseDif(f.varAbs, false))}>{f.varAbs > 0 ? '+' : ''}{formatNumero(f.varAbs)}</td>}
                    {comparable && <td className={clsx(celda, 'w-[1%] whitespace-nowrap text-right text-[12.5px]')}><VariacionPct anterior={f.porVigencia[0] ?? 0} actual={f.porVigencia[n - 1] ?? 0} subirEsBueno={false} compacta /></td>}
                  </tr>
                );
              })}
              {(() => {
                // TOTAL de las filas mostradas (igual que la tabla del panel principal).
                const tot = vigencias.map((_, i) => visibles.reduce((a, f) => a + (f.porVigencia[i] ?? 0), 0));
                const dif = (tot[n - 1] ?? 0) - (tot[0] ?? 0);
                const pie = 'border-b-2 border-slate-300 px-1.5 py-[7px]';
                return (
                  <tr className="bg-slate-200/70 font-bold text-[#10233f]">
                    <td className={clsx(pie, 'sticky left-0 z-[1] bg-[#e7ebf0] px-2.5 text-[12.5px] uppercase')}>Total</td>
                    {tot.map((t, i) => <td key={i} className={clsx(pie, 'text-center tabular-nums')}>{formatNumero(t)}</td>)}
                    {comparable && <td className={clsx(pie, 'whitespace-nowrap text-center tabular-nums', claseDif(dif, false))}>{dif > 0 ? '+' : ''}{formatNumero(dif)}</td>}
                    {comparable && <td className={clsx(pie, 'whitespace-nowrap text-right text-[12.5px]')}><VariacionPct anterior={tot[0] ?? 0} actual={tot[n - 1] ?? 0} subirEsBueno={false} negrita compacta /></td>}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      )}
      {comparable && filas.length > 0 && (
        <p className="mt-auto pt-2 text-[10.5px] text-slate-400">Variación: {ultima.etiqueta} ({ultima.rango}) frente a {primera.etiqueta} ({primera.rango}).</p>
      )}
    </Card>
  );
}
