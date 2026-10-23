> **Actualizado en v206:** las cuentas por estación, jefes y CAI ya no existen. Las cuentas y los enlaces vigentes están en `docs/CUENTAS_Y_ENLACES.md`. Las restricciones territoriales del piloto descritas aquí siguen aplicando cuando la cuenta piloto tiene territorio «Solo Popayán».

# S2IP · Prueba piloto `consulta_piloto` (enlace `/piloto`)

Acceso para los comandantes de las **Estaciones Norte y Sur**, con consulta restringida a **Popayán, Cauca**.

## Puesta en marcha

1. **Supabase → SQL Editor:** ejecutar `supabase/piloto_consulta.sql`, después de `supabase/accesos_cai.sql`.
   - Agrega la columna `perfil` a `cai_usuarios`.
   - Crea `estacionnorte` y `estacionsur` con perfil `consulta_piloto`.
2. **Dashboard de administrador → «Accesos CAI»:** asignar la contraseña de cada estación.
   - Se guarda solo como hash scrypt.
   - Los usuarios del piloto aparecen marcados como «Piloto · /piloto».
3. **Desplegar** por Git o con `netlify deploy`. Las funciones de Netlify no se publican con Netlify Drop.
   - Nueva función: `datosPiloto`.
   - Variables que ya existen: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CAI_SECRETO` y `UPDATE_TOKEN`.
4. **Enlace para los comandantes:** `https://<sitio>/piloto`.

## Restricciones aplicadas

### Menú

| Capa | Qué hace |
|---|---|
| Menú | Solo aparecen 6 módulos: Inicio / Resumen, Delictividad por Unidad, Operatividad por Unidad, Últimas 4 Semanas, Matriz de Calor y Mapa / Georreferenciación. Los demás no aparecen, ni siquiera atenuados. Los estilos del sidebar no cambian. |
| Rutas | `App.tsx` solo abre páginas autorizadas para el modo; cualquier otra se reemplaza por Inicio. Microgerencia, el Analista IA, «Actualizar información» y Plan Candado no se muestran. |

### Perfil y datos

| Capa | Qué hace |
|---|---|
| Perfil | Lo decide el servidor (`cai_usuarios.perfil`) y viaja en un token firmado con HMAC. Si el navegador cambia el perfil, la firma deja de ser válida. Un usuario CAI no entra por `/piloto`, y uno del piloto no entra por `/cai`. |
| Datos de delitos | El piloto no consulta la base directamente: `obtenerCliente` lo bloquea. Los datos llegan por `datosPiloto`, que valida token, sesión única, usuario activo y perfil. Solo entrega registros con coordenadas dentro del límite DANE de Popayán, o sin coordenadas pero de E-Norte o E-Sur. Timbío, Sotará y Puracé/Coconuco nunca salen del servidor. El navegador vuelve a filtrar como segunda barrera. |
| Capas geográficas | `datosPiloto` las recorta a Popayán en el servidor. Las capas que quedan vacías no se listan. Las capas originales del administrador no se modifican. |
| Copia local | El piloto no lee ni escribe IndexedDB, el sello ni la copia de Operatividad del equipo; todo queda en memoria. Así nunca ve datos completos de otro perfil guardados en ese computador, ni deja copia de nada. |

### Mapa

| Capa | Qué hace |
|---|---|
| Límites | Usa `maxBounds` del límite de Popayán con un margen de unos 2 km, `maxBoundsViscosity = 1` y zoom mínimo 11. |
| Vista | Oscurece lo que queda fuera del municipio. Los mapas generales solo muestran Popayán; el minimapa regional se oculta. |
| Navegación | «Ir a» solo ofrece Popayán. El buscador solo indexa capas ya recortadas. |
| Validación fallida | El mapa no se abre: aparece un aviso neutro y se registra el evento `seguridad` en `cai_accesos`. |
| Ubicación | Se pide como capa complementaria, igual que en /cai. No es el mecanismo de autorización. |

### Escritura y descargas

| Capa | Qué hace |
|---|---|
| Escritura | `subirRegistros` exige `UPDATE_TOKEN`, que el piloto no tiene. `datosPiloto` responde 403 a cualquier acción que no sea de lectura. |
| Descargas y cargas | Se aplica el bloqueo global de descargas y cargas (`bloqueoDescargas.ts`) porque el modo no tiene `descargas` ni `actualizarInformacion`. |

## Riesgos residuales

Estos riesgos se deben conocer antes de ampliar el piloto.

1. **`crime_records` sigue con lectura pública (RLS) y la llave anónima está en `config.js`.**
   - Se necesita así porque `/jefe` e `/interno` no tienen contraseña.
   - El dashboard del piloto ya no la usa, pero alguien con conocimientos técnicos podría consultar la base directamente con esa llave.
   - **Para un cierre real:** quitar la política de lectura pública y servir `/jefe` e `/interno` también desde funciones autenticadas.
2. **Operatividad viene del Apps Script público.**
   - Para el piloto se filtra en el navegador (Norte/Sur o coordenadas en Popayán).
   - Para filtrarla en la fuente habría que moverla a Supabase o agregar el filtro en el Apps Script.
3. **La geolocalización del navegador se puede falsear.** Por eso solo es un control adicional.
4. **La función `agenteIA` no exige sesión.** No es una escritura y el piloto no la ve, pero conviene protegerla.
5. **Límite DANE y registros mal etiquetados.** Un registro etiquetado como Norte/Sur cuyas coordenadas caen fuera del límite DANE de Popayán (por ejemplo, en Timbío) se excluye. Conviene revisar con los datos reales cuántos quedan fuera.

