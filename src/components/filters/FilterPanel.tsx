import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, Building2, CalendarCheck, CalendarDays, CalendarRange, ChevronDown, ChevronUp, ClipboardList, Clock, Crosshair, Database,
  FileText, Filter, Hourglass, House, Landmark, Map as MapIcon, MapPin, MapPinned, RotateCcw, SlidersHorizontal, Store, Target,
  ShieldCheck, Users, UsersRound, X,
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
  { key: 'diaSemana', label: 'Día de la semana', getter: (r) => r.diaSemana },
  { key: 'diaMes', label: 'Día del mes', getter: (r) => (r.dia != null ? String(r.dia) : '') },
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
  const { records, filters, setFilters, clearFilters, filteredRecords, meta, periodos, operatividadRecords } = useData();
  // Categorías de operatividad que existen en los datos cargados (nunca una lista inventada).
  const categoriasOperatividad = useMemo(
    () => Array.from(new Set(operatividadRecords.map((r) => (r.categoria ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [operatividadRecords],
  );
  const categoriaOperatividadSel = filters.categoriaOperatividad ?? [];
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
  const ORDEN_DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
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
    // Días en orden de calendario (lunes → domingo; 1 → 31), no alfabético.
    if (campo === 'diaSemana') {
      const orden = (d: string) => ORDEN_DIAS.indexOf(d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());
      return [...opciones].filter(Boolean).sort((a, b) => (orden(a) === -1 ? 99 : orden(a)) - (orden(b) === -1 ? 99 : orden(b)));
    }
    if (campo === 'diaMes') return opciones.filter(Boolean).sort((a, b) => Number(a) - Number(b));
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
  if (filters.horaExacta.length > 0) chips.push({ id: 'horaExacta', texto: `Hora: ${resumirValores([...filters.horaExacta].sort((a, b) => Number(a) - Number(b)).map((h) => `${h.padStart(2, '0')}:00`))}`, quitar: () => actualizar('horaExacta', []) });
  if (categoriaOperatividadSel.length > 0) chips.push({ id: 'categoriaOperatividad', texto: `Operatividad: ${resumirValores(categoriaOperatividadSel)}`, quitar: () => setFilters((prev) => ({ ...prev, categoriaOperatividad: [] })) });
  for (const c of [...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES]) {
    const vals = filters[c.key] as string[];
    if (vals.length > 0) chips.push({ id: c.key, texto: `${c.label}: ${resumirValores(vals)}`, quitar: () => actualizar(c.key, []) });
  }

  // ── Secciones (solo presentación; los campos y su lógica son los mismos) ──
  // Cada sección tiene su propio tono (azul, verde petróleo, azul pizarra)
  // para leerse de un vistazo, siempre dentro de la paleta institucional.
  const TONOS = {
    fecha: { banda: 'bg-[#eaf2fb] border-[#d3e3f4]', tile: 'bg-[#1e4f8f] text-white', campo: 'bg-[#e8f0fa] text-[#1e4f8f]' },
    ubicacion: { banda: 'bg-[#e6f4f0] border-[#cfe8e1]', tile: 'bg-[#116762] text-white', campo: 'bg-[#e3f2ef] text-[#116762]' },
    hecho: { banda: 'bg-[#eef1f8] border-[#dde3ef]', tile: 'bg-[#10233f] text-white', campo: 'bg-[#eceff6] text-[#10233f]' },
  } as const;
  type Tono = keyof typeof TONOS;
  const campo = (key: CampoFiltro, icono: ReactNode, tono: Tono) => {
    const def = [...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES].find((c) => c.key === key)!;
    return (
      <MultiSelect
        key={key}
        institucional
        icono={icono}
        tonoIcono={TONOS[tono].campo}
        label={etiquetaDe.get(key) ?? key}
        options={opcionesPara(def.key, def.getter)}
        selected={filters[key] as string[]}
        onChange={(v) => actualizar(key, v)}
      />
    );
  };
  const claseFecha = (activa: boolean) => `h-10 w-full rounded-lg border bg-white px-2.5 text-[13px] text-[#10233f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#116762]/40 disabled:bg-slate-100 disabled:text-slate-400 ${activa ? 'border-[#116762] bg-[#116762]/[0.06] font-semibold' : 'border-slate-300 hover:border-[#116762]/60'}`;
  const adicionalesActivos = CAMPOS_ADICIONALES.filter((c) => (filters[c.key] as string[]).length > 0).length;
  const columnasUbicacion = mostrarAdicionales ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-3';
  const columnasHecho = mostrarAdicionales ? 'sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7' : 'grid-cols-1';
  const textoPeriodo = multifechaActiva
    ? 'Análisis multifecha'
    : rapidoActivo ? RAPIDOS.find((r) => r.id === rapidoActivo)!.texto
      : personalizadoActivo ? 'Personalizado'
        : filters.anio.length > 0 || filters.mes.length > 0 ? 'Año / mes elegidos' : 'Todo el periodo';
  const botonRapido = (activo: boolean) => `rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activo ? 'border-[#10233f] bg-[#10233f] text-white shadow-sm' : 'border-slate-300 bg-white text-[#10233f] hover:border-[#1e4f8f] hover:bg-[#eaf2fb]'}`;

  return (
    <section aria-label="Filtros de análisis" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <button type="button" onClick={() => setExpandido((v) => !v)} aria-expanded={expandido} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e3f2ef] text-[#116762]">
            <Filter size={24} strokeWidth={2.2} fill="currentColor" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[20px] font-bold leading-tight text-[#10233f]">Filtros de análisis</span>
              {activos > 0 && (
                <span className="rounded-full bg-[#116762] px-2.5 py-[2px] text-[11px] font-semibold text-white">{activos} {activos === 1 ? 'activo' : 'activos'}</span>
              )}
            </span>
            <span className="block text-[12.5px] text-slate-500">Seleccione los criterios de análisis. Los gráficos, tablas y mapas se actualizarán automáticamente.</span>
          </span>
        </button>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e3f2ef] px-3 py-2 text-[12.5px] font-semibold text-[#0b4a46]" aria-live="polite">
            <Database size={15} />
            {filteredRecords.length.toLocaleString('es-CO')} de {records.length.toLocaleString('es-CO')} registros
          </span>
          <button
            type="button"
            onClick={() => { if (accesoMicrogerencia) setMostrarMicrogerencia(true); }}
            disabled={!accesoMicrogerencia}
            title={accesoMicrogerencia ? undefined : 'Próximamente — en desarrollo.'}
            className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-colors ${accesoMicrogerencia ? 'border-[#10233f]/25 bg-white text-[#10233f] shadow-sm hover:bg-[#eaf2fb]' : 'cursor-not-allowed border-slate-200 text-slate-300'}`}
          >
            <MapIcon size={16} />
            Microgerencia
            {!accesoMicrogerencia && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">Próx.</span>}
          </button>
          <button type="button" onClick={() => setExpandido((v) => !v)} aria-label={expandido ? 'Contraer filtros' : 'Expandir filtros'} className="rounded-md p-1.5 text-[#10233f] hover:bg-slate-100">
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Filtros activos — cada chip quita solo ese filtro */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-[#f7faf9] px-4 py-2">
          <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wide text-[#116762]">Filtros activos</span>
          {chips.map((c) => (
            <span key={c.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#116762]/30 bg-white py-[3px] pl-2.5 pr-1 text-[11.5px] font-medium text-[#0b4a46] shadow-sm">
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
          <div className="overflow-visible rounded-xl border border-[#d3e3f4]">
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b px-3 py-2.5 ${TONOS.fecha.banda}`}>
              <EncabezadoSeccion tono={TONOS.fecha.tile} icono={<CalendarDays size={18} />} titulo="Fecha y periodo" descripcion="Seleccione el rango de fechas y la temporalidad del análisis" />
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Accesos rápidos de fecha">
                <span className="mr-1 inline-flex items-center gap-1.5 rounded-lg border border-[#d3e3f4] bg-white px-3 py-1.5 text-[12px] font-bold text-[#10233f] shadow-sm">
                  <CalendarRange size={15} className="text-[#1e4f8f]" />
                  {textoPeriodo}
                </span>
                {RAPIDOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!corte || multifechaActiva}
                    onClick={() => aplicarRapido(r.desde)}
                    aria-pressed={rapidoActivo === r.id}
                    title={corte ? `Hasta la fecha de corte de los datos (${corte.toLocaleDateString('es-CO')}). Llena Fecha inicial y Fecha final, y quita Año y Mes.` : undefined}
                    className={botonRapido(rapidoActivo === r.id)}
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
                  className={botonRapido(personalizadoActivo)}
                >
                  Personalizado
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 rounded-b-xl">
              <MultiSelect institucional icono={<CalendarDays size={18} />} tonoIcono={TONOS.fecha.campo} label="Año" options={anios} selected={filters.anio} onChange={(v) => actualizar('anio', v)} />
              <MultiSelect institucional icono={<CalendarDays size={18} />} tonoIcono={TONOS.fecha.campo} label="Mes" options={meses} selected={filters.mes} onChange={(v) => actualizar('mes', v)} labels={etiquetasMeses} />
              <CampoFecha id="filtro-fecha-inicial" etiqueta="Fecha inicial" tono={TONOS.fecha.campo} multifecha={multifechaActiva} activa={!!filters.fechaInicial}>
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
              </CampoFecha>
              <CampoFecha id="filtro-fecha-final" etiqueta="Fecha final" tono={TONOS.fecha.campo} multifecha={multifechaActiva} activa={!!filters.fechaFinal}>
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
              </CampoFecha>
              {campo('franjaHoraria', <Clock size={18} />, 'fecha')}
              {campo('turno', <Hourglass size={18} />, 'fecha')}
              {campo('diaSemana', <CalendarCheck size={18} />, 'fecha')}
              {campo('diaMes', <CalendarDays size={18} />, 'fecha')}
            </div>
          </div>

          {/* B. UBICACIÓN + C. CARACTERÍSTICAS — lado a lado mientras los adicionales están cerrados */}
          <div className={`grid grid-cols-1 gap-3 ${mostrarAdicionales ? '' : 'xl:grid-cols-[3fr_1.2fr]'}`}>
            <div className="rounded-xl border border-[#cfe8e1]">
              <div className={`rounded-t-xl border-b px-3 py-2.5 ${TONOS.ubicacion.banda}`}>
                <EncabezadoSeccion tono={TONOS.ubicacion.tile} icono={<MapPinned size={18} />} titulo="Ubicación geográfica" descripcion="Filtre por la ubicación de los eventos" />
              </div>
              <div className={`grid grid-cols-1 gap-3 rounded-b-xl bg-white p-3 ${columnasUbicacion}`}>
                {campo('estacion', <Building2 size={18} />, 'ubicacion')}
                {campo('cuadrante', <MapIcon size={18} />, 'ubicacion')}
                {campo('barrioHecho', <House size={18} />, 'ubicacion')}
                {mostrarAdicionales && campo('zona', <MapPin size={18} />, 'ubicacion')}
                {mostrarAdicionales && campo('cai', <Landmark size={18} />, 'ubicacion')}
              </div>
            </div>
            <div className="rounded-xl border border-[#dde3ef]">
              <div className={`rounded-t-xl border-b px-3 py-2.5 ${TONOS.hecho.banda}`}>
                <EncabezadoSeccion tono={TONOS.hecho.tile} icono={<ClipboardList size={18} />} titulo="Características del hecho" descripcion="Filtre por las características de los eventos" />
              </div>
              <div className={`grid grid-cols-1 gap-3 rounded-b-xl bg-white p-3 ${columnasHecho}`}>
                {campo('delito', <FileText size={18} />, 'hecho')}
                {categoriasOperatividad.length > 0 && (
                  <MultiSelect
                    institucional
                    icono={<ShieldCheck size={18} />}
                    tonoIcono={TONOS.hecho.campo}
                    label="Categoría de operatividad"
                    options={categoriasOperatividad}
                    selected={categoriaOperatividadSel}
                    onChange={(v) => setFilters((prev) => ({ ...prev, categoriaOperatividad: v }))}
                  />
                )}
                {mostrarAdicionales && campo('genero', <Users size={18} />, 'hecho')}
                {mostrarAdicionales && campo('armas', <Crosshair size={18} />, 'hecho')}
                {mostrarAdicionales && campo('modalidad', <Target size={18} />, 'hecho')}
                {mostrarAdicionales && campo('claseSitio', <Store size={18} />, 'hecho')}
                {mostrarAdicionales && campo('causaLesion', <Activity size={18} />, 'hecho')}
                {mostrarAdicionales && campo('grupoEdad', <UsersRound size={18} />, 'hecho')}
              </div>
            </div>
          </div>

          {/* Filtros adicionales (interruptor para expandir / contraer) */}
          <button
            type="button"
            role="switch"
            onClick={() => setMostrarAdicionales((v) => !v)}
            aria-checked={mostrarAdicionales}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2.5 text-left hover:bg-slate-100"
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#10233f] ring-1 ring-slate-200"><SlidersHorizontal size={16} /></span>
              <span className="text-[13.5px] font-bold text-[#10233f]">Filtros adicionales</span>
              <span className="text-[11.5px] text-slate-500">Zona, CAI, género, arma, modalidad, clase de sitio, causa de lesión y grupo de edad</span>
              {adicionalesActivos > 0 && <span className="rounded-full bg-[#116762] px-2 py-[1px] text-[10.5px] font-semibold text-white">{adicionalesActivos} activo{adicionalesActivos === 1 ? '' : 's'}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${mostrarAdicionales ? 'bg-[#116762]' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${mostrarAdicionales ? 'left-[18px]' : 'left-0.5'}`} />
              </span>
              {mostrarAdicionales ? <ChevronUp size={17} className="text-[#10233f]" /> : <ChevronDown size={17} className="text-[#10233f]" />}
            </span>
          </button>

          {/* Análisis multifecha (opción avanzada) */}
          <div className="rounded-xl border border-dashed border-[#1e4f8f]/30 bg-[#f7f9fd] px-3 py-2.5">
            <SelectorMultifecha />
          </div>

          {/* Pie: limpiar + contador (los filtros se aplican solos al elegirlos) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-[#10233f] shadow-sm hover:bg-slate-50"
            >
              <RotateCcw size={15} /> Limpiar filtros
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#e3f2ef] px-3 py-2 text-[12.5px] font-semibold text-[#0b4a46]">
              <Database size={15} />
              {filteredRecords.length.toLocaleString('es-CO')} de {records.length.toLocaleString('es-CO')} registros
              <span className="font-normal text-[#116762]">· se actualiza automáticamente</span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function EncabezadoSeccion({ icono, titulo, descripcion, tono }: { icono: ReactNode; titulo: string; descripcion: string; tono: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm ${tono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-tight text-[#10233f]">{titulo}</p>
        <p className="text-[11.5px] leading-tight text-slate-600">{descripcion}</p>
      </div>
    </div>
  );
}

// Fecha inicial / final con el mismo aspecto que las listas (recuadro de ícono a la izquierda).
function CampoFecha({ id, etiqueta, tono, multifecha, activa, children }: { id: string; etiqueta: string; tono: string; multifecha: boolean; activa: boolean; children: ReactNode }) {
  return (
    <div className="flex items-end gap-2">
      <span aria-hidden="true" className={`mb-[1px] flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${activa ? 'bg-[#116762] text-white' : tono}`}><CalendarRange size={18} /></span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="mb-1 block truncate text-[12px] font-semibold text-[#10233f]">
          {etiqueta}{multifecha && <span className="font-normal text-slate-400"> (multifecha)</span>}
        </label>
        {children}
      </div>
    </div>
  );
}
