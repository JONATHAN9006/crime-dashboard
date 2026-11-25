import { forwardRef, useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, BarChart3, CalendarDays, CalendarRange, CheckCircle2, Info, LineChart as IconoLinea, Target, TrendingDown, TrendingUp } from 'lucide-react';
import type { CrimeRecord } from '../../types/crime';
import type { NodoMicrogerencia } from '../../data/microgerencia';
import { predicadoDeNodo } from '../../hooks/useMicrogerencia';
import { calcularDiaADia, DIAS_CORTOS, MESES_LARGOS } from '../../data/diaADia';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { ALTO, ANCHO, C, EncabezadoLamina, FUENTE, MESES_CORTOS, PieLamina } from './InformeEjecutivoMicrogerencia';
import { Caja, TituloBanda } from './LaminaOperatividad';

// ───────────────────────────────────────────────────────────────────────
// Lámina «MICROGERENCIA | DÍA A DÍA DE LA DELICTIVIDAD».
// Matriz delito × día del mes, con resumen, Top 5, variación frente al día
// anterior, últimos 7 días y hallazgos. Cálculos en data/diaADia.ts.
// ───────────────────────────────────────────────────────────────────────

const dd = (n: number) => String(n).padStart(2, '0');
const fechaCorta = (d: Date) => `${dd(d.getDate())} ${MESES_CORTOS[d.getMonth()]}`;
const tituloCase = (t: string) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const pct = (v: number) => `${formatDecimal(v, 1)} %`;
const VERDE_CELDA = '#e8f6ec';

export interface PropsDiaADia {
  registros: CrimeRecord[];
  corteDatos: Date;
  columnaIngreso: string | null;
  anio: number; mes: number;
  nodo: NodoMicrogerencia; esGeneral: boolean; unidad: string;
}

function Tarjeta({ titulo, valor, sub, tono = 'blanco', icono: Icono }: { titulo: string; valor: string; sub?: string; tono?: 'blanco' | 'rosa' | 'verde'; icono: typeof Info }) {
  const fondo = tono === 'rosa' ? '#fde8ea' : tono === 'verde' ? '#e6f6ea' : '#fff';
  const color = tono === 'rosa' ? C.rojo : tono === 'verde' ? '#15803d' : C.texto;
  return (
    <div className="flex flex-1 flex-col rounded-[10px] border px-2.5 py-1.5" style={{ background: fondo, borderColor: '#dfe5e2' }}>
      <p className="flex items-center gap-1.5 whitespace-nowrap text-[13.5px] font-bold"><Icono size={16} style={{ color }} />{titulo}</p>
      <p className="text-center text-[30px] font-extrabold leading-tight tabular-nums" style={{ color }}>{valor}</p>
      {sub && <p className="text-center text-[13px] font-semibold leading-none" style={{ color }}>{sub}</p>}
    </div>
  );
}

