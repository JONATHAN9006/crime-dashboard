import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, Ban, Power, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Clock, Cog, Download,
  FileSpreadsheet, FileText, Filter, Info, KeyRound, ListFilter, Loader2, Lock, LogIn, LogOut, MapPinned, MinusCircle, MoreHorizontal, RefreshCw,
  Search, Shield, ShieldAlert, ShieldX, User, UserCog, Users, X, XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import * as XLSX from 'xlsx';
import { puedeDescargar } from '../../utils/permisos';
import { adminBitacora, adminBitacoraExportar, type FiltrosBitacora, type PaginaBitacora, type RolCuenta } from '../../cuentas/apiCuentas';

// Bitácora de accesos (solo administrador). Filtros, paginación, orden e
// indicadores los resuelve el servidor (accesoCuentas → admin_bitacora): aquí
// solo se pide la página que se ve. Es de solo lectura: no hay forma de
// editar ni borrar registros.

const NOMBRE_ROL: Record<string, string> = { administrador: 'Administrador', interno: 'Usuario interno', piloto: 'Usuario piloto' };

type Tono = 'verde' | 'rojo' | 'ambar' | 'gris' | 'azul' | 'violeta' | 'naranja';
const TONO: Record<Tono, { chip: string; icono: string }> = {
  verde: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-100', icono: 'text-emerald-600' },
  rojo: { chip: 'bg-rose-50 text-rose-600 ring-rose-100', icono: 'text-rose-600' },
  ambar: { chip: 'bg-amber-50 text-amber-700 ring-amber-100', icono: 'text-amber-600' },
  gris: { chip: 'bg-slate-100 text-slate-600 ring-slate-200', icono: 'text-slate-500' },
  azul: { chip: 'bg-blue-50 text-blue-700 ring-blue-100', icono: 'text-blue-600' },
  violeta: { chip: 'bg-violet-50 text-violet-700 ring-violet-100', icono: 'text-violet-600' },
  naranja: { chip: 'bg-orange-50 text-orange-700 ring-orange-100', icono: 'text-orange-600' },
};

/** Etiqueta de cada tipo de evento que escribe el servidor (texto + ícono + color). */
const EVENTOS: Record<string, { texto: string; Icono: typeof LogIn; tono: Tono; sensible?: boolean }> = {
  ingreso: { texto: 'Ingreso', Icono: LogIn, tono: 'verde' },
  fallido: { texto: 'Intento fallido', Icono: LogIn, tono: 'rojo' },
  rechazado: { texto: 'Rechazado', Icono: Ban, tono: 'ambar' },
  bloqueado: { texto: 'Bloqueado', Icono: Lock, tono: 'rojo' },
  salida: { texto: 'Salida', Icono: LogOut, tono: 'gris' },
  expirada: { texto: 'Sesión expirada', Icono: Clock, tono: 'gris' },
  cerrada: { texto: 'Sesión cerrada', Icono: LogOut, tono: 'gris' },
  seguridad: { texto: 'Seguridad', Icono: ShieldAlert, tono: 'violeta' },
  admin: { texto: 'Administración', Icono: Cog, tono: 'azul' },
  sensible_clave: { texto: 'Contraseña', Icono: KeyRound, tono: 'naranja', sensible: true },
  sensible_estado: { texto: 'Estado de cuenta', Icono: UserCog, tono: 'naranja', sensible: true },
  sensible_territorio: { texto: 'Territorio', Icono: MapPinned, tono: 'naranja', sensible: true },
  sensible_sesiones: { texto: 'Sesiones', Icono: LogOut, tono: 'naranja', sensible: true },
  suspension_activada: { texto: 'Servicio no disponible', Icono: Ban, tono: 'naranja', sensible: true },
  suspension_desactivada: { texto: 'Acceso restablecido', Icono: Power, tono: 'naranja', sensible: true },
  suspension_finalizada: { texto: 'Fin de suspensión', Icono: Power, tono: 'naranja', sensible: true },
};
const eventoDe = (e: string) => EVENTOS[e] ?? { texto: e, Icono: Info, tono: 'gris' as Tono };

