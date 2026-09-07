import type { CrimeRecord } from '../types/crime';

export interface CountItem {
  key: string;
  registros: number;
  casos: number;
}

// Agrupa por un campo. "casos" = cantidad de HECHOS/filas (1 hecho = 1 caso,
// sin sumar la columna Cantidad — así lo reporta oficialmente la unidad,
// incluso si un hecho puntual involucró más de una víctima).
export function agruparPor(records: CrimeRecord[], getter: (r: CrimeRecord) => string): CountItem[] {
  const map = new Map<string, CountItem>();
  for (const r of records) {
    const key = getter(r) || 'NO REPORTADO';
    const item = map.get(key) || { key, registros: 0, casos: 0 };
    item.registros += 1;
    item.casos += 1;
    map.set(key, item);
  }
  return Array.from(map.values()).sort((a, b) => b.casos - a.casos);
}

// "Casos" = número de hechos/filas (1 hecho = 1 caso), NO la suma de la
// columna Cantidad — así coincide con el conteo oficial de la unidad.
export function totalCasos(records: CrimeRecord[]): number {
  return records.length;
}

export function totalRegistros(records: CrimeRecord[]): number {
  return records.length;
}

export function variacion(actual: number, anterior: number): { abs: number; pct: number | null } {
  const abs = actual - anterior;
  if (!anterior) return { abs, pct: actual === 0 ? 0 : null };
  return { abs, pct: (abs / anterior) * 100 };
}

export function participacionPct(parte: number, total: number): number {
  if (!total) return 0;
  return (parte / total) * 100;
}

export function promedioDiario(records: CrimeRecord[]): number {
  const dias = new Set(records.filter((r) => r.fecha).map((r) => r.fecha!.toDateString()));
  if (dias.size === 0) return 0;
  return totalCasos(records) / dias.size;
}

export function promedioMensual(records: CrimeRecord[]): number {
  const meses = new Set(records.filter((r) => r.anioMes !== 'SIN FECHA').map((r) => r.anioMes));
  if (meses.size === 0) return 0;
  return totalCasos(records) / meses.size;
}

export function minMaxDiario(records: CrimeRecord[]): { min: number; max: number } {
  const porDia = new Map<string, number>();
  for (const r of records) {
    if (!r.fecha) continue;
    const key = r.fecha.toDateString();
    porDia.set(key, (porDia.get(key) || 0) + 1);
  }
  const valores = Array.from(porDia.values());
  if (valores.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...valores), max: Math.max(...valores) };
}

export function formatNumero(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n));
}

export function formatDecimal(n: number, dec = 1): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(n);
}

export function formatPct(n: number | null, dec = 1): string {
  if (n === null) return 'N/A';
  return `${n >= 0 ? '+' : ''}${formatDecimal(n, dec)}%`;
}

export function formatFecha(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatFechaHora(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const DIAS_ORDEN = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

export function uniqueSorted(records: CrimeRecord[], getter: (r: CrimeRecord) => string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const v = getter(r);
    if (v) set.add(v);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
}

// Número de semana ISO-8601 (lunes como inicio de semana) de una fecha dada.
export function semanaIso(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaSemana = d.getUTCDay() || 7; // domingo=0 -> 7
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}
