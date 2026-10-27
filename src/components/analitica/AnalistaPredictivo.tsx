import { useMemo, useState } from 'react';
import { Sparkles, MapPin, Clock, TrendingUp, ShieldAlert, Info } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { generarPronostico, type DimensionZona, type Horizonte, type AlertaPredictiva } from '../../utils/analisisPredictivo';

const PASOS_PROCESAMIENTO = [
  'Procesando registros',
  'Analizando temporalidad',
  'Analizando concentración espacial',
  'Analizando franjas horarias',
  'Comparando comportamiento histórico',
  'Validando patrones',
  'Generando pronóstico',
];

const HORIZONTES: { valor: Horizonte; etiqueta: string }[] = [
  { valor: 24, etiqueta: '24 h' },
  { valor: 48, etiqueta: '48 h' },
  { valor: 72, etiqueta: '72 h' },
  { valor: 168, etiqueta: '7 días' },
];

function colorNivel(nivel: AlertaPredictiva['nivel']): string {
  return nivel === 'Alto' ? 'bg-rose-100 text-rose-700 border-rose-300' : nivel === 'Moderado' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300';
}

/**
 * "Analista Predictivo Inteligente — CIEPS MEPOY" — a diferencia del chat
 * conversacional (ChatAnalistaIA), este panel NO le pide nada a un modelo
 * de lenguaje: todo el cálculo (concentración, confianza, validación
 * histórica) sale de utils/analisisPredictivo.ts, un motor puramente
 * estadístico sobre los datos reales del dashboard. La "IA" aquí es la
 * metodología de análisis, no un texto generado — así se cumple, de
 * fondo, el pedido explícito de "no inventar predicciones".
 */
