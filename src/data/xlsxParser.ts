import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { procesarFilas, type ParseResult } from './csvParser';
import { transformarDatosDB2, COLUMNAS_REQUERIDAS_DB2 } from './db2Transform';

export function esArchivoExcel(nombreArchivo: string): boolean {
  return /\.(xlsx|xls)$/i.test(nombreArchivo);
}

// Una descarga DB2 cruda del aplicativo se distingue de Matriz_Base (o de
// cualquier archivo ya normalizado) porque usa nombres de columna "crudos"
// (DELITOS, CUADRANTE, CAI...) y NUNCA columnas con el sufijo "Final" que sí
// usa Matriz_Base (Delito, Cuadrante Final, CAI Final...). Se verificó esto
// comparando ambos archivos reales columna por columna.
function esArchivoDB2Crudo(headers: string[]): boolean {
  const limpios = headers.map((h) => h.trim());
  const tieneColumnasCrudas = COLUMNAS_REQUERIDAS_DB2.every((c) => limpios.includes(c)) && limpios.includes('CUADRANTE');
  const tieneColumnasFinal = limpios.some((h) => h.endsWith('Final'));
  return tieneColumnasCrudas && !tieneColumnasFinal;
}

interface FilasCrudas {
  rows: Record<string, string>[];
  headers: string[];
}

function leerCsvComoFilas(texto: string): FilasCrudas {
  const resultado = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: true, delimiter: '' });
  return { rows: resultado.data, headers: (resultado.meta.fields || []).map((f) => f.trim()) };
}

function leerXlsxComoFilas(file: File): Promise<FilasCrudas> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // cellDates:true fuerza a que las celdas con formato de fecha se
        // interpreten como fechas reales (no como el número de serie interno
        // de Excel), y dateNF fija el formato de salida a dd/mm/yyyy sin
        // depender de que el archivo de origen conserve el estilo de celda.
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'dd"/"mm"/"yyyy' });
        const nombreHoja = workbook.SheetNames[0];
        const hoja = workbook.Sheets[nombreHoja];
        const csv = XLSX.utils.sheet_to_csv(hoja, { FS: ';', blankrows: false, dateNF: 'dd"/"mm"/"yyyy' });
        resolve(leerCsvComoFilas(csv));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function leerCsvArchivoComoFilas(file: File): Promise<FilasCrudas> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(leerCsvComoFilas(String(e.target?.result || '')));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'utf-8');
  });
}

// Punto de entrada único para cargar un archivo: detecta el formato (CSV o
// Excel, y dentro de eso, DB2 crudo vs. ya normalizado) y produce siempre el
// mismo resultado (ParseResult) sin importar el origen, para que el resto de
// la aplicación (DataContext, deduplicación, agregaciones) no tenga que saber
// de dónde vino el archivo.
export async function parseArchivo(file: File): Promise<ParseResult> {
  const { rows, headers } = esArchivoExcel(file.name)
    ? await leerXlsxComoFilas(file)
    : await leerCsvArchivoComoFilas(file);

  if (esArchivoDB2Crudo(headers)) {
    const transformado = transformarDatosDB2(rows, headers);
    if (transformado.columnasFaltantes.length > 0) {
      return {
        registros: [], columnasDetectadas: headers, columnasFaltantes: transformado.columnasFaltantes,
        totalFilasCrudas: rows.length, formatoDetectado: 'db2',
      };
    }
    const headersTransformados = transformado.filas.length > 0 ? Object.keys(transformado.filas[0]) : [];
    const resultado = procesarFilas(transformado.filas, headersTransformados);
    return {
      ...resultado,
      formatoDetectado: 'db2',
      filasConErroresDB2: transformado.filasConErrores,
      valoresNuevosDB2: transformado.valoresNuevosDetectados,
      fechaMaxParametro: transformado.fechaMaxParametro,
    };
  }

  return { ...procesarFilas(rows, headers), formatoDetectado: 'normalizado' };
}
