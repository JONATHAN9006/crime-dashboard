import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useVentanaComparativa, useComparativoGeneral, useComparativoCategoria, type VentanaComparativa } from '../hooks/useComparativoHomologo';
import { useTendenciaMensual } from '../hooks/useTemporalAnalysis';
import { Card, PageHeader, EmptyState } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { VariationTable } from '../components/tables/VariationTable';
import { formatFecha, formatNumero, formatPct } from '../utils/aggregations';
import { ComparativoMultifecha } from './ComparativoMultifecha';
import { IndicadorVigencia } from '../components/filters/IndicadorVigencia';

const DIMENSIONES = [
  { key: 'mes', label: 'Mes' },
  { key: 'delito', label: 'Delito' },
  { key: 'estacion', label: 'Estación' },
] as const;

// Esta página usa exclusivamente el motor homólogo centralizado
// (hooks/useComparativoHomologo.ts) — el mismo que usan Indicadores, Análisis
// por Unidad — para garantizar que "Total 2025",
// "Total 2026" etc. muestren siempre la misma cifra en todo el dashboard.
export function Comparativo() {
  const { records, filteredRecords, recordsBase, filters, meta, periodos } = useData();
  const [dimension, setDimension] = useState<(typeof DIMENSIONES)[number]['key']>('mes');
  const mensual = useTendenciaMensual(filteredRecords);

  const ventanaAutomatica = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);

  // Selector manual de 2 años — por defecto usa la ventana automática (los
  // 2 años homólogos más recientes, "a la fecha"). Si el usuario elige
  // años DISTINTOS a esos, se arma una comparación de AÑO CALENDARIO
  // COMPLETO para cada uno (no tendría sentido un corte "a la fecha" para
  // años que ya terminaron hace tiempo).
  const aniosDisponibles = useMemo(() => [...(meta?.aniosDisponibles ?? [])].map(Number).filter((n) => !isNaN(n)).sort((a, b) => a - b), [meta]);
  const [anioA, setAnioA] = useState<number | null>(null);
  const [anioB, setAnioB] = useState<number | null>(null);

  const usaSeleccionManual = anioA !== null && anioB !== null && (anioA !== ventanaAutomatica.anioAnterior || anioB !== ventanaAutomatica.anioActual);

  const ventanaManual: VentanaComparativa | null = useMemo(() => {
    if (!usaSeleccionManual || anioA === null || anioB === null) return null;
    const [anioMenor, anioMayor] = anioA < anioB ? [anioA, anioB] : [anioB, anioA];
    const recsActual = recordsBase.filter((r) => r.anio === anioMayor);
    const recsAnterior = recordsBase.filter((r) => r.anio === anioMenor);
    return {
      disponible: true,
      actualInicio: new Date(anioMayor, 0, 1),
      actualFin: new Date(anioMayor, 11, 31, 23, 59, 59, 999),
      anteriorInicio: new Date(anioMenor, 0, 1),
      anteriorFin: new Date(anioMenor, 11, 31, 23, 59, 59, 999),
      anioActual: anioMayor,
      anioAnterior: anioMenor,
      esRangoPersonalizado: true,
      diasTranscurridos: 365,
      recsActual,
      recsAnterior,
      recsAnioAnteriorCompleto: recsAnterior,
    };
  }, [usaSeleccionManual, anioA, anioB, recordsBase]);

  const ventana = ventanaManual ?? ventanaAutomatica;
  const cmp = useComparativoGeneral(ventana);
  const porDelito = useComparativoCategoria(ventana, (r) => r.delito, 15);
  const porEstacion = useComparativoCategoria(ventana, (r) => r.estacion, 15);

  // El comparativo homólogo (año actual vs año anterior) no tiene sentido
  // cuando hay periodos de análisis multifecha activos — en ese caso se
  // muestra la vista de periodos en su lugar. IMPORTANTE: esta condición
  // va DESPUÉS de todos los hooks de arriba (nunca antes), para no violar
  // las reglas de hooks de React al alternar entre los dos modos.
  if (periodos.length > 0) {
    return <ComparativoMultifecha />;
  }

  if (!ventanaAutomatica.disponible) {
    return (
      <div>
        <PageHeader title="Comparativo de Vigencias" />
        <EmptyState mensaje="Se requiere información con fecha válida para generar el comparativo." />
      </div>
    );
  }

  const { anioActual: actual, anioAnterior: anterior } = ventana;

  const datosGrafico = dimension === 'mes' ? mensual.map((m) => ({ x: m.mes, [String(anterior)]: m[String(anterior)] || 0, [String(actual)]: m[String(actual)] || 0 })) :
    dimension === 'delito' ? porDelito.map((d) => ({ x: d.key, [String(anterior)]: d.anterior, [String(actual)]: d.actual })) :
    porEstacion.map((d) => ({ x: d.key, [String(anterior)]: d.anterior, [String(actual)]: d.actual }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comparativo de Vigencias"
        subtitle={`Comparación homóloga entre ${anterior} y ${actual}, detectada automáticamente a partir de los datos.`}
      />
      <IndicadorVigencia ventana={ventana} />

      {aniosDisponibles.length > 2 && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-slate-700">Comparar años específicos:</p>
            <select
              value={anioA ?? ventanaAutomatica.anioAnterior}
              onChange={(e) => setAnioA(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <span className="text-sm text-slate-400">vs.</span>
            <select
              value={anioB ?? ventanaAutomatica.anioActual}
              onChange={(e) => setAnioB(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {usaSeleccionManual && (
              <button
                onClick={() => { setAnioA(null); setAnioB(null); }}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Volver al automático ({ventanaAutomatica.anioAnterior}-{ventanaAutomatica.anioActual})
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0 text-brand-navy" />
        <p>
          {usaSeleccionManual
            ? <>Comparando el año calendario completo de {anterior} contra el de {actual} (01/01–31/12 en ambos).</>
            : ventana.esRangoPersonalizado
            ? <>Comparando {formatFecha(ventana.actualInicio)}–{formatFecha(ventana.actualFin)} ({actual}) contra el mismo rango de {anterior}: {formatFecha(ventana.anteriorInicio)}–{formatFecha(ventana.anteriorFin)}.</>
            : <>Se compara el 01/01–{formatFecha(ventana.actualFin)} de {actual} contra el mismo rango de {anterior}, para no comparar un año completo contra uno parcial.</>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo={`Total ${anterior}${usaSeleccionManual ? '' : ' (a la fecha)'}`} valor={formatNumero(cmp.casosAnterior)} acento="gray" />
        <KpiCard titulo={`Total ${actual}${usaSeleccionManual ? '' : ' (a la fecha)'}`} valor={formatNumero(cmp.casosActual)} acento="navy" />
        <KpiCard
          titulo="Diferencia absoluta"
          valor={`${cmp.variacionAbs >= 0 ? '+' : ''}${formatNumero(cmp.variacionAbs)}`}
          acento={cmp.variacionAbs > 0 ? 'red' : 'green'}
          colorValor={cmp.variacionAbs > 0 ? 'red' : 'green'}
        />
        <KpiCard
          titulo="Variación %"
          valor={formatPct(cmp.variacionPct)}
          tendencia={{ pct: cmp.variacionPct }}
          acento={cmp.variacionPct !== null && cmp.variacionPct > 0 ? 'red' : 'green'}
          colorValor={cmp.variacionPct !== null && cmp.variacionPct > 0 ? 'red' : 'green'}
        />
      </div>

      <Card
        title={`${anterior} vs ${actual} por ${DIMENSIONES.find((d) => d.key === dimension)?.label}`}
        descargable="comparativo-por-dimension"
        actions={
          <div className="flex gap-1">
            {DIMENSIONES.map((d) => (
              <button
                key={d.key}
                onClick={() => setDimension(d.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${dimension === d.key ? 'bg-brand-green text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
      >
        <GroupedBarChart
          data={datosGrafico}
          xKey="x"
          seriesKeys={[String(anterior), String(actual)]}
          height={Math.max(300, datosGrafico.length * 15)}
          horizontal={dimension !== 'mes'}
          seriesColors={{ [String(anterior)]: '#94a3b8', [String(actual)]: '#159089' }}
          resaltarMaximo
        />
      </Card>

      <Card title="Análisis de variación por delito" subtitle="Ordenable de mayor aumento a mayor disminución, a la fecha" descargable="variacion-por-delito">
        <VariationTable data={porDelito} etiqueta="Delito" anioActual={actual} anioAnterior={anterior} />
      </Card>

      <Card title="Análisis de variación por estación" subtitle="A la fecha" descargable="variacion-por-estacion">
        <VariationTable data={porEstacion} etiqueta="Estación" anioActual={actual} anioAnterior={anterior} />
      </Card>
    </div>
  );
}
