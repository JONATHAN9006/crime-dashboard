-- S2IP · CUENTAS DE ACCESO — PARTE 2 (DESPUÉS de publicar v206 y comprobar
-- que entras como administrador, interno y piloto).
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run.
--
-- 1) Borra las cuentas anteriores (cai1–cai10, estacionnorte, estacionsur,
--    jefe1–jefe5) con su historial de ingresos — autorizado: «Borrar todo».
--    Ninguna tenía información de delitos asociada.
drop table if exists cai_accesos;
drop table if exists cai_sesiones;
drop table if exists cai_usuarios;

-- 2) Cierra la LECTURA PÚBLICA de la base: desde aquí, nadie puede leer los
--    datos con la llave pública de config.js. Todas las lecturas pasan por
--    la función datosConsulta, que verifica el rol de cada cuenta.
drop policy if exists "Lectura pública registros" on crime_records;
drop policy if exists "Lectura pública meta" on dataset_meta;
revoke select on crime_records from anon, authenticated;
revoke select on dataset_meta from anon, authenticated;

-- Comprobación: debe decir "false" en las dos columnas.
select has_table_privilege('anon', 'crime_records', 'select') as anon_lee_delitos,
       has_table_privilege('anon', 'dataset_meta', 'select')  as anon_lee_meta;
