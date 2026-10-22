import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, Building2, CalendarCheck, CalendarDays, CalendarRange, ChevronDown, ChevronUp, Clock, Crosshair, Database,
  FileText, Filter, Hourglass, House, Map as MapIcon, MapPin, MapPinned, RotateCcw, SlidersHorizontal, Store, Target,
  ShieldCheck, Users, UsersRound, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { CrimeRecord, FilterState } from '../../types/crime';
import { aplicarFiltros, contarFiltrosActivos } from '../../utils/filters';
import { uniqueSorted } from '../../utils/aggregations';
import { MultiSelect } from './MultiSelect';
import { SelectorVigencias, periodosIniciales } from '../multifecha/SelectorVigencias';
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
  const { records, filters, setFilters, clearFilters, filteredRecords, meta, periodos, setPeriodos, operatividadRecords } = useData();
  // Categorías de operatividad que existen en los datos cargados (nunca una lista inventada).
  const categoriasOperatividad = useMemo(
    () => Array.from(new Set(operatividadRecords.map((r) => (r.categoria ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es')),
    [operatividadRecords],
  );
  const categoriaOperatividadSel = filters.categoriaOperatividad ?? [];
  const [expandido, setExpandido] = useState(true);
  const [categoria, setCategoria] = useState<Categoria>('fecha');
  const [mostrarMicrogerencia, setMostrarMicrogerencia] = useState(false);
  const modoAcceso = obtenerModoAcceso();
  const accesoMicrogerencia = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].microgerencia;
  const fechaInicialRef = useRef<HTMLInputElement>(null);

  // Años de delitos Y de operatividad (el histórico de cada uno se puede subir por separado).
  const anios = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) if (r.anio) set.add(String(r.anio));
    for (const r of operatividadRecords) if (r.anio) set.add(String(r.anio));
    return Array.from(set).sort();
  }, [records, operatividadRecords]);
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

  // ── Categorías (solo presentación; los campos y su lógica son los mismos) ──
  // Cada categoría tiene su color: verde institucional = fecha, azul =
  // ubicación, amarillo = delito y operatividad, violeta = más filtros.
  const CATS: Record<Categoria, { titulo: string; descripcion: string; icono: (t: number) => ReactNode; boton: { activo: string; inactivo: string; badgeActivo: string; badge: string; icono: string }; panel: { banda: string; borde: string; tile: string; campo: string; campoActivo: string } }> = {
    fecha: {
      titulo: 'Fecha y periodo', descripcion: 'Seleccione el rango de fechas y la temporalidad del análisis', icono: (t) => <CalendarDays size={t} />,
      boton: { activo: 'border-[#116762] bg-[#116762] text-white', inactivo: 'border-slate-200 bg-white text-[#10233f] hover:border-[#116762]/50 hover:bg-[#f1f8f6]', badgeActivo: 'bg-white text-[#116762]', badge: 'bg-[#e3f2ef] text-[#116762]', icono: 'text-[#116762]' },
      panel: { banda: 'bg-[#eef7f4]', borde: 'border-[#cfe8e1]', tile: 'bg-[#116762] text-white', campo: 'bg-[#e3f2ef] text-[#116762]', campoActivo: 'bg-[#116762] text-white' },
    },
    ubicacion: {
      titulo: 'Ubicación geográfica', descripcion: 'Filtre por la ubicación de los eventos', icono: (t) => <MapPinned size={t} />,
      boton: { activo: 'border-[#2f6fdb] bg-[#2f6fdb] text-white', inactivo: 'border-slate-200 bg-white text-[#10233f] hover:border-[#2f6fdb]/50 hover:bg-[#f2f7fe]', badgeActivo: 'bg-white text-[#2f6fdb]', badge: 'bg-[#e6effc] text-[#2f6fdb]', icono: 'text-[#2f6fdb]' },
      panel: { banda: 'bg-[#eef4fd]', borde: 'border-[#cfdff6]', tile: 'bg-[#2f6fdb] text-white', campo: 'bg-[#e6effc] text-[#2f6fdb]', campoActivo: 'bg-[#2f6fdb] text-white' },
    },
    delito: {
      titulo: 'Delito y operatividad', descripcion: 'Filtre por las características de los eventos', icono: (t) => <FileText size={t} />,
      boton: { activo: 'border-[#e0b03c] bg-[#fbe6a6] text-[#5c3d00]', inactivo: 'border-slate-200 bg-white text-[#10233f] hover:border-[#e0b03c]/60 hover:bg-[#fffaf0]', badgeActivo: 'bg-white text-[#8a5a00]', badge: 'bg-[#fdf3d6] text-[#8a5a00]', icono: 'text-[#b7841c]' },
      panel: { banda: 'bg-[#fdf7e7]', borde: 'border-[#f3e2b0]', tile: 'bg-[#f2c14e] text-[#5c3d00]', campo: 'bg-[#fdf3d6] text-[#b7841c]', campoActivo: 'bg-[#e0a92c] text-white' },
    },
    multifecha: {
      titulo: 'Multifecha', descripcion: 'Compare vigencias (años), cada una con su propio rango de fechas', icono: (t) => <CalendarRange size={t} />,
      boton: { activo: 'border-[#0e7490] bg-[#0e7490] text-white', inactivo: 'border-slate-200 bg-white text-[#10233f] hover:border-[#0e7490]/50 hover:bg-[#f0f9fb]', badgeActivo: 'bg-white text-[#0e7490]', badge: 'bg-[#e7f5f9] text-[#0e7490]', icono: 'text-[#0e7490]' },
      panel: { banda: 'bg-[#eef8fb]', borde: 'border-[#cbe8f0]', tile: 'bg-[#0e7490] text-white', campo: 'bg-[#e7f5f9] text-[#0e7490]', campoActivo: 'bg-[#0e7490] text-white' },
    },
    mas: {
      titulo: 'Más filtros', descripcion: 'Filtros adicionales de análisis', icono: (t) => <SlidersHorizontal size={t} />,
      boton: { activo: 'border-[#a78bfa] bg-[#ede4fb] text-[#4c1d95]', inactivo: 'border-slate-200 bg-white text-[#10233f] hover:border-[#a78bfa]/60 hover:bg-[#f8f4fe]', badgeActivo: 'bg-[#7c3aed] text-white', badge: 'bg-[#f1eafd] text-[#6d28d9]', icono: 'text-[#7c3aed]' },
      panel: { banda: 'bg-[#f6f1fd]', borde: 'border-[#e2d5f8]', tile: 'bg-[#ddd0f7] text-[#5b21b6]', campo: 'bg-[#f1eafd] text-[#7c3aed]', campoActivo: 'bg-[#7c3aed] text-white' },
    },
  };
  const n = (k: keyof FilterState) => ((filters[k] as string[] | null | undefined) ?? []).length > 0 ? 1 : 0;
  // Vigencias = años distintos (cada año puede tener varios periodos).
  const vigenciasMf = new Set(periodos.map((p) => p.fechaInicial.slice(0, 4)).filter(Boolean)).size;
  const conteos: Record<Categoria, number> = {
    fecha: n('anio') + n('mes') + (filters.fechaInicial || filters.fechaFinal ? 1 : 0) + n('franjaHoraria') + n('turno') + n('diaSemana') + n('diaMes') + n('horaExacta'),
    ubicacion: n('estacion') + n('cuadrante') + n('cai') + n('barrioHecho'),
    delito: n('delito') + (categoriaOperatividadSel.length > 0 ? 1 : 0),
    mas: CAMPOS_MAS.reduce((a, k) => a + n(k), 0),
    multifecha: vigenciasMf,
  };
  const campo = (key: CampoFiltro, icono: ReactNode, cat: Categoria) => {
    const def = [...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES].find((c) => c.key === key)!;
    return (
      <MultiSelect
        key={key}
        institucional
        icono={icono}
        tonoIcono={CATS[cat].panel.campo}
        tonoIconoActivo={CATS[cat].panel.campoActivo}
        label={etiquetaDe.get(key) ?? key}
        options={opcionesPara(def.key, def.getter)}
        selected={filters[key] as string[]}
        onChange={(v) => actualizar(key, v)}
      />
    );
  };
  const claseFecha = (activa: boolean) => `h-10 w-full rounded-lg border bg-white px-2.5 text-[13px] text-[#10233f] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#116762]/40 disabled:bg-slate-100 disabled:text-slate-400 ${activa ? 'border-[#116762] bg-[#116762]/[0.06] font-semibold' : 'border-slate-300 hover:border-[#116762]/60'}`;
  const textoPeriodo = multifechaActiva
    ? 'Análisis multifecha'
    : rapidoActivo ? RAPIDOS.find((r) => r.id === rapidoActivo)!.texto
      : personalizadoActivo ? 'Personalizado'
        : filters.anio.length > 0 || filters.mes.length > 0 ? 'Año / mes elegidos' : 'Todo el periodo';
  const botonRapido = (activo: boolean) => `rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activo ? 'border-[#116762] bg-[#116762] text-white shadow-sm' : 'border-slate-300 bg-white text-[#10233f] hover:border-[#116762] hover:bg-[#eef7f4]'}`;
  function elegirCategoria(c: Categoria) {
    if (c === categoria && expandido) { setExpandido(false); return; }
    setCategoria(c);
    setExpandido(true);
  }
  function alternarMultifecha(activar: boolean) {
    setPeriodos(activar ? periodosIniciales(meta?.aniosDisponibles ?? []) : []);
    if (activar) setFilters((prev) => (prev.anio.length || prev.mes.length ? { ...prev, anio: [], mes: [] } : prev));
  }
  const cat = CATS[categoria];

  return (
    <section aria-label="Filtros de análisis" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Encabezado: título · categorías · registros · Microgerencia · contraer */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3">
        <div className="flex min-w-0 flex-none items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e3f2ef] text-[#116762]">
            <Filter size={22} strokeWidth={2.2} fill="currentColor" />
          </span>
          <span className="min-w-0">
            <span className="block text-[19px] font-bold leading-tight text-[#10233f]">Filtros de análisis</span>
            <span className="block text-[12px] text-slate-500">Seleccione los criterios para filtrar los datos</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:min-w-max lg:flex-nowrap" role="tablist" aria-label="Categorías de filtros">
          {ORDEN_CATS.map((c) => {
            const def = CATS[c];
            const seleccionada = categoria === c && expandido;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={seleccionada}
                aria-controls="panel-filtros"
                onClick={() => elegirCategoria(c)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-2.5 py-2 text-[12.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#116762]/50 ${seleccionada ? `${def.boton.activo} shadow-sm` : def.boton.inactivo}`}
              >
                <span className={seleccionada ? '' : def.boton.icono}>{def.icono(17)}</span>
                {def.titulo}
                <span className={`min-w-[20px] rounded-full px-1.5 py-[1px] text-center text-[11px] font-bold ${seleccionada ? def.boton.badgeActivo : conteos[c] > 0 ? def.boton.badge : 'bg-slate-100 text-slate-400'}`}>{conteos[c]}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setExpandido((v) => !v)} aria-expanded={expandido} aria-controls="panel-filtros" aria-label={expandido ? 'Contraer filtros' : 'Expandir filtros'} className="rounded-md p-1.5 text-[#10233f] hover:bg-slate-100">
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Filtros activos — cada chip quita solo ese filtro; siempre visibles (aun contraído) */}
      {(chips.length > 0 || multifechaActiva) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 bg-[#f7faf9] px-4 py-2">
          <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wide text-[#116762]">Filtros activos</span>
          {multifechaActiva && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#0e7490]/35 bg-[#f0f9fb] py-[3px] pl-2.5 pr-1 text-[11.5px] font-medium text-[#0e5a6f] shadow-sm">
              Multifecha: {vigenciasMf} vigencia{vigenciasMf === 1 ? '' : 's'}{periodos.length > vigenciasMf ? ` · ${periodos.length} periodos` : ''}
              <button type="button" onClick={() => alternarMultifecha(false)} aria-label="Quitar análisis multifecha" className="rounded-full p-0.5 hover:bg-[#116762]/15"><X size={12} /></button>
            </span>
          )}
          {chips.map((c) => (
            <span key={c.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#116762]/30 bg-white py-[3px] pl-2.5 pr-1 text-[11.5px] font-medium text-[#0b4a46] shadow-sm">
              <span className="truncate" title={c.texto}>{c.texto}</span>
              <button type="button" onClick={c.quitar} aria-label={`Quitar ${c.texto}`} className="rounded-full p-0.5 hover:bg-[#116762]/15"><X size={12} /></button>
            </span>
          ))}
          <button type="button" onClick={clearFilters} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-[12px] font-semibold text-[#10233f] shadow-sm hover:bg-slate-50">
            <RotateCcw size={13} /> Limpiar filtros
          </button>
        </div>
      )}


      {expandido && (
        <div id="panel-filtros" role="tabpanel" className="border-t border-slate-100 p-3 sm:p-4">
          <div className={`overflow-visible rounded-xl border ${cat.panel.borde}`}>
            {/* Encabezado del panel, con el color de la categoría */}
            {categoria !== 'multifecha' && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b px-3 py-2.5 ${cat.panel.banda} ${cat.panel.borde}`}>
              <EncabezadoSeccion tono={cat.panel.tile} icono={cat.icono(18)} titulo={cat.titulo} descripcion={cat.descripcion} />
              {categoria === 'fecha' && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Accesos rápidos de fecha">
                  <span className="mr-0.5 inline-flex items-center gap-1.5 rounded-lg border border-[#cfe8e1] bg-white px-2.5 py-1 text-[11.5px] font-bold text-[#10233f]">
                    <CalendarRange size={14} className="text-[#116762]" />
                    {textoPeriodo}
                  </span>
                  {RAPIDOS.map((r) => (
                    <button key={r.id} type="button" disabled={!corte || multifechaActiva} onClick={() => aplicarRapido(r.desde)} aria-pressed={rapidoActivo === r.id} title={corte ? `Hasta la fecha de corte de los datos (${corte.toLocaleDateString('es-CO')}). Llena Fecha inicial y Fecha final, y quita Año y Mes.` : undefined} className={botonRapido(rapidoActivo === r.id)}>
                      {r.texto}
                    </button>
                  ))}
                  <button type="button" disabled={multifechaActiva} onClick={() => fechaInicialRef.current?.focus()} aria-pressed={personalizadoActivo} title="Elija usted mismo la fecha inicial y la final" className={botonRapido(personalizadoActivo)}>
                    Personalizado
                  </button>
                </div>
              )}
            </div>

            )}
            {/* Campos de la categoría */}
            {categoria === 'fecha' && (
              <div className="space-y-3 rounded-b-xl bg-white p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className={multifechaActiva ? 'pointer-events-none opacity-50' : undefined} title={multifechaActiva ? 'En multifecha, el año lo definen las vigencias' : undefined}>
                    <MultiSelect institucional icono={<CalendarDays size={18} />} tonoIcono={cat.panel.campo} tonoIconoActivo={cat.panel.campoActivo} label="Año" options={anios} selected={filters.anio} onChange={(v) => actualizar('anio', v)} />
                  </div>
                  <div className={multifechaActiva ? 'pointer-events-none opacity-50' : undefined} title={multifechaActiva ? 'En multifecha, el mes lo definen las vigencias' : undefined}>
                    <MultiSelect institucional icono={<CalendarDays size={18} />} tonoIcono={cat.panel.campo} tonoIconoActivo={cat.panel.campoActivo} label="Mes" options={meses} selected={filters.mes} onChange={(v) => actualizar('mes', v)} labels={etiquetasMeses} />
                  </div>
                  <CampoFecha id="filtro-fecha-inicial" etiqueta="Fecha inicial" tono={cat.panel.campo} multifecha={multifechaActiva} activa={!!filters.fechaInicial}>
                    <input id="filtro-fecha-inicial" ref={fechaInicialRef} type="date" min={minFecha} max={maxFecha} value={filters.fechaInicial ?? ''} disabled={multifechaActiva} onChange={(e) => setFilters((prev) => ({ ...prev, fechaInicial: e.target.value || null }))} className={claseFecha(!!filters.fechaInicial)} />
                  </CampoFecha>
                  <CampoFecha id="filtro-fecha-final" etiqueta="Fecha final" tono={cat.panel.campo} multifecha={multifechaActiva} activa={!!filters.fechaFinal}>
                    <input id="filtro-fecha-final" type="date" min={minFecha} max={maxFecha} value={filters.fechaFinal ?? ''} disabled={multifechaActiva} onChange={(e) => setFilters((prev) => ({ ...prev, fechaFinal: e.target.value || null }))} className={claseFecha(!!filters.fechaFinal)} />
                  </CampoFecha>
                  {campo('franjaHoraria', <Clock size={18} />, 'fecha')}
                  {campo('turno', <Hourglass size={18} />, 'fecha')}
                  {campo('diaSemana', <CalendarCheck size={18} />, 'fecha')}
                  {campo('diaMes', <CalendarDays size={18} />, 'fecha')}
                </div>
                {multifechaActiva && (
                  <p className="flex flex-wrap items-center gap-2 rounded-lg bg-[#eef8fb] px-3 py-2 text-[12px] text-[#0e5a6f]">
                    <CalendarRange size={14} /> El análisis multifecha está activo: las fechas, el año y el mes los definen las vigencias.
                    <button type="button" onClick={() => setCategoria('multifecha')} className="font-bold underline underline-offset-2 hover:text-[#0e7490]">Ver vigencias</button>
                  </p>
                )}
              </div>
            )}
            {categoria === 'multifecha' && (
              <div className="rounded-b-xl bg-white p-3">
                <SelectorVigencias />
              </div>
            )}
            {categoria === 'ubicacion' && (
              <div className="grid grid-cols-1 gap-3 rounded-b-xl bg-white p-3 sm:grid-cols-2 xl:grid-cols-4">
                {campo('estacion', <Building2 size={18} />, 'ubicacion')}
                {campo('cuadrante', <MapIcon size={18} />, 'ubicacion')}
                {campo('cai', <ShieldCheck size={18} />, 'ubicacion')}
                {campo('barrioHecho', <House size={18} />, 'ubicacion')}
              </div>
            )}
            {categoria === 'delito' && (
              <div className="grid grid-cols-1 gap-3 rounded-b-xl bg-white p-3 md:grid-cols-2">
                {campo('delito', <FileText size={18} />, 'delito')}
                {categoriasOperatividad.length > 0 ? (
                  <MultiSelect institucional icono={<ShieldCheck size={18} />} tonoIcono={cat.panel.campo} tonoIconoActivo={cat.panel.campoActivo} label="Categoría de operatividad" options={categoriasOperatividad} selected={categoriaOperatividadSel} onChange={(v) => setFilters((prev) => ({ ...prev, categoriaOperatividad: v }))} />
                ) : (
                  <p className="self-end pb-2 text-[11.5px] text-slate-400">Categoría de operatividad: no hay datos de operatividad cargados.</p>
                )}
              </div>
            )}
            {categoria === 'mas' && (
              <div className="grid grid-cols-1 gap-3 rounded-b-xl bg-white p-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
                {campo('zona', <MapPin size={18} />, 'mas')}
                {campo('genero', <Users size={18} />, 'mas')}
                {campo('armas', <Crosshair size={18} />, 'mas')}
                {campo('modalidad', <Target size={18} />, 'mas')}
                {campo('claseSitio', <Store size={18} />, 'mas')}
                {campo('causaLesion', <Activity size={18} />, 'mas')}
                {campo('grupoEdad', <UsersRound size={18} />, 'mas')}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

type Categoria = 'fecha' | 'multifecha' | 'ubicacion' | 'delito' | 'mas';
const ORDEN_CATS: Categoria[] = ['fecha', 'ubicacion', 'delito', 'mas', 'multifecha'];
// «Más filtros»: todos los adicionales MENOS el CAI (ya está en Ubicación geográfica).
const CAMPOS_MAS: CampoFiltro[] = ['zona', 'genero', 'armas', 'modalidad', 'claseSitio', 'causaLesion', 'grupoEdad'];

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
