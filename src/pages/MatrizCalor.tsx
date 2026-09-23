import { useMemo, useState } from 'react';
import { Flame, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useHeatmap, type VistaHeatmap } from '../hooks/useHeatmap';
import type { CeldaHeatmap } from '../hooks/useHeatmap';
import { Card, PageHeader } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { Heatmap } from '../components/charts/Heatmap';
import { formatNumero } from '../utils/aggregations';
import { maxDe } from '../utils/mathSeguro';

export function MatrizCalor() {
  const { filteredRecords, filters, setFilters, meta } = useData();
  const [vista, setVista] = useState<VistaHeatmap>('hora');

  // Sin ningún filtro de año/mes/fecha activo, por defecto se analiza SOLO
  // la vigencia más reciente — no los 23 años de histórico mezclados. Con
  // cualquiera de esos filtros puesto, se respeta tal cual (el usuario ya
  // decidió qué periodo quiere ver). El año de referencia es el mismo que
  // usa el resto del dashboard para "vigencia actual" (FECHA_MAX_PARAMETRO
  // si el archivo lo trae, o si no, el dato más reciente disponible).
  const hayFiltroTemporal = filters.anio.length > 0 || filters.mes.length > 0 || !!filters.fechaInicial || !!filters.fechaFinal;
  const recordsParaMatriz = useMemo(() => {
    if (hayFiltroTemporal) return filteredRecords;
    const conFecha = filteredRecords.filter((r) => r.fecha);
    if (conFecha.length === 0) return filteredRecords;
    const maxTs = meta?.fechaMaxParametro
      ? meta.fechaMaxParametro.getTime()
      : maxDe(conFecha.map((r) => r.fecha!.getTime()));
    const anioReferencia = new Date(maxTs).getFullYear();
    return conFecha.filter((r) => r.fecha!.getFullYear() === anioReferencia);
  }, [filteredRecords, hayFiltroTemporal, meta?.fechaMaxParametro]);

  const data = useHeatmap(recordsParaMatriz, vista);

  const filtroActivoPorClic = filters.diaSemana.length > 0 || filters.horaExacta.length > 0 || filters.franjaHoraria.length > 0;

  function manejarClicCelda(celda: CeldaHeatmap) {
    if (celda.valor === 0) return;
    setFilters((prev) => ({
      ...prev,
      diaSemana: [celda.dia],
      horaExacta: vista === 'hora' ? [celda.columna] : [],
      franjaHoraria: vista === 'franja' ? [celda.columna] : [],
    }));
  }

  function quitarFiltroCelda() {
    setFilters((prev) => ({ ...prev, diaSemana: [], horaExacta: [], franjaHoraria: [] }));
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Matriz de Calor" subtitle="Día de la semana × horario. Identifica de forma dinámica los momentos críticos según los casos filtrados." />

      {!hayFiltroTemporal && recordsParaMatriz.length > 0 && recordsParaMatriz[0].fecha && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sin un año, mes o fecha seleccionados, se muestra solo la vigencia {recordsParaMatriz[0].fecha!.getFullYear()} (la más reciente) — no todo el histórico. Selecciona un año en el filtro principal para ver otra vigencia, o varios años para compararlos.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(['hora', 'franja'] as VistaHeatmap[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${vista === v ? 'bg-brand-navy text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {v === 'hora' ? 'Por hora' : 'Por franja horaria'}
            </button>
          ))}
        </div>
        {filtroActivoPorClic && (
          <button onClick={quitarFiltroCelda} className="flex items-center gap-1.5 rounded-lg border border-brand-navy/30 bg-brand-navy/5 px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/10">
            <X size={13} /> Quitar filtro de día/hora aplicado desde la matriz
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Total de casos considerados" valor={formatNumero(data.totalGeneral)} icono={<Flame size={16} />} />
        <KpiCard
          titulo="Día con mayor concentración"
          valor={data.diaMax?.label ?? '—'}
          subtitulo={data.diaMax ? `${formatNumero(data.diaMax.casos)} casos` : undefined}
        />
        <KpiCard
          titulo={vista === 'hora' ? 'Hora con mayor concentración' : 'Franja con mayor concentración'}
          valor={data.columnaMax ? (vista === 'hora' ? `${data.columnaMax.label}:00` : data.columnaMax.label) : '—'}
          subtitulo={data.columnaMax ? `${formatNumero(data.columnaMax.casos)} casos` : undefined}
        />
        <KpiCard
          titulo="Celda con mayor concentración"
          valor={data.celdaMax ? `${data.celdaMax.diaLabel} ${vista === 'hora' ? data.celdaMax.columnaLabel + ':00' : data.celdaMax.columnaLabel}` : '—'}
          subtitulo={data.celdaMax ? `${formatNumero(data.celdaMax.valor)} casos` : undefined}
          acento="red"
        />
      </div>

      <Card title="Matriz de calor por día y hora" descargable="matriz-calor">
        <Heatmap data={data} onCellClick={manejarClicCelda} />
      </Card>

      <Card title="Momentos críticos" subtitle="Los periodos con mayor concentración de casos dentro del conjunto filtrado, calculados automáticamente" descargable="momentos-criticos">
        {data.momentosCriticos.length === 0 ? (
          <p className="text-sm text-slate-400">No hay suficientes datos para identificar momentos críticos.</p>
        ) : (
          <ol className="space-y-2">
            {data.momentosCriticos.map((c, i) => (
              <li key={`${c.dia}-${c.columna}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[11px] font-bold text-white">{i + 1}</span>
                  <span className="font-medium text-slate-800">{c.diaLabel}</span>
                  <span className="text-slate-500">{vista === 'hora' ? `${c.columnaLabel}:00` : c.columnaLabel}</span>
                </span>
                <span className="font-semibold text-slate-900">{formatNumero(c.valor)} casos <span className="font-normal text-slate-400">({c.porcentaje.toFixed(1)}%)</span></span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
