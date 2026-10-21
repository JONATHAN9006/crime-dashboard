import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Check, Database, Pencil, RotateCcw, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { useData } from '../../context/DataContext';
import type { CrimeRecord, PeriodoAnalisis } from '../../types/crime';
import { aplicarFiltros } from '../../utils/filters';
import {
  anioDePeriodo, guardarVigencia, leerVigencias, periodoDeVigencia, rangoVigencia,
  restablecerVigencias, textoRango, VIGENCIAS_INICIALES, type RangoVigencia,
} from '../../utils/vigenciasMultifecha';

// ───────────────────────────────────────────────────────────────────────────
// Selector de VIGENCIAS del análisis multifecha.
//  · Los años salen SOLOS de la base cargada: si se sube información de un
//    año nuevo (o de años anteriores), aparece de inmediato — sin tocar
//    código ni agregarlo a mano.
//  · Cada año tiene su rango de fechas (el configurado, o el mismo día/mes
//    de la vigencia más cercana si es un año nuevo); el lápiz lo cambia y
//    queda recordado en este navegador.
//  · Marcar años = activar el multifecha; desmarcarlos todos = desactivarlo.
//  · Cada tarjeta muestra cuántos casos caen en su rango con los filtros
//    actuales, para elegir con información.
// ───────────────────────────────────────────────────────────────────────────

export const MAX_VIGENCIAS = 30;
const EVENTO = 'mepoy-vigencias-cambio';

function usePresets() {
  const [presets, setPresets] = useState<Record<number, RangoVigencia>>(() => leerVigencias());
  useEffect(() => {
    const refrescar = () => setPresets(leerVigencias());
    window.addEventListener(EVENTO, refrescar);
    return () => window.removeEventListener(EVENTO, refrescar);
  }, []);
  const avisar = () => window.dispatchEvent(new Event(EVENTO));
  return { presets, avisar };
}

