import { useState, type ReactNode } from 'react';
import {
  BarChart3, Eye, EyeOff, FileBarChart, Loader2, LockKeyhole, LogIn, MapPin, Monitor, ShieldAlert, ShieldCheck, TrendingUp, User,
} from 'lucide-react';

// Pantalla de inicio de sesión institucional del S2IP (administrador,
// /interno y /piloto). Solo es la presentación: cada puerta conserva su
// propia lógica de ingreso, validación y sesión.

const MODULOS = [
  { Icono: BarChart3, texto: 'Análisis delictivo' },
  { Icono: MapPin, texto: 'Georreferenciación y mapas' },
  { Icono: TrendingUp, texto: 'Tendencias y proyecciones' },
  { Icono: FileBarChart, texto: 'Reportes estratégicos' },
];

export function MarcoIngreso({ children, subtitulo = 'Acceda al Sistema Integral de Información Policial –', titulo = 'Iniciar sesión' }: { children: ReactNode; subtitulo?: string; titulo?: string }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#eef3f2] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:bg-[linear-gradient(150deg,#0b3b3a_0%,#0c4a44_40%,#0a5a4c_70%,#063c33_100%)]" data-pantalla-ingreso>
      {/* Pantallas grandes: vista de Popayán abajo a la izquierda y, encima, las
          curvas verdes/lima que separan el panel institucional del área clara. */}
      <img aria-hidden src="/assets/login-popayan.webp" alt="" className="pointer-events-none absolute bottom-0 left-0 hidden h-[34%] w-[64%] object-cover object-center [mask-image:linear-gradient(to_bottom,transparent,black_28%)] lg:block" draggable={false} />
      <FondoCurvas />
      {/* ── Panel institucional (izquierda) ── */}
      <section className="relative z-[1] flex flex-col overflow-hidden bg-[linear-gradient(150deg,#0b3b3a_0%,#0c4a44_40%,#0a5a4c_70%,#063c33_100%)] px-5 pb-6 pt-6 text-white sm:px-10 lg:min-h-[100dvh] lg:overflow-visible lg:bg-none lg:px-14 lg:pb-[34vh] lg:pt-10">
        <div aria-hidden className="pointer-events-none absolute -left-10 top-24 h-56 w-56 bg-[radial-gradient(#5eead4_1.3px,transparent_1.4px)] [background-size:14px_14px] opacity-20" />
        <div aria-hidden className="pointer-events-none absolute right-6 top-1/2 h-48 w-40 bg-[radial-gradient(#5eead4_1.3px,transparent_1.4px)] [background-size:14px_14px] opacity-15" />

        {/* Encabezado institucional */}
        <div className="relative flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white p-[3px] shadow-xl ring-2 ring-white/30 sm:h-24 sm:w-24">
            <img src="/assets/escudo-sidebar.png" alt="Escudo Policía Nacional de Colombia" className="h-full w-full object-contain" draggable={false} />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[15px] font-extrabold uppercase leading-tight tracking-wide sm:text-[19px]">
              Policía Nacional <br className="hidden sm:block" />de Colombia
              <span aria-hidden className="inline-flex h-3.5 w-6 shrink-0 flex-col overflow-hidden rounded-[2px] shadow">
                <span className="h-1/2 bg-[#fcd116]" /><span className="h-1/4 bg-[#003893]" /><span className="h-1/4 bg-[#ce1126]" />
              </span>
            </p>
            <p className="mt-1 border-l-2 border-white/40 pl-2.5 text-[12.5px] leading-snug text-white/90 sm:text-[15px]">Policía Metropolitana <br className="hidden sm:block" />de Popayán – <b>MEPOY</b></p>
          </div>
        </div>

        {/* Marca del sistema */}
        <div className="relative mt-7 flex items-center gap-4 sm:mt-12">
          <div aria-hidden className="relative hidden h-[86px] w-[112px] shrink-0 sm:block">
            <Monitor size={112} strokeWidth={1.6} className="absolute inset-0 text-[#5eead4] drop-shadow-[0_0_14px_rgba(94,234,212,.55)]" />
            <BarChart3 size={34} strokeWidth={2.4} className="absolute left-[24px] top-[24px] text-[#a7f3d0]" />
            <MapPin size={26} strokeWidth={2.4} className="absolute left-[62px] top-[18px] text-[#a7f3d0]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[34px] font-black italic leading-none tracking-tight sm:text-[54px] lg:text-[60px]">
              S2<span className="text-[#2dd4bf]">IP</span> <span className="text-white">– MEPOY</span>
            </h1>
            <p className="mt-1.5 text-[14px] font-semibold italic text-white/95 sm:text-[20px]">Sistema Integral de Información Policial</p>
          </div>
        </div>

        <div className="relative mt-5 -skew-x-[14deg] rounded-md border border-[#4ade80]/70 bg-[linear-gradient(90deg,rgba(34,197,94,.35),rgba(15,95,87,.25))] px-5 py-2.5 shadow-[0_0_24px_rgba(74,222,128,.25)] sm:mt-7 sm:max-w-[600px]">
          <p className="skew-x-[14deg] text-center text-[16px] font-bold italic sm:text-[24px]">Dashboard de Análisis Delictivo</p>
        </div>

        <p className="relative mt-5 hidden max-w-[600px] text-[15px] leading-relaxed text-white/90 sm:block lg:text-[17px]">
          Plataforma institucional para la integración, análisis y visualización de información delictiva, operativa y territorial, que apoya la toma de decisiones en la MEPOY.
        </p>

        <ul className="relative mt-6 hidden max-w-[640px] grid-cols-4 gap-3 sm:grid">
          {MODULOS.map(({ Icono, texto }) => (
            <li key={texto} className="flex flex-col items-center gap-2 rounded-xl border border-[#2dd4bf]/35 bg-white/[0.06] px-2 py-3.5 text-center text-[12.5px] font-medium leading-tight backdrop-blur-sm lg:text-[13.5px]">
              <Icono size={30} strokeWidth={2.2} className="text-[#4ade80]" />
              {texto}
            </li>
          ))}
        </ul>

        {/* Popayán */}
        <div aria-hidden className="relative -mx-5 mt-8 hidden h-[200px] shrink-0 sm:-mx-10 sm:block lg:hidden">
          <img src="/assets/login-popayan.webp" alt="" className="h-full w-full object-cover object-center [mask-image:linear-gradient(to_bottom,transparent,black_30%)]" draggable={false} />
          <svg className="absolute inset-x-0 bottom-0 h-16 w-full" viewBox="0 0 800 64" preserveAspectRatio="none">
            <path d="M0 40 C200 10 420 70 800 22 L800 64 L0 64 Z" fill="#063c33" />
            <path d="M0 40 C200 10 420 70 800 22" stroke="#4ade80" strokeWidth="3" fill="none" />
          </svg>
        </div>
      </section>

      {/* ── Tarjeta de ingreso (derecha) ── */}
      <section className="relative z-[1] flex items-start justify-center px-4 pb-10 pt-6 sm:px-8 lg:min-h-[100dvh] lg:items-center lg:py-12">
        <div aria-hidden className="pointer-events-none absolute right-8 top-8 hidden h-40 w-40 bg-[radial-gradient(#94a3b8_1.1px,transparent_1.2px)] [background-size:14px_14px] opacity-40 lg:block" />
        <p className="absolute right-6 top-5 hidden items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[13px] font-semibold text-[#10233f] shadow-md lg:flex">
          <ShieldCheck size={18} className="text-[#159089]" /> Acceso seguro y controlado
        </p>

        <div className="relative w-full max-w-[540px] rounded-[28px] bg-white px-6 pb-7 pt-7 shadow-[0_24px_60px_rgba(16,35,63,.16)] sm:px-10 lg:mt-12 [@media(max-height:820px)]:py-5">
          <span className="inline-flex overflow-hidden rounded-full text-[14px] font-extrabold shadow">
            <span className="bg-[#0f5f57] px-4 py-1.5 text-white">S2IP – MEPOY</span>
            <span className="bg-[#84cc16] px-3 py-1.5 text-[#10233f]">v2.0</span>
          </span>
          <div className="mt-3 flex justify-center">
            <img src="/assets/escudo-sidebar.png" alt="" className="h-24 w-24 object-contain drop-shadow-md sm:h-28 sm:w-28 [@media(max-height:820px)]:h-20 [@media(max-height:820px)]:w-20" draggable={false} />
          </div>
          <h2 className="mt-3 text-center text-[30px] font-extrabold tracking-tight text-[#10233f] sm:text-[36px]">{titulo}</h2>
          <p className="mt-1 text-center text-[14px] text-slate-600 sm:text-[15px]">{subtitulo} <b className="text-[#10233f]">S2IP.</b></p>
          <div className="mt-6">{children}</div>
          <p className="mt-6 flex items-center gap-3 rounded-xl bg-[#eef6f3] px-4 py-3 text-[13px] leading-snug text-[#10233f]">
            <ShieldCheck size={26} className="shrink-0 text-[#159089]" />
            <span>Uso exclusivo para personal autorizado de la Policía Metropolitana de <b>Popayán – MEPOY</b>.</span>
          </p>
        </div>
      </section>
    </div>
  );
}

