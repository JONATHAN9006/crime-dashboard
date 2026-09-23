import Papa from 'papaparse';
import type { CrimeRecord } from '../types/crime';
import { esSerieExcelPlausible, convertirSerieExcelAFecha } from './excelSerial';
import { MAPA_DELITO, MAPA_ESTACION, MAPA_CAI, MAPA_BARRIO, MAPA_ARMAS, MAPA_MODALIDAD, MAPA_CLASE_SITIO, MAPA_CAUSA_LESION } from './db2Mapeos';
import { mapearCuadrante } from './db2Transform';

// Columnas mínimas para poder procesar un archivo. Se acepta CUALQUIERA de los
// dos formatos: el histórico (FECHA_HECHO/DELITOS/CANTIDAD) o el formato oficial
// vigente (Año/Mes/Fecha Dia/Delito), que es el que se usa de ahora en adelante.
const COLUMNAS_REQUERIDAS_LEGACY = ['FECHA_HECHO', 'DELITOS', 'CANTIDAD'];
const COLUMNAS_REQUERIDAS_NUEVO = ['Año', 'Mes', 'Fecha Dia', 'Delito'];
export const COLUMNAS_REQUERIDAS = COLUMNAS_REQUERIDAS_NUEVO;

// Mapa de campo lógico -> posibles nombres de columna en el CSV (tolerante a variaciones
// entre el formato histórico y el formato oficial vigente "Base_de_Datos_General").
const COLUMN_MAP: Record<string, string[]> = {
  fecha: ['FECHA_HECHO', 'FECHA_HECHO NEW', 'FECHA HECHOS', 'FECHA HECHO', 'FECHA_HECHOS'],
  hora: ['HORA HECHO', 'HORA_24', 'HORA_HECHO', 'HORA24'],
  cantidad: ['CANTIDAD'],
  delito: ['DELITOS', 'Delito', 'DELITO', 'TEMATICA'],
  modalidad: ['MODALIDAD', 'Modalidad Final'],
  armas: ['ARMAS', 'Arma Final', 'ARMA_MEDIOS'],
  causaLesion: ['CAUSA_LESION', 'Causa Lesion Final', 'CAUSA_LESION_MUERTE', 'CAUSA LESION'],
  estacion: ['ESTACION', 'Estación Final'],
  cai: ['CAI', 'CAI Final'],
  cuadrante: ['CUADRANTE', 'Cuadrante Final', 'JURIS_DEPENDENCIAS'],
  barrioHecho: ['BARRIOS_HECHO', 'BARRIO-CIUDAD', 'Barrio Hecho Final', 'BARRIO_HECHO'],
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
  // Coordenadas — opcionales; cuando el archivo las trae (ej. el histórico
  // 2003-2023 con geocodificación agregada), alimentan automáticamente la
  // capa "Delitos" del mapa.
  latitud: ['Latitud', 'LATITUD', 'LAT'],
  longitud: ['Longitud', 'LONGITUD', 'LON'],
  // Identificador único real del sistema de origen (ArcGIS/GIS) — cuando el
  // archivo lo trae, es MUCHO más confiable que armar la identidad
  // combinando texto (ver buildRecordId): dos exportaciones distintas del
  // mismo caso real pueden traer el barrio, la hora o el cuadrante escritos
  // ligeramente distinto, pero el OBJECTID del mismo caso no cambia.
  objectId: ['OBJECTID', 'OBJECTID *', 'OBJECTID*'],
};

// Latitud/Longitud, cuando el archivo las trae, suelen venir como texto con
// coma decimal (formato regional, ej. "2,4316069883" / "-76,600176653").
// Se descarta cualquier valor fuera del rango geográfico de Colombia, para
// no dejar pasar un error de digitación como coordenada válida.
function parseCoordenadaLocal(v: string): number | null {
  if (!v) return null;
  const limpio = String(v).trim().replace(',', '.');
  const n = parseFloat(limpio);
  if (isNaN(n)) return null;
  return n;
}
// Rango específico del área de Popayán (con margen amplio, ~150km a la
// redonda) — antes se validaba contra TODA Colombia, un país enorme; un
// solo dato mal digitado que cayera en, por ejemplo, Bogotá o la Costa
// (dentro de Colombia, pero lejísimos de Popayán) pasaba la validación
// igual, y ese único punto forzaba el mapa a encuadrar medio país al
// abrir — bug real, confirmado con datos reales del histórico.
const LAT_MIN_REGION = 0.9, LAT_MAX_REGION = 4.0;
const LON_MIN_REGION = -78.2, LON_MAX_REGION = -75.0;

