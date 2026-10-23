import React from 'react';
import { useTemporada, type TemporadaId } from '../../config/temporadas';
import { Calabaza, Murcielago } from '../layout/TemaHalloween';

// ──────────────────────────────────────────────────────────────────────────
// Decoración de temporada para los módulos (banner, sombrero de bruja del
// menú y telaraña de esquina). Todo es decorativo: aria-hidden, sin clics,
// y marcado con data-ocultar-en-descarga para que nunca salga en imágenes
// ni PDF. Fuera de temporada los módulos muestran su encabezado de siempre.
// ──────────────────────────────────────────────────────────────────────────

export type ModuloTemporada = 'delictividad' | 'operatividad' | 'semanas' | 'matriz' | 'mapa';

export const FRASES_TEMPORADA: Record<TemporadaId, Record<ModuloTemporada, string>> = {
  halloween: {
    delictividad: 'Detrás de cada dato, una oportunidad para prevenir.',
    operatividad: 'Una respuesta oportuna hace la diferencia.',
    semanas: 'Descubre los patrones antes de que te sorprendan.',
    matriz: 'Identifica los momentos críticos, ilumina las decisiones.',
    mapa: 'Cada punto cuenta. Cada territorio importa.',
  },
};

const FUENTE_FRASE = '"Segoe Script", "Lucida Handwriting", "Brush Script MT", "Apple Chancery", cursive';
const NARANJA = '#fb923c';

const decorativo = { 'aria-hidden': true, 'data-ocultar-en-descarga': '1' } as const;

const ESTILOS = `
  @keyframes tp-aleteo { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  .tp-aleteo { animation: tp-aleteo 3.2s ease-in-out infinite }
  @media (prefers-reduced-motion: reduce) { .tp-aleteo { animation: none } }
`;

/** Noche sutil detrás del texto del banner: estrellas, luna, murciélagos y colinas. */
function EscenaNocturna() {
  const estrellas = [[8, 22], [17, 64], [29, 18], [41, 40], [54, 14], [63, 58], [72, 26], [86, 48], [93, 16]];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" {...decorativo}>
      <style>{ESTILOS}</style>
      {estrellas.map(([x, y], i) => (
        <span key={i} className="absolute h-[2px] w-[2px] rounded-full bg-white/50" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
      {/* Luna */}
      <div className="absolute right-4 top-2 h-10 w-10 rounded-full opacity-90 md:right-5 md:top-1/2 md:h-14 md:w-14 md:-translate-y-1/2" style={{ background: 'radial-gradient(circle at 40% 38%, #fde7c2 0%, #fdba74 55%, #f59e0b 100%)', boxShadow: '0 0 28px 6px rgba(251,191,36,0.22)' }} />
      <Murcielago ancho={26} className="absolute right-16 top-3 tp-aleteo opacity-80 md:right-[88px]" />
      <Murcielago ancho={18} className="absolute right-6 top-[62%] tp-aleteo opacity-70 md:right-3 md:top-[72%]" style={{ animationDelay: '.9s' }} />
      <Murcielago ancho={16} className="absolute left-[40%] top-[22%] tp-aleteo opacity-60 max-md:hidden" style={{ animationDelay: '1.6s' }} />
      {/* Colinas */}
      <svg className="absolute inset-x-0 bottom-0 h-7 w-full" viewBox="0 0 400 28" preserveAspectRatio="none">
        <path d="M0 28V18c40-8 70-10 110-4s70 6 110-2 90-12 180 2v14z" fill="#06201d" opacity="0.55" />
      </svg>
      {/* Acento naranja inferior */}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${NARANJA}, rgba(251,146,60,0.35) 60%, transparent)` }} />
    </div>
  );
}

/**
 * Encabezado de temporada para un módulo. Conserva el nombre y el subtítulo
 * originales; los controles del módulo (acciones) van en una franja clara
 * para que se vean igual que siempre.
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
  const frase = FRASES_TEMPORADA[temporada][modulo];
  return (
    <section
      data-banner-temporada={modulo}
      className="relative rounded-2xl text-white shadow-[0_2px_10px_rgba(16,35,63,0.18)]"
      style={{ background: 'linear-gradient(112deg, #0a3d39 0%, #0f5f57 48%, #10233f 100%)' }}
    >
      <EscenaNocturna />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pb-5 pt-4 sm:px-5 md:pr-24">
        <div className="flex min-w-0 flex-[1_1_18rem] items-center gap-3">
          {icono && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white" style={{ boxShadow: `0 0 0 2px ${NARANJA}` }}>
              {icono}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[24px]">{titulo}</h1>
            {subtitulo && <p className="text-[13px] leading-snug text-white/75">{subtitulo}</p>}
            <p className="mt-1 flex items-center gap-1.5 text-[15.5px] leading-snug sm:text-[17px]" style={{ fontFamily: FUENTE_FRASE, color: '#fed7aa' }}>
              <span>{frase}</span>
              <span className="inline-flex shrink-0" {...decorativo}><Calabaza ancho={22} resplandor={false} /></span>
            </p>
          </div>
        </div>
        {(acciones || metrica) && (
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl bg-white/95 p-1.5 text-slate-800 shadow-sm">
            {metrica && <span className="rounded-full bg-brand-navy/5 px-3 py-1 text-xs font-medium text-brand-navy">{metrica}</span>}
            {acciones}
          </div>
        )}
      </div>
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
