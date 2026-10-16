// Tipos del "Analista IA" — módulo nuevo y aislado. Ningún tipo aquí
// modifica ni depende de types/crime.ts más allá de lo que ya exponen los
// hooks existentes (FilaComparativaCategoria, etc.), que se reutilizan tal
// cual.
import type { FilaComparativaCategoria } from '../hooks/useComparativoHomologo';

export type RolMensaje = 'user' | 'assistant';

export interface MensajeChat {
  id: string;
  rol: RolMensaje;
  texto: string;
  timestamp: number;
}

// ── CONTEXTO ESTRUCTURADO ───────────────────────────────────────────────
// Construido UNA VEZ por render en hooks/useAgenteIA.ts a partir de los
// hooks ya existentes (useComparativoHomologo, useTemporalAnalysis,
// useTerritorialAnalysis, useKpis) — nunca a partir de records crudos. Este
// objeto es la ÚNICA fuente de datos que ven tanto las herramientas
// (services/agenteIATools.ts) como el panel de contexto del chat. No viajan
// aquí las 19.000 filas: solo agregados ya calculados.
export interface ContextoAgenteIA {
  filtros: {
    delito: string[];
    estacion: string[];
    cuadrante: string[]; // "Zonas de Atención" en la barra lateral
    barrioHecho: string[];
    cai: string[];
    anio: string[];
    mes: string[];
    fechaInicial: string | null;
    fechaFinal: string | null;
    cantidadFiltrosAdicionalesActivos: number; // resto de campos (arma, modalidad, género, etc.) que sí están activos pero no se listan uno a uno aquí
  };
  periodoActual: { inicio: string; fin: string; vigencia: number };
  // Fecha de corte de la información (último día con datos oficiales) y si
  // la vigencia actual sigue en curso (año sin cerrar).
  corteInformacion: string;
  periodoEnCurso: boolean;
  periodoComparativo: { inicio: string; fin: string; vigencia: number };
  indicadores: {
    totalCasosActual: number;
    totalCasosAnterior: number; // corte homólogo "a la fecha", NO año completo
    diferencia: number;
    variacionPct: number | null; // null si el año anterior no tiene casos (evita división por cero)
    totalAnioAnteriorCompleto: number; // vigencia anterior COMPLETA (01/01–31/12), solo como referencia
  };
  resumenCategorias: {
    delitos: FilaComparativaCategoria[];
    estaciones: FilaComparativaCategoria[];
    cuadrantes: FilaComparativaCategoria[];
    barrios: FilaComparativaCategoria[];
    cais: FilaComparativaCategoria[];
    modalidades: FilaComparativaCategoria[];
    armas: FilaComparativaCategoria[];
    clasesSitio: FilaComparativaCategoria[];
  };
  resumenTemporal: {
    porDiaSemana: { key: string; casos: number; participacion: number }[];
    porHora: { hora: string; casos: number }[];
    porMes: { mes: string; actual: number | null; anterior: number | null }[];
    diaMasCritico: { key: string; casos: number } | null;
    horaMasCritica: { hora: string; casos: number } | null;
    // Franjas de 3 horas (00–02, 03–05, …) ordenadas de mayor a menor.
    franjasCriticas: { franja: string; casos: number; participacion: number }[];
    casosConHora: number;
  };
  resumenTerritorial: {
    cuadrantesCriticos: { key: string; casos: number; participacion: number }[];
    barriosCriticos: { key: string; casos: number; participacion: number }[];
  };
  // Operatividad del MISMO periodo evaluable (reglas oficiales de conteo,
  // utils/operatividadConteo vía construirTablaOperatividad).
  operatividad: {
    disponible: boolean;
    periodoActual: { inicio: string; fin: string; vigencia: number } | null;
    periodoComparativo: { inicio: string; fin: string; vigencia: number } | null;
    grupos: { titulo: string; unidad: 'casos' | 'kg'; actual: number; anterior: number; filas: { etiqueta: string; actual: number; anterior: number }[] }[];
  };
  // Últimas 4 semanas (mismo cálculo de la página «Últimas 4 Semanas»).
  cambiosRecientes: {
    disponible: boolean;
    semanas: { nombre: string; inicio: string; fin: string; total: number }[];
    variacionPrimeraVsUltimaPct: number | null;
    delitoMayorAumento: { delito: string; primera: number; ultima: number } | null;
    delitoMayorDisminucion: { delito: string; primera: number; ultima: number } | null;
  };
  // Calidad de los registros de la vigencia actual (para advertir límites).
  calidadDatos: {
    registrosActual: number;
    sinHora: number;
    sinBarrio: number;
    sinZona: number;
  };
  metadatos: {
    totalRegistrosFiltrados: number;
    delitoUnicoSeleccionado: string | null; // si length===1, ese nombre EXACTO; si no, null
    cantidadDelitosSeleccionados: number;
    generadoEn: string; // ISO timestamp — para que el agente sepa qué tan "fresco" es el contexto
  };
}

// ── HERRAMIENTAS (function calling) ─────────────────────────────────────
export interface EsquemaHerramienta {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface LlamadaHerramienta {
  id: string;
  nombre: string;
  parametros: Record<string, unknown>;
}

export interface ResultadoHerramienta {
  id: string;
  nombre: string;
  resultado: unknown;
}

// ── PROTOCOLO CON EL BACKEND ─────────────────────────────────────────────
// El backend NO tiene acceso a los datos del dashboard (viven en el
// navegador) — por eso el flujo es de "ida y vuelta": el backend le dice al
// cliente qué herramienta necesita, el cliente la ejecuta localmente
// (services/agenteIATools.ts, sobre "contexto") y le devuelve el resultado.
export interface SolicitudAgenteIA {
  mensajes: { rol: RolMensaje; texto: string }[];
  contexto: ContextoAgenteIA;
  // Resultados de herramientas ya ejecutadas en esta misma ronda de
  // razonamiento (se van acumulando mientras el backend siga pidiendo más).
  resultadosHerramientas: ResultadoHerramienta[];
  // Estado de conversación EN FORMATO NATIVO del proveedor (Anthropic,
  // Gemini, etc.) — el cliente nunca lo interpreta, solo lo guarda y lo
  // reenvía tal cual en la siguiente ronda de la MISMA pregunta. Es
  // indispensable para que el turno donde el modelo pidió una herramienta
  // (con su "tool_use"/"functionCall") quede correctamente emparejado con
  // el resultado que se le devuelve después — sin esto, Anthropic rechaza
  // la solicitud completa con un error 400.
  historialCrudo?: unknown;
}

export type RespuestaAgenteIA =
  | { tipo: 'llamada_herramienta'; llamadas: LlamadaHerramienta[]; historialCrudo: unknown }
  | { tipo: 'respuesta'; texto: string }
  | { tipo: 'error'; mensaje: string; noConfigurado?: boolean };
