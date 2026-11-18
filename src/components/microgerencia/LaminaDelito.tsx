import { forwardRef, useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis,
} from 'recharts';
import {
  BarChart3, Bike, Building2, CalendarDays, Car, CircleHelp, Clock, Crosshair, Footprints, Hammer, Hand, Home, LineChart as IconoLinea,
  ListChecks, MapPin, Percent, PersonStanding, PieChart as IconoDona, Scissors, ShieldAlert, Skull, Store, Sun, Truck, UserRound,
  Users, HeartCrack, PawPrint, Megaphone, CheckCircle2, type LucideIcon,
} from 'lucide-react';
import type { DatosMicrogerencia, NodoMicrogerencia } from '../../data/microgerencia';
import { analizarDelito, type VariableDelito } from '../../data/microgerenciaDelito';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import {
  ALTO, ANCHO, C, EncabezadoLamina, FUENTE, Leyenda, MESES_CORTOS, MapaCobertura, PieLamina, etiquetaUnidad, nombreCorto, signo,
  techoBonito, marcasEjeValores,
} from './InformeEjecutivoMicrogerencia';
import { Caja, TablaTriple, TituloBanda, sumar } from './LaminaOperatividad';

// ───────────────────────────────────────────────────────────────────────
// LÁMINA «MICROGERENCIA | ANÁLISIS ESPECÍFICO POR DELITO – MEPOY».
// Una por delito elegido y por unidad. Mismo lienzo, encabezado y pie de
// las demás láminas. Cifras de microgerenciaDelito.ts (registros reales):
// Total {año anterior} completo · {año anterior} y {año actual} al corte.
// Las tres variables específicas cambian según el delito y solo aparecen
// si la matriz trae datos válidos para ese delito.
// ───────────────────────────────────────────────────────────────────────

const variacion = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);
const pct = (v: number, total: number) => (total > 0 ? `${formatDecimal((v / total) * 100, 1)}%` : '—');
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const FRANJAS = ['00:00 – 05:59', '06:00 – 11:59', '12:00 – 17:59', '18:00 – 23:59'];
const TRIM = ['Trim. I', 'Trim. II', 'Trim. III', 'Trim. IV'];
const PALETA = ['#1d64d8', '#16a34a', '#f59e0b', '#7c3aed', '#64748b', '#14b8a6'];
const AZUL = '#1d64d8';
const VERDE_B = '#3cc23c';

function iconoDelito(delito: string): LucideIcon {
  const n = delito.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/MOTO/.test(n)) return Bike;
  if (/AUTOMOTOR|VEHICUL/.test(n)) return Car;
  if (/RESIDENC/.test(n)) return Home;
  if (/COMERCIO/.test(n)) return Store;
  if (/SEMOVIENT/.test(n)) return PawPrint;
  if (/PIRATER/.test(n)) return Truck;
  if (/PERSONAS/.test(n)) return PersonStanding;
  if (/HOMICID/.test(n)) return Skull;
  if (/INTRAFAM|SEXUAL/.test(n)) return HeartCrack;
  if (/EXTORS|SECUESTR/.test(n)) return Megaphone;
  if (/LESION/.test(n)) return ShieldAlert;
  return ShieldAlert;
}

function iconoValor(v: string): { icono: LucideIcon; color: string } {
  const n = v.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/FEMEN|MUJER/.test(n)) return { icono: UserRound, color: '#ec4899' };
  if (/MASCUL|HOMBRE/.test(n)) return { icono: UserRound, color: '#2563eb' };
  if (/PIE|PEATON/.test(n)) return { icono: Footprints, color: '#0f5f57' };
  if (/MOTO/.test(n)) return { icono: Bike, color: '#0f5f57' };
  if (/BICI/.test(n)) return { icono: Bike, color: '#16a34a' };
  if (/VEHIC|CARRO|AUTOM|TAXI|BUS|CAMION|CAMPERO/.test(n)) return { icono: Car, color: '#0f5f57' };
  if (/FUEGO/.test(n)) return { icono: Crosshair, color: '#b91c1c' };
  if (/CORTO|PUNZ|BLANCA|CUCHILL/.test(n)) return { icono: Scissors, color: '#b45309' };
  if (/CONTUND/.test(n)) return { icono: Hammer, color: '#475569' };
  if (/SIN EMPLEO|SIN ARMA|NINGUN/.test(n)) return { icono: Hand, color: '#0f5f57' };
  if (/VIA PUBLICA|CALLE/.test(n)) return { icono: MapPin, color: '#0f5f57' };
  if (/CASA|RESIDEN|APARTAM|VIVIENDA/.test(n)) return { icono: Home, color: '#0f5f57' };
  if (/ESTABLEC|COMERC|TIENDA|LOCAL/.test(n)) return { icono: Store, color: '#0f5f57' };
  return { icono: CircleHelp, color: '#0f5f57' };
}

