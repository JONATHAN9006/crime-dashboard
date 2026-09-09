import { useState } from 'react';
import type { CeldaHeatmap, HeatmapResumen } from '../../hooks/useHeatmap';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

const COLOR_NIVEL: Record<CeldaHeatmap['nivel'], string> = {
  'sin datos': '#eef2f0',
  baja: '#bfe6cc',
  media: '#f5d949',
  alta: '#f2a340',
  'crítica': '#d92b2b',
};

const TEXTO_NIVEL: Record<CeldaHeatmap['nivel'], string> = {
  'sin datos': 'Sin casos registrados',
  baja: 'Incidencia baja',
  media: 'Incidencia media',
  alta: 'Incidencia alta',
  'crítica': 'Incidencia crítica',
};

export function Heatmap({ data, onCellClick }: { data: HeatmapResumen; onCellClick?: (celda: CeldaHeatmap) => void }) {
  const [celdaHover, setCeldaHover] = useState<CeldaHeatmap | null>(null);

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        Cada celda representa la cantidad de casos ocurridos en un <strong>día de la semana</strong> (filas) durante {data.vista === 'hora' ? 'una hora específica' : 'una franja horaria'} (columnas). La escala de color se recalcula automáticamente según los datos filtrados: no usa valores fijos.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="w-24"></th>
              {data.columnasLabel.map((label, c) => (
                <th key={c} className="min-w-[64px] pb-1 text-center text-[10px] font-semibold text-slate-500">
                  {label}
                </th>
              ))}
              <th className="pb-1 pl-2 text-center text-[10px] font-bold uppercase text-slate-600">Total día</th>
            </tr>
          </thead>
          <tbody>
            {data.diasLabel.map((diaLabel, d) => (
              <tr key={diaLabel}>
                <td className="pr-2 text-center text-xs font-semibold text-slate-700 whitespace-nowrap">{diaLabel}</td>
                {data.columnasLabel.map((_, c) => {
                  const celda = data.celdas[d * data.columnasLabel.length + c];
                  return (
                    <td key={c} className="text-center align-middle">
                      <button
                        type="button"
                        onMouseEnter={() => setCeldaHover(celda)}
                        onMouseLeave={() => setCeldaHover((prev) => (prev === celda ? null : prev))}
                        onClick={() => onCellClick?.(celda)}
                        className={`mx-auto flex items-center justify-center rounded-sm font-bold text-slate-800/80 transition-transform hover:z-10 hover:scale-125 hover:relative hover:shadow-md ${data.vista === 'hora' ? 'h-7 w-7 text-sm' : 'h-10 w-full min-w-16 text-base'} ${onCellClick ? 'cursor-pointer' : 'cursor-default'}`}
                        style={{ backgroundColor: COLOR_NIVEL[celda.nivel] }}
                      >
                        {celda.valor > 0 ? formatNumero(celda.valor) : ''}
                      </button>
                    </td>
                  );
                })}
                <td className="pl-2 text-center text-xs font-bold text-slate-700">{formatNumero(data.totalesFila[d])}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-1 text-center text-[10px] font-bold uppercase text-slate-600">Total {data.vista === 'hora' ? 'hora' : 'franja'}</td>
              {data.totalesColumna.map((t, c) => (
                <td key={c} className="pt-1 text-center text-[10px] font-bold text-slate-700">{formatNumero(t)}</td>
              ))}
              <td className="pt-1 text-center text-xs font-bold text-brand-navy">{formatNumero(data.totalGeneral)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tooltip explícito (además de title nativo) con el detalle solicitado */}
      <div className="mt-3 min-h-[52px] rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-600">
        {celdaHover ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-slate-800">{celdaHover.diaLabel}</span>
            <span>{data.vista === 'hora' ? `${celdaHover.columnaLabel}:00` : celdaHover.columnaLabel}</span>
            <span className="font-semibold text-slate-900">{formatNumero(celdaHover.valor)} caso(s)</span>
            <span>{formatDecimal(celdaHover.porcentaje)}% del total</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: COLOR_NIVEL[celdaHover.nivel] }}>
              {TEXTO_NIVEL[celdaHover.nivel]}
            </span>
            {onCellClick && <span className="text-slate-400">— clic para filtrar el dashboard por este día{data.vista === 'franja' ? ' y franja' : ' y hora'}</span>}
          </div>
        ) : (
          <span className="text-slate-400">Pasa el cursor sobre una celda para ver el detalle (día, hora, casos, % del total y nivel de incidencia).</span>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold text-slate-700">Cómo interpretar los colores (escala calculada sobre los datos actuales):</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
          {(['sin datos', 'baja', 'media', 'alta', 'crítica'] as const).map((nivel) => (
            <span key={nivel} className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: COLOR_NIVEL[nivel] }} />
              {TEXTO_NIVEL[nivel]}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          <strong className="text-rose-600">¿Qué significan los cuadros en rojo ("incidencia crítica")?</strong> Son las combinaciones de día y {data.vista === 'hora' ? 'hora' : 'franja horaria'} que están en el 5% superior de concentración de casos dentro del periodo filtrado — es decir, los momentos donde estadísticamente se acumula más actividad delictiva. Son la referencia para priorizar turnos, patrullaje o recursos operativos. El nivel se recalcula automáticamente cada vez que cambian los filtros o se carga nueva información: no depende de un número fijo.
        </p>
      </div>
    </div>
  );
}
