// Configuración en tiempo de ejecución del dashboard.
// Puedes editar este archivo directamente en el servidor (sin recompilar el proyecto).
//
// backendUrl: URL de tu proyecto de Supabase (Project Settings → API → "Project URL").
//   Es el backend del dataset de DELICTIVIDAD. Deja "" para modo local.
// supabaseAnonKey: la clave "anon public" de ese mismo panel (Project Settings → API).
//   Es pública a propósito — solo permite LEER (ver supabase/schema.sql). NUNCA pongas
//   aquí la clave "service_role" (esa es secreta y solo va como variable de entorno
//   en Netlify, para la función netlify/functions/subirRegistros.ts).
// operatividadBackendUrl: la URL del Apps Script/Drive de siempre — Operatividad
//   sigue funcionando igual que antes, sin cambios, mientras no se migre también a
//   Supabase.
// updatePassword: clave que se pedirá SIEMPRE para poder usar "Actualizar información".
//   Compártela solo con las personas de confianza que pueden actualizar los datos.
// agenteIAUrl: URL del backend del "Analista IA" (una función serverless aparte,
//   ver netlify/functions/agenteIA.ts) — deja "" si todavía no lo has desplegado.

window.APP_CONFIG = {
  backendUrl: "https://noomqbzbkecwgyirnwim.supabase.co",
  supabaseAnonKey: "sb_publishable_2hS5D9iCjaOKeSXdYOrDpg_jRRaWniM",
  operatividadBackendUrl: "https://script.google.com/macros/s/AKfycbw5YKQVuG9z0nvgCNqqSvxm9x_7EKqX2XAyoTcXY215CZEbj8b35sgARZozhAa6IegG/exec",
  updatePassword: "Cieps2026**",
  agenteIAUrl: "",
};
