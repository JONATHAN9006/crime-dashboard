import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useRanking, useUrbanoRural } from '../hooks/useTerritorialAnalysis';
import { useDistribucionHoraria, useTendenciaDiaSemana, useTendenciaDiaria } from '../hooks/useTemporalAnalysis';
import { useVentanaComparativa, useComparativoCategoria, useComparativoGeneral, useProyeccion } from '../hooks/useComparativoHomologo';
import { useKpis } from '../hooks/useKpis';
import { agruparPor, totalCasos, formatPct } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { ComponenteBloqueado } from '../components/ui/ComponenteBloqueado';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { DASHBOARD_ACCESS } from '../config/dashboardAccess';
import { BotonGenerarPdf } from '../components/ui/BotonGenerarPdf';
import { ProveedorRegistroPdf } from '../context/RegistroPdfContext';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { SelectorTopBotones, type ValorTop } from '../components/ui/SelectorTopBotones';
import { TablaComparativaResumen } from '../components/resumen/TablaComparativaResumen';
import { Top5Dona } from '../components/resumen/BloquesResumen';
import { RankingAporte } from '../components/charts/RankingAporte';
import { ComportamientoDelDelito } from '../components/analitica/ComportamientoDelDelito';
import { TendenciaDiariaChart } from '../components/charts/TendenciaDiariaChart';
import { formatDecimal, formatFecha, formatNumero } from '../utils/aggregations';
import { TrendingUp, TrendingDown, Info, BarChart3, LineChart, Building2, Target, Activity, MapPin, Clock, MapPinned, Home, Crosshair, Timer, Building, Plus, Map, Users, UserRound, CalendarDays } from 'lucide-react';
import { ComparativoMultifecha } from './ComparativoMultifecha';
import { IndicadorVigencia } from '../components/filters/IndicadorVigencia';

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
  const { records, filteredRecords, recordsBase, filters, meta, drillDown, filteredOperatividadRecords, periodos } = useData();
  const modoAcceso = obtenerModoAcceso();
  const accesoTendenciaMensual = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].tendenciaMensual;
  const accesoTendenciaDiaria = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].tendenciaDiaria;
  const [topDelitos, setTopDelitos] = useState<number | undefined>(10);
  const [topCai, setTopCai] = useState<ValorTop>(10);
  const [topCuadrante, setTopCuadrante] = useState(10);
  const [topBarrio, setTopBarrio] = useState(10);
  const [topArma, setTopArma] = useState(10);
  const [topModalidad, setTopModalidad] = useState(10);
  const [topClaseSitio, setTopClaseSitio] = useState(10);
  const [topCausaLesion, setTopCausaLesion] = useState(10);

  // ── Migrado de la antigua página "Indicadores" (fusionada aquí) ──────
  const kpis = useKpis(filteredRecords);

  // Comparativo homólogo (año anterior "a la fecha" vs. año actual) para TODOS
  // los componentes de esta página, incluida la estación — así se evita que
  // una misma unidad muestre cifras distintas en secciones distintas del
  // dashboard (un solo cálculo, una sola fuente de verdad).
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const cmpGeneral = useComparativoGeneral(ventana);

  // EXCLUSIVAMENTE la vigencia actual (ventana.recsActual) — igual que Top
  // delitos/CAI/Turno más abajo en esta misma página. Antes usaba
  // filteredRecords directo, que sin ningún año/fecha filtrado mezclaba
  // los 23 años de histórico en una sola gráfica de "día de la semana"
  // (bug real, confirmado: los totales por día sumaban ~103.000 casos en
  // vez de los ~10.000 esperados para un solo año).
  const diaSemana = useTendenciaDiaSemana(ventana.recsActual);

  // Incluye TAMBIÉN el año anterior (no solo el actual) — necesario para
  // poder comparar, día a día, el mismo periodo contra el año pasado dentro
  // del propio gráfico de Tendencia Diaria.
  const registrosParaDiaria = useMemo(
    () => filteredRecords.filter((r) => r.anio === ventana.anioActual || r.anio === ventana.anioAnterior),
    [filteredRecords, ventana.anioActual, ventana.anioAnterior],
  );
  const diaria = useTendenciaDiaria(registrosParaDiaria);
  // Abierta por defecto: la tendencia diaria comparte fila con la mensual.
  const [vistaDiaria, setVistaDiaria] = useState(true);

  // Total General = año COMPLETO (01/01–31/12) de la vigencia anterior.
  const totalGeneralIndicadores = useMemo(
    () => totalCasos(recordsBase.filter((r) => r.anio === ventana.anioAnterior)),
    [recordsBase, ventana.anioAnterior],
  );

  const [resumenDiario, setResumenDiario] = useState<{ mesesTexto: string; porMes: { mesNombre: string; anio: number; casos: number }[]; porMesAnioAnterior: { mesNombre: string; anio: number; casos: number }[]; mostrarAnioAnterior: boolean } | null>(null);
  // (Los textos de "mes más afectado", "prioridad" y correlación entre años
  // se quitaron de la tendencia diaria a pedido.)
  const desfavorableGeneral = cmpGeneral.variacionPct !== null && cmpGeneral.variacionPct > 0;

  const urbanoRural = useUrbanoRural(ventana.recsActual);
  const porGenero = useRanking(ventana.recsActual, (r) => r.genero, 10);
  const porGrupoEdad = useRanking(ventana.recsActual, (r) => r.grupoEdad, 10);
  // Igual razón que diaSemana arriba: EXCLUSIVAMENTE la vigencia actual,
  // no filteredRecords directo (que mezclaba los 23 años sin filtro).
  const porHora = useDistribucionHoraria(ventana.recsActual);
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

  // CAI más afectados — misma vigencia actual (ventana.recsActual), mismo
  // criterio que "Top delitos" de arriba.
  const porCaiCompleto = ventana.disponible
    ? agruparPor(ventana.recsActual, (r) => r.cai || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO')
    : [];
  const totalCaiVigenciaActual = porCaiCompleto.reduce((a, d) => a + d.casos, 0);
  const porCaiRecortado = topCai === 'todas' ? porCaiCompleto : porCaiCompleto.slice(0, topCai);
  const porCaiVigenciaActual = porCaiRecortado.map((d) => ({
    ...d,
    aportePct: totalCaiVigenciaActual > 0 ? (d.casos / totalCaiVigenciaActual) * 100 : 0,
  }));

  // Turno de vigilancia — mismo criterio de vigencia actual que los demás
  // componentes de esta página (3 turnos de 8 horas, calculados ya desde
  // la carga del archivo — ver csvParser.ts).
  const porTurnoCompleto = ventana.disponible
    ? agruparPor(ventana.recsActual, (r) => r.turno || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO')
    : [];
  const totalTurnoVigenciaActual = porTurnoCompleto.reduce((a, d) => a + d.casos, 0);
  const porTurnoVigenciaActual = porTurnoCompleto.map((d) => ({
    ...d,
    aportePct: totalTurnoVigenciaActual > 0 ? (d.casos / totalTurnoVigenciaActual) * 100 : 0,
  }));

  // Operatividad (capturas, incautaciones, recuperaciones) — dataset
  // SEPARADO del de delictividad, ya filtrado por DataContext con los
  // MISMOS filtros generales (Delito ↔ delito asociado, Estación,
  // Cuadrante, Barrio, Año, Mes, fecha). Si el delito filtrado es
  // "Homicidio", esto ya trae solo la operatividad asociada a Homicidio.
  const porCategoriaOperatividad = agruparPor(filteredOperatividadRecords, (r) => r.categoria || 'Sin categoría');
  const totalOperatividad = porCategoriaOperatividad.reduce((a, d) => a + d.casos, 0);
  const porCategoriaOperatividadConAporte = porCategoriaOperatividad.map((d) => ({
    ...d,
    aportePct: totalOperatividad > 0 ? (d.casos / totalOperatividad) * 100 : 0,
  }));

  // Igual que en Comparativo.tsx y ResumenEjecutivo.tsx: la ventana de
  // "vigencia actual vs anterior" no tiene sentido con periodos de
  // análisis multifecha activos — se muestra la vista de periodos en su
  // lugar. Va DESPUÉS de todos los hooks de arriba, nunca antes.
  if (periodos.length > 0) {
    return <ComparativoMultifecha />;
  }

  // ── Estilo común de las tarjetas (como la imagen de referencia) ───────
  const T = 'text-[14px] font-bold leading-tight text-[#10233f]';
  const ico = (Icono: typeof MapPin, extra = '') => <Icono size={24} strokeWidth={2.3} className={`shrink-0 text-[#137a6f] ${extra}`} />;
  const filaResumen = [
    { etiqueta: 'Total general', valor: formatNumero(totalGeneralIndicadores), nota: `Vigencia ${ventana.anioAnterior} completa` },
    { etiqueta: `Casos año anterior (${ventana.anioAnterior})`, valor: formatNumero(cmpGeneral.casosAnterior), nota: `${formatNumero(cmpGeneral.registrosAnterior)} reg.` },
    { etiqueta: `Casos año actual (${ventana.anioActual})`, valor: formatNumero(cmpGeneral.casosActual), nota: `${formatNumero(cmpGeneral.registrosActual)} reg.` },
    { etiqueta: 'Diferencia absoluta', valor: `${cmpGeneral.variacionAbs >= 0 ? '+' : ''}${formatNumero(cmpGeneral.variacionAbs)}`, color: desfavorableGeneral ? 'text-rose-600' : 'text-emerald-600' },
    { etiqueta: 'Variación %', valor: formatPct(cmpGeneral.variacionPct), color: desfavorableGeneral ? 'text-rose-600' : 'text-emerald-600' },
    { etiqueta: 'Tendencia', valor: desfavorableGeneral ? 'Desfavorable' : 'Favorable', color: desfavorableGeneral ? 'text-rose-600' : 'text-emerald-600', icono: desfavorableGeneral ? <TrendingUp size={15} className="text-rose-600" /> : <TrendingDown size={15} className="text-emerald-600" /> },
    { etiqueta: 'Participación del delito principal', valor: `${formatDecimal(kpis.participacionDelitoTop)}%`, nota: kpis.delitoTop?.key ?? '—' },
    { etiqueta: 'Promedio diario', valor: formatDecimal(kpis.promedioDiario), nota: 'casos/día' },
    { etiqueta: 'Máximo diario', valor: formatNumero(kpis.maxDiario), nota: '1 día' },
    { etiqueta: 'Mínimo diario', valor: formatNumero(kpis.minDiario), nota: '1 día' },
  ];
  const ranking = (filas: { key: string; actual: number; aportePct: number }[], limite: number) =>
    [...filas].sort((a, b) => b.actual - a.actual).slice(0, limite).map((f) => ({ key: f.key, casos: f.actual, aportePct: f.aportePct }));
  const total = (filas: { casos: number }[]) => filas.reduce((a, f) => a + f.casos, 0);
  const COLORES_DONA = ['#10233f', '#159089', '#f97316', '#8a86da', '#a3acb9'];

  return (
    <ProveedorRegistroPdf>
      <div className="space-y-4">
        <PageHeader
          title="Análisis por Unidad"
          subtitle="Lectura integral: estaciones, cuadrantes, barrios, zonas, población, arma, modalidad, sitio, causa de lesión y horario."
          acciones={<BotonGenerarPdf nombreArchivo="MEPOY_Analisis_Unidad" />}
        />
        <IndicadorVigencia ventana={ventana} />

        {ventana.disponible && (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] leading-snug text-slate-600">
            <Info size={14} className="mt-0.5 shrink-0 text-brand-navy" />
            <p>
              {ventana.esRangoPersonalizado
                ? <>Comparando el rango <strong>{formatFecha(ventana.actualInicio)} – {formatFecha(ventana.actualFin)}</strong> ({ventana.anioActual}) contra el mismo rango un año atrás: <strong>{formatFecha(ventana.anteriorInicio)} – {formatFecha(ventana.anteriorFin)}</strong> ({ventana.anioAnterior}).</>
                : <>Por defecto se compara el año {ventana.anioActual} del 1 de enero al {formatFecha(ventana.actualFin)} ("a la fecha") contra el mismo tramo de {ventana.anioAnterior}. "Total General" corresponde al año {ventana.anioAnterior} completo (cierre 31 de diciembre), respetando el delito/estación seleccionados.</>}
            </p>
          </div>
        )}

        {ventana.disponible && (
          <>
            {/* ── FILA 1: Resumen general | Proyección | Casos por estación (+ meta del 5 %) ── */}
            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              <Card className="h-full" title="Resumen general" descargable="resumen-general-unidad" icono={ico(BarChart3)} claseTitulo={T}>
                <table className="w-full text-[13px]">
                  <tbody>
                    {filaResumen.map((f, i) => (
                      <tr key={f.etiqueta} className={i % 2 === 0 ? 'bg-slate-50/70' : ''}>
                        <td className="py-[5px] pl-3 text-slate-600">{f.etiqueta}</td>
                        <td className={`py-[5px] text-right font-bold ${f.color ?? 'text-[#10233f]'}`}>
                          <span className="inline-flex items-center gap-1.5">{f.icono}{f.valor}</span>
                        </td>
                        <td className="py-[5px] pl-2 pr-3 text-right text-[11px] text-slate-400">{f.nota ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card className="h-full" title="Proyección de delitos" subtitle="Fin de año, según ritmo actual" descargable="proyeccion-delitos" icono={ico(LineChart)} claseTitulo={T}>
                {proyeccion.disponible ? (
                  <div className="space-y-2 text-[12.5px]">
                    <div>
                      <p className="text-[11px] text-slate-500">Casos a la fecha</p>
                      <p className="text-[22px] font-bold leading-tight text-[#10233f]">{formatNumero(proyeccion.casosActual)} casos</p>
                      <p className="text-[11.5px] text-slate-500">{proyeccion.diasTranscurridos} días transcurridos (01/01/{ventana.anioActual} – {formatFecha(ventana.actualFin)}) · Ritmo actual: {formatDecimal(proyeccion.casosPorDia, 2)} casos/día</p>
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                      <p className="text-[11px] font-semibold text-brand-green">Proyección al cierre de {ventana.anioActual}</p>
                      <p className="text-[22px] font-bold leading-tight text-[#10233f]">{formatNumero(proyeccion.proyeccionFinAnio)} casos</p>
                      <p className="text-[11.5px] text-slate-500">Si se mantiene el ritmo actual, se proyectan aproximadamente {formatNumero(proyeccion.proyeccionFinAnio)} casos al cierre de {ventana.anioActual}.</p>
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                      <p className={`flex items-center gap-1.5 font-semibold ${diferenciaVs2025Completo > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {diferenciaVs2025Completo > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {diferenciaVs2025Completo >= 0 ? '+' : ''}{formatNumero(diferenciaVs2025Completo)} casos vs. {ventana.anioAnterior}
                        <span className="font-normal text-slate-400">({pctVs2025Completo === null ? 'N/A' : `${pctVs2025Completo >= 0 ? '+' : ''}${formatDecimal(pctVs2025Completo, 1)}%`})</span>
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">Proyección = (casos ÷ días transcurridos) × {proyeccion.diasEnAnio} días. Comparado contra el total REAL de {ventana.anioAnterior} completo ({formatNumero(totalAnioAnteriorCompleto)} casos) — no contra el mismo corte de fecha.</p>
                    </div>
                    <p className="border-t border-slate-100 pt-2 text-[11.5px] leading-snug text-slate-600">{textoInterpretacion}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Sin datos suficientes para proyectar.</p>
                )}
              </Card>

              {/* Casos por estación: TABLA (obligatoria) + debajo el recuadro rojo/verde de la meta del 5 %. */}
              <Card className="h-full lg:col-span-2 2xl:col-span-1" title="Casos por estación" subtitle={`Casos ${ventana.anioAnterior} vs. ${ventana.anioActual}, a la fecha`} descargable="casos-por-estacion" icono={ico(Building2)} claseTitulo={T}>
                <TablaComparativaResumen
                  filas={cmpEstacion.slice(0, 10)}
                  etiqueta="Estación"
                  anioAnterior={ventana.anioAnterior}
                  anioActual={ventana.anioActual}
                  aporteTotal="100%"
                  compacta
                  onRowClick={(key) => drillDown('estacion', key)}
                />
                {proyeccion.disponible && (
                  <div className={`mt-3 rounded-lg border p-3 ${cumpleMeta ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                    <p className={`flex items-center gap-2 text-[16px] font-bold ${cumpleMeta ? 'text-emerald-700' : 'text-rose-600'}`}>
                      <Target size={18} /> Meta de reducción del 5%: {formatNumero(metaReduccion5)} casos
                    </p>
                    <p className={`mt-1 text-[12px] font-medium ${cumpleMeta ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {coincideConMeta
                        ? 'La proyección coincide con la meta establecida.'
                        : cumpleMeta
                          ? `✓ La proyección se encuentra ${formatNumero(Math.abs(diferenciaVsMeta))} casos por debajo de la meta.`
                          : `⚠ La proyección actual supera la meta en ${formatNumero(diferenciaVsMeta)} casos.`}
                    </p>
                    <p className="mt-1.5 border-t border-slate-200/70 pt-1.5 text-[11.5px] text-slate-600">
                      Base: {formatNumero(totalAnioAnteriorCompleto)} casos en {ventana.anioAnterior} × 0,95.{' '}
                      {casosPermitidosRestantes >= 0
                        ? `Para cumplir la meta: máximo ≈ ${formatNumero(Math.max(0, Math.round(cuotaMensualRestante)))} casos/mes en lo que resta de ${ventana.anioActual} (${mesesRestantes} ${mesesRestantes === 1 ? 'mes restante' : 'meses restantes'}).`
                        : `Ya se superó el total permitido por la meta (${formatNumero(Math.abs(casosPermitidosRestantes))} casos de más) antes de terminar el año.`}
                    </p>
                  </div>
                )}
              </Card>
            </div>

            {/* ── FILA 2: Tendencia mensual | Tendencia diaria ── */}
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              <div className="min-w-0">
                {accesoTendenciaMensual ? (
                  <ComportamientoDelDelito descargable="tendencia-mensual" titulo="Tendencia mensual" subtitulo="Comparación de casos por mes entre los años disponibles" mostrarLectura={false} icono={ico(BarChart3)} />
                ) : (
                  <ComponenteBloqueado titulo="Tendencia mensual" subtitulo="Comparación de casos por mes entre los años disponibles" />
                )}
              </div>
              <div className="min-w-0">
                {accesoTendenciaDiaria ? (
                  <Card
                    className="h-full"
                    title={`Tendencia diaria${resumenDiario?.mesesTexto ? ` — ${resumenDiario.mesesTexto}` : ''}`}
                    subtitle="Comportamiento día a día en el periodo filtrado"
                    descargable="tendencia-diaria"
                    icono={ico(Activity)}
                    claseTitulo={T}
                    actions={
                      <button onClick={() => setVistaDiaria((v) => { if (v) setResumenDiario(null); return !v; })} className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
                        {vistaDiaria ? 'Ver resumen' : 'Ver serie completa'}
                      </button>
                    }
                  >
                    {vistaDiaria ? (
                      <TendenciaDiariaChart data={diaria} height={300} onResumenChange={setResumenDiario} />
                    ) : (
                      <p className="py-8 text-center text-sm text-slate-400">Haz clic en "Ver serie completa" para visualizar el comportamiento diario detallado ({diaria.length} días con datos).</p>
                    )}
                  </Card>
                ) : (
                  <ComponenteBloqueado titulo="Tendencia diaria" subtitulo="Comportamiento día a día en el periodo filtrado" />
                )}
              </div>
            </div>

            {/* ── FILA 3: CAI | Turno | Top delitos | Top cuadrantes ── */}
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-4">
              <Card className="h-full" title="CAI más afectados" subtitle={`Top ${topCai === 'todas' ? 'todos' : topCai}, vigencia ${ventana.anioActual}`} descargable="cai-mas-afectados" icono={ico(MapPin)} claseTitulo={T} actions={<SelectorTopBotones valor={topCai} onChange={setTopCai} />}>
                <RankingAporte data={porCaiVigenciaActual} cabeza="CAI" onClick={(key) => drillDown('cai', key)} />
              </Card>
              <Card className="h-full" title="Turno de vigilancia" subtitle={`Exclusivamente vigencia ${ventana.anioActual}`} descargable="turno-vigilancia" icono={ico(Clock)} claseTitulo={T}>
                <RankingAporte data={porTurnoVigenciaActual} cabeza="Turno" onClick={(key) => drillDown('turno', key)} />
              </Card>
              <Card className="h-full" title="Análisis de delitos — Top por cantidad" subtitle={`Exclusivamente vigencia ${ventana.anioActual}`} descargable="top-delitos" icono={ico(BarChart3)} claseTitulo={T} actions={<SelectorTop valor={topDelitos} onChange={setTopDelitos} opciones={OPCIONES_TOP} />}>
                <RankingAporte data={porDelitoVigenciaActual} cabeza="Delito" onClick={(key) => drillDown('delito', key)} />
              </Card>
              <Card className="h-full" title={`Top ${topCuadrante} cuadrantes más afectados`} subtitle={`Vigencia ${ventana.anioActual}, a la fecha`} descargable="top-cuadrantes" icono={ico(MapPinned)} claseTitulo={T} actions={<SelectorTop valor={topCuadrante} onChange={(v) => setTopCuadrante(v!)} />}>
                <RankingAporte data={ranking(cmpCuadrante, topCuadrante)} cabeza="Cuadrante" onClick={(key) => drillDown('cuadrante', key)} />
              </Card>
            </div>

            {/* ── FILA 4: Barrios | Armas | Modalidades | Clase de sitio | Causa de lesión ── */}
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              <Card className="h-full" title={`Top ${topBarrio} barrios más afectados`} subtitle={`Vigencia ${ventana.anioActual}, a la fecha`} descargable="top-barrios" icono={ico(Home)} claseTitulo={T} actions={<SelectorTop valor={topBarrio} onChange={(v) => setTopBarrio(v!)} />}>
                <RankingAporte data={ranking(cmpBarrio, topBarrio)} cabeza="Barrio" onClick={(key) => drillDown('barrioHecho', key)} />
              </Card>
              <Card className="h-full" title="Armas empleadas" subtitle={`Top ${topArma}, vigencia ${ventana.anioActual}`} descargable="armas-empleadas" icono={ico(Crosshair)} claseTitulo={T} actions={<SelectorTop valor={topArma} onChange={(v) => setTopArma(v!)} />}>
                <RankingAporte data={ranking(cmpArma, topArma)} cabeza="Arma" onClick={(key) => drillDown('armas', key)} />
              </Card>
              <Card className="h-full" title="Modalidades principales" subtitle={`Top ${topModalidad}, vigencia ${ventana.anioActual}`} descargable="modalidades" icono={ico(Timer)} claseTitulo={T} actions={<SelectorTop valor={topModalidad} onChange={(v) => setTopModalidad(v!)} />}>
                <RankingAporte data={ranking(cmpModalidad, topModalidad)} cabeza="Modalidad" onClick={(key) => drillDown('modalidad', key)} />
              </Card>
              <Card className="h-full" title="Clase de sitio" subtitle={`Top ${topClaseSitio}, vigencia ${ventana.anioActual}`} descargable="clase-sitio" icono={ico(Building)} claseTitulo={T} actions={<SelectorTop valor={topClaseSitio} onChange={(v) => setTopClaseSitio(v!)} />}>
                <RankingAporte data={ranking(cmpClaseSitio, topClaseSitio)} cabeza="Clase de sitio" onClick={(key) => drillDown('claseSitio', key)} />
              </Card>
              <Card className="h-full" title="Causa de lesión" subtitle={`Top ${topCausaLesion}, vigencia ${ventana.anioActual}`} descargable="causa-lesion" icono={<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#137a6f]"><Plus size={15} strokeWidth={3.5} className="text-white" /></span>} claseTitulo={T} actions={<SelectorTop valor={topCausaLesion} onChange={(v) => setTopCausaLesion(v!)} />}>
                <RankingAporte data={ranking(cmpCausaLesion, topCausaLesion)} cabeza="Causa" onClick={(key) => drillDown('causaLesion', key)} />
              </Card>
            </div>

            {/* ── FILA 5: Zonas | Género | Grupo de edad | Día de la semana | Concentración horaria ── */}
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 2xl:grid-cols-[0.8fr_0.8fr_0.8fr_1.4fr_2.2fr]">
              <Card className="h-full 2xl:col-span-1" title="Zonas con mayor concentración" descargable="zonas-concentracion" icono={ico(Map)} claseTitulo="text-[14px] font-bold text-[#10233f]">
                <Top5Dona filas={urbanoRural} total={total(urbanoRural)} colores={COLORES_DONA} compacta />
              </Card>
              <Card className="h-full 2xl:col-span-1" title="Distribución por género" descargable="distribucion-genero" icono={ico(Users)} claseTitulo="text-[14px] font-bold text-[#10233f]">
                <Top5Dona filas={porGenero.map((g) => ({ key: g.key, casos: g.casos }))} total={total(porGenero)} colores={COLORES_DONA} compacta />
              </Card>
              <Card className="h-full 2xl:col-span-1" title="Distribución por grupo de edad" descargable="distribucion-edad" icono={ico(UserRound)} claseTitulo="text-[14px] font-bold text-[#10233f]">
                <Top5Dona filas={porGrupoEdad.map((g) => ({ key: g.key, casos: g.casos }))} total={total(porGrupoEdad)} colores={COLORES_DONA} compacta />
              </Card>
              <Card className="h-full md:col-span-3 2xl:col-span-1" title="Casos por día de la semana" subtitle="Los 3 días con más casos se resaltan" descargable="casos-dia-semana" icono={ico(CalendarDays)} claseTitulo="text-[14px] font-bold text-[#10233f]">
                <GroupedBarChart data={diaSemana} xKey="dia" seriesKeys={['casos']} height={210} resaltarMaximo resaltarTopN={3} colorPorBarra anchoMaximoBarra={34} tamanoEtiqueta={11} espaciadoCategoria={0.15} />
              </Card>
              <Card
                className="h-full md:col-span-3 2xl:col-span-1"
                title="Concentración horaria"
                subtitle={topHorasUnidad ? `Top ${topHorasUnidad} horas con más casos` : 'Casos por hora del día — las 3 horas con más casos se resaltan'}
                descargable="concentracion-horaria"
                icono={ico(Clock)}
                claseTitulo="text-[14px] font-bold text-[#10233f]"
                actions={
                  <div className="flex gap-1">
                    {[{ label: 'Top 5', v: 5 }, { label: 'Top 10', v: 10 }, { label: 'Todas', v: undefined }].map((o) => (
                      <button key={o.label} onClick={() => setTopHorasUnidad(o.v)} className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${topHorasUnidad === o.v ? 'bg-brand-green text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{o.label}</button>
                    ))}
                  </div>
                }
              >
                <GroupedBarChart data={porHoraFiltrada} xKey="hora" seriesKeys={['casos']} height={210} resaltarMaximo resaltarTopN={3} colorPorBarra tamanoEtiqueta={9} />
              </Card>
            </div>
          </>
        )}
      </div>
    </ProveedorRegistroPdf>
  );
}
