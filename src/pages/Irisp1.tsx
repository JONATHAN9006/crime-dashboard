import { Fragment, useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Upload, RefreshCcw, CloudUpload, FilterX, Search, Clock, AlertTriangle } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { leerMatrizIrisp, diasEntre, ORDEN_ESTADOS, type RegistroIrisp } from '../data/irispParser';
import { guardarIrispLocal, cargarIrispLocal, descargarIrispSupabase, subirIrispSupabase, combinarPorAnio } from '../data/irispStorage';
import { sincronizarCapaIrispDesdeRegistros } from '../data/puntosStorage';
import { Card } from '../components/ui/Card';
import { AporteBarList } from '../components/charts/AporteBarList';
import { DonutChart } from '../components/charts/DonutChart';
import { MultiSelect } from '../components/filters/MultiSelect';
import { SelectorTopBotones, type ValorTop } from '../components/ui/SelectorTopBotones';
import { formatNumero, formatDecimal, MESES_NOMBRES } from '../utils/aggregations';

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

// ── Piezas visuales ──────────────────────────────────────────────────────

function BandaFase({ titulo }: { titulo: string }) {
  return (
    <div className="rounded-lg bg-brand-navy px-4 py-2 text-center text-sm font-bold uppercase tracking-wide text-white">{titulo}</div>
  );
}

function BloqueBarras({ titulo, registros, campo, archivo, topInicial = 10 as ValorTop, subtitulo }: {
  titulo: string; registros: RegistroIrisp[]; campo: (r: RegistroIrisp) => string; archivo: string; topInicial?: ValorTop; subtitulo?: string;
}) {
  const [top, setTop] = useState<ValorTop>(topInicial);
  const datos = useMemo(() => {
    const todos = contar(registros, campo);
    return top === 'todas' ? todos : todos.slice(0, top);
  }, [registros, campo, top]);
  return (
    <Card title={titulo} subtitle={subtitulo} descargable={archivo} actions={<SelectorTopBotones valor={top} onChange={setTop} />}>
      {datos.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p> : <AporteBarList data={datos} />}
    </Card>
  );
}

/** Franja tipo "chevron" del tablero institucional: total de informaciones por año. */
function TotalesPorAnio({ registros }: { registros: RegistroIrisp[] }) {
  const porAnio = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of registros) if (r.anio != null) m.set(r.anio, (m.get(r.anio) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [registros]);
  const tonos = ['bg-emerald-100 text-emerald-900', 'bg-emerald-200 text-emerald-900', 'bg-emerald-300 text-emerald-950', 'bg-emerald-500 text-white', 'bg-emerald-700 text-white'];
  return (
    <Card title="Total de informaciones por año" subtitle="Respeta todos los filtros excepto Año" descargable="irisp1-total-por-anio">
      <div className="flex flex-wrap items-stretch gap-1">
        {porAnio.map(([anio, n], i) => (
          <div
            key={anio}
            className={`flex min-w-[88px] flex-1 flex-col items-center justify-center px-4 py-2 ${tonos[Math.max(0, tonos.length - porAnio.length + i)]}`}
            style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)' }}
          >
            <span className="text-xs font-semibold opacity-80">{anio}</span>
            <span className="text-xl font-bold">{formatNumero(n)}</span>
          </div>
        ))}
        <div
          className="flex min-w-[110px] flex-col items-center justify-center bg-brand-navy px-6 py-2 text-white"
          style={{ clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 0 100%, 12px 50%)' }}
        >
          <span className="text-xs font-semibold uppercase opacity-80">Total</span>
          <span className="text-2xl font-bold">{formatNumero(registros.length)}</span>
        </div>
      </div>
      {porAnio.length === 1 && (
        <p className="mt-2 text-[11px] text-slate-400">Solo hay un año cargado. Para ver la serie histórica, carga también las matrices de años anteriores (se suman, no se reemplazan).</p>
      )}
    </Card>
  );
}

