import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Loader2, LogOut, Power, RefreshCw, ShieldCheck, UserCheck, Users, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { Card, PageHeader } from '../components/ui/Card';
import {
  adminAsignarClave, adminCambiarEstado, adminCerrarSesion, adminResumen, guardarClaveAdmin, leerClaveAdmin,
  type AccesoCai, type ResumenAccesos, type UsuarioCai,
} from '../cai/apiCai';

// Solo para el ADMINISTRADOR (vista interna): quién de los comandantes de
// CAI ha ingresado al dashboard, con fecha y hora, y la gestión de sus
// usuarios. Los datos viven en Supabase en tablas que la llave pública NO
// puede leer; aquí se piden a la función accesoCai con la clave de
// administrador (la misma de "Actualizar información").

const ZONA = 'America/Bogota';
const fFechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const diaBogota = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONA });
const nombreCai = (u: string) => u.replace(/^cai(\d+)$/i, 'CAI $1');

const EVENTOS: Record<string, { texto: string; clase: string }> = {
  ingreso: { texto: 'Ingreso', clase: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  salida: { texto: 'Salida', clase: 'bg-slate-100 text-slate-600 ring-slate-200' },
  fallido: { texto: 'Contraseña errada', clase: 'bg-rose-50 text-rose-700 ring-rose-200' },
  rechazado: { texto: 'Rechazado', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  bloqueado: { texto: 'Bloqueado', clase: 'bg-rose-100 text-rose-800 ring-rose-300' },
  cerrada: { texto: 'Sesión cerrada', clase: 'bg-amber-50 text-amber-800 ring-amber-200' },
  admin: { texto: 'Administrador', clase: 'bg-sky-50 text-sky-700 ring-sky-200' },
};

function equipo(ua: string | null): string {
  if (!ua) return '—';
  const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [so, nav].filter(Boolean).join(' · ');
}

/** Contador para el menú lateral: ingresos de hoy y CAI en línea (solo si ya se ingresó la clave de administrador). */
export function useContadorAccesosCai(activo: boolean) {
  const [contador, setContador] = useState<{ hoy: number; enLinea: number } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const cargar = async () => {
      const clave = leerClaveAdmin();
      if (!clave) { setContador(null); return; }
      const r = await adminResumen(clave, 1);
      if (!vivo || !r.ok) return;
      const hoy = diaBogota(new Date());
      setContador({
        hoy: (r.accesos ?? []).filter((a) => a.evento === 'ingreso' && diaBogota(new Date(a.fecha)) === hoy).length,
        enLinea: (r.usuarios ?? []).filter((u) => u.enLinea).length,
      });
    };
    cargar();
    const id = window.setInterval(cargar, 120_000);
    window.addEventListener('mepoy-admin-cai', cargar);
    return () => { vivo = false; window.clearInterval(id); window.removeEventListener('mepoy-admin-cai', cargar); };
  }, [activo]);
  return contador;
}

