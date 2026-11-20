import { forwardRef, useMemo } from 'react';
import { CalendarDays, Crosshair, Footprints, Grid3x3, MapPin, Theater, Users, UsersRound, type LucideIcon } from 'lucide-react';
import type { CrimeRecord } from '../../types/crime';
import type { DatosMicrogerencia, NodoMicrogerencia } from '../../data/microgerencia';
import { predicadoDeNodo } from '../../hooks/useMicrogerencia';
import { useHeatmap, type VistaHeatmap } from '../../hooks/useHeatmap';
import { esValorValido } from '../../data/microgerenciaDelito';
import { TablaMatriz } from '../../pages/MatrizCalor';
import { formatNumero } from '../../utils/aggregations';
import { ALTO, ANCHO, C, EncabezadoLamina, FUENTE, MESES_CORTOS, PieLamina, etiquetaUnidad } from './InformeEjecutivoMicrogerencia';
import { Caja, DonaSvg, TituloBanda } from './LaminaOperatividad';

// ───────────────────────────────────────────────────────────────────────
// HOJA 2 de la Microgerencia de Delictividad: «Matriz de calor y análisis
// de variables delictivas». Misma unidad, periodo y corte que la hoja 1.
// Todo sale de los registros del AÑO ACTUAL AL CORTE de la unidad
// (datos.registros.actual + predicado de la unidad). Cantidades absolutas,
// ordenadas de mayor a menor (salvo la matriz: lunes→domingo, 00→23).
// La matriz es la misma del módulo «Matriz de calor» (TablaMatriz): mismos
// valores, colores y cálculos.
// ───────────────────────────────────────────────────────────────────────

const PALETA = ['#1d64d8', '#22a33a', '#f59e0b', '#a21caf', '#64748b'];
// Ranking de días: del más alto (rojo) al más bajo (verde).
const ESCALA_DIAS = ['#e5383b', '#f59a3c', '#f6cf3a', '#8cd13f', '#3cb44b', '#1f9d47', '#15803d'];
const tituloCase = (t: string) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const edadCorta = (n: string) => {
  const m = n.match(/(\d+)\s*a\s*(\d+)/);
  if (m) return `${m[1]} – ${m[2]} años`;
  const may = n.match(/>\s*=?\s*(\d+)|(\d+)\s*(?:años)?\s*(?:o|y)\s*m[aá]s/i);
  if (may) return `≥ ${may[1] ?? may[2]} años`;
  return tituloCase(n);
};

/** Conteo de una variable (solo valores válidos), de mayor a menor. */
function contar(lista: CrimeRecord[], valor: (r: CrimeRecord) => string, nombre: (v: string) => string = tituloCase) {
  const m = new Map<string, number>();
  for (const r of lista) {
    const v = String(valor(r) ?? '').trim();
    if (!esValorValido(v)) continue;
    const n = nombre(v);
    m.set(n, (m.get(n) ?? 0) + 1);
  }
  return Array.from(m, ([nombre, casos]) => ({ nombre, casos })).sort((a, b) => b.casos - a.casos);
}

/** Top N con «Otras» al final (suma del resto) para no perder casos. */
function topConOtras(filas: { nombre: string; casos: number }[], n: number, otras = 'Otras') {
  if (filas.length <= n) return filas;
  return [...filas.slice(0, n - 1), { nombre: otras, casos: filas.slice(n - 1).reduce((s, f) => s + f.casos, 0) }];
}

function Barras({ filas, ancho = 104 }: { filas: { nombre: string; casos: number }[]; ancho?: number }) {
  const max = Math.max(1, ...filas.map((f) => f.casos));
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-around px-3 pb-1 pt-1">
      {filas.map((f) => (
        <div key={f.nombre} className="flex items-center gap-2 text-[15px]">
          <span className="shrink-0 truncate font-medium" style={{ width: ancho }} title={f.nombre}>{f.nombre}</span>
          <span className="h-[17px] flex-1"><span className="block h-full rounded-[3px]" style={{ width: `${Math.max(4, (f.casos / max) * 100)}%`, background: /^Otr/.test(f.nombre) ? '#7fc98f' : 'linear-gradient(90deg,#16a34a,#3cc23c)' }} /></span>
          <span className="w-[50px] text-right text-[16px] font-bold tabular-nums">{formatNumero(f.casos)}</span>
        </div>
      ))}
    </div>
  );
}

function Periodo({ texto }: { texto: string }) {
  return <p className="px-3 pb-1.5 text-right text-[11.5px] text-slate-500">{texto}</p>;
}

