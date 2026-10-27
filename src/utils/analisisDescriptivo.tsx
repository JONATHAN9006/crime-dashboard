import type { ReactNode } from 'react';
import type { FilaComparativaCategoria } from '../hooks/useComparativoHomologo';
import { formatDecimal, formatNumero } from './aggregations';

/**
 * Lógica de narrativa automática COMPARTIDA entre "Análisis descriptivo" (la
 * tarjeta junto a "Proyección de delitos", siempre visible y siempre al
 * día) y "Analista Virtual Inteligente" (el módulo bajo los filtros de
 * "Análisis por Unidad", que se dispara con un botón) — ambos deben
 * producir exactamente el mismo tipo de frases a partir de los mismos
 * datos, así que la construcción vive en un solo lugar y ninguno de los dos
 * duplica el cálculo.
 *
 * IMPORTANTE — nombres de campos: el dashboard usa dos nombres distintos
 * para el mismo campo ("cuadrante") según dónde se mire — la barra de
 * filtros lo llama "Zonas de Atención" (ver FilterPanel.tsx), pero la
 * tarjeta de esta misma página que ya lo muestra se llama "Top cuadrantes
 * más afectados" (ver AnalisisUnidad.tsx). Esta narrativa usa "cuadrante"
 * para quedar consistente con esa tarjeta, que aparece justo al lado. "CAI"
 * es un campo aparte y realmente distinto (su propio filtro en la barra
 * lateral), y se incluye como una dimensión propia.
 */

export interface ProyeccionParaAnalisis {
  disponible: boolean;
  casosActual: number;
  diferenciaConAnterior: number;
  casosAnioAnterior: number;
  anioAnterior: number;
}

export interface PuntoDia { dia: string; casos: number }
export interface PuntoHora { hora: string; horaNum: number; casos: number }

export interface ParametrosAnalisisDescriptivo {
  proyeccion: ProyeccionParaAnalisis;
  delitosSeleccionados: string[];
  cmpEstacion: FilaComparativaCategoria[];
  cmpCuadrante: FilaComparativaCategoria[];
  cmpBarrio: FilaComparativaCategoria[];
  cmpCai: FilaComparativaCategoria[];
  cmpModalidad: FilaComparativaCategoria[];
  cmpArma: FilaComparativaCategoria[];
  cmpClaseSitio: FilaComparativaCategoria[];
  porDia: PuntoDia[];
  porHora: PuntoHora[];
}

export interface HallazgoTotal {
  tipo: 'total';
  casos: number;
  diferencia: number;
  pctVariacion: number | null;
  anioAnterior: number;
}
export type TipoHallazgoDimension = 'estacion' | 'cuadrante' | 'barrio' | 'cai' | 'modalidad' | 'arma' | 'claseSitio' | 'dia' | 'hora';
export interface HallazgoDimension {
  tipo: TipoHallazgoDimension;
  etiqueta: string; // ej. "Estación con mayor incidencia"
  valor: string; // ej. "E-Norte"
  casos: number;
  pct: number;
}
export type Hallazgo = HallazgoTotal | HallazgoDimension;

export interface ResultadoAnalisisDescriptivo {
  // Solo el objeto del análisis ("H. Personas" / "Delitos 2025 - 2026") —
  // cada componente que use esto arma su propio título completo con su
  // propio prefijo (ver AnalisisDescriptivo.tsx y AnalistaVirtual.tsx), para
  // no imponerle a ninguno de los dos el título fijo del otro.
  sufijoDelito: string;
  // Los hallazgos ESTRUCTURADOS (números y textos "en crudo") son la ÚNICA
  // fuente de verdad — tanto las frases en prosa ("oraciones", abajo) como
  // la ficha visual/infografía (ver FichaAnalisisVisual.tsx) se arman a
  // partir de ESTOS MISMOS valores, nunca de un segundo cálculo aparte.
  hallazgos: Hallazgo[];
  // Las mismas conclusiones de "hallazgos", ya redactadas en prosa — se
  // derivan de "hallazgos" (ver más abajo), no se calculan por separado.
  oraciones: ReactNode[];
}

