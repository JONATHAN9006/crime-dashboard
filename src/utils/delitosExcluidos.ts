import type { CrimeRecord } from '../types/crime';

// Delitos excluidos de TODO el dashboard — nunca cuentan en ningún cálculo
// (KPIs, comparativos, Microgerencia, Analista IA, etc.) ni aparecen como
// opción en el filtro de Delito, porque se filtran aquí mismo, antes de que
// "records" llegue a cualquier otro componente. Para volver a incluir un
// delito, basta con quitarlo de esta lista — no hace falta tocar nada más.
const DELITOS_EXCLUIDOS = new Set(['H. CELULAR', 'H. BICICLETAS', 'H. CABLE']);

export function excluirDelitosOmitidos(records: CrimeRecord[]): CrimeRecord[] {
  return records.filter((r) => !DELITOS_EXCLUIDOS.has((r.delito ?? '').toUpperCase()));
}
