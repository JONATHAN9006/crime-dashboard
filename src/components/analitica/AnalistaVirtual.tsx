import { useMemo, useState } from 'react';
import { Sparkles, AlertTriangle, Info, Eraser } from 'lucide-react';
import { Card } from '../ui/Card';
import { useData } from '../../context/DataContext';
import { useVentanaComparativa, useComparativoCategoria, useProyeccion } from '../../hooks/useComparativoHomologo';
import { useTendenciaDiaSemana, useDistribucionHoraria } from '../../hooks/useTemporalAnalysis';
import { aplicarFiltros } from '../../utils/filters';
import { uniqueSorted } from '../../utils/aggregations';
import { construirAnalisisDescriptivo, type ParametrosAnalisisDescriptivo } from '../../utils/analisisDescriptivo';
import { CAMPOS_PRINCIPALES, CAMPOS_ADICIONALES } from '../filters/FilterPanel';
import { FichaAnalisisVisual } from './FichaAnalisisVisual';
import type { FilterState } from '../../types/crime';

// Une los dos listados de filtros que ya existen en la barra lateral
// (principales + adicionales) — MISMAS etiquetas que ve el usuario ahí, sin
// definir una tercera lista que se pueda desincronizar.
const TODOS_LOS_CAMPOS_ETIQUETADOS = [...CAMPOS_PRINCIPALES, ...CAMPOS_ADICIONALES];

function resumenFiltrosActivos(filters: FilterState, anioActual: number): string[] {
  const resumen: string[] = [`Vigencia: ${anioActual}`];
  for (const campo of TODOS_LOS_CAMPOS_ETIQUETADOS) {
    const valor = filters[campo.key] as string[];
    if (valor && valor.length > 0) resumen.push(`${campo.label}: ${valor.join(', ')}`);
  }
  if (filters.anio.length > 0) resumen.push(`Año: ${filters.anio.join(', ')}`);
  if (filters.mes.length > 0) resumen.push(`Mes: ${filters.mes.join(', ')}`);
  if (filters.fechaInicial) resumen.push(`Desde: ${filters.fechaInicial}`);
  if (filters.fechaFinal) resumen.push(`Hasta: ${filters.fechaFinal}`);
  return resumen;
}