function coordenadaValidaColombia(lat: number | null, lon: number | null): boolean {
  if (lat === null || lon === null) return false;
  return lat >= LAT_MIN_REGION && lat <= LAT_MAX_REGION && lon >= LON_MIN_REGION && lon <= LON_MAX_REGION;
}

// Error de digitación real y frecuente en el histórico: la longitud de
// Popayán es negativa (~-76.6, al oeste), pero algunas filas la traen en
// positivo (~76.6) — un simple olvido del signo menos. El resultado, de
// resto, es prácticamente la coordenada correcta (mismo valor absoluto,
// dentro del rango esperado una vez corregido el signo), así que se
// corrige en vez de descartarla.
function corregirSignoLongitud(lat: number | null, lon: number | null): number | null {
  if (lat === null || lon === null || lon <= 0) return lon;
  const lonCorregida = -lon;
  return coordenadaValidaColombia(lat, lonCorregida) ? lonCorregida : lon;
}


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
  // .trim() solo quita espacios al inicio/final — no corrige espacios
  // DOBLES o TRIPLES en medio del texto. La DB2 (exportada desde Tableau)
  // trae varios delitos así ("Hurto        Personas" en vez de "Hurto
  // Personas"), y una comparación exacta contra la tabla de traducción
  // (que sí tiene un solo espacio) nunca coincidía, aunque la categoría
  // ya existiera — se veían como delitos "nuevos" sin parametrizar. Se
  // corrige aquí, de una vez para cualquier campo de texto (no solo
  // delito), colapsando cualquier secuencia de espacios en uno solo.
  const s = String(v).trim().replace(/\s+/g, ' ');
  if (s === '' || /^null$/i.test(s) || s === '-' || s === '#N/A' || /^<nulo>$/i.test(s)) return '';
  return s;
}

function normalizeCategoria(v: string): string {
  const c = clean(v);
  if (!c) return 'NO REPORTADO';
  const upper = c.toUpperCase();
  if (upper === 'NO REPORTADA' || upper === 'NO REPORTADO' || upper === 'SIN INFORMACION') return 'NO REPORTADO';
  return c;
}

// Para un delito que NO tiene traducción a nombre corto en MAPA_DELITO
// (ej. "ACOSO SEXUAL", que llega en mayúsculas de corrido) — se le da
// formato de Título en vez de dejarlo gritando en mayúsculas junto a
// delitos que sí están bien formateados ("H. Personas", "Homicidio").
// Nunca cambia el significado, solo la presentación.
// Deriva el CAI real a partir del número de Zona de Atención (ej. "Z.
// Atención 5 Norte" → "CAI La Paz") cuando el archivo no trae el campo CAI
// directamente — construido a partir de la división oficial de cuadrantes
// por CAI de cada Estación (fuente: directorios de la Policía Metropolitana
// de Popayán, Estación Norte y Estación Sur). Se usa SOLO como respaldo:
// si el archivo ya trae un CAI real, ese se respeta siempre; esto nunca lo
// reemplaza, solo llena el vacío cuando no hay nada.
const RANGOS_CAI_POR_ESTACION: Record<'NORTE' | 'SUR', { hasta: number; cai: string }[]> = {
  NORTE: [
    { hasta: 2, cai: 'CAI Antonio Nariño' },
    { hasta: 8, cai: 'CAI La Paz' },
    { hasta: 12, cai: 'CAI La Estancia' },
    { hasta: 18, cai: 'CAI Benito Juárez' },
  ],
  SUR: [
    { hasta: 3, cai: 'CAI La Floresta' },
    { hasta: 8, cai: 'CAI Alfonso López' },
    { hasta: 15, cai: 'CAI El Mirador' },
    { hasta: 19, cai: 'CAI Parque Informático' },
    { hasta: 21, cai: 'CAI María Occidente' },
    { hasta: 23, cai: 'CAI Lomas de Granada' },
  ],
};

