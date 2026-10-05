import { variacion, participacionPct } from '../utils/aggregations';

// ──────────────────────────────────────────────────────────────────────────
// Modelo analítico central — descomposición del cambio entre dos periodos.
//
// Tres métricas DISTINTAS que no deben confundirse (ver Nota metodológica):
//
//   Variación %       = (actual − anterior) / anterior × 100
//                       ¿Cuánto cambió ESTE delito frente a sí mismo?
//   Participación %   = actual del delito / actual total × 100
//                       ¿Qué parte del total de hoy es este delito?
//   Aporte al cambio % = (actual − anterior) del delito / (actual − anterior) total × 100
//                       ¿Qué parte del cambio TOTAL explica este delito?
//
// Propiedad que se verifica en las pruebas: los aportes suman 100 % del
// cambio neto. Si unos delitos suben y otros bajan, un delito puede aportar
// más de 100 % (su aumento es mayor que el neto) y los que bajan aportan
// en negativo — es correcto, no un error.
//
// Funciones puras, sin React: la misma cifra se calcula en un solo lugar
// para todas las pantallas y el PDF.
// ──────────────────────────────────────────────────────────────────────────

export interface FilaCambio {
  clave: string;
  anterior: number;
  actual: number;
  diferencia: number;
  variacionPct: number | null; // null = sin casos en el periodo anterior (no se puede dividir por 0)
  participacionPct: number;
  aportePct: number | null; // null = el total no cambió (no hay cambio que repartir)
}

export interface DescomposicionCambio {
  filas: FilaCambio[];
  totalAnterior: number;
  totalActual: number;
  diferenciaTotal: number;
  variacionTotalPct: number | null;
}

/** Aporte de una parte al cambio total, en %. null si el total no cambió. */
export function aporteAlCambioPct(diferenciaParte: number, diferenciaTotal: number): number | null {
  if (diferenciaTotal === 0) return null;
  return (diferenciaParte / diferenciaTotal) * 100;
}

/** Suma por clave (ej. delito) — cada registro aporta su "cantidad" (1 si no trae). */
export function contarPor<T>(registros: T[], clave: (r: T) => string, cantidad: (r: T) => number = () => 1): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of registros) {
    const k = clave(r);
    m.set(k, (m.get(k) || 0) + (cantidad(r) || 1));
  }
  return m;
}

/**
 * Descompone el cambio total entre dos periodos por una dimensión.
 * Orden: por impacto absoluto en el cambio (|diferencia|), mayor primero.
 */
export function descomponerCambio(actual: Map<string, number>, anterior: Map<string, number>): DescomposicionCambio {
  const claves = new Set([...actual.keys(), ...anterior.keys()]);
  let totalActual = 0, totalAnterior = 0;
  for (const v of actual.values()) totalActual += v;
  for (const v of anterior.values()) totalAnterior += v;
  const diferenciaTotal = totalActual - totalAnterior;

  const filas: FilaCambio[] = Array.from(claves).map((clave) => {
    const a = actual.get(clave) ?? 0;
    const b = anterior.get(clave) ?? 0;
    const v = variacion(a, b);
    return {
      clave,
      anterior: b,
      actual: a,
      diferencia: v.abs,
      variacionPct: v.pct,
      participacionPct: participacionPct(a, totalActual),
      aportePct: aporteAlCambioPct(v.abs, diferenciaTotal),
    };
  });
  filas.sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia) || y.actual - x.actual || x.clave.localeCompare(y.clave, 'es'));
  return { filas, totalAnterior, totalActual, diferenciaTotal, variacionTotalPct: variacion(totalActual, totalAnterior).pct };
}

/** Máximo de un conteo — ej. el día o la franja con más casos. */
export function maximoDe(m: Map<string, number>): { clave: string; valor: number } | null {
  let mejor: { clave: string; valor: number } | null = null;
  for (const [clave, valor] of m) if (!mejor || valor > mejor.valor) mejor = { clave, valor };
  return mejor;
}
