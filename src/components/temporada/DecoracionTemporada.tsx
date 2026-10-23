import React from 'react';
import '@fontsource/great-vibes/400.css';
import { useTemporada, type TemporadaId } from '../../config/temporadas';
import { Calabaza, Murcielago } from '../layout/TemaHalloween';

// ──────────────────────────────────────────────────────────────────────────
// Decoración de temporada para los módulos (banner, sombrero de bruja del
// menú y telaraña de esquina). Todo es decorativo: aria-hidden, sin clics,
// y marcado con data-ocultar-en-descarga para que nunca salga en imágenes
// ni PDF. Fuera de temporada los módulos muestran su encabezado de siempre.
// ──────────────────────────────────────────────────────────────────────────

export type ModuloTemporada = 'delictividad' | 'operatividad' | 'semanas' | 'matriz' | 'mapa';

// Cada frase en dos líneas (como el diseño de referencia): la segunda va
// desplazada a la derecha. El texto es el mismo de la especificación.
export const FRASES_TEMPORADA: Record<TemporadaId, Record<ModuloTemporada, [string, string]>> = {
  halloween: {
    delictividad: ['Detrás de cada dato,', 'una oportunidad para prevenir.'],
    operatividad: ['Una respuesta oportuna', 'hace la diferencia.'],
    semanas: ['Descubre los patrones', 'antes de que te sorprendan.'],
    matriz: ['Identifica los momentos críticos,', 'ilumina las decisiones.'],
    mapa: ['Cada punto cuenta.', 'Cada territorio importa.'],
  },
};

// Caligrafía elegante para la frase (Great Vibes, incluida en el proyecto:
// no depende de internet y el navegador solo la descarga cuando se usa,
// es decir, durante la temporada).
const FUENTE_FRASE = '"Great Vibes", "Segoe Script", "Lucida Handwriting", "Apple Chancery", cursive';

const NARANJA = '#fb923c';
const SILUETA = '#061a19';

const decorativo = { 'aria-hidden': true, 'data-ocultar-en-descarga': '1' } as const;

const ESTILOS = `
  @keyframes tp-aleteo { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  .tp-aleteo { animation: tp-aleteo 3.2s ease-in-out infinite }
  @media (prefers-reduced-motion: reduce) { .tp-aleteo { animation: none } }
`;

/** Castillo genérico en silueta. */
function Castillo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" className={className} preserveAspectRatio="xMaxYMax meet">
      <g fill={SILUETA}>
        <path d="M0 120c30-14 60-20 95-16s80 2 125-6v22z" />
        <rect x="70" y="58" width="90" height="62" />
        <rect x="58" y="40" width="22" height="80" /><path d="M54 42h30L69 10z" />
        <rect x="104" y="28" width="22" height="92" /><path d="M100 30h30L115 0z" />
        <rect x="148" y="48" width="20" height="72" /><path d="M144 50h28L158 22z" />
        <rect x="178" y="70" width="16" height="50" /><path d="M175 72h22l-11-20z" />
        <path d="M30 120V86l-8-14 4-1-8-12h22l-8 12 4 1-8 14v34z" opacity="0.9" />
      </g>
      <g fill="#fcd34d" opacity="0.75">
        <rect x="112" y="46" width="5" height="9" rx="2.5" /><rect x="64" y="60" width="4" height="8" rx="2" />
        <rect x="154" y="66" width="4" height="8" rx="2" /><rect x="90" y="80" width="5" height="9" rx="2.5" />
      </g>
    </svg>
  );
}

