import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, Building2, CalendarDays, CalendarRange, ChevronDown, ChevronUp, ClipboardList, Clock, Crosshair, Database,
  FileText, Filter, Hourglass, House, Landmark, Map as MapIcon, MapPin, MapPinned, RotateCcw, SlidersHorizontal, Store, Target,
  Users, UsersRound, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { CrimeRecord, FilterState } from '../../types/crime';
import { aplicarFiltros, contarFiltrosActivos } from '../../utils/filters';
import { uniqueSorted } from '../../utils/aggregations';
import { MultiSelect } from './MultiSelect';
import { SelectorMultifecha } from './SelectorMultifecha';
import { SelectorFuentesMicrogerencia } from '../microgerencia/SelectorFuentesMicrogerencia';
import { obtenerModoAcceso } from '../../utils/modoAcceso';
import { DASHBOARD_ACCESS } from '../../config/dashboardAccess';

export type CampoFiltro = Exclude<keyof FilterState, 'fechaInicial' | 'fechaFinal' | 'anio' | 'mes'>;
type CampoActualizable = Exclude<keyof FilterState, 'fechaInicial' | 'fechaFinal'>;

// Filtros principales, en el orden solicitado: se muestran siempre visibles
// en la zona superior del panel. Exportado para que otros módulos (ej. el
// resumen de "filtros activos" del Analista Virtual) usen exactamente las
// mismas etiquetas que ve el usuario aquí, sin definir una segunda lista
// que se pueda desincronizar de esta.
export const CAMPOS_PRINCIPALES: { key: CampoFiltro; label: string; getter: (r: CrimeRecord) => string }[] = [
  { key: 'estacion', label: 'Estación', getter: (r) => r.estacion },
  { key: 'delito', label: 'Delito', getter: (r) => r.delito },
  { key: 'cuadrante', label: 'Zonas de Atención', getter: (r) => r.cuadrante },
  { key: 'barrioHecho', label: 'Barrio', getter: (r) => r.barrioHecho },
  { key: 'franjaHoraria', label: 'Hora (intervalo)', getter: (r) => r.franjaHoraria },
  { key: 'turno', label: 'Turno de vigilancia', getter: (r) => r.turno },
];

// Filtros adicionales, agrupados debajo (colapsables) para no saturar la vista principal.
export const CAMPOS_ADICIONALES: { key: CampoFiltro; label: string; getter: (r: CrimeRecord) => string }[] = [
  { key: 'zona', label: 'Zona', getter: (r) => r.zona },
  { key: 'cai', label: 'CAI', getter: (r) => r.cai },
  { key: 'genero', label: 'Género', getter: (r) => r.genero },
  { key: 'armas', label: 'Arma', getter: (r) => r.armas },
  { key: 'modalidad', label: 'Modalidad', getter: (r) => r.modalidad },
  { key: 'claseSitio', label: 'Clase de sitio', getter: (r) => r.claseSitio },
  { key: 'causaLesion', label: 'Causa de lesión', getter: (r) => r.causaLesion },
  { key: 'grupoEdad', label: 'Grupo de edad', getter: (r) => r.grupoEdad },
];