function derivarCaiDesdeZona(zonaTexto: string): string {
  const m = zonaTexto.match(/(\d+)\s*(NORTE|SUR)/i);
  if (!m) return 'NO REPORTADO';
  const numero = Number(m[1]);
  const estacion = m[2].toUpperCase() as 'NORTE' | 'SUR';
  const rango = RANGOS_CAI_POR_ESTACION[estacion]?.find((r) => numero <= r.hasta);
  return rango ? rango.cai : 'NO REPORTADO';
}

// Exportada para que otros parsers (ej. operatividadParser.ts) formateen
// su propio texto libre exactamente igual — un solo lugar con la regla de
// "Primera Mayúscula, resto minúscula", en vez de reglas repetidas o
// inconsistentes entre datasets.
export function formatoTitulo(v: string): string {
  return v.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, sep, letra) => sep + letra.toUpperCase());
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
//
// IMPORTANTE: cuando un archivo mezcla filas de dos orígenes distintos (ej.
// formato histórico con columna "CAI" + formato DB2 ya transformado con
// columna "CAI Final"), el CSV combinado que se sincroniza con el backend
// (ver csvSerializer.ts) puede terminar con AMBAS columnas presentes en
// cada fila — una de ellas vacía, porque esa fila no venía de ese formato.
// Si esta función se quedara con el PRIMER alias que exista (sin importar
// si está vacío), una fila de origen DB2 perdería su valor real de
// "CAI Final" porque la columna "CAI" (vacía, heredada del otro formato)
// aparece primero en la lista de alias. Por eso se prioriza el primer
// candidato con VALOR (no solo que exista la columna); solo si ninguno
// tiene valor se recurre al primero que exista (aunque esté vacío), para
// no cambiar el comportamiento cuando el dato realmente no fue reportado.
function findColumn(row: Record<string, string>, candidates: string[]): string {
  let primeraColumnaExistente: string | undefined;
  for (const c of candidates) {
    if (row[c] !== undefined) {
      if (primeraColumnaExistente === undefined) primeraColumnaExistente = row[c];
      if (String(row[c]).trim() !== '') return row[c];
    }
  }
  const keys = Object.keys(row);
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (found) {
      if (primeraColumnaExistente === undefined) primeraColumnaExistente = row[found];
      if (String(row[found]).trim() !== '') return row[found];
    }
  }
  return primeraColumnaExistente ?? '';
}

