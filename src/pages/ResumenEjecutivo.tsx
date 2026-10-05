import { TrendingUp, TrendingDown, BarChart3, ArrowDown, ArrowUp, MapPin, Home, Clock, CalendarDays, Landmark, Settings, Crosshair, Building2, Plus, Database, Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useData } from '../context/DataContext';
import { useKpis } from '../hooks/useKpis';
import { useVentanaComparativa, useComparativoCategoria } from '../hooks/useComparativoHomologo';
import { Card, PageHeader, EmptyState } from '../components/ui/Card';
import { TablaComparativaResumen } from '../components/resumen/TablaComparativaResumen';
import { KpiResumen, Top5Dona, RankingTerritorial, ListaCasos, HorarioFranja, EstadoInformacionCompacto, AZUL_TINTA } from '../components/resumen/BloquesResumen';
import { aporteAlCambioPct, contarPor, maximoDe } from '../analitica/cambio';
import { franjaDeTresHoras } from '../analitica/lectura';
import { sinValoresPendientes } from '../utils/valoresPendientes';

import type { CrimeRecord } from '../types/crime';
import { agruparPor, formatNumero, formatDecimal } from '../utils/aggregations';
import { ComparativoMultifecha } from './ComparativoMultifecha';
import { IndicadorVigencia } from '../components/filters/IndicadorVigencia';

// Botón tipo checkbox/pill para los filtros AUMENTO (rojo) / DISMINUCIÓN
// (verde) del encabezado de "Comparativo de delitos". Puramente visual —
// toda la lógica de qué delitos califican vive en ResumenEjecutivo, aquí
// solo se refleja el estado activo/inactivo.
function FiltroTendenciaBoton({ activo, color, icono, etiqueta, onClick }: {
  activo: boolean;
  color: 'rojo' | 'verde';
  icono: React.ReactNode;
  etiqueta: string;
  onClick: () => void;
}) {
  const colores = color === 'rojo'
    ? { activo: 'border-rose-600 bg-rose-600 text-white', inactivo: 'border-slate-300 text-slate-500 hover:border-rose-300 hover:text-rose-600' }
    : { activo: 'border-emerald-600 bg-emerald-600 text-white', inactivo: 'border-slate-300 text-slate-500 hover:border-emerald-300 hover:text-emerald-600' };
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activo}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors',
        activo ? colores.activo : colores.inactivo,
      )}
    >
      {icono}
      {etiqueta}
    </button>
  );
}

