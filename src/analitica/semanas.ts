import { aporteAlCambioPct } from './cambio';
import { variacion } from '../utils/aggregations';

// ──────────────────────────────────────────────────────────────────────────
// Análisis de corto plazo (últimas semanas) — funciones puras y probadas.
//
// Tres criterios estadísticos que este módulo agrega sobre el simple
// "última semana menos primera":
//
// 1. ESTADO con umbral de ruido (no cualquier diferencia es un cambio).
//    Los conteos semanales de delitos se comportan como conteos de Poisson:
//    su varianza es igual a su media. La diferencia entre dos semanas
//    (a → b) tiene una desviación aproximada de √(a + b). Se considera
//    AUMENTO o REDUCCIÓN solo si |b − a| > 1,96·√(a + b) (≈ 95 % de
//    confianza); si no, ESTABLE — la diferencia cabe en la variación normal.
//    Ej.: Homicidio 2 → 1 es "estable" (1 < 3,4); H. Personas 77 → 36 es
//    "reducción" (41 > 20,8).
//
// 2. PATRÓN de las 4 semanas: creciente / decreciente sostenido (todas las
//    semanas en el mismo sentido), cambio abrupto (la última semana se sale
//    más de 2 desviaciones del promedio de las anteriores) o variable.
//
// 3. REZAGO DE REGISTRO: si los últimos días de la ventana traen muchos
//    menos casos que lo habitual, la caída de la última semana puede ser
//    falta de registro (casos aún no cargados), no una reducción real. Se
//    detecta y se avisa con las cifras — no se corrige ningún dato.
// ──────────────────────────────────────────────────────────────────────────

export type EstadoSemanal = 'aumento' | 'reduccion' | 'estable';
export type PatronSemanal = 'creciente' | 'decreciente' | 'abrupto_alza' | 'abrupto_baja' | 'variable' | 'sin_casos';

export const Z_95 = 1.96;

/** Umbral de ruido para la diferencia entre dos conteos (Poisson, 95 %). */
export function umbralRuido(a: number, b: number): number {
  return Z_95 * Math.sqrt(a + b);
}

export function clasificarEstado(a: number, b: number): EstadoSemanal {
  const dif = b - a;
  if (a + b === 0 || Math.abs(dif) <= umbralRuido(a, b)) return 'estable';
  return dif > 0 ? 'aumento' : 'reduccion';
}

export function clasificarPatron(valores: number[]): PatronSemanal {
  if (valores.every((v) => v === 0)) return 'sin_casos';
  const pasos = valores.slice(1).map((v, i) => v - valores[i]);
  if (pasos.length >= 2 && pasos.every((p) => p > 0)) return 'creciente';
  if (pasos.length >= 2 && pasos.every((p) => p < 0)) return 'decreciente';
  // Cambio abrupto: la última semana frente al promedio de las anteriores,
  // en desviaciones de Poisson (√promedio). Solo con base de al menos 3
  // casos/semana, para no llamar "abrupto" a pasar de 0 a 2.
  const anteriores = valores.slice(0, -1);
  const ultima = valores[valores.length - 1];
  const prom = anteriores.reduce((s, v) => s + v, 0) / Math.max(anteriores.length, 1);
  if (prom >= 3) {
    const z = (ultima - prom) / Math.sqrt(prom);
    if (z > 2) return 'abrupto_alza';
    if (z < -2) return 'abrupto_baja';
  }
  return 'variable';
}

export const ETIQUETA_PATRON: Record<PatronSemanal, string> = {
  creciente: 'Creciente sostenido',
  decreciente: 'Decreciente sostenido',
  abrupto_alza: 'Alza abrupta',
  abrupto_baja: 'Caída abrupta',
  variable: 'Variable',
  sin_casos: 'Sin casos',
};

export interface FilaSemanal {
  delito: string;
  valores: number[];
  diferencia: number; // última − primera
  variacionPct: number | null;
  aportePct: number | null; // parte del cambio total que explica
  estado: EstadoSemanal;
  patron: PatronSemanal;
  umbral: number;
}

export interface AnalisisSemanal {
  filas: FilaSemanal[];
  totales: number[];
  totalDiferencia: number;
  totalVariacionPct: number | null;
  totalEstado: EstadoSemanal;
  totalPatron: PatronSemanal;
}

export function analizarSemanas(porDelito: { delito: string; valores: number[] }[], totales: number[]): AnalisisSemanal {
  const n = totales.length;
  const totalDiferencia = n > 0 ? totales[n - 1] - totales[0] : 0;
  const filas: FilaSemanal[] = porDelito.map((d) => {
    const a = d.valores[0] ?? 0, b = d.valores[d.valores.length - 1] ?? 0;
    const v = variacion(b, a);
    return {
      delito: d.delito,
      valores: d.valores,
      diferencia: v.abs,
      variacionPct: v.pct,
      aportePct: aporteAlCambioPct(v.abs, totalDiferencia),
      estado: clasificarEstado(a, b),
      patron: clasificarPatron(d.valores),
      umbral: umbralRuido(a, b),
    };
  });
  return {
    filas,
    totales,
    totalDiferencia,
    totalVariacionPct: n > 0 ? variacion(totales[n - 1], totales[0]).pct : null,
    totalEstado: n > 0 ? clasificarEstado(totales[0], totales[n - 1]) : 'estable',
    totalPatron: clasificarPatron(totales),
  };
}

// ── Rezago de registro ─────────────────────────────────────────────────────

export interface AlertaRezago {
  desde: Date; // primer día del tramo final con registro anormalmente bajo
  dias: number;
  promedioReciente: number; // casos/día en ese tramo
  promedioHabitual: number; // mediana casos/día en el resto de la ventana
  faltantesEstimados: number; // (habitual − reciente) × días — solo orientativo
}

/**
 * Busca, al final de la serie diaria, el tramo más largo de días seguidos
 * con menos del 40 % de la mediana diaria habitual. Necesita una base de al
 * menos 3 casos/día (con menos, un día en cero es normal) y un tramo de 2+
 * días. Devuelve null si no hay señal.
 */
export function detectarRezago(diarios: { fecha: Date; casos: number }[]): AlertaRezago | null {
  if (diarios.length < 14) return null;
  const base = diarios.slice(0, -7).map((d) => d.casos).sort((x, y) => x - y);
  const mitad = Math.floor(base.length / 2);
  const mediana = base.length % 2 ? base[mitad] : (base[mitad - 1] + base[mitad]) / 2;
  if (mediana < 3) return null;
  const limite = mediana * 0.4;
  let dias = 0;
  for (let i = diarios.length - 1; i >= 0 && diarios[i].casos < limite; i--) dias++;
  if (dias < 2) return null;
  const tramo = diarios.slice(-dias);
  const promedioReciente = tramo.reduce((s, d) => s + d.casos, 0) / dias;
  return {
    desde: tramo[0].fecha,
    dias,
    promedioReciente,
    promedioHabitual: mediana,
    faltantesEstimados: Math.round((mediana - promedioReciente) * dias),
  };
}
