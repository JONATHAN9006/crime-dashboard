import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarDays, FileText, Minus, Plus, Circle } from 'lucide-react';
import { Card } from '../ui/Card';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { ETIQUETA_PATRON, type AnalisisSemanal, type AlertaRezago, type EstadoSemanal, type FilaSemanal } from '../../analitica/semanas';

// "Evolución de la delictividad — últimas semanas": tabla por delito con
// cada semana, mini-tendencia, cambio (casos | %), APORTE al cambio total,
// estado con criterio estadístico y patrón; panel lateral con la lectura
// del periodo y el resumen de la tendencia. Todos los números salen de
// analitica/semanas.ts (probado en semanas.test.ts).

interface Periodo { etiqueta: string; inicio: Date; fin: Date; total: number }

type Filtro = 'todos' | EstadoSemanal;
type Orden = 'impacto' | 'reduccion' | 'aumento' | 'ultima' | 'variacion' | 'nombre';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const rango = (a: Date, b: Date) => (a.getMonth() === b.getMonth()
  ? `${String(a.getDate()).padStart(2, '0')} – ${String(b.getDate()).padStart(2, '0')} ${MES[b.getMonth()]}`
  : `${String(a.getDate()).padStart(2, '0')} ${MES[a.getMonth()]} – ${String(b.getDate()).padStart(2, '0')} ${MES[b.getMonth()]}`);
const corto = (etiqueta: string) => etiqueta.replace(' (más reciente)', '').replace(/^Semana\s+/i, 'S').replace(/\s*\(\d{4}\)$/, '');
const signo = (n: number) => (n > 0 ? `+${formatNumero(n)}` : formatNumero(n));
const pct = (n: number | null) => (n === null ? 'nuevo' : `${n > 0 ? '+' : ''}${formatDecimal(n, 1)} %`);

const COLOR: Record<EstadoSemanal, { linea: string; relleno: string; texto: string; chip: string }> = {
  aumento: { linea: '#e11d48', relleno: 'rgba(225,29,72,0.10)', texto: 'text-rose-600', chip: 'bg-rose-50 text-rose-700 ring-rose-200' },
  reduccion: { linea: '#059669', relleno: 'rgba(5,150,105,0.10)', texto: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  estable: { linea: '#64748b', relleno: 'rgba(100,116,139,0.08)', texto: 'text-slate-500', chip: 'bg-slate-100 text-slate-600 ring-slate-200' },
};
const NOMBRE_ESTADO: Record<EstadoSemanal, string> = { aumento: 'Aumento', reduccion: 'Reducción', estable: 'Estable' };

function MiniTendencia({ valores, estado, ancho = 112, alto = 30 }: { valores: number[]; estado: EstadoSemanal; ancho?: number; alto?: number }) {
  const max = Math.max(1, ...valores), n = valores.length;
  const x = (i: number) => 6 + (i * (ancho - 12)) / Math.max(n - 1, 1);
  const y = (v: number) => alto - 5 - (v / max) * (alto - 10);
  const puntos = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const c = COLOR[estado];
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="mx-auto block" aria-hidden>
      <polygon points={`${x(0)},${alto - 2} ${puntos} ${x(n - 1)},${alto - 2}`} fill={c.relleno} />
      <polyline points={puntos} fill="none" stroke={c.linea} strokeWidth="2" strokeLinejoin="round" />
      {valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={c.linea} />)}
    </svg>
  );
}