const tituloCase = (t: string) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t);

/** Top 5 + «Otras» (el resto sumado, para que los % cierren en 100). */
function top5(v: VariableDelito) {
  const top = v.filas.slice(0, 5).map((f) => ({ ...f, nombre: tituloCase(f.nombre) }));
  const resto = v.filas.slice(5).reduce((s, f) => s + f.valor, 0);
  return resto > 0 ? [...top.slice(0, 4), { nombre: 'Otras', valor: resto + (top[4]?.valor ?? 0) }] : top;
}

function Kpi({ x, w, icono: Icono, titulo, sub, valor, unidad = 'casos', fondo }: { x: number; w: number; icono: LucideIcon; titulo: string; sub?: string; valor: string; unidad?: string; fondo: string }) {
  return (
    <div className="absolute flex items-center gap-3 overflow-hidden rounded-[12px] px-3 text-white" style={{ left: x, top: 116, width: w, height: 96, background: fondo, boxShadow: '0 3px 8px rgba(20,40,30,0.18)' }}>
      <Icono size={38} strokeWidth={2.1} className="shrink-0" />
      <div className="min-w-0 flex-1 text-center leading-none">
        <p className="whitespace-nowrap text-[21px] font-bold leading-[1.05]">{titulo}</p>
        {sub && <p className="text-[14px] leading-tight text-white/90">{sub}</p>}
        <p className="mt-1 text-[34px] font-extrabold">{valor}</p>
        {unidad && <p className="text-[15px] leading-none">{unidad}</p>}
      </div>
    </div>
  );
}

