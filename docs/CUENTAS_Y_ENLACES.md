# S2IP · Cuentas y enlaces (v206)

**Tres cuentas, tres enlaces y ninguna otra.**

| Cuenta | Enlace | Ingreso | Qué puede hacer |
|---|---|---|---|
| Administrador | `https://dashboard-cieps.netlify.app/` | Usuario y contraseña (`accesoAdmin`) | Todo, incluido el panel «Cuentas de acceso». |
| Usuario interno | `https://dashboard-cieps.netlify.app/interno` | Usuario y contraseña (`accesoCuentas`) | Funciones internas. No tiene Plan Candado ni el panel de cuentas. |
| Usuario piloto | `https://dashboard-cieps.netlify.app/piloto` | Usuario y contraseña (`accesoCuentas`); se pide la ubicación del equipo | Consulta de 6 módulos, sin cargas ni descargas. El territorio se configura en el panel: «Toda MEPOY» o «Solo Popayán». |

Cualquier otra ruta, incluidas las antiguas `/jefe` y `/cai`, lleva a `/`.

La regla «catch-all» de `netlify.toml` (`/* → /index.html`) hace que las tres rutas funcionen al abrirlas directamente y al actualizar la página.

## Puesta en marcha (en este orden)

1. **Supabase → SQL Editor:** ejecutar `supabase/cuentas_acceso_1_crear.sql`. Crea las 3 cuentas y la vista liviana; no borra nada.
2. **Publicar v206** por Git o con `netlify deploy`, para que se publiquen las funciones.
3. **Entrar como administrador** en `/`, con el usuario y la contraseña de siempre. Abrir «Cuentas de acceso» y asignar las contraseñas de **interno** y **piloto**.
4. **Comprobar** que se puede entrar en `/interno` y en `/piloto`.
5. **Supabase → SQL Editor:** ejecutar `supabase/cuentas_acceso_2_cerrar.sql`.
   - Borra las 17 cuentas anteriores con su historial (autorizado: «Borrar todo»).
   - **Cierra la lectura pública** de la base.

## Por qué no se vuelven a generar cuentas

- **La base no lo permite.** La llave primaria de `cuentas_acceso` es el **rol**, con una restricción que solo admite `administrador`, `interno` y `piloto`. Insertar `jefe1`, `cai1` o duplicar una cuenta da error.
- **No hay código que cree cuentas.** Se eliminaron los scripts que las creaban (`accesos_cai.sql`, `piloto_consulta.sql`, `consulta_jefes.sql`) y las listas fijas de CAI del código. Ninguna función tiene una acción para crear cuentas.
- **El script de creación se puede repetir.** `cuentas_acceso_1_crear.sql` usa `on conflict do nothing`, así que ejecutarlo varias veces no agrega nada.

## Seguridad: los permisos los decide el servidor

- **Lecturas.** Todas pasan por `netlify/functions/datosConsulta.ts`, que identifica el rol a partir de un token firmado y validado en la base:

  | Rol | Puede leer |
  |---|---|
  | Administrador | Todo |
  | Interno | Todo excepto Plan Candado |
  | Piloto | Delitos (livianos y, si su territorio es «Solo Popayán», recortados) y capas |

  Con la parte 2 del SQL, la llave pública de `config.js` ya no puede leer nada.
- **Escrituras.** Solo pasan por `subirRegistros`, con la clave de actualización (`UPDATE_TOKEN`). Ninguna sesión, ni siquiera la del administrador, escribe sin esa clave.
- **Panel «Cuentas de acceso».** Cada acción exige el token de administrador. Interno y piloto reciben 401.
- **Roles.** Cambiar la ruta o copiar una sesión de un enlace a otro no da más permisos: el servidor rechaza el token.
- **Contraseñas.** Se guardan solo como hash scrypt.
  - La del administrador puede cambiarse desde el panel. Si nunca se cambió, vale la de Netlify (`ADMIN_CLAVE_HASH`).
- **Sesiones.**
  - Interno y piloto admiten varias sesiones a la vez.
  - Cambiar la contraseña, desactivar la cuenta o cambiar el territorio del piloto cierra las sesiones abiertas.
- **Intentos fallidos.** Cinco seguidos bloquean ese equipo (IP) durante 15 minutos.
- **Bitácora.** Ingresos, intentos fallidos, salidas, eventos de seguridad y acciones del administrador quedan en `bitacora_acceso`.

### Variables opcionales de Netlify

| Variable | Valor por defecto |
|---|---|
| `PILOTO_EXIGIR_UBICACION` | `si`; con `no` deja de pedir la ubicación |
| `PILOTO_RADIO_KM` | `40` km desde Popayán (cubre MEPOY) |

## Archivos

### Nuevos

- `netlify/functions/accesoCuentas.ts`
- `netlify/functions/datosConsulta.ts`
- `src/cuentas/apiCuentas.ts`
- `src/cuentas/PuertaCuenta.tsx`
- `src/pages/AccesosCuentas.tsx`
- `supabase/cuentas_acceso_1_crear.sql`
- `supabase/cuentas_acceso_2_cerrar.sql`
- `docs/CUENTAS_Y_ENLACES.md`

### Reescritos o modificados

- `netlify/lib/sesionesAcceso.ts`
- `netlify/functions/accesoAdmin.ts`
- `src/utils/modoAcceso.ts`
- `src/config/dashboardAccess.ts`
- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`
- `src/data/supabaseApi.ts`
- `src/data/rnmcStorage.ts`, `src/data/irispStorage.ts`, `src/data/macriStorage.ts`
- `src/data/geoSync.ts`
- `src/data/planCandadoUbicaciones.ts`
- `supabase/schema.sql`: ya no crea la lectura pública.

### Eliminados

- `netlify/functions/accesoCai.ts`
- `netlify/functions/datosPiloto.ts`
- `src/cai/` (PuertaCai, apiCai)
- `src/pages/AccesosCai.tsx`
- `supabase/accesos_cai.sql`, `supabase/piloto_consulta.sql`, `supabase/consulta_jefes.sql`
- `GUIA_ACCESO_CAI.md`

## Pruebas (v206)

| Grupo | Cómo se probó | Resultado |
|---|---|---|
| SQL | En PostgreSQL real (PGlite) | 11/11 |
| Servidor | Funciones reales con una base simulada | 51/51 |
| Navegador: tres enlaces, panel, rutas y escalamiento | Playwright | 21/21 |
| Navegador: piloto «Solo Popayán» | Playwright | 20/20 |
| Navegador: validación territorial fallida | Playwright | 5/5 |
| Navegador: piloto «Toda MEPOY» y copia local | Playwright | 8/8 |

Las pruebas de SQL comprueban, entre otras cosas:

- quedan exactamente 3 cuentas aunque el script se ejecute dos veces;
- la base rechaza `jefe1`, `cai1`, duplicados y roles inventados;
- la llave pública queda sin lectura;
- volver a ejecutar `schema.sql` no la reabre.
