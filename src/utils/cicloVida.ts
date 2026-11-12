// Grupo de edad por CICLO DE VIDA, calculado desde la EDAD de la matriz
// (la matriz trae la edad, no el grupo). Rangos institucionales:
//   Infancia 0–11 · Adolescencia 12–17 · Jóvenes 18–35 · Adultos 36–59 ·
//   Adultos mayores 60 o más.
// Las etiquetas son las mismas de la matriz (y de db2Transform.ts). La tabla
// pone el 35 en Jóvenes y en Adultos: aquí cuenta en Jóvenes; el 60, que no
// tenía grupo, cuenta en Adultos Mayores.
export const GRUPOS_CICLO_VIDA = [
  'Infancia (0 a 11 años)',
  'Adolescencia (12 a 17 años)',
  'Jóvenes (18 a 35 años)',
  'Adultos (35 a 59 años)',
  'Adultos Mayores (>60 años)',
] as const;

export function grupoCicloVida(edad: number | null | undefined): string | null {
  if (edad == null || !Number.isFinite(edad) || edad < 0 || edad > 120) return null;
  const e = Math.floor(edad);
  if (e <= 11) return GRUPOS_CICLO_VIDA[0];
  if (e <= 17) return GRUPOS_CICLO_VIDA[1];
  if (e <= 35) return GRUPOS_CICLO_VIDA[2];
  if (e <= 59) return GRUPOS_CICLO_VIDA[3];
  return GRUPOS_CICLO_VIDA[4];
}
