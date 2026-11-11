import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, LockKeyhole, MapPin } from 'lucide-react';
import { AvisoIngreso, BotonIngresar, CampoClave, CampoUsuario, FilaRecordar, MarcoIngreso, recordarUsuario, usuarioRecordado } from '../components/acceso/PantallaIngreso';
import { PantallaSuspension } from './PantallaSuspension';
import { PaginaNoDisponible } from './PaginaNoDisponible';
import { consultarEnlace, ingresar, leerSesionGuardada, obtenerUbicacion, rolDelEnlace, salirCuenta, verificarSesion, type SesionCuenta, type Ubicacion } from './apiCuentas';

// Puerta de entrada de los enlaces /interno y /piloto: nada del dashboard
// (ni los datos) se carga hasta ingresar con el usuario y la contraseña de la
// cuenta del enlace, validados en el servidor (accesoCuentas). Luego, cada 5
// minutos (y al volver a la pestaña) se confirma con el servidor que la
// sesión sigue abierta y la cuenta activa; si no, se cierra.
// El piloto, además, envía la ubicación del equipo (control complementario).

const esPiloto = () => rolDelEnlace() === 'piloto';
// Interno se confirma cada minuto (así una suspensión se aplica pronto); el
// piloto cada 5 (además pide la ubicación del equipo en cada verificación).
const INTERVALO_VERIFICACION_MS = esPiloto() ? 5 * 60 * 1000 : 60 * 1000;
// Mientras está suspendido se pregunta al servidor cada minuto si ya terminó.
const INTERVALO_SUSPENSION_MS = 60 * 1000;
// Cuenta desactivada: se pregunta cada 20 s (y al volver a la pestaña) para
// que, al activarla, el enlace vuelva enseguida.
const INTERVALO_DESACTIVADA_MS = 20 * 1000;

interface ContextoCuenta { sesion: SesionCuenta; salir: () => void }
const CuentaContext = createContext<ContextoCuenta | null>(null);
export const useSesionCuenta = () => useContext(CuentaContext);

type Estado =
  | { fase: 'verificando' }
  | { fase: 'consultando'; aviso?: string; automatico: boolean }
  | { fase: 'login'; aviso?: string; abierto?: boolean }
  | { fase: 'dentro'; sesion: SesionCuenta }
  | { fase: 'suspendido' }
  | { fase: 'desactivado' };

const MENSAJE_UBICACION: Record<string, string> = {
  denegada: 'El navegador tiene bloqueada la ubicación para este sitio. Actívala (ícono del candado junto a la dirección → Ubicación → Permitir) y vuelve a intentar.',
  tiempo: 'No se pudo obtener la ubicación a tiempo. Verifica que la ubicación del equipo esté encendida y vuelve a intentar.',
  'no-disponible': 'Este equipo o navegador no entrega ubicación. Activa la ubicación del equipo (o usa el celular) y vuelve a intentar.',
};

