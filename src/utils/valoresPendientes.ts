// Valores "vacíos"/placeholder que NUNCA deben aparecer en rankings, Top,
// gráficos ni hallazgos — para CUALQUIER campo (barrio, estación, CAI,
// cuadrante, etc.), sin importar cuál traiga el placeholder.
//
// Se centraliza aquí porque antes esta misma lista estaba repetida (y
// ligeramente distinta) en useAnalisisPeriodos.ts, useUltimasSemanas.ts y
// useKpis.ts — y una de las tres nunca incluyó "BARRIO PENDIENTE POR
// ASIGNAR" (la forma canónica real que usa MAPA_BARRIO, con la palabra
// "Barrio" al inicio), así que ese valor SÍ se estaba colando en los
// rankings de barrio, aunque la intención siempre fue ocultarlo. Se agrega
// aquí, en la única lista compartida, para que valga en todos lados a la
// vez y no vuelva a desincronizarse.
const VALORES_PENDIENTES = [
  'NO REPORTADO',
  'SIN REPORTAR',
  'SIN ASIGNAR',
  'PENDIENTE POR ASIGNAR',
  'BARRIO PENDIENTE POR ASIGNAR',
  'CUADRANTE PENDIENTE POR ASIGNAR',
  'PENDIENTE',
  'N/A',
  'NA',
  '-',
];

/** true si el valor es un placeholder (vacío/pendiente) que debe ocultarse de rankings y gráficos. */
export function esValorPendiente(v: string | null | undefined): boolean {
  if (!v) return true;
  return VALORES_PENDIENTES.includes(v.trim().toUpperCase());
}

/** Filtra una lista de {key, ...} descartando los que sean placeholders — para usar directo con agruparPor(). */
export function sinValoresPendientes<T extends { key: string }>(filas: T[]): T[] {
  return filas.filter((f) => !esValorPendiente(f.key));
}
