import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, useXAxisScale, useYAxisScale } from 'recharts';
import { formatNumero } from '../../utils/aggregations';

export interface PuntoDiario {
  fecha: string; // "2026-08-24"
  dia: number;
  mes: number; // 0-11
  anio: number;
  mesNombre: string;
  casos: number;
}

interface TramoMes { mesNombre: string; anio: number; idxInicio: number; idxFin: number; color: string }

// Marca de agua POR MES: un número grande y muy tenue, centrado
// horizontalmente sobre el tramo de cada mes y pegado a la parte inferior
// del área de trazado — con el total de casos de ESE mes en particular (se
// recalcula solo con lo que traiga "dataFiltrada", así que ya responde al
// delito u otros filtros activos, sin necesidad de ningún cálculo aparte).
// Se renderiza como hijo del propio ComposedChart (igual que
// CapaEtiquetasSinColision en TrendChart.tsx) para poder usar las escalas
// reales de Recharts y ubicarse en el píxel exacto, sin importar el ancho
// del contenedor.
function MarcaAguaPorMes({ tramosPorMes, dataFiltrada }: { tramosPorMes: TramoMes[]; dataFiltrada: { idx: number; casos: number }[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;

  const rangoY = (yScale as any).range?.() as [number, number] | undefined;
  // Pegada al borde inferior real del área de trazado (con un pequeño
  // margen hacia adentro para no salirse del gráfico).
  const yInferior = rangoY ? Math.max(rangoY[0], rangoY[1]) - 18 : 0;

  return (
    <g>
      {tramosPorMes.map((t, i) => {
        const totalMes = dataFiltrada
          .filter((p) => p.idx >= t.idxInicio && p.idx <= t.idxFin)
          .reduce((acc, p) => acc + p.casos, 0);
        const xCentro = xScale((t.idxInicio + t.idxFin) / 2);
        if (xCentro === undefined || totalMes <= 0) return null;
        return (
          <text
            key={`${t.mesNombre}-${t.anio}-${i}`}
            x={xCentro}
            y={yInferior}
            textAnchor="middle"
            fontSize={32}
            fontWeight={800}
            fill={t.color}
            fillOpacity={0.22}
          >
            {formatNumero(totalMes)}
          </text>
        );
      })}
    </g>
  );
}

// Etiqueta comparativa POR MES: en la esquina superior izquierda de cada
// tramo de color, muestra el total de casos de AMBOS años para ese mismo
// mes calendario ("2025: 25 casos, 2026: 30 casos") — se recalcula solo a
// partir de "dataFiltrada" (que ya viene filtrada por delito u otros
// filtros activos), así que responde sola sin ningún cálculo aparte.
function EtiquetaComparativaPorMes({ tramosPorMes, dataFiltrada }: { tramosPorMes: TramoMes[]; dataFiltrada: { idx: number; casos: number }[] }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;

  const rangoY = (yScale as any).range?.() as [number, number] | undefined;
  const ySuperior = rangoY ? Math.min(rangoY[0], rangoY[1]) + 14 : 14;

  function totalDeTramo(t: TramoMes): number {
    return dataFiltrada.filter((p) => p.idx >= t.idxInicio && p.idx <= t.idxFin).reduce((acc, p) => acc + p.casos, 0);
  }

  return (
    <g>
      {tramosPorMes.map((t, i) => {
        const xIzq = xScale(t.idxInicio);
        if (xIzq === undefined) return null;
        const total = totalDeTramo(t);
        const otroTramo = tramosPorMes.find((t2) => t2.mesNombre === t.mesNombre && t2.anio !== t.anio);
        const partes: string[] = [];
        if (otroTramo) {
          const totalOtro = totalDeTramo(otroTramo);
          const par = t.anio < otroTramo.anio ? [[t.anio, total], [otroTramo.anio, totalOtro]] : [[otroTramo.anio, totalOtro], [t.anio, total]];
          for (const [anio, tot] of par) partes.push(`${anio}: ${formatNumero(tot)} casos`);
        } else {
          partes.push(`${t.anio}: ${formatNumero(total)} casos`);
        }
        return (
          <text key={`cmp-${t.mesNombre}-${t.anio}-${i}`} x={xIzq + 4} y={ySuperior} textAnchor="start" fontSize={11} fontWeight={700} fill={t.color} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
            {partes.join('   ·   ')}
          </text>
        );
      })}
    </g>
  );
}

// Paleta de tonos suaves y distintos entre sí (nada estridente), uno por mes,
// que se repite cíclicamente si se muestran más meses de los que tiene la paleta.
const PALETA_MESES = [
  '#116762', '#7c3aed', '#b45309', '#0891b2', '#be123c',
  '#4338ca', '#059669', '#c2410c', '#0369a1', '#9333ea',
  '#65a30d', '#475569',
];

function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes + 1).padStart(2, '0')}`;
}

export function TendenciaDiariaChart({ data, height = 320, onResumenChange }: {
  data: PuntoDiario[];
  height?: number;
  // Reporta hacia afuera, cada vez que cambia la selección de meses, el
  // detalle de casos por mes visible en ese momento — para que el
  // componente padre pueda mostrar el análisis (mes más afectado,
  // prioridad) fuera de esta gráfica, junto al título de la tarjeta.
  onResumenChange?: (resumen: { mesesTexto: string; porMes: { mesNombre: string; anio: number; casos: number }[]; porMesAnioAnterior: { mesNombre: string; anio: number; casos: number }[]; mostrarAnioAnterior: boolean }) => void;
}) {
  // Todos los meses disponibles en el conjunto de datos filtrado (para el
  // selector) — SOLO del año más reciente presente: el año anterior se usa
  // exclusivamente como línea de comparación (ver más abajo), nunca como
  // una opción más para elegir directamente, para no duplicar meses en el
  // selector.
  const anioMasReciente = data.length > 0 ? Math.max(...data.map((p) => p.anio)) : null;
  const mesesDisponibles = useMemo(() => {
    const mapa = new Map<string, { clave: string; anio: number; mes: number; mesNombre: string }>();
    for (const p of data) {
      if (p.anio !== anioMasReciente) continue;
      const clave = claveMes(p.anio, p.mes);
      if (!mapa.has(clave)) mapa.set(clave, { clave, anio: p.anio, mes: p.mes, mesNombre: p.mesNombre });
    }
    return Array.from(mapa.values()).sort((a, b) => a.clave.localeCompare(b.clave));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, anioMasReciente]);

  // Por defecto: los últimos 5 meses disponibles.
  const [mesesElegidos, setMesesElegidos] = useState<string[] | null>(null);
  // Controla si la línea de comparación del año anterior se muestra o no —
  // por defecto visible (si hay datos para comparar); el usuario puede
  // apagarla y volver a encenderla sin que eso afecte los datos, los
  // filtros ni los cálculos, solo lo que se dibuja en el gráfico.
  const [mostrarAnioAnterior, setMostrarAnioAnterior] = useState(true);
  const seleccionActiva = mesesElegidos ?? mesesDisponibles.slice(-5).map((m) => m.clave);

  function alternarMes(clave: string) {
    setMesesElegidos((prev) => {
      const base = prev ?? mesesDisponibles.slice(-5).map((m) => m.clave);
      return base.includes(clave) ? base.filter((c) => c !== clave) : [...base, clave].sort();
    });
  }

  const dataFiltrada = data
    .filter((p) => seleccionActiva.includes(claveMes(p.anio, p.mes)))
    // "idx" es una posición secuencial continua (0,1,2...) que NUNCA se repite,
    // a diferencia de "dia" (que sí se repite cada mes: 1,2,3...31,1,2,3...).
    // El eje X y las franjas de fondo por mes usan "idx" para ubicarse
    // correctamente; el número de día solo se usa para lo que se muestra en
    // pantalla (la etiqueta del eje y el tooltip).
    .map((p, idx) => ({ ...p, idx }));

  // Para cada día mostrado, se busca el MISMO día y mes pero del año
  // anterior (ej. 15 de abril de 2025 para el 15 de abril de 2026) — así se
  // puede comparar visualmente si el año actual realmente va por debajo del
  // anterior en el mismo tramo del calendario, en vez de asumirlo. Se
  // agrega como un campo aparte en la MISMA fila (mismo "idx"), no como
  // puntos independientes, para que ambas líneas compartan exactamente el
  // mismo eje X.
  const mapaAnioAnterior = new Map<string, number>();
  for (const p of data) {
    if (anioMasReciente !== null && p.anio === anioMasReciente - 1) {
      mapaAnioAnterior.set(`${p.mes}-${p.dia}`, p.casos);
    }
  }
  for (const p of dataFiltrada as (typeof dataFiltrada[number] & { casosAnioAnterior: number | null })[]) {
    p.casosAnioAnterior = mapaAnioAnterior.get(`${p.mes}-${p.dia}`) ?? null;
  }
  // ¿Hay al menos un día con dato del año anterior para comparar? Si no hay
  // ninguno (ej. el año anterior no tiene registros en esos meses todavía),
  // no se dibuja la línea ni se menciona en la leyenda — nunca se inventa.
  const hayComparacionAnioAnterior = dataFiltrada.some((p: any) => p.casosAnioAnterior !== null);

  // Reporta hacia afuera el detalle por mes de la selección actual, para que
  // el componente padre pueda mostrar el análisis (mes más afectado,
  // prioridad) junto al título — sin que esta gráfica necesite saber nada
  // de esa lógica.
  useEffect(() => {
    if (!onResumenChange) return;
    const porMesMapa = new Map<string, { mesNombre: string; anio: number; casos: number }>();
    const porMesAnioAnteriorMapa = new Map<string, { mesNombre: string; anio: number; casos: number }>();
    for (const p of dataFiltrada as (typeof dataFiltrada[number] & { casosAnioAnterior: number | null })[]) {
      const clave = claveMes(p.anio, p.mes);
      const entrada = porMesMapa.get(clave) ?? { mesNombre: p.mesNombre, anio: p.anio, casos: 0 };
      entrada.casos += p.casos;
      porMesMapa.set(clave, entrada);
      // Mismo mes calendario, año anterior — agregado a partir del MISMO
      // dato ya usado para dibujar la línea de comparación (casosAnioAnterior
      // por día), para que el mensaje de correlación entre años hable
      // exactamente de los mismos meses que el usuario tiene seleccionados.
      if (p.casosAnioAnterior !== null && anioMasReciente !== null) {
        const entradaAnterior = porMesAnioAnteriorMapa.get(clave) ?? { mesNombre: p.mesNombre, anio: anioMasReciente - 1, casos: 0 };
        entradaAnterior.casos += p.casosAnioAnterior;
        porMesAnioAnteriorMapa.set(clave, entradaAnterior);
      }
    }
    const porMes = Array.from(porMesMapa.values());
    const porMesAnioAnterior = Array.from(porMesAnioAnteriorMapa.values());
    const nombres = mesesDisponibles.filter((m) => seleccionActiva.includes(m.clave)).map((m) => m.mesNombre);
    const mesesTexto = nombres.length === 0 ? '' : nombres.length === 1 ? nombres[0] : `${nombres[0]} a ${nombres[nombres.length - 1]}`;
    onResumenChange({ mesesTexto, porMes, porMesAnioAnterior, mostrarAnioAnterior: hayComparacionAnioAnterior && mostrarAnioAnterior });
    // Firma de CONTENIDO (longitud + primera/última fecha), no la referencia
    // cruda del arreglo "data" — así, aunque algo aguas arriba vuelva a
    // generar un arreglo nuevo con el mismo contenido en cada render, este
    // efecto no se vuelve a disparar innecesariamente (la causa exacta del
    // bucle infinito que se corrigió).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(seleccionActiva), data.length, data[0]?.fecha, data[data.length - 1]?.fecha, mostrarAnioAnterior]);

  // Color fijo por mes (mismo color si el mismo mes vuelve a aparecer), no por
  // posición del tramo — así "Agosto" siempre se ve igual la elijas o no.
  const colorPorClave = new Map<string, string>();
  mesesDisponibles.forEach((m, i) => colorPorClave.set(m.clave, PALETA_MESES[i % PALETA_MESES.length]));

  const tramosPorMes: { mesNombre: string; anio: number; idxInicio: number; idxFin: number; color: string }[] = [];
  for (const p of dataFiltrada) {
    const clave = claveMes(p.anio, p.mes);
    const ultimo = tramosPorMes[tramosPorMes.length - 1];
    if (ultimo && ultimo.mesNombre === p.mesNombre && ultimo.anio === p.anio) {
      ultimo.idxFin = p.idx;
    } else {
      tramosPorMes.push({ mesNombre: p.mesNombre, anio: p.anio, idxInicio: p.idx, idxFin: p.idx, color: colorPorClave.get(clave)! });
    }
  }

  const esUnSoloMes = tramosPorMes.length === 1;

  // Marcas explícitas del eje X: una posición real (idx) cada ~5 días, para
  // que el eje numérico no genere posiciones intermedias que no correspondan
  // a ningún día real de los datos.
  const pasoTicks = Math.max(1, Math.ceil(dataFiltrada.length / 30));
  const ticksEje = dataFiltrada.filter((_, i) => i % pasoTicks === 0).map((p) => p.idx);

  return (
    <div>
      {/* Selector de meses: multi-selección, con el color que le corresponde a cada uno. */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {mesesDisponibles.map((m) => {
          const activo = seleccionActiva.includes(m.clave);
          const color = colorPorClave.get(m.clave)!;
          return (
            <button
              key={m.clave}
              onClick={() => alternarMes(m.clave)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={activo
                ? { backgroundColor: color, borderColor: color, color: '#fff' }
                : { backgroundColor: 'transparent', borderColor: '#cbd5e1', color: '#475569' }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activo ? '#fff' : color }} />
              {m.mesNombre.slice(0, 3)} {String(m.anio).slice(2)}
            </button>
          );
        })}
        {/* Checkbox para mostrar/ocultar la línea de comparación del año
            anterior — solo aparece si de verdad hay datos con qué comparar.
            Apagarlo NO borra los datos ni cambia ningún filtro/cálculo,
            solo deja de dibujar esa línea; se puede volver a activar en
            cualquier momento. */}
        {hayComparacionAnioAnterior && (
          <label className="ml-1 flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600">
            <input
              type="checkbox"
              checked={mostrarAnioAnterior}
              onChange={(e) => setMostrarAnioAnterior(e.target.checked)}
              className="h-3 w-3 accent-[#7c3aed]"
            />
            {anioMasReciente !== null ? anioMasReciente - 1 : ''}
          </label>
        )}
      </div>

      {dataFiltrada.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Selecciona al menos un mes para analizar.</p>
      ) : (
        <>
          {esUnSoloMes && (
            <p className="mb-2 text-sm font-semibold text-slate-600">
              Mes: {tramosPorMes[0].mesNombre} {tramosPorMes[0].anio}
            </p>
          )}
          {/* Marca de agua por mes: se dibuja DENTRO del ComposedChart (ver
              MarcaAguaPorMes arriba) para poder ubicarse con las
              coordenadas reales del gráfico. */}
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={dataFiltrada} margin={{ top: 20, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <MarcaAguaPorMes tramosPorMes={tramosPorMes} dataFiltrada={dataFiltrada} />
              <EtiquetaComparativaPorMes tramosPorMes={tramosPorMes} dataFiltrada={dataFiltrada} />
              {/* Fondo de color sólido y distinto por cada mes (verde
                  institucional más clarito para enero, y así sucesivamente),
                  ubicado con la posición secuencial "idx" — nunca se desalinea
                  aunque el número de día se repita mes a mes. */}
              {tramosPorMes.map((t, i) => (
                <ReferenceArea
                  key={i}
                  x1={t.idxInicio}
                  x2={t.idxFin}
                  fill={t.color}
                  fillOpacity={0.14}
                  stroke="none"
                  ifOverflow="extendDomain"
                  label={!esUnSoloMes ? { value: `${t.mesNombre.slice(0, 3)} ${String(t.anio).slice(2)}`, position: 'insideTop', fontSize: 10, fill: '#334155', fontWeight: 700 } : undefined}
                />
              ))}
              <XAxis
                dataKey="idx"
                type="number"
                domain={['dataMin', 'dataMax']}
                ticks={ticksEje}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickFormatter={(idx: number) => String(dataFiltrada[idx]?.dia ?? '')}
                label={{ value: 'Día del mes', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} width={40} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }}
                labelFormatter={((idx: number) => {
                  const p = dataFiltrada[idx];
                  return p ? `${p.dia} de ${p.mesNombre} de ${p.anio}` : '';
                }) as any}
                formatter={((v: any, name: string) => [formatNumero(Number(v)), name === 'casosAnioAnterior' ? `Mismo día, ${anioMasReciente !== null ? anioMasReciente - 1 : ''}` : 'Casos']) as any}
              />
              {/* Línea blanca con un contorno oscuro fino para que se vea
                  nítida sobre cualquiera de los fondos de color de mes. */}
              <Line type="monotone" dataKey="casos" stroke="#0f172a" strokeWidth={4} dot={false} isAnimationActive={false} legendType="none" />
              <Line type="monotone" dataKey="casos" stroke="#ffffff" strokeWidth={2} dot={dataFiltrada.length <= 45 ? { r: 3, fill: '#fff', stroke: '#0f172a', strokeWidth: 1 } : false} activeDot={{ r: 5, fill: '#fff', stroke: '#0f172a', strokeWidth: 1.5 }} legendType="none" />
              {/* Comparación con el mismo tramo del año anterior — morado
                  punteado (mismo color que representa "año anterior" en el
                  resto del dashboard), para contrastar claramente contra la
                  línea blanca/oscura del año actual y poder verificar si la
                  baja es real, no solo asumida. Solo se dibuja si de verdad
                  hay datos del año anterior para ese tramo. */}
              {hayComparacionAnioAnterior && mostrarAnioAnterior && (
                <Line
                  type="monotone"
                  dataKey="casosAnioAnterior"
                  name={`Mismo día, ${anioMasReciente !== null ? anioMasReciente - 1 : ''}`}
                  stroke="#7c3aed"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4, fill: '#7c3aed' }}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {hayComparacionAnioAnterior && mostrarAnioAnterior && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />}
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
