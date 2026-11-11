-- Vista de CONSULTA para administrador e interno (v236).
-- Solo LEE: no modifica ni borra ningún registro de crime_records.
--
-- Entrega cada registro igual que la tabla, pero de la fila original del
-- Excel («raw») solo las columnas que el dashboard usa. Así sale de
-- Supabase cerca de la mitad de información en cada descarga (egress).
-- Si la vista no existe, el dashboard sigue leyendo la tabla completa.
--
-- La lista debe coincidir con COLUMNAS_RAW_DASHBOARD (src/data/clavesIdentidad.ts).
create or replace view crime_records_consulta as
select
  dataset,
  id_identidad,
  actualizado_en,
  case
    when datos ? 'raw' and jsonb_typeof(datos -> 'raw') = 'object' then
      (datos - 'raw') || jsonb_build_object('raw', coalesce((
        select jsonb_object_agg(e.key, e.value)
        from jsonb_each(datos -> 'raw') as e
        where lower(e.key) in (
          'delitos', 'delito', 'tematica', 'estacion', 'estación final',
          'cuadrante', 'cuadrante final', 'juris_dependencias',
          'barrios_hecho', 'barrio-ciudad', 'barrio hecho final', 'barrio_hecho',
          'genero', 'genero final',
          'municipio', 'municipio_hecho', 'ciudad',
          'movil_agresor', 'movil_victima', 'movil agresor', 'movil victima',
          'móvil agresor', 'móvil víctima')
      ), '{}'::jsonb))
    else datos
  end as datos
from crime_records;

revoke all on crime_records_consulta from anon, authenticated;

-- Comprobación (solo lectura): tamaño que entrega la vista frente a la tabla.
select pg_size_pretty(sum(pg_column_size(c.datos))) as vista_consulta,
       (select pg_size_pretty(sum(pg_column_size(datos))) from crime_records where dataset = 'delictividad') as tabla_completa
from crime_records_consulta c
where c.dataset = 'delictividad';
