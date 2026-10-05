// Pruebas de los cálculos del modelo analítico — se corren con:
//   npx tsx src/analitica/cambio.test.ts
// Cada caso tiene un resultado conocido calculado a mano.
import assert from 'node:assert/strict';
import { descomponerCambio, aporteAlCambioPct, contarPor, maximoDe } from './cambio.ts';

const m = (o: Record<string, number>) => new Map(Object.entries(o));
const cerca = (a: number | null, b: number, msg: string) => { assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`); };

// 1. Caso del requerimiento: hurto a personas 362 → 428 (+66, +18,2 %).
{
  const d = descomponerCambio(m({ 'H. Personas': 428, 'H. Motos': 100 }), m({ 'H. Personas': 362, 'H. Motos': 120 }));
  const hp = d.filas.find((f) => f.clave === 'H. Personas')!;
  assert.equal(hp.diferencia, 66);
  cerca(hp.variacionPct, (66 / 362) * 100, 'variación H. Personas');
  cerca(hp.participacionPct, (428 / 528) * 100, 'participación H. Personas');
  // Total: 482 → 528 = +46. H. Personas aporta 66/46 = 143,5 % (más que el neto porque H. Motos bajó).
  assert.equal(d.diferenciaTotal, 46);
  cerca(hp.aportePct, (66 / 46) * 100, 'aporte H. Personas');
  const motos = d.filas.find((f) => f.clave === 'H. Motos')!;
  cerca(motos.aportePct, (-20 / 46) * 100, 'aporte H. Motos (negativo)');
}

// 2. Los aportes SIEMPRE suman 100 % del cambio neto.
{
  const d = descomponerCambio(m({ a: 10, b: 50, c: 7, d: 0 }), m({ a: 4, b: 61, c: 7, d: 3 }));
  const suma = d.filas.reduce((s, f) => s + (f.aportePct ?? 0), 0);
  cerca(suma, 100, 'suma de aportes');
  // Y las participaciones suman 100 % del total actual.
  cerca(d.filas.reduce((s, f) => s + f.participacionPct, 0), 100, 'suma de participaciones');
}

// 3. Base cero: sin casos antes → variación null (no "0 %" ni infinito).
{
  const d = descomponerCambio(m({ nuevo: 5 }), m({}));
  assert.equal(d.filas[0].variacionPct, null);
  cerca(d.filas[0].aportePct, 100, 'aporte único');
}

// 4. Total sin cambio → no hay cambio que repartir: aporte null.
{
  const d = descomponerCambio(m({ a: 5, b: 5 }), m({ a: 3, b: 7 }));
  assert.equal(d.diferenciaTotal, 0);
  assert.equal(d.filas[0].aportePct, null);
  assert.equal(aporteAlCambioPct(2, 0), null);
}

// 5. Orden por impacto absoluto: una reducción grande va antes que un aumento pequeño.
{
  const d = descomponerCambio(m({ sube: 12, baja: 10 }), m({ sube: 10, baja: 40 }));
  assert.deepEqual(d.filas.map((f) => f.clave), ['baja', 'sube']);
}

// 6. contarPor respeta la cantidad de cada registro; maximoDe elige el mayor.
{
  const c = contarPor([{ d: 'x', n: 2 }, { d: 'x', n: 1 }, { d: 'y', n: 1 }], (r) => r.d, (r) => r.n);
  assert.equal(c.get('x'), 3);
  assert.deepEqual(maximoDe(c), { clave: 'x', valor: 3 });
}

console.log('✔ cambio.test.ts — 6 casos correctos');
