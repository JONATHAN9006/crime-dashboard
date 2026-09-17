import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { parseCsvText } from '../src/data/csvParser';
import { readFileSync } from 'fs';

async function main() {
  const nuevo = (await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2026_COORDENADAS.xlsx', 'DELITOS_2026_COORDENADAS.xlsx'))).registros;
  const rawViejo = readFileSync('/mnt/user-data/uploads/Coor_Delitos_ArcGis_2026.csv', 'latin1').replace(/^\uFEFF/, '');
  const viejo = parseCsvText(rawViejo).registros;

  // Buscar un caso con la MISMA fecha+hora+delito+cantidad en ambos, y comparar campo por campo
  for (const r of nuevo.slice(0, 500)) {
    const match = viejo.find((v) => v.fechaTexto === r.fechaTexto && v.hora === r.hora && v.delito === r.delito && v.cantidad === r.cantidad);
    if (match) {
      console.log('=== Encontrado un caso con misma fecha+hora+delito+cantidad ===');
      console.log('NUEVO :', { fecha: r.fechaTexto, hora: r.hora, delito: r.delito, estacion: r.estacion, cuadrante: r.cuadrante, barrio: r.barrioHecho, genero: r.genero, cantidad: r.cantidad });
      console.log('VIEJO :', { fecha: match.fechaTexto, hora: match.hora, delito: match.delito, estacion: match.estacion, cuadrante: match.cuadrante, barrio: match.barrioHecho, genero: match.genero, cantidad: match.cantidad });
      console.log('__id NUEVO:', r.__id);
      console.log('__id VIEJO:', match.__id);
      break;
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
