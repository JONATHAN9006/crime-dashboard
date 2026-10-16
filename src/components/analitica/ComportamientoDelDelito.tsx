import { useMemo, useState, type ReactNode } from 'react';
import { desplazarAnios, useVentanaComparativa } from '../../hooks/useComparativoHomologo';
import { MESES_NOMBRES } from '../../utils/aggregations';
import { colorAnio } from '../../utils/coloresAnio';
import { Card } from '../ui/Card';
import { TrendChart } from '../charts/TrendChart';
import { TendenciaAnualChart } from '../charts/TendenciaAnualChart';
import { ResumenTendenciaAnual } from './ResumenTendenciaAnual';
import { useAnalisisMensual } from '../../hooks/useAnalisisMensual';
import { useData } from '../../context/DataContext';
import type { BloqueAnalisis } from '../../utils/analisisTendencia';

// Color del encabezado de cada bloque según su emoji — mismo código de
// colores que ya usa el resto del dashboard para "favorable/desfavorable/
// neutral" (verde/rojo/amarillo), más un tono naranja propio para
// "Proyección" (💡) que lo distingue visualmente de los otros dos y lo
// asocia con el color de su línea en la gráfica (naranja).
const COLOR_POR_EMOJI: Record<string, string> = {
  '🟢': 'text-emerald-600',
  '🔴': 'text-rose-600',
  '🟡': 'text-amber-600',
  '💡': 'text-orange-500',
};

// Un bloque = un concepto (Tendencia / Comparación / Proyección), cada uno
// con su propio encabezado en mayúsculas y color, y una explicación en
// lenguaje llano debajo — nunca mezclados en un solo párrafo, tal como se
// pidió explícitamente ("MUY IMPORTANTE: diferenciar los tres conceptos").
function BloqueResumen({ bloque }: { bloque: BloqueAnalisis }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5">{bloque.emoji}</span>
      <div>
        <p className={`text-xs font-bold uppercase tracking-wide ${COLOR_POR_EMOJI[bloque.emoji] ?? 'text-slate-600'}`}>{bloque.etiqueta}</p>
        <p className="text-sm text-slate-700">{bloque.texto}</p>
      </div>
    </div>
  );
}

type ModoVista = 'mensual' | 'acumulado' | 'anual';


// Checkbox tipo pastilla, mutuamente excluyente con su pareja (funcionan
// como un selector de modo — nunca los dos activos a la vez) — mismo
// estilo visual que otros pares de checkbox ya usados en el dashboard (ver
// FiltroTendenciaBoton en ResumenEjecutivo.tsx).
// Controles con el aspecto de la referencia visual:
//  · años   → casilla de verificación con el color de su línea (2025 morado,
//             2026 verde petróleo), fondo claro;
//  · modo   → Mensual / Acumulado como opción única (radio), la activa en
//             verde petróleo relleno.
export function CheckboxModo({ etiqueta, activo, onClick, color, tipo = 'casilla' }: { etiqueta: string; activo: boolean; onClick: () => void; color?: string; tipo?: 'casilla' | 'radio' }) {
  if (tipo === 'radio') {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={activo}
        onClick={onClick}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${activo ? 'border-[#0f5f57] bg-[#0f5f57] text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}
      >
        <span className={`flex h-3 w-3 items-center justify-center rounded-full border ${activo ? 'border-white' : 'border-slate-400'}`}>
          {activo && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
        </span>
        {etiqueta}
      </button>
    );
  }
  const c = color ?? '#0f5f57';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activo}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
      style={{ borderColor: activo ? c : '#cbd5e1', backgroundColor: activo ? `${c}14` : '#ffffff', color: activo ? c : '#64748b' }}
    >
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border" style={{ borderColor: activo ? c : '#94a3b8', backgroundColor: activo ? c : 'transparent' }}>
        {activo && <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d="M1.5 5.2 4 7.6 8.6 2.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      {etiqueta}
    </button>
  );
}

// Convierte la serie mensual en un ACUMULADO por año: cada mes suma su
// valor real al total de los meses anteriores DE ESE MISMO AÑO (2025 y
// 2026 acumulan cada uno por su cuenta, nunca juntos). El valor mensual
// real (sin acumular) se conserva aparte, en un campo paralelo
// "{serie}_real", para poder seguir mostrándolo como etiqueta al pie de
// cada mes (ver TrendChart → mostrarValorMensualAlPie).
//
// "seriesSinEtiqueta" (la línea de tendencia/proyección) se acumula con la
// misma lógica, para que su forma siga siendo coherente con las líneas de
// 2025/2026 ya acumuladas — pero sin generar una etiqueta "_real" al pie
// para ella (esa etiqueta es solo para los casos reales por mes, no para
// una curva ajustada).
function construirSerieAcumulada(datos: Record<string, any>[], series: string[], seriesSinEtiqueta: string[] = []): Record<string, any>[] {
  const acumulados: Record<string, number> = {};
  return datos.map((fila) => {
    const nuevaFila: Record<string, any> = { ...fila };
    for (const serie of series) {
      const valorReal = fila[serie];
      if (valorReal === null || valorReal === undefined) continue;
      acumulados[serie] = (acumulados[serie] ?? 0) + valorReal;
      nuevaFila[`${serie}_real`] = valorReal;
      nuevaFila[serie] = acumulados[serie];
    }
    for (const serie of seriesSinEtiqueta) {
      const valorReal = fila[serie];
      if (valorReal === null || valorReal === undefined) continue;
      acumulados[serie] = (acumulados[serie] ?? 0) + valorReal;
      nuevaFila[serie] = acumulados[serie];
    }
    return nuevaFila;
  });
}

