import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  useAnalisisPeriodos, useSemanasDisponibles, useMesesDisponibles, dividirEnSemanas, type PeriodoDef,
} from '../hooks/useAnalisisPeriodos';
import { semanaIso, totalCasos } from '../utils/aggregations';
import { analizarSemanas, detectarRezago } from '../analitica/semanas';
import { EvolucionSemanal } from '../components/semanas/EvolucionSemanal';
import { maxDe } from '../utils/mathSeguro';
import { Card, EmptyState, PageHeader } from '../components/ui/Card';
import { MultiSelect } from '../components/filters/MultiSelect';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { formatDecimal, formatFecha } from '../utils/aggregations';

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

      <EvolucionSemanal
        periodos={r.periodos}
        analisis={analisis}
        rezago={modo === 'ultimas4' ? rezago : null}
        cortado={modo === 'ultimas4' ? corte : null}
        onCortarAntesDelRezago={modo === 'ultimas4' && rezago ? () => setCorte(new Date(rezago.desde.getTime() - 86400000)) : undefined}
        onQuitarCorte={() => setCorte(null)}
        totalVentana={r.totalVentana}
        estacionTop={r.estacionTop}
      />

      <Card title={`Evolución ${modo === 'mes' ? 'semanal dentro del mes' : 'por período'} — Top 5 delitos`} subtitle="Cada barra indica el número de semana real del calendario. El delito con mayor incidencia se resalta automáticamente en rojo." descargable="evolucion-top5">
        <GroupedBarChart data={datosGrafico} xKey="periodo" seriesKeys={topDelitosGrafico.map((d) => d.delito)} seriesColors={coloresDelitos} height={300} />
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
