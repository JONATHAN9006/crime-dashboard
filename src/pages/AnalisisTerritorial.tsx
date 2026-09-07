import { useData } from '../context/DataContext';
import { useRanking, useUrbanoRural } from '../hooks/useTerritorialAnalysis';
import { Card, PageHeader } from '../components/ui/Card';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { RankingTable } from '../components/tables/RankingTable';
import { DonutChart } from '../components/charts/DonutChart';
import { formatDecimal, formatNumero } from '../utils/aggregations';

export function AnalisisTerritorial() {
  const { filteredRecords, drillDown } = useData();
  const porCai = useRanking(filteredRecords, (r) => r.cai);
  const porCuadrante = useRanking(filteredRecords, (r) => r.cuadrante, 10);
  const porBarrio = useRanking(filteredRecords, (r) => r.barrioHecho, 10);
  const urbanoRural = useUrbanoRural(filteredRecords);

  return (
    <div className="space-y-5">
      <PageHeader title="Análisis Territorial" subtitle="CAI, cuadrante, barrio y distribución urbano/rural." />

      <Card title="Ranking de CAI">
        <HorizontalBarChart data={porCai} color="#116762" onBarClick={(key) => drillDown('cai', key)} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top 10 cuadrantes con mayor incidencia">
          <RankingTable data={porCuadrante} etiqueta="Cuadrante" onRowClick={(key) => drillDown('cuadrante', key)} />
        </Card>
        <Card title="Top 10 barrios con mayor incidencia">
          <RankingTable data={porBarrio} etiqueta="Barrio" onRowClick={(key) => drillDown('barrioHecho', key)} />
        </Card>
      </div>

      <Card title="Urbano vs Rural" subtitle="Distribución por zona del hecho">
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-2">
          <DonutChart data={urbanoRural} />
          <div className="space-y-2">
            {urbanoRural.map((z) => (
              <div key={z.key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm font-medium text-slate-700">{z.key}</span>
                <span className="text-sm text-slate-500">{formatNumero(z.casos)} casos · {formatDecimal(z.participacion)}%</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
