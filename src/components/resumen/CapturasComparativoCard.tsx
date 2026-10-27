import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Pencil } from 'lucide-react';
import { Card } from '../ui/Card';
import { formatNumero, formatDecimal } from '../../utils/aggregations';

const CLAVE_LOCALSTORAGE = 'mepoy-capturas-2025-manual';

/**
 * "Capturas" al lado de "Comparativo de delitos" — a pedido explícito.
 * Operatividad, a diferencia de Delictividad, normalmente solo trae el año
 * en curso (no un histórico completo), así que no hay de dónde calcular
 * "Total 2025" solo — se deja un campo para escribirlo a mano UNA vez
 * (queda guardado en este navegador) y el resto (DIF, %, Aporte) se
 * calcula solo a partir de ahí.
 */
export function CapturasComparativoCard({ totalCapturas2026, totalOperatividad2026 }: { totalCapturas2026: number; totalOperatividad2026: number }) {
  const [total2025, setTotal2025] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [valorTexto, setValorTexto] = useState('');

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE);
    if (guardado) setTotal2025(Number(guardado));
  }, []);

  function guardar() {
    const n = parseInt(valorTexto, 10);
    if (Number.isFinite(n) && n >= 0) {
      setTotal2025(n);
      localStorage.setItem(CLAVE_LOCALSTORAGE, String(n));
    }
    setEditando(false);
  }

  const dif = total2025 != null ? totalCapturas2026 - total2025 : null;
  const pct = total2025 != null && total2025 > 0 ? (dif! / total2025) * 100 : null;
  const aportePct = totalOperatividad2026 > 0 ? (totalCapturas2026 / totalOperatividad2026) * 100 : 0;
  const Icono = dif == null ? Minus : dif > 0 ? TrendingUp : dif < 0 ? TrendingDown : Minus;
  const color = dif == null ? 'text-slate-400' : dif > 0 ? 'text-rose-600' : dif < 0 ? 'text-emerald-600' : 'text-slate-400';

  return (
    <Card title="Capturas" subtitle="Operatividad — año anterior vs. actual" descargable="capturas-resumen">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 p-2">
            {editando ? (
              <div className="flex items-center justify-center gap-1">
                <input
                  autoFocus
                  type="number"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && guardar()}
                  onBlur={guardar}
                  className="w-16 rounded border border-slate-300 px-1 py-0.5 text-center text-sm"
                />
              </div>
            ) : (
              <button onClick={() => { setValorTexto(String(total2025 ?? '')); setEditando(true); }} className="group flex w-full items-center justify-center gap-1 text-lg font-bold text-slate-700 hover:text-brand-navy">
                {total2025 != null ? formatNumero(total2025) : '—'}
                <Pencil size={11} className="text-slate-300 group-hover:text-brand-navy" />
              </button>
            )}
            <p className="text-[10px] text-slate-500">Total 2025 (manual)</p>
          </div>
          <div className="rounded-lg bg-brand-navy/5 p-2">
            <p className="text-lg font-bold text-brand-navy">{formatNumero(totalCapturas2026)}</p>
            <p className="text-[10px] text-slate-500">Total 2026 (a la fecha)</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className={color}>
            <span className="block text-[10px] text-slate-400">DIF</span>
            <span className="inline-flex items-center gap-0.5 font-semibold"><Icono size={11} />{dif == null ? 'N/A' : `${dif >= 0 ? '+' : ''}${formatNumero(dif)}`}</span>
          </div>
          <div className={color}>
            <span className="block text-[10px] text-slate-400">%</span>
            <span className="font-semibold">{pct == null ? 'N/A' : `${pct >= 0 ? '+' : ''}${formatDecimal(pct, 1)}%`}</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-400">Aporte %</span>
            <span className="font-semibold text-slate-700">{formatDecimal(aportePct, 1)}%</span>
          </div>
        </div>
        {total2025 == null && <p className="text-center text-[10px] text-slate-400">Escribe el total de 2025 (clic en "—") para ver DIF y %.</p>}
      </div>
    </Card>
  );
}
