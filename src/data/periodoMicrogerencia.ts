// Etiqueta «inteligente» del periodo de la Microgerencia, según lo que se
// filtró (en el panel principal o en el asistente):
//   · nada            → «Ene – Nov 2026» (año a la fecha de corte)
//   · año cerrado     → «Ene – Dic 2025»
//   · un mes          → «Diciembre 2025»
//   · meses seguidos  → «Jun – Jul 2026»
//   · meses sueltos   → «Jun – Jul y Dic 2026»
//   · fechas          → «01 mar – 15 jun 2026»
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Meses elegidos (1–12), ordenados y sin repetir. Vacío = sin filtro de mes. */
export function mesesElegidos(meses: readonly (string | number)[] | null | undefined): number[] {
  return Array.from(new Set((meses ?? []).map(Number).filter((n) => n >= 1 && n <= 12))).sort((a, b) => a - b);
}

/** «Jun – Jul y Dic» a partir de [6, 7, 12]. */
export function textoMeses(meses: number[], largo = false): string {
  if (meses.length === 1) return (largo ? MESES_LARGOS : MESES)[meses[0] - 1];
  const tramos: string[] = [];
  let ini = meses[0], prev = meses[0];
  for (const m of [...meses.slice(1), Infinity]) {
    if (m === prev + 1) { prev = m; continue; }
    tramos.push(ini === prev ? MESES[ini - 1] : prev === ini + 1 ? `${MESES[ini - 1]} – ${MESES[prev - 1]}` : `${MESES[ini - 1]} – ${MESES[prev - 1]}`);
    ini = m; prev = m;
  }
  return tramos.length === 1 ? tramos[0] : `${tramos.slice(0, -1).join(', ')} y ${tramos[tramos.length - 1]}`;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

export function etiquetaPeriodo(inicio: Date, fin: Date, meses: number[], fechasPersonalizadas: boolean): string {
  const anio = fin.getFullYear();
  if (fechasPersonalizadas) {
    const mismoAnio = inicio.getFullYear() === anio;
    return `${dosDigitos(inicio.getDate())} ${MESES[inicio.getMonth()].toLowerCase()}${mismoAnio ? '' : ` ${inicio.getFullYear()}`} – ${dosDigitos(fin.getDate())} ${MESES[fin.getMonth()].toLowerCase()} ${anio}`;
  }
  if (meses.length > 0) return `${textoMeses(meses, meses.length === 1)} ${anio}`;
  return `${MESES[inicio.getMonth()]} – ${MESES[fin.getMonth()]} ${anio}`;
}
