import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export function MultiSelect({ label, options, selected, onChange, labels }: {
  label: string;
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
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-left text-sm hover:border-slate-400"
      >
        <span className="truncate text-slate-700">
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
          <ChevronDown size={14} className="text-slate-400" />
        </div>
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white shadow-lg">
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
