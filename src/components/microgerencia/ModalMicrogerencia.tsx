import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, TrendingUp, TrendingDown, Minus, ChevronRight, ChevronDown } from 'lucide-react';
import type { NodoMicrogerencia } from '../../data/microgerencia';
import { useMicrogerencia } from '../../hooks/useMicrogerencia';
import { generarPdfMicrogerencia } from '../../data/pdfMicrogerencia';
import { formatNumero, formatDecimal } from '../../utils/aggregations';

function formatearPct(n: number | null): string {
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${formatDecimal(n, 1)}%`;
}

// Fila compacta con las columnas "generales" de un nodo — Total 2025, año a
// la fecha ×2, DIF, %, Aporte % y Proyección — las mismas siete columnas
// que ya trae la Hoja3 del Excel original, en cualquier nivel (distrito,
// estación, CAI, zona o delito).
function MetricasNodo({ nodo, destacado }: { nodo: NodoMicrogerencia; destacado: boolean }) {
  const Icono = nodo.dif > 0 ? TrendingUp : nodo.dif < 0 ? TrendingDown : Minus;
  const color = nodo.dif > 0 ? 'text-rose-600' : nodo.dif < 0 ? 'text-emerald-600' : 'text-slate-400';
  return (
    <div className={`grid grid-cols-3 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-7 ${destacado ? '' : 'text-slate-500'}`}>
      <div><span className="block text-slate-400">Total 2025</span>{formatNumero(nodo.total2025)}</div>
      <div><span className="block text-slate-400">2025 (a la fecha)</span>{formatNumero(nodo.fecha2025)}</div>
      <div><span className="block text-slate-400">2026 (a la fecha)</span><strong>{formatNumero(nodo.fecha2026)}</strong></div>
      <div className={color}><span className="block text-slate-400">DIF</span><span className="inline-flex items-center gap-0.5"><Icono size={10} />{nodo.dif >= 0 ? '+' : ''}{formatNumero(nodo.dif)}</span></div>
      <div className={color}><span className="block text-slate-400">%</span>{formatearPct(nodo.pct)}</div>
      <div><span className="block text-slate-400">Aporte %</span>{formatDecimal(nodo.aportePct, 1)}%</div>
      <div><span className="block text-slate-400">Proy. cierre {new Date().getFullYear()}</span>{formatNumero(nodo.terminaAnio)}</div>
    </div>
  );
}

function TablaTrimestres({ nodo }: { nodo: NodoMicrogerencia }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Trimestres</p>
      <table className="w-full text-[11px]">
        <thead><tr className="text-slate-400"><th className="text-left font-medium">Trimestre</th><th className="text-right font-medium">2025</th><th className="text-right font-medium">2026</th><th className="text-right font-medium">Dif</th></tr></thead>
        <tbody>
          {nodo.trimestres.map((t) => (
            <tr key={t.etiqueta} className="border-t border-slate-100">
              <td className="py-0.5 text-slate-600">{t.etiqueta}</td>
              <td className="py-0.5 text-right text-slate-500">{formatNumero(t.anio2025)}</td>
              <td className="py-0.5 text-right font-semibold text-slate-700">{formatNumero(t.anio2026)}</td>
              <td className={`py-0.5 text-right ${t.dif > 0 ? 'text-rose-600' : t.dif < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{t.dif >= 0 ? '+' : ''}{formatNumero(t.dif)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TablaMeses({ nodo }: { nodo: NodoMicrogerencia }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Distribución por mes</p>
      <table className="w-full text-[11px]">
        <thead><tr className="text-slate-400"><th className="text-left font-medium">Mes</th><th className="text-right font-medium">2025</th><th className="text-right font-medium">2026</th><th className="text-right font-medium">Dif</th></tr></thead>
        <tbody>
          {nodo.meses.map((m) => (
            <tr key={m.etiqueta} className="border-t border-slate-100">
              <td className="py-0.5 text-slate-600">{m.etiqueta}</td>
              <td className="py-0.5 text-right text-slate-500">{formatNumero(m.anio2025)}</td>
              <td className="py-0.5 text-right font-semibold text-slate-700">{formatNumero(m.anio2026)}</td>
              <td className={`py-0.5 text-right ${m.dif > 0 ? 'text-rose-600' : m.dif < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{m.dif >= 0 ? '+' : ''}{formatNumero(m.dif)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Un nodo completo: su fila de métricas generales, un botón para
// desplegar/ocultar sus trimestres y meses (colapsado por defecto en los
// niveles más profundos, para que la vista siga siendo navegable), y
// después sus hijos (si los tiene) — así se arma exactamente el orden
// pedido: "estación general, abajo los trimestres, abajo los meses,
// después sus zonas de la misma forma".
function NodoCompleto({ nodo, profundidad }: { nodo: NodoMicrogerencia; profundidad: number }) {
  const [expandido, setExpandido] = useState(profundidad <= 1);
  const esNivelSuperior = profundidad === 0;

  return (
    <div style={{ marginLeft: profundidad * 14 }} className="mb-2">
      <div className={`rounded-lg border p-2.5 ${esNivelSuperior ? 'border-brand-green/40 bg-brand-green/5' : profundidad === 1 ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
        <button type="button" onClick={() => setExpandido((v) => !v)} className="mb-1.5 flex items-center gap-1 text-left">
          {expandido ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
          <span className={`font-bold ${esNivelSuperior ? 'text-brand-navy' : 'text-slate-700'}`}>{nodo.nombre}</span>
        </button>
        <MetricasNodo nodo={nodo} destacado={esNivelSuperior} />
        {expandido && (
          <div className="mt-2.5 grid grid-cols-1 gap-4 border-t border-slate-200 pt-2.5 sm:grid-cols-2">
            <TablaTrimestres nodo={nodo} />
            <TablaMeses nodo={nodo} />
          </div>
        )}
      </div>
      {nodo.hijos.map((hijo) => <NodoCompleto key={hijo.nombre} nodo={hijo} profundidad={profundidad + 1} />)}
    </div>
  );
}

type Vista = 'general' | 'distrito1' | 'distrito2' | 'delitos';

function CheckboxVista({ etiqueta, activo, onClick }: { etiqueta: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activo}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${activo ? 'border-brand-green bg-brand-green text-white' : 'border-slate-300 text-slate-500 hover:border-brand-green/50 hover:text-brand-green'}`}
    >
      <span className={`flex h-3 w-3 items-center justify-center rounded-sm border ${activo ? 'border-white bg-white' : 'border-slate-400'}`}>
        {activo && <span className="h-1.5 w-1.5 rounded-[1px] bg-brand-green" />}
      </span>
      {etiqueta}
    </button>
  );
}

export function ModalMicrogerencia({ onCerrar }: { onCerrar: () => void }) {
  const datos = useMicrogerencia();
  const [vista, setVista] = useState<Vista>('general');

  if (!datos) {
    return createPortal(
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
          <p className="text-sm text-slate-600">No hay datos suficientes todavía para calcular la Microgerencia — carga primero la información desde "Actualizar información".</p>
          <button type="button" onClick={onCerrar} className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400">Cerrar</button>
        </div>
      </div>,
      document.body,
    );
  }

  const raizVistaActual = vista === 'general' ? datos.general : vista === 'distrito1' ? datos.distrito1 : vista === 'distrito2' ? datos.distrito2 : null;

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

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <CheckboxVista etiqueta="MEPOY General" activo={vista === 'general'} onClick={() => setVista('general')} />
          <CheckboxVista etiqueta="Distrito Uno" activo={vista === 'distrito1'} onClick={() => setVista('distrito1')} />
          <CheckboxVista etiqueta="Distrito Dos" activo={vista === 'distrito2'} onClick={() => setVista('distrito2')} />
          <CheckboxVista etiqueta="Delitos" activo={vista === 'delitos'} onClick={() => setVista('delitos')} />
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <p className="mb-3 text-xs text-slate-400">
            Calculado en vivo a partir de la misma información cargada en el dashboard — intencionalmente independiente de los filtros de la barra lateral, porque es un reporte de estado general de toda la unidad.
          </p>

          {vista !== 'delitos' && raizVistaActual && <NodoCompleto nodo={raizVistaActual} profundidad={0} />}

          {vista === 'delitos' && (
            <div>
              {datos.delitos.map((d) => <NodoCompleto key={d.nombre} nodo={{ ...d, hijos: [] }} profundidad={0} />)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400">
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => generarPdfMicrogerencia(datos, vista)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green/90"
          >
            <Download size={15} />
            Descargar PDF (vista actual)
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
