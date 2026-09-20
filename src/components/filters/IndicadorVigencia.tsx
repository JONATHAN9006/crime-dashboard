import type { VentanaComparativa } from '../../hooks/useComparativoHomologo';

const fmt = (d: Date) => d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Indicador visible de la "fecha de corte" y el periodo comparado — a
 * pedido explícito: el usuario necesita saber, en cualquier momento, hasta
 * qué fecha se está analizando y qué rango exacto se está comparando entre
 * los dos años. Se calcula SIEMPRE a partir de la ventana ya existente
 * (useVentanaComparativa) — nunca una fecha fija; si cambia el filtro de
 * año o se carga información más reciente, este texto cambia solo.
 */
export function IndicadorVigencia({ ventana }: { ventana: VentanaComparativa }) {
  if (!ventana.disponible) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span>
        <span className="font-semibold text-slate-700">Fecha de corte {ventana.anioActual}:</span> {fmt(ventana.actualFin)}
      </span>
      <span className="hidden text-slate-300 sm:inline">|</span>
      <span>
        <span className="font-semibold text-slate-700">Periodo comparado:</span> {fmt(ventana.anteriorInicio)} – {fmt(ventana.anteriorFin)} ({ventana.anioAnterior}) vs. {fmt(ventana.actualInicio)} – {fmt(ventana.actualFin)} ({ventana.anioActual})
      </span>
    </div>
  );
}
