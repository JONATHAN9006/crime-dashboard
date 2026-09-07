import {
  MAPA_DELITO, MAPA_ESTACION, MAPA_CAI, MAPA_CUADRANTE, MAPA_GENERO, MAPA_ZONA,
  MAPA_CLASE_SITIO, MAPA_ARMAS, MAPA_MODALIDAD, MAPA_CAUSA_LESION, MAPA_BARRIO,
} from './db2Mapeos';
import { esSerieExcelPlausible, convertirSerieExcelAFecha } from './excelSerial';

// Columnas mínimas que debe traer una descarga DB2 para poder transformarla.
export const COLUMNAS_REQUERIDAS_DB2 = ['FECHA_HECHO', 'DELITOS', 'CANTIDAD'];

const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// El campo "Grupo Edad Ley Final" de Matriz_Base.xlsx tiene un problema de
// calidad de datos confirmado: para las 18.591 filas analizadas solo contiene
// 2 valores posibles (Infancia/Adolescencia) sin importar la edad real,
// mientras que DB2 sí trae las 5 categorías reales con una distribución
// coherente (mayoría Jóvenes/Adultos). Por eso este campo se toma siempre de
// DB2 (normalizado de formato), nunca de la tabla de Matriz_Base.
const MAPA_GRUPO_EDAD: Record<string, string> = {
  'INFANCIA': 'Infancia (0 a 11 años)',
  'ADOLESCENCIA': 'Adolescencia (12 a 17 años)',
  'JOVENES': 'Jóvenes (18 a 35 años)',
  'ADULTOS': 'Adultos (35 a 59 años)',
  'ADULTOS MAYORES': 'Adultos Mayores (>60 años)',
};

export function normalizarClave(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes/diacríticos: "ESTACIÓN" y "ESTACION" deben coincidir
    .normalize('NFC')
    .toUpperCase();
}

// Los diccionarios de db2Mapeos.ts se construyeron a partir de un archivo real
// específico; si una descarga posterior trae los mismos valores pero con
// tildes o espacios distintos, una comparación exacta fallaría en silencio y
// generaría categorías "duplicadas" (ej. "E-Norte" y "ESTACIÓN NORTE" como si
// fueran cosas distintas). Para evitarlo, cada diccionario se reindexa una
// sola vez con la misma normalización (sin tildes) que se usa al buscar.
function indexarSinTildes(mapa: Record<string, string>): Record<string, string> {
  const indice: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(mapa)) {
    indice[normalizarClave(clave)] = valor;
  }
  return indice;
}

const MAPA_DELITO_IDX = indexarSinTildes(MAPA_DELITO);
const MAPA_ESTACION_IDX = indexarSinTildes(MAPA_ESTACION);
const MAPA_CAI_IDX = indexarSinTildes(MAPA_CAI);
const MAPA_CUADRANTE_IDX = indexarSinTildes(MAPA_CUADRANTE);
const MAPA_GENERO_IDX = indexarSinTildes(MAPA_GENERO);
const MAPA_ZONA_IDX = indexarSinTildes(MAPA_ZONA);
const MAPA_CLASE_SITIO_IDX = indexarSinTildes(MAPA_CLASE_SITIO);
const MAPA_ARMAS_IDX = indexarSinTildes(MAPA_ARMAS);
const MAPA_MODALIDAD_IDX = indexarSinTildes(MAPA_MODALIDAD);
const MAPA_CAUSA_LESION_IDX = indexarSinTildes(MAPA_CAUSA_LESION);
const MAPA_BARRIO_IDX = indexarSinTildes(MAPA_BARRIO);

// Exportados para que otras fuentes de datos (ej. la capa de puntos "Delitos"
// del mapa, que trae los mismos nombres crudos que el DB2) puedan mapear
// exactamente con la misma tabla de correspondencia — una sola fuente de
// verdad, en vez de reconstruir el mapeo por su cuenta.
export {
  MAPA_DELITO_IDX, MAPA_ESTACION_IDX, MAPA_CUADRANTE_IDX, MAPA_BARRIO_IDX,
};

// Reconoce algorítmicamente el patrón de códigos de cuadrante
// (MEPOYMNVCCDxxExxCxxNNNNNN), validado al 100% contra los 46 códigos con
// patrón de los archivos reales. Esto permite que cuadrantes/zonas de
// atención NUEVAS (creadas después de armar la tabla fija) se sigan
// reconociendo con un nombre sensato en vez de quedar como código crudo sin
// identificar.
function mapearCodigoCuadrantePorPatron(codigoOriginal: string): string | null {
  const c = codigoOriginal.trim().toUpperCase();
  let m = c.match(/^MEPOYMNVCCD01E0([12])C\d{2}(\d{6})$/);
  if (m) return `Z. Atención ${parseInt(m[2], 10)} ${m[1] === '1' ? 'Norte' : 'Sur'}`;
  m = c.match(/^MEPOYMNVCCD02E02S01(\d+)$/);
  if (m) return `Z. Atención ${parseInt(m[1], 10)} S-Purace`;
  m = c.match(/^MEPOYMNVCCD02E01(\d+)$/);
  if (m) return `Z. Atención ${parseInt(m[1], 10)} E-Timbio`;
  m = c.match(/^MEPOYMNVCCD02E02(\d+)$/);
  if (m) return `Z. Atención ${parseInt(m[1], 10)} E-Coconuco`;
  m = c.match(/^MEPOYMNVCCD02E03(\d+)$/);
  if (m) return `Z. Atención ${parseInt(m[1], 10)} E-Sotara`;
  return null;
}

