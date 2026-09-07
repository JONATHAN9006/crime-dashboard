// Backend MÍNIMO del "Analista IA" — Netlify Function.
//
// RESPONSABILIDAD ÚNICA: recibir la pregunta + el contexto ya calculado +
// los resultados de herramientas que el cliente ya ejecutó, llamar al
// proveedor de IA con las herramientas disponibles, y devolver o bien
// "necesito que ejecutes esta herramienta" o bien "aquí está la respuesta
// final". NUNCA calcula cifras del dashboard — no tiene acceso a los datos
// (viven en el navegador de cada usuario, en IndexedDB). Por diseño, esto
// es una responsabilidad COMPLETAMENTE APARTE de la sincronización de datos
// (backendUrl / Apps Script) — nunca deben mezclarse.
//
// La API key SOLO vive aquí, como variable de entorno del servidor. Nunca
// se envía al navegador, nunca aparece en el bundle de React.
//
// ⚠️ IMPORTANTE — SIN PROBAR CONTRA UN MODELO REAL: este archivo se escribió
// siguiendo la documentación pública de la API de Anthropic (Messages API,
// tool use), pero no se pudo ejecutar contra una API key real durante esta
// sesión (no hay una disponible). Antes de confiar en él, pruébalo con tu
// propia key siguiendo la sección de pruebas de la respuesta.
import type { Handler } from '@netlify/functions';

interface EsquemaHerramienta {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

interface ResultadoHerramienta { id: string; nombre: string; resultado: unknown }

interface CuerpoSolicitud {
  mensajes: { rol: 'user' | 'assistant'; texto: string }[];
  contexto: Record<string, unknown>;
  resultadosHerramientas: ResultadoHerramienta[];
  herramientas: EsquemaHerramienta[];
}

const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6';
const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();

// System prompt: la regla anti-alucinación y el respeto estricto al delito
// seleccionado van AQUÍ, de forma explícita — no dependen de que el modelo
// "adivine" el comportamiento esperado.
function construirSystemPrompt(contexto: Record<string, unknown>): string {
  const metadatos = (contexto as any)?.metadatos ?? {};
  const delitoUnico = metadatos.delitoUnicoSeleccionado as string | null;
  return `Eres el Analista IA de un dashboard de análisis delictivo institucional (MEPOY/CIEPS). Tu trabajo es interpretar y redactar, NUNCA calcular.

REGLAS OBLIGATORIAS:
1. Utiliza EXCLUSIVAMENTE la información devuelta por las herramientas. Nunca inventes cifras, porcentajes, delitos, fechas, estaciones ni tendencias.
2. Si una herramienta no devuelve un dato suficiente para responder, dilo explícitamente: "No se dispone de información suficiente para determinarlo." No completes el vacío con conocimiento general ni con supuestos.
3. Antes de responder cualquier pregunta sobre cifras, SIEMPRE llama a la herramienta correspondiente primero — incluso si crees saber la respuesta por el contexto ya recibido.
${delitoUnico
    ? `4. El usuario está analizando específicamente "${delitoUnico}". No menciones ni compares con otros delitos (homicidio, hurtos de otro tipo, etc.) salvo que el usuario lo pida explícitamente.`
    : '4. No hay un único delito seleccionado — el análisis es sobre el conjunto de delitos que resulte de los filtros activos.'}
5. Sé profesional, claro y directo — el texto puede usarse en informes institucionales. Evita relleno y conclusiones no sustentadas por los datos.
6. Cuando el usuario pida un "análisis ejecutivo", estructura la respuesta en: Situación actual, Comparación con la vigencia anterior, Variación, Comportamiento temporal, Distribución territorial (si hay información), Principales hallazgos, Aspectos que requieren atención (solo si los datos lo justifican), y Conclusión.`;
}

async function llamarAnthropic(systemPrompt: string, mensajes: CuerpoSolicitud['mensajes'], herramientas: EsquemaHerramienta[], resultadosHerramientas: ResultadoHerramienta[]) {
  // Traduce el historial simple {rol, texto} + resultados de herramientas
  // pendientes al formato de "content blocks" que espera la Messages API.
  const contenidoUsuarioFinal: any[] = [];
  if (resultadosHerramientas.length > 0) {
    for (const r of resultadosHerramientas) {
      contenidoUsuarioFinal.push({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.resultado) });
    }
  }

  const mensajesAnthropic = mensajes.map((m) => ({ role: m.rol, content: m.texto }));
  if (contenidoUsuarioFinal.length > 0) {
    mensajesAnthropic.push({ role: 'user', content: contenidoUsuarioFinal } as any);
  }

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AI_API_KEY as string,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: mensajesAnthropic,
      tools: herramientas.map((h) => ({ name: h.name, description: h.description, input_schema: h.input_schema })),
    }),
  });

  if (!resp.ok) {
    const textoError = await resp.text().catch(() => '');
    throw new Error(`Anthropic API respondió ${resp.status}: ${textoError.slice(0, 300)}`);
  }
  return resp.json();
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ tipo: 'error', mensaje: 'Método no permitido.' }) };
  }

  if (!AI_API_KEY) {
    return {
      statusCode: 200, // 200 a propósito: es un estado esperado, no una falla del servidor
      body: JSON.stringify({ tipo: 'error', noConfigurado: true, mensaje: 'El Analista IA aún no está configurado. Verifique la configuración del servicio de IA.' }),
    };
  }

  let cuerpo: CuerpoSolicitud;
  try {
    cuerpo = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ tipo: 'error', mensaje: 'Solicitud mal formada.' }) };
  }

  if (AI_PROVIDER !== 'anthropic') {
    // Punto de extensión: agregar aquí un adaptador equivalente para otro
    // proveedor (ej. OpenAI) manteniendo el mismo contrato de entrada/salida
    // con el cliente — ver services/agenteIA.ts, que no sabe ni le importa
    // qué proveedor hay detrás.
    return { statusCode: 200, body: JSON.stringify({ tipo: 'error', mensaje: `Proveedor de IA "${AI_PROVIDER}" no implementado todavía.` }) };
  }

  try {
    const systemPrompt = construirSystemPrompt(cuerpo.contexto);
    const data: any = await llamarAnthropic(systemPrompt, cuerpo.mensajes, cuerpo.herramientas, cuerpo.resultadosHerramientas);

    if (data.stop_reason === 'tool_use') {
      const llamadas = (data.content || [])
        .filter((b: any) => b.type === 'tool_use')
        .map((b: any) => ({ id: b.id, nombre: b.name, parametros: b.input || {} }));
      return { statusCode: 200, body: JSON.stringify({ tipo: 'llamada_herramienta', llamadas }) };
    }

    const textoFinal = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'respuesta', texto: textoFinal || 'No fue posible generar una respuesta con la información disponible.' }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'error', mensaje: 'En este momento no fue posible procesar el análisis. Los datos del Dashboard continúan disponibles.' }),
    };
  }
};