/**
 * "Comportamiento del delito" — el mismo componente de Tendencia Mensual
 * (gráfica + análisis automático de picos/valles + comparación contra el
 * año anterior) empaquetado para poder reutilizarse tanto en Indicadores
 * como en el Resumen, sin duplicar la lógica de cálculo.
 */
export function ComportamientoDelDelito({ height = 300, descargable, titulo = 'Tendencia mensual', subtitulo = 'Comparación entre los años disponibles', mostrarLectura = true, icono }: {
  height?: number;
  // false = sin los bloques de texto (Tendencia / Comparación / Proyección) debajo de la gráfica.
  mostrarLectura?: boolean;
  icono?: ReactNode;
  descargable?: string;
  titulo?: string;
  subtitulo?: string;
}) {
  const { mensualConTendencia, analisisMensual } = useAnalisisMensual();
  const { filters, records, recordsBase, meta } = useData();
  const [modo, setModo] = useState<ModoVista>('mensual');
  // Siempre la misma vista (mensual o anual) — con Fecha inicial/final ya no
  // se cambia a «Tendencia diaria»: el rango define el periodo evaluable.
  const esDiaria = false;

  // PERIODO EVALUABLE (regla única del dashboard, ver calcularVentanaFechas):
  // el periodo del año actual (ej. 1 ene – 11 oct de 2026, o el rango de
  // fechas elegido) y, para CADA año mostrado, ese MISMO periodo corrido a
  // su año. Si los años elegidos ya cerraron (ej. 2024 y 2025), son años
  // completos. Nada de «2025 completo contra 2026 a la fecha».
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const aniosMostrados = useMemo(() => {
    if (filters.anio.length > 0) return [...filters.anio].map(Number).sort((a, b) => a - b);
    return ventana.disponible ? [ventana.anioAnterior, ventana.anioActual] : [];
  }, [filters.anio, ventana]);
  const rangoDe = (anio: number) => {
    const salto = ventana.anioActual - anio;
    const ini = desplazarAnios(ventana.actualInicio, salto);
    ini.setHours(0, 0, 0, 0);
    const fin = desplazarAnios(ventana.actualFin, salto);
    fin.setHours(23, 59, 59, 999);
    return { ini, fin };
  };
  const { mensualPeriodo, totalesPeriodo } = useMemo(() => {
    const filas = Array.from({ length: 12 }, (_, i) => ({ mes: MESES_NOMBRES[i], mesIndex: i + 1 } as Record<string, any>));
    const totales: Record<string, number> = {};
    const mesesConDatos = new Set<number>();
    if (!ventana.disponible) return { mensualPeriodo: [] as Record<string, any>[], totalesPeriodo: totales };
    for (const anio of aniosMostrados) {
      const { ini, fin } = rangoDe(anio);
      const k = String(anio);
      totales[k] = 0;
      // Meses que toca el periodo (en 0 aunque no haya casos).
      for (let d = new Date(ini.getFullYear(), ini.getMonth(), 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
        if (d.getFullYear() === ini.getFullYear() || d.getFullYear() === fin.getFullYear()) {
          filas[d.getMonth()][k] = filas[d.getMonth()][k] ?? 0;
          mesesConDatos.add(d.getMonth());
        }
      }
      for (const r of recordsBase) {
        if (!r.fecha || r.fecha < ini || r.fecha > fin) continue;
        const m = r.fecha.getMonth();
        filas[m][k] = (filas[m][k] ?? 0) + 1;
        totales[k] += 1;
      }
    }
    // Tendencia / proyección del año actual (mismo cálculo de siempre).
    const tend = new Map(mensualConTendencia.map((m) => [(m as Record<string, any>).mes, m]));
    for (const f of filas) {
      const t = tend.get(f.mes) as Record<string, any> | undefined;
      f._tendencia = t?._tendencia ?? null;
      f._proyeccion = t?._proyeccion ?? null;
    }
    const visibles = filas.filter((f, i) => mesesConDatos.has(i) || f._proyeccion != null);
    return { mensualPeriodo: visibles, totalesPeriodo: totales };
  }, [aniosMostrados, ventana, recordsBase, mensualConTendencia]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtCorto = (d: Date) => `${d.getDate()} ${MESES_NOMBRES[d.getMonth()].slice(0, 3).toLowerCase()}`;
  const textoPeriodo = ventana.disponible
    ? `${fmtCorto(ventana.actualInicio)} – ${fmtCorto(ventana.actualFin)} de cada año`
    : '';

  const sufijoDelito = filters.delito.length === 0 ? 'Todos los Delitos' : filters.delito.join(', ');
  const prefijoTitulo = modo === 'anual' ? 'Tendencia Anual' : titulo;
  const tituloConDelito = `${prefijoTitulo} — ${sufijoDelito}`;
  const subtituloMostrado = `${modo === 'anual' ? 'Casos totales por año' : 'Casos por mes'} · mismo periodo evaluable: ${textoPeriodo}`;
  void subtitulo;

  const seriesKeys = aniosMostrados.map(String);
  const [aniosOcultos, setAniosOcultos] = useState<Set<string>>(new Set());
  const seriesKeysVisibles = seriesKeys.filter((k) => !aniosOcultos.has(k));
  const coloresSeries = Object.fromEntries(seriesKeys.map((k, i) => [k, colorAnio(i, seriesKeys.length)]));
  // Totales por año: SOLO el periodo evaluable de cada año.
  const datosAnuales = seriesKeysVisibles.map((k) => ({ anio: k, casos: totalesPeriodo[k] ?? 0, color: coloresSeries[k] }));
  const esAcumulado = !esDiaria && modo === 'acumulado';
  const datosGrafica = esAcumulado
    ? construirSerieAcumulada(mensualPeriodo, seriesKeys, ['_tendencia', '_proyeccion'])
    : mensualPeriodo;
  // La tendencia/proyección se ajustó sobre TOTALES MENSUALES (ver
  // analisisTendencia.ts) — no tiene sentido mostrarla superpuesta en la
  // vista diaria, cuya escala y agregación son completamente distintas.
  const periodoPorDefecto = !filters.fechaInicial && !filters.fechaFinal && filters.mes.length === 0;
  const mostrarTendencia = !esDiaria && periodoPorDefecto && !!analisisMensual.tendenciaGeneral.lineaTendencia;

  return (
    <Card
      title={tituloConDelito}
      subtitle={subtituloMostrado}
      descargable={descargable}
      icono={icono}
      claseTitulo={icono ? 'text-[15px] font-bold text-[#10233f]' : undefined}
      actions={!esDiaria ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {seriesKeys.map((anio) => (
            <CheckboxModo
              key={anio}
              etiqueta={anio}
              color={coloresSeries[anio]}
              activo={!aniosOcultos.has(anio)}
              onClick={() => setAniosOcultos((prev) => {
                const nuevo = new Set(prev);
                if (nuevo.has(anio)) nuevo.delete(anio);
                else if (nuevo.size < seriesKeys.length - 1) nuevo.add(anio); // nunca ocultar el último año visible
                return nuevo;
              })}
            />
          ))}
          <div role="radiogroup" aria-label="Vista de la tendencia" className="ml-1 flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <CheckboxModo tipo="radio" etiqueta="Mensual" activo={modo !== 'anual'} onClick={() => setModo('mensual')} />
            <CheckboxModo tipo="radio" etiqueta="Anual" activo={modo === 'anual'} onClick={() => setModo('anual')} />
          </div>
        </div>
      ) : undefined}
    >
      {modo === 'anual' ? (
        <>
          <ResumenTendenciaAnual datos={datosAnuales} etiquetaTotal="Total de casos" notaTotal={`${sufijoDelito} · ${textoPeriodo}`} />
          <TendenciaAnualChart datos={datosAnuales} height={height} top={Math.min(3, datosAnuales.length)} />
        </>
      ) : (
        <>
          <TrendChart
            data={datosGrafica}
            xKey="mes"
            seriesKeys={seriesKeysVisibles}
            seriesColors={coloresSeries}
            resaltarMaximos={Math.min(3, mensualPeriodo.length)}
            mostrarLineaTendencia={mostrarTendencia && seriesKeysVisibles.length === seriesKeys.length}
            mostrarValorMensualAlPie={esAcumulado}
            height={height}
          />
          {/* data-ocultar-en-descarga: estos tres bloques (Tendencia/
              Comparación/Proyección) se ven normalmente en el dashboard, pero
              se excluyen de la imagen descargada a pedido explícito — el
              usuario los agrega manualmente después. El mecanismo ya existe en
              exportarImagen.ts (el mismo que oculta la cuadrícula de fondo en
              las descargas) y funciona con solo este atributo, sin tocar nada
              más de la lógica de exportación genérica. */}
{mostrarLectura && (
          <div data-ocultar-en-descarga="1" className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
            <BloqueResumen bloque={analisisMensual.bloqueTendencia} />
            {analisisMensual.bloqueComparacion && <BloqueResumen bloque={analisisMensual.bloqueComparacion} />}
            {analisisMensual.disponible && analisisMensual.bloqueProyeccion && <BloqueResumen bloque={analisisMensual.bloqueProyeccion} />}
          </div>
          )}
        </>
      )}
    </Card>
  );
}
