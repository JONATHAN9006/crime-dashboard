// Math.max(...arreglo) / Math.min(...arreglo) truenan con "Maximum call
// stack size exceeded" cuando el arreglo es grande — el operador de
// propagación (...) pasa cada elemento como un argumento de función
// aparte, y los motores de JavaScript tienen un límite de cuántos
// argumentos aguanta una sola llamada (varía por navegador, pero ronda
// las decenas de miles). Confirmado en producción: con el histórico
// completo cargado (2002-2026, 100.000+ registros), varios cálculos del
// dashboard que hacían esto sobre TODOS los registros (o sobre todos los
// vértices de un polígono grande) ya se pasaban de ese límite — eso era
// la causa real de que "seleccionar Estación Norte" (que termina usando
// un polígono con muchísimos vértices) tumbara la página entera.
//
// Estas dos hacen exactamente lo mismo que Math.max/Math.min, pero con un
// simple recorrido en vez de una sola llamada con miles de argumentos —
// sin ningún límite de tamaño, sin importar qué tan grande crezca la base
// de datos en el futuro.
export function maxDe(valores: number[]): number {
  let m = -Infinity;
  for (const v of valores) if (v > m) m = v;
  return m;
}

export function minDe(valores: number[]): number {
  let m = Infinity;
  for (const v of valores) if (v < m) m = v;
  return m;
}
