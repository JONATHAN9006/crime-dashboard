import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CalendarDays, Clock, FileText, Target, BarChart3, X, Maximize2, Minimize2, MousePointer2, Filter, Moon, Sun, SearchCheck, Flame,
  Info, Building2, MapPin, ShieldAlert, History, Siren, Eraser, SlidersHorizontal, ArrowUp, ArrowDown, Minus, Percent, Gauge,
} from 'lucide-react';
import clsx from 'clsx';
import { useData } from '../context/DataContext';
import { useHeatmap, calcularNiveles, CORTES_INDICE, type VistaHeatmap, type CeldaHeatmap, type HeatmapResumen, type NivelCalor } from '../hooks/useHeatmap';
import { emptyFilterState, type CrimeRecord, type FilterState } from '../types/crime';
import { Card } from '../components/ui/Card';
import { MultiSelect } from '../components/filters/MultiSelect';
import { formatDecimal, formatNumero } from '../utils/aggregations';
import { maxDe } from '../utils/mathSeguro';

// ──────────────────────────────────────────────────────────────────────────
// MATRIZ DE CALOR — día de la semana × hora (o franja horaria).
//
//  · Datos: los MISMOS registros filtrados del dashboard (filteredRecords).
//    La barra de filtros de esta página escribe en los filtros GLOBALES
//    (Año, Delito, Estación, Zona de atención): no hay un segundo sistema.
//  · Periodo: «Histórico» (todos los años), uno o varios años (comparación).
//    Sin año/mes/fecha elegidos se muestra la vigencia más reciente (como
//    siempre).
//  · Escala: índice de concentración (ver useHeatmap.ts): casos de la celda
//    ÷ casos esperados si el total se repartiera parejo. Comparable entre
//    años y filtros. 0 casos ≠ sin dato (los registros sin día u hora no
//    entran en ninguna celda y se informan aparte).
// ──────────────────────────────────────────────────────────────────────────

const AZUL = '#10233f';
const PETROLEO = '#116762';
export const COLOR_NIVEL: Record<NivelCalor, string> = {
  cero: '#f1f5f9',
  baja: '#d3efdc',
  'media-baja': '#9fdec4',
  media: '#fbe28a',
  alta: '#f7ae66',
  'crítica': '#e5484d',
};
const TEXTO_NIVEL: Record<NivelCalor, string> = {
  cero: '#94a3b8', baja: AZUL, 'media-baja': AZUL, media: AZUL, alta: AZUL, 'crítica': '#ffffff',
};
const NIVELES: { nivel: NivelCalor; titulo: string; regla: string }[] = [
  { nivel: 'baja', titulo: 'Baja', regla: `menos de ${formatDecimal(CORTES_INDICE[0], 2)}×` },
  { nivel: 'media-baja', titulo: 'Media baja', regla: `${formatDecimal(CORTES_INDICE[0], 2)}× a ${formatDecimal(CORTES_INDICE[1], 2)}×` },
  { nivel: 'media', titulo: 'Media', regla: `${formatDecimal(CORTES_INDICE[1], 2)}× a ${formatDecimal(CORTES_INDICE[2], 2)}×` },
  { nivel: 'alta', titulo: 'Alta', regla: `${formatDecimal(CORTES_INDICE[2], 2)}× a ${formatDecimal(CORTES_INDICE[3], 1)}×` },
  { nivel: 'crítica', titulo: 'Crítica', regla: `más de ${formatDecimal(CORTES_INDICE[3], 1)}×` },
];
const NOMBRE_NIVEL: Record<NivelCalor, string> = { cero: 'Sin casos', baja: 'Baja', 'media-baja': 'Media baja', media: 'Media', alta: 'Alta', 'crítica': 'Crítica' };
const RANGO_FRANJA = ['00:00 – 05:59', '06:00 – 11:59', '12:00 – 17:59', '18:00 – 23:59'];

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);
const etiquetaColumna = (vista: VistaHeatmap, label: string) => (vista === 'hora' ? `${label}:00` : label);
const conEmpates = (label: string, empates: string[]) => (empates.length === 0 ? label : empates.length === 1 ? `${label} y ${empates[0]}` : `${label} +${empates.length}`);
const claveCelda = (d: number, c: number) => `${d}-${c}`;
const NO_VALIDO = /^(no reportado|sin dato|pendiente|n\/a)/i;

