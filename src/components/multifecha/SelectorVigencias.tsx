import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Pencil, Plus, RotateCcw, X, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useData } from '../../context/DataContext';
import type { PeriodoAnalisis } from '../../types/crime';
import {
  anioDePeriodo, guardarVigencia, leerVigencias, periodoDeVigencia, rangoParaAnio,
  restablecerVigencias, textoRango, VIGENCIAS_INICIALES, type RangoVigencia,
} from '../../utils/vigenciasMultifecha';

// Selector de vigencias del multifecha: cada año con SU rango de fechas.
//  · Marcar/desmarcar un año lo agrega o lo retira de la comparación.
//  · El lápiz abre las fechas (y horario) de esa vigencia; el cambio se
//    aplica al instante y queda recordado para la próxima vez.
//  · «Agregar vigencia» crea un año nuevo con el mismo día/mes del último.
// Lo usan el panel de filtros y la página Multifecha (mismo estado).

export const MAX_VIGENCIAS = 12;
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

/** Vigencias con las que arranca el multifecha: las 3 más recientes con datos. */
export function periodosIniciales(aniosConDatos: number[]): PeriodoAnalisis[] {
  const presets = leerVigencias();
  const anios = Object.keys(presets).map(Number).sort((a, b) => b - a);
  const conDatos = anios.filter((a) => aniosConDatos.length === 0 || aniosConDatos.includes(a));
  return (conDatos.length > 0 ? conDatos : anios).slice(0, 3).sort((a, b) => a - b).map((a) => periodoDeVigencia(a, presets[a]));
}

