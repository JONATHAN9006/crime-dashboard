import { TrendingDown, TrendingUp, X } from 'lucide-react';
import { useData } from '../../context/DataContext';

// Aviso del filtro global AUMENTO / DISMINUCIÓN (se activa desde
// «Comparativo de delitos» en Resumen). Se ve en todas las páginas para que
// quede claro por qué las cifras muestran solo esos delitos, y permite
// quitarlo desde cualquier parte.
export function AvisoTendencia() {
  const { tendenciaDelitos, setTendenciaDelitos, delitosTendencia } = useData();
  if (!delitosTendencia) return null;
  const { aumento, disminucion } = tendenciaDelitos;
  const texto = aumento && disminucion ? 'en aumento y en disminución' : aumento ? 'en aumento' : 'en disminución';
  const lista = [...delitosTendencia].sort((a, b) => a.localeCompare(b, 'es'));
  const tono = aumento && !disminucion
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : !aumento && disminucion ? 'border-[#159089]/40 bg-[#e3f2ef] text-[#0f5f57]' : 'border-slate-200 bg-slate-50 text-[#10233f]';
  return (
    <div className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2 text-[12.5px] ${tono}`} role="status" data-aviso-tendencia>
      <span className="flex items-center gap-1.5 font-bold">
        {aumento && <TrendingUp size={14} />}{disminucion && <TrendingDown size={14} />}
        Mostrando solo delitos {texto} ({lista.length}) · también Operatividad por delito asociado
      </span>
      <span className="min-w-0 flex-1 truncate opacity-80" title={lista.join(', ')}>{lista.length ? lista.join(' · ') : 'ningún delito cumple con los filtros actuales'}</span>
      <button
        type="button"
        onClick={() => setTendenciaDelitos({ aumento: false, disminucion: false })}
        className="flex items-center gap-1 rounded-full border border-current/30 bg-white/70 px-2.5 py-0.5 text-[11.5px] font-semibold hover:bg-white"
      >
        <X size={12} /> Quitar
      </button>
    </div>
  );
}
