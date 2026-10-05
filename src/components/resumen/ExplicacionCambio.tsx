import { useState } from 'react';
import { Card } from '../ui/Card';
import { formatNumero, formatDecimal } from '../../utils/aggregations';
import type { DescomposicionCambio } from '../../analitica/cambio';

// "¿Qué está explicando el cambio?" — cada delito con su variación propia
// (frente a sí mismo) y su APORTE al cambio total (qué parte del aumento o
// reducción del total explica). Son métricas distintas: un delito puede
// subir 80 % y aportar poco si es pequeño, o subir 10 % y explicar casi
// todo el cambio si es grande. Fórmulas en analitica/cambio.ts.
export function ExplicacionCambio({ cambio, anioAnterior, anioActual, className }: { cambio: DescomposicionCambio; anioAnterior: number; anioActual: number; className?: string }) {
  const [verTodos, setVerTodos] = useState(false);
  const conCambio = cambio.filas.filter((f) => f.diferencia !== 0);
  const filas = verTodos ? conCambio : conCambio.slice(0, 8);
  const maxAbs = Math.max(1, ...conCambio.map((f) => Math.abs(f.aportePct ?? 0)));
  const pct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : ''}${formatDecimal(n, 1)} %`);

  return (
    <Card
      title="¿Qué está explicando el cambio?"
      subtitle={`${anioAnterior} vs. ${anioActual}, mismo periodo — ordenado por impacto en el total`}
      descargable="explicacion-cambio"
      className={className}
    >
      {cambio.diferenciaTotal === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">El total no cambió entre los dos periodos: no hay cambio que repartir entre delitos.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-2 text-left font-semibold">Delito</th>
                  <th className="px-2 py-1.5 text-right font-semibold">{anioAnterior}</th>
                  <th className="px-2 py-1.5 text-right font-semibold">{anioActual}</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Dif.</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Var. %</th>
                  <th className="w-[34%] py-1.5 pl-3 text-left font-semibold">Aporte al cambio total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const sube = f.diferencia > 0;
                  const ancho = Math.min(100, (Math.abs(f.aportePct ?? 0) / maxAbs) * 100);
                  return (
                    <tr key={f.clave} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{f.clave}</td>
                      <td className="px-2 py-1.5 text-right text-slate-500">{formatNumero(f.anterior)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-700">{formatNumero(f.actual)}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${sube ? 'text-rose-600' : 'text-emerald-600'}`}>{sube ? '+' : ''}{formatNumero(f.diferencia)}</td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{f.variacionPct === null ? <span title="Sin casos en el periodo anterior">nuevo</span> : pct(f.variacionPct)}</td>
                      <td className="py-1.5 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${sube ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${ancho}%` }} />
                          </div>
                          <span className={`w-16 shrink-0 whitespace-nowrap text-right font-semibold ${sube ? 'text-orange-700' : 'text-emerald-700'}`}>{pct(f.aportePct)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-semibold">
                  <td className="py-1.5 pr-2 text-slate-800">Total</td>
                  <td className="px-2 py-1.5 text-right">{formatNumero(cambio.totalAnterior)}</td>
                  <td className="px-2 py-1.5 text-right">{formatNumero(cambio.totalActual)}</td>
                  <td className={`px-2 py-1.5 text-right ${cambio.diferenciaTotal > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{cambio.diferenciaTotal > 0 ? '+' : ''}{formatNumero(cambio.diferenciaTotal)}</td>
                  <td className="px-2 py-1.5 text-right">{pct(cambio.variacionTotalPct)}</td>
                  <td className="py-1.5 pl-3 text-right text-slate-700">100 %</td>
                </tr>
              </tbody>
            </table>
          </div>
          {conCambio.length > 8 && (
            <button onClick={() => setVerTodos((v) => !v)} className="mt-2 text-xs font-semibold text-brand-green hover:underline">
              {verTodos ? 'Ver solo los 8 de mayor impacto' : `Ver los ${conCambio.length} delitos con cambio`}
            </button>
          )}
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            <b>Var. %</b> = cuánto cambió el delito frente a sí mismo. <b>Aporte</b> = qué parte del cambio total ({cambio.diferenciaTotal > 0 ? '+' : ''}{formatNumero(cambio.diferenciaTotal)} casos) explica ese delito; los aportes suman 100 %.
            Si unos delitos suben y otros bajan, uno puede aportar más de 100 % y los que bajan aportan en negativo.
          </p>
        </>
      )}
    </Card>
  );
}