const ETIQUETAS_DIMENSION: Record<TipoHallazgoDimension, string> = {
  estacion: 'Estación con mayor incidencia',
  cuadrante: 'Cuadrante con mayor incidencia',
  barrio: 'Barrio con mayor incidencia',
  cai: 'CAI con mayor incidencia',
  modalidad: 'Modalidad predominante',
  arma: 'Arma o medio predominante',
  claseSitio: 'Clase de sitio predominante',
  dia: 'Día de mayor concentración',
  hora: 'Horario de mayor incidencia',
};

/**
 * Construye los HALLAZGOS ESTRUCTURADOS (número/texto en crudo, sin
 * redactar) en el orden pedido: total → estación → cuadrante → barrio →
 * CAI → modalidad → arma → clase de sitio → día → hora. Cualquier dimensión
 * sin datos suficientes se OMITE — nunca se inventa. Esta es la ÚNICA
 * función que calcula algo; tanto las frases en prosa como la ficha visual
 * se limitan a darle formato a este mismo resultado.
 */
function construirHallazgos(p: ParametrosAnalisisDescriptivo): Hallazgo[] {
  const totalBase = p.proyeccion.disponible ? p.proyeccion.casosActual : 0;
  const aportePct = (casos: number) => (totalBase > 0 ? (casos / totalBase) * 100 : 0);
  const hallazgos: Hallazgo[] = [];

  if (p.proyeccion.disponible && p.proyeccion.casosActual > 0) {
    // IMPORTANTE (bug corregido): la diferencia frente al año anterior debe
    // compararse "a la fecha" contra "a la fecha" — casos reales del
    // periodo transcurrido de este año contra el MISMO periodo del año
    // anterior. "proyeccion.diferenciaConAnterior" es un campo DISTINTO,
    // pensado para la tarjeta "Proyección de delitos": compara la
    // proyección de CIERRE DE AÑO COMPLETO (ritmo diario actual × 365)
    // contra el año anterior — no el periodo real transcurrido. Usar ese
    // campo aquí daba una diferencia y un % que no correspondían a los
    // casos reales que muestra la primera línea de esta misma frase.
    const diferencia = p.proyeccion.casosActual - p.proyeccion.casosAnioAnterior;
    const pctVariacion = p.proyeccion.casosAnioAnterior > 0 ? (Math.abs(diferencia) / p.proyeccion.casosAnioAnterior) * 100 : null;
    hallazgos.push({ tipo: 'total', casos: p.proyeccion.casosActual, diferencia, pctVariacion, anioAnterior: p.proyeccion.anioAnterior });
  }

  function agregarTop(tipo: TipoHallazgoDimension, filas: FilaComparativaCategoria[]) {
    const top = filas[0];
    if (!top || top.actual <= 0) return;
    hallazgos.push({ tipo, etiqueta: ETIQUETAS_DIMENSION[tipo], valor: top.key, casos: top.actual, pct: aportePct(top.actual) });
  }

  agregarTop('estacion', p.cmpEstacion);
  agregarTop('cuadrante', p.cmpCuadrante);
  agregarTop('barrio', p.cmpBarrio);
  agregarTop('cai', p.cmpCai);
  agregarTop('modalidad', p.cmpModalidad);
  agregarTop('arma', p.cmpArma);
  agregarTop('claseSitio', p.cmpClaseSitio);

  const diaTop = [...p.porDia].sort((a, b) => b.casos - a.casos)[0];
  if (diaTop && diaTop.casos > 0) {
    hallazgos.push({ tipo: 'dia', etiqueta: ETIQUETAS_DIMENSION.dia, valor: diaTop.dia, casos: diaTop.casos, pct: aportePct(diaTop.casos) });
  }
  const horaTop = [...p.porHora].sort((a, b) => b.casos - a.casos)[0];
  if (horaTop && horaTop.casos > 0) {
    const finHora = (horaTop.horaNum + 1) % 24;
    const etiquetaHora = `${horaTop.horaNum}:00 – ${String(finHora).padStart(2, '0')}:59`;
    hallazgos.push({ tipo: 'hora', etiqueta: ETIQUETAS_DIMENSION.hora, valor: etiquetaHora, casos: horaTop.casos, pct: aportePct(horaTop.casos) });
  }

  return hallazgos;
}

/**
 * Redacta cada hallazgo estructurado como una frase en prosa completa
 * (nunca al revés: el texto siempre se deriva de "hallazgos", nunca se
 * calcula algo nuevo aquí) — cada tipo tiene su propia redacción natural,
 * igual que antes.
 */
