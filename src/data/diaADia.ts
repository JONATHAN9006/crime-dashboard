// ─────────────────────────────────────────────────────────────────────────
// MICROGERENCIA | DÍA A DÍA DE LA DELICTIVIDAD — cálculos.
//
// Matriz delito × día del mes (1 … último día calendario: 28/29/30/31).
// · Cada registro cuenta UNA vez, en el día de su fecha.
// · Fecha usada: la de INGRESO/REGISTRO si la matriz trae esa columna; si no
//   existe, la FECHA_HECHO (ocurrencia) — y la lámina lo dice expresamente.
// · Días posteriores a la fecha de corte de la información = PENDIENTES:
//   no se cuentan como cero ni entran en totales ni promedios.
// · Fechas en hora de Colombia (America/Bogota) para evitar desfases.
// ─────────────────────────────────────────────────────────────────────────
import type { CrimeRecord } from '../types/crime';
import { esValorValido } from './microgerenciaDelito';

export const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Hoy en Colombia (año, mes 1–12, día), sin importar la zona del equipo. */
export function hoyColombia(): { anio: number; mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
  return { anio: partes[0], mes: partes[1], dia: partes[2] };
}

export const diasDelMes = (anio: number, mes: number) => new Date(anio, mes, 0).getDate();

/**
 * Hojas a generar: cada AÑO × MES elegido es una hoja propia (ej. Nov 2024 y
 * Nov 2025 → dos hojas). Sin año = el año actual; sin mes = el mes actual.
 */
export function mesesDiaADia(opc: { anios: string[]; meses: string[] }): { anio: number; mes: number }[] {
  const hoy = hoyColombia();
  const anios = opc.anios.length ? [...new Set(opc.anios.map(Number))].sort((a, b) => a - b) : [hoy.anio];
  const meses = opc.meses.length ? [...new Set(opc.meses.map(Number))].sort((a, b) => a - b) : [hoy.mes];
  const salida: { anio: number; mes: number }[] = [];
  for (const anio of anios) for (const mes of meses) {
    // Un mes que aún no empieza no tiene registros: no se genera.
    if (anio > hoy.anio || (anio === hoy.anio && mes > hoy.mes)) continue;
    salida.push({ anio, mes });
  }
  return salida;
}

/** El Día a Día se reporta con corte al DÍA ANTERIOR (hora de Colombia),
 *  o a la última fecha cargada si es anterior. */
export function corteDiaADia(ultimaFechaCargada: Date | null): Date {
  const hoy = hoyColombia();
  const ayer = new Date(hoy.anio, hoy.mes - 1, hoy.dia - 1);
  if (!ultimaFechaCargada) return ayer;
  const u = new Date(ultimaFechaCargada.getFullYear(), ultimaFechaCargada.getMonth(), ultimaFechaCargada.getDate());
  return u < ayer ? u : ayer;
}

// ── Fecha de ingreso / registro (si la matriz la trae) ───────────────────
const normEnc = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const PATRON_INGRESO = /^FECHA_?(DE_)?(INGRESO|REGISTRO)|^(INGRESO|REGISTRO)_?FECHA/;

export function columnaIngreso(registros: CrimeRecord[]): string | null {
  for (const r of registros.slice(0, 50)) {
    const k = Object.keys(r.raw ?? {}).find((c) => PATRON_INGRESO.test(normEnc(c)));
    if (k) return k;
  }
  return null;
}

function parsearFecha(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  return null;
}

export function fechaDeConteo(r: CrimeRecord, col: string | null): Date | null {
  if (col) return parsearFecha(r.raw?.[col]);
  return r.fecha ? new Date(r.fecha.getFullYear(), r.fecha.getMonth(), r.fecha.getDate()) : null;
}

const claveDia = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

export interface FilaDiaADia { delito: string; porDia: (number | null)[]; total: number; participacion: number }
export interface DatosDiaADia {
  anio: number; mes: number; dias: number;
  /** Día del mes hasta el que hay información (0 = ninguno; = dias si el mes está completo). */
  diaCorte: number;
  corte: Date;
  encabezados: { dia: number; semana: string; pendiente: boolean }[];
  filas: FilaDiaADia[];
  totalDia: (number | null)[];
  total: number;
  promedio: number | null;
  maximo: { dia: number; casos: number } | null;
  minimo: { dia: number; casos: number } | null;
  top5: { delito: string; casos: number }[];
  anterior: { fecha: Date; casos: number } | null;
  actual: { fecha: Date; casos: number } | null;
  ultimos7: { fecha: Date; casos: number }[];
  campoFecha: string;
  usaFechaIngreso: boolean;
}

