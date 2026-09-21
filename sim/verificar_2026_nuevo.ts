import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { excluirDelitosOmitidos } from '../src/utils/delitosExcluidos';
import { fusionarRegistros, derivarCaiDesdeCuadrante, eliminarDuplicadosPorIdentidadCruda } from '../src/data/datasetOps';
import { MAPA_DELITO } from '../src/data/db2Mapeos';
import { renormalizarCamposParametrizados } from '../src/data/csvParser';

function renormalizarDelitos(records: any[]): any[] {
  return records.map((r) => {
    const canonico = MAPA_DELITO[r.delito.toUpperCase()];
    return canonico && canonico !== r.delito ? { ...r, delito: canonico } : r;
  });
}
async function procesarComoLoHaceLaApp(existentes: any[], nuevoArchivo: any[]) {
  const fusion = fusionarRegistros(existentes, nuevoArchivo, [], []);
  const conDelitosCorregidos = renormalizarCamposParametrizados(renormalizarDelitos(fusion.registros));
  const sinExcluidos = excluirDelitosOmitidos(conDelitosCorregidos);
  const conCai = derivarCaiDesdeCuadrante(sinExcluidos);
  const { registros } = eliminarDuplicadosPorIdentidadCruda(conCai);
  return registros;
}

async function main() {
  const historico = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2003_-_2023.xlsx', 'Delitos_2003_-_2023.xlsx'))).registros;
  let base = await procesarComoLoHaceLaApp([], historico);
  const y2024_2025 = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2024-2025_COORDENADAS.xlsx', 'Delitos_2024-2025_COORDENADAS.xlsx'))).registros;
  base = await procesarComoLoHaceLaApp(base, y2024_2025);
  const y2026 = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2026_Coordenadas_21092026.xls', 'Delitos_2026_Coordenadas_21092026.xls'))).registros;
  base = await procesarComoLoHaceLaApp(base, y2026);

  const homicidios2025 = base.filter((r: any) => r.delito === 'Homicidio' && r.anio === 2025).length;
  const homicidios2026 = base.filter((r: any) => r.delito === 'Homicidio' && r.anio === 2026).length;
  console.log('Homicidio TOTAL 2025 (con este 2026 ya cargado):', homicidios2025, '<- debe ser 84');
  console.log('Homicidio TOTAL 2026 (año completo):', homicidios2026);
  console.log('TOTAL general de la base:', base.length);

  const porDelito2025 = new Map<string, number>();
  for (const r of base) if (r.anio === 2025) porDelito2025.set(r.delito, (porDelito2025.get(r.delito) ?? 0) + 1);
  console.log('\nTOTAL 2025 completo, por delito:');
  for (const [d, n] of [...porDelito2025.entries()].sort((a,b)=>b[1]-a[1])) console.log(' ', d.padEnd(20), n);
}
main().catch((e) => { console.error(e); process.exit(1); });
