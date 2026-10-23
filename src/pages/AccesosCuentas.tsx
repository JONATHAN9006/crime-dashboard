import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Loader2, LogOut, MapPinned, Power, RefreshCw, ShieldCheck, UserCheck, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Card, PageHeader } from '../components/ui/Card';
import {
  adminAsignarClave, adminCambiarAmbito, adminCambiarEstado, adminCerrarSesiones, adminResumen,
  type CuentaAcceso, type EventoBitacora, type ResumenCuentas, type RolCuenta,
} from '../cuentas/apiCuentas';

// Panel del ADMINISTRADOR: las TRES cuentas del S2IP (una por enlace) — no
// existe forma de crear otras, ni aquí ni en el servidor (la base solo
// admite administrador, interno y piloto). Todas las acciones se validan en
// el servidor con la sesión del administrador.

const NOMBRE_ROL: Record<RolCuenta, string> = { administrador: 'Administrador', interno: 'Usuario interno', piloto: 'Usuario piloto' };
const DESCRIPCION_ROL: Record<RolCuenta, string> = {
  administrador: 'Administra el sistema, las cuentas y la información.',
  interno: 'Funcionalidades internas autorizadas del S2IP.',
  piloto: 'Consulta y visualización con las restricciones del piloto.',
};
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

  const bitacora = useMemo(() => (datos?.bitacora ?? []).filter((e) => filtroRol === 'todas' || e.rol === filtroRol), [datos, filtroRol]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Cuentas de acceso" subtitle="Tres cuentas, tres enlaces: administrador, interno y piloto." />
        <button type="button" onClick={() => recargar()} disabled={cargando} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
          {cargando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Actualizar
        </button>
      </div>
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>}
      {!datos && !error && <div className="flex h-40 items-center justify-center text-sm text-slate-400"><Loader2 size={18} className="mr-2 animate-spin" /> Cargando cuentas…</div>}
      {datos && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {datos.cuentas.map((c) => <TarjetaCuenta key={c.rol} c={c} recargar={() => recargar()} exigeUbicacion={datos.exigeUbicacionPiloto} radioKm={datos.radioKm} />)}
          </div>
          <Card title="Bitácora de accesos" subtitle="Ingresos, intentos fallidos, salidas y acciones del administrador" icono={<UserCheck size={22} className="text-[#137a6f]" />}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
              {(['todas', 'administrador', 'interno', 'piloto'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setFiltroRol(r)} className={clsx('rounded-full border px-3 py-1 font-semibold', filtroRol === r ? 'border-[#116762] bg-[#116762] text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50')}>
                  {r === 'todas' ? 'Todas' : NOMBRE_ROL[r]}
                </button>
              ))}
              <select value={dias} onChange={(e) => { const d = Number(e.target.value); setDias(d); recargar(d); }} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-600">
                {[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>{d === 1 ? 'Hoy' : `Últimos ${d} días`}</option>)}
              </select>
            </div>
            <TablaBitacora filas={bitacora} />
          </Card>
        </>
      )}
    </div>
  );
}

