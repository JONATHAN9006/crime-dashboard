import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { aplicarFiltros } from '../utils/filters';
import { Card, PageHeader } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { formatNumero } from '../utils/aggregations';
import { IndicadorMultifecha } from '../components/filters/SelectorMultifecha';
import { RankingAporte } from '../components/charts/RankingAporte';
import { BarChart3, Building2, Clock, Crosshair, Home, Hourglass, MapPin, MapPinned, Plus, Store, Timer } from 'lucide-react';
import type { FilterState } from '../types/crime';
import type { CrimeRecord, PeriodoAnalisis } from '../types/crime';
import { esValorPendiente } from '../utils/valoresPendientes';
import { GraficoMultifechaDiario, etiquetaPeriodo, type SeriePeriodo } from '../components/charts/GraficoMultifechaDiario';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { Top5Dona } from '../components/resumen/BloquesResumen';
import { useRanking, useUrbanoRural } from '../hooks/useTerritorialAnalysis';
import { useDistribucionHoraria, useTendenciaDiaSemana } from '../hooks/useTemporalAnalysis';
import { CalendarDays, LineChart as IconoLinea, Map as IconoMapa, UserRound, Users } from 'lucide-react';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
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


// Se muestra en vez del Comparativo homólogo (año actual vs año anterior)
// únicamente cuando hay periodos de análisis multifecha activos — el
// Comparativo de siempre sigue intacto para el caso de una sola fecha (ver
// Comparativo.tsx).
export function ComparativoMultifecha() {
  const { filters, records, periodos, drillDown } = useData();

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
    // en el KPI de cada periodo cuente en ambos.
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
  // Serie DIARIA de cada periodo (gráfico tipo jornadas).
  const seriesDiarias: SeriePeriodo[] = useMemo(() => periodos.map((p, i) => {
    if (!p.fechaInicial || !p.fechaFinal) return { id: p.id, etiqueta: `Periodo ${i + 1}`, total: 0, dias: [] };
    const [ai, mi, di] = p.fechaInicial.split('-').map(Number);
    const [af, mf, df] = p.fechaFinal.split('-').map(Number);
    const inicio = new Date(ai, mi - 1, di);
    const fin = new Date(af, mf - 1, df);
    const clave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const conteo = new Map<string, number>();
    for (const r of porPeriodo[i] ?? []) {
      if (!r.fecha) continue;
      const k = clave(new Date(r.fecha));
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
    const dias: { fecha: Date; casos: number }[] = [];
    for (let d = new Date(inicio); d <= fin && dias.length < 400; d.setDate(d.getDate() + 1)) dias.push({ fecha: new Date(d), casos: conteo.get(clave(d)) ?? 0 });
    return { id: p.id, etiqueta: etiquetaPeriodo(inicio, fin), total: porPeriodo[i]?.length ?? 0, dias };
  }), [periodos, porPeriodo]);
  const sufijoDelito = filters.delito.length === 0 ? 'Todos los Delitos' : filters.delito.join(', ');
  // Componentes de abajo (mismos de Delictividad por Unidad) sobre los periodos.
  const diaSemana = useTendenciaDiaSemana(unionPeriodos);
  const porHora = useDistribucionHoraria(unionPeriodos);
  const urbanoRural = useUrbanoRural(unionPeriodos);
  const porGenero = useRanking(unionPeriodos, (r) => r.genero, 10);
  const porGrupoEdad = useRanking(unionPeriodos, (r) => r.grupoEdad, 10);
  const totalDe = (filas: { casos: number }[]) => filas.reduce((a, f) => a + f.casos, 0);
  const COLORES_DONA = ['#10233f', '#159089', '#f97316', '#8a86da', '#a3acb9'];
  const etiquetaHora = (h: string) => `${h.padStart(2, '0')}:00 – ${h.padStart(2, '0')}:59`;
  const [tops, setTops] = useState<Record<string, number | undefined>>({});
  const topDe = (id: string, defecto: number | undefined = 10) => (id in tops ? tops[id] : defecto);

  const encabezados = periodos.map((p, i) => {
    const dia = diaSemanaDe(p.fechaInicial);
    const anio = anioDe(p.fechaInicial);
    return { id: p.id, titulo: `Periodo ${i + 1}`, subtitulo: [dia, anio].filter(Boolean).join(' '), etiquetaSerie: [dia, anio].filter(Boolean).join(' ') || `Periodo ${i + 1}` };
  });
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
      <PageHeader title="Comparativo multifecha" subtitle="Análisis de eventos/jornadas comparables — cada periodo es una ventana independiente." />
      <IndicadorMultifecha />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo="Total (todos los periodos)" valor={formatNumero(totalGeneral)} acento="navy" />
        {encabezados.slice(0, 3).map((e, i) => (
          <KpiCard key={e.id} titulo={`${e.titulo}${e.subtitulo ? ` (${e.subtitulo})` : ''}`} valor={formatNumero(porPeriodo[i]?.length ?? 0)} acento="gray" />
        ))}
      </div>

      <Card
        title={`Comportamiento diario por periodo — ${sufijoDelito}`}
        subtitle="Casos por día en cada periodo · rojo: día con más casos del periodo · franja amarilla: promedio diario"
        descargable="multifecha-diario"
        icono={ico(IconoLinea)}
        claseTitulo={T}
      >
        <GraficoMultifechaDiario series={seriesDiarias} />
      </Card>

      {/* Consolidado de todos los periodos — mismas tarjetas de Delictividad por Unidad */}
      <div>
        <p className="mb-2 text-[15px] font-extrabold text-[#10233f]">Análisis consolidado de los periodos</p>
        <p className="mb-3 text-[12px] text-slate-500">Mismas barras y aporte % de Delictividad por Unidad. Clic en una fila para filtrar por ese valor; otro clic lo quita.</p>
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TarjetaConsolidada id="delito" titulo="Análisis de delitos — Top por cantidad" icono={ico(BarChart3)} cabeza="Delito" campo="delito" getter={(r) => r.delito} />
          <TarjetaConsolidada id="estacion" titulo="Casos por estación" icono={ico(Building2)} cabeza="Estación" campo="estacion" getter={(r) => r.estacion} />
          <TarjetaConsolidada id="cai" titulo="CAI más afectados" icono={ico(MapPin)} cabeza="CAI" campo="cai" getter={(r) => r.cai} />
          <TarjetaConsolidada id="cuadrante" titulo="Zonas de Atención más afectadas" icono={ico(MapPinned)} cabeza="Zonas de Atención" campo="cuadrante" getter={(r) => r.cuadrante} />
          <TarjetaConsolidada id="barrio" titulo="Barrios más afectados" icono={ico(Home)} cabeza="Barrio" campo="barrioHecho" getter={(r) => r.barrioHecho} />
          <TarjetaConsolidada id="hora" titulo="Horas más afectadas" icono={ico(Clock)} cabeza="Hora" campo="horaExacta" defecto={5} getter={(r) => (r.hora !== null && r.hora !== undefined ? String(r.hora) : '')} etiqueta={etiquetaHora} valorFiltro={(k) => String(parseInt(k, 10))} />
          <TarjetaConsolidada id="turno" titulo="Turno de vigilancia" icono={ico(Hourglass)} cabeza="Turno" campo="turno" getter={(r) => r.turno} />
          <TarjetaConsolidada id="armas" titulo="Armas empleadas" icono={ico(Crosshair)} cabeza="Arma" campo="armas" getter={(r) => r.armas} defecto={5} />
          <TarjetaConsolidada id="modalidad" titulo="Modalidades principales" icono={ico(Timer)} cabeza="Modalidad" campo="modalidad" getter={(r) => r.modalidad} defecto={5} />
          <TarjetaConsolidada id="sitio" titulo="Clase de sitio" icono={ico(Store)} cabeza="Clase de sitio" campo="claseSitio" getter={(r) => r.claseSitio} defecto={5} />
          <TarjetaConsolidada id="causa" titulo="Causa de lesión" icono={<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#137a6f]"><Plus size={15} strokeWidth={3.5} className="text-white" /></span>} cabeza="Causa" campo="causaLesion" getter={(r) => r.causaLesion} defecto={5} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 2xl:grid-cols-[0.8fr_0.8fr_0.8fr_1.4fr_2.2fr]">
        <Card className="h-full" title="Zonas con mayor concentración" descargable="multifecha-zonas" icono={ico(IconoMapa)} claseTitulo={T}>
          <Top5Dona filas={urbanoRural} total={totalDe(urbanoRural)} colores={COLORES_DONA} compacta />
        </Card>
        <Card className="h-full" title="Distribución por género" descargable="multifecha-genero" icono={ico(Users)} claseTitulo={T}>
          <Top5Dona filas={porGenero.map((g) => ({ key: g.key, casos: g.casos }))} total={totalDe(porGenero)} colores={COLORES_DONA} compacta />
        </Card>
        <Card className="h-full" title="Distribución por grupo de edad" descargable="multifecha-edad" icono={ico(UserRound)} claseTitulo={T}>
          <Top5Dona filas={porGrupoEdad.map((g) => ({ key: g.key, casos: g.casos }))} total={totalDe(porGrupoEdad)} colores={COLORES_DONA} compacta />
        </Card>
        <Card className="h-full md:col-span-3 2xl:col-span-1" title="Casos por día de la semana" subtitle="Los 3 días con más casos se resaltan" descargable="multifecha-dia-semana" icono={ico(CalendarDays)} claseTitulo={T}>
          <GroupedBarChart data={diaSemana} xKey="dia" seriesKeys={['casos']} height={220} resaltarMaximo resaltarTopN={3} colorPorBarra anchoMaximoBarra={30} tamanoEtiqueta={10.5} espaciadoCategoria={0.32} ocultarEjeY abreviarEtiquetas ocultarLeyendaBarras lineaReferencia="tendencia" />
        </Card>
        <Card className="h-full md:col-span-3 2xl:col-span-1" title="Concentración horaria" subtitle="Las 3 horas con más casos se resaltan" descargable="multifecha-horaria" icono={ico(Clock)} claseTitulo={T}>
          <GroupedBarChart data={porHora} xKey="hora" seriesKeys={['casos']} height={220} resaltarMaximo resaltarTopN={3} colorPorBarra tamanoEtiqueta={9} ocultarEjeY ocultarLeyendaBarras lineaReferencia="promedio3" />
        </Card>
      </div>
    </div>
  );
}
