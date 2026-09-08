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
// PROVEEDORES SOPORTADOS (variable de entorno AI_PROVIDER):
//   - "gemini"    (por defecto recomendado — Google AI Studio tiene un nivel
//                  gratuito real y permanente, sin tarjeta de crédito)
//   - "anthropic" (Claude — sin nivel gratuito permanente, requiere pago)
//
// ⚠️ IMPORTANTE — SIN PROBAR CONTRA UN MODELO REAL: ambos adaptadores se
// escribieron siguiendo la documentación pública de cada proveedor (Google
// AI / Gemini API "function calling", y la Messages API de Anthropic), pero
// no se pudieron ejecutar contra una API key real durante esta sesión (no
// hay ninguna disponible aquí). Antes de confiar en esto, pruébalo con tu
// propia key.
import type { Handler } from '@netlify/functions';

interface EsquemaHerramienta {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, any>; required?: string[] };
}

interface ResultadoHerramienta { id: string; nombre: string; resultado: unknown }

interface CuerpoSolicitud {
  mensajes: { rol: 'user' | 'assistant'; texto: string }[];
  contexto: Record<string, unknown>;
  resultadosHerramientas: ResultadoHerramienta[];
  herramientas: EsquemaHerramienta[];
}

interface LlamadaHerramientaCruda { id: string; nombre: string; parametros: Record<string, unknown> }
interface ResultadoProveedor { llamadas: LlamadaHerramientaCruda[]; texto: string }

const AI_API_KEY = process.env.AI_API_KEY;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const AI_MODEL = process.env.AI_MODEL || (AI_PROVIDER === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-4-6');

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
6. Cuando el usuario pida un "análisis ejecutivo", estructura la respuesta en: Situación actual, Comparación con la vigencia anterior, Variación, Comportamiento temporal, Distribución territorial (si hay información), Principales hallazgos, Aspectos que requieren atención (solo si los datos lo justifican), y Conclusión.
7. Cuando el usuario pida sugerencias, planes, recomendaciones u "qué hacer" frente a un delito, usa SIEMPRE la herramienta "sugerirAccionesPreventivas" — nunca inventes un plan por tu cuenta: los planes posibles (Plan Presencia, Registro a Personas, Registro a Vehículos, Plan Baliza, Plan Candado, articulación con Comisaría de Familia o con Policía Judicial) ya están definidos en esa herramienta, junto con la zona y la franja horaria calculadas a partir de los datos reales. Tu trabajo es redactarlo como una recomendación operativa clara (ej. "en el barrio X, entre las 19:00 y las 20:59, se recomienda Plan Presencia y Registro a Personas, por concentrar Y casos en esa franja"), nunca como un hecho garantizado — usa lenguaje de recomendación ("se sugiere", "sería pertinente"), no de certeza.`;
}

async function llamarAnthropic(systemPrompt: string, mensajes: CuerpoSolicitud['mensajes'], herramientas: EsquemaHerramienta[], resultadosHerramientas: ResultadoHerramienta[]): Promise<ResultadoProveedor> {
  const contenidoUsuarioFinal: any[] = resultadosHerramientas.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.resultado) }));
  const mensajesAnthropic: any[] = mensajes.map((m) => ({ role: m.rol, content: m.texto }));
  if (contenidoUsuarioFinal.length > 0) mensajesAnthropic.push({ role: 'user', content: contenidoUsuarioFinal });

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': AI_API_KEY as string, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: mensajesAnthropic,
      tools: herramientas.map((h) => ({ name: h.name, description: h.description, input_schema: h.input_schema })),
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic API respondió ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
  const data: any = await resp.json();

  const llamadas = (data.content || [])
    .filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({ id: b.id, nombre: b.name, parametros: b.input || {} }));
  const texto = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  return { llamadas, texto };
}

function convertirEsquemaAGemini(valor: any): any {
  if (Array.isArray(valor)) return valor.map(convertirEsquemaAGemini);
  if (valor && typeof valor === 'object') {
    const resultado: any = {};
    for (const [clave, v] of Object.entries(valor)) {
      resultado[clave] = clave === 'type' && typeof v === 'string' ? v.toUpperCase() : convertirEsquemaAGemini(v);
    }
    return resultado;
  }
  return valor;
}

async function llamarGemini(systemPrompt: string, mensajes: CuerpoSolicitud['mensajes'], herramientas: EsquemaHerramienta[], resultadosHerramientas: ResultadoHerramienta[]): Promise<ResultadoProveedor> {
  const contents: any[] = mensajes.map((m) => ({ role: m.rol === 'assistant' ? 'model' : 'user', parts: [{ text: m.texto }] }));

  if (resultadosHerramientas.length > 0) {
    contents.push({
      role: 'function',
      parts: resultadosHerramientas.map((r) => ({ functionResponse: { name: r.nombre, response: { resultado: r.resultado } } })),
    });
  }

  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': AI_API_KEY as string },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations: herramientas.map((h) => ({ name: h.name, description: h.description, parameters: convertirEsquemaAGemini(h.input_schema) })) }],
    }),
  });
  if (!resp.ok) throw new Error(`Gemini API respondió ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`);
  const data: any = await resp.json();

  const partes: any[] = data?.candidates?.[0]?.content?.parts || [];
  const llamadas = partes
    .filter((p) => p.functionCall)
    .map((p, i) => ({ id: `gemini-${Date.now()}-${i}`, nombre: p.functionCall.name, parametros: p.functionCall.args || {} }));
  const texto = partes.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n').trim();
  return { llamadas, texto };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ tipo: 'error', mensaje: 'Método no permitido.' }) };
  }

  if (!AI_API_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'error', noConfigurado: true, mensaje: 'El Analista IA aún no está configurado. Verifique la configuración del servicio de IA.' }),
    };
  }

  let cuerpo: CuerpoSolicitud;
  try {
    cuerpo = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ tipo: 'error', mensaje: 'Solicitud mal formada.' }) };
  }

  try {
    const systemPrompt = construirSystemPrompt(cuerpo.contexto);
    let resultado: ResultadoProveedor;
    if (AI_PROVIDER === 'gemini') {
      resultado = await llamarGemini(systemPrompt, cuerpo.mensajes, cuerpo.herramientas, cuerpo.resultadosHerramientas);
    } else if (AI_PROVIDER === 'anthropic') {
      resultado = await llamarAnthropic(systemPrompt, cuerpo.mensajes, cuerpo.herramientas, cuerpo.resultadosHerramientas);
    } else {
      return { statusCode: 200, body: JSON.stringify({ tipo: 'error', mensaje: `Proveedor de IA "${AI_PROVIDER}" no implementado todavía.` }) };
    }

    if (resultado.llamadas.length > 0) {
      return { statusCode: 200, body: JSON.stringify({ tipo: 'llamada_herramienta', llamadas: resultado.llamadas }) };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'respuesta', texto: resultado.texto || 'No fue posible generar una respuesta con la información disponible.' }),
    };
  } catch {
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'error', mensaje: 'En este momento no fue posible procesar el análisis. Los datos del Dashboard continúan disponibles.' }),
    };
  }
};
