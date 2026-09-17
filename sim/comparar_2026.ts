import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { parseCsvText } from '../src/data/csvParser';
import { readFileSync } from 'fs';

async function main() {
  const nuevo = await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2026_COORDENADAS.xlsx', 'DELITOS_2026_COORDENADAS.xlsx'));
  console.log('DELITOS_2026_COORDENADAS.xlsx (recién subido):', nuevo.registros.length, 'registros');
  const fechasNuevo = nuevo.registros.filter((r) => r.fecha).map((r) => r.fecha!.getTime());
  console.log('  rango de fechas:', new Date(Math.min(...fechasNuevo)).toLocaleDateString('es-CO'), 'a', new Date(Math.max(...fechasNuevo)).toLocaleDateString('es-CO'));

  let viejo;
  try {
    const raw = readFileSync('/mnt/user-data/uploads/Coor_Delitos_ArcGis_2026.csv', 'latin1').replace(/^\uFEFF/, '');
    viejo = parseCsvText(raw);
    console.log('\nCoor_Delitos_ArcGis_2026.csv (subido antes):', viejo.registros.length, 'registros');
    const fechasViejo = viejo.registros.filter((r) => r.fecha).map((r) => r.fecha!.getTime());
    console.log('  rango de fechas:', new Date(Math.min(...fechasViejo)).toLocaleDateString('es-CO'), 'a', new Date(Math.max(...fechasViejo)).toLocaleDateString('es-CO'));
  } catch (e) {
    console.log('\nNo tengo ya disponible Coor_Delitos_ArcGis_2026.csv en este turno para comparar directamente.');
  }

  if (viejo) {
    const idsViejo = new Set(viejo.registros.map((r) => r.__id));
    const coincidenExacto = nuevo.registros.filter((r) => idsViejo.has(r.__id));
    console.log('\n¿Cuántos del archivo NUEVO coinciden EXACTO (misma identidad) con el VIEJO?');
    console.log('Coincidencias:', coincidenExacto.length, '/', nuevo.registros.length);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
