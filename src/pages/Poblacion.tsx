import { useData } from '../context/DataContext';
import { useRanking } from '../hooks/useTerritorialAnalysis';
import { Card, PageHeader } from '../components/ui/Card';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { DonutChart } from '../components/charts/DonutChart';

export function Poblacion() {
  const { filteredRecords, drillDown } = useData();
  const porGenero = useRanking(filteredRecords, (r) => r.genero);
  const porEdad = useRanking(filteredRecords, (r) => r.grupoEdad);

  return (
    <div className="space-y-5">
      <PageHeader title="Población" subtitle="Distribución por género y grupo de edad. Cruza con delito, estación o año desde el panel de filtros." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Distribución por género">
          <DonutChart data={porGenero} />
        </Card>
        <Card title="Distribución por grupo de edad">
          <HorizontalBarChart data={porEdad} color="#116762" onBarClick={(key) => drillDown('grupoEdad', key)} />
        </Card>
      </div>
    </div>
  );
}
