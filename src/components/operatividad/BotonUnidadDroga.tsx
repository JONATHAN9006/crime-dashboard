import clsx from 'clsx';
import type { UnidadDroga } from '../../utils/operatividadConteo';

/** Botón pequeño gramos ↔ kilogramos. Solo cambia cómo se muestran las cantidades de droga. */
export function BotonUnidadDroga({ unidad, onChange }: { unidad: UnidadDroga; onChange: (u: UnidadDroga) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(unidad === 'g' ? 'kg' : 'g')}
      aria-pressed={unidad === 'kg'}
      title={unidad === 'g' ? 'Ver la droga en kilogramos' : 'Ver la droga en gramos'}
      className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 text-[11px] font-bold"
    >
      <span className={clsx('px-1.5 py-[3px]', unidad === 'g' ? 'bg-[#10233f] text-white' : 'bg-white text-slate-500')}>g</span>
      <span className={clsx('px-1.5 py-[3px]', unidad === 'kg' ? 'bg-[#10233f] text-white' : 'bg-white text-slate-500')}>kg</span>
    </button>
  );
}