export function mapear(valor: unknown, mapaIndexado: Record<string, string>, columnasDesconocidasSet: Set<string>, nombreCampo: string): string {
  const clave = normalizarClave(valor);
  if (!clave) return 'NO REPORTADO';
  const encontrado = mapaIndexado[clave];
  if (encontrado !== undefined) return encontrado;
  // Valor nuevo que no existía cuando se construyó la tabla de correspondencia
  // (ej. una estación, delito o cuadrante que se creó después). Se conserva
  // el valor original en vez de perderlo, y se registra para revisión.
  columnasDesconocidasSet.add(`${nombreCampo}: "${String(valor).trim()}"`);
  return String(valor).trim();
}

// El cuadrante necesita una tercera capa: si no está en la tabla fija,
// intenta reconocer el patrón del código antes de darse por vencido (ver
// mapearCodigoCuadrantePorPatron arriba).
export function mapearCuadrante(valor: unknown, columnasDesconocidasSet: Set<string>): string {
  const clave = normalizarClave(valor);
  if (!clave) return 'NO REPORTADO';
  const porTabla = MAPA_CUADRANTE_IDX[clave];
  if (porTabla !== undefined) return porTabla;
  const porPatron = mapearCodigoCuadrantePorPatron(String(valor));
  if (porPatron) return porPatron;
  // Último recurso: si el cuadrante repite el nombre de una estación o CAI
  // conocidos (dato no diligenciado), usar ese mismo nombre en vez de dejar
  // el código crudo como si fuera un cuadrante real.
  const porEstacion = MAPA_ESTACION_IDX[clave];
  if (porEstacion !== undefined) return porEstacion;
  const porCai = MAPA_CAI_IDX[clave];
  if (porCai !== undefined) return porCai;
  columnasDesconocidasSet.add(`Cuadrante: "${String(valor).trim()}"`);
  return String(valor).trim();
}

function mapearGrupoEdad(valor: unknown): string {
  const clave = normalizarClave(valor).replace(/\(.*\)/, '').trim();
  return MAPA_GRUPO_EDAD[clave] ?? (clave ? String(valor).trim() : 'NO REPORTADO');
}

function parseFechaDB2(txt: string): Date | null {
  const t = String(txt || '').trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    const fecha = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(fecha.getTime()) ? null : fecha;
  }
  // Salvaguarda: número de serie de Excel crudo (ver excelSerial.ts).
  if (esSerieExcelPlausible(t)) return convertirSerieExcelAFecha(t);
  return null;
}

export interface ResultadoTransformacionDB2 {
  filas: Record<string, string>[];
  totalFilasCrudas: number;
  filasConErrores: { indice: number; motivo: string }[];
  valoresNuevosDetectados: string[];
  columnasFaltantes: string[];
  // Fecha de corte OFICIAL del sistema de la unidad (columna
  // "FECHA_MAX_PARAMETRO" de la descarga DB2), cuando el archivo la trae.
  // Es la referencia real de "a la fecha" que usa la Policía para sus propios
  // reportes — normalmente uno o más días antes del último dato bruto, y
  // usarla en vez de "la fecha más reciente que aparezca en los casos" es lo
  // que hace que el comparativo año-anterior-vs-actual coincida EXACTO con
  // los reportes oficiales (verificado: 6.924/7.745 vs. calcular por cuenta
  // propia, que daba 6.944/7.746).
  fechaMaxParametro: Date | null;
}

/**
 * Convierte filas crudas de una descarga DB2 (153 columnas, formato Tableau)
 * a la estructura normalizada equivalente a Matriz_Base.xlsx (21 columnas),
 * para que puedan procesarse exactamente por el mismo pipeline
 * (data/csvParser.ts) que ya usa el dashboard, sin lógica de conteo duplicada.
 *
 * Las tablas de correspondencia (data/db2Mapeos.ts) se derivaron EMPÍRICAMENTE
 * alineando fila por fila un archivo DB2 real contra su Matriz_Base
 * correspondiente (mismo número de filas, mismo orden, verificado en múltiples
 * puntos del archivo) — no fueron inventadas ni asumidas.
 */
