import { useState } from 'react';
import { Card } from '../ui/Card';
import { TrendChart } from '../charts/TrendChart';
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

type ModoVista = 'mensual' | 'acumulado';

// Checkbox tipo pastilla, mutuamente excluyente con su pareja (funcionan
// como un selector de modo — nunca los dos activos a la vez) — mismo
// estilo visual que otros pares de checkbox ya usados en el dashboard (ver
// FiltroTendenciaBoton en ResumenEjecutivo.tsx).
function CheckboxModo({ etiqueta, activo, onClick }: { etiqueta: string; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={activo}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        activo ? 'border-brand-green bg-brand-green text-white' : 'border-slate-300 text-slate-500 hover:border-brand-green/50 hover:text-brand-green'
      }`}
    >
      <span className={`flex h-3 w-3 items-center justify-center rounded-sm border ${activo ? 'border-white bg-white' : 'border-slate-400 bg-transparent'}`}>
        {activo && <span className="h-1.5 w-1.5 rounded-[1px] bg-brand-green" />}
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
export function ComportamientoDelDelito({ height = 300, descargable, titulo = 'Tendencia mensual', subtitulo = 'Comparación entre los años disponibles' }: {
  height?: number;
  descargable?: string;
  titulo?: string;
  subtitulo?: string;
}) {
  const { todos, mensualConTendencia, analisisMensual, nivelDetalle, datosDiarios, tituloSufijoPeriodo, seriesKeysDiarias } = useAnalisisMensual();
  const { filters } = useData();
  const [modo, setModo] = useState<ModoVista>('mensual');
  const esDiaria = nivelDetalle === 'diaria';

  // Título dinámico completo — cambia de "Tendencia mensual" a "Tendencia
  // diaria" automáticamente según el nivel de detalle (ver
  // useAnalisisMensual), y agrega el periodo exacto al final SOLO en modo
  // diario (ej. "Tendencia diaria — H. Personas — 15 de junio al 31 de
  // agosto"). Como este mismo "titulo" es lo que se dibuja en la imagen
  // descargada, la descarga queda con el nombre correcto automáticamente.
  const sufijoDelito = filters.delito.length === 0 ? 'Todos los Delitos' : filters.delito.join(', ');
  const prefijoTitulo = esDiaria ? 'Tendencia diaria' : titulo;
  const tituloConDelito = esDiaria
    ? `${prefijoTitulo} — ${sufijoDelito} — ${tituloSufijoPeriodo}`
    : `${prefijoTitulo} — ${sufijoDelito}`;
  const subtituloMostrado = esDiaria
    ? `Comparación día a día contra el mismo periodo de ${todos.length > 0 ? Math.min(...todos) : ''}`
    : subtitulo;

  const seriesKeys = todos.map(String);
  const esAcumulado = !esDiaria && modo === 'acumulado';
  const datosGrafica = esAcumulado
    ? construirSerieAcumulada(mensualConTendencia, seriesKeys, ['_tendencia', '_proyeccion'])
    : mensualConTendencia;
  // La tendencia/proyección se ajustó sobre TOTALES MENSUALES (ver
  // analisisTendencia.ts) — no tiene sentido mostrarla superpuesta en la
  // vista diaria, cuya escala y agregación son completamente distintas.
  const mostrarTendencia = !esDiaria && !!analisisMensual.tendenciaGeneral.lineaTendencia;

  return (
    <Card
      title={tituloConDelito}
      subtitle={subtituloMostrado}
      descargable={descargable}
      actions={!esDiaria ? (
        <div className="flex items-center gap-1.5">
          <CheckboxModo etiqueta="Mensual" activo={modo === 'mensual'} onClick={() => setModo('mensual')} />
          <CheckboxModo etiqueta="Acumulado" activo={modo === 'acumulado'} onClick={() => setModo('acumulado')} />
        </div>
      ) : undefined}
    >
      {esDiaria ? (
        datosDiarios.length > 0 ? (
          <TrendChart
            data={datosDiarios}
            xKey="dia"
            seriesKeys={seriesKeysDiarias}
            seriesColors={{ [seriesKeysDiarias[0]]: '#7c3aed' }}
            height={height}
          />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">Selecciona un rango de fechas o un mes válido para ver la comparación diaria.</p>
        )
      ) : (
        <>
          <TrendChart
            data={datosGrafica}
            xKey="mes"
            seriesKeys={seriesKeys}
            seriesColors={{ [String(Math.min(...todos))]: '#7c3aed' }}
            mostrarLineaTendencia={mostrarTendencia}
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
          <div data-ocultar-en-descarga="1" className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
            <BloqueResumen bloque={analisisMensual.bloqueTendencia} />
            {analisisMensual.bloqueComparacion && <BloqueResumen bloque={analisisMensual.bloqueComparacion} />}
            {analisisMensual.disponible && analisisMensual.bloqueProyeccion && <BloqueResumen bloque={analisisMensual.bloqueProyeccion} />}
          </div>
        </>
      )}
    </Card>
  );
}
