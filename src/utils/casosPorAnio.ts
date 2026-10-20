// Casos por AÑO para las tablas de ranking (Casos / Aporte) cuando el
// análisis abarca dos o más años: multifecha con periodos de años distintos
// (p. ej. 4–7 sep 2025 y 5–8 sep 2024) o el filtro Año con varios años.
// Solo cuenta: los registros ya llegan filtrados; el año es el del hecho.
import type { CrimeRecord } from '../types/crime';

export interface FilaConAnios { key: string; casos: number; aportePct: number; porAnio?: Record<number, number> }

/** Agrega a cada fila sus casos por año (misma clave que `getter`). */
export function agregarCasosPorAnio<T extends { key: string }>(filas: T[], registros: CrimeRecord[], getter: (r: CrimeRecord) => string | null | undefined, anios: number[]): (T & { porAnio?: Record<number, number> })[] {
  if (anios.length < 2) return filas;
  const conteo = new Map<string, Record<number, number>>();
  for (const r of registros) {
    const k = getter(r);
    if (k == null || k === '') continue;
    const anio = r.anio ?? (r.fecha ? new Date(r.fecha).getFullYear() : null);
    if (anio == null) continue;
    let m = conteo.get(k);
    if (!m) { m = {}; conteo.set(k, m); }
    m[anio] = (m[anio] ?? 0) + 1;
  }
  return filas.map((f) => {
    const m = conteo.get(f.key) ?? {};
    const porAnio: Record<number, number> = {};
    for (const a of anios) porAnio[a] = m[a] ?? 0;
    return { ...f, porAnio };
  });
}

/** Años del análisis multifecha (los que tocan los periodos completos). */
export function aniosDePeriodos(periodos: { fechaInicial: string; fechaFinal: string }[]): number[] {
  const set = new Set<number>();
  for (const p of periodos) {
    if (!p.fechaInicial || !p.fechaFinal) continue;
    const a0 = Number(p.fechaInicial.slice(0, 4));
    const a1 = Number(p.fechaFinal.slice(0, 4));
    for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) set.add(a);
  }
  return Array.from(set).sort((a, b) => a - b);
}
