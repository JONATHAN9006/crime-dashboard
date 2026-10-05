import { useMemo, useState } from 'react';
import type React from 'react';
import { CalendarDays, CalendarRange, BarChart3, Diamond, ArrowUp, Shield, Crosshair, MapPinned, Plus, Building2, Clock, Home } from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  useAnalisisPeriodos, useSemanasDisponibles, useMesesDisponibles, dividirEnSemanas, type PeriodoDef,
} from '../hooks/useAnalisisPeriodos';
import { semanaIso, totalCasos } from '../utils/aggregations';
import { analizarSemanas, detectarRezago } from '../analitica/semanas';
import { EvolucionSemanal, IconoBarras } from '../components/semanas/EvolucionSemanal';
import { maxDe } from '../utils/mathSeguro';
import { Card, EmptyState, PageHeader } from '../components/ui/Card';
import { MultiSelect } from '../components/filters/MultiSelect';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { formatDecimal, formatFecha, formatNumero } from '../utils/aggregations';

type Modo = 'ultimas4' | 'semanas' | 'mes';

export function UltimasSemanas() {
  const { filteredRecords } = useData();
  const [modo, setModo] = useState<Modo>('ultimas4');
  const [semanasElegidas, setSemanasElegidas] = useState<string[]>([]); // "anio-semana"
  const [mesElegido, setMesElegido] = useState<string | null>(null);
  // Fecha de corte manual (solo "Últimas 4 semanas"): permite terminar el
  // análisis ANTES de los días con registro incompleto (rezago). null = el
  // último dato disponible.
  const [corte, setCorte] = useState<Date | null>(null);

  const semanasDisponibles = useSemanasDisponibles(filteredRecords);
  const mesesDisponibles = useMesesDisponibles(filteredRecords);

  // Construye la lista de períodos según el modo seleccionado.
  const periodos: PeriodoDef[] = useMemo(() => {
    const conFecha = filteredRecords.filter((r) => r.fecha);
    if (conFecha.length === 0) return [];

    if (modo === 'semanas') {
      const elegidas = semanasDisponibles.filter((s) => semanasElegidas.includes(`${s.anio}-${s.semana}`));
      return elegidas.map((s) => ({ etiqueta: `Semana ${s.semana} (${s.anio})`, inicio: s.inicio, fin: s.fin }));
    }
    if (modo === 'mes') {
      const mes = mesesDisponibles.find((m) => m.anioMes === mesElegido) ?? mesesDisponibles[mesesDisponibles.length - 1];
      if (!mes) return [];
      return dividirEnSemanas(mes.inicio, mes.fin);
    }
    // ultimas4 (por defecto): últimas 4 semanas de 7 días terminando en el dato más reciente.
    const maxTs = maxDe(conFecha.map((r) => r.fecha!.getTime()));
    const diaFin = new Date(corte && corte.getTime() < maxTs ? corte.getTime() : maxTs);
    diaFin.setHours(0, 0, 0, 0);
    const MS_DIA = 86400000;
    const construir = (offInicio: number, offFin: number): PeriodoDef => {
      const inicio = new Date(diaFin.getTime() - offInicio * MS_DIA);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(diaFin.getTime() - offFin * MS_DIA);
      fin.setHours(23, 59, 59, 999);
      return { etiqueta: `Semana ${semanaIso(fin)}`, inicio, fin };
    };
    return [construir(27, 21), construir(20, 14), construir(13, 7), construir(6, 0)];
  }, [modo, filteredRecords, semanasElegidas, semanasDisponibles, mesElegido, mesesDisponibles, corte]);

  const r = useAnalisisPeriodos(filteredRecords, periodos);

  // Modelo estadístico de corto plazo (analitica/semanas.ts): estado con
  // umbral de ruido, patrón, aporte al cambio — y la serie diaria de la
  // ventana para detectar rezago de registro en los últimos días.
  const analisis = useMemo(
    () => analizarSemanas(r.porDelito.map((d) => ({ delito: d.delito, valores: d.valores })), r.periodos.map((p) => p.total)),
    [r],
  );
  const rezago = useMemo(() => {
    if (!r.disponible || r.periodos.length === 0) return null;
    const inicio = new Date(r.periodos[0].inicio); inicio.setHours(0, 0, 0, 0);
    const fin = r.periodos[r.periodos.length - 1].fin;
    const porDia = new Map<string, typeof r.registrosVentana>();
    for (const reg of r.registrosVentana) {
      if (!reg.fecha) continue;
      const k = reg.fecha.toDateString();
      const lista = porDia.get(k) ?? [];
      lista.push(reg);
      porDia.set(k, lista);
    }
    const diarios: { fecha: Date; casos: number }[] = [];
    for (let d = new Date(inicio); d <= fin; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      diarios.push({ fecha: new Date(d), casos: totalCasos(porDia.get(d.toDateString()) ?? []) });
    }
    return detectarRezago(diarios);
  }, [r]);

  const botonesModo = (
    <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
      {([
        { id: 'ultimas4' as const, label: 'Últimas 4 semanas' },
        { id: 'semanas' as const, label: 'Elegir semanas' },
        { id: 'mes' as const, label: 'Por mes' },
      ]).map((o, i) => (
        <button
          key={o.id}
          onClick={() => setModo(o.id)}
          className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium ${i > 0 ? 'border-l border-slate-200' : ''} ${modo === o.id ? 'bg-[#137a6f] text-white' : 'text-slate-700 hover:bg-slate-50'}`}
        >
          {o.id === 'ultimas4' ? <CalendarRange size={15} /> : <CalendarDays size={15} />} {o.label}
        </button>
      ))}
    </div>
  );

  const controlesModo = (modo === 'semanas' || modo === 'mes') && (
    <div className="flex flex-wrap items-center gap-2">
      {modo === 'semanas' && (
        <div className="min-w-[260px]">
          <MultiSelect
            label="Semanas a consultar (máx. 6)"
            options={semanasDisponibles.map((s) => `${s.anio}-${s.semana}`)}
            selected={semanasElegidas}
            onChange={(valores) => setSemanasElegidas(valores.slice(-6))}
            labels={Object.fromEntries(semanasDisponibles.map((s) => [`${s.anio}-${s.semana}`, `Semana ${s.semana} (${s.anio})`]))}
          />
        </div>
      )}
      {modo === 'mes' && (
        <select
          value={mesElegido ?? mesesDisponibles[mesesDisponibles.length - 1]?.anioMes ?? ''}
          onChange={(e) => setMesElegido(e.target.value)}
          className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
        >
          {mesesDisponibles.map((m) => (
            <option key={m.anioMes} value={m.anioMes}>{m.etiqueta}</option>
          ))}
        </select>
      )}
    </div>
  );
  const selectorModo = <div className="mb-4 flex flex-wrap items-center gap-3">{botonesModo}{controlesModo}</div>;

  if (periodos.length === 0 || !r.disponible) {
    return (
      <div>
        <PageHeader title="Comportamiento de los delitos" subtitle="Análisis por semanas o por mes, según lo que selecciones." />
        {selectorModo}
        <EmptyState mensaje={modo === 'semanas' ? 'Selecciona al menos una semana para analizar.' : 'No hay suficientes datos con fecha para este análisis.'} />
      </div>
    );
  }

  const topDelitosGrafico = [...r.porDelito].sort((a, b) => b.valores.reduce((x, y) => x + y, 0) - a.valores.reduce((x, y) => x + y, 0)).slice(0, 5);
  const datosGrafico = r.periodos.map((p, i) => {
    const fila: Record<string, any> = { periodo: p.etiqueta.replace(' (más reciente)', '') };
    for (const d of topDelitosGrafico) fila[d.delito] = d.valores[i];
    return fila;
  });
  // El delito con mayor cantidad de casos en el conjunto mostrado se resalta
  // dinámicamente en rojo (nunca escrito a mano): se recalcula automáticamente
  // según los datos y filtros vigentes. El resto usa tonos de verde
  // institucional (más oscuro a más claro) en vez de colores dispares.
  const PALETA_VERDES = ['#0b4a46', '#116762', '#1a8f88', '#4db6ae', '#8fd6a3'];
  const coloresDelitos: Record<string, string> = {};
  topDelitosGrafico.forEach((d, i) => {
    coloresDelitos[d.delito] = i === 0 ? '#dc2626' : PALETA_VERDES[i % PALETA_VERDES.length];
  });

  const tituloVentana = modo === 'mes'
    ? `Mes analizado: ${mesesDisponibles.find((m) => m.anioMes === (mesElegido ?? mesesDisponibles[mesesDisponibles.length - 1]?.anioMes))?.etiqueta ?? ''}`
    : `Del ${formatFecha(r.periodos[0].inicio)} al ${formatFecha(r.periodos[r.periodos.length - 1].fin)}`;

  // ── Primera sección: igual a la imagen de referencia ──────────────────
  const dif = r.periodos.length > 0 ? r.periodos[r.periodos.length - 1].total - r.periodos[0].total : 0;
  const tituloTarjeta = 'text-[15px] font-bold text-[#10233f]';
  const iconoVerde = (Icono: typeof Shield) => <Icono size={22} className="shrink-0 text-[#16a37f]" strokeWidth={2.2} />;
  const lista = (cabeza: string, filas: { key: string; casos: number; participacion?: number }[], conPct = false) => (
    <>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span>{cabeza}</span><span>{conPct ? 'Casos (%)' : 'Casos'}</span>
      </div>
      <ul className="space-y-1.5 text-[13.5px]">
        {filas.map((f) => (
          <li key={f.key} className="flex justify-between gap-2">
            <span className="truncate text-slate-700">{f.key}</span>
            <span className="shrink-0 font-bold text-[#10233f]">{formatNumero(f.casos)}{conPct && f.participacion !== undefined && <span className="font-normal text-slate-500"> ({formatDecimal(f.participacion)} %)</span>}</span>
          </li>
        ))}
        {filas.length === 0 && <p className="text-slate-400">Sin datos.</p>}
      </ul>
    </>
  );
  const kpiSuperior = (titulo: string, valor: string, sub: string, icono: React.ReactNode, fondoIcono: string, fondo: string, colorValor = 'text-[#10233f]') => (
    <div className={`flex items-center gap-2.5 overflow-hidden rounded-xl border border-slate-200 px-3 py-3.5 ${fondo}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${fondoIcono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase leading-tight tracking-wide text-slate-600">{titulo}</p>
        {/* Nombres largos (ej. "H. Comercio", una estación con nombre largo) bajan de tamaño para caber sin cortarse. */}
        <p title={valor} className={`mt-0.5 break-words font-extrabold leading-tight ${valor.length > 9 ? 'text-[18px]' : 'text-[23px]'} ${colorValor}`}>{valor}</p>
        <p className="text-[12px] leading-snug text-slate-500">{sub}</p>
      </div>
    </div>
  );
  const variacionSube = (r.variacionTotalPct ?? 0) > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-[#f7f9fc] p-5">
        {/* Encabezado */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconoBarras size={40} />
            <div>
              <h1 className="text-[24px] font-bold leading-tight text-[#10233f]">Comportamiento de los delitos</h1>
              <p className="text-[14px] text-slate-500">{tituloVentana} (sobre los datos filtrados)</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">{botonesModo}{controlesModo}</div>
        </div>

        {/* Indicadores (izquierda) + gráfica (derecha) */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {kpiSuperior(`Total ${modo === 'mes' ? 'del mes' : 'de la ventana'}`, formatNumero(r.totalVentana), 'casos', <BarChart3 size={22} className="text-[#2f6fd6]" strokeWidth={2.4} />, 'bg-[#e3eefc]', 'bg-[#f3f7fc]')}
            {kpiSuperior('Variación último vs. primer período', r.variacionTotalPct === null ? '—' : `${variacionSube ? '+' : ''}${formatDecimal(r.variacionTotalPct, 1)} %`, `${dif > 0 ? '+' : ''}${formatNumero(dif)} casos`, <Diamond size={20} className="fill-rose-500 text-rose-500" />, 'bg-rose-100', 'bg-[#eef8f2]', variacionSube ? 'text-rose-600' : 'text-emerald-700')}
            {kpiSuperior('Delito con mayor aumento', r.delitoMayorAumento?.delito ?? '—', r.delitoMayorAumento ? `${r.delitoMayorAumento.variacionAbs >= 0 ? '+' : ''}${r.delitoMayorAumento.variacionAbs} casos` : '', <ArrowUp size={24} className="text-rose-600" strokeWidth={3} />, 'bg-rose-100', 'bg-[#fdf0f2]')}
            {kpiSuperior('Estación que más aporta', r.estacionTop?.key ?? '—', r.estacionTop ? `${formatNumero(r.estacionTop.casos)} casos en la ventana` : '', <Shield size={22} className="fill-[#2f6fd6] text-[#2f6fd6]" />, 'bg-[#e3eefc]', 'bg-[#f3f7fc]')}
          </div>

          <Card
            title={`Evolución ${modo === 'mes' ? 'semanal dentro del mes' : 'por período'} — Top 5 delitos`}
            subtitle="Cada barra indica el número de semana real del calendario. El delito con mayor incidencia se resalta automáticamente en rojo."
            descargable="evolucion-top5"
            claseTitulo={tituloTarjeta}
          >
            <GroupedBarChart data={datosGrafico} xKey="periodo" seriesKeys={topDelitosGrafico.map((d) => d.delito)} seriesColors={coloresDelitos} height={260} />
          </Card>
        </div>

        {/* Seis tarjetas */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <Card title="Armas más empleadas" descargable="armas-mas-empleadas" icono={iconoVerde(Crosshair)} claseTitulo={tituloTarjeta}>{lista('Arma', r.armasTop)}</Card>
          <Card title="Cuadrantes con mayor afectación" descargable="cuadrantes-mayor-afectacion" icono={iconoVerde(MapPinned)} claseTitulo={tituloTarjeta}>{lista('Cuadrante', r.cuadrantesTop)}</Card>
          <Card title="Causa de lesión" descargable="causa-lesion-semanas" icono={<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#16a37f]"><Plus size={16} strokeWidth={3.5} className="text-white" /></span>} claseTitulo={tituloTarjeta}>{lista('Causa', r.causaLesionTop)}</Card>
          <Card title="Clase de sitio" descargable="clase-sitio-semanas" icono={iconoVerde(Building2)} claseTitulo={tituloTarjeta}>{lista('Clase de sitio', r.claseSitioTop)}</Card>
          <Card title="Horario más afectado (franja)" descargable="horario-franja" icono={<Clock size={22} className="shrink-0 fill-[#16a37f] text-white" strokeWidth={2.4} />} claseTitulo={tituloTarjeta}>
            {r.franjaTop ? (
              <div className="pt-1">
                <p className="text-[21px] font-bold leading-tight text-[#10233f]">{r.franjaTop.key}</p>
                <p className="mt-1 text-[13.5px] text-slate-500">{formatNumero(r.franjaTop.casos)} casos · {formatDecimal(r.franjaTop.participacion)}% del total de la ventana</p>
                <div className="mt-4 h-3 w-full rounded-full bg-slate-200">
                  <div className="h-3 rounded-full bg-[#137a6f]" style={{ width: `${Math.min(100, r.franjaTop.participacion)}%` }} />
                </div>
                <p className="mt-2 text-[14px] text-slate-700">{formatDecimal(r.franjaTop.participacion)} %</p>
              </div>
            ) : <p className="text-sm text-slate-400">Sin datos.</p>}
          </Card>
          <Card title="Barrios más afectados (Top 5)" descargable="barrios-mas-afectados" icono={iconoVerde(Home)} claseTitulo={tituloTarjeta}>{lista('Barrio', r.barriosTop, true)}</Card>
        </div>
      </div>

      {/* Segunda sección: Evolución de la delictividad (segunda imagen) */}
      <EvolucionSemanal
        periodos={r.periodos}
        analisis={analisis}
        esUltimas4={modo === 'ultimas4'}
        rezago={modo === 'ultimas4' ? rezago : null}
        cortado={modo === 'ultimas4' ? corte : null}
        onCortarAntesDelRezago={modo === 'ultimas4' && rezago ? () => setCorte(new Date(rezago.desde.getTime() - 86400000)) : undefined}
        onQuitarCorte={() => setCorte(null)}
      />
    </div>
  );
}
