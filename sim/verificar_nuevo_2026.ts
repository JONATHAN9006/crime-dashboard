import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { parseCsvText } from '../src/data/csvParser';
import { readFileSync } from 'fs';

async function main() {
  const nuevo = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2026_Coordenadas_17092026.xlsx', 'Delitos_2026_Coordenadas_17092026.xlsx'))).registros;
  console.log('Archivo nuevo:', nuevo.length, 'registros');
  const fechas = nuevo.filter((r) => r.fecha).map((r) => r.fecha!.getTime());
  console.log('Rango de fechas:', new Date(Math.min(...fechas)).toLocaleDateString('es-CO'), 'a', new Date(Math.max(...fechas)).toLocaleDateString('es-CO'));

  const porDelito = new Map<string, number>();
  for (const r of nuevo) porDelito.set(r.delito, (porDelito.get(r.delito) ?? 0) + 1);
  console.log('\nDelitos y conteos:');
  for (const [d, n] of [...porDelito.entries()].sort((a, b) => b[1] - a[1])) console.log(' ', d, ':', n);

  const rawViejo = readFileSync('/mnt/user-data/uploads/Coor_Delitos_ArcGis_2026.csv', 'latin1').replace(/^\uFEFF/, '');
  const viejo = parseCsvText(rawViejo).registros;
  console.log('\n=== Comparación de identidad contra Coor_Delitos_ArcGis_2026.csv (ya cargado) ===');
  const idsViejo = new Set(viejo.registros ? viejo.registros.map((r: any) => r.__id) : viejo.map((r: any) => r.__id));
  const coinciden = nuevo.filter((r) => idsViejo.has(r.__id));
  console.log('Coincidencias EXACTAS (mismo __id):', coinciden.length, '/', nuevo.length);
  console.log('Registros del nuevo que NO estaban antes (genuinamente nuevos):', nuevo.length - coinciden.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