## Archivos

### Nuevos

- `src/utils/territorioPiloto.ts`: límite de Popayán, validación y reglas de punto, registro y capa. Lo usan tanto el navegador como el servidor.
- `src/components/mapa/RestriccionPiloto.tsx`: compuerta del mapa, límites, máscara y aviso neutro.
- `netlify/functions/datosPiloto.ts`: fuente de datos de solo lectura, restringida a Popayán.
- `netlify/lib/sesionesAcceso.ts`: token firmado con perfil y validación de la sesión.
- `supabase/piloto_consulta.sql`
- `docs/PILOTO_CONSULTA.md`

### Modificados

- `netlify/functions/accesoCai.ts`: perfiles, evento de seguridad y perfil en el resumen del administrador.
- `src/utils/modoAcceso.ts`: ruta `/piloto`.
- `src/config/dashboardAccess.ts`: permisos del modo `piloto`.
- `src/App.tsx`: protección de páginas y la puerta de ingreso.
- `src/cai/PuertaCai.tsx` y `src/cai/apiCai.ts`: usuarios Norte/Sur, sesión propia, perfil y token.
- `src/components/layout/Sidebar.tsx`: solo los ítems autorizados y la leyenda «Consulta piloto».
- `src/components/layout/Header.tsx`: oculta Microgerencia en el piloto.
- `src/context/DataContext.tsx`: sin copia local en el piloto, filtro de Popayán y Operatividad limitada.
- `src/data/supabaseApi.ts`: lectura vía `datosPiloto` y bloqueo de consultas directas y escrituras.
- `src/data/geoSync.ts`: capas del piloto vía `datosPiloto`.
- `src/data/geoStorage.ts` y `src/data/puntosStorage.ts`: memoria de sesión y recorte a Popayán.
- `src/data/storage.ts`: el piloto no lee ni escribe IndexedDB.
- `src/data/planCandadoUbicaciones.ts`: el piloto no consulta Plan Candado.
- `src/pages/MapaGeorreferenciacion.tsx`: compuerta, capas recortadas, límites, máscara y minimapa.
- `src/components/multifecha/MapaCalorMultifecha.tsx`: la misma restricción.
- `src/components/mapa/RelieveTerreno.tsx`: «Ir a» solo Popayán.
- `src/pages/AccesosCai.tsx`: etiqueta «Piloto».

## Pruebas realizadas

Se ejecutaron con las funciones de Netlify reales, empaquetadas, y una base Supabase simulada en memoria. El navegador fue Chromium con Playwright.

| # | Prueba | Resultado |
|---|---|---|
| 1 | Mismos colores y estilos del sidebar que el administrador (fondo, ancho, ítem activo, títulos y tipografía) | ✔ |
| 2 | Solo los 6 módulos, bajo «ANÁLISIS PRINCIPAL» y «SEGUIMIENTO», sin ítems atenuados | ✔ |
| 3 | El filtro de estación recalcula los resultados; solo se ofrecen E-Norte y E-Sur | ✔ |
| 4 | Sin botones de carga, descarga o edición; una descarga forzada desde la consola queda bloqueada | ✔ |
| 5 | Registros, capas, etiquetas y buscador solo de Popayán. La copia local de otro perfil se ignora. No hay consultas directas a la base. | ✔ |
| 6 | Tras arrastrar y alejar el zoom, 0 teselas fuera del ámbito y zoom mínimo 11. «Ir a» solo ofrece Popayán. El servidor no entrega Timbío, Coconuco, Sotará ni registros «Norte» con coordenadas de Timbío. | ✔ |
| 7 | Con el límite alterado, el mapa no se abre; aparece un aviso neutro y queda el evento en la bitácora | ✔ |
| 8 | El administrador conserva sus 13 módulos, los 5 territorios en «Ir a» y el mapa sin máscara | ✔ |
| 9 | Ver el detalle abajo | ✔ |

Detalle de la prueba 9. Cada uno de estos intentos se rechaza:

- un token con el perfil cambiado;
- un token del piloto usado en `/cai`;
- un usuario CAI en `/piloto`;
- `datosPiloto` con las acciones subir, borrar, descargar, exportar o admin (responde 403);
- `subirRegistros` (subir y borrar por años);
- las acciones de administrador;
- un comodín en `capaId`;
- texto libre en la bitácora;
- una sesión reemplazada.

## Cambios v204: un solo enlace de consulta

- **Enlaces retirados:** `/jefe` y `/cai` muestran «Este enlace ya no está disponible». El servidor también rechaza los ingresos por `/cai`.
- **Enlace de consulta:** `/piloto` sirve para estaciones y jefes. Cada usuario tiene un **ámbito**, guardado en la base:
  - `popayan`: Estaciones Norte y Sur, con todo limitado a Popayán.
  - `mepoy`: jefes, con toda la jurisdicción; mapa sin límites, todas las capas y estaciones.
- **Ingreso:** el usuario se escribe; no hay una lista visible de cuentas.
- **Copia local por usuario:**
  - Al volver a abrir el dashboard solo se confirman la fecha y el conteo con el servidor; no se descarga todo otra vez.
  - Si hay información nueva, se descarga.
  - Al cerrar sesión, la copia se borra.
- **Vista liviana en Supabase (`crime_records_ligero`):** la base entrega los registros sin las ~100 columnas originales, con mucho menos consumo de Egress. Si la vista no existe, la función usa la tabla completa.
- **SQL:** `supabase/consulta_jefes.sql`.
  - Agrega el ámbito y crea los usuarios `jefe1` a `jefe5`.
  - Desactiva los usuarios CAI y crea la vista liviana.
