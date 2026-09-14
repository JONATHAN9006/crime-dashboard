export type ValorTop = number | 'todas';

/**
 * Selector de "Top N" como botones (no lista desplegable) — Top 5, Top 10
 * y Todas, a pedido. Reutilizable en cualquier tarjeta que necesite este
 * mismo control.
 */
export function SelectorTopBotones({ valor, onChange, opciones = [5, 10, 'todas'] }: {
  valor: ValorTop;
  onChange: (v: ValorTop) => void;
  opciones?: ValorTop[];
}) {
  return (
    <div className="flex gap-1">
      {opciones.map((op) => (
        <button
          key={String(op)}
          type="button"
          onClick={() => onChange(op)}
          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
            valor === op ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'
          }`}
        >
          {op === 'todas' ? 'Todas' : `Top ${op}`}
        </button>
      ))}
    </div>
  );
}
