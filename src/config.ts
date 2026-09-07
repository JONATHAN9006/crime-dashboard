export interface AppConfig {
  backendUrl: string;
  updatePassword: string;
  // URL del backend del "Analista IA" (ver services/agenteIA.ts) — un
  // servicio COMPLETAMENTE APARTE del backendUrl de sincronización de
  // datos de arriba (a propósito: la IA y la sincronización de datos son
  // dos responsabilidades distintas, ver netlify/functions/agenteIA.ts).
  // Vacío = el Analista IA se muestra pero avisa que no está configurado,
  // sin romper el resto del dashboard.
  agenteIAUrl: string;
}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

export function obtenerConfig(): AppConfig {
  return {
    backendUrl: (window.APP_CONFIG && window.APP_CONFIG.backendUrl) || '',
    updatePassword: (window.APP_CONFIG && window.APP_CONFIG.updatePassword) || '',
    agenteIAUrl: (window.APP_CONFIG && window.APP_CONFIG.agenteIAUrl) || '',
  };
}
