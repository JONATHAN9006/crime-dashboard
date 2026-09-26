import { useState } from 'react';
import { Bot, X, Eraser, Minus, Sparkles, MessageSquare } from 'lucide-react';
import { ContextoAnalisisIA } from './ContextoAnalisisIA';
import { SugerenciasIA } from './SugerenciasIA';
import { ChatAnalistaIA } from './ChatAnalistaIA';
import { AnalistaPredictivo } from './AnalistaPredictivo';
import { useAgenteIA } from '../../hooks/useAgenteIA';

/**
 * "Analista IA" — FLOTANTE, montado una sola vez en App.tsx (fuera del
 * intercambio de páginas), así que está disponible en Indicadores, Análisis
 * por Unidad, Resumen o cualquier otra página, sin necesidad de navegar a
 * una pantalla dedicada. Reemplaza al antiguo "Analista Virtual
 * Inteligente" (ya retirado de Análisis por Unidad) y a la página dedicada
 * "🤖 Analista IA" — misma lógica de siempre (useAgenteIA, 100% de solo
 * lectura sobre useData()), solo que ahora en una ventana flotante.
 *
 * Tiene DOS modos: "Chat" (conversación libre, como siempre) y "Pronóstico"
 * (el módulo predictivo espacio-temporal — ver AnalistaPredictivo.tsx, que
 * NO usa un modelo de lenguaje para calcular nada, es estadística directa
 * sobre los datos ya cargados).
 */
export function AgenteIAFlotante() {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'chat' | 'pronostico'>('chat');
  const { contexto, mensajes, cargando, error, preguntar, limpiarConversacion, configurado } = useAgenteIA();

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fixed bottom-16 right-5 z-[9000] flex h-14 w-14 items-center justify-center rounded-full bg-brand-green text-white shadow-lg transition-transform hover:scale-105"
        title="Analista IA"
      >
        <Bot size={24} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-16 right-5 z-[9000] flex h-[min(640px,80vh)] w-[min(420px,92vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between bg-brand-navy px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-white" />
          <div>
            <p className="text-sm font-bold text-white">🤖 Analista IA</p>
            <p className="text-[11px] text-slate-300">Analista inteligente del comportamiento delictivo</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {modo === 'chat' && mensajes.length > 0 && (
            <button type="button" onClick={limpiarConversacion} title="Limpiar conversación" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
              <Eraser size={15} />
            </button>
          )}
          <button type="button" onClick={() => setAbierto(false)} title="Minimizar" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <Minus size={15} />
          </button>
          <button type="button" onClick={() => setAbierto(false)} title="Cerrar" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-200 bg-slate-50 px-2 pt-1.5">
        <button
          onClick={() => setModo('chat')}
          className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 text-xs font-medium ${modo === 'chat' ? 'bg-white text-brand-navy border border-b-0 border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <MessageSquare size={13} /> Chat
        </button>
        <button
          onClick={() => setModo('pronostico')}
          className={`flex items-center gap-1 rounded-t-md px-3 py-1.5 text-xs font-medium ${modo === 'pronostico' ? 'bg-white text-indigo-600 border border-b-0 border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Sparkles size={13} /> Pronóstico
        </button>
      </div>

      {modo === 'chat' ? (
        <div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-3 py-2.5">
          <ContextoAnalisisIA contexto={contexto} />
          <SugerenciasIA onSeleccionar={preguntar} deshabilitado={!configurado || cargando} />
          <div className="min-h-0 flex-1">
            <ChatAnalistaIA mensajes={mensajes} cargando={cargando} error={error} configurado={configurado} onEnviar={preguntar} />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-2.5">
          <AnalistaPredictivo />
        </div>
      )}
    </div>
  );
}