function TarjetaCuenta({ c, recargar, exigeUbicacion, radioKm }: { c: CuentaAcceso; recargar: () => void; exigeUbicacion: boolean; radioKm: number }) {
  const [editandoClave, setEditandoClave] = useState(false);
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const enlace = `${window.location.origin}${c.enlace}`;
  const esAdmin = c.rol === 'administrador';

  async function accion(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setMensaje(r.ok ? { ok: true, texto: exito } : { ok: false, texto: r.error || 'No fue posible.' });
    if (r.ok) recargar();
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold text-[#10233f]">{esAdmin ? <ShieldCheck size={16} className="text-[#116762]" /> : <UserCheck size={16} className="text-[#116762]" />} {NOMBRE_ROL[c.rol]}</p>
          <p className="mt-0.5 text-[11.5px] text-slate-500">{DESCRIPCION_ROL[c.rol]}</p>
        </div>
        <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', !c.existe ? 'bg-rose-50 text-rose-700' : !c.activo ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700')}>
          {!c.existe ? 'Sin crear' : !c.activo ? 'Desactivada' : 'Activa'}
        </span>
      </div>

      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        <div className="flex items-center justify-between gap-2"><dt className="text-slate-500">Enlace</dt>
          <dd className="flex min-w-0 items-center gap-1 font-semibold text-[#10233f]">
            <span className="truncate" title={enlace}>{c.enlace}</span>
            <button type="button" title="Copiar enlace" onClick={() => { navigator.clipboard?.writeText(enlace).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {}); }} className="rounded p-0.5 text-slate-400 hover:text-[#116762]">
              {copiado ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>
          </dd>
        </div>
        <div className="flex justify-between gap-2"><dt className="text-slate-500">Usuario</dt><dd className="font-semibold text-[#10233f]">{c.usuario ?? '—'}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-slate-500">Contraseña</dt><dd className={clsx('font-semibold', c.tieneClave || esAdmin ? 'text-[#10233f]' : 'text-amber-700')}>{c.tieneClave ? 'Asignada' : esAdmin ? 'La de Netlify' : 'Sin asignar'}</dd></div>
        {!esAdmin && <div className="flex justify-between gap-2"><dt className="text-slate-500">Sesiones activas</dt><dd className="font-semibold text-[#10233f]">{c.sesionesActivas}</dd></div>}
        <div className="flex justify-between gap-2"><dt className="text-slate-500">Último ingreso</dt><dd className="font-semibold text-[#10233f]">{fechaHora(c.ultimoIngreso)}</dd></div>
        {c.rol === 'piloto' && (
          <div className="flex items-center justify-between gap-2"><dt className="flex items-center gap-1 text-slate-500"><MapPinned size={13} /> Territorio</dt>
            <dd>
              <select value={c.ambito ?? 'mepoy'} disabled={ocupado} onChange={(e) => accion(() => adminCambiarAmbito(e.target.value as 'mepoy' | 'popayan'), 'Territorio actualizado (las sesiones abiertas se cerraron).')} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] font-semibold text-[#10233f]">
                <option value="mepoy">Toda la jurisdicción MEPOY</option>
                <option value="popayan">Solo Popayán (Norte y Sur)</option>
              </select>
            </dd>
          </div>
        )}
        {c.rol === 'piloto' && <p className="text-[10.5px] text-slate-400">{exigeUbicacion ? `Pide la ubicación del equipo (hasta ${radioKm} km de Popayán).` : 'No pide la ubicación del equipo.'}</p>}
      </dl>

      {editandoClave ? (
        <form className="mt-3 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); const nueva = clave; setClave(''); setEditandoClave(false); accion(() => adminAsignarClave(c.rol, nueva), esAdmin ? 'Contraseña del administrador actualizada.' : 'Contraseña asignada (las sesiones abiertas se cerraron).'); }}>
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Nueva contraseña (mín. 8)" autoComplete="new-password" minLength={8} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px]" />
          <button type="submit" disabled={clave.length < 8} className="rounded-lg bg-[#116762] px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-50">Guardar</button>
          <button type="button" onClick={() => { setEditandoClave(false); setClave(''); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-[12px] text-slate-600">✕</button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" disabled={ocupado || !c.existe} onClick={() => { setMensaje(null); setEditandoClave(true); }} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-50">
            <KeyRound size={13} /> {c.tieneClave || esAdmin ? 'Cambiar contraseña' : 'Asignar contraseña'}
          </button>
          {!esAdmin && (
            <>
              <button type="button" disabled={ocupado || !c.existe} onClick={() => accion(() => adminCambiarEstado(c.rol as 'interno' | 'piloto', !c.activo), c.activo ? 'Cuenta desactivada.' : 'Cuenta activada.')} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-50">
                <Power size={13} /> {c.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button type="button" disabled={ocupado || c.sesionesActivas === 0} onClick={() => accion(() => adminCerrarSesiones(c.rol as 'interno' | 'piloto'), 'Sesiones cerradas.')} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-50">
                <LogOut size={13} /> Cerrar sesiones
              </button>
            </>
          )}
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

function TablaBitacora({ filas }: { filas: EventoBitacora[] }) {
  if (filas.length === 0) return <p className="py-6 text-center text-[12.5px] text-slate-400">Sin eventos en este periodo.</p>;
  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border border-slate-100">
      <table className="w-full min-w-[640px] text-left text-[12.5px]">
        <thead className="sticky top-0 bg-[#10233f] text-white">
          <tr>
            <th className="px-3 py-2 font-semibold">Fecha y hora</th>
            <th className="px-3 py-2 font-semibold">Cuenta</th>
            <th className="px-3 py-2 font-semibold">Evento</th>
            <th className="px-3 py-2 font-semibold">Detalle</th>
            <th className="px-3 py-2 font-semibold">IP</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((e) => {
            const ev = EVENTO[e.evento] ?? { texto: e.evento, clase: 'bg-slate-100 text-slate-600' };
            return (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">{fechaHora(e.fecha)}</td>
                <td className="px-3 py-1.5 font-semibold text-[#10233f]">{NOMBRE_ROL[e.rol as RolCuenta] ?? e.rol}</td>
                <td className="px-3 py-1.5"><span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', ev.clase)}>{ev.texto}</span></td>
                <td className="px-3 py-1.5 text-slate-600">{e.detalle ?? ''}</td>
                <td className="px-3 py-1.5 text-slate-400">{e.ip ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
