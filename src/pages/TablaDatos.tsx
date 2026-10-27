import { useData } from '../context/DataContext';
import { Card, PageHeader } from '../components/ui/Card';
import { DataTable } from '../components/tables/DataTable';

export function TablaDatos() {
  const { filteredRecords } = useData();
  return (
    <div className="space-y-5">
      <PageHeader title="Tabla de Datos" subtitle="Tabla analítica avanzada con búsqueda, orden, paginación y selección de columnas." />
      <Card>
        <DataTable records={filteredRecords} />
      </Card>
    </div>
  );
}
