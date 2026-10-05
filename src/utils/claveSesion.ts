// Clave de actualización, pedida a la PERSONA y recordada solo mientras la
// pestaña esté abierta (sessionStorage).
//
// Antes, RNMC, IRISP1, MACRI y las capas del mapa tomaban la clave de
// `config.js` y la enviaban solos — o sea, la clave estaba publicada en el
// frontend y cualquiera que abriera el link podía escribir o borrar datos
// en el servidor central. Ahora nadie la lee de config.js: se pide la
// primera vez que se va a guardar algo, y si el servidor la rechaza se
// olvida para volver a pedirla.

const CLAVE = 'mepoy-clave-actualizacion';

export function claveGuardada(): string | null {
  try { return sessionStorage.getItem(CLAVE); } catch { return null; }
}

export function recordarClaveSesion(valor: string) {
  try { if (valor.trim()) sessionStorage.setItem(CLAVE, valor.trim()); } catch { /* sin sessionStorage: se pedirá cada vez */ }
}

export function olvidarClaveSesion() {
  try { sessionStorage.removeItem(CLAVE); } catch { /* nada que olvidar */ }
}

/** La clave de esta sesión; si no hay, se le pide a la persona. null = canceló. */
export function pedirClaveSesion(para = 'guardar en el servidor central'): string | null {
  const guardada = claveGuardada();
  if (guardada) return guardada;
  const escrita = typeof window !== 'undefined' ? window.prompt(`Escribe la clave de actualización para ${para}.\n(Se recuerda solo mientras esta pestaña esté abierta.)`) : null;
  if (!escrita || !escrita.trim()) return null;
  recordarClaveSesion(escrita);
  return escrita.trim();
}

/** true si el error es de clave rechazada — en ese caso se olvida la guardada. */
export function revisarErrorDeClave(e: unknown): boolean {
  const esDeClave = e instanceof Error && /clave de actualizaci/i.test(e.message);
  if (esDeClave) olvidarClaveSesion();
  return esDeClave;
}

export const MENSAJE_SIN_CLAVE = 'No se guardó en el servidor central porque no se escribió la clave de actualización.';
