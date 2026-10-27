import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  BarChart3, Building2, CalendarDays, CalendarRange, ChevronDown, Clock, Crosshair, FileText, Flame, Home, Hourglass,
  Layers, LineChart as IconoLinea, Map as IconoMapa, MapPin, MapPinned, Plus, Store, Timer, TrendingDown, TrendingUp, UserRound, Users,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { formatNumero, formatDecimal } from '../utils/aggregations';
import { useData } from '../context/DataContext';
import { useMultifecha, type FilaVigencias } from '../hooks/useMultifecha';
import { TablaVigencias, VarAbs, VarPct } from '../components/multifecha/TablaVigencias';
import { matrizDiaHora, DIAS_MATRIZ } from '../components/multifecha/MatrizDiaHora';
import { useHeatmap, type CeldaHeatmap, type VistaHeatmap } from '../hooks/useHeatmap';
import { TablaMatriz, Leyenda } from './MatrizCalor';
import { UltimasSemanasMultifecha, colorVigencia } from '../components/multifecha/UltimasSemanasMultifecha';
import { MapaCalorMultifecha } from '../components/multifecha/MapaCalorMultifecha';
import { maxDensidadKernel } from '../utils/kernelDensity';
import { esCoordenadaValida } from '../utils/geodesia';
import { GraficoMultifechaDiario, etiquetaPeriodo, type SeriePeriodo } from '../components/charts/GraficoMultifechaDiario';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { TendenciaMultifecha } from '../components/analitica/TendenciaMultifecha';
import { Top5Dona } from '../components/resumen/BloquesResumen';
import { useRanking, useUrbanoRural } from '../hooks/useTerritorialAnalysis';
import { useDistribucionHoraria, useTendenciaDiaSemana } from '../hooks/useTemporalAnalysis';
import type { FilterState } from '../types/crime';

// ───────────────────────────────────────────────────────────────────────────
// ANÁLISIS DELICTIVO — MULTIFECHA. Se muestra en Inicio y en Delictividad
// por Unidad cuando hay vigencias multifecha activas. Todo lo de esta página
// sale de useMultifecha (fuente única): cada vigencia con su propio rango de
// fechas y la variación siempre entre la PRIMERA y la ÚLTIMA vigencia.
// ───────────────────────────────────────────────────────────────────────────

const T = 'text-[15px] font-extrabold leading-tight text-[#10233f]';
const ico = (Icono: typeof MapPin) => <Icono size={21} strokeWidth={2.2} className="shrink-0 text-[#137a6f]" />;
const etiquetaHora = (h: string) => `${h.padStart(2, '0')}:00 – ${h.padStart(2, '0')}:59`;
const COLORES_DONA = ['#10233f', '#159089', '#f97316', '#8a86da', '#a3acb9'];

