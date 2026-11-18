import { forwardRef } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import {
  Bike, Building2, Car, CheckCircle2, ChevronDown, ChevronUp, Leaf, Package, PieChart as IconoDona, Scale, ShieldCheck,
  Siren, UserCheck, UserRound, Users, XCircle, Gavel, Crosshair, LineChart as IconoLinea, type LucideIcon,
} from 'lucide-react';
import type { DatosMicrogerencia, FilaTriple, NodoMicrogerencia } from '../../data/microgerencia';
import { tipoOperatividad, type TipoOperatividad } from '../../utils/operatividadConteo';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import {
  ALTO, ANCHO, C, EncabezadoLamina, EtiquetaBarra, FUENTE, Leyenda, MESES_CORTOS, PieLamina, etiquetaUnidad, marcasEjeValores, nombreCorto, signo, subunidades, techoBonito,
  type EtiquetaProps,
} from './InformeEjecutivoMicrogerencia';

const AZUL = '#1d64d8';
const VERDE_B = '#3cc23c';

// ───────────────────────────────────────────────────────────────────────
// LÁMINA «MICROGERENCIA | OPERATIVIDAD INSTITUCIONAL – MEPOY».
// Mismo lienzo (1672 × 941), encabezado y pie de la lámina de Delictividad.
// Cada cifra se presenta en tres columnas:
//   · Total {año anterior}: 1 de enero a 31 de diciembre del año anterior.
//   · {año anterior} y {año actual}: el MISMO corte de actualización.
// Las cifras salen de useMicrogerenciaOperatividad con las reglas de conteo
// de «Operatividad por Unidad» (utils/operatividadConteo): la droga va en
// gramos y nunca se suma a los procedimientos.
// ───────────────────────────────────────────────────────────────────────