// Parsea fechas en formato dd/mm/yyyy (o d/m/yyyy), formato del origen histórico.
// Índice de MAPA_DELITO sin tildes — construido UNA sola vez. El archivo
// histórico 2003-2023 trae algunos delitos con tilde ("EXTORSIÓN", "HURTO
// PIRATERÍA TERRESTRE") que no coincidían con las claves de la tabla (sin
// tilde: "EXTORSION", "HURTO PIRATERIA") — quedaban sin traducir aunque la
// categoría YA existiera. Se corrige de raíz (para estos dos casos y
// cualquier otro con el mismo problema), no solo agregando las 2 claves
// puntuales que se detectaron.
//
// TAMBIÉN se auto-indexa cada valor CANÓNICO contra sí mismo (ej.
// "HOMICIDIO EN AT" -> "Homicidio en AT"). Motivo real: los archivos DB2
// pasan primero por su propia traducción (db2Transform.ts, que sí produce
// "Homicidio en AT" correctamente) y ese resultado ya traducido vuelve a
// pasar por ESTA MISMA función — sin este auto-índice, "HOMICIDIO EN AT"
// (el valor ya traducido, en mayúsculas) no coincidía con ninguna clave
// CRUDA de la tabla, y terminaba re-formateado como "Homicidio En At" en
// vez de conservar "Homicidio en AT". Con el auto-índice, re-procesar un
// valor ya canónico es inofensivo (siempre se devuelve a sí mismo).
function quitarTildes(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function construirIndiceSinTildes(mapa: Record<string, string>): Record<string, string> {
  return Object.fromEntries([
    ...Object.entries(mapa).map(([clave, valor]) => [quitarTildes(clave), valor]),
    ...Object.values(mapa).map((valor) => [quitarTildes(valor.toUpperCase()), valor]),
  ]);
}
const MAPA_DELITO_SIN_TILDES: Record<string, string> = construirIndiceSinTildes(MAPA_DELITO);

// Lo mismo que ya existía SOLO para "delito" — CAI, barrio, armas,
// modalidad, clase de sitio y causa de lesión se estaban guardando tal
// cual venían del archivo (normalmente TODO EN MAYÚSCULAS, ej. "CAI
// COMUNA CUATRO", "BOLIVAR", "CONTUNDENTES"), sin pasar por NINGUNA
// traducción ni formato — aunque las tablas de traducción para todos
// estos campos YA EXISTÍAN en db2Mapeos.ts (se usaban en el formato DB2,
// pero nunca se conectaron aquí, en el formato general/legado). Una
// misma función genérica para los 6 campos: intenta la tabla
// correspondiente (ignorando tildes, e ignorando si el valor ya viene
// canónico); si no hay traducción, da formato de Título en vez de dejarlo
// gritando en mayúsculas.
function canonizarConTabla(bruto: string, mapa: Record<string, string>, indiceSinTildes: Record<string, string>): string {
  if (bruto === 'NO REPORTADO') return bruto;
  const directo = mapa[bruto.toUpperCase()];
  if (directo) return directo;
  const sinTildes = indiceSinTildes[quitarTildes(bruto.toUpperCase())];
  if (sinTildes) return sinTildes;
  return formatoTitulo(bruto);
}
const MAPA_CAI_SIN_TILDES = construirIndiceSinTildes(MAPA_CAI);
const MAPA_BARRIO_SIN_TILDES = construirIndiceSinTildes(MAPA_BARRIO);
const MAPA_ARMAS_SIN_TILDES = construirIndiceSinTildes(MAPA_ARMAS);
const MAPA_MODALIDAD_SIN_TILDES = construirIndiceSinTildes(MAPA_MODALIDAD);
const MAPA_CLASE_SITIO_SIN_TILDES = construirIndiceSinTildes(MAPA_CLASE_SITIO);
const MAPA_CAUSA_LESION_SIN_TILDES = construirIndiceSinTildes(MAPA_CAUSA_LESION);

// Abreviación de nombres de barrio LARGOS, a pedido explícito — se aplica
// DESPUÉS de MAPA_BARRIO (que solo pone Mayúscula Inicial, ej. "Bello
// Horizonte"), así que la clave aquí ya está en esa forma. Son
// específicamente los que se pidieron por nombre; si aparece otro barrio
// largo que también deba abreviarse, se agrega aquí — nunca se inventa
// una abreviación para uno que no se haya pedido.
const ABREVIACION_BARRIO: Record<string, string> = {
  'Bello Horizonte': 'B. Horizonte',
  'Lomas De Granada': 'L. de Granada',
  'Jose Maria Obando': 'J. M. Obando',
};

function parseFecha(txt: string): Date | null {
  const t = clean(txt);
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }
  // Fecha en formato ISO "solo fecha" (YYYY-MM-DD, sin hora) — algunos
  // archivos (ej. exportaciones ArcGIS más nuevas) traen la fecha así en
  // vez de DD/MM/AAAA. OJO: "new Date('2026-01-01')" (el respaldo genérico
  // más abajo) la interpreta como MEDIANOCHE UTC según el estándar de
  // JavaScript — en Colombia (UTC-5) eso se lee como 31/12/2025 a las
  // 7pm, un día atrás. Para una fecha SIN hora asociada no hay "UTC" que
  // valga: se arma directo con el constructor local, igual que arriba.
  // Bug real, confirmado: un homicidio del 1/01/2026 se contaba como de
  // 2025.
  const mIso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/);
  if (mIso) {
    const [, y, mo, d] = mIso;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(date.getTime()) ? null : date;
  }
  // Salvaguarda: si llega un número de serie de Excel crudo (ej. archivos donde
  // la celda de fecha no conservó su formato), se convierte en vez de dejarlo
  // pasar como texto (lo que antes contaminaba el campo "Año" con series como 45658).
  if (esSerieExcelPlausible(t)) return convertirSerieExcelAFecha(t);
  // Otra forma en la que Excel puede "arruinar" una fecha: si la celda
  // originalmente traía un timestamp de milisegundos (época Unix, ej. de
  // un sistema que exporta así) y Excel la mostró con formato numérico
  // genérico, queda como notación científica ("1.73949E+12") en vez de
  // una fecha. Sin esto, TODAS las fechas de ese archivo quedaban nulas
  // (bug real, confirmado con COR_DELITOS_2025.xlsx: 7.023 registros, los
  // 7.023 con fecha nula, por esto exacto).
  if (/^\d+(\.\d+)?E\+\d+$/i.test(t)) {
    const ms = parseFloat(t);
    if (isFinite(ms)) {
      const fecha = new Date(ms);
      const anio = fecha.getFullYear();
      if (!isNaN(fecha.getTime()) && anio >= 2000 && anio <= 2035) return fecha;
    }
  }
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
// tenga menos columnas faltantes (normalmente el vigente). La comprobación
// usa los MISMOS alias que ya usa la lectura real de datos (COLUMN_MAP) en
// vez de un solo nombre fijo — así una variante como "FECHA HECHOS" (con
// espacio y en plural) valida igual que "FECHA_HECHO".
function tieneColumna(headers: string[], alias: string[]): boolean {
  const headersNorm = headers.map((h) => h.toUpperCase().replace(/[_\s]+/g, ' ').trim());
  return alias.some((a) => headersNorm.includes(a.toUpperCase().replace(/[_\s]+/g, ' ').trim()));
}

