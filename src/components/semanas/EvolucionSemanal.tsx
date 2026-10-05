import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, CalendarDays, ChevronDown, FileText, ImageDown, Loader2, Plus, Circle } from 'lucide-react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { exportarHtmlComoImagen } from '../../utils/exportarImagen';
import { useRegistrarEnPdf } from '../../context/RegistroPdfContext';
import type { AnalisisSemanal, AlertaRezago, FilaSemanal } from '../../analitica/semanas';

// "Evolución de la Delictividad — Últimas 4 Semanas", maquetado igual a la
// imagen de referencia: encabezado con ícono y chips de filtro, 6
// indicadores, tabla por delito con la última semana resaltada, mini
// tendencia, cambio (casos | %), aporte al cambio, estado; y a la derecha
// "Lectura del periodo" y "Resumen de la tendencia".
// Cifras: analitica/semanas.ts (probado en semanas.test.ts).

interface Periodo { etiqueta: string; inicio: Date; fin: Date; total: number }
type Sentido = 'aumento' | 'reduccion' | 'estable';
type Filtro = 'todos' | Sentido;
type Orden = 'impacto_reduccion' | 'impacto_aumento' | 'impacto' | 'ultima' | 'variacion' | 'nombre';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dd = (d: Date) => String(d.getDate()).padStart(2, '0');
const rango = (a: Date, b: Date) => (a.getMonth() === b.getMonth() ? `${dd(a)} - ${dd(b)} ${MES[b.getMonth()]}` : `${dd(a)} ${MES[a.getMonth()]} - ${dd(b)} ${MES[b.getMonth()]}`);
const nombreSemana = (e: string) => e.replace(' (más reciente)', '').replace(/\s*\(\d{4}\)$/, '');
const numSemana = (e: string) => nombreSemana(e).replace(/^Semana\s+/i, 'S');
const signo = (n: number) => (n > 0 ? `+${formatNumero(n)}` : formatNumero(n));
const pct = (n: number | null) => (n === null ? 'N/A' : `${n > 0 ? '' : ''}${formatDecimal(n, 1)} %`);
// Estado por el SENTIDO del cambio (como en la imagen: "Estables" = sin cambio).
const sentido = (dif: number): Sentido => (dif > 0 ? 'aumento' : dif < 0 ? 'reduccion' : 'estable');

const VERDE = '#15803d', ROJO = '#e11d48', GRIS = '#64748b';

function MiniTendencia({ valores, s }: { valores: number[]; s: Sentido }) {
  const W = 120, H = 34, n = valores.length, max = Math.max(1, ...valores), min = Math.min(...valores);
  const x = (i: number) => 6 + (i * (W - 12)) / Math.max(n - 1, 1);
  const y = (v: number) => 6 + (1 - (v - min) / Math.max(max - min, 1)) * (H - 14);
  const color = s === 'aumento' ? ROJO : s === 'reduccion' ? VERDE : GRIS;
  const relleno = s === 'aumento' ? 'rgba(225,29,72,0.10)' : s === 'reduccion' ? 'rgba(21,128,61,0.10)' : 'rgba(100,116,139,0.10)';
  const pts = valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto block" aria-hidden>
      <polygon points={`${x(0)},${H - 2} ${pts} ${x(n - 1)},${H - 2}`} fill={relleno} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {valores.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.8} fill={color} />)}
    </svg>
  );
}

function ChipEstado({ s, titulo, conPunto }: { s: Sentido; titulo?: string; conPunto?: boolean }) {
  if (s === 'aumento') return <span title={titulo} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-500" />Aumento</span>;
  if (s === 'reduccion') return <span title={titulo} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-emerald-700">{conPunto ? <span className="h-2 w-2 rounded-full bg-emerald-600" /> : <ArrowDown size={13} strokeWidth={2.5} />}Reducción</span>;
  return <span title={titulo} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-400" />Estable</span>;
}

function IconoBarras({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden>
      <rect x="3" y="18" width="7" height="13" rx="1.5" fill="#2bb3a3" />
      <rect x="13.5" y="11" width="7" height="20" rx="1.5" fill="#159089" />
      <rect x="24" y="3" width="7" height="28" rx="1.5" fill="#0b6e66" />
    </svg>
  );
}
export { IconoBarras };

