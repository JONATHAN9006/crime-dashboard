import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useRanking, useUrbanoRural } from '../hooks/useTerritorialAnalysis';
import { useDistribucionHoraria, useTendenciaDiaSemana, useTendenciaDiaria } from '../hooks/useTemporalAnalysis';
import { useVentanaComparativa, useComparativoCategoria, useComparativoGeneral, useProyeccion } from '../hooks/useComparativoHomologo';
import { useKpis } from '../hooks/useKpis';
import { identificarMesMasAfectado, generarPrioridad, compararMesMasAfectadoEntreAnios } from '../utils/analisisTendencia';
import { agruparPor, totalCasos, formatPct } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { ComponenteBloqueado } from '../components/ui/ComponenteBloqueado';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { DASHBOARD_ACCESS } from '../config/dashboardAccess';
import { BotonGenerarPdf } from '../components/ui/BotonGenerarPdf';
import { ProveedorRegistroPdf } from '../context/RegistroPdfContext';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { AporteBarList } from '../components/charts/AporteBarList';
import { DonutChart } from '../components/charts/DonutChart';
import { ComparativoBarrasConAporte } from '../components/charts/ComparativoBarrasConAporte';
import { ComparativoCategoriaTable } from '../components/tables/ComparativoCategoriaTable';
import { ComportamientoDelDelito } from '../components/analitica/ComportamientoDelDelito';
import { TendenciaDiariaChart } from '../components/charts/TendenciaDiariaChart';
import { formatDecimal, formatFecha, formatNumero } from '../utils/aggregations';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

const OPCIONES_TOP = [
  { label: 'Top 5', valor: 5 },
  { label: 'Top 10', valor: 10 },
  { label: 'Todos', valor: undefined },
];

const OPCIONES_TOP_5_10 = [
  { label: 'Top 5', valor: 5 },
  { label: 'Top 10', valor: 10 },
];

