import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { formatNumero, formatDecimal } from '../../utils/aggregations';
import { maxDe } from '../../utils/mathSeguro';

const CLAVE_LOCALSTORAGE = 'mepoy-operatividad-2025-manual';

function cargarValoresManuales(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CLAVE_LOCALSTORAGE) || '{}'); } catch { return {}; }
}

/**
 * "Comparativo de Operatividad" — mismo formato visual que
 * ComparativoCategoriaTable (Categoría | 2025 | 2026 | DIF | % | Aporte %),
 * pero con el 2025 EDITABLE por fila: Operatividad normalmente solo trae
 * el año en curso, sin histórico, así que no hay de dónde calcular ese
 * valor solo — se escribe una vez por categoría y queda guardado en este
 * navegador (ver CLAVE_LOCALSTORAGE). El resto (DIF, %, Aporte) se
 * recalcula solo.
 */
export function ComparativoOperatividadTable({ data, anioActual }: { data: { key: string; casos: number }[]; anioActual: number }) {
  const [valores2025, setValores2025] = useState<Record<string, number>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState('');

  useEffect(() => { setValores2025(cargarValoresManuales()); }, []);

  function guardar(key: string) {
    const n = parseInt(texto, 10);
    if (Number.isFinite(n) && n >= 0) {
      const actualizado = { ...valores2025, [key]: n };
      setValores2025(actualizado);
      localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(actualizado));
    }
    setEditando(null);
  }

  const filas = data.map((d) => {
    const v2025 = valores2025[d.key];
    const dif = v2025 != null ? d.casos - v2025 : null;
    const pct = v2025 != null && v2025 > 0 ? (dif! / v2025) * 100 : null;
    return { ...d, v2025, dif, pct };
  });
  const totalActual = filas.reduce((a, f) => a + f.casos, 0);
  const maxAporte = maxDe([...filas.map((f) => (totalActual > 0 ? (f.casos / totalActual) * 100 : 0)), 1]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-400">
            <th className="pb-2 text-left font-medium">Categoría</th>
            <th className="pb-2 text-right font-medium">2025</th>
            <th className="pb-2 text-right font-medium">{anioActual}</th>
            <th className="pb-2 text-right font-medium">DIF</th>
            <th className="pb-2 text-right font-medium">%</th>
            <th className="pb-2 text-right font-medium">Aporte %</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const aportePct = totalActual > 0 ? (f.casos / totalActual) * 100 : 0;
            const color = f.dif == null ? 'text-slate-400' : f.dif > 0 ? 'text-rose-600' : f.dif < 0 ? 'text-emerald-600' : 'text-slate-400';
            return (
              <tr key={f.key} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 pr-2 text-xs text-slate-700">{f.key}</td>
                <td className="py-1.5 text-right text-xs">
                  {editando === f.key ? (
                    <input
                      autoFocus type="number" value={texto} onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && guardar(f.key)} onBlur={() => guardar(f.key)}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right"
                    />
                  ) : (
                    <button onClick={() => { setTexto(String(f.v2025 ?? '')); setEditando(f.key); }} className="inline-flex items-center gap-0.5 text-slate-500 hover:text-brand-navy">
                      {f.v2025 ?? '—'}<Pencil size={9} className="text-slate-300" />
                    </button>
                  )}
                </td>
                <td className="py-1.5 text-right text-xs font-semibold text-slate-800">{formatNumero(f.casos)}</td>
                <td className={`py-1.5 text-right text-xs font-semibold ${color}`}>{f.dif == null ? 'N/A' : `${f.dif >= 0 ? '+' : ''}${formatNumero(f.dif)}`}</td>
                <td className={`py-1.5 text-right text-xs font-semibold ${color}`}>{f.pct == null ? 'N/A' : `${f.pct >= 0 ? '+' : ''}${formatDecimal(f.pct, 1)}%`}</td>
                <td className="py-1.5 pl-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${(aportePct / maxAporte) * 100}%` }} />
                    </div>
                    <span className="w-9 shrink-0 text-right text-[11px] text-slate-500">{formatDecimal(aportePct, 1)}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-slate-400">Clic en el valor de 2025 (o en "—") para escribirlo — Operatividad no trae histórico completo, así que ese valor se ingresa a mano.</p>
    </div>
  );
}
