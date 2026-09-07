import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus, CalendarDays, CalendarRange } from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  useAnalisisPeriodos, useSemanasDisponibles, useMesesDisponibles, dividirEnSemanas, type PeriodoDef,
} from '../hooks/useAnalisisPeriodos';
import { semanaIso } from '../utils/aggregations';
import { Card, EmptyState, PageHeader } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { MultiSelect } from '../components/filters/MultiSelect';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { formatDecimal, formatFecha, formatNumero, formatPct } from '../utils/aggregations';

type Modo = 'ultimas4' | 'semanas' | 'mes';

export function UltimasSemanas() {
  const { filteredRecords } = useData();
  const [modo, setModo] = useState<Modo>('ultimas4');
  const [semanasElegidas, setSemanasElegidas] = useState<string[]>([]); // "anio-semana"
  const [mesElegido, setMesElegido] = useState<string | null>(null);

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
    const maxTs = Math.max(...conFecha.map((r) => r.fecha!.getTime()));
    const diaFin = new Date(maxTs);
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
  }, [modo, filteredRecords, semanasElegidas, semanasDisponibles, mesElegido, mesesDisponibles]);

  const r = useAnalisisPeriodos(filteredRecords, periodos);

  const selectorModo = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-slate-300">
        {([
          { id: 'ultimas4' as const, label: 'Últimas 4 semanas', icon: CalendarRange },
          { id: 'semanas' as const, label: 'Elegir semanas', icon: CalendarDays },
          { id: 'mes' as const, label: 'Por mes', icon: CalendarDays },
        ]).map((o) => (
          <button
            key={o.id}
            onClick={() => setModo(o.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${modo === o.id ? 'bg-brand-green text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <o.icon size={13} /> {o.label}
          </button>
        ))}
      </div>

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

  return (
    <div className="space-y-5">
      <PageHeader title="Comportamiento de los delitos" subtitle={`${tituloVentana} (sobre los datos filtrados)`} />

      {selectorModo}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard titulo={`Total ${modo === 'mes' ? 'del mes' : 'de la ventana'}`} valor={formatNumero(r.totalVentana)} />
        <KpiCard
          titulo="Variación último vs. primer período"
          valor={formatPct(r.variacionTotalPct)}
          acento={r.variacionTotalPct !== null && r.variacionTotalPct > 0 ? 'red' : 'green'}
          colorValor={r.variacionTotalPct !== null && r.variacionTotalPct > 0 ? 'red' : 'green'}
        />
        <KpiCard titulo="Delito con mayor aumento" valor={r.delitoMayorAumento?.delito ?? '—'} subtitulo={r.delitoMayorAumento ? `${r.delitoMayorAumento.variacionAbs >= 0 ? '+' : ''}${r.delitoMayorAumento.variacionAbs} casos` : ''} acento="red" />
        <KpiCard titulo="Estación que más aporta" valor={r.estacionTop?.key ?? '—'} subtitulo={r.estacionTop ? `${formatNumero(r.estacionTop.casos)} casos en la ventana` : ''} />
      </div>

      <Card title={`Evolución ${modo === 'mes' ? 'semanal dentro del mes' : 'por período'} — Top 5 delitos`} subtitle="Cada barra indica el número de semana real del calendario. El delito con mayor incidencia se resalta automáticamente en rojo." descargable="evolucion-top5">
        <GroupedBarChart data={datosGrafico} xKey="periodo" seriesKeys={topDelitosGrafico.map((d) => d.delito)} seriesColors={coloresDelitos} height={300} />
      </Card>

      <Card title="Delitos: período a período" subtitle="Verde = mejora (disminución). Rojo = comportamiento desfavorable (aumento)." descargable="delitos-periodo">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">Delito</th>
                {r.periodos.map((p, i) => <th key={i} className="py-2 pr-2 text-right">{p.etiqueta.replace(' (más reciente)', '')}</th>)}
                <th className="py-2 pr-2 text-right">Variación</th>
              </tr>
            </thead>
            <tbody>
              {r.porDelito.slice(0, 20).map((d) => {
                const subiendo = d.tendencia === 'aumenta';
                const bajando = d.tendencia === 'disminuye';
                return (
                  <tr key={d.delito} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-2 font-medium text-slate-800">{d.delito}</td>
                    {d.valores.map((v, i) => <td key={i} className="py-2 pr-2 text-right text-base text-slate-600">{v}</td>)}
                    <td className="py-2 pr-2">
                      <div className={`flex items-center justify-end gap-1 text-base font-semibold ${subiendo ? 'text-rose-600' : bajando ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {subiendo && <ArrowUp size={13} />}
                        {bajando && <ArrowDown size={13} />}
                        {!subiendo && !bajando && <Minus size={13} />}
                        {d.variacionAbs >= 0 ? '+' : ''}{d.variacionAbs}
                        {d.variacionPct !== null && ` (${formatDecimal(Math.abs(d.variacionPct))}%)`}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Armas más empleadas" descargable="armas-mas-empleadas">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Arma</span><span>Casos</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {r.armasTop.map((a) => (
              <li key={a.key} className="flex justify-between"><span className="text-slate-700">{a.key}</span><span className="text-base font-semibold text-slate-900">{a.casos}</span></li>
            ))}
            {r.armasTop.length === 0 && <p className="text-slate-400">Sin datos.</p>}
          </ul>
        </Card>
        <Card title="Cuadrantes con mayor afectación" descargable="cuadrantes-mayor-afectacion">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Cuadrante</span><span>Casos</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {r.cuadrantesTop.map((c) => (
              <li key={c.key} className="flex justify-between"><span className="text-slate-700">{c.key}</span><span className="text-base font-semibold text-slate-900">{c.casos}</span></li>
            ))}
            {r.cuadrantesTop.length === 0 && <p className="text-slate-400">Sin datos.</p>}
          </ul>
        </Card>
        <Card title="Causa de lesión" descargable="causa-lesion-semanas">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Causa</span><span>Casos</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {r.causaLesionTop.map((c) => (
              <li key={c.key} className="flex justify-between"><span className="text-slate-700">{c.key}</span><span className="text-base font-semibold text-slate-900">{c.casos}</span></li>
            ))}
            {r.causaLesionTop.length === 0 && <p className="text-slate-400">Sin datos.</p>}
          </ul>
        </Card>
        <Card title="Clase de sitio" descargable="clase-sitio-semanas">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Clase de sitio</span><span>Casos</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {r.claseSitioTop.map((c) => (
              <li key={c.key} className="flex justify-between"><span className="text-slate-700">{c.key}</span><span className="text-base font-semibold text-slate-900">{c.casos}</span></li>
            ))}
            {r.claseSitioTop.length === 0 && <p className="text-slate-400">Sin datos.</p>}
          </ul>
        </Card>
        <Card title="Horario más afectado (franja)" descargable="horario-franja">
          {r.franjaTop ? (
            <div>
              <p className="text-lg font-bold text-slate-900">{r.franjaTop.key}</p>
              <p className="text-sm text-slate-500">{r.franjaTop.casos} casos · {formatDecimal(r.franjaTop.participacion)}% del total de la ventana</p>
            </div>
          ) : <p className="text-sm text-slate-400">Sin datos.</p>}
        </Card>
        <Card title="Barrios más afectados (Top 5)" descargable="barrios-mas-afectados">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Barrio</span><span>Casos (%)</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {r.barriosTop.map((b) => (
              <li key={b.key} className="flex justify-between"><span className="text-slate-700">{b.key}</span><span className="text-base font-semibold text-slate-900">{b.casos} <span className="font-normal text-slate-400">({formatDecimal(b.participacion)}%)</span></span></li>
            ))}
            {r.barriosTop.length === 0 && <p className="text-slate-400">Sin datos.</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
