import { forwardRef, useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import {
  BarChart3, Bike, Building2, CalendarDays, Car, CheckCircle2, Clock, Crosshair, Footprints, Home, LineChart as IconoLinea, ListChecks,
  MapPin, Megaphone, PawPrint, PersonStanding, Scale, ShieldAlert, Skull, Store, Truck, Users, HeartCrack, UserRound, Cable, Map as IconoMapa,
  Siren, Flag, TriangleAlert, type LucideIcon,
} from 'lucide-react';
import type { DatosMicrogerencia, FilaTriple, NodoMicrogerencia } from '../../data/microgerencia';
import { analizarDelito, type ClaveVariable, type VariableDelito } from '../../data/microgerenciaDelito';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import {
  ALTO, ANCHO, C, EncabezadoLamina, FUENTE, Leyenda, MESES_CORTOS, MapaCobertura, PieLamina, etiquetaUnidad, nombreCorto, signo,
  techoBonito, marcasEjeValores, EtiquetaBarra, type EtiquetaProps,
} from './InformeEjecutivoMicrogerencia';
import { Caja, DonaSvg, TablaTriple, TituloBanda } from './LaminaOperatividad';

// ───────────────────────────────────────────────────────────────────────
// LÁMINA «MICROGERENCIA | ANÁLISIS ESPECÍFICO POR DELITO – MEPOY».
// Una por delito elegido y por unidad. Mismo lienzo, encabezado y pie de
// las demás láminas. Cifras de microgerenciaDelito.ts (registros reales):
//   Total {P} = año anterior completo · {P} y {A} = a la misma fecha de corte.
// Las variables cambian según el delito (plantilla por delito) y solo
// aparecen si los datos traen valores válidos; las de baja cobertura o
// muestra pequeña llevan advertencia.
// ───────────────────────────────────────────────────────────────────────

const variacion = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);
const pct = (v: number, total: number) => (total > 0 ? `${formatDecimal((v / total) * 100, 1)}%` : 'N/A');
const pctVar = (a: number, b: number) => { const v = variacion(a, b); return v === null ? 'N/A' : `${signo(v)}${formatDecimal(v, 1)}%`; };
const FRANJAS = ['00:00 – 05:59', '06:00 – 11:59', '12:00 – 17:59', '18:00 – 23:59'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TRIM = ['Trim. I', 'Trim. II', 'Trim. III', 'Trim. IV'];
const PALETA = ['#1d64d8', '#f59e0b', '#a21caf', '#16a34a', '#64748b', '#0ea5e9'];
const AZUL = '#1d64d8';
const VERDE_B = '#22b33a';
const colorDif = (n: number) => (n > 0 ? C.rojo : n < 0 ? C.verdeDif : '#8a949b');

function iconoDelito(delito: string): LucideIcon {
  const n = delito.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/MOTO/.test(n)) return Bike;
  if (/AUTOMOTOR|VEHICUL/.test(n)) return Car;
  if (/BICICLET/.test(n)) return Bike;
  if (/CABLE/.test(n)) return Cable;
  if (/RESIDENC/.test(n)) return Home;
  if (/COMERCIO/.test(n)) return Store;
  if (/SEMOVIENT/.test(n)) return PawPrint;
  if (/PIRATER/.test(n)) return Truck;
  if (/PERSONAS|CELULAR/.test(n)) return PersonStanding;
  if (/HOMICID/.test(n)) return Skull;
  if (/INTRAFAM|SEXUAL/.test(n)) return HeartCrack;
  if (/EXTORS|SECUESTR/.test(n)) return Megaphone;
  if (/TERROR/.test(n)) return Siren;
  return ShieldAlert;
}

const ICONO_VARIABLE: Record<ClaveVariable, LucideIcon> = {
  genero: Users, grupoEdad: UserRound, modalidad: ListChecks, armas: Crosshair, claseSitio: MapPin, causaLesion: ShieldAlert,
  conductas: Scale, spoa: Flag, unidadApoya: Building2, movilAgresor: Footprints, movilVictima: Footprints, pais: Flag,
};

