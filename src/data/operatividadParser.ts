import * as XLSX from 'xlsx';
import type { OperatividadRecord } from '../types/operatividad';

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function limpiar(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '<Nulo>' || s.toUpperCase() === 'NULL' ? '' : s;
}

function numeroONull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// FECHA_HECHO viene como entero AAAAMMDD (ej. 20260324) — a veces también
// puede venir como fecha real de Excel si la celda tenía formato de fecha
// (XLSX ya la entrega como objeto Date en ese caso, gracias a cellDates).
function parsearFecha(valor: unknown): Date | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  const texto = String(valor ?? '').trim();
  if (/^\d{8}$/.test(texto)) {
    const anio = Number(texto.slice(0, 4));
    const mes = Number(texto.slice(4, 6));
    const dia = Number(texto.slice(6, 8));
    const fecha = new Date(anio, mes - 1, dia);
    return isNaN(fecha.getTime()) ? null : fecha;
  }
  return null;
}

export function esArchivoOperatividad(headers: string[]): boolean {
  const limpios = headers.map((h) => h.trim().toUpperCase());
  return limpios.includes('OPERATIVIDAD') && limpios.includes('DELITO_ASOCIADO');
}

export async function parsearOperatividad(file: File): Promise<{ registros: OperatividadRecord[]; columnasDetectadas: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
  const columnasDetectadas = filas.length > 0 ? Object.keys(filas[0]) : [];

  const registros: OperatividadRecord[] = filas.map((fila, indice) => {
    const fecha = parsearFecha(fila['FECHA_HECHO']);
    const anio = fecha ? fecha.getFullYear() : numeroONull(fila['ANIO']);
    const mes = fecha ? fecha.getMonth() + 1 : null;

    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(fila)) raw[k] = String(v ?? '');

    const rec: OperatividadRecord = {
      __id: limpiar(fila['OBJECTID']) || `op-${indice}`,
      categoria: limpiar(fila['OPERATIVIDAD']),
      fecha,
      anio,
      mes,
      nombreMes: mes ? NOMBRES_MES[mes - 1] : limpiar(fila['MESES']),
      diaSemana: limpiar(fila['DIA']),
      turno: limpiar(fila['TURNO']),
      cantidad: numeroONull(fila['CANTIDAD']) ?? 1,
      delitoAsociado: limpiar(fila['DELITO_ASOCIADO']),
      estacion: limpiar(fila['ESTACION']),
      cuadrante: limpiar(fila['PERTE_CUADRANTE']),
      barrioHecho: limpiar(fila['BARRIO_HECHO']),
      zona: limpiar(fila['ZONA']),
      unidad: limpiar(fila['UNIDAD']),
      dependencia: limpiar(fila['PERTE_DEPENDENCIA']),
      tipoBien: limpiar(fila['TIPO_BIEN']),
      claseBien: limpiar(fila['CLASE_BIEN']),
      marca: limpiar(fila['MARCA']),
      circunstanciaCaptura: limpiar(fila['CIRCUSNTANCIA_CAPTURA']),
      situacionJuridica: limpiar(fila['SITUACION_JURIDICA']),
      valor: numeroONull(fila['VALOR']),
      raw,
    };
    return rec;
  });

  return { registros, columnasDetectadas };
}