// Quita tildes y pasa a minúsculas, para poder reconocer "hurto a personas"
// aunque el usuario lo escriba sin acentos o con mayúsculas distintas.
function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Muchos delitos en la base están abreviados ("H. Personas", "V.
// Intrafamiliar", "L. Personales") — si alguien escribe la palabra
// completa ("Hurto a Personas"), una comparación de texto exacto nunca
// coincide. Este diccionario traduce las abreviaturas más comunes de la
// nomenclatura policial colombiana a su palabra completa, para que ambas
// formas se reconozcan como lo mismo.
const EXPANSIONES_ABREVIATURA: Record<string, string[]> = {
  h: ['hurto'],
  v: ['violencia'],
  l: ['lesion', 'lesiones'],
  d: ['delito', 'delitos'],
};

// Palabras que no aportan nada para identificar un delito ("Hurto A
// Personas" vs "Hurto DE Personas" son la misma idea) — se ignoran tanto al
// leer el nombre real del delito como el mensaje escrito.
const PALABRAS_VACIAS = new Set(['a', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y']);

function limpiarPalabra(p: string): string {
  return normalizarTexto(p).replace(/[^a-z0-9]/g, '');
}

interface FirmaDelito {
  nombre: string;
  // Palabras con contenido real (sin abreviaturas de una sola letra ni
  // conectores) — ej. "H. Personas" → ["personas"].
  palabrasClave: string[];
  // Si el nombre empieza con una abreviatura conocida (H./V./L./D.), sus
  // expansiones ("hurto", "violencia"...) — vacío si no aplica.
  expansiones: string[];
}

function construirFirma(nombreDelito: string): FirmaDelito {
  const partes = nombreDelito.split(/\s+/);
  const palabrasClave: string[] = [];
  const expansiones: string[] = [];
  for (const parte of partes) {
    const soloLetra = parte.match(/^([a-zA-Z])\.?$/);
    if (soloLetra && EXPANSIONES_ABREVIATURA[limpiarPalabra(soloLetra[1])]) {
      expansiones.push(...EXPANSIONES_ABREVIATURA[limpiarPalabra(soloLetra[1])]);
      continue;
    }
    const limpia = limpiarPalabra(parte);
    if (limpia.length > 1 && !PALABRAS_VACIAS.has(limpia)) palabrasClave.push(limpia);
  }
  return { nombre: nombreDelito, palabrasClave, expansiones };
}

/**
 * Busca, dentro del mensaje escrito, el nombre de alguno de los delitos
 * REALES de la base de datos — nunca un delito inventado ni una lista
 * aparte: se compara contra los mismos nombres que ya existen en los datos
 * (los mismos que aparecen en el filtro "Delito" de la barra lateral).
 *
 * La comparación es por PALABRAS CLAVE, no por el texto exacto — así
 * "Hurto a Personas" (escrito completo) reconoce el delito guardado como
 * "H. Personas" (abreviado): se exige que TODAS las palabras con contenido
 * real del nombre del delito aparezcan en el mensaje, y si el delito
 * empieza con una abreviatura conocida (H./V./L./D.), que su palabra
 * completa ("hurto", "violencia"...) también aparezca. Si varios delitos
 * calzan a la vez, se prefiere el que tenga más palabras clave (el más
 * específico). Si no reconoce ninguno con certeza, devuelve null — nunca
 * asume ni adivina.
 */
function detectarDelitoEnMensaje(mensaje: string, delitosDisponibles: string[]): string | null {
  const mensajeNorm = normalizarTexto(mensaje);
  if (!mensajeNorm) return null;

  const coincidencias = delitosDisponibles
    .map(construirFirma)
    .filter((f) => {
      if (f.palabrasClave.length === 0 && f.expansiones.length === 0) return false; // nombre vacío tras limpiar, no se puede comparar
      const todasLasPalabrasClave = f.palabrasClave.every((p) => mensajeNorm.includes(p));
      const expansionPresente = f.expansiones.length === 0 || f.expansiones.some((e) => mensajeNorm.includes(e));
      return todasLasPalabrasClave && expansionPresente;
    });

  if (coincidencias.length === 0) return null;
  // Más palabras clave = más específico; en empate, el nombre más largo.
  coincidencias.sort((a, b) => b.palabrasClave.length - a.palabrasClave.length || b.nombre.length - a.nombre.length);
  return coincidencias[0].nombre;
}

export interface AnalistaVirtualProps {
  // Solo para el chip "Vigencia: X" que se muestra ANTES de generar nada —
  // una vez generado, el propio módulo calcula su propia ventana congelada.
  anioActual: number;
}

/**
 * "Analista Virtual Inteligente" — módulo bajo los filtros de "Análisis por
 * Unidad". Es AUTOSUFICIENTE (lee useData() directamente) para poder
 * generar el análisis de un delito ESCRITO en el cuadro de mensaje —
 * distinto al que esté seleccionado en el filtro lateral — sin alterar ese
 * filtro ni el resto del dashboard. Si el mensaje no menciona ningún
 * delito reconocible (o está vacío), usa el filtro de Delito que esté
 * activo en la barra lateral en ese momento — ambas formas de generar el
 * análisis quedan disponibles con el mismo botón.
 *
 * El resultado queda CONGELADO (no se actualiza solo) hasta que se vuelva a
 * presionar "Generar análisis" — si mientras tanto cambia cualquier filtro
 * o el texto del mensaje, se marca como desactualizado.
 */
export function AnalistaVirtual({ anioActual }: AnalistaVirtualProps) {
  const { records, filters, meta } = useData();
  const [mensaje, setMensaje] = useState('');

  // "filtrosParaAnalisis" es el ÚNICO estado que congela el resultado: solo
  // cambia dentro de generarAnalisis(). Mientras no cambie, toda la cadena
  // de hooks de abajo (ventana, cmp*, proyección...) sigue devolviendo
  // exactamente los mismos datos, aunque el usuario seguido edite filtros o
  // el mensaje — eso es lo que logra el efecto de "congelado".
  const [filtrosParaAnalisis, setFiltrosParaAnalisis] = useState<FilterState | null>(null);
  const [firmaGenerada, setFirmaGenerada] = useState<string | null>(null);

  const delitosDisponibles = useMemo(() => uniqueSorted(records, (r) => r.delito), [records]);
  const filtrosEfectivos = filtrosParaAnalisis ?? filters;

  const recordsBaseAnalisis = useMemo(
    () => aplicarFiltros(records, { ...filtrosEfectivos, anio: [], mes: [], fechaInicial: null, fechaFinal: null }),
    [records, filtrosEfectivos],
  );
  const ventana = useVentanaComparativa(recordsBaseAnalisis, filtrosEfectivos, records, meta?.fechaMaxParametro);
  const cmpEstacion = useComparativoCategoria(ventana, (r) => r.estacion, 10);
  const cmpCuadrante = useComparativoCategoria(ventana, (r) => r.cuadrante, 10);
  const cmpBarrio = useComparativoCategoria(ventana, (r) => r.barrioHecho, 10);
  const cmpCai = useComparativoCategoria(ventana, (r) => r.cai, 10);
  const cmpModalidad = useComparativoCategoria(ventana, (r) => r.modalidad, 10);
  const cmpArma = useComparativoCategoria(ventana, (r) => r.armas, 10);
  const cmpClaseSitio = useComparativoCategoria(ventana, (r) => r.claseSitio, 10);
  const porDia = useTendenciaDiaSemana(ventana.recsActual);
  const porHora = useDistribucionHoraria(ventana.recsActual);
  const proyeccion = useProyeccion(ventana);

  const parametros: ParametrosAnalisisDescriptivo = {
    proyeccion, delitosSeleccionados: filtrosEfectivos.delito,
    cmpEstacion, cmpCuadrante, cmpBarrio, cmpCai, cmpModalidad, cmpArma, cmpClaseSitio,
    porDia, porHora,
  };

  const firmaActual = JSON.stringify({ filters, mensaje });
  const desactualizado = firmaGenerada !== null && firmaGenerada !== firmaActual;
  const yaGenerado = filtrosParaAnalisis !== null;

  const delitoDetectado = useMemo(() => detectarDelitoEnMensaje(mensaje, delitosDisponibles), [mensaje, delitosDisponibles]);
  const nombreDelitoUnico = filtrosEfectivos.delito.length === 1 ? filtrosEfectivos.delito[0] : null;

  function generarAnalisis() {
    const filtrosResueltos: FilterState = delitoDetectado ? { ...filters, delito: [delitoDetectado] } : filters;
    setFiltrosParaAnalisis(filtrosResueltos);
    setFirmaGenerada(firmaActual);
  }

  // Vuelve el módulo a su estado inicial: sin resultado, sin mensaje, sin
  // marca de "desactualizado" — el panel derecho ("Visualización del
  // análisis") vuelve solo al mensaje de "Ejecute un análisis...", porque
  // ambos paneles se pintan a partir de "yaGenerado"/"hallazgos", que
  // dependen únicamente de "filtrosParaAnalisis".
  function limpiarAnalisis() {
    setFiltrosParaAnalisis(null);
    setFirmaGenerada(null);
    setMensaje('');
  }

  const { sufijoDelito, oraciones, hallazgos } = yaGenerado ? construirAnalisisDescriptivo(parametros) : { sufijoDelito: '', oraciones: [], hallazgos: [] };
  const tituloFicha = yaGenerado ? `Análisis delictivo — ${nombreDelitoUnico ? `Delito ${nombreDelitoUnico}` : sufijoDelito}` : '';

  return (
    <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      <Card title="Analista Virtual Inteligente - CIEPS MEPOY">
        <div className="flex h-full flex-col">
          <p className="text-sm font-semibold text-brand-navy">
            Análisis delictivo — {filters.delito.length === 1 ? filters.delito[0] : filters.delito.length > 1 ? `${filters.delito.length} delitos seleccionados` : 'Delitos 2025 - 2026'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Información analizada según filtros activos</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {resumenFiltrosActivos(filters, anioActual).map((f) => (
              <span key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{f}</span>
            ))}
          </div>

          {/* Cuadro de mensaje: si el texto menciona el nombre de un delito
              real de la base de datos, ESE es el que se analiza al generar
              — sin importar qué haya seleccionado el filtro lateral. Si el
              mensaje queda vacío o no menciona ninguno, se usa el filtro de
              Delito que esté activo arriba (el comportamiento de siempre). */}
          <label htmlFor="analista-virtual-mensaje" className="mt-4 text-xs font-semibold text-slate-500">Pregunta / análisis</label>
          <textarea
            id="analista-virtual-mensaje"
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            onKeyDown={(e) => {
              // Enter genera el análisis directamente (como en un chat);
              // Shift+Enter sigue permitiendo un salto de línea normal.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                generarAnalisis();
              }
            }}
            placeholder="Ej: Realiza un análisis del delito de Hurto a Personas"
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green"
          />
          {mensaje.trim().length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <Info size={12} />
              {delitoDetectado ? <>Delito detectado en el mensaje: <strong className="text-slate-600">{delitoDetectado}</strong></> : 'No se reconoció ningún delito en el mensaje — se usará el filtro de Delito activo.'}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={generarAnalisis}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-green/90"
            >
              <Sparkles size={16} />
              Generar análisis
            </button>
            {yaGenerado && (
              <button
                type="button"
                onClick={limpiarAnalisis}
                className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
              >
                <Eraser size={16} />
                Limpiar análisis
              </button>
            )}
          </div>

          {desactualizado && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
              <AlertTriangle size={14} />
              Los filtros o el mensaje cambiaron desde el último análisis — vuelve a generarlo para actualizarlo.
            </div>
          )}

          {yaGenerado && (
            <div className={`mt-4 flex-1 space-y-2.5 border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-700 ${desactualizado ? 'opacity-50' : ''}`}>
              {oraciones.length > 0 ? (
                oraciones.map((o, i) => <p key={i}>{o}</p>)
              ) : (
                <p className="text-slate-400">No hay información suficiente para generar una conclusión confiable con los filtros seleccionados.</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="Visualización del análisis" descargable={yaGenerado ? 'ficha-analisis-visual' : undefined}>
        <div className="flex h-full min-h-[220px] flex-col">
          {!yaGenerado ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-center text-sm text-slate-400">Ejecute un análisis para visualizar los resultados.</p>
            </div>
          ) : (
            <div className={desactualizado ? 'opacity-50' : ''}>
              <FichaAnalisisVisual titulo={tituloFicha} hallazgos={hallazgos} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
