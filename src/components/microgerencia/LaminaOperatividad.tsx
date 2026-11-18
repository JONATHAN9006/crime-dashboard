import { forwardRef } from 'react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis,
} from 'recharts';
import {
  BadgeCheck, BarChart3, Bike, Car, CheckCircle2, ChevronDown, Crosshair, Leaf, LineChart as IconoLinea,
  MapPin, PieChart as IconoDona, Scale, Siren, TrendingDown, TrendingUp, UserCheck, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import type { DatosMicrogerencia, NodoMicrogerencia } from '../../data/microgerencia';
import { tipoOperatividad, type TipoOperatividad } from '../../utils/operatividadConteo';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import {
  ALTO, ANCHO, C, EncabezadoLamina, FUENTE, Leyenda, MESES_CORTOS, MapaCobertura, Panel, PieLamina, TituloPanel,
  etiquetaUnidad, marcasEjeValores, nombreCorto, pct1, signo, subunidades, techoBonito,
} from './InformeEjecutivoMicrogerencia';

// ───────────────────────────────────────────────────────────────────────
// LÁMINA «MICROGERENCIA | OPERATIVIDAD INSTITUCIONAL – MEPOY».
// Mismo lienzo (1672 × 941), encabezado, pie, paneles y tipografía de la
// lámina de Delictividad. Todas las cifras salen del nodo que arma
// useMicrogerenciaOperatividad con las MISMAS reglas de conteo del módulo
// «Operatividad por Unidad» (utils/operatividadConteo): la droga va en
// gramos y nunca se suma a los procedimientos.
// ───────────────────────────────────────────────────────────────────────

const g = (v: number) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} g`;
const kg = (v: number) => `${(v / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg`;
const pctDe = (v: number, total: number) => (total > 0 ? `${formatDecimal((v / total) * 100, 1)}%` : '—');
const variacion = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);
const colorDif = (n: number) => (n > 0 ? C.rojo : n < 0 ? C.verdeDif : '#8a949b');
const PALETA_CAT = ['#0e6b3f', '#1d64d8', '#f59e0b', '#14b8a6', '#7c3aed', '#64748b', '#0ea5e9', '#a3a3a3', '#be123c'];

function KpiOperativo({ x, w, icono: Icono, titulo, valor, extra, a, b, fondo, formato = formatNumero }: {
  x: number; w: number; icono: LucideIcon; titulo: string; valor: string; extra?: string; a: number; b: number; fondo: string;
  formato?: (v: number) => string;
}) {
  const dif = b - a;
  const pct = variacion(a, b);
  const Flecha = dif < 0 ? TrendingDown : TrendingUp;
  return (
    <div className="absolute flex flex-col items-center overflow-hidden rounded-[12px] px-2 pt-2 text-white" style={{ left: x, top: 116, width: w, height: 98, background: fondo, boxShadow: '0 3px 8px rgba(20,40,30,0.18)' }}>
      <div className="flex items-center gap-2">
        <Icono size={24} strokeWidth={2.2} className="shrink-0" />
        <p className="whitespace-nowrap font-bold leading-[1.05]" style={{ fontSize: titulo.length > 20 ? 15 : 16.5 }}>{titulo}</p>
      </div>
      <p className="mt-1 whitespace-nowrap font-extrabold leading-none tracking-[0.2px]" style={{ fontSize: extra ? (valor.length > 11 ? 24 : 27) : valor.length > 11 ? 26 : 33 }}>{valor}</p>
      {extra && <p className="text-[12px] font-semibold leading-none text-white/90">{extra}</p>}
      <span className="mt-auto mb-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-[1px] text-[15px] font-bold" style={{ background: '#e7f7c8', color: '#14532d' }}>
        {a > 0 || b > 0 ? (a > 0 ? <><Flecha size={15} strokeWidth={2.6} />{signo(dif)}{formato(dif)} ({pct1(pct)})</> : 'Sin periodo comparable') : 'Sin registros'}
      </span>
    </div>
  );
}

function ListaBarras({ filas, total, formato = formatNumero, colores, anchoNombre = 190, alto = 25, maxFilas = 5, compacta = false }: {
  filas: { nombre: string; valor: number }[]; total: number; formato?: (v: number) => string; colores?: string[]; anchoNombre?: number; alto?: number; maxFilas?: number; compacta?: boolean;
}) {
  const vis = filas.slice(0, maxFilas);
  const max = Math.max(1, ...vis.map((f) => f.valor));
  if (vis.length === 0) return <p className="px-4 py-6 text-center text-[15px] text-slate-500">Sin registros en el periodo.</p>;
  return (
    <div className={compacta ? 'px-2 pt-0.5' : 'space-y-[3px] px-4 pt-2'}>
      {vis.map((f, i) => (
        <div key={f.nombre} className={`flex items-center gap-2 ${compacta ? 'text-[14px]' : 'text-[15px]'}`} style={{ height: alto }}>
          <span className="truncate" style={{ width: anchoNombre }} title={f.nombre}>{f.nombre}</span>
          <span className="h-[13px] flex-1 overflow-hidden rounded-[2px] bg-[#eef1f2]">
            <span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.valor / max) * 100)}%`, background: colores?.[i] ?? C.verde }} />
          </span>
          <span className="w-[86px] text-right font-bold tabular-nums">{formato(f.valor)}</span>
          <span className="w-[56px] text-right text-[13.5px] tabular-nums">({pctDe(f.valor, total)})</span>
        </div>
      ))}
    </div>
  );
}

