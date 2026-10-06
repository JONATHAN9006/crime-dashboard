import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Ranking compacto con el estilo de la imagen de referencia de "Análisis
// por Unidad": encabezado (NOMBRE · CASOS · APORTE), barra horizontal
// verde petróleo proporcional a los casos, casos en negrilla y aporte en
// gris. Filas de ~28 px. Solo presenta: recibe las cifras ya calculadas
// (las mismas que antes mostraba AporteBarList), no calcula nada.
export function RankingAporte({ data, cabeza, onClick }: {
  data: { key: string; casos: number; aportePct: number }[];
  cabeza: string;
  onClick?: (key: string) => void;
}) {
  const max = Math.max(1, ...data.map((d) => d.casos));
  if (data.length === 0) return <p className="py-4 text-center text-sm text-slate-400">Sin datos.</p>;
  return (
    <table className="w-full table-fixed text-[12.5px]">
      <colgroup>
        <col className="w-[42%]" />
        <col />
        <col className="w-[50px]" />
        <col className="w-[46px]" />
      </colgroup>
      <thead>
        <tr className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          <th className="pb-1 text-left font-semibold">{cabeza}</th>
          <th />
          <th className="pb-1 text-right font-semibold">Casos</th>
          <th className="pb-1 text-right font-semibold">Aporte</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d, i) => (
          <tr key={d.key} onClick={() => onClick?.(d.key)} className={onClick ? 'cursor-pointer hover:bg-slate-50' : undefined}>
            <td className="truncate py-[5px] pr-2 text-slate-700" title={d.key}>{d.key}</td>
            <td className="py-[5px] pr-2">
              <div className="h-2.5 w-full overflow-hidden rounded-sm bg-slate-100">
                <div
                  className="h-full rounded-sm"
                  style={{ width: `${Math.max(3, (d.casos / max) * 100)}%`, background: i === 0 ? 'linear-gradient(90deg,#0b5e57,#159089)' : 'linear-gradient(90deg,#159089,#3fb8a8)' }}
                />
              </div>
            </td>
            <td className="py-[5px] text-right font-bold text-[#10233f]">{formatNumero(d.casos)}</td>
            <td className="py-[5px] text-right text-slate-500">{formatDecimal(d.aportePct, 1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