function redactarHallazgo(h: Hallazgo, nombreDelitoUnico: string | null, cantidadDelitosSeleccionados: number): ReactNode {
  if (h.tipo === 'total') {
    const pctVariacion = h.pctVariacion;
    return (
      <>
        A la fecha se han presentado <strong>{formatNumero(h.casos)}</strong> casos
        {nombreDelitoUnico ? (
          <> por el delito de <strong>{nombreDelitoUnico}</strong></>
        ) : cantidadDelitosSeleccionados > 1 ? (
          <> para los <strong>{cantidadDelitosSeleccionados}</strong> delitos seleccionados</>
        ) : null}
        , lo que representa {h.diferencia >= 0 ? 'un incremento' : 'una disminución'} de <strong>{formatNumero(Math.abs(h.diferencia))}</strong> casos frente al mismo periodo de la vigencia anterior ({h.anioAnterior})
        {pctVariacion !== null && <>, equivalente a un <strong>{formatDecimal(pctVariacion, 0)}%</strong></>}.
      </>
    );
  }
  const pctTexto = formatDecimal(h.pct, 1);
  switch (h.tipo) {
    case 'estacion':
      return <>La Estación de Policía <strong>{h.valor}</strong> concentra la mayor afectación, con <strong>{formatNumero(h.casos)}</strong> casos, equivalentes al <strong>{pctTexto}%</strong> de los casos {nombreDelitoUnico ? <>registrados para <strong>{nombreDelitoUnico}</strong></> : 'registrados'}.</>;
    case 'cuadrante':
      return <>El cuadrante <strong>{h.valor}</strong> presenta la mayor concentración, con <strong>{formatNumero(h.casos)}</strong> casos (<strong>{pctTexto}%</strong>).</>;
    case 'barrio':
      return <>El barrio <strong>{h.valor}</strong> presenta la mayor concentración, con <strong>{formatNumero(h.casos)}</strong> casos (<strong>{pctTexto}%</strong>).</>;
    case 'cai':
      return <>El CAI <strong>{h.valor}</strong> registra la mayor cantidad de casos, con <strong>{formatNumero(h.casos)}</strong> (<strong>{pctTexto}%</strong>).</>;
    case 'modalidad':
      return <>La modalidad con mayor incidencia corresponde a <strong>{h.valor}</strong>, con <strong>{formatNumero(h.casos)}</strong> casos, que representan el <strong>{pctTexto}%</strong> del total.</>;
    case 'arma':
      return <>El arma o medio empleado con mayor frecuencia es <strong>{h.valor}</strong>, con <strong>{formatNumero(h.casos)}</strong> casos (<strong>{pctTexto}%</strong>).</>;
    case 'claseSitio':
      return <>La clase de sitio predominante es <strong>{h.valor}</strong>, con <strong>{formatNumero(h.casos)}</strong> casos (<strong>{pctTexto}%</strong>).</>;
    case 'dia':
      return <>El día con mayor concentración de casos es <strong>{h.valor}</strong>, con <strong>{formatNumero(h.casos)}</strong> casos (<strong>{pctTexto}%</strong>).</>;
    case 'hora':
      return <>La hora de mayor concentración es <strong>{h.valor}</strong>, con <strong>{formatNumero(h.casos)}</strong> casos (<strong>{pctTexto}%</strong>).</>;
  }
}

/**
 * Punto de entrada único: calcula los hallazgos estructurados UNA VEZ
 * (construirHallazgos) y de ahí derivan tanto las frases en prosa como —
 * en quien consuma "hallazgos" directamente (ver FichaAnalisisVisual.tsx)
 * — la ficha visual. Ningún consumidor vuelve a calcular nada.
 */
export function construirAnalisisDescriptivo(p: ParametrosAnalisisDescriptivo): ResultadoAnalisisDescriptivo {
  const nombreDelitoUnico = p.delitosSeleccionados.length === 1 ? p.delitosSeleccionados[0] : null;
  const sufijoDelito = nombreDelitoUnico ?? (p.delitosSeleccionados.length > 1 ? `${p.delitosSeleccionados.length} delitos seleccionados` : 'Delitos 2025 - 2026');
  const hallazgos = construirHallazgos(p);
  const oraciones = hallazgos.map((h) => redactarHallazgo(h, nombreDelitoUnico, p.delitosSeleccionados.length));
  return { sufijoDelito, hallazgos, oraciones };
}