/** Escena de noche detrás del banner: luna grande, castillo, murciélagos, colinas y calabaza. */
function EscenaNocturna() {
  const estrellas = [[6, 18], [14, 70], [24, 12], [33, 36], [45, 16], [52, 62], [61, 22], [70, 10], [78, 54], [88, 20]];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" {...decorativo}>
      <style>{ESTILOS}</style>
      {estrellas.map(([x, y], i) => (
        <span key={i} className="absolute h-[2px] w-[2px] rounded-full bg-white/45" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {/* Resplandor cálido y luna llena */}
      <div className="absolute -top-16 right-[2%] h-72 w-72 rounded-full max-md:hidden" style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.30), transparent 62%)' }} />
      <div className="absolute right-[6%] top-1/2 h-[104px] w-[104px] -translate-y-[58%] rounded-full max-md:right-3 max-md:top-3 max-md:h-12 max-md:w-12 max-md:translate-y-0"
        style={{ background: 'radial-gradient(circle at 42% 38%, #fff1d6 0%, #fdc77a 45%, #f59e0b 80%, #d97706 100%)', boxShadow: '0 0 40px 10px rgba(251,191,36,0.28)' }} />
      {/* Castillo y árbol en silueta (derecha) */}
      <Castillo className="absolute bottom-0 right-[9%] h-[92px] w-[170px] opacity-95 max-md:hidden" />
      {/* Colinas */}
      <svg className="absolute inset-x-0 bottom-0 h-9 w-full" viewBox="0 0 400 36" preserveAspectRatio="none">
        <path d="M0 36V22c40-10 70-12 110-5s70 7 110-3 90-14 180 3v19z" fill={SILUETA} opacity="0.55" />
      </svg>
      {/* Murciélagos alrededor de la luna */}
      <Murcielago ancho={30} className="absolute right-[19%] top-3 tp-aleteo opacity-90 max-md:hidden" />
      <Murcielago ancho={22} className="absolute right-[3%] top-4 tp-aleteo opacity-85" style={{ animationDelay: '.7s' }} />
      <Murcielago ancho={18} className="absolute right-[15%] top-[56%] tp-aleteo opacity-80 max-md:hidden" style={{ animationDelay: '1.3s' }} />
      <Murcielago ancho={16} className="absolute left-[44%] top-[14%] tp-aleteo opacity-60 max-md:hidden" style={{ animationDelay: '1.9s' }} />
      {/* Calabaza en la esquina inferior derecha */}
      <div className="absolute bottom-1 right-2 max-md:hidden"><Calabaza ancho={50} /></div>
      {/* Acento naranja inferior */}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${NARANJA}, rgba(251,146,60,0.35) 60%, transparent)` }} />
    </div>
  );
}

/**
 * Encabezado de temporada para un módulo, con la estructura del diseño de
 * referencia: a la izquierda el ícono, el nombre y el subtítulo originales;
 * en el centro-derecha la frase en caligrafía, en dos líneas; a la derecha
 * la luna, el castillo y la calabaza. Los controles del módulo van debajo,
 * sobre fondo claro, igual que siempre.
 */
export function BannerTemporada({ temporada, modulo, titulo, subtitulo, icono, acciones, metrica }: {
  temporada: TemporadaId;
  modulo: ModuloTemporada;
  titulo: string;
  subtitulo?: React.ReactNode;
  icono?: React.ReactNode;
  acciones?: React.ReactNode;
  metrica?: string;
}) {
  const [linea1, linea2] = FRASES_TEMPORADA[temporada][modulo];
  return (
    <section data-banner-temporada={modulo} className="space-y-2">
      <div
        className="relative overflow-hidden rounded-2xl text-white shadow-[0_2px_12px_rgba(16,35,63,0.22)]"
        style={{ background: 'linear-gradient(110deg, #0b3a37 0%, #0f5f57 38%, #0d3b4a 68%, #10233f 100%)' }}
      >
        <EscenaNocturna />
        <div className="relative z-10 grid min-h-[128px] grid-cols-1 items-center gap-x-6 gap-y-2 px-5 py-4 md:min-h-[150px] md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:pr-[22%] lg:pr-[20%]">
          <div className="flex min-w-0 items-center gap-3 max-md:pr-14">
            {icono && (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-white" style={{ boxShadow: `0 0 0 2px ${NARANJA}` }}>
                {icono}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{titulo}</h1>
              {subtitulo && <p className="mt-0.5 text-[12.5px] leading-snug text-white/75">{subtitulo}</p>}
            </div>
          </div>
          <p
            data-frase={`${linea1} ${linea2}`}
            className="min-w-0 text-[26px] leading-[1.05] sm:text-[32px] xl:text-[38px]"
            style={{ fontFamily: FUENTE_FRASE, color: '#fbd38d', textShadow: '0 2px 8px rgba(0,0,0,0.55), 0 0 18px rgba(251,146,60,0.25)' }}
          >
            <span className="block">{linea1}</span>
            <span className="block pl-[12%]">{linea2}</span>
          </p>
        </div>
      </div>
      {(acciones || metrica) && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {metrica && <span className="rounded-full bg-brand-navy/5 px-3 py-1 text-xs font-medium text-brand-navy">{metrica}</span>}
          {acciones}
        </div>
      )}
    </section>
  );
}

/** Sombrero de bruja pequeño para los ítems del menú (oculto en pantallas pequeñas). */
export function SombreroBruja({ className = '' }: { className?: string }) {
  return (
    <span className={`pointer-events-none hidden shrink-0 md:inline-flex ${className}`} data-sombrero-bruja="1" {...decorativo}>
      <svg viewBox="0 0 32 26" width="24" height="20">
        <path d="M17 1c-3 1-5 4-6 8l-3 9h16l-3-7c-1-2-1-5 1-7-2 0-4 0-5-3z" fill="#6d28d9" stroke="#c4b5fd" strokeWidth="0.8" strokeLinejoin="round" />
        <path d="M9 15h14l1 3H8z" fill={NARANJA} />
        <ellipse cx="16" cy="20" rx="14.5" ry="3.4" fill="#4c1d95" stroke="#c4b5fd" strokeWidth="0.8" />
        <circle cx="16" cy="16.5" r="1.3" fill="#fde047" />
      </svg>
    </span>
  );
}

/** Telaraña pequeña colgada de la esquina superior izquierda de una tarjeta (queda en el margen, fuera del contenido). */
export function TelaranaEsquina() {
  const radios = [0, 22.5, 45, 67.5, 90];
  const arcos = [7, 13, 19];
  const p = (g: number, r: number) => [r * Math.cos((g * Math.PI) / 180), r * Math.sin((g * Math.PI) / 180)];
  return (
    <span className="pointer-events-none absolute -left-1.5 -top-1.5 z-[1]" data-telarana="1" {...decorativo}>
      <svg viewBox="0 0 24 24" width="24" height="24">
        <g stroke="rgba(71,85,105,0.38)" strokeWidth="0.7" fill="none">
          {radios.map((g) => { const [x, y] = p(g, 23); return <line key={g} x1="0" y1="0" x2={x} y2={y} />; })}
          {arcos.map((r) => (
            <path key={r} d={radios.slice(0, -1).map((g, i) => { const [x1, y1] = p(g, r); const [x2, y2] = p(radios[i + 1], r); const [cx, cy] = p((g + radios[i + 1]) / 2, r * 0.85); return `${i === 0 ? `M${x1} ${y1}` : ''} Q${cx} ${cy} ${x2} ${y2}`; }).join(' ')} />
          ))}
        </g>
      </svg>
    </span>
  );
}

/** Hook de conveniencia para los módulos: la temporada activa (o null). */
export function useTemporadaModulo(): TemporadaId | null {
  return useTemporada();
}
