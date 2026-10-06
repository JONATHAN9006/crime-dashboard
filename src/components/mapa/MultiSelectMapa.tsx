import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

// Lista desplegable de SELECCIÓN MÚLTIPLE para el panel oscuro "Filtros de
// visualización" del mapa (Delito, Zona de Atención, Estación, CAI,
// Barrio). Antes era un <select> de una sola opción; el filtro del mapa ya
// aceptaba listas (filtrosMapa.delito es un arreglo), solo faltaba poder
// escoger varias. Vacío = "Todos".
export function MultiSelectMapa({ etiqueta, opciones, seleccion, onChange, textoVacio = 'Todos', textoQuitar = 'Todos (quitar selección)', textoPie = 'Mostrando todos' }: {
  etiqueta: string;
  /** Texto cuando no hay nada elegido (por defecto "Todos", porque vacío = sin filtro). */
  textoVacio?: string;
  textoQuitar?: string;
  textoPie?: string;
  opciones: string[];
  seleccion: string[];
  onChange: (valores: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Se cierra al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!q) return opciones;
    return opciones.filter((o) => o.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q));
  }, [opciones, busqueda]);

  const alternar = (v: string) => onChange(seleccion.includes(v) ? seleccion.filter((x) => x !== v) : [...seleccion, v]);
  const resumen = seleccion.length === 0 ? textoVacio : seleccion.length === 1 ? seleccion[0] : `${seleccion.length} seleccionados`;

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-xs font-semibold text-slate-300">{etiqueta}</label>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title={seleccion.length > 1 ? seleccion.join(', ') : undefined}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-sm text-white ${seleccion.length > 0 ? 'border-emerald-400/60 bg-emerald-500/15' : 'border-white/20 bg-white/10'}`}
      >
        <span className="truncate">{resumen}</span>
        <span className="flex shrink-0 items-center gap-1">
          {seleccion.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              title="Quitar este filtro"
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}
              className="rounded p-0.5 text-slate-300 hover:bg-white/15 hover:text-white"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={`transition ${abierto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 z-[1200] mt-1 rounded-lg border border-slate-200 bg-white text-slate-800 shadow-xl">
          {opciones.length > 8 && (
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
              <Search size={13} className="text-slate-400" />
              <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={`Buscar ${etiqueta.toLowerCase()}…`} className="w-full text-sm outline-none" />
            </div>
          )}
          <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1 text-[11px]">
            <button type="button" onClick={() => onChange([])} className="font-semibold text-slate-500 hover:text-slate-800">{textoQuitar}</button>
            {busqueda && visibles.length > 0 && (
              <button type="button" onClick={() => onChange(Array.from(new Set([...seleccion, ...visibles])))} className="font-semibold text-brand-green hover:underline">
                Marcar los {visibles.length} encontrados
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">Sin coincidencias.</p>
            ) : (
              visibles.map((v) => {
                const marcado = seleccion.includes(v);
                return (
                  <button key={v} type="button" onClick={() => alternar(v)} className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${marcado ? 'font-semibold' : ''}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${marcado ? 'border-brand-green bg-brand-green text-white' : 'border-slate-300'}`}>
                      {marcado && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{v}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-2 py-1.5 text-[11px] text-slate-500">
            <span>{seleccion.length === 0 ? textoPie : `${seleccion.length} seleccionado(s)`}</span>
            <button type="button" onClick={() => setAbierto(false)} className="rounded bg-brand-navy px-2 py-0.5 font-semibold text-white">Listo</button>
          </div>
        </div>
      )}
    </div>
  );
}