export function transformarDatosDB2(filasDB2: Record<string, string>[], headers: string[]): ResultadoTransformacionDB2 {
  const headersLimpios = headers.map((h) => h.trim());
  const columnasFaltantes = COLUMNAS_REQUERIDAS_DB2.filter((c) => !headersLimpios.includes(c));

  // El parámetro oficial es el mismo en todas las filas del archivo — basta
  // con leerlo de la primera. Si el archivo no trae esa columna (ej. una
  // versión más antigua de la descarga), queda en null y el resto del
  // dashboard recurre a su propio cálculo (la fecha más reciente encontrada
  // en los casos), como hacía antes.
  let fechaMaxParametro: Date | null = null;
  if (headersLimpios.includes('FECHA_MAX_PARAMETRO') && filasDB2.length > 0) {
    fechaMaxParametro = parseFechaDB2(filasDB2[0]['FECHA_MAX_PARAMETRO']);
  }

  const filasConErrores: { indice: number; motivo: string }[] = [];
  const valoresNuevosDetectados = new Set<string>();

  if (columnasFaltantes.length > 0) {
    return { filas: [], totalFilasCrudas: filasDB2.length, filasConErrores, valoresNuevosDetectados: [], columnasFaltantes, fechaMaxParametro };
  }

  const filas: Record<string, string>[] = [];

  filasDB2.forEach((fila, idx) => {
    const fechaTxt = fila['FECHA_HECHO'];
    const fecha = parseFechaDB2(fechaTxt);
    const delitoTxt = fila['DELITOS'];

    if (!fecha) {
      filasConErrores.push({ indice: idx, motivo: `Fecha inválida en FECHA_HECHO: "${fechaTxt}"` });
      return;
    }
    if (!delitoTxt || !String(delitoTxt).trim()) {
      filasConErrores.push({ indice: idx, motivo: 'Delito vacío' });
      return;
    }

    const mesNum = fecha.getMonth();
    const diaSemanaNum = fecha.getDay();

    const filaTransformada: Record<string, string> = {
      'Año': String(fecha.getFullYear()),
      'Hora_24': String(fila['HORA_24'] ?? fila['HORA HECHO'] ?? '').trim(),
      'Mes': MESES_NOMBRE[mesNum],
      'Dia': DIAS_NOMBRE[diaSemanaNum],
      'Mes resumido': MESES_CORTO[mesNum],
      'dia resumido': DIAS_CORTO[diaSemanaNum],
      'Fecha Dia': String(fecha.getDate()),
      'Semana2': String(fila['SEMANA'] ?? fila['NoSEMANA'] ?? '').trim(),
      'Delito': mapear(delitoTxt, MAPA_DELITO_IDX, valoresNuevosDetectados, 'Delito'),
      'Estación Final': mapear(fila['ESTACION'], MAPA_ESTACION_IDX, valoresNuevosDetectados, 'Estación'),
      'CAI Final': mapear(fila['CAI'], MAPA_CAI_IDX, valoresNuevosDetectados, 'CAI'),
      'Cuadrante Final': mapearCuadrante(fila['CUADRANTE'], valoresNuevosDetectados),
      'Genero Final': mapear(fila['GENERO'], MAPA_GENERO_IDX, valoresNuevosDetectados, 'Género'),
      'Zona Final': mapear(fila['ZONA'], MAPA_ZONA_IDX, valoresNuevosDetectados, 'Zona'),
      'Clase Sitio Final': mapear(fila['CLASE_SITIO'], MAPA_CLASE_SITIO_IDX, valoresNuevosDetectados, 'Clase de sitio'),
      'Arma Final': mapear(fila['ARMAS'], MAPA_ARMAS_IDX, valoresNuevosDetectados, 'Arma'),
      'Modalidad Final': mapear(fila['MODALIDAD'], MAPA_MODALIDAD_IDX, valoresNuevosDetectados, 'Modalidad'),
      'Causa Lesion Final': mapear(fila['CAUSA LESION'], MAPA_CAUSA_LESION_IDX, valoresNuevosDetectados, 'Causa de lesión'),
      'Barrio Hecho Final': mapear(fila['BARRIOS_HECHO'], MAPA_BARRIO_IDX, valoresNuevosDetectados, 'Barrio'),
      'Grupo Edad Ley Final': mapearGrupoEdad(fila['GRUPO EDAD LEY']),
      // CANTIDAD se conserva explícitamente: el parser normalizado ya sabe
      // leer esta columna si está presente (por defecto asume 1 caso por fila
      // cuando no existe), así que un registro con CANTIDAD=3 sigue contando
      // como 3 casos y no como 1, igual que en el archivo DB2 original.
      'CANTIDAD': String(fila['CANTIDAD'] ?? '1').trim(),
      // Se repite en cada fila (mismo valor) para que sobreviva el viaje de
      // ida y vuelta al servidor central: cuando otro usuario sincroniza
      // desde ahí, el archivo que recibe ya no trae las 153 columnas
      // originales de DB2 (solo las 21 normalizadas) — sin este campo, el
      // parámetro oficial de corte se perdería para todos menos quien subió
      // el archivo directamente.
      'FECHA_MAX_PARAMETRO': fechaMaxParametro
        ? `${String(fechaMaxParametro.getDate()).padStart(2, '0')}/${String(fechaMaxParametro.getMonth() + 1).padStart(2, '0')}/${fechaMaxParametro.getFullYear()}`
        : '',
    };

    filas.push(filaTransformada);
  });

  return {
    filas,
    totalFilasCrudas: filasDB2.length,
    filasConErrores,
    valoresNuevosDetectados: Array.from(valoresNuevosDetectados),
    columnasFaltantes: [],
    fechaMaxParametro,
  };
}
