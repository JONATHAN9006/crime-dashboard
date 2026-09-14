import * as XLSX from 'xlsx';
import type { OperatividadRecord } from '../types/operatividad';
import { MAPA_DELITO, MAPA_ESTACION, MAPA_CAI } from './db2Mapeos';

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function limpiar(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '<Nulo>' || s.toUpperCase() === 'NULL' ? '' : s;
}

function numeroONull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// El Excel trae el delito como una cita legal completa, ej. "ARTÍCULO 239.
// HURTO MOTOCICLETAS" — se quita el "ARTÍCULO NNN[letra]. " del inicio y lo
// que queda se traduce con la MISMA tabla que usa el dataset principal
// (MAPA_DELITO), para que "HURTO MOTOCICLETAS" quede como "H. Motos" —
// exactamente como aparece en el filtro general. Si el delito no está en
// esa tabla (hay ~70 tipos distintos en Operatividad, más de los que se
// siguen en el dashboard), se deja el nombre limpio tal cual, sin inventar
// una categoría que no existe.
function traducirDelito(valorCrudo: string): string {
  const sinArticulo = valorCrudo.replace(/^ART[IÍ]CULO\s+\d+[A-Z]?\.\s*/i, '').trim();
  const clave = sinArticulo.toUpperCase();
  return MAPA_DELITO[clave] ?? sinArticulo;
}

// La Estación llega como "ESTACION NORTE", etc. — se traduce con la misma
// tabla del dataset principal (MAPA_ESTACION) para que coincida con el
// filtro general ("E-Norte"). Los grupos especializados (Grupo de
// Investigación Judicial, Escuadrón Motorizado, etc.) no son una
// "Estación" como tal, así que se dejan con su nombre propio — nunca van a
// coincidir con el filtro de Estación, lo cual es correcto.
function traducirEstacion(valorCrudo: string): string {
  return MAPA_ESTACION[valorCrudo.toUpperCase()] ?? valorCrudo;
}

// PERTE_CUADRANTE viene siempre vacío en este archivo — la subdivisión real
// (la "Zona de Atención"/CAI) está en PERTE_DEPENDENCIA, con el mismo
// formato de código que ya traduce MAPA_CAI en el dataset principal. Si el
// código no está en esa tabla (ej. dependencias especializadas que no son
// una zona de atención real, como un Grupo de Investigación Judicial), se
// muestra "Otra dependencia" en vez del código crudo sin traducir.
function traducirDependenciaAZona(valorCrudo: string): string {
  if (!valorCrudo) return '';
  const traducido = MAPA_CAI[valorCrudo.toUpperCase()];
  if (traducido) return traducido;
  return /^MEPOY/i.test(valorCrudo) ? 'Otra dependencia' : valorCrudo;
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

function mapearFilas(filas: Record<string, unknown>[]): OperatividadRecord[] {
  return filas.map((fila, indice) => {
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
      delitoAsociado: traducirDelito(limpiar(fila['DELITO_ASOCIADO'])),
      estacion: traducirEstacion(limpiar(fila['ESTACION'])),
      cuadrante: traducirDependenciaAZona(limpiar(fila['PERTE_DEPENDENCIA']) || limpiar(fila['PERTE_CUADRANTE'])),
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
}

export async function parsearOperatividad(file: File): Promise<{ registros: OperatividadRecord[]; columnasDetectadas: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
  const columnasDetectadas = filas.length > 0 ? Object.keys(filas[0]) : [];
  return { registros: mapearFilas(filas), columnasDetectadas };
}

// Para cuando el CSV viene del backend central (ver remoteApi.ts) — mismo
// mapeo de columnas, pero partiendo de texto CSV (delimitador ";", igual
// que csvSerializer.ts) en vez de un archivo .xlsx recién subido.
export function parsearOperatividadDesdeCsv(csvTexto: string): OperatividadRecord[] {
  if (!csvTexto || !csvTexto.trim()) return [];
  const workbook = XLSX.read(csvTexto, { type: 'string', raw: true, FS: ';' });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas: Record<string, unknown>[] = XLSX.utils.sheet_to_json(hoja, { defval: '' });
  return mapearFilas(filas);
}
