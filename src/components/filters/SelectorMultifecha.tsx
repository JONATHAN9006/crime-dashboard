import { Calendar, Plus, X, AlertTriangle } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { PeriodoAnalisis } from '../../types/crime';

const MAX_PERIODOS = 6;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// "2026-08-15" -> Date en hora LOCAL (mismo criterio que parsearFechaLocal
// en utils/filters.ts) — evita el desfase de zona horaria de "new
// Date('YYYY-MM-DD')", que interpreta la fecha en UTC y puede mostrar el
// día de la semana equivocado.
function diaSemanaDe(fechaIso: string): string | null {
  if (!fechaIso) return null;
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  if (!anio || !mes || !dia) return null;
  return DIAS_SEMANA[new Date(anio, mes - 1, dia).getDay()];
}

function nuevoPeriodo(): PeriodoAnalisis {
  return {
    id: `periodo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fechaInicial: '',
    fechaFinal: '',
    horaInicial: '00:00',
    horaFinal: '23:59',
  };
}

export function SelectorMultifecha() {
  const { periodos, setPeriodos, meta } = useData();
  const activo = periodos.length > 0;
  const minFecha = meta?.fechaMin ? meta.fechaMin.toISOString().slice(0, 10) : undefined;
  const maxFecha = meta?.fechaMax ? meta.fechaMax.toISOString().slice(0, 10) : undefined;

  function activar(checked: boolean) {
    setPeriodos(checked ? [nuevoPeriodo(), nuevoPeriodo(), nuevoPeriodo()] : []);
  }

  function agregarPeriodo() {
    setPeriodos((prev) => (prev.length >= MAX_PERIODOS ? prev : [...prev, nuevoPeriodo()]));
  }

  function quitarPeriodo(id: string) {
    setPeriodos((prev) => {
      const siguiente = prev.filter((p) => p.id !== id);
      return siguiente; // si queda en 0, "activo" pasa a false solo — coherente con el switch
    });
  }

  function actualizarPeriodo(id: string, cambios: Partial<PeriodoAnalisis>) {
    setPeriodos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  return (
    <div className="border-t border-slate-100 pt-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={activo} onChange={(e) => activar(e.target.checked)} />
        <Calendar size={15} className="text-brand-navy" />
        ¿Desea incluir otras fechas para el análisis? (análisis multifecha)
      </label>

      {activo && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-slate-500">
            Cada periodo es una ventana independiente (su propia fecha y su propio horario). El resultado es la unión de los {periodos.length} periodos — un mismo caso nunca se cuenta dos veces, aunque calce con más de uno.
          </p>

          {periodos.map((p, i) => {
            const diaIni = diaSemanaDe(p.fechaInicial);
            const diaFin = diaSemanaDe(p.fechaFinal);
            const fechasIncompletas = !p.fechaInicial || !p.fechaFinal;
            const rangoInvertido = !fechasIncompletas && p.fechaInicial > p.fechaFinal;
            return (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-brand-navy">
                    Periodo {i + 1}{diaIni ? ` — ${diaIni}${diaFin && diaFin !== diaIni ? ` a ${diaFin}` : ''}` : ''}
                  </span>
                  <button type="button" onClick={() => quitarPeriodo(p.id)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-500" title="Quitar este periodo">
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">Fecha inicial</label>
                    <input type="date" min={minFecha} max={maxFecha} value={p.fechaInicial} onChange={(e) => actualizarPeriodo(p.id, { fechaInicial: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">Fecha final</label>
                    <input type="date" min={minFecha} max={maxFecha} value={p.fechaFinal} onChange={(e) => actualizarPeriodo(p.id, { fechaFinal: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">Hora inicial</label>
                    <input type="time" value={p.horaInicial} onChange={(e) => actualizarPeriodo(p.id, { horaInicial: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500">Hora final</label>
                    <input type="time" value={p.horaFinal} onChange={(e) => actualizarPeriodo(p.id, { horaFinal: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                </div>
                {fechasIncompletas && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600"><AlertTriangle size={12} /> Falta fecha inicial o final — este periodo no se aplica hasta completarlas.</p>
                )}
                {rangoInvertido && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600"><AlertTriangle size={12} /> La fecha final es anterior a la inicial.</p>
                )}
              </div>
            );
          })}

          {periodos.length < MAX_PERIODOS ? (
            <button type="button" onClick={agregarPeriodo} className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand-navy/40 px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-navy/5">
              <Plus size={13} /> Agregar periodo ({periodos.length}/{MAX_PERIODOS})
            </button>
          ) : (
            <p className="text-[11px] text-slate-400">Máximo de {MAX_PERIODOS} periodos alcanzado.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Resumen compacto de los periodos activos, para mostrar en cualquier
// página que use filteredRecords (Comparativo, Análisis por Unidad, etc.)
// — así el analista siempre tiene a la vista exactamente qué se está
// evaluando, sin tener que volver al panel de filtros.
export function IndicadorMultifecha() {
  const { periodos } = useData();
  if (periodos.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-brand-navy/20 bg-brand-navy/5 px-3 py-2 text-xs text-brand-navy">
      <p className="mb-1 font-bold">Análisis multifecha activo</p>
      <ul className="space-y-0.5">
        {periodos.map((p, i) => {
          const dia = diaSemanaDe(p.fechaInicial);
          return (
            <li key={p.id}>
              {i + 1}. {dia ? `${dia} — ` : ''}{p.fechaInicial || '(sin fecha)'}{p.fechaFinal && p.fechaFinal !== p.fechaInicial ? ` a ${p.fechaFinal}` : ''} — {p.horaInicial} a {p.horaFinal}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
