# Acceso de los comandantes de CAI (enlace /cai)

Enlace de consulta para los 10 comandantes de CAI, con usuario y contraseña propios.

**Qué hace**
- Usuarios `cai1` a `cai10`. En la pantalla de ingreso cada uno elige su CAI de una lista.
- Solo funciona dentro de Popayán. El navegador pide la ubicación del equipo. Si queda a más de 15 km del centro (Parque Caldas), o si se niega la ubicación, no entra. Esto se vuelve a revisar cada 5 minutos.
- Hay una sola sesión por usuario. Si la misma contraseña se usa en otro equipo, el primero queda por fuera. Así no sirve "pasar" el usuario.
- Es solo consulta. Quedan bloqueados:
  - Actualizar información, Sincronizar y cargar matrices o capas.
  - Las descargas de imágenes, PowerPoint, PDF, Excel, CSV y mapas.
  - Microgerencia, MACRI, IRISP1, Calidad de Datos, Productos Esperados y el Analista IA.
- Cada ingreso, intento fallido, rechazo y salida queda registrado con fecha y hora. Se ve en **Administración → Accesos CAI**, solo en la vista interna y con la clave de administrador.
- Después de 5 contraseñas erradas seguidas, el usuario queda bloqueado 15 minutos. Si se le asigna una contraseña nueva, el bloqueo se levanta.

---

## Activación (una sola vez)

### 1. Crear las tablas en Supabase
1. Entra a Supabase y abre tu proyecto.
2. Ve a **SQL Editor → New query**.
3. Pega todo el contenido de `supabase/accesos_cai.sql` y dale **Run**.

El script crea 3 tablas. La llave pública del dashboard **no** puede leerlas: solo la función del servidor.

### 2. Variables en Netlify (Site configuration → Environment variables)
Ya existen y se reutilizan: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `UPDATE_TOKEN`. `UPDATE_TOKEN` es también la clave de administrador para "Accesos CAI".

Variables opcionales:

| Variable | Valor | Para qué |
|---|---|---|
| `CAI_SECRETO` | una frase larga al azar | Firma las sesiones. Si no existe, se usa la llave de Supabase. |
| `CAI_RADIO_KM` | `15` (por defecto) | Distancia máxima en km desde el centro de Popayán. |
| `CAI_EXIGIR_UBICACION` | `si` (por defecto) / `no` | `no` quita la exigencia de ubicación. Úsalo solo en pruebas o emergencias. |

### 3. Publicar
Publica igual que siempre (Git o `netlify deploy`). La función nueva es `netlify/functions/accesoCai.ts`.

### 4. Asignar las contraseñas
1. Abre `https://TU-SITIO/interno` → menú **Administración → Accesos CAI**.
2. Escribe la clave de administrador (la misma de "Actualizar información").
3. En cada CAI dale **Asignar contraseña**. Usa mínimo 6 caracteres, y mejor una distinta por CAI.
4. Entrega a cada comandante el enlace `https://TU-SITIO/cai` y su contraseña por un canal privado.

Desde esa misma página puedes cambiar contraseñas, desactivar un usuario o cerrar una sesión abierta. El número verde del menú son los ingresos de hoy.

---

## Recomendaciones
- **Ubicación en computador de escritorio.** Sin GPS, el navegador calcula la ubicación por la red y a veces la ubica mal, incluso en otra ciudad. Si un comandante es rechazado estando en Popayán, el registro muestra la distancia calculada. En ese caso sube `CAI_RADIO_KM` o pídele que ingrese desde el celular.
- **Enlaces sin contraseña.** `/interno`, `/jefe` y la dirección principal siguen abiertos como hoy. No se los compartas a los comandantes.
- **Límite de la protección.** El ingreso con contraseña protege el enlace `/cai`. Pero los datos siguen en la base que el dashboard lee con la llave pública, la que está en `config.js`. Una persona técnica que tenga esa llave podría leerlos directamente. Cerrar eso exige que todo el dashboard (también `/interno` y `/jefe`) inicie sesión.
- **Capturas de pantalla.** Se puede bloquear la descarga, pero no las capturas de pantalla ni las fotos con el celular.
