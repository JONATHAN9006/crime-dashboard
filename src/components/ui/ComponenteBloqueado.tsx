import { Lock } from 'lucide-react';
import { Card } from './Card';

/**
 * Reemplazo visual para un componente bloqueado en la vista /jefe — misma
 * tarjeta (Card) de siempre, para que "conserve el diseño del dashboard",
 * con un candado y el aviso de que todavía está en desarrollo. El bloqueo
 * es también FUNCIONAL: como esto reemplaza por completo al componente
 * real (nunca se renderiza junto a él), no hay ninguna forma de interactuar
 * con la herramienta real desde aquí.
 */
export function ComponenteBloqueado({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <Card title={titulo} subtitle={subtitulo}>
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Lock size={20} />
        </div>
        <p className="text-sm font-semibold text-slate-500">Próximamente</p>
        <p className="max-w-xs text-xs text-slate-400">Esta herramienta está en desarrollo y todavía no está disponible en esta vista.</p>
      </div>
    </Card>
  );
}
