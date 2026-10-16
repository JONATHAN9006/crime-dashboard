// Color fijo por año en las tendencias (el más antiguo morado y el más
// reciente verde petróleo; los intermedios con tonos bien distintos).
const COLORES_INTERMEDIOS = ['#0891b2', '#d97706', '#db2777', '#10233f', '#65a30d', '#475569'];
export function colorAnio(i: number, total: number): string {
  if (i === 0) return '#7c3aed';
  if (i === total - 1) return '#116762';
  return COLORES_INTERMEDIOS[(i - 1) % COLORES_INTERMEDIOS.length];
}

/** Ranking de años por casos: mayor a menor; en empate, primero el año más reciente. */
export function ordenarAniosPorCasos<T extends { anio: string; casos: number }>(datos: T[]): T[] {
  return [...datos].sort((a, b) => b.casos - a.casos || Number(b.anio) - Number(a.anio));
}
