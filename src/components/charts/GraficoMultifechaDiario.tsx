import { useEffect, useRef, useState } from 'react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

// Comportamiento DIARIO de cada periodo multifecha, uno al lado del otro
// (como el gráfico institucional de jornadas: Carnaval, Semana Santa…):
//  · una línea por periodo con los casos de cada día encima del punto;
//  · el día con MÁS casos de cada periodo en rojo;
//  · franja amarilla = promedio diario de todos los periodos;
//  · debajo, los días (Sáb 2, Dom 3…) y el nombre del periodo con su total.
// Solo usa los casos reales de cada día (los días sin casos valen 0).

export interface DiaPeriodo { fecha: Date; casos: number }
export interface SeriePeriodo { id: string; etiqueta: string; total: number; dias: DiaPeriodo[] }

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sep.', 'Oct.', 'Nov.', 'Dic.'];

export function etiquetaPeriodo(inicio: Date, fin: Date): string {
  const a = `${MESES_CORTOS[inicio.getMonth()]} ${inicio.getFullYear()}`;
  const b = `${MESES_CORTOS[fin.getMonth()]} ${fin.getFullYear()}`;
  return a === b ? a : `${a} – ${b}`;
}

export function GraficoMultifechaDiario({ series, alto = 300 }: { series: SeriePeriodo[]; alto?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const conDias = series.filter((s) => s.dias.length > 0);
  if (conDias.length === 0) return <div ref={ref} className="w-full"><p className="py-8 text-center text-sm text-slate-400">Define al menos un periodo con fecha inicial y final.</p></div>;

  const totalDias = conDias.reduce((a, s) => a + s.dias.length, 0);
  const huecos = conDias.length - 1;
  const izq = 12;
  const der = 12;
  const paso = (ancho - izq - der) / (totalDias + huecos * 0.8);
  const todos = conDias.flatMap((s) => s.dias.map((d) => d.casos));
  const max = Math.max(1, ...todos);
  const promedio = todos.reduce((a, v) => a + v, 0) / todos.length;

  const arriba = 34; // espacio para la cifra del punto más alto
  const altoTrazo = Math.max(120, alto - 130);
  const abajoTrazo = arriba + altoTrazo;
  const y = (v: number) => abajoTrazo - (v / max) * altoTrazo;
  const etiquetasDia = paso >= 15; // si los días quedan muy juntos, no se rotulan uno por uno
  const cadaN = etiquetasDia ? 1 : Math.ceil(15 / paso);
  const tamValor = Math.max(9.5, Math.min(13, paso * 0.5));
  const yDias = abajoTrazo + 10;
  const yPeriodo = yDias + 56;

  const inicios = conDias.map((_, i) => izq + conDias.slice(0, i).reduce((a, x) => a + paso * x.dias.length + paso * 0.8, 0));
  const bloques = conDias.map((s, si) => {
    const x0 = inicios[si];
    const puntos = s.dias.map((d, i) => ({ ...d, x: x0 + paso * (i + 0.5), y: y(d.casos) }));
    const maxPeriodo = Math.max(...s.dias.map((d) => d.casos));
    return { s, x0, x1: x0 + paso * s.dias.length, puntos, maxPeriodo };
  });
  const altoTotal = yPeriodo + 34;

  return (
    <div ref={ref} className="w-full">
      <div className="hidden">
        <span data-export-leyenda-item data-color="#dc2626">Día con más casos del periodo</span>
        <span data-export-leyenda-item data-color="#eab308">Promedio diario</span>
      </div>
      <svg width={ancho} height={altoTotal} role="img" aria-label="Casos por día en cada periodo">
        {/* Franja del promedio diario */}
        <rect x={izq} y={y(promedio) - 7} width={ancho - izq - der} height={14} fill="#fde68a" fillOpacity={0.55} />
        <line x1={izq} x2={ancho - der} y1={y(promedio)} y2={y(promedio)} stroke="#eab308" strokeWidth={1} strokeDasharray="4 3" />
        {bloques.map(({ s, x0, x1, puntos, maxPeriodo }, bi) => (
          <g key={s.id}>
            {bi > 0 && <line x1={x0 - paso * 0.4} x2={x0 - paso * 0.4} y1={arriba - 10} y2={altoTotal - 4} stroke="#e2e8f0" strokeWidth={1} />}
            <polyline points={puntos.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#94a3b8" strokeWidth={1.8} strokeLinejoin="round" />
            {puntos.map((p, i) => {
              const esMax = p.casos === maxPeriodo && maxPeriodo > 0;
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={esMax ? 6 : 4.5} fill={esMax ? '#dc2626' : '#ffffff'} stroke={esMax ? '#991b1b' : '#94a3b8'} strokeWidth={1.6} />
                  <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={tamValor} fontWeight={esMax ? 800 : 600} fill={esMax ? '#b91c1c' : '#334155'} stroke="#fff" strokeWidth={3} paintOrder="stroke">{formatNumero(p.casos)}</text>
                  {(i % cadaN === 0) && (
                    <text transform={`translate(${p.x + 3.5}, ${yDias}) rotate(-90)`} textAnchor="end" fontSize={10} fill="#475569">
                      {`${DIAS_CORTOS[p.fecha.getDay()]} ${p.fecha.getDate()}`}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={x0 + 2} x2={x1 - 2} y1={yPeriodo - 12} y2={yPeriodo - 12} stroke="#cbd5e1" />
            <text x={(x0 + x1) / 2} y={yPeriodo + 2} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#10233f">{s.etiqueta}</text>
            <text x={(x0 + x1) / 2} y={yPeriodo + 17} textAnchor="middle" fontSize={11} fill="#475569">({formatNumero(s.total)} {s.total === 1 ? 'caso' : 'casos'})</text>
          </g>
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-slate-600">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border border-red-800 bg-red-600" /> Día con más casos del periodo</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-amber-200" /> Promedio diario: {formatDecimal(promedio, 1)} casos</span>
      </div>
    </div>
  );
}
