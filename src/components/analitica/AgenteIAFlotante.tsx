import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Bot, X, Eraser, Minus, Sparkles, MessageSquare, BarChart3, ArrowLeftRight, Clock, MapPin, Layers,
  ShieldCheck, Shield, FileText, History, ChevronDown, ChevronRight, Trash2, MessageCircle, Home, CalendarDays,
} from 'lucide-react';
import { ContextoAnalisisIA } from './ContextoAnalisisIA';
import { ChatAnalistaIA } from './ChatAnalistaIA';
import { AnalistaPredictivo } from './AnalistaPredictivo';
import { VistaAnalisis } from './analista/VistaAnalisis';
import { useAgenteIA } from '../../hooks/useAgenteIA';
import { ACCESOS_ANALISIS, firmaContexto, generarAnalisis, type AnalisisEstructurado, type TipoAnalisis } from '../../services/analisisEstructurado';
import { analisisATexto, descargarInformePdf } from '../../services/informeAnalista';
import { puedeDescargar } from '../../utils/permisos';

/**
 * «Analista IA» — FLOTANTE, montado una sola vez en App.tsx (disponible en
 * cualquier página). Tres pestañas:
 *  · Chat: conversación libre con el modelo de IA (servidor), que solo
 *    consulta cifras ya calculadas (services/agenteIATools.ts).
 *  · Análisis: análisis estructurados SIN modelo de lenguaje
 *    (services/analisisEstructurado.ts), con las cifras del contexto actual.
 *    Funcionan aunque el servicio de IA no esté configurado.
 *  · Pronóstico: el módulo predictivo de siempre (AnalistaPredictivo).
 * Todo es de solo lectura sobre useData(): no toca filtros ni cálculos.
 */

type Pestana = 'chat' | 'analisis' | 'pronostico';

const ICONOS: Record<TipoAnalisis, typeof BarChart3> = {
  comportamiento: BarChart3, comparar: ArrowLeftRight, temporal: Clock, territorial: MapPin, modalidades: Layers,
  operatividad: ShieldCheck, preventivas: Shield, recientes: CalendarDays, ejecutivo: FileText,
};

interface EntradaHistorial { id: string; hora: number; tipo: TipoAnalisis; titulo: string; firma: string; foto: AnalisisEstructurado; textoFoto: string }

