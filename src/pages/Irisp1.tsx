import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, BadgeCheck, BarChart3, Building2, CalendarDays, CalendarRange, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock,
  CloudUpload, Database, FileSearch, FileText, FilterX, House, Landmark, Layers, Leaf, ListChecks, Map as MapIcon, MapPin, MapPinned,
  RefreshCcw, Search, Store, Tags, Target, Upload, UserRound, Users,
} from 'lucide-react';
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { leerMatrizIrisp, diasEntre, ORDEN_ESTADOS, type RegistroIrisp } from '../data/irispParser';
import { guardarIrispLocal, cargarIrispLocal, descargarIrispSupabase, subirIrispSupabase, combinarPorAnio } from '../data/irispStorage';
import { sincronizarCapaIrispDesdeRegistros } from '../data/puntosStorage';
import { Card } from '../components/ui/Card';
import { AporteBarList } from '../components/charts/AporteBarList';
import { DonutChart } from '../components/charts/DonutChart';
import { MultiSelect } from '../components/filters/MultiSelect';
import { type ValorTop } from '../components/ui/SelectorTopBotones';
import { IconoTitulo } from '../components/rnmc/RankingRnmc';
import { MapaRnmc, type CapaReferencia } from '../components/rnmc/MapaRnmc';
import { Top5Dona } from '../components/resumen/BloquesResumen';
import { formatNumero, formatDecimal, MESES_NOMBRES } from '../utils/aggregations';
import { pedirClaveSesion, revisarErrorDeClave, MENSAJE_SIN_CLAVE } from '../utils/claveSesion';

// ──────────────────────────────────────────────────────────────────────────
// IRISP1 — Instrumento de Recolección de Información (Policía Nacional).
// Estructura tomada del tablero institucional (PDF de referencia): totales
// por año → Fase de Recolección → Comparativo con estadística delictiva →
// Fase de Asignación → Fase de Verificación → Fase de Investigación /
// Resultado. Tiene sus PROPIOS filtros (no usa el panel general), porque
// los campos del IRISP1 (Estado, Existencia, Fuente, Clase) no existen en
// Delictividad.
// ──────────────────────────────────────────────────────────────────────────

const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';

interface FiltrosIrisp {
  anio: string[];
  mes: string[];
  estacion: string[];
  delito: string[];
  estado: string[];
  existencia: string[];
  fuente: string[];
  clase: string[];
}
const FILTROS_VACIOS: FiltrosIrisp = { anio: [], mes: [], estacion: [], delito: [], estado: [], existencia: [], fuente: [], clase: [] };

const GETTERS: Record<keyof FiltrosIrisp, (r: RegistroIrisp) => string> = {
  anio: (r) => (r.anio != null ? String(r.anio) : ''),
  mes: (r) => (r.mes != null ? String(r.mes) : ''),
  estacion: (r) => r.estacion,
  delito: (r) => r.delito,
  estado: (r) => r.estado,
  existencia: (r) => r.existencia,
  fuente: (r) => r.fuente,
  clase: (r) => r.clase,
};

function aplicar(registros: RegistroIrisp[], f: FiltrosIrisp, omitir: (keyof FiltrosIrisp)[] = []): RegistroIrisp[] {
  const activos = (Object.keys(f) as (keyof FiltrosIrisp)[]).filter((k) => f[k].length > 0 && !omitir.includes(k));
  if (activos.length === 0) return registros;
  return registros.filter((r) => activos.every((k) => f[k].includes(GETTERS[k](r))));
}

function contar(registros: RegistroIrisp[], campo: (r: RegistroIrisp) => string) {
  const conteo = new Map<string, number>();
  for (const r of registros) {
    const v = campo(r) || 'Sin dato';
    conteo.set(v, (conteo.get(v) || 0) + 1);
  }
  const total = registros.length;
  return Array.from(conteo.entries())
    .map(([key, casos]) => ({ key, casos, aportePct: total > 0 ? (casos / total) * 100 : 0 }))
    .sort((a, b) => b.casos - a.casos);
}

