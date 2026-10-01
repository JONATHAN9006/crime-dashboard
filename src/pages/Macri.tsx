import { Fragment, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Network, Upload, RefreshCcw, CloudUpload, Save, Undo2, Search, FileSpreadsheet, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { leerMatrizMacri, interpretarAporte, delitoDashboard, extraerComuna, type ObjetivoMacri } from '../data/macriParser';
import {
  guardarMacriLocal, cargarMacriLocal, descargarMacriSupabase, subirMacriSupabase, subirSeguimientoSupabase, compararCargas,
  type SeguimientoMacri, type ResumenCarga,
} from '../data/macriStorage';
import { sincronizarCapaMacriDesdeObjetivos } from '../data/puntosStorage';
import { formatNumero, formatDecimal } from '../utils/aggregations';

// ──────────────────────────────────────────────────────────────────────────
// MACRI — seguimiento de objetivos GIOC. Panel principal: UNA tabla, con
// las columnas de la tabla de seguimiento que ya se lleva a mano (Fecha
// final … Impacto en reducción), más dos columnas calculadas contra la
// base de Delictividad: "Delictividad MEPOY" y "Delitos comuna".
//
// Cómo se calcula el contraste (fila por fila):
//  · Delito a contrastar: los delitos que se escriben en "Aporte en casos"
//    (ej. "6 HURTOS PERSONAS" → H. Personas). Si el aporte es solo un
//    número, se usa el delito principal del objetivo.
//  · Delictividad MEPOY: casos de ese delito en toda la MEPOY, del 1 de
//    enero a la fecha de corte de la base de Delictividad.
//  · Delitos comuna: lo mismo, solo en la comuna de la zona de injerencia
//    (Comuna N ↔ CAI N, la misma numeración CAI COMUNA UNO…DIEZ del DB2).
//  · Impacto en reducción: aporte ÷ delitos de la comuna = qué parte de lo
//    que pasa en la comuna se le atribuye al objetivo (lo que se reduciría
//    al neutralizarlo); debajo, el mismo aporte ÷ delictividad MEPOY.
// ──────────────────────────────────────────────────────────────────────────

const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';
const DIAS_ALERTA = 15;

function seguimientoInicial(o: ObjetivoMacri): SeguimientoMacri {
  return {
    __id: o.__id,
    seCumple: o.seCumpleArchivo,
    prorroga: o.prorrogaArchivo,
    aporte: o.aporteArchivo,
    zonaTexto: null,
    observacion: '',
    actualizadoEn: '',
    actualizadoPor: '',
  };
}

function fechaCorta(d: Date | null): string {
  return d ? d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
}

function diasHasta(d: Date | null): number | null {
  if (!d) return null;
  const hoy = new Date();
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((d.getTime() - h.getTime()) / 86400000);
}

function pct(parte: number, total: number): string {
  return total > 0 ? `${formatDecimal((parte / total) * 100, 1)}%` : '—';
}

// Colores de estado — los conocidos tienen color fijo; cualquier estado
// nuevo que traiga la matriz cae en gris, sin romper nada.
function colorEstado(estado: string): string {
  const e = estado.toUpperCase();
  if (e.includes('PRIORIZADO')) return 'bg-sky-100 text-sky-800';
  if (e.includes('DESARROLLO') || e.includes('EJECUCI')) return 'bg-amber-100 text-amber-800';
  if (e.includes('PENDIENTE')) return 'bg-orange-100 text-orange-800';
  if (e.includes('FINALIZ') || e.includes('CERRAD') || e.includes('NEUTRALIZ') || e.includes('DESARTICUL')) return 'bg-emerald-100 text-emerald-800';
  if (e.includes('CANCEL') || e.includes('SUSPEND')) return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

interface FilaCalculada {
  o: ObjetivoMacri;
  s: SeguimientoMacri;
  zonaTexto: string;
  comuna: number | null;
  delitos: { delito: string; mepoy: number; comuna: number | null; aporte: number | null }[];
  aporteTotal: number;
  comunaTotal: number;
  mepoyTotal: number;
  noMedible: string | null;
  sinEquivalente: boolean;
  dias: number | null;
}

// ── Celdas editables ─────────────────────────────────────────────────────

function Marca({ activo, onClick, color, titulo }: { activo: boolean; onClick: () => void; color: 'verde' | 'rojo' | 'azul'; titulo: string }) {
  const tonos = { verde: 'border-emerald-600 bg-emerald-600', rojo: 'border-rose-600 bg-rose-600', azul: 'border-brand-navy bg-brand-navy' };
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs font-bold transition ${activo ? `${tonos[color]} text-white` : 'border-slate-300 bg-white text-transparent hover:border-slate-500'}`}
    >
      X
    </button>
  );
}

function CeldaAporte({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  if (editando) {
    return (
      <textarea
        autoFocus
        value={texto}
        rows={2}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => { setEditando(false); if (texto !== valor) onChange(texto); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } if (e.key === 'Escape') { setTexto(valor); setEditando(false); } }}
        placeholder="ej. 6 hurtos personas"
        className="w-40 rounded border border-brand-green px-1.5 py-1 text-xs outline-none"
      />
    );
  }
  return (
    <button type="button" onClick={() => { setTexto(valor); setEditando(true); }} className="w-full min-w-[110px] whitespace-pre-line rounded px-1.5 py-1 text-left text-xs hover:bg-emerald-50" title="Clic para editar (Enter guarda, Shift+Enter nueva línea)">
      {valor || <span className="text-slate-300">+ agregar</span>}
    </button>
  );
}

// ── Página ────────────────────────────────────────────────────────────────

export function Macri() {
  const { records, meta } = useData();
  const [objetivos, setObjetivos] = useState<ObjetivoMacri[] | null>(null);
  const [seguimiento, setSeguimiento] = useState<Record<string, SeguimientoMacri>>({});
  const [borrador, setBorrador] = useState<Record<string, SeguimientoMacri>>({});
  const [resumen, setResumen] = useState<ResumenCarga | null>(null);
  const [verResumen, setVerResumen] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [filtroAlerta, setFiltroAlerta] = useState<'vencidos' | 'porVencer' | 'cumplidos' | 'noCumplidos' | 'sinEvaluar' | 'prorroga' | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const { backendUrl, supabaseAnonKey, updatePassword } = obtenerConfig();
  const servidor = !!backendUrl && !!supabaseAnonKey;

  useEffect(() => {
    (async () => {
      if (servidor) {
        try {
          const r = await descargarMacriSupabase(backendUrl, supabaseAnonKey);
          if (r.objetivos.length > 0) {
            setObjetivos(r.objetivos); setSeguimiento(r.seguimiento); setResumen(r.resumen);
            await guardarMacriLocal(r);
            sincronizarCapaMacriDesdeObjetivos(r.objetivos).catch(() => {});
            return;
          }
        } catch { /* sin servidor — se usa la copia local */ }
      }
      const local = await cargarMacriLocal();
      if (local) {
        setObjetivos(local.objetivos); setSeguimiento(local.seguimiento); setResumen(local.resumen);
        sincronizarCapaMacriDesdeObjetivos(local.objetivos).catch(() => {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Aviso antes de cerrar la pestaña con cambios sin guardar.
  const pendientes = Object.keys(borrador).length;
  useEffect(() => {
    if (pendientes === 0) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [pendientes]);

  async function manejarArchivo(file: File) {
    setCargando(true); setError(null); setAviso(null);
    try {
      const nuevos = await leerMatrizMacri(file);
      if (nuevos.length === 0) throw new Error('La matriz no tiene objetivos.');
      const res = compararCargas(objetivos ?? [], nuevos, file.name);
      // Lo que trae el archivo manual en SE CUMPLE / PRÓRROGA / APORTE solo
      // se toma para objetivos que todavía NO tienen seguimiento guardado.
      setObjetivos(nuevos); setResumen(res); setVerResumen(true); setFiltroEstado(null);
      await guardarMacriLocal({ objetivos: nuevos, seguimiento, resumen: res });
      sincronizarCapaMacriDesdeObjetivos(nuevos).catch(() => {});
      setAviso(`${nuevos.length} objetivo(s) cargados.`);
      if (servidor) {
        try {
          await subirMacriSupabase(FUNCION_SUBIR_REGISTROS, updatePassword || 'sin-clave', nuevos, res, 'No identificado');
          setAviso(`${nuevos.length} objetivo(s) cargados y sincronizados con el servidor central.`);
        } catch (e) {
          setAviso(`${nuevos.length} objetivo(s) cargados en este navegador, pero no se pudo sincronizar: ${e instanceof Error ? e.message : 'error desconocido'}`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  function seguimientoDe(o: ObjetivoMacri): SeguimientoMacri {
    return borrador[o.__id] ?? seguimiento[o.__id] ?? seguimientoInicial(o);
  }

  function editar(o: ObjetivoMacri, cambio: Partial<SeguimientoMacri>) {
    setBorrador((b) => ({ ...b, [o.__id]: { ...seguimientoDe(o), ...cambio } }));
  }

  async function guardar() {
    if (pendientes === 0 || !objetivos) return;
    setGuardando(true); setError(null);
    const ahora = new Date().toISOString();
    const cambios = Object.values(borrador).map((s) => ({ ...s, actualizadoEn: ahora, actualizadoPor: 'Dashboard' }));
    const nuevoSeguimiento = { ...seguimiento };
    for (const c of cambios) nuevoSeguimiento[c.__id] = c;
    try {
      await guardarMacriLocal({ objetivos, seguimiento: nuevoSeguimiento, resumen });
      setSeguimiento(nuevoSeguimiento);
      setBorrador({});
      if (servidor) {
        try {
          await subirSeguimientoSupabase(FUNCION_SUBIR_REGISTROS, updatePassword || 'sin-clave', cambios, 'Dashboard');
          setAviso(`${cambios.length} cambio(s) guardados y sincronizados — todos verán el seguimiento actualizado.`);
        } catch (e) {
          setAviso(`${cambios.length} cambio(s) guardados en este navegador, pero no se pudieron sincronizar: ${e instanceof Error ? e.message : 'error desconocido'}`);
        }
      } else {
        setAviso(`${cambios.length} cambio(s) guardados en este navegador.`);
      }
    } finally {
      setGuardando(false);
    }
  }

  // ── Delictividad: año de la fecha de corte, 1 de enero → corte ─────────
  const corte = useMemo(() => meta?.fechaMaxParametro ?? meta?.fechaMax ?? null, [meta]);
  const conteos = useMemo(() => {
    const mepoy = new Map<string, number>();
    const porCai = new Map<string, number>();
    if (!corte) return { mepoy, porCai };
    const anio = corte.getFullYear();
    const limite = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate(), 23, 59, 59);
    for (const r of records) {
      if (r.anio !== anio || !r.fecha || r.fecha > limite) continue;
      const n = r.cantidad || 1;
      mepoy.set(r.delito, (mepoy.get(r.delito) || 0) + n);
      porCai.set(`${r.delito}|${r.cai}`, (porCai.get(`${r.delito}|${r.cai}`) || 0) + n);
    }
    return { mepoy, porCai };
  }, [records, corte]);

  const filas: FilaCalculada[] = useMemo(() => {
    if (!objetivos) return [];
    return objetivos
      .map((o) => {
        const s = borrador[o.__id] ?? seguimiento[o.__id] ?? seguimientoInicial(o);
        const zonaTexto = s.zonaTexto ?? o.zonaTexto;
        const comuna = s.zonaTexto != null ? extraerComuna(s.zonaTexto) : o.comuna;
        const base = delitoDashboard(o.delitoPrincipalTexto);
        const { items, noMedible } = interpretarAporte(s.aporte, base);
        const porDelito = new Map<string, number | null>();
        for (const it of items) if (it.delito) porDelito.set(it.delito, (porDelito.get(it.delito) ?? 0) + it.casos);
        if (porDelito.size === 0 && base) porDelito.set(base, null);
        const delitos = Array.from(porDelito.entries()).map(([delito, aporte]) => ({
          delito,
          aporte,
          mepoy: conteos.mepoy.get(delito) ?? 0,
          comuna: comuna != null ? conteos.porCai.get(`${delito}|CAI ${comuna}`) ?? 0 : null,
        }));
        const conAporte = delitos.filter((d) => d.aporte != null);
        return {
          o, s, zonaTexto, comuna, delitos, noMedible,
          sinEquivalente: delitos.length === 0,
          aporteTotal: conAporte.reduce((a, d) => a + (d.aporte ?? 0), 0),
          comunaTotal: conAporte.reduce((a, d) => a + (d.comuna ?? 0), 0),
          mepoyTotal: conAporte.reduce((a, d) => a + d.mepoy, 0),
          dias: diasHasta(o.fechaFinal),
        };
      })
      .sort((a, b) => (a.o.fechaFinal?.getTime() ?? Infinity) - (b.o.fechaFinal?.getTime() ?? Infinity) || a.o.nombreObjetivo.localeCompare(b.o.nombreObjetivo, 'es'));
  }, [objetivos, seguimiento, borrador, conteos]);

  const estados = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.o.estadoActual, (m.get(f.o.estadoActual) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filas]);

  const esVencido = (f: FilaCalculada) => f.dias != null && f.dias < 0 && f.s.seCumple !== 'SI';
  const esPorVencer = (f: FilaCalculada) => f.dias != null && f.dias >= 0 && f.dias <= DIAS_ALERTA && f.s.seCumple !== 'SI';
  const indicadores = useMemo(() => ({
    cumplidos: filas.filter((f) => f.s.seCumple === 'SI').length,
    noCumplidos: filas.filter((f) => f.s.seCumple === 'NO').length,
    sinEvaluar: filas.filter((f) => f.s.seCumple == null).length,
    prorroga: filas.filter((f) => f.s.prorroga).length,
    vencidos: filas.filter(esVencido).length,
    porVencer: filas.filter(esPorVencer).length,
  }), [filas]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (filtroEstado && f.o.estadoActual !== filtroEstado) return false;
      if (filtroAlerta === 'vencidos' && !esVencido(f)) return false;
      if (filtroAlerta === 'porVencer' && !esPorVencer(f)) return false;
      if (filtroAlerta === 'cumplidos' && f.s.seCumple !== 'SI') return false;
      if (filtroAlerta === 'noCumplidos' && f.s.seCumple !== 'NO') return false;
      if (filtroAlerta === 'sinEvaluar' && f.s.seCumple != null) return false;
      if (filtroAlerta === 'prorroga' && !f.s.prorroga) return false;
      if (q && ![f.o.nombreObjetivo, f.o.grupo, f.o.delitoPrincipal, f.o.estrategia, f.zonaTexto].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [filas, filtroEstado, filtroAlerta, busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  function descargarExcel() {
    const enc1 = ['FECHA FINAL', 'ESTADO ACTUAL', 'GRUPO', 'NOMBRE OBJETIVO', 'DELITO PRINCIPAL', 'ESTRATEGIA', 'SE CUMPLE', '', 'PRÓRROGA', 'ZONA INJERENCIA', 'DELICTIVIDAD MEPOY', 'DELITOS COMUNA', 'APORTE EN CASOS', 'IMPACTO EN REDUCCIÓN (COMUNA)', 'IMPACTO MEPOY'];
    const enc2 = ['', '', '', '', '', '', 'SI', 'NO', 'X', '', '', '', '', '', ''];
    const datos = visibles.map((f) => [
      fechaCorta(f.o.fechaFinal), f.o.estadoActual, f.o.grupo, f.o.nombreObjetivo, f.o.delitoPrincipalTexto, f.o.estrategia,
      f.s.seCumple === 'SI' ? 'X' : '', f.s.seCumple === 'NO' ? 'X' : '', f.s.prorroga ? 'X' : '', f.zonaTexto,
      f.delitos.map((d) => `${d.delito}: ${d.mepoy}`).join('\n'),
      f.delitos.map((d) => `${d.delito}: ${d.comuna ?? 'n/a'}`).join('\n'),
      f.s.aporte,
      f.aporteTotal > 0 && f.comunaTotal > 0 ? pct(f.aporteTotal, f.comunaTotal) : '',
      f.aporteTotal > 0 && f.mepoyTotal > 0 ? pct(f.aporteTotal, f.mepoyTotal) : '',
    ]);
    const hoja = XLSX.utils.aoa_to_sheet([enc1, enc2, ...datos]);
    hoja['!merges'] = [
      ...[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14].map((c) => ({ s: { r: 0, c }, e: { r: 1, c } })),
      { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } },
    ];
    hoja['!cols'] = [12, 20, 10, 24, 40, 12, 5, 5, 9, 16, 22, 22, 22, 14, 12].map((wch) => ({ wch }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Seguimiento GIOC');
    XLSX.writeFile(libro, `seguimiento_GIOC_MEPOY_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const chip = (activo: boolean) => `rounded-lg border px-3 py-1.5 text-left transition ${activo ? 'border-brand-navy bg-brand-navy text-white' : 'border-slate-200 bg-white hover:border-slate-400'}`;
  const hayCambiosCarga = resumen && (resumen.nuevos.length + resumen.retirados.length + resumen.cambiosEstado.length + resumen.cambiosFecha.length) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5">
        <Network size={18} className="text-brand-green" />
        <h2 className="text-base font-bold text-slate-800">MACRI — Seguimiento de objetivos GIOC</h2>
        <span className="ml-auto text-[11px] text-slate-500">
          {objetivos && `${objetivos.length} objetivo(s)`}
          {corte ? ` · Delictividad 1/01/${corte.getFullYear()} a ${fechaCorta(corte)}` : ' · sin base de Delictividad cargada'}
        </span>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="flex items-start justify-between gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800"><span>{aviso}</span><button onClick={() => setAviso(null)}><X size={14} /></button></div>}

      {/* Cambios respecto a la carga anterior */}
      {resumen && verResumen && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-bold text-amber-900">Última carga: {resumen.archivo} · {new Date(resumen.fecha).toLocaleString('es-CO')}</p>
            <button onClick={() => setVerResumen(false)} className="text-amber-700 hover:text-amber-900"><X size={14} /></button>
          </div>
          {!hayCambiosCarga ? (
            <p className="text-amber-800">Sin cambios respecto a la matriz anterior (o es la primera carga).</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {resumen.nuevos.length > 0 && <div><p className="font-semibold text-emerald-700">Nuevos ({resumen.nuevos.length})</p>{resumen.nuevos.map((n) => <p key={n}>{n}</p>)}</div>}
              {resumen.cambiosEstado.length > 0 && <div><p className="font-semibold text-sky-700">Cambiaron de estado ({resumen.cambiosEstado.length})</p>{resumen.cambiosEstado.map((c) => <p key={c.nombre}>{c.nombre}: {c.de} → <b>{c.a}</b></p>)}</div>}
              {resumen.cambiosFecha.length > 0 && <div><p className="font-semibold text-amber-700">Cambió la fecha final ({resumen.cambiosFecha.length})</p>{resumen.cambiosFecha.map((c) => <p key={c.nombre}>{c.nombre}: {c.de} → <b>{c.a}</b></p>)}</div>}
              {resumen.retirados.length > 0 && <div><p className="font-semibold text-rose-700">Ya no aparecen ({resumen.retirados.length})</p>{resumen.retirados.map((n) => <p key={n}>{n}</p>)}</div>}
            </div>
          )}
        </div>
      )}

      {/* Estado de los objetivos */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-stretch gap-2">
          <button onClick={() => { setFiltroEstado(null); setFiltroAlerta(null); }} className={chip(!filtroEstado && !filtroAlerta)}>
            <p className="text-[10px] font-semibold uppercase opacity-70">Todos</p><p className="text-lg font-bold">{filas.length}</p>
          </button>
          {estados.map(([estado, n]) => (
            <button key={estado} onClick={() => setFiltroEstado(filtroEstado === estado ? null : estado)} className={chip(filtroEstado === estado)}>
              <p className="text-[10px] font-semibold uppercase opacity-70">{estado}</p><p className="text-lg font-bold">{n}</p>
            </button>
          ))}
          <div className="mx-1 w-px self-stretch bg-slate-200" />
          {([
            ['cumplidos', 'Se cumple', indicadores.cumplidos, 'text-emerald-600'],
            ['noCumplidos', 'No se cumple', indicadores.noCumplidos, 'text-rose-600'],
            ['sinEvaluar', 'Sin evaluar', indicadores.sinEvaluar, 'text-slate-500'],
            ['prorroga', 'Con prórroga', indicadores.prorroga, 'text-brand-navy'],
            ['porVencer', `Vence ≤ ${DIAS_ALERTA} días`, indicadores.porVencer, 'text-amber-600'],
            ['vencidos', 'Vencidos', indicadores.vencidos, 'text-rose-600'],
          ] as const).map(([clave, titulo, n, color]) => (
            <button key={clave} onClick={() => setFiltroAlerta(filtroAlerta === clave ? null : clave)} className={chip(filtroAlerta === clave)}>
              <p className="text-[10px] font-semibold uppercase opacity-70">{titulo}</p>
              <p className={`text-lg font-bold ${filtroAlerta === clave ? '' : color}`}>{n}</p>
            </button>
          ))}
          <div className="ml-auto flex flex-col justify-center gap-1.5">
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
              {cargando ? <CloudUpload size={14} className="animate-pulse" /> : objetivos ? <RefreshCcw size={14} /> : <Upload size={14} />}
              {cargando ? 'Leyendo…' : objetivos ? 'Actualizar matriz GIOC' : 'Cargar matriz GIOC'}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={cargando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); e.target.value = ''; }} />
            </label>
            {objetivos && (
              <button onClick={descargarExcel} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-green hover:text-brand-green">
                <FileSpreadsheet size={14} /> Descargar Excel
              </button>
            )}
          </div>
        </div>
      </div>

      {!objetivos ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga la matriz GIOC (exportación del aplicativo o la tabla de seguimiento) para ver los objetivos.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Seguimiento de objetivos <span className="font-normal text-slate-400">({visibles.length} de {filas.length})</span></p>
            <label className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1">
              <Search size={12} className="text-slate-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar objetivo, grupo, delito, comuna…" className="w-56 text-xs outline-none" />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 text-[10.5px] uppercase tracking-wide text-white">
                <tr className="bg-brand-navy">
                  {['Fecha final', 'Estado actual', 'Grupo', 'Nombre objetivo', 'Delito principal', 'Estrategia'].map((h) => (
                    <th key={h} rowSpan={2} className="border border-white/15 px-2 py-2 text-left font-semibold">{h}</th>
                  ))}
                  <th colSpan={2} className="border border-white/15 px-2 py-1 text-center font-semibold">Se cumple</th>
                  <th className="border border-white/15 px-2 py-1 text-center font-semibold">Prórroga</th>
                  <th rowSpan={2} className="border border-white/15 px-2 py-2 text-left font-semibold">Zona injerencia</th>
                  <th rowSpan={2} className="border border-white/15 bg-brand-green px-2 py-2 text-left font-semibold">Delictividad MEPOY</th>
                  <th rowSpan={2} className="border border-white/15 bg-brand-green px-2 py-2 text-left font-semibold">Delitos comuna</th>
                  <th rowSpan={2} className="border border-white/15 px-2 py-2 text-left font-semibold">Aporte en casos</th>
                  <th rowSpan={2} className="border border-white/15 px-2 py-2 text-center font-semibold">Impacto en reducción</th>
                </tr>
                <tr className="bg-brand-navy-light">
                  <th className="w-10 border border-white/15 px-1 py-1 text-center">Si</th>
                  <th className="w-10 border border-white/15 px-1 py-1 text-center">No</th>
                  <th className="w-14 border border-white/15 px-1 py-1 text-center">X</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f, i) => {
                  const editada = !!borrador[f.o.__id];
                  const reduccion = f.aporteTotal > 0 && f.comunaTotal > 0 ? (f.aporteTotal / f.comunaTotal) * 100 : null;
                  return (
                    <Fragment key={f.o.__id}>
                      <tr className={`${editada ? 'bg-amber-50' : i % 2 ? 'bg-slate-50/60' : 'bg-white'} border-b border-slate-100 align-top`}>
                        <td className="whitespace-nowrap px-2 py-2">
                          <p className="font-semibold text-slate-700">{fechaCorta(f.o.fechaFinal)}</p>
                          {f.dias != null && f.s.seCumple !== 'SI' && (
                            <p className={`text-[10px] font-semibold ${f.dias < 0 ? 'text-rose-600' : f.dias <= DIAS_ALERTA ? 'text-amber-600' : 'text-slate-400'}`}>
                              {f.dias < 0 ? <><AlertTriangle size={10} className="mr-0.5 inline" />vencido hace {-f.dias} d</> : `faltan ${f.dias} d`}
                            </p>
                          )}
                          {f.s.seCumple === 'SI' && <p className="text-[10px] font-semibold text-emerald-600"><CheckCircle2 size={10} className="mr-0.5 inline" />cumplido</p>}
                        </td>
                        <td className="px-2 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${colorEstado(f.o.estadoActual)}`}>{f.o.estadoActual}</span></td>
                        <td className="px-2 py-2 font-semibold text-slate-600">{f.o.grupo}</td>
                        <td className="px-2 py-2 font-bold text-brand-navy">{f.o.nombreObjetivo}</td>
                        <td className="px-2 py-2" title={f.o.delitoPrincipalTexto}>{f.o.delitoPrincipal}</td>
                        <td className="px-2 py-2 font-semibold text-slate-600">{f.o.estrategia || '—'}</td>
                        <td className="border-l border-slate-100 px-1 py-2 text-center">
                          <Marca activo={f.s.seCumple === 'SI'} color="verde" titulo="Se cumple" onClick={() => editar(f.o, { seCumple: f.s.seCumple === 'SI' ? null : 'SI' })} />
                        </td>
                        <td className="px-1 py-2 text-center">
                          <Marca activo={f.s.seCumple === 'NO'} color="rojo" titulo="No se cumple" onClick={() => editar(f.o, { seCumple: f.s.seCumple === 'NO' ? null : 'NO' })} />
                        </td>
                        <td className="border-x border-slate-100 px-1 py-2 text-center">
                          <Marca activo={f.s.prorroga} color="azul" titulo="Prórroga" onClick={() => editar(f.o, { prorroga: !f.s.prorroga })} />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={f.comuna != null ? String(f.comuna) : ''}
                            onChange={(e) => editar(f.o, { zonaTexto: e.target.value ? `Comuna ${e.target.value}` : '' })}
                            className={`rounded border px-1 py-0.5 text-xs ${f.comuna == null ? 'border-amber-300 text-amber-700' : 'border-slate-200'}`}
                          >
                            <option value="">{f.zonaTexto && f.comuna == null ? f.zonaTexto : 'Sin zona'}</option>
                            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>Comuna {n}</option>)}
                          </select>
                        </td>
                        <td className="bg-emerald-50/40 px-2 py-2">
                          {f.delitos.length === 0 ? <span className="text-slate-400" title="El delito principal no existe en la base de Delictividad">n/a</span> : f.delitos.map((d) => (
                            <p key={d.delito} className="whitespace-nowrap"><span className="text-slate-500">{d.delito}</span> <b className="text-slate-800">{formatNumero(d.mepoy)}</b></p>
                          ))}
                        </td>
                        <td className="bg-emerald-50/40 px-2 py-2">
                          {f.delitos.length === 0 ? <span className="text-slate-400">n/a</span> : f.comuna == null ? <span className="text-amber-600">sin zona</span> : f.delitos.map((d) => (
                            <p key={d.delito} className="whitespace-nowrap"><span className="text-slate-500">{d.delito}</span> <b className="text-slate-800">{formatNumero(d.comuna ?? 0)}</b></p>
                          ))}
                        </td>
                        <td className="px-1 py-1"><CeldaAporte valor={f.s.aporte} onChange={(v) => editar(f.o, { aporte: v })} /></td>
                        <td className="px-2 py-2 text-center">
                          {reduccion != null ? (
                            <div>
                              <p className="text-base font-bold text-brand-green">{formatDecimal(reduccion, 1)}%</p>
                              <p className="text-[10px] text-slate-500">{f.aporteTotal} de {formatNumero(f.comunaTotal)} en la comuna</p>
                              <p className="text-[10px] text-slate-400">MEPOY: {pct(f.aporteTotal, f.mepoyTotal)}</p>
                              {reduccion > 100 && <p className="text-[10px] font-semibold text-rose-600">aporte mayor que lo registrado</p>}
                            </div>
                          ) : f.noMedible ? (
                            <span className="text-[10px] text-slate-500" title="Resultado no medible en casos de delictividad">{f.noMedible}</span>
                          ) : f.aporteTotal > 0 && f.comuna == null ? (
                            <span className="text-[10px] text-amber-600">asigna zona</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-[10.5px] text-slate-400">
            Impacto en reducción = aporte en casos ÷ delitos de ese tipo en la comuna (lo que se reduciría al neutralizar el objetivo); debajo, el mismo aporte frente a toda la MEPOY.
            Comuna N se cruza con CAI N de la base de Delictividad. Se cumple, Prórroga, Zona y Aporte se diligencian aquí y se guardan con el botón “Guardar”.
          </p>
        </div>
      )}

      {pendientes > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit items-center gap-3 rounded-xl border border-amber-300 bg-white px-4 py-2.5 shadow-lg">
          <span className="text-sm font-semibold text-amber-800">{pendientes} objetivo(s) con cambios sin guardar</span>
          <button onClick={() => setBorrador({})} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-500"><Undo2 size={13} /> Descartar</button>
          <button onClick={guardar} disabled={guardando} className="flex items-center gap-1 rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {guardando ? <CloudUpload size={13} className="animate-pulse" /> : <Save size={13} />} Guardar
          </button>
        </div>
      )}
    </div>
  );
}
