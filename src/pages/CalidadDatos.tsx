import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Card, PageHeader } from '../components/ui/Card';
import { formatDecimal, formatNumero } from '../utils/aggregations';

export function CalidadDatos() {
  const { meta } = useData();
  if (!meta) return null;
  const c = meta.calidad;

  const filas = [
    { label: 'Fechas inválidas o vacías', valor: c.fechaInvalida },
    { label: 'Registros sin delito identificado', valor: c.sinDelito },
    { label: 'Registros sin barrio identificado', valor: c.sinBarrio },
    { label: 'Registros sin cantidad (CANTIDAD = 0)', valor: c.sinCantidad },
    { label: 'Registros con algún campo "NO REPORTADO" clave', valor: c.noReportadoCount },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Calidad de Datos" subtitle="Indicadores de completitud e integridad del dataset cargado." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex flex-col items-center justify-center py-8 text-center" descargable="registros-validos">
          <p className="text-4xl font-bold text-brand-green">{formatDecimal(c.porcentajeValidos)}%</p>
          <p className="mt-1 text-sm text-slate-500">de registros válidos</p>
        </Card>
        <Card className="flex flex-col items-center justify-center py-8 text-center" descargable="registros-totales-evaluados">
          <p className="text-4xl font-bold text-slate-800">{formatNumero(c.totalRegistros)}</p>
          <p className="mt-1 text-sm text-slate-500">registros totales evaluados</p>
        </Card>
        <Card className="flex flex-col items-center justify-center py-8 text-center" descargable="columnas-no-mapeadas">
          <p className="text-4xl font-bold text-amber-500">{meta.columnasDesconocidas.length}</p>
          <p className="mt-1 text-sm text-slate-500">columnas no mapeadas (conservadas para uso futuro)</p>
        </Card>
      </div>

      <Card title="Detalle de inconsistencias detectadas" descargable="inconsistencias-detectadas">
        <ul className="divide-y divide-slate-100">
          {filas.map((f) => (
            <li key={f.label} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                {f.valor > 0 ? <AlertCircle size={15} className="text-amber-500" /> : <CheckCircle2 size={15} className="text-emerald-500" />}
                {f.label}
              </span>
              <span className="font-semibold text-slate-800">{formatNumero(f.valor)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {meta.columnasDesconocidas.length > 0 && (
        <Card title="Columnas presentes en el archivo pero no utilizadas activamente" subtitle="Se conservan en cada registro para poder incorporarlas en análisis futuros sin perder información" descargable="columnas-no-utilizadas">
          <div className="flex flex-wrap gap-1.5">
            {meta.columnasDesconocidas.map((col) => (
              <span key={col} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{col}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
