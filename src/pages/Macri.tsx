import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarRange, Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock, CloudUpload, Columns3,
  Crosshair, FileCheck2, FileSpreadsheet, FileText, FilterX, Hourglass, Info, Layers, ListChecks, MapPin, RefreshCcw, Save, Search,
  SlidersHorizontal, Target, Undo2, Upload, Users, X,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { AporteBarList } from '../components/charts/AporteBarList';
import { MultiSelect } from '../components/filters/MultiSelect';
import { IconoTitulo } from '../components/rnmc/RankingRnmc';
import { Top5Dona } from '../components/resumen/BloquesResumen';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { leerMatrizMacri, interpretarAporte, delitoDashboard, extraerComuna, type ObjetivoMacri } from '../data/macriParser';
import {
  guardarMacriLocal, cargarMacriLocal, descargarMacriSupabase, subirMacriSupabase, subirSeguimientoSupabase, compararCargas,
  type SeguimientoMacri, type ResumenCarga,
} from '../data/macriStorage';
import { sincronizarCapaMacriDesdeObjetivos } from '../data/puntosStorage';
import { formatNumero, formatDecimal } from '../utils/aggregations';
import { pedirClaveSesion, revisarErrorDeClave, MENSAJE_SIN_CLAVE } from '../utils/claveSesion';

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
  const tonos = { verde: 'border-[#008A63] bg-[#008A63]', rojo: 'border-rose-600 bg-rose-600', azul: 'border-[#102746] bg-[#102746]' };
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activo}
      onClick={onClick}
      className={`mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-[5px] border-[1.5px] transition ${activo ? `${tonos[color]} text-white` : 'border-slate-300 bg-white text-transparent hover:border-slate-500'}`}
    >
      {color === 'rojo' ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}
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

// ── Filtros, columnas y piezas visuales (solo presentación) ──────────────

const CLASE_TITULO = 'text-[14px] font-bold leading-snug text-[#102746]';
const ETIQUETAS_MES = Object.fromEntries(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => [String(i + 1), m]));

interface FiltrosMacri { anio: string[]; mes: string[]; estado: string[]; grupo: string[]; delito: string[]; estrategia: string[]; zona: string[]; cumplimiento: string[] }
const FILTROS_MACRI_VACIOS: FiltrosMacri = { anio: [], mes: [], estado: [], grupo: [], delito: [], estrategia: [], zona: [], cumplimiento: [] };
const GETTERS_MACRI: Record<keyof FiltrosMacri, (f: FilaCalculada) => string> = {
  anio: (f) => (f.o.fechaFinal ? String(f.o.fechaFinal.getFullYear()) : ''),
  mes: (f) => (f.o.fechaFinal ? String(f.o.fechaFinal.getMonth() + 1) : ''),
  estado: (f) => f.o.estadoActual,
  grupo: (f) => f.o.grupo,
  delito: (f) => f.o.delitoPrincipal,
  estrategia: (f) => f.o.estrategia,
  zona: (f) => (f.comuna != null ? `Comuna ${f.comuna}` : 'Sin zona'),
  cumplimiento: (f) => (f.s.seCumple === 'SI' ? 'Se cumple' : f.s.seCumple === 'NO' ? 'No se cumple' : 'Sin evaluar'),
};
function cumpleFiltros(f: FilaCalculada, filtros: FiltrosMacri, omitir?: keyof FiltrosMacri): boolean {
  return (Object.keys(filtros) as (keyof FiltrosMacri)[]).every((k) => k === omitir || filtros[k].length === 0 || filtros[k].includes(GETTERS_MACRI[k](f)));
}
const CAMPOS_FILTRO: { k: keyof FiltrosMacri; label: string; icono: ReactNode }[] = [
  { k: 'anio', label: 'Año (fecha final)', icono: <CalendarDays size={18} /> },
  { k: 'mes', label: 'Mes (fecha final)', icono: <CalendarRange size={18} /> },
  { k: 'estado', label: 'Estado actual', icono: <ListChecks size={18} /> },
  { k: 'grupo', label: 'Grupo', icono: <Users size={18} /> },
  { k: 'delito', label: 'Delito principal', icono: <FileText size={18} /> },
  { k: 'estrategia', label: 'Estrategia', icono: <Layers size={18} /> },
  { k: 'zona', label: 'Zona injerencia', icono: <MapPin size={18} /> },
  { k: 'cumplimiento', label: 'Cumplimiento', icono: <CheckCircle2 size={18} /> },
];

