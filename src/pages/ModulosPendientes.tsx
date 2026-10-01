import type { LucideIcon } from 'lucide-react';
import { Network, Hammer } from 'lucide-react';

// Módulos nuevos del menú (MACRI; RNMC e IRISP1 ya tienen página propia) — por ahora solo la
// estructura: aparecen en el sidebar, se pueden abrir, y avisan que están
// pendientes de definir sus parámetros. Cuando se definan, cada uno se
// reemplaza por su página real (basta con cambiar la entrada en
// PAGINAS de App.tsx) sin tocar el menú ni los permisos.
function ModuloEnConstruccion({ titulo, icono: Icono }: { titulo: string; icono: LucideIcon }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-brand-green">
        <Icono size={26} />
      </div>
      <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-slate-500">
        <Hammer size={14} /> Módulo en construcción — pendiente de definir sus parámetros.
      </p>
    </div>
  );
}

export function Macri() {
  return <ModuloEnConstruccion titulo="MACRI" icono={Network} />;
}
