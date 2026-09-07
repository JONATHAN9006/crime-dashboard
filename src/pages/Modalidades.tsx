import { useData } from '../context/DataContext';
import { useRanking } from '../hooks/useTerritorialAnalysis';
import { Card, PageHeader } from '../components/ui/Card';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';
import { RankingTable } from '../components/tables/RankingTable';

export function Modalidades() {
  const { filteredRecords, filters, drillDown } = useData();
  const porModalidad = useRanking(filteredRecords, (r) => r.modalidad, 10);

  // Cruce modalidad x delito, sólo si hay un delito o modalidad seleccionados (evita tablas gigantes)
  const cruceActivo = filters.delito.length > 0 || filters.modalidad.length > 0;
  const cruce = useRanking(
    filteredRecords,
    (r) => `${r.modalidad} — ${r.delito}`,
    15,
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Modalidad Delictiva" subtitle="Top 10 modalidades y cruce con el tipo de delito." />

      <Card title="Top 10 modalidades">
        <HorizontalBarChart data={porModalidad} color="#116762" onBarClick={(key) => drillDown('modalidad', key)} />
      </Card>

      <Card
        title="Cruce Modalidad × Delito"
        subtitle={cruceActivo ? 'Filtrado por la selección activa' : 'Selecciona un delito o modalidad en los filtros para un cruce más específico'}
      >
        <RankingTable data={cruce} etiqueta="Modalidad — Delito" />
      </Card>
    </div>
  );
}
