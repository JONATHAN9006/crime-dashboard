import React from 'react';
import '@fontsource/kaushan-script/400.css';
import { useTemporada, type TemporadaId } from '../../config/temporadas';
import { Calabaza, Murcielago } from '../layout/TemaHalloween';

// ──────────────────────────────────────────────────────────────────────────
// Decoración de temporada para los módulos (banner, sombrero de bruja del
// menú y telaraña de esquina). Todo es decorativo: aria-hidden, sin clics,
// y marcado con data-ocultar-en-descarga para que nunca salga en imágenes
// ni PDF. Fuera de temporada los módulos muestran su encabezado de siempre.
// ──────────────────────────────────────────────────────────────────────────

export type ModuloTemporada = 'delictividad' | 'operatividad' | 'semanas' | 'matriz' | 'mapa';

// Cada frase en dos líneas, como el diseño de referencia: la primera en
// blanco y la segunda en naranja dorado.
export const FRASES_TEMPORADA: Record<TemporadaId, Record<ModuloTemporada, [string, string]>> = {
  halloween: {
    delictividad: ['Que la prevención', 'ilumine nuestro territorio'],
    operatividad: ['Disciplina hoy,', 'territorios más seguros'],
    semanas: ['Pequeñas acciones,', 'grandes resultados'],
    matriz: ['La prevención también', 'es parte de la solución'],
    mapa: ['Territorios más seguros,', 'comunidades más fuertes'],
  },
};

// Letra de pincel para la frase (Kaushan Script, incluida en el proyecto:
// no depende de internet y solo se descarga cuando se usa).
const FUENTE_FRASE = '"Kaushan Script", "Segoe Script", "Brush Script MT", cursive';

const NARANJA = '#fb923c';
const SILUETA = '#06161c';

const decorativo = { 'aria-hidden': true, 'data-ocultar-en-descarga': '1' } as const;

const ESTILOS = `
  @keyframes tp-aleteo { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  .tp-aleteo { animation: tp-aleteo 3.2s ease-in-out infinite }
  @media (prefers-reduced-motion: reduce) { .tp-aleteo { animation: none } }
`;

/** Árbol seco en silueta. */
function ArbolSeco({ className = '', espejo = false }: { className?: string; espejo?: boolean }) {
  return (
    <svg viewBox="0 0 90 140" className={className} style={espejo ? { transform: 'scaleX(-1)' } : undefined} preserveAspectRatio="xMidYMax meet">
      <path fill={SILUETA} d="M42 140c1-24-2-44-1-62-8-6-16-14-22-26l4-2c5 9 11 16 18 21 0-10-3-20-9-30l4-2c7 10 9 21 9 32 5-12 13-21 24-28l3 4c-12 7-20 17-23 30 8-5 17-7 26-6v5c-11-1-20 3-26 10-1 20 3 40 1 56z" />
      <path fill={SILUETA} d="M27 44C20 38 12 35 3 35v-4c10 0 19 4 26 10zM58 26c2-8 7-15 15-19l2 4c-7 3-11 9-13 16zM47 20c-2-7-1-13 2-19l4 2c-3 5-4 10-2 16z" />
    </svg>
  );
}

/** Pueblo en silueta (casas con ventanas encendidas, iglesia y cerca). */
function Pueblo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 110" className={className} preserveAspectRatio="xMinYMax meet">
      <g fill={SILUETA}>
        <path d="M0 110V92c30-8 70-10 110-6s90 4 130-4 60-6 80-2v30z" />
        <rect x="30" y="66" width="34" height="30" /><path d="M26 68h42L47 48z" />
        <rect x="70" y="58" width="26" height="38" /><path d="M66 60h34L83 40z" />
        <rect x="104" y="44" width="14" height="52" /><path d="M101 46h20l-10-26z" /><rect x="110" y="12" width="2" height="10" /><rect x="107" y="15" width="8" height="2" />
        <rect x="118" y="62" width="40" height="34" /><path d="M114 64h48L138 46z" />
        <rect x="166" y="70" width="30" height="26" /><path d="M162 72h38L181 56z" />
        <rect x="204" y="64" width="22" height="32" /><path d="M200 66h30L215 50z" />
      </g>
      <g fill="#fbbf24" opacity=".85">
        <rect x="36" y="74" width="5" height="7" rx="1" /><rect x="52" y="74" width="5" height="7" rx="1" />
        <rect x="80" y="66" width="5" height="7" rx="1" /><rect x="109" y="56" width="4" height="8" rx="2" />
        <rect x="126" y="70" width="6" height="8" rx="1" /><rect x="144" y="70" width="6" height="8" rx="1" />
        <rect x="176" y="78" width="5" height="6" rx="1" /><rect x="212" y="72" width="5" height="7" rx="1" />
      </g>
      <g stroke={SILUETA} strokeWidth="2.2"><path d="M232 98v-14M244 98v-14M256 98v-14M268 98v-14M228 89h44" /></g>
    </svg>
  );
}

