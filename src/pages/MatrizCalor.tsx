import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Clock, FileText, Target, BarChart3, X, Maximize2, Minimize2, MousePointer2, Filter, Moon, Sun, SearchCheck, Flame, AlertCircle, Info, Building2, MapPin, ShieldAlert } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useHeatmap, calcularNiveles, type VistaHeatmap, type CeldaHeatmap, type HeatmapResumen } from '../hooks/useHeatmap';
import type { CrimeRecord, FilterState } from '../types/crime';
import { Card } from '../components/ui/Card';
import { formatDecimal, formatNumero } from '../utils/aggregations';
import { maxDe } from '../utils/mathSeguro';

// ──────────────────────────────────────────────────────────────────────────
// Matriz de Calor — SOLO cambió la presentación (según las dos imágenes de
// referencia: "Por hora" y "Por franja horaria"). Los cálculos son los
// mismos de siempre (useHeatmap): misma vigencia por defecto, mismos
// niveles por cuantiles, mismos totales, mismo clic para filtrar.
// ──────────────────────────────────────────────────────────────────────────

const AZUL = '#10233f';
const COLOR_NIVEL: Record<CeldaHeatmap['nivel'], string> = {
  'sin datos': '#eef2f0',
  baja: '#bfe9cf',
  media: '#fbe27a',
  alta: '#f8b061',
  'crítica': '#ec4a4f',
};
const NIVELES_LEYENDA: { nivel: CeldaHeatmap['nivel']; titulo: string; texto: string; color: string }[] = [
  { nivel: 'baja', titulo: 'Concentración baja', texto: 'Menor concentración relativa', color: '#1fa47a' },
  { nivel: 'media', titulo: 'Concentración media', texto: 'Concentración moderada', color: '#f6cf3a' },
  { nivel: 'alta', titulo: 'Concentración alta', texto: 'Alta concentración relativa', color: '#f59a3c' },
  { nivel: 'crítica', titulo: 'Concentración crítica', texto: 'Máxima concentración relativa', color: '#e5383b' },
];
const RANGO_FRANJA = ['00:00 – 05:59', '06:00 – 11:59', '12:00 – 17:59', '18:00 – 23:59'];

const pct = (n: number, total: number) => (total > 0 ? (n / total) * 100 : 0);
const etiquetaColumna = (vista: VistaHeatmap, label: string) => (vista === 'hora' ? `${label}:00` : label);

