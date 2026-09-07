import Papa from 'papaparse';
import type { CrimeRecord } from '../types/crime';
import { esSerieExcelPlausible, convertirSerieExcelAFecha } from './excelSerial';

// Columnas mínimas para poder procesar un archivo. Se acepta CUALQUIERA de los
// dos formatos: el histórico (FECHA_HECHO/DELITOS/CANTIDAD) o el formato oficial
// vigente (Año/Mes/Fecha Dia/Delito), que es el que se usa de ahora en adelante.
const COLUMNAS_REQUERIDAS_LEGACY = ['FECHA_HECHO', 'DELITOS', 'CANTIDAD'];
const COLUMNAS_REQUERIDAS_NUEVO = ['Año', 'Mes', 'Fecha Dia', 'Delito'];
export const COLUMNAS_REQUERIDAS = COLUMNAS_REQUERIDAS_NUEVO;

// Mapa de campo lógico -> posibles nombres de columna en el CSV (tolerante a variaciones
// entre el formato histórico y el formato oficial vigente "Base_de_Datos_General").
const COLUMN_MAP: Record<string, string[]> = {
  fecha: ['FECHA_HECHO', 'FECHA_HECHO NEW'],
  hora: ['HORA HECHO', 'HORA_24', 'HORA_HECHO'],
  cantidad: ['CANTIDAD'],
  delito: ['DELITOS', 'Delito'],
  modalidad: ['MODALIDAD', 'Modalidad Final'],
  armas: ['ARMAS', 'Arma Final'],
  causaLesion: ['CAUSA_LESION', 'Causa Lesion Final'],
  estacion: ['ESTACION', 'Estación Final'],
  cai: ['CAI', 'CAI Final'],
  cuadrante: ['CUADRANTE', 'Cuadrante Final'],
  barrioHecho: ['BARRIOS_HECHO', 'BARRIO-CIUDAD', 'Barrio Hecho Final'],
  zona: ['ZONA', 'ZONA2', 'Zona Final'],
  claseSitio: ['CLASE_SITIO', 'Clase Sitio Final'],
  genero: ['GENERO', 'Genero Final'],
  grupoEdad: ['GRUPO EDAD LEY', 'Grupo Edad Ley Final'],
  edad: ['EDAD'],
  diaSemana: ['DIA_SEMANA (grupo)', 'DIA_SEMANA', 'Dia'],
  anio: ['ANIO', 'AÑO', 'Año'],
  semana: ['SEMANA', 'NoSEMANA', 'Semana2'],
  // Componentes de fecha del formato oficial vigente (sin columna de fecha única)
  anioComponente: ['Año', 'ANIO', 'AÑO'],
  mesComponente: ['Mes'],
  mesResumidoComponente: ['Mes resumido'],
  diaMesComponente: ['Fecha Dia', 'FECHA_DIA', 'DIA_MES'],
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

const MESES_A_NUMERO: Record<string, number> = {
  ENERO: 1, ENE: 1, FEBRERO: 2, FEB: 2, MARZO: 3, MAR: 3, ABRIL: 4, ABR: 4,
  MAYO: 5, MAY: 5, JUNIO: 6, JUN: 6, JULIO: 7, JUL: 7, AGOSTO: 8, AGO: 8,
  SEPTIEMBRE: 9, SEP: 9, SET: 9, OCTUBRE: 10, OCT: 10, NOVIEMBRE: 11, NOV: 11,
  DICIEMBRE: 12, DIC: 12,
};

function quitarAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function mesANumero(nombre: string): number | null {
  const norm = quitarAcentos(nombre.trim().toUpperCase());
  return MESES_A_NUMERO[norm] ?? null;
}

function clean(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === '' || /^null$/i.test(s) || s === '-' || s === '#N/A') return '';
  return s;
}

function normalizeCategoria(v: string): string {
  const c = clean(v);
  if (!c) return 'NO REPORTADO';
  const upper = c.toUpperCase();
  if (upper === 'NO REPORTADA' || upper === 'NO REPORTADO' || upper === 'SIN INFORMACION') return 'NO REPORTADO';
  return c;
}

// Normaliza las llaves de una fila (recorta espacios en los encabezados, algo
// frecuente en archivos exportados desde Excel/Tableau, ej. "Mes resumido ").
function normalizarFila(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(row)) out[k.trim()] = row[k];
  return out;
}