export function FilterPanel() {
  const { records, filters, setFilters, clearFilters, filteredRecords, meta, periodos } = useData();
  const [expandido, setExpandido] = useState(true);
  const [mostrarMicrogerencia, setMostrarMicrogerencia] = useState(false);
  const modoAcceso = obtenerModoAcceso();
  const accesoMicrogerencia = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].microgerencia;
  const [mostrarAdicionales, setMostrarAdicionales] = useState(false);
  const fechaInicialRef = useRef<HTMLInputElement>(null);

  const anios = useMemo(() => uniqueSorted(records, (r) => String(r.anio ?? '')).filter(Boolean), [records]);
  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => String(i + 1)), []);
  const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const etiquetasMeses = useMemo(() => Object.fromEntries(meses.map((m) => [m, nombresMeses[Number(m) - 1]])), [meses]);

  const activos = contarFiltrosActivos(filters);

  // El intervalo horario debe listarse en orden cronológico, no alfabético.
  const ORDEN_FRANJA = ['Madrugada (00:00-05:59)', 'Mañana (06:00-11:59)', 'Tarde (12:00-17:59)', 'Noche (18:00-23:59)'];

  function opcionesPara(campo: CampoFiltro, getter: (r: CrimeRecord) => string) {
    // Filtros dependientes: calculamos las opciones excluyendo el propio campo,
    // así reflejan el resto de la selección activa.
    const filtroParcial: FilterState = { ...filters, [campo]: [] };
    const base = aplicarFiltros(records, filtroParcial);
    const opciones = uniqueSorted(base, getter);
    if (campo === 'franjaHoraria') {
      return ORDEN_FRANJA.filter((f) => opciones.includes(f));
    }
    return opciones;
  }

  function actualizar(campo: CampoActualizable, valores: string[]) {
    setFilters((prev) => ({ ...prev, [campo]: valores }));
  }

  if (!meta) return null;

  const minFecha = meta.fechaMin ? meta.fechaMin.toISOString().slice(0, 10) : undefined;
  const maxFecha = meta.fechaMax ? meta.fechaMax.toISOString().slice(0, 10) : undefined;

  // ── Accesos rápidos de fecha ────────────────────────────────────────────
  // Solo LLENAN los filtros que ya existen (Fecha inicial / Fecha final) y
  // vacían Año y Mes para que no se crucen con el rango elegido. Cuentan
  // desde la fecha de corte de los datos (el último día cargado), no desde
  // el reloj del equipo, para que nunca den un rango sin datos.
  const corte = meta.fechaMax;
  const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const diasAntes = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - n);
  const RAPIDOS: { id: string; texto: string; desde: (c: Date) => Date }[] = [
    { id: 'dia', texto: 'Último día', desde: (c) => diasAntes(c, 0) },
    { id: 'semana', texto: 'Última semana', desde: (c) => diasAntes(c, 6) },
    { id: '4semanas', texto: 'Últimas 4 semanas', desde: (c) => diasAntes(c, 27) },
    { id: 'mes', texto: 'Último mes', desde: (c) => new Date(c.getFullYear(), c.getMonth() - 1, c.getDate() + 1) },
  ];
  const rapidoActivo = corte && filters.fechaFinal === isoLocal(corte)
    ? RAPIDOS.find((r) => filters.fechaInicial === isoLocal(r.desde(corte)))?.id ?? null
    : null;
  const personalizadoActivo = !rapidoActivo && !!(filters.fechaInicial || filters.fechaFinal);
  const multifechaActiva = periodos.length > 0;
  function aplicarRapido(desde: (c: Date) => Date) {
    if (!corte) return;
    setFilters((prev) => ({ ...prev, anio: [], mes: [], fechaInicial: isoLocal(desde(corte)), fechaFinal: isoLocal(corte) }));
  }

  // ── Filtros activos (chips) ──────────────────────────────────────────────
  const etiquetaDe = new Map<string, string>([...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES].map((c) => [c.key, c.label]));
  const resumirValores = (vals: string[]) => (vals.length <= 2 ? vals.join(', ') : `${vals.slice(0, 2).join(', ')} +${vals.length - 2}`);
  const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');
  const chips: { id: string; texto: string; quitar: () => void }[] = [];
  if (filters.anio.length > 0) chips.push({ id: 'anio', texto: `Año: ${resumirValores(filters.anio)}`, quitar: () => actualizar('anio', []) });
  if (filters.mes.length > 0) chips.push({ id: 'mes', texto: `Mes: ${resumirValores(filters.mes.map((m) => etiquetasMeses[m] ?? m))}`, quitar: () => actualizar('mes', []) });
  if (filters.fechaInicial || filters.fechaFinal) {
    chips.push({
      id: 'fechas',
      texto: `Fecha: ${filters.fechaInicial ? fechaCorta(filters.fechaInicial) : '…'} – ${filters.fechaFinal ? fechaCorta(filters.fechaFinal) : '…'}`,
      quitar: () => setFilters((prev) => ({ ...prev, fechaInicial: null, fechaFinal: null })),
    });
  }
  for (const c of [...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES]) {
    const vals = filters[c.key] as string[];
    if (vals.length > 0) chips.push({ id: c.key, texto: `${c.label}: ${resumirValores(vals)}`, quitar: () => actualizar(c.key, []) });
  }

  // ── Secciones (solo presentación; los campos y su lógica son los mismos) ──
  const campo = (key: CampoFiltro, icono: ReactNode) => {
    const def = [...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES].find((c) => c.key === key)!;
    return (
      <MultiSelect
        key={key}
        institucional
        icono={icono}
        label={etiquetaDe.get(key) ?? key}
        options={opcionesPara(def.key, def.getter)}
        selected={filters[key] as string[]}
        onChange={(v) => actualizar(key, v)}
      />
    );
  };
  const claseFecha = (activa: boolean) => `h-9 w-full rounded-lg border bg-white px-2 text-[13px] text-[#10233f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#116762]/40 disabled:bg-slate-100 disabled:text-slate-400 ${activa ? 'border-[#116762] bg-[#116762]/[0.06] font-semibold' : 'border-slate-300 hover:border-[#116762]/60'}`;
  const etiquetaCampo = 'mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-slate-600';
  const ICO = 'shrink-0 text-[#116762]';
  const adicionalesActivos = CAMPOS_ADICIONALES.filter((c) => (filters[c.key] as string[]).length > 0).length;
  const columnasUbicacion = mostrarAdicionales ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-3';
  const columnasHecho = mostrarAdicionales ? 'sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7' : 'grid-cols-1';

  return (
    <section aria-label="Filtros de análisis" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setExpandido((v) => !v)} aria-expanded={expandido} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#116762]/10 text-[#116762]">
            <Filter size={18} strokeWidth={2.2} />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold text-[#10233f]">Filtros de análisis</span>
              {activos > 0 && (
                <span className="rounded-full bg-[#116762] px-2 py-[1px] text-[10.5px] font-semibold text-white">{activos} {activos === 1 ? 'activo' : 'activos'}</span>
              )}
            </span>
            <span className="block text-[12px] text-slate-500">Seleccione los criterios de análisis. Los gráficos, tablas y mapas se actualizarán automáticamente.</span>
          </span>
        </button>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#116762]/20 bg-[#116762]/[0.06] px-2.5 py-1.5 text-[12px] font-semibold text-[#0b4a46]" aria-live="polite">
            <Database size={13} />
            {filteredRecords.length.toLocaleString('es-CO')} de {records.length.toLocaleString('es-CO')} registros
          </span>
          <button
            type="button"
            onClick={() => { if (accesoMicrogerencia) setMostrarMicrogerencia(true); }}
            disabled={!accesoMicrogerencia}
            title={accesoMicrogerencia ? undefined : 'Próximamente — en desarrollo.'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors ${accesoMicrogerencia ? 'border-[#10233f]/25 bg-white text-[#10233f] hover:bg-[#10233f]/5' : 'cursor-not-allowed border-slate-200 text-slate-300'}`}
          >
            <MapIcon size={14} />
            Microgerencia
            {!accesoMicrogerencia && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">Próx.</span>}
          </button>
          <button type="button" onClick={() => setExpandido((v) => !v)} aria-label={expandido ? 'Contraer filtros' : 'Expandir filtros'} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            {expandido ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
        </div>
      </div>

      {/* Filtros activos — cada chip quita solo ese filtro */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-2">
          <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Filtros activos</span>
          {chips.map((c) => (
            <span key={c.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#116762]/30 bg-[#116762]/[0.07] py-[2px] pl-2.5 pr-1 text-[11.5px] font-medium text-[#0b4a46]">
              <span className="truncate" title={c.texto}>{c.texto}</span>
              <button type="button" onClick={c.quitar} aria-label={`Quitar ${c.texto}`} className="rounded-full p-0.5 hover:bg-[#116762]/15"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {mostrarMicrogerencia && <SelectorFuentesMicrogerencia onCerrar={() => setMostrarMicrogerencia(false)} />}

      {expandido && (
        <div className="space-y-3 border-t border-slate-100 p-4">
          {/* A. FECHA Y PERIODO */}
          <div className="rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 py-2">
              <EncabezadoSeccion icono={<CalendarDays size={16} />} titulo="Fecha y periodo" descripcion="Seleccione el rango de fechas y la temporalidad del análisis" />
              <div className="flex flex-wrap gap-1" role="group" aria-label="Accesos rápidos de fecha">
                {RAPIDOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!corte || multifechaActiva}
                    onClick={() => aplicarRapido(r.desde)}
                    aria-pressed={rapidoActivo === r.id}
                    title={corte ? `Hasta la fecha de corte de los datos (${corte.toLocaleDateString('es-CO')}). Llena Fecha inicial y Fecha final, y quita Año y Mes.` : undefined}
                    className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${rapidoActivo === r.id ? 'border-[#10233f] bg-[#10233f] text-white' : 'border-slate-300 bg-white text-[#10233f] hover:border-[#10233f]/50'}`}
                  >
                    {r.texto}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={multifechaActiva}
                  onClick={() => fechaInicialRef.current?.focus()}
                  aria-pressed={personalizadoActivo}
                  title="Elija usted mismo la fecha inicial y la final"
                  className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${personalizadoActivo ? 'border-[#10233f] bg-[#10233f] text-white' : 'border-slate-300 bg-white text-[#10233f] hover:border-[#10233f]/50'}`}
                >
                  Personalizado
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6">
              <MultiSelect institucional icono={<CalendarDays size={13} className={ICO} />} label="Año" options={anios} selected={filters.anio} onChange={(v) => actualizar('anio', v)} />
              <MultiSelect institucional icono={<CalendarDays size={13} className={ICO} />} label="Mes" options={meses} selected={filters.mes} onChange={(v) => actualizar('mes', v)} labels={etiquetasMeses} />
              <div>
                <label htmlFor="filtro-fecha-inicial" className={etiquetaCampo}><CalendarRange size={13} className={ICO} />Fecha inicial{multifechaActiva && <span className="font-normal text-slate-400">(multifecha)</span>}</label>
                <input
                  id="filtro-fecha-inicial"
                  ref={fechaInicialRef}
                  type="date"
                  min={minFecha}
                  max={maxFecha}
                  value={filters.fechaInicial ?? ''}
                  disabled={multifechaActiva}
                  onChange={(e) => setFilters((prev) => ({ ...prev, fechaInicial: e.target.value || null }))}
                  className={claseFecha(!!filters.fechaInicial)}
                />
              </div>
              <div>
                <label htmlFor="filtro-fecha-final" className={etiquetaCampo}><CalendarRange size={13} className={ICO} />Fecha final{multifechaActiva && <span className="font-normal text-slate-400">(multifecha)</span>}</label>
                <input
                  id="filtro-fecha-final"
                  type="date"
                  min={minFecha}
                  max={maxFecha}
                  value={filters.fechaFinal ?? ''}
                  disabled={multifechaActiva}
                  onChange={(e) => setFilters((prev) => ({ ...prev, fechaFinal: e.target.value || null }))}
                  className={claseFecha(!!filters.fechaFinal)}
                />
              </div>
              {campo('franjaHoraria', <Clock size={13} className={ICO} />)}
              {campo('turno', <Hourglass size={13} className={ICO} />)}
            </div>
          </div>

          {/* B. UBICACIÓN + C. CARACTERÍSTICAS — lado a lado mientras los adicionales están cerrados */}
          <div className={`grid grid-cols-1 gap-3 ${mostrarAdicionales ? '' : 'xl:grid-cols-[3fr_1.15fr]'}`}>
            <div className="rounded-lg border border-slate-200">
              <div className="rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 py-2">
                <EncabezadoSeccion icono={<MapPinned size={16} />} titulo="Ubicación geográfica" descripcion="Filtre por la ubicación de los eventos" />
              </div>
              <div className={`grid grid-cols-1 gap-3 p-3 ${columnasUbicacion}`}>
                {campo('estacion', <Building2 size={13} className={ICO} />)}
                {campo('cuadrante', <MapIcon size={13} className={ICO} />)}
                {campo('barrioHecho', <House size={13} className={ICO} />)}
                {mostrarAdicionales && campo('zona', <MapPin size={13} className={ICO} />)}
                {mostrarAdicionales && campo('cai', <Landmark size={13} className={ICO} />)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200">
              <div className="rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 py-2">
                <EncabezadoSeccion icono={<ClipboardList size={16} />} titulo="Características del hecho" descripcion="Filtre por las características de los eventos" />
              </div>
              <div className={`grid grid-cols-1 gap-3 p-3 ${columnasHecho}`}>
                {campo('delito', <FileText size={13} className={ICO} />)}
                {mostrarAdicionales && campo('genero', <Users size={13} className={ICO} />)}
                {mostrarAdicionales && campo('armas', <Crosshair size={13} className={ICO} />)}
                {mostrarAdicionales && campo('modalidad', <Target size={13} className={ICO} />)}
                {mostrarAdicionales && campo('claseSitio', <Store size={13} className={ICO} />)}
                {mostrarAdicionales && campo('causaLesion', <Activity size={13} className={ICO} />)}
                {mostrarAdicionales && campo('grupoEdad', <UsersRound size={13} className={ICO} />)}
              </div>
            </div>
          </div>

          {/* Filtros adicionales (expandir / contraer) */}
          <button
            type="button"
            onClick={() => setMostrarAdicionales((v) => !v)}
            aria-expanded={mostrarAdicionales}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-slate-50"
          >
            <span className="flex flex-wrap items-center gap-2">
              <SlidersHorizontal size={15} className="text-[#116762]" />
              <span className="text-[13px] font-semibold text-[#10233f]">Filtros adicionales</span>
              <span className="text-[11.5px] text-slate-500">Zona, CAI, género, arma, modalidad, clase de sitio, causa de lesión y grupo de edad</span>
              {adicionalesActivos > 0 && <span className="rounded-full bg-[#116762] px-2 py-[1px] text-[10.5px] font-semibold text-white">{adicionalesActivos} activo{adicionalesActivos === 1 ? '' : 's'}</span>}
            </span>
            {mostrarAdicionales ? <ChevronUp size={17} className="shrink-0 text-slate-500" /> : <ChevronDown size={17} className="shrink-0 text-slate-500" />}
          </button>

          {/* Análisis multifecha (opción avanzada) */}
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2">
            <SelectorMultifecha />
          </div>

          {/* Pie: limpiar + contador (los filtros se aplican solos al elegirlos) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50"
            >
              <RotateCcw size={14} /> Limpiar filtros
            </button>
            <span className="text-[11.5px] text-slate-500">
              Mostrando <b className="text-[#0b4a46]">{filteredRecords.length.toLocaleString('es-CO')}</b> de {records.length.toLocaleString('es-CO')} registros · se actualiza automáticamente
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function EncabezadoSeccion({ icono, titulo, descripcion }: { icono: ReactNode; titulo: string; descripcion: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#116762]/10 text-[#116762]">{icono}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-bold leading-tight text-[#10233f]">{titulo}</p>
        <p className="text-[11px] leading-tight text-slate-500">{descripcion}</p>
      </div>
    </div>
  );
}