export const LaminaDelito = forwardRef<HTMLDivElement, { datos: DatosMicrogerencia; nodo: NodoMicrogerencia; esGeneral: boolean; delito: string }>(
  function LaminaDelito({ datos, nodo, esGeneral, delito }, ref) {
    const an = useMemo(() => analizarDelito(datos, nodo, esGeneral, delito), [datos, nodo, esGeneral, delito]);
    const { anioActual: A, anioAnterior: P } = datos;
    const corte = datos.fechaCorte ?? datos.actualFin;
    const mesCorte = Number(corte.split('-')[1]) - 1;
    const diaCorte = Number(corte.split('-')[2]);
    const mesParcial = diaCorte < new Date(A, mesCorte + 1, 0).getDate();
    const rango = `Ene – ${MESES_CORTOS[mesCorte]}`;
    const cobertura = esGeneral ? 'MEPOY' : etiquetaUnidad(nodo, esGeneral);
    const nombreDelito = tituloCase(delito);
    const Icono = iconoDelito(delito);

    if (!an) return <div ref={ref} style={{ width: ANCHO, height: ALTO }} />;
    const dif = an.b - an.a;
    const v = variacion(an.a, an.b);
    const trimCorte = Math.floor(mesCorte / 3);
    const trimParcial = mesParcial || mesCorte % 3 !== 2;
    const datosMes = an.meses.slice(0, mesCorte + 1).map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: m.a, [A]: m.b }));
    const datosTrim = an.trimestres.slice(0, trimCorte + 1).map((t, i) => ({ nombre: `${TRIM[i]}${i === trimCorte && trimParcial ? '*' : ''}`, [P]: t.a, [A]: t.b }));
    const totalDias = an.dias.reduce((s, x) => s + x, 0);
    const totalFranjas = an.franjas.reduce((s, x) => s + x, 0);
    const maxFranja = Math.max(1, ...an.franjas);
    const tituloSub = an.sub.singular === 'Estación' ? 'Distribución por estación' : an.sub.singular === 'CAI' ? 'Distribución por CAI' : an.sub.singular ? 'Distribución por zona de atención' : 'Distribución de la unidad';
    const filasSub = an.sub.filas.length ? an.sub.filas.map((f) => ({ ...f, nombre: nombreCorto(f.nombre) })) : [{ nombre: nombreCorto(nodo.nombre), t: an.t, a: an.a, b: an.b }];
    const [v1, v2, v3] = an.variables;

    // Principales hallazgos (solo lo que dicen las cifras).
    const hallazgos: string[] = [];
    hallazgos.push(an.a > 0
      ? `${nombreDelito} presenta ${dif > 0 ? 'un aumento' : dif < 0 ? 'una reducción' : 'el mismo número'} de ${signo(dif)}${formatNumero(dif)} casos (${signo(v ?? 0)}${formatDecimal(v ?? 0, 1)}%) frente al mismo periodo de ${P}.`
      : `${nombreDelito} registra ${formatNumero(an.b)} casos en ${A}, sin casos en el mismo periodo de ${P}.`);
    const mayorSub = [...an.sub.filas].sort((x, y) => y.b - x.b)[0];
    if (mayorSub && an.sub.filas.length > 1 && mayorSub.b > 0) hallazgos.push(`${nombreCorto(mayorSub.nombre)} concentra el ${pct(mayorSub.b, an.b)} de los casos (${formatNumero(mayorSub.b)}).`);
    const iFranja = an.franjas.indexOf(Math.max(...an.franjas));
    if (totalFranjas > 0) hallazgos.push(`El mayor número de casos se registró en la franja de ${FRANJAS[iFranja].replace(' – ', ' a ')} horas (${pct(an.franjas[iFranja], totalFranjas)}).`);
    if (v1?.filas[0]) hallazgos.push(`${v1.titulo} más frecuente: ${tituloCase(v1.filas[0].nombre)} (${pct(v1.filas[0].valor, v1.total)})${an.barrios[0] && an.barrios[0].b > 0 ? `; barrio con más casos: ${an.barrios[0].nombre} (${formatNumero(an.barrios[0].b)})` : ''}.`);

    const ejeY = { fontSize: 12, fill: C.texto, fontFamily: FUENTE };
    const sinVariable = (n: number) => (
      <div className="flex h-full items-center justify-center px-4 text-center text-[14px] text-slate-500">
        {n === 1 ? 'La matriz no trae variables específicas con información para este delito.' : 'No hay otra variable con información para este delito.'}
      </div>
    );
    const grad = (a: string, b: string) => `linear-gradient(135deg, ${a}, ${b})`;

    return (
      <div ref={ref} data-informe-microgerencia data-lamina-delito className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
        <EncabezadoLamina titulo="ANÁLISIS ESPECÍFICO POR DELITO – MEPOY" delito={nombreDelito} periodo={`${rango} ${A}`} comparacion={`${rango} ${P}`} corte={corte} cobertura={cobertura} fuente="SIEDCO" />

        {/* ── KPI ─────────────────────────────────────────────────── */}
        <div className="absolute flex items-center gap-3 overflow-hidden text-white" style={{ left: 12, top: 116, width: 268, height: 96, background: `linear-gradient(90deg, ${C.verdeOscuro}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 22px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
          <span className="ml-3 flex h-[70px] w-[70px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><Icono size={42} strokeWidth={2.2} /></span>
          <p className="min-w-0 pr-8 font-bold leading-[1.05]" style={{ fontSize: nombreDelito.length > 22 ? 21 : nombreDelito.length > 14 ? 26 : 31 }}>{nombreDelito}</p>
          <span className="absolute top-0 h-full w-[7px]" style={{ right: 11, background: C.lima, transform: 'skewX(-12deg)' }} />
        </div>
        <Kpi x={288} w={206} icono={CalendarDays} titulo={`Total ${P}`} valor={formatNumero(an.t)} fondo={grad('#1e40af', '#2563eb')} />
        <Kpi x={502} w={218} icono={CalendarDays} titulo={`${P} a la fecha`} valor={formatNumero(an.a)} fondo={grad('#14532d', '#16a34a')} />
        <Kpi x={728} w={220} icono={CalendarDays} titulo={`${A} a la fecha`} valor={formatNumero(an.b)} fondo={grad('#1e40af', '#2563eb')} />
        <Kpi x={956} w={224} icono={BarChart3} titulo="Diferencia" sub={`(${A} – ${P})`} valor={`${signo(dif)}${formatNumero(dif)}`} fondo={grad('#ea580c', dif > 0 ? '#dc2626' : '#f59e0b')} />
        <Kpi x={1188} w={222} icono={Percent} titulo="Variación" sub={`(${A} vs ${P})`} valor={v === null ? '—' : `${signo(v)}${formatDecimal(v, 1)}%`} unidad="" fondo={grad('#9f1239', '#be123c')} />
        <Kpi x={1418} w={242} icono={IconoDona} titulo="Participación" sub="en la delictividad" valor={an.participacion === null ? '—' : `${formatDecimal(an.participacion, 1)}%`} unidad="" fondo={grad('#0b3d2c', '#0e5a3c')} />

        {/* ── FILA 2 ──────────────────────────────────────────────── */}
        <Caja x={12} y={222} w={588} h={248}>
          <TituloBanda icono={IconoLinea}>Evolución mensual de casos</TituloBanda>
          <div className="flex justify-end px-4 pt-1"><Leyenda items={[{ color: AZUL, texto: String(P), linea: true }, { color: VERDE_B, texto: String(A), linea: true }]} /></div>
          <div className="h-[100px] pr-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosMes} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" hide />
                <YAxis width={44} tick={ejeY} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(x) => formatNumero(x)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(datosMes.flatMap((m) => [Number(m[P]), Number(m[A])]))} allowDecimals={false} />
                <Line type="monotone" dataKey={String(P)} stroke={AZUL} strokeWidth={2.4} dot={{ r: 4, fill: '#fff', stroke: AZUL, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey={String(A)} stroke={VERDE_B} strokeWidth={2.6} dot={{ r: 4, fill: '#fff', stroke: VERDE_B, strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="mx-2.5 border-collapse text-center text-[14px] leading-[20px]" style={{ width: 'calc(100% - 20px)' }}>
            <thead><tr><th className="w-[46px]" />{datosMes.map((m, i) => <th key={m.nombre} className="font-bold">{m.nombre}{i === mesCorte && mesParcial ? '*' : ''}</th>)}</tr></thead>
            <tbody>
              <tr style={{ background: '#e7effc' }}><th className="rounded-l-md text-white" style={{ background: AZUL }}>{P}</th>{datosMes.map((m) => <td key={m.nombre}>{formatNumero(Number(m[P]))}</td>)}</tr>
              <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md text-white" style={{ background: '#16a34a' }}>{A}</th>{datosMes.map((m) => <td key={m.nombre} className="font-bold">{formatNumero(Number(m[A]))}</td>)}</tr>
            </tbody>
          </table>
          {mesParcial && <p className="px-3 pt-0.5 text-[10.5px] text-slate-500">* {MESES_CORTOS[mesCorte]} parcial (hasta el {diaCorte}); {P} muestra el mes completo.</p>}
        </Caja>

        <Caja x={608} y={222} w={494} h={248}>
          <TituloBanda icono={BarChart3}>Comparativo trimestral</TituloBanda>
          <div className="flex justify-end px-4 pt-1"><Leyenda items={[{ color: AZUL, texto: String(P) }, { color: VERDE_B, texto: String(A) }]} /></div>
          <div className="min-h-0 flex-1 px-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosTrim} margin={{ top: 24, right: 8, left: 8, bottom: 0 }} barGap={4} barCategoryGap="24%">
                <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tick={{ fontSize: 15, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} />
                <YAxis hide domain={[0, (max: number) => max * 1.12]} />
                <Bar dataKey={String(P)} fill={AZUL} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey={String(P)} position="top" style={{ fontSize: 15, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} formatter={(x: unknown) => formatNumero(Number(x))} />
                </Bar>
                <Bar dataKey={String(A)} fill={VERDE_B} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey={String(A)} position="top" style={{ fontSize: 15, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} formatter={(x: unknown) => formatNumero(Number(x))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {trimParcial && <p className="pb-1.5 text-center text-[12.5px] text-slate-600">* {TRIM[trimCorte]}: información parcial ({MESES_CORTOS[trimCorte * 3]} – {MESES_CORTOS[mesCorte]}); {P} muestra el trimestre completo.</p>}
        </Caja>

        <Caja x={1110} y={222} w={550} h={248}>
          <TituloBanda icono={Building2}>{tituloSub}</TituloBanda>
          <TablaTriple titulo={an.sub.singular || 'Unidad'} filas={filasSub.slice(0, 6)} total={an.sub.filas.length > 1 ? sumar(an.sub.filas) : null} etiquetaTotal={esGeneral ? 'Total MEPOY' : `Total ${nombreCorto(nodo.nombre)}`} P={P} A={A} tam={15} anchoNombre={170} alto={24} />
        </Caja>

        {/* ── FILA 3 ──────────────────────────────────────────────── */}
        <Caja x={12} y={478} w={436} h={206}>
          <TituloBanda icono={MapPin}>Mapa de concentración del delito</TituloBanda>
          <div className="relative min-h-0 flex-1 px-2 pb-1 pt-1">
            <div className="h-[128px]"><MapaCobertura fuente="delictividad" nodo={nodo} esGeneral={esGeneral} delitos={[delito]} barrios={[]} inicio={datos.actualInicio} fin={datos.actualFin} aspecto={420 / 128} /></div>
            <div className="mt-1 flex items-center gap-2 px-2 text-[13px] font-bold">
              <span>Baja</span><span className="h-[10px] flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#22c55e,#a3e635,#facc15,#f97316,#dc2626)' }} /><span>Alta</span>
            </div>
          </div>
        </Caja>

        <Caja x={456} y={478} w={414} h={206}>
          <TituloBanda icono={ListChecks}>Top 10 barrios con más casos</TituloBanda>
          {an.barrios.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin barrios reportados.</p> : (
            <table className="mx-2.5 mt-0.5 border-collapse text-[11.5px] leading-[12.6px]" style={{ width: 'calc(100% - 20px)' }}>
              <thead><tr className="font-bold"><th className="text-left">#</th><th className="text-left">Barrio</th><th className="text-right">Total {P}</th><th className="text-right">{P}</th><th className="text-right">{A}</th><th className="pr-1 text-right">Part. {A}</th></tr></thead>
              <tbody>
                {an.barrios.map((b, i) => (
                  <tr key={b.nombre} style={{ background: i % 2 ? '#f6f8f7' : undefined }}>
                    <td className="pl-0.5">{i + 1}</td>
                    <td className="max-w-[150px] truncate">{b.nombre}</td>
                    <td className="text-right tabular-nums">{formatNumero(b.t)}</td>
                    <td className="text-right tabular-nums">{formatNumero(b.a)}</td>
                    <td className="text-right font-bold tabular-nums">{formatNumero(b.b)}</td>
                    <td className="pr-1 text-right tabular-nums">{pct(b.b, an.b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Caja>

        <Caja x={878} y={478} w={398} h={206}>
          <TituloBanda icono={CalendarDays}>Comportamiento por día de la semana</TituloBanda>
          {totalDias === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin información de día.</p> : (
            <div className="min-h-0 flex-1 px-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={an.dias.map((d, i) => ({ nombre: DIAS[i], valor: d }))} margin={{ top: 22, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                  <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tick={{ fontSize: 14, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} />
                  <YAxis hide domain={[0, (max: number) => max * 1.1]} />
                  <Bar dataKey="valor" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                    {an.dias.map((d, i) => <Cell key={i} fill={d === Math.max(...an.dias) ? '#15803d' : '#22a33a'} />)}
                    <LabelList dataKey="valor" position="top" style={{ fontSize: 13.5, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} formatter={(x: unknown) => pct(Number(x), totalDias)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Caja>

        <Caja x={1284} y={478} w={376} h={206}>
          <TituloBanda icono={Clock}>Comportamiento por franja horaria</TituloBanda>
          {totalFranjas === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin información de hora.</p> : (
            <div className="space-y-2 px-4 pt-3">
              {an.franjas.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[15px]">
                  <span className="w-[104px] shrink-0">{FRANJAS[i]}</span>
                  <span className="h-[20px] flex-1"><span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, (f / maxFranja) * 100)}%`, background: f === maxFranja ? '#15803d' : '#22a33a' }} /></span>
                  <span className="w-[50px] text-right font-bold tabular-nums">{pct(f, totalFranjas)}</span>
                </div>
              ))}
            </div>
          )}
        </Caja>

        {/* ── FILA 4: variables específicas del delito ──────────────── */}
        <Caja x={12} y={692} w={428} h={176}>
          <TituloBanda icono={IconoDona}>{v1 ? v1.titulo : 'Variables del delito'}</TituloBanda>
          {!v1 ? sinVariable(1) : (() => {
            const filas = top5(v1);
            return (
              <div className="flex min-h-0 flex-1 items-center gap-1 px-2">
                <div className="relative h-[124px] w-[124px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={filas} dataKey="valor" innerRadius={36} outerRadius={60} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                        {filas.map((f, i) => <Cell key={f.nombre} fill={PALETA[i % PALETA.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
                    <span className="text-[19px] font-extrabold">{formatNumero(v1.total)}</span>
                    <span className="text-[11px]">casos ({A})</span>
                  </div>
                </div>
                <table className="min-w-0 flex-1 border-collapse text-[13.5px] leading-[19px]">
                  <thead><tr className="font-bold"><th className="text-left">{v1.titulo.split(' ')[0]}</th><th className="text-right">Casos {A}</th><th className="text-right">%</th></tr></thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={f.nombre}>
                        <td className="max-w-[150px] truncate" title={f.nombre}><span className="mr-1.5 inline-block h-[10px] w-[10px] rounded-[2px] align-middle" style={{ background: PALETA[i % PALETA.length] }} />{f.nombre}</td>
                        <td className="text-right font-bold tabular-nums">{formatNumero(f.valor)}</td>
                        <td className="pl-1 text-right tabular-nums">{pct(f.valor, v1.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </Caja>

        <Caja x={448} y={692} w={392} h={176}>
          <TituloBanda icono={BarChart3}>{v2 ? <>{v2.titulo} <span className="text-[15px] font-normal">(Top 5)</span></> : 'Otras variables'}</TituloBanda>
          {!v2 ? sinVariable(2) : (() => {
            const filas = top5(v2);
            const max = Math.max(1, ...filas.map((f) => f.valor));
            return (
              <div className="space-y-[3px] px-3 pt-2">
                {filas.map((f) => (
                  <div key={f.nombre} className="flex items-center gap-2 text-[14px]" style={{ height: 21 }}>
                    <span className="w-[112px] shrink-0 truncate" title={f.nombre}>{f.nombre}</span>
                    <span className="h-[14px] flex-1"><span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.valor / max) * 100)}%`, background: '#22a33a' }} /></span>
                    <span className="w-[52px] text-right font-bold tabular-nums">{formatNumero(f.valor)}</span>
                    <span className="w-[52px] text-right text-[13px] tabular-nums">({pct(f.valor, v2.total)})</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </Caja>

        <Caja x={848} y={692} w={398} h={176}>
          <TituloBanda icono={Sun}>{v3 ? v3.titulo : 'Otras variables'}</TituloBanda>
          {!v3 ? sinVariable(3) : (
            <div className="flex min-h-0 flex-1 items-center justify-around px-2">
              {top5(v3).map((f) => {
                const { icono: I, color } = iconoValor(f.nombre);
                return (
                  <div key={f.nombre} className="flex w-[72px] flex-col items-center text-center leading-tight">
                    <I size={34} strokeWidth={2.2} style={{ color }} />
                    <p className="mt-1 line-clamp-2 h-[28px] text-[12px]">{f.nombre}</p>
                    <p className="text-[19px] font-extrabold">{pct(f.valor, v3.total)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Caja>

        <Caja x={1254} y={692} w={406} h={176}>
          <TituloBanda icono={Users}>Principales hallazgos</TituloBanda>
          <div className="space-y-1 px-3 pt-1.5">
            {hallazgos.slice(0, 4).map((h) => (
              <p key={h} className="flex gap-1.5 text-[12.8px] leading-[1.18]"><CheckCircle2 size={15} className="mt-[1px] shrink-0" style={{ color: '#16a34a' }} />{h}</p>
            ))}
          </div>
        </Caja>

        <PieLamina fuente="SIEDCO" nota="Información preliminar sujeta a validación y depuración." />
      </div>
    );
  },
);
