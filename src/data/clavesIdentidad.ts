// Columnas ORIGINALES (raw) que usa la identidad de cada registro
// (csvParser.ts → construirIdentidad / findColumn: delito, estación,
// cuadrante, barrio y género). El enlace piloto recibe SOLO estas columnas
// del archivo original —no las ~100 columnas completas—, así descarga mucho
// menos y la deduplicación da exactamente el mismo resultado.
// Debe coincidir con COLUMN_MAP de csvParser.ts (lo verifica la prueba).
export const COLUMNAS_RAW_IDENTIDAD = [
  'DELITOS', 'Delito', 'DELITO', 'TEMATICA',
  'ESTACION', 'Estación Final',
  'CUADRANTE', 'Cuadrante Final', 'JURIS_DEPENDENCIAS',
  'BARRIOS_HECHO', 'BARRIO-CIUDAD', 'Barrio Hecho Final', 'BARRIO_HECHO',
  'GENERO', 'Genero Final',
];
const EN_MINUSCULA = new Set(COLUMNAS_RAW_IDENTIDAD.map((c) => c.toLowerCase()));

/** Copia de raw con solo las columnas de identidad (sin distinguir mayúsculas). */
export function rawMinimo(raw: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return salida;
  for (const [k, v] of Object.entries(raw as Record<string, string>)) if (EN_MINUSCULA.has(k.toLowerCase())) salida[k] = v;
  return salida;
}

// Columnas ORIGINALES que el dashboard (administrador e interno) lee de
// «raw»: las de identidad + municipio/ciudad (filtro Municipio) + móvil
// agresor/víctima (copias anteriores a esos campos). El resto de columnas
// del Excel ya está procesado en los campos propios del registro.
// Debe coincidir con supabase/vista_consulta.sql.
export const COLUMNAS_RAW_DASHBOARD = [
  ...COLUMNAS_RAW_IDENTIDAD,
  'MUNICIPIO', 'MUNICIPIO_HECHO', 'CIUDAD',
  'MOVIL_AGRESOR', 'MOVIL_VICTIMA', 'MOVIL AGRESOR', 'MOVIL VICTIMA', 'Móvil Agresor', 'Móvil Víctima',
];
const DASHBOARD_MINUSCULA = new Set(COLUMNAS_RAW_DASHBOARD.map((c) => c.toLowerCase()));

/** Copia de raw con solo las columnas que usa el dashboard (sin distinguir mayúsculas). */
export function rawDashboard(raw: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return salida;
  for (const [k, v] of Object.entries(raw as Record<string, string>)) if (DASHBOARD_MINUSCULA.has(k.toLowerCase())) salida[k] = v;
  return salida;
}
/** true si una lista de columnas es solo el subconjunto reducido (vino del servidor). */
export function esListaReducida(columnas: string[]): boolean {
  return columnas.length > 0 && columnas.every((c) => DASHBOARD_MINUSCULA.has(c.toLowerCase()));
}