// Curvas del fondo (pantallas grandes), en coordenadas de 1672 × 941 que se
// estiran a toda la pantalla: borde ondulado del panel verde con franjas
// verde/lima, destello superior, onda sobre la ciudad y esquina inferior derecha.
function FondoCurvas() {
  const borde = 'M1000,0 C905,170 830,330 862,520 C893,705 965,842 1068,941';
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full lg:block" viewBox="0 0 1672 941" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ing-lima" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0f766e" /><stop offset=".55" stopColor="#22c55e" /><stop offset="1" stopColor="#bef264" /></linearGradient>
        <linearGradient id="ing-borde" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4ade80" /><stop offset=".5" stopColor="#a3e635" /><stop offset="1" stopColor="#22c55e" /></linearGradient>
        <linearGradient id="ing-claro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f8fafa" /><stop offset="1" stopColor="#e6eeec" /></linearGradient>
        <pattern id="ing-puntos" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#94a3b8" /></pattern>
      </defs>
      {/* Destello verde superior sobre el panel */}
      <path d="M180,0 C420,175 760,150 1000,0 Z" fill="#16a34a" opacity=".16" />
      <path d="M180,0 C420,175 760,150 1000,0" stroke="#4ade80" strokeWidth="3" fill="none" opacity=".55" />
      <path d="M420,0 C600,95 820,80 1000,0" stroke="#a3e635" strokeWidth="2" fill="none" opacity=".35" />
      {/* Onda oscura con línea lima sobre la parte baja de la ciudad */}
      <path d="M0,705 C230,835 560,905 1068,941 L0,941 Z" fill="#053d33" opacity=".92" />
      <path d="M0,705 C230,835 560,905 1068,941" stroke="#a3e635" strokeWidth="6" fill="none" />
      <path d="M0,690 C230,815 560,885 1040,941" stroke="#22c55e" strokeWidth="2.5" fill="none" opacity=".7" />
      {/* Área clara a la derecha del borde ondulado */}
      <path d={`${borde} L1672,941 L1672,0 Z`} fill="url(#ing-claro)" />
      <rect x="1440" y="40" width="180" height="150" fill="url(#ing-puntos)" opacity=".45" />
      <rect x="1500" y="730" width="140" height="120" fill="url(#ing-puntos)" opacity=".3" />
      {/* Franjas del borde: halo verde oscuro, verde y lima */}
      <path d={borde} stroke="#0f766e" strokeWidth="58" fill="none" opacity=".55" />
      <path d={borde} stroke="#22c55e" strokeWidth="24" fill="none" opacity=".85" />
      <path d={borde} stroke="url(#ing-borde)" strokeWidth="8" fill="none" />
      {/* Esquina inferior derecha verde → lima */}
      <path d="M1410,941 C1540,900 1630,800 1672,640 L1672,941 Z" fill="url(#ing-lima)" />
      <path d="M1340,941 C1500,885 1615,770 1672,575" stroke="#22c55e" strokeWidth="9" fill="none" opacity=".75" />
      <path d="M1300,941 C1470,875 1600,750 1672,545" stroke="#bef264" strokeWidth="3" fill="none" opacity=".8" />
    </svg>
  );
}

