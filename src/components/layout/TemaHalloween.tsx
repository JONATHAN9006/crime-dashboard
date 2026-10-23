import { useEffect, useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// TEMA DE TEMPORADA — Halloween en el menú lateral.
//
// Se activa SOLO del 15 al 31 de octubre (hora de Colombia) y se apaga
// solo el 1 de noviembre a las 00:00, sin publicar nada: el navegador
// revisa la fecha cada 5 minutos (un dashboard que quede abierto de un día
// para otro también cambia). Aplica igual para administrador, interno y
// piloto. Es solo decoración: no toca menús, permisos ni datos, y queda
// detrás del texto (no recibe clics).
//
// Para revisarlo en otra fecha: agregar ?tema=halloween (o ?tema=normal)
// a la dirección.
// ──────────────────────────────────────────────────────────────────────────

const DIA_INICIO = 15; // de octubre

function fechaBogota(): { mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  return { mes: Number(partes.find((p) => p.type === 'month')?.value), dia: Number(partes.find((p) => p.type === 'day')?.value) };
}

export function esTemporadaHalloween(): boolean {
  try {
    const forzado = new URLSearchParams(window.location.search).get('tema');
    if (forzado === 'halloween') return true;
    if (forzado === 'normal') return false;
  } catch { /* sin ventana */ }
  const { mes, dia } = fechaBogota();
  return mes === 10 && dia >= DIA_INICIO && dia <= 31;
}

export function useTemporadaHalloween(): boolean {
  const [activo, setActivo] = useState(esTemporadaHalloween);
  useEffect(() => {
    const id = window.setInterval(() => setActivo(esTemporadaHalloween()), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  return activo;
}

const OSCURO = '#06201d';

function Murcielago({ ancho = 30, className = '', style }: { ancho?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 44 18" width={ancho} height={(ancho * 18) / 44} className={className} style={style} aria-hidden>
      <path fill={OSCURO} d="M22 6c1-2 2-3 2.5-4l.6 2 1.2-1.6.3 2.4C28 3 31 1.5 34 2c3 .5 6 3 10 7-3-1-5.5-.6-7 1.4-1.5-1.3-3.6-1.4-5 .4-1.3-1-3-1-4.3.6-.9 1.3-2 2.6-3.7 3.6-1.7-1-2.8-2.3-3.7-3.6-1.3-1.6-3-1.6-4.3-.6-1.4-1.8-3.5-1.7-5-.4C9.5 8.4 7 8 4 9c4-4 7-6.5 10-7 3-.5 6 1 7.4 2.8l.3-2.4L19 4l.6-2c.5 1 1.5 2 2.4 4Z" />
    </svg>
  );
}

function Calabaza({ ancho = 46, className = '', resplandor = true }: { ancho?: number; className?: string; resplandor?: boolean }) {
  return (
    <svg viewBox="0 0 64 60" width={ancho} height={(ancho * 60) / 64} className={className} aria-hidden style={resplandor ? { filter: 'drop-shadow(0 0 10px rgba(251,146,60,0.55))' } : undefined}>
      <path d="M31 12c-1-5 1-9 5-11l2 2c-3 2-4 5-3 9z" fill="#3f6212" />
      <ellipse cx="18" cy="35" rx="15" ry="20" fill="#c2410c" />
      <ellipse cx="46" cy="35" rx="15" ry="20" fill="#c2410c" />
      <ellipse cx="32" cy="35" rx="16" ry="22" fill="#ea580c" />
      <ellipse cx="24" cy="35" rx="9" ry="21" fill="#f97316" opacity="0.55" />
      <ellipse cx="40" cy="35" rx="9" ry="21" fill="#f97316" opacity="0.55" />
      <path d="M19 28l6-6 5 6zM34 28l5-6 6 6z" fill="#fde047" />
      <path d="M30 32l2-4 2 4z" fill="#fde047" />
      <path d="M16 39c5 7 27 7 32 0-2 1-4 2-6 2l-1-3-3 3h-4l-2-3-2 3h-4l-3-3-1 3c-2 0-4-1-6-2z" fill="#fde047" />
    </svg>
  );
}

function Fantasma({ ancho = 70 }: { ancho?: number }) {
  return (
    <svg viewBox="0 0 70 84" width={ancho} height={(ancho * 84) / 70} aria-hidden style={{ filter: 'drop-shadow(0 0 12px rgba(255,255,255,0.35))' }}>
      <path d="M35 4C18 4 9 18 9 34v40l7-6 7 7 6-7 6 7 6-7 6 7 7-7 7 6V34C61 18 52 4 35 4z" fill="#f8fafc" opacity="0.95" />
      <path d="M9 50c-5 0-8-4-7-8 3 2 5 2 7 0zM61 46c5 0 8-4 7-8-3 2-5 2-7 0z" fill="#f8fafc" opacity="0.9" />
      <ellipse cx="27" cy="32" rx="4" ry="6" fill="#0f172a" />
      <ellipse cx="43" cy="32" rx="4" ry="6" fill="#0f172a" />
      <ellipse cx="35" cy="45" rx="3.5" ry="4.5" fill="#0f172a" />
    </svg>
  );
}

function Telarana() {
  const radios = [0, 18, 36, 54, 72, 90];
  const arcos = [18, 34, 52, 72, 94];
  const a = (g: number, r: number) => [r * Math.cos((g * Math.PI) / 180), r * Math.sin((g * Math.PI) / 180)];
  return (
    <svg viewBox="0 0 110 110" width="110" height="110" aria-hidden style={{ transform: 'scaleX(-1)' }}>
      <g stroke="rgba(226,242,239,0.22)" strokeWidth="0.9" fill="none">
        {radios.map((g) => { const [x, y] = a(g, 108); return <line key={g} x1="0" y1="0" x2={x} y2={y} />; })}
        {arcos.map((r) => (
          <path key={r} d={radios.slice(0, -1).map((g, i) => { const [x1, y1] = a(g, r); const [x2, y2] = a(radios[i + 1], r); const [cx, cy] = a((g + radios[i + 1]) / 2, r * 0.86); return `${i === 0 ? `M${x1} ${y1}` : ''} Q${cx} ${cy} ${x2} ${y2}`; }).join(' ')} />
        ))}
      </g>
    </svg>
  );
}

function Arana() {
  return (
    <svg viewBox="0 0 40 70" width="34" height="60" aria-hidden>
      <line x1="20" y1="0" x2="20" y2="38" stroke="rgba(226,242,239,0.35)" strokeWidth="0.8" />
      <g stroke={OSCURO} strokeWidth="2" fill="none" strokeLinecap="round">
        <path d="M14 44 6 38 2 44M14 47 4 47 1 54M14 50 6 55 4 62M26 44 34 38 38 44M26 47 36 47 39 54M26 50 34 55 36 62" />
      </g>
      <ellipse cx="20" cy="48" rx="8" ry="9" fill={OSCURO} />
      <circle cx="20" cy="38" r="5" fill={OSCURO} />
      <circle cx="18" cy="37.5" r="1.4" fill="#fb923c" />
      <circle cx="22" cy="37.5" r="1.4" fill="#fb923c" />
    </svg>
  );
}

function LunaIglesia() {
  return (
    <svg viewBox="0 0 150 120" width="150" height="120" aria-hidden>
      <defs>
        <radialGradient id="luna-hw" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="70%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#ea580c" />
        </radialGradient>
      </defs>
      <circle cx="95" cy="52" r="46" fill="url(#luna-hw)" opacity="0.92" />
      <circle cx="80" cy="40" r="6" fill="#ea580c" opacity="0.25" />
      <circle cx="108" cy="66" r="9" fill="#ea580c" opacity="0.2" />
      {/* Silueta de iglesia (genérica) */}
      <g fill={OSCURO}>
        <rect x="58" y="70" width="70" height="50" />
        <rect x="70" y="44" width="16" height="40" />
        <path d="M68 46h20l-10-14z" />
        <rect x="77" y="24" width="2" height="10" /><rect x="74" y="27" width="8" height="2" />
        <rect x="104" y="52" width="14" height="30" />
        <path d="M102 54h18l-9-12z" />
        <path d="M84 72a14 14 0 0 1 28 0z" />
        <path d="M0 120c10-6 20-4 30-10s25-2 35-8 40 4 85 6v12z" />
      </g>
      <g fill="#fde68a" opacity="0.7"><rect x="76" y="56" width="4" height="7" rx="2" /><rect x="109" y="62" width="4" height="7" rx="2" /></g>
    </svg>
  );
}

function ArbolSeco() {
  return (
    <svg viewBox="0 0 120 230" width="120" height="230" aria-hidden>
      <path fill={OSCURO} opacity="0.9" d="M70 230c-2-40 4-70 0-100-3-22-14-34-26-46l4-3c10 9 17 17 22 28 1-18-4-34-14-50l4-2c11 15 16 31 15 49 6-14 16-25 30-33l3 4c-15 8-25 20-29 36 6-4 13-6 21-6v5c-10 1-17 5-21 11-2 22 4 52 2 107z" />
      <path fill={OSCURO} opacity="0.9" d="M44 84c-10-8-22-12-34-12v-5c13 1 25 5 36 13zM58 42c-4-10-12-18-22-24l3-4c11 6 19 15 24 26z" />
    </svg>
  );
}

function Tumbas() {
  return (
    <svg viewBox="0 0 160 110" width="160" height="110" aria-hidden>
      <g fill={OSCURO}>
        <rect x="74" y="8" width="10" height="70" />
        <rect x="58" y="24" width="42" height="10" />
        <path d="M20 110V64a20 20 0 0 1 40 0v46z" />
        <path d="M104 110V72a16 16 0 0 1 32 0v38z" />
        <path d="M0 110c20-10 40-14 60-10s50 0 100-6v16z" />
      </g>
      <g stroke="#0b2f2b" strokeWidth="2" opacity="0.8"><path d="M32 74h16M40 68v14" /></g>
    </svg>
  );
}

/** Capa decorativa (detrás del menú, sin clics). */
export function DecoracionHalloween({ colapsado }: { colapsado: boolean }) {
  if (colapsado) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 opacity-90"><Calabaza ancho={30} /></div>
        <Murcielago ancho={22} className="absolute left-5 top-[38%] hw-flotar" />
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <style>{`
        @keyframes hw-flotar { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
        @keyframes hw-aleteo { 0%,100% { transform: translateY(0) scaleY(1) } 50% { transform: translateY(-4px) scaleY(.82) } }
        .hw-flotar { animation: hw-flotar 5s ease-in-out infinite }
        .hw-aleteo { animation: hw-aleteo 2.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .hw-flotar, .hw-aleteo { animation: none } }
      `}</style>
      {/* Brillo cálido detrás de la luna */}
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.28), transparent 65%)' }} />
      <div className="absolute -right-12 -top-6 origin-top-right scale-[0.8] opacity-75"><LunaIglesia /></div>
      <Murcielago ancho={34} className="absolute right-24 top-3 hw-aleteo" />
      <Murcielago ancho={22} className="absolute right-6 top-[84px] hw-aleteo" style={{ animationDelay: '.8s' }} />
      <Murcielago ancho={44} className="absolute right-3 top-[15%] hw-aleteo" style={{ animationDelay: '.4s' }} />
      <Murcielago ancho={38} className="absolute right-10 top-[26%] hw-aleteo" style={{ animationDelay: '1.2s' }} />
      <div className="absolute -right-1 top-[29%]"><Telarana /></div>
      <div className="absolute right-12 top-[33%] hw-flotar" style={{ animationDuration: '6s' }}><Arana /></div>
      <div className="absolute -right-3 bottom-[22%] opacity-90"><ArbolSeco /></div>
      <div className="absolute -right-2 top-[50%] opacity-60 hw-flotar"><Fantasma ancho={44} /></div>
      <div className="absolute bottom-[29%] right-2 opacity-90"><Calabaza ancho={42} /></div>
      <div className="absolute -right-2 bottom-[14%] opacity-85"><Tumbas /></div>
      <Murcielago ancho={36} className="absolute bottom-[15%] right-12 hw-aleteo" style={{ animationDelay: '.6s' }} />
      <Murcielago ancho={26} className="absolute bottom-[12%] right-2 hw-aleteo" style={{ animationDelay: '1.6s' }} />
      {/* Neblina al pie */}
      <div className="absolute inset-x-0 bottom-0 h-40" style={{ background: 'linear-gradient(to top, rgba(4,26,24,0.55), transparent)' }} />
    </div>
  );
}

/** Calabaza pequeña que acompaña al ítem activo del menú. */
export function CalabazaItemActivo() {
  return <span className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2" aria-hidden><Calabaza ancho={40} /></span>;
}
