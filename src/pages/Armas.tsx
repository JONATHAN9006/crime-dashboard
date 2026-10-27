import { useData } from '../context/DataContext';
import { useRanking } from '../hooks/useTerritorialAnalysis';
import { Card, PageHeader } from '../components/ui/Card';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { DonutChart } from '../components/charts/DonutChart';
import { formatDecimal, formatNumero } from '../utils/aggregations';

export function Armas() {
  const { filteredRecords, drillDown } = useData();
  const porArma = useRanking(filteredRecords, (r) => r.armas);

  return (
    <div className="space-y-5">
      <PageHeader title="Armas" subtitle="Distribución de casos según el arma o medio empleado. Puedes cruzar con delito y estación desde el panel de filtros." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Distribución por tipo de arma">
          <HorizontalBarChart data={porArma.slice(0, 12)} color="#116762" onBarClick={(key) => drillDown('armas', key)} />
        </Card>
        <Card title="Participación porcentual">
          <DonutChart data={porArma.slice(0, 7)} />
          <div className="mt-3 space-y-1.5">
            {porArma.slice(0, 7).map((a) => (
              <div key={a.key} className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate">{a.key}</span>
                <span>{formatNumero(a.casos)} ({formatDecimal(a.participacion)}%)</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