function CajaTop({ x, titulo, icono, filas, ancho, periodo }: { x: number; titulo: string; icono: LucideIcon; filas: { nombre: string; casos: number }[]; ancho?: number; periodo: string }) {
  return (
    <Caja x={x} y={586} w={268} h={288}>
      <TituloBanda icono={icono}><span className="text-[18px]">{titulo}</span> <span className="text-[14px] font-normal">(Top 5)</span></TituloBanda>
      {filas.length === 0 ? <p className="flex flex-1 items-center justify-center px-4 text-center text-[14px] text-slate-500">Sin información en la matriz.</p> : <Barras filas={topConOtras(filas, 5)} ancho={ancho} />}
      <Periodo texto={periodo} />
    </Caja>
  );
}

const colorGenero = (n: string, i: number) => (/fem|mujer/i.test(n) ? '#ec4899' : /masc|hombre/i.test(n) ? '#1d64d8' : PALETA[(i + 2) % PALETA.length]);

function CajaDona({ x, titulo, icono, filas, A, maxPartes = 4, genero = false, periodo }: { x: number; titulo: string; icono: LucideIcon; filas: { nombre: string; casos: number }[]; A: number; maxPartes?: number; genero?: boolean; periodo: string }) {
  const partes = topConOtras(filas, maxPartes).map((f, i) => ({ nombre: f.nombre, valor: f.casos, color: genero ? colorGenero(f.nombre, i) : PALETA[i % PALETA.length] }));
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <Caja x={x} y={586} w={268} h={288}>
      <TituloBanda icono={icono}><span className="text-[17px]">{titulo}</span></TituloBanda>
      {total === 0 ? <p className="flex flex-1 items-center justify-center px-4 text-center text-[14px] text-slate-500">Sin información en la matriz.</p> : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-2 pt-1">
          <DonaSvg partes={partes} total={total} unidad="casos" A={A} tam={114} porcentajes={false} />
          <div className="grid w-full grid-cols-1 gap-y-0.5 px-2">
            {partes.map((p) => (
              <div key={p.nombre} className="flex items-center gap-2 text-[15px]">
                <span className="h-[13px] w-[13px] shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate font-medium" title={p.nombre}>{p.nombre}</span>
                <span className="text-[16px] font-bold tabular-nums">{formatNumero(p.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Periodo texto={periodo} />
    </Caja>
  );
}

export const LaminaVariablesDelictivas = forwardRef<HTMLDivElement, { datos: DatosMicrogerencia; nodo: NodoMicrogerencia; esGeneral: boolean; vista?: VistaHeatmap }>(
  function LaminaVariablesDelictivas({ datos, nodo, esGeneral, vista = 'hora' }, ref) {
    const { anioActual: A } = datos;
    const corte = datos.fechaCorte ?? datos.actualFin;
    const mesCorte = Number(corte.split('-')[1]) - 1;
    const diaCorte = Number(corte.split('-')[2]);
    const rangoMeses = `Ene – ${MESES_CORTOS[mesCorte]}`;
    const tituloNodo = etiquetaUnidad(nodo, esGeneral);
    const periodo = `Casos 1 ene – ${diaCorte} ${MESES_CORTOS[mesCorte].toLowerCase()} ${A}`;

    // Registros del año actual al corte de la unidad (los mismos de la hoja 1).
    const registros = useMemo(() => {
      const actual = datos.registros?.actual ?? [];
      if (esGeneral) return actual;
      const pred = predicadoDeNodo(nodo);
      return actual.filter(pred);
    }, [datos, nodo, esGeneral]);

    const matriz = useHeatmap(registros, vista);
    const dias = matriz.diasLabel.map((nombre, i) => ({ nombre, casos: matriz.totalesFila[i] })).sort((a, b) => b.casos - a.casos);
    const maxDia = Math.max(1, ...dias.map((d) => d.casos));

    const modalidad = useMemo(() => contar(registros, (r) => r.modalidad), [registros]);
    const causa = useMemo(() => contar(registros, (r) => r.causaLesion), [registros]);
    const sitio = useMemo(() => contar(registros, (r) => r.claseSitio), [registros]);
    const armas = useMemo(() => contar(registros, (r) => r.armas), [registros]);
    const genero = useMemo(() => contar(registros, (r) => r.genero), [registros]);
    const edad = useMemo(() => contar(registros, (r) => r.grupoEdad, edadCorta), [registros]);

    return (
      <div ref={ref} data-informe-microgerencia data-lamina-variables className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>
        <EncabezadoLamina titulo="CONSOLIDADO DELICTIVO" periodo={`${rangoMeses} ${A}`} corte={corte} cobertura={esGeneral ? 'MEPOY (Popayán)' : tituloNodo} fuente="Aplicativo Los Andes" />

        {/* ── Matriz de calor por día y hora ─────────────────────────── */}
        <Caja x={12} y={116} w={1180} h={462}>
          <div className="relative">
            <TituloBanda icono={Grid3x3}>Matriz de calor por día y {vista === 'hora' ? 'hora' : 'franja horaria'}</TituloBanda>
            <div className="absolute right-4 top-[6px] flex overflow-hidden rounded-[8px] border-2 border-white/80 text-[15px] font-bold">
              <span className={vista === 'hora' ? 'bg-[#10233f] px-3 py-[3px] text-white' : 'bg-white px-3 py-[3px] text-[#10233f]'}>Por hora</span>
              <span className={vista === 'franja' ? 'bg-[#10233f] px-3 py-[3px] text-white' : 'bg-white px-3 py-[3px] text-[#10233f]'}>Por franja horaria</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 px-2 pt-1 [&_button]:!h-[42px] [&_button]:!text-[16px] [&_td]:!text-[16px] [&_th]:!text-[15px] [&_th]:!py-1.5">
            {matriz.totalGeneral === 0
              ? <p className="py-16 text-center text-[16px] text-slate-500">Sin registros con día y hora en el periodo.</p>
              : <TablaMatriz data={matriz} seleccion={null} onCelda={() => {}} />}
          </div>
          <p className="px-4 pb-1.5 text-[12.5px] text-slate-500">Casos del 1 de enero al {diaCorte} de {MESES_CORTOS[mesCorte].toLowerCase()} de {A} · {tituloNodo}{matriz.sinDiaOHora ? ` · ${formatNumero(matriz.sinDiaOHora)} registros sin día u hora no se incluyen` : ''}</p>
        </Caja>

        {/* ── Casos por día de la semana (de mayor a menor) ─────────────── */}
        <Caja x={1200} y={116} w={460} h={462}>
          <TituloBanda icono={CalendarDays}>Casos por día de la semana</TituloBanda>
          <div className="mx-3 mt-2 flex items-center rounded-[6px] px-2 py-1 text-[15px] font-bold" style={{ background: '#eef1f2' }}>
            <span className="w-[120px]">Día</span><span className="w-[70px] text-right">Casos</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-around px-3 py-1">
            {dias.map((d, i) => (
              <div key={d.nombre} className="flex items-center text-[19px]">
                <span className="w-[120px] pl-2 font-semibold">{d.nombre}</span>
                <span className="w-[70px] text-right font-bold tabular-nums">{formatNumero(d.casos)}</span>
                <span className="ml-4 h-[24px] flex-1"><span className="block h-full rounded-[3px]" style={{ width: `${Math.max(3, (d.casos / maxDia) * 100)}%`, background: ESCALA_DIAS[i] }} /></span>
              </div>
            ))}
          </div>
          <div className="mx-3 mb-3 flex items-center rounded-[8px] px-3 py-1.5 text-[21px] font-bold text-white" style={{ background: C.verde }}>
            <span className="w-[120px]">Total general</span><span className="w-[70px] text-right tabular-nums">{formatNumero(matriz.totalGeneral)}</span>
          </div>
        </Caja>

        {/* ── Variables (casos del año actual al corte, de mayor a menor) ── */}
        <CajaTop x={12} titulo="Modalidad" icono={Theater} filas={modalidad} periodo={periodo} />
        <CajaTop x={288} titulo="Causa del hecho" icono={Footprints} filas={causa} periodo={periodo} />
        <CajaTop x={564} titulo="Clase de sitio" icono={MapPin} filas={sitio} ancho={110} periodo={periodo} />
        <CajaDona x={840} titulo="Arma o medio empleado" icono={Crosshair} filas={armas} A={A} periodo={periodo} />
        <CajaDona x={1116} titulo="Género de la víctima" icono={Users} filas={genero} A={A} maxPartes={4} genero periodo={periodo} />
        <Caja x={1392} y={586} w={268} h={288}>
          <TituloBanda icono={UsersRound}><span className="text-[17px]">Grupo de edad (víctima)</span></TituloBanda>
          {edad.length === 0 ? <p className="flex flex-1 items-center justify-center px-4 text-center text-[14px] text-slate-500">Sin información en la matriz.</p> : <Barras filas={edad.slice(0, 6)} ancho={92} />}
          <Periodo texto={periodo} />
        </Caja>

        <PieLamina fuente="Aplicativo Los Andes" />
      </div>
    );
  },
);