function IconoCuadro({ children, fondo }: { children: ReactNode; fondo: string }) {
  return <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${fondo}`}>{children}</span>;
}

function Kpi({ titulo, valor, detalle, icono, resaltado = false }: { titulo: string; valor: string; detalle: string; icono: ReactNode; resaltado?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-3.5 rounded-2xl border bg-white px-4 py-3.5', resaltado ? 'border-rose-200' : 'border-slate-200')}>
      {icono}
      <div className="min-w-0">
        <p className="truncate text-[22px] font-extrabold leading-tight" style={{ color: AZUL }} title={valor}>{valor}</p>
        <p className="truncate text-[12px] font-semibold text-slate-600">{titulo}</p>
        <p className="truncate text-[11.5px] text-slate-500" title={detalle}>{detalle}</p>
      </div>
    </div>
  );
}

function IconoFranja({ i }: { i: number }) {
  return i === 0 || i === 3 ? <Moon size={20} className="fill-[#1d4f8f] text-[#1d4f8f]" /> : <Sun size={20} className="text-amber-500" strokeWidth={2.3} />;
}

/**
 * La tabla de la matriz (hora o franja), con totales. Las celdas
 * seleccionadas llevan borde; su fila y su columna quedan resaltadas.
 * (La usa también Multifecha, en versión compacta.)
 */
export function TablaMatriz({ data, seleccion, seleccionadas = [], onCelda, compacta = false }: {
  data: HeatmapResumen;
  seleccion: CeldaHeatmap | null;
  seleccionadas?: { dia: number; col: number }[];
  onCelda: (c: CeldaHeatmap, e?: React.MouseEvent) => void;
  /** Más angosta (para ponerla al lado de otro componente). */
  compacta?: boolean;
}) {
  const esHora = data.vista === 'hora';
  const maxFila = maxDe(data.totalesFila);
  const nivelTotal = calcularNiveles(data.totalesColumna);
  const marcadas = seleccionadas.length > 0 ? seleccionadas : seleccion ? [{ dia: seleccion.diaIndex, col: seleccion.columnaIndex }] : [];
  const esMarcada = (d: number, c: number) => marcadas.some((x) => x.dia === d && x.col === c);
  const filasFoco = new Set(marcadas.map((x) => x.dia));
  const colsFoco = new Set(marcadas.map((x) => x.col));
  const cab = (activo: boolean) => (activo ? 'bg-[#cdeee8] ring-1 ring-[#116762]' : 'bg-slate-100');
  return (
    <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
      <table className={`w-full border-separate ${compacta ? 'text-[11.5px]' : 'text-[13px]'}`} style={{ borderSpacing: esHora ? 2 : 4, minWidth: compacta ? undefined : esHora ? 820 : 640 }}>
        <thead>
          <tr>
            <th className={`sticky left-0 z-[1] rounded-md bg-slate-100 py-2 text-left font-bold ${compacta ? 'px-1.5 text-[11px]' : 'px-3 text-[12.5px]'}`} style={{ color: AZUL }}>Día{compacta ? '' : esHora ? ' / Hora' : ' \\ Franja'}</th>
            {data.columnasLabel.map((label, c) => (
              <th key={c} className={`rounded-md py-2 text-center font-bold tabular-nums ${cab(colsFoco.has(c))} ${esHora ? (compacta ? 'min-w-[17px] text-[9.5px]' : 'min-w-[26px] text-[12px]') : (compacta ? 'min-w-[96px] px-1 text-[11.5px]' : 'min-w-[130px] px-2 text-[12.5px]')}`} style={{ color: AZUL }}>
                {esHora ? label : (
                  <span className="flex items-center justify-center gap-2">
                    <IconoFranja i={c} />
                    <span className="text-left leading-tight">{label}<span className="block whitespace-nowrap text-[11px] font-normal text-slate-500">{RANGO_FRANJA[c]}</span></span>
                  </span>
                )}
              </th>
            ))}
            <th className={`rounded-md bg-[#10233f] py-2 text-center font-bold uppercase text-white ${compacta ? 'px-1 text-[10px]' : 'px-3 text-[11.5px]'}`}>{compacta ? 'Total' : 'Total día'}</th>
          </tr>
        </thead>
        <tbody>
          {data.diasLabel.map((diaLabel, d) => (
            <tr key={diaLabel}>
              <td className={`sticky left-0 z-[1] whitespace-nowrap rounded-md font-semibold ${cab(filasFoco.has(d))} ${compacta ? 'px-1.5' : 'px-3'}`} style={{ color: AZUL }}>{diaLabel}</td>
              {data.columnasLabel.map((_, c) => {
                const celda = data.celdas[d * data.columnasLabel.length + c];
                const sel = esMarcada(d, c);
                const enFoco = !sel && marcadas.length > 0 && (filasFoco.has(d) || colsFoco.has(c));
                return (
                  <td key={c} className="p-0">
                    <button
                      type="button"
                      onClick={(e) => onCelda(celda, e)}
                      aria-pressed={sel}
                      title={`${diaLabel} · ${etiquetaColumna(data.vista, celda.columnaLabel)} — ${formatNumero(celda.valor)} casos (${formatDecimal(celda.porcentaje, 1)} % del total) · concentración ${NOMBRE_NIVEL[celda.nivel].toLowerCase()} (${formatDecimal(celda.indice, 2)}× el promedio)`}
                      className={`flex w-full items-center justify-center rounded-md font-bold tabular-nums transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#116762] ${esHora ? (compacta ? 'h-8 text-[10px]' : 'h-8 text-[12.5px]') : 'h-10 text-[15px]'}`}
                      style={{
                        backgroundColor: COLOR_NIVEL[celda.nivel],
                        color: TEXTO_NIVEL[celda.nivel],
                        // Borde (no sombra): la descarga de imagen dibuja bordes, no sombras.
                        border: sel ? '2.5px solid #10233f' : enFoco ? '1.5px solid rgba(17,103,98,0.45)' : '2.5px solid transparent',
                        fontWeight: celda.valor === 0 ? 500 : undefined,
                      }}
                    >
                      {celda.valor > 0 ? formatNumero(celda.valor) : compacta ? '' : '0'}
                    </button>
                  </td>
                );
              })}
              <td
                className={`rounded-md text-center font-extrabold tabular-nums ${data.totalesFila[d] === maxFila && maxFila > 0 ? 'bg-rose-100 text-rose-700' : 'bg-sky-50'}`}
                style={data.totalesFila[d] === maxFila && maxFila > 0 ? undefined : { color: AZUL }}
              >
                {formatNumero(data.totalesFila[d])}
              </td>
            </tr>
          ))}
          <tr>
            <td className={`sticky left-0 z-[1] whitespace-nowrap rounded-md bg-[#10233f] py-1.5 font-bold uppercase text-white ${compacta ? 'px-1.5 text-[10px]' : 'px-3 text-[11.5px]'}`}>Total{compacta ? '' : esHora ? ' hora' : ' franja'}</td>
            {data.totalesColumna.map((t, c) => {
              // Total por hora/franja: misma escala (índice contra el promedio de las columnas).
              const nivel = nivelTotal(t);
              return (
                <td
                  key={c}
                  title={`Total ${esHora ? 'hora' : 'franja'} ${etiquetaColumna(data.vista, data.columnasLabel[c])}: ${formatNumero(t)} casos — concentración ${NOMBRE_NIVEL[nivel].toLowerCase()}`}
                  className={`rounded-md py-1.5 text-center font-extrabold tabular-nums ${esHora ? (compacta ? 'text-[10px]' : 'text-[12.5px]') : 'text-[14px]'}`}
                  style={{ backgroundColor: COLOR_NIVEL[nivel], color: TEXTO_NIVEL[nivel], border: colsFoco.has(c) ? '2px solid #10233f' : '2px solid transparent' }}
                >
                  {formatNumero(t)}
                </td>
              );
            })}
            <td className="rounded-md bg-[#10233f] py-1.5 text-center font-extrabold tabular-nums text-white">{formatNumero(data.totalGeneral)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Leyenda de los 5 niveles (con lo que pesa cada uno en los datos actuales) y la metodología. */
export function Leyenda({ titulo, data, compacta = false }: { titulo?: string; data?: HeatmapResumen; compacta?: boolean }) {
  const resumen = new Map<NivelCalor, { min: number; max: number; casos: number; celdas: number }>();
  for (const c of data?.celdas ?? []) {
    const v = resumen.get(c.nivel) ?? { min: Infinity, max: 0, casos: 0, celdas: 0 };
    v.min = Math.min(v.min, c.valor); v.max = Math.max(v.max, c.valor); v.casos += c.valor; v.celdas += 1;
    resumen.set(c.nivel, v);
  }
  const total = data?.totalGeneral ?? 0;
  const celdasCero = resumen.get('cero')?.celdas ?? 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 text-[13px] font-bold" style={{ color: AZUL }}>{titulo ?? 'Niveles de concentración (casos por celda)'}</p>
      <div className={clsx('grid gap-x-5 gap-y-2', compacta ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
        {NIVELES.map((n) => {
          const r = resumen.get(n.nivel);
          return (
            <div key={n.nivel} className="flex items-start gap-2">
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-md" style={{ backgroundColor: COLOR_NIVEL[n.nivel], boxShadow: 'inset 0 0 0 1px rgba(16,35,63,0.08)' }} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[12.5px] font-bold" style={{ color: AZUL }}>{n.titulo}</span>
                {data && r ? (
                  <span className="block text-[11px] text-slate-600">{r.min === r.max ? formatNumero(r.min) : `${formatNumero(r.min)} – ${formatNumero(r.max)}`} casos · {formatDecimal(pct(r.casos, total), 1)} %</span>
                ) : data ? <span className="block text-[11px] text-slate-400">Sin celdas</span> : null}
                <span className="block text-[10.5px] text-slate-400">{n.regla} el promedio</span>
              </span>
            </div>
          );
        })}
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold" style={{ backgroundColor: COLOR_NIVEL.cero, color: TEXTO_NIVEL.cero, boxShadow: 'inset 0 0 0 1px rgba(16,35,63,0.08)' }}>0</span>
          <span className="leading-tight">
            <span className="block text-[12.5px] font-bold" style={{ color: AZUL }}>Sin casos</span>
            <span className="block text-[11px] text-slate-500">{data ? `${celdasCero} ${celdasCero === 1 ? 'celda' : 'celdas'} en cero` : 'Celda en cero'}</span>
          </span>
        </div>
      </div>
      <p className="mt-2.5 flex items-start gap-1.5 border-t border-slate-200 pt-2 text-[11px] leading-snug text-slate-500">
        <Info size={14} className="mt-[1px] shrink-0" />
        <span>
          <b>Metodología:</b> cada celda se compara con los casos que tendría si el total se repartiera parejo entre todas las celdas
          {data && data.esperadoPorCelda > 0 ? <> (aquí, <b>{formatDecimal(data.esperadoPorCelda, 1)}</b> casos por celda)</> : null}. 1× = el promedio; 2× = el doble.
          Así un color significa lo mismo en cualquier año, periodo o filtro. Un nivel alto indica dónde se concentran los casos, no su causa.
          {data && data.sinDiaOHora > 0 && <> <b className="text-amber-700">{formatNumero(data.sinDiaOHora)} registros sin día u hora</b> no se incluyen en la matriz (sin dato, distinto de cero casos).</>}
        </span>
      </p>
    </div>
  );
}

// ── Barra de filtros (escribe en los filtros GLOBALES) ─────────────────────
const CAMPOS_PROPIOS: (keyof FilterState)[] = ['anio', 'delito', 'estacion', 'cuadrante', 'diaSemana', 'horaExacta', 'franjaHoraria'];
const NOMBRE_FILTRO: Partial<Record<keyof FilterState, string>> = {
  cai: 'CAI', barrioHecho: 'Barrio', zona: 'Zona', genero: 'Género', armas: 'Arma', modalidad: 'Modalidad', claseSitio: 'Clase de sitio',
  causaLesion: 'Causa', grupoEdad: 'Grupo de edad', turno: 'Turno', diaMes: 'Día del mes', mes: 'Mes', fechaInicial: 'Fecha', fechaFinal: 'Fecha', categoriaOperatividad: 'Operatividad',
};

function BarraFiltros({ anios, anioVigente, opciones }: { anios: string[]; anioVigente: string | null; opciones: { delito: string[]; estacion: string[]; cuadrante: string[] } }) {
  const { filters, setFilters, periodos, setPeriodos } = useData();
  const sel = filters.anio;
  const historico = anios.length > 0 && anios.every((a) => sel.includes(a));
  const otros = Array.from(new Set(
    (Object.keys(filters) as (keyof FilterState)[])
      .filter((k) => !CAMPOS_PROPIOS.includes(k) && (Array.isArray(filters[k]) ? (filters[k] as string[]).length > 0 : !!filters[k]))
      .map((k) => NOMBRE_FILTRO[k] ?? k),
  ));
  if (periodos.length > 0) otros.push(`Multifecha (${periodos.length})`);
  const propiosActivos = CAMPOS_PROPIOS.some((k) => (filters[k] as string[]).length > 0);

  const alternarAnio = (a: string) => setFilters((p) => {
    const actual = historico ? [] : p.anio;
    const siguiente = actual.includes(a) ? actual.filter((x) => x !== a) : [...actual, a];
    return { ...p, anio: siguiente.sort() };
  });
  const limpiar = () => setFilters((p) => ({ ...p, ...Object.fromEntries(CAMPOS_PROPIOS.map((k) => [k, emptyFilterState[k]])) }));
  const quitarOtros = () => {
    setFilters((p) => ({ ...emptyFilterState, ...Object.fromEntries(CAMPOS_PROPIOS.map((k) => [k, p[k]])) }));
    setPeriodos([]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <p className="mb-1 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500"><CalendarDays size={13} /> Periodo</p>
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Periodo">
            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, anio: historico ? [] : [...anios] }))}
              aria-pressed={historico}
              title="Todos los años cargados"
              className={clsx('flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition', historico ? 'bg-[#10233f] text-white shadow-sm' : 'text-slate-600 hover:bg-white')}
            >
              <History size={13} /> Histórico
            </button>
            {anios.map((a) => {
              const activo = !historico && (sel.includes(a) || (sel.length === 0 && a === anioVigente));
              const porDefecto = sel.length === 0 && a === anioVigente;
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => alternarAnio(a)}
                  aria-pressed={activo}
                  title={porDefecto ? 'Vigencia más reciente (predeterminada). Clic en otros años para compararlos.' : 'Clic para agregar o quitar este año (varios años = comparación)'}
                  className={clsx('rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold tabular-nums transition', activo ? (porDefecto ? 'bg-white text-[#10233f] ring-1 ring-[#10233f]' : 'bg-[#10233f] text-white shadow-sm') : 'text-slate-600 hover:bg-white')}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-3" style={{ minWidth: 'min(100%, 520px)' }}>
          <MultiSelect institucional icono={<ShieldAlert size={18} />} tonoIcono="bg-amber-50 text-amber-700" label="Delito" options={opciones.delito} selected={filters.delito} onChange={(v) => setFilters((p) => ({ ...p, delito: v }))} />
          <MultiSelect institucional icono={<Building2 size={18} />} tonoIcono="bg-sky-50 text-sky-700" label="Estación" options={opciones.estacion} selected={filters.estacion} onChange={(v) => setFilters((p) => ({ ...p, estacion: v }))} />
          <MultiSelect institucional icono={<MapPin size={18} />} tonoIcono="bg-sky-50 text-sky-700" label="Zona de atención" options={opciones.cuadrante} selected={filters.cuadrante} onChange={(v) => setFilters((p) => ({ ...p, cuadrante: v }))} />
        </div>
        <button type="button" onClick={limpiar} disabled={!propiosActivos} className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-50">
          <Eraser size={14} /> Limpiar filtros
        </button>
      </div>
      {otros.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
          <SlidersHorizontal size={13} className="text-[#116762]" /> También aplican filtros de otros módulos: <b className="text-[#10233f]">{otros.join(', ')}</b>
          <button type="button" onClick={quitarOtros} className="ml-1 rounded-md border border-slate-200 px-1.5 py-0.5 font-semibold text-[#116762] hover:bg-slate-50">Quitarlos</button>
        </p>
      )}
    </div>
  );
}

// ── Detalle de la selección (panel derecho) ───────────────────────────────
function topDe(registros: CrimeRecord[], campo: (r: CrimeRecord) => string, n: number) {
  const m = new Map<string, number>();
  for (const r of registros) {
    const k = (campo(r) ?? '').trim();
    if (!k || NO_VALIDO.test(k)) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([key, casos]) => ({ key, casos })).sort((a, b) => b.casos - a.casos || a.key.localeCompare(b.key, 'es')).slice(0, n);
}

function BarraTop({ filas, total, color }: { filas: { key: string; casos: number }[]; total: number; color: string }) {
  const max = Math.max(1, ...filas.map((f) => f.casos));
  return (
    <ol className="space-y-1.5">
      {filas.map((f, i) => (
        <li key={f.key} className="grid grid-cols-[20px_minmax(0,1fr)_52px_auto] items-center gap-2 text-[12px]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: color }}>{i + 1}</span>
          <span className="truncate font-semibold" style={{ color: AZUL }} title={f.key}>{f.key}</span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${(f.casos / max) * 100}%`, backgroundColor: color }} /></span>
          <span className="whitespace-nowrap tabular-nums text-slate-600"><b style={{ color: AZUL }}>{formatNumero(f.casos)}</b> · {formatDecimal(pct(f.casos, total), 1)}%</span>
        </li>
      ))}
    </ol>
  );
}

function DetalleSeleccion({ celdas, vista, records, data, hayDelito, esPredeterminada, onLimpiar, onFiltrar, filtroAplicado }: {
  celdas: CeldaHeatmap[]; vista: VistaHeatmap; records: CrimeRecord[]; data: HeatmapResumen; hayDelito: boolean;
  esPredeterminada: boolean; onLimpiar: () => void; onFiltrar: () => void; filtroAplicado: boolean;
}) {
  const enCelda = (r: CrimeRecord, c: CeldaHeatmap) => r.diaSemanaIndex === c.diaIndex && (vista === 'hora' ? r.hora === c.columnaIndex : r.franjaHoraria === c.columna);
  const enSeleccion = useMemo(() => records.filter((r) => celdas.some((c) => enCelda(r, c))), [records, celdas]); // eslint-disable-line react-hooks/exhaustive-deps
  if (celdas.length === 0) return <p className="py-6 text-center text-sm text-slate-400">Sin datos para el conjunto filtrado.</p>;
  const casos = celdas.reduce((a, c) => a + c.valor, 0);
  const una = celdas.length === 1 ? celdas[0] : null;
  const posicion = una ? 1 + data.celdas.filter((c) => c.valor > una.valor).length : null;
  // Comparativo por año de la MISMA celda (cuando el periodo incluye varios años).
  const porAnio = new Map<number, number>();
  for (const r of records) if (r.anio != null) porAnio.set(r.anio, 0);
  for (const r of enSeleccion) if (r.anio != null) porAnio.set(r.anio, (porAnio.get(r.anio) ?? 0) + 1);
  const anios = Array.from(porAnio.entries()).sort((a, b) => a[0] - b[0]);
  const maxAnio = Math.max(1, ...anios.map(([, n]) => n));
  const primero = anios[0]?.[1] ?? 0;
  const ultimo = anios[anios.length - 1]?.[1] ?? 0;
  const dif = ultimo - primero;
  const titulo = una ? `${una.diaLabel} ${vista === 'hora' ? etiquetaColumna(vista, una.columnaLabel) : `· ${una.columnaLabel}`}` : `${celdas.length} celdas seleccionadas`;
  return (
    <div className="space-y-4 text-[13px]" style={{ color: AZUL }}>
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <IconoCuadro fondo="bg-white"><Target size={22} className="text-rose-500" /></IconoCuadro>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-extrabold leading-tight" title={titulo}>{titulo}</p>
              <p className="text-[12px] text-slate-600">{formatNumero(casos)} {casos === 1 ? 'caso' : 'casos'} · {formatDecimal(pct(casos, data.totalGeneral), 1)}% del total filtrado</p>
              {esPredeterminada && <p className="text-[10.5px] text-slate-400">Celda de mayor concentración (predeterminada)</p>}
            </div>
          </div>
          {!esPredeterminada && <button type="button" onClick={onLimpiar} title="Volver a la celda de mayor concentración" className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600"><X size={15} /></button>}
        </div>
      </div>
      {una && (
        <dl className="space-y-1.5 text-[12.5px]">
          {[
            [<CalendarDays size={14} key="d" />, 'Día', una.diaLabel],
            [<Clock size={14} key="h" />, vista === 'hora' ? 'Hora' : 'Franja', vista === 'hora' ? etiquetaColumna(vista, una.columnaLabel) : `${una.columnaLabel} (${RANGO_FRANJA[una.columnaIndex]})`],
            [<FileText size={14} key="c" />, 'Casos', formatNumero(una.valor)],
            [<Percent size={14} key="p" />, 'Porcentaje', `${formatDecimal(una.porcentaje, 1)} % del total`],
            [<Gauge size={14} key="n" />, 'Concentración', `${NOMBRE_NIVEL[una.nivel]} · ${formatDecimal(una.indice, 2)}× el promedio`],
            [<Flame size={14} key="r" />, 'Posición', posicion ? `#${posicion} de ${data.celdas.length}` : '—'],
          ].map(([icono, k, v]) => (
            <div key={k as string} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5 last:border-0">
              <dt className="flex items-center gap-1.5 text-slate-500">{icono}{k}</dt>
              <dd className="text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {anios.length >= 2 && (
        <div>
          <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Comparativo por año (misma celda)</p>
          <div className="space-y-1.5">
            {anios.map(([a, n]) => (
              <div key={a} className="grid grid-cols-[40px_minmax(0,1fr)_42px] items-center gap-2 text-[12.5px]">
                <span className="font-bold tabular-nums">{a}</span>
                <span className="h-3 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#1d6fd6]" style={{ width: `${(n / maxAnio) * 100}%`, opacity: a === anios[anios.length - 1][0] ? 1 : 0.55 }} /></span>
                <span className="text-right font-bold tabular-nums">{formatNumero(n)}</span>
              </div>
            ))}
          </div>
          <p className={clsx('mt-1.5 flex items-center gap-1 text-[12px] font-bold', dif > 0 ? 'text-rose-600' : dif < 0 ? 'text-emerald-600' : 'text-slate-500')}>
            {dif > 0 ? <ArrowUp size={13} /> : dif < 0 ? <ArrowDown size={13} /> : <Minus size={13} />}
            {dif > 0 ? '+' : ''}{formatNumero(dif)} casos {primero > 0 ? `(${dif > 0 ? '+' : ''}${formatDecimal((dif / primero) * 100, 1)} %)` : ''} · {anios[0][0]} → {anios[anios.length - 1][0]}
          </p>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Estaciones con más casos <span className="font-normal normal-case">(en {una ? 'esta celda' : 'la selección'})</span></p>
        {topDe(enSeleccion, (r) => r.estacion, 5).length === 0 ? <p className="text-[12px] text-slate-400">Sin estación reportada.</p> : <BarraTop filas={topDe(enSeleccion, (r) => r.estacion, 5)} total={enSeleccion.length} color="#e5484d" />}
      </div>
      <div>
        <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">{hayDelito ? 'Barrios con más casos' : 'Delitos con más casos'}</p>
        {(() => {
          const filas = hayDelito ? topDe(enSeleccion, (r) => r.barrioHecho, 5) : topDe(enSeleccion, (r) => r.delito, 5);
          return filas.length === 0 ? <p className="text-[12px] text-slate-400">Sin datos.</p> : <BarraTop filas={filas} total={enSeleccion.length} color={PETROLEO} />;
        })()}
      </div>
      {una && (
        <button type="button" onClick={onFiltrar} disabled={una.valor === 0 || filtroAplicado} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-[12.5px] font-semibold hover:bg-slate-50 disabled:opacity-50" style={{ color: AZUL }}>
          <Filter size={14} /> {filtroAplicado ? 'Filtro de día y hora aplicado' : `Usar este día y ${vista === 'hora' ? 'hora' : 'franja'} como filtro`}
        </button>
      )}
    </div>
  );
}

// ── Tarjetas inferiores ───────────────────────────────────────────────────
function LecturaRapida({ data, vista }: { data: HeatmapResumen; vista: VistaHeatmap }) {
  const items = [
    data.celdaMax && { icono: <IconoCuadro fondo="bg-rose-50"><Target size={22} className="text-rose-500" /></IconoCuadro>, titulo: 'Mayor concentración', valor: `${data.celdaMax.diaLabel} · ${etiquetaColumna(vista, data.celdaMax.columnaLabel)}`, detalle: `${formatNumero(data.celdaMax.valor)} casos · ${formatDecimal(data.celdaMax.porcentaje, 1)}% del total` },
    data.columnaMax && { icono: <IconoCuadro fondo="bg-teal-50"><Clock size={22} className="text-[#137a6f]" /></IconoCuadro>, titulo: vista === 'hora' ? 'Hora de mayor volumen' : 'Franja de mayor volumen', valor: conEmpates(etiquetaColumna(vista, data.columnaMax.label), data.columnaMax.empates.map((e) => etiquetaColumna(vista, e))), detalle: `${formatNumero(data.columnaMax.casos)} casos · ${formatDecimal(pct(data.columnaMax.casos, data.totalGeneral), 1)}% del total` },
    data.diaMax && { icono: <IconoCuadro fondo="bg-sky-50"><CalendarDays size={22} className="text-[#1d4f8f]" /></IconoCuadro>, titulo: 'Día de mayor volumen', valor: conEmpates(data.diaMax.label, data.diaMax.empates), detalle: `${formatNumero(data.diaMax.casos)} casos · ${formatDecimal(pct(data.diaMax.casos, data.totalGeneral), 1)}% del total` },
  ].filter(Boolean) as { icono: ReactNode; titulo: string; valor: string; detalle: string }[];
  return (
    <Card title="Lectura rápida del comportamiento" descargable="lectura-rapida-matriz" icono={<SearchCheck size={22} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
      {items.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {items.map((it) => (
            <div key={it.titulo} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
              {it.icono}
              <div className="min-w-0">
                <p className="text-[11.5px] text-slate-500">{it.titulo}</p>
                <p className="truncate text-[16px] font-extrabold leading-tight" style={{ color: AZUL }} title={it.valor}>{it.valor}</p>
                <p className="truncate text-[11.5px] text-slate-500">{it.detalle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Estación, zona de atención y delitos con más casos; clic = filtrar (otro clic lo quita). */
function FocosComportamiento({ records, filters, onFiltrar }: {
  records: CrimeRecord[];
  filters: FilterState;
  onFiltrar: (campo: 'estacion' | 'cuadrante' | 'delito', valor: string) => void;
}) {
  const total = records.length;
  const estacion = topDe(records, (r) => r.estacion, 1)[0];
  const zona = topDe(records, (r) => r.cuadrante, 1)[0];
  const delitos = topDe(records, (r) => r.delito, 3);
  const marcado = (campo: 'estacion' | 'cuadrante' | 'delito', v: string) => (filters[campo] as string[]).includes(v);
  const bloque = (campo: 'estacion' | 'cuadrante', titulo: string, item: { key: string; casos: number } | undefined, icono: ReactNode) => (
    <button
      type="button"
      disabled={!item}
      onClick={() => item && onFiltrar(campo, item.key)}
      title={item ? (marcado(campo, item.key) ? 'Quitar este filtro' : 'Filtrar por este valor (otro clic lo quita)') : undefined}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-slate-50 ${item && marcado(campo, item.key) ? 'border-[#116762] bg-[#e3f2ef]' : 'border-slate-100'}`}
    >
      {icono}
      <div className="min-w-0">
        <p className="text-[11.5px] text-slate-500">{titulo}</p>
        <p className="truncate text-[16px] font-extrabold leading-tight" style={{ color: AZUL }}>{item?.key ?? '—'}</p>
        <p className="text-[11.5px] text-slate-500">{item ? `${formatNumero(item.casos)} casos · ${formatDecimal(pct(item.casos, total), 1)}% del total` : 'Sin datos'}</p>
      </div>
    </button>
  );
  return (
    <Card title="Focos del comportamiento" subtitle="Estación, zona de atención y delitos con más casos dentro del conjunto filtrado. Clic para filtrar." descargable="focos-comportamiento" icono={<ShieldAlert size={22} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {bloque('estacion', 'Estación más afectada', estacion, <IconoCuadro fondo="bg-teal-50"><Building2 size={22} className="text-[#137a6f]" /></IconoCuadro>)}
        {bloque('cuadrante', 'Zona de atención más afectada', zona, <IconoCuadro fondo="bg-sky-50"><MapPin size={22} className="text-[#1d4f8f]" /></IconoCuadro>)}
        <div className="rounded-xl border border-slate-100 px-3 py-2.5 sm:col-span-2">
          <p className="mb-1.5 text-[11.5px] text-slate-500">Delitos con más casos</p>
          {delitos.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
            <ul className="space-y-1.5">
              {delitos.map((d, i) => (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => onFiltrar('delito', d.key)}
                    title={marcado('delito', d.key) ? 'Quitar este filtro' : 'Filtrar por este delito (otro clic lo quita)'}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] hover:bg-slate-50 ${marcado('delito', d.key) ? 'border-[#116762] bg-[#e3f2ef]' : 'border-slate-100'}`}
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#116762] text-[11px] font-bold text-white">{i + 1}</span>
                    <span className="flex-1 truncate font-semibold" style={{ color: AZUL }}>{d.key}</span>
                    <span className="whitespace-nowrap font-bold tabular-nums" style={{ color: AZUL }}>{formatNumero(d.casos)}</span>
                    <span className="w-12 text-right tabular-nums text-slate-500">{formatDecimal(pct(d.casos, total), 1)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function MomentosCriticos({ data, vista, onElegir }: { data: HeatmapResumen; vista: VistaHeatmap; onElegir: (c: CeldaHeatmap) => void }) {
  return (
    <Card title="Momentos críticos" subtitle="Las celdas con más casos del conjunto filtrado. Clic para ver su detalle." descargable="momentos-criticos" icono={<Siren size={22} className="text-rose-500" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
      {data.momentosCriticos.length === 0 ? (
        <p className="text-sm text-slate-400">No hay suficientes datos para identificar momentos críticos.</p>
      ) : (
        <ol className="space-y-1.5">
          {data.momentosCriticos.map((c, i) => (
            <li key={`${c.dia}-${c.columna}`}>
              <button type="button" onClick={() => onElegir(c)} className="flex w-full items-center gap-2.5 rounded-lg border border-rose-100 bg-rose-50/40 px-2.5 py-2 text-left text-[13px] hover:bg-rose-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[12px] font-bold text-white">{i + 1}</span>
                <span className="flex-1 truncate font-semibold" style={{ color: AZUL }}>{c.diaLabel} · {etiquetaColumna(vista, c.columnaLabel)}</span>
                <span className="whitespace-nowrap font-bold tabular-nums" style={{ color: AZUL }}>{formatNumero(c.valor)} casos</span>
                <span className="w-11 text-right tabular-nums text-slate-500">{formatDecimal(c.porcentaje, 1)}%</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── Página ────────────────────────────────────────────────────────────────
export function MatrizCalor() {
  const { records, filteredRecords, filters, setFilters, meta, drillDown } = useData();
  const [vista, setVista] = useState<VistaHeatmap>('hora');
  const [ampliada, setAmpliada] = useState(false);
  // Celdas seleccionadas: clic = una celda; Ctrl/⌘/Mayús + clic = agregar o quitar.
  const [seleccion, setSeleccion] = useState<{ dia: number; col: number }[]>([]);
  useEffect(() => { setSeleccion([]); }, [vista]);

  // Años disponibles (detectados de los datos, se actualizan solos).
  const anios = useMemo(() => Array.from(new Set(records.map((r) => r.anio).filter((a): a is number => a != null))).sort((a, b) => b - a).map(String), [records]);

  // Sin año, mes ni fecha elegidos: solo la vigencia más reciente (como siempre).
  const hayFiltroTemporal = filters.anio.length > 0 || filters.mes.length > 0 || !!filters.fechaInicial || !!filters.fechaFinal;
  const { recordsParaMatriz, anioVigente } = useMemo(() => {
    const conFecha = filteredRecords.filter((r) => r.fecha);
    const maxTs = meta?.fechaMaxParametro ? meta.fechaMaxParametro.getTime() : conFecha.length ? maxDe(conFecha.map((r) => r.fecha!.getTime())) : NaN;
    const anioRef = Number.isFinite(maxTs) ? new Date(maxTs).getFullYear() : null;
    if (hayFiltroTemporal || conFecha.length === 0 || anioRef == null) return { recordsParaMatriz: filteredRecords, anioVigente: anioRef != null ? String(anioRef) : anios[0] ?? null };
    return { recordsParaMatriz: conFecha.filter((r) => r.fecha!.getFullYear() === anioRef), anioVigente: String(anioRef) };
  }, [filteredRecords, hayFiltroTemporal, meta?.fechaMaxParametro, anios]);

  const opciones = useMemo(() => {
    const unicos = (g: (r: CrimeRecord) => string) => Array.from(new Set(records.map(g).filter((v) => v && !NO_VALIDO.test(v)))).sort((a, b) => a.localeCompare(b, 'es'));
    return { delito: unicos((r) => r.delito), estacion: unicos((r) => r.estacion), cuadrante: unicos((r) => r.cuadrante) };
  }, [records]);

  const data = useHeatmap(recordsParaMatriz, vista);
  const esHora = vista === 'hora';

  const seleccionadas = seleccion.length > 0 ? seleccion : data.celdaMax ? [{ dia: data.celdaMax.diaIndex, col: data.celdaMax.columnaIndex }] : [];
  const celdasSel = seleccionadas
    .map((x) => data.celdas.find((c) => c.diaIndex === x.dia && c.columnaIndex === x.col))
    .filter((c): c is CeldaHeatmap => !!c);

  function clicCelda(celda: CeldaHeatmap, e?: React.MouseEvent) {
    const k = claveCelda(celda.diaIndex, celda.columnaIndex);
    const multiple = !!e && (e.ctrlKey || e.metaKey || e.shiftKey);
    setSeleccion((prev) => {
      if (multiple) {
        const base = prev.length > 0 ? prev : seleccionadas;
        return base.some((x) => claveCelda(x.dia, x.col) === k) ? base.filter((x) => claveCelda(x.dia, x.col) !== k) : [...base, { dia: celda.diaIndex, col: celda.columnaIndex }];
      }
      return prev.length === 1 && claveCelda(prev[0].dia, prev[0].col) === k ? [] : [{ dia: celda.diaIndex, col: celda.columnaIndex }];
    });
  }

  const filtroActivoPorClic = filters.diaSemana.length > 0 || filters.horaExacta.length > 0 || filters.franjaHoraria.length > 0;
  function aplicarFiltroCelda(celda: CeldaHeatmap) {
    if (celda.valor === 0) return;
    setFilters((prev) => ({ ...prev, diaSemana: [celda.dia], horaExacta: esHora ? [celda.columna] : [], franjaHoraria: esHora ? [] : [celda.columna] }));
  }
  const quitarFiltroCelda = () => setFilters((prev) => ({ ...prev, diaSemana: [], horaExacta: [], franjaHoraria: [] }));

  const totalFiltrado = recordsParaMatriz.length;
  const periodoTexto = filters.anio.length === 0
    ? (hayFiltroTemporal ? 'Periodo filtrado' : `Vigencia ${anioVigente ?? ''}`)
    : anios.length > 0 && anios.every((a) => filters.anio.includes(a)) ? `Histórico ${anios[anios.length - 1]}–${anios[0]}` : filters.anio.join(' · ');

  const tarjetaMatriz = (
    <Card
      title={esHora ? 'Matriz de calor por día y hora' : 'Matriz de calor por día y franja horaria'}
      subtitle={`Cada celda: casos de un día de la semana (filas) en ${esHora ? 'una hora' : 'una franja horaria'} (columnas) · ${periodoTexto}`}
      descargable="matriz-calor"
      icono={<BarChart3 size={24} className="text-[#137a6f]" strokeWidth={2.4} />}
      claseTitulo="text-[16px] font-bold text-[#10233f]"
      actions={
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Vista">
            {(['hora', 'franja'] as VistaHeatmap[]).map((v) => (
              <button key={v} type="button" onClick={() => setVista(v)} aria-pressed={vista === v} className={clsx('rounded-md px-2.5 py-1 text-[12px] font-bold transition', vista === v ? 'bg-[#10233f] text-white' : 'text-slate-600 hover:bg-white')}>
                {v === 'hora' ? 'Por hora' : 'Por franja horaria'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAmpliada((v) => !v)} title={ampliada ? 'Cerrar vista ampliada' : 'Ver en pantalla completa'} className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-[#116762] hover:text-[#116762]">
            {ampliada ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      }
    >
      {data.totalGeneral === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 text-center">
          <CalendarDays size={26} className="text-slate-300" />
          <p className="text-[13.5px] font-semibold text-slate-500">No hay casos para los filtros seleccionados</p>
          <p className="text-[12px] text-slate-400">Cambia el periodo o limpia los filtros.</p>
        </div>
      ) : (
        <>
          <TablaMatriz data={data} seleccion={null} seleccionadas={seleccionadas} onCelda={clicCelda} />
          <p className="mt-1.5 flex items-center gap-1 text-[11.5px] text-slate-500"><MousePointer2 size={12} /> Clic en una celda para ver su detalle · Ctrl + clic para sumar varias celdas.</p>
          <div className="mt-3"><Leyenda data={data} /></div>
        </>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconoCuadro fondo="bg-[#116762]"><CalendarDays size={24} className="text-white" /></IconoCuadro>
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight" style={{ color: AZUL }}>Matriz de Calor</h1>
            <p className="text-[13.5px] text-slate-500">Día de la semana × {esHora ? 'hora' : 'franja horaria'} · identifica los momentos críticos según los casos filtrados.</p>
          </div>
        </div>
        {filtroActivoPorClic && (
          <button type="button" onClick={quitarFiltroCelda} className="flex items-center gap-1.5 rounded-lg border border-[#10233f]/30 bg-[#10233f]/5 px-3 py-1.5 text-xs font-semibold text-[#10233f] hover:bg-[#10233f]/10">
            <X size={13} /> Quitar filtro de día/hora aplicado
          </button>
        )}
      </div>

      <BarraFiltros anios={anios} anioVigente={anioVigente} opciones={opciones} />

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Casos considerados" valor={formatNumero(data.totalGeneral)} detalle={`${formatDecimal(pct(data.totalGeneral, totalFiltrado), 1)}% del total filtrado${data.sinDiaOHora > 0 ? ` · ${formatNumero(data.sinDiaOHora)} sin día u hora` : ''}`} icono={<IconoCuadro fondo="bg-teal-50"><FileText size={22} className="text-[#137a6f]" /></IconoCuadro>} />
        <Kpi titulo="Día de mayor concentración" valor={data.diaMax ? conEmpates(data.diaMax.label, data.diaMax.empates) : '—'} detalle={data.diaMax ? `${formatNumero(data.diaMax.casos)} casos · ${formatDecimal(pct(data.diaMax.casos, data.totalGeneral), 1)}% del total${data.diaMax.empates.length ? ' (empate)' : ''}` : 'Sin datos'} icono={<IconoCuadro fondo="bg-sky-50"><CalendarDays size={22} className="text-[#1d4f8f]" /></IconoCuadro>} />
        <Kpi titulo={esHora ? 'Hora de mayor volumen' : 'Franja de mayor volumen'} valor={data.columnaMax ? conEmpates(etiquetaColumna(vista, data.columnaMax.label), data.columnaMax.empates.map((e) => etiquetaColumna(vista, e))) : '—'} detalle={data.columnaMax ? `${formatNumero(data.columnaMax.casos)} casos · ${formatDecimal(pct(data.columnaMax.casos, data.totalGeneral), 1)}% del total${data.columnaMax.empates.length ? ' (empate)' : ''}` : 'Sin datos'} icono={<IconoCuadro fondo="bg-indigo-50"><Clock size={22} className="text-[#1d6fd6]" /></IconoCuadro>} />
        <Kpi resaltado titulo="Celda de mayor concentración" valor={data.celdaMax ? `${data.celdaMax.diaLabel} ${esHora ? etiquetaColumna(vista, data.celdaMax.columnaLabel) : `· ${data.celdaMax.columnaLabel}`}` : '—'} detalle={data.celdaMax ? `${formatNumero(data.celdaMax.valor)} casos · ${formatDecimal(data.celdaMax.porcentaje, 1)}% del total${data.celdasEnMaximo > 1 ? ` · empate con ${data.celdasEnMaximo - 1} más` : ''}` : 'Sin datos'} icono={<IconoCuadro fondo="bg-rose-50"><Target size={22} className="text-rose-500" /></IconoCuadro>} />
      </div>

      {/* Matriz + detalle */}
      <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">{tarjetaMatriz}</div>
        <Card title="Detalle de selección" descargable="detalle-seleccion-matriz" icono={<MousePointer2 size={22} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
          <DetalleSeleccion
            celdas={celdasSel}
            vista={vista}
            records={recordsParaMatriz}
            data={data}
            hayDelito={filters.delito.length > 0}
            esPredeterminada={seleccion.length === 0}
            onLimpiar={() => setSeleccion([])}
            onFiltrar={() => celdasSel[0] && aplicarFiltroCelda(celdasSel[0])}
            filtroAplicado={filtroActivoPorClic}
          />
        </Card>
      </div>

      {/* Lectura rápida · Focos · Momentos críticos */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <LecturaRapida data={data} vista={vista} />
        <FocosComportamiento records={recordsParaMatriz} filters={filters} onFiltrar={(campo, valor) => drillDown(campo, valor)} />
        <MomentosCriticos data={data} vista={vista} onElegir={(c) => setSeleccion([{ dia: c.diaIndex, col: c.columnaIndex }])} />
      </div>

      {/* Vista ampliada de la matriz */}
      {ampliada && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-900/40 p-3 sm:p-6" onClick={() => setAmpliada(false)}>
          <div className="mx-auto max-w-[1700px]" onClick={(e) => e.stopPropagation()}>
            {tarjetaMatriz}
          </div>
        </div>
      )}
    </div>
  );
}
