import { useEffect, useMemo, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  ChevronUp, ClipboardList, Download, FileText, ImageDown, Info, Layers, Loader2, MapPin, Search, ShieldCheck, Trash2,
  Users, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useMicrogerencia } from '../../hooks/useMicrogerencia';
import { useMicrogerenciaOperatividad } from '../../hooks/useMicrogerenciaOperatividad';
import { nombreVisibleUnidad, type AjustesMicrogerencia, type DatosMicrogerencia, type NodoMicrogerencia } from '../../data/microgerencia';
import type { SeccionExtraMicrogerencia } from '../../data/pdfMicrogerencia';
import { columnaIngreso, corteDiaADia, fechaDeConteo, mesesDiaADia, MESES_LARGOS } from '../../data/diaADia';
import { aplicarFiltros } from '../../utils/filters';
import type { CrimeRecord, FilterState } from '../../types/crime';
import { nodoOperatividadEquivalente, seccionRnmc } from '../../data/microgerenciaGeneracion';
import { fechaLargaIso } from '../../data/microgerenciaTextos';
import { etiquetaUnidad } from './InformeEjecutivoMicrogerencia';
import { capturarLaminas, generarPdfTerritorial, seccionDelito, seccionDiaADia, seccionesDelInforme, type SeccionTerritorial } from './informeTerritorial';
import type { FuenteMicrogerencia } from './SelectorFuentesMicrogerencia';
import { formatNumero } from '../../utils/aggregations';

// ───────────────────────────────────────────────────────────────────────
// ASISTENTE de «Microgerencia y Proyección Delictiva MEPOY».
// Fuentes → Cobertura (hojas del informe) → Periodo y delitos → Resumen.
// En «Cobertura» se marca, en un árbol General → Distritos → Estaciones →
// CAI / Zonas, cada unidad que debe tener su HOJA en el informe: cada
// casilla marcada es una lámina ejecutiva (nada más, nada menos). La hoja
// de una unidad ya muestra el desglose de sus subunidades (General → las 5
// estaciones; Distrito → sus estaciones; Estación → sus CAI).
// Las cifras salen de useMicrogerencia (mismas fórmulas de siempre).
// ───────────────────────────────────────────────────────────────────────

interface EstadoAsistente {
  paso: number; // 0..3
  fuentes: FuenteMicrogerencia[];
  /** Hojas del informe: 'general' | 'd1' | 'd2' | 'est:E-Norte' | 'cai:E-Norte|CAI 1' | 'zona:E-Norte|Z. Atención 1 Norte'. */
  hojas: string[];
  anio: string;
  /** Meses (1–12) — se cuentan SOLO esos meses. */
  meses: string[];
  /** Día a Día: años y meses propios (cada año × mes = una hoja; sin versus). */
  ddAnios: string[];
  ddMeses: string[];
  fechaInicial: string;
  fechaFinal: string;
  delitos: string[];
  /** Microgerencia por delito: una lámina por cada delito, en ESTE orden. */
  delitosAnalisis: string[];
  /** Hoja 2 de Delictividad: matriz de calor por hora o por franja horaria. */
  vistaMatriz: 'hora' | 'franja';
}

type Accion =
  | { tipo: 'paso'; paso: number }
  | { tipo: 'fuente'; fuente: FuenteMicrogerencia }
  | { tipo: 'hoja'; clave: string }
  | { tipo: 'hojas'; valores: string[] }
  | { tipo: 'lista'; campo: 'delitos' | 'delitosAnalisis'; valores: string[] }
  | { tipo: 'alternar'; campo: 'delitos' | 'delitosAnalisis'; valor: string }
  | { tipo: 'mover'; valor: string; paso: -1 | 1 }
  | { tipo: 'periodo'; anio?: string; meses?: string[]; fechaInicial?: string; fechaFinal?: string }
  | { tipo: 'vistaMatriz'; vista: 'hora' | 'franja' }
  | { tipo: 'diaadia'; anios?: string[]; meses?: string[] };

const ETIQUETA_ESTACION: Record<string, string> = {
  'E-Norte': 'Est. Norte', 'E-Sur': 'Est. Sur', 'E-Timbio': 'Est. Timbío', 'E-Coconuco': 'Est. Coconuco', 'E-Sotara': 'Est. Paispamba',
};
const etiquetaEstacion = (codigo: string) => ETIQUETA_ESTACION[codigo] ?? codigo;
const etiquetaZona = (zona: string) => nombreVisibleUnidad(zona).replace(/^Z\. Atención/i, 'Z. Atención');

function reducir(e: EstadoAsistente, a: Accion): EstadoAsistente {
  switch (a.tipo) {
    case 'paso': return { ...e, paso: a.paso };
    case 'fuente': return { ...e, fuentes: e.fuentes.includes(a.fuente) ? e.fuentes.filter((f) => f !== a.fuente) : [...e.fuentes, a.fuente] };
    case 'hoja': return { ...e, hojas: e.hojas.includes(a.clave) ? e.hojas.filter((h) => h !== a.clave) : [...e.hojas, a.clave] };
    case 'hojas': return { ...e, hojas: a.valores };
    case 'lista': return { ...e, [a.campo]: a.valores };
    case 'alternar': {
      const actual = e[a.campo];
      return { ...e, [a.campo]: actual.includes(a.valor) ? actual.filter((v) => v !== a.valor) : [...actual, a.valor] };
    }
    case 'mover': {
      const l = [...e.delitosAnalisis];
      const i = l.indexOf(a.valor), j = i + a.paso;
      if (i < 0 || j < 0 || j >= l.length) return e;
      [l[i], l[j]] = [l[j], l[i]];
      return { ...e, delitosAnalisis: l };
    }
    case 'vistaMatriz': return { ...e, vistaMatriz: a.vista };
    case 'diaadia': return { ...e, ...(a.anios ? { ddAnios: a.anios } : {}), ...(a.meses ? { ddMeses: a.meses } : {}) };
    case 'periodo': return { ...e, ...(a.anio !== undefined ? { anio: a.anio } : {}), ...(a.meses !== undefined ? { meses: a.meses } : {}), ...(a.fechaInicial !== undefined ? { fechaInicial: a.fechaInicial } : {}), ...(a.fechaFinal !== undefined ? { fechaFinal: a.fechaFinal } : {}) };
  }
}

const PASOS = ['Fuentes', 'Cobertura', 'Periodo y delitos', 'Resumen'];

const FUENTES: { id: FuenteMicrogerencia; nombre: string; descripcion: string; icono: typeof BarChart3; disponible: boolean }[] = [
  { id: 'delictividad', nombre: 'Microgerencia delictiva', descripcion: 'Consolidado delictivo: comparativos, tendencias, territorio y proyección.', icono: BarChart3, disponible: true },
  { id: 'diaadia', nombre: 'Día a Día', descripcion: 'Control diario del mes: matriz de delitos por fecha, totales, últimos 7 días y hallazgos.', icono: CalendarDays, disponible: true },
  { id: 'operatividad', nombre: 'Microgerencia operativa', descripcion: 'Operatividad institucional: capturas, incautaciones, droga y recuperaciones.', icono: ShieldCheck, disponible: true },
  { id: 'rnmc', nombre: 'RNMC', descripcion: 'Registro Nacional de Medidas Correctivas (comportamientos contrarios a la convivencia).', icono: Users, disponible: true },
  { id: 'irisp1', nombre: 'IRISP1', descripcion: 'Integración de información de seguridad.', icono: Building2, disponible: false },
  { id: 'macri', nombre: 'MACRI', descripcion: 'Análisis de criminalidad avanzada.', icono: ClipboardList, disponible: false },
];

