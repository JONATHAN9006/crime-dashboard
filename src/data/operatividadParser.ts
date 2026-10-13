import * as XLSX from 'xlsx';
import type { OperatividadRecord } from '../types/operatividad';
import { MAPA_DELITO, MAPA_ESTACION } from './db2Mapeos';
import { mapearCuadrante } from './db2Transform';
import { formatoTitulo } from './csvParser';

const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function limpiar(v: unknown): string {
  const s = String(v ?? '').trim();
  return s === '<Nulo>' || s.toUpperCase() === 'NULL' ? '' : s;
}

// Igual que `limpiar`, pero además aplica "Primera Mayúscula, resto
// minúscula" — para el texto libre que llega directo del Excel en
// MAYÚSCULA SOSTENIDA (ej. "HURTO DE CELULAR EN VÍA PÚBLICA") y se
// muestra tal cual en la interfaz, sin pasar por ninguna tabla de
// traducción. Antes esos campos se dejaban gritando en mayúsculas,
// inconsistentes con el resto del dashboard (que sí usa este formato).
function limpiarYFormatear(v: unknown): string {
  const s = limpiar(v);
  return s ? formatoTitulo(s) : s;
}

function numeroONull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  // "33431,3" (coma decimal) o "1.234,5" (punto de miles + coma decimal) —
  // así viene la CANTIDAD de droga; antes Number("33431,3") daba NaN y la
  // cantidad caía a 1.
  if (t.includes(',')) t = t.includes('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Encabezados tolerantes: sin tildes, mayúsculas, espacios → "_". Se usa el
// nombre exacto de siempre y, si no está, una variación equivalente (ej.
// "SITUACIÓN JURÍDICA", "CIRCUNSTANCIA_CAPTURA" / "CIRCUSNTANCIA_CAPTURA").
const normalizarEncabezado = (k: string) => k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
function campo(fila: Record<string, unknown>, exactos: string[], patron?: RegExp): unknown {
  for (const e of exactos) if (fila[e] !== undefined && String(fila[e]).trim() !== '') return fila[e];
  const claves = Object.keys(fila);
  for (const e of exactos) {
    const k = claves.find((c) => normalizarEncabezado(c) === e);
    if (k && String(fila[k]).trim() !== '') return fila[k];
  }
  if (patron) {
    const k = claves.find((c) => patron.test(normalizarEncabezado(c)) && String(fila[c]).trim() !== '');
    if (k) return fila[k];
  }
  return '';
}

// Coordenadas — mismo criterio que Delictividad: "0" o vacío no cuentan
// como coordenada real (evita puntos falsos apilados en 0,0 en el mapa).
function coordenadaONull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
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
  return MAPA_DELITO[clave] ?? formatoTitulo(sinArticulo);
}

// La Estación llega como "ESTACION NORTE", etc. — se traduce con la misma
// tabla del dataset principal (MAPA_ESTACION) para que coincida con el
// filtro general ("E-Norte"). Los grupos especializados (Grupo de
// Investigación Judicial, Escuadrón Motorizado, etc.) no son una
// "Estación" como tal, así que se dejan con su nombre propio — nunca van a
// coincidir con el filtro de Estación, lo cual es correcto.
function traducirEstacion(valorCrudo: string): string {
  return MAPA_ESTACION[valorCrudo.toUpperCase()] ?? formatoTitulo(valorCrudo);
}

// PERTE_CUADRANTE viene siempre vacío en este archivo — la subdivisión real
// (la "Zona de Atención") está en PERTE_DEPENDENCIA. Se usa EXACTAMENTE la
// misma función que traduce este mismo tipo de código en el dataset
// principal (mapearCuadrante, en db2Transform.ts) — que no solo busca en
// una tabla fija, sino que además sabe DECODIFICAR el patrón del código
// (MEPOYMNVCCD01E0[1|2]C##NNNNNN → "Z. Atención N Norte/Sur", etc.) — así
// se traduce igual de bien aunque el código no esté todavía en la tabla.
const columnasDesconocidasOperatividad = new Set<string>();
function traducirDependenciaAZona(valorCrudo: string): string {
  if (!valorCrudo) return '';
  const resultado = mapearCuadrante(valorCrudo, columnasDesconocidasOperatividad);
  return resultado === 'NO REPORTADO' ? '' : resultado;
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
      categoria: limpiarYFormatear(fila['OPERATIVIDAD']),
      fecha,
      anio,
      mes,
      nombreMes: mes ? NOMBRES_MES[mes - 1] : limpiarYFormatear(fila['MESES']),
      diaSemana: limpiarYFormatear(fila['DIA']),
      turno: limpiarYFormatear(fila['TURNO']),
      cantidad: numeroONull(campo(fila, ['CANTIDAD'])) ?? 1,
      delitoAsociado: traducirDelito(limpiar(campo(fila, ['DELITO_ASOCIADO'], /^DELITO_ASOCIAD/))),
      estacion: traducirEstacion(limpiar(fila['ESTACION'])),
      cuadrante: traducirDependenciaAZona(limpiar(fila['PERTE_DEPENDENCIA']) || limpiar(fila['PERTE_CUADRANTE'])),
      barrioHecho: limpiarYFormatear(fila['BARRIO_HECHO']),
      zona: limpiarYFormatear(fila['ZONA']),
      unidad: limpiarYFormatear(fila['UNIDAD']),
      dependencia: limpiarYFormatear(fila['PERTE_DEPENDENCIA']),
      tipoBien: limpiarYFormatear(campo(fila, ['TIPO_BIEN'], /^TIPO_?(DE_)?BIEN/)),
      claseBien: limpiarYFormatear(campo(fila, ['CLASE_BIEN'], /^CLASE_?(DE_)?BIEN/)),
      marca: limpiarYFormatear(fila['MARCA']),
      circunstanciaCaptura: limpiarYFormatear(campo(fila, ['CIRCUSNTANCIA_CAPTURA', 'CIRCUNSTANCIA_CAPTURA'], /^CIRCU[A-Z]*_?(DE_)?CAPTURA/)),
      situacionJuridica: limpiarYFormatear(campo(fila, ['SITUACION_JURIDICA'], /SITUACION_?JURIDICA/)),
      valor: numeroONull(fila['VALOR']),
      ciudad: limpiarYFormatear(fila['CIUDAD']),
      paisPersona: limpiarYFormatear(fila['PAIS_PERSONA']),
      permisoArma: limpiarYFormatear(campo(fila, ['PERMISO_ARMA'], /PERMISO_?(DE_)?ARMA/)),
      lat: coordenadaONull(fila['LATITUD']),
      lon: coordenadaONull(fila['LONGITUD']),
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

/** Vuelve a interpretar registros ya guardados a partir de su fila original (aplica las reglas de lectura actuales). */
export function reinterpretarOperatividad(guardados: OperatividadRecord[]): OperatividadRecord[] {
  return guardados.map((r) => (r.raw ? { ...mapearFilas([r.raw])[0], __id: r.__id } : r));
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
