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
// Variante compacta (Operatividad por Unidad): la columna del nombre mide lo
// que mide el nombre más largo de ESA tarjeta (con tope del 42 %), así la
// barra empieza justo después del texto, sin un hueco grande en medio.
// Se calcula aparte (no con "max-content") porque cada fila es su propio
// grid y todas deben quedar alineadas.
function anchoTextoAprox(texto: string): number {
  let px = 0;
  for (const ch of texto) px += ch === ' ' ? 3.4 : /[A-ZÁÉÍÓÚÑ0-9]/.test(ch) ? 8 : /[iljtfr.,:;'|]/.test(ch) ? 3.6 : 6.6;
  return px;
}
function columnasCompactas(etiquetas: string[]): string {
  const max = Math.max(60, ...etiquetas.map(anchoTextoAprox));
  return `min(${Math.ceil(max * 1.1 + 10)}px, 42%) minmax(0, 1fr) 46px 50px`;
}

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
export function AporteBarList({ data, onBarClick, resaltarMaximo = true, colorMaximo = VERDE_MAXIMO, colorBordeMaximo = '#dc2626', paletaBarras, compacta = false, textoVacio = 'Sin datos.' }: {
  data: FilaAporte[];
  onBarClick?: (key: string) => void;
  resaltarMaximo?: boolean;
  colorMaximo?: string; // color de RELLENO de la barra más alta — verde institucional oscuro por defecto
  colorBordeMaximo?: string; // color del RECUADRO punteado alrededor de esa barra — rojo por defecto, configurable para distinguir secciones (ej. azul en Operatividad)
  paletaBarras?: string[]; // colores de las barras normales (no la resaltada) — teal/gris institucional por defecto
  compacta?: boolean; // tipografía y columnas más compactas (solo donde se pide; el resto del dashboard no cambia)
  textoVacio?: string;
}) {
  const columnas = compacta ? columnasCompactas(data.map((d) => d.key)) : COLUMNAS_GRID;
  const maxCasos = Math.max(1, ...data.map((d) => d.casos));
  const paleta = paletaBarras ?? PALETA_BARRAS;

  return (
    <div>
      {/* Encabezado: solo "APORTE", centrado exactamente sobre la columna de
          porcentajes — las demás columnas no llevan título, igual que en la
          referencia visual. data-export-fila también aquí para que la
          exportación le aplique la MISMA separación reducida entre
          columnas que a las filas de datos, y quede alineado con ellas. */}
      <div data-export-fila="true" className={`mb-1 grid items-center ${compacta ? 'gap-2' : 'gap-3'}`} style={{ gridTemplateColumns: columnas }}>
        <div />
        <div />
        <div />
        <div data-export-texto="aporte-header" className={compacta ? 'text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400' : 'text-center text-[11px] font-bold uppercase tracking-wide text-slate-500'}>Aporte</div>
      </div>

      <div className={compacta ? 'space-y-[3px]' : 'space-y-0.5'}>
        {data.map((d, i) => {
          const anchoPct = Math.max(2, (d.casos / maxCasos) * 100);
          const esMaximo = resaltarMaximo && d.casos === maxCasos && maxCasos > 0;
          const color = esMaximo ? colorMaximo : paleta[i % paleta.length];
          return (
            <div
              key={d.key}
              data-export-fila="true"
              className={`grid items-center ${compacta ? 'gap-2' : 'gap-3'} ${onBarClick ? 'cursor-pointer' : ''}`}
              style={{ gridTemplateColumns: columnas }}
              onClick={() => onBarClick?.(d.key)}
            >
              <div data-export-texto="etiqueta" className={compacta ? 'truncate text-[12.5px] text-slate-700' : 'truncate text-sm font-medium text-slate-700'} title={d.key}>{d.key}</div>
              <div className="min-w-0 py-0.5">
                <div
                  data-export-track="true"
                  className={compacta ? 'rounded-md' : 'rounded'}
                  style={esMaximo
                    ? (compacta
                      // Recuadro del máximo, versión limpia: borde punteado fino, esquinas redondeadas y un fondo apenas tintado.
                      ? { border: `2px dashed ${colorBordeMaximo}`, padding: '2px', backgroundColor: 'rgba(29, 78, 216, 0.05)' }
                      : { border: `3px dashed ${colorBordeMaximo}`, padding: '1px' })
                    : (compacta ? { border: '2px solid transparent', padding: '2px' } : undefined)}
                >
                  <div className={compacta ? 'h-3 overflow-hidden rounded bg-slate-100' : 'h-3.5 overflow-hidden rounded bg-slate-100'}>
                    <div
                      className={compacta ? 'h-3 rounded transition-all' : 'h-3.5 rounded transition-all'}
                      style={{ width: `${anchoPct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              </div>
              <div data-export-texto="valor" className={compacta ? 'text-right text-[13px] font-bold tabular-nums text-[#10233f]' : 'text-right text-base font-bold text-slate-800'}>{formatNumero(d.casos)}</div>
              <div data-export-texto="aporte" className={compacta ? 'text-right text-[12px] tabular-nums text-slate-500' : 'text-center text-base font-bold text-slate-600'}>{formatDecimal(d.aportePct, 1)}%</div>
            </div>
          );
        })}
        {data.length === 0 && <p className="py-4 text-center text-sm text-slate-400">{textoVacio}</p>}
      </div>
    </div>
  );
}
