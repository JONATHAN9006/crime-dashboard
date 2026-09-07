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
  const fecha = new Date(EPOCA_EXCEL_MS + n * UN_DIA_MS);
  return isNaN(fecha.getTime()) ? null : fecha;
}
