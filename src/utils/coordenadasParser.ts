// Motor de coordenadas para la capa de "archivo georreferenciado" del mapa
// — SOLO para esa capa temporal, no toca cómo Delitos/IRISP1 leen sus
// propias columnas de latitud/longitud (ver csvParser.ts / db2Transform.ts
// para eso, que quedan intactos).

// ---------------------------------------------------------------------------
// 1) Detección de columnas de Latitud/Longitud por nombre
// ---------------------------------------------------------------------------

const PATRONES_LAT = [/^lat(itud)?$/i, /^latitude$/i, /^y$/i];
const PATRONES_LON = [/^lon(g)?(itud)?$/i, /^longitude$/i, /^lng$/i, /^x$/i];

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Devuelve TODAS las columnas del encabezado que podrían ser latitud/longitud (para ofrecer un selector si hay más de una candidata). */
export function detectarColumnasCandidatas(encabezados: string[], tipo: 'lat' | 'lon'): string[] {
  const patrones = tipo === 'lat' ? PATRONES_LAT : PATRONES_LON;
  return encabezados.filter((h) => {
    const limpio = sinTildes(h.trim()).toLowerCase();
    return patrones.some((p) => p.test(limpio));
  });
}

// ---------------------------------------------------------------------------
// 2) Parseo de un valor de coordenada en CUALQUIERA de los formatos pedidos
// ---------------------------------------------------------------------------

// Grados/minutos/segundos, con o sin espacios, con o sin indicador cardinal:
//   2°27'14.05"     76°35'54.98"W     2° 27' 14.05" N
const PATRON_DMS = /^\s*(-?\d+(?:[.,]\d+)?)\s*[°º]\s*(\d+(?:[.,]\d+)?)?\s*['′]?\s*(\d+(?:[.,]\d+)?)?\s*["″]?\s*([NSEOWnseow])?\s*$/;

export function parsearCoordenada(valorCrudo: unknown): number | null {
  if (valorCrudo == null) return null;
  const texto = String(valorCrudo).trim();
  if (texto === '') return null;

  // Grados/minutos/segundos (con o sin cardinal) — se revisa primero porque
  // el símbolo ° no aparece nunca en un decimal simple.
  if (/[°º'′"″]/.test(texto)) {
    const m = texto.match(PATRON_DMS);
    if (!m) return null;
    const grados = parseFloat(m[1].replace(',', '.'));
    const minutos = m[2] ? parseFloat(m[2].replace(',', '.')) : 0;
    const segundos = m[3] ? parseFloat(m[3].replace(',', '.')) : 0;
    if (Number.isNaN(grados)) return null;
    let decimal = Math.abs(grados) + minutos / 60 + segundos / 3600;
    const cardinal = m[4]?.toUpperCase();
    const negativoPorSigno = grados < 0;
    const negativoPorCardinal = cardinal === 'S' || cardinal === 'W' || cardinal === 'O';
    if (negativoPorSigno || negativoPorCardinal) decimal = -decimal;
    return decimal;
  }

  // Decimal con coma (formato regional: "2,451125" / "-76,598742") — SOLO
  // se trata como coma decimal si no hay más de una coma y no parece un
  // número con separador de miles (ej. "1,234.56" no debería llegar aquí
  // de todas formas, pero por seguridad se descarta si trae un punto Y una
  // coma a la vez, ambiguo).
  let normalizado = texto;
  if (texto.includes(',') && !texto.includes('.')) {
    normalizado = texto.replace(',', '.');
  }

  const valor = parseFloat(normalizado);
  return Number.isNaN(valor) ? null : valor;
}

// ---------------------------------------------------------------------------
// 3) Validación geográfica (Popayán/Cauca) + detección de columnas invertidas
// ---------------------------------------------------------------------------

// Rango amplio para todo el departamento del Cauca (con margen) — no solo
// el casco urbano de Popayán, porque un archivo puede traer casos rurales.
const LAT_MIN = -2;
const LAT_MAX = 5;
const LON_MIN = -79;
const LON_MAX = -74;

export function coordenadaEnRangoValido(lat: number, lon: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX;
}

export interface ResultadoDeteccionInvertida {
  invertidas: boolean;
  motivo: string;
}

/**
 * Revisa una MUESTRA de filas ya parseadas (antes de decidir cuál columna es
 * cuál) para detectar el caso INEQUÍVOCO de columnas invertidas: la columna
 * que se iba a usar como "latitud" cae sistemáticamente en rango de
 * longitud del Cauca (~ -74 a -79) y viceversa. Si no es inequívoco (ambas
 * podrían ser válidas, o ninguna lo es), no se asume nada — se avisa que no
 * se pudo determinar solo, en vez de adivinar.
 */
export function detectarColumnasInvertidas(paresCandidatosLatLon: [number | null, number | null][]): ResultadoDeteccionInvertida {
  const validos = paresCandidatosLatLon.filter((p): p is [number, number] => p[0] != null && p[1] != null);
  if (validos.length === 0) return { invertidas: false, motivo: 'Sin datos suficientes para revisar.' };

  const comoEstaOk = validos.filter(([lat, lon]) => coordenadaEnRangoValido(lat, lon)).length;
  const invertidoOk = validos.filter(([lat, lon]) => coordenadaEnRangoValido(lon, lat)).length;

  // Inequívoco: casi todo funciona invertido, y casi nada funciona tal cual.
  if (invertidoOk / validos.length > 0.9 && comoEstaOk / validos.length < 0.1) {
    return { invertidas: true, motivo: `${invertidoOk} de ${validos.length} registros de la muestra solo tienen sentido geográfico si se intercambian Latitud y Longitud.` };
  }
  return { invertidas: false, motivo: '' };
}

export interface RegistroGeorreferenciado {
  lat: number;
  lon: number;
  valido: boolean;
  fila: Record<string, unknown>; // el resto de las columnas del archivo, intactas
}