/**
 * @param registros  registros ya filtrados por cobertura y demás filtros.
 * @param corteDatos última fecha con información cargada (de toda la matriz).
 * @param maxFilas   filas de delito visibles; el resto se suma en «Otros delitos».
 */
export function calcularDiaADia(registros: CrimeRecord[], anio: number, mes: number, corteDatos: Date, col: string | null, maxFilas = 15): DatosDiaADia {
  const dias = diasDelMes(anio, mes);
  const finMes = new Date(anio, mes - 1, dias);
  const iniMes = new Date(anio, mes - 1, 1);
  const corteDia = new Date(corteDatos.getFullYear(), corteDatos.getMonth(), corteDatos.getDate());
  const diaCorte = corteDia < iniMes ? 0 : corteDia >= finMes ? dias : corteDia.getDate();

  // Conteo por día (todo el rango de fechas: también sirve para «día anterior»
  // y «últimos 7 días» cuando cruzan de mes).
  const porFecha = new Map<number, number>();
  const porDelitoDia = new Map<string, number[]>();
  for (const r of registros) {
    const f = fechaDeConteo(r, col);
    if (!f) continue;
    const k = claveDia(f);
    porFecha.set(k, (porFecha.get(k) ?? 0) + 1);
    if (f.getFullYear() !== anio || f.getMonth() !== mes - 1 || f.getDate() > diaCorte) continue;
    const delito = esValorValido(r.delito) ? r.delito : 'Sin delito reportado';
    const arr = porDelitoDia.get(delito) ?? new Array<number>(dias).fill(0);
    arr[f.getDate() - 1]++;
    porDelitoDia.set(delito, arr);
  }
  const pend = (i: number) => i + 1 > diaCorte;
  let filasBase = [...porDelitoDia].map(([delito, arr]) => ({ delito, arr, total: arr.reduce((s, x) => s + x, 0) }))
    .filter((f) => f.total > 0).sort((a, b) => b.total - a.total || a.delito.localeCompare(b.delito, 'es'));
  if (filasBase.length > maxFilas) {
    const resto = filasBase.slice(maxFilas - 1);
    const arr = new Array<number>(dias).fill(0);
    for (const f of resto) f.arr.forEach((v, i) => { arr[i] += v; });
    filasBase = [...filasBase.slice(0, maxFilas - 1), { delito: `Otros delitos (${resto.length})`, arr, total: resto.reduce((s, f) => s + f.total, 0) }];
  }
  const total = filasBase.reduce((s, f) => s + f.total, 0);
  const filas: FilaDiaADia[] = filasBase.map((f) => ({ delito: f.delito, porDia: f.arr.map((v, i) => (pend(i) ? null : v)), total: f.total, participacion: total ? (f.total / total) * 100 : 0 }));
  const totalDia = Array.from({ length: dias }, (_, i) => (pend(i) ? null : filas.reduce((s, f) => s + (f.porDia[i] ?? 0), 0)));

  let maximo: DatosDiaADia['maximo'] = null, minimo: DatosDiaADia['minimo'] = null;
  totalDia.forEach((v, i) => {
    if (v == null) return;
    if (!maximo || v > maximo.casos) maximo = { dia: i + 1, casos: v };
    if (!minimo || v < minimo.casos) minimo = { dia: i + 1, casos: v };
  });

  const casosEn = (d: Date) => porFecha.get(claveDia(d)) ?? 0;
  const actualF = diaCorte > 0 ? new Date(anio, mes - 1, diaCorte) : null;
  const anteriorF = actualF ? new Date(actualF.getFullYear(), actualF.getMonth(), actualF.getDate() - 1) : null;
  const ultimos7 = actualF ? Array.from({ length: 7 }, (_, i) => { const d = new Date(actualF.getFullYear(), actualF.getMonth(), actualF.getDate() - 6 + i); return { fecha: d, casos: casosEn(d) }; }) : [];

  const semana = (d: number) => DIAS_CORTOS[new Date(anio, mes - 1, d).getDay()];
  return {
    anio, mes, dias, diaCorte, corte: corteDia,
    encabezados: Array.from({ length: dias }, (_, i) => ({ dia: i + 1, semana: semana(i + 1), pendiente: pend(i) })),
    filas, totalDia, total,
    promedio: diaCorte > 0 ? total / diaCorte : null,
    maximo, minimo,
    top5: filas.filter((f) => !/^Otros delitos/.test(f.delito)).slice(0, 5).map((f) => ({ delito: f.delito, casos: f.total })),
    anterior: anteriorF ? { fecha: anteriorF, casos: casosEn(anteriorF) } : null,
    actual: actualF ? { fecha: actualF, casos: casosEn(actualF) } : null,
    ultimos7,
    campoFecha: col ?? 'FECHA_HECHO',
    usaFechaIngreso: !!col,
  };
}
