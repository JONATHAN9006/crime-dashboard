import * as XLSX from 'xlsx';

// Lector GENÉRICO de CSV/XLS/XLSX — a diferencia de src/data/csvParser.ts
// (que espera las columnas exactas de Delitos), esto acepta CUALQUIER
// columna tal cual venga, para la capa temporal de "archivo
// georreferenciado" del mapa. No modifica ningún valor — cada fila queda
// como un objeto plano { "Nombre de columna": valor }.

// Muchos CSV exportados desde Excel en español quedan en Windows-1252
// (Latin-1), no en UTF-8 — si se leen como UTF-8 a la fuerza, cualquier
// símbolo especial (el ° de las coordenadas en grados/minutos/segundos, o
// letras con tilde) queda corrompido en un carácter de reemplazo "�"
// (confirmado en producción: por eso "2°27'14.05"" llegaba como
// "2�27'14.05"" y no se podía interpretar como coordenada). Se decodifica
// primero como UTF-8 y, si aparece ese carácter de reemplazo, se vuelve a
// decodificar como Windows-1252 — sin pedirle nada al usuario, detectado
// solo.
function decodificarTextoDetectandoCodificacion(buffer: ArrayBuffer): string {
  const comoUtf8 = new TextDecoder('utf-8').decode(buffer);
  if (!comoUtf8.includes('\uFFFD')) return comoUtf8;
  try {
    return new TextDecoder('windows-1252').decode(buffer);
  } catch {
    return comoUtf8; // navegador sin soporte para windows-1252 — mejor esto que nada
  }
}

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
    const buffer = await file.arrayBuffer();
    const texto = decodificarTextoDetectandoCodificacion(buffer);
    return parsearCsvGenerico(texto);
  }
  if (nombre.endsWith('.xls') || nombre.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer();
    return parsearHojaExcel(buffer);
  }
  throw new Error('Formato no reconocido — sube un archivo .csv, .xls o .xlsx.');
}

// ---------------------------------------------------------------------------
// Descarga del archivo YA corregido — todas las columnas originales tal
// cual, más Latitud/Longitud normalizadas a decimal (en el separador que
// elija el usuario) y una columna de estado, para que sea evidente cuáles
// quedaron corregidas y cuáles no se pudieron interpretar.
// ---------------------------------------------------------------------------

function formatearDecimal(n: number, separador: 'punto' | 'coma'): string {
  const texto = n.toFixed(6);
  return separador === 'coma' ? texto.replace('.', ',') : texto;
}

export interface FilaParaDescarga {
  fila: Record<string, unknown>;
  lat: number;
  lon: number;
  valido: boolean;
  motivoInvalido?: string;
}

export function descargarRegistrosCorregidos(registros: FilaParaDescarga[], formatoArchivo: 'excel' | 'csv', separadorDecimal: 'punto' | 'coma') {
  if (registros.length === 0) return;

  const encabezadosOriginales = Object.keys(registros[0].fila);
  const filasSalida = registros.map((r) => ({
    ...r.fila,
    Latitud_Corregida: r.valido ? formatearDecimal(r.lat, separadorDecimal) : '',
    Longitud_Corregida: r.valido ? formatearDecimal(r.lon, separadorDecimal) : '',
    Estado: r.valido ? 'Válido' : `Inválido: ${r.motivoInvalido ?? 'sin especificar'}`,
  }));
  const encabezadosSalida = [...encabezadosOriginales, 'Latitud_Corregida', 'Longitud_Corregida', 'Estado'];

  const nombreBase = `coordenadas-corregidas-${new Date().toISOString().slice(0, 10)}`;

  if (formatoArchivo === 'excel') {
    const hoja = XLSX.utils.json_to_sheet(filasSalida, { header: encabezadosSalida });
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Coordenadas');
    XLSX.writeFile(libro, `${nombreBase}.xlsx`);
    return;
  }

  // CSV — con separador de coma decimal, el campo también usa coma, así
  // que el delimitador de columnas pasa a punto y coma (convención
  // regional estándar) para no confundir uno con otro.
  const delimitadorCampos = separadorDecimal === 'coma' ? ';' : ',';
  const escapar = (v: unknown) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    encabezadosSalida.join(delimitadorCampos),
    ...filasSalida.map((fila) => encabezadosSalida.map((h) => escapar((fila as Record<string, unknown>)[h])).join(delimitadorCampos)),
  ];
  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombreBase}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
