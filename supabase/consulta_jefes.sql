-- ENLACE DE CONSULTA /piloto PARA JEFES (toda la jurisdicción MEPOY)
-- + VISTA LIVIANA para que la consulta gaste mucho menos "Egress".
-- Requisito: haber ejecutado antes accesos_cai.sql y piloto_consulta.sql.
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede volver a ejecutar sin problema.

-- 1) Ámbito de cada usuario de consulta:
--    'popayan' → Estaciones Norte y Sur (todo limitado a Popayán)
--    'mepoy'   → jefes (Popayán, Timbío, Sotará y Coconuco)
alter table cai_usuarios add column if not exists ambito text not null default 'popayan';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cai_usuarios_ambito_chk') then
    alter table cai_usuarios add constraint cai_usuarios_ambito_chk check (ambito in ('popayan', 'mepoy'));
  end if;
end $$;

-- 2) Usuarios de los jefes (sin contraseña: el administrador la asigna en
--    «Accesos»). Puedes cambiar el nombre visible o agregar más con la misma forma.
insert into cai_usuarios (usuario, nombre, perfil, ambito) values
  ('jefe1', 'Jefe 1', 'consulta_piloto', 'mepoy'),
  ('jefe2', 'Jefe 2', 'consulta_piloto', 'mepoy'),
  ('jefe3', 'Jefe 3', 'consulta_piloto', 'mepoy'),
  ('jefe4', 'Jefe 4', 'consulta_piloto', 'mepoy'),
  ('jefe5', 'Jefe 5', 'consulta_piloto', 'mepoy')
on conflict (usuario) do update set perfil = excluded.perfil, ambito = excluded.ambito;

-- Las estaciones siguen limitadas a Popayán.
update cai_usuarios set ambito = 'popayan' where usuario in ('estacionnorte', 'estacionsur');

-- 3) Enlace /cai retirado: se desactivan sus usuarios y se cierran sus sesiones.
update cai_usuarios set activo = false where perfil = 'cai';
delete from cai_sesiones where usuario in (select usuario from cai_usuarios where perfil = 'cai');

-- 4) Vista LIVIANA de delitos: el mismo registro, sin las ~100 columnas
--    originales del archivo (solo las 15 que usa la identidad del registro)
--    y sin los datos de quién cargó cada lote.
create or replace view crime_records_ligero as
select
  dataset,
  id_identidad,
  (datos - 'raw' - 'loteId' - 'loteArchivo' - 'loteFecha' - 'loteUsuario')
    || jsonb_build_object('raw', coalesce((
         select jsonb_object_agg(e.key, e.value)
         from jsonb_each(datos -> 'raw') as e
         where lower(e.key) in (
           'delitos', 'delito', 'tematica', 'estacion', 'estación final',
           'cuadrante', 'cuadrante final', 'juris_dependencias',
           'barrios_hecho', 'barrio-ciudad', 'barrio hecho final', 'barrio_hecho',
           'genero', 'genero final')
       ), '{}'::jsonb)) as datos
from crime_records;

-- Solo la función del servidor (llave service_role) puede leerla.
revoke all on crime_records_ligero from anon, authenticated;