/** Casa embrujada en una colina (derecha). */
function CasaEmbrujada({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 130" className={className} preserveAspectRatio="xMaxYMax meet">
      <g fill={SILUETA}>
        <path d="M0 130c40-18 90-26 200-24v24z" />
        <rect x="70" y="54" width="70" height="62" /><path d="M64 56h82l-41-30z" />
        <rect x="128" y="30" width="18" height="40" /><path d="M124 32h26l-13-26z" />
        <rect x="78" y="36" width="14" height="26" /><path d="M75 38h20l-10-16z" />
      </g>
      <g fill="#fbbf24" opacity=".9">
        <rect x="82" y="70" width="8" height="10" rx="1" /><rect x="104" y="70" width="8" height="10" rx="1" /><rect x="133" y="44" width="6" height="9" rx="3" /><rect x="96" y="92" width="10" height="24" rx="5" opacity=".7" />
      </g>
    </svg>
  );
}

/** Silueta de policía (banner de Operatividad). */
function Policia({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 150" className={className} preserveAspectRatio="xMaxYMax meet">
      <g fill="#0a1a22">
        <path d="M20 150c2-34 14-52 40-58 26 6 38 24 40 58z" />
        <rect x="50" y="78" width="20" height="18" />
        <ellipse cx="60" cy="62" rx="20" ry="24" />
        <path d="M34 46c0-18 52-22 54 0l-2 6H36z" />
        <path d="M30 52q30 10 62 0l2 5q-33 13-66 0z" fill="#03080b" />
      </g>
      <path d="M58 30l4-2 4 2v4c0 2-2 3-4 4-2-1-4-2-4-4z" fill="#d4a017" />
      <path d="M36 150c2-26 10-40 24-46 14 6 22 20 24 46" fill="none" stroke="#2dd4bf" strokeWidth="1.4" opacity=".35" />
      <text x="60" y="128" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="11" fill="#e2e8f0" letterSpacing=".5">POLICÍA</text>
    </svg>
  );
}

