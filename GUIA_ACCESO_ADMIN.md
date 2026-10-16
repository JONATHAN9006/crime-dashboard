# Acceso del administrador (enlace principal)

- Enlace principal (sin /interno, /jefe ni /cai): pide usuario y contraseña.
- La validación la hace la función de Netlify `accesoAdmin` (netlify/functions/accesoAdmin.ts).
  La contraseña NO está en el código del navegador: solo su hash (scrypt).
- La sesión dura 12 horas; el botón «Cerrar sesión» está al pie del menú lateral.

## Cambiar usuario o contraseña (opcional)
En Netlify → Site configuration → Environment variables:
- `ADMIN_USUARIO` = nuevo usuario
- `ADMIN_CLAVE_HASH` = hash de la nueva contraseña. Para generarlo, en un equipo con Node:

```
node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt$'+s.toString('base64')+'$'+c.scryptSync('NUEVA_CLAVE',s,64).toString('base64'))"
```

Luego: Deploys → Trigger deploy. Para firmar las sesiones usa `ADMIN_SECRETO`
(si no existe, usa la llave de Supabase ya configurada).

## Permisos por enlace
| Enlace | Ingreso | Eliminar capas (X) | Cargar / actualizar | Descargar |
|---|---|---|---|---|
| Principal | Usuario y contraseña | Sí | Sí | Sí |
| /interno | Libre | No | Sí | Sí |
| /jefe | Libre | No | No | No |
| /cai | Usuario de CAI | No | No | No |
