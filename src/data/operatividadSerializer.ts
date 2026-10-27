import type { OperatividadRecord } from '../types/operatividad';

// Mismo patrón que csvSerializer.ts (Delictividad): reconstruye un CSV a
// partir de la fila original ("raw") de cada registro, uniendo todas las
// columnas que aparezcan en cualquiera de ellos.
export function serializarOperatividadCsv(records: OperatividadRecord[]): string {
  if (records.length === 0) return '';

  const columnasSet = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r.raw)) columnasSet.add(k);
  }
  const columnas = Array.from(columnasSet);

  const escapar = (valor: string) => {
    const v = valor ?? '';
    if (v.includes(';') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const lineas: string[] = [columnas.map(escapar).join(';')];
  for (const r of records) {
    lineas.push(columnas.map((c) => escapar(r.raw[c] ?? '')).join(';'));
  }
  return lineas.join('\r\n');
}
