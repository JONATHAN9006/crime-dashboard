import './fileShim';
import { makeFile } from './fileShim';
import { parseArchivo } from '../src/data/xlsxParser';

async function main() {
  const parsed = (await parseArchivo(makeFile('/mnt/user-data/uploads/Delitos_2026_Coordenadas_20092026.xls', 'Delitos_2026_Coordenadas_20092026.xls'))).registros;
  const homicidios = parsed.filter((r: any) => r.delito === 'Homicidio');
  console.log('Total homicidios en el archivo 2026 (solo, sin combinar con nada):', homicidios.length);

  const porAnio = new Map<number | string, number>();
  for (const r of homicidios) {
    const a = r.anio ?? 'SIN ANIO';
    porAnio.set(a, (porAnio.get(a) ?? 0) + 1);
  }
  console.log('Por año:', Object.fromEntries(porAnio));

  const anomalos = homicidios.filter((r: any) => r.anio !== 2026);
  console.log('\nHomicidios cuyo año NO es 2026 (deberían ser 0):', anomalos.length);
  for (const r of anomalos) {
    console.log('  ', { objectId: r.raw['OBJECTID'], fechaCruda: r.raw['FECHA_HECHO'], fechaParseada: r.fecha, anio: r.anio });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
