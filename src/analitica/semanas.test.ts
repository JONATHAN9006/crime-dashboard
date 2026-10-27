// npx tsx src/analitica/semanas.test.ts
import assert from 'node:assert/strict';
import { clasificarEstado, clasificarPatron, analizarSemanas, detectarRezago, umbralRuido } from './semanas.ts';

// 1. Umbral de ruido de Poisson: casos de la imagen de referencia.
assert.equal(clasificarEstado(77, 36), 'reduccion');            // 41 > 1,96·√113 = 20,8
assert.equal(clasificarEstado(2, 1), 'estable');                // 1 < 1,96·√3 = 3,4
assert.equal(clasificarEstado(7, 0), 'reduccion');              // 7 > 1,96·√7 = 5,2
assert.equal(clasificarEstado(1, 3), 'estable');                // H. Comercio +2: dentro del ruido
assert.equal(clasificarEstado(0, 0), 'estable');
assert.ok(Math.abs(umbralRuido(77, 36) - 1.96 * Math.sqrt(113)) < 1e-9);

// 2. Patrones.
assert.equal(clasificarPatron([5, 7, 9, 12]), 'creciente');
assert.equal(clasificarPatron([39, 38, 35, 17]), 'decreciente');
assert.equal(clasificarPatron([20, 22, 21, 40]), 'abrupto_alza');   // z = (40−21)/√21 = 4,1
assert.equal(clasificarPatron([20, 28, 20, 6]), 'abrupto_baja');    // z = (6−22,7)/√22,7 = −3,5
assert.equal(clasificarPatron([7, 7, 11, 8]), 'variable');
assert.equal(clasificarPatron([0, 0, 0, 0]), 'sin_casos');

// 3. Totales y aporte: los aportes de los delitos suman 100 % del cambio total.
{
  const a = analizarSemanas([{ delito: 'A', valores: [77, 76, 67, 36] }, { delito: 'B', valores: [7, 7, 11, 8] }], [84, 83, 78, 44]);
  assert.equal(a.totalDiferencia, -40);
  const suma = a.filas.reduce((s, f) => s + (f.aportePct ?? 0), 0);
  assert.ok(Math.abs(suma - 100) < 1e-9);
  assert.ok(Math.abs((a.filas[1].aportePct ?? 0) - (1 / -40) * 100) < 1e-9); // B sube 1 → aporte −2,5 %
}

// 4. Rezago: 21 días normales (~27/día) y 5 días finales casi vacíos → alerta.
{
  const dias = Array.from({ length: 28 }, (_, i) => ({ fecha: new Date(2026, 8, 6 + i), casos: i >= 23 ? 3 : 27 }));
  const r = detectarRezago(dias);
  assert.ok(r);
  assert.equal(r!.dias, 5);
  assert.equal(r!.promedioHabitual, 27);
  assert.equal(r!.faltantesEstimados, 120);
}
// Sin rezago: serie pareja.
assert.equal(detectarRezago(Array.from({ length: 28 }, (_, i) => ({ fecha: new Date(2026, 8, 6 + i), casos: 20 + (i % 3) }))), null);
// Base muy baja (<3/día): días en cero son normales, no se alerta.
assert.equal(detectarRezago(Array.from({ length: 28 }, (_, i) => ({ fecha: new Date(2026, 8, 6 + i), casos: i >= 25 ? 0 : 2 }))), null);

console.log('✔ semanas.test.ts — todos los casos correctos');
