// Vigencias del análisis multifecha: cada año con SU propio rango de fechas
// (p. ej. Fiestas de Pubenza / evento equivalente de cada año).
// Los rangos iniciales son solo una configuración de partida: el usuario
// los cambia por vigencia (se recuerdan en este navegador), agrega años
// nuevos o los retira de la comparación sin tocar el código.
import type { PeriodoAnalisis } from '../types/crime';

export interface RangoVigencia { fechaInicial: string; fechaFinal: string }

export const VIGENCIAS_INICIALES: Record<number, RangoVigencia> = {
  2025: { fechaInicial: '2025-09-04', fechaFinal: '2025-09-07' },
  2024: { fechaInicial: '2024-09-05', fechaFinal: '2024-09-08' },
  2023: { fechaInicial: '2023-09-07', fechaFinal: '2023-09-10' },
  2022: { fechaInicial: '2022-09-01', fechaFinal: '2022-09-04' },
  2021: { fechaInicial: '2021-11-05', fechaFinal: '2021-11-07' },
  2020: { fechaInicial: '2020-11-06', fechaFinal: '2020-11-07' },
  2019: { fechaInicial: '2019-09-05', fechaFinal: '2019-09-08' },
  2018: { fechaInicial: '2018-09-06', fechaFinal: '2018-09-09' },
  2017: { fechaInicial: '2017-09-14', fechaFinal: '2017-09-17' },
  2016: { fechaInicial: '2016-09-08', fechaFinal: '2016-09-11' },
  2015: { fechaInicial: '2015-09-03', fechaFinal: '2015-09-06' },
};

const CLAVE = 'mepoy-multifecha-vigencias';
const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Rangos guardados (los editados por el usuario) sobre los iniciales. */
export function leerVigencias(): Record<number, RangoVigencia> {
  const base: Record<number, RangoVigencia> = { ...VIGENCIAS_INICIALES };
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Record<string, RangoVigencia | null>;
    for (const [k, v] of Object.entries(crudo)) {
      const anio = Number(k);
      if (!Number.isInteger(anio)) continue;
      if (v === null) { delete base[anio]; continue; }
      if (esFecha(v?.fechaInicial) && esFecha(v?.fechaFinal)) base[anio] = { fechaInicial: v.fechaInicial, fechaFinal: v.fechaFinal };
    }
  } catch { /* sin almacenamiento: quedan los iniciales */ }
  return base;
}

/** Recuerda el rango de una vigencia (lo usa la próxima vez que se active). */
export function guardarVigencia(anio: number, rango: RangoVigencia) {
  if (!Number.isInteger(anio) || !esFecha(rango.fechaInicial) || !esFecha(rango.fechaFinal)) return;
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Record<string, RangoVigencia | null>;
    crudo[anio] = rango;
    localStorage.setItem(CLAVE, JSON.stringify(crudo));
  } catch { /* sin almacenamiento */ }
}

/** Vuelve a los rangos iniciales (los de VIGENCIAS_INICIALES). */
export function restablecerVigencias() {
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}

export function nuevoIdPeriodo() {
  return `periodo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function periodoDeVigencia(anio: number, rango?: RangoVigencia): PeriodoAnalisis {
  const r = rango ?? leerVigencias()[anio];
  return { id: nuevoIdPeriodo(), fechaInicial: r?.fechaInicial ?? '', fechaFinal: r?.fechaFinal ?? '', horaInicial: '00:00', horaFinal: '23:59' };
}

/** Año de una vigencia (el de su fecha inicial). */
export function anioDePeriodo(p: PeriodoAnalisis): number | null {
  const a = Number(p.fechaInicial.slice(0, 4));
  return p.fechaInicial && Number.isInteger(a) ? a : null;
}

/** Mismo día/mes en otro año (para proponer el rango de una vigencia nueva). */
export function rangoParaAnio(anio: number, referencia: RangoVigencia | undefined): RangoVigencia {
  if (!referencia) return { fechaInicial: `${anio}-09-01`, fechaFinal: `${anio}-09-04` };
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
  const mmdd = (iso: string) => (iso.slice(5) === '02-29' && !bisiesto ? '02-28' : iso.slice(5));
  return { fechaInicial: `${anio}-${mmdd(referencia.fechaInicial)}`, fechaFinal: `${anio}-${mmdd(referencia.fechaFinal)}` };
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «4–7 sep» / «30 sep – 2 oct». */
export function textoRango(fechaInicial: string, fechaFinal: string): string {
  if (!esFecha(fechaInicial) || !esFecha(fechaFinal)) return 'sin fechas';
  const [, m0, d0] = fechaInicial.split('-').map(Number);
  const [, m1, d1] = fechaFinal.split('-').map(Number);
  if (m0 === m1) return d0 === d1 ? `${d0} ${MESES[m0 - 1]}` : `${d0}–${d1} ${MESES[m0 - 1]}`;
  return `${d0} ${MESES[m0 - 1]} – ${d1} ${MESES[m1 - 1]}`;
}

/**
 * Rango de una vigencia: el guardado/inicial si existe; si no (un año nuevo
 * que llegó con los datos), el mismo día y mes de la vigencia configurada
 * más cercana — así cualquier año detectado se puede comparar de una vez.
 */
export function rangoVigencia(anio: number, presets: Record<number, RangoVigencia>): RangoVigencia {
  if (presets[anio]) return presets[anio];
  const conRango = Object.keys(presets).map(Number);
  if (conRango.length === 0) return rangoParaAnio(anio, undefined);
  const cercano = conRango.sort((a, b) => Math.abs(a - anio) - Math.abs(b - anio) || b - a)[0];
  return rangoParaAnio(anio, presets[cercano]);
}
