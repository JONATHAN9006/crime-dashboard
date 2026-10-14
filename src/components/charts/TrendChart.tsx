import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { formatNumero } from '../../utils/aggregations';

const COLORES = ['#10233f', '#116762', '#b45309', '#7c3aed', '#0891b2'];

// Mostrar el número sobre cada punto solo tiene sentido cuando hay pocos
// puntos (ej. 12 meses). Con series largas (ej. tendencia diaria de varios
// meses) satura la lectura y las líneas se mezclan con el texto — en esos
// casos el detalle exacto se consulta con el tooltip, tal como se pidió.
const LIMITE_ETIQUETAS_VISIBLES = 15;

// Separación mínima (en píxeles) que deben guardar dos etiquetas para no
// verse encimadas — un poco más que la altura real del texto (12px en
// negrita, con su propio interlineado), para dejar aire visible entre una y
// otra, no solo evitar que se toquen literalmente. Subida de 20 a 28: en
// cruces muy cerrados (ej. dos meses donde las líneas casi se tocan) 20px
// todavía dejaba los números casi pegados entre sí.
const SEPARACION_MINIMA_PX = 28;
// Distancia normal (sin conflicto) entre la etiqueta y su punto — 16px deja
// un espacio visualmente claro por encima del radio del marcador (r=3)
// sin quedar pegada, pero sin ser un salto exagerado.
const OFFSET_NORMAL_PX = 16;

/**
 * Capa de etiquetas de valor con detección de colisiones REAL: usa las
 * escalas ya calculadas por Recharts (useXAxisScale/useYAxisScale — la API
 * de Recharts 3.x para esto; "Customized" quedó obsoleto) para saber
 * EXACTAMENTE en qué píxel caería cada número, y solo separa las etiquetas
 * que de verdad quedarían demasiado cerca — el resto conserva su posición
 * normal. Se renderiza como un hijo normal del gráfico (ya no como
 * "Customized"), tal como recomienda Recharts 3.x.
 *
 * POSICIÓN PREFERENTE POR SERIE (no solo durante colisiones — es la regla
 * general): la PRIMERA serie del arreglo (el año más antiguo — la que
 * TrendChart pinta de morado vía seriesColors, ver más abajo) va SIEMPRE
 * debajo de su punto; la ÚLTIMA serie (el año más reciente, verde) va
 * SIEMPRE arriba del suyo. Cuando los dos puntos de un mismo mes quedan
 * demasiado cerca (o las líneas se cruzan), NUNCA se invierte cuál va
 * arriba/abajo — en vez de eso, se agranda dinámicamente el desplazamiento
 * de ambas por partes iguales hasta lograr una separación mínima segura,
 * calculada a partir de la posición Y real de cada punto (nunca un
 * desplazamiento fijo igual para todos los meses).
 */
