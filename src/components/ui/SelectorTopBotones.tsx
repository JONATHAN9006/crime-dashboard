export type ValorTop = number | 'todas';

/**
 * Selector de "Top N" como botones (no lista desplegable) — Top 5, Top 10
 * y Todas, a pedido. Reutilizable en cualquier tarjeta que necesite este
 * mismo control.
 */
export function SelectorTopBotones({ valor, onChange, opciones = [5, 10, 'todas'], institucional = false }: {
  valor: ValorTop;
  /** Botones pequeños verde petróleo / blanco (solo donde se pide). */
  institucional?: boolean;
  onChange: (v: ValorTop) => void;
  opciones?: ValorTop[];
}) {
  return (
    <div className={institucional ? 'flex overflow-hidden rounded-md border border-slate-300' : 'flex gap-1'}>
      {opciones.map((op) => (
        <button
          key={String(op)}
          type="button"
          onClick={() => onChange(op)}
          className={institucional
            ? `border-l border-slate-300 px-1.5 py-[2px] text-[10.5px] font-semibold transition first:border-l-0 ${valor === op ? 'bg-[#0f5f57] text-white' : 'bg-white text-[#10233f] hover:bg-slate-50'}`
            : `rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              valor === op ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'
            }`}
        >
          {op === 'todas' ? 'Todas' : `Top ${op}`}
        </button>
      ))}
    </div>
  );
}