export function PuertaCuenta({ children }: { children: ReactNode }) {
  // Sin sesión guardada se consulta si el enlace tiene acceso directo (cuenta
  // sin contraseña): en ese caso se entra sin formulario. Si tiene
  // contraseña, se muestra el formulario de usuario y contraseña.
  const [estado, setEstado] = useState<Estado>(() => (leerSesionGuardada() ? { fase: 'verificando' } : { fase: 'consultando', automatico: true }));
  const sesionRef = useRef<SesionCuenta | null>(null);

  const cerrarCon = useCallback((aviso?: string) => {
    sesionRef.current = null;
    setEstado({ fase: 'consultando', aviso, automatico: false });
  }, []);

  // ¿Acceso directo? Al abrir el enlace entra solo; después de cerrar sesión
  // muestra el botón «Ingresar» (sin usuario ni contraseña).
  useEffect(() => {
    if (estado.fase !== 'consultando') return;
    const { aviso, automatico } = estado;
    let vivo = true;
    (async () => {
      const r = await consultarEnlace();
      if (!vivo) return;
      if (r.desactivado) { setEstado({ fase: 'desactivado' }); return; }
      if (r.suspendido) { setEstado({ fase: 'suspendido' }); return; }
      if (!r.abierto) { setEstado({ fase: 'login', aviso }); return; }
      if (!automatico) { setEstado({ fase: 'login', aviso, abierto: true }); return; }
      const ubic = esPiloto() ? await obtenerUbicacion() : null;
      const ing = await ingresar('', '', ubic);
      if (!vivo) return;
      const s = leerSesionGuardada();
      if (ing.ok && s) { sesionRef.current = s; setEstado({ fase: 'dentro', sesion: s }); return; }
      if (ing.motivo === 'desactivado') { setEstado({ fase: 'desactivado' }); return; }
      if (ing.motivo === 'suspendido') { setEstado({ fase: 'suspendido' }); return; }
      setEstado({ fase: 'login', abierto: true, aviso: ing.requiereUbicacion && ubic && 'error' in ubic ? `${ing.error} ${MENSAJE_UBICACION[ubic.error]}` : ing.error });
    })();
    return () => { vivo = false; };
  }, [estado]);

  const verificar = useCallback(async (s: SesionCuenta) => {
    const ubic = esPiloto() ? await obtenerUbicacion(12000) : null;
    const r = await verificarSesion(s, ubic);
    if (r.ok) return true;
    if (r.sinConexion) return true; // sin internet un momento: no se cierra
    if (r.motivo === 'suspendido') { sesionRef.current = null; setEstado({ fase: 'suspendido' }); return false; }
    if (r.motivo === 'desactivado') { sesionRef.current = null; setEstado({ fase: 'desactivado' }); return false; }
    cerrarCon(r.error || 'La sesión se cerró.');
    return false;
  }, [cerrarCon]);

  // Sesión guardada (recarga de la página): se confirma antes de mostrar nada.
  useEffect(() => {
    if (estado.fase !== 'verificando') return;
    const s = leerSesionGuardada();
    if (!s) { setEstado({ fase: 'consultando', automatico: true }); return; }
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

  // Una consulta de datos rechazada por suspensión lleva a la pantalla de
  // inmediato (sin esperar la verificación periódica).
  useEffect(() => {
    const alSuspender = () => { sesionRef.current = null; setEstado({ fase: 'suspendido' }); };
    window.addEventListener('mepoy-suspendido', alSuspender);
    return () => window.removeEventListener('mepoy-suspendido', alSuspender);
  }, []);

  // Suspendido: cada minuto se pregunta al servidor; cuando el administrador
  // la levanta o termina el tiempo, se vuelve a entrar (con la sesión
  // guardada, si la había, o con el ingreso normal del enlace).
  useEffect(() => {
    if (estado.fase !== 'suspendido') return;
    let vivo = true;
    const revisar = async () => {
      const r = await consultarEnlace();
      if (!vivo || !r.ok) return;
      if (r.desactivado) { setEstado({ fase: 'desactivado' }); return; }
      if (r.suspendido) return;
      setEstado(leerSesionGuardada() ? { fase: 'verificando' } : { fase: 'consultando', automatico: true });
    };
    const id = window.setInterval(revisar, INTERVALO_SUSPENSION_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, [estado.fase]);

  // Desactivada: cuando el administrador la activa, se vuelve al ingreso.
  useEffect(() => {
    if (estado.fase !== 'desactivado') return;
    let vivo = true;
    const revisar = async () => {
      const r = await consultarEnlace();
      if (!vivo || !r.ok || r.desactivado) return;
      setEstado(r.suspendido ? { fase: 'suspendido' } : { fase: 'consultando', automatico: true });
    };
    const id = window.setInterval(revisar, INTERVALO_DESACTIVADA_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [estado.fase]);

  const salir = useCallback(() => {
    const s = sesionRef.current;
    cerrarCon('Sesión cerrada.');
    salirCuenta(s);
  }, [cerrarCon]);

  if (estado.fase === 'desactivado') return <PaginaNoDisponible />;
  if (estado.fase === 'suspendido') return <PantallaSuspension />;
  if (estado.fase === 'dentro') {
    return <CuentaContext.Provider value={{ sesion: estado.sesion, salir }}>{children}</CuentaContext.Provider>;
  }
  if (estado.fase === 'verificando' || estado.fase === 'consultando') {
    // Fondo blanco y neutro: si el enlace resulta desactivado, no alcanza a
    // verse ni el logotipo ni la foto.
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <Loader2 size={26} className="animate-spin text-slate-300" aria-label="Verificando acceso" />
      </div>
    );
  }
  return (
    <FormularioIngreso
      aviso={estado.aviso}
      abierto={!!estado.abierto}
      onIngreso={(s) => { sesionRef.current = s; setEstado({ fase: 'dentro', sesion: s }); }}
      onSuspendido={() => setEstado({ fase: 'suspendido' })}
      onDesactivado={() => setEstado({ fase: 'desactivado' })}
    />
  );
}

function Fondo({ children }: { children: ReactNode }) {
  return <MarcoIngreso subtitulo={esPiloto() ? 'Acceso piloto de consulta al Sistema Integral de Información Policial –' : 'Acceda al Sistema Integral de Información Policial –'}>{children}</MarcoIngreso>;
}

function FormularioIngreso({ aviso, abierto, onIngreso, onSuspendido, onDesactivado }: { aviso?: string; abierto: boolean; onIngreso: (s: SesionCuenta) => void; onSuspendido: () => void; onDesactivado: () => void }) {
  const ambito = esPiloto() ? 'piloto' : 'interno';
  const [usuario, setUsuario] = useState(() => usuarioRecordado(ambito));
  const [recordar, setRecordar] = useState(() => !!usuarioRecordado(ambito));
  const [clave, setClave] = useState('');
  const [paso, setPaso] = useState<'listo' | 'ubicando' | 'validando'>('listo');
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!abierto && (!usuario || !clave)) { setError('Escribe tu usuario y tu contraseña.'); return; }
    setError(null);
    let ubic: Ubicacion | null = null;
    if (esPiloto()) {
      setPaso('ubicando');
      ubic = await obtenerUbicacion();
    }
    setPaso('validando');
    const r = await ingresar(abierto ? '' : usuario.trim(), abierto ? '' : clave, ubic);
    setPaso('listo');
    const s = leerSesionGuardada();
    if (r.ok && s) { if (!abierto) recordarUsuario(ambito, recordar ? usuario.trim() : null); onIngreso(s); return; }
    if (r.motivo === 'suspendido') { onSuspendido(); return; }
    if (r.motivo === 'desactivado') { onDesactivado(); return; }
    setClave('');
    setError(r.requiereUbicacion && ubic && 'error' in ubic ? `${r.error} ${MENSAJE_UBICACION[ubic.error]}` : (r.error || 'No fue posible ingresar.'));
  }

  const ocupado = paso !== 'listo';
  return (
    <Fondo>
      <form onSubmit={enviar} className="space-y-5">
        {aviso && <AvisoIngreso texto={aviso} />}
        {abierto ? (
          <AvisoIngreso tono="info" texto="Este enlace tiene acceso directo: no necesita usuario ni contraseña." />
        ) : (<>
          <CampoUsuario valor={usuario} onCambio={setUsuario} deshabilitado={ocupado} />
          <CampoClave valor={clave} onCambio={setClave} deshabilitado={ocupado} />
          <FilaRecordar recordar={recordar} onRecordar={setRecordar} ayudaClave="Solicite al administrador del S2IP que le genere una nueva contraseña desde «Cuentas de acceso»." />
        </>)}
        {error && <AvisoIngreso texto={error} tono="error" />}
        <BotonIngresar ocupado={ocupado} textoOcupado={paso === 'ubicando' ? 'Obteniendo ubicación…' : 'Validando…'} />
        <div className="space-y-1 text-center text-[12px] text-slate-500">
          {esPiloto() && <p className="flex items-center justify-center gap-1.5"><MapPin size={13} className="text-[#159089]" /> Se solicitará la ubicación del equipo.</p>}
          <p className="flex items-center justify-center gap-1.5"><LockKeyhole size={13} className="text-[#159089]" /> {esPiloto() ? 'Solo consulta y visualización.' : 'Acceso interno autorizado.'} La cuenta la gestiona el administrador del sistema.</p>
        </div>
      </form>
    </Fondo>
  );
}
