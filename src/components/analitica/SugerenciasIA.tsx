import { BarChart3, TrendingUp, CalendarDays, MapPin, FileText } from 'lucide-react';

export interface SugerenciaIA {
  icono: React.ElementType;
  etiqueta: string;
  pregunta: string;
}

export const SUGERENCIAS_IA: SugerenciaIA[] = [
  { icono: BarChart3, etiqueta: 'Analizar comportamiento', pregunta: '¿Cómo se comportó este delito?' },
  { icono: TrendingUp, etiqueta: 'Comparar vigencias', pregunta: 'Compare la vigencia actual con la anterior.' },
  { icono: CalendarDays, etiqueta: 'Identificar días críticos', pregunta: '¿Cuál fue el día y la hora con mayor incidencia?' },
  { icono: MapPin, etiqueta: 'Analizar territorio', pregunta: '¿Dónde se concentra este delito?' },
  { icono: FileText, etiqueta: 'Generar análisis ejecutivo', pregunta: 'Genere un análisis ejecutivo para presentar al comandante.' },
];

/** Botones de preguntas frecuentes — solo envían texto predefinido al chat. */
export function SugerenciasIA({ onSeleccionar, deshabilitado }: { onSeleccionar: (pregunta: string) => void; deshabilitado: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SUGERENCIAS_IA.map((s) => (
        <button
          key={s.etiqueta}
          type="button"
          disabled={deshabilitado}
          onClick={() => onSeleccionar(s.pregunta)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-green hover:text-brand-green disabled:cursor-not-allowed disabled:opacity-50"
        >
          <s.icono size={13} />
          {s.etiqueta}
        </button>
      ))}
    </div>
  );
}
