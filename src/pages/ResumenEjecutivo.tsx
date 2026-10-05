import { ShieldAlert, Building2, MapPin, Layers, TrendingUp, TrendingDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useData } from '../context/DataContext';
import { useKpis } from '../hooks/useKpis';
import { useVentanaComparativa, useComparativoCategoria } from '../hooks/useComparativoHomologo';
import { useHallazgosPrincipales, useCuadrantesCriticos, useBarriosCriticos } from '../hooks/useInsights';
import { KpiCard } from '../components/ui/KpiCard';
import { InsightList } from '../components/ui/InsightCard';
import { Card, PageHeader, EmptyState } from '../components/ui/Card';
import { DataStatusPanel } from '../components/layout/Header';
import { DonutChart } from '../components/charts/DonutChart';
import { ComparativoCategoriaTable } from '../components/tables/ComparativoCategoriaTable';
import { LecturaEjecutiva } from '../components/resumen/LecturaEjecutiva';
import { ExplicacionCambio } from '../components/resumen/ExplicacionCambio';
import { construirLecturaEjecutiva } from '../analitica/lectura';

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

  // Lectura ejecutiva + descomposición del cambio (modelo central en
  // src/analitica/): mismas ventanas homólogas que el comparativo de arriba.
  const lectura = useMemo(
    () => construirLecturaEjecutiva({
      recsActual: ventana.recsActual, recsAnterior: ventana.recsAnterior,
      anioActual: ventana.anioActual, anioAnterior: ventana.anioAnterior,
      inicio: ventana.actualInicio, fin: ventana.actualFin,
    }),
    [ventana],
  );

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
  const recordsBaseResumen = useMemo(() => restringirPorDelitos(recordsBase), [recordsBase, delitosPermitidos]);

  const soloVigenciaActual = useMemo(
    () => filteredRecordsResumen.filter((r) => r.anio === ventana.anioActual),
    [filteredRecordsResumen, ventana.anioActual],
  );
  const kpisVigenciaActual = useKpis(soloVigenciaActual);
  const hallazgos = useHallazgosPrincipales(filteredRecordsResumen, recordsBaseResumen, filters, records, meta?.fechaMaxParametro);

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

  const hallazgosConCapturas = useMemo(() => {
    const capturas2026 = operatividadRecords.filter((r) => r.categoria === 'CAPTURAS' && r.anio === ventanaOperatividad.anioActual).length;
    const capturas2025 = ventanaOperatividad.conFecha.filter((r) => r.categoria === 'CAPTURAS' && r.fecha.getFullYear() === ventanaOperatividad.anioAnterior && r.fecha <= ventanaOperatividad.cutoffAnterior).length;
    if (capturas2025 === 0 || capturas2026 === 0) return hallazgos;
    const dif = capturas2026 - capturas2025;
    const pct = (dif / capturas2025) * 100;
    const texto = `Capturas: ${formatNumero(capturas2026)} en ${ventanaOperatividad.anioActual} frente a ${formatNumero(capturas2025)} en ${ventanaOperatividad.anioAnterior} a la misma fecha (${dif >= 0 ? '+' : ''}${formatDecimal(pct, 1)}%).`;
    return [...hallazgos, { tipo: (dif > 0 ? 'positivo' : dif < 0 ? 'alerta' : 'info') as 'alerta' | 'positivo' | 'info', texto }];
  }, [hallazgos, operatividadRecords, ventanaOperatividad]);
  const cuadrantes = useCuadrantesCriticos(filteredRecordsResumen, 5);
  const barrios = useBarriosCriticos(filteredRecordsResumen, 5);

  // Top 5 delitos de la vigencia actual, para la gráfica de pastel — misma
  // fuente (soloVigenciaActual, ya restringida por AUMENTO/DISMINUCIÓN) que
  // ya usan los KPI de arriba, así todo el Resumen cuenta exactamente la
  // misma historia.
  const top5DelitosVigenciaActual = useMemo(
    () => agruparPor(soloVigenciaActual, (r) => r.delito).filter((d) => d.key !== 'NO REPORTADO').slice(0, 5),
    [soloVigenciaActual],
  );

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard de Análisis Delictivo"
        subtitle="Resumen — ¿Qué está pasando, dónde y cuándo? Para el desglose completo de indicadores, ve a la sección 'Indicadores'."
      />

      {/* BLOQUE 1 — Arriba, SOLO los dos comparativos lado a lado (Delitos y
          Operatividad) — a pedido explícito. Todo lo demás (KPIs,
          Hallazgos, Cuadrantes/Barrios críticos) va DEBAJO, en su propia
          fila. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card
          title="Comparativo de delitos"
          subtitle={`${ventana.anioAnterior} vs. ${ventana.anioActual}, a la fecha`}
          descargable="comparativo-delitos-resumen"
          actions={(
            <div className="flex items-center gap-1.5">
              <FiltroTendenciaBoton
                activo={aumentoActivo}
                color="rojo"
                icono={<TrendingUp size={12} />}
                etiqueta="Aumento"
                onClick={() => setAumentoActivo((v) => !v)}
              />
              <FiltroTendenciaBoton
                activo={disminucionActivo}
                color="verde"
                icono={<TrendingDown size={12} />}
                etiqueta="Disminución"
                onClick={() => setDisminucionActivo((v) => !v)}
              />
            </div>
          )}
        >
          {filasComparativoMostradas.length > 0 ? (
            <ComparativoCategoriaTable
              data={filasComparativoMostradas}
              etiqueta="Delito"
              anioAnterior={ventana.anioAnterior}
              anioActual={ventana.anioActual}
              limite={filasComparativoMostradas.length}
              etiquetaUltimaColumna="PARTICIPACIÓN %"
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
          actions={(
            <div className="flex items-center gap-1.5">
              <FiltroTendenciaBoton activo={aumentoActivoOperatividad} color="verde" icono={<TrendingUp size={12} />} etiqueta="Aumento" onClick={() => setAumentoActivoOperatividad((v) => !v)} />
              <FiltroTendenciaBoton activo={disminucionActivoOperatividad} color="rojo" icono={<TrendingDown size={12} />} etiqueta="Disminución" onClick={() => setDisminucionActivoOperatividad((v) => !v)} />
            </div>
          )}
        >
          {operatividadRecords.length > 0 ? (
            (() => {
              // Mismo formato que "Comparativo de delitos" — ahora con
              // Misma lógica que Delictividad — a pedido explícito: la
              // fecha de corte se calcula sobre la ÚLTIMA fecha que traiga
              // Operatividad (no la de Delictividad, que puede ser
              // distinta — ver ventanaOperatividad), y el año anterior se
              // compara "a la misma fecha" (ej. si Operatividad llega
              // hasta el 27/09/2026, se compara contra el
              // 01/01/2025–27/09/2025) — mientras que la columna "Total
              // 2025" sí es el año anterior COMPLETO, hasta el cierre de
              // diciembre.
              const { conFecha, anioActual: anioActualOp, anioAnterior: anioAnteriorOp, cutoffAnterior: cutoffAnteriorOp } = ventanaOperatividad;

              const categorias = Array.from(new Set(operatividadRecords.map((r) => r.categoria || 'SIN CATEGORÍA')));
              const filas = categorias.map((cat) => {
                const actual = operatividadRecords.filter((r) => r.categoria === cat && r.anio === anioActualOp).length;
                const anteriorALaFecha = conFecha.filter((r) => r.categoria === cat && r.fecha.getFullYear() === anioAnteriorOp && r.fecha <= cutoffAnteriorOp).length;
                const anteriorCompleto = operatividadRecords.filter((r) => r.categoria === cat && r.anio === anioAnteriorOp).length;
                const diferencia = actual - anteriorALaFecha;
                const variacionPct = anteriorALaFecha > 0 ? (diferencia / anteriorALaFecha) * 100 : (actual > 0 ? 100 : null);
                return { key: cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase(), actual, anterior: anteriorALaFecha, diferencia, variacionPct, aportePct: 0, totalAnioAnteriorCompleto: anteriorCompleto };
              }).filter((f) => f.actual > 0 || f.anterior > 0 || f.totalAnioAnteriorCompleto > 0).sort((a, b) => b.actual - a.actual);
              const totalActual = filas.reduce((a, f) => a + f.actual, 0);
              const filasConAporte = filas.map((f) => ({ ...f, aportePct: totalActual > 0 ? (f.actual / totalActual) * 100 : 0 }));
              const filasFiltradas = filasConAporte.filter((f) => {
                if (!aumentoActivoOperatividad && !disminucionActivoOperatividad) return true;
                if (aumentoActivoOperatividad && f.diferencia > 0) return true;
                if (disminucionActivoOperatividad && f.diferencia < 0) return true;
                return false;
              });
              return filasFiltradas.length > 0 ? (
                <ComparativoCategoriaTable data={filasFiltradas} etiqueta="Categoría" anioAnterior={anioAnteriorOp} anioActual={anioActualOp} limite={filasFiltradas.length} invertirColores />
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">Ninguna categoría coincide con el filtro seleccionado.</p>
              );
            })()
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Sin datos de Operatividad cargados todavía.</p>
          )}
        </Card>
      </div>

      {/* BLOQUE 1b — Lectura ejecutiva y "¿Qué está explicando el cambio?":
          responden en palabras qué pasó, cuánto, qué delitos lo explican,
          dónde y cuándo. Debajo de los comparativos, sin tocarlos. */}
      {ventana.disponible && (
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-5">
          <LecturaEjecutiva frases={lectura.frases} className="lg:col-span-2" />
          <ExplicacionCambio cambio={lectura.cambio} anioAnterior={ventana.anioAnterior} anioActual={ventana.anioActual} className="lg:col-span-3" />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <KpiCard titulo={`Total general de casos (${ventana.anioActual})`} valor={formatNumero(kpisVigenciaActual.totalCasos)} subtitulo={`${formatNumero(kpisVigenciaActual.totalRegistros)} registros`} icono={<Layers size={16} />} acento="navy" />
          <KpiCard titulo="Delito con mayor incidencia" valor={kpisVigenciaActual.delitoTop?.key ?? '—'} subtitulo={kpisVigenciaActual.delitoTop ? `${formatNumero(kpisVigenciaActual.delitoTop.casos)} casos (${formatDecimal(kpisVigenciaActual.participacionDelitoTop)}%)` : undefined} icono={<ShieldAlert size={16} />} acento="red" />
          <KpiCard titulo="Estación con mayor incidencia" valor={kpisVigenciaActual.estacionTop?.key ?? '—'} subtitulo={kpisVigenciaActual.estacionTop ? `${formatNumero(kpisVigenciaActual.estacionTop.casos)} casos` : undefined} icono={<Building2 size={16} />} acento="navy" />
          <KpiCard titulo="Barrio con mayor incidencia" valor={kpisVigenciaActual.barrioTop?.key ?? '—'} subtitulo={kpisVigenciaActual.barrioTop ? `${formatNumero(kpisVigenciaActual.barrioTop.casos)} casos` : undefined} icono={<MapPin size={16} />} acento="green" />
        </div>
        <div className="flex-1">
          <InsightList insights={hallazgosConCapturas} titulo="Principales hallazgos" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card title="Cuadrantes críticos" subtitle="Top 5 por número de casos" descargable="cuadrantes-criticos-resumen">
            <ul className="space-y-2">
              {cuadrantes.map((c, i) => (
                <li key={c.key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700"><strong className="text-slate-400">{i + 1}.</strong> {c.key}</span>
                  <span className="font-semibold text-slate-900">{formatNumero(c.casos)} <span className="text-xs font-normal text-slate-400">({formatDecimal(c.participacion)}%)</span></span>
                </li>
              ))}
              {cuadrantes.length === 0 && <p className="text-sm text-slate-400">Sin datos.</p>}
            </ul>
          </Card>
          <Card title="Barrios críticos" subtitle="Top 5 por número de casos" descargable="barrios-criticos-resumen">
            <ul className="space-y-2">
              {barrios.map((b, i) => (
                <li key={b.key} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700"><strong className="text-slate-400">{i + 1}.</strong> {b.key}</span>
                  <span className="font-semibold text-slate-900">{formatNumero(b.casos)} <span className="text-xs font-normal text-slate-400">({formatDecimal(b.participacion)}%)</span></span>
                </li>
              ))}
              {barrios.length === 0 && <p className="text-sm text-slate-400">Sin datos.</p>}
            </ul>
          </Card>
        </div>
      </div>

      {/* BLOQUE 2 — Top 5 delitos | Estado de la información | Nota
          metodológica: máximo 3 componentes por fila, todos alineados a la
          misma altura (items-stretch). */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Card title={`Top 5 delitos más afectados (${ventana.anioActual})`} subtitle="Participación sobre el total de la vigencia actual" descargable="top5-delitos-resumen">
          {top5DelitosVigenciaActual.length > 0 ? (
            <DonutChart data={top5DelitosVigenciaActual} height={230} mostrarCasos />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Sin datos suficientes para graficar.</p>
          )}
        </Card>
        <DataStatusPanel />
        <Card title="Nota metodológica" className="text-sm text-slate-600">
          <p className="mb-2">
            <strong>Conteo de registros:</strong> número de filas únicas del origen de datos.
          </p>
          <p className="mb-2">
            <strong>Casos:</strong> cada fila representa un caso; se usa como métrica principal de incidencia delictiva.
          </p>
          <p>
            Todas las conclusiones y hallazgos se calculan dinámicamente a partir de los registros filtrados, exclusivamente de la vigencia {ventana.anioActual}; ninguna cifra está codificada de forma fija.
          </p>
          <p className="mt-2 border-t border-slate-100 pt-2 text-slate-500">
            El aplicativo incorpora mecanismos de asistencia analítica integrados en su lógica de procesamiento, orientados a facilitar la interpretación de los datos y generar información contextualizada para apoyar el análisis.
          </p>
        </Card>
      </div>

    </div>
  );
}