export function AccesosCai() {
  const [clave, setClave] = useState(leerClaveAdmin);
  const [datos, setDatos] = useState<ResumenAccesos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dias, setDias] = useState(30);
  const [filtroCai, setFiltroCai] = useState('');
  const [filtroEvento, setFiltroEvento] = useState('');

  const cargar = useCallback(async (c = clave, d = dias) => {
    if (!c) return;
    setCargando(true);
    const r = await adminResumen(c, d);
    setCargando(false);
    if (r.ok && r.usuarios) {
      setDatos({ usuarios: r.usuarios, accesos: r.accesos ?? [], radioKm: r.radioKm ?? 15, exigeUbicacion: r.exigeUbicacion ?? true });
      setError(null);
      window.dispatchEvent(new Event('mepoy-admin-cai')); // refresca el contador del menú
    } else {
      setError(r.error || 'No fue posible consultar los accesos.');
      if (/clave de administrador/i.test(r.error || '')) { guardarClaveAdmin(null); setClave(''); setDatos(null); }
    }
  }, [clave, dias]);

  useEffect(() => { if (clave) cargar(); }, [clave, dias]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clave) return;
    const id = window.setInterval(() => cargar(), 60_000);
    return () => window.clearInterval(id);
  }, [clave, cargar]);

  if (!clave || !datos) {
    return (
      <div className="space-y-5">
        <PageHeader title="Accesos CAI" subtitle="Registro de ingresos de los comandantes de CAI — solo administrador." />
        <IngresoAdmin
          error={error}
          cargando={cargando}
          onClave={async (c) => {
            setCargando(true);
            const r = await adminResumen(c, dias);
            setCargando(false);
            if (r.ok && r.usuarios) {
              guardarClaveAdmin(c);
              setClave(c);
              setDatos({ usuarios: r.usuarios, accesos: r.accesos ?? [], radioKm: r.radioKm ?? 15, exigeUbicacion: r.exigeUbicacion ?? true });
              setError(null);
            } else setError(r.error || 'No fue posible consultar los accesos.');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Accesos CAI" subtitle="Registro de ingresos de los comandantes de CAI — solo administrador." />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => cargar()} disabled={cargando} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-[#10233f] hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={14} className={clsx(cargando && 'animate-spin')} /> Actualizar
          </button>
          <button type="button" onClick={() => { guardarClaveAdmin(null); setClave(''); setDatos(null); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">
            <LogOut size={14} /> Bloquear
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Panel datos={datos} clave={clave} dias={dias} setDias={setDias} filtroCai={filtroCai} setFiltroCai={setFiltroCai} filtroEvento={filtroEvento} setFiltroEvento={setFiltroEvento} recargar={() => cargar()} />
    </div>
  );
}

function IngresoAdmin({ onClave, error, cargando }: { onClave: (c: string) => void; error: string | null; cargando: boolean }) {
  const [valor, setValor] = useState('');
  return (
    <Card className="max-w-md" title="Clave de administrador" subtitle="La misma clave de «Actualizar información». Queda guardada solo mientras esta pestaña esté abierta." icono={<KeyRound size={22} className="text-[#137a6f]" />}>
      <form onSubmit={(e) => { e.preventDefault(); if (valor) onClave(valor); }} className="flex flex-col gap-2 sm:flex-row">
        <input type="password" value={valor} onChange={(e) => setValor(e.target.value)} autoComplete="off" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#116762] focus:outline-none" placeholder="Clave" />
        <button type="submit" disabled={cargando || !valor} className="flex items-center justify-center gap-1.5 rounded-lg bg-[#10233f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {cargando ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Ver accesos
        </button>
      </form>
      {error && <p className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
    </Card>
  );
}

function Kpi({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle: string; tono: string }) {
  return (
    <div className={clsx('rounded-xl border bg-white p-3.5 shadow-sm', tono)}>
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-[26px] font-extrabold leading-none tabular-nums text-[#10233f]">{valor}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detalle}</p>
    </div>
  );
}

function Panel({ datos, clave, dias, setDias, filtroCai, setFiltroCai, filtroEvento, setFiltroEvento, recargar }: {
  datos: ResumenAccesos; clave: string; dias: number; setDias: (d: number) => void;
  filtroCai: string; setFiltroCai: (v: string) => void; filtroEvento: string; setFiltroEvento: (v: string) => void;
  recargar: () => void;
}) {
  const hoy = diaBogota(new Date());
  const accesosHoy = datos.accesos.filter((a) => diaBogota(new Date(a.fecha)) === hoy);
  const ingresosHoy = accesosHoy.filter((a) => a.evento === 'ingreso');
  const caisHoy = new Set(ingresosHoy.map((a) => a.usuario));
  const alertasHoy = accesosHoy.filter((a) => ['fallido', 'rechazado', 'bloqueado'].includes(a.evento)).length;
  const enLinea = datos.usuarios.filter((u) => u.enLinea).length;
  const conClave = datos.usuarios.filter((u) => u.tieneClave).length;
  const enlace = `${window.location.origin}/cai`;
  const [copiado, setCopiado] = useState(false);

  const porUsuario = useMemo(() => {
    const m = new Map<string, { ultimo: string | null; ingresos: number }>();
    for (const a of datos.accesos) {
      if (a.evento !== 'ingreso') continue;
      const v = m.get(a.usuario) ?? { ultimo: null, ingresos: 0 };
      v.ingresos += 1;
      if (!v.ultimo || a.fecha > v.ultimo) v.ultimo = a.fecha;
      m.set(a.usuario, v);
    }
    return m;
  }, [datos.accesos]);

  const filtrados = datos.accesos.filter((a) => (!filtroCai || a.usuario === filtroCai) && (!filtroEvento || a.evento === filtroEvento));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Ingresos hoy" valor={String(ingresosHoy.length)} detalle={`${caisHoy.size} de ${datos.usuarios.length} CAI han ingresado hoy`} tono="border-emerald-200" />
        <Kpi titulo="En línea ahora" valor={String(enLinea)} detalle="Con el dashboard abierto (últimos 7 min)" tono="border-sky-200" />
        <Kpi titulo="Alertas hoy" valor={String(alertasHoy)} detalle="Contraseña errada, fuera de Popayán o bloqueos" tono={alertasHoy > 0 ? 'border-rose-200' : 'border-slate-200'} />
        <Kpi titulo="Usuarios listos" valor={`${conClave}/${datos.usuarios.length}`} detalle="Con contraseña asignada" tono="border-slate-200" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[12.5px] shadow-sm">
        <span className="font-semibold text-[#10233f]">Enlace de los comandantes:</span>
        <code className="rounded bg-slate-100 px-2 py-1 text-[12px] text-[#10233f]">{enlace}</code>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(enlace).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }); }} className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-600 hover:bg-slate-50">
          <Copy size={12} /> {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <span className="text-slate-500">· Ubicación exigida: {datos.exigeUbicacion ? `sí, hasta ${datos.radioKm} km del centro de Popayán` : 'no (desactivada en Netlify)'}</span>
      </div>

      <Card title="Comandantes de CAI" subtitle="Estado de cada usuario, último ingreso y gestión de contraseñas" icono={<Users size={22} className="text-[#137a6f]" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2">CAI</th>
                <th className="py-2 pr-2">Estado</th>
                <th className="py-2 pr-2">Último ingreso</th>
                <th className="py-2 pr-2 text-center">Ingresos ({dias} días)</th>
                <th className="py-2 pr-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...datos.usuarios].sort((a, b) => Number(a.usuario.replace(/\D/g, '')) - Number(b.usuario.replace(/\D/g, ''))).map((u) => <FilaUsuario key={u.usuario} u={u} info={porUsuario.get(u.usuario)} clave={clave} recargar={recargar} />)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Registro de accesos"
        subtitle={`${filtrados.length} evento(s) · fecha y hora de Colombia`}
        icono={<UserCheck size={22} className="text-[#137a6f]" />}
        actions={
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <select value={filtroCai} onChange={(e) => setFiltroCai(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
              <option value="">Todos los CAI</option>
              {[...datos.usuarios].sort((a, b) => Number(a.usuario.replace(/\D/g, '')) - Number(b.usuario.replace(/\D/g, ''))).map((u) => <option key={u.usuario} value={u.usuario}>{u.nombre || nombreCai(u.usuario)}</option>)}
            </select>
            <select value={filtroEvento} onChange={(e) => setFiltroEvento(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1">
              <option value="">Todos los eventos</option>
              {Object.entries(EVENTOS).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
            </select>
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1">
              {[1, 7, 30, 90, 365].map((d) => <option key={d} value={d}>{d === 1 ? 'Hoy y ayer' : `Últimos ${d} días`}</option>)}
            </select>
          </div>
        }
      >
        {filtrados.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Sin eventos en este periodo.</p>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-2">Fecha y hora</th>
                  <th className="py-2 pr-2">CAI</th>
                  <th className="py-2 pr-2">Evento</th>
                  <th className="py-2 pr-2">Detalle</th>
                  <th className="py-2 pr-2 text-right">Distancia al centro</th>
                  <th className="py-2 pr-2">Equipo</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((a) => <FilaAcceso key={a.id} a={a} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function FilaAcceso({ a }: { a: AccesoCai }) {
  const ev = EVENTOS[a.evento] ?? { texto: a.evento, clase: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-slate-700">{fFechaHora(a.fecha)}</td>
      <td className="whitespace-nowrap py-1.5 pr-2 font-semibold text-[#10233f]">{nombreCai(a.usuario)}</td>
      <td className="py-1.5 pr-2"><span className={clsx('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', ev.clase)}>{ev.texto}</span></td>
      <td className="py-1.5 pr-2 text-slate-600">{a.detalle || '—'}</td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums text-slate-600">{a.distancia_km != null ? `${a.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km` : '—'}</td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-slate-500" title={a.dispositivo ?? ''}>{equipo(a.dispositivo)}</td>
    </tr>
  );
}

function FilaUsuario({ u, info, clave, recargar }: { u: UsuarioCai; info?: { ultimo: string | null; ingresos: number }; clave: string; recargar: () => void }) {
  const [asignando, setAsignando] = useState(false);
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const estado = !u.activo
    ? { texto: 'Desactivado', clase: 'bg-slate-100 text-slate-500', icono: <XCircle size={12} /> }
    : !u.tieneClave
      ? { texto: 'Sin contraseña', clase: 'bg-amber-50 text-amber-700', icono: <KeyRound size={12} /> }
      : u.enLinea
        ? { texto: 'En línea', clase: 'bg-emerald-50 text-emerald-700', icono: <span className="h-2 w-2 rounded-full bg-emerald-500" /> }
        : { texto: 'Fuera de línea', clase: 'bg-slate-50 text-slate-500', icono: <span className="h-2 w-2 rounded-full bg-slate-300" /> };
  const accion = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    setMsg(r.ok ? ok : r.error || 'No se pudo.');
    if (r.ok) { setAsignando(false); setNueva(''); recargar(); }
  };
  const boton = 'flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold disabled:opacity-50';
  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="py-2 pr-2 font-bold text-[#10233f]">{u.nombre || nombreCai(u.usuario)}<p className="text-[10.5px] font-normal text-slate-400">usuario: {u.usuario}{u.perfil === 'consulta_piloto' && <span className="ml-1 rounded bg-[#e3f2ef] px-1 font-semibold text-[#0f5f57]">Piloto · /piloto</span>}</p></td>
      <td className="py-2 pr-2"><span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold', estado.clase)}>{estado.icono}{estado.texto}</span></td>
      <td className="whitespace-nowrap py-2 pr-2 tabular-nums text-slate-700">{info?.ultimo ? fFechaHora(info.ultimo) : '—'}</td>
      <td className="py-2 pr-2 text-center font-bold tabular-nums text-[#10233f]">{info?.ingresos ?? 0}</td>
      <td className="py-2 pr-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" disabled={ocupado} onClick={() => { setAsignando((v) => !v); setMsg(null); }} className={clsx(boton, 'border-slate-300 text-[#10233f] hover:bg-slate-50')}>
            <KeyRound size={12} /> {u.tieneClave ? 'Cambiar contraseña' : 'Asignar contraseña'}
          </button>
          <button type="button" disabled={ocupado} onClick={() => accion(() => adminCambiarEstado(clave, u.usuario, !u.activo), u.activo ? 'Usuario desactivado.' : 'Usuario activado.')} className={clsx(boton, u.activo ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50')}>
            <Power size={12} /> {u.activo ? 'Desactivar' : 'Activar'}
          </button>
          {u.enLinea && (
            <button type="button" disabled={ocupado} onClick={() => accion(() => adminCerrarSesion(clave, u.usuario), 'Sesión cerrada.')} className={clsx(boton, 'border-amber-200 text-amber-700 hover:bg-amber-50')}>
              <LogOut size={12} /> Cerrar sesión
            </button>
          )}
        </div>
        {asignando && (
          <form onSubmit={(e) => { e.preventDefault(); accion(() => adminAsignarClave(clave, u.usuario, nueva), 'Contraseña asignada. Entrégasela al comandante por un canal privado.'); }} className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <input type="text" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva contraseña (mín. 6)" autoComplete="off" className="w-48 rounded-md border border-slate-300 px-2 py-1 text-[12px]" />
            <button type="submit" disabled={ocupado || nueva.length < 6} className="flex items-center gap-1 rounded-md bg-[#10233f] px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50">
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Guardar
            </button>
          </form>
        )}
        {msg && <p className="mt-1 text-[11px] text-slate-500">{msg}</p>}
      </td>
    </tr>
  );
}
