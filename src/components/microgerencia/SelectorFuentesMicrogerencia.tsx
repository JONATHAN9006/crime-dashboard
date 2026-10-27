import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileBarChart } from 'lucide-react';
import { ModalMicrogerencia } from './ModalMicrogerencia';

export type FuenteMicrogerencia = 'delictividad' | 'operatividad' | 'rnmc' | 'irisp1' | 'macri';

const FUENTES: { id: FuenteMicrogerencia; nombre: string; disponible: boolean }[] = [
  { id: 'delictividad', nombre: 'Delictividad', disponible: true },
  { id: 'operatividad', nombre: 'Operatividad', disponible: true },
  { id: 'rnmc', nombre: 'RNMC', disponible: true },
  { id: 'irisp1', nombre: 'IRISP1', disponible: false },
  { id: 'macri', nombre: 'MACRI', disponible: false },
];

/**
 * Paso previo a ModalMicrogerencia — a pedido explícito: elegir qué
 * fuentes incluir (Delictividad ya existe con todo su árbol Distrito/
 * Estación/CAI; Operatividad y RNMC se agregan como una hoja resumen
 * propia, con su propio mapa, al FINAL del mismo PDF — ver
 * dibujarSeccionResumenSimple en pdfMicrogerencia.ts). IRISP1 y Macri
 * quedan marcados "Próximamente": no tienen una estructura de columnas
 * fija (cada archivo que se cargue puede traer columnas distintas), así
 * que por ahora no se puede construir un resumen confiable para ellas sin
 * asumir una estructura que el archivo cargado podría no tener.
 */
export function SelectorFuentesMicrogerencia({ onCerrar }: { onCerrar: () => void }) {
  const [seleccion, setSeleccion] = useState<Set<FuenteMicrogerencia>>(new Set(['delictividad']));
  const [continuar, setContinuar] = useState(false);

  function alternar(id: FuenteMicrogerencia) {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  if (continuar) {
    return <ModalMicrogerencia onCerrar={onCerrar} fuentesAdicionales={[...seleccion].filter((f): f is 'operatividad' | 'rnmc' => f === 'operatividad' || f === 'rnmc')} />;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileBarChart size={20} className="text-brand-navy" />
            <h2 className="text-base font-bold text-slate-800">Microgerencia — ¿qué fuentes incluir?</h2>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <p className="mb-3 text-xs text-slate-500">
          Delictividad mantiene todo su detalle (Distrito, Estación, CAI). Operatividad y RNMC se agregan como una hoja resumen propia, con su propio mapa, al final del mismo PDF.
        </p>

        <div className="space-y-2">
          {FUENTES.map((f) => (
            <label key={f.id} className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm ${f.disponible ? 'cursor-pointer border-slate-200 hover:bg-slate-50' : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'}`}>
              <input type="checkbox" checked={seleccion.has(f.id)} disabled={!f.disponible} onChange={() => alternar(f.id)} />
              <span className="font-medium">{f.nombre}</span>
              {!f.disponible && <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">Próximamente</span>}
            </label>
          ))}
        </div>

        <button
          onClick={() => setContinuar(true)}
          disabled={seleccion.size === 0}
          className="mt-4 w-full rounded-lg bg-brand-navy py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    </div>,
    document.body,
  );
}
