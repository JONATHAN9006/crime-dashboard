import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Layers, Percent, Calendar, Info, GitCompare } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useKpis } from '../hooks/useKpis';
import { useVentanaComparativa, useComparativoGeneral } from '../hooks/useComparativoHomologo';
import { useTendenciaDiaSemana, useDistribucionHoraria, useTendenciaDiaria } from '../hooks/useTemporalAnalysis';
import { useAnalisisMensual } from '../hooks/useAnalisisMensual';
import { identificarMesMasAfectado, generarPrioridad, compararMesMasAfectadoEntreAnios } from '../utils/analisisTendencia';
import { Card, PageHeader } from '../components/ui/Card';
import { ComponenteBloqueado } from '../components/ui/ComponenteBloqueado';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { DASHBOARD_ACCESS } from '../config/dashboardAccess';
import { KpiCard } from '../components/ui/KpiCard';
import { ComportamientoDelDelito } from '../components/analitica/ComportamientoDelDelito';
import { TendenciaDiariaChart } from '../components/charts/TendenciaDiariaChart';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { formatDecimal, formatFecha, formatNumero, formatPct, totalCasos } from '../utils/aggregations';

export function Indicadores() {
  // Modo raíz (null): sin restricción, igual que siempre. Solo /jefe puede
  // llegar a bloquear estos dos componentes puntuales (ver dashboardAccess.ts).
  const modoAcceso = obtenerModoAcceso();
  const accesoTendenciaMensual = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].tendenciaMensual;
  const accesoTendenciaDiaria = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].tendenciaDiaria;
  const { records, filteredRecords, recordsBase, filters, meta } = useData();
  const kpis = useKpis(filteredRecords);
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const cmp = useComparativoGeneral(ventana);

  const diaSemana = useTendenciaDiaSemana(filteredRecords);
  const horaria = useDistribucionHoraria(filteredRecords);
  // Solo el año más reciente (ventana.anioActual — 2026 actualmente), sin
  // mezclar con años anteriores, tal como se pidió específicamente para esta gráfica.
  // Memoizado explícitamente: sin esto, .filter() crea un arreglo NUEVO en
  // cada render de Indicadores, y como TendenciaDiariaChart usa este arreglo
  // como dependencia de un efecto que actualiza estado del padre, eso
  // generaba un bucle infinito de renderizado (el error real detrás de "me
  // saca de la aplicación" al entrar a Tendencia Diaria).
  // Incluye TAMBIÉN el año anterior (no solo el actual) — necesario para
  // poder comparar, día a día, el mismo periodo contra el año pasado dentro
  // del propio gráfico de Tendencia Diaria (ver TendenciaDiariaChart).
  const registrosParaDiaria = useMemo(
    () => filteredRecords.filter((r) => r.anio === ventana.anioActual || r.anio === ventana.anioAnterior),
    [filteredRecords, ventana.anioActual, ventana.anioAnterior],
  );
  const diaria = useTendenciaDiaria(registrosParaDiaria);
  const [vistaDiaria, setVistaDiaria] = useState(false);
  const [topHoras, setTopHoras] = useState<number | undefined>(undefined); // undefined = todas, en orden cronológico

  // Total General = año COMPLETO (01/01–31/12) de la vigencia anterior — se
  // usa en el KPI "Total General" de esta página (independiente de
  // ComportamientoDelDelito, que calcula el suyo propio internamente para
  // la proyección).
  const totalGeneral = useMemo(
    () => totalCasos(recordsBase.filter((r) => r.anio === ventana.anioAnterior)),
    [recordsBase, ventana.anioAnterior],
  );

  // --- Análisis automático de Tendencia Diaria ----------------------------
  // Se alimenta del reporte que la propia gráfica emite cada vez que cambia
  // la selección de meses (ver TendenciaDiariaChart) — así el análisis
  // siempre corresponde exactamente a lo que el usuario tiene seleccionado.
  const [resumenDiario, setResumenDiario] = useState<{ mesesTexto: string; porMes: { mesNombre: string; anio: number; casos: number }[]; porMesAnioAnterior: { mesNombre: string; anio: number; casos: number }[]; mostrarAnioAnterior: boolean } | null>(null);
  const mesMasAfectado = useMemo(
    () => (resumenDiario ? identificarMesMasAfectado(resumenDiario.porMes) : null),
    [resumenDiario],
  );
  // Recurrencia frente a la vigencia anterior: solo se afirma si de verdad
  // hay datos del mismo mes calendario en el año anterior — nunca se
  // inventa. Se calcula sobre TODOS los registros (records, no
  // filteredRecords) para no perder el año anterior si el filtro de año
  // está activo sobre el actual.
  const casosMesMasAfectadoAnioAnterior = useMemo(() => {
    if (!mesMasAfectado || !resumenDiario || resumenDiario.porMes.length === 0) return null;
    const mesEntry = resumenDiario.porMes.find((m) => m.mesNombre === mesMasAfectado.mes);
    if (!mesEntry) return null;
    const mesIndexBuscado = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].indexOf(mesMasAfectado.mes) + 1;
    const casos = filteredRecords.filter((r) => r.anio === ventana.anioAnterior && r.mes === mesIndexBuscado).length;
    return casos;
  }, [mesMasAfectado, resumenDiario, filteredRecords, ventana.anioAnterior]);
  const prioridadTexto = mesMasAfectado ? generarPrioridad(mesMasAfectado, casosMesMasAfectadoAnioAnterior) : null;
  // Correlación/diferencia entre el mes más afectado de este periodo y el
  // del mismo tramo en el año anterior — solo se calcula y se muestra
  // mientras el usuario tenga activo el checkbox de comparación con el año
  // anterior en Tendencia Diaria; si lo desactiva, esta información
  // desaparece también (los datos siguen intactos, solo deja de mostrarse).
  const textoCorrelacionMeses = useMemo(() => {
    if (!mesMasAfectado || !resumenDiario?.mostrarAnioAnterior) return null;
    return compararMesMasAfectadoEntreAnios(mesMasAfectado, resumenDiario.porMesAnioAnterior);
  }, [mesMasAfectado, resumenDiario]);

  const horariaFiltrada = useMemo(() => {
    if (!topHoras) return horaria;
    return [...horaria].sort((a, b) => b.casos - a.casos).slice(0, topHoras);
  }, [horaria, topHoras]);

  const desfavorable = cmp.variacionPct !== null && cmp.variacionPct > 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Indicadores" subtitle="Casos discriminados por año, comparativo general y tendencias temporales, con corte homólogo a la misma fecha." />

      {ventana.disponible && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <Info size={14} className="mt-0.5 shrink-0 text-brand-navy" />
          <p>
            {ventana.esRangoPersonalizado
              ? <>Comparando el rango <strong>{formatFecha(ventana.actualInicio)} – {formatFecha(ventana.actualFin)}</strong> ({ventana.anioActual}) contra el mismo rango un año atrás: <strong>{formatFecha(ventana.anteriorInicio)} – {formatFecha(ventana.anteriorFin)}</strong> ({ventana.anioAnterior}).</>
              : <>Por defecto se compara el año {ventana.anioActual} del 1 de enero al {formatFecha(ventana.actualFin)} ("a la fecha") contra el mismo tramo de {ventana.anioAnterior}, para que la comparación sea justa entre periodos equivalentes. "Total General" corresponde al año {ventana.anioAnterior} completo (cierre 31 de diciembre), respetando el delito/estación seleccionados.</>}
          </p>
        </div>
      )}

      {/* Orden solicitado: Total General → Casos año anterior → Casos año actual,
          y el comparativo (diferencia/variación/tendencia) alineado en la misma fila. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          titulo="Total general"
          valor={formatNumero(totalGeneral)}
          subtitulo={`Vigencia ${ventana.anioAnterior} completa (01/01–31/12)`}
          icono={<Layers size={16} />}
          acento="green"
        />
        <KpiCard
          titulo={`Casos año anterior (${ventana.anioAnterior})`}
          valor={formatNumero(cmp.casosAnterior)}
          subtitulo={`${formatNumero(cmp.registrosAnterior)} registros · a la fecha`}
          icono={<Calendar size={16} />}
          acento="gray"
        />
        <KpiCard
          titulo={`Casos año actual (${ventana.anioActual})`}
          valor={formatNumero(cmp.casosActual)}
          subtitulo={`${formatNumero(cmp.registrosActual)} registros · a la fecha`}
          icono={<Calendar size={16} />}
          acento="navy"
        />
        <KpiCard
          titulo="Diferencia absoluta"
          valor={`${cmp.variacionAbs >= 0 ? '+' : ''}${formatNumero(cmp.variacionAbs)}`}
          icono={<GitCompare size={16} />}
          acento={desfavorable ? 'red' : 'green'}
          colorValor={desfavorable ? 'red' : 'green'}
        />
        <KpiCard
          titulo="Variación %"
          valor={formatPct(cmp.variacionPct)}
          icono={desfavorable ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          acento={desfavorable ? 'red' : 'green'}
          colorValor={desfavorable ? 'red' : 'green'}
        />
        <KpiCard
          titulo="Tendencia"
          valor={desfavorable ? 'Desfavorable' : 'Favorable'}
          subtitulo={desfavorable ? 'Aumento de casos' : 'Disminución de casos'}
          icono={desfavorable ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          acento={desfavorable ? 'red' : 'green'}
          colorValor={desfavorable ? 'red' : 'green'}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Participación del delito principal" valor={`${formatDecimal(kpis.participacionDelitoTop)}%`} subtitulo={kpis.delitoTop?.key ?? '—'} icono={<Percent size={16} />} />
        <KpiCard titulo="Promedio diario" valor={formatDecimal(kpis.promedioDiario)} subtitulo="casos / día" icono={<Percent size={16} />} />
        <KpiCard titulo="Máximo diario" valor={formatNumero(kpis.maxDiario)} subtitulo="en un solo día" icono={<TrendingUp size={16} />} />
        <KpiCard titulo="Mínimo diario" valor={formatNumero(kpis.minDiario)} subtitulo="en un solo día" icono={<TrendingDown size={16} />} />
      </div>

      {accesoTendenciaMensual ? (
        <ComportamientoDelDelito descargable="tendencia-mensual" titulo="Tendencia mensual" subtitulo="Comparación de casos por mes entre los años disponibles" />
      ) : (
        <ComponenteBloqueado titulo="Tendencia mensual" subtitulo="Comparación de casos por mes entre los años disponibles" />
      )}

      {accesoTendenciaDiaria ? (
        <Card
          title={`Tendencia diaria${resumenDiario?.mesesTexto ? ` — ${resumenDiario.mesesTexto}` : ''}`}
          subtitle="Comportamiento día a día en el periodo filtrado. Pasa el cursor sobre la línea para ver el detalle exacto de cada día."
          descargable="tendencia-diaria"
          actions={
            <button onClick={() => setVistaDiaria((v) => { if (v) setResumenDiario(null); return !v; })} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {vistaDiaria ? 'Ver resumen' : 'Ver serie completa'}
            </button>
          }
        >
          {vistaDiaria ? (
            <>
              {/* Análisis automático de los meses actualmente seleccionados
                  arriba de la gráfica, en formato compacto — se recalcula con
                  cada cambio de delito, meses, unidad, estación o cualquier
                  otro filtro que afecte los datos. */}
              {textoCorrelacionMeses && (
                <div className="mb-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-700">
                  {textoCorrelacionMeses}
                </div>
              )}
              {mesMasAfectado && (
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-rose-600">🔴 Mes más afectado: {mesMasAfectado.mes.toUpperCase()} — {formatNumero(mesMasAfectado.casos)} casos</span>
                  {prioridadTexto && <span className="font-semibold text-brand-green">🎯 Prioridad próxima vigencia: {mesMasAfectado.mes.toUpperCase()}</span>}
                </div>
              )}
              <TendenciaDiariaChart data={diaria} height={320} onResumenChange={setResumenDiario} />
              {prioridadTexto && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-700">Análisis: {prioridadTexto}</p>}
            </>
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Haz clic en "Ver serie completa" para visualizar el comportamiento diario detallado ({diaria.length} días con datos). Para consultar cada caso individual, usa la sección "Tabla de Datos".</p>
          )}
        </Card>
      ) : (
        <ComponenteBloqueado titulo="Tendencia diaria" subtitulo="Comportamiento día a día en el periodo filtrado" />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Casos por día de la semana" subtitle="Con línea de tendencia — los 3 días con más casos se resaltan automáticamente" descargable="casos-dia-semana">
          <GroupedBarChart data={diaSemana} xKey="dia" seriesKeys={['casos']} height={280} resaltarMaximo resaltarTopN={3} colorPorBarra anchoMaximoBarra={55} tamanoEtiqueta={14} />
        </Card>
        <Card
          title="Distribución por hora del hecho"
          subtitle={topHoras ? `Top ${topHoras} horas con más casos` : 'Las 24 horas, en orden cronológico, con línea de tendencia — las 3 horas con más casos se resaltan automáticamente'}
          descargable="distribucion-hora"
          actions={
            <div className="flex gap-1">
              {[{ label: 'Top 5', v: 5 }, { label: 'Top 10', v: 10 }, { label: 'Todas', v: undefined }].map((o) => (
                <button
                  key={o.label}
                  onClick={() => setTopHoras(o.v)}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${topHoras === o.v ? 'bg-brand-green text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          }
        >
          <GroupedBarChart data={horariaFiltrada} xKey="hora" seriesKeys={['casos']} height={280} resaltarMaximo resaltarTopN={3} colorPorBarra />
        </Card>
      </div>
    </div>
  );
}
