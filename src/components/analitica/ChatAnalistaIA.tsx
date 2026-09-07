import { useState } from 'react';
import { Send, Copy, Check, AlertCircle, Bot, User, Loader2 } from 'lucide-react';
import type { MensajeChat } from '../../types/agenteIA';

function BotonCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        });
      }}
      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-brand-green"
    >
      {copiado ? <Check size={12} /> : <Copy size={12} />}
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function BurbujaMensaje({ mensaje }: { mensaje: MensajeChat }) {
  const esUsuario = mensaje.rol === 'user';
  return (
    <div className={`flex gap-2 ${esUsuario ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${esUsuario ? 'bg-slate-200 text-slate-600' : 'bg-brand-green text-white'}`}>
        {esUsuario ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${esUsuario ? 'bg-brand-navy text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
        <p className="whitespace-pre-wrap">{mensaje.texto}</p>
        {!esUsuario && <BotonCopiar texto={mensaje.texto} />}
      </div>
    </div>
  );
}

export function ChatAnalistaIA({ mensajes, cargando, error, configurado, onEnviar }: {
  mensajes: MensajeChat[];
  cargando: boolean;
  error: string | null;
  configurado: boolean;
  onEnviar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState('');

  function manejarEnvio() {
    if (!texto.trim() || cargando) return;
    onEnviar(texto);
    setTexto('');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {!configurado ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertCircle size={16} className="shrink-0" />
            El Analista IA aún no está configurado. Verifique la configuración del servicio de IA.
          </div>
        ) : mensajes.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Escribe una pregunta o usa una de las sugerencias de abajo para empezar.</p>
        ) : (
          mensajes.map((m) => <BurbujaMensaje key={m.id} mensaje={m} />)
        )}

        {cargando && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            Analizando datos...
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-3">
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              manejarEnvio();
            }
          }}
          disabled={!configurado || cargando}
          placeholder="Escriba su pregunta..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-green focus:outline-none focus:ring-1 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={manejarEnvio}
          disabled={!configurado || cargando || !texto.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-green text-white transition-colors hover:bg-brand-green/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
