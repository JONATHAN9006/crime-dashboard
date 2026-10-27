import { formatDecimal, formatNumero } from '../../utils/aggregations';

interface RankingRow {
  posicion: number;
  key: string;
  casos: number;
  registros: number;
  participacion: number;
}

export function RankingTable({ data, etiqueta, onRowClick, metrica = 'casos' }: {
  data: RankingRow[];
  etiqueta: string;
  onRowClick?: (key: string) => void;
  metrica?: 'casos' | 'registros';
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2 pr-2 w-10">#</th>
            <th className="py-2 pr-2">{etiqueta}</th>
            <th className="py-2 pr-2 text-right">Casos</th>
            <th className="py-2 pr-2 text-right">Registros</th>
            <th className="py-2 pr-2 text-right">Participación</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.key}
              onClick={() => onRowClick?.(row.key)}
              className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
            >
              <td className="py-2 pr-2 text-slate-400">{row.posicion}</td>
              <td className="py-2 pr-2 font-medium text-slate-800">{row.key}</td>
              <td className="py-2 pr-2 text-right font-semibold text-slate-900">{formatNumero(row[metrica])}</td>
              <td className="py-2 pr-2 text-right text-slate-500">{formatNumero(row.registros)}</td>
              <td className="py-2 pr-2 text-right text-slate-500">{formatDecimal(row.participacion)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