// ── Árbol de unidades (de los datos reales) ────────────────────────────
interface NodoArbol { clave: string; nodo: NodoMicrogerencia; titulo: string; detalle: string; hijos: NodoArbol[]; tipo: 'general' | 'distrito' | 'estacion' | 'cai' | 'zona' }

const esCaiReal = (n: NodoMicrogerencia) => n.tipo === 'cai' && !/no reportad/i.test(n.nombre);
// Zonas «E-Norte», «E-Sur»… son registros sin zona asignada: repetirían la
// hoja de la estación, por eso no se ofrecen como hoja propia.
const esZonaReal = (n: NodoMicrogerencia) => !/^E-/i.test(n.nombre.trim());

function construirArbol(datos: DatosMicrogerencia): NodoArbol[] {
  const zonasDe = (est: string) => (datos.zonas ?? []).filter((z) => z.estacion === est && esZonaReal(z));
  const estacion = (n: NodoMicrogerencia): NodoArbol => {
    const cais = n.hijos.filter(esCaiReal);
    const zonas = zonasDe(n.estacion ?? '');
    return {
      clave: `est:${n.estacion}`, nodo: n, tipo: 'estacion', titulo: etiquetaEstacion(n.estacion ?? n.nombre),
      detalle: cais.length ? `Hoja con sus CAI (${cais.map((c) => nombreVisibleUnidad(c.nombre)).join(', ')})` : zonas.length ? `Hoja con sus ${zonas.length} zonas de atención` : 'Hoja de la estación',
      hijos: [
        ...cais.map((c) => ({ clave: `cai:${n.estacion}|${c.nombre}`, nodo: c, tipo: 'cai' as const, titulo: nombreVisibleUnidad(c.nombre), detalle: '', hijos: [] })),
        ...zonas.map((z) => ({ clave: `zona:${n.estacion}|${z.nombre}`, nodo: z, tipo: 'zona' as const, titulo: etiquetaZona(z.nombre), detalle: '', hijos: [] })),
      ],
    };
  };
  const distrito = (n: NodoMicrogerencia, clave: string, titulo: string): NodoArbol => ({
    clave, nodo: n, tipo: 'distrito', titulo, detalle: `Hoja con ${n.hijos.map((h) => etiquetaEstacion(h.estacion ?? h.nombre)).join(', ').replace(/, ([^,]*)$/, ' y $1')}`,
    hijos: n.hijos.map(estacion),
  });
  return [
    { clave: 'general', nodo: datos.general, tipo: 'general', titulo: 'MEPOY General', detalle: 'Hoja consolidada con las cinco estaciones', hijos: [] },
    distrito(datos.distrito1, 'd1', 'Distrito Uno'),
    distrito(datos.distrito2, 'd2', 'Distrito Dos'),
  ];
}

function aplanar(arbol: NodoArbol[]): NodoArbol[] {
  return arbol.flatMap((n) => [n, ...aplanar(n.hijos)]);
}

/** Hojas marcadas, en el orden del árbol (General → Distrito → Estación → CAI → Zonas). */
function nodosDelInforme(arbol: NodoArbol[], hojas: string[]): NodoArbol[] {
  const marcadas = new Set(hojas);
  return aplanar(arbol).filter((n) => marcadas.has(n.clave));
}

function tituloInforme(hojas: NodoArbol[]): string {
  if (hojas.length === 0) return 'Microgerencia';
  const primera = hojas[0].tipo === 'general' ? 'MEPOY General' : etiquetaUnidad(hojas[0].nodo, false);
  return hojas.length === 1 ? primera : `${primera} y ${hojas.length - 1} hoja${hojas.length - 1 === 1 ? '' : 's'} más`;
}