export function detectarColumnasFaltantes(headersOriginales: string[]): string[] {
  const headers = headersOriginales.map((h) => h.trim());
  const faltanLegacy = [
    !tieneColumna(headers, COLUMN_MAP.fecha) && 'FECHA_HECHO',
    !tieneColumna(headers, COLUMN_MAP.delito) && 'DELITOS',
    !tieneColumna(headers, COLUMN_MAP.cantidad) && 'CANTIDAD',
  ].filter(Boolean) as string[];
  const faltanNuevo = COLUMNAS_REQUERIDAS_NUEVO.filter((c) => !tieneColumna(headers, [c]));
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

      delito: (() => {
        const bruto = normalizeCategoria(findColumn(row, COLUMN_MAP.delito));
        // Algunas fuentes (ej. TEMATICA de una matriz histórica) traen el
        // nombre largo del delito ("HURTO PERSONAS") en vez de la forma
        // corta que ya usa el resto del dashboard ("H. Personas") — se
        // traduce con la misma tabla del formato DB2 para que no queden
        // como si fueran delitos distintos. La comparación ignora tildes
        // (ver MAPA_DELITO_SIN_TILDES arriba). Si no está en la tabla, se
        // le da formato de Título (no se deja gritando en mayúsculas).
        const claveBusqueda = quitarTildes(bruto.toUpperCase());
        const canonico = MAPA_DELITO[bruto.toUpperCase()] ?? MAPA_DELITO_SIN_TILDES[claveBusqueda];
        if (canonico) return canonico;
        return bruto === 'NO REPORTADO' ? bruto : formatoTitulo(bruto);
      })(),
      armas: canonizarConTabla(normalizeCategoria(findColumn(row, COLUMN_MAP.armas)), MAPA_ARMAS, MAPA_ARMAS_SIN_TILDES),
      modalidad: canonizarConTabla(normalizeCategoria(findColumn(row, COLUMN_MAP.modalidad)), MAPA_MODALIDAD, MAPA_MODALIDAD_SIN_TILDES),
      causaLesion: canonizarConTabla(normalizeCategoria(findColumn(row, COLUMN_MAP.causaLesion)), MAPA_CAUSA_LESION, MAPA_CAUSA_LESION_SIN_TILDES),

      estacion: (() => {
        const bruto = normalizeCategoria(findColumn(row, COLUMN_MAP.estacion));
        return MAPA_ESTACION[bruto.toUpperCase()] ?? bruto;
      })(),
      cai: (() => {
        const directo = canonizarConTabla(normalizeCategoria(findColumn(row, COLUMN_MAP.cai)), MAPA_CAI, MAPA_CAI_SIN_TILDES);
        if (directo && directo !== 'NO REPORTADO') return directo;
        // Respaldo: el archivo no trae CAI directamente (columna vacía o
        // ausente) — se deriva del número de Zona de Atención, que sí
        // suele venir poblado (ver derivarCaiDesdeZona más arriba). Usa el
        // valor de Zona de Atención tal como viene en la columna cruda,
        // antes de traducir — el traductor de cuadrante ya normaliza el
        // formato "Z. Atención N Norte/Sur" que esta función espera.
        const zonaCruda = normalizeCategoria(findColumn(row, COLUMN_MAP.cuadrante));
        const zonaTraducida = mapearCuadrante(zonaCruda, new Set());
        return derivarCaiDesdeZona(zonaTraducida !== 'NO REPORTADO' ? zonaTraducida : zonaCruda);
      })(),
      cuadrante: sanearCuadrante((() => {
        const bruto = normalizeCategoria(findColumn(row, COLUMN_MAP.cuadrante));
        const traducido = mapearCuadrante(bruto, new Set());
        return (traducido && traducido !== 'NO REPORTADO') ? traducido : bruto;
      })(), estacionesConocidas),
      barrioHecho: (() => {
        const canonico = canonizarConTabla(normalizeCategoria(findColumn(row, COLUMN_MAP.barrioHecho)), MAPA_BARRIO, MAPA_BARRIO_SIN_TILDES);
        return ABREVIACION_BARRIO[canonico] ?? canonico;
      })(),
      zona: normalizeCategoria(findColumn(row, COLUMN_MAP.zona)).toUpperCase() || 'NO REPORTADO',
      claseSitio: canonizarConTabla(normalizeCategoria(findColumn(row, COLUMN_MAP.claseSitio)), MAPA_CLASE_SITIO, MAPA_CLASE_SITIO_SIN_TILDES),

      genero: normalizeCategoria(findColumn(row, COLUMN_MAP.genero)),
      grupoEdad: normalizeCategoria(findColumn(row, COLUMN_MAP.grupoEdad)).replace(/\s+/g, ' ').trim(),
      edad,

      lat: (() => {
        const lat = parseCoordenadaLocal(findColumn(row, COLUMN_MAP.latitud));
        const lonCruda = parseCoordenadaLocal(findColumn(row, COLUMN_MAP.longitud));
        const lon = corregirSignoLongitud(lat, lonCruda);
        return coordenadaValidaColombia(lat, lon) ? lat : null;
      })(),
      lon: (() => {
        const lat = parseCoordenadaLocal(findColumn(row, COLUMN_MAP.latitud));
        const lonCruda = parseCoordenadaLocal(findColumn(row, COLUMN_MAP.longitud));
        const lon = corregirSignoLongitud(lat, lonCruda);
        return coordenadaValidaColombia(lat, lon) ? lon : null;
      })(),

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
// El identificador de cada registro se construye a partir de valores
// CRUDOS (los que trae el archivo, antes de traducir delito/cuadrante/
// estación a su nombre corto) — nunca de los ya traducidos. Motivo real:
// antes usaba los campos YA traducidos (rec.delito, rec.cuadrante), y cada
// vez que se mejoraba una tabla de traducción (ej. agregar "JURIS_
// DEPENDENCIAS" como columna de cuadrante, o una nueva entrada en
// MAPA_DELITO), el identificador de TODOS los registros afectados
// cambiaba de un día para otro. Resultado: volver a subir el MISMO
// archivo para que la mejora tomara efecto ya no se reconocía como "los
// mismos registros de antes" — se duplicaban enteros. Usando el texto
// crudo (que nunca cambia, sin importar cuánto mejoren las tablas de
// traducción), resubir el mismo archivo siempre se reconoce como
// duplicado, para siempre.
export function buildRecordId(rec: CrimeRecord, fallbackIndex: number): string {
  // Cuando el archivo trae OBJECTID (formato ArcGIS/COR_DELITOS), se usa
  // como base de la identidad — es un ID real asignado por el sistema de
  // origen, no un número de fila. A diferencia del hash por texto (abajo),
  // sobrevive a que una re-exportación del MISMO caso real escriba el
  // barrio, la hora o el cuadrante con una letra distinta — que es
  // justamente lo que ha estado causando duplicados reales al volver a
  // subir una versión más nueva del mismo periodo (confirmado: 0% de
  // coincidencia entre dos exportaciones de la práctica el mismo 2026).
  //
  // CORRECCIÓN IMPORTANTE: el OBJECTID solo es único DENTRO de una misma
  // exportación — normalmente reinicia desde 1 en cada archivo/año nuevo.
  // Usarlo SOLO (como se hacía antes) hacía que un caso del año pasado y
  // uno de este año, sin ninguna relación entre sí, coincidieran en
  // número por pura casualidad y uno de los dos se descartara como si
  // fuera "el mismo hecho" — así se perdían casos reales sin ningún aviso
  // (confirmado: exactamente este patrón en los datos de Homicidio 2025,
  // el total quedaba por debajo del real). Se agrega la fecha cruda a la
  // clave para separar esos dos casos SIN romper la garantía original:
  // volver a subir el MISMO archivo sigue trayendo el mismo OBJECTID *y*
  // la misma fecha para cada registro, así que se sigue reconociendo como
  // duplicado igual que antes.
  const objectId = findColumn(rec.raw, COLUMN_MAP.objectId);
  if (objectId && objectId.trim() !== '') {
    return hashString(`OBJECTID:${objectId.trim().toUpperCase()}|FECHA:${rec.fechaTexto}`);
  }

  const parts = [
    rec.fechaTexto,
    rec.hora ?? '',
    findColumn(rec.raw, COLUMN_MAP.delito),
    findColumn(rec.raw, COLUMN_MAP.estacion),
    findColumn(rec.raw, COLUMN_MAP.cuadrante),
    rec.cantidad,
    findColumn(rec.raw, COLUMN_MAP.barrioHecho),
    findColumn(rec.raw, COLUMN_MAP.genero),
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

// Re-normaliza CAI, Barrio, Armas, Modalidad, Clase de Sitio y Causa de
// Lesión de CUALQUIER registro ya guardado — no solo al parsear un
// archivo nuevo. Estos 6 campos nunca pasaron por su tabla de traducción
// en el formato general (bug real: las tablas ya existían para el
// formato DB2, pero nunca se conectaron aquí) — sin esto, lo que ya
// estaba guardado se quedaría para siempre como "CAI COMUNA CUATRO" en
// vez de "CAI 4", aunque el parser ya esté corregido para lo nuevo. Es
// idempotente: un valor que ya viene canónico ("CAI 4", "B. Horizonte")
// no coincide con ninguna clave cruda de las tablas y se deja tal cual
// (salvo la abreviación de barrio, que si aplica de nuevo sobre sí misma
// tampoco cambia nada).
export function renormalizarCamposParametrizados(records: CrimeRecord[]): CrimeRecord[] {
  return records.map((r) => {
    const cai = canonizarConTabla(r.cai, MAPA_CAI, MAPA_CAI_SIN_TILDES);
    const barrioCanonico = canonizarConTabla(r.barrioHecho, MAPA_BARRIO, MAPA_BARRIO_SIN_TILDES);
    const barrioHecho = ABREVIACION_BARRIO[barrioCanonico] ?? barrioCanonico;
    const armas = canonizarConTabla(r.armas, MAPA_ARMAS, MAPA_ARMAS_SIN_TILDES);
    const modalidad = canonizarConTabla(r.modalidad, MAPA_MODALIDAD, MAPA_MODALIDAD_SIN_TILDES);
    const claseSitio = canonizarConTabla(r.claseSitio, MAPA_CLASE_SITIO, MAPA_CLASE_SITIO_SIN_TILDES);
    const causaLesion = canonizarConTabla(r.causaLesion, MAPA_CAUSA_LESION, MAPA_CAUSA_LESION_SIN_TILDES);
    if (cai === r.cai && barrioHecho === r.barrioHecho && armas === r.armas && modalidad === r.modalidad && claseSitio === r.claseSitio && causaLesion === r.causaLesion) {
      return r;
    }
    return { ...r, cai, barrioHecho, armas, modalidad, claseSitio, causaLesion };
  });
}