export const LaminaDiaADia = forwardRef<HTMLDivElement, PropsDiaADia>(function LaminaDiaADia({ registros, corteDatos, columnaIngreso, anio, mes, nodo, esGeneral, unidad }, ref) {
  const d = useMemo(() => {
    const pred = esGeneral ? null : predicadoDeNodo(nodo);
    return calcularDiaADia(pred ? registros.filter(pred) : registros, anio, mes, corteDatos, columnaIngreso);
  }, [registros, corteDatos, columnaIngreso, anio, mes, nodo, esGeneral]);

  const mesNombre = MESES_LARGOS[mes - 1];
  const mesCorto = MESES_CORTOS[mes - 1];
  const completo = d.diaCorte === d.dias;
  const rangoInfo = d.diaCorte > 0 ? `${dd(1)} – ${dd(d.diaCorte)} ${mesCorto} ${anio}` : `sin información aún`;
  const corteTxt = `${d.corte.getFullYear()}-${dd(d.corte.getMonth() + 1)}-${dd(d.corte.getDate())}`;

  // Tamaños de la matriz según los días del mes (28 … 31 columnas).
  // Ancho disponible de la caja (1120 − márgenes) repartido entre los días.
  const anchoDia = Math.floor(((1100 - 24 - 168 - 54 - 58 - 1.5 * (d.dias + 5)) / d.dias) * 10) / 10;
  const altoFila = Math.max(24, Math.min(34, Math.floor(460 / Math.max(1, d.filas.length))));
  const fuenteCelda = altoFila >= 30 ? 15 : 14;

  const dif = d.actual && d.anterior ? d.actual.casos - d.anterior.casos : null;
  const varPct = d.actual && d.anterior && d.anterior.casos > 0 ? ((d.actual.casos - d.anterior.casos) / d.anterior.casos) * 100 : null;
  const max7 = Math.max(0, ...d.ultimos7.map((x) => x.casos));
  const maxTop = Math.max(1, ...d.top5.map((x) => x.casos));

  const hallazgos: React.ReactNode[] = [];
  if (d.diaCorte > 0) {
    hallazgos.push(<>Se registran <b>{formatNumero(d.total)}</b> casos en el periodo ({rangoInfo}), con un promedio diario de <b>{d.promedio == null ? 'N/A' : formatDecimal(d.promedio, 1)}</b> delitos.</>);
    if (d.top5.length) {
      const [a, b, c] = d.top5;
      hallazgos.push(<>El <b>{pct(d.total ? (a.casos / d.total) * 100 : 0)}</b> de los casos corresponde a {tituloCase(a.delito)} ({formatNumero(a.casos)}){b ? <>, seguido de {tituloCase(b.delito)} ({formatNumero(b.casos)}){c ? <> y {tituloCase(c.delito)} ({formatNumero(c.casos)})</> : null}</> : null}.</>);
    }
    if (d.maximo && d.minimo) hallazgos.push(<>El mayor registro se presentó el {dd(d.maximo.dia)} de {mesNombre.toLowerCase()} ({formatNumero(d.maximo.casos)} casos) y el menor el {dd(d.minimo.dia)} de {mesNombre.toLowerCase()} ({formatNumero(d.minimo.casos)} casos).</>);
    if (dif != null && d.anterior) hallazgos.push(<>Frente al día anterior ({fechaCorta(d.anterior.fecha)}), {dif === 0 ? 'no hay variación' : <>se evidencia {dif > 0 ? 'un aumento' : 'una disminución'} de {formatNumero(Math.abs(dif))} casos{varPct != null ? ` (${varPct > 0 ? '+' : ''}${formatDecimal(varPct, 1)} %)` : ''}</>}.</>);
  } else {
    hallazgos.push(<>Aún no hay información cargada para {mesNombre.toLowerCase()} de {anio}.</>);
  }

  return (
    <div ref={ref} data-informe-microgerencia data-lamina-dia-a-dia className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
      <EncabezadoLamina titulo="DÍA A DÍA DE LA DELICTIVIDAD" periodo={`${mesNombre} ${anio} (01 – ${dd(d.dias)} ${mesCorto.toLowerCase()})`} corte={corteTxt} cobertura={unidad} fuente="Aplicativo Los Andes" />

      {/* ── Matriz principal ───────────────────────────────────────── */}
      <Caja x={12} y={116} w={1120} h={574}>
        <TituloBanda icono={BarChart3}>Registro día a día de delitos – {unidad} ({mesNombre} {anio})</TituloBanda>
        <div className="min-h-0 flex-1 px-2 pt-1.5">
          <table className="w-full border-separate border-spacing-x-[1.5px] border-spacing-y-[2px] text-center leading-none" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 24 }} /><col style={{ width: 168 }} />
              {d.encabezados.map((h) => <col key={h.dia} style={{ width: anchoDia }} />)}
              <col style={{ width: 54 }} /><col style={{ width: 58 }} />
            </colgroup>
            <thead>
              <tr className="font-bold" style={{ height: 44 }}>
                <th className="rounded-l-md text-[14px]" style={{ background: '#eef1f2' }}>#</th>
                <th className="rounded-r-md pl-1 text-left text-[15px]" style={{ background: '#eef1f2' }}>Delito</th>
                {d.encabezados.map((h) => {
                  const esCorte = h.dia === d.diaCorte && !completo;
                  return (
                    <th key={h.dia} className="rounded-md" style={{ background: h.pendiente ? '#f5f6f6' : esCorte ? '#dff3e5' : '#eef1f2', color: h.pendiente ? '#a3acb2' : C.texto, outline: esCorte ? `2px solid #22b33a` : undefined }}>
                      <span className="block text-[13.5px]">{dd(h.dia)}</span>
                      <span className="block text-[10.5px] font-semibold">{h.semana}</span>
                    </th>
                  );
                })}
                <th className="rounded-md text-[13px] text-white" style={{ background: '#10233f' }}>Total<br />mes</th>
                <th className="rounded-md text-[12.5px]" style={{ background: '#eef1f2' }}>% Part.</th>
              </tr>
            </thead>
            <tbody>
              {d.filas.length === 0 ? (
                <tr><td colSpan={d.dias + 4} className="py-10 text-[16px] text-slate-500">{d.diaCorte === 0 ? 'Sin información cargada para este mes.' : 'Sin registros en el periodo para esta cobertura.'}</td></tr>
              ) : d.filas.map((f, i) => (
                <tr key={f.delito} style={{ height: altoFila, fontSize: fuenteCelda }}>
                  <td className="font-bold">{i + 1}</td>
                  <td className="truncate pl-1 text-left font-semibold" title={f.delito}>{tituloCase(f.delito)}</td>
                  {f.porDia.map((v, j) => (
                    <td key={j} className="tabular-nums" style={{ background: v == null ? '#fafbfb' : j + 1 === d.diaCorte && !completo ? VERDE_CELDA : i % 2 ? '#f8faf9' : undefined, color: v == null ? '#c2c9cd' : v === 0 ? '#9aa3a8' : C.texto, fontWeight: v ? 600 : 400 }}>{v == null ? '·' : v}</td>
                  ))}
                  <td className="rounded-md font-extrabold text-white tabular-nums" style={{ background: '#10233f' }}>{formatNumero(f.total)}</td>
                  <td className="text-[13px] tabular-nums">{formatDecimal(f.participacion, 1)} %</td>
                </tr>
              ))}
              {d.filas.length > 0 && (
                <tr style={{ height: altoFila + 6 }}>
                  <td colSpan={2} className="rounded-md text-[16px] font-extrabold text-white" style={{ background: '#10233f' }}>TOTAL DÍA</td>
                  {d.totalDia.map((v, j) => (
                    <td key={j} className="rounded-md font-extrabold tabular-nums" style={{ background: v == null ? '#f5f6f6' : VERDE_CELDA, color: v == null ? '#c2c9cd' : '#14532d', fontSize: 14, outline: j + 1 === d.diaCorte && !completo ? '2px solid #22b33a' : undefined }}>{v == null ? '·' : v}</td>
                  ))}
                  <td className="rounded-md text-[16px] font-extrabold text-white tabular-nums" style={{ background: '#10233f' }}>{formatNumero(d.total)}</td>
                  <td className="rounded-md text-[13px] font-bold" style={{ background: '#eef1f2' }}>100 %</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-3 pb-1.5 text-[11.5px] leading-tight text-slate-500">
          {d.diaCorte < d.dias && <><b>·</b> = día pendiente (posterior al corte {fechaCorta(d.corte)}): no se cuenta como cero ni entra en totales ni promedios. </>}
          {d.usaFechaIngreso ? `Conteo por fecha de ingreso (${d.campoFecha}).` : 'Conteo por FECHA_HECHO: la matriz no trae una fecha de ingreso o registro diferenciada.'}
          {d.filas.some((f) => /^Otros delitos/.test(f.delito)) ? ' «Otros delitos» suma los de menor volumen.' : ''}
        </p>
      </Caja>

      {/* ── Hallazgos ──────────────────────────────────────────────── */}
      <Caja x={12} y={698} w={1120} h={176}>
        <TituloBanda icono={Target}>Hallazgos del periodo</TituloBanda>
        <div className="space-y-1.5 px-4 pt-2">
          {hallazgos.map((h, i) => (
            <p key={i} className="flex gap-2 text-[15.5px] leading-[1.2]"><CheckCircle2 size={18} className="mt-[1px] shrink-0" style={{ color: '#16a34a' }} /><span>{h}</span></p>
          ))}
        </div>
      </Caja>

      {/* ── Resumen del periodo ───────────────────────────────────── */}
      <Caja x={1140} y={116} w={520} h={152}>
        <TituloBanda icono={CalendarDays}>Resumen del periodo <span className="text-[15px] font-normal">({rangoInfo})</span></TituloBanda>
        <div className="flex min-h-0 flex-1 gap-1.5 px-2 pb-2 pt-1.5">
          <Tarjeta icono={BarChart3} titulo="Total delitos" valor={formatNumero(d.total)} />
          <Tarjeta icono={CalendarRange} titulo="Promedio diario" valor={d.promedio == null ? 'N/A' : formatDecimal(d.promedio, 1)} />
          <Tarjeta icono={TrendingUp} titulo="Máx. diario" valor={d.maximo ? formatNumero(d.maximo.casos) : '—'} sub={d.maximo ? `(${dd(d.maximo.dia)} ${mesCorto})` : undefined} tono="rosa" />
          <Tarjeta icono={TrendingDown} titulo="Mín. diario" valor={d.minimo ? formatNumero(d.minimo.casos) : '—'} sub={d.minimo ? `(${dd(d.minimo.dia)} ${mesCorto})` : undefined} tono="verde" />
        </div>
      </Caja>

      {/* ── Top 5 ──────────────────────────────────────────────────── */}
      <Caja x={1140} y={276} w={520} h={178}>
        <TituloBanda icono={BarChart3}>Top 5 delitos del periodo</TituloBanda>
        <div className="flex min-h-0 flex-1 flex-col justify-around px-3 py-1.5">
          {d.top5.length === 0 ? <p className="text-center text-[14px] text-slate-500">Sin registros.</p> : d.top5.map((t, i) => (
            <div key={t.delito} className="flex items-center gap-2 text-[14.5px]">
              <span className="w-[170px] shrink-0 truncate font-medium" title={t.delito}>{tituloCase(t.delito)}</span>
              <span className="h-[15px] flex-1"><span className="block h-full rounded-[3px]" style={{ width: `${Math.max(4, (t.casos / maxTop) * 100)}%`, background: ['#15803d', '#16a34a', '#22b33a', '#4cc764', '#86d98f'][i] }} /></span>
              <span className="w-[44px] text-right font-bold tabular-nums">{formatNumero(t.casos)}</span>
            </div>
          ))}
        </div>
      </Caja>

      {/* ── Variación frente al día anterior ───────────────────────── */}
      <Caja x={1140} y={462} w={520} h={140}>
        <TituloBanda icono={CalendarDays}>Variación frente al día anterior</TituloBanda>
        {!d.actual || !d.anterior ? <p className="flex flex-1 items-center justify-center px-4 text-center text-[14px] text-slate-500">Sin información para comparar.</p> : (
          <div className="flex min-h-0 flex-1 gap-1.5 px-2 pb-2 pt-1.5">
            <Tarjeta icono={CalendarDays} titulo={`${fechaCorta(d.anterior.fecha)} (anterior)`} valor={`${formatNumero(d.anterior.casos)}`} sub="casos" />
            <Tarjeta icono={CalendarDays} titulo={`${fechaCorta(d.actual.fecha)} (${completo ? 'último' : 'corte'})`} valor={`${formatNumero(d.actual.casos)}`} sub="casos" />
            <Tarjeta icono={dif! > 0 ? ArrowUp : ArrowDown} titulo="Diferencia" valor={`${dif! > 0 ? '+' : ''}${formatNumero(dif!)}`} tono={dif! > 0 ? 'rosa' : dif! < 0 ? 'verde' : 'blanco'} />
            <Tarjeta icono={dif! > 0 ? ArrowUp : ArrowDown} titulo="Variación" valor={varPct == null ? 'N/A' : `${varPct > 0 ? '+' : ''}${formatDecimal(varPct, 1)}%`} tono={dif! > 0 ? 'rosa' : dif! < 0 ? 'verde' : 'blanco'} />
          </div>
        )}
      </Caja>

      {/* ── Últimos 7 días ─────────────────────────────────────────── */}
      <Caja x={1140} y={610} w={520} h={264}>
        <TituloBanda icono={IconoLinea}>Comportamiento últimos 7 días</TituloBanda>
        {d.ultimos7.length === 0 ? <p className="flex flex-1 items-center justify-center text-[14px] text-slate-500">Sin información.</p> : (
          <div className="min-h-0 flex-1 px-2 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.ultimos7.map((x) => ({ nombre: `${dd(x.fecha.getDate())} ${MESES_CORTOS[x.fecha.getMonth()]}`, sem: DIAS_CORTOS[x.fecha.getDay()], casos: x.casos }))} margin={{ top: 26, right: 18, left: 0, bottom: 0 }}>
                <defs><linearGradient id="dad-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22b33a" stopOpacity={0.28} /><stop offset="100%" stopColor="#22b33a" stopOpacity={0.03} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" interval={0} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} height={38}
                  tick={({ x, y, payload, index }: { x?: number | string; y?: number | string; payload?: { value: string }; index?: number }) => (
                    <g transform={`translate(${x},${y})`}>
                      <text dy={13} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }}>{payload?.value}</text>
                      <text dy={28} textAnchor="middle" style={{ fontSize: 12, fill: C.texto, fontFamily: FUENTE }}>{DIAS_CORTOS[d.ultimos7[index ?? 0]?.fecha.getDay() ?? 0]}</text>
                    </g>
                  )} />
                <YAxis width={30} tick={{ fontSize: 12, fill: C.texto, fontFamily: FUENTE }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, (m: number) => Math.max(5, Math.ceil(m * 1.15))]} />
                <Area type="linear" dataKey="casos" stroke="#16a34a" strokeWidth={2.6} fill="url(#dad-area)" isAnimationActive={false}
                  dot={(p: { cx?: number; cy?: number; payload?: { casos: number }; index?: number }) => <circle key={p.index} cx={p.cx} cy={p.cy} r={p.payload?.casos === max7 ? 6.5 : 4.5} fill={p.payload?.casos === max7 ? '#dc2626' : '#fff'} stroke={p.payload?.casos === max7 ? '#dc2626' : '#16a34a'} strokeWidth={2.4} />}>
                  <LabelList dataKey="casos" position="top" offset={10} style={{ fontSize: 15, fontWeight: 800, fill: C.texto, fontFamily: FUENTE }} />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="px-3 pb-1.5 text-[11px] text-slate-500">En rojo, el día de mayor registro de los últimos 7.</p>
      </Caja>

      <PieLamina fuente="Aplicativo Los Andes" />
    </div>
  );
});
