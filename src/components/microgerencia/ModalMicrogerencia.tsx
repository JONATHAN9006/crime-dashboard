import { createPortal } from 'react-dom';
import { X, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DATOS_MICROGERENCIA, type NodoMicrogerencia } from '../../data/microgerencia';
import { generarPdfMicrogerencia } from '../../data/pdfMicrogerencia';
import { formatNumero, formatDecimal } from '../../utils/aggregations';

function formatearPct(n: number | null): string {
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${formatDecimal(n, 1)}%`;
}

// Una fila = un nodo de la jerarquía (General → Distrito → Estación → CAI →
// Zona de Atención), con sangría según su profundidad — nunca recalcula
// nada: todos los números vienen ya calculados en data/microgerencia.ts.
function FilaNodo({ nodo, profundidad }: { nodo: NodoMicrogerencia; profundidad: number }) {
  const esNivelSuperior = profundidad <= 1; // General y Distrito
  const esEstacion = profundidad === 2;
  const Icono = nodo.dif > 0 ? TrendingUp : nodo.dif < 0 ? TrendingDown : Minus;
  const colorDif = nodo.dif > 0 ? 'text-rose-600' : nodo.dif < 0 ? 'text-emerald-600' : 'text-slate-400';

  return (
    <>
      <tr className={esNivelSuperior ? 'bg-brand-green/10' : esEstacion ? 'bg-slate-100' : profundidad % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
        <td className={`py-1.5 pr-2 ${esNivelSuperior || esEstacion ? 'font-bold text-brand-navy' : 'text-slate-700'}`} style={{ paddingLeft: 8 + profundidad * 16 }}>
          {nodo.nombre}
        </td>
        <td className="px-2 py-1.5 text-right text-slate-600">{formatNumero(nodo.total2025)}</td>
        <td className="px-2 py-1.5 text-right text-slate-600">{formatNumero(nodo.fecha2025)}</td>
        <td className="px-2 py-1.5 text-right font-semibold text-slate-800">{formatNumero(nodo.fecha2026)}</td>
        <td className={`px-2 py-1.5 text-right font-semibold ${colorDif}`}>
          <span className="inline-flex items-center gap-1"><Icono size={11} />{nodo.dif >= 0 ? '+' : ''}{formatNumero(nodo.dif)}</span>
        </td>
        <td className={`px-2 py-1.5 text-right ${colorDif}`}>{formatearPct(nodo.pct)}</td>
        <td className="px-2 py-1.5 text-right text-slate-500">{formatDecimal(nodo.aportePct, 1)}%</td>
        <td className="px-2 py-1.5 text-right text-slate-500">{formatNumero(nodo.terminaAnio)}</td>
      </tr>
      {nodo.hijos.map((hijo) => <FilaNodo key={hijo.nombre} nodo={hijo} profundidad={profundidad + 1} />)}
    </>
  );
}

export function ModalMicrogerencia({ onCerrar }: { onCerrar: () => void }) {
  const datos = DATOS_MICROGERENCIA;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-navy px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-white">Microgerencia y Proyección Delictiva MEPOY</h2>
            <p className="text-xs text-slate-300">{datos.periodo} · Días hasta la fecha: {datos.diasHastaLaFecha}</p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <p className="mb-3 text-xs text-slate-400">
            Reporte estático de referencia (no se recalcula con los filtros del dashboard) — mismo corte y misma metodología del archivo original de Microgerencia.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="py-2 text-left">Dependencia / Zona de Atención</th>
                <th className="px-2 py-2 text-right">Total 2025</th>
                <th className="px-2 py-2 text-right">2025 (a la fecha)</th>
                <th className="px-2 py-2 text-right">2026 (a la fecha)</th>
                <th className="px-2 py-2 text-right">DIF</th>
                <th className="px-2 py-2 text-right">%</th>
                <th className="px-2 py-2 text-right">Aporte %</th>
                <th className="px-2 py-2 text-right">Proy. cierre 2026</th>
              </tr>
            </thead>
            <tbody>
              <FilaNodo nodo={datos.general} profundidad={0} />
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => generarPdfMicrogerencia(datos)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green/90"
          >
            <Download size={15} />
            Descargar PDF
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
