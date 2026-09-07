// Cliente del "Analista IA" — SOLO hace fetch() al backend propio (nunca al
// proveedor de IA directamente: la API key jamás debe estar en el
// navegador). Si no hay backend configurado (ver config.ts →
// agenteIAUrl), responde con un error claro de "no configurado" sin
// intentar ninguna llamada de red — así el dashboard nunca se rompe por
// esto.
import { obtenerConfig } from '../config';
import type { RespuestaAgenteIA, SolicitudAgenteIA } from '../types/agenteIA';
import { ESQUEMAS_HERRAMIENTAS } from './agenteIATools';

export function agenteIAEstaConfigurado(): boolean {
  return obtenerConfig().agenteIAUrl.trim().length > 0;
}

export async function enviarMensajeAgente(solicitud: SolicitudAgenteIA): Promise<RespuestaAgenteIA> {
  const url = obtenerConfig().agenteIAUrl.trim();
  if (!url) {
    return {
      tipo: 'error',
      noConfigurado: true,
      mensaje: 'El Analista IA aún no está configurado. Verifique la configuración del servicio de IA.',
    };
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mensajes: solicitud.mensajes,
        contexto: solicitud.contexto,
        resultadosHerramientas: solicitud.resultadosHerramientas,
        herramientas: ESQUEMAS_HERRAMIENTAS,
      }),
    });
    if (!resp.ok) {
      return { tipo: 'error', mensaje: 'En este momento no fue posible procesar el análisis. Los datos del Dashboard continúan disponibles.' };
    }
    const data = await resp.json();
    // Validación mínima de forma — nunca se confía ciegamente en la
    // respuesta del backend antes de usarla.
    if (data && data.tipo === 'llamada_herramienta' && Array.isArray(data.llamadas)) return data as RespuestaAgenteIA;
    if (data && data.tipo === 'respuesta' && typeof data.texto === 'string') return data as RespuestaAgenteIA;
    if (data && data.tipo === 'error') return data as RespuestaAgenteIA;
    return { tipo: 'error', mensaje: 'El servicio de IA devolvió una respuesta con un formato inesperado.' };
  } catch {
    return { tipo: 'error', mensaje: 'En este momento no fue posible procesar el análisis. Los datos del Dashboard continúan disponibles.' };
  }
}
