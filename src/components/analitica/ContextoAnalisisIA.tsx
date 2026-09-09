import type { ContextoAgenteIA } from '../../types/agenteIA';
import { formatNumero } from '../../utils/aggregations';

/**
 * Panel de "contexto actual" del Analista IA — puramente presentacional:
 * muestra exactamente lo que ya trae "contexto" (construido en
 * useAgenteIA.ts a partir de los hooks existentes), sin calcular nada.
 */
export function ContextoAnalisisIA({ contexto }: { contexto: ContextoAgenteIA }) {
  const { metadatos, periodoActual, periodoComparativo, indicadores, filtros } = contexto;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Contexto actual</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <p className="text-slate-400">Delito</p>
          <p className="truncate font-semibold text-slate-700" title={metadatos.delitoUnicoSeleccionado ?? undefined}>
            {metadatos.delitoUnicoSeleccionado ?? (metadatos.cantidadDelitosSeleccionados > 0 ? `${metadatos.cantidadDelitosSeleccionados} seleccionados` : 'Todos')}
          </p>
        </div>
        <div>
          <p className="text-slate-400">Vigencia</p>
          <p className="font-semibold text-slate-700">{periodoActual.vigencia} <span className="font-normal text-slate-400">({periodoActual.inicio}–{periodoActual.fin})</span></p>
        </div>
        <div>
          <p className="text-slate-400">Comparación</p>
          <p className="font-semibold text-slate-700">{periodoComparativo.vigencia} <span className="font-normal text-slate-400">({periodoComparativo.inicio}–{periodoComparativo.fin})</span></p>
        </div>
        <div>
          <p className="text-slate-400">Casos {periodoActual.vigencia} (a la fecha)</p>
          <p className="font-semibold text-slate-700">{formatNumero(indicadores.totalCasosActual)}</p>
        </div>
      </div>
      {(filtros.estacion.length > 0 || filtros.cuadrante.length > 0 || filtros.barrioHecho.length > 0 || filtros.cai.length > 0 || filtros.cantidadFiltrosAdicionalesActivos > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-200 pt-2">
          {filtros.estacion.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">Estación: {filtros.estacion.join(', ')}</span>}
          {filtros.cuadrante.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">Zona de Atención: {filtros.cuadrante.join(', ')}</span>}
          {filtros.barrioHecho.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">Barrio: {filtros.barrioHecho.join(', ')}</span>}
          {filtros.cai.length > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">CAI: {filtros.cai.join(', ')}</span>}
          {filtros.cantidadFiltrosAdicionalesActivos > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm">+{filtros.cantidadFiltrosAdicionalesActivos} filtro(s) más</span>}
        </div>
      )}
    </div>
  );
}
