// Textos de semana para «Últimas 4 Semanas» / «Evolución por período».
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «Del 7 al 13 de octubre de 2026», «Del 29 de septiembre al 5 de octubre de 2026», «Del 29 de diciembre de 2025 al 4 de enero de 2026». */
export function rangoLargo(inicio: Date, fin: Date): string {
  const mismoAnio = inicio.getFullYear() === fin.getFullYear();
  const mismoMes = mismoAnio && inicio.getMonth() === fin.getMonth();
  if (mismoMes) return `Del ${inicio.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]} de ${fin.getFullYear()}`;
  if (mismoAnio) return `Del ${inicio.getDate()} de ${MESES[inicio.getMonth()]} al ${fin.getDate()} de ${MESES[fin.getMonth()]} de ${fin.getFullYear()}`;
  return `Del ${inicio.getDate()} de ${MESES[inicio.getMonth()]} de ${inicio.getFullYear()} al ${fin.getDate()} de ${MESES[fin.getMonth()]} de ${fin.getFullYear()}`;
}
