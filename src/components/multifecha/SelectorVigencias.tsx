import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, Check, ChevronDown, ChevronRight, Database, FileText, Info, Layers,
  Pencil, PlusCircle, RotateCcw, Trash2, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useData } from '../../context/DataContext';
import type { CrimeRecord, PeriodoAnalisis } from '../../types/crime';
import { aplicarFiltros, fechaHoraDeRegistro, limiteDePeriodo } from '../../utils/filters';
import {
  anioDePeriodo, guardarVigencia, leerVigencias, nuevoIdPeriodo, periodoDeVigencia, rangoVigencia,
  restablecerVigencias, textoRango, VIGENCIAS_INICIALES, type RangoVigencia,
} from '../../utils/vigenciasMultifecha';

// ───────────────────────────────────────────────────────────────────────────
// MULTIFECHA — selector de vigencias con VARIOS periodos por año.
//  · Los años salen solos de la base cargada (si llega información de otro
//    año, aparece de inmediato).
//  · Cada año seleccionado tiene su panel: «Periodo 1 (Predeterminado)» y
//    los periodos que se agreguen («+ Agregar otro periodo»), cada uno con
//    editar y eliminar. El rango predeterminado queda guardado en este
//    navegador; los demás son de la sesión.
//  · Los casos de un año son la UNIÓN de sus periodos con los filtros
//    actuales (si dos periodos se cruzan, un caso no se cuenta dos veces).
//  · El estado es el mismo `periodos` del filtro global: tablas, mapas,
//    matrices y variaciones se recalculan solos.
// ───────────────────────────────────────────────────────────────────────────

export const MAX_VIGENCIAS = 60; // periodos en total
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

