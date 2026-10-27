import type { CrimeRecord } from '../types/crime';

// Delitos excluidos de TODO el dashboard — nunca cuentan en ningún cálculo
// (KPIs, comparativos, Microgerencia, Analista IA, etc.) ni aparecen como
// opción en el filtro de Delito, porque se filtran aquí mismo, antes de que
// "records" llegue a cualquier otro componente. Para volver a incluir un
// delito, basta con quitarlo de esta lista — no hace falta tocar nada más.
//
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
//
// Las 13 categorías de delitos sexuales / Abigeato / Lesiones con
// agravación de abajo se agregaron a pedido explícito: el histórico
// 2003-2023 sí las trae, pero MEPOY no las mide todavía — quedan ocultas
// (nunca cuentan ni aparecen) sin borrar el dato original, por si algún
// día se necesita habilitarlas. El texto debe coincidir EXACTO con lo que
// produce formatoTitulo() en csvParser.ts para un delito sin traducción
// en MAPA_DELITO (mayúscula solo la primera letra de cada palabra) — si
// alguna vez se le agrega traducción propia a alguna de estas en
// MAPA_DELITO, hay que quitarla de aquí también, o quedaría excluida con
// el nombre viejo mientras el nuevo nombre corto sigue sin excluirse.
export const DELITOS_EXCLUIDOS_CANONICOS = [
  'H. Celular', 'H. Bicicletas', 'H. Cable', 'Lesiones AT', 'Homicidio en AT',
  'Abigeato',
  'Lesiones En Persona Protegida',
  'Lesiones Personales ( Circunstancias De Agravación)',
  'Actos Sexuales Con Menor De 14 Años',
  'Acoso Sexual',
  'Acceso Carnal Abusivo Con Menor De 14 Años',
  'Acceso Carnal Violento',
  'Acto Sexual Violento',
  'Pornografía Con Menores',
  'Acceso Carnal O Acto Sexual Abusivo Con Incapaz De Resistir',
  'Acceso Carnal O Acto Sexual En Persona Puesta En Incapacidad De Resistir',
  'Inducción A La Prostitución',
  'Proxenetismo Con Menor De Edad',
];
const DELITOS_EXCLUIDOS = new Set(DELITOS_EXCLUIDOS_CANONICOS.map((d) => d.toUpperCase()));

export function excluirDelitosOmitidos(records: CrimeRecord[]): CrimeRecord[] {
  return records.filter((r) => !DELITOS_EXCLUIDOS.has((r.delito ?? '').toUpperCase()));
}
