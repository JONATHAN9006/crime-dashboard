import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { excluirDelitosOmitidos } from '../src/utils/delitosExcluidos';
import { fusionarRegistros, derivarCaiDesdeCuadrante, eliminarDuplicadosPorIdentidadCruda } from '../src/data/datasetOps';
import { MAPA_DELITO } from '../src/data/db2Mapeos';

// Replica el mismo pipeline de persistirYActualizar en DataContext.tsx
function renormalizarDelitos(records: any[]): any[] {
  return records.map((r) => {
    const canonico = MAPA_DELITO[r.delito.toUpperCase()];
    if (canonico) return canonico !== r.delito ? { ...r, delito: canonico } : r;
    return r;
  });
}

async function procesarComoLoHaceLaApp(existentes: any[], nuevoArchivo: any[]) {
  const fusion = fusionarRegistros(existentes, nuevoArchivo, [], []);
  const conDelitosCorregidos = renormalizarDelitos(fusion.registros);
  const sinExcluidos = excluirDelitosOmitidos(conDelitosCorregidos);
  const conCai = derivarCaiDesdeCuadrante(sinExcluidos);
  const { registros } = eliminarDuplicadosPorIdentidadCruda(conCai);
  return registros;
}

async function main() {
  // 1. Reemplazar con histórico
  const historico = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2003_-_2023.xlsx', 'Delitos_2003_-_2023.xlsx'))).registros;
  let base = await procesarComoLoHaceLaApp([], historico);
  console.log('1. Tras Reemplazar con histórico:', base.length, 'registros');

  // 2. Agregar 2024
  const y2024 = (await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2024_COORDENADAS.xlsx', 'DELITOS_2024_COORDENADAS.xlsx'))).registros;
  base = await procesarComoLoHaceLaApp(base, y2024);
  console.log('2. Tras Agregar 2024:', base.length, 'registros');

  // 3. Agregar 2025
  const y2025 = (await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2025__COORDENADAS.xlsx', 'DELITOS_2025__COORDENADAS.xlsx'))).registros;
  base = await procesarComoLoHaceLaApp(base, y2025);
  console.log('3. Tras Agregar 2025:', base.length, 'registros');

  // 4. Agregar 2026
  const y2026 = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2026_Coordenadas_17092026.xlsx', 'Delitos_2026_Coordenadas_17092026.xlsx'))).registros;
  base = await procesarComoLoHaceLaApp(base, y2026);
  console.log('4. Tras Agregar 2026:', base.length, 'registros TOTAL FINAL');

  // Comparativo 2025 vs 2026 "a la fecha" (01/01 al 13/09 de cada año)
  function enRango(fecha: Date | null, inicio: Date, fin: Date) {
    return !!fecha && fecha >= inicio && fecha <= fin;
  }
  const inicio2025 = new Date(2025, 0, 1), fin2025 = new Date(2025, 8, 13, 23, 59, 59);
  const inicio2026 = new Date(2026, 0, 1), fin2026 = new Date(2026, 8, 13, 23, 59, 59);

  console.log('\n=== COMPARATIVO 2025 vs 2026 "a la fecha" (esperado tras la carga) ===');
  const delitos = [...new Set(base.map((r: any) => r.delito))];
  const tabla: any[] = [];
  for (const d of delitos) {
    const c2025 = base.filter((r: any) => r.delito === d && enRango(r.fecha, inicio2025, fin2025)).length;
    const c2026 = base.filter((r: any) => r.delito === d && enRango(r.fecha, inicio2026, fin2026)).length;
    if (c2025 > 0 || c2026 > 0) tabla.push({ delito: d, c2025, c2026 });
  }
  tabla.sort((a, b) => b.c2026 - a.c2026);
  for (const t of tabla) console.log(` ${t.delito.padEnd(20)} 2025=${t.c2025}   2026=${t.c2026}`);
  console.log(' TOTAL                2025=' + tabla.reduce((s, t) => s + t.c2025, 0), '  2026=' + tabla.reduce((s, t) => s + t.c2026, 0));
}
main().catch((e) => { console.error(e); process.exit(1); });
