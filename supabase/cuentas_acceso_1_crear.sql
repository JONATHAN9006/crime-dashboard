-- S2IP · CUENTAS DE ACCESO — PARTE 1 (antes de publicar la versión v206)
-- Ejecutar en Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede volver a ejecutar sin problema: no crea nada duplicado.
--
-- Solo existen TRES cuentas — una por enlace — y la base NO admite otras:
-- la llave primaria es el rol y solo acepta 'administrador', 'interno' y
-- 'piloto'. No hay ninguna función ni script que cree más cuentas.
--   administrador → https://dashboard-cieps.netlify.app/
--   interno       → https://dashboard-cieps.netlify.app/interno
--   piloto        → https://dashboard-cieps.netlify.app/piloto
-- Las contraseñas se guardan solo como hash scrypt y se asignan desde el
-- panel «Cuentas de acceso» del administrador. Las tres tablas tienen RLS
-- activado y SIN políticas: la llave pública no puede leerlas.

create table if not exists cuentas_acceso (
  rol          text primary key check (rol in ('administrador', 'interno', 'piloto')),
  usuario      text not null unique,
  nombre       text not null,
  clave_hash   text,                       -- null = sin contraseña asignada (administrador: usa la de Netlify)
  activo       boolean not null default true,
  ambito       text not null default 'mepoy' check (ambito in ('mepoy', 'popayan')),  -- solo aplica al piloto
  actualizado  timestamptz not null default now()
);

create table if not exists sesiones_acceso (
  sesion_id         text primary key,      -- varias sesiones a la vez por cuenta
  rol               text not null references cuentas_acceso(rol) on delete cascade,
  inicio            timestamptz not null default now(),
  ultima_actividad  timestamptz not null default now(),
  dispositivo       text,
  ip                text
);
create index if not exists sesiones_acceso_rol_idx on sesiones_acceso (rol);

create table if not exists bitacora_acceso (
  id            bigserial primary key,
  rol           text not null,
  fecha         timestamptz not null default now(),
  evento        text not null,             -- ingreso | salida | fallido | rechazado | bloqueado | cerrada | seguridad | admin
  detalle       text,
  distancia_km  double precision,
  dispositivo   text,
  ip            text
);
create index if not exists bitacora_acceso_fecha_idx on bitacora_acceso (fecha desc);
create index if not exists bitacora_acceso_rol_idx on bitacora_acceso (rol, evento, fecha desc);

alter table cuentas_acceso  enable row level security;
alter table sesiones_acceso enable row level security;
alter table bitacora_acceso enable row level security;

insert into cuentas_acceso (rol, usuario, nombre, ambito) values
  ('administrador', 'MEPOY_CIEPS', 'Administrador', 'mepoy'),
  ('interno',       'interno',     'Usuario interno', 'mepoy'),
  ('piloto',        'piloto',      'Usuario piloto',  'mepoy')
on conflict (rol) do nothing;

-- Vista LIVIANA de delitos para el piloto (sin las ~100 columnas originales).
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
revoke all on crime_records_ligero from anon, authenticated;

-- Comprobación: deben salir exactamente 3 filas.
select rol, usuario, nombre, activo, ambito from cuentas_acceso order by rol;