function CapaEtiquetasSinColision({ data, xKey, seriesKeys, seriesColors }: {
  data: Record<string, any>[];
  xKey: string;
  seriesKeys: string[];
  seriesColors: (i: number) => string;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;

  // Límites reales del área de trazado (en píxeles) — para que ninguna
  // etiqueta, tras agrandar su desplazamiento evitando una colisión, termine
  // saliéndose por el borde superior o inferior del gráfico. "range()" es un
  // método estándar de las escalas d3 que usa Recharts por dentro; no está
  // tipado en AxisScale, de ahí el "as any" puntual solo para leerlo.
  const rangoY = (yScale as any).range?.() as [number, number] | undefined;
  const MARGEN_BORDE_PX = 6;
  const limiteSuperior = rangoY ? Math.min(rangoY[0], rangoY[1]) + MARGEN_BORDE_PX : -Infinity;
  const limiteInferior = rangoY ? Math.max(rangoY[0], rangoY[1]) - MARGEN_BORDE_PX : Infinity;
  const dentroDelArea = (y: number) => Math.min(Math.max(y, limiteSuperior), limiteInferior);

  const etiquetas: { x: number; y: number; texto: string; color: string; key: string }[] = [];

  data.forEach((fila, indiceFila) => {
    const x = xScale(fila[xKey]);
    if (x === undefined) return;

    // Posición Y real de cada serie en esta fila, más su dirección
    // preferente — se omite si esa serie no tiene dato en esta fila (nunca
    // se inventa una posición para un valor inexistente).
    const puntos = seriesKeys
      .map((k, i) => {
        const valor = fila[k];
        if (valor === null || valor === undefined) return null;
        const yPunto = yScale(valor);
        if (yPunto === undefined) return null;
        // direccion 1 = etiqueta DEBAJO del punto (y aumenta hacia abajo en
        // SVG); direccion -1 = etiqueta ARRIBA. Primera serie → debajo;
        // última serie → arriba; cualquier serie intermedia (3+ series,
        // caso excepcional no descrito explícitamente) alterna entre las dos.
        const esPrimera = i === 0;
        const esUltima = i === seriesKeys.length - 1;
        const direccion: 1 | -1 = esPrimera ? 1 : esUltima ? -1 : (i % 2 === 0 ? 1 : -1);
        return { key: k, color: seriesColors(i), valor, yPunto, direccion };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (puntos.length === 0) return;

    if (puntos.length === 1) {
      const p = puntos[0];
      etiquetas.push({ x, y: dentroDelArea(p.yPunto + p.direccion * OFFSET_NORMAL_PX), texto: formatNumero(p.valor), color: p.color, key: `${indiceFila}-${p.key}` });
      return;
    }

    // Posición NATURAL de cada etiqueta: junto a su propio punto, en su
    // dirección preferente (primera serie/2025 debajo, última serie/2026
    // arriba). A partir de aquí, la separación de colisiones se resuelve
    // SIEMPRE según el orden real que quedó en pantalla ese mes en
    // particular — nunca asumiendo de antemano cuál de las dos series va a
    // terminar más arriba o más abajo en píxeles. Esto es clave: la
    // relación entre valores puede invertirse de un mes a otro (ej.
    // Septiembre, donde 2025 queda muy por ENCIMA de 2026 en vez de por
    // debajo, al desplomarse la línea verde) — calcular la distancia
    // asumiendo un orden fijo (en vez del orden real de ese mes) es
    // exactamente lo que antes producía un salto enorme y en la dirección
    // equivocada en esos casos.
    const conPosicionNatural = puntos.map((p) => ({ ...p, yEtiqueta: p.yPunto + p.direccion * OFFSET_NORMAL_PX }));

    // Se ordena por posición Y real (la más alta en pantalla primero) y solo
    // se separan los pares CONSECUTIVOS que de verdad queden más cerca que
    // SEPARACION_MINIMA_PX, empujando cada una en partes iguales EN LA
    // DIRECCIÓN QUE YA TRAÍA (la de arriba, más arriba todavía; la de abajo,
    // más abajo todavía) — así nunca se le da la vuelta a cuál queda arriba
    // o abajo, solo se agranda la separación cuando hace falta. Si ya están
    // suficientemente lejos (como en Septiembre, con las líneas muy
    // separadas), la distancia ya es holgada y no se les toca nada.
    const ordenados = [...conPosicionNatural].sort((a, b) => a.yEtiqueta - b.yEtiqueta);
    for (let i = 0; i < ordenados.length - 1; i++) {
      const distancia = ordenados[i + 1].yEtiqueta - ordenados[i].yEtiqueta;
      if (distancia < SEPARACION_MINIMA_PX) {
        const faltante = SEPARACION_MINIMA_PX - distancia;
        ordenados[i].yEtiqueta -= faltante / 2;
        ordenados[i + 1].yEtiqueta += faltante / 2;
      }
    }
    ordenados.forEach((p) => {
      etiquetas.push({ x, y: dentroDelArea(p.yEtiqueta), texto: formatNumero(p.valor), color: p.color, key: `${indiceFila}-${p.key}` });
    });
  });

  // En gráficas angostas (celular, tarjetas pequeñas) los números de meses
  // vecinos se montaban: el tamaño de letra se ajusta a la separación real
  // entre puntos (14 px en escritorio, hasta 9,5 px en pantallas chicas).
  const posicionesX = data.map((f) => xScale(f[xKey])).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  let paso = Infinity;
  for (let i = 1; i < posicionesX.length; i++) paso = Math.min(paso, posicionesX[i] - posicionesX[i - 1]);
  const tamanoEtiqueta = Number.isFinite(paso) ? Math.max(9.5, Math.min(14, paso * 0.45)) : 14;

  return (
    <g>
      {etiquetas.map((e) => (
        // paintOrder="stroke": el contorno blanco se dibuja ANTES que el
        // relleno de color — así queda como un halo detrás del número. Esto
        // resuelve de raíz el problema de que una línea (2025 o 2026) pase
        // justo por detrás de una etiqueta y la "corte" visualmente: sin
        // importar el ángulo o la curva exacta de esa línea en ese punto
        // (que cambia de mes a mes y nunca se puede prever con un solo
        // número de píxeles fijo), el halo blanco tapa ese tramo de línea
        // detrás del texto y el número se lee limpio siempre.
        <text
          key={e.key}
          x={e.x}
          y={e.y}
          textAnchor="middle"
          fontSize={tamanoEtiqueta}
          fontWeight={700}
          fill={e.color}
          stroke="#ffffff"
          strokeWidth={tamanoEtiqueta < 12 ? 3 : 4}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {e.texto}
        </text>
      ))}
    </g>
  );
}

// Etiqueta al pie de cada mes (SOLO cuando "mostrarValorMensualAlPie" está
// activo — modo "Acumulado"): el valor MENSUAL real de cada serie (no el
// acumulado que dibuja la línea), pegado cerca del borde inferior del área
// de trazado. Usa las mismas escalas reales de Recharts que
// CapaEtiquetasSinColision (nunca un tick de eje personalizado — ese
// mecanismo resultó menos confiable con Recharts y llegó a impedir que las
// líneas se dibujaran correctamente).
function EtiquetasValorMensualAlPie({ data, xKey, seriesKeys, obtenerColor }: {
  data: Record<string, any>[];
  xKey: string;
  seriesKeys: string[];
  obtenerColor: (i: number) => string;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;

  const rangoY = (yScale as any).range?.() as [number, number] | undefined;
  const yInferior = rangoY ? Math.max(rangoY[0], rangoY[1]) : 0;

  return (
    <g>
      {data.map((fila, indiceFila) => {
        const x = xScale(fila[xKey]);
        if (x === undefined) return null;
        return seriesKeys.map((k, i) => {
          const valorReal = fila[`${k}_real`];
          if (valorReal === null || valorReal === undefined) return null;
          return (
            <text
              key={`${indiceFila}-${k}`}
              x={x}
              y={yInferior + 14 + i * 13}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill={obtenerColor(i)}
            >
              {formatNumero(valorReal)}
            </text>
          );
        });
      })}
    </g>
  );
}

// Recuadro rojo en los meses con MÁS casos (top N): para cada mes se toma el
// valor más alto entre los años visibles; los N meses con ese máximo mayor se
// marcan con una franja roja suave, borde rojo punteado y un rótulo arriba
// («Marzo · 12 casos · máx. 2025»). Solo se usan los datos reales graficados.
function CapaMaximosMes({ data, xKey, seriesKeys, top }: { data: Record<string, any>[]; xKey: string; seriesKeys: string[]; top: number }) {
  const xScale = useXAxisScale();
  const area = usePlotArea();
  if (!xScale || !area || top <= 0) return null;
  const yArriba = area.y;
  const yAbajo = area.y + area.height;
  const xs = data.map((f) => xScale(f[xKey])).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  let paso = 60;
  for (let i = 1; i < xs.length; i++) paso = Math.min(paso, xs[i] - xs[i - 1]);
  const ancho = Math.max(18, paso * 0.7);
  const maximos = data
    .map((f) => {
      let mejor: { anio: string; valor: number } | null = null;
      for (const k of seriesKeys) {
        const v = f[k];
        if (typeof v === 'number' && v > 0 && (!mejor || v > mejor.valor)) mejor = { anio: k, valor: v };
      }
      return mejor ? { etiqueta: String(f[xKey]), x: xScale(f[xKey]), ...mejor } : null;
    })
    .filter((m): m is { etiqueta: string; x: number; anio: string; valor: number } => !!m && typeof m.x === 'number')
    .sort((a, b) => b.valor - a.valor)
    .slice(0, top);
  const compacto = paso < 96;
  // Ancho del rótulo: nunca más que la separación entre meses (no se montan).
  const anchoRotulo = compacto ? Math.max(40, Math.min(70, paso - 4)) : 92;
  const muyAngosto = anchoRotulo < 62;
  const dentro = (x: number, w: number) => Math.min(Math.max(x, area.x + w / 2), area.x + area.width - w / 2);
  return (
    <g>
      {maximos.map((m) => (
        <g key={m.etiqueta}>
          <rect x={dentro(m.x, ancho) - ancho / 2} y={yArriba} width={ancho} height={yAbajo - yArriba} rx={4} fill="#ef4444" fillOpacity={0.07} stroke="#dc2626" strokeWidth={1.4} strokeDasharray="5 3" />
          <g transform={`translate(${dentro(m.x, anchoRotulo)}, ${yArriba - 4})`}>
            <rect x={-anchoRotulo / 2} y={-46} width={anchoRotulo} height={44} rx={5} fill="#dc2626" />
            <text textAnchor="middle" y={-33} fontSize={compacto ? 10.5 : 11.5} fontWeight={700} fill="#fff">{compacto ? m.etiqueta.slice(0, 3) : m.etiqueta}</text>
            <text textAnchor="middle" y={-20} fontSize={compacto ? 10 : 11} fontWeight={700} fill="#fff">{formatNumero(m.valor)}{muyAngosto ? '' : m.valor === 1 ? ' caso' : ' casos'}</text>
            <text textAnchor="middle" y={-8} fontSize={compacto ? 9.5 : 10.5} fontWeight={600} fill="#fee2e2">{compacto ? (muyAngosto ? m.anio : `máx. ${m.anio}`) : `(máximo ${m.anio})`}</text>
          </g>
        </g>
      ))}
    </g>
  );
}

export function TrendChart({ data, xKey, seriesKeys, height = 300, mostrarValores, seriesColors, mostrarLineaTendencia, mostrarValorMensualAlPie, resaltarMaximos = 0 }: {
  // Marca con recuadro rojo los N meses con más casos (0 = no marcar).
  resaltarMaximos?: number;
  data: Record<string, any>[];
  xKey: string;
  seriesKeys: string[];
  height?: number;
  mostrarValores?: boolean;
  // Permite forzar el color de una serie puntual (ej. la línea de un año
  // específico) sin afectar el color por defecto en los demás usos de esta
  // misma gráfica en el resto del dashboard.
  seriesColors?: Record<string, string>;
  // Dibuja la línea de tendencia (naranja, punteada, inclinada según la
  // dirección real calculada) — requiere que "data" ya incluya una clave
  // "_tendencia" con el valor ajustado por punto (ver
  // src/utils/analisisTendencia.ts). A propósito NO es una línea de
  // promedio ni una posición fija: sigue la pendiente real de la serie.
  mostrarLineaTendencia?: boolean;
  // Modo "Acumulado" (ver ComportamientoDelDelito.tsx): cuando estas dos
  // líneas grafican un ACUMULADO mes a mes, "data" trae además, por cada
  // serie, un campo paralelo "{serie}_real" con el valor MENSUAL real de
  // ese mes (no acumulado) — con esta bandera en true, ese valor real se
  // pinta como una etiqueta pequeña al pie de cada mes, en el eje X.
  mostrarValorMensualAlPie?: boolean;
}) {
  const mostrar = mostrarValores ?? data.length <= LIMITE_ETIQUETAS_VISIBLES;
  // Ancho real del gráfico: en tarjetas angostas los meses se abrevian (Ene, Feb…).
  const [anchoGrafica, setAnchoGrafica] = useState(0);

  return (
    <div>
      {/* Especificación de leyenda SOLO para la exportación — invisible en
          pantalla (display:none real, nunca se muestra ni se anima), no
          reemplaza ni modifica la leyenda nativa de <Legend/> de más abajo,
          que sigue exactamente igual en el dashboard. exportarImagen.ts lee
          estos elementos (texto + color, tomados de las MISMAS constantes
          que ya usa cada <Line/>, nunca un valor aparte) para dibujar, solo
          en la imagen descargada, una leyenda propia perfectamente centrada
          y distribuida — la leyenda nativa de Recharts se posiciona con
          cálculos absolutos pensados para el tamaño en pantalla, que no se
          adaptan de forma confiable al canvas final de la descarga. */}
      <div className="hidden">
        {seriesKeys.map((k, i) => (
          <span key={k} data-export-leyenda-item data-color={seriesColors?.[k] ?? COLORES[i % COLORES.length]}>{k}</span>
        ))}
        {mostrarLineaTendencia && <span data-export-leyenda-item data-color="#ea580c">Tendencia</span>}
        {mostrarLineaTendencia && <span data-export-leyenda-item data-color="#fdba74">Proyección</span>}
      </div>
      <ResponsiveContainer width="100%" height={height} onResize={(w) => setAnchoGrafica(w)}>
      <LineChart data={data} margin={{ top: resaltarMaximos > 0 ? 66 : 34, right: 30, left: 4, bottom: mostrarValorMensualAlPie ? 10 + seriesKeys.length * 13 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: '#64748b' }}
          axisLine={{ stroke: '#e2e8f0' }}
          minTickGap={data.length > 40 ? 24 : 8}
          interval={data.length <= 12 ? 0 : 'preserveEnd'}
          tickFormatter={(v: string) => (data.length > 9 && typeof v === 'string' && /^[A-Za-zÁÉÍÓÚáéíóúñ]+$/.test(v) && anchoGrafica > 0 && anchoGrafica / data.length < 62 ? v.slice(0, 3) : v)}
        />
        <YAxis domain={[0, (max: number) => Math.ceil(max * 1.18)]} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} width={40} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13, border: '1px solid #e2e8f0' }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {mostrarLineaTendencia && (
          <Line
            type="monotone"
            dataKey="_tendencia"
            name="Tendencia"
            stroke="#ea580c"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
        {mostrarLineaTendencia && (
          <Line
            type="monotone"
            dataKey="_proyeccion"
            name="Proyección"
            // Mismo color naranja de la tendencia (misma recta continuada),
            // pero más clara y con un patrón punteado distinto — para que
            // sea inequívoco que esta parte es una estimación hacia
            // adelante, nunca un dato real observado.
            stroke="#fdba74"
            strokeWidth={2}
            strokeDasharray="2 3"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls
          />
        )}
        {resaltarMaximos > 0 && <CapaMaximosMes data={data} xKey={xKey} seriesKeys={seriesKeys} top={resaltarMaximos} />}
        {seriesKeys.map((k, i) => {
          const color = seriesColors?.[k] ?? COLORES[i % COLORES.length];
          return (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={color}
              strokeWidth={2.5}
              dot={data.length <= 40 ? { r: 3 } : false}
              activeDot={{ r: 5 }}
            />
          );
        })}
        {mostrar && (
          <CapaEtiquetasSinColision
            data={data}
            xKey={xKey}
            seriesKeys={seriesKeys}
            seriesColors={(i) => seriesColors?.[seriesKeys[i]] ?? COLORES[i % COLORES.length]}
          />
        )}
        {mostrarValorMensualAlPie && (
          <EtiquetasValorMensualAlPie
            data={data}
            xKey={xKey}
            seriesKeys={seriesKeys}
            obtenerColor={(i) => seriesColors?.[seriesKeys[i]] ?? COLORES[i % COLORES.length]}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
