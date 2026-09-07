import type { ReactNode } from 'react';
import { Building2, MapPin, ShieldHalf, Layers, Swords, Home, Calendar, Clock, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';
import type { Hallazgo, TipoHallazgoDimension } from '../../utils/analisisDescriptivo';
import { formatDecimal, formatNumero } from '../../utils/aggregations';

const ICONO_POR_TIPO: Record<TipoHallazgoDimension, ReactNode> = {
  estacion: <Building2 size={16} />,
  cuadrante: <MapPin size={16} />,
  barrio: <MapPin size={16} />,
  cai: <ShieldHalf size={16} />,
  modalidad: <Layers size={16} />,
  arma: <Swords size={16} />,
  claseSitio: <Home size={16} />,
  dia: <Calendar size={16} />,
  hora: <Clock size={16} />,
};

// Colores con transparencia como rgba() EXPLÍCITO, nunca como clases de
// Tailwind con "/opacidad" (bg-white/5, text-white/50, etc.) — en Tailwind
// v4 esas clases se calculan internamente con color-mix()/oklch(), que el
// motor que genera la imagen descargada (html2canvas) no interpreta bien:
// el texto y los fondos con esas clases simplemente no aparecían en la
// descarga, aunque en pantalla se vieran perfectos. Con rgba() literal el
// navegador expone un valor de color estándar que sí se captura siempre,
// tanto en pantalla como en la imagen exportada.
const COLOR_TARJETA_FONDO = 'rgba(255,255,255,0.07)';
const COLOR_TARJETA_BORDE = 'rgba(255,255,255,0.16)';
const COLOR_DIVISOR = 'rgba(255,255,255,0.14)';
const COLOR_TEXTO_TENUE = 'rgba(255,255,255,0.55)';
const COLOR_ACENTO_VERDE = '#6ee7b7';
const COLOR_PILL_ROJO_FONDO = 'rgba(244,63,94,0.22)';
const COLOR_PILL_ROJO_TEXTO = '#fda4af';
const COLOR_PILL_VERDE_FONDO = 'rgba(52,211,153,0.22)';
const COLOR_PILL_VERDE_TEXTO = '#6ee7b7';

/**
 * "Ficha visual de análisis delictivo" — estilo pieza institucional (fondo
 * oscuro degradado en los mismos colores de marca del dashboard,
 * tarjetas internas tipo "vidrio", tipografía grande). Sigue armándose
 * EXCLUSIVAMENTE a partir de los mismos "hallazgos" estructurados que ya
 * calculó el Analista Virtual (utils/analisisDescriptivo.tsx) — solo
 * cambia la presentación visual, ningún dato ni cálculo nuevo.
 */
export function FichaAnalisisVisual({ titulo, hallazgos }: { titulo: string; hallazgos: Hallazgo[] }) {
  const total = hallazgos.find((h) => h.tipo === 'total');
  const dimensiones = hallazgos.filter((h) => h.tipo !== 'total') as Exclude<Hallazgo, { tipo: 'total' }>[];

  if (!total && dimensiones.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No hay información suficiente para generar la ficha visual.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-navy via-brand-navy to-brand-green-darkest p-6 text-white shadow-lg">
      {/* Encabezado institucional: ícono + título, con una línea de acento
          en el verde de marca debajo, como referencia visual de marca sin
          depender de ningún logo externo. */}
      <div className="flex items-center justify-center gap-2">
        <ShieldAlert size={18} style={{ color: COLOR_ACENTO_VERDE }} />
        <p className="text-center text-sm font-bold uppercase leading-snug tracking-widest text-white">{titulo}</p>
      </div>
      <div className="mx-auto mt-3 h-0.5 w-16 rounded-full" style={{ backgroundColor: COLOR_ACENTO_VERDE }} />

      {total && (
        <div className="mt-6 flex flex-col items-center pb-6" style={{ borderBottom: `1px solid ${COLOR_DIVISOR}` }}>
          <p className="text-6xl font-extrabold leading-none tracking-tight text-white">{formatNumero(total.casos)}</p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ color: COLOR_ACENTO_VERDE }}>Casos</p>
          <div className="mt-4 flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold"
              style={{
                backgroundColor: total.diferencia >= 0 ? COLOR_PILL_ROJO_FONDO : COLOR_PILL_VERDE_FONDO,
                color: total.diferencia >= 0 ? COLOR_PILL_ROJO_TEXTO : COLOR_PILL_VERDE_TEXTO,
              }}
            >
              {total.diferencia >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {total.diferencia >= 0 ? '+' : ''}{formatNumero(total.diferencia)} casos
            </span>
            {total.pctVariacion !== null && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold"
                style={{
                  backgroundColor: total.diferencia >= 0 ? COLOR_PILL_ROJO_FONDO : COLOR_PILL_VERDE_FONDO,
                  color: total.diferencia >= 0 ? COLOR_PILL_ROJO_TEXTO : COLOR_PILL_VERDE_TEXTO,
                }}
              >
                {total.diferencia >= 0 ? '+' : ''}{formatDecimal(total.pctVariacion, 0)}%
              </span>
            )}
          </div>
          <p className="mt-3 text-[11px]" style={{ color: COLOR_TEXTO_TENUE }}>frente al mismo periodo de {total.anioAnterior}</p>
        </div>
      )}

      {dimensiones.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dimensiones.map((d) => (
            <div key={d.tipo} className="rounded-xl p-3.5" style={{ backgroundColor: COLOR_TARJETA_FONDO, border: `1px solid ${COLOR_TARJETA_BORDE}` }}>
              <div className="flex items-start gap-1.5" style={{ color: COLOR_ACENTO_VERDE, minHeight: 28 }}>
                <span className="mt-0.5 shrink-0">{ICONO_POR_TIPO[d.tipo]}</span>
                <p className="text-[10px] font-bold uppercase leading-snug tracking-wide">{d.etiqueta}</p>
              </div>
              <p className="mt-3 truncate text-base font-bold leading-snug text-white" title={d.valor}>{d.valor}</p>
              <p className="mt-1 text-[11px]" style={{ color: COLOR_TEXTO_TENUE }}>{formatNumero(d.casos)} casos · {formatDecimal(d.pct, 1)}%</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
