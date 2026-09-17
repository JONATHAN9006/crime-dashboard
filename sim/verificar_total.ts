import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { excluirDelitosOmitidos } from '../src/utils/delitosExcluidos';
import { fusionarRegistros, derivarCaiDesdeCuadrante, eliminarDuplicadosPorIdentidadCruda } from '../src/data/datasetOps';

async function main() {
  const file = makeFile('/mnt/user-data/uploads/Delitos_2003_-_2023.xlsx', 'Delitos_2003_-_2023.xlsx');
  const parsed = await parseArchivo(file);
  console.log('1. Leídos del archivo:', parsed.registros.length);

  const fusion = fusionarRegistros([], parsed.registros, [], []);
  console.log('2. Tras fusionar (quita duplicados internos):', fusion.registros.length, `(${fusion.resumen.duplicados} duplicados fusionados)`);

  const sinExcluidos = excluirDelitosOmitidos(fusion.registros);
  console.log('3. Tras excluir delitos ocultos:', sinExcluidos.length, `(${fusion.registros.length - sinExcluidos.length} excluidos)`);

  const conCai = derivarCaiDesdeCuadrante(sinExcluidos);
  const final = eliminarDuplicadosPorIdentidadCruda(conCai);
  console.log('4. TOTAL FINAL (lo que debería mostrar el dashboard):', final.registros.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
