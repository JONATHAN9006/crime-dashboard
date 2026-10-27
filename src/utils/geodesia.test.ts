// npx tsx src/utils/geodesia.test.ts
// Valores de referencia generados con PROJ (pyproj 3, "+proj=tmerc
// +lat_0=2.4448 +lon_0=-76.6147 +k=1 +ellps=WGS84") y pyproj.Geod (WGS84).
import assert from 'node:assert/strict';
import { crearProyeccionMetricaLocal, distanciaGeodesicaMetros, esCoordenadaValida } from './geodesia.ts';
import { calcularSuperficieKernel, densidadKernelEnPunto, claseDeDensidad, puntosValidosParaKernel, RADIO_BUSQUEDA_METROS } from './kernelDensity.ts';

// 1. Proyección TM local == PROJ (error < 1 mm a 12 km del centro de Popayán).
const tm = crearProyeccionMetricaLocal(2.4448, -76.6147);
const referenciaProj: [number, number, number, number][] = [
  [2.4448, -76.6147, 0, 0],
  [2.48, -76.58, 3859.1928, 3892.3372],
  [2.4, -76.65, -3926.1544, -4953.7658],
  [2.52, -76.55, 7195.454, 8315.5208],
  [2.37, -76.7, -9487.4881, -8270.8103],
];
for (const [lat, lon, x, y] of referenciaProj) {
  const p = tm.proyectar(lat, lon);
  assert.ok(Math.abs(p.x - x) < 0.001 && Math.abs(p.y - y) < 0.001, `TM ${lat},${lon}: ${p.x},${p.y} vs ${x},${y}`);
}

// 2. Distancia geodésica (Vincenty) == pyproj.Geod.
assert.ok(Math.abs(distanciaGeodesicaMetros(2.4448, -76.6147, 2.4466, -76.6135) - 239.64162010812913) < 0.001);
assert.ok(Math.abs(distanciaGeodesicaMetros(2.4, -76.65, 2.52, -76.55) - 17313.695269866832) < 0.001);

// 3. La distancia medida en la proyección local coincide con la geodésica
// a escala del kernel (diferencia < 1 mm en ~240 m).
{
  const local = crearProyeccionMetricaLocal(2.4457, -76.6141);
  const a = local.proyectar(2.4448, -76.6147), b = local.proyectar(2.4466, -76.6135);
  assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 239.64162010812913) < 0.001);
}

// 4. Validación de coordenadas.
assert.equal(esCoordenadaValida(2.44, -76.61), true);
assert.equal(esCoordenadaValida(0, 0), false);
assert.equal(esCoordenadaValida(NaN, -76.6), false);
assert.equal(esCoordenadaValida(null, -76.6), false);
assert.equal(esCoordenadaValida(95, -76.6), false);
assert.equal(puntosValidosParaKernel([{ lat: 0, lon: 0 }, { lat: 2.44, lon: -76.61 }, { lat: NaN, lon: 1 }]).length, 1);

// 5. Kernel cuártico: en el propio punto vale 3/(π·r²) eventos/m²; a la
// distancia r vale 0; y su integral sobre el plano es 1 evento (la
// densidad está en eventos/m²: Σ densidad·área = n.º de eventos).
{
  const r = RADIO_BUSQUEDA_METROS;
  const punto = [{ lat: 2.4448, lon: -76.6147 }];
  const enCentro = densidadKernelEnPunto(punto, 2.4448, -76.6147).densidad;
  assert.ok(Math.abs(enCentro - 3 / (Math.PI * r * r)) < 1e-15);
  const proy = crearProyeccionMetricaLocal(2.4448, -76.6147);
  // Punto a ~210 m al norte: fuera del radio → 0.
  const gradosNorte = 210 / (proy.proyectar(2.4458, -76.6147).y / 0.001);
  assert.equal(densidadKernelEnPunto(punto, 2.4448 + gradosNorte, -76.6147).densidad, 0);
  // Integral numérica en celdas de 5 m.
  let suma = 0;
  const paso = 5, gLat = paso / (proy.proyectar(2.4458, -76.6147).y / 0.001), gLon = paso / (proy.proyectar(2.4448, -76.6137).x / 0.001);
  for (let i = -45; i <= 45; i++) for (let j = -45; j <= 45; j++) {
    suma += densidadKernelEnPunto(punto, 2.4448 + i * gLat, -76.6147 + j * gLon).densidad * paso * paso;
  }
  assert.ok(Math.abs(suma - 1) < 0.01, `integral ${suma}`);
}

// 6. Clases con los mismos cortes que el pintado.
assert.equal(claseDeDensidad(0.1, 1), null); // bajo el umbral del 12 %
assert.equal(claseDeDensidad(1, 1), 4);
assert.equal(claseDeDensidad(0.4, 1), 2); // (0,4−0,12)/0,88 = 0,32 → banda 0,22–0,42

console.log('geodesia + kernel: OK');

// 7. Superficie completa: Σ densidad·área de celda ≈ n.º de eventos (los
// eventos lejos del borde conservan su masa) — confirma eventos/m².
{
  const eventos = [
    { lat: 2.4448, lon: -76.6147 }, { lat: 2.4450, lon: -76.6150 }, { lat: 2.4460, lon: -76.6120 },
    { lat: 2.4520, lon: -76.6000 }, { lat: 2.4390, lon: -76.6200 }, { lat: 2.4448, lon: -76.6147 },
  ];
  const s = calcularSuperficieKernel(eventos);
  let masa = 0;
  for (let k = 0; k < s.densidad.length; k++) masa += s.densidad[k];
  masa *= s.metrosPorCeldaX * s.metrosPorCeldaY;
  assert.ok(Math.abs(masa - eventos.length) / eventos.length < 0.01, `masa ${masa}`);
  // Tamaño de celda real ≈ 10 m (r/20).
  assert.ok(Math.abs(s.metrosPorCeldaX - 10) < 0.5 && Math.abs(s.metrosPorCeldaY - 10) < 0.5, `${s.metrosPorCeldaX} × ${s.metrosPorCeldaY}`);
  console.log(`superficie: ${s.COLS}×${s.ROWS} celdas de ${s.metrosPorCeldaX.toFixed(2)}×${s.metrosPorCeldaY.toFixed(2)} m, masa ${masa.toFixed(4)} eventos`);
}