function pct(parte: number, total: number): string {
  return total > 0 ? `${formatDecimal((parte / total) * 100, 1)}%` : '—';
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function fechaCorta(d: Date | null): string {
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

// ── Piezas visuales (solo presentación) ──────────────────────────────────

const NAVY = '#102746';
const PETROLEO = '#006F68';
const CLASE_TITULO = 'text-[14px] font-bold leading-snug text-[#102746]';

/** Insignia numerada de cada bloque (1 Filtros, 2 Resumen, 3 Recolección…). */
function Insignia({ n, clara = false }: { n: number; clara?: boolean }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[17px] font-extrabold ${clara ? 'bg-white/15 text-white ring-1 ring-white/30' : 'bg-[#006F68] text-white'}`}>{n}</span>
  );
}

function Seccion({ n, titulo, subtitulo, acciones, children, className = '' }: { n: number; titulo: string; subtitulo?: string; acciones?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-slate-100 bg-[#f4f7fa] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Insignia n={n} />
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-tight text-[#102746]">{titulo}</p>
            {subtitulo && <p className="text-[12px] text-slate-500">{subtitulo}</p>}
          </div>
        </div>
        {acciones}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function BandaFase({ n, titulo, subtitulo }: { n: number; titulo: string; subtitulo?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2 text-white shadow-sm" style={{ background: `linear-gradient(90deg, ${PETROLEO} 0%, #0b4f55 55%, #0d3b4f 100%)` }}>
      <Insignia n={n} clara />
      <p className="text-[15px] font-extrabold uppercase tracking-wide">{titulo}</p>
      {subtitulo && <p className="hidden truncate text-[12.5px] text-white/80 sm:block">{subtitulo}</p>}
    </div>
  );
}

function SelectorTopNavy({ valor, onChange }: { valor: ValorTop; onChange: (v: ValorTop) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-300">
      {([5, 10, 'todas'] as ValorTop[]).map((op) => (
        <button key={String(op)} type="button" onClick={() => onChange(op)} className={`border-l border-slate-300 px-2 py-[3px] text-[11px] font-semibold first:border-l-0 ${valor === op ? 'bg-[#102746] text-white' : 'bg-white text-[#102746] hover:bg-slate-50'}`}>
          {op === 'todas' ? 'Todas' : `Top ${op}`}
        </button>
      ))}
    </div>
  );
}

function KpiIrisp({ valor, titulo, detalle, icono, fondo, fondoIcono, colorValor = NAVY }: { valor: string; titulo: string; detalle: string; icono: ReactNode; fondo: string; fondoIcono: string; colorValor?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl px-3.5 py-3 ${fondo}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${fondoIcono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[24px] font-extrabold leading-none tabular-nums" style={{ color: colorValor }}>{valor}</p>
        <p className="mt-1 text-[13px] font-semibold leading-tight text-[#102746]">{titulo}</p>
        <p className="text-[11px] leading-tight text-slate-500">{detalle}</p>
      </div>
    </div>
  );
}

function BloqueBarras({ titulo, registros, campo, archivo, topInicial = 10 as ValorTop, subtitulo, icono }: {
  titulo: string; registros: RegistroIrisp[]; campo: (r: RegistroIrisp) => string; archivo: string; topInicial?: ValorTop; subtitulo?: string; icono?: ReactNode;
}) {
  const [top, setTop] = useState<ValorTop>(topInicial);
  const datos = useMemo(() => {
    const todos = contar(registros, campo);
    return top === 'todas' ? todos : todos.slice(0, top);
  }, [registros, campo, top]);
  return (
    <Card title={titulo} descargable={archivo} icono={<IconoTitulo>{icono ?? <BarChart3 size={16} />}</IconoTitulo>} claseTitulo={CLASE_TITULO} actions={<SelectorTopNavy valor={top} onChange={setTop} />} className="h-full">
      <AporteBarList data={datos} compacta textoVacio="No hay informaciones para los filtros seleccionados." />
      {subtitulo && <p className="mt-2 text-[10.5px] leading-snug text-slate-400">{subtitulo}</p>}
    </Card>
  );
}

/** Total de informaciones por año (respeta todos los filtros excepto Año y Mes) — franja compacta. */
function TotalesPorAnio({ registros }: { registros: RegistroIrisp[] }) {
  const porAnio = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of registros) if (r.anio != null) m.set(r.anio, (m.get(r.anio) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [registros]);
  if (porAnio.length < 2) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className="mr-1 font-semibold text-slate-500">Total por año:</span>
      {porAnio.map(([anio, n]) => (
        <span key={anio} className="rounded-md bg-[#DDF5EC] px-2 py-0.5 text-[#004d47]"><b>{anio}</b> · {formatNumero(n)}</span>
      ))}
      <span className="rounded-md bg-[#102746] px-2 py-0.5 text-white"><b>Total</b> · {formatNumero(registros.length)}</span>
    </div>
  );
}

/** "Información dirigida a la identificación de…" — conteo por Clase. */
function IdentificacionDe({ registros }: { registros: RegistroIrisp[] }) {
  const grupos = [
    { titulo: 'Estructuras delincuenciales', detalle: '', patron: /estructura|banda|grupo|organiza/i, icono: <Users size={26} className="text-[#2563eb]" /> },
    { titulo: 'Tráfico de estupefacientes', detalle: '', patron: /trafico|tráfico|estupefac/i, icono: <Leaf size={26} className="text-[#008A63]" /> },
    { titulo: 'Instalaciones fijas', detalle: '(utilizadas en delitos)', patron: /instalaci/i, icono: <Store size={26} className="text-[#2563eb]" /> },
    { titulo: 'Personas relacionadas', detalle: 'a la comisión de delitos', patron: /persona/i, icono: <UserRound size={26} className="text-[#102746]" /> },
  ];
  const conteos = grupos.map((g) => ({ ...g, n: registros.filter((r) => g.patron.test(r.clase)).length }));
  const otros = registros.length - conteos.reduce((a, c) => a + c.n, 0);
  return (
    <Card title="Información dirigida a la identificación de" descargable="irisp1-identificacion" icono={<IconoTitulo><Target size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {conteos.map((c) => (
          <div key={c.titulo} className="flex flex-col items-center rounded-lg bg-[#f4f7fa] px-2 py-3 text-center">
            {c.icono}
            <p className="mt-1 text-[24px] font-extrabold leading-none text-[#102746]">{formatNumero(c.n)}</p>
            <p className="mt-1 text-[11.5px] font-medium leading-tight text-[#102746]">{c.titulo}</p>
            {c.detalle && <p className="text-[10px] leading-tight text-slate-500">{c.detalle}</p>}
          </div>
        ))}
      </div>
      {otros > 0 && <p className="mt-2 text-[11px] text-slate-400">{otros} información(es) con otra clase no clasificada arriba.</p>}
    </Card>
  );
}

/** Tendencia de informaciones por mes (o semana) de creación. */
function Periodicidad({ registros }: { registros: RegistroIrisp[] }) {
  const [vista, setVista] = useState<'mensual' | 'semanal'>('mensual');
  const datos = useMemo(() => {
    const total = registros.length;
    if (vista === 'semanal') {
      const m = new Map<number, number>();
      for (const r of registros) {
        if (!r.fecha) continue;
        const d = new Date(r.fecha.getFullYear(), r.fecha.getMonth(), r.fecha.getDate());
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        m.set(d.getTime(), (m.get(d.getTime()) || 0) + 1);
      }
      return Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([t, casos]) => {
        const d = new Date(t);
        return { etiqueta: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, casos, pct: total ? (casos / total) * 100 : 0 };
      });
    }
    const anios = new Set(registros.map((r) => r.anio));
    const variosAnios = anios.size > 1;
    const m = new Map<string, { orden: number; etiqueta: string; casos: number }>();
    for (const r of registros) {
      if (r.anio == null || r.mes == null) continue;
      const clave = `${r.anio}-${String(r.mes).padStart(2, '0')}`;
      const mesCorto = MESES_NOMBRES[r.mes - 1].slice(0, 3);
      const etiqueta = variosAnios ? `${mesCorto} ${String(r.anio).slice(2)}` : mesCorto;
      const previo = m.get(clave) ?? { orden: r.anio * 100 + r.mes, etiqueta, casos: 0 };
      previo.casos++;
      m.set(clave, previo);
    }
    return Array.from(m.values()).sort((a, b) => a.orden - b.orden).map((d) => ({ etiqueta: d.etiqueta, casos: d.casos, pct: total ? (d.casos / total) * 100 : 0 }));
  }, [registros, vista]);
  return (
    <Card
      title="Tendencia de informaciones"
      subtitle={vista === 'mensual' ? 'Registros por mes de creación' : 'Registros por semana de creación'}
      descargable="irisp1-periodicidad"
      claseTitulo={CLASE_TITULO}
      className="h-full"
      actions={
        <div className="flex overflow-hidden rounded-md border border-slate-300">
          {(['mensual', 'semanal'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVista(v)} className={`px-2.5 py-[3px] text-[11px] font-semibold ${vista === v ? 'bg-[#102746] text-white' : 'bg-white text-[#102746] hover:bg-slate-50'}`}>{v === 'mensual' ? 'Mensual' : 'Semanal'}</button>
          ))}
        </div>
      }
    >
      {datos.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
      ) : (
        <ResponsiveContainer width="100%" height={150} minWidth={0}>
          <BarChart data={datos} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="etiqueta" tick={{ fontSize: 10.5, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={datos.length > 14 ? 'preserveStartEnd' : 0} />
            <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.15)]} />
            <Tooltip formatter={(v, _n, item) => [`${formatNumero(Number(v))} (${formatDecimal((item?.payload as { pct: number } | undefined)?.pct ?? 0, 1)}%)`, 'Informaciones']} />
            <Bar dataKey="casos" fill="#2f7de1" radius={[3, 3, 0, 0]} maxBarSize={36} isAnimationActive={false}>
              <LabelList dataKey="casos" position="top" fontSize={10.5} fontWeight={700} fill={NAVY} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/**
 * Comparativo informaciones vs estadística delictiva — a diferencia del
 * tablero institucional (que compara contra cifras NACIONALES), aquí se
 * cruza contra la base de Delictividad de MEPOY ya cargada en el dashboard,
 * mismos años y misma(s) estación(es). "Casos por información" alto =
 * delito con mucha ocurrencia y poca información recolectada.
 */
function ComparativoEstadistica({ registros, aniosSel, estacionesSel }: { registros: RegistroIrisp[]; aniosSel: number[]; estacionesSel: string[] }) {
  const { records } = useData();
  const anios = useMemo(
    () => (aniosSel.length > 0 ? aniosSel : Array.from(new Set(registros.map((r) => r.anio).filter((a): a is number => a != null))).sort()),
    [aniosSel, registros],
  );
  const filas = useMemo(() => {
    const casos = new Map<string, number>();
    for (const r of records) {
      if (r.anio == null || !anios.includes(r.anio)) continue;
      if (estacionesSel.length > 0 && !estacionesSel.includes(r.estacion)) continue;
      casos.set(r.delito, (casos.get(r.delito) || 0) + (r.cantidad || 1));
    }
    const inform = new Map<string, number>();
    for (const r of registros) inform.set(r.delito, (inform.get(r.delito) || 0) + 1);
    const claves = new Set([...casos.keys(), ...inform.keys()]);
    return Array.from(claves)
      .map((delito) => {
        const c = casos.get(delito) ?? null;
        const i = inform.get(delito) ?? 0;
        return { delito, informaciones: i, casos: c, casosPorInf: c != null && i > 0 ? c / i : null };
      })
      .sort((a, b) => b.informaciones - a.informaciones || (b.casos ?? 0) - (a.casos ?? 0));
  }, [records, registros, anios, estacionesSel]);
  const maxInf = Math.max(1, ...filas.map((f) => f.informaciones));

  const sinBase = records.length === 0;
  return (
    <Card
      title="Comparativo número de informaciones — estadística delictiva"
      subtitle={`Delictividad MEPOY ${anios.join(', ') || ''}${estacionesSel.length ? ` · ${estacionesSel.join(', ')}` : ''}`}
      descargable="irisp1-comparativo-estadistica"
      icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><ClipboardList size={16} /></IconoTitulo>}
      claseTitulo={CLASE_TITULO}
      className="h-full"
    >
      {sinBase ? (
        <p className="py-6 text-center text-xs text-slate-400">Carga la base de Delictividad para poder comparar.</p>
      ) : (
        <div className="max-h-[330px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 z-10 bg-[#f4f7fa] text-[11.5px] text-[#102746]">
              <tr>
                <th className="px-2 py-1.5 text-left font-bold">Delito</th>
                <th className="px-2 py-1.5 text-left font-bold">Informaciones</th>
                <th className="px-2 py-1.5 text-right font-bold">Casos (delictividad)</th>
                <th className="px-2 py-1.5 text-right font-bold">Casos por información</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.delito} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-2 py-[3px] text-slate-700">{f.delito}</td>
                  <td className="px-2 py-[3px]">
                    <div className="flex items-center gap-2">
                      <span className="block h-[9px] min-w-[60px] flex-1 overflow-hidden rounded bg-slate-100">
                        <span className="block h-full rounded" style={{ width: `${(f.informaciones / maxInf) * 100}%`, background: PETROLEO }} />
                      </span>
                      <span className={`w-6 text-right font-bold tabular-nums ${f.informaciones === 0 ? 'text-rose-600' : 'text-[#102746]'}`}>{f.informaciones}</span>
                    </div>
                  </td>
                  <td className="px-2 py-[3px] text-right tabular-nums text-slate-600">{f.casos == null ? <span className="text-slate-400" title="No se registra como delito en la base de Delictividad">n/a</span> : formatNumero(f.casos)}</td>
                  <td className="px-2 py-[3px] text-right tabular-nums text-slate-600">{f.casosPorInf == null ? (f.informaciones === 0 && f.casos ? <span className="font-semibold text-rose-600">sin información</span> : '—') : formatDecimal(f.casosPorInf, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">En rojo: delitos con ocurrencia en el periodo y ninguna información IRISP1 recolectada.</p>
    </Card>
  );
}

/** Distribución geográfica: la misma superficie Kernel del mapa principal, con los shapefiles cargados como referencia. */
function DistribucionGeografica({ registros }: { registros: RegistroIrisp[] }) {
  const [capa, setCapa] = useState<CapaReferencia>('zona');
  const opciones: { v: CapaReferencia; t: string }[] = [{ v: 'zona', t: 'Zona de atención' }, { v: 'comuna', t: 'Comuna' }, { v: 'barrio', t: 'Barrio' }];
  return (
    <Card title="Distribución geográfica" subtitle="Concentración de informaciones por zona de atención" icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><MapIcon size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
      <div className="relative">
        <MapaRnmc registros={registros} capaReferencia={capa} conZoom alto={330} />
        <div className="absolute right-2 top-2 z-[500] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-[11.5px] text-[#102746] shadow-sm">
          {opciones.map((o) => (
            <label key={o.v} className="flex cursor-pointer items-center gap-1.5 py-0.5">
              <input type="radio" name="irisp-capa" checked={capa === o.v} onChange={() => setCapa(o.v)} className="accent-[#102746]" />
              {o.t}
            </label>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-2 right-2 z-[500] flex items-center gap-1.5 rounded-md bg-white/95 px-2 py-1 text-[10.5px] text-slate-600 shadow-sm">
          Baja <span className="h-2 w-16 rounded-full" style={{ background: 'linear-gradient(90deg,#22c55e,#a3e635,#facc15,#f97316,#dc2626)' }} /> Alta
        </div>
      </div>
    </Card>
  );
}

function TiemposGestion({ registros }: { registros: RegistroIrisp[] }) {
  const etapas = useMemo(() => {
    const def = [
      { titulo: 'Creación → asignación', completo: 'Creación → asignación verificación', d: (r: RegistroIrisp) => diasEntre(r.fecha, r.fechaAsignacionVerificacion) },
      { titulo: 'Asignación → respuesta', completo: 'Asignación → respuesta verificación', d: (r: RegistroIrisp) => diasEntre(r.fechaAsignacionVerificacion, r.fechaRespuestaVerificacion) },
      { titulo: 'Respuesta → asignación', completo: 'Respuesta verificación → asignación investigación', d: (r: RegistroIrisp) => diasEntre(r.fechaRespuestaVerificacion, r.fechaAsignacionInvestigacion) },
      { titulo: 'Asignación → investigación', completo: 'Asignación → respuesta investigación', d: (r: RegistroIrisp) => diasEntre(r.fechaAsignacionInvestigacion, r.fechaRespuestaInvestigacion) },
    ];
    return def.map((e) => {
      const valores = registros.map(e.d).filter((v): v is number => v != null);
      const prom = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
      return { titulo: e.titulo, completo: e.completo, n: valores.length, mediana: mediana(valores), promedio: prom };
    });
  }, [registros]);
  return (
    <Card title="Tiempos de gestión (días)" subtitle="Días entre etapas (mediana · promedio) — solo informaciones con ambas fechas" descargable="irisp1-tiempos" claseTitulo={CLASE_TITULO} className="h-full">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {etapas.map((e) => (
          <div key={e.titulo} className="rounded-lg border border-slate-200 bg-[#f4f7fa] p-3" title={e.completo}>
            <p className="flex items-center gap-1 text-[11px] font-semibold text-[#102746]"><Clock size={13} className="shrink-0 text-[#006F68]" /> {e.titulo}</p>
            <p className="mt-1.5 text-[26px] font-extrabold leading-none text-[#102746]">{e.mediana == null ? '—' : `${formatDecimal(e.mediana, 1)} d`}</p>
            <p className="mt-1 text-[11px] text-slate-500">Promedio {e.promedio == null ? '—' : `${formatDecimal(e.promedio, 1)} d`} · {e.n} info.</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Verificaciones asignadas que siguen sin respuesta, con días transcurridos a la fecha de corte. */
function PendientesVerificacion({ registros, fechaCorte }: { registros: RegistroIrisp[]; fechaCorte: Date }) {
  const pendientes = useMemo(
    () => registros
      .filter((r) => r.fechaAsignacionVerificacion && !r.fechaRespuestaVerificacion)
      .map((r) => ({ r, dias: diasEntre(r.fechaAsignacionVerificacion, fechaCorte) ?? 0 }))
      .sort((a, b) => b.dias - a.dias),
    [registros, fechaCorte],
  );
  return (
    <Card title="Verificaciones pendientes de respuesta" subtitle={`Días transcurridos al corte (${fechaCorta(fechaCorte)})`} descargable="irisp1-pendientes-verificacion" icono={<IconoTitulo tono="bg-amber-50 text-amber-600"><AlertTriangle size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
      {pendientes.length === 0 ? (
        <p className="py-6 text-center text-xs text-emerald-600">No hay verificaciones pendientes.</p>
      ) : (
        <div className="max-h-[260px] space-y-1.5 overflow-y-auto">
          {pendientes.map(({ r, dias }) => (
            <div key={r.codigo} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${dias > 15 ? 'bg-rose-50' : 'bg-amber-50'}`}>
              <div>
                <p className="font-semibold text-slate-700">{r.codigo} · {r.delito}</p>
                <p className="text-[11px] text-slate-500">{r.unidadVerifica} · {r.estacion}</p>
              </div>
              <span className={`flex items-center gap-1 font-bold ${dias > 15 ? 'text-rose-600' : 'text-amber-700'}`}>
                {dias > 15 && <AlertTriangle size={12} />}{Math.floor(dias)} d
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ExistenciaPorEstacion({ registros }: { registros: RegistroIrisp[] }) {
  const { estaciones, valores, matriz } = useMemo(() => {
    const estaciones = Array.from(new Set(registros.map((r) => r.estacion))).sort();
    const valores = Array.from(new Set(registros.map((r) => r.existencia))).sort();
    const matriz = new Map<string, number>();
    for (const r of registros) matriz.set(`${r.estacion}|${r.existencia}`, (matriz.get(`${r.estacion}|${r.existencia}`) || 0) + 1);
    return { estaciones, valores, matriz };
  }, [registros]);
  return (
    <Card title="Existencia por estación" descargable="irisp1-existencia-estacion" icono={<IconoTitulo><Building2 size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
      <table className="w-full text-[12px]">
        <thead className="bg-[#f4f7fa] text-[#102746]">
          <tr>
            <th className="px-2 py-1.5 text-left font-bold">Estación</th>
            {valores.map((v) => <th key={v} className={`px-2 py-1.5 text-right font-bold ${v === 'No existe' ? 'text-rose-600' : ''}`}>{v}</th>)}
            <th className="px-2 py-1.5 text-right font-bold">Total</th>
          </tr>
        </thead>
        <tbody>
          {estaciones.map((e) => {
            const total = valores.reduce((a, v) => a + (matriz.get(`${e}|${v}`) || 0), 0);
            return (
              <tr key={e} className="border-b border-slate-100">
                <td className="px-2 py-1 font-medium text-slate-700">{e}</td>
                {valores.map((v) => <td key={v} className="px-2 py-1 text-right tabular-nums">{matriz.get(`${e}|${v}`) || 0}</td>)}
                <td className="px-2 py-1 text-right font-bold tabular-nums text-[#102746]">{total}</td>
              </tr>
            );
          })}
          <tr className="bg-[#f4f7fa] font-bold">
            <td className="px-2 py-1">Total general</td>
            {valores.map((v) => <td key={v} className="px-2 py-1 text-right tabular-nums">{registros.filter((r) => r.existencia === v).length}</td>)}
            <td className="px-2 py-1 text-right tabular-nums text-[#102746]">{registros.length}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

/** Embudo de estados en el ORDEN del flujo del aplicativo, no por cantidad. */
function EstadoInformacion({ registros }: { registros: RegistroIrisp[] }) {
  const datos = useMemo(() => {
    const c = contar(registros, (r) => r.estado);
    const orden = (k: string) => { const i = ORDEN_ESTADOS.indexOf(k); return i === -1 ? 99 : i; };
    return c.sort((a, b) => orden(a.key) - orden(b.key));
  }, [registros]);
  return (
    <Card title="Estado de la información existente" subtitle="En el orden del flujo: asignación → verificación → investigación → finalizado" descargable="irisp1-estado" icono={<IconoTitulo><ListChecks size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
      <AporteBarList data={datos} resaltarMaximo={false} compacta />
    </Card>
  );
}

/**
 * Indicador de efectividad por unidad que investiga. Definición (la misma
 * que se lee en el tablero institucional, corrigiendo su % SPOA que sale
 * desbordado, ej. "188333%"):
 *   % SPOA       = Cantidad SPOA / informaciones en investigación
 *   % SIEDCO     = Cantidad SIEDCO / Cantidad SPOA
 *   Efectividad  = Cantidad SIEDCO / informaciones en investigación
 */
function IndicadorEfectividad({ registros }: { registros: RegistroIrisp[] }) {
  const filas = useMemo(() => {
    const m = new Map<string, { inv: number; spoa: number; siedco: number }>();
    for (const r of registros) {
      if (!r.unidadInvestiga || r.unidadInvestiga === 'Sin asignar') continue;
      const f = m.get(r.unidadInvestiga) ?? { inv: 0, spoa: 0, siedco: 0 };
      f.inv++; f.spoa += r.cantidadSpoa; f.siedco += r.cantidadSiedco;
      m.set(r.unidadInvestiga, f);
    }
    const lista = Array.from(m.entries()).map(([unidad, v]) => ({ unidad, ...v })).sort((a, b) => b.inv - a.inv);
    const total = lista.reduce((a, f) => ({ inv: a.inv + f.inv, spoa: a.spoa + f.spoa, siedco: a.siedco + f.siedco }), { inv: 0, spoa: 0, siedco: 0 });
    return { lista, total };
  }, [registros]);
  const fila = (unidad: string, v: { inv: number; spoa: number; siedco: number }, destacada = false) => (
    <tr key={unidad} className={destacada ? 'bg-[#f4f7fa] font-bold' : 'border-b border-slate-100'}>
      <td className="px-2 py-1 text-slate-700">{unidad}</td>
      <td className="px-2 py-1 text-right tabular-nums">{v.inv}</td>
      <td className="px-2 py-1 text-right tabular-nums">{v.spoa}</td>
      <td className="px-2 py-1 text-right tabular-nums">{pct(v.spoa, v.inv)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{v.siedco}</td>
      <td className="px-2 py-1 text-right tabular-nums">{pct(v.siedco, v.spoa)}</td>
      <td className="px-2 py-1 text-right font-bold tabular-nums text-[#006F68]">{pct(v.siedco, v.inv)}</td>
    </tr>
  );
  return (
    <Card title="Indicador de efectividad" subtitle="Por unidad que investiga" descargable="irisp1-efectividad" icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><BarChart3 size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="bg-[#102746] text-white">
            <tr>
              <th className="px-2 py-1.5 text-left">Unidad</th>
              <th className="px-2 py-1.5 text-right">Investigaciones</th>
              <th className="px-2 py-1.5 text-right">SPOA</th>
              <th className="px-2 py-1.5 text-right">%</th>
              <th className="px-2 py-1.5 text-right">SIEDCO</th>
              <th className="px-2 py-1.5 text-right">%</th>
              <th className="px-2 py-1.5 text-right">Efectividad</th>
            </tr>
          </thead>
          <tbody>
            {filas.lista.map((f) => fila(f.unidad, f))}
            {filas.lista.length > 1 && fila('Total general', filas.total, true)}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">SIJIN = Seccional de Investigación Criminal · UBIC = Unidad Básica de Investigación Criminal.</p>
      <p className="text-[11px] text-slate-400">% SPOA = SPOA / investigaciones · % SIEDCO = SIEDCO / SPOA · Efectividad = SIEDCO / investigaciones.</p>
    </Card>
  );
}

function TablaDetalle({ registros, fechaCorte, n }: { registros: RegistroIrisp[]; fechaCorte: Date; n: number }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = [...registros].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
    if (!q) return base;
    return base.filter((r) => [r.codigo, r.delito, r.barrio, r.zonaAtencion, r.estado, r.unidadInforma, r.caracteristicas, r.direccion].some((v) => v.toLowerCase().includes(q)));
  }, [registros, busqueda]);
  return (
    <Seccion
      n={n}
      titulo="Detalle de informaciones"
      subtitulo={`${visibles.length} de ${registros.length} — clic en una fila para ver características y trámite`}
      acciones={
        <label className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
          <Search size={14} className="text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar código, barrio, delito…" className="w-56 text-[12px] outline-none" />
        </label>
      }
    >
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#f4f7fa] text-[#102746]">
            <tr>
              {['Código', 'Creación', 'Delito', 'Estación', 'Zona atención', 'Barrio', 'Fuente', 'Estado', 'Existencia', 'Días al corte'].map((h) => (
                <th key={h} className={`whitespace-nowrap px-2 py-1.5 font-bold ${h === 'Días al corte' ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <Fragment key={r.codigo}>
                <tr onClick={() => setAbierto(abierto === r.codigo ? null : r.codigo)} className="cursor-pointer border-b border-slate-100 hover:bg-[#DDF5EC]/50">
                  <td className="whitespace-nowrap px-2 py-[5px] font-bold text-[#102746]">{r.codigo}</td>
                  <td className="whitespace-nowrap px-2 py-[5px]">{fechaCorta(r.fecha)}</td>
                  <td className="px-2 py-[5px]">{r.delito}</td>
                  <td className="px-2 py-[5px]">{r.estacion}</td>
                  <td className="px-2 py-[5px]">{r.zonaAtencion}</td>
                  <td className="px-2 py-[5px]">{r.barrio}</td>
                  <td className="px-2 py-[5px]">{r.fuente}</td>
                  <td className="px-2 py-[5px]">{r.estado}</td>
                  <td className={`px-2 py-[5px] ${r.existencia === 'No existe' ? 'font-semibold text-rose-600' : ''}`}>{r.existencia}</td>
                  <td className="px-2 py-[5px] text-right tabular-nums">{Math.floor(diasEntre(r.fecha, fechaCorte) ?? 0)}</td>
                </tr>
                {abierto === r.codigo && (
                  <tr className="bg-[#f4f7fa]">
                    <td colSpan={10} className="px-3 py-2 text-[11px] text-slate-600">
                      <p><span className="font-semibold">Características:</span> {r.caracteristicas || '—'}</p>
                      <p><span className="font-semibold">Dirección:</span> {r.direccion || '—'} · <span className="font-semibold">Informa:</span> {r.unidadInforma} · <span className="font-semibold">Clase:</span> {r.clase}</p>
                      <p><span className="font-semibold">Verifica:</span> {r.unidadVerifica} · <span className="font-semibold">Investiga:</span> {r.unidadInvestiga}{r.nunc && <> · <span className="font-semibold">NUNC:</span> {r.nunc}</>}</p>
                      {r.descripcionTramite && <p><span className="font-semibold">Trámite:</span> {r.descripcionTramite}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Seccion>
  );
}

const PALETA_FUENTE = ['#2563eb', '#16a34a', '#8b5cf6', '#ec4899', '#0ea5e9', '#f59e0b', '#64748b'];
const PALETA_EXISTENCIA = ['#006F68', '#ef4444', '#94a3b8', '#2563eb', '#f59e0b'];

// ── Página ────────────────────────────────────────────────────────────────

export function Irisp1() {
  const [registros, setRegistros] = useState<RegistroIrisp[] | null>(null);
  const [fechaCarga, setFechaCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosIrisp>(FILTROS_VACIOS);

  const { backendUrl, supabaseAnonKey } = obtenerConfig();
  const sincronizacionDisponible = !!backendUrl && !!supabaseAnonKey;

  useEffect(() => {
    (async () => {
      if (sincronizacionDisponible) {
        try {
          const remotos = await descargarIrispSupabase(backendUrl, supabaseAnonKey);
          if (remotos.length > 0) {
            setRegistros(remotos);
            setFechaCarga(new Date().toISOString());
            await guardarIrispLocal(remotos);
            sincronizarCapaIrispDesdeRegistros(remotos).catch(() => {});
            return;
          }
        } catch { /* sin servidor por ahora — se sigue con la copia local */ }
      }
      const local = await cargarIrispLocal();
      if (local) {
        setRegistros(local.registros);
        setFechaCarga(local.fecha);
        sincronizarCapaIrispDesdeRegistros(local.registros).catch(() => {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manejarArchivo(file: File) {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const { registros: leidos } = await leerMatrizIrisp(file);
      if (leidos.length === 0) throw new Error('El archivo no tiene informaciones.');
      const { combinados, aniosReemplazados } = combinarPorAnio(registros ?? [], leidos);
      await guardarIrispLocal(combinados);
      setRegistros(combinados);
      setFechaCarga(new Date().toISOString());
      sincronizarCapaIrispDesdeRegistros(combinados).catch(() => {});
      const resumen = `${leidos.length} información(es) leídas — se actualizó el año ${aniosReemplazados.join(', ')}.`;
      setAviso(resumen);

      if (sincronizacionDisponible) {
        setSincronizando(true);
        try {
          const clave = pedirClaveSesion('subir la matriz IRISP1');
          if (!clave) throw new Error(MENSAJE_SIN_CLAVE);
          await subirIrispSupabase(FUNCION_SUBIR_REGISTROS, clave, leidos, aniosReemplazados, 'No identificado');
          setAviso(`${resumen} Sincronizado con el servidor central.`);
        } catch (e) {
          revisarErrorDeClave(e);
          setAviso(`${resumen} Quedó guardado en este navegador, pero no se pudo sincronizar con el servidor: ${e instanceof Error ? e.message : 'error desconocido'}`);
        } finally {
          setSincronizando(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  const base = useMemo(() => registros ?? [], [registros]);
  const filtrados = useMemo(() => aplicar(base, filtros), [base, filtros]);
  const sinFiltroAnio = useMemo(() => aplicar(base, filtros, ['anio', 'mes']), [base, filtros]);

  // Opciones de cada filtro calculadas sobre los registros filtrados por
  // los DEMÁS filtros (filtro en cascada), para no ofrecer combinaciones
  // vacías.
  const opciones = useMemo(() => {
    const o = {} as Record<keyof FiltrosIrisp, string[]>;
    for (const k of Object.keys(GETTERS) as (keyof FiltrosIrisp)[]) {
      const valores = new Set(aplicar(base, filtros, [k]).map(GETTERS[k]).filter(Boolean));
      o[k] = Array.from(valores).sort((a, b) => (k === 'mes' || k === 'anio' ? Number(a) - Number(b) : a.localeCompare(b, 'es')));
    }
    return o;
  }, [base, filtros]);

  const fechaCorte = useMemo(() => {
    const cortes = base.map((r) => r.fechaCorte?.getTime()).filter((t): t is number => t != null);
    return cortes.length ? new Date(Math.max(...cortes)) : new Date();
  }, [base]);

  const kpis = useMemo(() => {
    const n = filtrados.length;
    const siExiste = filtrados.filter((r) => r.existencia === 'Si existe').length;
    const finalizadas = filtrados.filter((r) => r.estado === 'Finalizado').length;
    const siedco = filtrados.reduce((a, r) => a + r.cantidadSiedco, 0);
    return { n, siExiste, finalizadas, siedco };
  }, [filtrados]);

  const aniosSeleccionados = useMemo(() => filtros.anio.map(Number), [filtros.anio]);
  const hayFiltros = Object.values(filtros).some((v) => v.length > 0);
  const set = (k: keyof FiltrosIrisp) => (v: string[]) => setFiltros((f) => ({ ...f, [k]: v }));
  const etiquetasMes = Object.fromEntries(MESES_NOMBRES.map((m, i) => [String(i + 1), m]));
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);
  const TONO_FILTRO = 'bg-[#eaf4fb] text-[#102746]';
  const filtro = (k: keyof FiltrosIrisp, label: string, icono: ReactNode, labels?: Record<string, string>) => (
    <MultiSelect institucional icono={icono} tonoIcono={TONO_FILTRO} label={label} options={opciones[k]} selected={filtros[k]} onChange={set(k)} labels={labels} />
  );

  return (
    <div className="space-y-3">
      {/* ENCABEZADO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eaf4fb] text-[#102746] ring-1 ring-[#d3e3f4]"><FileSearch size={26} /></span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight text-[#102746]">IRIS P1 — Instrumento de Recolección de Información</h1>
            <p className="text-[13px] text-slate-500">Análisis, seguimiento y estado de la información recolectada en el marco del servicio de policía.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fechaCarga && (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#cfe8e1] bg-[#eef8f5] px-3.5 py-2">
              <CalendarDays size={18} className="text-[#006F68]" />
              <div className="text-[11.5px] leading-tight text-[#102746]">
                <p>Última actualización</p>
                <p className="text-slate-600">{new Date(fechaCarga).toLocaleString('es-CO')}</p>
              </div>
            </div>
          )}
          {registros && (
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
              <Database size={18} className="text-[#102746]" />
              <div className="text-[11.5px] leading-tight text-[#102746]">
                <p className="font-bold">{formatNumero(registros.length)} información(es)</p>
                <p className="text-slate-600">corte del aplicativo {fechaCorta(fechaCorte)}</p>
              </div>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#102746] px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">
            {sincronizando ? <CloudUpload size={16} className="animate-pulse" /> : registros ? <RefreshCcw size={16} /> : <Upload size={16} />}
            {cargando ? 'Leyendo…' : sincronizando ? 'Sincronizando…' : registros ? 'Actualizar matriz IRISP1' : 'Cargar matriz IRISP1'}
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={cargando || sincronizando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{aviso}</div>}

      {/* 1. FILTROS DE ANÁLISIS */}
      <Seccion
        n={1}
        titulo="Filtros de análisis"
        subtitulo="Seleccione los criterios de búsqueda. Los gráficos y tablas se actualizarán automáticamente."
        acciones={
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)} disabled={!hayFiltros} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#102746] hover:bg-slate-50 disabled:opacity-50">
              <FilterX size={14} /> Limpiar filtros
            </button>
            <button type="button" onClick={() => setFiltrosAbiertos((v) => !v)} aria-label={filtrosAbiertos ? 'Contraer filtros' : 'Expandir filtros'} className="rounded-md p-1.5 text-[#102746] hover:bg-slate-100">
              {filtrosAbiertos ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
        }
      >
        {filtrosAbiertos && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
            {filtro('anio', 'Año', <CalendarDays size={18} />)}
            {filtro('mes', 'Mes', <CalendarRange size={18} />, etiquetasMes)}
            {filtro('estacion', 'Estación', <Building2 size={18} />)}
            {filtro('delito', 'Delito', <FileText size={18} />)}
            {filtro('estado', 'Estado', <ListChecks size={18} />)}
            {filtro('existencia', 'Existencia', <Database size={18} />)}
            {filtro('fuente', 'Fuente', <Layers size={18} />)}
            {filtro('clase', 'Clase', <Tags size={18} />)}
          </div>
        )}
      </Seccion>

      {!registros ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga el "Reporte General - IRISP1" descargado del aplicativo para ver el análisis.
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">Ninguna información coincide con los filtros.</div>
      ) : (
        <>
          {/* 2. RESUMEN GENERAL + TENDENCIA */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
            <Seccion n={2} titulo="Resumen general IRIS P1" subtitulo="Indicadores principales de la información recolectada">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
                <KpiIrisp valor={formatNumero(kpis.n)} titulo="Informaciones" detalle="en la selección" icono={<FileText size={24} className="text-white" />} fondoIcono="bg-[#2563eb]" fondo="bg-[#eaf4fb]" />
                <KpiIrisp valor={pct(kpis.siExiste, kpis.n)} titulo="Existencia verificada" detalle={`${kpis.siExiste} verificadas como existentes`} icono={<CheckCircle2 size={24} className="text-white" />} fondoIcono="bg-[#008A63]" fondo="bg-[#DDF5EC]" colorValor="#006F68" />
                <KpiIrisp valor={formatNumero(kpis.finalizadas)} titulo="Finalizadas" detalle={pct(kpis.finalizadas, kpis.n)} icono={<ClipboardList size={24} className="text-white" />} fondoIcono="bg-[#e3a008]" fondo="bg-amber-50" />
                <KpiIrisp valor={formatNumero(kpis.siedco)} titulo="Resultados SIEDCO" detalle={`Efectividad ${pct(kpis.siedco, kpis.n)}`} icono={<FileText size={24} className="text-white" />} fondoIcono="bg-[#7c3aed]" fondo="bg-violet-50" />
              </div>
              <TotalesPorAnio registros={sinFiltroAnio} />
            </Seccion>
            <Periodicidad registros={filtrados} />
          </div>

          {/* COMPARATIVO · DISTRIBUCIÓN · INFORMACIÓN DIRIGIDA + FUENTE */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-[1.25fr_1.35fr_1.3fr]">
            <ComparativoEstadistica registros={filtrados} aniosSel={aniosSeleccionados} estacionesSel={filtros.estacion} />
            <DistribucionGeografica registros={filtrados} />
            <div className="flex flex-col gap-3 lg:col-span-2 2xl:col-span-1">
              <IdentificacionDe registros={filtrados} />
              <Card title="Fuente de información" descargable="irisp1-fuente" icono={<IconoTitulo><Layers size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="flex-1">
                <Top5Dona filas={contar(filtrados, (r) => r.fuente)} total={filtrados.length} colores={PALETA_FUENTE} etiquetaCentro="Informaciones" anchoNombre={170} />
              </Card>
            </div>
          </div>

          {/* 3. FASE DE RECOLECCIÓN */}
          <BandaFase n={3} titulo="Fase de recolección" subtitulo="Características de las informaciones recolectadas" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-[0.85fr_1fr_1.1fr_1.1fr]">
            <Card title="Zona" descargable="irisp1-zona" icono={<IconoTitulo><MapPin size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
              <DonutChart data={contar(filtrados, (r) => r.zona)} height={200} mostrarCasos umbralEtiqueta={0} />
            </Card>
            <BloqueBarras titulo="Estación" registros={filtrados} campo={(r) => r.estacion} archivo="irisp1-estacion" icono={<Building2 size={16} />} />
            <BloqueBarras titulo="Informaciones por delito" registros={filtrados} campo={(r) => r.delito} archivo="irisp1-delito" icono={<FileText size={16} />} topInicial={5} />
            <BloqueBarras titulo="Zona de atención (cuadrante)" registros={filtrados} campo={(r) => r.zonaAtencion.replace(/^Z\. Atención\s+/, 'ZA ')} archivo="irisp1-zona-atencion" icono={<MapPinned size={16} />} topInicial={5} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <BloqueBarras titulo="Unidad que informa" subtitulo="CAI o dependencia del funcionario que reporta" registros={filtrados} campo={(r) => r.unidadInforma} archivo="irisp1-unidad-informa" icono={<Landmark size={16} />} />
            <BloqueBarras titulo="Barrios" registros={filtrados} campo={(r) => r.barrio} archivo="irisp1-barrios" icono={<House size={16} />} />
            <BloqueBarras titulo="Municipio" registros={filtrados} campo={(r) => r.municipio} archivo="irisp1-municipio" topInicial={5} icono={<MapPin size={16} />} />
          </div>

          {/* 4. FASE DE ASIGNACIÓN · 5. FASE DE VERIFICACIÓN */}
          <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[1.25fr_1fr]">
            <div className="space-y-3">
              <BandaFase n={4} titulo="Fase de asignación" subtitulo="Unidades responsables y tiempos de gestión" />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[0.95fr_1.6fr]">
                <BloqueBarras titulo="Unidad asignada" registros={filtrados} campo={(r) => r.unidad} archivo="irisp1-asignacion" topInicial={5} icono={<Landmark size={16} />} />
                <TiemposGestion registros={filtrados} />
              </div>
            </div>
            <div className="space-y-3">
              <BandaFase n={5} titulo="Fase de verificación" subtitulo="Estado de la información y unidades que verifican" />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <Card title="Estado de la información" subtitle="Existencia verificada" descargable="irisp1-existencia" icono={<IconoTitulo><ListChecks size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
                  <Top5Dona filas={contar(filtrados, (r) => r.existencia)} total={filtrados.length} colores={PALETA_EXISTENCIA} etiquetaCentro="Informaciones" compacta anchoNombre={130} />
                </Card>
                <BloqueBarras titulo="Unidad que verifica" subtitulo="SIPOL: Inteligencia · SIJIN: Investigación Criminal" registros={filtrados} campo={(r) => r.unidadVerifica} archivo="irisp1-unidad-verifica" topInicial={5} icono={<BadgeCheck size={16} />} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ExistenciaPorEstacion registros={filtrados} />
            <PendientesVerificacion registros={filtrados} fechaCorte={fechaCorte} />
          </div>

          {/* 6. FASE DE INVESTIGACIÓN / RESULTADO */}
          <BandaFase n={6} titulo="Fase de investigación / resultado" subtitulo="Estado, unidades que investigan y efectividad" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <EstadoInformacion registros={filtrados} />
            <BloqueBarras titulo="Unidad que investiga" registros={filtrados} campo={(r) => r.unidadInvestiga} archivo="irisp1-unidad-investiga" topInicial={5} icono={<Search size={16} />} />
            <div className="md:col-span-2"><IndicadorEfectividad registros={filtrados} /></div>
          </div>

          {/* 7. DETALLE */}
          <TablaDetalle registros={filtrados} fechaCorte={fechaCorte} n={7} />
        </>
      )}
    </div>
  );
}