// ── Piezas visuales ────────────────────────────────────────────────────
function Marca({ activo }: { activo: boolean }) {
  return (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-2 ${activo ? 'border-[#159089] bg-[#159089] text-white' : 'border-slate-300 bg-white'}`}>
      {activo && <Check size={13} strokeWidth={3.5} />}
    </span>
  );
}

function Chip({ texto, onQuitar }: { texto: string; onQuitar?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#159089]/30 bg-[#e3f2ef] px-2 py-0.5 text-[11.5px] font-semibold text-[#0f5f57]">
      <span className="truncate">{texto}</span>
      {onQuitar && <button type="button" onClick={onQuitar} aria-label={`Quitar ${texto}`} className="rounded-full p-0.5 hover:bg-[#159089]/15"><X size={11} /></button>}
    </span>
  );
}

function Buscador({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 focus-within:border-[#159089]">
      <Search size={14} className="shrink-0 text-slate-400" />
      <input value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] text-[#10233f] outline-none placeholder:text-slate-400" />
    </label>
  );
}

function BotonesLista({ onTodas, onLimpiar, contador }: { onTodas: () => void; onLimpiar: () => void; contador: number }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onTodas} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:border-[#159089]"><CheckCircle2 size={13} /> Seleccionar todas</button>
      <button type="button" onClick={onLimpiar} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:border-rose-300"><Trash2 size={13} /> Limpiar</button>
      <span className="rounded-full bg-[#e3f2ef] px-2 py-0.5 text-[11.5px] font-bold text-[#0f5f57]">{contador} seleccionada{contador === 1 ? '' : 's'}</span>
    </div>
  );
}

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const coincide = (t: string, q: string) => !q || normalizar(t).includes(normalizar(q));


// ── Asistente ──────────────────────────────────────────────────────────
// La ventana se pinta de inmediato y el cálculo (todas las unidades del
// árbol) arranca en el siguiente cuadro: antes el clic quedaba congelado
// hasta terminar de calcular.
export function AsistenteMicrogerencia({ onCerrar }: { onCerrar: () => void }) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    let t = 0;
    const r = requestAnimationFrame(() => { t = window.setTimeout(() => setListo(true), 0); });
    return () => { cancelAnimationFrame(r); clearTimeout(t); };
  }, []);
  if (listo) return <AsistenteContenido onCerrar={onCerrar} />;
  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Microgerencia y Proyección Delictiva MEPOY">
      <div className="flex w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-[#0a3a2c] via-[#0d4636] to-[#0a3a2c] px-4 py-5 text-center text-white">
          <h2 className="text-[19px] font-extrabold sm:text-[24px]">Microgerencia y Proyección Delictiva <span className="text-[#9fdc3a]">MEPOY</span></h2>
        </div>
        <div className="flex items-center justify-center gap-3 px-4 py-16 text-[14px] font-semibold text-slate-600">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#0d4636]" />
          Cargando datos de las unidades…
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Cobertura del panel principal → hojas del asistente (estación, CAI, zona). */
function hojasDesdeFiltros(f: FilterState, registros: CrimeRecord[]): string[] {
  const estacionDe = (campo: 'cai' | 'cuadrante', valor: string) => {
    const m = new Map<string, number>();
    for (const r of registros) if (r[campo] === valor && r.estacion) m.set(r.estacion, (m.get(r.estacion) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  };
  const hojas: string[] = [
    ...f.estacion.filter((x) => !f.cai.length && !f.cuadrante.length).map((x) => `est:${x}`),
    ...f.cai.filter((x) => !f.cuadrante.length).map((x) => `cai:${f.estacion.length === 1 ? f.estacion[0] : estacionDe('cai', x)}|${x}`),
    ...f.cuadrante.map((x) => `zona:${f.estacion.length === 1 ? f.estacion[0] : estacionDe('cuadrante', x)}|${x}`),
  ].filter((h) => !/:\|/.test(h));
  return hojas.length ? hojas : ['general'];
}

function AsistenteContenido({ onCerrar }: { onCerrar: () => void }) {
  const { registrosVisibles, filters } = useData();

  const [e, despachar] = useReducer(reducir, undefined, (): EstadoAsistente => ({
    paso: 0,
    fuentes: ['delictividad'],
    // Arranca con TODO lo que ya esté filtrado en el panel principal:
    // cobertura (estación, CAI, zona), año, meses, fechas y delitos.
    hojas: hojasDesdeFiltros(filters, registrosVisibles),
    anio: filters.anio.length === 1 ? filters.anio[0] : '',
    meses: [...filters.mes],
    ddAnios: [...filters.anio],
    ddMeses: [...filters.mes],
    fechaInicial: filters.fechaInicial ?? '',
    fechaFinal: filters.fechaFinal ?? '',
    delitos: [...filters.delito],
    delitosAnalisis: [],
    vistaMatriz: 'hora',
  }));

  // Marcar TODOS los delitos equivale a no filtrar (así no se pierden los
  // registros con delito «NO REPORTADO» ni cambian los totales del dashboard).
  const totalDelitosCatalogo = useMemo(() => new Set(registrosVisibles.map((r) => r.delito).filter((d) => d && d !== 'NO REPORTADO')).size, [registrosVisibles]);
  const delitosFiltro = useMemo(() => (e.delitos.length >= totalDelitosCatalogo ? [] : e.delitos), [e.delitos, totalDelitosCatalogo]);
  const ajustes = useMemo<AjustesMicrogerencia>(() => ({
    delitos: delitosFiltro, anio: e.anio, meses: e.meses, fechaInicial: e.fechaInicial || null, fechaFinal: e.fechaFinal || null,
    // Barrios filtrados en el panel principal: todas las hojas se limitan a ellos.
    barrios: [...filters.barrioHecho],
  }), [delitosFiltro, e.anio, e.meses, e.fechaInicial, e.fechaFinal, filters.barrioHecho]);
  const datos = useMicrogerencia(ajustes);
  // Operatividad: por defecto usa SU PROPIO corte (la última fecha cargada
  // en la matriz de Operatividad), igual que el módulo «Operatividad por
  // Unidad»; antes tomaba el corte de Delictividad y dejaba por fuera los
  // registros de Operatividad posteriores a ese día. Solo si el usuario
  // elige un año o fechas en el asistente se usa ese mismo periodo.
  const periodoElegido = !!(e.anio || e.meses.length || e.fechaInicial || e.fechaFinal);
  // Operatividad NO se recorta por los delitos de Delictividad: su «delito
  // asociado» tiene otro vocabulario (Tráfico de estupefacientes,
  // Receptación…) y se perdían capturas y TODA la droga. Va completa, igual
  // que el módulo «Operatividad por Unidad».
  const ajustesOp = useMemo(() => ({
    delitos: [] as string[],
    periodo: periodoElegido && datos ? { inicio: datos.actualInicio, fin: datos.actualFin } : null,
    meses: e.meses,
    fechasPersonalizadas: !!(e.fechaInicial && e.fechaFinal),
  }), [periodoElegido, datos?.actualInicio, datos?.actualFin, e.meses, e.fechaInicial, e.fechaFinal]); // eslint-disable-line react-hooks/exhaustive-deps
  const datosOperatividad = useMicrogerenciaOperatividad(ajustesOp);

  // Catálogos reales (de los datos cargados, nunca inventados).
  const catalogo = useMemo(() => {
    const delitos = new Map<string, number>();
    const anios = new Set<number>();
    for (const r of registrosVisibles) {
      if (r.delito && r.delito !== 'NO REPORTADO') delitos.set(r.delito, (delitos.get(r.delito) ?? 0) + 1);
      if (r.anio) anios.add(r.anio);
    }
    return {
      delitos: Array.from(delitos.keys()).sort((a, b) => a.localeCompare(b, 'es')),
      // Para el análisis por delito: de mayor a menor número de registros.
      delitosPorCasos: Array.from(delitos.keys()).sort((a, b) => (delitos.get(b) ?? 0) - (delitos.get(a) ?? 0)),
      anios: Array.from(anios).sort((a, b) => b - a),
    };
  }, [registrosVisibles]);

  // Día a Día: mismos filtros del asistente/panel (delitos, barrios y demás),
  // SIN periodo (el mes lo define el propio Día a Día) ni cobertura (la pone
  // cada hoja). Corte = última fecha cargada en la matriz.
  const diaADia = useMemo(() => {
    if (!e.fuentes.includes('diaadia')) return null;
    const registros = aplicarFiltros(registrosVisibles, {
      ...filters, delito: delitosFiltro, barrioHecho: [...filters.barrioHecho],
      municipio: [], estacion: [], cai: [], cuadrante: [], anio: [], mes: [], fechaInicial: null, fechaFinal: null,
    });
    const columna = columnaIngreso(registrosVisibles);
    const ts = registrosVisibles.reduce((m, r) => { const f = fechaDeConteo(r, columna); return f && f.getTime() > m ? f.getTime() : m; }, 0);
    // Corte: el día anterior (o la última fecha cargada, si es antes).
    const corte = corteDiaADia(ts > 0 ? new Date(ts) : null);
    return { registros, corte, columna, meses: mesesDiaADia({ anios: e.ddAnios, meses: e.ddMeses }) };
  }, [e.fuentes, e.ddAnios, e.ddMeses, registrosVisibles, filters, delitosFiltro]);

  const arbol = useMemo(() => (datos ? construirArbol(datos) : []), [datos]);
  const hojas = useMemo(() => nodosDelInforme(arbol, e.hojas), [arbol, e.hojas]);

  // Secciones del informe, CONSECUTIVAS por unidad: Delictividad de la
  // unidad y enseguida su Operatividad (General, General; Norte, Norte…).
  const secciones = useMemo<SeccionTerritorial[]>(() => {
    const out: SeccionTerritorial[] = [];
    for (const h of hojas) {
      if (datos && e.fuentes.includes('delictividad')) out.push(...seccionesDelInforme(datos, [h.nodo], 'delictividad', e.vistaMatriz));
      // Día a Día: enseguida de Delictividad (una hoja por mes elegido).
      if (datos && e.fuentes.includes('diaadia') && diaADia) for (const m of diaADia.meses) out.push(seccionDiaADia(datos, h.nodo, m, diaADia.registros, diaADia.corte, diaADia.columna));
      if (datosOperatividad && e.fuentes.includes('operatividad')) {
        const nodoOp = h.tipo === 'general' ? datosOperatividad.general : nodoOperatividadEquivalente(datosOperatividad, h.nodo.nombre);
        if (nodoOp) out.push(...seccionesDelInforme(datosOperatividad, [nodoOp], 'operatividad'));
      }
      // Microgerencia por delito: una lámina por delito, en el orden elegido.
      if (datos) for (const d of e.delitosAnalisis) out.push(seccionDelito(datos, h.nodo, d));
    }
    return out;
  }, [datos, datosOperatividad, hojas, e.fuentes, e.delitosAnalisis, e.vistaMatriz, diaADia]);

  const errores: (string | null)[] = [
    e.fuentes.length === 0 && e.delitosAnalisis.length === 0 ? 'Seleccione al menos una microgerencia o un delito.' : null,
    (e.fuentes.includes('delictividad') || e.fuentes.includes('operatividad') || e.fuentes.includes('diaadia') || e.delitosAnalisis.length > 0) && e.hojas.length === 0 ? 'Marque al menos una hoja (por ejemplo, MEPOY General).' : null,
    e.fechaInicial && e.fechaFinal && e.fechaInicial > e.fechaFinal ? 'La fecha inicial no puede ser posterior a la fecha final.' : null,
    !datos && (e.fuentes.includes('delictividad') || e.fuentes.includes('operatividad') || e.fuentes.includes('diaadia') || e.delitosAnalisis.length > 0) ? 'No hay datos suficientes para el periodo elegido.' : null,
  ];
  const [intento, setIntento] = useState(false);
  const errorActual = errores[e.paso];

  const [generando, setGenerando] = useState<'' | 'generando' | 'listo' | 'error'>('');
  const [mensajeGeneracion, setMensajeGeneracion] = useState('');

  function irA(paso: number) {
    if (paso > e.paso) {
      for (let i = e.paso; i < paso; i++) {
        if (errores[i]) { setIntento(true); despachar({ tipo: 'paso', paso: i }); return; }
      }
    }
    setIntento(false);
    despachar({ tipo: 'paso', paso });
  }

  useEffect(() => {
    const alTeclado = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && generando !== 'generando') onCerrar(); };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [onCerrar, generando]);

  const corte = datos?.fechaCorte ?? datosOperatividad?.fechaCorte ?? datos?.actualFin ?? new Date().toISOString().slice(0, 10);
  const nombreBase = `Microgerencia_${tituloInforme(hojas).replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_')}_${corte}`;

  async function generarPdf() {
    setGenerando('generando');
    setMensajeGeneracion('Preparando el informe…');
    try {
      const extras: SeccionExtraMicrogerencia[] = [];
      // Operatividad va SOLO en su lámina institucional: ya no se agrega la
      // hoja antigua «Operatividad — Detalle».
      if (e.fuentes.includes('rnmc')) {
        setMensajeGeneracion('Agregando RNMC…');
        const rnmc = await seccionRnmc();
        if (rnmc) extras.push(rnmc);
      }
      if (secciones.length === 0 && extras.length === 0) throw new Error('No hay contenido para el informe con esta selección.');
      const laminas = await capturarLaminas(secciones, 5, [], (i, n, u) => setMensajeGeneracion(`Hoja ${i} de ${n}: ${u}…`));
      setMensajeGeneracion('Armando el PDF…');
      const r = await generarPdfTerritorial({
        titulo: tituloInforme(hojas), ficha: [], secciones, laminas,
        anexos: { nodos: [], imagenes: new Map(), extras, opciones: { anioActual: datos?.anioActual, anioAnterior: datos?.anioAnterior, fechaCorte: corte } },
        nombreArchivo: `${nombreBase}.pdf`,
      });
      setGenerando('listo');
      setMensajeGeneracion(`PDF generado: ${r.paginas} página(s) — ${r.laminas} hoja(s)${extras.length ? ` y ${extras.length} anexo(s)` : ''}${r.omitidas.length ? `. Sin información suficiente: ${r.omitidas.join(', ')}` : ''}.`);
    } catch (err) {
      setGenerando('error');
      setMensajeGeneracion(err instanceof Error ? err.message : 'No se pudo generar el PDF.');
    }
  }

  /** Imagen PNG de la lámina principal (primera hoja) de CADA fuente elegida. */
  async function descargarImagen() {
    const principales = [
      ...(['delictividad', 'variables', 'diaadia', 'operatividad'] as const).map((f) => secciones.find((s) => s.fuente === f && !s.sinInformacion)),
      ...e.delitosAnalisis.map((d) => secciones.find((s) => s.fuente === 'delito' && s.delito === d && !s.sinInformacion)),
    ].filter((s): s is SeccionTerritorial => !!s);
    if (principales.length === 0) { setGenerando('error'); setMensajeGeneracion('No hay una hoja con información para la imagen.'); return; }
    setGenerando('generando');
    setMensajeGeneracion(`Preparando ${principales.length === 1 ? 'la imagen' : 'las imágenes'}…`);
    try {
      const pngs = await capturarLaminas(principales, 5, [], undefined, 'png');
      for (const [i, png] of pngs.entries()) {
        if (!png) continue;
        const url = URL.createObjectURL(await (await fetch(png)).blob());
        const a = document.createElement('a');
        a.href = url;
        const sufijo = principales[i].fuente === 'operatividad' ? '_Operatividad' : principales[i].fuente === 'variables' ? '_2_Matriz_de_calor_y_variables' : principales[i].fuente === 'diaadia' ? '_Dia_a_dia' : principales[i].fuente === 'delictividad' ? '_1_Consolidado_delictivo' : principales[i].fuente === 'delito' ? `_${(principales[i].delito ?? '').replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_')}` : '';
        a.download = `${nombreBase}${sufijo}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        await new Promise((r) => setTimeout(r, 350)); // el navegador acepta mejor descargas seguidas con una pausa
      }
      setGenerando('listo');
      setMensajeGeneracion(`Imagen${principales.length === 1 ? '' : 'es'} descargada${principales.length === 1 ? '' : 's'}: ${principales.map((s) => `${s.unidad} (${s.fuente === 'operatividad' ? 'Operativa' : s.fuente === 'delito' ? s.delito : s.fuente === 'variables' ? 'Delictiva, hoja 2' : s.fuente === 'diaadia' ? 'Día a Día' : 'Delictiva, hoja 1'})`).join(', ')}.`);
    } catch (err) {
      setGenerando('error');
      setMensajeGeneracion(err instanceof Error ? err.message : 'No se pudo generar la imagen.');
    }
  }

  const ultimo = e.paso === PASOS.length - 1;
  const validarYEjecutar = (fn: () => Promise<void>) => {
    if (errores.some(Boolean)) { const i = errores.findIndex(Boolean); setIntento(true); despachar({ tipo: 'paso', paso: i }); return; }
    void fn();
  };
  const conLaminas = e.fuentes.includes('delictividad') || e.fuentes.includes('operatividad') || e.fuentes.includes('diaadia') || e.delitosAnalisis.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Microgerencia y Proyección Delictiva MEPOY">
      <div className="flex max-h-[96vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* ENCABEZADO */}
        <div className="relative shrink-0 bg-gradient-to-r from-[#0a3a2c] via-[#0d4636] to-[#0a3a2c] px-4 pb-3 pt-3 text-white sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white p-[2px] ring-2 ring-[#9fdc3a]/50">
              <img src="/assets/escudo-policia.png" alt="Escudo Policía Nacional" className="h-full w-full rounded-full object-contain" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[12px] font-bold tracking-wide">POLICÍA NACIONAL DE COLOMBIA</p>
              <p className="text-[10.5px] font-semibold text-white/85">POLICÍA METROPOLITANA DE POPAYÁN – MEPOY</p>
            </div>
            <button type="button" onClick={onCerrar} disabled={generando === 'generando'} aria-label="Cerrar" className="ml-auto rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-40"><X size={20} /></button>
          </div>
          <h2 className="mt-1 text-center text-[19px] font-extrabold sm:text-[24px]">Microgerencia y Proyección Delictiva <span className="text-[#9fdc3a]">MEPOY</span></h2>
          <p className="text-center text-[12.5px] text-white/85 sm:text-[13.5px]">Configura tu informe</p>
        </div>

        {/* PROGRESO */}
        <nav className="shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2.5" aria-label="Pasos">
          <ol className="flex min-w-max items-center gap-1 sm:min-w-0 sm:justify-between">
            {PASOS.map((nombre, i) => {
              const activo = i === e.paso;
              const hecho = i < e.paso;
              return (
                <li key={nombre} className="flex items-center gap-1">
                  <button type="button" onClick={() => irA(i)} disabled={generando === 'generando'} aria-current={activo ? 'step' : undefined}
                    className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12px] font-semibold transition-colors ${activo ? 'bg-[#e3f2ef] text-[#0f5f57]' : hecho ? 'text-[#0f5f57] hover:bg-slate-50' : 'text-slate-500 hover:bg-slate-50'}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11.5px] font-bold ${activo ? 'border-[#159089] bg-[#159089] text-white' : hecho ? 'border-[#159089] bg-white text-[#159089]' : 'border-slate-300 bg-white text-slate-500'}`}>
                      {hecho ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    {nombre}
                  </button>
                  {i < PASOS.length - 1 && <span className="hidden h-px w-8 bg-slate-200 lg:block" />}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* CUERPO */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <main className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:overflow-y-auto">
            {e.paso === 0 && <PasoFuentes e={e} despachar={despachar} delitos={catalogo.delitosPorCasos} />}
            {e.paso === 1 && <PasoCobertura e={e} despachar={despachar} arbol={arbol} />}
            {e.paso === 2 && <PasoPeriodo e={e} despachar={despachar} anios={catalogo.anios} delitos={catalogo.delitos} datos={datos} />}
            {e.paso === 3 && <PasoResumen e={e} despachar={despachar} irA={irA} datos={datos} secciones={secciones} generando={generando} mensaje={mensajeGeneracion} />}
            {intento && errorActual && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700"><AlertCircle size={15} /> {errorActual}</p>
            )}
          </main>
          <PanelResumen e={e} despachar={despachar} datos={datos} hojas={hojas} />
        </div>

        {/* NAVEGACIÓN */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <button type="button" onClick={onCerrar} disabled={generando === 'generando'} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-[#10233f] hover:border-slate-400 disabled:opacity-40"><X size={15} /> Cancelar</button>
          <button type="button" onClick={() => irA(e.paso - 1)} disabled={e.paso === 0 || generando === 'generando'} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-[#10233f] hover:border-slate-400 disabled:opacity-40"><ArrowLeft size={15} /> Anterior</button>
          {!ultimo ? (
            <button type="button" onClick={() => { if (errorActual) { setIntento(true); return; } irA(e.paso + 1); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5f57] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#116762]">Continuar <ArrowRight size={15} /></button>
          ) : (
            <>
              {conLaminas && (
                <button type="button" onClick={() => validarYEjecutar(descargarImagen)} disabled={generando === 'generando'} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0f5f57] px-3.5 py-2 text-[13px] font-bold text-[#0f5f57] hover:bg-[#e3f2ef] disabled:opacity-60">
                  <ImageDown size={15} /> Descargar imagen
                </button>
              )}
              <button type="button" onClick={() => validarYEjecutar(generarPdf)} disabled={generando === 'generando'} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5f57] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#116762] disabled:opacity-60">
                {generando === 'generando' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Generar PDF
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Pasos ──────────────────────────────────────────────────────────────
type PropsPaso = { e: EstadoAsistente; despachar: React.Dispatch<Accion> };

function TituloPaso({ n, titulo, sub }: { n: number; titulo: string; sub: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[19px] font-extrabold text-[#10233f]">{n}. {titulo}</h3>
      <p className="text-[12.5px] text-slate-500">{sub}</p>
    </div>
  );
}

function PasoFuentes({ e, despachar, delitos }: PropsPaso & { delitos: string[] }) {
  const [q, setQ] = useState('');
  const visibles = delitos.filter((d) => coincide(d, q));
  return (
    <div>
      <TituloPaso n={1} titulo="Selecciona las microgerencias" sub="Marque las láminas que quiere en el informe. Se generan para cada hoja de la cobertura, en este orden." />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FUENTES.filter((f) => f.disponible).map((f) => {
          const activo = e.fuentes.includes(f.id);
          const Icono = f.icono;
          return (
            <button key={f.id} type="button" onClick={() => despachar({ tipo: 'fuente', fuente: f.id })} aria-pressed={activo}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors ${activo ? 'border-[#159089] bg-[#eaf6f1]' : 'border-slate-200 bg-white hover:border-[#159089]/50'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activo ? 'bg-[#0f5f57] text-white' : 'bg-slate-100 text-[#0f5f57]'}`}><Icono size={21} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[#10233f]">{f.nombre}</span>
                <span className="block text-[12px] leading-snug text-slate-600">{f.descripcion}</span>
              </span>
              <Marca activo={activo} />
            </button>
          );
        })}
      </div>

      <section className="mt-4 rounded-xl border-2 border-slate-200 p-3" data-seccion-delitos>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ShieldCheck size={20} className="text-[#0f5f57]" />
          <p className="text-[15px] font-bold text-[#10233f]">Microgerencia por delito</p>
          <span className="text-[12px] text-slate-500">— una lámina por cada delito marcado, en el orden que usted defina.</span>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar delito…" />
          <BotonesLista contador={e.delitosAnalisis.length} onTodas={() => despachar({ tipo: 'lista', campo: 'delitosAnalisis', valores: Array.from(new Set([...e.delitosAnalisis, ...visibles])) })} onLimpiar={() => despachar({ tipo: 'lista', campo: 'delitosAnalisis', valores: [] })} />
        </div>
        <div className="grid max-h-[190px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((d) => {
            const activo = e.delitosAnalisis.includes(d);
            return (
              <button key={d} type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'delitosAnalisis', valor: d })} aria-pressed={activo}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] ${activo ? 'border-[#159089] bg-[#eaf6f1] font-semibold text-[#0f5f57]' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/50'}`}>
                <Marca activo={activo} /> {d}
              </button>
            );
          })}
        </div>
        {e.delitosAnalisis.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-[12.5px] font-bold text-[#10233f]">Orden de las láminas por delito</p>
            <ol className="space-y-1" data-orden-delitos>
              {e.delitosAnalisis.map((d, i) => (
                <li key={d} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[13px]">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f5f57] text-[11.5px] font-bold text-white">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-[#10233f]">{d}</span>
                  <button type="button" onClick={() => despachar({ tipo: 'mover', valor: d, paso: -1 })} disabled={i === 0} aria-label={`Subir ${d}`} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronUp size={16} /></button>
                  <button type="button" onClick={() => despachar({ tipo: 'mover', valor: d, paso: 1 })} disabled={i === e.delitosAnalisis.length - 1} aria-label={`Bajar ${d}`} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30"><ChevronDown size={16} /></button>
                  <button type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'delitosAnalisis', valor: d })} aria-label={`Quitar ${d}`} className="rounded p-1 text-rose-600 hover:bg-rose-50"><X size={15} /></button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}


/** Cobertura: árbol de unidades. Cada casilla marcada = una hoja del informe. */
function PasoCobertura({ e, despachar, arbol }: PropsPaso & { arbol: NodoArbol[] }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set(['d1', 'd2']));
  const alternarAbierto = (k: string) => setAbiertos((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const marcada = (k: string) => e.hojas.includes(k);
  const todas = aplanar(arbol);
  const estaciones = todas.filter((n) => n.tipo === 'estacion').map((n) => n.clave);

  const Fila = ({ n, nivel }: { n: NodoArbol; nivel: number }) => {
    const activo = marcada(n.clave);
    const cais = n.hijos.filter((h) => h.tipo === 'cai');
    const zonas = n.hijos.filter((h) => h.tipo === 'zona');
    const desplegable = n.tipo === 'distrito' || (n.tipo === 'estacion' && n.hijos.length > 0);
    const abierto = abiertos.has(n.clave);
    const Icono = n.tipo === 'general' ? Building2 : n.tipo === 'distrito' ? Layers : ShieldCheck;
    const marcadasDentro = aplanar(n.hijos).filter((h) => marcada(h.clave)).length;
    return (
      <div className={nivel === 0 ? 'rounded-xl border border-slate-200 bg-white' : ''}>
        <div className={`flex items-center gap-2 px-2.5 py-2 ${nivel > 0 ? 'rounded-lg' : ''} ${activo ? 'bg-[#eaf6f1]' : ''}`} style={{ marginLeft: nivel * 22 }}>
          {desplegable ? (
            <button type="button" onClick={() => alternarAbierto(n.clave)} aria-label={abierto ? 'Contraer' : 'Desplegar'} className="rounded p-0.5 text-slate-500 hover:bg-slate-100">{abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
          ) : <span className="w-5" />}
          <button type="button" onClick={() => despachar({ tipo: 'hoja', clave: n.clave })} aria-pressed={activo} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
            <Marca activo={activo} />
            <Icono size={18} className="shrink-0 text-[#0f5f57]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-[#10233f]">{n.titulo}</span>
              <span className="block text-[11.5px] leading-snug text-slate-500">{n.detalle}</span>
            </span>
          </button>
          {marcadasDentro > 0 && !abierto && <span className="shrink-0 rounded-full bg-[#e3f2ef] px-2 py-0.5 text-[11px] font-bold text-[#0f5f57]">+{marcadasDentro} hoja{marcadasDentro === 1 ? '' : 's'} dentro</span>}
        </div>
        {desplegable && abierto && (
          <div className="pb-2">
            {n.tipo === 'distrito' && n.hijos.map((h) => <Fila key={h.clave} n={h} nivel={nivel + 1} />)}
            {n.tipo === 'estacion' && (
              <div className="space-y-2 py-1" style={{ marginLeft: (nivel + 1) * 22 + 30 }}>
                {cais.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">CAI <span className="font-normal normal-case">(una hoja por cada CAI marcado)</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {cais.map((c) => (
                        <button key={c.clave} type="button" onClick={() => despachar({ tipo: 'hoja', clave: c.clave })} aria-pressed={marcada(c.clave)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold ${marcada(c.clave) ? 'border-[#159089] bg-[#eaf6f1] text-[#0f5f57]' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/50'}`}>
                          <Marca activo={marcada(c.clave)} /> {c.titulo}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {zonas.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Zonas de atención <span className="font-normal normal-case">(solo si las marca)</span></p>
                    <div className="flex max-h-[150px] flex-wrap gap-1.5 overflow-y-auto pr-1">
                      {zonas.map((z) => (
                        <button key={z.clave} type="button" onClick={() => despachar({ tipo: 'hoja', clave: z.clave })} aria-pressed={marcada(z.clave)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold ${marcada(z.clave) ? 'border-[#159089] bg-[#eaf6f1] text-[#0f5f57]' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/50'}`}>
                          <Marca activo={marcada(z.clave)} /> {z.titulo}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <TituloPaso n={2} titulo="Cobertura del informe" sub="Marque las unidades que deben tener su propia hoja. Cada casilla marcada es una hoja del PDF." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => despachar({ tipo: 'hojas', valores: Array.from(new Set([...e.hojas, ...estaciones])) })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:border-[#159089]"><CheckCircle2 size={13} /> Marcar las 5 estaciones</button>
        <button type="button" onClick={() => despachar({ tipo: 'hojas', valores: [] })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:border-rose-300"><Trash2 size={13} /> Limpiar</button>
        <span className="ml-auto rounded-full bg-[#0f5f57] px-3 py-1 text-[12.5px] font-bold text-white" data-contador-hojas>{e.hojas.length} hoja{e.hojas.length === 1 ? '' : 's'}</span>
      </div>
      <div className="space-y-2">
        {arbol.map((n) => <Fila key={n.clave} n={n} nivel={0} />)}
        {arbol.length === 0 && <p className="text-[13px] text-slate-500">Cargando unidades…</p>}
      </div>
      <p className="mt-3 flex gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
        <Info size={15} className="mt-0.5 shrink-0 text-[#0f5f57]" />
        La hoja de MEPOY General ya trae las cinco estaciones; la de un distrito, sus estaciones; y la de una estación, sus CAI. Marque una unidad más abajo solo si quiere además su hoja propia.
      </p>
    </div>
  );
}

function PasoPeriodo({ e, despachar, anios, delitos, datos }: PropsPaso & { anios: number[]; delitos: string[]; datos: DatosMicrogerencia | null }) {
  const [q, setQ] = useState('');
  const fmt = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
  const visibles = delitos.filter((d) => coincide(d, q));
  return (
    <div className="space-y-4">
      <TituloPaso n={3} titulo="Periodo y delitos" sub="Ventana de análisis y delitos que se incluirán (se respetan las reglas estadísticas del dashboard)." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-[12.5px] font-semibold text-[#10233f]">Año de análisis
          <select value={e.anio} onChange={(ev) => despachar({ tipo: 'periodo', anio: ev.target.value, fechaInicial: '', fechaFinal: '' })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px]">
            <option value="">Vigencia actual (a la fecha)</option>
            {anios.map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold text-[#10233f]">Fecha inicial
          <input type="date" value={e.fechaInicial} onChange={(ev) => despachar({ tipo: 'periodo', fechaInicial: ev.target.value, meses: [] })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
        <label className="text-[12.5px] font-semibold text-[#10233f]">Fecha final
          <input type="date" value={e.fechaFinal} onChange={(ev) => despachar({ tipo: 'periodo', fechaFinal: ev.target.value, meses: [] })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
      </div>
      {e.fuentes.includes('diaadia') && <SelectorDiaADia e={e} despachar={despachar} anios={anios} />}
      <div data-meses-asistente>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12.5px] font-semibold text-[#10233f]">Meses <span className="font-normal text-slate-500">(sin selección = todo el periodo; se cuentan solo los meses elegidos)</span></p>
          {e.meses.length > 0 && <button type="button" onClick={() => despachar({ tipo: 'periodo', meses: [] })} className="rounded-md border border-slate-200 px-2 py-0.5 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100">Quitar meses</button>}
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
          {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => {
            const v = String(i + 1);
            const activo = e.meses.includes(v);
            return (
              <button key={v} type="button" aria-pressed={activo}
                onClick={() => despachar({ tipo: 'periodo', meses: activo ? e.meses.filter((x) => x !== v) : [...e.meses, v].sort((a, b) => Number(a) - Number(b)), fechaInicial: '', fechaFinal: '' })}
                className={`rounded-lg border px-1 py-1.5 text-[12.5px] font-bold ${activo ? 'border-[#159089] bg-[#0f5f57] text-white' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/60'}`}>{m}</button>
            );
          })}
        </div>
      </div>
      {datos && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold uppercase text-slate-500">Periodo analizado</p><p className="text-[13.5px] font-bold text-[#10233f]">{datos.periodoEtiqueta ?? `${fmt(datos.actualInicio)} – ${fmt(datos.actualFin)}`}</p>{!e.meses.length && <p className="text-[11.5px] text-slate-500">{fmt(datos.actualInicio)} – {fmt(datos.actualFin)}</p>}</div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold uppercase text-slate-500">Periodo de comparación</p><p className="text-[13.5px] font-bold text-[#10233f]">{datos.comparacionEtiqueta ?? `Mismo periodo de ${datos.anioAnterior}`}</p><p className="text-[11.5px] text-slate-500">Total {datos.anioAnterior}: {e.meses.length ? 'los mismos meses completos' : 'año completo'}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold uppercase text-slate-500">Fecha de corte</p><p className="text-[13.5px] font-bold text-[#10233f]">{fechaLargaIso(datos.fechaCorte ?? datos.actualFin)}</p></div>
        </div>
      )}
      <section>
        <p className="mb-2 text-[14px] font-bold text-[#10233f]">Delitos <span className="font-normal text-slate-500">(sin selección se incluyen todos)</span></p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Buscador valor={q} onCambio={setQ} placeholder="Buscar delito…" />
          <BotonesLista contador={e.delitos.length} onTodas={() => despachar({ tipo: 'lista', campo: 'delitos', valores: Array.from(new Set([...e.delitos, ...visibles])) })} onLimpiar={() => despachar({ tipo: 'lista', campo: 'delitos', valores: [] })} />
        </div>
        <div className="grid max-h-[300px] grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((d) => {
            const activo = e.delitos.includes(d);
            return (
              <button key={d} type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'delitos', valor: d })} aria-pressed={activo}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[13px] ${activo ? 'border-[#159089] bg-[#eaf6f1] font-semibold text-[#0f5f57]' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/50'}`}>
                <Marca activo={activo} /> {d}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}


function PasoResumen({ e, despachar, irA, datos, secciones, generando, mensaje }: {
  e: EstadoAsistente; despachar: (a: Accion) => void; irA: (p: number) => void; datos: DatosMicrogerencia | null; secciones: SeccionTerritorial[];
  generando: '' | 'generando' | 'listo' | 'error'; mensaje: string;
}) {
  const filas: { paso: number; titulo: string; valor: string }[] = [
    { paso: 0, titulo: 'Fuentes', valor: e.fuentes.map((f) => FUENTES.find((x) => x.id === f)?.nombre ?? f).join(', ') || '—' },
    ...(e.delitosAnalisis.length ? [{ paso: 0, titulo: 'Por delito', valor: e.delitosAnalisis.map((d, i) => `${i + 1}. ${d}`).join(' · ') }] : []),
    { paso: 1, titulo: 'Hojas', valor: `${e.hojas.length} hoja${e.hojas.length === 1 ? '' : 's'} por fuente` },
    { paso: 2, titulo: 'Periodo', valor: datos ? `${datos.periodoEtiqueta ?? datos.periodo} vs. ${datos.comparacionEtiqueta ?? datos.anioAnterior} · corte ${fechaLargaIso(datos.fechaCorte ?? datos.actualFin)}` : '—' },
    { paso: 2, titulo: 'Delitos', valor: e.delitos.length ? e.delitos.join(', ') : 'Todos' },
  ];
  return (
    <div className="space-y-3">
      <TituloPaso n={4} titulo="Resumen" sub="Así quedará el informe. Puede volver a cualquier paso para modificarlo." />
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {filas.map((f) => (
          <div key={f.titulo} className="flex items-start gap-3 px-3 py-2">
            <p className="w-[110px] shrink-0 text-[12.5px] font-bold text-slate-500">{f.titulo}</p>
            <p className="min-w-0 flex-1 text-[13px] text-[#10233f]">{f.valor}</p>
            <button type="button" onClick={() => irA(f.paso)} className="shrink-0 text-[12px] font-semibold text-[#0f5f57] hover:underline">Modificar</button>
          </div>
        ))}
      </div>

      {e.fuentes.includes('delictividad') && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2" data-vista-matriz>
          <p className="text-[13px] font-bold text-[#10233f]">Hoja 2 · Matriz de calor:</p>
          <div className="flex overflow-hidden rounded-lg border border-[#0f5f57]">
            {(['hora', 'franja'] as const).map((v) => (
              <button key={v} type="button" onClick={() => despachar({ tipo: 'vistaMatriz', vista: v })} aria-pressed={e.vistaMatriz === v}
                className={`px-3 py-1 text-[12.5px] font-bold ${e.vistaMatriz === v ? 'bg-[#0f5f57] text-white' : 'bg-white text-[#0f5f57] hover:bg-[#e3f2ef]'}`}>{v === 'hora' ? 'Por hora' : 'Por franja horaria'}</button>
            ))}
          </div>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[14px] font-bold text-[#10233f]"><FileText size={16} className="text-[#0f5f57]" /> Estructura del PDF</p>
      <ol className="space-y-1.5" data-estructura-pdf>
        {secciones.map((s, i) => (
          <li key={`${s.fuente}-${s.unidad}-${i}`} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[12.5px] ${s.sinInformacion ? 'border-dashed border-slate-300 bg-slate-50 text-slate-500' : 'border-slate-200 bg-white'}`}>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#e3f2ef] px-1.5 text-[11px] font-bold text-[#0f5f57]">{i + 1}</span>
            <span className="min-w-0 flex-1 font-bold text-[#10233f]">{s.unidad}<span className="ml-2 font-normal text-slate-500">{s.fuente === 'operatividad' ? 'Microgerencia operativa' : s.fuente === 'delito' ? `Delito: ${s.delito}` : s.fuente === 'variables' ? `Delictiva · hoja 2: matriz de calor y variables (${s.vistaMatriz === 'franja' ? 'por franja' : 'por hora'})` : s.fuente === 'diaadia' ? `Día a Día · ${s.diaADia ? `${MESES_LARGOS[s.diaADia.mes - 1]} ${s.diaADia.anio}` : ''}` : 'Delictiva · hoja 1: consolidado'}</span></span>
            {s.sinInformacion ? <span>Sin registros: no se genera</span> : (
              <>
                <span className="text-slate-500">{s.datos.anioAnterior}: <strong className="text-[#10233f]">{formatNumero(s.nodo.fecha2025)}</strong></span>
                <span className="text-slate-500">{s.datos.anioActual}: <strong className="text-[#10233f]">{formatNumero(s.nodo.fecha2026)}</strong></span>
                <span className={s.nodo.dif > 0 ? 'font-bold text-rose-600' : s.nodo.dif < 0 ? 'font-bold text-emerald-600' : 'text-slate-400'}>{s.nodo.dif > 0 ? '+' : ''}{formatNumero(s.nodo.dif)}</span>
              </>
            )}
          </li>
        ))}
        {e.fuentes.includes('rnmc') && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12.5px] text-slate-600">+ Anexo: resumen de RNMC</li>}
        {secciones.length === 0 && (e.fuentes.includes('delictividad') || e.fuentes.includes('operatividad') || e.fuentes.includes('diaadia')) && <li className="text-[12.5px] text-rose-600">No hay hojas con esta selección.</li>}
      </ol>
      <p className="text-[11.5px] text-slate-500">«Descargar imagen» guarda en PNG la primera unidad de cada fuente (Delictividad: sus dos hojas); «Generar PDF» arma el informe completo.</p>

      {generando && (
        <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold ${generando === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : generando === 'listo' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#159089]/30 bg-[#e3f2ef] text-[#0f5f57]'}`} role="status" data-estado-generacion={generando}>
          {generando === 'generando' ? <Loader2 size={16} className="animate-spin" /> : generando === 'listo' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {mensaje}
        </div>
      )}
    </div>
  );
}

// ── Panel lateral de resumen ───────────────────────────────────────────
function PanelResumen({ e, despachar, datos, hojas }: PropsPaso & { datos: DatosMicrogerencia | null; hojas: NodoArbol[] }) {
  const bloque = (titulo: string, icono: typeof BarChart3, contenido: React.ReactNode) => {
    const Icono = icono;
    return (
      <div className="flex gap-2.5">
        <Icono size={17} className="mt-0.5 shrink-0 text-[#0f5f57]" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold text-[#10233f]">{titulo}</p>
          <div className="mt-1 flex flex-wrap gap-1">{contenido}</div>
        </div>
      </div>
    );
  };
  const nota = e.paso === 0 ? 'Puede seleccionar una o varias fuentes.' : e.paso === 1 ? 'Cada unidad marcada es una hoja del informe.' : e.paso === 2 ? 'Sin delitos seleccionados se incluyen todos.' : 'Genere el PDF o descargue la imagen.';
  return (
    <aside className="shrink-0 border-t border-slate-200 bg-slate-50/70 px-4 py-4 lg:w-[290px] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Resumen de la selección" data-panel-resumen>
      <p className="mb-3 rounded-lg bg-white px-3 py-2 text-[16px] font-extrabold text-[#10233f] shadow-sm">Resumen</p>
      <div className="space-y-3">
        {bloque('Fuentes seleccionadas', Layers, e.fuentes.length ? e.fuentes.map((f) => <Chip key={f} texto={FUENTES.find((x) => x.id === f)?.nombre ?? f} onQuitar={e.fuentes.length > 1 ? () => despachar({ tipo: 'fuente', fuente: f }) : undefined} />) : <span className="text-[12px] text-slate-400">Ninguna</span>)}
        {e.delitosAnalisis.length > 0 && bloque(`Microgerencia por delito (${e.delitosAnalisis.length})`, ShieldCheck, e.delitosAnalisis.map((d, i) => <Chip key={d} texto={`${i + 1}. ${d}`} onQuitar={() => despachar({ tipo: 'alternar', campo: 'delitosAnalisis', valor: d })} />))}
        {bloque(`Hojas del informe (${hojas.length})`, MapPin, hojas.length ? hojas.map((h) => <Chip key={h.clave} texto={h.tipo === 'zona' || h.tipo === 'cai' ? `${h.titulo} · ${etiquetaEstacion(h.nodo.estacion ?? '')}` : h.titulo} onQuitar={() => despachar({ tipo: 'hoja', clave: h.clave })} />) : <span className="text-[12px] text-slate-400">Ninguna</span>)}
        {bloque('Periodo', CalendarDays, <span className="text-[12px] text-slate-600">{datos ? `${datos.periodoEtiqueta ?? datos.periodo} vs. ${datos.comparacionEtiqueta ?? datos.anioAnterior}` : e.anio || 'Vigencia actual'}</span>)}
        {bloque(`Delitos${e.delitos.length ? ` (${e.delitos.length})` : ''}`, ShieldCheck, e.delitos.length ? e.delitos.map((d) => <Chip key={d} texto={d} onQuitar={() => despachar({ tipo: 'alternar', campo: 'delitos', valor: d })} />) : <span className="text-[12px] text-slate-600">Todos</span>)}
      </div>
      <p className="mt-4 flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] text-slate-600"><Info size={14} className="mt-0.5 shrink-0 text-[#0f5f57]" /> {nota}</p>
    </aside>
  );
}

/** Día a Día: años y meses propios (sin versus). Cada año × mes = una hoja. */
function SelectorDiaADia({ e, despachar, anios }: { e: EstadoAsistente; despachar: (a: Accion) => void; anios: number[] }) {
  const hojasDd = mesesDiaADia({ anios: e.ddAnios, meses: e.ddMeses });
  const alternar = (lista: string[], v: string) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v].sort((a, b) => Number(a) - Number(b)));
  const chip = (activo: boolean) => `rounded-lg border px-2 py-1.5 text-[12.5px] font-bold ${activo ? 'border-[#159089] bg-[#0f5f57] text-white' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/60'}`;
  return (
    <div className="rounded-xl border border-[#159089]/40 bg-[#f1f8f6] p-3" data-dia-a-dia-periodo>
      <p className="text-[13.5px] font-bold text-[#0f5f57]">Día a Día · años y meses</p>
      <p className="mb-2 text-[11.5px] text-slate-600">Independiente del periodo de arriba y sin comparación: cada año × mes elegido sale en su propia hoja. Sin año = año actual; sin mes = mes actual. El mes en curso va con corte al día anterior.</p>
      <div className="flex flex-wrap gap-1.5">
        {anios.map((a) => { const v = String(a); return <button key={v} type="button" aria-pressed={e.ddAnios.includes(v)} onClick={() => despachar({ tipo: 'diaadia', anios: alternar(e.ddAnios, v) })} className={chip(e.ddAnios.includes(v))}>{v}</button>; })}
      </div>
      <div className="mt-1.5 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((m, i) => { const v = String(i + 1); return <button key={v} type="button" aria-pressed={e.ddMeses.includes(v)} onClick={() => despachar({ tipo: 'diaadia', meses: alternar(e.ddMeses, v) })} className={chip(e.ddMeses.includes(v))}>{m}</button>; })}
      </div>
      <p className="mt-2 text-[12px] text-[#10233f]"><b>Hojas Día a Día:</b> {hojasDd.length ? hojasDd.map((h) => `${MESES_LARGOS[h.mes - 1]} ${h.anio}`).join(' · ') : 'ninguna (los meses elegidos aún no empiezan)'}</p>
    </div>
  );
}