const claseCampo = 'w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-3 text-[15px] text-[#10233f] placeholder:text-slate-400 focus:border-[#159089] focus:outline-none focus:ring-2 focus:ring-[#159089]/20 disabled:bg-slate-50';

export function CampoUsuario({ valor, onCambio, deshabilitado }: { valor: string; onCambio: (v: string) => void; deshabilitado?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[14px] font-bold text-[#10233f]"><User size={17} /> Usuario institucional</span>
      <span className="relative block">
        <User size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="text" value={valor} onChange={(e) => onCambio(e.target.value)} disabled={deshabilitado} placeholder="Ingrese su usuario" autoComplete="username" autoCapitalize="none" spellCheck={false} className={claseCampo} />
      </span>
    </label>
  );
}

export function CampoClave({ valor, onCambio, deshabilitado }: { valor: string; onCambio: (v: string) => void; deshabilitado?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-2 text-[14px] font-bold text-[#10233f]"><LockKeyhole size={17} /> Contraseña</span>
      <span className="relative block">
        <LockKeyhole size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type={ver ? 'text' : 'password'} value={valor} onChange={(e) => onCambio(e.target.value)} disabled={deshabilitado} placeholder="Ingrese su contraseña" autoComplete="current-password" className={`${claseCampo} pr-11`} />
        <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-[#10233f]">
          {ver ? <Eye size={19} /> : <EyeOff size={19} />}
        </button>
      </span>
    </label>
  );
}

// «Recordar mi sesión»: solo recuerda el USUARIO en este navegador (nunca la
// contraseña ni alarga la sesión). «¿Olvidó su contraseña?»: indica a quién
// pedirla; no existe recuperación automática.
const claveRecordar = (ambito: string) => `mepoy-usuario-recordado:${ambito}`;
export function usuarioRecordado(ambito: string): string {
  try { return localStorage.getItem(claveRecordar(ambito)) ?? ''; } catch { return ''; }
}
export function recordarUsuario(ambito: string, usuario: string | null) {
  try { if (usuario) localStorage.setItem(claveRecordar(ambito), usuario); else localStorage.removeItem(claveRecordar(ambito)); } catch { /* sin almacenamiento */ }
}

export function FilaRecordar({ recordar, onRecordar, ayudaClave }: { recordar: boolean; onRecordar: (v: boolean) => void; ayudaClave: string }) {
  const [verAyuda, setVerAyuda] = useState(false);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
        <label className="flex cursor-pointer items-center gap-2 text-slate-700" title="Recuerda solo su usuario en este equipo">
          <input type="checkbox" checked={recordar} onChange={(e) => onRecordar(e.target.checked)} className="h-[18px] w-[18px] rounded border-slate-400 accent-[#0f5f57]" />
          Recordar mi sesión
        </label>
        <button type="button" onClick={() => setVerAyuda((v) => !v)} className="font-semibold text-[#159089] hover:underline">¿Olvidó su contraseña?</button>
      </div>
      {verAyuda && <p className="mt-2 rounded-lg border border-[#cfe8e2] bg-[#eef8f5] p-2.5 text-[12.5px] text-[#0b4a46]">{ayudaClave}</p>}
    </div>
  );
}

export function BotonIngresar({ ocupado, texto = 'Ingresar al sistema', textoOcupado = 'Validando…' }: { ocupado: boolean; texto?: string; textoOcupado?: string }) {
  return (
    <button type="submit" disabled={ocupado} className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[linear-gradient(90deg,#0f5f57,#11795f)] px-4 py-3.5 text-[17px] font-bold text-white shadow-lg shadow-[#0f5f57]/25 transition hover:brightness-110 disabled:opacity-70">
      {ocupado ? <Loader2 size={20} className="animate-spin" /> : <LogIn size={20} />}
      {ocupado ? textoOcupado : texto}
    </button>
  );
}

export function AvisoIngreso({ texto, tono = 'aviso' }: { texto: string; tono?: 'aviso' | 'error' | 'info' }) {
  const clase = tono === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : tono === 'info' ? 'border-[#cfe8e2] bg-[#eef8f5] text-[#0b4a46]' : 'border-amber-200 bg-amber-50 text-amber-800';
  return (
    <p className={`flex items-start gap-2 rounded-xl border p-3 text-[13px] ${clase}`}>
      <ShieldAlert size={16} className="mt-[1px] shrink-0" /> {texto}
    </p>
  );
}
