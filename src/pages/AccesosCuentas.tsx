import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, Copy, Crown, Download, Eraser, Info, KeyRound, Link2, Loader2, LockKeyhole, MapPin, MapPinned,
  MoreVertical, Power, RefreshCw, Search, Settings, ShieldAlert, ShieldX, Sparkles, User, UserCheck, UserX, Users, XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { puedeDescargar } from '../utils/permisos';
import clsx from 'clsx';
import {
  adminAsignarClave, adminCambiarAmbito, adminCambiarEstado, adminCerrarSesiones, adminGenerarClave, adminQuitarClave, adminResumen,
  type CuentaAcceso, type EventoBitacora, type ResumenCuentas, type RolCuenta,
} from '../cuentas/apiCuentas';

// Panel del ADMINISTRADOR: las TRES cuentas del S2IP (una por enlace) — no
// existe forma de crear otras, ni aquí ni en el servidor (la base solo
// admite administrador, interno y piloto). Todas las acciones se validan en
// el servidor con la sesión del administrador.

const NOMBRE_ROL: Record<RolCuenta, string> = { administrador: 'Administrador', interno: 'Usuario interno', piloto: 'Usuario piloto' };
const DESCRIPCION_ROL: Record<RolCuenta, string> = {
  administrador: 'Control total del sistema y la información.',
  interno: 'Acceso a funcionalidades internas del S2IP.',
  piloto: 'Consulta y visualización con restricción territorial.',
};

// Estilo de cada cuenta (color de acento, ícono y caja de permisos).
const ESTILO_ROL: Record<RolCuenta, { acento: string; suave: string; caja: string; check: string; Icono: typeof Crown }> = {
  administrador: { acento: '#159089', suave: '#e3f2ef', caja: 'bg-[#eaf6f2]', check: 'text-[#159089]', Icono: Crown },
  interno: { acento: '#2563eb', suave: '#e6eeff', caja: 'bg-[#eef3ff]', check: 'text-[#2563eb]', Icono: Users },
  piloto: { acento: '#7c3aed', suave: '#efe8ff', caja: 'bg-[#f4effe]', check: 'text-[#7c3aed]', Icono: MapPin },
};

/** Permisos principales de cada cuenta (según dashboardAccess.ts y las validaciones del servidor). */
function permisosDe(c: CuentaAcceso): { texto: string; permitido: boolean }[] {
  if (c.rol === 'administrador') return [
    { texto: 'Administración del sistema', permitido: true },
    { texto: 'Gestión de cuentas y contraseñas', permitido: true },
    { texto: 'Acceso a toda la información y módulos', permitido: true },
    { texto: 'Carga y actualización de información', permitido: true },
  ];
  if (c.rol === 'interno') return [
    { texto: 'Consulta y análisis de información', permitido: true },
    { texto: 'Visualización de tableros y mapas', permitido: true },
    { texto: 'Descargas y herramientas de análisis', permitido: true },
    { texto: 'Sin acceso a la gestión de cuentas', permitido: false },
  ];
  return [
    { texto: 'Consulta de información delictiva', permitido: true },
    { texto: 'Visualización de tableros y mapas (6 módulos)', permitido: true },
    { texto: c.ambito === 'popayan' ? 'Restricción territorial: solo Popayán' : 'Territorio: toda la jurisdicción MEPOY', permitido: true },
    { texto: 'Sin cargas, descargas ni configuración', permitido: false },
  ];
}

const FALLIDOS = new Set(['fallido', 'rechazado', 'bloqueado']);
function resultadoDe(evento: string): { texto: string; clase: string } {
  if (FALLIDOS.has(evento)) return { texto: 'Fallido', clase: 'bg-rose-50 text-rose-700' };
  if (evento === 'seguridad') return { texto: 'Alerta', clase: 'bg-amber-50 text-amber-800' };
  return { texto: 'Exitoso', clase: 'bg-emerald-50 text-emerald-700' };
}
const isoDia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
const EVENTO: Record<string, { texto: string; clase: string }> = {
  ingreso: { texto: 'Ingreso', clase: 'bg-emerald-50 text-emerald-700' },
  salida: { texto: 'Salida', clase: 'bg-slate-100 text-slate-600' },
  fallido: { texto: 'Intento fallido', clase: 'bg-rose-50 text-rose-700' },
  rechazado: { texto: 'Rechazado', clase: 'bg-amber-50 text-amber-800' },
  bloqueado: { texto: 'Bloqueado', clase: 'bg-rose-100 text-rose-800' },
  cerrada: { texto: 'Sesión cerrada', clase: 'bg-amber-50 text-amber-800' },
  seguridad: { texto: 'Seguridad', clase: 'bg-violet-50 text-violet-700' },
  admin: { texto: 'Administración', clase: 'bg-sky-50 text-sky-700' },
};

const fechaHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', year: 'numeric' }) : '');
const diaBogota = (d: Date) => d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });

/** Contador para el menú lateral: ingresos de hoy y sesiones activas. */
export function useContadorCuentas(activo: boolean) {
  const [contador, setContador] = useState<{ hoy: number; enLinea: number } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const cargar = async () => {
      const r = await adminResumen(1);
      if (!vivo || !r.ok) return;
      const hoy = diaBogota(new Date());
      setContador({
        hoy: (r.bitacora ?? []).filter((a) => a.evento === 'ingreso' && diaBogota(new Date(a.fecha)) === hoy).length,
        enLinea: (r.cuentas ?? []).reduce((n, c) => n + c.sesionesActivas, 0),
      });
    };
    cargar();
    const id = window.setInterval(cargar, 120_000);
    window.addEventListener('mepoy-cuentas', cargar);
    return () => { vivo = false; window.clearInterval(id); window.removeEventListener('mepoy-cuentas', cargar); };
  }, [activo]);
  return contador;
}

export function AccesosCuentas() {
  const [datos, setDatos] = useState<ResumenCuentas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState(30);
  const [filtroRol, setFiltroRol] = useState<RolCuenta | 'todas'>('todas');
  const bitacoraRef = useRef<HTMLDivElement>(null);

  const recargar = useCallback(async (d = dias) => {
    setCargando(true);
    const r = await adminResumen(d);
    setCargando(false);
    if (r.ok && r.cuentas) {
      setDatos({ cuentas: r.cuentas, bitacora: r.bitacora ?? [], radioKm: r.radioKm ?? 40, exigeUbicacionPiloto: !!r.exigeUbicacionPiloto });
      setError(null);
      window.dispatchEvent(new Event('mepoy-cuentas'));
    } else setError(r.error || 'No fue posible consultar las cuentas.');
  }, [dias]);
  useEffect(() => { recargar(); }, [recargar]);

  // «Ver» en una tarjeta: filtra la bitácora por esa cuenta y baja hasta ella.
  const verActividad = (rol: RolCuenta) => {
    setFiltroRol(rol);
    window.setTimeout(() => bitacoraRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#10233f]">Cuentas de acceso</h1>
          <p className="mt-0.5 text-[14px] text-slate-500">Tres cuentas, tres niveles de acceso. Administración segura y controlada del S2IP.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-[#10233f] text-white shadow-sm sm:flex"><LockKeyhole size={24} /></span>
          <div className="flex max-w-[420px] items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[12.5px] text-slate-600 shadow-sm">
            <Info size={18} className="mt-0.5 shrink-0 text-[#2563eb]" />
            <span>La gestión de cuentas de acceso garantiza la seguridad, trazabilidad y uso adecuado de la información del sistema.</span>
          </div>
          <button type="button" onClick={() => recargar()} disabled={cargando} title="Volver a consultar las cuentas y la bitácora" className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
            {cargando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Actualizar
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>}
      {!datos && !error && <div className="flex h-40 items-center justify-center text-sm text-slate-400"><Loader2 size={18} className="mr-2 animate-spin" /> Cargando cuentas…</div>}
      {datos && (
        <>
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
            {datos.cuentas.map((c) => <TarjetaCuenta key={c.rol} c={c} recargar={() => recargar()} exigeUbicacion={datos.exigeUbicacionPiloto} radioKm={datos.radioKm} onVer={() => verActividad(c.rol)} />)}
          </div>
          <div ref={bitacoraRef} className="scroll-mt-4">
            <Bitacora
              eventos={datos.bitacora}
              dias={dias}
              cargando={cargando}
              filtroRol={filtroRol}
              setFiltroRol={setFiltroRol}
              pedirDias={(d) => { if (d > dias) { setDias(d); recargar(d); } }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function FilaDato({ icono, etiqueta, children }: { icono: React.ReactNode; etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[26px] items-center justify-between gap-2">
      <dt className="flex items-center gap-2 text-slate-500"><span className="text-slate-400">{icono}</span>{etiqueta}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-right font-semibold text-[#10233f]">{children}</dd>
    </div>
  );
}

type Confirmacion = 'quitar' | 'generar' | 'revocar' | 'desactivar' | null;

function TarjetaCuenta({ c, recargar, exigeUbicacion, radioKm, onVer }: { c: CuentaAcceso; recargar: () => void; exigeUbicacion: boolean; radioKm: number; onVer: () => void }) {
  const [editandoClave, setEditandoClave] = useState(false);
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [menu, setMenu] = useState(false);
  // Confirmación de las acciones sensibles y la contraseña generada (se
  // muestra una sola vez; al cerrar el aviso ya no se puede volver a ver).
  const [confirmar, setConfirmar] = useState<Confirmacion>(null);
  const [generada, setGenerada] = useState<string | null>(null);
  const [copiadaClave, setCopiadaClave] = useState(false);
  const enlace = `${window.location.origin}${c.enlace}`;
  const esAdmin = c.rol === 'administrador';
  const estilo = ESTILO_ROL[c.rol];
  const Icono = estilo.Icono;

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setMensaje(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error || 'No fue posible.' });
    if (r.ok) recargar();
  }
  const copiarEnlace = () => { navigator.clipboard?.writeText(enlace).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {}); };
  const abrir = (tipo: Confirmacion) => { setMensaje(null); setGenerada(null); setEditandoClave(false); setConfirmar(tipo); };

  const estadoClave = c.tieneClave
    ? { texto: 'Asignada', clase: 'bg-emerald-50 text-emerald-700' }
    : esAdmin ? { texto: 'La de Netlify', clase: 'bg-slate-100 text-slate-600' } : { texto: 'Sin asignar', clase: 'bg-amber-50 text-amber-800' };

  const TEXTO_CONFIRMAR: Record<Exclude<Confirmacion, null>, string> = {
    quitar: esAdmin ? '¿Quitar la contraseña del panel? El administrador volverá a ingresar con la contraseña configurada en Netlify.' : `¿Quitar la contraseña de «${NOMBRE_ROL[c.rol]}»? Nadie podrá ingresar por ${c.enlace} hasta que se asigne o genere una nueva, y se cerrarán sus sesiones.`,
    generar: esAdmin ? '¿Generar una contraseña nueva para el administrador? Reemplaza la actual; guárdala antes de cerrar sesión.' : `¿Generar una contraseña nueva para «${NOMBRE_ROL[c.rol]}»? La anterior dejará de servir y se cerrarán sus sesiones.`,
    revocar: `¿Revocar las sesiones abiertas de «${NOMBRE_ROL[c.rol]}»? Tendrán que volver a ingresar; la contraseña no cambia.`,
    desactivar: `¿Desactivar la cuenta «${NOMBRE_ROL[c.rol]}»? Nadie podrá ingresar por ${c.enlace} hasta que la actives de nuevo.`,
  };
  function ejecutar(tipo: Exclude<Confirmacion, null>) {
    setConfirmar(null);
    if (tipo === 'quitar') accion(() => adminQuitarClave(c.rol), esAdmin ? 'Contraseña del panel quitada: vuelve a la de Netlify.' : 'Contraseña quitada. La cuenta no puede ingresar hasta que tenga una nueva.');
    else if (tipo === 'generar') accion(async () => { const r = await adminGenerarClave(c.rol); if (r.ok && r.clave) { setGenerada(r.clave); setCopiadaClave(false); } return r; }, 'Contraseña nueva generada.');
    else if (tipo === 'revocar') accion(() => adminCerrarSesiones(c.rol as 'interno' | 'piloto'), 'Sesiones revocadas.');
    else accion(() => adminCambiarEstado(c.rol as 'interno' | 'piloto', false), 'Cuenta desactivada.');
  }

  const btn = 'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" style={{ borderLeft: `4px solid ${estilo.acento}` }} data-cuenta={c.rol}>
      {/* Encabezado de la tarjeta */}
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: estilo.suave, color: estilo.acento }}><Icono size={24} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold leading-tight text-[#10233f]">{NOMBRE_ROL[c.rol]}</p>
          <p className="mt-0.5 text-[12px] text-slate-500">{DESCRIPCION_ROL[c.rol]}</p>
        </div>
        <span className={clsx('shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', !c.existe ? 'bg-rose-50 text-rose-700' : !c.activo ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700')}>
          {!c.existe ? 'Sin crear' : !c.activo ? 'Desactivada' : 'Activa'}
        </span>
        <div className="relative">
          <button type="button" aria-label="Más opciones" onClick={() => setMenu((v) => !v)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><MoreVertical size={17} /></button>
          {menu && (
            <div className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-[12.5px] shadow-lg" onMouseLeave={() => setMenu(false)}>
              <button type="button" onClick={() => { copiarEnlace(); setMenu(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"><Copy size={14} /> Copiar enlace</button>
              <button type="button" onClick={() => { onVer(); setMenu(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"><ClipboardList size={14} /> Ver actividad</button>
            </div>
          )}
        </div>
      </div>

      {/* Datos */}
      <dl className="mt-4 space-y-1.5 text-[13px]">
        <FilaDato icono={<Link2 size={15} />} etiqueta="Enlace">
          <span className="truncate" title={enlace}>{c.enlace}</span>
          <button type="button" title="Copiar enlace" onClick={copiarEnlace} className="rounded p-0.5 text-slate-400 hover:text-[#116762]">
            {copiado ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
          </button>
        </FilaDato>
        <FilaDato icono={<User size={15} />} etiqueta="Usuario">{c.usuario ?? '—'}</FilaDato>
        <FilaDato icono={<KeyRound size={15} />} etiqueta="Contraseña">
          <span className={clsx('rounded-full px-2 py-0.5 text-[11.5px] font-bold', estadoClave.clase)}>{estadoClave.texto}</span>
          {c.claveActualizada && <span className="text-[11px] font-normal text-slate-400" title="Último cambio hecho desde este panel">· {fechaCorta(c.claveActualizada)}</span>}
        </FilaDato>
        <FilaDato icono={<Clock size={15} />} etiqueta="Último ingreso">{fechaHora(c.ultimoIngreso)}</FilaDato>
        {!esAdmin && (
          <FilaDato icono={<Users size={15} />} etiqueta="Sesiones activas">
            <span className={clsx('min-w-[28px] rounded-full px-2 py-0.5 text-center text-[12px] font-bold', c.sesionesActivas > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500')}>{c.sesionesActivas}</span>
            <button type="button" onClick={onVer} className="rounded-md border border-slate-300 px-2.5 py-0.5 text-[12px] font-semibold text-[#10233f] hover:bg-slate-50">Ver</button>
          </FilaDato>
        )}
        {c.rol === 'piloto' && (
          <>
            <FilaDato icono={<MapPinned size={15} />} etiqueta="Territorio asignado">
              <select value={c.ambito ?? 'mepoy'} disabled={ocupado} onChange={(e) => accion(() => adminCambiarAmbito(e.target.value as 'mepoy' | 'popayan'), 'Territorio actualizado (las sesiones abiertas se cerraron).')} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12.5px] font-semibold text-[#10233f]">
                <option value="mepoy">Toda la jurisdicción MEPOY</option>
                <option value="popayan">Solo Popayán (Norte y Sur)</option>
              </select>
            </FilaDato>
            <p className="pl-6 text-[11px] leading-snug text-slate-400">Restringe la visualización de datos al territorio seleccionado{exigeUbicacion ? ` (pide la ubicación del equipo, hasta ${radioKm} km de Popayán).` : '.'}</p>
          </>
        )}
      </dl>

      {/* Permisos principales */}
      <div className={clsx('mt-3 rounded-xl px-3.5 py-3', estilo.caja)}>
        <p className="mb-1.5 text-[13px] font-bold text-[#10233f]">Permisos principales</p>
        <ul className="space-y-1 text-[12.5px] text-slate-700">
          {permisosDe(c).map((p) => (
            <li key={p.texto} className="flex items-center gap-2">
              {p.permitido ? <CheckCircle2 size={15} className={clsx('shrink-0', estilo.check)} /> : <XCircle size={15} className="shrink-0 text-slate-400" />}
              <span className={p.permitido ? '' : 'text-slate-500'}>{p.texto}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Gestión de contraseña */}
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Gestión de contraseña</p>
        {editandoClave ? (
          <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const nueva = clave; setClave(''); setEditandoClave(false); accion(() => adminAsignarClave(c.rol, nueva), esAdmin ? 'Contraseña del administrador actualizada.' : 'Contraseña asignada (las sesiones abiertas se cerraron).'); }}>
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Nueva contraseña (mín. 8)" autoComplete="new-password" minLength={8} autoFocus className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
            <button type="submit" disabled={clave.length < 8} className="rounded-lg bg-[#116762] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">Guardar</button>
            <button type="button" onClick={() => { setEditandoClave(false); setClave(''); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-[12px] text-slate-600">✕</button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado || !c.existe} onClick={() => { setMensaje(null); setConfirmar(null); setGenerada(null); setEditandoClave(true); }} className={clsx(btn, 'border-slate-300 bg-[#eef2f7] text-[#10233f] hover:bg-[#e2e8f0]')}>
              <KeyRound size={14} /> {c.tieneClave || esAdmin ? 'Cambiar contraseña' : 'Asignar contraseña'}
            </button>
            <button type="button" disabled={ocupado || !c.existe} onClick={() => abrir('generar')} title="El sistema crea una contraseña segura y te la muestra una sola vez" className={clsx(btn, 'border-[#116762] bg-[#116762] text-white hover:bg-[#0f5f57]')}>
              <Sparkles size={14} /> Generar contraseña
            </button>
            <button type="button" disabled={ocupado || !c.existe || !c.tieneClave} onClick={() => abrir('quitar')} title={esAdmin ? 'Quita la contraseña puesta en el panel; vuelve a la de Netlify' : 'Deja la cuenta sin contraseña (no podrá ingresar)'} className={clsx(btn, 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50')}>
              <Eraser size={14} /> Quitar contraseña
            </button>
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-slate-400">Cambiar: escribes una nueva. Generar: el sistema crea una segura y la muestra una sola vez.</p>
      </div>

      {/* Control de acceso */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Control de acceso</p>
        {esAdmin ? (
          <p className="flex items-center gap-1.5 text-[12px] text-slate-500"><Settings size={14} className="text-slate-400" /> La cuenta de administrador no se puede desactivar; su sesión se cierra con «Cerrar sesión».</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={ocupado || c.sesionesActivas === 0} onClick={() => abrir('revocar')} title={c.sesionesActivas === 0 ? 'No hay sesiones abiertas' : 'Cierra las sesiones abiertas de esta cuenta'} className={clsx(btn, 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100')}>
                <ShieldAlert size={14} /> Revocar sesiones
              </button>
              {c.activo ? (
                <button type="button" disabled={ocupado || !c.existe} onClick={() => abrir('desactivar')} className={clsx(btn, 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100')}>
                  <UserX size={14} /> Desactivar cuenta
                </button>
              ) : (
                <button type="button" disabled={ocupado || !c.existe} onClick={() => accion(() => adminCambiarEstado(c.rol as 'interno' | 'piloto', true), 'Cuenta activada.')} className={clsx(btn, 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100')}>
                  <Power size={14} /> Activar cuenta
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Revocar cierra las sesiones abiertas (reversible). Desactivar impide ingresar hasta reactivar la cuenta.</p>
          </>
        )}
      </div>

      {confirmar && (
        <div className={clsx('mt-3 rounded-lg border p-2.5 text-[12px]', confirmar === 'generar' ? 'border-teal-200 bg-teal-50 text-teal-900' : confirmar === 'revocar' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>
          <p className="flex items-start gap-1.5 font-semibold"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {TEXTO_CONFIRMAR[confirmar]}</p>
          <div className="mt-2 flex gap-1.5">
            <button type="button" disabled={ocupado} onClick={() => ejecutar(confirmar)} className={clsx('rounded-lg px-3 py-1 text-[12px] font-bold text-white disabled:opacity-50', confirmar === 'generar' ? 'bg-[#116762] hover:bg-[#0f5f57]' : confirmar === 'revocar' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-rose-600 hover:bg-rose-700')}>
              {{ quitar: 'Sí, quitar', generar: 'Sí, generar', revocar: 'Sí, revocar', desactivar: 'Sí, desactivar' }[confirmar]}
            </button>
            <button type="button" onClick={() => setConfirmar(null)} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-[12px] font-semibold text-slate-600">Cancelar</button>
          </div>
        </div>
      )}
      {generada && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[11.5px] text-emerald-900" data-clave-generada="1">
          <p className="font-semibold">Contraseña nueva de {NOMBRE_ROL[c.rol]} (usuario <span className="font-bold">{c.usuario ?? '—'}</span>):</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 select-all truncate rounded-md border border-emerald-300 bg-white px-2 py-1 font-mono text-[14px] font-bold tracking-wide text-[#10233f]">{generada}</code>
            <button type="button" title="Copiar contraseña" onClick={() => { navigator.clipboard?.writeText(generada).then(() => setCopiadaClave(true)).catch(() => {}); }} className="flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 text-[11.5px] font-semibold text-emerald-800 hover:bg-emerald-100">
              {copiadaClave ? <CheckCircle2 size={13} /> : <Copy size={13} />} {copiadaClave ? 'Copiada' : 'Copiar'}
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] text-emerald-800">Cópiala y entrégala por un medio seguro. No se guarda en ningún lado: al cerrar este aviso no se puede volver a ver (solo generar otra).</p>
          <button type="button" onClick={() => setGenerada(null)} className="mt-1.5 rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100">Listo, ya la copié</button>
        </div>
      )}
      {mensaje && (
        <p className={clsx('mt-2 flex items-start gap-1 text-[11.5px]', mensaje.ok ? 'text-emerald-700' : 'text-rose-700')}>
          {mensaje.ok ? <CheckCircle2 size={13} className="mt-[1px] shrink-0" /> : <XCircle size={13} className="mt-[1px] shrink-0" />} {mensaje.texto}
        </p>
      )}
    </div>
  );
}

function Bitacora({ eventos, dias, cargando, filtroRol, setFiltroRol, pedirDias }: {
  eventos: EventoBitacora[];
  dias: number;
  cargando: boolean;
  filtroRol: RolCuenta | 'todas';
  setFiltroRol: (r: RolCuenta | 'todas') => void;
  pedirDias: (d: number) => void;
}) {
  const hoy = isoDia(new Date());
  const [desde, setDesde] = useState(() => isoDia(new Date(Date.now() - 29 * 86400000)));
  const [hasta, setHasta] = useState(hoy);
  const [tipo, setTipo] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [limite, setLimite] = useState(50);

  // Si el periodo pide más días de los cargados, se consulta de nuevo al servidor (máx. 365).
  useEffect(() => {
    const necesarios = Math.ceil((Date.now() - new Date(`${desde}T00:00:00-05:00`).getTime()) / 86400000) + 1;
    if (necesarios > dias) pedirDias(Math.min(365, necesarios));
  }, [desde, dias, pedirDias]);
  useEffect(() => { setLimite(50); }, [desde, hasta, tipo, buscar, filtroRol]);

  const enPeriodo = useMemo(() => eventos.filter((e) => { const d = isoDia(new Date(e.fecha)); return d >= desde && d <= hasta; }), [eventos, desde, hasta]);
  const delRol = useMemo(() => enPeriodo.filter((e) => filtroRol === 'todas' || e.rol === filtroRol), [enPeriodo, filtroRol]);
  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return delRol.filter((e) => (tipo === 'todos' || (tipo === 'fallidos' ? FALLIDOS.has(e.evento) : e.evento === tipo))
      && (!q || `${e.detalle ?? ''} ${e.ip ?? ''} ${NOMBRE_ROL[e.rol as RolCuenta] ?? e.rol} ${EVENTO[e.evento]?.texto ?? e.evento}`.toLowerCase().includes(q)));
  }, [delRol, tipo, buscar]);
  const kpi = {
    exitosos: delRol.filter((e) => e.evento === 'ingreso').length,
    fallidos: delRol.filter((e) => FALLIDOS.has(e.evento)).length,
    admin: delRol.filter((e) => e.evento === 'admin').length,
  };
  const textoPeriodo = desde === isoDia(new Date(Date.now() - 29 * 86400000)) && hasta === hoy ? 'últimos 30 días' : 'periodo elegido';

  function exportar() {
    const hoja = XLSX.utils.json_to_sheet(filas.map((e) => ({
      'Fecha y hora': fechaHora(e.fecha), Cuenta: NOMBRE_ROL[e.rol as RolCuenta] ?? e.rol, Evento: EVENTO[e.evento]?.texto ?? e.evento,
      Detalle: e.detalle ?? '', IP: e.ip ?? '', Resultado: resultadoDe(e.evento).texto,
    })));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Bitácora');
    XLSX.writeFile(libro, `bitacora-accesos-${desde}-a-${hasta}.xlsx`);
  }

  const Kpi = ({ icono, fondo, valor, texto }: { icono: React.ReactNode; fondo: string; valor: number; texto: string }) => (
    <div className="flex min-w-[170px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', fondo)}>{icono}</span>
      <div className="leading-tight"><p className="text-[20px] font-extrabold text-[#10233f]">{valor}</p><p className="text-[11.5px] text-slate-500">{texto}<br />{textoPeriodo}</p></div>
    </div>
  );
  const campo = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12.5px] text-[#10233f]';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-[260px] flex-1 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0f5f57] text-white"><ClipboardList size={24} /></span>
          <div>
            <h2 className="text-[19px] font-extrabold text-[#10233f]">Bitácora de accesos</h2>
            <p className="text-[12.5px] text-slate-500">Ingresos, intentos fallidos y acciones administrativas de las cuentas del sistema.</p>
          </div>
        </div>
        <div className="flex flex-1 flex-wrap gap-3">
          <Kpi icono={<UserCheck size={20} className="text-emerald-700" />} fondo="bg-emerald-50" valor={kpi.exitosos} texto="Accesos exitosos" />
          <Kpi icono={<ShieldX size={20} className="text-rose-600" />} fondo="bg-rose-50" valor={kpi.fallidos} texto="Intentos fallidos" />
          <Kpi icono={<Settings size={20} className="text-amber-600" />} fondo="bg-amber-50" valor={kpi.admin} texto="Acciones administrativas" />
        </div>
      </div>

      {/* Filtros */}
      <div className="mt-4 flex flex-wrap items-end gap-3 text-[12px]">
        <label className="flex flex-col gap-1 font-semibold text-slate-600">Cuenta
          <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as RolCuenta | 'todas')} className={clsx(campo, 'min-w-[150px]')}>
            <option value="todas">Todas</option>
            {(['administrador', 'interno', 'piloto'] as const).map((r) => <option key={r} value={r}>{NOMBRE_ROL[r]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold text-slate-600">Tipo de evento
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={clsx(campo, 'min-w-[160px]')}>
            <option value="todos">Todos</option>
            <option value="fallidos">Todos los fallidos</option>
            {Object.entries(EVENTO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 font-semibold text-slate-600">Periodo
          <div className="flex items-center gap-1.5">
            <input type="date" value={desde} max={hasta} min={isoDia(new Date(Date.now() - 364 * 86400000))} onChange={(e) => e.target.value && setDesde(e.target.value)} className={campo} aria-label="Desde" />
            <span className="text-slate-400">→</span>
            <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => e.target.value && setHasta(e.target.value)} className={campo} aria-label="Hasta" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en la bitácora…" className={clsx(campo, 'w-[220px] pl-8')} />
          </div>
          {puedeDescargar() && (
            <button type="button" onClick={exportar} disabled={filas.length === 0} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-50">
              <Download size={14} /> Exportar
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[820px] text-left text-[12.5px]">
          <thead className="bg-[#10233f] text-white">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Fecha y hora</th>
              <th className="px-3 py-2.5 font-semibold">Cuenta</th>
              <th className="px-3 py-2.5 font-semibold">Evento</th>
              <th className="px-3 py-2.5 font-semibold">Detalle</th>
              <th className="px-3 py-2.5 font-semibold">IP</th>
              <th className="px-3 py-2.5 font-semibold">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, limite).map((e) => {
              const ev = EVENTO[e.evento] ?? { texto: e.evento, clase: 'bg-slate-100 text-slate-600' };
              const res = resultadoDe(e.evento);
              return (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fechaHora(e.fecha)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#10233f]">{NOMBRE_ROL[e.rol as RolCuenta] ?? e.rol}</td>
                  <td className="px-3 py-2"><span className={clsx('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', ev.clase)}>{ev.texto}</span></td>
                  <td className="px-3 py-2 text-slate-600">{e.detalle ?? ''}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{e.ip ?? ''}</td>
                  <td className="px-3 py-2"><span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', res.clase)}>{res.texto === 'Fallido' ? <XCircle size={11} /> : res.texto === 'Alerta' ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />} {res.texto}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filas.length === 0 && <p className="py-6 text-center text-[12.5px] text-slate-400">{cargando ? 'Consultando…' : 'Sin eventos con estos filtros.'}</p>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11.5px] text-slate-500">
        <span>{filas.length > 0 ? `Mostrando ${Math.min(limite, filas.length)} de ${filas.length} eventos` : ''}</span>
        {filas.length > limite && <button type="button" onClick={() => setLimite((l) => l + 50)} className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-semibold text-[#10233f] hover:bg-slate-50">Ver más</button>}
      </div>
    </section>
  );
}
