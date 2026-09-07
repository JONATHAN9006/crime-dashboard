import { formatNumero, formatDecimal } from '../../utils/aggregations';

export interface FilaAporte {
  key: string;
  casos: number;
  aportePct: number;
}

// Paleta institucional: verde institucional y gris medio-oscuro alternados
// para las barras normales — la misma que usa el resto del dashboard.
const PALETA_BARRAS = ['#159089', '#94a3b8'];
// La barra con más casos se resalta en un verde más oscuro que el
// institucional, con un borde punteado rojo, para que se distinga de
// inmediato cuál es el máximo — igual que en HorizontalBarChart.
const VERDE_MAXIMO = '#0b4a46';

// Grid con columnas de ancho EXPLÍCITO (no flex) — compartido entre el
// encabezado y cada fila, para que las cuatro columnas (categoría, barra,
// valor, aporte) queden siempre en la misma posición. Se usa CSS Grid en
// vez de flex porque html2canvas (el motor detrás de la descarga en
// imagen) calcula mal el reparto de "flex: 1" en ciertos casos — con
// columnas de grid explícitas (incluyendo "1fr" para la barra) el ancho de
// cada columna es un valor fijo y determinista, sin ambigüedad posible al
// exportar.
const COLUMNAS_GRID = '130px minmax(0, 1fr) 56px 64px';

/**
 * Lista de barras horizontales con una columna de "Aporte %" REAL — todas
 * las filas comparten exactamente el mismo eje vertical de columnas
 * (categoría | barra | valor | aporte), construida con grid (no flex, ver
 * nota arriba) precisamente para poder garantizar esa alineación exacta
 * que un gráfico de Recharts no puede asegurar entre filas independientes.
 *
 * Distribución horizontal: CATEGORÍA → BARRA → VALOR → APORTE, con "APORTE"
 * como encabezado centrado sobre su propia columna — nunca un porcentaje
 * flotando suelto encima del gráfico.
 */
export function AporteBarList({ data, onBarClick, resaltarMaximo = true }: {
  data: FilaAporte[];
  onBarClick?: (key: string) => void;
  resaltarMaximo?: boolean;
}) {
  const maxCasos = Math.max(1, ...data.map((d) => d.casos));

  return (
    <div>
      {/* Encabezado: solo "APORTE", centrado exactamente sobre la columna de
          porcentajes — las demás columnas no llevan título, igual que en la
          referencia visual. data-export-fila también aquí para que la
          exportación le aplique la MISMA separación reducida entre
          columnas que a las filas de datos, y quede alineado con ellas. */}
      <div data-export-fila="true" className="mb-1 grid items-center gap-3" style={{ gridTemplateColumns: COLUMNAS_GRID }}>
        <div />
        <div />
        <div />
        <div data-export-texto="aporte-header" className="text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">Aporte</div>
      </div>

      <div className="space-y-1.5">
        {data.map((d, i) => {
          // El dashboard conserva su diseño ORIGINAL (barra hasta el 100%
          // del ancho disponible) — la reducción de ancho pedida se aplica
          // ÚNICAMENTE en la imagen exportada, marcando el contenedor con
          // data-export-track (ver exportarImagen.ts), nunca aquí, para no
          // volver a modificar lo que se ve en pantalla.
          const anchoPct = Math.max(2, (d.casos / maxCasos) * 100);
          const esMaximo = resaltarMaximo && d.casos === maxCasos && maxCasos > 0;
          const color = esMaximo ? VERDE_MAXIMO : PALETA_BARRAS[i % PALETA_BARRAS.length];
          return (
            <div
              key={d.key}
              // data-export-fila: marca la fila completa para que, SOLO en
              // la exportación, reciba más alto (para que ninguna letra se
              // recorte) y menos separación horizontal entre columnas
              // (para que casos/aporte queden más pegados a la barra) —
              // nunca se toca en el dashboard, que sigue con su
              // "gap-3" y alto normales.
              data-export-fila="true"
              className={`grid items-center gap-3 ${onBarClick ? 'cursor-pointer' : ''}`}
              style={{ gridTemplateColumns: COLUMNAS_GRID }}
              onClick={() => onBarClick?.(d.key)}
            >
              <div data-export-texto="etiqueta" className="truncate text-xs font-medium text-slate-700 sm:text-sm" title={d.key}>{d.key}</div>
              <div className="min-w-0 py-0.5">
                {/* data-export-track: marca el contenedor completo de la
                    barra (borde + fondo gris + relleno de color) para que
                    SOLO la exportación (nunca esta vista) le reduzca el
                    ancho total — así el fondo gris y el color se achican
                    juntos, en vez de solo el color por dentro de un fondo
                    que se queda igual de ancho. */}
                <div
                  data-export-track="true"
                  className="rounded"
                  style={esMaximo ? { border: '2px dashed #dc2626', padding: '2px' } : undefined}
                >
                  <div className="h-4 overflow-hidden rounded bg-slate-100">
                    <div
                      className="h-4 rounded transition-all"
                      style={{ width: `${anchoPct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              </div>
              <div data-export-texto="valor" className="text-right text-xs font-semibold text-slate-800 sm:text-sm">{formatNumero(d.casos)}</div>
              <div data-export-texto="aporte" className="text-center text-xs font-bold text-slate-600 sm:text-sm">{formatDecimal(d.aportePct, 1)}%</div>
            </div>
          );
        })}
        {data.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Sin datos.</p>}
      </div>
    </div>
  );
}