// «hasta=2026-11-04T18:41:00.000Z» (suspensión) → «hasta las 1:41 p. m. del 04 nov».
const detalleLegible = (d: string | null) => (d ? d.replace(/hasta=(\S+)/, (_, iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? `hasta ${iso}` : `hasta las ${t.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })} del ${t.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short' })}`;
}) : d);
const EXITOSOS = new Set(['ingreso', 'salida', 'expirada', 'cerrada', 'admin', 'sensible_clave', 'sensible_estado', 'sensible_territorio', 'sensible_sesiones', 'suspension_activada', 'suspension_desactivada', 'suspension_finalizada']);
const FALLIDOS = new Set(['fallido', 'rechazado', 'bloqueado']);
/** Resultado según el tipo de evento registrado (no hay una columna aparte de resultado). */
function resultadoDe(e: string): { texto: string; tono: Tono; Icono: typeof CheckCircle2 } {
  if (FALLIDOS.has(e)) return { texto: 'Fallido', tono: 'rojo', Icono: XCircle };
  if (EXITOSOS.has(e)) return { texto: 'Exitoso', tono: 'verde', Icono: CheckCircle2 };
  if (e === 'seguridad') return { texto: 'Alerta', tono: 'ambar', Icono: ShieldAlert };
  return { texto: 'No registrado', tono: 'gris', Icono: MinusCircle };
}

const OPC_TIPO = [
  { v: '', t: 'Todos los eventos' }, { v: 'ingreso', t: 'Ingreso' }, { v: 'fallido', t: 'Intento fallido' }, { v: 'salida', t: 'Salida' },
  { v: 'admin', t: 'Administración' }, { v: 'sensible', t: 'Cambio sensible' }, { v: 'seguridad', t: 'Seguridad' },
];
const OPC_RESULTADO = [{ v: '', t: 'Todos los resultados' }, { v: 'exitoso', t: 'Exitoso' }, { v: 'fallido', t: 'Fallido' }, { v: 'alerta', t: 'Alerta' }];
const PERIODOS = [{ d: 7, t: 'Últimos 7 días' }, { d: 30, t: 'Últimos 30 días' }, { d: 90, t: 'Últimos 90 días' }];

