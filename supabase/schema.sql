-- ============================================================================
-- Esquema de Supabase — reemplazo del backend de Google Apps Script/Drive.
-- Pégalo completo en Supabase → SQL Editor → Run, una sola vez.
-- ============================================================================

-- Una fila por registro (delito u operatividad). El registro COMPLETO va en
-- "datos" (jsonb) — así se conserva exactamente el mismo objeto que ya arma
-- el dashboard en el navegador (CrimeRecord), sin tener que mantener una
-- columna SQL por cada campo. "dataset", "id_identidad", "fecha" y "delito"
-- se guardan APARTE, repetidos, solo para poder filtrar/indexar rápido en el
-- servidor sin tener que traer y descomprimir el JSON completo cada vez.
--
-- "id_identidad" es el MISMO identificador que el dashboard ya calcula en el
-- navegador (ver buildRecordId en csvParser.ts — OBJECTID+fecha, o un hash
-- del contenido si no hay OBJECTID). La restricción UNIQUE de abajo es la
-- pieza clave: hace, a nivel de base de datos, lo que antes se intentaba
-- hacer a mano con un archivo CSV completo — dos personas subiendo el MISMO
-- registro (mismo dataset + misma identidad) nunca pueden duplicarlo ni
-- pisarse por accidente entre sí; Postgres se encarga solo, con un
-- "ON CONFLICT" (ver la función de Netlify que hace las subidas).
create table if not exists crime_records (
  dataset text not null default 'delictividad',
  id_identidad text not null,
  fecha date,
  anio int,
  delito text,
  datos jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (dataset, id_identidad)
);

create index if not exists idx_crime_records_dataset_anio on crime_records (dataset, anio);
create index if not exists idx_crime_records_dataset_delito on crime_records (dataset, delito);
create index if not exists idx_crime_records_dataset_fecha on crime_records (dataset, fecha);

-- Metadatos por dataset — reemplaza a las PropertiesService del Apps Script
-- (cuándo fue la última actualización y quién la hizo).
create table if not exists dataset_meta (
  dataset text primary key,
  ultima_actualizacion timestamptz,
  ultimo_usuario text
);

-- Seguridad: lectura pública (cualquiera con la URL puede VER el dashboard,
-- igual que hoy), pero ninguna escritura directa desde el navegador — todas
-- las subidas pasan por la función de Netlify, que usa una clave separada
-- (service_role) que nunca se expone al público y sí valida la contraseña
-- de actualización.
alter table crime_records enable row level security;
alter table dataset_meta enable row level security;

drop policy if exists "Lectura pública registros" on crime_records;
create policy "Lectura pública registros" on crime_records for select using (true);

drop policy if exists "Lectura pública meta" on dataset_meta;
create policy "Lectura pública meta" on dataset_meta for select using (true);