// Busca una columna por coincidencia exacta y, si no la encuentra, por
// coincidencia insensible a mayúsculas/minúsculas (tolerante a variaciones
// como "HORA_24" vs "Hora_24").
function findColumn(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
  }
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (found) return row[found];
  }
  return '';
}

// Parsea fechas en formato dd/mm/yyyy (o d/m/yyyy), formato del origen histórico.
function parseFecha(txt: string): Date | null {
  const t = clean(txt);
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }
  // Salvaguarda: si llega un número de serie de Excel crudo (ej. archivos donde
  // la celda de fecha no conservó su formato), se convierte en vez de dejarlo
  // pasar como texto (lo que antes contaminaba el campo "Año" con series como 45658).
  if (esSerieExcelPlausible(t)) return convertirSerieExcelAFecha(t);
  const iso = new Date(t);
  return isNaN(iso.getTime()) ? null : iso;
}

// Reconstruye la fecha a partir de los componentes del formato oficial vigente:
// Año + Mes (nombre) + Fecha Dia (día del mes). No existe una columna de fecha única.
function construirFechaDesdeComponentes(row: Record<string, string>): Date | null {
  const anioTxt = clean(findColumn(row, COLUMN_MAP.anioComponente));
  const diaTxt = clean(findColumn(row, COLUMN_MAP.diaMesComponente));
  const mesTxt = clean(findColumn(row, COLUMN_MAP.mesComponente)) || clean(findColumn(row, COLUMN_MAP.mesResumidoComponente));

  const anio = parseInt(anioTxt, 10);
  const dia = parseInt(diaTxt, 10);
  const mesNum = mesTxt ? mesANumero(mesTxt) : null;

  if (!anio || !dia || !mesNum) return null;
  const d = new Date(anio, mesNum - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

function parseHora(txt: string): number | null {
  const t = clean(txt);
  if (!t) return null;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 0 && n <= 23 ? n : null;
  }
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (m) return Number(m[1]);
  return null;
}

function parseNumero(txt: string): number {
  const t = clean(txt).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

function franjaHoraria(hora: number | null): string {
  if (hora === null) return 'NO REPORTADO';
  if (hora >= 0 && hora <= 5) return 'Madrugada (00:00-05:59)';
  if (hora >= 6 && hora <= 11) return 'Mañana (06:00-11:59)';
  if (hora >= 12 && hora <= 17) return 'Tarde (12:00-17:59)';
  return 'Noche (18:00-23:59)';
}

// Turno de vigilancia según el ciclo real de 3 turnos de 8 horas usado por la
// unidad (columna "CICLOS TURNO 3D" de la matriz DB2): verificado
// directamente contra los datos reales (no es una suposición) — cada turno
// dura exactamente 8 horas: 22:00–05:59, 06:00–13:59 y 14:00–21:59.
function turnoVigilancia(hora: number | null): string {
  if (hora === null) return 'NO REPORTADO';
  if (hora >= 22 || hora <= 5) return '1er Turno (22:00-05:59)';
  if (hora >= 6 && hora <= 13) return '2do Turno (06:00-13:59)';
  return '3er Turno (14:00-21:59)';
}

function normalizarParaComparar(s: string): string {
  return quitarAcentos(s.trim().toUpperCase()).replace(/[\s\-_]/g, '');
}

// Si el valor de "cuadrante" coincide con el identificador de una Estación
// real del archivo, no es un cuadrante válido: es un valor de respaldo mal
// ubicado. Se marca como NO REPORTADO en lugar de contaminar el Top 10.
// Normaliza la denominación "Patrulla" -> "Z. Atención" a nivel de texto,
// sin importar de dónde venga el valor — así queda corregido tanto si el
// archivo se generó recién (ya pasó por db2Transform.ts, que ya usa el
// nombre nuevo) como si es un archivo YA GUARDADO en el backend desde antes
// de este cambio de terminología, que todavía trae "Patrulla" grabado como
// texto. Sin esto, un archivo ya guardado en el backend seguiría mostrando
// la denominación vieja para siempre, sin importar cuántas veces se
// corrigiera el código de transformación.
function normalizarDenominacionZonaAtencion(valor: string): string {
  return valor.replace(/^Patrulla\s+/i, 'Z. Atención ');
}

function sanearCuadrante(valorCuadrante: string, estacionesConocidas: Set<string>): string {
  if (valorCuadrante === 'NO REPORTADO') return valorCuadrante;
  const normalizado = normalizarDenominacionZonaAtencion(valorCuadrante);
  return estacionesConocidas.has(normalizarParaComparar(normalizado)) ? 'NO REPORTADO' : normalizado;
}

export interface ParseResult {
  registros: CrimeRecord[];
  columnasDetectadas: string[];
  columnasFaltantes: string[];
  totalFilasCrudas: number;
  // Presentes únicamente cuando el archivo cargado era una descarga DB2 cruda
  // (153 columnas) que tuvo que pasar por data/db2Transform.ts antes de
  // llegar aquí. Permiten mostrarle al usuario un resumen de la conversión.
  formatoDetectado?: 'db2' | 'normalizado';
  filasConErroresDB2?: { indice: number; motivo: string }[];
  valoresNuevosDB2?: string[];
  // Fecha de corte oficial ("FECHA_MAX_PARAMETRO") extraída del archivo DB2,
  // cuando está presente — ver db2Transform.ts para el detalle completo.
  fechaMaxParametro?: Date | null;
}

// Un archivo es válido si cumple con el formato histórico completo O con el
// formato oficial vigente completo. Si no cumple ninguno, se reporta el que
// tenga menos columnas faltantes (normalmente el vigente).
export function detectarColumnasFaltantes(headersOriginales: string[]): string[] {
  const headers = headersOriginales.map((h) => h.trim());
  const faltanLegacy = COLUMNAS_REQUERIDAS_LEGACY.filter((c) => !headers.includes(c));
  const faltanNuevo = COLUMNAS_REQUERIDAS_NUEVO.filter((c) => !headers.includes(c));
  if (faltanLegacy.length === 0 || faltanNuevo.length === 0) return [];
  return faltanNuevo.length <= faltanLegacy.length ? faltanNuevo : faltanLegacy;
}

export function parseCsvFile(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: '', // autodetección; el origen normalmente usa ';'
      encoding: 'utf-8',
      complete: (result) => {
        try {
          resolve(procesarFilas(result.data, result.meta.fields || []));
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
}

export function parseCsvText(text: string): ParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: '',
  });
  return procesarFilas(result.data, result.meta.fields || []);
}

export function procesarFilas(rowsCrudas: Record<string, string>[], fieldsCrudos: string[]): ParseResult {
  const fields = fieldsCrudos.map((f) => f.trim());
  const columnasFaltantes = detectarColumnasFaltantes(fieldsCrudos);

  // Detección de un problema real de calidad de datos: en algunos registros el
  // campo "Cuadrante" no trae un cuadrante específico, sino que repite el
  // identificador de la Estación (ej. "E-Norte") como valor de respaldo. Esto
  // provoca que una estación aparezca incorrectamente en el Top 10 de
  // cuadrantes. Se detecta de forma genérica (a partir de los valores de
  // Estación realmente presentes en el archivo, sin nombres codificados) para
  // que funcione con cualquier archivo, no solo con el actual.
  const filasNormalizadas = rowsCrudas.map(normalizarFila);
  const estacionesConocidas = new Set(
    filasNormalizadas
      .map((row) => normalizarParaComparar(findColumn(row, COLUMN_MAP.estacion)))
      .filter(Boolean),
  );

  const registros: CrimeRecord[] = filasNormalizadas.map((row, idx) => {
    const fechaTextoOriginal = findColumn(row, COLUMN_MAP.fecha);
    let fecha = parseFecha(fechaTextoOriginal);
    let fechaTexto = fechaTextoOriginal;
    if (!fecha) {
      const construida = construirFechaDesdeComponentes(row);
      if (construida) {
        fecha = construida;
        fechaTexto = `${String(construida.getDate()).padStart(2, '0')}/${String(construida.getMonth() + 1).padStart(2, '0')}/${construida.getFullYear()}`;
      }
    }

    const horaTexto = findColumn(row, COLUMN_MAP.hora);
    const hora = parseHora(horaTexto);
    // Si no hay columna de cantidad explícita, cada fila representa 1 caso.
    const cantidad = parseNumero(findColumn(row, COLUMN_MAP.cantidad)) || 1;

    const anio = fecha ? fecha.getFullYear() : null;
    const mes = fecha ? fecha.getMonth() + 1 : null;
    const dia = fecha ? fecha.getDate() : null;
    const diaSemanaIndex = fecha ? (fecha.getDay() + 6) % 7 : null; // lunes=0
    const diaSemana = diaSemanaIndex !== null ? DIAS_SEMANA[diaSemanaIndex] : normalizeCategoria(findColumn(row, COLUMN_MAP.diaSemana));
    const anioMes = fecha ? `${anio}-${String(mes).padStart(2, '0')}` : 'SIN FECHA';
    const nombreMes = mes ? MESES[mes - 1] : 'SIN FECHA';

    const edadTxt = clean(findColumn(row, COLUMN_MAP.edad));
    const edad = edadTxt ? parseNumero(edadTxt) : null;

    const rec: CrimeRecord = {
      __id: '',
      fecha,
      fechaTexto,
      anio,
      mes,
      nombreMes,
      anioMes,
      semana: (() => {
        const s = findColumn(row, COLUMN_MAP.semana);
        const n = parseNumero(s);
        return s ? n : null;
      })(),
      dia,
      diaSemana,
      diaSemanaIndex,
      hora,
      franjaHoraria: franjaHoraria(hora),
      turno: turnoVigilancia(hora),

      cantidad,

      delito: normalizeCategoria(findColumn(row, COLUMN_MAP.delito)),
      armas: normalizeCategoria(findColumn(row, COLUMN_MAP.armas)),
      modalidad: normalizeCategoria(findColumn(row, COLUMN_MAP.modalidad)),
      causaLesion: normalizeCategoria(findColumn(row, COLUMN_MAP.causaLesion)),

      estacion: normalizeCategoria(findColumn(row, COLUMN_MAP.estacion)),
      cai: normalizeCategoria(findColumn(row, COLUMN_MAP.cai)),
      cuadrante: sanearCuadrante(normalizeCategoria(findColumn(row, COLUMN_MAP.cuadrante)), estacionesConocidas),
      barrioHecho: normalizeCategoria(findColumn(row, COLUMN_MAP.barrioHecho)),
      zona: normalizeCategoria(findColumn(row, COLUMN_MAP.zona)).toUpperCase() || 'NO REPORTADO',
      claseSitio: normalizeCategoria(findColumn(row, COLUMN_MAP.claseSitio)),

      genero: normalizeCategoria(findColumn(row, COLUMN_MAP.genero)),
      grupoEdad: normalizeCategoria(findColumn(row, COLUMN_MAP.grupoEdad)).replace(/\s+/g, ' ').trim(),
      edad,

      raw: row,
    };

    rec.__id = buildRecordId(rec, idx);
    return rec;
  });

  // "FECHA_MAX_PARAMETRO" viaja repetida en cada fila (ver db2Transform.ts) —
  // basta con leerla de la primera fila que la traiga. Si el archivo no la
  // trae (formato antiguo, o Matriz Base cargada directamente sin pasar por
  // DB2), queda en null y el resto del dashboard recurre a su propio cálculo.
  let fechaMaxParametro: Date | null = null;
  for (const row of rowsCrudas) {
    const txt = row['FECHA_MAX_PARAMETRO'];
    if (txt) {
      const m = txt.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) {
        const [, d, mo, y] = m;
        const f = new Date(Number(y), Number(mo) - 1, Number(d));
        if (!isNaN(f.getTime())) fechaMaxParametro = f;
      }
      break;
    }
  }

  return {
    registros,
    columnasDetectadas: fields,
    columnasFaltantes,
    totalFilasCrudas: rowsCrudas.length,
    fechaMaxParametro,
  };
}

// Genera un identificador único "de negocio" para poder deduplicar cuando se agregan
// nuevos archivos. Combina los campos que en conjunto identifican un hecho.
export function buildRecordId(rec: CrimeRecord, fallbackIndex: number): string {
  const parts = [
    rec.fechaTexto,
    rec.hora ?? '',
    rec.delito,
    rec.estacion,
    rec.cuadrante,
    rec.cantidad,
    rec.barrioHecho,
    rec.genero,
  ];
  const base = parts.join('|').toUpperCase();
  if (base.replace(/\|/g, '').trim().length === 0) {
    return `SIN-CLAVE-${fallbackIndex}-${Math.random().toString(36).slice(2)}`;
  }
  return hashString(base);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `R${Math.abs(hash)}-${str.length}`;
}