const DIA = 86400000;
const hoyIso = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const restarDias = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00-05:00`).getTime() - n * DIA - 5 * 3600000).toISOString().slice(0, 10);
const fechaCorta = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fechaHoraLarga = (iso: string) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'medium' });

type Fila = NonNullable<PaginaBitacora['filas']>[number];
type Orden = { campo: 'fecha' | 'rol' | 'evento' | 'detalle' | 'ip'; asc: boolean };

function Chip({ tono, Icono, texto, extra }: { tono: Tono; Icono: typeof LogIn; texto: string; extra?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold ring-1', TONO[tono].chip)}>
      <Icono size={13} strokeWidth={2.3} />
      {extra && <span className="font-bold uppercase tracking-wide">{extra} ·</span>}
      {texto}
    </span>
  );
}

function Variacion({ actual, anterior, subirEsMalo = false }: { actual: number; anterior: number; subirEsMalo?: boolean }) {
  if (anterior === 0) return <p className="text-right text-[11px] leading-tight text-slate-400">Sin dato<br />comparable</p>;
  const pct = ((actual - anterior) / anterior) * 100;
  const sube = pct > 0;
  const igual = Math.abs(pct) < 0.5;
  const malo = subirEsMalo ? sube : false;
  return (
    <div className="text-right">
      <span className={clsx('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12.5px] font-bold', igual ? 'bg-slate-100 text-slate-500' : malo ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700')}>
        {!igual && (sube ? <ArrowUp size={13} strokeWidth={3} /> : <ArrowDown size={13} strokeWidth={3} />)}
        {igual ? '0%' : `${Math.abs(pct).toFixed(0)}%`}
      </span>
      <p className="mt-0.5 text-[11px] text-slate-400">vs. periodo anterior</p>
    </div>
  );
}

function Indicador({ fondo, borde, iconoFondo, icono, valor, etiqueta, colorValor, derecha }: { fondo: string; borde: string; iconoFondo: string; icono: ReactNode; valor: ReactNode; etiqueta: string; colorValor: string; derecha?: ReactNode }) {
  return (
    <div className={clsx('flex min-h-[92px] items-center gap-4 rounded-2xl border px-4 py-3', fondo, borde)}>
      <span className={clsx('flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl', iconoFondo)}>{icono}</span>
      <div className="min-w-0 flex-1">
        <p className={clsx('text-[30px] font-extrabold leading-none tabular-nums', colorValor)}>{valor}</p>
        <p className="mt-1.5 text-[14px] text-slate-600">{etiqueta}</p>
      </div>
      {derecha}
    </div>
  );
}

function Campo({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[12.5px] font-semibold text-[#10233f]">{etiqueta}</span>
      {children}
    </label>
  );
}

function SelectIcono({ icono, value, onChange, opciones, aria }: { icono: ReactNode; value: string; onChange: (v: string) => void; opciones: { v: string; t: string }[]; aria: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icono}</span>
      <select aria-label={aria} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-[13.5px] font-medium text-[#10233f] shadow-[0_1px_2px_rgba(16,35,63,0.04)] focus:border-[#116762] focus:outline-none focus:ring-2 focus:ring-[#116762]/15">
        {opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

/** Números de página con «…» (siempre primera, última y las cercanas a la actual). */
function paginasVisibles(actual: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, actual, actual - 1, actual + 1]);
  if (actual <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (actual >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

export function BitacoraAccesos({ rol, setRol }: { rol: RolCuenta | ''; setRol: (r: RolCuenta | '') => void }) {
  const [hasta, setHasta] = useState(hoyIso);
  const [desde, setDesde] = useState(() => restarDias(hoyIso(), 29));
  const [tipo, setTipo] = useState('');
  const [resultado, setResultado] = useState('');
  const [buscarTexto, setBuscarTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const [orden, setOrden] = useState<Orden>({ campo: 'fecha', asc: false });
  const [datos, setDatos] = useState<PaginaBitacora | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuPeriodo, setMenuPeriodo] = useState(false);
  const [menuExportar, setMenuExportar] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [avisoExport, setAvisoExport] = useState<string | null>(null);
  const [menuFila, setMenuFila] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<Fila | null>(null);
  const consulta = useRef(0);

  // Búsqueda con pausa (no consulta en cada tecla).
  useEffect(() => { const id = window.setTimeout(() => setBuscar(buscarTexto.trim()), 350); return () => window.clearTimeout(id); }, [buscarTexto]);
  useEffect(() => { setPagina(1); }, [desde, hasta, rol, tipo, resultado, buscar, porPagina, orden]);

  const filtros: FiltrosBitacora = useMemo(() => ({ desde, hasta, rol, tipo, resultado, buscar }), [desde, hasta, rol, tipo, resultado, buscar]);
  const cargar = useCallback(async () => {
    const n = ++consulta.current;
    setCargando(true);
    const r = await adminBitacora({ ...filtros, orden: orden.campo, asc: orden.asc }, pagina, porPagina);
    if (n !== consulta.current) return;
    setCargando(false);
    if (r.ok) { setDatos(r); setError(null); } else setError(r.error || 'No fue posible consultar la bitácora.');
  }, [filtros, pagina, porPagina, orden]);
  useEffect(() => { cargar(); }, [cargar]);

  const diasPeriodo = Math.round((new Date(`${hasta}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / DIA) + 1;
  const preset = hasta === hoyIso() ? PERIODOS.find((p) => p.d === diasPeriodo) : undefined;
  const textoPeriodo = preset ? preset.t : 'Periodo personalizado';
  const elegirPeriodo = (d: number) => { const h = hoyIso(); setHasta(h); setDesde(restarDias(h, d - 1)); setMenuPeriodo(false); };
  const limpiar = () => { setRol(''); setTipo(''); setResultado(''); setBuscarTexto(''); setBuscar(''); setOrden({ campo: 'fecha', asc: false }); elegirPeriodo(30); };
  const hayFiltros = rol !== '' || tipo !== '' || resultado !== '' || buscar !== '' || !(preset?.d === 30);

  const total = datos?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const filas = datos?.filas ?? [];
  const I = datos?.indicadores;

  async function exportar(formato: 'xlsx' | 'csv') {
    setMenuExportar(false);
    setExportando(true);
    setAvisoExport(null);
    const r = await adminBitacoraExportar(filtros);
    setExportando(false);
    if (!r.ok || !r.filas) { setAvisoExport(r.error || 'No fue posible exportar.'); return; }
    const datosHoja = r.filas.map((e) => ({
      'Fecha y hora': new Date(e.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      Cuenta: NOMBRE_ROL[e.rol] ?? e.rol,
      Evento: `${eventoDe(e.evento).sensible ? 'Cambio sensible · ' : ''}${eventoDe(e.evento).texto}`,
      Detalle: e.detalle ?? '',
      IP: e.ip ?? '',
      Resultado: resultadoDe(e.evento).texto,
    }));
    const hoja = XLSX.utils.json_to_sheet(datosHoja);
    const nombre = `bitacora-accesos-${r.desde ?? desde}-a-${r.hasta ?? hasta}`;
    if (formato === 'csv') {
      const csv = '﻿' + XLSX.utils.sheet_to_csv(hoja, { FS: ';' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `${nombre}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, 'Bitácora');
      XLSX.writeFile(libro, `${nombre}.xlsx`);
    }
    if (r.truncado) setAvisoExport(`Se exportaron los 10.000 registros más recientes de ${r.total?.toLocaleString('es-CO')}. Acota el periodo o los filtros para exportar el resto.`);
  }

  const encabezado = (campo: Orden['campo'] | null, texto: string, className = '') => (
    <th className={clsx('px-3 py-3 text-left text-[13.5px] font-bold', className)}>
      {campo ? (
        <button type="button" onClick={() => setOrden((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: campo !== 'fecha' }))} className="inline-flex items-center gap-1.5 hover:text-white/80" title={`Ordenar por ${texto.toLowerCase()}`}>
          {texto}
          {orden.campo === campo ? (orden.asc ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ChevronsUpDown size={13} className="opacity-70" />}
        </button>
      ) : texto}
    </th>
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(16,35,63,0.06)] sm:p-6" data-bitacora="1">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-[280px] flex-1 items-center gap-4">
          <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl bg-[#e3f2ef] text-[#116762]"><Users size={30} /></span>
          <span className="h-7 w-px bg-slate-300" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#10233f]">Bitácora de accesos</h2>
            <p className="text-[15px] text-slate-500">Ingresos, intentos fallidos, salidas y acciones del administrador</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <button type="button" onClick={() => setMenuPeriodo((v) => !v)} aria-haspopup="menu" aria-expanded={menuPeriodo} className="flex h-[58px] min-w-[250px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left shadow-[0_1px_2px_rgba(16,35,63,0.04)] hover:bg-slate-50">
              <CalendarDays size={20} className="shrink-0 text-[#10233f]" />
              <span className="leading-tight">
                <span className="block text-[13.5px] font-semibold text-[#10233f]">{textoPeriodo}</span>
                <span className="block text-[13px] text-slate-500" data-periodo-consultado>{fechaCorta(datos?.desde ?? desde)} – {fechaCorta(datos?.hasta ?? hasta)}</span>
              </span>
              <ChevronDown size={15} className="ml-auto text-slate-400" />
            </button>
            {menuPeriodo && (
              <div role="menu" className="absolute right-0 top-[62px] z-30 w-[220px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-[13px] shadow-lg" onMouseLeave={() => setMenuPeriodo(false)}>
                {PERIODOS.map((p) => (
                  <button key={p.d} type="button" role="menuitem" onClick={() => elegirPeriodo(p.d)} className={clsx('flex w-full items-center justify-between px-3.5 py-2 text-left hover:bg-slate-50', preset?.d === p.d ? 'font-bold text-[#116762]' : 'text-slate-700')}>
                    {p.t} {preset?.d === p.d && <CheckCircle2 size={14} />}
                  </button>
                ))}
                <p className="border-t border-slate-100 px-3.5 py-2 text-[11.5px] text-slate-400">Para otro periodo, usa «Rango de fechas».</p>
              </div>
            )}
          </div>
          <button type="button" onClick={() => cargar()} disabled={cargando} className="flex h-[58px] items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-5 text-[15px] font-semibold text-[#10233f] shadow-[0_1px_2px_rgba(16,35,63,0.04)] hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={19} className={clsx(cargando && 'animate-spin')} /> Actualizar
          </button>
          {puedeDescargar() && (
            <div className="relative flex h-[58px] overflow-hidden rounded-xl bg-[#0f5f57] text-white shadow-sm">
              <button type="button" onClick={() => exportar('xlsx')} disabled={exportando || total === 0} title="Exporta a Excel los registros del periodo y filtros elegidos" className="flex items-center gap-2.5 px-5 text-[15px] font-bold hover:bg-[#0c524b] disabled:opacity-60">
                {exportando ? <Loader2 size={19} className="animate-spin" /> : <Download size={19} />} Exportar
              </button>
              <button type="button" onClick={() => setMenuExportar((v) => !v)} disabled={exportando || total === 0} aria-label="Más formatos de exportación" className="flex w-11 items-center justify-center border-l border-white/15 hover:bg-[#0c524b] disabled:opacity-60">
                <ChevronDown size={18} />
              </button>
              {menuExportar && (
                <div role="menu" className="absolute right-0 top-[62px] z-30 w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-[13px] text-slate-700 shadow-lg" onMouseLeave={() => setMenuExportar(false)}>
                  <button type="button" role="menuitem" onClick={() => exportar('xlsx')} className="flex w-full items-center gap-2 px-3.5 py-2 hover:bg-slate-50"><FileSpreadsheet size={15} className="text-emerald-700" /> Excel (.xlsx)</button>
                  <button type="button" role="menuitem" onClick={() => exportar('csv')} className="flex w-full items-center gap-2 px-3.5 py-2 hover:bg-slate-50"><FileText size={15} className="text-slate-500" /> CSV (.csv)</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {avisoExport && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">{avisoExport}</p>}

      {/* ── Indicadores ── */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4" data-indicadores>
        <Indicador fondo="bg-[#f6fbf9]" borde="border-[#dcefe8]" iconoFondo="bg-[#d9f2e8]" icono={<User size={32} className="text-emerald-600" />} colorValor="text-[#10233f]" valor={I ? I.ingresos.actual.toLocaleString('es-CO') : '—'} etiqueta="Ingresos exitosos" derecha={I && <Variacion actual={I.ingresos.actual} anterior={I.ingresos.anterior} />} />
        <Indicador fondo="bg-[#fff6f7]" borde="border-[#fbe1e5]" iconoFondo="bg-[#fde2e6]" icono={<ShieldX size={32} className="text-rose-600" />} colorValor="text-rose-600" valor={I ? I.fallidos.actual.toLocaleString('es-CO') : '—'} etiqueta="Intentos fallidos" derecha={I && <Variacion actual={I.fallidos.actual} anterior={I.fallidos.anterior} subirEsMalo />} />
        <Indicador fondo="bg-[#f7f9ff]" borde="border-[#e2e8fb]" iconoFondo="bg-[#e3ebfd]" icono={<Cog size={32} className="text-blue-600" />} colorValor="text-[#10233f]" valor={I ? I.administrativas.actual.toLocaleString('es-CO') : '—'} etiqueta="Acciones administrativas" derecha={I && <Variacion actual={I.administrativas.actual} anterior={I.administrativas.anterior} />} />
        <Indicador fondo="bg-[#faf7ff]" borde="border-[#ece4fb]" iconoFondo="bg-[#ede5fd]" icono={<User size={32} className="text-violet-600" />} colorValor="text-[#10233f]" valor={I ? I.cuentasConActividad : '—'} etiqueta="Cuentas con actividad" />
      </div>

      {/* ── Filtros ── */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,35,63,0.03)]">
        <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_1.05fr]">
          <Campo etiqueta="Cuenta">
            <SelectIcono aria="Cuenta" icono={<User size={16} />} value={rol} onChange={(v) => setRol(v as RolCuenta | '')} opciones={[{ v: '', t: 'Todas las cuentas' }, ...(['administrador', 'interno', 'piloto'] as const).map((r) => ({ v: r, t: NOMBRE_ROL[r] }))]} />
          </Campo>
          <Campo etiqueta="Tipo de evento">
            <SelectIcono aria="Tipo de evento" icono={<ListFilter size={16} />} value={tipo} onChange={setTipo} opciones={OPC_TIPO} />
          </Campo>
          <Campo etiqueta="Resultado">
            <SelectIcono aria="Resultado" icono={<Shield size={16} />} value={resultado} onChange={setResultado} opciones={OPC_RESULTADO} />
          </Campo>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#10233f]">Rango de fechas</span>
            <div className="flex items-center gap-2">
              <div className="flex h-10 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white">
                <span className="flex w-10 items-center justify-center border-r border-slate-200 text-slate-500"><CalendarDays size={16} /></span>
                <input type="date" aria-label="Fecha inicial" value={desde} max={hasta} min={restarDias(hoyIso(), 399)} onChange={(e) => e.target.value && setDesde(e.target.value)} className="w-[132px] px-2.5 text-[13.5px] text-[#10233f] focus:outline-none" />
              </div>
              <span className="text-slate-400">—</span>
              <input type="date" aria-label="Fecha final" value={hasta} min={desde} max={hoyIso()} onChange={(e) => e.target.value && setHasta(e.target.value)} className="h-10 w-[150px] rounded-xl border border-slate-200 bg-white px-3 text-[13.5px] text-[#10233f] focus:border-[#116762] focus:outline-none" />
              <button type="button" onClick={limpiar} disabled={!hayFiltros} title="Limpiar filtros (vuelve a los últimos 30 días)" aria-label="Limpiar filtros" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50 disabled:opacity-40">
                <X size={17} />
              </button>
            </div>
          </div>
          <div className="relative sm:col-span-2 xl:col-span-1 xl:self-end">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="search" value={buscarTexto} onChange={(e) => setBuscarTexto(e.target.value)} placeholder="Buscar en la bitácora..." aria-label="Buscar en la bitácora" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-[13.5px] text-[#10233f] placeholder:text-slate-400 focus:border-[#116762] focus:outline-none focus:ring-2 focus:ring-[#116762]/15 [&::-webkit-search-cancel-button]:hidden" />
            {buscarTexto && <button type="button" onClick={() => setBuscarTexto('')} aria-label="Borrar búsqueda" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"><X size={16} /></button>}
          </div>
        </div>
        {/* Accesos rápidos: el MISMO filtro de «Cuenta» */}
        <div className="mt-4 flex flex-wrap gap-2.5" role="group" aria-label="Cuenta (acceso rápido)">
          {([['', 'Todas'], ['administrador', 'Administrador'], ['interno', 'Usuario interno'], ['piloto', 'Usuario piloto']] as const).map(([v, t]) => (
            <button key={v} type="button" onClick={() => setRol(v)} aria-pressed={rol === v} className={clsx('rounded-full px-5 py-2 text-[14px] font-semibold transition', rol === v ? 'bg-[#0f5f57] text-white shadow-sm' : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50')}>{t}</button>
          ))}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="relative mt-5 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[980px] border-collapse text-[14px]">
          <thead className="bg-[#10233f] text-white">
            <tr>
              <th className="w-11 px-2 py-3" aria-label="Tipo" />
              {encabezado('fecha', 'Fecha y hora')}
              {encabezado('rol', 'Cuenta')}
              {encabezado('evento', 'Evento')}
              {encabezado('detalle', 'Detalle')}
              {encabezado('ip', 'IP')}
              {encabezado(null, 'Resultado')}
              <th className="w-24 px-3 py-3 text-center text-[13.5px] font-bold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const ev = eventoDe(f.evento);
              const res = resultadoDe(f.evento);
              const fallo = res.texto === 'Fallido';
              return (
                <tr key={f.id} className={clsx('border-t border-slate-100 transition-colors', fallo ? 'bg-rose-50/70 hover:bg-rose-50' : 'bg-white hover:bg-slate-50')}>
                  <td className="px-2 py-2.5 text-center"><ev.Icono size={17} strokeWidth={2.2} className={clsx('mx-auto', TONO[ev.tono].icono)} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[#10233f]">{fechaHora(f.fecha)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[#10233f]">{NOMBRE_ROL[f.rol] ?? f.rol}</td>
                  <td className="px-3 py-2.5"><Chip tono={ev.tono} Icono={ev.Icono} texto={ev.texto} extra={ev.sensible ? 'Sensible' : undefined} /></td>
                  <td className="max-w-[340px] px-3 py-2.5 text-slate-600">
                    <span className="line-clamp-1" title={detalleLegible(f.detalle) ?? ''}>{detalleLegible(f.detalle) || (f.evento === 'ingreso' ? 'Inicio de sesión en el sistema' : '—')}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{f.ip || '—'}</td>
                  <td className="px-3 py-2.5"><Chip tono={res.tono} Icono={res.Icono} texto={res.texto} /></td>
                  <td className="relative px-3 py-2.5 text-center">
                    <button type="button" onClick={() => setMenuFila(menuFila === f.id ? null : f.id)} aria-label="Acciones del registro" className="rounded-md p-1 text-[#10233f] hover:bg-slate-100"><MoreHorizontal size={19} /></button>
                    {menuFila === f.id && (
                      <div className="absolute right-3 top-9 z-20 w-[210px] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left text-[13px] shadow-lg" onMouseLeave={() => setMenuFila(null)}>
                        <button type="button" onClick={() => { setDetalle(f); setMenuFila(null); }} className="flex w-full items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50"><Info size={14} /> Ver detalle completo</button>
                        <button type="button" onClick={() => { setRol(f.rol as RolCuenta); setMenuFila(null); }} className="flex w-full items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50"><Filter size={14} /> Filtrar por esta cuenta</button>
                        {f.ip && <button type="button" onClick={() => { setBuscarTexto(f.ip ?? ''); setMenuFila(null); }} className="flex w-full items-center gap-2 px-3.5 py-2 text-slate-700 hover:bg-slate-50"><Search size={14} /> Buscar esta IP</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!datos && !error && <div className="flex h-[300px] items-center justify-center text-[13.5px] text-slate-400"><Loader2 size={18} className="mr-2 animate-spin" /> Cargando bitácora…</div>}
        {datos && filas.length === 0 && <p className="py-14 text-center text-[13.5px] text-slate-400">No hay registros con estos filtros en el periodo elegido.</p>}
        {error && <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{error}</p>}
        {cargando && datos && <div className="pointer-events-none absolute inset-0 bg-white/40" aria-hidden />}
      </div>

      {/* ── Paginación ── */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14.5px] text-slate-600" data-mostrando>
          {total > 0 ? `Mostrando ${(pagina - 1) * porPagina + 1} a ${Math.min(pagina * porPagina, total)} de ${total.toLocaleString('es-CO')} registros` : 'Sin registros'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14.5px] text-slate-600">Registros por página</span>
          <div className="relative">
            <select aria-label="Registros por página" value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="h-11 w-[104px] appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-9 text-[14.5px] text-[#10233f] focus:outline-none">
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#10233f]" />
          </div>
          <nav className="flex items-center gap-2" aria-label="Paginación">
            <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} aria-label="Página anterior" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50 disabled:text-slate-300"><ChevronLeft size={18} /></button>
            {paginasVisibles(pagina, totalPaginas).map((p, i) => p === '…'
              ? <span key={`e${i}`} className="px-1 text-slate-400">…</span>
              : <button key={p} type="button" onClick={() => setPagina(p)} aria-current={p === pagina ? 'page' : undefined} className={clsx('flex h-11 min-w-[44px] items-center justify-center rounded-xl px-2 text-[14.5px] font-semibold', p === pagina ? 'bg-[#0f5f57] text-white shadow-sm' : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50')}>{p}</button>)}
            <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas} aria-label="Página siguiente" className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50 disabled:text-slate-300"><ChevronRight size={18} /></button>
          </nav>
        </div>
      </div>

      {/* ── Detalle completo de un registro ── */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10233f]/40 p-4" onClick={() => setDetalle(null)} role="dialog" aria-modal="true" aria-label="Detalle del registro">
          <div className="w-full max-w-[520px] rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-extrabold text-[#10233f]">Detalle del registro</p>
                <p className="text-[12.5px] text-slate-500">Registro n.° {detalle.id} · solo lectura</p>
              </div>
              <button type="button" onClick={() => setDetalle(null)} aria-label="Cerrar" className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <dl className="mt-4 space-y-2.5 text-[13.5px]">
              {([
                ['Fecha y hora', fechaHoraLarga(detalle.fecha)],
                ['Cuenta', NOMBRE_ROL[detalle.rol] ?? detalle.rol],
                ['Evento', <Chip key="e" tono={eventoDe(detalle.evento).tono} Icono={eventoDe(detalle.evento).Icono} texto={eventoDe(detalle.evento).texto} extra={eventoDe(detalle.evento).sensible ? 'Sensible' : undefined} />],
                ['Resultado', <Chip key="r" tono={resultadoDe(detalle.evento).tono} Icono={resultadoDe(detalle.evento).Icono} texto={resultadoDe(detalle.evento).texto} />],
                ['Detalle', detalle.detalle || '—'],
                ['IP', detalle.ip || '—'],
                ['Dispositivo', detalle.dispositivo || '—'],
                ...(detalle.distancia_km != null ? [['Distancia a Popayán', `${detalle.distancia_km.toFixed(1)} km`] as [string, ReactNode]] : []),
              ] as [string, ReactNode][]).map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_1fr] gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="break-words font-medium text-[#10233f]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-[11.5px] text-slate-400">La IP es un dato de auditoría; no identifica por sí sola a la persona.</p>
          </div>
        </div>
      )}
    </section>
  );
}