export function SelectorVigencias({ compacto = false }: { compacto?: boolean }) {
  const { periodos, setPeriodos, meta } = useData();
  const { presets, avisar } = usePresets();
  const [editando, setEditando] = useState<string | null>(null);
  const [anioNuevo, setAnioNuevo] = useState('');
  const minFecha = meta?.fechaMin ? meta.fechaMin.toISOString().slice(0, 10) : undefined;
  const maxFecha = meta?.fechaMax ? meta.fechaMax.toISOString().slice(0, 10) : undefined;
  const aniosConDatos = meta?.aniosDisponibles ?? [];

  const activosPorAnio = useMemo(() => {
    const m = new Map<number, PeriodoAnalisis[]>();
    for (const p of periodos) { const a = anioDePeriodo(p); if (a != null) m.set(a, [...(m.get(a) ?? []), p]); }
    return m;
  }, [periodos]);
  const sinFecha = periodos.filter((p) => anioDePeriodo(p) == null);
  const anios = useMemo(() => Array.from(new Set([...Object.keys(presets).map(Number), ...activosPorAnio.keys()])).sort((a, b) => a - b), [presets, activosPorAnio]);

  function alternar(anio: number) {
    if (activosPorAnio.has(anio)) {
      setPeriodos((prev) => prev.filter((p) => anioDePeriodo(p) !== anio));
      return;
    }
    if (periodos.length >= MAX_VIGENCIAS) return;
    setPeriodos((prev) => [...prev, periodoDeVigencia(anio, presets[anio])]);
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

  function agregarAnio(valor: string = anioNuevo) {
    const anio = Number(valor);
    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return;
    if (activosPorAnio.has(anio)) { setAnioNuevo(''); return; }
    const referencia = presets[anio] ?? rangoParaAnio(anio, presets[Math.max(...Object.keys(presets).map(Number))]);
    guardarVigencia(anio, referencia);
    avisar();
    if (periodos.length < MAX_VIGENCIAS) setPeriodos((prev) => [...prev, periodoDeVigencia(anio, referencia)]);
    setAnioNuevo('');
  }

  function restablecer() {
    restablecerVigencias();
    avisar();
    setPeriodos((prev) => prev.map((p) => {
      const anio = anioDePeriodo(p);
      const r = anio != null ? VIGENCIAS_INICIALES[anio] : undefined;
      return r ? { ...p, ...r } : p;
    }));
  }

  const periodoEditando = periodos.find((p) => p.id === editando) ?? null;
  const sugerenciaAnio = String(Math.max(new Date().getFullYear(), ...anios.map((a) => a + 1).filter((a) => !anios.includes(a))));

  return (
    <div className={clsx('space-y-2.5', compacto && 'text-[12px]')}>
      <div className="flex flex-wrap items-stretch gap-1.5">
        {anios.map((anio) => {
          const activos = activosPorAnio.get(anio) ?? [];
          const activo = activos.length > 0;
          const rango = activo ? activos[0] : presets[anio];
          const sinDatos = aniosConDatos.length > 0 && !aniosConDatos.includes(anio);
          return (
            <div key={anio} className={clsx('flex items-center gap-1 rounded-lg border pl-1.5 pr-1 py-1 transition', activo ? 'border-[#116762] bg-[#e3f2ef]' : 'border-slate-200 bg-white', sinDatos && !activo && 'opacity-60')}>
              <button type="button" onClick={() => alternar(anio)} aria-pressed={activo} title={activo ? `Retirar ${anio} de la comparación` : `Agregar ${anio} a la comparación`} className="flex items-center gap-1.5 text-left">
                <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', activo ? 'border-[#116762] bg-[#116762] text-white' : 'border-slate-300 bg-white')}>{activo && <Check size={11} strokeWidth={3.5} />}</span>
                <span className="leading-tight">
                  <span className="block text-[12.5px] font-extrabold text-[#10233f]">{anio}</span>
                  <span className="block text-[10.5px] text-slate-500">{rango ? textoRango(rango.fechaInicial, rango.fechaFinal) : 'sin fechas'}{sinDatos ? ' · sin datos' : ''}</span>
                </span>
              </button>
              {activo && (
                <button type="button" onClick={() => setEditando(editando === activos[0].id ? null : activos[0].id)} title={`Cambiar las fechas de ${anio}`} className={clsx('ml-0.5 rounded p-1 hover:bg-white', editando === activos[0].id ? 'bg-white text-[#116762]' : 'text-slate-400')}>
                  <Pencil size={12} />
                </button>
              )}
            </div>
          );
        })}
        {sinFecha.map((p) => (
          <div key={p.id} className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-1.5 py-1 text-[11px] text-amber-800">
            <button type="button" onClick={() => setEditando(p.id)} className="flex items-center gap-1"><CalendarDays size={12} /> Vigencia sin fechas</button>
            <button type="button" onClick={() => setPeriodos((prev) => prev.filter((x) => x.id !== p.id))} title="Quitar" className="rounded p-0.5 hover:bg-white"><X size={12} /></button>
          </div>
        ))}
      </div>

      {periodoEditando && (
        <div className="rounded-lg border border-[#116762]/30 bg-white p-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#116762]">Fechas de la vigencia {anioDePeriodo(periodoEditando) ?? ''}</span>
            <button type="button" onClick={() => setEditando(null)} className="rounded p-0.5 text-slate-400 hover:text-slate-600" title="Cerrar"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['Fecha inicial', 'fechaInicial', 'date'], ['Fecha final', 'fechaFinal', 'date'], ['Hora inicial', 'horaInicial', 'time'], ['Hora final', 'horaFinal', 'time']] as const).map(([texto, campo, tipo]) => (
              <label key={campo} className="text-[11px] font-medium text-slate-500">
                {texto}
                <input type={tipo} min={tipo === 'date' ? minFecha : undefined} max={tipo === 'date' ? maxFecha : undefined} value={periodoEditando[campo]} onChange={(e) => actualizar(periodoEditando.id, { [campo]: e.target.value })} className="mt-0.5 block w-full rounded-md border border-slate-300 px-2 py-1 text-[13px] text-slate-800" />
              </label>
            ))}
          </div>
          {periodoEditando.fechaInicial && periodoEditando.fechaFinal && periodoEditando.fechaInicial > periodoEditando.fechaFinal && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle size={12} /> La fecha final es anterior a la inicial: esta vigencia no se aplica hasta corregirla.</p>
          )}
          <p className="mt-1.5 text-[10.5px] text-slate-400">El cambio se aplica de inmediato y queda guardado como rango de esa vigencia.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex items-center overflow-hidden rounded-lg border border-[#116762]">
          <input
            type="number"
            inputMode="numeric"
            placeholder={sugerenciaAnio}
            value={anioNuevo}
            onChange={(e) => setAnioNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') agregarAnio(); }}
            className="w-[68px] px-2 py-1.5 text-[12px] outline-none"
            aria-label="Año de la vigencia a agregar"
          />
          <button type="button" onClick={() => agregarAnio(anioNuevo || sugerenciaAnio)} disabled={periodos.length >= MAX_VIGENCIAS} className="flex items-center gap-1 bg-[#116762] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0f5f57] disabled:opacity-50">
            <Plus size={13} /> Agregar vigencia
          </button>
        </div>
        <button type="button" onClick={restablecer} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50" title="Volver a las fechas iniciales de cada vigencia">
          <RotateCcw size={12} /> Fechas iniciales
        </button>
        <button type="button" onClick={() => { setPeriodos([]); setEditando(null); }} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50" title="Quitar todas las vigencias (sale del multifecha)">
          <X size={12} /> Limpiar selección
        </button>
        <span className="text-[11px] text-slate-400">{periodos.length}/{MAX_VIGENCIAS} vigencias</span>
      </div>
    </div>
  );
}

