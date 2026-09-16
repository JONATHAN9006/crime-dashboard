import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { aplicarFiltros } from '../utils/filters';
import { Card, PageHeader } from '../components/ui/Card';
import { KpiCard } from '../components/ui/KpiCard';
import { GroupedBarChart } from '../components/charts/GroupedBarChart';
import { formatNumero } from '../utils/aggregations';
import { IndicadorMultifecha } from '../components/filters/SelectorMultifecha';
import type { CrimeRecord, PeriodoAnalisis } from '../types/crime';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COLORES_PERIODO = ['#159089', '#64748b', '#0f766e', '#94a3b8', '#134e4a', '#cbd5e1'];

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

function construirTabla(porPeriodo: CrimeRecord[][], getter: (r: CrimeRecord) => string, limite: number) {
  const claves = new Set<string>();
  for (const recs of porPeriodo) for (const r of recs) claves.add(getter(r) || 'No reportado');
  const filas = Array.from(claves)
    .filter((c) => c !== 'NO REPORTADO' && c !== 'No reportado')
    .map((clave) => {
      const porcada = porPeriodo.map((recs) => recs.filter((r) => (getter(r) || 'No reportado') === clave).length);
      const total = porcada.reduce((a, b) => a + b, 0);
      return { clave, porcada, total };
    });
  return filas.sort((a, b) => b.total - a.total).slice(0, limite);
}

// Se muestra en vez del Comparativo homólogo (año actual vs año anterior)
// únicamente cuando hay periodos de análisis multifecha activos — el
// Comparativo de siempre sigue intacto para el caso de una sola fecha (ver
// Comparativo.tsx).
export function ComparativoMultifecha() {
  const { filters, records, periodos } = useData();

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

  const tablaDelito = useMemo(() => construirTabla(porPeriodo, (r) => r.delito, 12), [porPeriodo]);
  const tablaEstacion = useMemo(() => construirTabla(porPeriodo, (r) => r.estacion, 12), [porPeriodo]);
  const tablaBarrio = useMemo(() => construirTabla(porPeriodo, (r) => r.barrioHecho, 12), [porPeriodo]);
  const tablaModalidad = useMemo(() => construirTabla(porPeriodo, (r) => r.modalidad, 12), [porPeriodo]);
  const tablaArmas = useMemo(() => construirTabla(porPeriodo, (r) => r.armas, 12), [porPeriodo]);

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
  function Seccion({ titulo, columna, filas }: { titulo: string; columna: string; filas: ReturnType<typeof construirTabla> }) {
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
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 text-slate-700">{f.clave}</td>
                      {f.porcada.map((v, i) => (
                        <td key={encabezados[i]?.id ?? i} className="px-2 py-1.5 text-center text-slate-600">{formatNumero(v)}</td>
                      ))}
                      <td className="px-2 py-1.5 text-center font-semibold text-brand-navy">{formatNumero(f.total)}</td>
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

      <Seccion titulo="Delitos por periodo" columna="Delito" filas={tablaDelito} />
      <Seccion titulo="Casos por estación por periodo" columna="Estación" filas={tablaEstacion} />
      <Seccion titulo="Barrios más afectados por periodo" columna="Barrio" filas={tablaBarrio} />
      <Seccion titulo="Modalidad por periodo" columna="Modalidad" filas={tablaModalidad} />
      <Seccion titulo="Armas empleadas por periodo" columna="Arma" filas={tablaArmas} />
    </div>
  );
}
