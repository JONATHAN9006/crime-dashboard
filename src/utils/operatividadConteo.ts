import type { OperatividadRecord } from '../types/operatividad';

// ── CÓMO SE CUENTA LA OPERATIVIDAD ──────────────────────────────────────
// Igual que las tablas dinámicas oficiales de la MEPOY (una por categoría):
//   · CAPTURAS ................ Cuenta de DELITO_ASOCIADO
//   · AUTOMOTORES RECUPERADOS . Cuenta de CLASE_BIEN
//   · MOTOCICLETAS RECUPERADAS  Cuenta de CLASE_BIEN
//   · INCAUTACIÓN ARMAS FUEGO . Cuenta de CLASE_BIEN (por PERMISO_ARMA)
//   · MERCANCÍA INCAUTADA ..... Cuenta de TIPO_BIEN
//   · MERCANCÍA RECUPERADA .... Cuenta de TIPO_BIEN
//   · INCAUTACIÓN DROGA ....... Suma de CANTIDAD (por CLASE_BIEN), en gramos
// "Cuenta de X" = filas cuyo campo X NO está vacío (como Excel). La droga es
// una cantidad (gramos), no un número de procedimientos: por eso NO se suma
// al total de operatividad ni entra en el aporte %; se muestra aparte.

export type TipoOperatividad = 'capturas' | 'automotores' | 'motos' | 'armas' | 'mercancia' | 'droga' | 'otra';

const norm = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function tipoOperatividad(categoria: string): TipoOperatividad {
  const n = norm(categoria);
  if (/CAPTUR/.test(n)) return 'capturas';
  if (/DROGA|ESTUPEF/.test(n)) return 'droga';
  if (/AUTOMOTOR/.test(n)) return 'automotores'; // antes que MOTO: "AUTOMOTORES" contiene "MOTO"
  if (/MOTO/.test(n)) return 'motos';
  if (/ARMA/.test(n)) return 'armas';
  if (/MERCANC/.test(n)) return 'mercancia';
  return 'otra';
}

export const esDroga = (r: OperatividadRecord) => tipoOperatividad(r.categoria) === 'droga';

/** ¿Este registro cuenta como 1 en la operatividad? (la droga nunca: va aparte por cantidad) */
export function cuentaComoOperatividad(r: OperatividadRecord): boolean {
  switch (tipoOperatividad(r.categoria)) {
    case 'capturas': return !!r.delitoAsociado;
    case 'automotores':
    case 'motos':
    case 'armas': return !!r.claseBien;
    case 'mercancia': return !!r.tipoBien;
    case 'droga': return false;
    default: return true;
  }
}

/** Gramos de droga del registro (0 si no es droga). */
export function gramosDroga(r: OperatividadRecord): number {
  return esDroga(r) && Number.isFinite(r.cantidad) ? r.cantidad : 0;
}

/** Agrupa y cuenta como las tablas dinámicas (solo registros que cuentan). */
export function contarOperatividad<T extends OperatividadRecord>(registros: T[], clave: (r: T) => string): { key: string; casos: number }[] {
  const m = new Map<string, number>();
  for (const r of registros) {
    if (!cuentaComoOperatividad(r)) continue;
    const k = clave(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).map(([key, casos]) => ({ key, casos })).sort((a, b) => b.casos - a.casos);
}

/** Suma de droga (gramos) agrupada. */
export function sumarDroga<T extends OperatividadRecord>(registros: T[], clave: (r: T) => string): { key: string; casos: number }[] {
  const m = new Map<string, number>();
  for (const r of registros) {
    const g = gramosDroga(r);
    if (!g) continue;
    const k = clave(r);
    m.set(k, (m.get(k) ?? 0) + g);
  }
  return Array.from(m.entries()).map(([key, casos]) => ({ key, casos })).sort((a, b) => b.casos - a.casos);
}

export const totalOperatividad = (registros: OperatividadRecord[]) => registros.reduce((a, r) => a + (cuentaComoOperatividad(r) ? 1 : 0), 0);
export const totalDrogaGramos = (registros: OperatividadRecord[]) => registros.reduce((a, r) => a + gramosDroga(r), 0);

/** Circunstancia de captura sin "Ley": todo lo de orden judicial (Ley 906, Ley 600…) es "Orden judicial". */
export function agruparCircunstancia(v: string): string {
  const n = norm(v);
  if (!n) return '';
  if (/ORDEN\s*JUDICIAL|^O\.?\s*J\b/.test(n)) return 'Orden judicial';
  if (/FLAGRAN/.test(n)) return 'Flagrancia';
  return v;
}

// ── Unidad de la droga (gramos ↔ kilogramos) ─────────────────────────────
export type UnidadDroga = 'g' | 'kg';
export function formatearDroga(gramos: number, unidad: UnidadDroga): string {
  const v = unidad === 'kg' ? gramos / 1000 : gramos;
  return `${v.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: unidad === 'kg' ? 2 : 2 })} ${unidad === 'kg' ? 'kg' : 'g'}`;
}