export function AnalistaPredictivo() {
  const { filteredRecords, filters } = useData();
  const [dimensionZona, setDimensionZona] = useState<DimensionZona>('cai');
  const [horizonte, setHorizonte] = useState<Horizonte>(24);
  const [procesando, setProcesando] = useState(false);
  const [pasoActual, setPasoActual] = useState(0);
  const [resultado, setResultado] = useState<ReturnType<typeof generarPronostico> | null>(null);

  const delitoSeleccionado = useMemo(() => (filters.delito.length === 1 ? filters.delito[0] : null), [filters.delito]);

  async function generar() {
    setProcesando(true);
    setResultado(null);
    setPasoActual(0);
    // Animación de estados — el cálculo real es casi instantáneo (es
    // aritmética sobre lo que ya está cargado en memoria), pero se
    // muestra paso a paso para que quede claro QUÉ tipo de análisis se
    // está haciendo, sin exponer razonamiento interno de ningún modelo de
    // lenguaje (no lo hay: esto es estadística directa).
    for (let i = 0; i < PASOS_PROCESAMIENTO.length; i++) {
      setPasoActual(i);
      await new Promise((r) => setTimeout(r, 280));
    }
    const salida = generarPronostico(filteredRecords, { delito: delitoSeleccionado, dimensionZona, horizonteHoras: horizonte });
    setResultado(salida);
    setProcesando(false);
  }

  const etiquetaZona = dimensionZona === 'estacion' ? 'Estación' : dimensionZona === 'cai' ? 'CAI' : 'Cuadrante';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 p-2.5">
        <Sparkles size={16} className="shrink-0 text-indigo-600" />
        <p className="text-[11px] text-indigo-900">
          Pronóstico basado en patrones históricos de <b>{delitoSeleccionado ?? 'todos los delitos'}</b> — respeta los filtros activos del dashboard.
        </p>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-slate-500">Horizonte de pronóstico</p>
        <div className="flex gap-1.5">
          {HORIZONTES.map((h) => (
            <button
              key={h.valor}
              onClick={() => setHorizonte(h.valor)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${horizonte === h.valor ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {h.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold text-slate-500">Analizar por</p>
        <div className="flex gap-1.5">
          {(['estacion', 'cai', 'cuadrante'] as DimensionZona[]).map((d) => (
            <button
              key={d}
              onClick={() => setDimensionZona(d)}
              className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${dimensionZona === d ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {d === 'estacion' ? 'Estación' : d === 'cai' ? 'CAI' : 'Cuadrante'}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={generar}
        disabled={procesando || filteredRecords.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        <Sparkles size={15} /> {procesando ? 'Analizando…' : 'Generar pronóstico'}
      </button>

      {procesando && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1.5 font-semibold text-slate-700">🧠 Analista Virtual Inteligente — CIEPS MEPOY</p>
          {PASOS_PROCESAMIENTO.map((paso, i) => (
            <p key={paso} className={i > pasoActual ? 'text-slate-300' : ''}>
              {i < pasoActual ? '✓' : i === pasoActual ? '…' : '○'} {paso}
            </p>
          ))}
        </div>
      )}

      {resultado && !procesando && (
        <div className="space-y-2.5">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-emerald-600">✓ Análisis completado</p>

          {resultado.backtest.muestraSuficiente && (
            <div className="flex items-start gap-1.5 rounded-md bg-slate-50 p-2 text-[10.5px] text-slate-500">
              <Info size={12} className="mt-0.5 shrink-0" />
              <p>
                Modelo validado entrenando con {resultado.backtest.aniosEvaluados.split('→')[0]?.trim()} y comparando contra {resultado.backtest.aniosEvaluados.split('→')[1]?.trim()} real —
                acertó el <b>{Math.round(resultado.backtest.precisionEnK * 100)}%</b> de sus zonas prioritarias.
              </p>
            </div>
          )}

          {resultado.alertas.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              🟡 <b>Sin patrón suficientemente consistente.</b>
              <p className="mt-1 text-amber-700">
                No se identificó evidencia histórica suficiente para generar un pronóstico confiable de {delitoSeleccionado ?? 'estos delitos'} en el horizonte y filtros seleccionados —
                {resultado.totalCasosAnalizados < 20 ? ' hay muy pocos casos históricos para analizar.' : ' los casos existentes están demasiado repartidos entre zonas y horarios como para señalar una concentración real.'}
              </p>
            </div>
          ) : (
            resultado.alertas.map((a, i) => (
              <div key={i} className={`rounded-lg border p-3 text-xs ${colorNivel(a.nivel)}`}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1 font-bold"><ShieldAlert size={13} /> {a.nivel === 'Alto' ? '🔴' : a.nivel === 'Moderado' ? '🟠' : '🟢'} PRONÓSTICO {a.nivel.toUpperCase()}</span>
                  <span className="font-semibold">Confianza: {a.confianza}%</span>
                </div>
                <div className="mb-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1"><MapPin size={11} /> {etiquetaZona}: <b>{a.zona}</b></span>
                  <span className="flex items-center gap-1"><Clock size={11} /> {a.diaSemana}, {a.franjaHoraria}</span>
                  <span className="flex items-center gap-1"><TrendingUp size={11} /> Concentración {a.indiceConcentracion.toFixed(1)}×</span>
                  <span>{a.casosHistoricos} casos históricos</span>
                </div>
                {(a.modalidadPredominante || a.armaPredominante) && (
                  <p className="mb-1 text-[10.5px] opacity-80">
                    Patrón histórico predominante: {a.modalidadPredominante ?? 'N/A'}{a.armaPredominante ? ` · ${a.armaPredominante}` : ''}
                  </p>
                )}
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10.5px] font-medium opacity-70">¿Por qué se generó este pronóstico?</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10.5px] opacity-80">
                    {a.factores.map((f, j) => <li key={j}>{f}</li>)}
                  </ul>
                </details>
              </div>
            ))
          )}
          <p className="text-center text-[10px] italic text-slate-400">Pronóstico basado en patrones históricos — no representa una certeza de ocurrencia.</p>
        </div>
      )}
    </div>
  );
}
