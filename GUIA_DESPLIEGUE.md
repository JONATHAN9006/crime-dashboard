# Guía de despliegue — Dashboard con servidor central

Esta guía te lleva paso a paso para que **varias personas de confianza** puedan
actualizar el dashboard, y **todas** las personas que abran el enlace vean
siempre la misma información, sin depender del navegador de cada quien.

Consta de 3 partes:
1. Crear el backend en Google Apps Script (guarda el CSV central).
2. Conectar el dashboard a ese backend.
3. Publicar el dashboard como un sitio web con enlace propio.

No necesitas usar la terminal/bash para nada de esto.

---

## Parte 1 — Crear el backend (Google Apps Script)

1. Ve a **[script.google.com](https://script.google.com)** e inicia sesión con la cuenta de Google que va a "dueña" del archivo central (puede ser tu cuenta normal o una cuenta de Piki Technology).
2. Clic en **"Nuevo proyecto"**.
3. Verás un archivo `Code.gs` vacío. Bórralo todo y pega el contenido del archivo **`apps-script/Code.gs`** que viene en este proyecto.
4. Dentro del código, busca esta línea cerca del inicio:
   ```js
   const TOKEN = 'CAMBIA-ESTA-CLAVE-2026';
   ```
   Reemplázala por una clave propia (una contraseña que solo conocerán las personas de confianza que pueden actualizar el dashboard). Ejemplo:
   ```js
   const TOKEN = 'PikiMepoy-2026-Actualiza';
   ```
5. Arriba a la izquierda, dale un nombre al proyecto, por ejemplo "Backend Dashboard Delitos".
6. Guarda con el ícono de disquete (o Ctrl/Cmd + S).
7. Clic en **"Implementar" → "Nueva implementación"** (botón azul arriba a la derecha).
8. En "Selecciona el tipo", elige **"Aplicación web"**.
9. Configura así:
   - **Descripción**: "API dashboard delitos"
   - **Ejecutar como**: Yo (tu cuenta)
   - **Quién tiene acceso**: **Cualquier usuario** (esto es necesario para que el dashboard, que no usa login de Google, pueda leer y escribir datos)
10. Clic en **"Implementar"**.
11. Google te pedirá autorizar permisos (para poder crear el archivo en tu Drive). Acepta con tu cuenta. Si aparece una pantalla de "Google no verificó esta app", clic en "Avanzado" → "Ir a (nombre del proyecto), no seguro" — es normal para proyectos personales de Apps Script.
12. Al finalizar, Google te da una **URL que termina en `/exec`**. Cópiala completa, la necesitas en la Parte 2.

Con esto, cada vez que el dashboard suba un archivo, Apps Script lo guardará como `Base_de_Datos_General.csv` dentro de una carpeta llamada **"Dashboard Delitos MEPOY"** en el Google Drive de esa cuenta. Puedes entrar a tu Drive en cualquier momento y ver/descargar ese archivo directamente si lo necesitas.

> Si en el futuro necesitas cambiar el código (`Code.gs`), edítalo en script.google.com y vuelve a hacer "Implementar → Nueva implementación" (o "Gestionar implementaciones" → editar la existente) para que los cambios entren en vigor.

---

## Parte 2 — Conectar el dashboard al backend

1. Abre el archivo **`public/config.js`** dentro del proyecto del dashboard.
2. Pega la URL que copiaste en el paso 12 anterior:
   ```js
   window.APP_CONFIG = {
     backendUrl: "https://script.google.com/macros/s/AKfycbx.../exec",
   };
   ```
3. Guarda el archivo.
4. Genera la build de producción:
   ```bash
   npm run build
   ```
   (Si no tienes cómo correr esto, dime y te entrego la carpeta `dist` ya compilada — solo necesitas editar `config.js` dentro de esa carpeta compilada y volver a subirla, sin necesidad de `npm run build` de nuevo, porque `config.js` se lee en tiempo real por el navegador).

---

## Parte 3 — Publicar el dashboard (obtener el enlace web)

1. Ve a **[app.netlify.com/drop](https://app.netlify.com/drop)**.
2. Arrastra la carpeta `dist` (la que generó `npm run build`) a esa página.
3. En segundos obtienes un enlace como `https://tu-dashboard.netlify.app`. Ese es el enlace que puedes compartir con tu equipo.
4. (Recomendado) Crea una cuenta gratuita en Netlify para poder:
   - Renombrar el enlace a algo más memorable (ej. `dashboard-delitos-mepoy.netlify.app`).
   - Volver a desplegar fácilmente cuando haya cambios (arrastrando la carpeta `dist` de nuevo, o conectando un repositorio de GitHub para que se actualice solo).

---

## Cómo queda el flujo de trabajo después de esto

- **Cualquiera** con el enlace puede abrir el dashboard y ver siempre los datos más recientes que hay en el servidor central (Google Drive vía Apps Script).
- **Solo quienes tengan la clave** (`TOKEN`) que definiste en el Paso 1.4 pueden usar "📂 Actualizar información" para subir un CSV nuevo. Compárteles esa clave solo a las personas de confianza, por un canal privado (no la publiques).
- Cada vez que alguien actualiza, todos los demás la verán al abrir el dashboard, o pueden usar el botón **"Sincronizar"** en la parte superior sin recargar la página.
- El campo "Tu nombre" que se pide al actualizar queda registrado como el último responsable de la actualización (visible en "Estado de la información").

## Seguridad — qué es importante saber

- La clave (`TOKEN`) viaja dentro del código de Apps Script, no dentro del sitio web público, así que nadie puede verla mirando el código fuente del dashboard en el navegador.
- Aun así, es una protección básica (un "candado" compartido), no una autenticación individual por persona. Si en el futuro necesitas saber exactamente qué usuario de Google hizo cada cambio (con inicio de sesión real), se puede evolucionar el backend para pedir login de Google — avísame si llegas a necesitar ese nivel de control.
- Todo el procesamiento y los cálculos del dashboard siguen ocurriendo en el navegador de quien lo consulta; el backend solo almacena y entrega el archivo CSV.
