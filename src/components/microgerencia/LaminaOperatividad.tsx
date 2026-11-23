import { forwardRef } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import {
  Building2, Car, CheckCircle2, ChevronDown, ChevronUp, Leaf, Package, Scale,
  Siren, UserCheck, Users, XCircle, Gavel, Crosshair, LineChart as IconoLinea, CalendarRange as IconoTrimestre, type LucideIcon,
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
const variacion = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);
const pct = (p: number | null) => (p === null ? '—' : `${signo(p)}${formatDecimal(p, 1)}%`);
// Delictividad: subir es malo (rojo). Operatividad es AL REVÉS: más
// capturas, incautaciones o recuperaciones = verde; menos = rojo.
const colorDifDelito = (n: number) => (n > 0 ? C.rojo : n < 0 ? C.verdeDif : '#8a949b');
const colorDif = (n: number) => (n > 0 ? C.verdeDif : n < 0 ? C.rojo : '#8a949b');

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
export function TablaTriple({ titulo, filas, total, etiquetaTotal, P, A, formato = formatNumero, tam = 15, anchoNombre = 160, alto = 23, color, vacio = 'Sin registros en el periodo.', masEsMejor = false, tituloDif = 'Dif.' }: {
  titulo: string; filas: FilaTriple[]; total?: { t: number; a: number; b: number } | null; etiquetaTotal?: string; P: number; A: number;
  formato?: (v: number) => string; tam?: number; anchoNombre?: number; alto?: number; color?: (i: number) => string; vacio?: string; masEsMejor?: boolean; tituloDif?: string;
}) {
  const colorDifT = masEsMejor ? colorDif : colorDifDelito;
  if (filas.length === 0) return <p className="px-4 py-6 text-center text-[14px] text-slate-500">{vacio}</p>;
  return (
    <table className="mx-2.5 mt-1.5 border-collapse leading-[1.2]" style={{ width: 'calc(100% - 20px)', fontSize: tam }}>
      <thead>
        <tr className="whitespace-nowrap font-bold" style={{ fontSize: tam - 1 }}>
          <th className="px-1 text-left">{titulo}</th>
          <th className="text-right">Total {P}</th><th className="text-right">{P}</th><th className="text-right">{A}</th>
          <th className="text-right">{tituloDif}</th><th className="pr-1 text-right">Variación</th>
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
              <td className="text-right font-bold tabular-nums" style={{ color: colorDifT(dif) }}>{signo(dif)}{formato(dif)}</td>
              <td className="pr-1 text-right font-bold tabular-nums" style={{ color: colorDifT(dif) }}>{pct(variacion(f.a, f.b))}</td>
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
        <div key={String(et)} className="px-1.5 py-0">
          <p className="whitespace-nowrap text-[11px] font-semibold">{et}</p>
          <p className="text-[19px] font-bold leading-tight tabular-nums">{formato(Number(v))}</p>
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
    const periodoA = datos.periodoEtiqueta ?? `Ene – ${MESES_CORTOS[mesCorte]} ${A}`;
    const periodoP = datos.comparacionEtiqueta ?? `Ene – ${MESES_CORTOS[mesCorte]} ${P}`;
    const rango = periodoA.replace(/\s\d{4}$/, '');
    const mesElegido = (i: number) => !datos.mesesSeleccionados?.length || datos.mesesSeleccionados.includes(i + 1);
    const tituloNodo = etiquetaUnidad(nodo, esGeneral);
    const op = nodo.operativo;

    // KPI por tipo (mismas reglas de conteo de Operatividad por Unidad).
    const porTipo = (tipo: TipoOperatividad, filtro?: (nombre: string) => boolean) => sumar(
      nodo.delitos.filter((c) => tipoOperatividad(c.nombre) === tipo && (!filtro || filtro(c.nombre))).map(comoTriple),
    );
    const capturas = porTipo('capturas');
    const armas = porTipo('armas');
    const sinTilde = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const mercInc = porTipo('mercancia', (n) => /INCAUT/i.test(sinTilde(n)));
    const mercRec = porTipo('mercancia', (n) => /RECUPER/i.test(sinTilde(n)));
    const mercancia = porTipo('mercancia');
    const mercOtra = { t: mercancia.t - mercInc.t - mercRec.t, a: mercancia.a - mercInc.a - mercRec.a, b: mercancia.b - mercInc.b - mercRec.b };
    const motos = porTipo('motos');
    const autos = porTipo('automotores');
    const vehiculos = sumar([motos, autos]);
    const filasMercancia: FilaTriple[] = [
      { nombre: 'Incautada', ...mercInc },
      { nombre: 'Recuperada', ...mercRec },
      ...(mercOtra.t + mercOtra.a + mercOtra.b > 0 ? [{ nombre: 'Otra', ...mercOtra }] : []),
    ];
    const filasVehiculos: FilaTriple[] = [{ nombre: 'Motocicletas', ...motos }, { nombre: 'Automotores', ...autos }];
    const droga = { t: op?.drogaGTotal2025 ?? 0, a: op?.drogaG2025 ?? 0, b: op?.drogaG2026 ?? 0 };

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
    const datosMes = nodo.meses.slice(0, mesCorte + 1).map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: mesElegido(i) ? m.anio2025 : null, [A]: mesElegido(i) ? m.anio2026 : null }));
    const totalCirc = sumar(circ);
    // Trimestres: {P} = año anterior completo; {A} = año actual al corte.
    const trimCorte = Math.floor(mesCorte / 3);
    const ROMANOS = ['I', 'II', 'III', 'IV'];
    const datosTrim = nodo.trimestres.map((t, i) => ({
      nombre: `Trim. ${ROMANOS[i]}${i === trimCorte && (mesCorte % 3 !== 2 || mesParcial) ? '*' : ''}`,
      [P]: t.anio2025, [A]: i <= trimCorte ? t.anio2026 : null,
    }));
    const notaTrim = (mesCorte % 3 !== 2 || mesParcial)
      ? `* Trim. ${ROMANOS[trimCorte]}: información parcial (${MESES_CORTOS[trimCorte * 3].toLowerCase()} – ${MESES_CORTOS[mesCorte].toLowerCase()}).`
      : '';
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
        <span className="ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[8px] px-1.5 py-1 text-[15px] font-bold" style={{ background: dif === 0 ? '#eef0f2' : sube ? '#e4f6dc' : '#fde3e5', color: dif === 0 ? '#5b6670' : sube ? '#15803d' : C.rojo }}>
          {f.a > 0 ? <>{dif < 0 ? <ChevronDown size={18} strokeWidth={3} /> : <ChevronUp size={18} strokeWidth={3} />}{signo(dif)}{formatNumero(dif)} ({pct(p)})</> : 'Sin comparable'}
        </span>
      );
    };

    return (
      <div ref={ref} data-informe-microgerencia data-lamina-operatividad className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
        <EncabezadoLamina titulo="OPERATIVIDAD INSTITUCIONAL – MEPOY" periodo={periodoA} comparacion={periodoP} corte={corte} cobertura={esGeneral ? 'MEPOY' : tituloNodo} fuente="Aplicativo Operatividad" />

        {/* ── KPI ─────────────────────────────────────────────────── */}
        <div className="absolute flex items-center gap-3 overflow-hidden text-white" style={{ left: 12, top: 116, width: 252, height: 126, background: `linear-gradient(90deg, ${C.verdeOscuro}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 24px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
          <span className="ml-4 flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><Siren size={36} strokeWidth={2.3} /></span>
          <p className="text-[29px] font-bold leading-[1.08]">Resultados<span className="block">Operativos</span></p>
          <span className="absolute top-0 h-full w-[7px]" style={{ right: 12, background: C.lima, transform: 'skewX(-11deg)' }} />
        </div>
        {[
          { icono: Building2, titulo: 'Operatividad', color: '#1d4ed8', ...totalOp },
          { icono: UserCheck, titulo: 'Capturas', color: '#15803d', ...capturas },
          { icono: Crosshair, titulo: 'Armas de fuego', color: '#b45309', ...armas },
          { icono: Package, titulo: 'Casos de mercancía', color: '#0f766e', ...mercancia },
          { icono: Car, titulo: 'Vehículos recuperados', color: '#2563eb', ...vehiculos },
        ].map((k, i) => <TarjetaKpiConEtiquetas key={k.titulo} x={272 + i * 232} w={224} P={P} A={A} {...k} />)}
        <TarjetaKpiConEtiquetas x={272 + 5 * 232} w={228} P={P} A={A} icono={Leaf} titulo="Incautación de droga" color="#7e22ce" {...droga} formato={g} />

        {/* ── FILA 2 ──────────────────────────────────────────────── */}
        <Caja x={12} y={250} w={484} h={226}>
          <TituloBanda icono={IconoLinea}>Evolución mensual de procedimientos</TituloBanda>
          <div className="flex justify-end px-5 pt-0.5"><Leyenda items={[{ color: AZUL, texto: String(P), linea: true }, { color: VERDE_B, texto: String(A), linea: true }]} /></div>
          <div className="h-[86px] pr-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosMes} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#edf0f1" />
                <XAxis dataKey="nombre" hide />
                <YAxis width={40} tick={{ fontSize: 11.5, fill: C.texto, fontFamily: FUENTE }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(x) => formatNumero(x)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(datosMes.flatMap((m) => [Number(m[P]), Number(m[A])]))} allowDecimals={false} />
                <Line type="monotone" dataKey={String(P)} stroke={AZUL} strokeWidth={2.2} dot={{ r: 3.5, fill: '#fff', stroke: AZUL, strokeWidth: 2 }} isAnimationActive={false} />
                <Line type="monotone" dataKey={String(A)} stroke={VERDE_B} strokeWidth={2.4} dot={{ r: 3.5, fill: '#fff', stroke: VERDE_B, strokeWidth: 2 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="mx-2.5 border-collapse text-center text-[13px] leading-[20px]" style={{ width: 'calc(100% - 20px)' }}>
            <thead><tr><th className="w-[42px]" />{datosMes.map((m, i) => <th key={m.nombre} className="font-bold">{m.nombre}{i === mesCorte && mesParcial ? '*' : ''}</th>)}</tr></thead>
            <tbody>
              <tr style={{ background: '#e7effc' }}><th className="rounded-l-md text-white" style={{ background: AZUL }}>{P}</th>{datosMes.map((m) => <td key={m.nombre}>{m[P] == null ? '–' : formatNumero(Number(m[P]))}</td>)}</tr>
              <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md text-white" style={{ background: '#16a34a' }}>{A}</th>{datosMes.map((m) => <td key={m.nombre} className="font-bold">{m[A] == null ? '–' : formatNumero(Number(m[A]))}</td>)}</tr>
            </tbody>
          </table>
        </Caja>

        <Caja x={504} y={250} w={334} h={226}>
          <TituloBanda icono={IconoTrimestre}>Comparativo trimestral</TituloBanda>
          <div className="flex justify-center pt-0.5"><Leyenda items={[{ color: AZUL, texto: String(P) }, { color: VERDE_B, texto: String(A) }]} /></div>
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
          <p className="h-[22px] shrink-0 text-center text-[12.5px] text-slate-600">{notaTrim}</p>
        </Caja>

        <Caja x={846} y={250} w={398} h={226}>
          <TituloBanda icono={Building2}>{tituloSubunidad}</TituloBanda>
          <TablaTriple titulo={sub.singular || 'Unidad'} filas={unidades.slice(0, 6)} total={unidades.length > 1 ? totalOp : null} etiquetaTotal={esGeneral ? 'Total MEPOY' : `Total ${nombreCorto(nodo.nombre)}`} P={P} A={A} tam={14.5} anchoNombre={130} alto={unidades.length > 5 ? 21 : 25} masEsMejor />
        </Caja>

        <Caja x={1252} y={250} w={408} h={226}>
          <TituloBanda icono={Scale}>Capturas por delito asociado <span className="text-[16px] font-normal">(Top 5)</span></TituloBanda>
          {capt5.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin capturas en el periodo.</p> : (
            <div className="px-3 pt-2">
              {capt5.map((f) => (
                <div key={f.nombre} className="flex items-center gap-2 text-[15px]" style={{ height: 27 }}>
                  <span className="w-[150px] shrink-0 truncate" title={f.nombre}>{f.nombre}</span>
                  <span className="h-[17px] flex-1"><span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.b / Math.max(1, capt5[0].b)) * 100)}%`, background: '#22a33a' }} /></span>
                  <span className="w-[44px] text-right font-bold tabular-nums">{formatNumero(f.b)}</span>
                  <span className="w-[56px] text-right text-[14px] tabular-nums">({porc(f.b, totalCapt5)})</span>
                </div>
              ))}
              <div className="mt-1.5 flex items-center rounded-[7px] px-2 py-[4px] text-[15.5px] font-bold text-white" style={{ background: C.verde }}>
                <span className="flex-1">Total (Top 5)</span>
                <span className="w-[60px] text-right tabular-nums">{formatNumero(totalCapt5)}</span>
                <span className="w-[66px] text-right">(100%)</span>
              </div>
            </div>
          )}
        </Caja>

        {/* ── FILA 3 ──────────────────────────────────────────────── */}
        <Caja x={12} y={484} w={412} h={182}>
          <TituloBanda icono={Crosshair}>Armas de fuego incautadas</TituloBanda>
          <div className="flex flex-1 flex-col justify-around px-2 pb-1.5 pt-1">
            {[{ titulo: 'Sin permiso', icono: XCircle, fila: sinPermiso, color: '#1d4ed8' }, { titulo: 'Con permiso', icono: CheckCircle2, fila: conPermiso, color: '#16a34a' }].map((s) => (
              <div key={s.titulo} className="flex items-center gap-1.5 rounded-[10px] px-1.5 py-1" style={{ background: '#f4f7f6' }}>
                <s.icono size={26} strokeWidth={2.2} className="shrink-0" style={{ color: s.color }} />
                <p className="w-[84px] shrink-0 whitespace-nowrap text-[16.5px] font-bold leading-tight">{s.titulo}</p>
                {s.fila ? <MiniTabla P={P} A={A} t={s.fila.t} a={s.fila.a} b={s.fila.b} /> : <p className="flex-1 text-[13px] text-slate-500">Sin registros en la matriz.</p>}
                {s.fila && pillArma(s.fila)}
              </div>
            ))}
          </div>
        </Caja>

        <Caja x={432} y={484} w={497} h={182}>
          <TituloBanda icono={Gavel}>Circunstancia de captura</TituloBanda>
          {circ.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-slate-500">Sin registros en el periodo.</p> : (
            <table className="mx-2.5 mt-1 border-collapse text-[15.5px]" style={{ width: 'calc(100% - 20px)' }}>
              <thead><tr className="whitespace-nowrap text-[13.5px] font-bold"><th className="px-1 text-left">Circunstancia</th><th className="text-right">Total {P}</th><th className="text-right">{P}</th><th className="text-right">{A}</th><th className="text-right">Dif.</th><th className="text-right">Variación</th><th className="w-[96px]" /></tr></thead>
              <tbody>
                {circ.slice(0, 3).map((f) => {
                  const d = f.b - f.a;
                  return (
                    <tr key={f.nombre} style={{ height: 33 }}>
                      <td className="whitespace-nowrap px-1">{f.nombre}</td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(f.t)}</td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(f.a)}</td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(f.b)}</td>
                      <td className="text-right font-bold tabular-nums" style={{ color: colorDif(d) }}>{signo(d)}{formatNumero(d)}</td>
                      <td className="text-right font-bold tabular-nums" style={{ color: colorDif(d) }}>{pct(variacion(f.a, f.b))}</td>
                      <td className="pl-2">
                        <div className="flex items-center gap-1">
                          <span className="h-[16px] flex-1"><span className="block h-full rounded-[2px]" style={{ width: `${Math.max(3, (f.b / Math.max(1, totalCirc.b)) * 100)}%`, background: '#22a33a' }} /></span>
                          <span className="w-[40px] text-right text-[12.5px] tabular-nums">{porc(f.b, totalCirc.b)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr className="font-bold text-white" style={{ background: C.verde, height: 30 }}>
                  <td className="whitespace-nowrap rounded-l-[7px] px-2">Total capturas</td>
                  <td className="text-right tabular-nums">{formatNumero(totalCirc.t)}</td><td className="text-right tabular-nums">{formatNumero(totalCirc.a)}</td><td className="text-right tabular-nums">{formatNumero(totalCirc.b)}</td>
                  <td className="text-right tabular-nums">{signo(totalCirc.b - totalCirc.a)}{formatNumero(totalCirc.b - totalCirc.a)}</td>
                  <td className="text-right tabular-nums">{pct(variacion(totalCirc.a, totalCirc.b))}</td>
                  <td className="rounded-r-[7px]" />
                </tr>
              </tbody>
            </table>
          )}
        </Caja>

        <DonaDiscriminada x={937} w={344} titulo="Casos de mercancía" icono={Package} unidad="casos" A={A}
          partes={[{ nombre: 'Incautada', valor: mercInc.b, color: '#1d64d8' }, { nombre: 'Recuperada', valor: mercRec.b, color: '#f59e0b' }, ...(mercOtra.b > 0 ? [{ nombre: 'Otra', valor: mercOtra.b, color: '#94a3b8' }] : [])]} />
        <DonaDiscriminada x={1289} w={371} titulo="Vehículos recuperados" icono={Car} unidad="vehículos" A={A}
          partes={[{ nombre: 'Motocicletas', valor: motos.b, color: '#f59e0b' }, { nombre: 'Automotores', valor: autos.b, color: '#1d64d8' }]} />

        {/* ── FILA 4 ──────────────────────────────────────────────── */}
        <Caja x={12} y={674} w={820} h={206}>
          <TituloBanda icono={Users}>Caracterización de capturados</TituloBanda>
          <div className="flex min-h-0 flex-1 gap-3 px-2.5 pb-1.5 pt-0.5">
            <div className="flex w-[230px] shrink-0 flex-col rounded-[10px] border text-center" style={{ borderColor: '#e2e8e5' }}>
              <p className="pt-0.5 text-[16px] font-bold">Género</p>
              {genero.length === 0 ? <p className="pt-4 text-[13px] text-slate-500">Sin registros.</p> : (
                <div className="flex flex-1 items-center justify-center divide-x divide-slate-200">
                  {genero.slice(0, 2).map((f) => {
                    const mujer = /fem|mujer/i.test(f.nombre);
                    return (
                      <div key={f.nombre} className="flex w-[110px] flex-col items-center leading-tight">
                        <Figura mujer={mujer} />
                        <p className="mt-0.5 text-[15px] font-bold">{f.nombre}</p>
                        <p className="text-[24px] font-extrabold leading-none tabular-nums">{formatNumero(f.valor)}</p>
                        <p className="text-[15px] font-bold">({totalGenero > 0 ? formatDecimal((f.valor / totalGenero) * 100, 1) : '0'}%)</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <TablaTriple titulo="Grupo de edad" filas={edad} total={edad.length ? sumar(edad) : null} etiquetaTotal="Total capturados" P={P} A={A} tam={edad.length > 4 ? 14 : 15} anchoNombre={200} alto={edad.length > 5 ? 16 : edad.length > 4 ? 18.5 : 22} masEsMejor />
            </div>
          </div>
        </Caja>

        <Caja x={840} y={674} w={820} h={206}>
          <TituloBanda icono={Leaf}>Incautación de droga <span className="text-[16px] font-normal">(por sustancia)</span></TituloBanda>
          <TablaTriple titulo="Sustancia" filas={drogaClase.slice(0, 5)} total={drogaClase.length ? droga : null} etiquetaTotal="Total" P={P} A={A} formato={g} tam={15.5} anchoNombre={170} alto={drogaClase.length > 4 ? 20 : 23} tituloDif="Dif. (g)" vacio="Sin incautación de droga en el periodo." masEsMejor />
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
            <p className="text-[13px] font-semibold">{et}</p>
            <p className="whitespace-nowrap font-bold tabular-nums" style={{ fontSize: largo ? 12.5 : 21 }}>{formato(Number(v))}</p>
          </div>
        ))}
      </div>
      <span className="mx-2 mb-1.5 mt-auto flex items-center justify-center gap-0.5 whitespace-nowrap rounded-full py-[2px] font-bold" style={{ background: a === 0 || dif === 0 ? '#eef0f2' : dif > 0 ? '#e4f6dc' : '#fde3e5', color: a === 0 || dif === 0 ? '#5b6670' : dif > 0 ? '#14532d' : '#b91c1c', fontSize: largo ? 15 : 20 }}>
        {a > 0 ? <>{dif < 0 ? <ChevronDown size={17} strokeWidth={3} /> : <ChevronUp size={17} strokeWidth={3} />}{signo(dif)}{formato(dif)} ({pct(p)})</> : (b > 0 ? 'Sin periodo comparable' : 'Sin registros')}
      </span>
    </div>
  );
}

/** Dona de una parte operativa (año actual): total al centro y leyenda con
 *  cantidad y participación de cada parte. */
function DonaDiscriminada({ x, w, titulo, icono, partes, unidad, A }: {
  x: number; w: number; titulo: string; icono: LucideIcon; partes: { nombre: string; valor: number; color: string }[]; unidad: string; A: number;
}) {
  const total = partes.reduce((s2, p) => s2 + p.valor, 0);
  const visibles = partes.filter((p) => p.valor > 0);
  return (
    <Caja x={x} y={484} w={w} h={182}>
      <TituloBanda icono={icono}>{titulo}</TituloBanda>
      {total === 0 ? <p className="px-4 py-8 text-center text-[14px] text-slate-500">Sin registros en {A}.</p> : (
        <div className="flex min-h-0 flex-1 items-center gap-2 pl-2 pr-3">
          <DonaSvg partes={visibles} total={total} unidad={unidad} A={A} />
          <div className="min-w-0 flex-1 space-y-2.5">
            {partes.map((p) => (
              <div key={p.nombre} className="flex items-start gap-2">
                <span className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-full" style={{ background: p.color }} />
                <div className="min-w-0 leading-tight">
                  <p className="whitespace-nowrap text-[17px] font-bold">{p.nombre}</p>
                  <p className="whitespace-nowrap text-[16px] tabular-nums"><strong>{formatNumero(p.valor)}</strong> ({formatDecimal((p.valor / total) * 100, 1)}%)</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Caja>
  );
}

/** Silueta de persona (hombre / mujer) para la caracterización por género. */
function Figura({ mujer }: { mujer: boolean }) {
  const color = mujer ? '#ec4899' : '#1d64d8';
  return (
    <svg width="34" height="46" viewBox="0 0 34 46" aria-hidden="true">
      <circle cx="17" cy="6" r="5.5" fill={color} />
      {mujer ? (
        <>
          <path d="M11 13 h12 l6 17 h-6 l-0.5 14 h-4 v-12 h-3 v12 h-4 L11 30 h-6 z" fill={color} />
        </>
      ) : (
        <>
          <rect x="9" y="13" width="16" height="17" rx="4" fill={color} />
          <rect x="4" y="13" width="4.5" height="15" rx="2.2" fill={color} />
          <rect x="25.5" y="13" width="4.5" height="15" rx="2.2" fill={color} />
          <rect x="10.5" y="28" width="5.5" height="17" rx="2" fill={color} />
          <rect x="18" y="28" width="5.5" height="17" rx="2" fill={color} />
        </>
      )}
    </svg>
  );
}

/** Dona dibujada a mano (SVG): centro, porcentajes y texto siempre alineados,
 *  sin depender de cómo el navegador mida el gráfico. */
export function DonaSvg({ partes, total, unidad, A, tam = 132, porcentajes = true, colorTexto = C.texto, colorBorde = '#fff' }: { partes: { nombre: string; valor: number; color: string }[]; total: number; unidad: string; A: number; tam?: number; porcentajes?: boolean; colorTexto?: string; colorBorde?: string }) {
  const c = tam / 2;
  const rExt = c - 1;
  const rInt = rExt * 0.46;
  const rEtq = (rExt + rInt) / 2;
  const punto = (r: number, ang: number) => [c + r * Math.sin(ang), c - r * Math.cos(ang)];
  let acum = 0;
  const arcos = partes.map((p) => {
    const frac = p.valor / total;
    const a0 = acum * 2 * Math.PI;
    acum += frac;
    const a1 = acum * 2 * Math.PI;
    const medio = (a0 + a1) / 2;
    let d: string;
    if (frac >= 0.9999) {
      d = `M ${c} ${c - rExt} A ${rExt} ${rExt} 0 1 1 ${c - 0.01} ${c - rExt} Z M ${c} ${c - rInt} A ${rInt} ${rInt} 0 1 0 ${c - 0.01} ${c - rInt} Z`;
    } else {
      const grande = frac > 0.5 ? 1 : 0;
      const [x0, y0] = punto(rExt, a0), [x1, y1] = punto(rExt, a1), [x2, y2] = punto(rInt, a1), [x3, y3] = punto(rInt, a0);
      d = `M ${x0} ${y0} A ${rExt} ${rExt} 0 ${grande} 1 ${x1} ${y1} L ${x2} ${y2} A ${rInt} ${rInt} 0 ${grande} 0 ${x3} ${y3} Z`;
    }
    const [tx, ty] = punto(rEtq, medio);
    return { ...p, d, frac, tx, ty };
  });
  return (
    <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} className="shrink-0" style={{ fontFamily: FUENTE }}>
      {arcos.map((a) => <path key={a.nombre} d={a.d} fill={a.color} fillRule="evenodd" stroke={colorBorde} strokeWidth={2} />)}
      {porcentajes && arcos.map((a) => a.frac >= 0.08 && (
        <text key={`t-${a.nombre}`} x={a.tx} y={a.ty} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fontWeight={700} fill="#fff">{formatDecimal(a.frac * 100, 1)}%</text>
      ))}
      <text x={c} y={c - 10} textAnchor="middle" dominantBaseline="central" fontSize={18} fontWeight={800} fill={colorTexto}>{formatNumero(total)}</text>
      <text x={c} y={c + 7} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={colorTexto}>{unidad}</text>
      <text x={c} y={c + 19} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={colorTexto}>({A})</text>
    </svg>
  );
}