// Colores suaves para distinguir las vigencias seleccionadas (en orden).
const TONOS = [
  { borde: 'border-emerald-400', fondo: 'bg-emerald-50/70', texto: 'text-emerald-700', fuerte: 'bg-emerald-600', chip: 'bg-emerald-100 text-emerald-800', barra: 'bg-emerald-500', check: 'accent-emerald-600', anillo: 'ring-emerald-200', punteado: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' },
  { borde: 'border-blue-400', fondo: 'bg-blue-50/70', texto: 'text-blue-700', fuerte: 'bg-blue-600', chip: 'bg-blue-100 text-blue-800', barra: 'bg-blue-500', check: 'accent-blue-600', anillo: 'ring-blue-200', punteado: 'border-blue-300 text-blue-700 hover:bg-blue-50' },
  { borde: 'border-violet-400', fondo: 'bg-violet-50/70', texto: 'text-violet-700', fuerte: 'bg-violet-600', chip: 'bg-violet-100 text-violet-800', barra: 'bg-violet-500', check: 'accent-violet-600', anillo: 'ring-violet-200', punteado: 'border-violet-300 text-violet-700 hover:bg-violet-50' },
  { borde: 'border-amber-400', fondo: 'bg-amber-50/70', texto: 'text-amber-700', fuerte: 'bg-amber-600', chip: 'bg-amber-100 text-amber-800', barra: 'bg-amber-500', check: 'accent-amber-600', anillo: 'ring-amber-200', punteado: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
  { borde: 'border-teal-400', fondo: 'bg-teal-50/70', texto: 'text-teal-700', fuerte: 'bg-teal-600', chip: 'bg-teal-100 text-teal-800', barra: 'bg-teal-500', check: 'accent-teal-600', anillo: 'ring-teal-200', punteado: 'border-teal-300 text-teal-700 hover:bg-teal-50' },
  { borde: 'border-rose-400', fondo: 'bg-rose-50/70', texto: 'text-rose-700', fuerte: 'bg-rose-600', chip: 'bg-rose-100 text-rose-800', barra: 'bg-rose-500', check: 'accent-rose-600', anillo: 'ring-rose-200', punteado: 'border-rose-300 text-rose-700 hover:bg-rose-50' },
];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${d} ${MESES[m - 1]} ${y}` : '—';
};

interface Formulario { anio: number; id: string | null; fechaInicial: string; fechaFinal: string; horaInicial: string; horaFinal: string }

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
  const [expandida, setExpandida] = useState(true);
  const [plegados, setPlegados] = useState<Record<number, boolean>>({});
  const [form, setForm] = useState<Formulario | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
  const [verResumen, setVerResumen] = useState(false);

  // Periodos de cada año, en el orden en que se agregaron (el primero es el predeterminado).
  const periodosPorAnio = useMemo(() => {
    const m = new Map<number, PeriodoAnalisis[]>();
    for (const p of periodos) { const a = anioDePeriodo(p); if (a != null) m.set(a, [...(m.get(a) ?? []), p]); }
    return m;
  }, [periodos]);
  const sinFecha = periodos.filter((p) => anioDePeriodo(p) == null);
  const aniosVista = useMemo(() => Array.from(new Set([...anios, ...periodosPorAnio.keys()])).sort((a, b) => a - b), [anios, periodosPorAnio]);
  const seleccion = aniosVista.filter((a) => periodosPorAnio.has(a));
  const tonoDe = (anio: number) => TONOS[Math.max(0, seleccion.indexOf(anio)) % TONOS.length];
  const reciente = aniosVista[aniosVista.length - 1];

  // ── Conteos REALES (filtros globales actuales, sin fecha/año/mes) ──────
  const base = useMemo(() => aplicarFiltros(records, { ...filters, fechaInicial: null, fechaFinal: null, anio: [], mes: [] }), [records, filters]);
  const conteos = useMemo(() => {
    const ventanas = new Map<number, { id: string; ini: number; fin: number }[]>();
    for (const a of aniosVista) {
      const lista = periodosPorAnio.get(a);
      const rangos = lista && lista.length > 0
        ? lista.filter((p) => p.fechaInicial && p.fechaFinal && p.fechaInicial <= p.fechaFinal).map((p) => ({ id: p.id, ini: limiteDePeriodo(p.fechaInicial, p.horaInicial || '00:00').getTime(), fin: limiteDePeriodo(p.fechaFinal, p.horaFinal || '23:59').getTime() }))
        : (() => { const r = rangoVigencia(a, presets); return [{ id: `def-${a}`, ini: limiteDePeriodo(r.fechaInicial, '00:00').getTime(), fin: limiteDePeriodo(r.fechaFinal, '23:59').getTime() }]; })();
      ventanas.set(a, rangos);
    }
    const porPeriodo = new Map<string, number>();
    const porAnio = new Map<number, number>();
    let union = 0;
    for (const r of base as CrimeRecord[]) {
      const fh = fechaHoraDeRegistro(r);
      if (!fh) continue;
      const t = fh.getTime();
      const y = fh.getFullYear();
      let contado = false;
      for (const a of [y, y - 1]) {
        const vs = ventanas.get(a);
        if (!vs) continue;
        let enAnio = false;
        for (const v of vs) if (t >= v.ini && t <= v.fin) { porPeriodo.set(v.id, (porPeriodo.get(v.id) ?? 0) + 1); enAnio = true; }
        if (enAnio) { porAnio.set(a, (porAnio.get(a) ?? 0) + 1); if (periodosPorAnio.has(a) && !contado) { union++; contado = true; } }
      }
    }
    return { porPeriodo, porAnio, union };
  }, [base, aniosVista, periodosPorAnio, presets]);
  const maxCasos = Math.max(1, ...aniosVista.map((a) => conteos.porAnio.get(a) ?? 0));
  const totalPeriodos = periodos.filter((p) => p.fechaInicial && p.fechaFinal).length;

  // ── Acciones ────────────────────────────────────────────────────────────
  function alternarAnio(anio: number) {
    if (periodosPorAnio.has(anio)) {
      setPeriodos((prev) => prev.filter((p) => anioDePeriodo(p) !== anio));
      if (form?.anio === anio) setForm(null);
      return;
    }
    if (periodos.length >= MAX_VIGENCIAS) return;
    setPeriodos((prev) => [...prev, periodoDeVigencia(anio, rangoVigencia(anio, presets))]);
  }
  function aplicarAtajo(n: number | 'todos') {
    const elegidos = n === 'todos' ? aniosVista : aniosVista.slice(-n);
    setPeriodos(elegidos.flatMap((a) => periodosPorAnio.get(a) ?? [periodoDeVigencia(a, rangoVigencia(a, presets))]).slice(0, MAX_VIGENCIAS));
    setForm(null);
  }
  function abrirNuevo(anio: number) {
    const lista = periodosPorAnio.get(anio) ?? [];
    const ultimo = lista[lista.length - 1];
    // Propuesta: la semana siguiente al último periodo (el usuario la cambia).
    let fi = '', ff = '';
    if (ultimo?.fechaFinal) {
      const [y, m, d] = ultimo.fechaFinal.split('-').map(Number);
      const a = new Date(y, m - 1, d + 7), b = new Date(y, m - 1, d + 10);
      const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      if (a.getFullYear() === anio) { fi = iso(a); ff = b.getFullYear() === anio ? iso(b) : `${anio}-12-31`; }
    }
    setForm({ anio, id: null, fechaInicial: fi, fechaFinal: ff, horaInicial: '00:00', horaFinal: '23:59' });
  }
  function abrirEdicion(p: PeriodoAnalisis) {
    setForm({ anio: anioDePeriodo(p)!, id: p.id, fechaInicial: p.fechaInicial, fechaFinal: p.fechaFinal, horaInicial: p.horaInicial || '00:00', horaFinal: p.horaFinal || '23:59' });
  }
  // Validación del formulario.
  const validacion = useMemo(() => {
    if (!form) return { errores: [] as string[], avisos: [] as string[] };
    const errores: string[] = [];
    const avisos: string[] = [];
    if (!form.fechaInicial || !form.fechaFinal) errores.push('Complete la fecha inicial y la final.');
    else {
      if (form.fechaInicial > form.fechaFinal) errores.push('La fecha inicial no puede ser posterior a la final.');
      if (Number(form.fechaInicial.slice(0, 4)) !== form.anio) errores.push(`La fecha inicial debe ser de ${form.anio}.`);
      const yFin = Number(form.fechaFinal.slice(0, 4));
      if (yFin !== form.anio && yFin !== form.anio + 1) errores.push(`La fecha final debe ser de ${form.anio} (o de ${form.anio + 1} si el periodo cruza el año).`);
      else if (yFin === form.anio + 1) avisos.push(`El periodo cruza al año ${form.anio + 1}; se cuenta dentro de ${form.anio}.`);
      const otros = (periodosPorAnio.get(form.anio) ?? []).filter((p) => p.id !== form.id);
      if (otros.some((p) => p.fechaInicial === form.fechaInicial && p.fechaFinal === form.fechaFinal && (p.horaInicial || '00:00') === form.horaInicial && (p.horaFinal || '23:59') === form.horaFinal)) errores.push('Ya existe un periodo idéntico en este año.');
      else {
        const sup = otros.filter((p) => p.fechaInicial <= form.fechaFinal && form.fechaInicial <= p.fechaFinal);
        if (sup.length) avisos.push(`Se superpone con ${sup.map((p) => textoRango(p.fechaInicial, p.fechaFinal)).join(', ')}: los casos compartidos se cuentan una sola vez.`);
      }
    }
    return { errores, avisos };
  }, [form, periodosPorAnio]);
  function guardarFormulario() {
    if (!form || validacion.errores.length) return;
    const lista = periodosPorAnio.get(form.anio) ?? [];
    const esPredeterminado = form.id != null && lista[0]?.id === form.id;
    if (form.id) {
      setPeriodos((prev) => prev.map((p) => (p.id === form.id ? { ...p, fechaInicial: form.fechaInicial, fechaFinal: form.fechaFinal, horaInicial: form.horaInicial, horaFinal: form.horaFinal } : p)));
    } else {
      if (periodos.length >= MAX_VIGENCIAS) return;
      const nuevo: PeriodoAnalisis = { id: nuevoIdPeriodo(), fechaInicial: form.fechaInicial, fechaFinal: form.fechaFinal, horaInicial: form.horaInicial, horaFinal: form.horaFinal };
      // Se inserta justo después del último periodo de ese año (no altera los demás).
      setPeriodos((prev) => {
        let idx = -1;
        prev.forEach((p, i) => { if (anioDePeriodo(p) === form.anio) idx = i; });
        return idx < 0 ? [...prev, nuevo] : [...prev.slice(0, idx + 1), nuevo, ...prev.slice(idx + 1)];
      });
    }
    if (esPredeterminado) { guardarVigencia(form.anio, { fechaInicial: form.fechaInicial, fechaFinal: form.fechaFinal }); avisar(); }
    setForm(null);
  }
  function eliminarPeriodo(id: string) {
    setPeriodos((prev) => prev.filter((p) => p.id !== id));
    setConfirmarBorrar(null);
    if (form?.id === id) setForm(null);
  }
  function restablecer() {
    restablecerVigencias();
    avisar();
    const iniciales = leerVigencias();
    // Solo el periodo predeterminado de cada año vuelve a su fecha inicial; los periodos extra se conservan.
    setPeriodos((prev) => {
      const vistos = new Set<number>();
      return prev.map((p) => {
        const anio = anioDePeriodo(p);
        if (anio == null || vistos.has(anio)) return p;
        vistos.add(anio);
        return { ...p, ...(VIGENCIAS_INICIALES[anio] ?? rangoVigencia(anio, iniciales)) };
      });
    });
    setForm(null);
  }
  const atajoActivo = ATAJOS.find((a) => {
    const esperado = a.n === 'todos' ? aniosVista : aniosVista.slice(-a.n);
    return esperado.length === seleccion.length && esperado.every((x) => periodosPorAnio.has(x));
  })?.id ?? null;
  const minFecha = meta?.fechaMin ? meta.fechaMin.toISOString().slice(0, 10) : undefined;
  const maxFecha = meta?.fechaMax ? meta.fechaMax.toISOString().slice(0, 10) : undefined;

  // ── Formulario compacto (agregar / editar) ──────────────────────────────
  // Función (no componente): así los campos no pierden el foco al escribir.
  const renderFormulario = (tono: (typeof TONOS)[number]) => form && (
    <div className={clsx('rounded-xl border bg-white p-2.5 shadow-sm', tono.borde)}>
      <p className={clsx('mb-1.5 text-[11.5px] font-bold', tono.texto)}>{form.id ? 'Editar periodo' : 'Nuevo periodo'} · {form.anio}</p>
      <div className="grid grid-cols-2 gap-2">
        {([['Fecha inicial', 'fechaInicial', 'date'], ['Fecha final', 'fechaFinal', 'date'], ['Hora inicial', 'horaInicial', 'time'], ['Hora final', 'horaFinal', 'time']] as const).map(([t, k, tipo]) => (
          <label key={k} className="text-[10.5px] font-semibold text-slate-500">
            {t}
            <input
              type={tipo}
              min={tipo === 'date' ? minFecha : undefined}
              max={tipo === 'date' ? maxFecha : undefined}
              value={form[k]}
              onChange={(e) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f))}
              className="mt-0.5 block h-8 w-full rounded-lg border border-slate-300 px-2 text-[12.5px] text-slate-800 focus:border-[#116762] focus:outline-none focus:ring-2 focus:ring-[#116762]/20"
            />
          </label>
        ))}
      </div>
      {validacion.errores.map((e) => <p key={e} className="mt-1.5 flex items-start gap-1 text-[11px] text-rose-600"><AlertTriangle size={12} className="mt-[1px] shrink-0" /> {e}</p>)}
      {validacion.avisos.map((e) => <p key={e} className="mt-1.5 flex items-start gap-1 text-[11px] text-amber-700"><Info size={12} className="mt-[1px] shrink-0" /> {e}</p>)}
      <div className="mt-2 flex justify-end gap-1.5">
        <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-slate-200 px-3 py-1 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={guardarFormulario} disabled={validacion.errores.length > 0} className={clsx('rounded-lg px-3 py-1 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50', tono.fuerte)}>Guardar</button>
      </div>
    </div>
  );

  return (
    <div className={clsx('space-y-3', compacto && 'text-[12px]')}>
      {/* Encabezado + indicadores */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#116762] text-white shadow-sm"><CalendarDays size={22} /></span>
          <div className="min-w-0">
            <p className="text-[17px] font-extrabold leading-tight text-[#10233f]">Multifecha</p>
            <p className="text-[12px] text-slate-500">Compare varias vigencias, cada una con uno o más rangos de fechas.</p>
          </div>
        </div>
        <Indicador icono={<BarChart3 size={18} />} titulo={`${seleccion.length} vigencia${seleccion.length === 1 ? '' : 's'} seleccionada${seleccion.length === 1 ? '' : 's'}`} detalle={seleccion.length ? seleccion.join(', ') : 'Ninguna'} />
        <Indicador icono={<Layers size={18} />} titulo={`${totalPeriodos} periodo${totalPeriodos === 1 ? '' : 's'} en total`} detalle="Suma de todos los rangos" />
        <Indicador icono={<Database size={18} />} titulo={`${conteos.union.toLocaleString('es-CO')} casos`} detalle="Con los filtros actuales" />
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#10233f]">
          Vista expandida
          <button type="button" role="switch" aria-checked={expandida} onClick={() => setExpandida((v) => !v)} className={clsx('relative h-5 w-9 rounded-full transition-colors', expandida ? 'bg-[#116762]' : 'bg-slate-300')}>
            <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', expandida ? 'left-[18px]' : 'left-0.5')} />
          </button>
        </label>
      </div>

      {/* Selección rápida */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="font-semibold text-slate-500">Selección rápida:</span>
        <div className="flex overflow-hidden rounded-full border border-slate-200 bg-white p-0.5">
          {ATAJOS.map((a) => (
            <button key={a.id} type="button" onClick={() => aplicarAtajo(a.n)} aria-pressed={atajoActivo === a.id} className={clsx('rounded-full px-2.5 py-0.5 font-semibold transition-colors', atajoActivo === a.id ? 'bg-[#116762] text-white' : 'text-slate-600 hover:bg-slate-50')}>{a.texto}</button>
          ))}
        </div>
        {seleccion.length >= 2 && <span className="inline-flex items-center gap-1 text-slate-500">Variación: <b className="text-[#10233f]">{seleccion[0]}</b> <ArrowRight size={12} /> <b className="text-[#10233f]">{seleccion[seleccion.length - 1]}</b></span>}
        <span className="ml-auto text-slate-400">{aniosVista.length} año{aniosVista.length === 1 ? '' : 's'} detectado{aniosVista.length === 1 ? '' : 's'} en la base</span>
      </div>

      {/* Tarjetas de años */}
      {aniosVista.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">Aún no hay registros con fecha cargados.</p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))' }}>
          {aniosVista.map((anio) => {
            const activo = periodosPorAnio.has(anio);
            const tono = tonoDe(anio);
            const lista = periodosPorAnio.get(anio) ?? [];
            const rango = lista[0] ?? rangoVigencia(anio, presets);
            const casos = conteos.porAnio.get(anio) ?? 0;
            return (
              <button
                key={anio}
                type="button"
                onClick={() => alternarAnio(anio)}
                aria-pressed={activo}
                title={activo ? `Retirar ${anio} de la comparación` : `Comparar ${anio}`}
                className={clsx('rounded-xl border-2 px-2.5 py-2 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2', activo ? `${tono.borde} ${tono.fondo} shadow-sm ${tono.anillo}` : 'border-slate-200 bg-white hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-sm')}
              >
                <span className="flex items-center gap-1.5">
                  <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', activo ? `${tono.fuerte} border-transparent text-white` : 'border-slate-300 bg-white')}>{activo && <Check size={11} strokeWidth={3.5} />}</span>
                  <span className={clsx('text-[15px] font-extrabold leading-none', activo ? tono.texto : 'text-slate-500')}>{anio}</span>
                  {anio === reciente && <span className="ml-auto rounded-full bg-violet-600 px-1.5 text-[8.5px] font-bold uppercase leading-[15px] text-white">Reciente</span>}
                </span>
                <span className="mt-1 block truncate text-[11px] text-slate-500">{textoRango(rango.fechaInicial, rango.fechaFinal)}{lista.length > 1 ? ` +${lista.length - 1}` : ''}</span>
                <span className="mt-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span className={clsx('block h-full rounded-full', activo ? tono.barra : 'bg-slate-300')} style={{ width: `${casos > 0 ? Math.max(6, (casos / maxCasos) * 100) : 0}%` }} />
                  </span>
                  <span className={clsx('text-[11px] font-bold tabular-nums', activo ? 'text-[#10233f]' : 'text-slate-500')}>{casos.toLocaleString('es-CO')}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Paneles de administración de periodos (años seleccionados) */}
      {expandida && seleccion.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {seleccion.map((anio) => {
            const tono = tonoDe(anio);
            const lista = periodosPorAnio.get(anio)!;
            const plegado = plegados[anio];
            const formAqui = form?.anio === anio;
            return (
              <section key={anio} className={clsx('overflow-hidden rounded-2xl border bg-white transition-shadow', tono.borde.replace('400', '200'))}>
                <header className={clsx('flex items-center gap-2 px-3 py-2.5', tono.fondo)}>
                  <input type="checkbox" checked onChange={() => alternarAnio(anio)} className={clsx('h-[18px] w-[18px]', tono.check)} aria-label={`Retirar ${anio}`} title={`Retirar ${anio}`} />
                  <span className={clsx('text-[19px] font-extrabold', tono.texto)}>{anio}</span>
                  <span className={clsx('rounded-full px-2 py-[1px] text-[10.5px] font-bold', tono.chip)}>Seleccionada</span>
                  {anio === reciente && <span className="rounded-full bg-violet-100 px-2 py-[1px] text-[10.5px] font-bold text-violet-700">RECIENTE</span>}
                  <span className="ml-auto text-[12px] font-semibold text-slate-600">{lista.length} periodo{lista.length === 1 ? '' : 's'}</span>
                  <button type="button" onClick={() => setPlegados((p) => ({ ...p, [anio]: !p[anio] }))} aria-label={plegado ? 'Expandir' : 'Contraer'} className="rounded p-0.5 text-slate-500 hover:bg-white"><ChevronDown size={16} className={clsx('transition', plegado && '-rotate-90')} /></button>
                </header>
                {!plegado && (
                  <div className="space-y-2 px-3 pb-3 pt-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-slate-500">Total de casos (filtros actuales)</span>
                      <span className={clsx('text-[22px] font-extrabold tabular-nums', tono.texto)}>{(conteos.porAnio.get(anio) ?? 0).toLocaleString('es-CO')}</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {lista.map((p, i) => {
                        const editando = form?.id === p.id;
                        return (
                          <li key={p.id} className="py-1.5">
                            {editando ? renderFormulario(tono) : (
                              <div className="flex items-center gap-2">
                                <CalendarDays size={18} className={clsx('shrink-0', tono.texto)} />
                                <div className="min-w-0 flex-1 leading-tight">
                                  <p className="truncate text-[12.5px] font-bold text-[#10233f]">Periodo {i + 1}{i === 0 ? ' (Predeterminado)' : ''}</p>
                                  <p className="flex items-center gap-1 truncate text-[11.5px] text-slate-500">{fechaLarga(p.fechaInicial)} <ArrowRight size={11} /> {fechaLarga(p.fechaFinal)}{(p.horaInicial !== '00:00' || p.horaFinal !== '23:59') && ` · ${p.horaInicial}–${p.horaFinal}`}</p>
                                </div>
                                <span className={clsx('shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-bold tabular-nums', tono.chip)}>{(conteos.porPeriodo.get(p.id) ?? 0).toLocaleString('es-CO')} casos</span>
                                {confirmarBorrar === p.id ? (
                                  <span className="flex shrink-0 items-center gap-1 text-[11px]">
                                    <button type="button" onClick={() => eliminarPeriodo(p.id)} className="rounded bg-rose-600 px-1.5 py-0.5 font-bold text-white">Eliminar</button>
                                    <button type="button" onClick={() => setConfirmarBorrar(null)} className="rounded border border-slate-200 px-1.5 py-0.5 font-semibold text-slate-600">No</button>
                                  </span>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => abrirEdicion(p)} aria-label={`Editar periodo ${i + 1} de ${anio}`} title="Editar" className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-[#10233f]"><Pencil size={14} /></button>
                                    <button type="button" onClick={() => setConfirmarBorrar(p.id)} aria-label={`Eliminar periodo ${i + 1} de ${anio}`} title={lista.length === 1 ? 'Eliminar (retira el año de la comparación)' : 'Eliminar este periodo'} className="shrink-0 rounded p-1 text-rose-500 hover:bg-rose-50"><Trash2 size={14} /></button>
                                  </>
                                )}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {formAqui && form?.id === null ? renderFormulario(tono) : (
                      <button type="button" onClick={() => abrirNuevo(anio)} className={clsx('flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-2 text-[12.5px] font-bold transition-colors', tono.punteado)}>
                        <PlusCircle size={16} /> Agregar otro periodo
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {sinFecha.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sinFecha.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              Periodo sin fechas
              <button type="button" onClick={() => setPeriodos((prev) => prev.filter((x) => x.id !== p.id))} title="Quitar" className="rounded p-0.5 hover:bg-white"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {/* Resumen de periodos */}
      {verResumen && seleccion.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[520px] text-[12px]">
            <thead><tr className="bg-slate-50 text-[10.5px] uppercase tracking-wide text-slate-500"><th className="px-3 py-1.5 text-left">Vigencia</th><th className="px-3 py-1.5 text-left">Periodo</th><th className="px-3 py-1.5 text-left">Rango</th><th className="px-3 py-1.5 text-right">Casos del periodo</th><th className="px-3 py-1.5 text-right">Casos del año (sin duplicar)</th></tr></thead>
            <tbody>
              {seleccion.flatMap((anio) => (periodosPorAnio.get(anio) ?? []).map((p, i, arr) => (
                <tr key={p.id} className="border-t border-slate-100">
                  {i === 0 && <td rowSpan={arr.length} className={clsx('px-3 py-1.5 font-extrabold', tonoDe(anio).texto)}>{anio}</td>}
                  <td className="px-3 py-1.5">Periodo {i + 1}{i === 0 ? ' (Predeterminado)' : ''}</td>
                  <td className="px-3 py-1.5 text-slate-600">{fechaLarga(p.fechaInicial)} – {fechaLarga(p.fechaFinal)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{(conteos.porPeriodo.get(p.id) ?? 0).toLocaleString('es-CO')}</td>
                  {i === 0 && <td rowSpan={arr.length} className="px-3 py-1.5 text-right font-bold tabular-nums text-[#10233f]">{(conteos.porAnio.get(anio) ?? 0).toLocaleString('es-CO')}</td>}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pie */}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
        <button type="button" onClick={restablecer} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50" title="El periodo predeterminado de cada año vuelve a su fecha inicial (los periodos extra se conservan)">
          <RotateCcw size={14} /> Restablecer fechas
        </button>
        {seleccion.length > 0 && (
          <button type="button" onClick={() => { setPeriodos([]); setForm(null); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">
            <X size={13} /> Desactivar multifecha
          </button>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Info size={13} className="text-[#2f6fdb]" /> Los casos se calculan con la unión de los periodos de cada vigencia, sin duplicar rangos traslapados.</span>
        {seleccion.length > 0 && (
          <button type="button" onClick={() => setVerResumen((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-[#10233f] hover:underline">
            <FileText size={14} /> {verResumen ? 'Ocultar' : 'Ver'} resumen de periodos seleccionados <ChevronRight size={14} className={clsx('transition', verResumen && 'rotate-90')} />
          </button>
        )}
      </div>
    </div>
  );
}

function Indicador({ icono, titulo, detalle }: { icono: ReactNode; titulo: string; detalle: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(16,35,63,0.04)]">
      <span className="text-[#116762]">{icono}</span>
      <div className="leading-tight">
        <p className="text-[12.5px] font-bold text-[#10233f]">{titulo}</p>
        <p className="max-w-[180px] truncate text-[11px] text-slate-500">{detalle}</p>
      </div>
    </div>
  );
}