type ColumnaOpcional = 'grupo' | 'delito' | 'estrategia' | 'zona' | 'mepoy' | 'comuna' | 'aporte' | 'impacto';
const COLUMNAS_OPCIONALES: { k: ColumnaOpcional; label: string }[] = [
  { k: 'grupo', label: 'Grupo' }, { k: 'delito', label: 'Delito principal' }, { k: 'estrategia', label: 'Estrategia' }, { k: 'zona', label: 'Zona injerencia' },
  { k: 'mepoy', label: 'Delictividad MEPOY' }, { k: 'comuna', label: 'Delitos comuna' }, { k: 'aporte', label: 'Aporte en casos' }, { k: 'impacto', label: 'Impacto en reducción' },
];

/** Conteo de objetivos por un campo, con su participación (para las barras). */
function contarObjetivos(filas: FilaCalculada[], campo: (f: FilaCalculada) => string) {
  const m = new Map<string, number>();
  for (const f of filas) { const v = campo(f); m.set(v, (m.get(v) || 0) + 1); }
  const total = filas.length;
  return Array.from(m.entries()).map(([key, casos]) => ({ key, casos, aportePct: total > 0 ? (casos / total) * 100 : 0 })).sort((a, b) => b.casos - a.casos);
}

/** Dona de cumplimiento: % que se cumple en el centro. */
function DonaCumplimiento({ si, no, sinEvaluar }: { si: number; no: number; sinEvaluar: number }) {
  const total = si + no + sinEvaluar;
  const items = [
    { k: 'Se cumple', n: si, color: '#16a34a' },
    { k: 'No se cumple', n: no, color: '#ef4444' },
    { k: 'Sin evaluar', n: sinEvaluar, color: '#cbd5e1' },
  ];
  const R = 62, r = 42, C = 80;
  let ang = -Math.PI / 2;
  const arcos = items.filter((it) => it.n > 0).map((it) => {
    const frac = total > 0 ? it.n / total : 0;
    const a0 = ang, a1 = ang + frac * Math.PI * 2; ang = a1;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const d = frac >= 0.9999
      ? `M ${p(R, 0)} A ${R} ${R} 0 1 1 ${p(R, Math.PI)} A ${R} ${R} 0 1 1 ${p(R, 0)} M ${p(r, 0)} A ${r} ${r} 0 1 0 ${p(r, Math.PI)} A ${r} ${r} 0 1 0 ${p(r, 0)} Z`
      : `M ${p(R, a0)} A ${R} ${R} 0 ${grande} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${grande} 0 ${p(r, a0)} Z`;
    return { ...it, d };
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={150} height={150} viewBox="0 0 160 160" className="shrink-0" role="img" aria-label="Cumplimiento de objetivos">
        {arcos.map((a) => <path key={a.k} d={a.d} fill={a.color} stroke="#fff" strokeWidth="1.5" />)}
        <text x={C} y={C + 2} textAnchor="middle" fontSize="21" fontWeight="800" fill="#102746">{pct(si, total)}</text>
        <text x={C} y={C + 19} textAnchor="middle" fontSize="11" fill="#64748b">{si} de {total}</text>
      </svg>
      <table className="min-w-[150px] flex-1 text-[12.5px]">
        <tbody>
          {items.map((it) => (
            <tr key={it.k}>
              <td className="py-[3px] pr-2"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-[-1px]" style={{ background: it.color }} /><span className="text-slate-700">{it.k}</span></td>
              <td className="py-[3px] pr-2 text-right font-bold tabular-nums text-[#102746]">{it.n}</td>
              <td className="py-[3px] text-right tabular-nums text-slate-500">{pct(it.n, total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  // Filtros de análisis (sobre campos que ya trae la matriz). No cambian
  // ningún cálculo: solo deciden qué objetivos entran en indicadores,
  // gráficos y tabla.
  const [filtrosMacri, setFiltrosMacri] = useState<FiltrosMacri>(FILTROS_MACRI_VACIOS);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);
  const [columnasOcultas, setColumnasOcultas] = useState<ColumnaOpcional[]>([]);
  const [menuColumnas, setMenuColumnas] = useState(false);
  const [topDelitos, setTopDelitos] = useState<5 | 10 | 'todos'>(5);

  const { backendUrl, supabaseAnonKey } = obtenerConfig();
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
          const clave = pedirClaveSesion('subir la matriz GIOC');
          if (!clave) throw new Error(MENSAJE_SIN_CLAVE);
          await subirMacriSupabase(FUNCION_SUBIR_REGISTROS, clave, nuevos, res, 'No identificado');
          setAviso(`${nuevos.length} objetivo(s) cargados y sincronizados con el servidor central.`);
        } catch (e) {
          revisarErrorDeClave(e);
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
          const clave = pedirClaveSesion('guardar el seguimiento');
          if (!clave) throw new Error(MENSAJE_SIN_CLAVE);
          await subirSeguimientoSupabase(FUNCION_SUBIR_REGISTROS, clave, cambios, 'Dashboard');
          setAviso(`${cambios.length} cambio(s) guardados y sincronizados — todos verán el seguimiento actualizado.`);
        } catch (e) {
          revisarErrorDeClave(e);
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

  const opcionesFiltro = useMemo(() => {
    const o = {} as Record<keyof FiltrosMacri, string[]>;
    for (const k of Object.keys(GETTERS_MACRI) as (keyof FiltrosMacri)[]) {
      const otros = filas.filter((f) => cumpleFiltros(f, filtrosMacri, k));
      o[k] = Array.from(new Set(otros.map(GETTERS_MACRI[k]).filter(Boolean))).sort((x, y) => (k === 'anio' || k === 'mes' ? Number(x) - Number(y) : x.localeCompare(y, 'es')));
    }
    return o;
  }, [filas, filtrosMacri]);
  const filasFiltradas = useMemo(() => filas.filter((f) => cumpleFiltros(f, filtrosMacri)), [filas, filtrosMacri]);

  const estados = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filasFiltradas) m.set(f.o.estadoActual, (m.get(f.o.estadoActual) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filasFiltradas]);

  const esVencido = (f: FilaCalculada) => f.dias != null && f.dias < 0 && f.s.seCumple !== 'SI';
  const esPorVencer = (f: FilaCalculada) => f.dias != null && f.dias >= 0 && f.dias <= DIAS_ALERTA && f.s.seCumple !== 'SI';
  const indicadores = useMemo(() => ({
    cumplidos: filasFiltradas.filter((f) => f.s.seCumple === 'SI').length,
    noCumplidos: filasFiltradas.filter((f) => f.s.seCumple === 'NO').length,
    sinEvaluar: filasFiltradas.filter((f) => f.s.seCumple == null).length,
    prorroga: filasFiltradas.filter((f) => f.s.prorroga).length,
    vencidos: filasFiltradas.filter(esVencido).length,
    porVencer: filasFiltradas.filter(esPorVencer).length,
  }), [filasFiltradas]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filasFiltradas.filter((f) => {
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
  }, [filasFiltradas, filtroEstado, filtroAlerta, busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const hayCambiosCarga = resumen && (resumen.nuevos.length + resumen.retirados.length + resumen.cambiosEstado.length + resumen.cambiosFecha.length) > 0;
  const total = filasFiltradas.length;
  const porcentaje = (n: number) => (total > 0 ? `${formatDecimal((n / total) * 100, 1)}% del total` : '—');
  const hayFiltros = Object.values(filtrosMacri).some((v) => v.length > 0);
  const setFiltro = (k: keyof FiltrosMacri) => (v: string[]) => setFiltrosMacri((f) => ({ ...f, [k]: v }));
  const visible = (c: ColumnaOpcional) => !columnasOcultas.includes(c);
  const porEstrategia = contarObjetivos(filasFiltradas, (f) => f.o.estrategia || 'Sin estrategia');
  const porDelito = contarObjetivos(filasFiltradas, (f) => f.o.delitoPrincipal || 'Sin delito');
  const ESTADO_COLORES = ['#006F68', '#5aaee8', '#f2b233', '#8b5cf6', '#94a3b8', '#ef4444'];

  // Tarjetas: Total, una por estado actual, y los indicadores de seguimiento.
  const tarjetas: { clave: string; titulo: string; n: number; icono: ReactNode; tono: string; tile: string; numero: string; activa: boolean; onClick: () => void }[] = [
    ...estados.map(([estado, n], i) => ({
      clave: `estado-${estado}`, titulo: estado, n,
      icono: i % 2 === 0 ? <FileText size={22} /> : <FileCheck2 size={22} />,
      tono: i % 2 === 0 ? 'bg-[#e8f7f0] border-[#cdeee0]' : 'bg-[#eaf4fb] border-[#d3e3f4]',
      tile: i % 2 === 0 ? 'bg-[#008A63] text-white' : 'bg-[#2f7de1] text-white',
      numero: 'text-[#102746]',
      activa: filtroEstado === estado,
      onClick: () => setFiltroEstado(filtroEstado === estado ? null : estado),
    })),
    ...([
      ['cumplidos', 'Se cumple', indicadores.cumplidos, <Check key="i" size={22} strokeWidth={3} />, 'bg-[#e8f7f0] border-[#cdeee0]', 'bg-[#22c55e] text-white', 'text-[#102746]'],
      ['noCumplidos', 'No se cumple', indicadores.noCumplidos, <X key="i" size={22} strokeWidth={3} />, 'bg-rose-50 border-rose-100', 'bg-rose-500 text-white', 'text-rose-600'],
      ['sinEvaluar', 'Sin evaluar', indicadores.sinEvaluar, <Clock key="i" size={22} />, 'bg-slate-100 border-slate-200', 'bg-slate-500 text-white', 'text-[#102746]'],
      ['prorroga', 'Con prórroga', indicadores.prorroga, <Hourglass key="i" size={22} />, 'bg-amber-50 border-amber-100', 'bg-amber-500 text-white', 'text-amber-600'],
      ['porVencer', `Vence ≤ ${DIAS_ALERTA} días`, indicadores.porVencer, <CalendarClock key="i" size={22} />, 'bg-violet-50 border-violet-100', 'bg-violet-500 text-white', 'text-violet-700'],
      ['vencidos', 'Vencidos', indicadores.vencidos, <AlertTriangle key="i" size={22} />, 'bg-rose-50 border-rose-100', 'bg-rose-500 text-white', 'text-rose-600'],
    ] as const).map(([clave, titulo, n, icono, tono, tile, numero]) => ({
      clave, titulo, n, icono, tono, tile, numero,
      activa: filtroAlerta === clave,
      onClick: () => setFiltroAlerta(filtroAlerta === clave ? null : clave),
    })),
  ];

  return (
    <div className="space-y-3">
      {/* ENCABEZADO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#DDF5EC] text-[#006F68]"><Crosshair size={28} /></span>
          <div className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-tight text-[#102746]">MACRI — Seguimiento de objetivos GIOC</h1>
            <p className="text-[13px] text-slate-500">Monitoreo, control y análisis del cumplimiento de objetivos operacionales.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#cfe8e1] bg-[#eef8f5] px-3.5 py-2">
            <CalendarDays size={18} className="text-[#006F68]" />
            <div className="text-[11.5px] leading-tight text-[#102746]">
              <p>Periodo de análisis</p>
              <p className="font-semibold">{corte ? `1/01/${corte.getFullYear()} a ${fechaCorta(corte)}` : 'sin base de Delictividad cargada'}</p>
            </div>
          </div>
          {objetivos && (
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
              <Target size={18} className="text-[#102746]" />
              <div className="text-[11.5px] leading-tight text-[#102746]">
                <p className="font-bold">{objetivos.length} objetivo(s)</p>
                <p className="text-slate-600">Delictividad</p>
              </div>
            </div>
          )}
          {resumen && (
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
              <RefreshCcw size={18} className="text-[#006F68]" />
              <div className="text-[11.5px] leading-tight text-[#102746]">
                <p>Última carga:</p>
                <p className="text-slate-600">{new Date(resumen.fecha).toLocaleString('es-CO')}</p>
              </div>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#102746] px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">
            {cargando ? <CloudUpload size={16} className="animate-pulse" /> : objetivos ? <RefreshCcw size={16} /> : <Upload size={16} />}
            {cargando ? 'Leyendo…' : objetivos ? 'Actualizar matriz GIOC' : 'Cargar matriz GIOC'}
            <input type="file" accept=".xlsx,.xls" className="hidden" disabled={cargando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="flex items-start justify-between gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800"><span>{aviso}</span><button onClick={() => setAviso(null)}><X size={14} /></button></div>}

      {/* Última carga: cambios respecto a la matriz anterior (alerta compacta) */}
      {resumen && verResumen && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-amber-900">
              <Info size={15} className="shrink-0 text-amber-600" />
              <b>Última carga:</b> {resumen.archivo} · {new Date(resumen.fecha).toLocaleString('es-CO')}
              {!hayCambiosCarga && <span className="text-amber-800">— Sin cambios respecto a la matriz anterior (o es la primera carga).</span>}
            </p>
            <button onClick={() => setVerResumen(false)} className="text-amber-700 hover:text-amber-900" aria-label="Cerrar aviso"><X size={14} /></button>
          </div>
          {hayCambiosCarga && (
            <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {resumen.nuevos.length > 0 && <div><p className="font-semibold text-emerald-700">Nuevos ({resumen.nuevos.length})</p>{resumen.nuevos.map((n) => <p key={n}>{n}</p>)}</div>}
              {resumen.cambiosEstado.length > 0 && <div><p className="font-semibold text-sky-700">Cambiaron de estado ({resumen.cambiosEstado.length})</p>{resumen.cambiosEstado.map((c) => <p key={c.nombre}>{c.nombre}: {c.de} → <b>{c.a}</b></p>)}</div>}
              {resumen.cambiosFecha.length > 0 && <div><p className="font-semibold text-amber-700">Cambió la fecha final ({resumen.cambiosFecha.length})</p>{resumen.cambiosFecha.map((c) => <p key={c.nombre}>{c.nombre}: {c.de} → <b>{c.a}</b></p>)}</div>}
              {resumen.retirados.length > 0 && <div><p className="font-semibold text-rose-700">Ya no aparecen ({resumen.retirados.length})</p>{resumen.retirados.map((n) => <p key={n}>{n}</p>)}</div>}
            </div>
          )}
        </div>
      )}

      {!objetivos ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga la matriz GIOC (exportación del aplicativo o la tabla de seguimiento) para ver los objetivos.
        </div>
      ) : (
        <>
          {/* FILTROS DE ANÁLISIS */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#006F68] text-white"><SlidersHorizontal size={18} /></span>
                <div className="min-w-0">
                  <p className="text-[16px] font-bold leading-tight text-[#102746]">Filtros de análisis</p>
                  <p className="text-[12px] text-slate-500">Seleccione los criterios para consultar la información. Los indicadores y la tabla se actualizarán automáticamente.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={!hayFiltros} onClick={() => setFiltrosMacri(FILTROS_MACRI_VACIOS)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#102746] hover:bg-slate-50 disabled:opacity-50">
                  <FilterX size={14} /> Limpiar filtros
                </button>
                <button type="button" onClick={() => setFiltrosAbiertos((v) => !v)} aria-label={filtrosAbiertos ? 'Contraer filtros' : 'Expandir filtros'} className="rounded-md border border-slate-200 p-1.5 text-[#102746] hover:bg-slate-100">
                  {filtrosAbiertos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
            {filtrosAbiertos && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
                {CAMPOS_FILTRO.map((c) => (
                  <MultiSelect key={c.k} institucional icono={c.icono} tonoIcono="bg-[#eaf4fb] text-[#102746]" label={c.label} options={opcionesFiltro[c.k]} selected={filtrosMacri[c.k]} onChange={setFiltro(c.k)} labels={c.k === 'mes' ? ETIQUETAS_MES : undefined} />
                ))}
              </div>
            )}
          </section>

          {/* INDICADORES (clic = filtra la tabla) */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-[1.25fr_repeat(8,1fr)]">
            <button type="button" onClick={() => { setFiltroEstado(null); setFiltroAlerta(null); }} className={`flex items-center gap-3 rounded-xl bg-[#102746] px-3.5 py-3 text-left text-white shadow-sm transition hover:brightness-110 ${!filtroEstado && !filtroAlerta ? 'ring-2 ring-[#5eead4]/70' : ''}`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><Target size={24} /></span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wide text-white/80">Total objetivos</p>
                <p className="text-[26px] font-extrabold leading-none tabular-nums">{total}</p>
                <p className="text-[11px] text-white/75">100% del total</p>
              </div>
            </button>
            {tarjetas.map((t) => (
              <button key={t.clave} type="button" onClick={t.onClick} className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition hover:shadow-sm ${t.tono} ${t.activa ? 'ring-2 ring-[#102746]' : ''}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.tile}`}>{t.icono}</span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-600">{t.titulo}</p>
                  <p className={`text-[24px] font-extrabold leading-none tabular-nums ${t.numero}`}>{t.n}</p>
                  <p className="text-[10.5px] text-slate-500">{porcentaje(t.n)}</p>
                </div>
              </button>
            ))}
          </div>

          {/* ANÁLISIS RÁPIDO */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <Card title="Distribución por estado actual" descargable="macri-estado" icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><Target size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
              <Top5Dona filas={estados.map(([key, casos]) => ({ key, casos }))} total={total} colores={ESTADO_COLORES} etiquetaCentro="objetivos" anchoNombre={150} />
            </Card>
            <Card title="Cumplimiento de objetivos" descargable="macri-cumplimiento" icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><CheckCircle2 size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
              <DonaCumplimiento si={indicadores.cumplidos} no={indicadores.noCumplidos} sinEvaluar={indicadores.sinEvaluar} />
            </Card>
            <Card title="Distribución por estrategia" descargable="macri-estrategia" icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><Layers size={16} /></IconoTitulo>} claseTitulo={CLASE_TITULO} className="h-full">
              <AporteBarList data={porEstrategia} compacta textoVacio="Sin objetivos para los filtros seleccionados." />
            </Card>
            <Card
              title="Delitos principales"
              descargable="macri-delitos"
              icono={<IconoTitulo tono="bg-[#DDF5EC] text-[#006F68]"><FileText size={16} /></IconoTitulo>}
              claseTitulo={CLASE_TITULO}
              className="h-full"
              actions={
                <div className="flex overflow-hidden rounded-md border border-slate-300">
                  {([5, 10, 'todos'] as const).map((op) => (
                    <button key={String(op)} type="button" onClick={() => setTopDelitos(op)} className={`border-l border-slate-300 px-2 py-[3px] text-[11px] font-semibold first:border-l-0 ${topDelitos === op ? 'bg-[#102746] text-white' : 'bg-white text-[#102746] hover:bg-slate-50'}`}>
                      {op === 'todos' ? 'Todas' : `Top ${op}`}
                    </button>
                  ))}
                </div>
              }
            >
              <AporteBarList data={topDelitos === 'todos' ? porDelito : porDelito.slice(0, topDelitos)} compacta textoVacio="Sin objetivos para los filtros seleccionados." />
            </Card>
          </div>

          {/* SEGUIMIENTO DE OBJETIVOS */}
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#006F68] text-white"><ClipboardList size={18} /></span>
                <div className="min-w-0">
                  <p className="text-[16px] font-bold leading-tight text-[#102746]">Seguimiento de objetivos <span className="text-[13px] font-normal text-slate-400">({visibles.length} de {filas.length})</span></p>
                  <p className="text-[12px] text-slate-500">Detalle de los objetivos operacionales y su estado de cumplimiento.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5">
                  <Search size={14} className="text-slate-400" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar objetivo, grupo, delito, comuna…" className="w-60 text-[12px] outline-none" />
                </label>
                <div className="relative">
                  <button type="button" onClick={() => setMenuColumnas((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#102746] hover:bg-slate-50">
                    <Columns3 size={14} /> Columnas
                  </button>
                  {menuColumnas && (
                    <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 text-[12px] shadow-lg">
                      {COLUMNAS_OPCIONALES.map((c) => (
                        <label key={c.k} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
                          <input type="checkbox" checked={visible(c.k)} onChange={() => setColumnasOcultas((prev) => (prev.includes(c.k) ? prev.filter((x) => x !== c.k) : [...prev, c.k]))} className="accent-[#102746]" />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" onClick={descargarExcel} title="Descargar Excel" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#102746] hover:border-[#006F68] hover:text-[#006F68]">
                  <FileSpreadsheet size={14} /> Exportar Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0 z-10 text-[10.5px] uppercase tracking-wide text-white">
                  <tr className="bg-[#102746]">
                    <th rowSpan={2} className="border border-white/10 px-2 py-2 text-center font-bold">#</th>
                    <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Fecha final</th>
                    <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Estado actual</th>
                    {visible('grupo') && <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Grupo</th>}
                    <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Nombre objetivo</th>
                    {visible('delito') && <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Delito principal</th>}
                    {visible('estrategia') && <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Estrategia</th>}
                    <th colSpan={2} className="border border-white/10 px-2 py-1 text-center font-bold">Se cumple</th>
                    <th className="border border-white/10 px-2 py-1 text-center font-bold">Prórroga</th>
                    {visible('zona') && <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Zona injerencia</th>}
                    {visible('mepoy') && <th rowSpan={2} className="border border-white/10 bg-[#006F68] px-2 py-2 text-left font-bold">Delictividad MEPOY</th>}
                    {visible('comuna') && <th rowSpan={2} className="border border-white/10 bg-[#006F68] px-2 py-2 text-left font-bold">Delitos comuna</th>}
                    {visible('aporte') && <th rowSpan={2} className="border border-white/10 px-2 py-2 text-left font-bold">Aporte en casos</th>}
                    {visible('impacto') && <th rowSpan={2} className="border border-white/10 px-2 py-2 text-center font-bold">Impacto en reducción</th>}
                  </tr>
                  <tr className="bg-[#1c3557]">
                    <th className="w-10 border border-white/10 px-1 py-1 text-center">Si</th>
                    <th className="w-10 border border-white/10 px-1 py-1 text-center">No</th>
                    <th className="w-14 border border-white/10 px-1 py-1 text-center">X</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f, i) => {
                    const editada = !!borrador[f.o.__id];
                    const reduccion = f.aporteTotal > 0 && f.comunaTotal > 0 ? (f.aporteTotal / f.comunaTotal) * 100 : null;
                    return (
                      <tr key={f.o.__id} className={`${editada ? 'bg-amber-50' : i % 2 ? 'bg-[#f7f9fb]' : 'bg-white'} border-b border-slate-100 align-middle`}>
                        <td className="px-2 py-2 text-center"><span className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 text-[11px] font-semibold text-slate-600">{i + 1}</span></td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <p className="font-semibold text-slate-700">{fechaCorta(f.o.fechaFinal)}</p>
                          {f.dias != null && f.s.seCumple !== 'SI' && (
                            <p className={`text-[10.5px] font-semibold ${f.dias < 0 ? 'text-rose-600' : f.dias <= DIAS_ALERTA ? 'text-orange-600' : 'text-slate-500'}`}>
                              {f.dias < 0 ? <><AlertTriangle size={10} className="mr-0.5 inline" />vencido hace {-f.dias} d</> : `faltan ${f.dias} d`}
                            </p>
                          )}
                          {f.s.seCumple === 'SI' && <p className="text-[10.5px] font-semibold text-[#008A63]"><CheckCircle2 size={10} className="mr-0.5 inline" />cumplido</p>}
                        </td>
                        <td className="px-2 py-2"><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${colorEstado(f.o.estadoActual)}`}>{f.o.estadoActual}</span></td>
                        {visible('grupo') && <td className="px-2 py-2 font-semibold text-slate-600">{f.o.grupo}</td>}
                        <td className="px-2 py-2 font-extrabold uppercase text-[#102746]">{f.o.nombreObjetivo}</td>
                        {visible('delito') && <td className="max-w-[150px] px-2 py-2" title={f.o.delitoPrincipalTexto}>{f.o.delitoPrincipal}</td>}
                        {visible('estrategia') && <td className="px-2 py-2 font-semibold text-slate-600">{f.o.estrategia || '—'}</td>}
                        <td className="border-l border-slate-100 px-1 py-2 text-center">
                          <Marca activo={f.s.seCumple === 'SI'} color="verde" titulo="Se cumple" onClick={() => editar(f.o, { seCumple: f.s.seCumple === 'SI' ? null : 'SI' })} />
                        </td>
                        <td className="px-1 py-2 text-center">
                          <Marca activo={f.s.seCumple === 'NO'} color="rojo" titulo="No se cumple" onClick={() => editar(f.o, { seCumple: f.s.seCumple === 'NO' ? null : 'NO' })} />
                        </td>
                        <td className="border-x border-slate-100 px-1 py-2 text-center">
                          <Marca activo={f.s.prorroga} color="azul" titulo="Prórroga" onClick={() => editar(f.o, { prorroga: !f.s.prorroga })} />
                        </td>
                        {visible('zona') && (
                          <td className="px-2 py-2">
                            <select
                              value={f.comuna != null ? String(f.comuna) : ''}
                              onChange={(e) => editar(f.o, { zonaTexto: e.target.value ? `Comuna ${e.target.value}` : '' })}
                              className={`w-[118px] rounded-md border px-2 py-1 text-[12px] ${f.comuna == null ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-[#102746]'}`}
                            >
                              <option value="">{f.zonaTexto && f.comuna == null ? f.zonaTexto : 'Sin zona'}</option>
                              {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>Comuna {n}</option>)}
                            </select>
                          </td>
                        )}
                        {visible('mepoy') && (
                          <td className="bg-[#eef8f4] px-2 py-2">
                            {f.delitos.length === 0 ? <span className="text-slate-400" title="El delito principal no existe en la base de Delictividad">n/a</span> : f.delitos.map((d) => (
                              <p key={d.delito} className="whitespace-nowrap"><span className="text-slate-500">{d.delito}</span> <b className="text-[#102746]">{formatNumero(d.mepoy)}</b></p>
                            ))}
                          </td>
                        )}
                        {visible('comuna') && (
                          <td className="bg-[#eef8f4] px-2 py-2">
                            {f.delitos.length === 0 ? <span className="text-slate-400">n/a</span> : f.comuna == null ? <span className="text-amber-600">sin zona</span> : f.delitos.map((d) => (
                              <p key={d.delito} className="whitespace-nowrap"><span className="text-slate-500">{d.delito}</span> <b className="text-[#102746]">{formatNumero(d.comuna ?? 0)}</b></p>
                            ))}
                          </td>
                        )}
                        {visible('aporte') && <td className="px-1 py-1"><CeldaAporte valor={f.s.aporte} onChange={(v) => editar(f.o, { aporte: v })} /></td>}
                        {visible('impacto') && (
                          <td className="px-2 py-2 text-center">
                            {reduccion != null ? (
                              <div>
                                <p className="text-[17px] font-extrabold leading-tight text-[#006F68]">{formatDecimal(reduccion, 1)}%</p>
                                <p className="text-[10.5px] text-slate-600">{f.aporteTotal} de {formatNumero(f.comunaTotal)} en la comuna</p>
                                <p className="text-[10px] text-slate-400">MEPOY: {pct(f.aporteTotal, f.mepoyTotal)}</p>
                                {reduccion > 100 && <p className="text-[10px] font-semibold text-rose-600">aporte mayor que lo registrado</p>}
                              </div>
                            ) : f.noMedible ? (
                              <span className="text-[10px] text-slate-500" title="Resultado no medible en casos de delictividad">{f.noMedible}</span>
                            ) : f.aporteTotal > 0 && f.comuna == null ? (
                              <span className="text-[10.5px] text-amber-600">asigna zona</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {visibles.length === 0 && (
                    <tr><td colSpan={16} className="py-8 text-center text-[12px] text-slate-400">Ningún objetivo coincide con los filtros seleccionados.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="m-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-[#f4f7fa] px-3 py-2 text-[11px] text-slate-500">
              <Info size={14} className="mt-[1px] shrink-0 text-[#2f7de1]" />
              <p>
                Impacto en reducción = aporte en casos ÷ delitos de ese tipo en la comuna (lo que se reduciría al neutralizar el objetivo); debajo, el mismo aporte frente a toda la MEPOY.
                Comuna N se cruza con CAI N de la base de Delictividad. Se cumple, Prórroga, Zona y Aporte se diligencian aquí y se guardan con el botón “Guardar”.
              </p>
            </div>
          </section>
        </>
      )}

      {pendientes > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit items-center gap-3 rounded-xl border border-amber-300 bg-white px-4 py-2.5 shadow-lg">
          <span className="text-sm font-semibold text-amber-800">{pendientes} objetivo(s) con cambios sin guardar</span>
          <button onClick={() => setBorrador({})} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-500"><Undo2 size={13} /> Descartar</button>
          <button onClick={guardar} disabled={guardando} className="flex items-center gap-1 rounded-lg bg-[#006F68] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {guardando ? <CloudUpload size={13} className="animate-pulse" /> : <Save size={13} />} Guardar
          </button>
        </div>
      )}
    </div>
  );
}