function IconoCuadro({ children, fondo }: { children: ReactNode; fondo: string }) {
  return <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${fondo}`}>{children}</span>;
}

function Kpi({ titulo, valor, detalle, icono }: { titulo: string; valor: string; detalle: string; icono: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      {icono}
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <p className="truncate text-[24px] font-bold leading-tight" style={{ color: AZUL }}>{valor}</p>
        <p className="truncate text-[13px] text-slate-500">{detalle}</p>
      </div>
    </div>
  );
}

function IconoFranja({ i }: { i: number }) {
  return i === 0 || i === 3 ? <Moon size={22} className="fill-[#1d4f8f] text-[#1d4f8f]" /> : <Sun size={22} className="text-amber-500" strokeWidth={2.3} />;
}

/** La tabla de la matriz (hora o franja), con totales y celdas resaltadas. */
function TablaMatriz({ data, seleccion, onCelda }: { data: HeatmapResumen; seleccion: CeldaHeatmap | null; onCelda: (c: CeldaHeatmap) => void }) {
  const esHora = data.vista === 'hora';
  const maxFila = maxDe(data.totalesFila);
  const maxCol = maxDe(data.totalesColumna);
  const nivelTotal = calcularNiveles(data.totalesColumna);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-[13px]" style={{ borderSpacing: esHora ? 3 : 4 }}>
        <thead>
          <tr>
            <th className="rounded-md bg-slate-100 px-3 py-2 text-left text-[12.5px] font-semibold" style={{ color: AZUL }}>Día {esHora ? '/ Hora' : '\\ Franja'}</th>
            {data.columnasLabel.map((label, c) => (
              <th key={c} className={`rounded-md bg-slate-100 py-2 text-center font-semibold ${esHora ? 'min-w-[38px] text-[12px]' : 'min-w-[130px] px-2 text-[12.5px]'}`} style={{ color: AZUL }}>
                {esHora ? label : (
                  <span className="flex items-center justify-center gap-2">
                    <IconoFranja i={c} />
                    <span className="text-left leading-tight">{label}<span className="block whitespace-nowrap text-[11px] font-normal text-slate-500">{RANGO_FRANJA[c]}</span></span>
                  </span>
                )}
              </th>
            ))}
            <th className="rounded-md bg-slate-100 px-3 py-2 text-center text-[12px] font-semibold uppercase" style={{ color: AZUL }}>Total día</th>
          </tr>
        </thead>
        <tbody>
          {data.diasLabel.map((diaLabel, d) => (
            <tr key={diaLabel}>
              <td className="whitespace-nowrap rounded-md bg-slate-50 px-3 font-semibold" style={{ color: AZUL }}>{diaLabel}</td>
              {data.columnasLabel.map((_, c) => {
                const celda = data.celdas[d * data.columnasLabel.length + c];
                const esSel = seleccion && celda.diaIndex === seleccion.diaIndex && celda.columnaIndex === seleccion.columnaIndex;
                return (
                  <td key={c} className="p-0">
                    <button
                      type="button"
                      onClick={() => onCelda(celda)}
                      title={`${diaLabel} · ${etiquetaColumna(data.vista, celda.columnaLabel)} — ${formatNumero(celda.valor)} casos (${formatDecimal(celda.porcentaje, 1)} % del total)`}
                      className={`flex w-full items-center justify-center rounded-md font-semibold transition hover:brightness-95 ${esHora ? 'h-7 text-[13px]' : 'h-9 text-[14px]'} ${celda.nivel === 'crítica' ? 'text-white' : 'text-slate-800'}`}
                      style={{
                        backgroundColor: COLOR_NIVEL[celda.nivel],
                        // Recuadro rojo: el momento seleccionado (por defecto, la celda
                        // máxima). Con BORDE, no con sombra — la descarga de imagen
                        // (html2canvas) no dibuja sombras, el borde sí.
                        border: esSel ? '2.5px solid #dc2626' : '2.5px solid transparent',
                      }}
                    >
                      {celda.valor > 0 ? formatNumero(celda.valor) : ''}
                    </button>
                  </td>
                );
              })}
              <td
                className={`rounded-md text-center font-bold ${data.totalesFila[d] === maxFila && maxFila > 0 ? (esHora ? 'bg-rose-100' : 'border-2 border-[#2aa9b8] bg-sky-50') : 'border-2 border-transparent bg-sky-50/60'}`}
                style={{ color: AZUL }}
              >
                {formatNumero(data.totalesFila[d])}
              </td>
            </tr>
          ))}
          <tr>
            <td className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5 text-[12px] font-bold uppercase" style={{ color: AZUL }}>Total {esHora ? 'hora' : 'franja'}</td>
            {data.totalesColumna.map((t, c) => {
              // Total por hora/franja pintado con la MISMA escala de
              // concentración de las celdas (cuantiles de los totales).
              const nivel = nivelTotal(t);
              return (
                <td
                  key={c}
                  title={`Total ${esHora ? 'hora' : 'franja'} ${etiquetaColumna(data.vista, data.columnasLabel[c])}: ${formatNumero(t)} casos — concentración ${nivel}`}
                  className={`rounded-md py-1.5 text-center font-bold ${esHora ? 'text-[12.5px]' : 'text-[14px]'}`}
                  style={{
                    backgroundColor: COLOR_NIVEL[nivel],
                    color: nivel === 'crítica' ? '#ffffff' : AZUL,
                    border: t === maxCol && maxCol > 0 ? '2.5px solid #10233f' : '2.5px solid transparent',
                  }}
                >
                  {formatNumero(t)}
                </td>
              );
            })}
            <td className="rounded-md bg-slate-100 py-1.5 text-center font-bold" style={{ color: AZUL }}>{formatNumero(data.totalGeneral)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Leyenda({ titulo }: { titulo?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      {titulo && <p className="mb-2 text-[13px] font-semibold" style={{ color: AZUL }}>{titulo}</p>}
      <div className="flex flex-wrap items-center gap-x-9 gap-y-2">
        {NIVELES_LEYENDA.map((n) => (
          <div key={n.nivel} className="flex items-center gap-2.5">
            <span className="h-5 w-5 shrink-0 rounded" style={{ backgroundColor: n.color }} />
            <span className="leading-tight">
              <span className="block whitespace-nowrap text-[12.5px] font-semibold" style={{ color: AZUL }}>{n.titulo}</span>
              <span className="block whitespace-nowrap text-[11.5px] text-slate-500">{n.texto}</span>
            </span>
          </div>
        ))}
        <p className="flex flex-1 items-start gap-1.5 border-l border-slate-200 pl-4 text-[11px] leading-snug text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          Los niveles representan concentración relativa dentro del periodo seleccionado. La escala de color se recalcula automáticamente según los datos filtrados.
        </p>
      </div>
    </div>
  );
}

function LecturaRapida({ data, vista }: { data: HeatmapResumen; vista: VistaHeatmap }) {
  const items = [
    data.celdaMax && { icono: <IconoCuadro fondo="bg-rose-50"><Target size={24} className="text-rose-500" /></IconoCuadro>, titulo: 'Mayor concentración', valor: `${data.celdaMax.diaLabel} · ${etiquetaColumna(vista, data.celdaMax.columnaLabel)}`, detalle: `${formatNumero(data.celdaMax.valor)} casos · ${formatDecimal(data.celdaMax.porcentaje, 1)}% del total` },
    data.columnaMax && { icono: <IconoCuadro fondo="bg-teal-50"><Clock size={24} className="text-[#137a6f]" /></IconoCuadro>, titulo: vista === 'hora' ? 'Hora de mayor volumen' : 'Franja de mayor volumen', valor: etiquetaColumna(vista, data.columnaMax.label), detalle: `${formatNumero(data.columnaMax.casos)} casos · ${formatDecimal(pct(data.columnaMax.casos, data.totalGeneral), 1)}% del total` },
    data.diaMax && { icono: <IconoCuadro fondo="bg-sky-50"><CalendarDays size={24} className="text-[#1d4f8f]" /></IconoCuadro>, titulo: 'Día de mayor volumen', valor: data.diaMax.label, detalle: `${formatNumero(data.diaMax.casos)} casos · ${formatDecimal(pct(data.diaMax.casos, data.totalGeneral), 1)}% del total` },
  ].filter(Boolean) as { icono: ReactNode; titulo: string; valor: string; detalle: string }[];
  return (
    <Card title="Lectura rápida del comportamiento" descargable="lectura-rapida-matriz" icono={<SearchCheck size={24} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.titulo} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
            {it.icono}
            <div className="min-w-0">
              <p className="text-[12.5px] text-slate-500">{it.titulo}</p>
              <p className="truncate text-[18px] font-bold leading-tight" style={{ color: AZUL }}>{it.valor}</p>
              <p className="text-[12.5px] text-slate-500">{it.detalle}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * "Focos del comportamiento": misma lectura que "Lectura rápida" / "Momentos
 * críticos", pero por territorio y delito — estación y zona de atención más
 * afectadas y los 3 delitos con más casos, sobre los MISMOS registros de la
 * matriz. Clic = filtrar por ese valor (otro clic lo quita).
 */
function FocosComportamiento({ records, filters, onFiltrar }: {
  records: CrimeRecord[];
  filters: FilterState;
  onFiltrar: (campo: 'estacion' | 'cuadrante' | 'delito', valor: string) => void;
}) {
  const total = records.length;
  const ranking = (getter: (r: CrimeRecord) => string) => {
    const m = new Map<string, number>();
    for (const r of records) {
      const k = (getter(r) ?? '').trim();
      if (!k || /^(NO REPORTADO|SIN DATO|N\/A)$/i.test(k)) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([key, casos]) => ({ key, casos })).sort((a, b) => b.casos - a.casos);
  };
  const estacion = ranking((r) => r.estacion)[0];
  const zona = ranking((r) => r.cuadrante)[0];
  const delitos = ranking((r) => r.delito).slice(0, 3);
  const detalle = (casos: number) => `${formatNumero(casos)} casos · ${formatDecimal(pct(casos, total), 1)}% del total`;
  const marcado = (campo: 'estacion' | 'cuadrante' | 'delito', v: string) => (filters[campo] as string[]).includes(v);
  const bloque = (campo: 'estacion' | 'cuadrante', titulo: string, item: { key: string; casos: number } | undefined, icono: ReactNode) => (
    <button
      type="button"
      disabled={!item}
      onClick={() => item && onFiltrar(campo, item.key)}
      title={item ? (marcado(campo, item.key) ? 'Quitar este filtro' : 'Filtrar por este valor (otro clic lo quita)') : undefined}
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:bg-slate-50 ${item && marcado(campo, item.key) ? 'border-[#116762] bg-[#e3f2ef]' : 'border-slate-100'}`}
    >
      {icono}
      <div className="min-w-0">
        <p className="text-[12.5px] text-slate-500">{titulo}</p>
        <p className="truncate text-[18px] font-bold leading-tight" style={{ color: AZUL }}>{item?.key ?? '—'}</p>
        <p className="text-[12.5px] text-slate-500">{item ? detalle(item.casos) : 'Sin datos'}</p>
      </div>
    </button>
  );
  return (
    <Card title="Focos del comportamiento" subtitle="Estación, zona de atención y delitos con más casos dentro del mismo conjunto de la matriz. Clic para filtrar; otro clic lo quita." descargable="focos-comportamiento" icono={<ShieldAlert size={24} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr]">
        {bloque('estacion', 'Estación más afectada', estacion, <IconoCuadro fondo="bg-teal-50"><Building2 size={24} className="text-[#137a6f]" /></IconoCuadro>)}
        {bloque('cuadrante', 'Zona de atención más afectada', zona, <IconoCuadro fondo="bg-sky-50"><MapPin size={24} className="text-[#1d4f8f]" /></IconoCuadro>)}
        <div className="rounded-lg border border-slate-100 px-3 py-2.5 md:col-span-2 xl:col-span-1">
          <p className="mb-1.5 text-[12.5px] text-slate-500">3 delitos más afectados</p>
          {delitos.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
            <ul className="space-y-1.5">
              {delitos.map((d, i) => (
                <li key={d.key}>
                  <button
                    type="button"
                    onClick={() => onFiltrar('delito', d.key)}
                    title={marcado('delito', d.key) ? 'Quitar este filtro' : 'Filtrar por este delito (otro clic lo quita)'}
                    className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-[13px] hover:bg-slate-50 ${marcado('delito', d.key) ? 'border-[#116762] bg-[#e3f2ef]' : 'border-rose-100 bg-rose-50/50'}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[12px] font-bold text-white">{i + 1}</span>
                    <span className="flex-1 truncate font-semibold" style={{ color: AZUL }}>{d.key}</span>
                    <span className="whitespace-nowrap font-bold" style={{ color: AZUL }}>{formatNumero(d.casos)} casos</span>
                    <span className="w-12 text-right text-slate-500">{formatDecimal(pct(d.casos, total), 1)}%</span>
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

export function MatrizCalor() {
  const { filteredRecords, filters, setFilters, meta, drillDown } = useData();
  const [vista, setVista] = useState<VistaHeatmap>('hora');
  const [ampliada, setAmpliada] = useState(false);
  const [seleccionManual, setSeleccionManual] = useState<{ dia: number; col: number; vista: VistaHeatmap } | null>(null);

  // (Sin cambios) Sin filtro de año/mes/fecha, solo la vigencia más reciente.
  const hayFiltroTemporal = filters.anio.length > 0 || filters.mes.length > 0 || !!filters.fechaInicial || !!filters.fechaFinal;
  const recordsParaMatriz = useMemo(() => {
    if (hayFiltroTemporal) return filteredRecords;
    const conFecha = filteredRecords.filter((r) => r.fecha);
    if (conFecha.length === 0) return filteredRecords;
    const maxTs = meta?.fechaMaxParametro
      ? meta.fechaMaxParametro.getTime()
      : maxDe(conFecha.map((r) => r.fecha!.getTime()));
    const anioReferencia = new Date(maxTs).getFullYear();
    return conFecha.filter((r) => r.fecha!.getFullYear() === anioReferencia);
  }, [filteredRecords, hayFiltroTemporal, meta?.fechaMaxParametro]);

  const data = useHeatmap(recordsParaMatriz, vista);

  const filtroActivoPorClic = filters.diaSemana.length > 0 || filters.horaExacta.length > 0 || filters.franjaHoraria.length > 0;

  // (Sin cambios) aplicar como filtro el día y la hora/franja de una celda.
  function aplicarFiltroCelda(celda: CeldaHeatmap) {
    if (celda.valor === 0) return;
    setFilters((prev) => ({
      ...prev,
      diaSemana: [celda.dia],
      horaExacta: vista === 'hora' ? [celda.columna] : [],
      franjaHoraria: vista === 'franja' ? [celda.columna] : [],
    }));
  }
  function quitarFiltroCelda() {
    setFilters((prev) => ({ ...prev, diaSemana: [], horaExacta: [], franjaHoraria: [] }));
  }

  // "Momento seleccionado" (vista por franja): la celda que se tocó, o por
  // defecto la de mayor concentración. Por hora, el clic filtra directo
  // como siempre.
  const seleccion = useMemo(() => {
    if (seleccionManual && seleccionManual.vista === vista) {
      return data.celdas.find((c) => c.diaIndex === seleccionManual.dia && c.columnaIndex === seleccionManual.col) ?? data.celdaMax;
    }
    return data.celdaMax;
  }, [seleccionManual, vista, data]);
  const posicion = seleccion ? 1 + data.celdas.filter((c) => c.valor > seleccion.valor).length : null;

  function clicCelda(celda: CeldaHeatmap) {
    if (vista === 'hora') aplicarFiltroCelda(celda);
    else setSeleccionManual({ dia: celda.diaIndex, col: celda.columnaIndex, vista });
  }

  const totalFiltrado = recordsParaMatriz.length;
  const esHora = vista === 'hora';
  const tituloMatriz = esHora ? 'Matriz de calor por día y hora' : 'Matriz de calor por día y franja horaria';

  const tarjetaMatriz = (
    <Card
      title={tituloMatriz}
      subtitle={undefined}
      descargable="matriz-calor"
      icono={<BarChart3 size={26} className="text-[#137a6f]" strokeWidth={2.4} />}
      claseTitulo="text-[16px] font-bold text-[#10233f]"
      actions={
        <button onClick={() => setAmpliada((v) => !v)} title={ampliada ? 'Cerrar vista ampliada' : 'Ver en pantalla completa'} className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-brand-green hover:text-brand-green">
          {ampliada ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      }
    >
      <p className="-mt-1 mb-3 text-[13px] text-slate-600">
        Cada celda representa la cantidad de casos ocurridos en un <strong>día de la semana</strong> (filas) durante {esHora ? 'una hora específica' : 'una franja horaria'} (columnas). Los niveles de color indican la concentración relativa de casos dentro de los datos filtrados.
      </p>
      <TablaMatriz data={data} seleccion={!esHora ? seleccion : null} onCelda={clicCelda} />
      <div className="mt-4">
        <Leyenda titulo={esHora ? undefined : 'Escala de concentración'} />
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Encabezado (sin botón PDF) */}
      <div className="flex items-center gap-3">
        <IconoCuadro fondo="bg-teal-50"><CalendarDays size={26} className="text-[#137a6f]" /></IconoCuadro>
        <div>
          <h1 className="text-[26px] font-bold leading-tight" style={{ color: AZUL }}>Matriz de Calor</h1>
          <p className="text-[14px] text-slate-500">Día de la semana × {esHora ? 'horario' : 'franja horaria'}. Identifica de forma dinámica los momentos críticos según los casos filtrados.</p>
        </div>
      </div>

      {!hayFiltroTemporal && recordsParaMatriz.length > 0 && recordsParaMatriz[0].fecha && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          <AlertCircle size={15} className="shrink-0 fill-amber-500 text-white" />
          Sin un año, mes o fecha seleccionados, se muestra solo la vigencia {recordsParaMatriz[0].fecha!.getFullYear()} (la más reciente) — no todo el histórico. Selecciona un año en el filtro principal para ver otra vigencia, o varios años para compararlos.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1">
          {(['hora', 'franja'] as VistaHeatmap[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors ${vista === v ? 'border-[#10233f] bg-[#10233f] text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {v === 'hora' ? <Clock size={15} /> : <BarChart3 size={15} />}
              {v === 'hora' ? 'Por hora' : 'Por franja horaria'}
            </button>
          ))}
        </div>
        {filtroActivoPorClic && (
          <button onClick={quitarFiltroCelda} className="flex items-center gap-1.5 rounded-lg border border-brand-navy/30 bg-brand-navy/5 px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-brand-navy/10">
            <X size={13} /> Quitar filtro de día/hora aplicado desde la matriz
          </button>
        )}
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="Total de casos considerados" valor={formatNumero(data.totalGeneral)} detalle={`${formatDecimal(pct(data.totalGeneral, totalFiltrado), 0)}% del total filtrado`} icono={<IconoCuadro fondo="bg-teal-50"><FileText size={24} className="text-[#137a6f]" /></IconoCuadro>} />
        <Kpi titulo={esHora ? 'Día con mayor concentración' : 'Día con mayor volumen'} valor={data.diaMax?.label ?? '—'} detalle={data.diaMax ? `${formatNumero(data.diaMax.casos)} casos · ${formatDecimal(pct(data.diaMax.casos, data.totalGeneral), 1)}% del total` : ''} icono={<IconoCuadro fondo="bg-teal-50"><CalendarDays size={24} className="text-[#137a6f]" /></IconoCuadro>} />
        <Kpi titulo={esHora ? 'Hora con mayor concentración' : 'Franja con mayor volumen'} valor={data.columnaMax ? etiquetaColumna(vista, data.columnaMax.label) : '—'} detalle={data.columnaMax ? `${formatNumero(data.columnaMax.casos)} casos · ${formatDecimal(pct(data.columnaMax.casos, data.totalGeneral), 1)}% del total` : ''} icono={<IconoCuadro fondo="bg-sky-50"><Clock size={24} className="text-[#1d6fd6]" /></IconoCuadro>} />
        <Kpi titulo="Celda con mayor concentración" valor={data.celdaMax ? `${data.celdaMax.diaLabel}${esHora ? ' ' : ' · '}${etiquetaColumna(vista, data.celdaMax.columnaLabel)}` : '—'} detalle={data.celdaMax ? `${formatNumero(data.celdaMax.valor)} casos · ${formatDecimal(data.celdaMax.porcentaje, 1)}% del total` : ''} icono={<IconoCuadro fondo="bg-rose-50"><Target size={24} className="text-rose-500" /></IconoCuadro>} />
      </div>

      {esHora ? (
        <>
          {tarjetaMatriz}
          <LecturaRapida data={data} vista={vista} />
          <FocosComportamiento records={recordsParaMatriz} filters={filters} onFiltrar={(campo, valor) => drillDown(campo, valor)} />
          <Card title="Momentos críticos" subtitle="Los periodos con mayor concentración de casos dentro del conjunto filtrado, calculados automáticamente." descargable="momentos-criticos" icono={<Flame size={24} className="fill-rose-500 text-rose-500" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
            {data.momentosCriticos.length === 0 ? (
              <p className="text-sm text-slate-400">No hay suficientes datos para identificar momentos críticos.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {data.momentosCriticos.map((c, i) => (
                  <div key={`${c.dia}-${c.columna}`} className="flex items-start gap-3 rounded-lg border border-rose-100 bg-rose-50/50 px-3 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[14px] font-bold text-white">{i + 1}</span>
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: AZUL }}>{c.diaLabel} · {etiquetaColumna(vista, c.columnaLabel)}</p>
                      <p className="text-[15px] font-bold" style={{ color: AZUL }}>{formatNumero(c.valor)} casos</p>
                      <p className="text-[12.5px] text-slate-500">{formatDecimal(c.porcentaje, 1)}% del total</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            {tarjetaMatriz}
            <LecturaRapida data={data} vista={vista} />
            <FocosComportamiento records={recordsParaMatriz} filters={filters} onFiltrar={(campo, valor) => drillDown(campo, valor)} />
          </div>
          <div className="space-y-4">
            <Card title="Momento seleccionado" descargable="momento-seleccionado" icono={<MousePointer2 size={22} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
              {seleccion ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3">
                  <div className="flex items-center gap-3">
                    <IconoCuadro fondo="bg-white"><CalendarDays size={22} className="text-rose-500" /></IconoCuadro>
                    <div>
                      <p className="text-[17px] font-bold leading-tight" style={{ color: AZUL }}>{seleccion.diaLabel} · {seleccion.columnaLabel}</p>
                      <p className="text-[12.5px] text-slate-500">{RANGO_FRANJA[seleccion.columnaIndex]}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-[28px] font-bold leading-none text-rose-600">{formatNumero(seleccion.valor)} casos</p>
                    <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-center text-[13px] font-semibold leading-tight" style={{ color: AZUL }}>{formatDecimal(seleccion.porcentaje, 1)}%<span className="block text-[10.5px] font-normal text-slate-500">del total</span></span>
                  </div>
                  {posicion && <p className="mt-2 text-[12.5px] text-slate-600"><b style={{ color: AZUL }}>Ranking: #{posicion}</b> de {data.celdas.length} combinaciones</p>}
                  <button onClick={() => aplicarFiltroCelda(seleccion)} disabled={seleccion.valor === 0} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-[13px] font-semibold hover:bg-slate-50 disabled:opacity-50" style={{ color: AZUL }}>
                    <Filter size={14} className="fill-[#10233f]" /> Usar este periodo como filtro
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Sin datos.</p>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Toca una celda de la matriz para verla aquí.</p>
            </Card>
            <Card title="Top 5 concentraciones" subtitle="Combinaciones día × franja con mayor concentración de casos dentro del conjunto filtrado." descargable="momentos-criticos" icono={<CalendarDays size={24} className="text-[#137a6f]" />} claseTitulo="text-[15px] font-bold text-[#10233f]">
              {data.momentosCriticos.length === 0 ? (
                <p className="text-sm text-slate-400">No hay suficientes datos.</p>
              ) : (
                <ul className="space-y-2">
                  {data.momentosCriticos.map((c, i) => (
                    <li key={`${c.dia}-${c.columna}`}>
                      <button onClick={() => setSeleccionManual({ dia: c.diaIndex, col: c.columnaIndex, vista })} className="flex w-full items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 text-left text-[13px] hover:bg-slate-50">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[12px] font-bold text-white">{i + 1}</span>
                        <span className="flex-1 truncate font-medium" style={{ color: AZUL }}>{c.diaLabel} · {c.columnaLabel}</span>
                        <span className="whitespace-nowrap text-slate-700">{formatNumero(c.valor)} casos</span>
                        <span className="w-11 text-right text-slate-500">{formatDecimal(c.porcentaje, 1)}%</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Vista ampliada de la matriz (botón ⤢ de la tarjeta) */}
      {ampliada && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-900/40 p-6" onClick={() => setAmpliada(false)}>
          <div className="mx-auto max-w-[1600px]" onClick={(e) => e.stopPropagation()}>
            {tarjetaMatriz}
          </div>
        </div>
      )}
    </div>
  );
}
