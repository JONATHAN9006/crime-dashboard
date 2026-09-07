import type { FilaComparativaCategoria } from '../../hooks/useComparativoHomologo';
import { AporteBarList } from './AporteBarList';

// La presentación visual real vive en AporteBarList (columna verdadera de
// Aporte, alineada) — este componente solo adapta los datos ya calculados
// por useComparativoHomologo (aportePct incluido) al formato que espera esa
// lista, sin duplicar ninguna fórmula.
export function ComparativoBarrasConAporte({
  data, anioAnterior, anioActual, onBarClick, limite = 10,
}: {
  data: FilaComparativaCategoria[];
  anioAnterior: number;
  anioActual: number;
  onBarClick?: (key: string) => void;
  limite?: number;
}) {
  const filas = [...data].sort((a, b) => b.actual - a.actual).slice(0, limite);
  const datosAporte = filas.map((f) => ({ key: f.key, casos: f.actual, aportePct: f.aportePct }));

  return <AporteBarList data={datosAporte} onBarClick={onBarClick} />;
}
