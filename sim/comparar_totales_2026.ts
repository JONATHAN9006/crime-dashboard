import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';
import { parseCsvText } from '../src/data/csvParser';
import { readFileSync } from 'fs';

async function main() {
  const nuevo = (await parseArchivo(makeFile('/mnt/user-data/uploads/DELITOS_2026_COORDENADAS.xlsx', 'DELITOS_2026_COORDENADAS.xlsx'))).registros;
  const rawViejo = readFileSync('/mnt/user-data/uploads/Coor_Delitos_ArcGis_2026.csv', 'latin1').replace(/^\uFEFF/, '');
  const viejoTodo = parseCsvText(rawViejo).registros;
  // recortar el viejo al mismo rango de fechas que cubre el nuevo (1/1 al 16/8)
  const finNuevo = new Date(2026, 7, 16, 23, 59, 59);
  const viejo = viejoTodo.filter((r) => r.fecha && r.fecha <= finNuevo);

  console.log('NUEVO (Jan-16 Ago):', nuevo.length, '| VIEJO recortado al mismo rango:', viejo.length);

  function totalesPorDelito(regs: any[]) {
    const m = new Map<string, number>();
    for (const r of regs) m.set(r.delito, (m.get(r.delito) ?? 0) + 1);
    return m;
  }
  const tN = totalesPorDelito(nuevo);
  const tV = totalesPorDelito(viejo);
  console.log('\nDELITO           NUEVO   VIEJO(mismo rango)');
  const todos = new Set([...tN.keys(), ...tV.keys()]);
  for (const d of todos) console.log(` ${d.padEnd(20)} ${(tN.get(d) ?? 0).toString().padStart(5)}   ${(tV.get(d) ?? 0).toString().padStart(5)}`);

  console.log('\nEstaciones NUEVO:', [...new Set(nuevo.map((r) => r.estacion))]);
  console.log('Estaciones VIEJO:', [...new Set(viejo.map((r) => r.estacion))]);
}
main().catch((e) => { console.error(e); process.exit(1); });
