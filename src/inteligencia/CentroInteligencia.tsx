import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDown, ArrowUp, BarChart3, CalendarDays, CalendarRange, Clock, Crosshair, Layers, LineChart as IconoLinea, Lock,
  MapPin, Radar, ShieldCheck, Siren, Target, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { NOMBRES_ESTACION, useMicrogerencia } from '../hooks/useMicrogerencia';
import { tieneAcceso } from '../utils/permisos';
import { esModoConsulta } from '../utils/modoConsulta';
import { formatDecimal, formatNumero } from '../utils/aggregations';
import { MESES_CORTOS, MapaCobertura, nombreCorto } from '../components/microgerencia/InformeEjecutivoMicrogerencia';
import { DonaSvg } from '../components/microgerencia/LaminaOperatividad';
import { iconoDelito } from '../components/microgerencia/LaminaDelito';
import { esValorValido } from '../data/microgerenciaDelito';
import type { CrimeRecord } from '../types/crime';
import {
  UMBRALES_ALERTA, calcularAlertas, calcularPrioridades, celdaCritica, horaTexto, moda, nombreDia, ultimasSemanas, variacion,
  type Alerta, type NivelAlerta,
} from './analisisInteligencia';

// ───────────────────────────────────────────────────────────────────────
// CENTRO DE INTELIGENCIA Y MICROGERENCIA — Panel estratégico.
// EXCLUSIVO DEL ADMINISTRADOR: el menú solo lo muestra en la ruta raíz y,
// además, esta página se niega a mostrarse en cualquier otro modo (interno,
// piloto, consulta). Usa los mismos registros y filtros generales del
// dashboard (useMicrogerencia) — no modifica datos ni cálculos existentes.
// ───────────────────────────────────────────────────────────────────────

const K = {
  fondo: '#081A36', panel: '#0b2347', panel2: '#102D54', borde: '#16406f', bordeVivo: '#00C4D7',
  azul: '#087BEE', turquesa: '#00C4D7', verde: '#19C99A', texto: '#e6eef8', suave: '#8fa6c4', rojo: '#ff5468', ambar: '#ffb020',
};
const NIVEL: Record<NivelAlerta, { fondo: string; texto: string }> = {
  ALTA: { fondo: '#5a1520', texto: '#ff8a96' }, MEDIA: { fondo: '#4d3a08', texto: '#ffc53d' }, BAJA: { fondo: '#0d4a3a', texto: '#3fe0b0' },
};
const ICONO_ALERTA: Record<Alerta['tipo'], LucideIcon> = {
  incremento: ArrowUp, territorial: Target, horaria: Clock, semanas: BarChart3, estacion: TrendingUp, reduccion: ArrowDown, barrioNuevo: MapPin,
};
const signo = (n: number) => (n > 0 ? '+' : '');
const pctTxt = (v: number | null | undefined) => (v == null ? 'N/A' : `${signo(v)}${formatDecimal(v, 1)} %`);
const tituloCase = (t: string) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t);
/** «E-Norte» → «Est. Norte» (nombre institucional corto). */
const est = (e: string) => (e === 'MEPOY' ? 'MEPOY' : nombreCorto(NOMBRES_ESTACION[e] ?? e));
const fechaCorta = (d: Date) => `${String(d.getDate()).padStart(2, '0')} ${MESES_CORTOS[d.getMonth()].toLowerCase()}`;

/** Acceso: solo el administrador (ruta raíz, sin modo consulta). */
export function esAdministrador() {
  return tieneAcceso('centroInteligencia') && !esModoConsulta();
}

