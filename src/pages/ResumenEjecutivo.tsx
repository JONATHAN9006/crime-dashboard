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
import type { CrimeRecord } from '../types/crime';
import { agruparPor, formatNumero, formatDecimal } from '../utils/aggregations';

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
  const { records, filteredRecords, recordsBase, filters, meta } = useData();

  // Filtro AUMENTO / DISMINUCIÓN — se activa desde el encabezado de
  // "Comparativo de delitos" y funciona como filtro GLOBAL de toda la
  // página Resumen (ver "delitosPermitidos" más abajo): ninguno activo
  // significa "sin restricción", igual que antes de que existiera esta
  // función.
  const [aumentoActivo, setAumentoActivo] = useState(false);
  const [disminucionActivo, setDisminucionActivo] = useState(false);

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
  const recordsBaseResumen = useMemo(() => restringirPorDelitos(recordsBase), [recordsBase, delitosPermitidos]);

  const soloVigenciaActual = useMemo(
    () => filteredRecordsResumen.filter((r) => r.anio === ventana.anioActual),
    [filteredRecordsResumen, ventana.anioActual],
  );
  const kpisVigenciaActual = useKpis(soloVigenciaActual);
  const hallazgos = useHallazgosPrincipales(filteredRecordsResumen, recordsBaseResumen, filters, records, meta?.fechaMaxParametro);
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

  if (filteredRecords.length === 0) {
    return (
      <div>
        <PageHeader title="Dashboard de Análisis Delictivo" subtitle="Resumen" />
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

      {/* BLOQUE 1 — Reorganizado para aprovechar el espacio: "Comparativo de
          delitos" (izquierda) ocupa las DOS filas de esta cuadrícula
          (lg:row-span-2), ya que suele ser más alto que el bloque de la
          derecha. A la derecha: arriba KPIs + Hallazgos, abajo — en el
          espacio que antes quedaba vacío bajo ese bloque — Cuadrantes
          críticos y Barrios críticos lado a lado. El orden de los tres
          elementos en el JSX es lo que determina dónde caen con el
          auto-placement de CSS Grid (fila por fila, columna por columna,
          saltando las celdas ya ocupadas por el row-span de la izquierda). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card
          className="lg:row-span-2"
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
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">
              {delitosPermitidos ? 'Ningún delito coincide con el filtro seleccionado.' : 'Sin datos suficientes para comparar.'}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard titulo={`Total general de casos (${ventana.anioActual})`} valor={formatNumero(kpisVigenciaActual.totalCasos)} subtitulo={`${formatNumero(kpisVigenciaActual.totalRegistros)} registros`} icono={<Layers size={16} />} acento="navy" />
            <KpiCard titulo="Delito con mayor incidencia" valor={kpisVigenciaActual.delitoTop?.key ?? '—'} subtitulo={kpisVigenciaActual.delitoTop ? `${formatNumero(kpisVigenciaActual.delitoTop.casos)} casos (${formatDecimal(kpisVigenciaActual.participacionDelitoTop)}%)` : undefined} icono={<ShieldAlert size={16} />} acento="red" />
            <KpiCard titulo="Estación con mayor incidencia" valor={kpisVigenciaActual.estacionTop?.key ?? '—'} subtitulo={kpisVigenciaActual.estacionTop ? `${formatNumero(kpisVigenciaActual.estacionTop.casos)} casos` : undefined} icono={<Building2 size={16} />} acento="navy" />
            <KpiCard titulo="Barrio con mayor incidencia" valor={kpisVigenciaActual.barrioTop?.key ?? '—'} subtitulo={kpisVigenciaActual.barrioTop ? `${formatNumero(kpisVigenciaActual.barrioTop.casos)} casos` : undefined} icono={<MapPin size={16} />} acento="green" />
          </div>
          <div className="flex-1">
            <InsightList insights={hallazgos} titulo="Principales hallazgos" />
          </div>
        </div>

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
