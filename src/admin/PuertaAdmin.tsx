import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn, ShieldAlert } from 'lucide-react';

// Puerta del ENLACE PRINCIPAL (administrador): nada del dashboard se carga
// hasta ingresar con usuario y contraseña. La validación la hace el servidor
// (netlify/functions/accesoAdmin.ts); aquí solo se guarda el token de sesión
// firmado (12 horas). /interno y /piloto tienen su propia puerta (PuertaCuenta).

const FUNCION = '/.netlify/functions/accesoAdmin';
const CLAVE = 'mepoy-admin-sesion';

interface Sesion { token: string; expira: number }
interface ContextoAdmin { salir: () => void }
const AdminContext = createContext<ContextoAdmin | null>(null);
export const useSesionAdmin = () => useContext(AdminContext);

function leer(): Sesion | null {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (s && typeof s.token === 'string' && s.expira > Date.now()) return s;
  } catch { /* sin almacenamiento */ }
  return null;
}
function guardar(s: Sesion | null) {
  try { if (s) localStorage.setItem(CLAVE, JSON.stringify(s)); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}
async function llamar(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; error?: string; token?: string; expira?: number; sinConexion?: boolean }> {
  try {
    const r = await fetch(FUNCION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    try { return await r.json(); } catch { return { ok: false, error: `El servidor de acceso no respondió correctamente (HTTP ${r.status}).` }; }
  } catch {
    return { ok: false, sinConexion: true, error: 'Sin conexión con el servidor. Revisa el internet e intenta de nuevo.' };
  }
}

type Estado = { fase: 'verificando' } | { fase: 'login'; aviso?: string } | { fase: 'dentro' };

export function PuertaAdmin({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(() => (leer() ? { fase: 'verificando' } : { fase: 'login' }));

  useEffect(() => {
    if (estado.fase !== 'verificando') return;
    const s = leer();
    if (!s) { setEstado({ fase: 'login' }); return; }
    llamar({ accion: 'verificar', token: s.token }).then((r) => {
      if (r.ok || r.sinConexion) setEstado({ fase: 'dentro' });
      else { guardar(null); setEstado({ fase: 'login', aviso: r.error }); }
    });
  }, [estado.fase]);

  // Cierre automático al vencer las 12 horas.
  useEffect(() => {
    if (estado.fase !== 'dentro') return;
    const s = leer();
    const ms = s ? Math.max(0, s.expira - Date.now()) : 0;
    const id = window.setTimeout(() => { guardar(null); setEstado({ fase: 'login', aviso: 'La sesión expiró (12 horas). Vuelve a ingresar.' }); }, ms);
    return () => window.clearTimeout(id);
  }, [estado.fase]);

  const salir = useCallback(() => { guardar(null); setEstado({ fase: 'login', aviso: 'Sesión cerrada.' }); }, []);

  if (estado.fase === 'dentro') return <AdminContext.Provider value={{ salir }}>{children}</AdminContext.Provider>;
  if (estado.fase === 'verificando') {
    return (
      <Fondo>
        <div className="flex flex-col items-center gap-3 py-6 text-[#10233f]">
          <Loader2 size={28} className="animate-spin text-[#116762]" />
          <p className="text-sm font-semibold">Verificando acceso…</p>
        </div>
      </Fondo>
    );
  }
  return <Formulario aviso={estado.aviso} onIngreso={() => setEstado({ fase: 'dentro' })} />;
}

function Fondo({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,#116762_0%,#0a3d39_45%,#10233f_100%)] px-4 py-8">
      <div className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white p-[2px] shadow ring-2 ring-[#e3f2ef]">
            <img src="/assets/escudo-sidebar.png" alt="Escudo Policía Nacional" className="h-full w-full object-contain" draggable={false} />
          </div>
          <div className="min-w-0">
            <p className="text-[12.5px] font-extrabold uppercase leading-tight text-[#10233f]">Sistema Integral de Información Policial</p>
            <p className="text-[12.5px] font-bold text-[#116762]">— MEPOY <span className="font-medium text-slate-500">· Acceso administrador</span></p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Formulario({ aviso, onIngreso }: { aviso?: string; onIngreso: () => void }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !clave) { setError('Escribe el usuario y la contraseña.'); return; }
    setError(null);
    setOcupado(true);
    const r = await llamar({ accion: 'login', usuario: usuario.trim(), clave });
    setOcupado(false);
    if (r.ok && r.token && r.expira) { guardar({ token: r.token, expira: r.expira }); onIngreso(); return; }
    setClave('');
    setError(r.error || 'No fue posible ingresar.');
  }

  const campo = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-[14px] text-[#10233f] focus:border-[#116762] focus:outline-none focus:ring-2 focus:ring-[#116762]/20';
  return (
    <Fondo>
      <form onSubmit={enviar} className="space-y-4">
        {aviso && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12.5px] text-amber-800">
            <ShieldAlert size={15} className="mt-[1px] shrink-0" /> {aviso}
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-[#10233f]">Usuario</span>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} disabled={ocupado} autoComplete="username" className={campo} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-[#10233f]">Contraseña</span>
          <div className="relative">
            <input type={ver ? 'text' : 'password'} value={clave} onChange={(e) => setClave(e.target.value)} disabled={ocupado} autoComplete="current-password" className={`${campo} pr-10`} />
            <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-[#10233f]">
              {ver ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        {error && <p className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">{error}</p>}
        <button type="submit" disabled={ocupado} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#10233f] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#1c3557] disabled:opacity-70">
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          {ocupado ? 'Validando…' : 'Ingresar'}
        </button>
        <p className="flex items-start gap-1.5 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500">
          <LockKeyhole size={13} className="mt-[1px] shrink-0 text-[#116762]" /> Acceso exclusivo del administrador. La sesión se cierra sola a las 12 horas.
        </p>
      </form>
    </Fondo>
  );
}
