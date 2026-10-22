-- PRUEBA PILOTO · PERFIL consulta_piloto (enlace /piloto)
-- Comandantes de las Estaciones Norte y Sur de Popayán.
--
-- Requisito: haber ejecutado antes supabase/accesos_cai.sql.
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede volver a ejecutar sin problema (no borra nada que ya exista).
--
-- · Agrega la columna "perfil" a cai_usuarios. Los usuarios que ya existen
--   (cai1 … cai10) quedan con perfil 'cai' y siguen funcionando igual.
-- · Crea los dos usuarios del piloto SIN contraseña: el administrador se la
--   asigna desde «Accesos CAI» (se guarda solo como hash scrypt en el
--   servidor; nunca en el código ni en config.js).
-- · El perfil lo decide la BASE, no el navegador: un usuario con perfil
--   'cai' no puede entrar por /piloto ni uno 'consulta_piloto' por /cai.

alter table cai_usuarios add column if not exists perfil text not null default 'cai';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cai_usuarios_perfil_chk') then
    alter table cai_usuarios add constraint cai_usuarios_perfil_chk check (perfil in ('cai', 'consulta_piloto'));
  end if;
end $$;

insert into cai_usuarios (usuario, nombre, perfil) values
  ('estacionnorte', 'Estación Norte', 'consulta_piloto'),
  ('estacionsur',   'Estación Sur',   'consulta_piloto')
on conflict (usuario) do update set perfil = excluded.perfil;

-- Las tablas siguen con RLS activado y SIN políticas públicas: la llave
-- pública del dashboard no puede leerlas ni cambiar el perfil de nadie.
alter table cai_usuarios enable row level security;
alter table cai_sesiones enable row level security;
alter table cai_accesos  enable row level security;
