import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { aplicarFiltros } from '../utils/filters';
import { Card, PageHeader } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { formatNumero, formatDecimal } from '../utils/aggregations';
import { IndicadorMultifecha } from '../components/filters/SelectorMultifecha';
import { RankingAporte } from '../components/charts/RankingAporte';
import { BarChart3, Building2, Clock, Crosshair, Home, Hourglass, MapPin, MapPinned, Plus, Store, Timer } from 'lucide-react';
import type { FilterState } from '../types/crime';
import type { CrimeRecord, PeriodoAnalisis } from '../types/crime';
import { esValorPendiente } from '../utils/valoresPendientes';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COLORES_PERIODO = ['#159089', '#64748b', '#0f766e', '#94a3b8', '#134e4a', '#cbd5e1'];
const OPCIONES_TOP = [{ label: 'Top 5', valor: 5 }, { label: 'Top 10', valor: 10 }, { label: 'Todos', valor: undefined as number | undefined }];

function diaSemanaDe(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  return DIAS_SEMANA[new Date(anio, mes - 1, dia).getDay()];
}

function anioDe(fechaIso: string): string {
  return fechaIso.slice(0, 4);
}

function limiteDePeriodo(fecha: string, hora: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [h, m] = (hora || '00:00').split(':').map(Number);
  return new Date(anio, mes - 1, dia, h, m, 0, 0);
}

function registrosDelPeriodo(records: CrimeRecord[], p: PeriodoAnalisis): CrimeRecord[] {
  if (!p.fechaInicial || !p.fechaFinal) return [];
  const inicio = limiteDePeriodo(p.fechaInicial, p.horaInicial || '00:00');
  const fin = limiteDePeriodo(p.fechaFinal, p.horaFinal || '23:59');
  return records.filter((r) => {
    if (!r.fecha) return false;
    const fh = new Date(r.fecha);
    fh.setHours(r.hora ?? 0, 0, 0, 0);
    return fh >= inicio && fh <= fin;
  });
}

// "limite" undefined = Todos, sin recortar. El aporte % se calcula sobre lo
// que efectivamente queda mostrado (igual criterio que ya usa Delictividad
// por Unidad) — cambia si se pasa de "Top 5" a "Todos", a propósito.
function construirTabla(porPeriodo: CrimeRecord[][], getter: (r: CrimeRecord) => string, limite: number | undefined) {
  const claves = new Set<string>();
  for (const recs of porPeriodo) for (const r of recs) claves.add(getter(r) || 'No reportado');
  const todas = Array.from(claves)
    .filter((c) => !esValorPendiente(c))
    .map((clave) => {
      const porcada = porPeriodo.map((recs) => recs.filter((r) => (getter(r) || 'No reportado') === clave).length);
      const total = porcada.reduce((a, b) => a + b, 0);
      return { clave, porcada, total };
    })
    .sort((a, b) => b.total - a.total);
  const filas = limite ? todas.slice(0, limite) : todas;
  const totalMostrado = filas.reduce((a, f) => a + f.total, 0);
  return filas.map((f) => ({ ...f, aportePct: totalMostrado > 0 ? (f.total / totalMostrado) * 100 : 0 }));
}

