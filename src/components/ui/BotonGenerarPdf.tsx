import { useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import { useListaComponentesPdf } from '../../context/RegistroPdfContext';
import { generarPdfComponentes } from '../../utils/generarPdf';

export function BotonGenerarPdf({ nombreArchivo }: { nombreArchivo: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        <FileText size={14} /> PDF
      </button>
      {abierto && <ModalGenerarPdf nombreArchivo={nombreArchivo} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function ModalGenerarPdf({ nombreArchivo, onCerrar }: { nombreArchivo: string; onCerrar: () => void }) {
  const componentesDisponibles = useListaComponentesPdf();
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => new Set(componentesDisponibles.map((c) => c.id)));
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encabezado] = useState('');

  function alternar(id: string) {
    setSeleccionados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function generar() {
    const elegidos = componentesDisponibles.filter((c) => seleccionados.has(c.id));
    if (elegidos.length === 0) {
      setError('Selecciona al menos un componente.');
      return;
    }
    setGenerando(true);
    setError(null);
    try {
      await generarPdfComponentes(elegidos, { nombreArchivo, encabezado: encabezado || undefined });
      onCerrar();
    } catch (e) {
      setError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-800">Generar PDF</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          <p className="mb-3 text-xs text-slate-500">Elige qué componentes incluir. Cada uno se ubica completo, sin cortarse entre páginas.</p>
          <div className="space-y-2">
            {componentesDisponibles.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={seleccionados.has(c.id)} onChange={() => alternar(c.id)} className="h-4 w-4 accent-brand-green" />
                <span className="text-slate-700">{c.titulo}</span>
              </label>
            ))}
            {componentesDisponibles.length === 0 && <p className="text-sm text-slate-400">No hay componentes disponibles para incluir todavía.</p>}
          </div>
          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={generar}
            disabled={generando}
            className="flex items-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green/90 disabled:opacity-60"
          >
            {generando && <Loader2 size={14} className="animate-spin" />}
            {generando ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