const g = (v: number) => `${v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} g`;
const kg = (v: number) => `${(v / 1000).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const variacion = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);
const pct = (p: number | null) => (p === null ? '—' : `${signo(p)}${formatDecimal(p, 1)}%`);
const colorDif = (n: number) => (n > 0 ? C.rojo : n < 0 ? C.verdeDif : '#8a949b');
const PALETA_CAT = ['#1d64d8', '#0e6b3f', '#f59e0b', '#14b8a6', '#7c3aed', '#64748b', '#0ea5e9', '#a3a3a3', '#be123c'];

/** Nombres largos de la matriz, abreviados SOLO para que quepan (mismo dato). */
function abreviar(n: string): string {
  return n
    .replace(/^Violencia Intrafamiliar$/i, 'V. Intrafamiliar')
    .replace(/^Lesiones Personales$/i, 'L. Personales')
    .replace(/^Hurto (a )?Personas$/i, 'H. Personas')
    .replace(/Tr[aá]fico,?\s*Fabricaci[oó]n\s*O\s*Porte\s*De\s*Estupefacientes/i, 'Tráfico, Fab. o Porte Estupe.')
    .replace(/Fabricaci[oó]n,?\s*Tr[aá]fico\s*Y?\s*Porte\s*De\s*Armas.*$/i, 'Porte ilegal de armas')
    .replace(/\bReceptacion\b/i, 'Receptación')
    .replace(/\bIncautacion\b/i, 'Incautación')
    .replace(/\bMercancia\b/gi, 'Mercancía');
}
const tituloCase = (t: string) => (t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const grupoEdadCorto = (n: string) => n.replace(/\s*\((\d+) a (\d+) años\)/, ' ($1 – $2)').replace(/\s*\(>\s*60 años\)/, ' (> 60)');

// ── Piezas ─────────────────────────────────────────────────────────────
export function TituloBanda({ icono: Icono, children }: { icono: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mx-2 mt-2 flex h-[40px] shrink-0 items-center gap-2.5 rounded-[10px] pl-1.5 pr-3 text-white" style={{ background: `linear-gradient(90deg, ${C.verde}, ${C.verdeMedio})` }}>
      <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-white" style={{ color: C.verde }}><Icono size={19} strokeWidth={2.4} /></span>
      <h3 className="truncate text-[20px] font-bold leading-none">{children}</h3>
    </div>
  );
}

export function Caja({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: React.ReactNode }) {
  return (
    <section className="absolute flex flex-col overflow-hidden rounded-[14px] bg-white" style={{ left: x, top: y, width: w, height: h, border: `1px solid ${C.borde}`, boxShadow: '0 3px 10px rgba(20,40,30,0.10)' }}>
      {children}
    </section>
  );
}

/** Tabla con las tres columnas de periodo, diferencia y variación (+ fila de total). */
export function TablaTriple({ titulo, filas, total, etiquetaTotal, P, A, formato = formatNumero, tam = 15, anchoNombre = 160, alto = 23, color, vacio = 'Sin registros en el periodo.' }: {
  titulo: string; filas: FilaTriple[]; total?: { t: number; a: number; b: number } | null; etiquetaTotal?: string; P: number; A: number;
  formato?: (v: number) => string; tam?: number; anchoNombre?: number; alto?: number; color?: (i: number) => string; vacio?: string;
}) {
  if (filas.length === 0) return <p className="px-4 py-6 text-center text-[14px] text-slate-500">{vacio}</p>;
  return (
    <table className="mx-2.5 mt-1.5 border-collapse" style={{ width: 'calc(100% - 20px)', fontSize: tam }}>
      <thead>
        <tr className="font-bold" style={{ fontSize: tam - 1 }}>
          <th className="px-1 text-left">{titulo}</th>
          <th className="text-right">Total {P}</th><th className="text-right">{P}</th><th className="text-right">{A}</th>
          <th className="text-right">Dif.</th><th className="pr-1 text-right">Variación</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => {
          const dif = f.b - f.a;
          return (
            <tr key={f.nombre} style={{ height: alto }}>
              <td className="truncate px-1" style={{ maxWidth: anchoNombre }} title={f.nombre}>
                {color && <span className="mr-1.5 inline-block h-[10px] w-[10px] rounded-full align-middle" style={{ background: color(i) }} />}
                {f.nombre}
              </td>
              <td className="text-right tabular-nums">{formato(f.t)}</td>
              <td className="text-right tabular-nums">{formato(f.a)}</td>
              <td className="text-right font-bold tabular-nums">{formato(f.b)}</td>
              <td className="text-right font-bold tabular-nums" style={{ color: colorDif(dif) }}>{signo(dif)}{formato(dif)}</td>
              <td className="pr-1 text-right font-bold tabular-nums" style={{ color: colorDif(dif) }}>{pct(variacion(f.a, f.b))}</td>
            </tr>
          );
        })}
        {total && (
          <tr className="font-bold text-white" style={{ background: C.verde, height: alto + 3 }}>
            <td className="rounded-l-[7px] px-2">{etiquetaTotal}</td>
            <td className="text-right tabular-nums">{formato(total.t)}</td>
            <td className="text-right tabular-nums">{formato(total.a)}</td>
            <td className="text-right tabular-nums">{formato(total.b)}</td>
            <td className="text-right tabular-nums">{signo(total.b - total.a)}{formato(total.b - total.a)}</td>
            <td className="rounded-r-[7px] pr-1.5 text-right tabular-nums">{pct(variacion(total.a, total.b))}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function MiniTabla({ P, A, t, a, b, formato = formatNumero }: { P: number; A: number; t: number; a: number; b: number; formato?: (v: number) => string }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-slate-300 rounded-[8px] border text-center leading-tight" style={{ borderColor: '#c7d4e8', background: '#f7f9fc' }}>
      {[[`Total ${P}`, t], [String(P), a], [String(A), b]].map(([et, v]) => (
        <div key={String(et)} className="px-2 py-0">
          <p className="whitespace-nowrap text-[12.5px] font-semibold">{et}</p>
          <p className="text-[18px] font-bold tabular-nums">{formato(Number(v))}</p>
        </div>
      ))}
    </div>
  );
}

export const sumar = (filas: { t: number; a: number; b: number }[]) => filas.reduce((s, f) => ({ t: s.t + f.t, a: s.a + f.a, b: s.b + f.b }), { t: 0, a: 0, b: 0 });
const comoTriple = (n: NodoMicrogerencia): FilaTriple => ({ nombre: nombreCorto(n.nombre), t: n.total2025, a: n.fecha2025, b: n.fecha2026 });

export const LaminaOperatividad = forwardRef<HTMLDivElement, { datos: DatosMicrogerencia; nodo: NodoMicrogerencia; esGeneral: boolean }>(
  function LaminaOperatividad({ datos, nodo, esGeneral }, ref) {
    const { anioActual: A, anioAnterior: P } = datos;
    const corte = datos.fechaCorte ?? datos.actualFin;
    const mesCorte = Number(corte.split('-')[1]) - 1;
    const rango = `Ene – ${MESES_CORTOS[mesCorte]}`;
    const tituloNodo = etiquetaUnidad(nodo, esGeneral);
    const op = nodo.operativo;

    // KPI por tipo (mismas reglas de conteo de Operatividad por Unidad).
    const porTipo = (tipo: TipoOperatividad, filtro?: (nombre: string) => boolean) => sumar(
      nodo.delitos.filter((c) => tipoOperatividad(c.nombre) === tipo && (!filtro || filtro(c.nombre))).map(comoTriple),
    );
    const capturas = porTipo('capturas');
    const mercInc = porTipo('mercancia', (n) => /INCAUT/i.test(n.normalize('NFD').replace(/[̀-ͯ]/g, '')));
    const motos = porTipo('motos');
    const autos = porTipo('automotores');
    const droga = { t: op?.drogaGTotal2025 ?? 0, a: op?.drogaG2025 ?? 0, b: op?.drogaG2026 ?? 0 };

    const categorias = [...nodo.delitos].map((c) => ({ ...comoTriple(c), nombre: abreviar(c.nombre) })).filter((c) => c.t + c.a + c.b > 0).sort((x, y) => y.b - x.b);
    const totalOp = { t: nodo.total2025, a: nodo.fecha2025, b: nodo.fecha2026 };

    // Estaciones y CAI dentro de la unidad.
    const sub = subunidades(nodo, esGeneral);
    const capt = (op?.capturasPorDelito ?? []).map((f) => ({ ...f, nombre: abreviar(f.nombre) }));
    const capt5 = capt.slice(0, 5);
    const circ = op?.circunstancia ?? [];
    const edad = (op?.grupoEdad ?? []).map((f) => ({ ...f, nombre: grupoEdadCorto(f.nombre) }));
    const genero = op?.genero ?? [];
    const totalGenero = genero.reduce((s, f) => s + f.valor, 0);
    const drogaClase = (op?.drogaPorClase ?? []).map((f) => ({ ...f, nombre: tituloCase(f.nombre) }));
    const sinPermiso = op?.armasPermiso.find((f) => f.nombre === 'Sin permiso');
    const conPermiso = op?.armasPermiso.find((f) => f.nombre === 'Con permiso');

    // Mensual (hasta el mes del corte), circunstancia, top 5 y subunidades del gráfico.
    const diaCorte = Number(corte.split('-')[2]);
    const mesParcial = diaCorte < new Date(A, mesCorte + 1, 0).getDate();
    const datosMes = nodo.meses.slice(0, mesCorte + 1).map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: m.anio2025, [A]: m.anio2026 }));
    const totalCirc = sumar(circ);
    const totalCapt5 = capt5.reduce((s2, f) => s2 + f.b, 0);
    const porc = (v: number, total: number) => (total > 0 ? `${formatDecimal((v / total) * 100, 1)}%` : '—');
    const unidades = (sub.filas.length ? sub.filas : [nodo]).filter((n) => !/no reportad/i.test(n.nombre)).slice(0, 8).map(comoTriple);
    const tituloSubunidad = sub.singular === 'Estación' ? 'Resultados por estación' : sub.singular === 'CAI' ? 'Resultados por CAI' : sub.singular ? 'Resultados por zona de atención' : 'Resultados de la unidad';

    const pillArma = (f?: FilaTriple) => {
      if (!f) return <span className="text-[15px] text-slate-500">Sin registros</span>;
      const dif = f.b - f.a;
      const p = variacion(f.a, f.b);
      const sube = dif > 0;
      return (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[8px] px-2 py-1 text-[17px] font-bold" style={{ background: sube ? '#fde3e5' : '#e4f6dc', color: sube ? C.rojo : '#15803d' }}>
          {f.a > 0 ? <>{dif < 0 ? <ChevronDown size={18} strokeWidth={3} /> : <ChevronUp size={18} strokeWidth={3} />}{signo(dif)}{formatNumero(dif)} ({pct(p)})</> : 'Sin comparable'}
        </span>
      );
    };

    return (
      <div ref={ref} data-informe-microgerencia data-lamina-operatividad className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
        <EncabezadoLamina titulo="OPERATIVIDAD INSTITUCIONAL – MEPOY" periodo={`${rango} ${A}`} comparacion={`${rango} ${P}`} corte={corte} cobertura={esGeneral ? 'MEPOY' : tituloNodo} fuente="Aplicativo Operatividad" />

        {/* ── KPI ─────────────────────────────────────────────────── */}
        <div className="absolute flex items-center gap-3 overflow-hidden text-white" style={{ left: 12, top: 116, width: 252, height: 126, background: `linear-gradient(90deg, ${C.verdeOscuro}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 24px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
          <span className="ml-4 flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><Siren size={36} strokeWidth={2.3} /></span>
          <p className="text-[29px] font-bold leading-[1.08]">Resultados<span className="block">Operativos</span></p>
          <span className="absolute top-0 h-full w-[7px]" style={{ right: 12, background: C.lima, transform: 'skewX(-11deg)' }} />
        </div>
        {[
          { icono: Building2, titulo: 'Operatividad', color: '#1d4ed8', ...totalOp },
          { icono: UserCheck, titulo: 'Capturas', color: '#15803d', ...capturas },
          { icono: Package, titulo: 'Mercancía incautada', color: '#7e22ce', ...mercInc },
          { icono: Bike, titulo: 'Motocicletas recuperadas', color: '#ea580c', ...motos },
          { icono: Car, titulo: 'Vehículos recuperados', color: '#2563eb', ...autos },
        ].map((k, i) => <TarjetaKpiConEtiquetas key={k.titulo} x={272 + i * 232} w={224} P={P} A={A} {...k} />)}
        <TarjetaKpiConEtiquetas x={272 + 5 * 232} w={228} P={P} A={A} icono={Leaf} titulo="Incautación de droga" color="#7e22ce" {...droga} formato={g} />

        {/* ── FILA 2 ──────────────────────────────────────────────── */}
        <Caja x={12} y={252} w={614} h={198}>
          <TituloBanda icono={IconoLinea}>Evolución mensual de procedimientos</TituloBanda>
          <div className="flex justify-end px-5 pt-0.5"><Leyenda items={[{ color: AZUL, texto: String(P), linea: true }, { color: VERDE_B, texto: String(A), linea: true }]} /></div>
          <div className="h-[72px] pr-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" hide />
                <YAxis width={40} tick={{ fontSize: 11.5, fill: C.texto, fontFamily: FUENTE }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(x) => formatNumero(x)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(datosMes.flatMap((m) => [Number(m[P]), Number(m[A])]))} allowDecimals={false} />
                <Area type="monotone" dataKey={String(P)} stroke={AZUL} strokeWidth={2.2} fill="#e7effc" dot={{ r: 3.5, fill: '#fff', stroke: AZUL, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey={String(A)} stroke={VERDE_B} strokeWidth={2.4} dot={{ r: 3.5, fill: '#fff', stroke: VERDE_B, strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="mx-2.5 border-collapse text-center text-[13.5px] leading-[19px]" style={{ width: 'calc(100% - 20px)' }}>
            <thead><tr><th className="w-[44px]" />{datosMes.map((m, i) => <th key={m.nombre} className="font-bold">{m.nombre}{i === mesCorte && mesParcial ? '*' : ''}</th>)}</tr></thead>
            <tbody>
              <tr style={{ background: '#e7effc' }}><th className="rounded-l-md text-white" style={{ background: AZUL }}>{P}</th>{datosMes.map((m) => <td key={m.nombre}>{formatNumero(Number(m[P]))}</td>)}</tr>
              <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md text-white" style={{ background: '#16a34a' }}>{A}</th>{datosMes.map((m) => <td key={m.nombre} className="font-bold">{formatNumero(Number(m[A]))}</td>)}</tr>
            </tbody>
          </table>
        </Caja>

        <Caja x={634} y={252} w={482} h={198}>
          <TituloBanda icono={Crosshair}>Armas de fuego incautadas</TituloBanda>
          <div className="flex flex-1 flex-col justify-around px-2 pb-1.5 pt-1">
            {[{ titulo: 'Sin permiso', icono: XCircle, fila: sinPermiso, color: '#1d4ed8' }, { titulo: 'Con permiso', icono: CheckCircle2, fila: conPermiso, color: '#16a34a' }].map((s) => (
              <div key={s.titulo} className="flex items-center gap-2 rounded-[10px] px-2 py-1" style={{ background: '#f4f7f6' }}>
                <s.icono size={30} strokeWidth={2.2} className="shrink-0" style={{ color: s.color }} />
                <p className="w-[92px] shrink-0 text-[17.5px] font-bold leading-tight">{s.titulo}</p>
                {s.fila ? <MiniTabla P={P} A={A} t={s.fila.t} a={s.fila.a} b={s.fila.b} /> : <p className="flex-1 text-[14px] text-slate-500">Sin registros en la matriz.</p>}
                {s.fila && pillArma(s.fila)}
              </div>
            ))}
          </div>
        </Caja>

        <Caja x={1124} y={252} w={536} h={198}>
          <TituloBanda icono={Gavel}>Circunstancia de captura</TituloBanda>
          {circ.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin registros en el periodo.</p> : (
            <table className="mx-2.5 mt-1.5 border-collapse text-[15px]" style={{ width: 'calc(100% - 20px)' }}>
              <thead><tr className="text-[14px] font-bold"><th className="px-1 text-left">Circunstancia</th><th className="text-right">Total {P}</th><th className="text-right">{P}</th><th className="text-right">{A}</th><th className="text-right">Dif.</th><th className="text-right">Variación</th><th className="w-[120px]" /></tr></thead>
              <tbody>
                {circ.slice(0, 3).map((f) => {
                  const d = f.b - f.a;
                  return (
                    <tr key={f.nombre} style={{ height: 32 }}>
                      <td className="px-1">{f.nombre}</td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(f.t)}</td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(f.a)}</td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(f.b)}</td>
                      <td className="text-right font-bold tabular-nums" style={{ color: colorDif(d) }}>{signo(d)}{formatNumero(d)}</td>
                      <td className="text-right font-bold tabular-nums" style={{ color: colorDif(d) }}>{pct(variacion(f.a, f.b))}</td>
                      <td className="pl-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-[16px] flex-1"><span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.b / Math.max(1, totalCirc.b)) * 100)}%`, background: '#22a33a' }} /></span>
                          <span className="w-[44px] text-right text-[13.5px] tabular-nums">{porc(f.b, totalCirc.b)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-bold text-white" style={{ background: C.verde, height: 30 }}>
                  <td className="rounded-l-[7px] px-2">Total capturas</td>
                  <td className="text-right tabular-nums">{formatNumero(totalCirc.t)}</td><td className="text-right tabular-nums">{formatNumero(totalCirc.a)}</td><td className="text-right tabular-nums">{formatNumero(totalCirc.b)}</td>
                  <td className="text-right tabular-nums">{signo(totalCirc.b - totalCirc.a)}{formatNumero(totalCirc.b - totalCirc.a)}</td>
                  <td className="rounded-r-[7px] pr-1 text-right tabular-nums">{pct(variacion(totalCirc.a, totalCirc.b))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </Caja>

        {/* ── FILA 3 ──────────────────────────────────────────────── */}
        <Caja x={12} y={458} w={646} h={216}>
          <TituloBanda icono={IconoDona}>Distribución por categoría</TituloBanda>
          <div className="flex min-h-0 flex-1 items-center">
            <div className="relative h-[176px] w-[176px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categorias.map((c) => ({ nombre: c.nombre, valor: c.b }))} dataKey="valor" innerRadius={46} outerRadius={84} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }: { cx?: number; cy?: number; midAngle?: number; innerRadius?: number; outerRadius?: number; percent?: number }) => {
                      if (!percent || percent < 0.035) return null;
                      const rad = Math.PI / 180;
                      const r = (Number(innerRadius) + Number(outerRadius)) / 2;
                      const xx = Number(cx) + r * Math.cos(-Number(midAngle) * rad);
                      const yy = Number(cy) + r * Math.sin(-Number(midAngle) * rad);
                      return <text x={xx} y={yy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11.5, fontWeight: 700, fill: '#fff', fontFamily: FUENTE }}>{formatDecimal(percent * 100, 1)}%</text>;
                    }} labelLine={false}>
                    {categorias.map((c, i) => <Cell key={c.nombre} fill={PALETA_CAT[i % PALETA_CAT.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-[23px] font-extrabold">{formatNumero(totalOp.b)}</span>
                <span className="mt-0.5 text-[11.5px]">operatividad</span>
                <span className="text-[10.5px]">({A})</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <TablaTriple titulo="Categoría" filas={categorias.slice(0, 7)} total={totalOp} etiquetaTotal="Total operatividad" P={P} A={A} tam={13} anchoNombre={150} alto={19} color={(i) => PALETA_CAT[i % PALETA_CAT.length]} />
            </div>
          </div>
        </Caja>

        <Caja x={666} y={458} w={454} h={216}>
          <TituloBanda icono={Scale}>Capturas por delito asociado <span className="text-[16px] font-normal">(Top 5)</span></TituloBanda>
          {capt5.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin capturas en el periodo.</p> : (
            <div className="px-3 pt-2">
              {capt5.map((f) => (
                <div key={f.nombre} className="flex items-center gap-2 text-[15px]" style={{ height: 24 }}>
                  <span className="w-[150px] shrink-0 truncate" title={f.nombre}>{f.nombre}</span>
                  <span className="h-[15px] flex-1"><span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.b / Math.max(1, capt5[0].b)) * 100)}%`, background: '#22a33a' }} /></span>
                  <span className="w-[48px] text-right font-bold tabular-nums">{formatNumero(f.b)}</span>
                  <span className="w-[58px] text-right text-[14px] tabular-nums">({porc(f.b, totalCapt5)})</span>
                </div>
              ))}
              <div className="mt-1 flex items-center rounded-[7px] px-2 py-[3px] text-[15px] font-bold text-white" style={{ background: C.verde }}>
                <span className="flex-1">Total (Top 5)</span>
                <span className="w-[60px] text-right tabular-nums">{formatNumero(totalCapt5)}</span>
                <span className="w-[66px] text-right">(100%)</span>
              </div>
            </div>
          )}
        </Caja>

        <Caja x={1128} y={458} w={532} h={216}>
          <TituloBanda icono={Building2}>{tituloSubunidad}</TituloBanda>
          <div className="flex justify-end px-4 pt-0.5"><Leyenda items={[{ color: AZUL, texto: String(P) }, { color: VERDE_B, texto: String(A) }]} /></div>
          <div className="min-h-0 flex-1 px-1 pb-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unidades.map((u) => ({ nombre: u.nombre, [P]: u.a, [A]: u.b }))} margin={{ top: 22, right: 10, left: 0, bottom: 0 }} barGap={3} barCategoryGap="20%">
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} height={22} tick={{ fontSize: unidades.length > 5 ? 11.5 : 13.5, fill: C.texto, fontFamily: FUENTE }} tickFormatter={(t: string) => (t.length > 14 ? `${t.slice(0, 13)}…` : t)} />
                <YAxis width={44} tick={{ fontSize: 12, fill: C.texto, fontFamily: FUENTE }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(x) => formatNumero(x)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(unidades.flatMap((u) => [u.a, u.b]))} allowDecimals={false} />
                <Bar dataKey={String(P)} fill={AZUL} maxBarSize={56} isAnimationActive={false}>
                  <LabelList dataKey={String(P)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="izq" tam={unidades.length > 5 ? 11.5 : 13.5} />} />
                </Bar>
                <Bar dataKey={String(A)} fill={VERDE_B} maxBarSize={56} isAnimationActive={false}>
                  <LabelList dataKey={String(A)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="der" tam={unidades.length > 5 ? 11.5 : 13.5} />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Caja>

        {/* ── FILA 4 ──────────────────────────────────────────────── */}
        <Caja x={12} y={682} w={816} h={190}>
          <TituloBanda icono={Users}>Caracterización de capturados</TituloBanda>
          <div className="flex min-h-0 flex-1 gap-3 px-2.5 pb-2 pt-1">
            <div className="w-[230px] shrink-0 text-center">
              <p className="text-[15px] font-bold">Género</p>
              {genero.length === 0 ? <p className="pt-4 text-[13px] text-slate-500">Sin registros.</p> : (
                <div className="mt-0.5 flex justify-center gap-2">
                  {genero.slice(0, 2).map((f) => {
                    const mujer = /fem|mujer/i.test(f.nombre);
                    return (
                      <div key={f.nombre} className="flex w-[106px] flex-col items-center rounded-[10px] py-1 leading-tight" style={{ background: '#f4f7f6' }}>
                        <UserRound size={34} strokeWidth={2.6} style={{ color: mujer ? '#ec4899' : '#2563eb' }} />
                        <p className="text-[14px]">{f.nombre}</p>
                        <p className="text-[23px] font-extrabold leading-none">{formatNumero(f.valor)}</p>
                        <p className="text-[14px]">({totalGenero > 0 ? formatDecimal((f.valor / totalGenero) * 100, 1) : '0'}%)</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <TablaTriple titulo="Grupo de edad" filas={edad} total={edad.length ? sumar(edad) : null} etiquetaTotal="Total capturas" P={P} A={A} tam={13.5} anchoNombre={170} alto={19} />
            </div>
          </div>
        </Caja>

        <Caja x={836} y={682} w={824} h={190}>
          <TituloBanda icono={Leaf}>Incautación de droga <span className="text-[16px] font-normal">(por sustancia)</span></TituloBanda>
          <TablaTriple titulo="Sustancia" filas={drogaClase.slice(0, 4)} total={drogaClase.length ? droga : null} etiquetaTotal="Total incautado" P={P} A={A} formato={g} tam={12.5} anchoNombre={150} alto={15.5} vacio="Sin incautación de droga en el periodo." />
          {drogaClase.length > 0 && (
            <div className="mx-2.5 mt-0.5 grid items-center rounded-[7px] px-2 py-[1px] text-[13px] font-bold" style={{ background: '#fdf0c4', gridTemplateColumns: '1.35fr 1fr 1fr 1fr 1fr 0.8fr' }}>
              <span>Equivalente en kilogramos</span>
              <span className="text-right">{kg(droga.t)}</span><span className="text-right">{kg(droga.a)}</span><span className="text-right">{kg(droga.b)}</span>
              <span className="text-right" style={{ color: colorDif(droga.b - droga.a) }}>{signo(droga.b - droga.a)}{kg(droga.b - droga.a)}</span>
              <span className="pr-1 text-right" style={{ color: colorDif(droga.b - droga.a) }}>{pct(variacion(droga.a, droga.b))}</span>
            </div>
          )}
        </Caja>

        <PieLamina fuente="Aplicativo Operatividad" />
      </div>
    );
  },
);

/** Tarjeta KPI con los rótulos de los tres periodos. */
function TarjetaKpiConEtiquetas({ x, w, icono: Icono, titulo, color, t, a, b, P, A, formato = formatNumero }: {
  x: number; w: number; icono: LucideIcon; titulo: string; color: string; t: number; a: number; b: number; P: number; A: number; formato?: (v: number) => string;
}) {
  const dif = b - a;
  const p = variacion(a, b);
  const largo = formato(Math.max(t, a, b)).length > 7;
  return (
    <div className="absolute flex flex-col overflow-hidden rounded-[12px] bg-white" style={{ left: x, top: 116, width: w, height: 126, border: `2px solid ${color}`, boxShadow: '0 3px 8px rgba(20,40,30,0.12)' }}>
      <div className="flex h-[34px] shrink-0 items-center justify-center gap-2 text-white" style={{ background: color }}>
        <Icono size={21} strokeWidth={2.3} />
        <span className="whitespace-nowrap font-bold" style={{ fontSize: titulo.length > 20 ? 16.5 : 19 }}>{titulo}</span>
      </div>
      <div className="mx-1.5 mt-1 grid grid-cols-3 divide-x divide-slate-300 text-center leading-tight">
        {[[`Total ${P}`, t], [String(P), a], [String(A), b]].map(([et, v]) => (
          <div key={String(et)} className="px-0.5">
            <p className="text-[12.5px] font-semibold">{et}</p>
            <p className="whitespace-nowrap font-bold tabular-nums" style={{ fontSize: largo ? 12 : 17 }}>{formato(Number(v))}</p>
          </div>
        ))}
      </div>
      <span className="mx-2 mb-1.5 mt-auto flex items-center justify-center gap-0.5 whitespace-nowrap rounded-full py-[2px] font-bold" style={{ background: '#e4f6dc', color: '#14532d', fontSize: largo ? 14.5 : 18 }}>
        {a > 0 ? <>{dif < 0 ? <ChevronDown size={17} strokeWidth={3} /> : <ChevronUp size={17} strokeWidth={3} />}{signo(dif)}{formato(dif)} ({pct(p)})</> : (b > 0 ? 'Sin periodo comparable' : 'Sin registros')}
      </span>
    </div>
  );
}
