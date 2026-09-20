// Convierte un número de serie de fecha de Excel (días desde el 30/12/1899)
// a un objeto Date real. Sirve de salvaguarda: si por cualquier motivo un
// archivo llega con fechas sin convertir (ej. exportaciones que no conservan
// el formato de celda), esto evita que ese número crudo termine
// contaminando el campo "Año" u otros filtros del dashboard.
const EPOCA_EXCEL_MS = Date.UTC(1899, 11, 30);
const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Rango razonable de series de Excel para fechas de delitos (aprox. años 2000–2099).
const SERIE_MINIMA = 36526; // 01/01/2000
const SERIE_MAXIMA = 73050; // ~01/01/2100

export function esSerieExcelPlausible(valor: string): boolean {
  if (!/^\d{4,6}$/.test(valor.trim())) return false;
  const n = Number(valor);
  return n >= SERIE_MINIMA && n <= SERIE_MAXIMA;
}

export function convertirSerieExcelAFecha(valor: string): Date | null {
  const n = Number(valor.trim());
  if (isNaN(n)) return null;
  // OJO: no construir el Date directo desde el timestamp UTC crudo
  // (EPOCA_EXCEL_MS + n * UN_DIA_MS) — eso da SIEMPRE medianoche UTC, y
  // .getFullYear()/.getMonth()/.getDate() (que se usan en TODO el
  // dashboard) leen la hora LOCAL del navegador, no la UTC. En cualquier
  // zona horaria detrás de UTC (ej. Colombia, UTC-5), medianoche UTC del
  // 1 de enero se lee como 31 de diciembre a las 7pm — el registro entero
  // se corría un día atrás, y para fechas que caen justo el día 1 de un
  // mes o de un año, eso significa caer en el mes o el año ANTERIOR (bug
  // real, confirmado: 2 homicidios del 1/01/2025 se contaban como de
  // 2024). Se corrige extrayendo el año/mes/día en UTC (que es como debe
  // leerse un número de serie de Excel, sin hora asociada) y reconstruyendo
  // la fecha con el constructor LOCAL — así el calendario que ve el
  // usuario es siempre el mismo, sin importar en qué zona horaria esté su
  // navegador.
  const utc = new Date(EPOCA_EXCEL_MS + n * UN_DIA_MS);
  if (isNaN(utc.getTime())) return null;
  const fecha = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  return isNaN(fecha.getTime()) ? null : fecha;
}
