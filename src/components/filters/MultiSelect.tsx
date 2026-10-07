import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';

export function MultiSelect({ label, options, selected, onChange, labels, institucional = false, icono, tonoIcono = 'bg-slate-100 text-slate-600' }: {
  label: string;
  /** Estilo del panel "Filtros de análisis" (altura fija, borde institucional y resaltado si hay selección). Opcional: las demás páginas no cambian. */
  institucional?: boolean;
  icono?: ReactNode;
  /** Clases del recuadro del ícono (fondo y color), según la sección del panel. */
  tonoIcono?: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  labels?: Record<string, string>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtradas = options.filter((o) => o.toLowerCase().includes(busqueda.toLowerCase()));

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }

  return (
    <div ref={ref} className={institucional ? 'relative flex items-end gap-2' : 'relative'}>
      {institucional && icono && (
        <span aria-hidden="true" className={`mb-[1px] flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${selected.length > 0 ? 'bg-[#116762] text-white' : tonoIcono}`}>{icono}</span>
      )}
      <div className={institucional ? 'min-w-0 flex-1' : undefined}>
      <label className={institucional ? 'mb-1 block truncate text-[12px] font-semibold text-[#10233f]' : 'mb-1 block text-xs font-medium text-slate-500'}>
        {label}
        {institucional && selected.length > 0 && <span className="sr-only"> (filtro activo)</span>}
      </label>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={institucional
          ? `flex h-10 w-full items-center justify-between gap-1 rounded-lg border bg-white px-2.5 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#116762]/40 ${selected.length > 0 ? 'border-[#116762] bg-[#116762]/[0.06] font-semibold' : 'border-slate-300 hover:border-[#116762]/60'}`
          : 'flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm hover:border-slate-400'}
      >
        <span className={institucional ? `truncate ${selected.length > 0 ? 'text-[#0b4a46]' : 'text-[#10233f]'}` : 'truncate text-slate-700'} title={institucional && selected.length > 1 ? selected.map((v) => labels?.[v] ?? v).join(', ') : undefined}>
          {selected.length === 0 ? 'Todos' : selected.length === 1 ? (labels?.[selected[0]] ?? selected[0]) : `${selected.length} seleccionados`}
        </span>
        <div className="flex items-center gap-1">
          {selected.length > 0 && (
            <X
              size={13}
              className="text-slate-400 hover:text-slate-600"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
            />
          )}
          <ChevronDown size={institucional ? 16 : 14} className={institucional ? 'text-[#10233f]' : 'text-slate-400'} />
        </div>
      </button>
      </div>
      {abierto && (
        <div className={`absolute z-20 mt-1 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white shadow-lg ${institucional ? 'left-0 top-full' : ''}`}>
          {options.length > 8 && (
            <div className="border-b border-slate-100 p-1.5">
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto p-1 scrollbar-thin">
            {filtradas.length === 0 && <p className="p-2 text-xs text-slate-400">Sin opciones</p>}
            {filtradas.map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                <span className="truncate text-slate-700">{labels?.[opt] ?? opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