/** Escena de noche del banner, inspirada en el diseño de referencia. */
function EscenaNocturna({ modulo }: { modulo: ModuloTemporada }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" {...decorativo}>
      <style>{ESTILOS}</style>
      {/* Cielo con resplandor naranja alrededor de la luna */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 68.5% 36%, rgba(251,146,60,0.55) 0%, rgba(234,88,12,0.25) 16%, transparent 38%)' }} />
      {/* Luna llena */}
      <div className="absolute left-[64%] top-[6px] h-[100px] w-[100px] rounded-full max-md:left-auto max-md:right-4 max-md:top-2 max-md:h-14 max-md:w-14"
        style={{ background: 'radial-gradient(circle at 40% 36%, #ffe2b0 0%, #fdba74 38%, #f97316 78%, #c2410c 100%)', boxShadow: '0 0 50px 16px rgba(251,146,60,0.35)' }}>
        <span className="absolute left-[28%] top-[44%] h-3 w-4 rounded-full bg-[#ea580c]/35" />
        <span className="absolute left-[58%] top-[60%] h-4 w-5 rounded-full bg-[#ea580c]/30" />
        <span className="absolute left-[52%] top-[26%] h-2 w-2 rounded-full bg-[#ea580c]/30" />
      </div>
      {/* Murciélagos */}
      <Murcielago ancho={38} className="absolute left-[60%] top-[38%] tp-aleteo max-md:hidden" />
      <Murcielago ancho={30} className="absolute left-[76%] top-[10%] tp-aleteo" style={{ animationDelay: '.6s' }} />
      <Murcielago ancho={24} className="absolute left-[82%] top-[40%] tp-aleteo max-md:hidden" style={{ animationDelay: '1.2s' }} />
      <Murcielago ancho={20} className="absolute left-[56%] top-[12%] tp-aleteo max-md:hidden" style={{ animationDelay: '1.8s' }} />
      <Murcielago ancho={18} className="absolute left-[90%] top-[18%] tp-aleteo max-md:hidden" style={{ animationDelay: '.3s' }} />
      {/* Pueblo y árbol a la izquierda */}
      <ArbolSeco className="absolute bottom-0 left-0 h-[120px] w-[78px] opacity-95" />
      <Pueblo className="absolute bottom-0 left-[4%] h-[64px] w-[200px] opacity-90 max-md:hidden" />
      {/* Derecha: casa embrujada o policía (Operatividad) y árbol */}
      {modulo === 'operatividad'
        ? <Policia className="absolute bottom-0 right-[7%] h-[140px] w-[112px] max-md:hidden" />
        : <CasaEmbrujada className="absolute bottom-0 right-[5%] h-[112px] w-[176px] max-md:hidden" />}
      <ArbolSeco espejo className="absolute bottom-0 right-0 h-[132px] w-[84px] opacity-95 max-md:hidden" />
      {/* Suelo y neblina */}
      <svg className="absolute inset-x-0 bottom-0 h-8 w-full" viewBox="0 0 400 32" preserveAspectRatio="none">
        <path d="M0 32V20c40-8 80-10 120-4s80 6 120-2 100-10 160 2v16z" fill={SILUETA} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: 'linear-gradient(to top, rgba(148,163,184,0.10), transparent)' }} />
      {/* Calabazas */}
      <div className="absolute bottom-0.5 right-2"><Calabaza ancho={58} /></div>
      <div className="absolute bottom-0 right-[60px] max-md:hidden"><Calabaza ancho={36} /></div>
      {/* Acento naranja inferior */}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${NARANJA}, rgba(251,146,60,0.35) 60%, transparent)` }} />
    </div>
  );
}

/**
 * Encabezado de temporada de un módulo, con la composición del diseño de
 * referencia: arriba a la izquierda el ícono, el nombre y el subtítulo
 * originales; en el centro-derecha la frase de pincel en dos líneas (blanco
 * y naranja) junto a la luna; pueblo, árboles, murciélagos y calabazas en
 * silueta. Los controles del módulo van debajo, sobre fondo claro.
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
  const sombra = '0 2px 0 rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.75)';
  return (
    <section data-banner-temporada={modulo} className="space-y-2">
      <div
        className="relative overflow-hidden rounded-2xl text-white shadow-[0_2px_12px_rgba(16,35,63,0.25)]"
        style={{ background: 'linear-gradient(115deg, #0c2f36 0%, #0f3a44 30%, #13263f 62%, #1a1f3a 100%)' }}
      >
        <EscenaNocturna modulo={modulo} />
        <div className="relative z-10 grid min-h-[140px] grid-cols-1 gap-x-4 gap-y-2 px-5 pb-6 pt-4 md:min-h-[158px] md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:pr-[150px]">
          <div className="flex min-w-0 items-start gap-3 max-md:pr-16">
            {icono && (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#159089] text-white shadow-md ring-2 ring-white/30">
                {icono}
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[25px]" style={{ textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>{titulo}</h1>
              {subtitulo && <p className="mt-0.5 max-w-[46ch] text-[12.5px] leading-snug text-white/80" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{subtitulo}</p>}
            </div>
          </div>
          <p
            data-frase={`${linea1} ${linea2}`}
            className="min-w-0 self-end text-[26px] leading-[1.12] sm:text-[31px] xl:text-[36px] md:pl-[6%]"
            style={{ fontFamily: FUENTE_FRASE }}
          >
            <span className="block text-white" style={{ textShadow: sombra }}>{linea1}</span>
            <span className="block pl-[8%] text-[#f9a825]" style={{ textShadow: sombra }}>{linea2}</span>
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
