import { CalendarRange, Info } from 'lucide-react';
import { SelectorVigencias, periodosIniciales } from '../multifecha/SelectorVigencias';
import { useData } from '../../context/DataContext';

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

export function SelectorMultifecha() {
  const { periodos, setPeriodos, meta, setFilters } = useData();
  const activo = periodos.length > 0;

  function activar(checked: boolean) {
    setPeriodos(checked ? periodosIniciales(meta?.aniosDisponibles ?? []) : []);
    // Con vigencias, el tiempo lo definen sus rangos: Año y Mes se limpian.
    if (checked) setFilters((prev) => (prev.anio.length || prev.mes.length ? { ...prev, anio: [], mes: [] } : prev));
  }

  return (
    <div>
      <label className="flex cursor-pointer flex-wrap items-center gap-2 text-[13px] font-medium text-[#10233f]">
        <input type="checkbox" checked={activo} onChange={(e) => activar(e.target.checked)} className="h-4 w-4 accent-[#116762]" />
        <CalendarRange size={15} className="text-[#116762]" />
        ¿Desea incluir otras fechas para el análisis?
        <span className="rounded-full border border-slate-300 px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Análisis multifecha</span>
        <span title="Compara vigencias (años) con su propio rango de fechas — p. ej. el mismo evento cada año. Mientras esté activo, reemplaza la Fecha inicial/final, el Año y el Mes." className="text-slate-400">
          <Info size={14} aria-label="Qué es el análisis multifecha" />
        </span>
      </label>

      {activo && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-slate-500">
            Marque las vigencias a comparar. Cada una usa su propio rango de fechas (lápiz para cambiarlo); las variaciones comparan la primera contra la última vigencia.
          </p>
          <SelectorVigencias />
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