function Estado({ estado, umbral, diferencia }: { estado: EstadoSemanal; umbral: number; diferencia: number }) {
  const c = COLOR[estado];
  const ayuda = estado === 'estable'
    ? `La diferencia (${signo(diferencia)}) está dentro de la variación normal esperada (±${formatDecimal(umbral, 1)} casos, 95 %).`
    : `La diferencia (${signo(diferencia)}) supera la variación normal esperada (±${formatDecimal(umbral, 1)} casos, 95 %).`;
  return (
    <span title={ayuda} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ring-1 ${c.chip}`}>
      {estado === 'aumento' ? <ArrowUp size={12} /> : estado === 'reduccion' ? <ArrowDown size={12} /> : <Minus size={12} />}
      {NOMBRE_ESTADO[estado]}
    </span>
  );
}

export function EvolucionSemanal({ periodos, analisis, rezago, onCortarAntesDelRezago, cortado, onQuitarCorte, totalVentana, estacionTop }: {
  periodos: Periodo[];
  analisis: AnalisisSemanal;
  rezago: AlertaRezago | null;
  onCortarAntesDelRezago?: () => void;
  cortado: Date | null;
  onQuitarCorte?: () => void;
  totalVentana: number;
  estacionTop: { key: string; casos: number } | null;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [orden, setOrden] = useState<Orden>('impacto');
  const n = periodos.length;
  const primero = periodos[0], ultimo = periodos[n - 1];

  const conteo = useMemo(() => ({
    aumento: analisis.filas.filter((f) => f.estado === 'aumento').length,
    reduccion: analisis.filas.filter((f) => f.estado === 'reduccion').length,
    estable: analisis.filas.filter((f) => f.estado === 'estable').length,
  }), [analisis]);

  const filas = useMemo(() => {
    const base = filtro === 'todos' ? analisis.filas : analisis.filas.filter((f) => f.estado === filtro);
    const cmp: Record<Orden, (a: FilaSemanal, b: FilaSemanal) => number> = {
      impacto: (a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia) || b.valores[n - 1] - a.valores[n - 1],
      reduccion: (a, b) => a.diferencia - b.diferencia,
      aumento: (a, b) => b.diferencia - a.diferencia,
      ultima: (a, b) => b.valores[n - 1] - a.valores[n - 1],
      variacion: (a, b) => (b.variacionPct ?? Infinity) - (a.variacionPct ?? Infinity),
      nombre: (a, b) => a.delito.localeCompare(b.delito, 'es'),
    };
    return [...base].sort(cmp[orden]);
  }, [analisis, filtro, orden, n]);

  // ── Resumen de la tendencia y lectura ───────────────────────────────────
  const total = analisis;
  const sube = total.totalDiferencia > 0;
  const mayorReduccion = [...analisis.filas].sort((a, b) => a.diferencia - b.diferencia).find((f) => f.diferencia < 0) ?? null;
  const mayorIncremento = [...analisis.filas].sort((a, b) => b.diferencia - a.diferencia).find((f) => f.diferencia > 0) ?? null;
  const masCasosUltima = [...analisis.filas].sort((a, b) => b.valores[n - 1] - a.valores[n - 1])[0] ?? null;
  const explican = analisis.filas
    .filter((f) => f.aportePct !== null && Math.sign(f.diferencia) === Math.sign(total.totalDiferencia) && f.diferencia !== 0)
    .sort((a, b) => (b.aportePct ?? 0) - (a.aportePct ?? 0));
  const mayorAporte = explican[0] ?? null;
  const significativosOpuestos = analisis.filas.filter((f) => (sube ? f.estado === 'reduccion' : f.estado === 'aumento'));
  const alzasASeguir = analisis.filas.filter((f) => f.estado === 'aumento' || f.patron === 'abrupto_alza' || f.patron === 'creciente');

  const rezagoEnUltima = rezago && rezago.desde >= ultimo.inicio;

  return (
    <div className="space-y-4">
      {/* Alerta de rezago de registro — antes que cualquier cifra. */}
      {rezagoEnUltima && !cortado && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-[260px] flex-1 text-sm text-amber-900">
            <p className="font-bold">La caída de {corto(ultimo.etiqueta)} puede ser falta de registro, no una reducción real</p>
            <p className="mt-0.5">
              Desde el {rezago!.desde.toLocaleDateString('es-CO')} ({rezago!.dias} días) se registran {formatDecimal(rezago!.promedioReciente, 1)} casos/día, frente a {formatDecimal(rezago!.promedioHabitual, 1)} casos/día habituales en las semanas anteriores
              — faltarían del orden de {formatNumero(rezago!.faltantesEstimados)} casos. Suele pasar cuando los últimos días aún no están cargados en la base.
            </p>
          </div>
          {onCortarAntesDelRezago && (
            <button onClick={onCortarAntesDelRezago} className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700">
              Analizar hasta el {new Date(rezago!.desde.getTime() - 86400000).toLocaleDateString('es-CO')}
            </button>
          )}
        </div>
      )}
      {cortado && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">
          <span><CalendarDays size={14} className="mr-1 inline" />Análisis cortado al {cortado.toLocaleDateString('es-CO')} para excluir los días con registro incompleto.</span>
          {onQuitarCorte && <button onClick={onQuitarCorte} className="text-xs font-semibold underline">Volver al último dato disponible</button>}
        </div>
      )}

      <Card
        title={`Evolución de la delictividad — ${n === 4 ? 'últimas 4 semanas' : `${n} periodos`}`}
        subtitle={`Comparativo ${corto(primero.etiqueta)} (${rango(primero.inicio, primero.fin)}) → ${corto(ultimo.etiqueta)} (${rango(ultimo.inicio, ultimo.fin)})`}
        descargable="evolucion-semanal"
        actions={(
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              ['todos', `Todos (${analisis.filas.length})`, 'bg-brand-green'],
              ['aumento', `Aumentan (${conteo.aumento})`, 'bg-rose-500'],
              ['reduccion', `Disminuyen (${conteo.reduccion})`, 'bg-emerald-600'],
              ['estable', `Estables (${conteo.estable})`, 'bg-slate-400'],
            ] as const).map(([clave, texto, punto]) => (
              <button
                key={clave}
                onClick={() => setFiltro(clave)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${filtro === clave ? 'border-brand-green bg-brand-green text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}
              >
                {clave !== 'todos' && <span className={`h-2 w-2 rounded-full ${filtro === clave ? 'bg-white' : punto}`} />}
                {texto}
              </button>
            ))}
            <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600">
              <option value="impacto">Ordenar: impacto en el total</option>
              <option value="reduccion">Ordenar: mayor reducción</option>
              <option value="aumento">Ordenar: mayor aumento</option>
              <option value="ultima">Ordenar: casos en {corto(ultimo.etiqueta)}</option>
              <option value="variacion">Ordenar: variación %</option>
              <option value="nombre">Ordenar: nombre</option>
            </select>
          </div>
        )}
      >
        {/* Indicadores */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {[
            { t: `Total ${corto(primero.etiqueta)}`, v: formatNumero(primero.total), s: 'casos', c: 'text-slate-900', fondo: 'bg-slate-50' },
            { t: `Total ${corto(ultimo.etiqueta)}`, v: formatNumero(ultimo.total), s: rezagoEnUltima && !cortado ? 'casos · posible rezago' : 'casos', c: 'text-slate-900', fondo: 'bg-slate-50' },
            { t: 'Cambio del periodo', v: signo(total.totalDiferencia), s: 'casos', c: COLOR[total.totalEstado].texto, fondo: total.totalDiferencia > 0 ? 'bg-rose-50' : total.totalDiferencia < 0 ? 'bg-emerald-50' : 'bg-slate-50' },
            { t: 'Variación del periodo', v: pct(total.totalVariacionPct), s: total.totalEstado === 'estable' ? 'dentro de la variación normal' : 'diferencia significativa', c: COLOR[total.totalEstado].texto, fondo: total.totalDiferencia > 0 ? 'bg-rose-50' : total.totalDiferencia < 0 ? 'bg-emerald-50' : 'bg-slate-50' },
            { t: 'Delitos que aumentan', v: String(conteo.aumento), s: 'con diferencia significativa', c: 'text-rose-600', fondo: 'bg-rose-50' },
            { t: 'Delitos que disminuyen', v: String(conteo.reduccion), s: 'con diferencia significativa', c: 'text-emerald-600', fondo: 'bg-emerald-50' },
          ].map((k) => (
            <div key={k.t} className={`rounded-xl p-3 ${k.fondo}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.t}</p>
              <p className={`mt-0.5 text-[26px] font-bold leading-tight ${k.c}`}>{k.v}</p>
              <p className="text-[11px] text-slate-500">{k.s}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_300px]">
          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 py-2 pr-2 text-left font-semibold">Delito</th>
                  {periodos.map((p, i) => (
                    <th key={i} className={`border-b border-slate-200 px-2 py-2 text-center font-semibold ${i === n - 1 ? 'rounded-t-lg bg-sky-50 text-sky-900' : ''}`}>
                      {corto(p.etiqueta)}
                      <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">{rango(p.inicio, p.fin)}</span>
                      {i === n - 1 && rezagoEnUltima && !cortado && <span className="block text-[10px] font-semibold normal-case tracking-normal text-amber-600">⚠ posible rezago</span>}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">Tendencia</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">Cambio {corto(primero.etiqueta)} → {corto(ultimo.etiqueta)}<span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">casos | variación %</span></th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">Aporte al cambio</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  return (
                    <tr key={f.delito} className="hover:bg-slate-50/70">
                      <td className="border-b border-slate-100 py-2 pr-2 font-semibold text-slate-800">{f.delito}</td>
                      {f.valores.map((v, i) => (
                        <td key={i} className={`border-b border-slate-100 px-2 py-2 text-center ${i === n - 1 ? 'bg-sky-50/60 text-[15px] font-bold text-slate-900' : 'text-slate-600'}`}>{formatNumero(v)}</td>
                      ))}
                      <td className="border-b border-slate-100 px-2 py-1">
                        <MiniTendencia valores={f.valores} estado={f.estado} />
                        <p className="text-center text-[10px] text-slate-400">{ETIQUETA_PATRON[f.patron]}</p>
                      </td>
                      <td className={`whitespace-nowrap border-b border-slate-100 px-2 py-2 text-center font-semibold ${f.diferencia > 0 ? 'text-rose-600' : f.diferencia < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {f.diferencia > 0 ? <ArrowUp size={13} className="mr-0.5 inline" /> : f.diferencia < 0 ? <ArrowDown size={13} className="mr-0.5 inline" /> : null}
                        {signo(f.diferencia)} <span className="mx-1 text-slate-300">|</span> {pct(f.variacionPct)}
                      </td>
                      <td className="border-b border-slate-100 px-2 py-2 text-center text-slate-700">{f.aportePct === null ? '—' : `${formatDecimal(f.aportePct, 1)} %`}</td>
                      <td className="border-b border-slate-100 px-2 py-2 text-center"><Estado estado={f.estado} umbral={f.umbral} diferencia={f.diferencia} /></td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="py-2.5 pr-2 pl-1">TOTAL DELICTIVIDAD</td>
                  {total.totales.map((v, i) => <td key={i} className={`px-2 py-2.5 text-center ${i === n - 1 ? 'bg-sky-100/60 text-[15px]' : ''}`}>{formatNumero(v)}</td>)}
                  <td className="px-2 py-1"><MiniTendencia valores={total.totales} estado={total.totalEstado} /><p className="text-center text-[10px] font-normal text-slate-400">{ETIQUETA_PATRON[total.totalPatron]}</p></td>
                  <td className={`whitespace-nowrap px-2 py-2.5 text-center ${COLOR[total.totalEstado].texto}`}>{signo(total.totalDiferencia)} <span className="mx-1 text-slate-300">|</span> {pct(total.totalVariacionPct)}</td>
                  <td className="px-2 py-2.5 text-center">{total.totalDiferencia === 0 ? '—' : '100,0 %'}</td>
                  <td className="px-2 py-2.5 text-center"><Estado estado={total.totalEstado} umbral={Math.sqrt(total.totales[0] + total.totales[n - 1]) * 1.96} diferencia={total.totalDiferencia} /></td>
                </tr>
              </tbody>
            </table>
            {filas.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Ningún delito en este grupo.</p>}
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              <b>Estado:</b> aumento o reducción solo si la diferencia supera la variación normal de un conteo (|dif.| &gt; 1,96·√(casos inicio + casos fin), 95 % de confianza); si no, <b>estable</b>. Pasa el mouse por cada estado para ver su umbral.
              <b> Aporte:</b> parte del cambio total que explica cada delito; suma 100 %. <b>Patrón:</b> sostenido = todas las semanas en el mismo sentido; abrupto = la última semana se aparta más de 2 desviaciones del promedio de las anteriores.
            </p>
          </div>

          {/* Panel lateral */}
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800"><FileText size={15} className="text-brand-green" /> Lectura del periodo</p>
              <p className="text-[13px] leading-relaxed text-slate-700">
                Entre {corto(primero.etiqueta)} y {corto(ultimo.etiqueta)} ({rango(primero.inicio, ultimo.fin)}) {total.totalDiferencia === 0 ? 'la delictividad se mantiene' : <>se registra {sube ? 'un aumento' : 'una reducción'} de <b>{formatDecimal(Math.abs(total.totalVariacionPct ?? 0), 1)} %</b></>}, pasando de <b>{formatNumero(primero.total)}</b> a <b>{formatNumero(ultimo.total)}</b> casos
                {total.totalEstado === 'estable' ? ', una diferencia dentro de la variación normal.' : '.'}
                {explican.length > 0 && (
                  <> {sube ? ' El aumento' : ' La reducción'} se explica principalmente por {explican.slice(0, 3).map((f, i, arr) => (
                    <span key={f.delito}><b>{f.delito}</b> ({formatDecimal(f.aportePct ?? 0, 1)} %){i < arr.length - 2 ? ', ' : i === arr.length - 2 ? ' y ' : ''}</span>
                  ))}.</>
                )}
                {significativosOpuestos.length > 0 && (
                  <> En sentido contrario, {significativosOpuestos.length === 1
                    ? (sube ? 'se identifica una reducción significativa' : 'se identifica un incremento significativo')
                    : (sube ? 'se identifican reducciones significativas' : 'se identifican incrementos significativos')} en {significativosOpuestos.slice(0, 3).map((f, i, arr) => (
                    <span key={f.delito}><b>{f.delito}</b>{i < arr.length - 2 ? ', ' : i === arr.length - 2 ? ' y ' : ''}</span>
                  ))}{!sube && ', que requieren seguimiento'}.</>
                )}
                {!sube && significativosOpuestos.length === 0 && alzasASeguir.length > 0 && (
                  <> Aunque el total baja, {alzasASeguir.slice(0, 2).map((f) => f.delito).join(' y ')} {alzasASeguir.length === 1 ? 'muestra' : 'muestran'} alza en las últimas semanas, sin llegar a ser significativa: conviene seguirlos.</>
                )}
                {rezagoEnUltima && !cortado && <> <span className="font-semibold text-amber-700">Ojo: parte de la caída de {corto(ultimo.etiqueta)} puede deberse a registros aún no cargados.</span></>}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5">
              <p className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-slate-800"><BarChart3 size={15} className="text-brand-green" /> Resumen de la tendencia</p>
              <ul className="space-y-2.5 text-[13px]">
                {mayorReduccion && <li className="flex gap-2"><ArrowDown size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span><span className="text-slate-500">Mayor reducción:</span><br /><b>{mayorReduccion.delito}</b> ({signo(mayorReduccion.diferencia)} casos)</span></li>}
                {mayorIncremento && <li className="flex gap-2"><Plus size={16} className="mt-0.5 shrink-0 rounded-full bg-rose-100 text-rose-600" /><span><span className="text-slate-500">Mayor incremento:</span><br /><b>{mayorIncremento.delito}</b> ({signo(mayorIncremento.diferencia)} casos{mayorIncremento.estado === 'estable' ? ', dentro de la variación normal' : ''})</span></li>}
                {masCasosUltima && <li className="flex gap-2"><Circle size={14} className="mt-1 shrink-0 fill-slate-700 text-slate-700" /><span><span className="text-slate-500">Más casos en {corto(ultimo.etiqueta)}:</span><br /><b>{masCasosUltima.delito}</b> ({formatNumero(masCasosUltima.valores[n - 1])} casos)</span></li>}
                {mayorAporte && <li className="flex gap-2"><Plus size={16} className="mt-0.5 shrink-0 rounded-full bg-emerald-100 text-emerald-700" /><span><span className="text-slate-500">Mayor aporte {sube ? 'al aumento' : 'a la reducción'}:</span><br /><b>{mayorAporte.delito}</b> ({formatDecimal(mayorAporte.aportePct ?? 0, 1)} %)</span></li>}
                <li className="border-t border-slate-100 pt-2 text-[12px] text-slate-500">
                  {formatNumero(totalVentana)} casos en toda la ventana{estacionTop ? <> · estación con más casos: <b className="text-slate-700">{estacionTop.key}</b> ({formatNumero(estacionTop.casos)})</> : null}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