function SelectorTop({ valor, onChange, opciones = OPCIONES_TOP_5_10 }: { valor: number | undefined; onChange: (v: number | undefined) => void; opciones?: { label: string; valor: number | undefined }[] }) {
  return (
    <div className="flex gap-1">
      {opciones.map((o) => (
        <button
          key={o.label}
          onClick={() => onChange(o.valor)}
          className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${valor === o.valor ? 'bg-brand-green text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function AnalisisUnidad() {
  const { records, filteredRecords, recordsBase, filters, meta, drillDown } = useData();
  const modoAcceso = obtenerModoAcceso();
  const accesoTendenciaMensual = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].tendenciaMensual;
  const accesoTendenciaDiaria = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].tendenciaDiaria;
  const [topDelitos, setTopDelitos] = useState<number | undefined>(10);
  const [topCuadrante, setTopCuadrante] = useState(10);
  const [topBarrio, setTopBarrio] = useState(10);
  const [topArma, setTopArma] = useState(10);
  const [topModalidad, setTopModalidad] = useState(10);
  const [topClaseSitio, setTopClaseSitio] = useState(10);
  const [topCausaLesion, setTopCausaLesion] = useState(10);

  // ── Migrado de la antigua página "Indicadores" (fusionada aquí) ──────
  const kpis = useKpis(filteredRecords);
  const diaSemana = useTendenciaDiaSemana(filteredRecords);

  // Comparativo homólogo (año anterior "a la fecha" vs. año actual) para TODOS
  // los componentes de esta página, incluida la estación — así se evita que
  // una misma unidad muestre cifras distintas en secciones distintas del
  // dashboard (un solo cálculo, una sola fuente de verdad).
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const cmpGeneral = useComparativoGeneral(ventana);

  // Incluye TAMBIÉN el año anterior (no solo el actual) — necesario para
  // poder comparar, día a día, el mismo periodo contra el año pasado dentro
  // del propio gráfico de Tendencia Diaria.
  const registrosParaDiaria = useMemo(
    () => filteredRecords.filter((r) => r.anio === ventana.anioActual || r.anio === ventana.anioAnterior),
    [filteredRecords, ventana.anioActual, ventana.anioAnterior],
  );
  const diaria = useTendenciaDiaria(registrosParaDiaria);
  const [vistaDiaria, setVistaDiaria] = useState(false);

  // Total General = año COMPLETO (01/01–31/12) de la vigencia anterior.
  const totalGeneralIndicadores = useMemo(
    () => totalCasos(recordsBase.filter((r) => r.anio === ventana.anioAnterior)),
    [recordsBase, ventana.anioAnterior],
  );

  const [resumenDiario, setResumenDiario] = useState<{ mesesTexto: string; porMes: { mesNombre: string; anio: number; casos: number }[]; porMesAnioAnterior: { mesNombre: string; anio: number; casos: number }[]; mostrarAnioAnterior: boolean } | null>(null);
  const mesMasAfectado = useMemo(
    () => (resumenDiario ? identificarMesMasAfectado(resumenDiario.porMes) : null),
    [resumenDiario],
  );
  const casosMesMasAfectadoAnioAnterior = useMemo(() => {
    if (!mesMasAfectado || !resumenDiario || resumenDiario.porMes.length === 0) return null;
    const mesEntry = resumenDiario.porMes.find((m) => m.mesNombre === mesMasAfectado.mes);
    if (!mesEntry) return null;
    const mesIndexBuscado = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].indexOf(mesMasAfectado.mes) + 1;
    return filteredRecords.filter((r) => r.anio === ventana.anioAnterior && r.mes === mesIndexBuscado).length;
  }, [mesMasAfectado, resumenDiario, filteredRecords, ventana.anioAnterior]);
  const prioridadTexto = mesMasAfectado ? generarPrioridad(mesMasAfectado, casosMesMasAfectadoAnioAnterior) : null;
  const textoCorrelacionMeses = useMemo(() => {
    if (!mesMasAfectado || !resumenDiario?.mostrarAnioAnterior) return null;
    return compararMesMasAfectadoEntreAnios(mesMasAfectado, resumenDiario.porMesAnioAnterior);
  }, [mesMasAfectado, resumenDiario]);
  const desfavorableGeneral = cmpGeneral.variacionPct !== null && cmpGeneral.variacionPct > 0;

  const urbanoRural = useUrbanoRural(ventana.recsActual);
  const porGenero = useRanking(ventana.recsActual, (r) => r.genero, 10);
  const porGrupoEdad = useRanking(ventana.recsActual, (r) => r.grupoEdad, 10);
  const porHora = useDistribucionHoraria(filteredRecords);
  const [topHorasUnidad, setTopHorasUnidad] = useState<number | undefined>(undefined);
  const porHoraFiltrada = useMemo(() => {
    if (!topHorasUnidad) return porHora;
    return [...porHora].sort((a, b) => b.casos - a.casos).slice(0, topHorasUnidad);
  }, [porHora, topHorasUnidad]);

  const cmpEstacion = useComparativoCategoria(ventana, (r) => r.estacion, 10);
  const cmpCuadrante = useComparativoCategoria(ventana, (r) => r.cuadrante, 10);
  const cmpBarrio = useComparativoCategoria(ventana, (r) => r.barrioHecho, 10);
  const cmpArma = useComparativoCategoria(ventana, (r) => r.armas, 10);
  const cmpModalidad = useComparativoCategoria(ventana, (r) => r.modalidad, 10);
  const cmpClaseSitio = useComparativoCategoria(ventana, (r) => r.claseSitio, 10);
  const cmpCausaLesion = useComparativoCategoria(ventana, (r) => r.causaLesion, 10);
  // Comparativo por delito, filtrado a EXACTAMENTE los delitos que estén
  // seleccionados en el filtro principal — se acomoda solo, sin necesidad de
  // ningún control adicional en esta tarjeta.
  const cmpDelitoCompleto = useComparativoCategoria(ventana, (r) => r.delito, 200);
  const cmpDelitoSeleccionado = filters.delito.length > 0
    ? cmpDelitoCompleto.filter((f) => filters.delito.includes(f.key))
    : [];
  const proyeccion = useProyeccion(ventana);
  // Base para la meta de reducción: el total COMPLETO de la vigencia anterior
  // (2025, año cerrado 01/01–31/12), tal como se pidió — no el corte "a la
  // fecha" que usa el resto de la comparación homóloga.
  const totalAnioAnteriorCompleto = useMemo(
    () => totalCasos(recordsBase.filter((r) => r.anio === ventana.anioAnterior)),
    [recordsBase, ventana.anioAnterior],
  );
  const metaReduccion5 = totalAnioAnteriorCompleto * 0.95;
  const cumpleMeta = proyeccion.disponible && proyeccion.proyeccionFinAnio <= metaReduccion5;

  // Cuota mensual restante: de los casos que "todavía caben" dentro de la
  // meta del 5% (lo que falta de la meta menos lo que ya ocurrió este año),
  // repartido entre los meses que faltan del año — para saber, mes a mes,
  // cuántos casos como máximo deberían presentarse (de este delito, si hay
  // uno filtrado, o en general) para seguir en camino de cumplir la meta.
  // Si el filtro de Delito está activo, esto ya corresponde a ESE delito
  // específicamente, porque toda la cadena (recordsBase, ventana,
  // proyección) ya respeta los filtros activos del dashboard.
  const mesesRestantes = Math.max(1, 12 - (ventana.actualFin.getMonth() + 1));
  const casosPermitidosRestantes = metaReduccion5 - proyeccion.casosActual;
  const cuotaMensualRestante = casosPermitidosRestantes / mesesRestantes;

  // "Proyección vs. 2025": a propósito compara la PROYECCIÓN de cierre
  // contra el TOTAL REAL COMPLETO de 2025 (no contra el corte homólogo "a
  // la fecha", que es una pregunta distinta) — es la comparación real que
  // se pidió: "si termino el año a este ritmo, ¿cómo quedo frente a todo
  // 2025?". Se protege división por cero cuando 2025 no tiene casos.
  const diferenciaVs2025Completo = proyeccion.disponible ? proyeccion.proyeccionFinAnio - totalAnioAnteriorCompleto : 0;
  const pctVs2025Completo = totalAnioAnteriorCompleto > 0 ? (diferenciaVs2025Completo / totalAnioAnteriorCompleto) * 100 : null;

  // Proyección vs. meta — diferencia exacta (redondeada solo para mostrar;
  // la comparación de "cumpleMeta" ya usa los valores sin redondear).
  const diferenciaVsMeta = proyeccion.disponible ? Math.round(proyeccion.proyeccionFinAnio - metaReduccion5) : 0;
  const coincideConMeta = diferenciaVsMeta === 0;

  // Interpretación dinámica: una sola oración que une los cuatro conceptos
  // (ritmo real, proyección, comparación contra 2025 y meta), generada
  // exclusivamente a partir de los números ya calculados arriba — nunca un
  // texto fijo ni una conclusión inventada.
  const textoInterpretacion = proyeccion.disponible
    ? `Con el ritmo actual de ${formatDecimal(proyeccion.casosPorDia, 2)} casos/día, se proyecta un cierre de aproximadamente ${formatNumero(proyeccion.proyeccionFinAnio)} casos para ${ventana.anioActual}. Frente al cierre real de ${ventana.anioAnterior} (${formatNumero(totalAnioAnteriorCompleto)} casos), esto representa ${pctVs2025Completo === null ? 'una variación no calculable (2025 sin casos registrados)' : `una variación de ${pctVs2025Completo >= 0 ? '+' : ''}${formatDecimal(pctVs2025Completo, 1)}%`}. La meta de reducción del 5% establece un máximo de ${formatNumero(metaReduccion5)} casos para ${ventana.anioActual}.`
    : '';

  // Top delitos: EXCLUSIVAMENTE la vigencia actual (ventana.recsActual), sin
  // mezclar con el año anterior — reutiliza el mismo motor de ventana
  // homóloga que ya respeta Año/Mes/Fecha/Estación/Delito seleccionados.
  // El aporte % se calcula sobre el TOTAL COMPLETO de delitos de la
  // vigencia (antes de recortar al Top N elegido), para que el porcentaje
  // sea real y no quede inflado sobre un subconjunto — misma fórmula única
  // usada en todo el dashboard: casos de la categoría / total del conjunto
  // analizado × 100. Nunca produce NaN/Infinity: si el total es 0, el
  // aporte es 0.
  const porDelitoVigenciaActualCompleto = ventana.disponible
    ? agruparPor(ventana.recsActual, (r) => r.delito).filter((d) => d.key !== 'NO REPORTADO')
    : [];
  const totalDelitosVigenciaActual = porDelitoVigenciaActualCompleto.reduce((a, d) => a + d.casos, 0);
  const porDelitoVigenciaActual = porDelitoVigenciaActualCompleto.slice(0, topDelitos).map((d) => ({
    ...d,
    aportePct: totalDelitosVigenciaActual > 0 ? (d.casos / totalDelitosVigenciaActual) * 100 : 0,
  }));

  return (
    <ProveedorRegistroPdf>
      <div className="space-y-5">
        <PageHeader
          title="Análisis por Unidad"
          subtitle="Lectura integral: estaciones, cuadrantes, barrios, zonas, población, arma, modalidad, sitio, causa de lesión y horario."
          acciones={<BotonGenerarPdf nombreArchivo="MEPOY_Analisis_Unidad" />}
        />

      {ventana.disponible && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <Info size={14} className="mt-0.5 shrink-0 text-brand-navy" />
          <p>
            {ventana.esRangoPersonalizado
              ? <>Comparando el rango <strong>{formatFecha(ventana.actualInicio)} – {formatFecha(ventana.actualFin)}</strong> ({ventana.anioActual}) contra el mismo rango un año atrás: <strong>{formatFecha(ventana.anteriorInicio)} – {formatFecha(ventana.anteriorFin)}</strong> ({ventana.anioAnterior}).</>
              : <>Por defecto se compara el año {ventana.anioActual} del 1 de enero al {formatFecha(ventana.actualFin)} ("a la fecha") contra el mismo tramo de {ventana.anioAnterior}. "Total General" corresponde al año {ventana.anioAnterior} completo (cierre 31 de diciembre), respetando el delito/estación seleccionados.</>}
          </p>
        </div>
      )}

      {/* Resumen general — en TABLA (no tarjetas individuales), y COMPACTA
          (max-w + mx-auto, no todo el ancho de la página) para que se lea
          de un vistazo sin verse estirada. */}
      <Card title="Resumen general" subtitle="Comparativo homólogo a la fecha, mismos filtros del resto de la página" descargable="resumen-general-unidad" className="mx-auto max-w-xl">
        <table className="w-full text-sm">
          <tbody>
            {[
              { etiqueta: 'Total general', valor: formatNumero(totalGeneralIndicadores), nota: `Vigencia ${ventana.anioAnterior} completa` },
              { etiqueta: `Casos año anterior (${ventana.anioAnterior})`, valor: formatNumero(cmpGeneral.casosAnterior), nota: `${formatNumero(cmpGeneral.registrosAnterior)} reg.` },
              { etiqueta: `Casos año actual (${ventana.anioActual})`, valor: formatNumero(cmpGeneral.casosActual), nota: `${formatNumero(cmpGeneral.registrosActual)} reg.` },
              { etiqueta: 'Diferencia absoluta', valor: `${cmpGeneral.variacionAbs >= 0 ? '+' : ''}${formatNumero(cmpGeneral.variacionAbs)}`, color: desfavorableGeneral ? 'text-rose-600' : 'text-emerald-600' },
              { etiqueta: 'Variación %', valor: formatPct(cmpGeneral.variacionPct), color: desfavorableGeneral ? 'text-rose-600' : 'text-emerald-600' },
              { etiqueta: 'Tendencia', valor: desfavorableGeneral ? 'Desfavorable' : 'Favorable', color: desfavorableGeneral ? 'text-rose-600' : 'text-emerald-600' },
              { etiqueta: 'Participación del delito principal', valor: `${formatDecimal(kpis.participacionDelitoTop)}%`, nota: kpis.delitoTop?.key ?? '—' },
              { etiqueta: 'Promedio diario', valor: formatDecimal(kpis.promedioDiario), nota: 'casos/día' },
              { etiqueta: 'Máximo diario', valor: formatNumero(kpis.maxDiario), nota: '1 día' },
              { etiqueta: 'Mínimo diario', valor: formatNumero(kpis.minDiario), nota: '1 día' },
            ].map((fila, i) => (
              <tr key={fila.etiqueta} className={i % 2 === 0 ? 'bg-slate-50/60' : ''}>
                <td className="rounded-l-lg py-1.5 pl-3 text-xs font-medium text-slate-600">{fila.etiqueta}</td>
                <td className={`py-1.5 text-right text-sm font-bold ${fila.color ?? 'text-slate-800'}`}>{fila.valor}</td>
                <td className="rounded-r-lg py-1.5 pl-2 pr-3 text-right text-[11px] text-slate-400">{fila.nota ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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

      {ventana.disponible && (
        <>
          {/* items-start: cada tarjeta usa solo el alto que necesita su propio
              contenido, en vez de estirarse para igualar a la más alta del grupo
              (eso era lo que dejaba espacio en blanco de sobra en la más corta).
              Columnas con ancho explícito (no 1fr 1fr 1fr parejo): "Casos por
              estación" necesita más espacio para sus 6 columnas (Estación,
              2025, 2026, DIF, %, Aporte %) sin verse comprimida; "Proyección
              de delitos" le cede ese espacio ya que su contenido es más
              vertical/compacto; "Top por cantidad" cierra la fila. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.55fr_0.95fr_1.15fr]">
            <Card title="Casos por estación" subtitle={`Casos ${ventana.anioAnterior} vs. ${ventana.anioActual}, a la fecha`} descargable="casos-por-estacion">
              <ComparativoCategoriaTable data={cmpEstacion} etiqueta="Estación" anioActual={ventana.anioActual} anioAnterior={ventana.anioAnterior} onRowClick={(key) => drillDown('estacion', key)} limite={10} />
            </Card>
            <Card title="Proyección de delitos" subtitle="Fin de año, según ritmo actual" descargable="proyeccion-delitos">
              {proyeccion.disponible ? (
                <div className="space-y-3">
                  {/* 1) DATOS REALES — casos a la fecha */}
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Casos a la fecha</p>
                    <p className="text-xl font-bold text-slate-800">{formatNumero(proyeccion.casosActual)} casos</p>
                  </div>

                  {/* 2) Días transcurridos y ritmo — la base real del cálculo */}
                  <div className="border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                    <p>{proyeccion.diasTranscurridos} días transcurridos (01/01/{ventana.anioActual} – {formatFecha(ventana.actualFin)})</p>
                    <p>Ritmo actual: {formatDecimal(proyeccion.casosPorDia, 2)} casos/día</p>
                  </div>

                  {/* 3) PROYECCIÓN — estimación matemática, nunca un dato observado */}
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand-green">Proyección al cierre de {ventana.anioActual}</p>
                    <p className="text-2xl font-bold text-brand-green">{formatNumero(proyeccion.proyeccionFinAnio)} casos</p>
                    <p className="text-[11px] text-slate-500">Si se mantiene el ritmo actual, se proyectan aproximadamente {formatNumero(proyeccion.proyeccionFinAnio)} casos al cierre de {ventana.anioActual}.</p>
                  </div>

                  {/* 4) REFERENCIA — proyección vs. TOTAL REAL de 2025 completo (no el corte homólogo) */}
                  <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3">
                    {diferenciaVs2025Completo > 0 ? <TrendingUp size={14} className="text-rose-600" /> : <TrendingDown size={14} className="text-emerald-600" />}
                    <p className={`text-sm font-semibold ${diferenciaVs2025Completo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {diferenciaVs2025Completo >= 0 ? '+' : ''}{formatNumero(diferenciaVs2025Completo)} casos vs. {ventana.anioAnterior}
                      <span className="ml-1 font-normal text-slate-400">
                        ({pctVs2025Completo === null ? 'N/A' : `${pctVs2025Completo >= 0 ? '+' : ''}${formatDecimal(pctVs2025Completo, 1)}%`})
                      </span>
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-400">Proyección = (casos ÷ días transcurridos) × {proyeccion.diasEnAnio} días. Comparado contra el total REAL de {ventana.anioAnterior} completo ({formatNumero(totalAnioAnteriorCompleto)} casos) — no contra el mismo corte de fecha.</p>

                  {/* 5) y 6) META — 95% del total real de 2025, y comparación proyección vs. meta */}
                  <div className={`rounded-lg border p-2.5 ${cumpleMeta ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Meta de reducción del 5% (base: {ventana.anioAnterior} completo)</p>
                    <p className="text-[11px] text-slate-500">{formatNumero(totalAnioAnteriorCompleto)} casos en {ventana.anioAnterior} × 0,95</p>
                    <p className={`text-lg font-bold ${cumpleMeta ? 'text-emerald-700' : 'text-rose-700'}`}>Meta de reducción del 5%: {formatNumero(metaReduccion5)} casos</p>
                    <p className={`text-xs font-medium ${cumpleMeta ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {coincideConMeta
                        ? 'La proyección coincide con la meta establecida.'
                        : cumpleMeta
                          ? `✓ La proyección se encuentra ${formatNumero(Math.abs(diferenciaVsMeta))} casos por debajo de la meta.`
                          : `⚠ La proyección actual supera la meta en ${formatNumero(diferenciaVsMeta)} casos.`}
                    </p>
                    <p className="mt-1.5 border-t border-slate-200/60 pt-1.5 text-xs text-slate-600">
                      {casosPermitidosRestantes >= 0
                        ? `Para cumplir la meta: máximo ≈ ${formatNumero(Math.max(0, Math.round(cuotaMensualRestante)))} casos/mes en lo que resta de ${ventana.anioActual} (${mesesRestantes} ${mesesRestantes === 1 ? 'mes restante' : 'meses restantes'}).`
                        : `Ya se superó el total permitido por la meta (${formatNumero(Math.abs(casosPermitidosRestantes))} casos de más) antes de terminar el año — cumplirla exactamente ya no es posible; cada caso adicional aumenta la brecha.`}
                    </p>
                  </div>

                  {/* 7) Interpretación dinámica — une los cuatro conceptos en una sola frase, generada de los mismos números de arriba */}
                  <p className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600">{textoInterpretacion}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Sin datos suficientes para proyectar.</p>
              )}
            </Card>
            <Card
              title="Análisis de delitos — Top por cantidad"
              descargable="top-delitos"
              subtitle={`Exclusivamente vigencia ${ventana.anioActual}`}
              actions={<SelectorTop valor={topDelitos} onChange={setTopDelitos} opciones={OPCIONES_TOP} />}
            >
              <AporteBarList data={porDelitoVigenciaActual} onBarClick={(key) => drillDown('delito', key)} />
            </Card>
          </div>

          {/* Todo lo siguiente reorganizado en filas de máximo 3 (items-start:
              cada tarjeta usa solo el alto que necesita su propio contenido).
              10 componentes en total: 3+3+3+1 — el último ("Concentración
              horaria") queda solo en su propia fila, ya que no sobra ningún
              otro componente con el que emparejarlo tras reubicar "Análisis
              de delitos" arriba. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Card title={`Top ${topCuadrante} cuadrantes más afectados`} subtitle={`Vigencia ${ventana.anioActual}, a la fecha`} actions={<SelectorTop valor={topCuadrante} onChange={(v) => setTopCuadrante(v!)} />} descargable="top-cuadrantes">
              <ComparativoBarrasConAporte data={cmpCuadrante} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} onBarClick={(key) => drillDown('cuadrante', key)} limite={topCuadrante} />
            </Card>
            <Card title={`Top ${topBarrio} barrios más afectados`} subtitle={`Vigencia ${ventana.anioActual}, a la fecha`} actions={<SelectorTop valor={topBarrio} onChange={(v) => setTopBarrio(v!)} />} descargable="top-barrios">
              <ComparativoBarrasConAporte data={cmpBarrio} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} onBarClick={(key) => drillDown('barrioHecho', key)} limite={topBarrio} />
            </Card>
            <Card title="Armas empleadas" subtitle={`Top ${topArma}, vigencia ${ventana.anioActual}`} actions={<SelectorTop valor={topArma} onChange={(v) => setTopArma(v!)} />} descargable="armas-empleadas">
              <ComparativoBarrasConAporte data={cmpArma} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} onBarClick={(key) => drillDown('armas', key)} limite={topArma} />
            </Card>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Card title="Modalidades principales" subtitle={`Top ${topModalidad}, vigencia ${ventana.anioActual}`} actions={<SelectorTop valor={topModalidad} onChange={(v) => setTopModalidad(v!)} />} descargable="modalidades">
              <ComparativoBarrasConAporte data={cmpModalidad} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} onBarClick={(key) => drillDown('modalidad', key)} limite={topModalidad} />
            </Card>
            <Card title="Clase de sitio" subtitle={`Top ${topClaseSitio}, vigencia ${ventana.anioActual}`} actions={<SelectorTop valor={topClaseSitio} onChange={(v) => setTopClaseSitio(v!)} />} descargable="clase-sitio">
              <ComparativoBarrasConAporte data={cmpClaseSitio} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} onBarClick={(key) => drillDown('claseSitio', key)} limite={topClaseSitio} />
            </Card>
            <Card title="Causa de lesión" subtitle={`Top ${topCausaLesion}, vigencia ${ventana.anioActual}`} actions={<SelectorTop valor={topCausaLesion} onChange={(v) => setTopCausaLesion(v!)} />} descargable="causa-lesion">
              <ComparativoBarrasConAporte data={cmpCausaLesion} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} onBarClick={(key) => drillDown('causaLesion', key)} limite={topCausaLesion} />
            </Card>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <Card title="Zonas con mayor concentración" descargable="zonas-concentracion">
              <DonutChart data={urbanoRural} height={280} mostrarCasos />
            </Card>
            <Card title="Distribución por género" descargable="distribucion-genero">
              <DonutChart data={porGenero.map((g) => ({ key: g.key, casos: g.casos }))} height={280} mostrarCasos />
            </Card>
            <Card title="Distribución por grupo de edad" descargable="distribucion-edad">
              <DonutChart data={porGrupoEdad.map((g) => ({ key: g.key, casos: g.casos }))} height={280} mostrarCasos />
            </Card>
          </div>

          {/* Sola en su fila (nada quedó para acompañarla) — se usa una
              cuadrícula de 2 en vez de 3 para que ocupe la mitad del ancho
              en vez de un tercio, así el gráfico de 24 horas no se ve
              apretado. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <Card title="Casos por día de la semana" subtitle="Con línea de tendencia — los 3 días con más casos se resaltan automáticamente" descargable="casos-dia-semana">
              <GroupedBarChart data={diaSemana} xKey="dia" seriesKeys={['casos']} height={260} resaltarMaximo resaltarTopN={3} colorPorBarra anchoMaximoBarra={55} tamanoEtiqueta={14} espaciadoCategoria={0.15} />
            </Card>
            <Card
              title="Concentración horaria"
              subtitle={topHorasUnidad ? `Top ${topHorasUnidad} horas con más casos` : 'Cantidad de casos por hora del día, con línea de tendencia — las 3 horas con más casos se resaltan automáticamente'}
              actions={
                <div className="flex gap-1">
                  {[{ label: 'Top 5', v: 5 }, { label: 'Top 10', v: 10 }, { label: 'Todas', v: undefined }].map((o) => (
                    <button
                      key={o.label}
                      onClick={() => setTopHorasUnidad(o.v)}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${topHorasUnidad === o.v ? 'bg-brand-green text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              }
              descargable="concentracion-horaria"
            >
              <GroupedBarChart data={porHoraFiltrada} xKey="hora" seriesKeys={['casos']} height={260} resaltarMaximo resaltarTopN={3} colorPorBarra />
            </Card>
          </div>
        </>
      )}
      </div>
    </ProveedorRegistroPdf>
  );
}
