import { CalendarDays, CalendarRange, Database, Filter, ShieldAlert, Clock3 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ContextoAgenteIA } from '../../types/agenteIA';
import { formatNumero } from '../../utils/aggregations';
import { etiquetaDelito } from '../../services/analisisEstructurado';

/**
 * Panel de «Contexto de análisis» del Analista IA — puramente
 * presentacional: muestra lo que ya trae «contexto» (useAgenteIA.ts). Se
 * actualiza solo cuando cambian los filtros del dashboard.
 */
function Fila({ icono, etiqueta, children }: { icono: ReactNode; etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[18px_88px_minmax(0,1fr)] items-start gap-2 border-b border-slate-100 py-1.5 last:border-0">
      <span className="mt-[1px] text-slate-400">{icono}</span>
      <span className="text-[12px] text-slate-500">{etiqueta}</span>
      <span className="min-w-0 text-[12.5px] font-semibold text-[#10233f]">{children}</span>
    </div>
  );
}

export function ContextoAnalisisIA({ contexto }: { contexto: ContextoAgenteIA }) {
  const { periodoActual, periodoComparativo, indicadores, filtros } = contexto;
  const chips = [
    ...filtros.estacion.map((v) => `Estación: ${v}`),
    ...filtros.cuadrante.map((v) => `Zona: ${v}`),
    ...filtros.barrioHecho.map((v) => `Barrio: ${v}`),
    ...filtros.cai.map((v) => v),
    ...(filtros.cantidadFiltrosAdicionalesActivos > 0 ? [`+${filtros.cantidadFiltrosAdicionalesActivos} filtro(s) más`] : []),
  ];
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="mb-1 text-[11.5px] font-extrabold uppercase tracking-wide text-[#10233f]">Contexto de análisis</p>
      <Fila icono={<ShieldAlert size={14} />} etiqueta="Delito"><span className="block truncate" title={etiquetaDelito(contexto)}>{etiquetaDelito(contexto)}</span></Fila>
      <Fila icono={<CalendarDays size={14} />} etiqueta="Vigencia">{periodoActual.vigencia} <span className="block text-[11px] font-normal text-slate-500">{periodoActual.inicio} – {periodoActual.fin}</span></Fila>
      <Fila icono={<CalendarRange size={14} />} etiqueta="Comparación">{periodoComparativo.vigencia} <span className="block text-[11px] font-normal text-slate-500">{periodoComparativo.inicio} – {periodoComparativo.fin}</span></Fila>
      <Fila icono={<Clock3 size={14} />} etiqueta="Corte">{contexto.corteInformacion}</Fila>
      <Fila icono={<Database size={14} />} etiqueta="Registros">{formatNumero(indicadores.totalCasosActual)} casos</Fila>
      {chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Filter size={12} className="text-slate-400" />
          {chips.map((c) => <span key={c} className="max-w-full truncate rounded-full bg-[#e3f2ef] px-2 py-0.5 text-[10.5px] font-medium text-[#0f5f57]">{c}</span>)}
        </div>
      )}
    </div>
  );
}
