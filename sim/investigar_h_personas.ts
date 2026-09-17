import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';

async function main() {
  const y2025 = (await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2025__COORDENADAS.xlsx', 'DELITOS_2025__COORDENADAS.xlsx'))).registros;
  const hPersonas = y2025.filter((r: any) => r.delito === 'H. Personas');
  console.log('Total "H. Personas" en el archivo 2025 completo:', hPersonas.length);

  const porMes = new Map<string, number>();
  for (const r of hPersonas) {
    if (!r.fecha) continue;
    const clave = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}`;
    porMes.set(clave, (porMes.get(clave) ?? 0) + 1);
  }
  console.log('\nDistribución por mes de "H. Personas" en el archivo 2025:');
  for (const [mes, n] of [...porMes.entries()].sort()) console.log(' ', mes, ':', n);

  // Comparar contra otros delitos del MISMO archivo para ver si es solo H. Personas
  console.log('\n=== Para comparar: distribución mensual de otro delito frecuente (H. Motos) en el mismo archivo ===');
  const hMotos = y2025.filter((r: any) => r.delito === 'H. Motos');
  const porMesMotos = new Map<string, number>();
  for (const r of hMotos) {
    if (!r.fecha) continue;
    const clave = `${r.fecha.getFullYear()}-${String(r.fecha.getMonth() + 1).padStart(2, '0')}`;
    porMesMotos.set(clave, (porMesMotos.get(clave) ?? 0) + 1);
  }
  for (const [mes, n] of [...porMesMotos.entries()].sort()) console.log(' ', mes, ':', n);
}
main().catch((e) => { console.error(e); process.exit(1); });
