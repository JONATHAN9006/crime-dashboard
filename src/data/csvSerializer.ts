import type { CrimeRecord } from '../types/crime';

// Reconstruye un CSV con el mismo delimitador (;) y la unión de todas las
// columnas originales presentes en los registros (incluye columnas "raw"
// desconocidas para no perder información al reenviar al backend central).
export function serializarCsv(records: CrimeRecord[]): string {
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
