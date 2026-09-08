// Backend MÍNIMO del "Analista IA" — Netlify Function.
//
// RESPONSABILIDAD ÚNICA: recibir la pregunta + el contexto ya calculado +
// los resultados de herramientas que el cliente ya ejecutó, llamar al
// proveedor de IA con las herramientas disponibles, y devolver o bien
// "necesito que ejecutes esta herramienta" o bien "aquí está la respuesta
// final". NUNCA calcula cifras del dashboard — no tiene acceso a los datos
// (viven en el navegador de cada usuario, en IndexedDB).
//
// PROTOCOLO DE HERRAMIENTAS — IMPORTANTE: cuando el modelo pide usar una
// herramienta, su respuesta (que incluye el bloque "tool_use"/"functionCall")
// debe quedar EN LA CONVERSACIÓN antes de poder enviarle el resultado de esa
// herramienta — si no, el proveedor rechaza la solicitud (error 400 real
// que se encontró en pruebas: "Each tool_result block must have a
// corresponding tool_use block in the previous message"). Como este backend
// es sin estado (no guarda nada entre llamadas), ese turno se devuelve al
// cliente como "historialCrudo" (una estructura OPACA, en el formato nativo
// del proveedor) y el cliente simplemente lo reenvía tal cual en la
// siguiente ronda — nunca lo interpreta ni lo modifica.
//
// PROVEEDORES SOPORTADOS (variable de entorno AI_PROVIDER):
//   - "gemini"    (nivel gratuito real de Google AI Studio — aunque en la
//                  práctica varias cuentas nuevas están siendo bloqueadas
//                  por Google con un error 403 "denied access", un problema
//                  del lado de Google, no de este código)
//   - "anthropic" (Claude — de pago, sin ese problema de bloqueos)
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
  historialCrudo?: unknown;
}

interface LlamadaHerramientaCruda { id: string; nombre: string; parametros: Record<string, unknown> }
// "historialCrudo" se declara "unknown" de cara al cliente (types/agenteIA.ts)
// a propósito — pero AQUÍ, dentro del backend, cada adaptador SÍ conoce su
// propio formato (un array de mensajes nativo del proveedor).
interface ResultadoProveedor { llamadas: LlamadaHerramientaCruda[]; texto: string; historialCrudo: unknown }

const AI_API_KEY = process.env.AI_API_KEY;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const AI_MODEL = process.env.AI_MODEL || (AI_PROVIDER === 'gemini' ? 'gemini-3.6-flash' : 'claude-sonnet-5');

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
7. Cuando el usuario pida sugerencias, planes, recomendaciones u "qué hacer" frente a un delito, usa SIEMPRE la herramienta "sugerirAccionesPreventivas" — nunca inventes un plan por tu cuenta: los planes posibles (Plan Presencia, Registro a Personas, Registro a Vehículos, Plan Baliza, Plan Candado, articulación con Comisaría de Familia o con Policía Judicial) ya están definidos en esa herramienta, junto con la zona y la franja horaria calculadas a partir de los datos reales. Tu trabajo es redactarlo como una recomendación operativa clara, nunca como un hecho garantizado — usa lenguaje de recomendación ("se sugiere", "sería pertinente"), no de certeza.`;
}

// ── Adaptador Anthropic (Claude) ─────────────────────────────────────────
async function llamarAnthropic(
  systemPrompt: string,
  mensajes: CuerpoSolicitud['mensajes'],
  herramientas: EsquemaHerramienta[],
  resultadosHerramientas: ResultadoHerramienta[],
  historialCrudo: unknown,
): Promise<ResultadoProveedor> {
  // Si ya existe un historial nativo de una ronda anterior de ESTA MISMA
  // pregunta (el usuario todavía no ha visto una respuesta final), se parte
  // de ahí — incluye el turno del asistente con el "tool_use" que originó
  // los resultados que se le van a entregar ahora. Si no existe (primera
  // ronda), se arma desde cero a partir del historial en texto plano.
  const mensajesAnthropic: any[] = Array.isArray(historialCrudo) ? [...historialCrudo] : mensajes.map((m) => ({ role: m.rol, content: m.texto }));

  if (resultadosHerramientas.length > 0) {
    mensajesAnthropic.push({
      role: 'user',
      content: resultadosHerramientas.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.resultado) })),
    });
  }

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
  if (!resp.ok) throw new Error(`Anthropic API respondió ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 500)}`);
  const data: any = await resp.json();

  const llamadas = (data.content || [])
    .filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({ id: b.id, nombre: b.name, parametros: b.input || {} }));
  const texto = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();

  // El turno del asistente (con su "tool_use", si lo hubo) se agrega AL
  // HISTORIAL que se le devuelve al cliente — así, en la siguiente ronda,
  // el "tool_result" que se envíe sí va a tener con qué emparejarse.
  mensajesAnthropic.push({ role: 'assistant', content: data.content });

  return { llamadas, texto, historialCrudo: mensajesAnthropic };
}

// ── Adaptador Google Gemini ───────────────────────────────────────────────
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

async function llamarGemini(
  systemPrompt: string,
  mensajes: CuerpoSolicitud['mensajes'],
  herramientas: EsquemaHerramienta[],
  resultadosHerramientas: ResultadoHerramienta[],
  historialCrudo: unknown,
): Promise<ResultadoProveedor> {
  const contents: any[] = Array.isArray(historialCrudo)
    ? [...historialCrudo]
    : mensajes.map((m) => ({ role: m.rol === 'assistant' ? 'model' : 'user', parts: [{ text: m.texto }] }));

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
  if (!resp.ok) throw new Error(`Gemini API respondió ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 500)}`);
  const data: any = await resp.json();

  const partes: any[] = data?.candidates?.[0]?.content?.parts || [];
  const llamadas = partes
    .filter((p) => p.functionCall)
    .map((p, i) => ({ id: `gemini-${Date.now()}-${i}`, nombre: p.functionCall.name, parametros: p.functionCall.args || {} }));
  const texto = partes.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n').trim();

  contents.push({ role: 'model', parts: partes });

  return { llamadas, texto, historialCrudo: contents };
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
      resultado = await llamarGemini(systemPrompt, cuerpo.mensajes, cuerpo.herramientas, cuerpo.resultadosHerramientas, cuerpo.historialCrudo);
    } else if (AI_PROVIDER === 'anthropic') {
      resultado = await llamarAnthropic(systemPrompt, cuerpo.mensajes, cuerpo.herramientas, cuerpo.resultadosHerramientas, cuerpo.historialCrudo);
    } else {
      return { statusCode: 200, body: JSON.stringify({ tipo: 'error', mensaje: `Proveedor de IA "${AI_PROVIDER}" no implementado todavía.` }) };
    }

    if (resultado.llamadas.length > 0) {
      return { statusCode: 200, body: JSON.stringify({ tipo: 'llamada_herramienta', llamadas: resultado.llamadas, historialCrudo: resultado.historialCrudo }) };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'respuesta', texto: resultado.texto || 'No fue posible generar una respuesta con la información disponible.' }),
    };
  } catch (err) {
    console.error('[agenteIA] Error al procesar la solicitud:', err);
    return {
      statusCode: 200,
      body: JSON.stringify({ tipo: 'error', mensaje: 'En este momento no fue posible procesar el análisis. Los datos del Dashboard continúan disponibles.' }),
    };
  }
};