function KpiMultifecha({ icono, titulo, detalle, children, tono = 'bg-[#e3f2ef] text-[#116762]' }: { icono: ReactNode; titulo: string; detalle?: ReactNode; children: ReactNode; tono?: string }) {
  return (
    <div className="relative flex min-w-0 items-center gap-3.5 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_2px_8px_rgba(16,35,63,0.06)]">
      <span className={clsx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', tono)}>{icono}</span>
      <div className="relative z-[1] min-w-0">
        <p className="text-[12.5px] font-bold leading-tight text-[#10233f]">{titulo}</p>
        <div className="mt-1 text-[28px] font-extrabold leading-none text-[#10233f]">{children}</div>
        {detalle && <p className="mt-1.5 truncate text-[11px] text-slate-500">{detalle}</p>}
      </div>
      <BarChart3 size={40} strokeWidth={2.4} className="pointer-events-none absolute bottom-3 right-3 text-slate-200" aria-hidden />
    </div>
  );
}

const lista = (filas: { key: string; n: number }[]) => filas.map((f) => `${f.key} (${formatNumero(f.n)})`).join(', ');

/** Resumen ejecutivo construido SOLO con las cifras actuales (se rehace con cada cambio). */
function useResumenEjecutivo(mf: ReturnType<typeof useMultifecha>, tablas: Record<'delito' | 'estacion' | 'cai' | 'zona', FilaVigencias[]>) {
  return useMemo(() => {
    const { vigencias, primera, ultima, comparable, totalGeneral, totalPrimera, totalUltima, varAbs, varPct, union } = mf;
    if (vigencias.length === 0) return [] as ReactNode[];
    const items: ReactNode[] = [];
    items.push(<>Se analizan <b>{vigencias.length}</b> vigencia{vigencias.length === 1 ? '' : 's'} ({vigencias.map((v) => `${v.etiqueta}: ${v.rango}`).join(' · ')}), con <b>{formatNumero(totalGeneral)}</b> casos en total.</>);
    if (totalGeneral === 0) { items.push(<>No hay casos registrados en los rangos elegidos con los filtros actuales.</>); return items; }
    if (comparable && primera && ultima) {
      const texto = varAbs === 0 ? 'sin variación' : `${varAbs > 0 ? 'un aumento' : 'una reducción'} de ${formatNumero(Math.abs(varAbs))} casos${varPct === null ? '' : ` (${varAbs > 0 ? '+' : '−'}${formatDecimal(Math.abs(varPct), 1)} %)`}`;
      items.push(<><b>{ultima.etiqueta}</b> ({ultima.rango}) registra <b>{formatNumero(totalUltima)}</b> casos frente a <b>{formatNumero(totalPrimera)}</b> de {primera.etiqueta} ({primera.rango}): <b style={{ color: varAbs > 0 ? '#dc2626' : varAbs < 0 ? '#15803d' : undefined }}>{texto}</b>{varPct === null && totalPrimera === 0 ? ' — sin porcentaje, porque la primera vigencia no tiene casos' : ''}.</>);
    }
    const top = (filas: FilaVigencias[], k: number) => filas.filter((f) => f.ultima > 0).slice(0, k).map((f) => ({ key: f.key, n: f.ultima }));
    const etUlt = ultima?.etiqueta ?? '';
    const delitosTop = top(tablas.delito, 3);
    if (delitosTop.length) items.push(<>Delitos con más casos en {etUlt}: {lista(delitosTop)}.</>);
    const terr: string[] = [];
    const e = top(tablas.estacion, 1)[0]; if (e) terr.push(`estación ${e.key} (${formatNumero(e.n)})`);
    const c = top(tablas.cai, 1)[0]; if (c) terr.push(`${c.key} (${formatNumero(c.n)})`);
    const z = top(tablas.zona, 1)[0]; if (z) terr.push(`zona ${z.key} (${formatNumero(z.n)})`);
    if (terr.length) items.push(<>Mayor afectación en {etUlt}: {terr.join(' · ')}.</>);
    if (comparable && primera) {
      const aumentos = [...tablas.delito].filter((f) => f.varAbs > 0).sort((a, b) => b.varAbs - a.varAbs).slice(0, 3);
      const bajas = [...tablas.delito].filter((f) => f.varAbs < 0).sort((a, b) => a.varAbs - b.varAbs).slice(0, 3);
      if (aumentos.length) items.push(<>Principales aumentos ({primera.etiqueta}→{etUlt}): {aumentos.map((f) => <span key={f.key} className="font-semibold text-[#dc2626]">{f.key} +{formatNumero(f.varAbs)} </span>)}</>);
      if (bajas.length) items.push(<>Principales reducciones: {bajas.map((f) => <span key={f.key} className="font-semibold text-[#15803d]">{f.key} −{formatNumero(Math.abs(f.varAbs))} </span>)}</>);
    }
    const m = matrizDiaHora(union);
    const porDia = m.map((f) => f.reduce((a, b) => a + b, 0));
    const porHora = Array.from({ length: 24 }, (_, h) => m.reduce((a, f) => a + f[h], 0));
    const dMax = porDia.indexOf(Math.max(...porDia));
    const hMax = porHora.indexOf(Math.max(...porHora));
    let celda = { d: -1, h: -1, v: 0 };
    m.forEach((f, d) => f.forEach((v, h) => { if (v > celda.v) celda = { d, h, v }; }));
    if (porDia[dMax] > 0) items.push(<>Mayor incidencia (todas las vigencias): <b>{DIAS_MATRIZ[dMax]}</b> ({formatNumero(porDia[dMax])} casos) y la franja <b>{etiquetaHora(String(hMax))}</b> ({formatNumero(porHora[hMax])}){celda.v > 1 ? <>; punto más crítico: {DIAS_MATRIZ[celda.d]} {String(celda.h).padStart(2, '0')}:00 ({formatNumero(celda.v)} casos)</> : null}.</>);
    return items;
  }, [mf, tablas]);
}

export function ComparativoMultifecha() {
  const { meta, setFilters } = useData();
  const mf = useMultifecha();
  const { vigencias, primera, ultima, comparable, union, base, tabla, drillDown, filters } = mf;

  // Tablas (una sola vez por render, desde la fuente única).
  const tablas = useMemo(() => ({
    delito: tabla((r) => r.delito),
    estacion: tabla((r) => r.estacion),
    cai: tabla((r) => r.cai),
    zona: tabla((r) => r.cuadrante),
    barrio: tabla((r) => r.barrioHecho),
    hora: tabla((r) => (r.hora != null ? String(r.hora) : '')),
    turno: tabla((r) => r.turno),
    armas: tabla((r) => r.armas),
    modalidad: tabla((r) => r.modalidad),
    sitio: tabla((r) => r.claseSitio),
    causa: tabla((r) => r.causaLesion),
  }), [tabla]);
  const resumen = useResumenEjecutivo(mf, tablas);

  // Vista de la matriz y el mapa: todas las vigencias juntas o una sola.
  const [vista, setVista] = useState<string>('todas');
  const [escalaComun, setEscalaComun] = useState(true);
  const vigVista = vigencias.find((v) => v.id === vista) ?? null;
  const registrosVista = vigVista ? vigVista.registros : union;
  // Matriz de calor: la MISMA del módulo «Matriz de Calor» (niveles por percentiles).
  const [vistaMatriz, setVistaMatriz] = useState<VistaHeatmap>('hora');
  const datosMatriz = useHeatmap(registrosVista, vistaMatriz);
  const filtrarCelda = (celda: CeldaHeatmap) => setFilters((prev) => ({
    ...prev,
    diaSemana: [celda.dia],
    horaExacta: vistaMatriz === 'hora' ? [celda.columna] : [],
    franjaHoraria: vistaMatriz === 'franja' ? [celda.columna] : [],
  }));
  const maxKernelComun = useMemo(() => {
    if (!vigVista || !escalaComun) return undefined;
    return Math.max(0, ...vigencias.map((v) => maxDensidadKernel(v.registros.filter((r) => esCoordenadaValida(r.lat, r.lon)).map((r) => ({ lat: r.lat!, lon: r.lon! })))));
  }, [vigencias, vigVista, escalaComun]);

  // Serie diaria por vigencia (gráfico de jornadas, ya existente).
  const seriesDiarias: SeriePeriodo[] = useMemo(() => vigencias.map((v) => {
    // Días de TODOS los periodos del año (sin los días intermedios entre periodos).
    const clave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const conteo = new Map<string, number>();
    for (const r of v.registros) if (r.fecha) { const k = clave(new Date(r.fecha)); conteo.set(k, (conteo.get(k) ?? 0) + 1); }
    const dias: { fecha: Date; casos: number }[] = [];
    const vistos = new Set<string>();
    for (const x of v.periodos) {
      const fin = new Date(x.fin.getFullYear(), x.fin.getMonth(), x.fin.getDate());
      for (let d = new Date(x.inicio.getFullYear(), x.inicio.getMonth(), x.inicio.getDate()); d <= fin && dias.length < 400; d.setDate(d.getDate() + 1)) {
        const k = clave(d);
        if (vistos.has(k)) continue;
        vistos.add(k);
        dias.push({ fecha: new Date(d), casos: conteo.get(k) ?? 0 });
      }
    }
    dias.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const ini = dias[0]?.fecha ?? v.inicio;
    const fin = dias[dias.length - 1]?.fecha ?? v.fin;
    return { id: v.id, etiqueta: v.periodos.length > 1 ? `${etiquetaPeriodo(ini, fin)} (${v.periodos.length} periodos)` : etiquetaPeriodo(ini, fin), total: v.registros.length, dias };
  }), [vigencias]);
  const aniosVig = useMemo(() => Array.from(new Set(vigencias.map((v) => v.anio))).sort((a, b) => a - b), [vigencias]);

  // Componentes complementarios (mismos de Delictividad por Unidad) sobre la unión.
  const diaSemana = useTendenciaDiaSemana(union);
  const porHora = useDistribucionHoraria(union);
  const urbanoRural = useUrbanoRural(union);
  const porGenero = useRanking(union, (r) => r.genero, 10);
  const porGrupoEdad = useRanking(union, (r) => r.grupoEdad, 10);
  const totalDe = (filas: { casos: number }[]) => filas.reduce((a, f) => a + f.casos, 0);

  const sel = (campo: keyof FilterState) => ((filters[campo] as string[]) ?? []);
  const comunes = (campo: keyof FilterState) => ({ vigencias, onFila: (k: string) => drillDown(campo, k), seleccionados: sel(campo) });
  const rangoTexto = vigencias.length ? `${vigencias[0].etiqueta}${vigencias.length > 1 ? `–${vigencias[vigencias.length - 1].etiqueta}` : ''}` : '—';

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#10233f] text-white"><BarChart3 size={22} /></span>
          <div>
            <h1 className="text-[21px] font-extrabold uppercase leading-tight tracking-tight text-[#10233f]">Análisis delictivo — Multifecha</h1>
            <p className="text-[13px] text-slate-500">Comparativo histórico de periodos equivalentes · {filters.delito.length ? filters.delito.join(', ') : 'Todos los delitos'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-sm">
          <CalendarRange size={18} className="text-[#116762]" />
          <div className="leading-tight">
            <p className="font-bold text-[#10233f]">Vigencias {rangoTexto}</p>
            <p className="text-slate-500">Cada vigencia con su propio rango de fechas</p>
          </div>
        </div>
      </div>

      {vigencias.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-slate-500">Marque al menos una vigencia con fecha inicial y final completas en «¿Desea incluir otras fechas para el análisis?» (panel de filtros).</p></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiMultifecha icono={<FileText size={24} />} titulo="Total de casos" detalle={vigencias.map((v) => `${v.etiqueta}: ${formatNumero(v.registros.length)}`).join(' · ')}>{formatNumero(mf.totalGeneral)}</KpiMultifecha>
            <KpiMultifecha icono={mf.varAbs > 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />} tono={mf.varAbs > 0 ? 'bg-rose-50 text-[#dc2626]' : 'bg-[#e3f2ef] text-[#15803d]'} titulo={comparable ? `Variación absoluta (${ultima!.etiqueta} vs ${primera!.etiqueta})` : 'Variación absoluta'} detalle={comparable ? `${formatNumero(mf.totalUltima)} vs ${formatNumero(mf.totalPrimera)} casos` : 'Seleccione al menos dos vigencias'}>
              {comparable ? <VarAbs valor={mf.varAbs} grande /> : <span className="text-slate-300">—</span>}
            </KpiMultifecha>
            <KpiMultifecha icono={<Flame size={24} />} tono={mf.varAbs > 0 ? 'bg-rose-50 text-[#dc2626]' : 'bg-[#e3f2ef] text-[#15803d]'} titulo={comparable ? `Variación porcentual (${ultima!.etiqueta} vs ${primera!.etiqueta})` : 'Variación porcentual'} detalle={comparable ? 'Primera contra última vigencia' : 'Seleccione al menos dos vigencias'}>
              {comparable ? <VarPct valor={mf.varPct} grande /> : <span className="text-slate-300">—</span>}
            </KpiMultifecha>
            <KpiMultifecha icono={<Layers size={24} />} titulo="Vigencias comparadas" detalle={vigencias.map((v) => `${v.etiqueta} (${v.rango})`).join(' · ')}>{vigencias.length}</KpiMultifecha>
          </div>

          {/* Componentes: 3 por fila */}
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card className="h-full" title="Resumen ejecutivo" subtitle="Se genera con las cifras actuales" descargable="multifecha-resumen" icono={ico(FileText)} claseTitulo={T}>
              <ul className="space-y-2 text-[12.5px] leading-snug text-slate-700">
                {resumen.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#116762]" /><span>{t}</span></li>)}
              </ul>
            </Card>
            <TablaVigencias id="delito" titulo="Comparativo por delito" icono={ico(BarChart3)} cabeza="Delito" filas={tablas.delito} topInicial={10} {...comunes('delito')} />
            <TablaVigencias id="estacion" titulo="Casos por estación" icono={ico(Building2)} cabeza="Estación" filas={tablas.estacion} topInicial={5} {...comunes('estacion')} />
            <TablaVigencias id="cai" titulo="CAI más afectados" icono={ico(MapPin)} cabeza="CAI" filas={tablas.cai} topInicial={5} {...comunes('cai')} />
            <TablaVigencias id="zona" titulo="Zonas de Atención más afectadas" icono={ico(MapPinned)} cabeza="Zona de atención" filas={tablas.zona} topInicial={5} {...comunes('cuadrante')} />
            <TablaVigencias id="barrio" titulo="Barrios más afectados" icono={ico(Home)} cabeza="Barrio" filas={tablas.barrio} topInicial={5} {...comunes('barrioHecho')} />
            <TablaVigencias id="hora" titulo="Horas más afectadas" icono={ico(Clock)} cabeza="Hora" filas={tablas.hora} topInicial={5} etiqueta={etiquetaHora} vigencias={vigencias} seleccionados={sel('horaExacta')} onFila={(k) => drillDown('horaExacta', String(parseInt(k, 10)))} />
            <TablaVigencias id="turno" titulo="Turno de vigilancia" icono={ico(Hourglass)} cabeza="Turno" filas={tablas.turno} conTop={false} {...comunes('turno')} />
            <TablaVigencias id="armas" titulo="Armas empleadas" icono={ico(Crosshair)} cabeza="Arma" filas={tablas.armas} topInicial={5} {...comunes('armas')} />
            <TablaVigencias id="modalidad" titulo="Modalidades principales" icono={ico(Timer)} cabeza="Modalidad" filas={tablas.modalidad} topInicial={5} {...comunes('modalidad')} />
            <TablaVigencias id="sitio" titulo="Clase de sitio" icono={ico(Store)} cabeza="Clase de sitio" filas={tablas.sitio} topInicial={5} {...comunes('claseSitio')} />
            <TablaVigencias id="causa" titulo="Causa de lesión" icono={<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#137a6f]"><Plus size={15} strokeWidth={3.5} className="text-white" /></span>} cabeza="Causa" filas={tablas.causa} topInicial={5} {...comunes('causaLesion')} />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
            <Card className="h-full" title="Zonas con mayor concentración" descargable="multifecha-zonas" icono={ico(IconoMapa)} claseTitulo={T}>
              <Top5Dona filas={urbanoRural} total={totalDe(urbanoRural)} colores={COLORES_DONA} compacta />
            </Card>
            <Card className="h-full" title="Distribución por género" descargable="multifecha-genero" icono={ico(Users)} claseTitulo={T}>
              <Top5Dona filas={porGenero.map((g) => ({ key: g.key, casos: g.casos }))} total={totalDe(porGenero)} colores={COLORES_DONA} compacta />
            </Card>
            <Card className="h-full" title="Distribución por grupo de edad" descargable="multifecha-edad" icono={ico(UserRound)} claseTitulo={T}>
              <Top5Dona filas={porGrupoEdad.map((g) => ({ key: g.key, casos: g.casos }))} total={totalDe(porGrupoEdad)} colores={COLORES_DONA} compacta />
            </Card>
          </div>


          {/* Matriz de calor + mapa de calor: 2 por fila, más grandes */}
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="font-bold text-[#10233f]">Matriz y mapa de calor:</span>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setVista('todas')} aria-pressed={vista === 'todas'} className={clsx('rounded-full px-2.5 py-0.5 font-semibold', vista === 'todas' ? 'bg-[#10233f] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50')}>Todas las vigencias</button>
                {vigencias.map((v) => (
                  <button key={v.id} type="button" onClick={() => setVista(v.id)} aria-pressed={vista === v.id} className={clsx('rounded-full px-2.5 py-0.5 font-semibold', vista === v.id ? 'bg-[#116762] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50')}>{v.etiqueta}</button>
                ))}
              </div>
              <label className={clsx('ml-auto flex items-center gap-1.5', !vigVista && 'opacity-50')} title="Con una vigencia elegida, el mapa usa la misma escala de color para todas, así las diferencias entre años no engañan">
                <input type="checkbox" className="accent-[#116762]" checked={escalaComun} disabled={!vigVista} onChange={(e) => setEscalaComun(e.target.checked)} /> Escala comparable entre vigencias (mapa)
              </label>
            </div>
          </div>
          {/* Matriz con la misma visualización del panel principal (ancho completo) y, debajo, el mapa. */}
          <div className="grid grid-cols-1 items-stretch gap-4">
            <Card
              className="h-full"
              title={vistaMatriz === 'hora' ? 'Matriz de calor por día y hora' : 'Matriz de calor por día y franja horaria'}
              subtitle={`${vigVista ? `Vigencia ${vigVista.etiqueta} (${vigVista.rango})` : 'Todas las vigencias seleccionadas'} · ${formatNumero(registrosVista.length)} casos · clic en una celda para filtrar`}
              descargable="multifecha-matriz"
              icono={ico(Clock)}
              claseTitulo={T}
              actions={
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Vista">
                  {(['hora', 'franja'] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setVistaMatriz(v)} aria-pressed={vistaMatriz === v} className={clsx('rounded-md px-2.5 py-1 text-[12px] font-bold transition', vistaMatriz === v ? 'bg-[#10233f] text-white' : 'text-slate-600 hover:bg-white')}>{v === 'hora' ? 'Por hora' : 'Por franja horaria'}</button>
                  ))}
                </div>
              }
            >
              <div className="space-y-3">
                <TablaMatriz data={datosMatriz} seleccion={null} onCelda={filtrarCelda} />
                <Leyenda data={datosMatriz} />
              </div>
            </Card>
            <Card className="h-full" title="Mapa de calor por delitos" subtitle={`${vigVista ? `Vigencia ${vigVista.etiqueta}` : 'Todas las vigencias'} · densidad Kernel (radio 200 m)${vigVista && escalaComun ? ' · escala común' : ''}`} descargable="multifecha-mapa" icono={ico(IconoMapa)} claseTitulo={T}>
              <div className="h-[600px]">
                <MapaCalorMultifecha key={`${vista}-${escalaComun}`} registros={registrosVista} alto={600} maxFijo={maxKernelComun} />
              </div>
            </Card>
          </div>

          {/* Últimas 4 semanas */}
          <Card title="Últimas 4 semanas por vigencia" subtitle="4 semanas que cierran el último día del periodo de referencia de cada vigencia" descargable="multifecha-4-semanas" icono={ico(CalendarDays)} claseTitulo={T}>
            <UltimasSemanasMultifecha vigencias={vigencias} base={base} fechaMin={meta?.fechaMin ?? null} fechaMax={meta?.fechaMax ?? null} />
          </Card>

          {/* Comportamiento diario (jornadas) */}
          <Card title={`Comportamiento diario por vigencia — ${filters.delito.length ? filters.delito.join(', ') : 'Todos los delitos'}`} subtitle="Casos por día en cada vigencia · rojo: día con más casos · franja amarilla: promedio diario" descargable="multifecha-diario" icono={ico(IconoLinea)} claseTitulo={T}>
            <GraficoMultifechaDiario series={seriesDiarias} />
          </Card>

          {/* Gráficos de la versión anterior (plegados, para no repetir la información de las tablas) */}
          <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-bold text-[#10233f]">
              <ChevronDown size={16} className="transition group-open:rotate-180" /> Gráficos adicionales (tendencia anual/mensual, día de la semana y concentración horaria)
            </summary>
            <div className="space-y-4 border-t border-slate-100 p-4">
              <TendenciaMultifecha registros={union} aniosPeriodos={aniosVig} sumaPorPeriodos={union.length} cantidadPeriodos={vigencias.length} delitos={filters.delito} icono={ico(BarChart3)} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card title="Casos por día de la semana" subtitle="Los 3 días con más casos se resaltan" descargable="multifecha-dia-semana" icono={ico(CalendarDays)} claseTitulo={T}>
                  <GroupedBarChart data={diaSemana} xKey="dia" seriesKeys={['casos']} height={220} resaltarMaximo resaltarTopN={3} colorPorBarra anchoMaximoBarra={30} tamanoEtiqueta={10.5} espaciadoCategoria={0.32} ocultarEjeY abreviarEtiquetas ocultarLeyendaBarras lineaReferencia="tendencia" />
                </Card>
                <Card title="Concentración horaria" subtitle="Las 3 horas con más casos se resaltan" descargable="multifecha-horaria" icono={ico(Clock)} claseTitulo={T}>
                  <GroupedBarChart data={porHora} xKey="hora" seriesKeys={['casos']} height={220} resaltarMaximo resaltarTopN={3} colorPorBarra tamanoEtiqueta={9} ocultarEjeY ocultarLeyendaBarras lineaReferencia="promedio3" />
                </Card>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

