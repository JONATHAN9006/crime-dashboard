import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn, MapPin, ShieldAlert } from 'lucide-react';
import { ingresar, leerSesionGuardada, obtenerUbicacion, rolDelEnlace, salirCuenta, verificarSesion, type SesionCuenta, type Ubicacion } from './apiCuentas';

// Puerta de entrada de los enlaces /interno y /piloto: nada del dashboard
// (ni los datos) se carga hasta ingresar con el usuario y la contraseña de la
// cuenta del enlace, validados en el servidor (accesoCuentas). Luego, cada 5
// minutos (y al volver a la pestaña) se confirma con el servidor que la
// sesión sigue abierta y la cuenta activa; si no, se cierra.
// El piloto, además, envía la ubicación del equipo (control complementario).

const INTERVALO_VERIFICACION_MS = 5 * 60 * 1000;
const esPiloto = () => rolDelEnlace() === 'piloto';

interface ContextoCuenta { sesion: SesionCuenta; salir: () => void }
const CuentaContext = createContext<ContextoCuenta | null>(null);
export const useSesionCuenta = () => useContext(CuentaContext);

type Estado =
  | { fase: 'verificando' }
  | { fase: 'login'; aviso?: string }
  | { fase: 'dentro'; sesion: SesionCuenta };

const MENSAJE_UBICACION: Record<string, string> = {
  denegada: 'El navegador tiene bloqueada la ubicación para este sitio. Actívala (ícono del candado junto a la dirección → Ubicación → Permitir) y vuelve a intentar.',
  tiempo: 'No se pudo obtener la ubicación a tiempo. Verifica que la ubicación del equipo esté encendida y vuelve a intentar.',
  'no-disponible': 'Este equipo o navegador no entrega ubicación. Activa la ubicación del equipo (o usa el celular) y vuelve a intentar.',
};

export function PuertaCuenta({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>(() => (leerSesionGuardada() ? { fase: 'verificando' } : { fase: 'login' }));
  const sesionRef = useRef<SesionCuenta | null>(null);

  const cerrarCon = useCallback((aviso?: string) => {
    sesionRef.current = null;
    setEstado({ fase: 'login', aviso });
  }, []);

  const verificar = useCallback(async (s: SesionCuenta) => {
    const ubic = esPiloto() ? await obtenerUbicacion(12000) : null;
    const r = await verificarSesion(s, ubic);
    if (r.ok) return true;
    if (r.sinConexion) return true; // sin internet un momento: no se cierra
    cerrarCon(r.error || 'La sesión se cerró.');
    return false;
  }, [cerrarCon]);

  // Sesión guardada (recarga de la página): se confirma antes de mostrar nada.
  useEffect(() => {
    if (estado.fase !== 'verificando') return;
    const s = leerSesionGuardada();
    if (!s) { setEstado({ fase: 'login' }); return; }
    verificar(s).then((ok) => {
      if (ok) { sesionRef.current = leerSesionGuardada() ?? s; setEstado({ fase: 'dentro', sesion: sesionRef.current }); }
    });
  }, [estado.fase, verificar]);

  // Verificación periódica mientras está dentro.
  useEffect(() => {
    if (estado.fase !== 'dentro') return;
    const s = estado.sesion;
    const id = window.setInterval(() => { if (sesionRef.current) verificar(s); }, INTERVALO_VERIFICACION_MS);
    let ultima = Date.now();
    const alVolver = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultima > 60_000 && sesionRef.current) {
        ultima = Date.now();
        verificar(s);
      }
    };
    document.addEventListener('visibilitychange', alVolver);
    const vence = window.setTimeout(() => cerrarCon('La sesión expiró (12 horas). Vuelve a ingresar.'), Math.max(0, s.expira - Date.now()));
    return () => { window.clearInterval(id); window.clearTimeout(vence); document.removeEventListener('visibilitychange', alVolver); };
  }, [estado, verificar, cerrarCon]);

  const salir = useCallback(() => {
    const s = sesionRef.current;
    cerrarCon('Sesión cerrada.');
    salirCuenta(s);
  }, [cerrarCon]);

  if (estado.fase === 'dentro') {
    return <CuentaContext.Provider value={{ sesion: estado.sesion, salir }}>{children}</CuentaContext.Provider>;
  }
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
  return (
    <FormularioIngreso
      aviso={estado.aviso}
      onIngreso={(s) => { sesionRef.current = s; setEstado({ fase: 'dentro', sesion: s }); }}
    />
  );
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
            <p className="text-[17px] font-bold leading-tight text-[#10233f]">Análisis Delictivo</p>
            <p className="text-[12.5px] text-slate-500">{esPiloto() ? 'MEPOY — Acceso piloto (consulta)' : 'MEPOY — Acceso interno'}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormularioIngreso({ aviso, onIngreso }: { aviso?: string; onIngreso: (s: SesionCuenta) => void }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [paso, setPaso] = useState<'listo' | 'ubicando' | 'validando'>('listo');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario || !clave) { setError('Escribe tu usuario y tu contraseña.'); return; }
    setError(null);
    let ubic: Ubicacion | null = null;
    if (esPiloto()) {
      setPaso('ubicando');
      ubic = await obtenerUbicacion();
    }
    setPaso('validando');
    const r = await ingresar(usuario.trim(), clave, ubic);
    setPaso('listo');
    const s = leerSesionGuardada();
    if (r.ok && s) { onIngreso(s); return; }
    setClave('');
    setError(r.requiereUbicacion && ubic && 'error' in ubic ? `${r.error} ${MENSAJE_UBICACION[ubic.error]}` : (r.error || 'No fue posible ingresar.'));
  }

  const ocupado = paso !== 'listo';
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
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            disabled={ocupado}
            placeholder="Tu usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-[#10233f] focus:border-[#116762] focus:outline-none focus:ring-2 focus:ring-[#116762]/20"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold text-[#10233f]">Contraseña</span>
          <div className="relative">
            <input
              type={verClave ? 'text' : 'password'}
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              disabled={ocupado}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-[14px] text-[#10233f] focus:border-[#116762] focus:outline-none focus:ring-2 focus:ring-[#116762]/20"
            />
            <button type="button" onClick={() => setVerClave((v) => !v)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-[#10233f]">
              {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        {error && <p className="rounded-lg bg-rose-50 p-2.5 text-[12.5px] text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={ocupado}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#10233f] px-4 py-2.5 text-[14px] font-bold text-white hover:bg-[#1c3557] disabled:opacity-70"
        >
          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          {paso === 'ubicando' ? 'Obteniendo ubicación…' : paso === 'validando' ? 'Validando…' : 'Ingresar'}
        </button>
        <div className="space-y-1.5 border-t border-slate-100 pt-3 text-[11.5px] leading-snug text-slate-500">
          {esPiloto() && <p className="flex items-start gap-1.5"><MapPin size={13} className="mt-[1px] shrink-0 text-[#116762]" /> Se solicitará la ubicación del equipo.</p>}
          <p className="flex items-start gap-1.5"><LockKeyhole size={13} className="mt-[1px] shrink-0 text-[#116762]" /> {esPiloto() ? 'Solo consulta y visualización.' : 'Acceso interno autorizado.'} La cuenta la administra el administrador del sistema.</p>
        </div>
      </form>
    </Fondo>
  );
}