export function EvolucionSemanal({ periodos, analisis, rezago, onCortarAntesDelRezago, cortado, onQuitarCorte, esUltimas4 }: {
  periodos: Periodo[];
  analisis: AnalisisSemanal;
  rezago: AlertaRezago | null;
  onCortarAntesDelRezago?: () => void;
  cortado: Date | null;
  onQuitarCorte?: () => void;
  esUltimas4: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [orden, setOrden] = useState<Orden>('impacto_reduccion');
  const [descargando, setDescargando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useRegistrarEnPdf('evolucion-delictividad-semanas', 'Evolución de la Delictividad', ref);

  const n = periodos.length;
  const primero = periodos[0], ultimo = periodos[n - 1];
  const s1 = numSemana(primero.etiqueta), sN = numSemana(ultimo.etiqueta);

  const conteo = useMemo(() => ({
    aumento: analisis.filas.filter((f) => f.diferencia > 0).length,
    reduccion: analisis.filas.filter((f) => f.diferencia < 0).length,
    estable: analisis.filas.filter((f) => f.diferencia === 0).length,
  }), [analisis]);

  const filas = useMemo(() => {
    const base = filtro === 'todos' ? analisis.filas : analisis.filas.filter((f) => sentido(f.diferencia) === filtro);
    const cmp: Record<Orden, (a: FilaSemanal, b: FilaSemanal) => number> = {
      impacto_reduccion: (a, b) => a.diferencia - b.diferencia || b.valores[n - 1] - a.valores[n - 1],
      impacto_aumento: (a, b) => b.diferencia - a.diferencia || b.valores[n - 1] - a.valores[n - 1],
      impacto: (a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia),
      ultima: (a, b) => b.valores[n - 1] - a.valores[n - 1],
      variacion: (a, b) => (a.variacionPct ?? Infinity) - (b.variacionPct ?? Infinity),
      nombre: (a, b) => a.delito.localeCompare(b.delito, 'es'),
    };
    return [...base].sort(cmp[orden]);
  }, [analisis, filtro, orden, n]);

  const dif = analisis.totalDiferencia;
  const sube = dif > 0;
  const mayorReduccion = [...analisis.filas].sort((a, b) => a.diferencia - b.diferencia).find((f) => f.diferencia < 0) ?? null;
  const mayorIncremento = [...analisis.filas].sort((a, b) => b.diferencia - a.diferencia).find((f) => f.diferencia > 0) ?? null;
  const masCasos = [...analisis.filas].sort((a, b) => b.valores[n - 1] - a.valores[n - 1])[0] ?? null;
  const explican = analisis.filas.filter((f) => f.diferencia !== 0 && Math.sign(f.diferencia) === Math.sign(dif)).sort((a, b) => (b.aportePct ?? 0) - (a.aportePct ?? 0));
  const contrarios = analisis.filas.filter((f) => f.diferencia !== 0 && Math.sign(f.diferencia) === -Math.sign(dif));
  const rezagoEnUltima = !!rezago && rezago.desde >= ultimo.inicio && !cortado;

  async function descargar() {
    if (!ref.current || descargando) return;
    setDescargando(true);
    try { await exportarHtmlComoImagen(ref.current, 'Evolución de la Delictividad', 'evolucion-delictividad-semanas'); } finally { setDescargando(false); }
  }

  const lista = (items: FilaSemanal[], conPct: boolean) => items.map((f, i, arr) => (
    <span key={f.delito}><b>{f.delito}</b>{conPct ? ` (${formatDecimal(f.aportePct ?? 0, 1)} %)` : ''}{i < arr.length - 2 ? ', ' : i === arr.length - 2 ? ' y ' : ''}</span>
  ));

  const kpi = (titulo: ReactNode, valor: ReactNode, unidad: string, icono: ReactNode, fondo: string, colorValor = 'text-slate-900', colorTitulo = 'text-slate-500') => (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 ${fondo}`}>
      {icono}
      <div className="min-w-0">
        <p className={`text-[11px] font-bold uppercase tracking-wide ${colorTitulo}`}>{titulo}</p>
        <p className={`text-[26px] font-extrabold leading-tight ${colorValor}`}>{valor}</p>
        <p className="text-[12px] text-slate-500">{unidad}</p>
      </div>
    </div>
  );
  const colorCambio = sube ? 'text-rose-600' : dif < 0 ? 'text-emerald-700' : 'text-slate-700';
  const fondoCambio = sube ? 'bg-rose-50/70' : dif < 0 ? 'bg-emerald-50/70' : 'bg-white';
  const flechaCambio = sube ? <ArrowUp size={30} strokeWidth={2.5} className="shrink-0 text-rose-600" /> : <ArrowDown size={30} strokeWidth={2.5} className="shrink-0 text-emerald-700" />;

  return (
    <div className="space-y-3">
      {rezagoEnUltima && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5">
          <AlertTriangle size={18} className="shrink-0 text-amber-600" />
          <p className="min-w-[260px] flex-1 text-[13px] text-amber-900">
            <b>Posible rezago de registro en {nombreSemana(ultimo.etiqueta)}:</b> desde el {rezago!.desde.toLocaleDateString('es-CO')} se registran {formatDecimal(rezago!.promedioReciente, 1)} casos/día frente a {formatDecimal(rezago!.promedioHabitual, 1)} habituales (faltarían unos {formatNumero(rezago!.faltantesEstimados)} casos). La caída puede no ser real.
          </p>
          {onCortarAntesDelRezago && <button onClick={onCortarAntesDelRezago} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">Analizar hasta el {new Date(rezago!.desde.getTime() - 86400000).toLocaleDateString('es-CO')}</button>}
        </div>
      )}
      {cortado && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-[13px] text-sky-900">
          <span><CalendarDays size={14} className="mr-1 inline" />Análisis cortado al {cortado.toLocaleDateString('es-CO')} para excluir los días con registro incompleto.</span>
          {onQuitarCorte && <button onClick={onQuitarCorte} className="text-xs font-semibold underline">Volver al último dato disponible</button>}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Encabezado */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconoBarras />
            <div>
              <h2 className="text-[22px] font-bold leading-tight text-[#10233f]">Evolución de la Delictividad — {esUltimas4 ? 'Últimas 4 Semanas' : `${n} periodos`}</h2>
              <p className="text-[14px] text-slate-500">Comparativo {nombreSemana(primero.etiqueta)} → {nombreSemana(ultimo.etiqueta)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setFiltro('todos')} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold ${filtro === 'todos' ? 'border-[#137a6f] bg-[#137a6f] text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
              <Plus size={14} strokeWidth={3} /> Todos ({analisis.filas.length})
            </button>
            {([['aumento', `Aumentan (${conteo.aumento})`, 'bg-rose-500'], ['reduccion', `Disminuyen (${conteo.reduccion})`, 'bg-emerald-700'], ['estable', `Estables (${conteo.estable})`, 'bg-slate-400']] as const).map(([clave, texto, punto]) => (
              <button key={clave} onClick={() => setFiltro(clave)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold ${filtro === clave ? 'border-[#137a6f] bg-emerald-50 text-[#0b4a46]' : 'border-slate-200 bg-white text-slate-700'}`}>
                <span className={`h-3 w-3 rounded-full ${punto}`} /> {texto}
              </button>
            ))}
            <span className="ml-1 text-[13px] text-slate-600">Ordenar por:</span>
            <div className="relative">
              <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[12.5px] text-slate-700">
                <option value="impacto_reduccion">Impacto del periodo (mayor reducción)</option>
                <option value="impacto_aumento">Impacto del periodo (mayor aumento)</option>
                <option value="impacto">Impacto absoluto</option>
                <option value="ultima">Casos en {numSemana(ultimo.etiqueta)}</option>
                <option value="variacion">Variación %</option>
                <option value="nombre">Nombre del delito</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            <button onClick={descargar} title="Descargar esta información como imagen" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-brand-green hover:text-brand-green">
              {descargando ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />}
            </button>
          </div>
        </div>

        <div ref={ref} className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            {/* Indicadores */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
              {kpi(`Total ${nombreSemana(primero.etiqueta)}`, formatNumero(primero.total), 'casos', <CalendarDays size={30} className="shrink-0 text-[#2f6fd6]" />, 'bg-white')}
              {kpi(`Total ${nombreSemana(ultimo.etiqueta)}`, formatNumero(ultimo.total), rezagoEnUltima ? 'casos · posible rezago' : 'casos', <CalendarDays size={30} className="shrink-0 text-[#2f6fd6]" />, 'bg-white')}
              {kpi('Cambio del periodo', signo(dif), 'casos', flechaCambio, fondoCambio, colorCambio, 'text-slate-700')}
              {kpi('Variación del periodo', pct(analisis.totalVariacionPct), ' ', flechaCambio, fondoCambio, colorCambio, 'text-slate-700')}
              {kpi('Delitos que aumentan', conteo.aumento, 'delitos', <ArrowUp size={30} strokeWidth={2.5} className="shrink-0 text-rose-600" />, 'bg-rose-50/70', 'text-rose-600', 'text-rose-600')}
              {kpi('Delitos que disminuyen', conteo.reduccion, 'delitos', <ArrowDown size={30} strokeWidth={2.5} className="shrink-0 text-emerald-700" />, 'bg-emerald-50/70', 'text-emerald-700', 'text-slate-700')}
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[920px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="text-[12px] font-bold uppercase text-[#10233f]">
                    <th className="border-b border-slate-200 px-4 py-2.5 text-left">Delito</th>
                    {periodos.map((p, i) => (
                      <th key={i} className={`border-b border-slate-200 px-2 py-2.5 text-center ${i === n - 1 ? 'bg-[#dff3f5]' : ''}`}>
                        {nombreSemana(p.etiqueta)}
                        <span className="block text-[11.5px] font-normal normal-case text-slate-600">{rango(p.inicio, p.fin)}</span>
                      </th>
                    ))}
                    <th className="border-b border-slate-200 px-2 py-2.5 text-center">Tendencia<span className="block text-[11.5px] font-normal normal-case text-slate-600">({esUltimas4 ? 'Últimas 4 semanas' : `${n} periodos`})</span></th>
                    <th className="border-b border-slate-200 px-2 py-2.5 text-center">Cambio {s1} → {sN}<span className="block text-[11.5px] font-normal normal-case text-slate-600">Casos | Variación %</span></th>
                    <th className="border-b border-slate-200 px-2 py-2.5 text-center">Aporte al cambio<span className="block text-[11.5px] font-normal normal-case text-slate-600">%</span></th>
                    <th className="border-b border-slate-200 px-2 py-2.5 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => {
                    const s = sentido(f.diferencia);
                    const color = s === 'aumento' ? 'text-rose-600' : s === 'reduccion' ? 'text-emerald-700' : 'text-slate-500';
                    const ayuda = f.estado === 'estable' && f.diferencia !== 0
                      ? `Diferencia ${signo(f.diferencia)} dentro de la variación normal esperada (±${formatDecimal(f.umbral, 1)} casos, 95 %): cambio no concluyente.`
                      : f.diferencia !== 0 ? `Diferencia ${signo(f.diferencia)} mayor que la variación normal esperada (±${formatDecimal(f.umbral, 1)} casos, 95 %).` : 'Sin cambio.';
                    return (
                      <tr key={f.delito} className="border-b border-slate-100">
                        <td className="border-b border-slate-100 px-4 py-2 text-slate-800">{f.delito}</td>
                        {f.valores.map((v, i) => (
                          <td key={i} className={`border-b border-slate-100 px-2 py-2 text-center ${i === n - 1 ? 'bg-[#eef9fa] font-bold text-slate-900' : 'text-slate-700'}`}>{formatNumero(v)}</td>
                        ))}
                        <td className="border-b border-slate-100 px-2 py-1"><MiniTendencia valores={f.valores} s={s} /></td>
                        <td className={`whitespace-nowrap border-b border-slate-100 px-2 py-2 text-center font-semibold ${color}`}>
                          {s === 'aumento' ? <ArrowUp size={14} strokeWidth={2.5} className="mr-1 inline" /> : s === 'reduccion' ? <ArrowDown size={14} strokeWidth={2.5} className="mr-1 inline" /> : null}
                          {signo(f.diferencia)} <span className="mx-1.5 font-normal text-slate-300">|</span> {pct(f.variacionPct)}
                        </td>
                        <td className="border-b border-slate-100 px-2 py-2 text-center text-slate-700">{f.aportePct === null ? '—' : `${formatDecimal(f.aportePct, 1)} %`}</td>
                        <td className="border-b border-slate-100 px-2 py-2 text-center"><ChipEstado s={s} titulo={ayuda} /></td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold text-[#10233f]">
                    <td className="px-4 py-3">TOTAL DELICTIVIDAD</td>
                    {analisis.totales.map((v, i) => <td key={i} className={`px-2 py-3 text-center ${i === n - 1 ? 'bg-[#dff3f5]' : ''}`}>{formatNumero(v)}</td>)}
                    <td className="px-2 py-1"><MiniTendencia valores={analisis.totales} s={sentido(dif)} /></td>
                    <td className={`whitespace-nowrap px-2 py-3 text-center ${colorCambio}`}>
                      {sube ? <ArrowUp size={14} strokeWidth={2.5} className="mr-1 inline" /> : dif < 0 ? <ArrowDown size={14} strokeWidth={2.5} className="mr-1 inline" /> : null}
                      {signo(dif)} <span className="mx-1.5 font-normal text-slate-300">|</span> {pct(analisis.totalVariacionPct)}
                    </td>
                    <td className="px-2 py-3 text-center">{dif === 0 ? '—' : '100,0 %'}</td>
                    <td className="px-2 py-3 text-center"><ChipEstado s={sentido(dif)} conPunto /></td>
                  </tr>
                </tbody>
              </table>
              {filas.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Ningún delito en este grupo.</p>}
            </div>
          </div>

          {/* Panel lateral */}
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-[#f6f9fc] p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e3eefc]"><FileText size={22} className="text-[#2f6fd6]" /></span>
                <p className="text-[15px] font-bold text-[#10233f]">Lectura del periodo</p>
              </div>
              <p className="text-[12.5px] leading-relaxed text-slate-700">
                Durante {esUltimas4 ? 'las últimas cuatro semanas' : 'el periodo analizado'} se registra {dif === 0 ? <>un comportamiento <b>estable</b></> : <>{sube ? 'un ' : 'una '}<b>{sube ? 'aumento' : 'reducción'} global de {formatDecimal(Math.abs(analisis.totalVariacionPct ?? 0), 1)} %</b></>} en la delictividad, pasando de <b>{formatNumero(primero.total)}</b> a <b>{formatNumero(ultimo.total)} casos</b>.
                {explican.length > 0 && <> {sube ? 'El aumento' : 'La reducción'} está explicad{sube ? 'o' : 'a'} principalmente por {lista(explican.slice(0, 3), true)}.</>}
                {contrarios.length > 0 && <> Se identifican {sube ? 'reducciones' : 'incrementos'} en {lista(contrarios.slice(0, 3), false)}{sube ? '.' : ', los cuales requieren seguimiento.'}</>}
                {rezagoEnUltima && <> <span className="font-semibold text-amber-700">Parte de la caída de {nombreSemana(ultimo.etiqueta)} puede deberse a registros aún no cargados.</span></>}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#f6f9fc] p-4">
              <div className="mb-3 flex items-center gap-3">
                <IconoBarras size={30} />
                <p className="text-[15px] font-bold text-[#10233f]">Resumen de la tendencia</p>
              </div>
              <ul className="space-y-3 text-[12.5px] text-slate-700">
                {mayorReduccion && <li className="flex gap-3"><ArrowDown size={20} strokeWidth={2.5} className="mt-0.5 shrink-0 text-emerald-700" /><span>Mayor reducción:<br /><b className="text-[#10233f]">{mayorReduccion.delito} ({signo(mayorReduccion.diferencia)} casos)</b></span></li>}
                {mayorIncremento && <li className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500"><Plus size={13} strokeWidth={3} className="text-white" /></span><span>Mayor incremento:<br /><b className="text-[#10233f]">{mayorIncremento.delito} ({signo(mayorIncremento.diferencia)} casos)</b></span></li>}
                {masCasos && <li className="flex gap-3"><Circle size={18} className="mt-0.5 shrink-0 fill-[#10233f] text-[#10233f]" /><span>Delito con más casos en {numSemana(ultimo.etiqueta)}:<br /><b className="text-[#10233f]">{masCasos.delito} ({formatNumero(masCasos.valores[n - 1])} casos)</b></span></li>}
                {explican[0] && <li className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600"><Plus size={13} strokeWidth={3} className="text-white" /></span><span>Mayor aporte {sube ? 'al aumento' : 'a la reducción'}:<br /><b className="text-[#10233f]">{explican[0].delito} ({formatDecimal(explican[0].aportePct ?? 0, 1)} %)</b></span></li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
