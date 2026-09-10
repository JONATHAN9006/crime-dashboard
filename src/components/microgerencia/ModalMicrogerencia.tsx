import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, TrendingUp, TrendingDown, Minus, ChevronRight, ChevronDown, CheckSquare, Square } from 'lucide-react';
import type { NodoMicrogerencia } from '../../data/microgerencia';
import { useMicrogerencia } from '../../hooks/useMicrogerencia';
import { generarPdfMicrogerencia } from '../../data/pdfMicrogerencia';
import { formatNumero, formatDecimal } from '../../utils/aggregations';

function formatearPct(n: number | null): string {
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${formatDecimal(n, 1)}%`;
}

// Indicador junto a "Aporte %": cuánto y en qué porcentaje cambiaría el
// cierre proyectado de este nodo frente al total real del año anterior —
// en rojo si va en AUMENTO (dif positivo), en verde si va en REDUCCIÓN
// (dif negativo). Se calcula a partir de "difConAnioAnterior", ya obtenido
// en useMicrogerencia.ts — no es un valor nuevo, solo se muestra aquí
// también, justo al lado del aporte.
function IndicadorTendenciaProyectada({ nodo }: { nodo: NodoMicrogerencia }) {
  const dif = Math.round(nodo.difConAnioAnterior);
  const pct = nodo.total2025 > 0 ? (dif / nodo.total2025) * 100 : null;
  const enAumento = dif > 0;
  const color = dif === 0 ? 'text-slate-400' : enAumento ? 'text-rose-600' : 'text-emerald-600';
  return (
    <span className={`ml-1 inline-flex items-center gap-0.5 text-xs font-semibold ${color}`}>
      ({dif >= 0 ? '+' : ''}{formatNumero(dif)} casos{pct !== null && `, ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`})
    </span>
  );
}

function MetricasNodo({ nodo, destacado }: { nodo: NodoMicrogerencia; destacado: boolean }) {
  const Icono = nodo.dif > 0 ? TrendingUp : nodo.dif < 0 ? TrendingDown : Minus;
  const color = nodo.dif > 0 ? 'text-rose-600' : nodo.dif < 0 ? 'text-emerald-600' : 'text-slate-400';
  return (
    <div className={`grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 ${destacado ? '' : 'text-slate-500'}`}>
      <div><span className="block text-slate-400">Total 2025</span>{formatNumero(nodo.total2025)}</div>
      <div><span className="block text-slate-400">2025 (a la fecha)</span>{formatNumero(nodo.fecha2025)}</div>
      <div><span className="block text-slate-400">2026 (a la fecha)</span><strong>{formatNumero(nodo.fecha2026)}</strong></div>
      <div className={color}><span className="block text-slate-400">DIF</span><span className="inline-flex items-center gap-0.5"><Icono size={10} />{nodo.dif >= 0 ? '+' : ''}{formatNumero(nodo.dif)}</span></div>
      <div className={color}><span className="block text-slate-400">%</span>{formatearPct(nodo.pct)}</div>
      <div className="sm:col-span-2">
        <span className="block text-slate-400">Aporte % <span className="text-slate-300">(proyección vs. 2025)</span></span>
        <span className="inline-flex flex-wrap items-baseline gap-1">
          {formatDecimal(nodo.aportePct, 1)}%
          <span className="text-xs font-normal text-slate-400">({formatNumero(nodo.fecha2026)} casos)</span>
          <IndicadorTendenciaProyectada nodo={nodo} />
        </span>
      </div>
    </div>
  );
}

function TablaTrimestres({ nodo }: { nodo: NodoMicrogerencia }) {
  return (
    <div className="rounded-lg bg-sky-50 p-2">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-sky-600">Trimestres</p>
      <table className="w-full text-sm">
        <thead><tr className="text-slate-400"><th className="text-left font-medium">Trimestre</th><th className="text-right font-medium">2025</th><th className="text-right font-medium">2026</th><th className="text-right font-medium">Dif</th></tr></thead>
        <tbody>
          {nodo.trimestres.map((t) => (
            <tr key={t.etiqueta} className="border-t border-sky-100">
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

// Distribución por mes — en UNA sola lista de los 12 meses (no partida en
// columnas), tal como se pidió.
function TablaMeses({ nodo }: { nodo: NodoMicrogerencia }) {
  return (
    <div className="rounded-lg bg-amber-50 p-2">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-600">Distribución por mes</p>
      <table className="w-full text-sm">
        <thead><tr className="text-slate-400"><th className="text-left font-medium">Mes</th><th className="text-right font-medium">2025</th><th className="text-right font-medium">2026</th><th className="text-right font-medium">Dif</th></tr></thead>
        <tbody>
          {nodo.meses.map((m) => (
            <tr key={m.etiqueta} className="border-t border-amber-100">
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

function NodoCompleto({ nodo, profundidad, ruta, seleccionados, onAlternarSeleccion, sufijoDelito }: {
  nodo: NodoMicrogerencia;
  profundidad: number;
  ruta: string;
  seleccionados: Map<string, NodoMicrogerencia>;
  onAlternarSeleccion: (ruta: string, nodo: NodoMicrogerencia) => void;
  sufijoDelito: string | null;
}) {
  const [expandido, setExpandido] = useState(profundidad <= 1);
  const esNivelSuperior = profundidad === 0;
  const estaSeleccionado = seleccionados.has(ruta);

  return (
    <div style={{ marginLeft: profundidad * 14 }} className="mb-2">
      <div className={`rounded-lg border p-2.5 ${estaSeleccionado ? 'border-brand-green ring-1 ring-brand-green' : esNivelSuperior ? 'border-emerald-200 bg-emerald-50' : profundidad === 1 ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
        <div className="mb-1.5 flex items-center gap-2">
          <button type="button" onClick={() => onAlternarSeleccion(ruta, nodo)} className="shrink-0 text-brand-green" title="Incluir en el PDF">
            {estaSeleccionado ? <CheckSquare size={16} /> : <Square size={16} className="text-slate-300" />}
          </button>
          <button type="button" onClick={() => setExpandido((v) => !v)} className="flex flex-1 items-center gap-1 text-left">
            {expandido ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
            <span className={`font-bold ${esNivelSuperior ? 'text-brand-navy' : 'text-slate-700'}`}>
              {nodo.nombre}{sufijoDelito && <span className="font-semibold text-brand-green"> — {sufijoDelito}</span>}
            </span>
          </button>
        </div>
        <MetricasNodo nodo={nodo} destacado={esNivelSuperior} />
        {expandido && (
          <div className="mt-2.5 grid grid-cols-1 gap-3 border-t border-slate-200 pt-2.5 sm:grid-cols-2">
            <TablaTrimestres nodo={nodo} />
            <TablaMeses nodo={nodo} />
          </div>
        )}
      </div>
      {nodo.hijos.map((hijo) => (
        <NodoCompleto key={hijo.nombre} nodo={hijo} profundidad={profundidad + 1} ruta={`${ruta}>${hijo.nombre}`} seleccionados={seleccionados} onAlternarSeleccion={onAlternarSeleccion} sufijoDelito={sufijoDelito} />
      ))}
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

function aplanarArbol(nodo: NodoMicrogerencia, ruta: string): [string, NodoMicrogerencia][] {
  const propio: [string, NodoMicrogerencia][] = [[ruta, nodo]];
  return nodo.hijos.reduce((acc, hijo) => [...acc, ...aplanarArbol(hijo, `${ruta}>${hijo.nombre}`)], propio);
}

const TITULOS_VISTA: Record<Vista, string> = {
  general: 'MEPOY General — Consolidado',
  distrito1: 'Distrito Uno',
  distrito2: 'Distrito Dos',
  delitos: 'Comparativo por Delito',
};

export function ModalMicrogerencia({ onCerrar }: { onCerrar: () => void }) {
  const datos = useMicrogerencia();
  const [vista, setVista] = useState<Vista>('general');
  const [seleccionados, setSeleccionados] = useState<Map<string, NodoMicrogerencia>>(new Map());
  const [generandoPdf, setGenerandoPdf] = useState(false);

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

  function alternarSeleccion(ruta: string, nodo: NodoMicrogerencia) {
    setSeleccionados((prev) => {
      const nuevo = new Map(prev);
      if (nuevo.has(ruta)) nuevo.delete(ruta); else nuevo.set(ruta, nodo);
      return nuevo;
    });
  }

  const raizVistaActual = vista === 'general' ? datos.general : vista === 'distrito1' ? datos.distrito1 : vista === 'distrito2' ? datos.distrito2 : null;

  async function descargarPdf() {
    if (!datos) return;
    setGenerandoPdf(true);
    try {
      if (seleccionados.size > 0) {
        await generarPdfMicrogerencia(Array.from(seleccionados.values()), `Selección personalizada (${seleccionados.size} elemento${seleccionados.size === 1 ? '' : 's'})`);
      } else if (vista === 'delitos') {
        await generarPdfMicrogerencia(datos.delitos, TITULOS_VISTA.delitos);
      } else if (raizVistaActual) {
        await generarPdfMicrogerencia([raizVistaActual], TITULOS_VISTA[vista]);
      }
    } finally {
      setGenerandoPdf(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-brand-green px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/95 p-1">
              <img src="/assets/escudo-policia.png" alt="Escudo Policía Nacional" className="h-full w-full object-contain" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Microgerencia y Proyección Delictiva MEPOY</h2>
              <p className="text-xs text-emerald-50">{datos.periodo} · Días hasta la fecha: {datos.diasHastaLaFecha}</p>
            </div>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1.5 text-emerald-50 hover:bg-white/10 hover:text-white">
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
            Calculado en vivo a partir de la misma información cargada en el dashboard, respetando el filtro de Delito activo — independiente del resto de los filtros de la barra lateral. Marca el <CheckSquare size={11} className="inline text-brand-green" /> de cualquier fila para elegir exactamente qué incluir en el PDF (puedes combinar filas de distintas pestañas).
          </p>

          <button
            type="button"
            onClick={() => {
              const raiz = vista === 'delitos' ? null : raizVistaActual;
              if (vista === 'delitos') {
                setSeleccionados(new Map(datos.delitos.map((d) => [`Delitos>${d.nombre}`, d])));
              } else if (raiz) {
                setSeleccionados(new Map(aplanarArbol(raiz, raiz.nombre)));
              }
            }}
            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-green hover:text-brand-green"
          >
            <CheckSquare size={13} />
            Seleccionar todo en esta pestaña
          </button>

          {vista !== 'delitos' && raizVistaActual && (
            <NodoCompleto nodo={raizVistaActual} profundidad={0} ruta={raizVistaActual.nombre} seleccionados={seleccionados} onAlternarSeleccion={alternarSeleccion} sufijoDelito={datos.delitoFiltrado} />
          )}

          {/* En la vista "MEPOY General" se agrega también el desglose por
              delito (igual que en la Hoja3 original del Excel, que traía
              tanto la tabla de Estaciones como la de Delitos juntas). */}
          {vista === 'general' && datos.delitos.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Desglose por delito</p>
              {datos.delitos.map((d) => (
                <NodoCompleto key={d.nombre} nodo={{ ...d, hijos: [] }} profundidad={1} ruta={`General>Delitos>${d.nombre}`} seleccionados={seleccionados} onAlternarSeleccion={alternarSeleccion} sufijoDelito={null} />
              ))}
            </div>
          )}

          {vista === 'delitos' && (
            <div>
              {datos.delitos.map((d) => (
                <NodoCompleto key={d.nombre} nodo={{ ...d, hijos: [] }} profundidad={0} ruta={`Delitos>${d.nombre}`} seleccionados={seleccionados} onAlternarSeleccion={alternarSeleccion} sufijoDelito={null} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <p className="text-xs text-slate-400">
            {seleccionados.size > 0 ? `${seleccionados.size} elemento(s) seleccionado(s) para el PDF` : `Sin selección — el PDF incluirá "${TITULOS_VISTA[vista]}" completo`}
          </p>
          <div className="flex items-center gap-2">
            {seleccionados.size > 0 && (
              <button type="button" onClick={() => setSeleccionados(new Map())} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 hover:border-slate-400">
                Limpiar selección
              </button>
            )}
            <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400">
              Cerrar
            </button>
            <button
              type="button"
              onClick={descargarPdf}
              disabled={generandoPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green/90 disabled:opacity-60"
            >
              <Download size={15} />
              {generandoPdf ? 'Generando...' : 'Descargar PDF'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
