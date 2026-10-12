-- ACCESO DE LOS COMANDANTES DE CAI (enlace /cai)
-- Ejecutar UNA vez en Supabase → SQL Editor → New query → pegar todo → Run.
-- Se puede volver a ejecutar sin problema (no borra nada que ya exista).
--
-- Las tres tablas quedan con RLS activado y SIN políticas: la llave pública
-- (anon) del dashboard NO puede leerlas ni escribirlas. Solo la función
-- netlify/functions/accesoCai.ts (llave service_role) las usa.

create table if not exists cai_usuarios (
  usuario      text primary key,          -- cai1 … cai10
  nombre       text,                       -- "CAI 1" …
  clave_hash   text,                       -- scrypt; null = sin contraseña asignada
  activo       boolean not null default true,
  actualizado  timestamptz not null default now()
);

create table if not exists cai_sesiones (
  usuario           text primary key references cai_usuarios(usuario) on delete cascade,
  sesion_id         text not null,         -- una sola sesión viva por usuario
  inicio            timestamptz not null default now(),
  ultima_actividad  timestamptz not null default now(),
  lat               double precision,
  lon               double precision,
  dispositivo       text,
  ip                text
);

create table if not exists cai_accesos (
  id            bigserial primary key,
  usuario       text not null,
  fecha         timestamptz not null default now(),
  evento        text not null,             -- ingreso | salida | fallido | rechazado | bloqueado | cerrada | admin
  detalle       text,
  lat           double precision,
  lon           double precision,
  precision_m   double precision,
  distancia_km  double precision,
  dispositivo   text,
  ip            text
);
create index if not exists cai_accesos_fecha_idx on cai_accesos (fecha desc);
create index if not exists cai_accesos_usuario_idx on cai_accesos (usuario, fecha desc);

alter table cai_usuarios enable row level security;
alter table cai_sesiones enable row level security;
alter table cai_accesos  enable row level security;

insert into cai_usuarios (usuario, nombre) values
  ('cai1', 'CAI 1'), ('cai2', 'CAI 2'), ('cai3', 'CAI 3'), ('cai4', 'CAI 4'), ('cai5', 'CAI 5'),
  ('cai6', 'CAI 6'), ('cai7', 'CAI 7'), ('cai8', 'CAI 8'), ('cai9', 'CAI 9'), ('cai10', 'CAI 10')
on conflict (usuario) do nothing;
