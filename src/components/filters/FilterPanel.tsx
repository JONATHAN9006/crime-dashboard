import { useMemo, useState } from 'react';
import { Filter, X, ChevronDown, ChevronUp, SlidersHorizontal, Building2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { CrimeRecord, FilterState } from '../../types/crime';
import { aplicarFiltros, contarFiltrosActivos } from '../../utils/filters';
import { uniqueSorted } from '../../utils/aggregations';
import { MultiSelect } from './MultiSelect';
import { ModalMicrogerencia } from '../microgerencia/ModalMicrogerencia';
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
  const { records, filters, setFilters, clearFilters, filteredRecords, meta } = useData();
  const [expandido, setExpandido] = useState(true);
  const [mostrarMicrogerencia, setMostrarMicrogerencia] = useState(false);
  const modoAcceso = obtenerModoAcceso();
  const accesoMicrogerencia = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].microgerencia;
  const [mostrarAdicionales, setMostrarAdicionales] = useState(false);

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

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex w-full items-center justify-between px-4 py-3">
        <button onClick={() => setExpandido((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <Filter size={16} className="text-brand-navy" />
          <span className="text-sm font-semibold text-slate-800">Filtros</span>
          {activos > 0 && (
            <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-xs font-semibold text-brand-green">{activos} activos</span>
          )}
          <span className="text-xs text-slate-400">· {filteredRecords.length.toLocaleString('es-CO')} de {records.length.toLocaleString('es-CO')} registros</span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { if (accesoMicrogerencia) setMostrarMicrogerencia(true); }}
            disabled={!accesoMicrogerencia}
            title={accesoMicrogerencia ? undefined : 'Próximamente — en desarrollo.'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${accesoMicrogerencia ? 'border-brand-navy/20 text-brand-navy hover:bg-brand-navy/5' : 'cursor-not-allowed border-slate-200 text-slate-300'}`}
          >
            <Building2 size={13} />
            Microgerencia
            {!accesoMicrogerencia && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-400">Próx.</span>}
          </button>
          <button type="button" onClick={() => setExpandido((v) => !v)}>
            {expandido ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
          </button>
        </div>
      </div>

      {mostrarMicrogerencia && <ModalMicrogerencia onCerrar={() => setMostrarMicrogerencia(false)} />}

      {expandido && (
        <div className="border-t border-slate-100 p-4">
          {/* Orden solicitado: Año → Mes → Fecha inicial → Fecha final → Estación → Delito → Cuadrante → Barrio */}
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <MultiSelect label="Año" options={anios} selected={filters.anio} onChange={(v) => actualizar('anio', v)} />
            <MultiSelect
              label="Mes"
              options={meses}
              selected={filters.mes}
              onChange={(v) => actualizar('mes', v)}
              labels={etiquetasMeses}
            />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Fecha inicial</label>
              <input
                type="date"
                min={minFecha}
                max={maxFecha}
                value={filters.fechaInicial ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, fechaInicial: e.target.value || null }))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Fecha final</label>
              <input
                type="date"
                min={minFecha}
                max={maxFecha}
                value={filters.fechaFinal ?? ''}
                onChange={(e) => setFilters((prev) => ({ ...prev, fechaFinal: e.target.value || null }))}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            {CAMPOS_PRINCIPALES.map((c) => (
              <MultiSelect
                key={c.key}
                label={c.label}
                options={opcionesPara(c.key, c.getter)}
                selected={filters[c.key] as string[]}
                onChange={(v) => actualizar(c.key, v)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              onClick={() => setMostrarAdicionales((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-navy hover:underline"
            >
              <SlidersHorizontal size={13} />
              {mostrarAdicionales ? 'Ocultar filtros adicionales' : 'Ver filtros adicionales (zona, CAI, arma, modalidad, género...)'}
            </button>
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <X size={13} /> Limpiar filtros
            </button>
          </div>

          {mostrarAdicionales && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4 lg:grid-cols-8">
              {CAMPOS_ADICIONALES.map((c) => (
                <MultiSelect
                  key={c.key}
                  label={c.label}
                  options={opcionesPara(c.key, c.getter)}
                  selected={filters[c.key] as string[]}
                  onChange={(v) => actualizar(c.key, v)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
