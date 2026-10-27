import { useEffect, useRef, useState } from 'react';
import { Send, Copy, Check, AlertCircle, Bot, Loader2, Sparkles } from 'lucide-react';
import type { MensajeChat } from '../../types/agenteIA';
import { TextoMarkdown } from './analista/TextoMarkdown';

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
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 transition-colors hover:text-[#0f5f57]"
    >
      {copiado ? <Check size={12} /> : <Copy size={12} />}
      {copiado ? 'Copiado' : 'Copiar'}
    </button>
  );
}

const hora = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

function BurbujaMensaje({ mensaje }: { mensaje: MensajeChat }) {
  if (mensaje.rol === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#10233f] px-3.5 py-2 text-[13px] leading-relaxed text-white">
          <p className="whitespace-pre-wrap">{mensaje.texto}</p>
          <p className="mt-0.5 text-right text-[10px] text-white/50">{hora(mensaje.timestamp)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f5f57] text-white"><Bot size={16} /></div>
      <div className="min-w-0 max-w-[92%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-[13px] leading-relaxed text-slate-700 shadow-sm">
        <TextoMarkdown texto={mensaje.texto} />
        <div className="flex items-center justify-between gap-2">
          <BotonCopiar texto={mensaje.texto} />
          <span className="mt-2 text-[10px] text-slate-400">{hora(mensaje.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatAnalistaIA({ mensajes, cargando, error, configurado, onEnviar, sugerencias = [], onIrAnalisis }: {
  mensajes: MensajeChat[];
  cargando: boolean;
  error: string | null;
  configurado: boolean;
  onEnviar: (texto: string) => void;
  // Preguntas armadas con los filtros actuales (accesos rápidos del chat).
  sugerencias?: { etiqueta: string; pregunta: string }[];
  onIrAnalisis?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const finRef = useRef<HTMLDivElement>(null);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensajes.length, cargando]);

  function manejarEnvio() {
    if (!texto.trim() || cargando) return;
    onEnviar(texto);
    setTexto('');
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-1 py-2">
        {!configurado && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800">
            <AlertCircle size={16} className="mt-[1px] shrink-0" />
            <div>
              <p className="font-semibold">El chat con IA aún no está configurado en el servidor.</p>
              <p className="mt-0.5">Los análisis de la pestaña <b>Análisis</b> sí funcionan: se calculan directamente con los datos del dashboard.</p>
              {onIrAnalisis && <button type="button" onClick={onIrAnalisis} className="mt-1.5 font-semibold text-amber-900 underline">Ir a Análisis</button>}
            </div>
          </div>
        )}
        {configurado && mensajes.length === 0 && (
          <div className="py-4 text-center">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-[#e3f2ef] text-[#0f5f57]"><Sparkles size={20} /></div>
            <p className="text-[13.5px] font-semibold text-[#10233f]">Pregunta sobre el comportamiento delictivo</p>
            <p className="text-[12px] text-slate-500">Las respuestas usan solo los filtros y registros visibles del dashboard.</p>
          </div>
        )}
        {mensajes.map((m) => <BurbujaMensaje key={m.id} mensaje={m} />)}
        {cargando && (
          <div className="flex items-center gap-2 pl-10 text-[12.5px] text-slate-500">
            <Loader2 size={14} className="animate-spin text-[#0f5f57]" />
            Analizando los datos del dashboard…
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}
        <div ref={finRef} />
      </div>

      {configurado && sugerencias.length > 0 && mensajes.length === 0 && (
        <div className="flex flex-wrap gap-1.5 pb-2">
          {sugerencias.map((s) => (
            <button key={s.etiqueta} type="button" disabled={cargando} onClick={() => onEnviar(s.pregunta)} title={s.pregunta}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:border-[#0f5f57] hover:text-[#0f5f57] disabled:opacity-50">
              {s.etiqueta}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-slate-200 pt-3">
        <textarea
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              manejarEnvio();
            }
          }}
          disabled={!configurado || cargando}
          placeholder={configurado ? 'Pregunta sobre el comportamiento delictivo…' : 'Chat con IA no disponible'}
          className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-[#0f5f57] focus:outline-none focus:ring-2 focus:ring-[#0f5f57]/15 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={manejarEnvio}
          disabled={!configurado || cargando || !texto.trim()}
          className="flex h-[42px] shrink-0 items-center gap-1.5 rounded-xl bg-[#0f5f57] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#0b4a44] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send size={15} /> <span className="hidden sm:inline">Enviar</span>
        </button>
      </div>
    </div>
  );
}
