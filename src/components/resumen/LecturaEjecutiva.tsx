import { FileText } from 'lucide-react';
import { Card } from '../ui/Card';
import type { FraseLectura } from '../../analitica/lectura';

// "Lectura ejecutiva" — el párrafo que respondería un analista al
// comandante: qué pasó, cuánto, qué lo explica, dónde y cuándo. Todo sale
// de construirLecturaEjecutiva (analitica/lectura.ts); pasando el mouse por
// cada frase se ve de dónde sale su cifra.
export function LecturaEjecutiva({ frases, className }: { frases: FraseLectura[]; className?: string }) {
  return (
    <Card title="Lectura ejecutiva" subtitle="Generada con los datos y filtros actuales" descargable="lectura-ejecutiva" className={className}>
      {frases.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No hay casos en el periodo para describir.</p>
      ) : (
        <div className="space-y-2.5">
          {frases.map((f) => (
            <p key={f.tema} title={`Base: ${f.base}`} className={`text-[14px] leading-relaxed ${f.tema === 'total' ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
              {f.texto}
            </p>
          ))}
          <p className="flex items-center gap-1 pt-1 text-[11px] text-slate-400">
            <FileText size={11} /> Pasa el mouse sobre cada frase para ver de dónde sale la cifra.
          </p>
        </div>
      )}
    </Card>
  );
}
