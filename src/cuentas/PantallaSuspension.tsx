import { Lock } from 'lucide-react';

// Pantalla de SERVICIO TEMPORALMENTE NO DISPONIBLE del enlace /interno.
// Solo muestra el aviso institucional: ningún módulo, cifra ni dato interno
// (el dashboard ni siquiera se monta mientras está activa). El estado lo
// decide el servidor; esta pantalla solo lo refleja.
export function PantallaSuspension() {
  return (
    <div
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#06232a] px-4 py-10 text-white"
      data-pantalla-suspension
      role="alert"
      aria-live="polite"
    >
      <style>{`
        @keyframes s2ip-fantasma { 0%,100% { opacity:.92; text-shadow:0 0 18px rgba(64,224,208,.25) } 50% { opacity:.78; text-shadow:0 0 30px rgba(64,224,208,.45) } }
        @keyframes s2ip-halo { 0%,100% { box-shadow:0 0 24px rgba(244,63,94,.45), inset 0 0 18px rgba(244,63,94,.25) } 50% { box-shadow:0 0 40px rgba(244,63,94,.7), inset 0 0 24px rgba(244,63,94,.35) } }
        @keyframes s2ip-deriva { 0% { transform:translateY(0) } 50% { transform:translateY(-6px) } 100% { transform:translateY(0) } }
        .s2ip-fantasma { animation:s2ip-fantasma 5s ease-in-out infinite }
        .s2ip-halo { animation:s2ip-halo 3.6s ease-in-out infinite }
        .s2ip-deriva { animation:s2ip-deriva 7s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) { .s2ip-fantasma,.s2ip-halo,.s2ip-deriva { animation:none } }
      `}</style>

      {/* Fondo: azul petróleo → verde oscuro, montañas y torres en silueta, puntos y ondas */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,#0f5f57_0%,#0a3d44_38%,#06232a_75%)]" />
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] w-full opacity-60" viewBox="0 0 1200 400" preserveAspectRatio="none">
        <path d="M0 260 L120 190 L230 240 L360 150 L470 220 L600 140 L720 210 L850 160 L980 230 L1090 180 L1200 220 L1200 400 L0 400 Z" fill="#0b3b40" />
        <path d="M0 310 L160 250 L300 300 L450 240 L600 290 L760 250 L900 300 L1050 260 L1200 300 L1200 400 L0 400 Z" fill="#082e33" />
        {/* Torres en silueta (genéricas) a la derecha */}
        <g fill="#0a3438">
          <rect x="1020" y="170" width="40" height="150" /><polygon points="1020,170 1040,130 1060,170" /><rect x="1037" y="112" width="6" height="20" />
          <rect x="1090" y="150" width="46" height="170" /><polygon points="1090,150 1113,104 1136,150" /><rect x="1110" y="84" width="6" height="22" />
          <rect x="1060" y="220" width="30" height="100" /><rect x="980" y="250" width="150" height="70" />
        </g>
        <path d="M0 360 C300 300 500 400 800 340 S1100 320 1200 350" stroke="#22c55e" strokeOpacity=".35" strokeWidth="3" fill="none" />
        <path d="M0 380 C320 330 560 410 860 360 S1120 345 1200 372" stroke="#2dd4bf" strokeOpacity=".25" strokeWidth="2" fill="none" />
      </svg>
      <div aria-hidden className="pointer-events-none absolute left-6 top-8 h-40 w-56 bg-[radial-gradient(#2dd4bf_1.2px,transparent_1.3px)] [background-size:14px_14px] opacity-25" />
      <div aria-hidden className="pointer-events-none absolute bottom-10 right-8 h-40 w-56 bg-[radial-gradient(#2dd4bf_1.2px,transparent_1.3px)] [background-size:14px_14px] opacity-25" />

      <div className="relative w-full max-w-[720px]">
        {/* Logotipo y título */}
        <div className="mb-20 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white p-[2px] shadow-lg ring-2 ring-[#2dd4bf]/40">
            <img src="/assets/escudo-sidebar.png" alt="Escudo Policía Nacional" className="h-full w-full object-contain" draggable={false} />
          </span>
          <p className="text-[22px] font-extrabold tracking-wide sm:text-[26px]">S2IP <span className="text-[#5eead4]">–</span> MEPOY</p>
        </div>

        {/* Tarjeta de vidrio */}
        <div className="s2ip-deriva relative rounded-3xl border border-[#2dd4bf]/40 bg-white/[0.06] px-5 pb-9 pt-16 text-center shadow-[0_0_40px_rgba(45,212,191,.18)] backdrop-blur-md sm:px-10">
          {/* Icono de acceso restringido */}
          <div className="s2ip-halo absolute left-1/2 top-0 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-rose-500 bg-[#0b1f2a]">
            <Lock size={52} strokeWidth={2.2} className="text-white" />
            <span aria-hidden className="absolute h-[5px] w-[120px] rotate-45 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,.8)]" />
          </div>

          <p className="mx-auto mt-2 inline-block rounded-full border border-rose-300/50 bg-gradient-to-r from-rose-700 to-rose-600 px-5 py-2 text-[14px] font-extrabold uppercase tracking-wide shadow-[0_0_24px_rgba(225,29,72,.45)] sm:text-[17px]">
            Servicio temporalmente no disponible
          </p>
          <h1 className="s2ip-fantasma mx-auto mt-6 max-w-[520px] text-[22px] font-bold leading-snug sm:text-[32px]">
            La plataforma se encuentra temporalmente fuera de servicio.
          </h1>
          <div className="mx-auto mt-8 h-px w-4/5 bg-gradient-to-r from-transparent via-[#2dd4bf]/60 to-transparent" />
          <p className="mt-5 flex items-center justify-center gap-3 text-[16px] italic text-white/90 sm:text-[18px]">
            <span aria-hidden className="hidden h-[2px] w-10 rounded bg-lime-400/80 sm:block" />
            Agradecemos su comprensión.
            <span aria-hidden className="hidden h-[2px] w-10 rounded bg-lime-400/80 sm:block" />
          </p>
        </div>
      </div>
    </div>
  );
}