export function ResumenEjecutivo() {
  const { records, filteredRecords, recordsBase, filters, meta, operatividadRecords, periodos } = useData();

  // Filtro AUMENTO / DISMINUCIÓN — se activa desde el encabezado de
  // "Comparativo de delitos" y funciona como filtro GLOBAL de toda la
  // página Resumen (ver "delitosPermitidos" más abajo): ninguno activo
  // significa "sin restricción", igual que antes de que existiera esta
  // función.
  const [aumentoActivo, setAumentoActivo] = useState(false);
  const [disminucionActivo, setDisminucionActivo] = useState(false);
  const [aumentoActivoOperatividad, setAumentoActivoOperatividad] = useState(false);
  const [disminucionActivoOperatividad, setDisminucionActivoOperatividad] = useState(false);

  // "Total general de casos": siempre la vigencia MÁS RECIENTE (2026 al
  // momento de escribir esto, calculado dinámicamente para que siga siendo
  // correcto cuando empiece 2027) — sin importar si hay un Año seleccionado
  // en el filtro, y respetando el Delito/Estación/etc. que sí estén activos.
  //
  // "ventana" se calcula SIEMPRE sobre recordsBase SIN el filtro
  // AUMENTO/DISMINUCIÓN (nunca lo recibe) — el año/rango "actual" que
  // determina no debe moverse según qué delitos queden seleccionados; eso
  // evitaría además una dependencia circular, ya que ese filtro se calcula
  // a partir de "comparativoTodosLosDelitos", que a su vez depende de esta
  // misma ventana.
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);

  // Comparativo de TODOS los delitos (2025 vs 2026, diferencia absoluta y
  // %) — reutiliza el mismo hook y la misma tabla que ya usa "Comparativo
  // Anual" y "Casos por Estación": no se duplica ninguna fórmula. Esta
  // lista SIN filtrar por AUMENTO/DISMINUCIÓN es la fuente tanto para
  // pintar la tabla (ver "filasComparativoMostradas") como para clasificar
  // qué delitos califican en cada checkbox.
  const comparativoTodosLosDelitos = useComparativoCategoria(ventana, (r) => r.delito);



  // Conjunto de delitos que quedan seleccionados según los checkboxes
  // activos — usa el mismo cálculo de DIF que ya muestra la tabla
  // (f.diferencia = actual - anterior, ver useComparativoHomologo.ts):
  //   DIF > 0 → AUMENTO · DIF < 0 → DISMINUCIÓN · DIF = 0 → ninguno.
  // "null" significa "sin restricción" (ningún checkbox activo).
  const delitosPermitidos = useMemo<Set<string> | null>(() => {
    if (!aumentoActivo && !disminucionActivo) return null;
    const permitidos = new Set<string>();
    for (const fila of comparativoTodosLosDelitos) {
      if (aumentoActivo && fila.diferencia > 0) permitidos.add(fila.key);
      if (disminucionActivo && fila.diferencia < 0) permitidos.add(fila.key);
    }
    return permitidos;
  }, [comparativoTodosLosDelitos, aumentoActivo, disminucionActivo]);

  // Filas que se pintan en la tabla "Comparativo de delitos" — el mismo
  // conjunto de arriba, solo que restringido a los delitos seleccionados
  // (o completo, si no hay ningún checkbox activo).
  const filasComparativoMostradas = useMemo(
    () => (delitosPermitidos ? comparativoTodosLosDelitos.filter((f) => delitosPermitidos.has(f.key)) : comparativoTodosLosDelitos),
    [comparativoTodosLosDelitos, delitosPermitidos],
  );

  // Filtro GLOBAL del resto de "Resumen": el mismo conjunto de delitos
  // seleccionados se aplica a filteredRecords/recordsBase ANTES de que
  // lleguen a cualquier otro cálculo de la página — así "Total general de
  // casos", "Delito/Estación/Barrio con mayor incidencia", "Principales
  // hallazgos", "Cuadrantes críticos", "Barrios críticos" y "Top 5 delitos"
  // reflejan EXCLUSIVAMENTE los delitos en aumento/disminución, nunca solo
  // como un filtro visual de filas.
  function restringirPorDelitos(recs: CrimeRecord[]): CrimeRecord[] {
    return delitosPermitidos ? recs.filter((r) => delitosPermitidos.has(r.delito)) : recs;
  }
  const filteredRecordsResumen = useMemo(() => restringirPorDelitos(filteredRecords), [filteredRecords, delitosPermitidos]);

  const soloVigenciaActual = useMemo(
    () => filteredRecordsResumen.filter((r) => r.anio === ventana.anioActual),
    [filteredRecordsResumen, ventana.anioActual],
  );
  const kpisVigenciaActual = useKpis(soloVigenciaActual);

  // Capturas (Operatividad) en "Principales hallazgos" — a pedido
  // explícito, junto al resto de hallazgos calculados dinámicamente. Usa
  // datos REALES de 2025 (ya no un valor manual) — solo aparece si ya se
  // cargó el archivo de 2025 (modo "Agregar" en Operatividad).
  // Ventana de Operatividad — misma lógica que Delictividad, pero sobre SU
  // PROPIA última fecha (puede no coincidir con la de Delictividad).
  const ventanaOperatividad = useMemo(() => {
    const conFecha = operatividadRecords.filter((r): r is typeof r & { fecha: Date } => r.fecha != null);
    const fechaMax = conFecha.length > 0 ? conFecha.reduce((max, r) => (r.fecha > max ? r.fecha : max), conFecha[0].fecha) : new Date();
    const anioActual = fechaMax.getFullYear();
    const anioAnterior = anioActual - 1;
    return { conFecha, fechaMax, anioActual, anioAnterior, cutoffAnterior: new Date(anioAnterior, fechaMax.getMonth(), fechaMax.getDate()) };
  }, [operatividadRecords]);

  // Cuadrantes y barrios críticos: del MISMO periodo que el resto del
  // Resumen (vigencia actual con los filtros), sin "No reportado" ni
  // "Pendiente por asignar", y su % sobre el total de ese periodo — así el
  // indicador "Barrio con mayor incidencia" y el primer renglón de
  // "Barrios críticos" son siempre la misma cifra.
  const rankingTerritorial = (campo: (r: CrimeRecord) => string) => {
    const total = soloVigenciaActual.reduce((a, r) => a + (r.cantidad || 1), 0);
    return sinValoresPendientes(agruparPor(soloVigenciaActual, campo)).slice(0, 5)
      .map((f) => ({ key: f.key, casos: f.casos, participacion: total > 0 ? (f.casos / total) * 100 : 0 }));
  };
  const cuadrantes = useMemo(() => rankingTerritorial((r) => r.cuadrante), [soloVigenciaActual]); // eslint-disable-line react-hooks/exhaustive-deps
  const barrios = useMemo(() => rankingTerritorial((r) => r.barrioHecho), [soloVigenciaActual]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top 5 delitos de la vigencia actual, para la gráfica de pastel — misma
  // fuente (soloVigenciaActual, ya restringida por AUMENTO/DISMINUCIÓN) que
  // ya usan los KPI de arriba, así todo el Resumen cuenta exactamente la
  // misma historia.
  const top5DelitosVigenciaActual = useMemo(
    () => agruparPor(soloVigenciaActual, (r) => r.delito).filter((d) => d.key !== 'NO REPORTADO').slice(0, 5),
    [soloVigenciaActual],
  );

  // ── Datos del nuevo Resumen ejecutivo (todos de los registros reales,
  // con los filtros activos; nada codificado) ─────────────────────────────
  // APORTE % del comparativo de delitos = aporte AL CAMBIO total:
  // diferencia del delito ÷ diferencia total × 100 (con signo). Se calcula
  // sobre TODOS los delitos (no solo los visibles con Aumento/Disminución),
  // para que siempre sea la parte del cambio real que explica cada uno.
  const diferenciaTotalDelitos = useMemo(
    () => comparativoTodosLosDelitos.reduce((a, f) => a + f.diferencia, 0),
    [comparativoTodosLosDelitos],
  );
  const filasDelitosConAporte = useMemo(
    () => filasComparativoMostradas.map((f) => ({ ...f, aportePct: aporteAlCambioPct(f.diferencia, diferenciaTotalDelitos) })),
    [filasComparativoMostradas, diferenciaTotalDelitos],
  );
  const totalesComparativo = useMemo(() => ({
    actual: comparativoTodosLosDelitos.reduce((a, f) => a + f.actual, 0),
    anterior: comparativoTodosLosDelitos.reduce((a, f) => a + f.anterior, 0),
  }), [comparativoTodosLosDelitos]);
  // Mayor aumento / mayor disminución = el delito con MÁS CASOS de
  // diferencia (no el de mayor %): un delito que pasa de 1 a 0 casos baja
  // −100 % pero solo un caso, y no es el que más pesa en el total. Se
  // revisan TODOS los delitos del comparativo (no solo los que deja ver el
  // botón Aumento/Disminución). Empate en casos → el de mayor variación %.
  const mayorAumento = useMemo(() => [...comparativoTodosLosDelitos].filter((f) => f.diferencia > 0)
    .sort((a, b) => b.diferencia - a.diferencia || (b.variacionPct ?? 0) - (a.variacionPct ?? 0))[0] ?? null, [comparativoTodosLosDelitos]);
  const mayorDisminucion = useMemo(() => [...comparativoTodosLosDelitos].filter((f) => f.diferencia < 0)
    .sort((a, b) => a.diferencia - b.diferencia || (a.variacionPct ?? 0) - (b.variacionPct ?? 0))[0] ?? null, [comparativoTodosLosDelitos]);
  const totalVigencia = kpisVigenciaActual.totalCasos;
  const cantidad = (r: CrimeRecord) => r.cantidad || 1;
  const horarioCritico = useMemo(() => {
    const conHora = soloVigenciaActual.filter((r) => r.hora !== null && r.hora !== undefined);
    const m = maximoDe(contarPor(conHora, (r) => franjaDeTresHoras(r.hora as number), cantidad));
    const totalConHora = conHora.reduce((a, r) => a + cantidad(r), 0);
    return m ? { franja: m.clave.replace(' a ', ' - '), casos: m.valor, pct: totalConHora > 0 ? (m.valor / totalConHora) * 100 : 0 } : null;
  }, [soloVigenciaActual]);
  const topDe = (campo: (r: CrimeRecord) => string) => sinValoresPendientes(agruparPor(soloVigenciaActual, campo)).slice(0, 5).map((f) => ({ key: f.key, casos: f.casos }));
  const armasTop = useMemo(() => topDe((r) => r.armas), [soloVigenciaActual]); // eslint-disable-line react-hooks/exhaustive-deps
  const claseSitioTop = useMemo(() => topDe((r) => r.claseSitio), [soloVigenciaActual]); // eslint-disable-line react-hooks/exhaustive-deps
  const causaLesionTop = useMemo(() => topDe((r) => r.causaLesion), [soloVigenciaActual]); // eslint-disable-line react-hooks/exhaustive-deps
  const franjaTop = useMemo(() => {
    const f = sinValoresPendientes(agruparPor(soloVigenciaActual, (r) => r.franjaHoraria))[0];
    return f ? { franja: f.key, casos: f.casos, pct: totalVigencia > 0 ? (f.casos / totalVigencia) * 100 : 0 } : null;
  }, [soloVigenciaActual, totalVigencia]);
  const [verMetodologia, setVerMetodologia] = useState(false);

  // Igual que en Comparativo.tsx: la comparación "vigencia actual vs
  // anterior" (año) no tiene sentido con periodos de análisis multifecha
  // activos — en ese caso se muestra la vista de periodos en su lugar.
  // Esta condición va DESPUÉS de todos los hooks de arriba, nunca antes,
  // para no violar las reglas de hooks de React al alternar entre modos.
  if (periodos.length > 0) {
    return <ComparativoMultifecha />;
  }

  if (filteredRecords.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard de Análisis Delictivo" subtitle="Resumen" />
        <IndicadorVigencia ventana={ventana} />
        <EmptyState mensaje="No hay registros que coincidan con los filtros actuales." />
      </div>
    );
  }

  // ── Encabezado: periodo analizado y de comparación (de la ventana real) ──
  const fechaLarga = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  const fechaCorta = (d: Date) => d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const periodoTexto = `${fechaLarga(ventana.actualInicio)} al ${fechaLarga(ventana.actualFin)} de ${ventana.anioActual}`;
  const difTotal = totalesComparativo.actual - totalesComparativo.anterior;
  const pctTotal = totalesComparativo.anterior > 0 ? (difTotal / totalesComparativo.anterior) * 100 : null;
  const signo = (n: number) => (n > 0 ? `+${formatNumero(n)}` : formatNumero(n));
  const pctTexto = (n: number | null) => (n === null ? 's/d' : `${n > 0 ? '+' : ''}${formatDecimal(n, 1)} %`);
  const tituloTarjeta = 'text-[16px] font-bold text-[#10233f]';
  const subtituloAporteDelitos = filasDelitosConAporte.reduce((a, f) => a + (f.aportePct ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* ── Encabezado ejecutivo ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-[24px] font-bold leading-tight" style={{ color: AZUL_TINTA }}>Dashboard de Análisis Delictivo — Resumen Ejecutivo</h1>
            <p className="text-[14px] text-slate-500">Periodo: {periodoTexto} &nbsp;|&nbsp; Comparativo: mismo periodo {ventana.anioAnterior}</p>
          </div>
        </div>
        {/* Solo informativos: las fechas se cambian en el panel de filtros de arriba. */}
        <div className="flex flex-wrap items-stretch gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2" title="Las fechas se cambian en el panel de Filtros">
            <CalendarDays size={20} style={{ color: AZUL_TINTA }} />
            <div>
              <p className="text-[13px] font-medium" style={{ color: AZUL_TINTA }}>{fechaCorta(ventana.actualInicio)} - {fechaCorta(ventana.actualFin)}</p>
              <p className="text-[11px] text-slate-500">{ventana.esRangoPersonalizado ? 'Rango seleccionado' : 'Vigencia actual'}</p>
            </div>
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium" style={{ color: AZUL_TINTA }}>
            Comparar con {ventana.anioAnterior}
          </div>
        </div>
      </div>

      {/* ── Indicadores principales ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiResumen
          titulo="Total general de casos"
          valor={formatNumero(totalesComparativo.actual)}
          detalle={<>{difTotal > 0 ? <ArrowUp size={13} className="mr-0.5 inline" /> : difTotal < 0 ? <ArrowDown size={13} className="mr-0.5 inline" /> : null}{signo(difTotal)} ({pctTexto(pctTotal)})</>}
          colorDetalle={difTotal > 0 ? 'text-rose-600' : difTotal < 0 ? 'text-emerald-600' : 'text-slate-500'}
          nota={`vs. ${formatNumero(totalesComparativo.anterior)} en ${ventana.anioAnterior}`}
          icono={<BarChart3 size={26} className="text-[#2f6fd6]" strokeWidth={2.4} />}
          fondoIcono="bg-[#e6effc]"
        />
        <KpiResumen
          titulo="Delito con mayor aumento"
          valor={mayorAumento?.key ?? 'Ninguno'}
          detalle={mayorAumento ? `${signo(mayorAumento.diferencia)} casos (${pctTexto(mayorAumento.variacionPct)})` : 'ningún delito aumentó'}
          colorDetalle="text-rose-600"
          icono={<TrendingUp size={26} className="text-rose-500" strokeWidth={2.4} />}
          fondoIcono="bg-rose-100"
          fondo="bg-[#fff4f5]"
        />
        <KpiResumen
          titulo="Delito con mayor disminución"
          valor={mayorDisminucion?.key ?? 'Ninguno'}
          detalle={mayorDisminucion ? `${signo(mayorDisminucion.diferencia)} casos (${pctTexto(mayorDisminucion.variacionPct)})` : 'ningún delito disminuyó'}
          colorDetalle="text-emerald-600"
          icono={<ArrowDown size={26} className="text-emerald-600" strokeWidth={2.6} />}
          fondoIcono="bg-emerald-100"
          fondo="bg-[#f1fbf5]"
        />
        <KpiResumen
          titulo="Estación con mayor incidencia"
          valor={kpisVigenciaActual.estacionTop?.key ?? '—'}
          detalle={kpisVigenciaActual.estacionTop ? `${formatNumero(kpisVigenciaActual.estacionTop.casos)} casos (${formatDecimal(totalVigencia > 0 ? (kpisVigenciaActual.estacionTop.casos / totalVigencia) * 100 : 0, 1)} %)` : undefined}
          icono={<MapPin size={26} className="fill-[#2f6fd6] text-white" strokeWidth={1.6} />}
          fondoIcono="bg-[#e6effc]"
        />
        <KpiResumen
          titulo="Barrio con mayor incidencia"
          valor={barrios[0]?.key ?? '—'}
          detalle={barrios[0] ? `${formatNumero(barrios[0].casos)} casos (${formatDecimal(barrios[0].participacion, 1)} %)` : undefined}
          colorDetalle="text-emerald-600"
          icono={<Home size={26} className="fill-[#16a37f] text-[#16a37f]" />}
          fondoIcono="bg-emerald-100"
        />
        <KpiResumen
          titulo="Horario crítico"
          valor={horarioCritico?.franja ?? '—'}
          detalle={horarioCritico ? `${formatNumero(horarioCritico.casos)} casos (${formatDecimal(horarioCritico.pct, 1)} %)` : undefined}
          icono={<Clock size={26} className="text-[#137a6f]" strokeWidth={2.4} />}
          fondoIcono="bg-[#e3f4f1]"
        />
      </div>

      {/* ── Los dos comparativos (máxima jerarquía) ───────────────────── */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Card
          title="Comparativo de delitos"
          subtitle={`${ventana.anioAnterior} vs. ${ventana.anioActual}, a la fecha`}
          descargable="comparativo-delitos-resumen"
          icono={<Landmark size={30} className="text-[#137a6f]" strokeWidth={2.2} />}
          claseTitulo="text-[18px] font-bold text-[#10233f]"
          actions={(
            <div className="flex items-center gap-1.5">
              <FiltroTendenciaBoton activo={aumentoActivo} color="rojo" icono={<TrendingUp size={12} />} etiqueta="Aumento" onClick={() => setAumentoActivo((v) => !v)} />
              <FiltroTendenciaBoton activo={disminucionActivo} color="verde" icono={<TrendingDown size={12} />} etiqueta="Disminución" onClick={() => setDisminucionActivo((v) => !v)} />
            </div>
          )}
        >
          {filasDelitosConAporte.length > 0 ? (
            <TablaComparativaResumen
              filas={filasDelitosConAporte}
              etiqueta="Delito"
              anioAnterior={ventana.anioAnterior}
              anioActual={ventana.anioActual}
              aporteTotal={delitosPermitidos ? `${formatDecimal(subtituloAporteDelitos, 1)}%` : (diferenciaTotalDelitos === 0 ? '—' : '100%')}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              {delitosPermitidos ? 'Ningún delito coincide con el filtro seleccionado.' : 'Sin datos suficientes para comparar.'}
            </p>
          )}
        </Card>

        <Card
          title="Comparativo de Operatividad"
          subtitle={`${ventanaOperatividad.anioAnterior} vs. ${ventanaOperatividad.anioActual}, por categoría`}
          descargable="comparativo-operatividad-resumen"
          icono={<Settings size={30} className="text-[#137a6f]" strokeWidth={2.4} />}
          claseTitulo="text-[18px] font-bold text-[#10233f]"
          actions={(
            <div className="flex items-center gap-1.5">
              <FiltroTendenciaBoton activo={aumentoActivoOperatividad} color="verde" icono={<TrendingUp size={12} />} etiqueta="Aumento" onClick={() => setAumentoActivoOperatividad((v) => !v)} />
              <FiltroTendenciaBoton activo={disminucionActivoOperatividad} color="rojo" icono={<TrendingDown size={12} />} etiqueta="Disminución" onClick={() => setDisminucionActivoOperatividad((v) => !v)} />
            </div>
          )}
        >
          {operatividadRecords.length > 0 ? (
            (() => {
              // Cálculo de Operatividad SIN CAMBIOS (mismas cifras de antes):
              // ventana propia de Operatividad, año anterior "a la misma
              // fecha", Total año anterior completo y APORTE % = participación
              // de cada categoría en el total del año actual.
              const { conFecha, anioActual: anioActualOp, anioAnterior: anioAnteriorOp, cutoffAnterior: cutoffAnteriorOp } = ventanaOperatividad;
              const categorias = Array.from(new Set(operatividadRecords.map((r) => r.categoria || 'SIN CATEGORÍA')));
              const filas = categorias.map((cat) => {
                const actual = operatividadRecords.filter((r) => r.categoria === cat && r.anio === anioActualOp).length;
                const anteriorALaFecha = conFecha.filter((r) => r.categoria === cat && r.fecha.getFullYear() === anioAnteriorOp && r.fecha <= cutoffAnteriorOp).length;
                const anteriorCompleto = operatividadRecords.filter((r) => r.categoria === cat && r.anio === anioAnteriorOp).length;
                const diferencia = actual - anteriorALaFecha;
                const variacionPct = anteriorALaFecha > 0 ? (diferencia / anteriorALaFecha) * 100 : (actual > 0 ? 100 : null);
                return { key: cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(), actual, anterior: anteriorALaFecha, diferencia, variacionPct, aportePct: 0 as number | null, totalAnioAnteriorCompleto: anteriorCompleto };
              }).filter((f) => f.actual > 0 || f.anterior > 0 || f.totalAnioAnteriorCompleto > 0).sort((a, b) => b.actual - a.actual);
              const totalActual = filas.reduce((a, f) => a + f.actual, 0);
              const filasConAporte = filas.map((f) => ({ ...f, aportePct: totalActual > 0 ? (f.actual / totalActual) * 100 : 0 }));
              const filasFiltradas = filasConAporte.filter((f) => {
                if (!aumentoActivoOperatividad && !disminucionActivoOperatividad) return true;
                if (aumentoActivoOperatividad && f.diferencia > 0) return true;
                if (disminucionActivoOperatividad && f.diferencia < 0) return true;
                return false;
              });
              const sumaVisible = filasFiltradas.reduce((a, f) => a + (f.aportePct ?? 0), 0);
              return filasFiltradas.length > 0 ? (
                <TablaComparativaResumen
                  filas={filasFiltradas}
                  etiqueta="Categoría"
                  anioAnterior={anioAnteriorOp}
                  anioActual={anioActualOp}
                  invertirColores
                  alinearNombre="center"
                  aporteTotal={`${formatDecimal(sumaVisible, sumaVisible > 99.95 ? 0 : 1)}%`}
                />
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">Ninguna categoría coincide con el filtro seleccionado.</p>
              );
            })()
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Sin datos de Operatividad cargados todavía.</p>
          )}
        </Card>
      </div>

      {/* ── Top 5 | Cuadrantes | Barrios ──────────────────────────────── */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title={`Top 5 delitos por participación (${ventana.anioActual})`} descargable="top5-delitos-resumen" icono={<TrendingUp size={24} className="text-[#137a6f]" strokeWidth={2.4} />} claseTitulo={tituloTarjeta}>
          {top5DelitosVigenciaActual.length > 0 ? <Top5Dona filas={top5DelitosVigenciaActual.map((d) => ({ key: d.key, casos: d.casos }))} total={totalVigencia} /> : <p className="py-8 text-center text-sm text-slate-400">Sin datos suficientes.</p>}
        </Card>
        <Card title="Cuadrantes críticos (Top 5)" descargable="cuadrantes-criticos-resumen" icono={<Crosshair size={24} className="text-[#16a37f]" strokeWidth={2.4} />} claseTitulo={tituloTarjeta}>
          <RankingTerritorial cabeza="Cuadrante" filas={cuadrantes} />
        </Card>
        <Card title="Barrios críticos (Top 5)" descargable="barrios-criticos-resumen" icono={<Home size={24} className="fill-[#16a37f] text-[#16a37f]" />} claseTitulo={tituloTarjeta}>
          <RankingTerritorial cabeza="Barrio" filas={barrios} />
        </Card>
      </div>

      {/* ── Armas | Clase de sitio | Causa | Horario | Estado de la información ── */}
      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12">
        <Card className="xl:col-span-2" title="Armas más empleadas" descargable="armas-resumen" icono={<Crosshair size={20} className="text-[#16a37f]" strokeWidth={2.4} />} claseTitulo="text-[13.5px] font-bold text-[#10233f]">
          <ListaCasos cabeza="Arma" filas={armasTop} />
        </Card>
        <Card className="xl:col-span-2" title="Clase de sitio" descargable="clase-sitio-resumen" icono={<Building2 size={20} className="text-[#16a37f]" strokeWidth={2.4} />} claseTitulo="text-[13.5px] font-bold text-[#10233f]">
          <ListaCasos cabeza="Clase de sitio" filas={claseSitioTop} />
        </Card>
        <Card className="xl:col-span-2" title="Causa de lesión" descargable="causa-lesion-resumen" icono={<span className="flex h-5 w-5 items-center justify-center rounded bg-[#16a37f]"><Plus size={14} strokeWidth={3.5} className="text-white" /></span>} claseTitulo="text-[13.5px] font-bold text-[#10233f]">
          <ListaCasos cabeza="Causa" filas={causaLesionTop} />
        </Card>
        <Card className="xl:col-span-3" title="Horario más afectado (franja)" descargable="horario-franja-resumen" icono={<Clock size={22} className="text-[#137a6f]" strokeWidth={2.4} />} claseTitulo="text-[13.5px] font-bold text-[#10233f]">
          {franjaTop ? <HorarioFranja franja={franjaTop.franja} casos={franjaTop.casos} participacion={franjaTop.pct} /> : <p className="text-sm text-slate-400">Sin datos.</p>}
        </Card>
        <Card className="xl:col-span-3" title="Estado de la información" descargable="estado-informacion-resumen" icono={<Database size={20} className="text-[#137a6f]" strokeWidth={2.4} />} claseTitulo="text-[13.5px] font-bold text-[#10233f]">
          <EstadoInformacionCompacto />
        </Card>
      </div>

      {/* ── Nota metodológica (secundaria, plegable) ─────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5">
            <Info size={13} className="text-slate-400" />
            <b className="text-slate-600">Nota metodológica:</b> cada fila de la base es un caso · Fuente: DB2 / Matriz Base cargada en el dashboard · Periodo: {periodoTexto} frente al mismo tramo de {ventana.anioAnterior} · Cifras calculadas con los filtros activos.
          </p>
          <button onClick={() => setVerMetodologia((v) => !v)} className="font-semibold text-[#137a6f] hover:underline">{verMetodologia ? 'Ocultar metodología' : 'Ver metodología completa'}</button>
        </div>
        {verMetodologia && (
          <ul className="mt-2 list-disc space-y-1 border-t border-slate-100 pt-2 pl-5 leading-relaxed">
            <li><b>Casos:</b> número de registros (filas únicas) de la base de Delictividad; se excluyen los delitos que MEPOY no mide (ver Calidad de Datos).</li>
            <li><b>Comparativo:</b> el año actual del 1 de enero a la fecha del último dato, frente al mismo tramo de días del año anterior. "Total {ventana.anioAnterior}" es el año anterior completo.</li>
            <li><b>% (variación):</b> (casos {ventana.anioActual} − casos {ventana.anioAnterior}) ÷ casos {ventana.anioAnterior} × 100.</li>
            <li><b>Aporte % (delitos):</b> diferencia del delito ÷ diferencia total × 100. Los aportes suman 100 % del cambio; un delito que baja aporta en negativo.</li>
            <li><b>Aporte % (operatividad):</b> participación de cada categoría en el total del año actual.</li>
            <li><b>Participación %:</b> casos del elemento ÷ total del periodo × 100. Horario crítico: franjas de 3 horas sobre los casos con hora registrada.</li>
            <li><b>Tratamiento de datos:</b> homologación DB2 → Matriz Base (delito, estación, CAI, cuadrante, barrio); los valores "No reportado" y "Pendiente por asignar" no se muestran en los rankings.</li>
            <li><b>Actualización:</b> {meta?.ultimaActualizacion ? formatFechaHoraLocal(meta.ultimaActualizacion) : 'sin registro'}.</li>
          </ul>
        )}
      </div>
    </div>
  );
}

function formatFechaHoraLocal(d: Date): string {
  return d.toLocaleString('es-CO');
}
