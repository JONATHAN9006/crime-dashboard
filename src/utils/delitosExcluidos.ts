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
// que se note. Ya pasó dos veces: quedaron desincronizadas después de un
// cambio en una sola de las dos listas.
// Debe coincidir SIEMPRE con DELITOS_EXCLUIDOS_GLOBAL en DataContext.tsx y
// con DELITOS_EXCLUIDOS_MAPA en MapaGeorreferenciacion.tsx — son tres
// filtros redundantes por diseño (uno al cargar, uno al mostrar en el
// dashboard, uno al mostrar en el mapa), pero si dicen cosas distintas, uno
// de los tres actúa "a escondidas" sin que se note. Ya pasó dos veces:
// quedaron desincronizadas después de un cambio en una sola de las listas.
// Se exporta en la misma forma canónica que ya usan los valores reales de
// "delito" (ej. "H. Celular", no "H. CELULAR") para que los otros dos
// archivos puedan importarla directamente — una sola fuente de verdad
// real, no solo de palabra.
export const DELITOS_EXCLUIDOS_CANONICOS = ['H. Celular', 'H. Bicicletas', 'H. Cable', 'Lesiones AT', 'Homicidio en AT'];
const DELITOS_EXCLUIDOS = new Set(DELITOS_EXCLUIDOS_CANONICOS.map((d) => d.toUpperCase()));

export function excluirDelitosOmitidos(records: CrimeRecord[]): CrimeRecord[] {
  return records.filter((r) => !DELITOS_EXCLUIDOS.has((r.delito ?? '').toUpperCase()));
}
