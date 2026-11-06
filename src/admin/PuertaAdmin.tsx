import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { AvisoIngreso, BotonIngresar, CampoClave, CampoUsuario, FilaRecordar, MarcoIngreso, recordarUsuario, usuarioRecordado } from '../components/acceso/PantallaIngreso';

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
/** Sesión guardada aunque esté vencida (solo para registrar su expiración en la bitácora). */
function leerCrudo(): Sesion | null {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (s && typeof s.token === 'string' && typeof s.expira === 'number') return s;
  } catch { /* sin almacenamiento */ }
  return null;
}
/** Deja constancia del cierre en la bitácora (no bloquea ni cambia el cierre en sí). */
function registrarCierre(accion: 'salir' | 'expirada', token: string) {
  try {
    void fetch(FUNCION, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, token }) }).catch(() => {});
  } catch { /* sin conexión: el cierre ocurre igual */ }
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
  const [estado, setEstado] = useState<Estado>(() => {
    if (leer()) return { fase: 'verificando' };
    // La sesión venció con el dashboard cerrado: se registra la expiración.
    const vieja = leerCrudo();
    if (vieja) { registrarCierre('expirada', vieja.token); guardar(null); }
    return { fase: 'login' };
  });

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
    const id = window.setTimeout(() => { if (s) registrarCierre('expirada', s.token); guardar(null); setEstado({ fase: 'login', aviso: 'La sesión expiró (12 horas). Vuelve a ingresar.' }); }, ms);
    return () => window.clearTimeout(id);
  }, [estado.fase]);

  const salir = useCallback(() => { const s = leer(); if (s) registrarCierre('salir', s.token); guardar(null); setEstado({ fase: 'login', aviso: 'Sesión cerrada.' }); }, []);

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
  return <MarcoIngreso>{children}</MarcoIngreso>;
}

function Formulario({ aviso, onIngreso }: { aviso?: string; onIngreso: () => void }) {
  const [usuario, setUsuario] = useState(() => usuarioRecordado('administrador'));
  const [recordar, setRecordar] = useState(() => !!usuarioRecordado('administrador'));
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !clave) { setError('Escribe el usuario y la contraseña.'); return; }
    setError(null);
    setOcupado(true);
    const r = await llamar({ accion: 'login', usuario: usuario.trim(), clave });
    setOcupado(false);
    if (r.ok && r.token && r.expira) { recordarUsuario('administrador', recordar ? usuario.trim() : null); guardar({ token: r.token, expira: r.expira }); onIngreso(); return; }
    setClave('');
    setError(r.error || 'No fue posible ingresar.');
  }

  return (
    <Fondo>
      <form onSubmit={enviar} className="space-y-5">
        {aviso && <AvisoIngreso texto={aviso} />}
        <CampoUsuario valor={usuario} onCambio={setUsuario} deshabilitado={ocupado} />
        <CampoClave valor={clave} onCambio={setClave} deshabilitado={ocupado} />
        <FilaRecordar recordar={recordar} onRecordar={setRecordar} ayudaClave="La contraseña del administrador la gestiona el responsable técnico del S2IP. Comuníquese con él para restablecerla." />
        {error && <AvisoIngreso texto={error} tono="error" />}
        <BotonIngresar ocupado={ocupado} />
        <p className="flex items-center justify-center gap-1.5 text-[12px] text-slate-500">
          <LockKeyhole size={13} className="text-[#159089]" /> Acceso de administrador · la sesión se cierra sola a las 12 horas.
        </p>
      </form>
    </Fondo>
  );
}
