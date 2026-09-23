import * as XLSX from 'xlsx';

// Lector GENÉRICO de CSV/XLS/XLSX — a diferencia de src/data/csvParser.ts
// (que espera las columnas exactas de Delitos), esto acepta CUALQUIER
// columna tal cual venga, para la capa temporal de "archivo
// georreferenciado" del mapa. No modifica ningún valor — cada fila queda
// como un objeto plano { "Nombre de columna": valor }.

function parsearCsvGenerico(texto: string): { encabezados: string[]; filas: Record<string, unknown>[] } {
  // Detecta el separador (coma o punto y coma, el más común en exportes
  // regionales) mirando la primera línea.
  const primeraLinea = texto.split(/\r?\n/, 1)[0] || '';
  const separador = (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length ? ';' : ',';

  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lineas.length === 0) return { encabezados: [], filas: [] };

  function parsearLinea(linea: string): string[] {
    const campos: string[] = [];
    let actual = '';
    let dentroComillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (dentroComillas && linea[i + 1] === '"') { actual += '"'; i++; }
        else dentroComillas = !dentroComillas;
      } else if (c === separador && !dentroComillas) {
        campos.push(actual);
        actual = '';
      } else {
        actual += c;
      }
    }
    campos.push(actual);
    return campos.map((c) => c.trim());
  }

  const encabezados = parsearLinea(lineas[0]);
  const filas = lineas.slice(1).map((linea) => {
    const valores = parsearLinea(linea);
    const fila: Record<string, unknown> = {};
    encabezados.forEach((h, i) => { fila[h] = valores[i] ?? ''; });
    return fila;
  });
  return { encabezados, filas };
}

function parsearHojaExcel(buffer: ArrayBuffer): { encabezados: string[]; filas: Record<string, unknown>[] } {
  const libro = XLSX.read(buffer, { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filasComoArreglos: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
  if (filasComoArreglos.length === 0) return { encabezados: [], filas: [] };
  const encabezados = (filasComoArreglos[0] as unknown[]).map((h) => String(h ?? '').trim());
  const filas = filasComoArreglos.slice(1).map((valores) => {
    const fila: Record<string, unknown> = {};
    encabezados.forEach((h, i) => { fila[h] = (valores as unknown[])[i] ?? ''; });
    return fila;
  });
  return { encabezados, filas };
}

export async function leerArchivoGenerico(file: File): Promise<{ encabezados: string[]; filas: Record<string, unknown>[] }> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith('.csv')) {
    const texto = await file.text();
    return parsearCsvGenerico(texto);
  }
  if (nombre.endsWith('.xls') || nombre.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    return parsearHojaExcel(buffer);
  }
  throw new Error('Formato no reconocido — sube un archivo .csv, .xls o .xlsx.');
}
