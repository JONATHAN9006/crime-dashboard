// Configuración en tiempo de ejecución del dashboard.
// Puedes editar este archivo directamente en el servidor (sin recompilar el proyecto).
//
// backendUrl: URL de tu backend de Google Apps Script (deja "" para modo local).
// updatePassword: clave que se pedirá SIEMPRE para poder usar "Actualizar información",
//   incluso si el dashboard funciona en modo local (sin backend). Compártela solo con
//   las personas de confianza que pueden actualizar los datos.
// agenteIAUrl: URL del backend del "Analista IA" (una función serverless aparte,
//   ver netlify/functions/agenteIA.ts) — deja "" si todavía no lo has desplegado;
//   el Analista IA se muestra igual, pero avisa que no está configurado.

window.APP_CONFIG = {
  backendUrl: "https://script.google.com/macros/s/AKfycbxxSpQQWb4W_7PCFGSWQPwjG3Vi3oPWXan80VI3_V4PCox-bZRhX-jjgFsqrKpazfUe8g/exec",
  updatePassword: "Mepoy-2026",
  agenteIAUrl: "https://dashboard-cieps.netlify.app/.netlify/functions/agenteIA",
};
