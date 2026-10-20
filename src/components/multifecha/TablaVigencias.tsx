import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, FileSpreadsheet } from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import { Card } from '../ui/Card';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { puedeDescargar } from '../../utils/permisos';
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
  const th = 'whitespace-nowrap px-2 py-1.5 text-right text-[10.5px] font-bold uppercase tracking-wide text-slate-500';

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
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-[1] whitespace-nowrap rounded-l-md bg-slate-50 px-2 py-1.5 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{cabeza}</th>
                {vigencias.map((v, i) => (
                  <th key={v.id} className={clsx(th, i === n - 1 && 'text-[#10233f]')} title={`${v.etiqueta}: ${v.rango}`}>{v.etiqueta}</th>
                ))}
                {comparable && <th className={th} title={`${ultima.etiqueta} − ${primera.etiqueta}`}>Var. abs.</th>}
                {comparable && <th className={clsx(th, 'rounded-r-md')} title={`(${ultima.etiqueta} − ${primera.etiqueta}) ÷ ${primera.etiqueta} × 100`}>Var. %</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const marcado = seleccionados.includes(f.key);
                const clic = onFila ? () => onFila(f.key) : undefined;
                return (
                  <tr key={f.key} onClick={clic} title={onFila ? (marcado ? `Quitar el filtro "${f.key}"` : `Filtrar por "${f.key}" (otro clic lo quita)`) : undefined} className={clsx('border-b border-slate-100', onFila && 'cursor-pointer', marcado ? 'bg-[#e3f2ef]' : onFila && 'hover:bg-slate-50')}>
                    <td className={clsx('sticky left-0 z-[1] max-w-[190px] truncate border-b border-slate-100 px-2 py-[5px]', marcado ? 'bg-[#e3f2ef] font-bold text-[#0b4a46]' : 'bg-white text-slate-800')}>
                      <span className="flex items-center gap-1.5">{iconoFila?.(f.key)}<span className="truncate">{marcado ? '✓ ' : ''}{etiqueta ? etiqueta(f.key) : f.key}</span></span>
                    </td>
                    {vigencias.map((v, i) => (
                      <td key={v.id} className={clsx('border-b border-slate-100 px-2 py-[5px] text-right tabular-nums', i === n - 1 ? 'font-extrabold text-[#10233f]' : 'text-slate-600')}>{formatNumero(f.porVigencia[i] ?? 0)}</td>
                    ))}
                    {comparable && <td className="border-b border-slate-100 px-2 py-[5px] text-right"><VarAbs valor={f.varAbs} flecha={false} /></td>}
                    {comparable && <td className="border-b border-slate-100 px-2 py-[5px] text-right"><VarPct valor={f.varPct} /></td>}
                  </tr>
                );
              })}
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
