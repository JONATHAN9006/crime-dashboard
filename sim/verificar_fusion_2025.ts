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

  const homicidios2025_antes = base.filter((r: any) => r.delito === 'Homicidio' && r.anio === 2025);
  console.log('Homicidios 2025 ANTES de cargar 2026:', homicidios2025_antes.length);
  const idsAntes = new Set(homicidios2025_antes.map((r:any) => r.__id));

  const y2026 = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2026_Coordenadas_20092026.xls', 'Delitos_2026_Coordenadas_20092026.xls'))).registros;
  base = await procesarComoLoHaceLaApp(base, y2026);

  const homicidios2025_despues = base.filter((r: any) => r.delito === 'Homicidio' && r.anio === 2025);
  console.log('Homicidios 2025 DESPUÉS de cargar 2026:', homicidios2025_despues.length);

  const nuevos = homicidios2025_despues.filter((r:any) => !idsAntes.has(r.__id));
  console.log('\nHomicidios 2025 que aparecieron NUEVOS tras cargar el archivo 2026 (no deberían existir):', nuevos.length);
  for (const r of nuevos) {
    console.log('  ', { objectId: r.raw['OBJECTID'], fechaCruda: r.raw['FECHA_HECHO'], fecha: r.fecha, anio: r.anio, __id: r.__id });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
