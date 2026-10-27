export interface AppConfig {
  // "backendUrl" ahora es la URL de tu proyecto de Supabase (antes era la
  // URL del Apps Script). Se conserva el mismo nombre a propósito — todo el
  // resto del dashboard (Header.tsx, UpdateDataModal.tsx) solo lo usa como
  // "¿hay un servidor central configurado sí o no?", así que no hace falta
  // tocar esos archivos.
  backendUrl: string;
  // Clave pública ("anon") de tu proyecto de Supabase — solo permite LEER
  // (ver el SQL en supabase/schema.sql: RLS habilitado, política de
  // lectura pública, sin política de escritura). Es seguro que esta clave
  // quede visible en el navegador; la clave que sí debe mantenerse en
  // secreto (service_role, usada para escribir) vive SOLO como variable de
  // entorno en Netlify, dentro de netlify/functions/subirRegistros.ts —
  // nunca en este archivo.
  supabaseAnonKey: string;
  // URL del backend de Apps Script/Drive que se usaba ANTES para todo —
  // se conserva SOLO para el dataset de Operatividad, que por ahora sigue
  // funcionando igual que siempre (no se migró a Supabase en esta primera
  // vuelta, para no arriesgar romperlo sin que hiciera falta). El día que
  // también se migre Operatividad, este campo deja de usarse.
  operatividadBackendUrl: string;
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
    supabaseAnonKey: (window.APP_CONFIG && window.APP_CONFIG.supabaseAnonKey) || '',
    operatividadBackendUrl: (window.APP_CONFIG && window.APP_CONFIG.operatividadBackendUrl) || '',
    updatePassword: (window.APP_CONFIG && window.APP_CONFIG.updatePassword) || '',
    agenteIAUrl: (window.APP_CONFIG && window.APP_CONFIG.agenteIAUrl) || '',
  };
}
