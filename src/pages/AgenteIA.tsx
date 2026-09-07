import { Bot, Eraser } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import { ContextoAnalisisIA } from '../components/analitica/ContextoAnalisisIA';
import { SugerenciasIA } from '../components/analitica/SugerenciasIA';
import { ChatAnalistaIA } from '../components/analitica/ChatAnalistaIA';
import { useAgenteIA } from '../hooks/useAgenteIA';

/**
 * "Analista IA" — módulo NUEVO y AISLADO. No reemplaza ni modifica el
 * "Analista Virtual Inteligente" existente (components/analitica/AnalistaVirtual.tsx,
 * usado dentro de Análisis por Unidad), que sigue funcionando exactamente
 * igual. Este es un segundo punto de entrada, con su propia página en el
 * menú, que reutiliza los mismos hooks de cálculo del dashboard (ver
 * hooks/useAgenteIA.ts) para conversar sobre los datos ya filtrados.
 */
export function AgenteIA() {
  const { contexto, mensajes, cargando, error, preguntar, limpiarConversacion, configurado } = useAgenteIA();

  return (
    <div className="space-y-5">
      <PageHeader title="🤖 Analista IA" subtitle="Analista inteligente del comportamiento delictivo" />

      <Card title="Analista IA">
        <div className="flex flex-col gap-4">
          <ContextoAnalisisIA contexto={contexto} />

          <div className="flex items-center justify-between">
            <SugerenciasIA onSeleccionar={preguntar} deshabilitado={!configurado || cargando} />
            {mensajes.length > 0 && (
              <button
                type="button"
                onClick={limpiarConversacion}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-700"
              >
                <Eraser size={13} />
                Limpiar
              </button>
            )}
          </div>

          <div className="h-[420px] rounded-xl border border-slate-200 p-3">
            <ChatAnalistaIA mensajes={mensajes} cargando={cargando} error={error} configurado={configurado} onEnviar={preguntar} />
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Bot size={12} />
            El agente no calcula cifras por sí mismo: utiliza herramientas determinísticas del Dashboard para obtener los resultados y solo redacta la explicación.
          </p>
        </div>
      </Card>
    </div>
  );
}