/** Nombres largos de la matriz, abreviados SOLO para que quepan (mismo dato). */
function abreviar(n: string): string {
  return n
    .replace(/^Violencia Intrafamiliar$/i, 'V. Intrafamiliar')
    .replace(/^Lesiones Personales$/i, 'L. Personales')
    .replace(/^Hurto (a )?Personas$/i, 'H. Personas')
    .replace(/Tr[aá]fico,?\s*Fabricaci[oó]n\s*O\s*Porte\s*De\s*Estupefacientes/i, 'Tráfico, fab. o porte estupef.')
    .replace(/Fabricaci[oó]n,?\s*Tr[aá]fico\s*Y?\s*Porte\s*De\s*Armas.*$/i, 'Porte ilegal de armas')
    .replace(/\bReceptacion\b/i, 'Receptación');
}

/** Nombre corto de una categoría de la matriz para tablas y leyendas. */
const nombreCategoria = (n: string) => n.replace(/\bIncautacion\b/i, 'Incautación').replace(/\bMercancia\b/gi, 'Mercancía');

export const LaminaOperatividad = forwardRef<HTMLDivElement, { datos: DatosMicrogerencia; nodo: NodoMicrogerencia; esGeneral: boolean }>(
  function LaminaOperatividad({ datos, nodo, esGeneral }, ref) {
    const { anioActual: A, anioAnterior: P } = datos;
    const corte = datos.fechaCorte ?? datos.actualFin;
    const mesCorte = Number(corte.split('-')[1]) - 1;
    const diaCorte = Number(corte.split('-')[2]);
    const mesParcial = diaCorte < new Date(A, mesCorte + 1, 0).getDate();
    const rangoMeses = `Ene – ${MESES_CORTOS[mesCorte]}`;
    const tituloNodo = etiquetaUnidad(nodo, esGeneral);
    const op = nodo.operativo;

    // KPI por tipo (mismas reglas de conteo de Operatividad por Unidad).
    const porTipo = (t: TipoOperatividad) => nodo.delitos.filter((c) => tipoOperatividad(c.nombre) === t).reduce((acc, c) => ({ a: acc.a + c.fecha2025, b: acc.b + c.fecha2026 }), { a: 0, b: 0 });
    const capturas = porTipo('capturas');
    const armas = porTipo('armas');
    const motos = porTipo('motos');
    const autos = porTipo('automotores');
    const droga = { a: op?.drogaG2025 ?? 0, b: op?.drogaG2026 ?? 0 };

    const historico = (nodo.historico ?? []).map((h) => ({ anio: String(h.anio), casos: h.casos, parcial: h.parcial, actual: h.anio === A }));
    const categorias = [...nodo.delitos].filter((c) => c.fecha2026 > 0).sort((a, b) => b.fecha2026 - a.fecha2026);
    const totalCat = categorias.reduce((a, c) => a + c.fecha2026, 0);
    const datosMes = nodo.meses.map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: m.anio2025, [A]: i > mesCorte ? null : m.anio2026, dif: i > mesCorte ? null : m.dif, parcial: i === mesCorte && mesParcial }));

    const sub = subunidades(nodo, esGeneral);
    const filasSub = sub.filas.length ? sub.filas : [nodo];
    const tot = filasSub.reduce((acc, f) => ({ a: acc.a + f.fecha2025, b: acc.b + f.fecha2026 }), { a: 0, b: 0 });
    const tituloSub = sub.filas.length ? `Resultados por ${sub.singular === 'Zona' ? 'zona de atención' : sub.singular === 'CAI' ? 'CAI' : sub.singular.toLowerCase()}` : 'Resultados de la unidad';

    const barrios = (nodo.barrios ?? []).slice(0, 5);
    const totalCapturas = capturas.b;
    const capturasDelito = op?.capturasPorDelito ?? [];
    const circunstancia = op?.circunstancia ?? [];
    const totalCirc = circunstancia.reduce((a, f) => a + f.valor, 0);
    const genero = op?.genero ?? [];
    const totalGenero = genero.reduce((a, f) => a + f.valor, 0);
    const edad = op?.grupoEdad ?? [];
    const totalEdad = edad.reduce((a, f) => a + f.valor, 0);
    const drogaClase = op?.drogaPorClase ?? [];

    // Principales resultados (solo lo que respaldan las cifras).
    const frase = (a: number, b: number, fmt = formatNumero) => (a > 0 ? `${b - a >= 0 ? 'aumento de' : 'reducción de'} ${signo(b - a)}${fmt(b - a)} (${pct1(variacion(a, b))}) frente a ${P}` : `sin periodo comparable en ${P}`);
    const hallazgos: { titulo: string; texto: string }[] = [];
    if (capturas.b || capturas.a) hallazgos.push({ titulo: 'Capturas', texto: `${formatNumero(capturas.b)}, ${frase(capturas.a, capturas.b)}.` });
    if (droga.b || droga.a) hallazgos.push({ titulo: 'Incautación de droga', texto: `${g(droga.b)} (${kg(droga.b)}), ${frase(droga.a, droga.b, (v) => g(Math.round(v * 10) / 10))}.` });
    const recup = { a: motos.a + autos.a, b: motos.b + autos.b };
    if (recup.b || recup.a) hallazgos.push({ titulo: 'Motocicletas y vehículos recuperados', texto: `${formatNumero(recup.b)} en total, ${frase(recup.a, recup.b)}.` });
    if (armas.b || armas.a) hallazgos.push({ titulo: 'Armas de fuego incautadas', texto: `${formatNumero(armas.b)}, ${frase(armas.a, armas.b)}.` });
    hallazgos.push({ titulo: 'Total procedimientos', texto: `${formatNumero(nodo.fecha2026)}, ${frase(nodo.fecha2025, nodo.fecha2026)}.` });
    if (sub.filas.length > 1) {
      const mayor = [...sub.filas].sort((x, y) => y.fecha2026 - x.fecha2026)[0];
      if (mayor && mayor.fecha2026 > 0) hallazgos.push({ titulo: `Mayor resultado por ${sub.singular === 'Zona' ? 'zona' : sub.singular === 'CAI' ? 'CAI' : sub.singular.toLowerCase()}`, texto: `${nombreCorto(mayor.nombre)}, con ${formatNumero(mayor.fecha2026)} procedimientos (${pctDe(mayor.fecha2026, nodo.fecha2026)} del total).` });
    }
    if (barrios[0]) hallazgos.push({ titulo: 'Mayor concentración territorial', texto: `Barrio ${barrios[0].nombre}, con ${formatNumero(barrios[0].casos)} procedimientos.` });

    const ejeY = { fontSize: 13, fill: C.texto, fontFamily: FUENTE };
    const verde = (c1: string, c2: string) => `linear-gradient(135deg, ${c1}, ${c2})`;

    return (
      <div ref={ref} data-informe-microgerencia data-lamina-operatividad className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
        <EncabezadoLamina titulo="OPERATIVIDAD INSTITUCIONAL - MEPOY" periodo={`${rangoMeses} ${A}`} corte={corte} cobertura={esGeneral ? 'MEPOY (Popayán)' : tituloNodo} fuente="Aplicativo Operatividad" />

        {/* ── KPI ─────────────────────────────────────────────────── */}
        <div className="absolute flex items-center gap-4 overflow-hidden text-white" style={{ left: 12, top: 116, width: 318, height: 98, background: `linear-gradient(90deg, ${C.verde}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 24px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
          <span className="ml-5 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><Siren size={34} strokeWidth={2.4} /></span>
          <p className="font-bold leading-[1.08]" style={{ fontSize: 30 }}>Resultados<span className="block">Operativos</span></p>
          <span className="absolute top-0 h-full w-[7px]" style={{ right: 12, background: C.lima, transform: 'skewX(-14deg)' }} />
        </div>
        <KpiOperativo x={338} w={213} icono={UserCheck} titulo="Capturas" valor={formatNumero(capturas.b)} a={capturas.a} b={capturas.b} fondo={verde('#0f7a5a', '#169c6e')} />
        <KpiOperativo x={559} w={213} icono={Crosshair} titulo="Armas incautadas" valor={formatNumero(armas.b)} a={armas.a} b={armas.b} fondo={verde('#1f4fa8', '#2f6fd6')} />
        <KpiOperativo x={780} w={213} icono={Leaf} titulo="Incautación de droga" valor={g(droga.b)} extra={`(${kg(droga.b)})`} a={droga.a} b={droga.b} fondo={verde('#5b21b6', '#7c3aed')} formato={(v) => g(Math.round(v * 10) / 10)} />
        <KpiOperativo x={1001} w={213} icono={Bike} titulo="Motocicletas recuperadas" valor={formatNumero(motos.b)} a={motos.a} b={motos.b} fondo={verde('#e8620c', '#f59e0b')} />
        <KpiOperativo x={1222} w={213} icono={Car} titulo="Vehículos recuperados" valor={formatNumero(autos.b)} a={autos.a} b={autos.b} fondo={verde('#1d5fd0', '#3b82f6')} />
        <KpiOperativo x={1443} w={217} icono={Users} titulo="Total procedimientos" valor={formatNumero(nodo.fecha2026)} a={nodo.fecha2025} b={nodo.fecha2026} fondo={verde('#0e6b3f', '#16a34a')} />

        {/* ── FILA 2 ──────────────────────────────────────────────── */}
        <Panel x={12} y={224} w={560} h={244}>
          <TituloPanel icono={BarChart3} derecha={(
            <div className="rounded-[6px] px-2 py-[1px] text-center text-[14px] font-bold leading-[1.15]" style={{ color: C.rojo, border: `1.5px solid ${C.rojo}`, background: '#fff5f5' }}>
              Δ {A} vs {P}
              <span className="block" style={{ color: colorDif(nodo.dif) }}>{signo(nodo.dif)}{formatNumero(nodo.dif)} ({pct1(nodo.pct)})</span>
            </div>
          )}>Histórico de resultados operativos</TituloPanel>
          <div className="min-h-0 flex-1 px-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={historico} margin={{ top: 24, right: 14, left: 0, bottom: 0 }} barCategoryGap="16%">
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="anio" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} height={36}
                  tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
                    const h = historico.find((d) => d.anio === payload?.value);
                    return (
                      <g transform={`translate(${x},${y})`}>
                        <text dy={13} textAnchor="middle" style={{ fontSize: 14, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }}>{payload?.value}</text>
                        {h?.parcial && <text dy={27} textAnchor="middle" style={{ fontSize: 11.5, fill: C.texto, fontFamily: FUENTE }}>({rangoMeses})</text>}
                      </g>
                    );
                  }} />
                <YAxis width={50} tick={ejeY} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(historico.map((h) => h.casos))} allowDecimals={false} />
                <Bar dataKey="casos" isAnimationActive={false}>
                  {historico.map((h) => <Cell key={h.anio} fill={h.actual ? C.verde : '#8fcf9a'} />)}
                  <LabelList dataKey="casos" position="top" offset={8} style={{ fontSize: historico.length > 8 ? 13 : 15.5, fill: C.texto, fontWeight: 700, fontFamily: FUENTE }} formatter={(v: unknown) => formatNumero(Number(v))} />
                </Bar>
                <Line type="linear" dataKey="casos" stroke={C.azul} strokeWidth={2.2} dot={{ r: 4, fill: '#fff', stroke: C.azul, strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center pb-1"><Leyenda items={[{ color: '#8fcf9a', texto: 'Procedimientos totales' }, { color: C.azul, texto: 'Tendencia anual', linea: true }]} /></div>
        </Panel>

        <Panel x={580} y={224} w={516} h={244}>
          <TituloPanel icono={IconoDona}>Distribución por categoría</TituloPanel>
          <div className="relative flex min-h-0 flex-1 items-center gap-2 px-3">
            <div className="relative h-[176px] w-[176px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categorias.map((c) => ({ nombre: c.nombre, valor: c.fecha2026 }))} dataKey="valor" nameKey="nombre" innerRadius={54} outerRadius={84} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                    {categorias.map((c, i) => <Cell key={c.nombre} fill={PALETA_CAT[i % PALETA_CAT.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-[30px] font-extrabold">{formatNumero(totalCat)}</span>
                <span className="mt-1 text-[13px]">procedimientos</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-[5px]">
              {categorias.slice(0, 8).map((c, i) => (
                <div key={c.nombre} className="flex items-center gap-2 text-[14.5px]">
                  <span className="h-[12px] w-[12px] shrink-0 rounded-full" style={{ background: PALETA_CAT[i % PALETA_CAT.length] }} />
                  <span className="min-w-0 flex-1 truncate" title={c.nombre}>{nombreCategoria(c.nombre)}</span>
                  <span className="w-[54px] text-right font-bold tabular-nums">{formatNumero(c.fecha2026)}</span>
                  <span className="w-[56px] text-right text-[13.5px] tabular-nums">({pctDe(c.fecha2026, totalCat)})</span>
                </div>
              ))}
              {categorias.length === 0 && <p className="text-[15px] text-slate-500">Sin registros en el periodo.</p>}
            </div>
          </div>
        </Panel>

        <Panel x={1104} y={224} w={556} h={244}>
          <TituloPanel icono={IconoLinea} derecha={<Leyenda items={[{ color: C.azul, texto: String(P), linea: true }, { color: C.verdeVivo, texto: String(A), linea: true }]} />}>Evolución mensual</TituloPanel>
          <div className="h-[104px] pr-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosMes} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" hide />
                <YAxis width={44} tick={{ ...ejeY, fontSize: 12 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(datosMes.flatMap((m) => [Number(m[P] ?? 0), Number(m[A] ?? 0)]))} allowDecimals={false} />
                <Line type="monotone" dataKey={String(P)} stroke={C.azul} strokeWidth={2.2} dot={{ r: 3.5, fill: '#fff', stroke: C.azul, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey={String(A)} stroke={C.verdeVivo} strokeWidth={2.6} connectNulls={false} dot={{ r: 4, fill: '#fff', stroke: C.verdeVivo, strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="mx-2 border-collapse text-center text-[13.5px] leading-[19px]" style={{ width: 'calc(100% - 16px)' }}>
            <thead><tr><th className="w-[44px]" />{datosMes.map((m) => <th key={m.nombre} className="font-bold">{m.nombre}{m.parcial ? '*' : ''}</th>)}</tr></thead>
            <tbody>
              <tr style={{ background: '#e7effc' }}><th className="rounded-l-md font-bold" style={{ color: C.azul }}>{P}</th>{datosMes.map((m) => <td key={m.nombre}>{formatNumero(Number(m[P]))}</td>)}</tr>
              <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md font-bold" style={{ color: C.verdeDif }}>{A}</th>{datosMes.map((m) => <td key={m.nombre} style={{ color: m[A] == null ? '#a3acb2' : undefined }}>{m[A] == null ? '—' : formatNumero(Number(m[A]))}</td>)}</tr>
              <tr><th className="font-bold">Dif.</th>{datosMes.map((m) => <td key={m.nombre} className="font-bold" style={{ color: m.dif == null ? '#a3acb2' : colorDif(m.dif) }}>{m.dif == null ? '—' : `${signo(m.dif)}${formatNumero(m.dif)}`}</td>)}</tr>
            </tbody>
          </table>
          {(mesParcial || mesCorte < 11) && <p className="px-3 text-[10.5px] leading-tight text-slate-500">{mesParcial ? `* ${MESES_CORTOS[mesCorte]} parcial (hasta el ${diaCorte}). ` : ''}{mesCorte < 11 ? '«—» = sin información consolidada.' : ''}</p>}
        </Panel>

        {/* ── FILA 3 ──────────────────────────────────────────────── */}
        <Panel x={12} y={476} w={418} h={208}>
          <TituloPanel icono={BadgeCheck}>{tituloSub}</TituloPanel>
          <table className="mx-3 mt-1.5 border-collapse text-[14.5px]" style={{ width: 'calc(100% - 24px)' }}>
            <thead>
              <tr className="font-bold" style={{ background: '#eef1f2' }}>
                <th className="rounded-l-md px-2 py-0.5 text-left">{sub.singular || 'Unidad'}</th>
                <th className="py-0.5 text-right">{P}</th><th className="py-0.5 text-right">{A}</th><th className="py-0.5 text-right">Dif.</th><th className="rounded-r-md px-2 py-0.5 text-right">Variación</th>
              </tr>
            </thead>
            <tbody>
              {filasSub.slice(0, 5).map((f) => (
                <tr key={f.nombre} className="leading-[19px]">
                  <td className="max-w-[150px] truncate px-2">{nombreCorto(f.nombre)}</td>
                  <td className="text-right tabular-nums">{formatNumero(f.fecha2025)}</td>
                  <td className="text-right font-bold tabular-nums">{formatNumero(f.fecha2026)}</td>
                  <td className="text-right font-bold tabular-nums" style={{ color: colorDif(f.dif) }}>{signo(f.dif)}{formatNumero(f.dif)}</td>
                  <td className="px-2 text-right font-bold tabular-nums" style={{ color: colorDif(f.dif) }}>{pct1(f.pct)}</td>
                </tr>
              ))}
              {sub.filas.length > 1 && (
                <tr className="font-bold text-white" style={{ background: C.verde }}>
                  <td className="rounded-l-md px-2 py-[1px]">Total {esGeneral ? 'MEPOY' : nombreCorto(nodo.nombre)}</td>
                  <td className="text-right tabular-nums">{formatNumero(tot.a)}</td><td className="text-right tabular-nums">{formatNumero(tot.b)}</td>
                  <td className="text-right tabular-nums">{signo(tot.b - tot.a)}{formatNumero(tot.b - tot.a)}</td>
                  <td className="rounded-r-md px-2 text-right tabular-nums">{pct1(variacion(tot.a, tot.b))}</td>
                </tr>
              )}
            </tbody>
          </table>
          {sub.filas.length > 5 && <p className="px-4 pt-0.5 text-[11.5px] text-slate-500">+{sub.filas.length - 5} más incluidas en el total.</p>}
        </Panel>

        <Panel x={438} y={476} w={476} h={208}>
          <TituloPanel icono={MapPin} derecha={<span className="flex items-center gap-1.5 rounded-[8px] border bg-white px-2.5 py-0.5 text-[14px] font-bold" style={{ borderColor: C.borde }}>Top 5 barrios <ChevronDown size={15} /></span>}>Distribución territorial</TituloPanel>
          <div className="relative min-h-0 flex-1">
            <div className="absolute" style={{ left: 6, top: 2, width: 250, bottom: 6 }}>
              <MapaCobertura fuente="operatividad" nodo={nodo} esGeneral={esGeneral} delitos={null} barrios={[]} inicio={datos.actualInicio} fin={datos.actualFin} aspecto={250 / 150} />
            </div>
            <div className="absolute flex flex-col gap-1" style={{ left: 260, right: 8, top: 0 }}>
              <div className="overflow-hidden rounded-[8px] border bg-white" style={{ borderColor: C.borde }}>
                <p className="px-2 py-[2px] text-[14px] font-bold text-white" style={{ background: C.verde }}>Top 5 barrios ({A})</p>
                {barrios.length === 0 ? <p className="px-2 py-2 text-[13px] text-slate-500">Sin barrios reportados.</p> : (
                  <ol className="px-1.5 py-0.5">
                    {barrios.map((b, i) => (
                      <li key={b.nombre} className="flex items-center gap-1 text-[13px] leading-[17px]">
                        <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white" style={{ background: C.verdeVivo }}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate" title={b.nombre}>{b.nombre}</span>
                        <span className="tabular-nums">{formatNumero(b.casos)}</span>
                        <span className="w-[44px] text-right text-[12px] tabular-nums">({pctDe(b.casos, nodo.fecha2026)})</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div className="rounded-[8px] border bg-white px-2 py-0.5 text-[12.5px]" style={{ borderColor: C.borde }}>
                <p className="font-bold leading-tight">Concentración de procedimientos</p>
                <div className="mt-0.5 h-[9px] rounded-[3px]" style={{ background: 'linear-gradient(90deg,#22c55e,#a3e635,#facc15,#f97316,#dc2626)' }} />
                <div className="flex justify-between text-[11.5px] font-bold leading-tight"><span>Baja</span><span>Alta</span></div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel x={922} y={476} w={392} h={208}>
          <TituloPanel icono={Scale}><span className="text-[19.5px]">Capturas por delito asociado <span className="text-[15px] font-normal">(Top 5)</span></span></TituloPanel>
          <ListaBarras filas={capturasDelito.map((f) => ({ ...f, nombre: abreviar(f.nombre) }))} total={totalCapturas} anchoNombre={170} alto={27} colores={['#0e6b3f', '#16a34a', '#14b8a6', '#2f6fe0', '#64748b']} />
        </Panel>

        <Panel x={1322} y={476} w={338} h={208}>
          <TituloPanel icono={UserCheck}>Circunstancia de captura</TituloPanel>
          <ListaBarras filas={circunstancia} total={totalCirc} anchoNombre={110} alto={30} colores={['#0e6b3f', '#2f6fe0', '#f59e0b', '#64748b', '#94a3b8']} />
        </Panel>

        {/* ── FILA 4 ──────────────────────────────────────────────── */}
        <Panel x={12} y={692} w={630} h={176}>
          <TituloPanel icono={Users}>Caracterización de capturados</TituloPanel>
          <div className="flex min-h-0 flex-1 gap-3 px-3 pb-2 pt-1.5">
            <div className="w-[226px] shrink-0 rounded-[10px] border px-2 py-1" style={{ borderColor: C.borde }}>
              <p className="flex items-center gap-1.5 text-[15px] font-bold"><UserRound size={17} /> Género</p>
              {genero.length === 0 ? <p className="pt-3 text-[13.5px] text-slate-500">Sin registros.</p> : (
                <div className="mt-1 flex justify-around">
                  {genero.slice(0, 3).map((f) => {
                    const mujer = /fem|mujer/i.test(f.nombre);
                    return (
                      <div key={f.nombre} className="flex items-center gap-1.5">
                        <UserRound size={44} strokeWidth={2.4} style={{ color: mujer ? '#ec4899' : '#2f6fe0' }} />
                        <div className="leading-tight">
                          <p className="text-[13.5px]">{f.nombre}</p>
                          <p className="text-[24px] font-extrabold leading-none">{formatNumero(f.valor)}</p>
                          <p className="text-[12.5px]">({pctDe(f.valor, totalGenero)})</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 rounded-[10px] border px-1 py-1" style={{ borderColor: C.borde }}>
              <p className="flex items-center gap-1.5 px-2 text-[15px] font-bold"><Users size={17} /> Grupo de edad</p>
              <ListaBarras filas={edad.map((f) => ({ nombre: f.nombre.replace(/\s*\((\d+) a (\d+) años\)/, ' ($1 – $2)').replace(/\s*\(>\s*60 años\)/, ' (> 60)'), valor: f.valor }))} total={totalEdad} anchoNombre={150} alto={19} maxFilas={5} compacta colores={Array(5).fill('#16a34a')} />
            </div>
          </div>
        </Panel>

        <Panel x={650} y={692} w={456} h={176}>
          <TituloPanel icono={Leaf}>Incautación de droga <span className="text-[15px] font-normal">(principales)</span></TituloPanel>
          <ListaBarras filas={drogaClase} total={droga.b} formato={(v) => g(Math.round(v * 10) / 10)} anchoNombre={110} alto={24} maxFilas={4} colores={['#0e6b3f', '#16a34a', '#22c55e', '#86efac']} />
          {drogaClase.length > 4 && <p className="px-4 text-[11.5px] text-slate-500">+{drogaClase.length - 4} sustancia(s) más en el total ({kg(droga.b)}).</p>}
        </Panel>

        <Panel x={1114} y={692} w={546} h={176}>
          <TituloPanel icono={CheckCircle2}>Principales resultados y variaciones</TituloPanel>
          <div className="mx-3 mb-2 mt-1.5 flex-1 space-y-[1px] overflow-hidden rounded-[10px] px-2.5 py-1" style={{ background: '#f1f8ec', border: '1px solid #cfe5c2' }}>
            {hallazgos.slice(0, 6).map((h) => (
              <p key={h.titulo} className="flex gap-1.5 text-[13px] leading-[1.18]">
                <CheckCircle2 size={15} className="mt-[2px] shrink-0" style={{ color: C.verdeVivo }} />
                <span><strong className="underline">{h.titulo}:</strong> {h.texto}</span>
              </p>
            ))}
          </div>
        </Panel>

        <PieLamina fuente="Aplicativo Operatividad" />
      </div>
    );
  },
);
