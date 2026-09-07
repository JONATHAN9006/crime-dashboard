import { ShieldAlert, Users, HeartPulse, Info } from 'lucide-react';
import { PageHeader, Card } from '../components/ui/Card';

// Página preparada como ESTRUCTURA visual únicamente. Las fórmulas y la
// lógica de cálculo de cada indicador (tasa por cada X habitantes, según
// corresponda) se implementarán cuando se suministren — por ahora cada
// tarjeta solo muestra el nombre del indicador, sin datos ni cálculos.
const INDICADORES = [
  { id: 'homicidio', titulo: 'Homicidio', icono: ShieldAlert },
  { id: 'hurtoPersonas', titulo: 'Hurto a Personas', icono: Users },
  { id: 'lesionesPersonales', titulo: 'Lesiones Personales', icono: HeartPulse },
];

export function IndicadoresTasaCosec() {
  return (
    <div className="space-y-5">
      <PageHeader title="Indicadores Tasa Cosec" subtitle="Estructura preparada — pendiente de definir fórmula y lógica de cálculo para cada indicador." />

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>Esta sección todavía no tiene información ni fórmulas activas. Cuando se defina la metodología de cada tasa (ej. casos por cada X habitantes/cuadrante), se completará el cálculo sin necesidad de modificar esta estructura.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {INDICADORES.map((ind) => {
          const Icono = ind.icono;
          return (
            <Card key={ind.id} title={ind.titulo}>
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-300">
                <Icono size={32} />
                <p className="text-sm font-medium text-slate-400">Pendiente por definir</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