const tituloCase = (t: string) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const edadCorta = (n: string) => n.replace(/^[^(]*\(\s*/, '').replace(/\s*\)\s*$/, '').replace(/(\d+)\s*a\s*(\d+)\s*años/i, '$1 – $2 años').replace(/>\s*(\d+)\s*años/i, '> $1 años') || n;

/** Top N + «Otros» (el resto sumado, para que los % cierren en 100). */
function topN(v: VariableDelito, n: number) {
  const nombre = (x: string) => (v.clave === 'grupoEdad' ? edadCorta(x) : tituloCase(x));
  if (v.filas.length <= n) return v.filas.map((f) => ({ ...f, nombre: nombre(f.nombre) }));
  const top = v.filas.slice(0, n - 1).map((f) => ({ ...f, nombre: nombre(f.nombre) }));
  return [...top, { nombre: 'Otros', valor: v.filas.slice(n - 1).reduce((s, f) => s + f.valor, 0) }];
}

function Kpi({ x, w, titulo, valor, fondo, flecha }: { x: number; w: number; titulo: React.ReactNode; valor: string; fondo: string; flecha?: '▲' | '▼' }) {
  return (
    <div className="absolute flex flex-col items-center justify-center overflow-hidden rounded-[12px] text-white" style={{ left: x, top: 116, width: w, height: 96, background: fondo, boxShadow: '0 3px 8px rgba(20,40,30,0.18)' }}>
      <p className="whitespace-nowrap text-[22px] font-bold leading-none">{titulo}</p>
      <p className="mt-2 whitespace-nowrap text-[38px] font-extrabold leading-none">{flecha && <span className="mr-1 text-[26px] align-[4px]">{flecha}</span>}{valor}</p>
    </div>
  );
}

/** Advertencias de una variable: cobertura del dato y tamaño de la muestra. */
function notaVariable(v: VariableDelito): string | null {
  const partes: string[] = [];
  if (v.bajaCobertura) partes.push(`Baja cobertura: dato en el ${formatDecimal(v.cobertura, 0)}% de los casos`);
  else if (v.cobertura < 90) partes.push(`Dato válido en el ${formatDecimal(v.cobertura, 0)}% de los casos`);
  if (v.total < 20) partes.push(`muestra pequeña (n = ${v.total})`);
  return partes.length ? partes.join(' · ') : null;
}

function ComponenteVariable({ x, y, w, h, v, A }: { x: number; y: number; w: number; h: number; v: VariableDelito; A: number }) {
  const nota = notaVariable(v);
  const usarDona = v.forma === 'dona' && v.filas.length <= 3;
  const filas = topN(v, usarDona ? 3 : 5);
  const max = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <Caja x={x} y={y} w={w} h={h}>
      <TituloBanda icono={ICONO_VARIABLE[v.clave]}>{v.titulo}</TituloBanda>
      {usarDona ? (
        <div className="flex min-h-0 flex-1 items-center gap-2 pl-2 pr-2">
          <DonaSvg partes={filas.map((f, i) => ({ ...f, color: PALETA[i % PALETA.length] }))} total={v.total} unidad="casos" A={A} tam={124} />
          <div className="min-w-0 flex-1 space-y-1.5">
            {filas.map((f, i) => (
              <div key={f.nombre} className="flex items-start gap-1.5">
                <span className="mt-[3px] h-[13px] w-[13px] shrink-0 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[14.5px] font-semibold" title={f.nombre}>{f.nombre}</p>
                  <p className="whitespace-nowrap text-[14px] tabular-nums"><strong>{formatNumero(f.valor)}</strong> ({pct(f.valor, v.total)})</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-2.5 pt-2">
          {filas.map((f) => (
            <div key={f.nombre} className="flex items-center gap-2 text-[14px]" style={{ height: 25 }}>
              <span className="w-[112px] shrink-0 truncate" title={f.nombre}>{f.nombre}</span>
              <span className="h-[15px] flex-1"><span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.valor / max) * 100)}%`, background: f.nombre === 'Otros' ? '#86c79a' : '#22a33a' }} /></span>
              <span className="w-[38px] text-right font-bold tabular-nums">{formatNumero(f.valor)}</span>
              <span className="w-[54px] text-right text-[13px] tabular-nums">({pct(f.valor, v.total)})</span>
            </div>
          ))}
        </div>
      )}
      {nota && <p className="flex items-center gap-1 px-2.5 pb-1 text-[11px] leading-tight text-amber-700"><TriangleAlert size={12} className="shrink-0" />{nota}</p>}
    </Caja>
  );
}

function TablaBarrios({ filas, P, A, totalA, top }: { filas: FilaTriple[]; P: number; A: number; totalA: number; top: number }) {
  const lista = filas.slice(0, top);
  const tot = lista.reduce((s, f) => ({ t: s.t + f.t, a: s.a + f.a, b: s.b + f.b }), { t: 0, a: 0, b: 0 });
  const alto = top > 5 ? 17 : 25;
  return (
    <table className="mx-2.5 mt-1.5 border-collapse leading-[1.2]" style={{ width: 'calc(100% - 20px)', fontSize: top > 5 ? 13 : 15 }}>
      <thead>
        <tr className="whitespace-nowrap font-bold" style={{ fontSize: top > 5 ? 12 : 13.5 }}>
          <th className="w-[20px] text-left">#</th><th className="text-left">Barrio</th><th className="text-right">Total {P}</th><th className="text-right">{P}</th><th className="text-right">{A}</th><th className="pr-1 text-right">Part. {A}</th>
        </tr>
      </thead>
      <tbody>
        {lista.map((b, i) => (
          <tr key={b.nombre} style={{ height: alto, background: i % 2 ? '#f6f8f7' : undefined }}>
            <td className="pl-0.5">{i + 1}</td>
            <td className="max-w-[150px] truncate" title={b.nombre}>{b.nombre}</td>
            <td className="text-right tabular-nums">{formatNumero(b.t)}</td>
            <td className="text-right tabular-nums">{formatNumero(b.a)}</td>
            <td className="text-right font-bold tabular-nums">{formatNumero(b.b)}</td>
            <td className="pr-1 text-right tabular-nums">{pct(b.b, totalA)}</td>
          </tr>
        ))}
        <tr className="font-bold text-white" style={{ background: C.verde, height: alto + 3 }}>
          <td colSpan={2} className="whitespace-nowrap rounded-l-[7px] px-2">Total (Top {lista.length})</td>
          <td className="text-right tabular-nums">{formatNumero(tot.t)}</td>
          <td className="text-right tabular-nums">{formatNumero(tot.a)}</td>
          <td className="text-right tabular-nums">{formatNumero(tot.b)}</td>
          <td className="rounded-r-[7px] pr-1 text-right tabular-nums">{pct(tot.b, totalA)}</td>
        </tr>
      </tbody>
    </table>
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
    // Mensual: {P} el año completo; {A} solo hasta el corte (sin ceros futuros).
    const datosMes = an.meses.map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: m.a, [A]: i <= mesCorte ? m.b : null }));
    const datosTrim = an.trimestres.slice(0, trimCorte + 1).map((t, i) => ({ nombre: `${TRIM[i]}${i === trimCorte && trimParcial ? '*' : ''}`, [P]: t.a, [A]: t.b }));
    const tituloSub = an.sub.singular === 'Estación' ? 'Resultados por estación' : an.sub.singular === 'CAI' ? 'Resultados por CAI' : an.sub.singular ? 'Resultados por zona de atención' : 'Resultados de la unidad';
    const filasSub = an.sub.filas.length ? an.sub.filas.map((f) => ({ ...f, nombre: nombreCorto(f.nombre) })) : [{ nombre: nombreCorto(nodo.nombre), t: an.t, a: an.a, b: an.b }];
    const totalSub = { t: an.t, a: an.a, b: an.b };

    // Variables: la fila 3 empieza por la demografía (como la referencia) y
    // se completa con las de mayor prioridad del delito; el resto, fila 4.
    const demografia = an.variables.filter((x) => (x.clave === 'genero' || x.clave === 'grupoEdad') && !x.bajaCobertura);
    const otras = an.variables.filter((x) => !demografia.includes(x));
    const fila3 = [...demografia, ...otras].slice(0, 5);
    const fila4 = an.variables.filter((x) => !fila3.includes(x)).slice(0, 2);

    // Componentes de respaldo (temporal) cuando el delito tiene pocas variables.
    const totalDias = an.dias.reduce((s, x) => s + x, 0);
    const totalFranjas = an.franjas.reduce((s, x) => s + x, 0);
    const respaldo: ('franja' | 'dia' | 'hallazgos')[] = [];
    if (totalFranjas > 0) respaldo.push('franja');
    if (totalDias > 0) respaldo.push('dia');
    respaldo.push('hallazgos');

    // Principales hallazgos (solo lo que dicen las cifras, sin causas).
    const hallazgos: string[] = [];
    hallazgos.push(an.a > 0
      ? `${dif > 0 ? 'Aumento' : dif < 0 ? 'Reducción' : 'Sin variación'} de ${signo(dif)}${formatNumero(dif)} casos (${pctVar(an.a, an.b)}) frente al mismo periodo de ${P}.`
      : `${formatNumero(an.b)} casos en ${A}; sin casos en el mismo periodo de ${P} (variación N/A).`);
    const mayorSub = [...an.sub.filas].sort((x, y) => y.b - x.b)[0];
    if (mayorSub && an.sub.filas.length > 1 && mayorSub.b > 0) hallazgos.push(`${nombreCorto(mayorSub.nombre)} concentra el ${pct(mayorSub.b, an.b)} de los casos.`);
    if (an.barrios[0]?.b) hallazgos.push(`Barrio con más casos: ${an.barrios[0].nombre} (${formatNumero(an.barrios[0].b)}).`);
    const iFranja = an.franjas.indexOf(Math.max(...an.franjas));
    if (totalFranjas > 0) hallazgos.push(`Franja con más casos: ${FRANJAS[iFranja]} (${pct(an.franjas[iFranja], totalFranjas)}).`);
    if (an.b > 0 && an.b < 20) hallazgos.push(`Muestra pequeña (${an.b} casos): las participaciones deben leerse con cautela.`);

    const ejeY = { fontSize: 11.5, fill: C.texto, fontFamily: FUENTE };
    const grad = (a: string, b: string) => `linear-gradient(135deg, ${a}, ${b})`;

    const respaldoCaja = (tipo: 'franja' | 'dia' | 'hallazgos', x: number, w: number) => {
      if (tipo === 'franja') {
        const maxF = Math.max(1, ...an.franjas);
        return (
          <Caja key="franja" x={x} y={668} w={w} h={206}>
            <TituloBanda icono={Clock}>Franja horaria</TituloBanda>
            <div className="space-y-2 px-3 pt-3">
              {an.franjas.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-[14px]">
                  <span className="w-[100px] shrink-0">{FRANJAS[i]}</span>
                  <span className="h-[17px] flex-1"><span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, (f / maxF) * 100)}%`, background: f === maxF ? '#15803d' : '#22a33a' }} /></span>
                  <span className="w-[34px] text-right font-bold tabular-nums">{formatNumero(f)}</span>
                  <span className="w-[50px] text-right text-[13px] tabular-nums">({pct(f, totalFranjas)})</span>
                </div>
              ))}
            </div>
          </Caja>
        );
      }
      if (tipo === 'dia') {
        const maxD = Math.max(...an.dias);
        return (
          <Caja key="dia" x={x} y={668} w={w} h={206}>
            <TituloBanda icono={CalendarDays}>Día de la semana</TituloBanda>
            <div className="min-h-0 flex-1 px-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={an.dias.map((d, i) => ({ nombre: DIAS[i], valor: d }))} margin={{ top: 20, right: 4, left: 4, bottom: 0 }} barCategoryGap="22%">
                  <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tick={{ fontSize: 13, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} />
                  <YAxis hide domain={[0, (m: number) => m * 1.1]} />
                  <Bar dataKey="valor" radius={[3, 3, 0, 0]} isAnimationActive={false} fill="#22a33a">
                    <LabelList dataKey="valor" position="top" style={{ fontSize: 13, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} formatter={(x: unknown) => (Number(x) === maxD ? `${formatNumero(Number(x))}` : formatNumero(Number(x)))} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Caja>
        );
      }
      return (
        <Caja key="hallazgos" x={x} y={668} w={w} h={206}>
          <TituloBanda icono={CheckCircle2}>Principales hallazgos</TituloBanda>
          <div className="space-y-1.5 px-3 pt-2">
            {hallazgos.slice(0, 5).map((t) => (
              <p key={t} className="flex gap-1.5 text-[13px] leading-[1.2]"><CheckCircle2 size={15} className="mt-[1px] shrink-0" style={{ color: '#16a34a' }} />{t}</p>
            ))}
          </div>
        </Caja>
      );
    };

    // Fila 4 (desde x = 968): dos espacios de 342 px.
    const espacios4 = [968, 1318];
    const cajasFila4 = espacios4.map((x, i) => {
      const variable = fila4[i];
      if (variable) return <ComponenteVariable key={variable.clave} x={x} y={668} w={342} h={206} v={variable} A={A} />;
      const tipo = respaldo[i - fila4.length];
      return tipo ? respaldoCaja(tipo, x, 342) : null;
    });
    const usarZonas = an.zonas.length >= 2 && an.sub.singular !== 'Zona';

    return (
      <div ref={ref} data-informe-microgerencia data-lamina-delito className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
        <EncabezadoLamina titulo="ANÁLISIS ESPECÍFICO POR DELITO – MEPOY" delito={nombreDelito} periodo={`${rango} ${A}`} comparacion={`${rango} ${P}`} corte={corte} cobertura={cobertura} fuente="SIEDCO" />

        {/* ── FILA 1 · KPI ─────────────────────────────────────────── */}
        <div className="absolute flex items-center gap-3 overflow-hidden text-white" style={{ left: 12, top: 116, width: 268, height: 96, background: `linear-gradient(90deg, ${C.verdeOscuro}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 22px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
          <span className="ml-3 flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><Icono size={40} strokeWidth={2.2} /></span>
          <p className="min-w-0 pr-8 font-bold leading-[1.05]" style={{ fontSize: nombreDelito.length > 22 ? 20 : nombreDelito.length > 14 ? 25 : 30 }}>{nombreDelito}</p>
          <span className="absolute top-0 h-full w-[7px]" style={{ right: 11, background: C.lima, transform: 'skewX(-12deg)' }} />
        </div>
        <Kpi x={288} w={268} titulo={`Total ${P}`} valor={`${formatNumero(an.t)} ${an.t === 1 ? 'caso' : 'casos'}`} fondo={grad('#1e3a8a', '#2563eb')} />
        <Kpi x={564} w={268} titulo={<>{P} <span className="text-[16px] font-semibold">a la fecha</span></>} valor={`${formatNumero(an.a)} ${an.a === 1 ? 'caso' : 'casos'}`} fondo={grad('#1e40af', '#3b82f6')} />
        <Kpi x={840} w={268} titulo={<>{A} <span className="text-[16px] font-semibold">a la fecha</span></>} valor={`${formatNumero(an.b)} ${an.b === 1 ? 'caso' : 'casos'}`} fondo={grad('#14532d', '#16a34a')} />
        <Kpi x={1116} w={268} titulo="Diferencia" valor={`${signo(dif)}${formatNumero(dif)} ${Math.abs(dif) === 1 ? 'caso' : 'casos'}`} fondo={grad('#c2410c', '#f97316')} />
        <Kpi x={1392} w={268} titulo="Variación" valor={v === null ? 'N/A' : `${signo(v)}${formatDecimal(v, 1)}%`} flecha={v === null || v === 0 ? undefined : v > 0 ? '▲' : '▼'}
          fondo={v === null || v === 0 ? grad('#475569', '#64748b') : v > 0 ? grad('#991b1b', '#dc2626') : grad('#14532d', '#16a34a')} />

        {/* ── FILA 2 ───────────────────────────────────────────────── */}
        <Caja x={12} y={220} w={452} h={232}>
          <TituloBanda icono={IconoLinea}>Evolución mensual de casos</TituloBanda>
          <div className="flex justify-end px-4 pt-0.5"><Leyenda items={[{ color: AZUL, texto: String(P), linea: true }, { color: VERDE_B, texto: String(A), linea: true }]} /></div>
          <div className="h-[70px] pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" hide />
                <YAxis width={34} tick={ejeY} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(x) => formatNumero(x)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(datosMes.flatMap((m) => [Number(m[P] ?? 0), Number(m[A] ?? 0)]))} allowDecimals={false} />
                <Line type="monotone" dataKey={String(P)} stroke={AZUL} strokeWidth={2.2} dot={{ r: 3.5, fill: '#fff', stroke: AZUL, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey={String(A)} stroke={VERDE_B} strokeWidth={2.4} dot={{ r: 3.5, fill: '#fff', stroke: VERDE_B, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="mx-2 border-collapse text-center text-[12.5px] leading-[17px]" style={{ width: 'calc(100% - 16px)' }}>
            <thead><tr><th className="w-[38px]" />{datosMes.map((m, i) => <th key={m.nombre} className="font-bold">{m.nombre}{i === mesCorte && mesParcial ? '*' : ''}</th>)}</tr></thead>
            <tbody>
              <tr style={{ background: '#e7effc' }}><th className="rounded-l-md text-white" style={{ background: AZUL }}>{P}</th>{an.meses.map((m, i) => <td key={i}>{formatNumero(m.a)}</td>)}</tr>
              <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md text-white" style={{ background: '#16a34a' }}>{A}</th>{an.meses.map((m, i) => <td key={i} className="font-bold">{i <= mesCorte ? formatNumero(m.b) : '–'}</td>)}</tr>
              <tr><th className="text-[11px] font-bold">Dif.</th>{an.meses.map((m, i) => {
                // Mes parcial: se compara contra el año anterior hasta el mismo día.
                const d = m.b - (i === mesCorte ? m.ant : m.a);
                return <td key={i} className="font-bold" style={{ color: i <= mesCorte ? colorDif(d) : '#9aa3a8' }}>{i <= mesCorte ? `${signo(d)}${formatNumero(d)}` : ''}</td>;
              })}</tr>
            </tbody>
          </table>
          <p className="px-2.5 pt-0.5 text-[10.5px] leading-tight text-slate-500">{mesParcial ? `* ${MESES_CORTOS[mesCorte]} parcial (al ${diaCorte}); su diferencia se compara al mismo día de ${P}. ` : ''}«–» = sin información aún.</p>
        </Caja>

        <Caja x={472} y={220} w={360} h={232}>
          <TituloBanda icono={BarChart3}>Comparativo trimestral</TituloBanda>
          <div className="flex justify-end px-4 pt-0.5"><Leyenda items={[{ color: AZUL, texto: String(P) }, { color: VERDE_B, texto: String(A) }]} /></div>
          <div className="min-h-0 flex-1 px-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosTrim} margin={{ top: 22, right: 6, left: 6, bottom: 0 }} barGap={3} barCategoryGap="18%">
                <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} height={22} tick={{ fontSize: 14, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }} />
                <YAxis hide domain={[0, (max: number) => max * 1.08]} />
                <Bar dataKey={String(P)} fill={AZUL} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey={String(P)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="izq" tam={14} />} />
                </Bar>
                <Bar dataKey={String(A)} fill={VERDE_B} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey={String(A)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="der" tam={14} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="h-[30px] shrink-0 px-2 text-center text-[11.5px] leading-tight text-slate-600">
            {trimParcial ? `* ${TRIM[trimCorte]}: información parcial (${MESES_CORTOS[trimCorte * 3].toLowerCase()} – ${diaCorte} ${MESES_CORTOS[mesCorte].toLowerCase()}), comparada a la misma fecha en ambos años.` : 'Trimestres comparados a la misma fecha en ambos años.'}
          </p>
        </Caja>

        <Caja x={840} y={220} w={410} h={232}>
          <TituloBanda icono={Building2}>{tituloSub}</TituloBanda>
          <TablaTriple titulo={an.sub.singular || 'Unidad'} filas={filasSub.slice(0, 6)} total={an.sub.filas.length > 1 ? totalSub : null} etiquetaTotal={esGeneral ? 'Total MEPOY' : `Total ${nombreCorto(nodo.nombre)}`} P={P} A={A} tam={14.5} anchoNombre={130} alto={filasSub.length > 5 ? 21 : 25} />
        </Caja>

        <Caja x={1258} y={220} w={402} h={232}>
          <TituloBanda icono={ListChecks}>Top 5 barrios con más casos</TituloBanda>
          {an.barrios.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin barrios reportados.</p> : <TablaBarrios filas={an.barrios} P={P} A={A} totalA={an.b} top={5} />}
        </Caja>

        {/* ── FILA 3 · variables del delito ─────────────────────────── */}
        {[0, 1, 2, 3, 4].map((i) => {
          const x = 12 + i * 330;
          const w = i === 4 ? 328 : 322;
          const variable = fila3[i];
          if (variable) return <ComponenteVariable key={variable.clave} x={x} y={460} w={w} h={200} v={variable} A={A} />;
          return (
            <Caja key={`vacio-${i}`} x={x} y={460} w={w} h={200}>
              <TituloBanda icono={ListChecks}>Variables del delito</TituloBanda>
              <p className="flex flex-1 items-center justify-center px-4 text-center text-[13.5px] text-slate-500">{i === 0 ? 'Los datos cargados no traen variables con información para este delito.' : 'No hay otra variable con información válida para este delito.'}</p>
            </Caja>
          );
        })}

        {/* ── FILA 4 · mapa, territorio y demás variables ──────────── */}
        <Caja x={12} y={668} w={520} h={206}>
          <TituloBanda icono={IconoMapa}>Mapa de concentración del delito</TituloBanda>
          <div className="relative min-h-0 flex-1 px-2 pb-1 pt-1">
            <div className="h-[132px]"><MapaCobertura fuente="delictividad" nodo={nodo} esGeneral={esGeneral} delitos={[delito]} barrios={[]} inicio={datos.actualInicio} fin={datos.actualFin} aspecto={504 / 132} /></div>
            <div className="mt-1 flex items-center gap-2 px-2 text-[12.5px] font-bold">
              <span>Baja</span><span className="h-[9px] flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#22c55e,#a3e635,#facc15,#f97316,#dc2626)' }} /><span>Alta</span>
              <span className="ml-2 font-normal text-slate-500">Solo registros de {nombreDelito} con coordenadas</span>
            </div>
          </div>
        </Caja>

        <Caja x={540} y={668} w={420} h={206}>
          {usarZonas ? (
            <>
              <TituloBanda icono={MapPin}>Zonas de atención con más casos</TituloBanda>
              <TablaTriple titulo="Zona de atención" filas={an.zonas.slice(0, 5).map((z) => ({ ...z, nombre: nombreCorto(z.nombre) }))} total={null} etiquetaTotal="" P={P} A={A} tam={13.5} anchoNombre={150} alto={24} />
              {an.zonas.length > 5 && <p className="px-3 pt-1 text-[11px] text-slate-500">Top 5 de {an.zonas.length} zonas con casos.</p>}
            </>
          ) : (
            <>
              <TituloBanda icono={ListChecks}>Top 10 barrios</TituloBanda>
              {an.barrios.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin barrios reportados.</p> : <TablaBarrios filas={an.barrios} P={P} A={A} totalA={an.b} top={8} />}
            </>
          )}
        </Caja>

        {cajasFila4}

        <PieLamina fuente="SIEDCO" nota={an.sensible ? 'Datos agregados; categorías con menos de 3 casos se agrupan para proteger la identidad.' : 'Información preliminar sujeta a validación y depuración.'} />
      </div>
    );
  },
);