// Se muestra en vez del Comparativo homólogo (año actual vs año anterior)
// únicamente cuando hay periodos de análisis multifecha activos — el
// Comparativo de siempre sigue intacto para el caso de una sola fecha (ver
// Comparativo.tsx).
export function ComparativoMultifecha() {
  const { filters, records, periodos, drillDown } = useData();
  const [topN, setTopN] = useState<number | undefined>(5);

  // Los filtros normales (delito, estación, CAI, etc. — TODO menos la
  // fecha) se aplican primero, igual que en el resto del dashboard; cada
  // periodo se recorta a partir de ESE conjunto ya filtrado, nunca de
  // "records" crudo, para que "Delito/Estación/CAI" seleccionados arriba
  // sigan funcionando exactamente igual dentro del multifecha.
  const sinFecha = useMemo(() => aplicarFiltros(records, { ...filters, fechaInicial: null, fechaFinal: null }), [records, filters]);
  const porPeriodo = useMemo(() => periodos.map((p) => registrosDelPeriodo(sinFecha, p)), [sinFecha, periodos]);
  const totalGeneral = useMemo(() => {
    // Unión real (sin duplicar) para el KPI de total — un registro que
    // calce con dos periodos a la vez se cuenta una sola vez aquí, aunque
    // en las tablas/gráficos por periodo aparezca en ambas columnas.
    const vistos = new Set<string>();
    for (const recs of porPeriodo) for (const r of recs) vistos.add(r.__id);
    return vistos.size;
  }, [porPeriodo]);

  // ── Vista consolidada con la MISMA lógica de Delictividad por Unidad ──
  // Todos los periodos juntos (sin duplicar un registro que caiga en dos),
  // con las mismas barras (RankingAporte), el mismo aporte % (sobre el total
  // de los periodos) y el mismo clic para filtrar / quitar el filtro.
  const unionPeriodos = useMemo(() => {
    const vistos = new Map<string, CrimeRecord>();
    for (const recs of porPeriodo) for (const r of recs) if (!vistos.has(r.__id)) vistos.set(r.__id, r);
    return Array.from(vistos.values());
  }, [porPeriodo]);
  const rankingDe = (getter: (r: CrimeRecord) => string, limite: number | undefined) => {
    const conteo = new Map<string, number>();
    for (const r of unionPeriodos) {
      const k = getter(r);
      if (!k || esValorPendiente(k)) continue;
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
    const total = unionPeriodos.length;
    const filas = Array.from(conteo.entries()).map(([key, casos]) => ({ key, casos, aportePct: total > 0 ? (casos / total) * 100 : 0 })).sort((a, b) => b.casos - a.casos);
    return limite ? filas.slice(0, limite) : filas;
  };
  const etiquetaHora = (h: string) => `${h.padStart(2, '0')}:00 – ${h.padStart(2, '0')}:59`;
  const [tops, setTops] = useState<Record<string, number | undefined>>({});
  const topDe = (id: string, defecto: number | undefined = 10) => (id in tops ? tops[id] : defecto);

  const tablaDelito = useMemo(() => construirTabla(porPeriodo, (r) => r.delito, topN), [porPeriodo, topN]);
  const tablaEstacion = useMemo(() => construirTabla(porPeriodo, (r) => r.estacion, topN), [porPeriodo, topN]);
  const tablaBarrio = useMemo(() => construirTabla(porPeriodo, (r) => r.barrioHecho, topN), [porPeriodo, topN]);
  const tablaModalidad = useMemo(() => construirTabla(porPeriodo, (r) => r.modalidad, topN), [porPeriodo, topN]);
  const tablaArmas = useMemo(() => construirTabla(porPeriodo, (r) => r.armas, topN), [porPeriodo, topN]);

  const encabezados = periodos.map((p, i) => {
    const dia = diaSemanaDe(p.fechaInicial);
    const anio = anioDe(p.fechaInicial);
    return { id: p.id, titulo: `Periodo ${i + 1}`, subtitulo: [dia, anio].filter(Boolean).join(' '), etiquetaSerie: [dia, anio].filter(Boolean).join(' ') || `Periodo ${i + 1}` };
  });
  const seriesKeys = encabezados.map((e) => e.etiquetaSerie);
  const seriesColors = Object.fromEntries(encabezados.map((e, i) => [e.etiquetaSerie, COLORES_PERIODO[i % COLORES_PERIODO.length]]));

  function datosParaGrafico(filas: ReturnType<typeof construirTabla>) {
    return filas.map((f) => {
      const fila: Record<string, any> = { x: f.clave };
      encabezados.forEach((e, i) => { fila[e.etiquetaSerie] = f.porcada[i]; });
      return fila;
    });
  }

  // Cada sección: gráfico de barras agrupadas (una barra por periodo, lado
  // a lado, por cada categoría) + la tabla exacta debajo, con el mismo
  // orden y las mismas cifras — así se puede leer el número exacto o solo
  // mirar el tamaño de la barra, sin que ninguna de las dos formas quede
  // "coja". Esto es justo lo que faltaba: antes solo había tablas de
  // números, sin ninguna representación visual por barras.
  function Seccion({ titulo, columna, filas, campo }: { titulo: string; columna: string; filas: ReturnType<typeof construirTabla>; campo?: keyof FilterState }) {
    const datos = datosParaGrafico(filas);
    return (
      <Card title={titulo} descargable={`multifecha-${columna.toLowerCase().replace(/\s+/g, '-')}`}>
        {filas.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Sin casos en los periodos seleccionados.</p>
        ) : (
          <>
            <GroupedBarChart
              data={datos}
              xKey="x"
              seriesKeys={seriesKeys}
              seriesColors={seriesColors}
              horizontal
              height={Math.max(220, filas.length * 32)}
            />
            <div className="mt-4 overflow-x-auto border-t border-slate-100 pt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">{columna}</th>
                    {encabezados.map((e) => (
                      <th key={e.id} className="px-2 py-2 text-center">
                        <div>{e.titulo}</div>
                        <div className="text-[10px] font-normal normal-case text-slate-400">{e.subtitulo}</div>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center">Total</th>
                    <th className="px-2 py-2 text-center">Aporte %</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.clave}
                      onClick={campo ? () => drillDown(campo, f.clave) : undefined}
                      title={campo ? 'Clic para filtrar por este valor; otro clic lo quita' : undefined}
                      className={`border-b border-slate-100 ${campo ? 'cursor-pointer hover:bg-slate-50' : ''} ${campo && ((filters[campo] as string[]) ?? []).includes(f.clave) ? 'bg-[#e3f2ef] font-semibold' : ''}`}
                    >
                      <td className="py-1.5 pr-3 text-slate-700">{f.clave}</td>
                      {f.porcada.map((v, i) => (
                        <td key={encabezados[i]?.id ?? i} className="px-2 py-1.5 text-center text-slate-600">{formatNumero(v)}</td>
                      ))}
                      <td className="px-2 py-1.5 text-center font-semibold text-brand-navy">{formatNumero(f.total)}</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{formatDecimal(f.aportePct, 1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    );
  }

  const T = 'text-[14px] font-bold leading-tight text-[#10233f]';
  const ico = (Icono: typeof MapPin) => <Icono size={22} strokeWidth={2.3} className="shrink-0 text-[#137a6f]" />;
  function TarjetaConsolidada({ id, titulo, icono, cabeza, campo, getter, defecto = 10, etiqueta, valorFiltro }: {
    id: string; titulo: string; icono: React.ReactNode; cabeza: string; campo: keyof FilterState;
    getter: (r: CrimeRecord) => string; defecto?: number | undefined;
    etiqueta?: (k: string) => string; valorFiltro?: (k: string) => string;
  }) {
    const limite = topDe(id, defecto);
    const filas = rankingDe(getter, limite).map((f) => ({ ...f, key: etiqueta ? etiqueta(f.key) : f.key }));
    const seleccion = ((filters[campo] as string[]) ?? []).map((v) => (etiqueta ? etiqueta(v) : v));
    return (
      <Card
        className="h-full"
        title={titulo}
        subtitle={`${limite ? `Top ${limite}` : 'Todos'} · ${periodos.filter((p) => p.fechaInicial && p.fechaFinal).length} periodo(s)`}
        descargable={`multifecha-${id}`}
        icono={icono}
        claseTitulo={T}
        actions={
          <div className="flex gap-1">
            {OPCIONES_TOP.map((o) => (
              <button key={o.label} onClick={() => setTops((prev) => ({ ...prev, [id]: o.valor }))} className={`rounded-lg px-2 py-0.5 text-[11px] font-medium ${limite === o.valor ? 'bg-brand-green text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{o.label}</button>
            ))}
          </div>
        }
      >
        <RankingAporte
          data={filas}
          cabeza={cabeza}
          seleccionados={seleccion}
          onClick={(k) => drillDown(campo, valorFiltro ? valorFiltro(k) : k)}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Comparativo multifecha" subtitle="Análisis de eventos/jornadas comparables — cada periodo es una ventana independiente." />
        <div className="flex gap-1.5 rounded-lg border border-slate-200 p-1">
          {OPCIONES_TOP.map((o) => (
            <button
              key={o.label}
              onClick={() => setTopN(o.valor)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${topN === o.valor ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <IndicadorMultifecha />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Total (todos los periodos)" valor={formatNumero(totalGeneral)} acento="navy" />
        {encabezados.slice(0, 3).map((e, i) => (
          <KpiCard key={e.id} titulo={`${e.titulo}${e.subtitulo ? ` (${e.subtitulo})` : ''}`} valor={formatNumero(porPeriodo[i]?.length ?? 0)} acento="gray" />
        ))}
      </div>

      {/* Consolidado de todos los periodos — mismas tarjetas de Delictividad por Unidad */}
      <div>
        <p className="mb-2 text-[15px] font-extrabold text-[#10233f]">Análisis consolidado de los periodos</p>
        <p className="mb-3 text-[12px] text-slate-500">Mismas barras y aporte % de Delictividad por Unidad. Clic en una fila para filtrar por ese valor; otro clic lo quita.</p>
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TarjetaConsolidada id="delito" titulo="Análisis de delitos — Top por cantidad" icono={ico(BarChart3)} cabeza="Delito" campo="delito" getter={(r) => r.delito} />
          <TarjetaConsolidada id="estacion" titulo="Casos por estación" icono={ico(Building2)} cabeza="Estación" campo="estacion" getter={(r) => r.estacion} />
          <TarjetaConsolidada id="cai" titulo="CAI más afectados" icono={ico(MapPin)} cabeza="CAI" campo="cai" getter={(r) => r.cai} />
          <TarjetaConsolidada id="cuadrante" titulo="Cuadrantes más afectados" icono={ico(MapPinned)} cabeza="Cuadrante" campo="cuadrante" getter={(r) => r.cuadrante} />
          <TarjetaConsolidada id="barrio" titulo="Barrios más afectados" icono={ico(Home)} cabeza="Barrio" campo="barrioHecho" getter={(r) => r.barrioHecho} />
          <TarjetaConsolidada id="hora" titulo="Horas más afectadas" icono={ico(Clock)} cabeza="Hora" campo="horaExacta" defecto={5} getter={(r) => (r.hora !== null && r.hora !== undefined ? String(r.hora) : '')} etiqueta={etiquetaHora} valorFiltro={(k) => String(parseInt(k, 10))} />
          <TarjetaConsolidada id="turno" titulo="Turno de vigilancia" icono={ico(Hourglass)} cabeza="Turno" campo="turno" getter={(r) => r.turno} />
          <TarjetaConsolidada id="armas" titulo="Armas empleadas" icono={ico(Crosshair)} cabeza="Arma" campo="armas" getter={(r) => r.armas} defecto={5} />
          <TarjetaConsolidada id="modalidad" titulo="Modalidades principales" icono={ico(Timer)} cabeza="Modalidad" campo="modalidad" getter={(r) => r.modalidad} defecto={5} />
          <TarjetaConsolidada id="sitio" titulo="Clase de sitio" icono={ico(Store)} cabeza="Clase de sitio" campo="claseSitio" getter={(r) => r.claseSitio} defecto={5} />
          <TarjetaConsolidada id="causa" titulo="Causa de lesión" icono={<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#137a6f]"><Plus size={15} strokeWidth={3.5} className="text-white" /></span>} cabeza="Causa" campo="causaLesion" getter={(r) => r.causaLesion} defecto={5} />
        </div>
      </div>

      {/* Comparación lado a lado entre periodos (lo que ya existía) */}
      <p className="pt-2 text-[15px] font-extrabold text-[#10233f]">Comparación entre periodos</p>
      <Seccion titulo="Delitos por periodo" columna="Delito" campo="delito" filas={tablaDelito} />
      <Seccion titulo="Casos por estación por periodo" columna="Estación" campo="estacion" filas={tablaEstacion} />
      <Seccion titulo="Barrios más afectados por periodo" columna="Barrio" campo="barrioHecho" filas={tablaBarrio} />
      <Seccion titulo="Modalidad por periodo" columna="Modalidad" campo="modalidad" filas={tablaModalidad} />
      <Seccion titulo="Armas empleadas por periodo" columna="Arma" campo="armas" filas={tablaArmas} />
    </div>
  );
}
