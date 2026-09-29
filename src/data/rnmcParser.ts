import * as XLSX from 'xlsx';
import { MAPA_CUADRANTE } from './db2Mapeos';

// Lector de la "MATRIZ_COMPARENDOS" — confirmado contra el archivo real del
// usuario (Hoja1, 6.619 filas, columnas como ARTICULO/COMPORTAMIENTO/
// CUADRANTE_HECHOS/LOCALIDAD/POLICIA_IMPUSO). Esta va a ser SIEMPRE la
// misma matriz (así lo indicó explícitamente), así que se lee por nombre
// de columna exacto, sin heurísticas de detección como las de Delictividad.

export interface RegistroComparendo {
  __id: string; // EXPEDIENTE — único por comparendo, confirmado contra el archivo real (6.619 filas, 6.619 valores distintos). Es la identidad real del sistema de origen, no un hash calculado.
  fecha: Date | null;
  anio: number | null;
  articulo: string; // "Art. 27" (sin el texto largo)
  numeral: string; // "Num. 6"
  articuloNumeral: string; // "Art. 27 Num. 6" — clave para agrupar
  comportamientoTexto: string; // el texto completo del comportamiento
  comuna: string; // LOCALIDAD, ej. "C-4"
  cuadranteHechos: string; // código crudo
  zonaAtencionHechos: string; // traducido vía MAPA_CUADRANTE, ej. "Z. Atención 16 Norte"
  cuadrantePatrulla: string; // código crudo (CUADRANTE_CARGO_POL)
  zonaAtencionPatrulla: string; // traducido — la "patrulla" que atendió
  unidadPolicial: string; // UNIDAD_LABORA_POL, ej. "MEPOY - CAI COMUNA CUATRO"
  funcionario: string; // POLICIA_IMPUSO
  barrio: string;
}

function limpiar(v: unknown): string {
  return String(v ?? '').trim();
}

// "Art. 27 - Comportamientos que..." → "Art. 27"
function extraerArticuloCorto(texto: string): string {
  const m = texto.match(/Art\.\s*\d+/i);
  return m ? m[0].replace(/\s+/g, ' ') : texto;
}
// "Num. 6 - Portar armas..." → "Num. 6"
function extraerNumeralCorto(texto: string): string {
  const m = texto.match(/Num\.\s*\d+/i);
  return m ? m[0].replace(/\s+/g, ' ') : texto;
}

function traducirZona(codigoCrudo: string): string {
  const codigo = codigoCrudo.trim().toUpperCase();
  return MAPA_CUADRANTE[codigo] ?? codigoCrudo;
}

function parseFechaExcel(valor: unknown): Date | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  if (typeof valor === 'number' && valor > 20000 && valor < 60000) {
    const f = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
    return isNaN(f.getTime()) ? null : f;
  }
  const texto = limpiar(valor);
  if (!texto) return null;
  const m = texto.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const f = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(f.getTime()) ? null : f;
  }
  const intento = new Date(texto);
  return isNaN(intento.getTime()) ? null : intento;
}

export async function leerMatrizComparendos(file: File): Promise<RegistroComparendo[]> {
  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: 'array', cellDates: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });

  return filas.map((fila): RegistroComparendo => {
    const articuloTexto = limpiar(fila.ARTICULO);
    const comportamientoTexto = limpiar(fila.COMPORTAMIENTO);
    const articulo = extraerArticuloCorto(articuloTexto);
    const numeral = extraerNumeralCorto(comportamientoTexto);
    const cuadranteHechos = limpiar(fila.CUADRANTE_HECHOS);
    const cuadrantePatrulla = limpiar(fila.CUADRANTE_CARGO_POL);
    const fecha = parseFechaExcel(fila.FECHA_HECHOS);
    return {
      __id: limpiar(fila.EXPEDIENTE) || `SIN-EXPEDIENTE-${Math.random().toString(36).slice(2)}`,
      fecha,
      anio: fecha ? fecha.getFullYear() : null,
      articulo,
      numeral,
      articuloNumeral: `${articulo} ${numeral}`.trim(),
      comportamientoTexto,
      comuna: limpiar(fila.LOCALIDAD),
      cuadranteHechos,
      zonaAtencionHechos: cuadranteHechos ? traducirZona(cuadranteHechos) : '',
      cuadrantePatrulla,
      zonaAtencionPatrulla: cuadrantePatrulla ? traducirZona(cuadrantePatrulla) : '',
      unidadPolicial: limpiar(fila.UNIDAD_LABORA_POL),
      funcionario: limpiar(fila.POLICIA_IMPUSO),
      barrio: limpiar(fila.BARRIO_HECHOS),
    };
  });
}
