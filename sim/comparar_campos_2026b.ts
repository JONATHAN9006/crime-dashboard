import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { parseCsvText } from '../src/data/csvParser';
import { readFileSync } from 'fs';

async function main() {
  const nuevo = (await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2026_COORDENADAS.xlsx', 'DELITOS_2026_COORDENADAS.xlsx'))).registros;
  const rawViejo = readFileSync('/mnt/user-data/uploads/Coor_Delitos_ArcGis_2026.csv', 'latin1').replace(/^\uFEFF/, '');
  const viejo = parseCsvText(rawViejo).registros;

  console.log('Buscando en todo el archivo nuevo (', nuevo.length, 'registros) contra todo el viejo (', viejo.length, ')...');
  let encontrados = 0;
  for (const r of nuevo) {
    const match = viejo.find((v) => v.fechaTexto === r.fechaTexto && v.delito === r.delito && v.barrioHecho === r.barrioHecho && v.cantidad === r.cantidad);
    if (match) {
      encontrados++;
      if (encontrados <= 3) {
        console.log('\n=== Coincidencia por fecha+delito+barrio+cantidad ===');
        console.log('NUEVO cuadrante-crudo (JURIS_DEPENDENCIAS):', r.raw['JURIS_DEPENDENCIAS'], '| hora:', r.hora, '| genero:', r.genero);
        console.log('VIEJO cuadrante-crudo (JURIS_DEPENDENCIAS):', match.raw['JURIS_DEPENDENCIAS'], '| hora:', match.hora, '| genero:', match.genero);
      }
    }
  }
  console.log('\nTotal coincidencias por fecha+delito+barrio+cantidad:', encontrados, '/', nuevo.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
