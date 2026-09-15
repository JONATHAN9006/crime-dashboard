import type { CrimeRecord } from '../types/crime';

// Delitos excluidos de TODO el dashboard — nunca cuentan en ningún cálculo
// (KPIs, comparativos, Microgerencia, Analista IA, etc.) ni aparecen como
// opción en el filtro de Delito, porque se filtran aquí mismo, antes de que
// "records" llegue a cualquier otro componente. Para volver a incluir un
// delito, basta con quitarlo de esta lista — no hace falta tocar nada más.
//
// Debe coincidir SIEMPRE con DELITOS_EXCLUIDOS_GLOBAL en DataContext.tsx —
// son dos filtros redundantes por diseño (uno al cargar, otro al mostrar),
// pero si dicen cosas distintas, uno de los dos actúa "a escondidas" sin
// que se note. Esto pasó de verdad: aquí seguían excluidos H. Celular/
// Bicicletas/Cable después de que se pidió explícitamente dejar de
// excluirlos — se corrige para que ambas listas digan lo mismo.
const DELITOS_EXCLUIDOS = new Set(['LESIONES AT', 'HOMICIDIO EN AT']);

export function excluirDelitosOmitidos(records: CrimeRecord[]): CrimeRecord[] {
  return records.filter((r) => !DELITOS_EXCLUIDOS.has((r.delito ?? '').toUpperCase()));
}