/** Años presentes en los registros cargados (se recalcula con cada carga). */
export function useAniosDetectados(): number[] {
  const { records } = useData();
  return useMemo(() => {
    const set = new Set<number>();
    for (const r of records) {
      const a = r.anio ?? (r.fecha ? new Date(r.fecha).getFullYear() : null);
      if (a != null && Number.isFinite(a)) set.add(a);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [records]);
}

/** Vigencias con las que arranca el multifecha: los 3 años más recientes con datos. */
export function periodosIniciales(aniosConDatos: number[]): PeriodoAnalisis[] {
  const presets = leerVigencias();
  const anios = aniosConDatos.length > 0 ? [...aniosConDatos] : Object.keys(presets).map(Number);
  return anios.sort((a, b) => b - a).slice(0, 3).sort((a, b) => a - b).map((a) => periodoDeVigencia(a, rangoVigencia(a, presets)));
}

const ATAJOS: { id: string; texto: string; n: number | 'todos' }[] = [
  { id: '2', texto: 'Últimos 2', n: 2 },
  { id: '3', texto: 'Últimos 3', n: 3 },
  { id: '5', texto: 'Últimos 5', n: 5 },
  { id: 'todos', texto: 'Todos', n: 'todos' },
];

export function SelectorVigencias({ compacto = false }: { compacto?: boolean }) {
  const { periodos, setPeriodos, meta, records, filters, setFilters } = useData();
  // Con vigencias activas, el tiempo lo definen sus rangos: Año y Mes se limpian.
  const hayVigencias = periodos.length > 0;
  useEffect(() => {
    if (hayVigencias) setFilters((prev) => (prev.anio.length || prev.mes.length ? { ...prev, anio: [], mes: [] } : prev));
  }, [hayVigencias, setFilters]);
  const { presets, avisar } = usePresets();
  const anios = useAniosDetectados();
  const [editando, setEditando] = useState<string | null>(null);
  const minFecha = meta?.fechaMin ? meta.fechaMin.toISOString().slice(0, 10) : undefined;
  const maxFecha = meta?.fechaMax ? meta.fechaMax.toISOString().slice(0, 10) : undefined;

  const activosPorAnio = useMemo(() => {
    const m = new Map<number, PeriodoAnalisis>();
    for (const p of periodos) { const a = anioDePeriodo(p); if (a != null && !m.has(a)) m.set(a, p); }
    return m;
  }, [periodos]);
  const sinFecha = periodos.filter((p) => anioDePeriodo(p) == null);
  // Años a mostrar: los detectados en los datos (+ alguno activo que ya no esté en la base).
  const aniosVista = useMemo(() => Array.from(new Set([...anios, ...activosPorAnio.keys()])).sort((a, b) => a - b), [anios, activosPorAnio]);
  const rangoDe = (anio: number): RangoVigencia => {
    const p = activosPorAnio.get(anio);
    return p ? { fechaInicial: p.fechaInicial, fechaFinal: p.fechaFinal } : rangoVigencia(anio, presets);
  };

  // Casos de cada año dentro de SU rango, con los filtros generales actuales (sin fecha/año/mes).
  const casosPorAnio = useMemo(() => {
    const base = aplicarFiltros(records, { ...filters, fechaInicial: null, fechaFinal: null, anio: [], mes: [] });
    const rangos = new Map<number, [number, number]>();
    for (const a of aniosVista) {
      const r = rangoDe(a);
      const [y0, m0, d0] = r.fechaInicial.split('-').map(Number);
      const [y1, m1, d1] = r.fechaFinal.split('-').map(Number);
      if (!y0 || !y1) continue;
      rangos.set(a, [new Date(y0, m0 - 1, d0).getTime(), new Date(y1, m1 - 1, d1, 23, 59, 59, 999).getTime()]);
    }
    const conteo = new Map<number, number>();
    for (const r of base as CrimeRecord[]) {
      if (!r.fecha) continue;
      const t = new Date(r.fecha).getTime();
      const y = new Date(r.fecha).getFullYear();
      for (const a of [y, y - 1]) {
        const rg = rangos.get(a);
        if (rg && t >= rg[0] && t <= rg[1]) { conteo.set(a, (conteo.get(a) ?? 0) + 1); break; }
      }
    }
    return conteo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, filters, aniosVista, presets, periodos]);
  const maxCasos = Math.max(1, ...aniosVista.map((a) => casosPorAnio.get(a) ?? 0));

  function alternar(anio: number) {
    if (activosPorAnio.has(anio)) {
      setPeriodos((prev) => prev.filter((p) => anioDePeriodo(p) !== anio));
      return;
    }
    if (periodos.length >= MAX_VIGENCIAS) return;
    setPeriodos((prev) => [...prev, periodoDeVigencia(anio, rangoVigencia(anio, presets))].sort((a, b) => a.fechaInicial.localeCompare(b.fechaInicial)));
  }

  function aplicarAtajo(n: number | 'todos') {
    const elegidos = n === 'todos' ? aniosVista : aniosVista.slice(-n);
    setPeriodos(elegidos.slice(-MAX_VIGENCIAS).map((a) => activosPorAnio.get(a) ?? periodoDeVigencia(a, rangoVigencia(a, presets))));
    setEditando(null);
  }

  function actualizar(id: string, cambios: Partial<PeriodoAnalisis>) {
    setPeriodos((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const nuevo = { ...p, ...cambios };
      const anio = anioDePeriodo(nuevo);
      if (anio != null && nuevo.fechaInicial && nuevo.fechaFinal && nuevo.fechaInicial <= nuevo.fechaFinal) {
        guardarVigencia(anio, { fechaInicial: nuevo.fechaInicial, fechaFinal: nuevo.fechaFinal });
        avisar();
      }
      return nuevo;
    }));
  }

  function restablecer() {
    restablecerVigencias();
    avisar();
    const iniciales = leerVigencias();
    setPeriodos((prev) => prev.map((p) => {
      const anio = anioDePeriodo(p);
      return anio != null ? { ...p, ...(VIGENCIAS_INICIALES[anio] ?? rangoVigencia(anio, iniciales)) } : p;
    }));
  }

  const seleccion = aniosVista.filter((a) => activosPorAnio.has(a));
  const atajoActivo = ATAJOS.find((a) => {
    const esperado = a.n === 'todos' ? aniosVista : aniosVista.slice(-a.n);
    return esperado.length === seleccion.length && esperado.every((x) => activosPorAnio.has(x));
  })?.id ?? null;
  const periodoEditando = periodos.find((p) => p.id === editando) ?? null;
  const primera = seleccion[0];
  const ultima = seleccion[seleccion.length - 1];

  return (
    <div className={clsx('space-y-3', compacto && 'text-[12px]')}>
      {/* Estado + atajos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold', seleccion.length ? 'bg-[#0e7490] text-white' : 'bg-slate-100 text-slate-500')}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', seleccion.length ? 'animate-pulse bg-[#a5f3fc]' : 'bg-slate-400')} />
          {seleccion.length === 0 ? 'Inactivo — elija las vigencias a comparar' : seleccion.length === 1 ? `1 vigencia: ${primera}` : <>Comparando {seleccion.length} vigencias <span className="inline-flex items-center gap-1 font-extrabold">{primera} <ArrowRight size={12} /> {ultima}</span></>}
        </span>
        <div className="flex overflow-hidden rounded-full border border-slate-200 bg-white p-0.5" role="group" aria-label="Selección rápida de vigencias">
          {ATAJOS.map((a) => (
            <button key={a.id} type="button" onClick={() => aplicarAtajo(a.n)} aria-pressed={atajoActivo === a.id} className={clsx('rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors', atajoActivo === a.id ? 'bg-[#0e7490] text-white' : 'text-slate-600 hover:bg-[#e7f5f9]')}>{a.texto}</button>
          ))}
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-slate-500" title="Los años se detectan solos en la base cargada; al subir información nueva aparecen de inmediato.">
          <Sparkles size={12} className="text-[#0e7490]" />
          {aniosVista.length} año{aniosVista.length === 1 ? '' : 's'} detectado{aniosVista.length === 1 ? '' : 's'} automáticamente{aniosVista.length ? ` (${aniosVista[0]}–${aniosVista[aniosVista.length - 1]})` : ''}
        </span>
      </div>

      {/* Tarjetas de años */}
      {aniosVista.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">Aún no hay registros con fecha cargados.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
          {aniosVista.map((anio) => {
            const activo = activosPorAnio.has(anio);
            const rango = rangoDe(anio);
            const casos = casosPorAnio.get(anio) ?? 0;
            const configurado = anio in presets;
            const p = activosPorAnio.get(anio);
            const esEditando = p && editando === p.id;
            return (
              <div
                key={anio}
                className={clsx(
                  'group relative overflow-hidden rounded-xl border transition-all duration-150',
                  activo ? 'border-[#0e7490] bg-[#e7f5f9] shadow-[0_1px_0_rgba(14,116,144,0.25)]' : 'border-slate-200 bg-white hover:-translate-y-[1px] hover:border-[#0e7490]/50 hover:shadow-sm',
                  esEditando && 'ring-2 ring-[#0e7490]/40',
                )}
              >
                <button type="button" onClick={() => alternar(anio)} aria-pressed={activo} title={activo ? `Retirar ${anio} de la comparación` : `Comparar ${anio}`} className="block w-full px-2.5 pb-2 pt-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0e7490]/60">
                  <span className="flex items-center gap-1.5">
                    <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors', activo ? 'border-[#0e7490] bg-[#0e7490] text-white' : 'border-slate-300 bg-white')}>{activo && <Check size={10} strokeWidth={3.5} />}</span>
                    <span className="text-[15px] font-extrabold leading-none text-[#10233f]">{anio}</span>
                    {anio === aniosVista[aniosVista.length - 1] && <span className="rounded bg-[#10233f] px-1 text-[8.5px] font-bold uppercase leading-[14px] text-white">Reciente</span>}
                  </span>
                  <span className={clsx('mt-1 block text-[11px]', configurado ? 'text-slate-600' : 'italic text-slate-400')} title={configurado ? 'Rango configurado' : 'Rango propuesto (mismo día y mes de la vigencia más cercana) — use el lápiz para ajustarlo'}>
                    {textoRango(rango.fechaInicial, rango.fechaFinal)}{configurado ? '' : ' · propuesto'}
                  </span>
                  <span className="mt-1.5 flex items-center gap-1.5">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className={clsx('block h-full rounded-full transition-all', activo ? 'bg-[#0e7490]' : 'bg-slate-300')} style={{ width: `${casos > 0 ? Math.max(6, (casos / maxCasos) * 100) : 0}%` }} />
                    </span>
                    <span className="text-[10.5px] font-bold tabular-nums text-slate-600">{casos.toLocaleString('es-CO')}</span>
                  </span>
                </button>
                {activo && p && (
                  <button type="button" onClick={() => setEditando(esEditando ? null : p.id)} title={`Cambiar las fechas de ${anio}`} aria-label={`Cambiar las fechas de ${anio}`} className={clsx('absolute right-1.5 top-1.5 rounded-md p-1 transition-colors', esEditando ? 'bg-[#0e7490] text-white' : 'text-[#0e7490]/70 hover:bg-white hover:text-[#0e7490]')}>
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sinFecha.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sinFecha.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              <button type="button" onClick={() => setEditando(p.id)}>Vigencia sin fechas</button>
              <button type="button" onClick={() => setPeriodos((prev) => prev.filter((x) => x.id !== p.id))} title="Quitar" className="rounded p-0.5 hover:bg-white"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Edición del rango de una vigencia */}
      {periodoEditando && (
        <div className="rounded-xl border border-[#0e7490]/30 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0e7490]"><CalendarClock size={14} /> Rango de la vigencia {anioDePeriodo(periodoEditando) ?? ''}</span>
            <button type="button" onClick={() => setEditando(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" title="Cerrar" aria-label="Cerrar"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['Fecha inicial', 'fechaInicial', 'date'], ['Fecha final', 'fechaFinal', 'date'], ['Hora inicial', 'horaInicial', 'time'], ['Hora final', 'horaFinal', 'time']] as const).map(([texto, campo, tipo]) => (
              <label key={campo} className="text-[11px] font-semibold text-slate-500">
                {texto}
                <input type={tipo} min={tipo === 'date' ? minFecha : undefined} max={tipo === 'date' ? maxFecha : undefined} value={periodoEditando[campo]} onChange={(e) => actualizar(periodoEditando.id, { [campo]: e.target.value })} className="mt-0.5 block h-9 w-full rounded-lg border border-slate-300 px-2 text-[13px] text-slate-800 focus:border-[#0e7490] focus:outline-none focus:ring-2 focus:ring-[#0e7490]/25" />
              </label>
            ))}
          </div>
          {periodoEditando.fechaInicial && periodoEditando.fechaFinal && periodoEditando.fechaInicial > periodoEditando.fechaFinal && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle size={12} /> La fecha final es anterior a la inicial: esta vigencia no se aplica hasta corregirla.</p>
          )}
          <p className="mt-1.5 text-[10.5px] text-slate-400">Se aplica de inmediato y queda guardado como rango de esa vigencia.</p>
        </div>
      )}

      {/* Pie */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <button type="button" onClick={restablecer} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50" title="Volver a las fechas iniciales de cada vigencia">
          <RotateCcw size={12} /> Fechas iniciales
        </button>
        {seleccion.length > 0 && (
          <button type="button" onClick={() => { setPeriodos([]); setEditando(null); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50" title="Quitar todas las vigencias (sale del multifecha)">
            <X size={12} /> Desactivar multifecha
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-slate-400">
          <Database size={11} /> Casos de cada año dentro de su rango, con los filtros actuales · las variaciones comparan la primera contra la última vigencia
        </span>
      </div>
    </div>
  );
}
