import { useState } from 'react';
import { Info } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useVentanaComparativa, useComparativoGeneral, useComparativoCategoria } from '../hooks/useComparativoHomologo';
import { useTendenciaMensual } from '../hooks/useTemporalAnalysis';
import { Card, PageHeader, EmptyState } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { VariationTable } from '../components/tables/VariationTable';
import { formatFecha, formatNumero, formatPct } from '../utils/aggregations';

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
  const { records, filteredRecords, recordsBase, filters, meta } = useData();
  const [dimension, setDimension] = useState<(typeof DIMENSIONES)[number]['key']>('mes');
  const mensual = useTendenciaMensual(filteredRecords);

  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const cmp = useComparativoGeneral(ventana);
  const porDelito = useComparativoCategoria(ventana, (r) => r.delito, 15);
  const porEstacion = useComparativoCategoria(ventana, (r) => r.estacion, 15);

  if (!ventana.disponible) {
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
      <PageHeader title="Comparativo de Vigencias" subtitle={`Comparación homóloga entre ${anterior} y ${actual}, detectada automáticamente a partir de los datos.`} />

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0 text-brand-navy" />
        <p>
          {ventana.esRangoPersonalizado
            ? <>Comparando {formatFecha(ventana.actualInicio)}–{formatFecha(ventana.actualFin)} ({actual}) contra el mismo rango de {anterior}: {formatFecha(ventana.anteriorInicio)}–{formatFecha(ventana.anteriorFin)}.</>
            : <>Se compara el 01/01–{formatFecha(ventana.actualFin)} de {actual} contra el mismo rango de {anterior}, para no comparar un año completo contra uno parcial.</>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo={`Total ${anterior} (a la fecha)`} valor={formatNumero(cmp.casosAnterior)} acento="gray" />
        <KpiCard titulo={`Total ${actual} (a la fecha)`} valor={formatNumero(cmp.casosActual)} acento="navy" />
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