function Panel({ titulo, icono: Icono, derecha, children, className = '' }: { titulo: React.ReactNode; icono: LucideIcon; derecha?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border p-3 ${className}`} style={{ background: `linear-gradient(180deg, ${K.panel}, ${K.fondo})`, borderColor: K.borde, boxShadow: '0 0 0 1px rgba(0,196,215,0.06), 0 8px 24px rgba(0,0,0,0.35)' }}>
      <header className="mb-2 flex items-center gap-2">
        <Icono size={20} style={{ color: K.turquesa }} />
        <h2 className="min-w-0 flex-1 truncate text-[15.5px] font-bold" style={{ color: K.texto }}>{titulo}</h2>
        {derecha}
      </header>
      {children}
    </section>
  );
}

function Kpi({ icono: Icono, titulo, valor, sub, tono = 'normal' }: { icono: LucideIcon; titulo: React.ReactNode; valor: React.ReactNode; sub?: React.ReactNode; tono?: 'normal' | 'sube' | 'baja' }) {
  const fondo = tono === 'sube' ? 'linear-gradient(135deg,#3a0f1c,#16203f)' : tono === 'baja' ? 'linear-gradient(135deg,#0b3b33,#0f2446)' : `linear-gradient(135deg, ${K.panel2}, ${K.panel})`;
  const color = tono === 'sube' ? K.rojo : tono === 'baja' ? K.verde : K.texto;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-2.5" style={{ background: fondo, borderColor: K.borde }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(0,196,215,0.12)', color: K.turquesa }}><Icono size={22} /></span>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[12px] font-semibold leading-tight" style={{ color: K.suave }}>{titulo}</p>
        <p className="line-clamp-2 text-[24px] font-extrabold leading-tight tabular-nums" style={{ color }}>{valor}</p>
        {sub && <p className="line-clamp-2 text-[11.5px] leading-tight" style={{ color: K.suave }}>{sub}</p>}
      </div>
    </div>
  );
}

function Barras({ filas, color = K.verde }: { filas: { nombre: string; casos: number }[]; color?: string }) {
  const max = Math.max(1, ...filas.map((f) => f.casos));
  return (
    <div className="space-y-2">
      {filas.map((f) => (
        <div key={f.nombre} className="flex items-center gap-2 text-[13px]" style={{ color: K.texto }}>
          <span className="w-[120px] shrink-0 truncate" title={f.nombre}>{f.nombre}</span>
          <span className="h-[14px] flex-1 rounded-sm" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <span className="block h-full rounded-sm" style={{ width: `${Math.max(3, (f.casos / max) * 100)}%`, background: `linear-gradient(90deg, ${color}, ${K.turquesa})` }} />
          </span>
          <span className="w-[52px] text-right font-bold tabular-nums">{formatNumero(f.casos)}</span>
        </div>
      ))}
    </div>
  );
}

function AccesoRestringido() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600"><Lock size={28} /></span>
        <h1 className="text-xl font-bold text-[#10233f]">Acceso restringido</h1>
        <p className="mt-2 text-sm text-slate-600">El Centro de Inteligencia y Microgerencia es exclusivo del administrador del S2IP – MEPOY.</p>
      </div>
    </div>
  );
}

export function CentroInteligencia() {
  if (!esAdministrador()) return <AccesoRestringido />;
  return <PanelEstrategico />;
}

function useReloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setAhora(new Date()), 1000); return () => clearInterval(t); }, []);
  return ahora;
}

function PanelEstrategico() {
  const datos = useMicrogerencia();
  const ahora = useReloj();

  const calc = useMemo(() => {
    if (!datos?.registros) return null;
    const { completo: T, anterior: Aa, actual: B } = datos.registros;
    const corteTxt = datos.fechaCorte ?? datos.actualFin;
    const [y, m, d] = corteTxt.split('-').map(Number);
    const corte = new Date(y, m - 1, d);
    const periodo = `Ene – ${MESES_CORTOS[m - 1]} ${datos.anioActual}`;
    const entrada = { T, Aa, B, corte, anioActual: datos.anioActual, anioAnterior: datos.anioAnterior, periodo };
    const alertas = calcularAlertas(entrada);
    const prioridades = calcularPrioridades(entrada);

    const general = datos.general;
    const estaciones = general.hijos.flatMap((x) => x.hijos).filter((e) => !/no reportad/i.test(e.nombre)).sort((a, b) => b.fecha2026 - a.fecha2026);
    const delitosOrden = [...general.delitos].sort((a, b) => b.fecha2026 - a.fecha2026);
    const conIncremento = general.delitos.filter((x) => x.fecha2026 > x.fecha2025).length;
    const conReduccion = general.delitos.filter((x) => x.fecha2026 < x.fecha2025).length;

    const contarVar = (f: (r: CrimeRecord) => string) => {
      const mm = new Map<string, number>();
      for (const r of B) { const v = String(f(r) ?? '').trim(); if (!esValorValido(v)) continue; mm.set(v, (mm.get(v) ?? 0) + 1); }
      return [...mm].map(([nombre, casos]) => ({ nombre: tituloCase(nombre), casos })).sort((a, b) => b.casos - a.casos);
    };
    const top5 = (l: { nombre: string; casos: number }[]) => (l.length <= 5 ? l : [...l.slice(0, 4), { nombre: 'Otras', casos: l.slice(4).reduce((s, x) => s + x.casos, 0) }]);

    const dias = Array.from({ length: 7 }, (_, i) => ({ nombre: nombreDia(i), casos: B.filter((r) => r.diaSemanaIndex === i).length })).sort((a, b) => b.casos - a.casos);

    // Momentos críticos: 5 celdas día × hora con más casos y su delito principal.
    const celdas = new Map<number, CrimeRecord[]>();
    for (const r of B) if (r.diaSemanaIndex != null && r.hora != null) { const k = r.diaSemanaIndex * 24 + r.hora; const l = celdas.get(k); if (l) l.push(r); else celdas.set(k, [r]); }
    const momentos = [...celdas].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]).slice(0, 5)
      .map(([k, l]) => ({ dia: nombreDia(Math.floor(k / 24)), hora: horaTexto(k % 24), casos: l.length, delito: moda(l, (r) => r.delito)?.valor ?? '' }));

    const semanas = ultimasSemanas(B, corte).recientes;
    return {
      corte, periodo, alertas, prioridades, general, estaciones, delitosOrden, conIncremento, conReduccion,
      modalidad: top5(contarVar((r) => r.modalidad)), armas: contarVar((r) => r.armas), dias, momentos, semanas,
      mensual: general.meses.map((p, i) => ({ mes: MESES_CORTOS[i], [datos.anioAnterior]: p.anio2025, [datos.anioActual]: i <= m - 1 ? p.anio2026 : null })),
      barrios: [...(general.barrios ?? [])].sort((a, b) => b.casos - a.casos).slice(0, 5),
      celdaGeneral: celdaCritica(B),
    };
  }, [datos]);

  if (!datos || !calc) {
    return <div className="flex min-h-[50vh] items-center justify-center rounded-2xl text-sm" style={{ background: K.fondo, color: K.suave }}>Cargando el Centro de Inteligencia…</div>;
  }
  const { general: g, anioActual: A, anioAnterior: P } = { general: calc.general, anioActual: datos.anioActual, anioAnterior: datos.anioAnterior };
  const dif = g.fecha2026 - g.fecha2025;
  const v = variacion(g.fecha2025, g.fecha2026);
  const delitoTop = calc.delitosOrden[0];
  const estTop = calc.estaciones[0];
  const barrioTop = calc.barrios[0];
  const armasDona = (calc.armas.length <= 4 ? calc.armas : [...calc.armas.slice(0, 3), { nombre: 'Otras', casos: calc.armas.slice(3).reduce((s, x) => s + x.casos, 0) }])
    .map((x, i) => ({ nombre: x.nombre, valor: x.casos, color: ['#087BEE', '#00C4D7', '#ffb020', '#8b5cf6'][i] }));
  const sem = calc.semanas;
  const s4 = sem[3]?.casos ?? 0, s3 = sem[2]?.casos ?? 0;
  const ejeOscuro = { fontSize: 11, fill: K.suave };

  return (
    <div className="-m-2 space-y-3 rounded-2xl p-3 sm:-m-3 sm:p-4" style={{ background: `radial-gradient(1200px 500px at 50% -10%, #0e3263 0%, ${K.fondo} 55%)`, color: K.texto }} data-centro-inteligencia>
      {/* Encabezado */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: K.borde, background: 'rgba(8,26,54,0.75)' }}>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'rgba(0,196,215,0.12)', color: K.turquesa }}><Radar size={28} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[20px] font-extrabold tracking-wide sm:text-[24px]">CENTRO DE INTELIGENCIA Y MICROGERENCIA</h1>
          <p className="text-[12.5px] font-semibold tracking-wide" style={{ color: K.suave }}>POLICÍA METROPOLITANA DE POPAYÁN – MEPOY · Análisis estratégico delictivo y priorización operacional</p>
        </div>
        <div className="rounded-xl border px-3 py-1.5 text-right" style={{ borderColor: K.borde }}>
          <p className="text-[11.5px]" style={{ color: K.suave }}>Corte: {fechaCorta(calc.corte)} {A} · {calc.periodo}</p>
          <p className="text-[22px] font-extrabold tabular-nums" style={{ color: K.turquesa }}>{ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))' }}>
        <Kpi icono={BarChart3} titulo={`Total delitos ${A}`} valor={formatNumero(g.fecha2026)} sub={`${calc.periodo} · Total ${P}: ${formatNumero(g.total2025)}`} />
        <Kpi icono={CalendarDays} titulo={`${P} a la fecha`} valor={formatNumero(g.fecha2025)} sub={`${calc.periodo.replace(String(A), String(P))}, mismo corte`} />
        <Kpi icono={CalendarRange} titulo={`Diferencia ${A} – ${P}`} valor={`${signo(dif)}${formatNumero(dif)}`} tono={dif > 0 ? 'sube' : dif < 0 ? 'baja' : 'normal'} sub={`Variación ${pctTxt(v)}`} />
        <Kpi icono={Crosshair} titulo="Delito de mayor afectación" valor={<span className="text-[17px]">{delitoTop ? tituloCase(delitoTop.nombre) : '—'}</span>} sub={delitoTop ? `${formatNumero(delitoTop.fecha2026)} casos` : undefined} />
        <Kpi icono={ShieldCheck} titulo="Estación con mayor incidencia" valor={<span className="text-[17px]">{estTop ? nombreCorto(estTop.nombre) : '—'}</span>} sub={estTop ? `${formatNumero(estTop.fecha2026)} casos (${formatDecimal(g.fecha2026 ? (estTop.fecha2026 / g.fecha2026) * 100 : 0, 1)} %)` : undefined} />
        <Kpi icono={MapPin} titulo="Barrio con mayor concentración" valor={<span className="text-[17px]">{barrioTop?.nombre ?? '—'}</span>} sub={barrioTop ? `${formatNumero(barrioTop.casos)} casos (${formatDecimal(g.fecha2026 ? (barrioTop.casos / g.fecha2026) * 100 : 0, 1)} %)` : undefined} />
        <Kpi icono={TrendingUp} titulo="Delitos que suben / bajan" valor={<span className="whitespace-nowrap text-[22px]"><span style={{ color: K.rojo }}>▲ {calc.conIncremento}</span> <span className="text-[16px]" style={{ color: K.suave }}>/</span> <span style={{ color: K.verde }}>▼ {calc.conReduccion}</span></span>} sub={`De ${calc.general.delitos.length} delitos`} />
      </div>

      {/* Fila central */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel titulo={`Radar de alertas delictivas (${calc.alertas.length})`} icono={AlertTriangle} className="xl:col-span-3">
          {calc.alertas.length === 0 ? <p className="py-6 text-center text-[13px]" style={{ color: K.suave }}>Ninguna combinación supera los umbrales con los filtros actuales.</p> : (
            <div className="space-y-2">
              {calc.alertas.map((a, i) => {
                const Ic = ICONO_ALERTA[a.tipo];
                const col = NIVEL[a.nivel];
                return (
                  <div key={i} className="flex gap-2.5 rounded-xl border px-2.5 py-2" style={{ borderColor: K.borde, background: 'rgba(255,255,255,0.02)' }} title={`Criterio: ${a.criterio}\nPeriodo: ${a.periodo}`}>
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: col.fondo, color: col.texto }}><Ic size={18} /></span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="text-[13.5px] font-bold" style={{ color: col.texto }}>{a.titulo}</p>
                      <p className="truncate text-[12.5px]">{tituloCase(a.delito)} – {a.lugar ? `${a.lugar} · ` : ''}{est(a.estacion)}</p>
                      <p className="text-[12.5px]" style={{ color: K.suave }}>
                        {formatNumero(a.casos)} casos{a.dif != null ? ` · ${signo(a.dif)}${formatNumero(a.dif)} (${pctTxt(a.variacion)})` : a.participacion != null ? ` (${formatDecimal(a.participacion, 1)} %)` : ''}
                      </p>
                      <p className="mt-0.5 text-[11px] italic" style={{ color: '#6f87a8' }}>Criterio: {a.criterio}</p>
                    </div>
                    <span className="h-fit shrink-0 rounded-md px-2 py-0.5 text-[11px] font-extrabold" style={{ background: col.fondo, color: col.texto }}>{a.nivel}</span>
                  </div>
                );
              })}
              <p className="pt-1 text-[10.5px]" style={{ color: '#6f87a8' }}>Hallazgos estadísticos sobre las cifras filtradas; no son predicciones ni explican causas. Umbrales: incremento ≥ {UMBRALES_ALERTA.incrementoPct} %, concentración territorial ≥ {UMBRALES_ALERTA.concentracionTerritorialPct} %, estación ≥ {UMBRALES_ALERTA.estacionPct} %.</p>
            </div>
          )}
        </Panel>

        <Panel titulo="Mapa de Georreferenciación – Concentración delictiva" icono={Layers} className="xl:col-span-5">
          <div className="grid flex-1 grid-cols-1 items-start gap-3 md:grid-cols-[1fr_200px]">
            <div className="aspect-[1.05] overflow-hidden rounded-xl border" style={{ borderColor: K.borde, background: '#eef2f5' }}>
              <MapaCobertura fuente="delictividad" nodo={g} esGeneral delitos={datos.delitosSeleccionados?.length ? datos.delitosSeleccionados : null} barrios={[]} inicio={datos.actualInicio} fin={datos.actualFin} aspecto={1.05} />
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border p-2.5" style={{ borderColor: K.borde, background: 'rgba(8,26,54,0.8)' }}>
                <p className="text-[13.5px] font-bold">Top 5 barrios</p>
                <p className="mb-1.5 text-[11px]" style={{ color: K.suave }}>{calc.periodo}</p>
                {calc.barrios.map((b, i) => (
                  <div key={b.nombre} className="flex items-center gap-2 py-0.5 text-[12.5px]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: K.verde, color: K.fondo }}>{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{b.nombre}</span>
                    <span className="font-bold tabular-nums">{formatNumero(b.casos)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border p-2.5" style={{ borderColor: K.borde, background: 'rgba(8,26,54,0.8)' }}>
                <p className="mb-1.5 text-[12.5px] font-bold">Concentración del delito</p>
                <span className="block h-2.5 rounded-full" style={{ background: 'linear-gradient(90deg,#22c55e,#a3e635,#facc15,#f97316,#dc2626)' }} />
                <div className="mt-1 flex justify-between text-[11px]" style={{ color: K.suave }}><span>Baja</span><span>Alta</span></div>
              </div>
              <div className="rounded-xl border p-2.5 text-[12px]" style={{ borderColor: K.borde, background: 'rgba(8,26,54,0.8)' }}>
                <p className="mb-1 font-bold">Estaciones</p>
                {calc.estaciones.map((e) => (
                  <div key={e.nombre} className="flex justify-between py-0.5"><span>{nombreCorto(e.nombre)}</span><span className="font-bold tabular-nums">{formatNumero(e.fecha2026)}</span></div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-3 xl:col-span-4">
          <Panel titulo="Comportamiento mensual de delitos" icono={IconoLinea}>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={calc.mensual} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(143,166,196,0.15)" vertical={false} />
                  <XAxis dataKey="mes" tick={ejeOscuro} axisLine={false} tickLine={false} />
                  <YAxis tick={ejeOscuro} axisLine={false} tickLine={false} width={40} tickFormatter={(x) => formatNumero(x)} />
                  <Tooltip contentStyle={{ background: K.panel, border: `1px solid ${K.borde}`, color: K.texto }} formatter={(x) => formatNumero(Number(x))} />
                  <Line dataKey={String(P)} stroke={K.azul} strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={false} />
                  <Line dataKey={String(A)} stroke={K.verde} strokeWidth={2.4} dot={{ r: 2.5 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex justify-end gap-4 text-[11.5px]" style={{ color: K.suave }}><span><b style={{ color: K.azul }}>━</b> {P}</span><span><b style={{ color: K.verde }}>━</b> {A}</span></div>
          </Panel>
          <Panel titulo="Casos por día de la semana" icono={CalendarDays}>
            <div className="h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calc.dias} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="nombre" tick={ejeOscuro} axisLine={false} tickLine={false} tickFormatter={(x: string) => x.slice(0, 3)} />
                  <YAxis hide />
                  <Bar dataKey="casos" fill={K.verde} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="casos" position="top" style={{ fill: K.texto, fontSize: 12, fontWeight: 700 }} formatter={(x: unknown) => formatNumero(Number(x))} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel titulo="Momentos críticos (Top 5)" icono={Siren}>
            <table className="w-full text-[12.5px]">
              <thead><tr style={{ color: K.suave }}><th className="text-left font-semibold">#</th><th className="text-left font-semibold">Día – Hora</th><th className="text-right font-semibold">Casos</th><th className="pl-3 text-left font-semibold">Delito de mayor afectación</th></tr></thead>
              <tbody>
                {calc.momentos.map((m, i) => {
                  const Ic = iconoDelito(m.delito);
                  return (
                    <tr key={i}>
                      <td className="py-0.5"><span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: '#e5383b' }}>{i + 1}</span></td>
                      <td>{m.dia} – {m.hora}</td>
                      <td className="text-right"><span className="rounded px-1.5 font-bold tabular-nums" style={{ background: '#5a1520', color: '#ff8a96' }}>{formatNumero(m.casos)}</span></td>
                      <td className="pl-3"><span className="flex items-center gap-1.5 truncate"><Ic size={14} style={{ color: K.turquesa }} />{tituloCase(m.delito)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12">
        <Panel titulo="Distribución por modalidad (Top 5)" icono={BarChart3} className="xl:col-span-3"><Barras filas={calc.modalidad} /></Panel>
        <Panel titulo="Arma o medio empleado" icono={Crosshair} className="xl:col-span-3">
          {armasDona.length === 0 ? <p className="py-6 text-center text-[13px]" style={{ color: K.suave }}>Sin información.</p> : (
            <div className="flex items-center gap-3">
              <DonaSvg partes={armasDona} total={armasDona.reduce((s, x) => s + x.valor, 0)} unidad="casos" A={A} tam={128} porcentajes={false} colorTexto={K.texto} colorBorde={K.fondo} />
              <div className="min-w-0 flex-1 space-y-1.5 text-[12.5px]">
                {armasDona.map((p) => (
                  <div key={p.nombre} className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} /><span className="min-w-0 flex-1 truncate">{p.nombre}</span><b className="tabular-nums">{formatNumero(p.valor)}</b></div>
                ))}
              </div>
            </div>
          )}
        </Panel>
        <Panel titulo="Priorización operacional del servicio (Top 3)" icono={Target} className="md:col-span-2 xl:col-span-4">
          {calc.prioridades.length === 0 ? <p className="py-6 text-center text-[13px]" style={{ color: K.suave }}>Sin combinaciones suficientes (mín. 10 casos por delito y CAI).</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-[12.5px]">
                <thead><tr style={{ color: K.suave }}><th className="text-left font-semibold">#</th><th className="text-left font-semibold">Delito · momento crítico</th><th className="text-left font-semibold">Territorio prioritario</th><th className="text-right font-semibold">Casos</th><th className="text-right font-semibold">Var.</th></tr></thead>
                <tbody>
                  {calc.prioridades.map((p, i) => (
                    <tr key={p.delito} className="border-t" style={{ borderColor: K.borde }} title={`Justificación: ${p.justificacion}${p.modalidad ? `\nModalidad predominante: ${p.modalidad}` : ''}${p.arma ? `\nArma o medio: ${p.arma}` : ''}`}>
                      <td className="py-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: ['#e5383b', '#ffb020', '#19C99A'][i], color: K.fondo }}>{i + 1}</span></td>
                      <td className="pl-1 leading-tight"><span className="font-semibold">{tituloCase(p.delito)}</span><br /><span style={{ color: K.suave }}>{p.dia} {p.hora}</span></td>
                      <td className="leading-tight">{est(p.estacion)} – {p.cai}<br /><span style={{ color: K.suave }}>B. {p.barrio || '—'}</span></td>
                      <td className="text-right font-bold tabular-nums">{formatNumero(p.casos)}</td>
                      <td className="whitespace-nowrap pl-1 text-right"><span className="rounded px-1.5 font-bold tabular-nums" style={{ background: (p.variacion ?? 0) > 0 ? '#5a1520' : '#0d4a3a', color: (p.variacion ?? 0) > 0 ? '#ff8a96' : '#3fe0b0' }}>{pctTxt(p.variacion)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1.5 text-[10.5px]" style={{ color: '#6f87a8' }}>Hallazgo estadístico (delito × CAI con más casos, ponderado por su aumento). Es un insumo para la focalización del servicio; no es una orden operativa ni reemplaza la decisión del comandante.</p>
            </div>
          )}
        </Panel>
        <Panel titulo="Últimas 4 semanas" icono={CalendarRange} className="xl:col-span-2">
          <div className="flex items-end gap-2">
            <div className="h-[150px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sem.map((s, i) => ({ nombre: `S${i + 1}`, casos: s.casos, rango: `${fechaCorta(s.desde)} – ${fechaCorta(s.hasta)}` }))} margin={{ top: 18, right: 2, left: 2, bottom: 0 }}>
                  <XAxis dataKey="nombre" tick={ejeOscuro} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: K.panel, border: `1px solid ${K.borde}`, color: K.texto }} labelFormatter={(_, p) => (p?.[0]?.payload as { rango?: string } | undefined)?.rango ?? ''} />
                  <Bar dataKey="casos" fill={K.verde} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    <LabelList dataKey="casos" position="top" style={{ fill: K.texto, fontSize: 12, fontWeight: 700 }} formatter={(x: unknown) => formatNumero(Number(x))} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border px-2 py-2 text-center" style={{ borderColor: K.borde, background: s4 > s3 ? '#3a0f1c' : '#0b3b33' }}>
              <p className="text-[10.5px]" style={{ color: K.suave }}>S4 vs S3</p>
              <p className="text-[20px] font-extrabold tabular-nums" style={{ color: s4 > s3 ? K.rojo : K.verde }}>{signo(s4 - s3)}{formatNumero(s4 - s3)}</p>
              <p className="text-[11px]" style={{ color: K.suave }}>({pctTxt(variacion(s3, s4))})</p>
            </div>
          </div>
          <p className="mt-1 text-[10.5px]" style={{ color: '#6f87a8' }}>Semanas de 7 días que terminan en el corte ({fechaCorta(calc.corte)}).</p>
        </Panel>
      </div>
    </div>
  );
}