/** "Información dirigida a la identificación de…" — conteo por Clase. */
function IdentificacionDe({ registros }: { registros: RegistroIrisp[] }) {
  const grupos = [
    { titulo: 'Estructuras delincuenciales', patron: /estructura|banda|grupo|organiza/i },
    { titulo: 'Tráfico de estupefacientes', patron: /trafico|tráfico|estupefac/i },
    { titulo: 'Instalaciones fijas (utilizadas en delitos)', patron: /instalaci/i },
    { titulo: 'Personas relacionadas a la comisión de delitos', patron: /persona/i },
  ];
  const conteos = grupos.map((g) => ({ ...g, n: registros.filter((r) => g.patron.test(r.clase)).length }));
  const otros = registros.length - conteos.reduce((a, c) => a + c.n, 0);
  return (
    <Card title="Información dirigida a la identificación de" descargable="irisp1-identificacion">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {conteos.map((c) => (
          <div key={c.titulo} className="rounded-lg bg-slate-50 p-3 text-center">
            <p className="text-2xl font-bold text-brand-navy">{formatNumero(c.n)}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{c.titulo}</p>
          </div>
        ))}
      </div>
      {otros > 0 && <p className="mt-2 text-[11px] text-slate-400">{otros} información(es) con otra clase no clasificada arriba.</p>}
    </Card>
  );
}