const hora = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export function AgenteIAFlotante() {
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('analisis');
  const [verPanelMovil, setVerPanelMovil] = useState(false);
  const { contexto, mensajes, cargando, error, preguntar, limpiarConversacion, configurado } = useAgenteIA();

  // Análisis activo: «vivo» (se recalcula con la selección actual) salvo que
  // se haya abierto una entrada del historial hecha con otra selección.
  const [tipoActivo, setTipoActivo] = useState<TipoAnalisis>('comportamiento');
  const [foto, setFoto] = useState<EntradaHistorial | null>(null);
  const [historial, setHistorial] = useState<EntradaHistorial[]>([]);
  const firmaActual = firmaContexto(contexto);
  const analisisVivo = useMemo(() => generarAnalisis(tipoActivo, contexto), [tipoActivo, contexto]);
  const desactualizado = !!foto && foto.firma !== firmaActual;
  const analisis = desactualizado ? foto!.foto : analisisVivo;
  const textoPlano = desactualizado ? foto!.textoFoto : analisisATexto(analisisVivo, contexto);

  function abrirAnalisis(tipo: TipoAnalisis) {
    const a = generarAnalisis(tipo, contexto);
    setTipoActivo(tipo);
    setFoto(null);
    setPestana('analisis');
    setVerPanelMovil(false);
    setHistorial((h) => [{ id: `${Date.now()}`, hora: Date.now(), tipo, titulo: a.titulo, firma: firmaActual, foto: a, textoFoto: analisisATexto(a, contexto) }, ...h].slice(0, 30));
  }

  const preguntasHistorial = mensajes.filter((m) => m.rol === 'user').map((m) => ({ id: m.id, hora: m.timestamp, texto: m.texto }));
  const entradas = [
    ...historial.map((h) => ({ clave: `a${h.id}`, hora: h.hora, texto: h.titulo, tipo: 'analisis' as const, h })),
    ...preguntasHistorial.map((p) => ({ clave: `p${p.id}`, hora: p.hora, texto: p.texto, tipo: 'pregunta' as const, h: null })),
  ].sort((a, b) => b.hora - a.hora);

  const sugerenciasChat = useMemo(() => ACCESOS_ANALISIS.map((a) => ({ etiqueta: a.etiqueta, pregunta: generarAnalisis(a.tipo, contexto).preguntaIA })).filter((s) => s.pregunta), [contexto]);
  const descargar = puedeDescargar() ? () => descargarInformePdf(analisis, contexto) : null;

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

  const PESTANAS: { id: Pestana; etiqueta: string; icono: typeof BarChart3 }[] = [
    { id: 'chat', etiqueta: 'Chat', icono: MessageSquare },
    { id: 'analisis', etiqueta: 'Análisis', icono: BarChart3 },
    { id: 'pronostico', etiqueta: 'Pronóstico', icono: Sparkles },
  ];

  const panelContenido = (
    <>
      <ContextoAnalisisIA contexto={contexto} />
      <div>
        <p className="mb-2 text-[14px] font-bold text-white">¿Qué deseas analizar?</p>
        <div className="grid grid-cols-2 gap-1.5">
          {ACCESOS_ANALISIS.map((a) => {
            const Icono = ICONOS[a.tipo];
            const activo = pestana === 'analisis' && tipoActivo === a.tipo && !desactualizado;
            return (
              <button
                key={a.tipo}
                type="button"
                onClick={() => abrirAnalisis(a.tipo)}
                title={a.descripcion}
                className={clsx('flex min-h-[44px] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold leading-tight transition-colors',
                  activo ? 'bg-[#e3f2ef] text-[#0f5f57] ring-2 ring-[#5eead4]' : 'bg-white text-[#10233f] hover:bg-[#f1f9f7]')}
              >
                <Icono size={16} className="shrink-0 text-[#0f5f57]" />
                <span className="min-w-0 flex-1">{a.etiqueta}</span>
                {activo && <ChevronRight size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-white"><History size={14} /> Historial de consultas</p>
          {entradas.length > 0 && (
            <button type="button" onClick={() => { setHistorial([]); limpiarConversacion(); setFoto(null); }} className="flex items-center gap-1 text-[11.5px] text-slate-300 hover:text-white"><Trash2 size={12} /> Limpiar</button>
          )}
        </div>
        {entradas.length === 0 ? (
          <p className="text-[11.5px] text-slate-400">Aún no hay consultas en esta sesión.</p>
        ) : (
          <ul className="divide-y divide-white/10">
            {entradas.map((e) => (
              <li key={e.clave}>
                <button
                  type="button"
                  onClick={() => {
                    if (e.tipo === 'analisis' && e.h) { setTipoActivo(e.h.tipo); setFoto(e.h); setPestana('analisis'); } else setPestana('chat');
                    setVerPanelMovil(false);
                  }}
                  className="flex w-full items-center gap-2 py-1.5 text-left text-[12px] text-slate-200 hover:text-white"
                >
                  {e.tipo === 'analisis' ? <BarChart3 size={13} className="shrink-0 text-[#5eead4]" /> : <MessageCircle size={13} className="shrink-0 text-slate-400" />}
                  <span className="min-w-0 flex-1 truncate" title={e.texto}>{e.texto}</span>
                  <span className="shrink-0 text-[10.5px] text-slate-400">{hora(e.hora)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-[9000] flex flex-col overflow-hidden bg-[#f4f7fa] shadow-2xl sm:inset-auto sm:bottom-16 sm:right-5 sm:h-[min(780px,calc(100dvh-88px))] sm:w-[min(1180px,calc(100vw-40px))] sm:rounded-2xl sm:border sm:border-slate-300 md:flex-row">
      {/* ── Panel lateral (oscuro) ── */}
      <aside className="flex shrink-0 flex-col gap-3 overflow-y-auto bg-[#10233f] p-3 text-white md:w-[318px] md:p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0f5f57]"><Bot size={22} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold leading-tight">Analista IA</p>
            <p className="text-[12px] text-slate-300">Inteligencia delictiva MEPOY</p>
          </div>
          <span className={clsx('mt-1 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', configurado ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300')} title={configurado ? 'Chat con IA disponible' : 'Chat con IA sin configurar; los análisis funcionan con los datos del dashboard'}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', configurado ? 'bg-emerald-400' : 'bg-amber-400')} /> {configurado ? 'En línea' : 'Análisis local'}
          </span>
          <div className="flex shrink-0 gap-0.5 md:hidden">
            <button type="button" onClick={() => setAbierto(false)} title="Cerrar" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"><X size={18} /></button>
          </div>
        </div>
        <div className="grid grid-cols-3 rounded-xl border border-white/15 p-0.5">
          {PESTANAS.map((p) => (
            <button key={p.id} type="button" onClick={() => setPestana(p.id)}
              className={clsx('flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition-colors', pestana === p.id ? 'bg-[#0f5f57] text-white shadow' : 'text-slate-300 hover:bg-white/10')}>
              <p.icono size={14} /> {p.etiqueta}
            </button>
          ))}
        </div>
        {/* En celular, el contexto/accesos/historial se despliegan a pedido */}
        <button type="button" onClick={() => setVerPanelMovil((v) => !v)} className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2 text-[12.5px] font-semibold md:hidden">
          Contexto, accesos rápidos e historial <ChevronDown size={16} className={clsx('transition-transform', verPanelMovil && 'rotate-180')} />
        </button>
        <div className={clsx('flex-col gap-3', verPanelMovil ? 'flex' : 'hidden md:flex')}>{panelContenido}</div>
      </aside>

      {/* ── Área principal ── */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[12.5px] text-slate-500">
            <Home size={14} className="shrink-0" /> Analista IA <ChevronRight size={13} /> <span className="truncate font-semibold text-[#10233f]">{pestana === 'chat' ? 'Chat' : pestana === 'pronostico' ? 'Pronóstico' : analisis.titulo}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 hidden items-center gap-1 text-[12px] text-slate-500 sm:flex"><CalendarDays size={13} /> Corte {contexto.corteInformacion}</span>
            {pestana === 'chat' && mensajes.length > 0 && (
              <button type="button" onClick={limpiarConversacion} title="Limpiar conversación" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Eraser size={16} /></button>
            )}
            <button type="button" onClick={() => setAbierto(false)} title="Minimizar" className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:block"><Minus size={16} /></button>
            <button type="button" onClick={() => setAbierto(false)} title="Cerrar" className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:block"><X size={16} /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {pestana === 'analisis' && (
            <VistaAnalisis
              analisis={analisis}
              desactualizado={desactualizado}
              onActualizar={() => abrirAnalisis(tipoActivo)}
              onProfundizar={configurado && !desactualizado ? () => { setPestana('chat'); preguntar(analisisVivo.preguntaIA); } : null}
              onDescargar={desactualizado ? null : descargar}
              textoPlano={textoPlano}
            />
          )}
          {pestana === 'chat' && (
            <div className="mx-auto flex h-full max-w-[860px] flex-col">
              <ChatAnalistaIA mensajes={mensajes} cargando={cargando} error={error} configurado={configurado} onEnviar={preguntar} sugerencias={sugerenciasChat} onIrAnalisis={() => setPestana('analisis')} />
            </div>
          )}
          {pestana === 'pronostico' && <AnalistaPredictivo />}
        </div>
      </main>
    </div>
  );
}