function Periodicidad({ registros }: { registros: RegistroIrisp[] }) {
  const datos = useMemo(() => {
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
    const total = registros.length;
    return Array.from(m.values()).sort((a, b) => a.orden - b.orden).map((d) => ({ ...d, etiquetaValor: `${d.casos} (${total ? Math.round((d.casos / total) * 100) : 0}%)` }));
  }, [registros]);
  return (
    <Card title="Periodicidad" subtitle="Informaciones por mes de creación" descargable="irisp1-periodicidad">
      {datos.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260} minWidth={0}>
          <BarChart data={datos} margin={{ top: 24, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: '#475569' }} interval={0} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip formatter={(v) => [formatNumero(Number(v)), 'Informaciones']} />
            <Bar dataKey="casos" fill="#116762" radius={[4, 4, 0, 0]} maxBarSize={48}>
              <LabelList dataKey="etiquetaValor" position="top" fontSize={10.5} fill="#334155" />
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

  const sinBase = records.length === 0;
  return (
    <Card
      title="Comparativo número de informaciones — estadística delictiva"
      subtitle={`Delictividad MEPOY ${anios.join(', ') || ''}${estacionesSel.length ? ` · ${estacionesSel.join(', ')}` : ''}`}
      descargable="irisp1-comparativo-estadistica"
    >
      {sinBase ? (
        <p className="py-6 text-center text-xs text-slate-400">Carga la base de Delictividad para poder comparar.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 text-left">Delito</th>
                <th className="px-2 py-1.5 text-right">Informaciones</th>
                <th className="px-2 py-1.5 text-right">Casos (delictividad)</th>
                <th className="px-2 py-1.5 text-right">Casos por información</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.delito} className="border-b border-slate-100">
                  <td className="px-2 py-1 font-medium text-slate-700">{f.delito}</td>
                  <td className={`px-2 py-1 text-right font-semibold ${f.informaciones === 0 ? 'text-rose-600' : 'text-brand-navy'}`}>{f.informaciones}</td>
                  <td className="px-2 py-1 text-right text-slate-600">{f.casos == null ? <span className="text-slate-400" title="No se registra como delito en la base de Delictividad">n/a</span> : formatNumero(f.casos)}</td>
                  <td className="px-2 py-1 text-right text-slate-600">{f.casosPorInf == null ? (f.informaciones === 0 && f.casos ? <span className="font-semibold text-rose-600">sin información</span> : '—') : formatDecimal(f.casosPorInf, 1)}</td>
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

function TiemposGestion({ registros }: { registros: RegistroIrisp[] }) {
  const etapas = useMemo(() => {
    const def = [
      { titulo: 'Creación → asignación verificación', d: (r: RegistroIrisp) => diasEntre(r.fecha, r.fechaAsignacionVerificacion) },
      { titulo: 'Asignación → respuesta verificación', d: (r: RegistroIrisp) => diasEntre(r.fechaAsignacionVerificacion, r.fechaRespuestaVerificacion) },
      { titulo: 'Respuesta verificación → asignación investigación', d: (r: RegistroIrisp) => diasEntre(r.fechaRespuestaVerificacion, r.fechaAsignacionInvestigacion) },
      { titulo: 'Asignación → respuesta investigación', d: (r: RegistroIrisp) => diasEntre(r.fechaAsignacionInvestigacion, r.fechaRespuestaInvestigacion) },
    ];
    return def.map((e) => {
      const valores = registros.map(e.d).filter((v): v is number => v != null);
      const prom = valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
      return { titulo: e.titulo, n: valores.length, mediana: mediana(valores), promedio: prom };
    });
  }, [registros]);
  return (
    <Card title="Tiempos de gestión" subtitle="Días entre etapas (mediana · promedio) — solo informaciones con ambas fechas" descargable="irisp1-tiempos">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {etapas.map((e) => (
          <div key={e.titulo} className="rounded-lg bg-slate-50 p-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-slate-600"><Clock size={12} /> {e.titulo}</p>
            <p className="mt-1 text-2xl font-bold text-brand-navy">{e.mediana == null ? '—' : `${formatDecimal(e.mediana, 1)} d`}</p>
            <p className="text-[11px] text-slate-500">Promedio {e.promedio == null ? '—' : `${formatDecimal(e.promedio, 1)} d`} · {e.n} info.</p>
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
    <Card title="Verificaciones pendientes de respuesta" subtitle={`Días transcurridos al corte (${fechaCorta(fechaCorte)})`} descargable="irisp1-pendientes-verificacion">
      {pendientes.length === 0 ? (
        <p className="py-6 text-center text-xs text-emerald-600">No hay verificaciones pendientes.</p>
      ) : (
        <div className="space-y-1.5">
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
    <Card title="Existencia por estación" descargable="irisp1-existencia-estacion">
      <table className="w-full text-xs">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            <th className="px-2 py-1.5 text-left">Estación</th>
            {valores.map((v) => <th key={v} className="px-2 py-1.5 text-right">{v}</th>)}
            <th className="px-2 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {estaciones.map((e) => {
            const total = valores.reduce((a, v) => a + (matriz.get(`${e}|${v}`) || 0), 0);
            return (
              <tr key={e} className="border-b border-slate-100">
                <td className="px-2 py-1 font-medium text-slate-700">{e}</td>
                {valores.map((v) => <td key={v} className="px-2 py-1 text-right">{matriz.get(`${e}|${v}`) || 0}</td>)}
                <td className="px-2 py-1 text-right font-semibold text-brand-navy">{total}</td>
              </tr>
            );
          })}
          <tr className="bg-slate-50 font-semibold">
            <td className="px-2 py-1">Total general</td>
            {valores.map((v) => <td key={v} className="px-2 py-1 text-right">{registros.filter((r) => r.existencia === v).length}</td>)}
            <td className="px-2 py-1 text-right text-brand-navy">{registros.length}</td>
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
    <Card title="Estado de la información existente" subtitle="En el orden del flujo: asignación → verificación → investigación → finalizado" descargable="irisp1-estado">
      <AporteBarList data={datos} resaltarMaximo={false} />
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
    <tr key={unidad} className={destacada ? 'bg-slate-50 font-semibold' : 'border-b border-slate-100'}>
      <td className="px-2 py-1 text-slate-700">{unidad}</td>
      <td className="px-2 py-1 text-right">{v.inv}</td>
      <td className="px-2 py-1 text-right">{v.spoa}</td>
      <td className="px-2 py-1 text-right">{pct(v.spoa, v.inv)}</td>
      <td className="px-2 py-1 text-right">{v.siedco}</td>
      <td className="px-2 py-1 text-right">{pct(v.siedco, v.spoa)}</td>
      <td className="px-2 py-1 text-right font-bold text-brand-green">{pct(v.siedco, v.inv)}</td>
    </tr>
  );
  return (
    <Card title="Indicador de efectividad" subtitle="Por unidad que investiga" descargable="irisp1-efectividad">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-brand-navy text-white">
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

function TablaDetalle({ registros, fechaCorte }: { registros: RegistroIrisp[]; fechaCorte: Date }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = [...registros].sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
    if (!q) return base;
    return base.filter((r) => [r.codigo, r.delito, r.barrio, r.zonaAtencion, r.estado, r.unidadInforma, r.caracteristicas, r.direccion].some((v) => v.toLowerCase().includes(q)));
  }, [registros, busqueda]);
  return (
    <Card
      title="Detalle de informaciones"
      subtitle={`${visibles.length} de ${registros.length} — clic en una fila para ver características y trámite`}
      actions={
        <label className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1">
          <Search size={12} className="text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar código, barrio, delito…" className="w-48 text-xs outline-none" />
        </label>
      }
    >
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100 text-slate-600">
            <tr>
              {['Código', 'Creación', 'Delito', 'Estación', 'Zona atención', 'Barrio', 'Fuente', 'Estado', 'Existencia', 'Días al corte'].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <Fragment key={r.codigo}>
                <tr onClick={() => setAbierto(abierto === r.codigo ? null : r.codigo)} className="cursor-pointer border-b border-slate-100 hover:bg-emerald-50/50">
                  <td className="whitespace-nowrap px-2 py-1 font-semibold text-brand-navy">{r.codigo}</td>
                  <td className="whitespace-nowrap px-2 py-1">{fechaCorta(r.fecha)}</td>
                  <td className="px-2 py-1">{r.delito}</td>
                  <td className="px-2 py-1">{r.estacion}</td>
                  <td className="px-2 py-1">{r.zonaAtencion}</td>
                  <td className="px-2 py-1">{r.barrio}</td>
                  <td className="px-2 py-1">{r.fuente}</td>
                  <td className="px-2 py-1">{r.estado}</td>
                  <td className={`px-2 py-1 ${r.existencia === 'No existe' ? 'text-rose-600' : ''}`}>{r.existencia}</td>
                  <td className="px-2 py-1 text-right">{Math.floor(diasEntre(r.fecha, fechaCorte) ?? 0)}</td>
                </tr>
                {abierto === r.codigo && (
                  <tr className="bg-slate-50">
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
    </Card>
  );
}

// ── Página ────────────────────────────────────────────────────────────────

export function Irisp1() {
  const [registros, setRegistros] = useState<RegistroIrisp[] | null>(null);
  const [fechaCarga, setFechaCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosIrisp>(FILTROS_VACIOS);

  const { backendUrl, supabaseAnonKey, updatePassword } = obtenerConfig();
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
          await subirIrispSupabase(FUNCION_SUBIR_REGISTROS, updatePassword || 'sin-clave', leidos, aniosReemplazados, 'No identificado');
          setAviso(`${resumen} Sincronizado con el servidor central.`);
        } catch (e) {
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
    const georref = filtrados.filter((r) => r.lat != null && r.lon != null).length;
    return { n, siExiste, finalizadas, siedco, georref };
  }, [filtrados]);

  const aniosSeleccionados = useMemo(() => filtros.anio.map(Number), [filtros.anio]);
  const hayFiltros = Object.values(filtros).some((v) => v.length > 0);
  const set = (k: keyof FiltrosIrisp) => (v: string[]) => setFiltros((f) => ({ ...f, [k]: v }));
  const etiquetasMes = Object.fromEntries(MESES_NOMBRES.map((m, i) => [String(i + 1), m]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5">
        <ShieldAlert size={18} className="text-brand-green" />
        <h2 className="text-base font-bold text-slate-800">IRIS P1 — Instrumento de Recolección de Información</h2>
        {registros && (
          <span className="ml-auto text-[11px] text-slate-500">
            {formatNumero(registros.length)} información(es) · corte del aplicativo {fechaCorta(fechaCorte)}
            {fechaCarga && <> · cargado {new Date(fechaCarga).toLocaleString('es-CO')}</>}
          </span>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{aviso}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <MultiSelect label="Año" options={opciones.anio} selected={filtros.anio} onChange={set('anio')} />
          <MultiSelect label="Mes" options={opciones.mes} selected={filtros.mes} onChange={set('mes')} labels={etiquetasMes} />
          <MultiSelect label="Estación" options={opciones.estacion} selected={filtros.estacion} onChange={set('estacion')} />
          <MultiSelect label="Delito" options={opciones.delito} selected={filtros.delito} onChange={set('delito')} />
          <MultiSelect label="Estado" options={opciones.estado} selected={filtros.estado} onChange={set('estado')} />
          <MultiSelect label="Existencia" options={opciones.existencia} selected={filtros.existencia} onChange={set('existencia')} />
          <MultiSelect label="Fuente" options={opciones.fuente} selected={filtros.fuente} onChange={set('fuente')} />
          <MultiSelect label="Clase" options={opciones.clase} selected={filtros.clase} onChange={set('clase')} />
          {hayFiltros && (
            <button onClick={() => setFiltros(FILTROS_VACIOS)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">
              <FilterX size={13} /> Limpiar
            </button>
          )}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
            {sincronizando ? <CloudUpload size={14} className="animate-pulse" /> : registros ? <RefreshCcw size={14} /> : <Upload size={14} />}
            {cargando ? 'Leyendo…' : sincronizando ? 'Sincronizando…' : registros ? 'Actualizar matriz IRISP1' : 'Cargar matriz IRISP1'}
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={cargando || sincronizando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {!registros ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga el "Reporte General - IRISP1" descargado del aplicativo para ver el análisis.
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">Ninguna información coincide con los filtros.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { t: 'Informaciones', v: formatNumero(kpis.n), s: 'en la selección' },
              { t: 'Si existe', v: pct(kpis.siExiste, kpis.n), s: `${kpis.siExiste} verificadas como existentes` },
              { t: 'Finalizadas', v: formatNumero(kpis.finalizadas), s: pct(kpis.finalizadas, kpis.n) },
              { t: 'Resultados SIEDCO', v: formatNumero(kpis.siedco), s: `Efectividad ${pct(kpis.siedco, kpis.n)}` },
              { t: 'Georreferenciadas', v: pct(kpis.georref, kpis.n), s: 'visibles en la capa IRISP1 del mapa' },
            ].map((k) => (
              <div key={k.t} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.t}</p>
                <p className="mt-0.5 text-2xl font-bold text-brand-navy">{k.v}</p>
                <p className="text-[11px] text-slate-500">{k.s}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <TotalesPorAnio registros={sinFiltroAnio} />
            <IdentificacionDe registros={filtrados} />
          </div>

          <BandaFase titulo="Fase de recolección" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Zona" descargable="irisp1-zona"><DonutChart data={contar(filtrados, (r) => r.zona)} height={240} mostrarCasos umbralEtiqueta={0} /></Card>
            <BloqueBarras titulo="Estación" registros={filtrados} campo={(r) => r.estacion} archivo="irisp1-estacion" />
            <Card title="Fuente" descargable="irisp1-fuente"><DonutChart data={contar(filtrados, (r) => r.fuente)} height={240} mostrarCasos umbralEtiqueta={0.02} /></Card>
            <BloqueBarras titulo="Informaciones por delito" registros={filtrados} campo={(r) => r.delito} archivo="irisp1-delito" />
            <BloqueBarras titulo="Unidad que informa" subtitulo="CAI o dependencia del funcionario que reporta" registros={filtrados} campo={(r) => r.unidadInforma} archivo="irisp1-unidad-informa" />
            <BloqueBarras titulo="Zona de atención (cuadrante)" registros={filtrados} campo={(r) => r.zonaAtencion.replace(/^Z\. Atención\s+/, 'ZA ')} archivo="irisp1-zona-atencion" />
            <BloqueBarras titulo="Barrios" registros={filtrados} campo={(r) => r.barrio} archivo="irisp1-barrios" />
            <BloqueBarras titulo="Municipio" registros={filtrados} campo={(r) => r.municipio} archivo="irisp1-municipio" topInicial={5} />
            <Periodicidad registros={filtrados} />
          </div>

          <ComparativoEstadistica
            registros={filtrados}
            aniosSel={aniosSeleccionados}
            estacionesSel={filtros.estacion}
          />

          <BandaFase titulo="Fase de asignación" />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <BloqueBarras titulo="Unidad asignada" registros={filtrados} campo={(r) => r.unidad} archivo="irisp1-asignacion" topInicial={5} />
            <div className="xl:col-span-2"><TiemposGestion registros={filtrados} /></div>
          </div>

          <BandaFase titulo="Fase de verificación" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Estado de la información" subtitle="Existencia verificada" descargable="irisp1-existencia">
              <DonutChart data={contar(filtrados, (r) => r.existencia)} height={240} mostrarCasos umbralEtiqueta={0} />
            </Card>
            <BloqueBarras titulo="Unidad que verifica" subtitulo="SIPOL: Inteligencia · SIJIN: Investigación Criminal" registros={filtrados} campo={(r) => r.unidadVerifica} archivo="irisp1-unidad-verifica" topInicial={5} />
            <ExistenciaPorEstacion registros={filtrados} />
            <div className="md:col-span-2 xl:col-span-3"><PendientesVerificacion registros={filtrados} fechaCorte={fechaCorte} /></div>
          </div>

          <BandaFase titulo="Fase de investigación / resultado" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <EstadoInformacion registros={filtrados} />
            <BloqueBarras titulo="Unidad que investiga" registros={filtrados} campo={(r) => r.unidadInvestiga} archivo="irisp1-unidad-investiga" topInicial={5} />
            <div className="md:col-span-2"><IndicadorEfectividad registros={filtrados} /></div>
          </div>

          <TablaDetalle registros={filtrados} fechaCorte={fechaCorte} />
        </>
      )}
    </div>
  );
}
