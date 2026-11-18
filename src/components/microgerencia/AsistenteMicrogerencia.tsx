import { useEffect, useMemo, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  ClipboardList, Download, Eye, FileText, Gavel, Info, Layers, LayoutGrid, Loader2, MapPin, Search, ShieldCheck, Trash2,
  Users, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useMicrogerencia, ESTACIONES_DISTRITO_1, ESTACIONES_DISTRITO_2 } from '../../hooks/useMicrogerencia';
import { useMicrogerenciaOperatividad } from '../../hooks/useMicrogerenciaOperatividad';
import { nombreVisibleUnidad, type AjustesMicrogerencia, type DatosMicrogerencia, type NodoMicrogerencia } from '../../data/microgerencia';
import { generarPdfMicrogerencia, seccionTablaConsolidada, type OpcionesPdfMicrogerencia, type SeccionExtraMicrogerencia } from '../../data/pdfMicrogerencia';
import { imagenesParaNodos, grupoOperatividad, paginaDetalleOperatividad, seccionRnmc } from '../../data/microgerenciaGeneracion';
import { fechaLargaIso } from '../../data/microgerenciaTextos';
import { InformeEjecutivoMicrogerencia, opcionesCobertura } from './InformeEjecutivoMicrogerencia';
import { capturarLaminas, generarPdfTerritorial, seccionesDelInforme } from './informeTerritorial';
import type { FuenteMicrogerencia } from './SelectorFuentesMicrogerencia';
import { formatNumero } from '../../utils/aggregations';

// ───────────────────────────────────────────────────────────────────────
// ASISTENTE de «Microgerencia y Proyección Delictiva MEPOY».
// Reemplaza la ventana de fuentes + el modal de listas por un recorrido
// guiado: Fuentes → Cobertura → Unidades → Periodo y delitos →
// Componentes → Resumen (y generación del PDF). Todo el estado vive en UN
// reducer (no se pierde nada al ir y volver). Las cifras salen de
// useMicrogerencia (en vivo, mismas fórmulas de siempre) y el PDF del
// mismo generador de siempre (generarPdfMicrogerencia), ahora con la
// selección exacta del asistente.
// ───────────────────────────────────────────────────────────────────────

type Cobertura = 'general' | 'distrito1' | 'distrito2' | 'estaciones' | 'zonas';
type Componente =
  | 'kpi' | 'trimestral' | 'mensual' | 'territorial' | 'top10' | 'estaciones' | 'zonas'
  | 'hallazgos' | 'proyeccion' | 'calidad' | 'tablas' | 'mapas' | 'resumenOperatividad' | 'resumenRnmc';

interface EstadoAsistente {
  paso: number; // 0..5
  fuentes: FuenteMicrogerencia[];
  cobertura: Cobertura;
  estaciones: string[]; // códigos del dataset (E-Norte…)
  zonas: string[]; // clave `${estacion}|${zona}`
  cais: string[]; // clave `${estacion}|${cai}`
  barrios: string[];
  anio: string;
  fechaInicial: string;
  fechaFinal: string;
  delitos: string[];
  componentes: Componente[];
  topBarrios: 3 | 5;
}

type Accion =
  | { tipo: 'paso'; paso: number }
  | { tipo: 'fuente'; fuente: FuenteMicrogerencia }
  | { tipo: 'cobertura'; cobertura: Cobertura }
  | { tipo: 'lista'; campo: 'estaciones' | 'zonas' | 'cais' | 'barrios' | 'delitos'; valores: string[] }
  | { tipo: 'alternar'; campo: 'estaciones' | 'zonas' | 'cais' | 'barrios' | 'delitos'; valor: string }
  | { tipo: 'componente'; componente: Componente }
  | { tipo: 'periodo'; anio?: string; fechaInicial?: string; fechaFinal?: string }
  | { tipo: 'topBarrios'; n: 3 | 5 };

const TODAS_ESTACIONES = [...ESTACIONES_DISTRITO_1, ...ESTACIONES_DISTRITO_2] as string[];
const ETIQUETA_ESTACION: Record<string, string> = {
  'E-Norte': 'Est. Norte', 'E-Sur': 'Est. Sur', 'E-Timbio': 'Est. Timbío', 'E-Coconuco': 'Est. Coconuco', 'E-Sotara': 'Est. Paispamba',
};
const etiquetaEstacion = (codigo: string) => ETIQUETA_ESTACION[codigo] ?? codigo;
const etiquetaZona = (zona: string) => nombreVisibleUnidad(zona).replace(/^Z\. Atención/i, 'Z. Atención');
const clave = (estacion: string, valor: string) => `${estacion}|${valor}`;
const valorDeClave = (k: string) => k.slice(k.indexOf('|') + 1);
const estacionDeClave = (k: string) => k.slice(0, k.indexOf('|'));

/** Estaciones que comprende la cobertura (configuración real de distritos de useMicrogerencia). */
function estacionesDeCobertura(e: Pick<EstadoAsistente, 'cobertura' | 'estaciones' | 'zonas'>): string[] {
  switch (e.cobertura) {
    case 'general': return TODAS_ESTACIONES;
    case 'distrito1': return [...ESTACIONES_DISTRITO_1];
    case 'distrito2': return [...ESTACIONES_DISTRITO_2];
    case 'estaciones': return e.estaciones;
    case 'zonas': return Array.from(new Set(e.zonas.map(estacionDeClave)));
  }
}

/**
 * Al cambiar la cobertura (o las estaciones/zonas) se retiran SOLO las
 * unidades que ya no corresponden; fuentes, periodo, delitos, barrios y
 * componentes no se tocan.
 */
function depurarDependientes(e: EstadoAsistente): EstadoAsistente {
  const zonas = e.cobertura === 'zonas' ? e.zonas : [];
  const estaciones = e.cobertura === 'zonas' ? [] : e.estaciones.filter((s) => (e.cobertura === 'general' || e.cobertura === 'estaciones' ? TODAS_ESTACIONES : estacionesDeCobertura(e)).includes(s));
  const base = new Set(e.cobertura === 'zonas' ? [] : e.cobertura === 'estaciones' ? estaciones : estacionesDeCobertura(e));
  return { ...e, estaciones, zonas, cais: e.cais.filter((c) => base.has(estacionDeClave(c))) };
}

function reducir(e: EstadoAsistente, a: Accion): EstadoAsistente {
  switch (a.tipo) {
    case 'paso': return { ...e, paso: a.paso };
    case 'fuente': {
      const fuentes = e.fuentes.includes(a.fuente) ? e.fuentes.filter((f) => f !== a.fuente) : [...e.fuentes, a.fuente];
      // Los resúmenes de una fuente se agregan/quitan con la fuente.
      let componentes = e.componentes;
      if (a.fuente === 'operatividad') componentes = fuentes.includes('operatividad') ? Array.from(new Set([...componentes, 'resumenOperatividad' as const])) : componentes.filter((c) => c !== 'resumenOperatividad');
      if (a.fuente === 'rnmc') componentes = fuentes.includes('rnmc') ? Array.from(new Set([...componentes, 'resumenRnmc' as const])) : componentes.filter((c) => c !== 'resumenRnmc');
      return { ...e, fuentes, componentes };
    }
    case 'cobertura': return depurarDependientes({ ...e, cobertura: a.cobertura });
    case 'lista': {
      const sig = { ...e, [a.campo]: a.valores };
      return a.campo === 'estaciones' || a.campo === 'zonas' ? depurarDependientes(sig) : sig;
    }
    case 'alternar': {
      const actual = e[a.campo];
      const valores = actual.includes(a.valor) ? actual.filter((v) => v !== a.valor) : [...actual, a.valor];
      const sig = { ...e, [a.campo]: valores };
      return a.campo === 'estaciones' || a.campo === 'zonas' ? depurarDependientes(sig) : sig;
    }
    case 'componente':
      return { ...e, componentes: e.componentes.includes(a.componente) ? e.componentes.filter((c) => c !== a.componente) : [...e.componentes, a.componente] };
    case 'periodo': return { ...e, ...(a.anio !== undefined ? { anio: a.anio } : {}), ...(a.fechaInicial !== undefined ? { fechaInicial: a.fechaInicial } : {}), ...(a.fechaFinal !== undefined ? { fechaFinal: a.fechaFinal } : {}) };
    case 'topBarrios': return { ...e, topBarrios: a.n };
  }
}

const PASOS = ['Fuentes', 'Cobertura', 'Unidades', 'Periodo y delitos', 'Componentes', 'Resumen'];

const FUENTES: { id: FuenteMicrogerencia; nombre: string; descripcion: string; icono: typeof BarChart3; disponible: boolean }[] = [
  { id: 'delictividad', nombre: 'Delictividad', descripcion: 'Análisis del comportamiento delictivo, comparativos, tendencias y proyección.', icono: BarChart3, disponible: true },
  { id: 'operatividad', nombre: 'Operatividad', descripcion: 'Resultados operativos, capturas, incautaciones y demás actividades institucionales.', icono: ShieldCheck, disponible: true },
  { id: 'rnmc', nombre: 'RNMC', descripcion: 'Registro Nacional de Medidas Correctivas (comportamientos contrarios a la convivencia).', icono: Users, disponible: true },
  { id: 'irisp1', nombre: 'IRISP1', descripcion: 'Integración de información de seguridad.', icono: Building2, disponible: false },
  { id: 'macri', nombre: 'MACRI', descripcion: 'Análisis de criminalidad avanzada.', icono: ClipboardList, disponible: false },
];

const COBERTURAS: { id: Cobertura; nombre: string; descripcion: string; icono: typeof BarChart3 }[] = [
  { id: 'general', nombre: 'MEPOY General', descripcion: 'Toda la jurisdicción', icono: Building2 },
  { id: 'distrito1', nombre: 'Distrito Uno', descripcion: `${ESTACIONES_DISTRITO_1.map(etiquetaEstacion).join(' y ')}`, icono: Layers },
  { id: 'distrito2', nombre: 'Distrito Dos', descripcion: `${ESTACIONES_DISTRITO_2.map(etiquetaEstacion).join(', ').replace(/, ([^,]*)$/, ' y $1')}`, icono: Layers },
  { id: 'estaciones', nombre: 'Estaciones', descripcion: 'Seleccione una o varias estaciones', icono: ShieldCheck },
  { id: 'zonas', nombre: 'Zonas de Atención', descripcion: 'Unidades territoriales operativas', icono: MapPin },
];

const COMPONENTES: { id: Componente; nombre: string; descripcion: string; requiere?: FuenteMicrogerencia; icono: typeof BarChart3 }[] = [
  { id: 'kpi', nombre: 'Indicadores KPI', descripcion: 'Totales, diferencia y variación de cada unidad.', icono: LayoutGrid },
  { id: 'trimestral', nombre: 'Comparativo trimestral', descripcion: 'Cuatro trimestres, año anterior vs. actual.', icono: BarChart3 },
  { id: 'mensual', nombre: 'Distribución mensual', descripcion: 'Los 12 meses con su diferencia.', icono: CalendarDays },
  { id: 'territorial', nombre: 'Distribución territorial', descripcion: 'Barrios más afectados (Top 3 o Top 5).', icono: MapPin },
  { id: 'mapas', nombre: 'Mapas', descripcion: 'Mapa de calor real de cada unidad.', icono: Layers },
  { id: 'top10', nombre: 'Top 10 delitos', descripcion: 'Los 10 delitos con más casos.', icono: ShieldCheck },
  { id: 'estaciones', nombre: 'Análisis por estaciones', descripcion: 'Una hoja por cada estación de la cobertura.', icono: Building2 },
  { id: 'zonas', nombre: 'Análisis por zonas de atención', descripcion: 'Una hoja por cada zona de la cobertura.', icono: MapPin },
  { id: 'hallazgos', nombre: 'Principales hallazgos', descripcion: 'Análisis ejecutivo redactado con las cifras.', icono: FileText },
  { id: 'proyeccion', nombre: 'Proyección delictiva', descripcion: 'Proyectado al cierre y frente al año anterior.', icono: ArrowRight },
  { id: 'calidad', nombre: 'Calidad de datos', descripcion: 'Nota sobre meses sin cierre y corte.', icono: Info },
  { id: 'tablas', nombre: 'Tablas estadísticas', descripcion: 'Tabla consolidada de todas las unidades.', icono: ClipboardList },
  { id: 'resumenOperatividad', nombre: 'Resúmenes de Operatividad', descripcion: 'Tarjetas y detalle de Operatividad.', requiere: 'operatividad', icono: Gavel },
  { id: 'resumenRnmc', nombre: 'Resúmenes de RNMC', descripcion: 'Hoja resumen de comparendos.', requiere: 'rnmc', icono: Users },
];
const etiquetaComponente = (c: Componente) => COMPONENTES.find((x) => x.id === c)?.nombre ?? c;

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
export function AsistenteMicrogerencia({ onCerrar }: { onCerrar: () => void }) {
  const { registrosVisibles, filters, filteredOperatividadRecords } = useData();

  const [e, despachar] = useReducer(reducir, undefined, (): EstadoAsistente => ({
    paso: 0,
    fuentes: ['delictividad'],
    cobertura: 'general',
    estaciones: [], zonas: [], cais: [], barrios: [],
    // Arranca con el periodo y los delitos que ya estén filtrados en el dashboard.
    anio: filters.anio.length === 1 ? filters.anio[0] : '',
    fechaInicial: filters.fechaInicial ?? '',
    fechaFinal: filters.fechaFinal ?? '',
    delitos: [...filters.delito],
    componentes: ['kpi', 'trimestral', 'mensual', 'territorial', 'mapas', 'top10', 'hallazgos', 'proyeccion', 'calidad'],
    topBarrios: 5,
  }));

  const ajustes = useMemo<AjustesMicrogerencia>(() => ({
    delitos: e.delitos, anio: e.anio, fechaInicial: e.fechaInicial || null, fechaFinal: e.fechaFinal || null, barrios: e.barrios,
  }), [e.delitos, e.anio, e.fechaInicial, e.fechaFinal, e.barrios]);
  const datos = useMicrogerencia(ajustes);
  const datosOperatividad = useMicrogerenciaOperatividad();

  // Catálogos reales (de los datos cargados, nunca inventados).
  const catalogo = useMemo(() => {
    const delitos = new Map<string, number>();
    const anios = new Set<number>();
    const barriosPorEstacion = new Map<string, Map<string, { casos: number; zonas: Set<string>; cais: Set<string> }>>();
    for (const r of registrosVisibles) {
      if (r.delito && r.delito !== 'NO REPORTADO') delitos.set(r.delito, (delitos.get(r.delito) ?? 0) + 1);
      if (r.anio) anios.add(r.anio);
      const b = (r.barrioHecho ?? '').trim();
      if (!b || /^no reportad/i.test(b) || !TODAS_ESTACIONES.includes(r.estacion)) continue;
      let m = barriosPorEstacion.get(r.estacion);
      if (!m) { m = new Map(); barriosPorEstacion.set(r.estacion, m); }
      let info = m.get(b);
      if (!info) { info = { casos: 0, zonas: new Set(), cais: new Set() }; m.set(b, info); }
      info.casos++;
      if (r.cuadrante && r.cuadrante !== 'No Reportado') info.zonas.add(r.cuadrante);
      if (r.cai && r.cai !== 'No Reportado') info.cais.add(r.cai);
    }
    return {
      delitos: Array.from(delitos.keys()).sort((a, b) => a.localeCompare(b, 'es')),
      anios: Array.from(anios).sort((a, b) => b - a),
      barriosPorEstacion,
    };
  }, [registrosVisibles]);

  // Zonas y CAI reales por estación (del árbol de useMicrogerencia).
  const zonasPorEstacion = useMemo(() => {
    const m = new Map<string, NodoMicrogerencia[]>();
    for (const z of datos?.zonas ?? []) {
      if (!z.estacion) continue;
      m.set(z.estacion, [...(m.get(z.estacion) ?? []), z]);
    }
    return m;
  }, [datos]);
  const caisPorEstacion = useMemo(() => {
    const m = new Map<string, NodoMicrogerencia[]>();
    if (!datos) return m;
    for (const est of [...datos.distrito1.hijos, ...datos.distrito2.hijos]) {
      const cais = est.hijos.filter((h) => h.tipo === 'cai');
      if (est.estacion && cais.length) m.set(est.estacion, cais);
    }
    return m;
  }, [datos]);

  const estacionesActivas = estacionesDeCobertura(e);
  const nodos = useMemo(() => (datos ? nodosDelInforme(datos, e) : []), [datos, e]);

  // Validación de cada paso.
  const errores: (string | null)[] = [
    e.fuentes.length === 0 ? 'Seleccione al menos una fuente.' : null,
    null,
    e.cobertura === 'estaciones' && e.estaciones.length === 0 ? 'Seleccione al menos una estación.'
      : e.cobertura === 'zonas' && e.zonas.length === 0 ? 'Seleccione al menos una zona de atención.' : null,
    e.fechaInicial && e.fechaFinal && e.fechaInicial > e.fechaFinal ? 'La fecha inicial no puede ser posterior a la fecha final.' : null,
    e.componentes.filter((c) => componenteDisponible(c, e.fuentes)).length === 0 ? 'Seleccione al menos un componente.' : null,
    !datos && (e.fuentes.includes('delictividad') || e.fuentes.includes('operatividad')) ? 'No hay datos suficientes para el periodo elegido.' : null,
  ];
  const [intento, setIntento] = useState(false);
  const errorActual = errores[e.paso];

  const [generando, setGenerando] = useState<'' | 'generando' | 'listo' | 'error'>('');
  const [mensajeGeneracion, setMensajeGeneracion] = useState('');

  function irA(paso: number) {
    // Hacia atrás siempre; hacia adelante solo si los pasos intermedios son válidos.
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

  async function generarPdf() {
    if (!datos && !e.fuentes.includes('rnmc')) return;
    setGenerando('generando');
    setMensajeGeneracion('Preparando mapas y tarjetas…');
    try {
      const comp = new Set(e.componentes.filter((c) => componenteDisponible(c, e.fuentes)));
      const conDelictividad = e.fuentes.includes('delictividad');
      const nodosDelictividad = conDelictividad ? nodos : [];
      const delitosMapa = e.delitos.length ? e.delitos : null;
      // Delictividad: una lámina ejecutiva por unidad (índice + secciones).
      const seccionesLam = datos && nodosDelictividad.length ? seccionesDelInforme(datos, nodosDelictividad) : [];
      const usarLaminas = seccionesLam.length > 0;
      const imagenes = !usarLaminas && comp.has('mapas') && datos && nodosDelictividad.length ? await imagenesParaNodos(nodosDelictividad, delitosMapa, datos.actualInicio, datos.actualFin) : new Map<string, string>();
      let nodosFinales = [...nodosDelictividad];
      let imagenesFinales = imagenes;
      if (e.fuentes.includes('operatividad') && comp.has('resumenOperatividad')) {
        setMensajeGeneracion('Agregando Operatividad…');
        const grupo = await grupoOperatividad(datosOperatividad, nodos.map((n) => n.nombre));
        if (grupo) {
          nodosFinales = [...nodosFinales, ...grupo.nodos];
          if (comp.has('mapas')) imagenesFinales = new Map([...imagenesFinales, ...grupo.imagenes]);
        }
      }
      const extras: SeccionExtraMicrogerencia[] = [];
      if (comp.has('tablas') && datos && nodosDelictividad.length) extras.push(seccionTablaConsolidada(nodosDelictividad, datos.anioActual, datos.anioAnterior));
      if (e.fuentes.includes('operatividad') && comp.has('resumenOperatividad')) {
        const detalle = paginaDetalleOperatividad(filteredOperatividadRecords);
        if (detalle) extras.push(detalle);
      }
      if (e.fuentes.includes('rnmc') && comp.has('resumenRnmc')) {
        setMensajeGeneracion('Agregando RNMC…');
        const rnmc = await seccionRnmc();
        if (rnmc) extras.push(rnmc);
      }
      if (nodosFinales.length === 0 && extras.length === 0) throw new Error('No hay contenido para el informe con esta selección.');
      const corte = datos?.fechaCorte ?? datos?.actualFin ?? new Date().toISOString().slice(0, 10);
      const nombreArchivo = `Microgerencia_${tituloCobertura(e).replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_')}_${corte}.pdf`;
      const opcionesAnexos: Partial<OpcionesPdfMicrogerencia> = {
        metricas: comp.has('kpi'), proyeccion: comp.has('proyeccion'), trimestres: comp.has('trimestral'), meses: comp.has('mensual'),
        delitos: comp.has('top10'), mapa: comp.has('mapas'), topBarrios: comp.has('territorial') ? e.topBarrios : 0,
        hallazgos: comp.has('hallazgos'), calidad: comp.has('calidad'),
        anioActual: datos?.anioActual, anioAnterior: datos?.anioAnterior, fechaCorte: corte,
      };
      if (usarLaminas && datos) {
        const laminas = await capturarLaminas(datos, seccionesLam, e.topBarrios, e.barrios, (i, n, u) => setMensajeGeneracion(`Lámina ${i} de ${n}: ${u}…`));
        setMensajeGeneracion('Armando el PDF…');
        const nodosAnexo = nodosFinales.filter((n) => !nodosDelictividad.includes(n));
        const r = await generarPdfTerritorial({
          titulo: tituloCobertura(e), ficha: fichaInforme(e, datos), secciones: seccionesLam, laminas,
          anexos: { nodos: nodosAnexo, imagenes: imagenesFinales, extras, opciones: opcionesAnexos },
          nombreArchivo,
        });
        setGenerando('listo');
        setMensajeGeneracion(`PDF generado: ${r.paginas} página(s) — índice, ${r.laminas} lámina(s) por unidad${nodosAnexo.length + extras.length ? ` y ${nodosAnexo.length + extras.length} anexo(s)` : ''}${r.omitidas.length ? `. Sin información suficiente: ${r.omitidas.join(', ')}` : ''}.`);
        return;
      }
      setMensajeGeneracion('Generando el PDF…');
      await generarPdfMicrogerencia(nodosFinales, tituloCobertura(e), imagenesFinales, extras, {
        metricas: comp.has('kpi'),
        proyeccion: comp.has('proyeccion'),
        trimestres: comp.has('trimestral'),
        meses: comp.has('mensual'),
        delitos: comp.has('top10'),
        mapa: comp.has('mapas'),
        topBarrios: comp.has('territorial') ? e.topBarrios : 0,
        hallazgos: comp.has('hallazgos'),
        calidad: comp.has('calidad'),
        anioActual: datos?.anioActual, anioAnterior: datos?.anioAnterior, fechaCorte: corte,
        ficha: fichaInforme(e, datos),
      }, `Microgerencia_${tituloCobertura(e).replace(/[^\wÁÉÍÓÚÑáéíóúñ]+/g, '_')}_${corte}.pdf`);
      setGenerando('listo');
      setMensajeGeneracion(`PDF generado: ${nodosFinales.length} hoja(s) de unidades${extras.length ? ` y ${extras.length} hoja(s) adicionales` : ''}.`);
    } catch (err) {
      setGenerando('error');
      setMensajeGeneracion(err instanceof Error ? err.message : 'No se pudo generar el PDF.');
    }
  }

  const ultimo = e.paso === PASOS.length - 1;

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
                  {i < PASOS.length - 1 && <span className="hidden h-px w-4 bg-slate-200 lg:block" />}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* CUERPO: panel principal + resumen */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <main className="min-w-0 flex-1 px-4 py-4 sm:px-5 lg:overflow-y-auto">
            {e.paso === 0 && <PasoFuentes e={e} despachar={despachar} />}
            {e.paso === 1 && <PasoCobertura e={e} despachar={despachar} />}
            {e.paso === 2 && (
              <PasoUnidades e={e} despachar={despachar} zonasPorEstacion={zonasPorEstacion} caisPorEstacion={caisPorEstacion} barriosPorEstacion={catalogo.barriosPorEstacion} estacionesActivas={estacionesActivas} />
            )}
            {e.paso === 3 && <PasoPeriodo e={e} despachar={despachar} anios={catalogo.anios} delitos={catalogo.delitos} datos={datos} />}
            {e.paso === 4 && <PasoComponentes e={e} despachar={despachar} />}
            {e.paso === 5 && <PasoResumen e={e} irA={irA} datos={datos} nodos={nodos} generando={generando} mensaje={mensajeGeneracion} />}
            {intento && errorActual && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700"><AlertCircle size={15} /> {errorActual}</p>
            )}
          </main>
          <PanelResumen e={e} despachar={despachar} datos={datos} />
        </div>

        {/* NAVEGACIÓN */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <button type="button" onClick={onCerrar} disabled={generando === 'generando'} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-[#10233f] hover:border-slate-400 disabled:opacity-40"><X size={15} /> Cancelar</button>
          <button type="button" onClick={() => irA(e.paso - 1)} disabled={e.paso === 0 || generando === 'generando'} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-[13px] font-semibold text-[#10233f] hover:border-slate-400 disabled:opacity-40"><ArrowLeft size={15} /> Anterior</button>
          {!ultimo ? (
            <button type="button" onClick={() => { if (errorActual) { setIntento(true); return; } irA(e.paso + 1); }} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5f57] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#116762]">Continuar <ArrowRight size={15} /></button>
          ) : (
            <button type="button" onClick={() => { if (errores.some(Boolean)) { const i = errores.findIndex(Boolean); setIntento(true); despachar({ tipo: 'paso', paso: i }); return; } void generarPdf(); }} disabled={generando === 'generando'} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5f57] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#116762] disabled:opacity-60">
              {generando === 'generando' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {generando === 'listo' ? 'Generar de nuevo' : 'Generar PDF'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Selección → nodos del PDF ──────────────────────────────────────────
function componenteDisponible(c: Componente, fuentes: FuenteMicrogerencia[]): boolean {
  const def = COMPONENTES.find((x) => x.id === c);
  if (def?.requiere) return fuentes.includes(def.requiere);
  return fuentes.includes('delictividad') || fuentes.includes('operatividad');
}

function nodosDelInforme(datos: DatosMicrogerencia, e: EstadoAsistente): NodoMicrogerencia[] {
  const estaciones = [...datos.distrito1.hijos, ...datos.distrito2.hijos];
  const estacionNodo = (codigo: string) => estaciones.find((n) => n.estacion === codigo);
  const zonasDe = (codigos: string[]) => (datos.zonas ?? []).filter((z) => z.estacion && codigos.includes(z.estacion));
  const caisElegidos = e.cais.map((k) => {
    const est = estacionNodo(estacionDeClave(k));
    return est?.hijos.find((h) => h.tipo === 'cai' && h.nombre === valorDeClave(k));
  }).filter((n): n is NodoMicrogerencia => !!n);
  const conEstaciones = e.componentes.includes('estaciones');
  const conZonas = e.componentes.includes('zonas');
  const salida: NodoMicrogerencia[] = [];
  const agregar = (n?: NodoMicrogerencia) => { if (n && !salida.includes(n)) salida.push(n); };

  if (e.cobertura === 'general' || e.cobertura === 'distrito1' || e.cobertura === 'distrito2') {
    const raiz = e.cobertura === 'general' ? datos.general : e.cobertura === 'distrito1' ? datos.distrito1 : datos.distrito2;
    const codigos = estacionesDeCobertura(e);
    agregar(raiz);
    // Estaciones: todas las de la cobertura si se pidió el análisis por estaciones; si no, solo las elegidas a mano.
    const ests = conEstaciones ? codigos : e.estaciones.filter((s) => codigos.includes(s));
    ests.forEach((s) => agregar(estacionNodo(s)));
    caisElegidos.forEach(agregar);
    if (conZonas) zonasDe(codigos).forEach(agregar);
  } else if (e.cobertura === 'estaciones') {
    e.estaciones.forEach((s) => agregar(estacionNodo(s)));
    caisElegidos.forEach(agregar);
    if (conZonas) zonasDe(e.estaciones).forEach(agregar);
  } else {
    for (const k of e.zonas) {
      const z = (datos.zonas ?? []).find((n) => n.estacion === estacionDeClave(k) && n.nombre === valorDeClave(k));
      agregar(z);
    }
  }
  // Barrios elegidos: cada uno con su propia sección.
  (datos.barriosUnidad ?? []).forEach(agregar);
  return salida;
}

function tituloCobertura(e: EstadoAsistente): string {
  switch (e.cobertura) {
    case 'general': return 'MEPOY General';
    case 'distrito1': return 'Distrito Uno';
    case 'distrito2': return 'Distrito Dos';
    case 'estaciones': return e.estaciones.length === 1 ? etiquetaEstacion(e.estaciones[0]) : `${e.estaciones.length} estaciones`;
    case 'zonas': return e.zonas.length === 1 ? etiquetaZona(valorDeClave(e.zonas[0])) : `${e.zonas.length} zonas de atención`;
  }
}

function fichaInforme(e: EstadoAsistente, datos: DatosMicrogerencia | null): string[] {
  const lineas = [
    `Fuentes: ${e.fuentes.map((f) => FUENTES.find((x) => x.id === f)?.nombre ?? f).join(', ')}  ·  Cobertura: ${tituloCobertura(e)}`,
  ];
  const unidades = [
    e.estaciones.length ? `Estaciones: ${e.estaciones.map(etiquetaEstacion).join(', ')}` : '',
    e.zonas.length ? `Zonas: ${e.zonas.map((z) => etiquetaZona(valorDeClave(z))).join(', ')}` : '',
    e.cais.length ? `CAI: ${e.cais.map(valorDeClave).join(', ')}` : '',
  ].filter(Boolean);
  if (unidades.length) lineas.push(unidades.join('  ·  '));
  lineas.push(`Barrios: ${e.barrios.length ? e.barrios.join(', ') : 'todos'}`);
  if (datos) lineas.push(`Periodo: ${datos.periodo}  ·  Corte: ${fechaLargaIso(datos.fechaCorte ?? datos.actualFin)}`);
  lineas.push(`Delitos: ${e.delitos.length ? e.delitos.join(', ') : 'todos'}`);
  return lineas.map((l) => (l.length > 190 ? `${l.slice(0, 187)}…` : l));
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

function PasoFuentes({ e, despachar }: PropsPaso) {
  return (
    <div>
      <TituloPaso n={1} titulo="Selecciona las fuentes" sub="Elige la(s) fuente(s) de información que deseas incluir en el informe." />
      <div className="space-y-2">
        {FUENTES.map((f) => {
          const activo = e.fuentes.includes(f.id);
          const Icono = f.icono;
          return (
            <button key={f.id} type="button" disabled={!f.disponible} onClick={() => despachar({ tipo: 'fuente', fuente: f.id })} aria-pressed={activo}
              className={`flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left transition-colors ${!f.disponible ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60' : activo ? 'border-[#159089] bg-[#eaf6f1]' : 'border-slate-200 bg-white hover:border-[#159089]/50'}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${activo ? 'bg-[#0f5f57] text-white' : 'bg-slate-100 text-[#0f5f57]'}`}><Icono size={22} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[#10233f]">{f.nombre}</span>
                <span className="block text-[12.5px] leading-snug text-slate-600">{f.descripcion}</span>
              </span>
              {f.disponible ? <Marca activo={activo} /> : <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-500">Próximamente</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PasoCobertura({ e, despachar }: PropsPaso) {
  const info: Record<Cobertura, { titulo: string; texto: string; estaciones: string[] }> = {
    general: { titulo: 'MEPOY General — Incluye toda la jurisdicción MEPOY', texto: 'El informe consolida la información de las cinco estaciones de la Policía Metropolitana de Popayán.', estaciones: TODAS_ESTACIONES },
    distrito1: { titulo: `Distrito Uno — ${ESTACIONES_DISTRITO_1.map(etiquetaEstacion).join(' y ')}`, texto: 'Incluye la información territorial y delictiva de las estaciones que conforman el Distrito Uno.', estaciones: [...ESTACIONES_DISTRITO_1] },
    distrito2: { titulo: `Distrito Dos — ${ESTACIONES_DISTRITO_2.map(etiquetaEstacion).join(', ').replace(/, ([^,]*)$/, ' y $1')}`, texto: 'Incluye la información territorial y delictiva de las estaciones que conforman el Distrito Dos.', estaciones: [...ESTACIONES_DISTRITO_2] },
    estaciones: { titulo: 'Estaciones', texto: 'En el siguiente paso elegirá una, varias o todas las estaciones.', estaciones: TODAS_ESTACIONES },
    zonas: { titulo: 'Zonas de Atención', texto: 'En el siguiente paso elegirá las zonas de atención, agrupadas por estación.', estaciones: TODAS_ESTACIONES },
  };
  const actual = info[e.cobertura];
  return (
    <div>
      <TituloPaso n={2} titulo="Selecciona la cobertura" sub="Elige la cobertura territorial principal del informe (selección única)." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {COBERTURAS.map((c) => {
          const activo = e.cobertura === c.id;
          const Icono = c.icono;
          return (
            <button key={c.id} type="button" onClick={() => despachar({ tipo: 'cobertura', cobertura: c.id })} aria-pressed={activo}
              className={`relative flex flex-col items-center rounded-xl border-2 px-2 pb-3 pt-4 text-center transition-colors ${activo ? 'border-[#159089] bg-[#eaf6f1]' : 'border-slate-200 bg-white hover:border-[#159089]/50'}`}>
              {activo && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[5px] bg-[#159089] text-white"><Check size={13} strokeWidth={3.5} /></span>}
              <Icono size={28} className="text-[#0f5f57]" />
              <span className="mt-1.5 text-[14px] font-bold leading-tight text-[#10233f]">{c.nombre}</span>
              <span className="mt-1 text-[11.5px] leading-snug text-slate-500">{c.descripcion}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
        <div className="flex items-start gap-3">
          <Layers size={26} className="mt-0.5 shrink-0 text-[#0f5f57]" />
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#10233f]">{actual.titulo}</p>
            <p className="text-[12.5px] text-slate-600">{actual.texto}</p>
          </div>
        </div>
        {(e.cobertura === 'general' || e.cobertura === 'distrito1' || e.cobertura === 'distrito2') && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {actual.estaciones.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-[#10233f]"><ShieldCheck size={15} className="text-[#0f5f57]" /> {etiquetaEstacion(s)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PasoUnidades({ e, despachar, zonasPorEstacion, caisPorEstacion, barriosPorEstacion, estacionesActivas }: PropsPaso & {
  zonasPorEstacion: Map<string, NodoMicrogerencia[]>;
  caisPorEstacion: Map<string, NodoMicrogerencia[]>;
  barriosPorEstacion: Map<string, Map<string, { casos: number; zonas: Set<string>; cais: Set<string> }>>;
  estacionesActivas: string[];
}) {
  const [qEst, setQEst] = useState('');
  const [qZona, setQZona] = useState('');
  const [qBarrio, setQBarrio] = useState('');
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set([TODAS_ESTACIONES[0]]));
  const [abiertasBarrio, setAbiertasBarrio] = useState<Set<string>>(new Set());
  const alternarAbierta = (s: string, set: Set<string>, fn: (v: Set<string>) => void) => { const n = new Set(set); if (n.has(s)) n.delete(s); else n.add(s); fn(n); };

  const muestraEstaciones = e.cobertura !== 'zonas';
  const estacionesDisponibles = e.cobertura === 'general' || e.cobertura === 'estaciones' ? TODAS_ESTACIONES : e.cobertura === 'distrito1' ? [...ESTACIONES_DISTRITO_1] : e.cobertura === 'distrito2' ? [...ESTACIONES_DISTRITO_2] : [];
  const tituloEstaciones = e.cobertura === 'estaciones' ? 'Seleccione las estaciones' : e.cobertura === 'general' ? 'Toda la jurisdicción · agregar hojas de estaciones específicas (opcional)' : `Estaciones del ${e.cobertura === 'distrito1' ? 'Distrito Uno' : 'Distrito Dos'} · agregar hojas por estación (opcional)`;

  // CAI: solo donde existen en los datos (Norte y Sur), dentro de la cobertura.
  const estacionesConCai = e.cobertura === 'zonas' ? [] : estacionesActivas.filter((s) => (caisPorEstacion.get(s) ?? []).length > 0);
  // Barrios: de las estaciones de la cobertura; si hay zonas o CAI elegidos, solo los que tienen relación real con ellos.
  const filtroZona = new Set(e.zonas.map(valorDeClave));
  const filtroCai = new Set(e.cais.map(valorDeClave));
  const barriosDe = (s: string) => Array.from(barriosPorEstacion.get(s) ?? new Map())
    .filter(([, info]) => (filtroZona.size === 0 || [...info.zonas].some((z) => filtroZona.has(z))) && (filtroCai.size === 0 || [...info.cais].some((c) => filtroCai.has(c))))
    .sort((a, b) => b[1].casos - a[1].casos);

  return (
    <div className="space-y-4">
      <TituloPaso n={3} titulo="Selecciona las unidades" sub={e.cobertura === 'zonas' ? 'Elige las zonas de atención, agrupadas por estación.' : 'Unidades territoriales que se incluirán en el informe.'} />

      {muestraEstaciones && (
        <section>
          <p className="mb-2 text-[14px] font-bold text-[#10233f]">{tituloEstaciones}</p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Buscador valor={qEst} onCambio={setQEst} placeholder="Buscar estación…" />
            <BotonesLista contador={e.estaciones.filter((s) => estacionesDisponibles.includes(s)).length}
              onTodas={() => despachar({ tipo: 'lista', campo: 'estaciones', valores: Array.from(new Set([...e.estaciones, ...estacionesDisponibles])) })}
              onLimpiar={() => despachar({ tipo: 'lista', campo: 'estaciones', valores: e.estaciones.filter((s) => !estacionesDisponibles.includes(s)) })} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {estacionesDisponibles.filter((s) => coincide(etiquetaEstacion(s), qEst)).map((s) => {
              const activo = e.estaciones.includes(s);
              return (
                <button key={s} type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'estaciones', valor: s })} aria-pressed={activo}
                  className={`flex items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-[14px] font-bold text-[#10233f] ${activo ? 'border-[#159089] bg-[#eaf6f1]' : 'border-slate-200 bg-white hover:border-[#159089]/50'}`}>
                  <Marca activo={activo} /><ShieldCheck size={17} className="text-[#0f5f57]" /> {etiquetaEstacion(s)}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {e.cobertura === 'zonas' && (
        <section>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Buscador valor={qZona} onCambio={setQZona} placeholder="Buscar zona de atención…" />
            <BotonesLista contador={e.zonas.length}
              onTodas={() => despachar({ tipo: 'lista', campo: 'zonas', valores: TODAS_ESTACIONES.flatMap((s) => (zonasPorEstacion.get(s) ?? []).map((z) => clave(s, z.nombre))) })}
              onLimpiar={() => despachar({ tipo: 'lista', campo: 'zonas', valores: [] })} />
          </div>
          <div className="space-y-1.5">
            {TODAS_ESTACIONES.map((s) => {
              const zonas = (zonasPorEstacion.get(s) ?? []).filter((z) => coincide(`${etiquetaZona(z.nombre)} ${etiquetaEstacion(s)}`, qZona));
              const elegidas = e.zonas.filter((k) => estacionDeClave(k) === s);
              const abierta = abiertas.has(s) || !!qZona;
              const todas = zonas.length > 0 && zonas.every((z) => e.zonas.includes(clave(s, z.nombre)));
              return (
                <div key={s} className={`rounded-xl border ${elegidas.length ? 'border-[#159089]/50' : 'border-slate-200'}`}>
                  <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${elegidas.length ? 'bg-[#eaf6f1]' : 'bg-slate-50'}`}>
                    <button type="button" onClick={() => alternarAbierta(s, abiertas, setAbiertas)} className="flex flex-1 items-center gap-1.5 text-left text-[14px] font-bold text-[#10233f]" aria-expanded={abierta}>
                      {abierta ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {etiquetaEstacion(s)} <span className="font-semibold text-[#0f5f57]">({elegidas.length})</span>
                    </button>
                    {zonas.length > 0 && (
                      <button type="button" onClick={() => despachar({ tipo: 'lista', campo: 'zonas', valores: todas ? e.zonas.filter((k) => estacionDeClave(k) !== s) : Array.from(new Set([...e.zonas, ...zonas.map((z) => clave(s, z.nombre))])) })}
                        className="text-[11.5px] font-semibold text-[#0f5f57] hover:underline">{todas ? 'Quitar todas' : 'Todas las de la estación'}</button>
                    )}
                  </div>
                  {abierta && (
                    <div className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-2">
                      {zonas.length === 0 && <p className="text-[12.5px] text-slate-500">Sin zonas de atención con datos en el periodo.</p>}
                      {zonas.map((z) => {
                        const k = clave(s, z.nombre);
                        const activo = e.zonas.includes(k);
                        return (
                          <button key={k} type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'zonas', valor: k })} aria-pressed={activo} className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] text-[#10233f] hover:bg-slate-50">
                            <Marca activo={activo} /> {etiquetaZona(z.nombre)} <span className="ml-auto text-[11px] text-slate-400">{formatNumero(z.fecha2026)} casos</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {estacionesConCai.length > 0 && (
        <section>
          <p className="mb-1 text-[14px] font-bold text-[#10233f]">CAI <span className="font-normal text-slate-500">(opcional · agrega una hoja por CAI)</span></p>
          <div className="space-y-1.5">
            {estacionesConCai.map((s) => (
              <div key={s} className="flex flex-wrap items-center gap-1.5">
                <span className="w-[104px] shrink-0 text-[12.5px] font-semibold text-slate-600">{etiquetaEstacion(s)}</span>
                {(caisPorEstacion.get(s) ?? []).map((c) => {
                  const k = clave(s, c.nombre);
                  const activo = e.cais.includes(k);
                  return (
                    <button key={k} type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'cais', valor: k })} aria-pressed={activo}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-semibold ${activo ? 'border-[#159089] bg-[#eaf6f1] text-[#0f5f57]' : 'border-slate-200 bg-white text-[#10233f] hover:border-[#159089]/50'}`}>
                      <Marca activo={activo} /> {c.nombre}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-[14px] font-bold text-[#10233f]">Barrios <span className="font-normal text-slate-500">(opcional · sin selección se incluyen todos, como siempre)</span></p>
        {(filtroZona.size > 0 || filtroCai.size > 0) && <p className="mb-1 text-[11.5px] text-slate-500">Se muestran solo los barrios con casos en las zonas o CAI elegidos.</p>}
        <div className="my-2 flex flex-wrap items-center gap-2">
          <Buscador valor={qBarrio} onCambio={setQBarrio} placeholder="Buscar barrio…" />
          <button type="button" onClick={() => despachar({ tipo: 'lista', campo: 'barrios', valores: [] })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#10233f] hover:border-rose-300"><Trash2 size={13} /> Limpiar</button>
          <span className="rounded-full bg-[#e3f2ef] px-2 py-0.5 text-[11.5px] font-bold text-[#0f5f57]">{e.barrios.length ? `${e.barrios.length} seleccionado${e.barrios.length === 1 ? '' : 's'}` : 'Todos'}</span>
        </div>
        <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
          {estacionesActivas.map((s) => {
            const lista = barriosDe(s).filter(([b]) => coincide(b, qBarrio));
            if (lista.length === 0) return null;
            const abierta = abiertasBarrio.has(s) || !!qBarrio;
            const todos = lista.every(([b]) => e.barrios.includes(b));
            return (
              <div key={s} className="rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
                  <button type="button" onClick={() => alternarAbierta(s, abiertasBarrio, setAbiertasBarrio)} className="flex flex-1 items-center gap-1.5 text-left text-[13px] font-bold text-[#10233f]" aria-expanded={abierta}>
                    {abierta ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {etiquetaEstacion(s)} <span className="font-normal text-slate-500">({lista.length} barrios)</span>
                  </button>
                  <button type="button" onClick={() => despachar({ tipo: 'lista', campo: 'barrios', valores: todos ? e.barrios.filter((b) => !lista.some(([x]) => x === b)) : Array.from(new Set([...e.barrios, ...lista.map(([b]) => b)])) })}
                    className="text-[11.5px] font-semibold text-[#0f5f57] hover:underline">{todos ? 'Quitar los de la estación' : 'Todos los de la estación'}</button>
                </div>
                {abierta && (
                  <div className="grid grid-cols-1 gap-0.5 px-3 py-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {lista.slice(0, 300).map(([b, info]) => {
                      const activo = e.barrios.includes(b);
                      return (
                        <button key={b} type="button" onClick={() => despachar({ tipo: 'alternar', campo: 'barrios', valor: b })} aria-pressed={activo} className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-left text-[12.5px] text-[#10233f] hover:bg-slate-50">
                          <Marca activo={activo} /> <span className="min-w-0 flex-1 truncate">{b}</span> <span className="text-[10.5px] text-slate-400">{formatNumero(info.casos)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PasoPeriodo({ e, despachar, anios, delitos, datos }: PropsPaso & { anios: number[]; delitos: string[]; datos: DatosMicrogerencia | null }) {
  const [q, setQ] = useState('');
  const fmt = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
  const visibles = delitos.filter((d) => coincide(d, q));
  return (
    <div className="space-y-4">
      <TituloPaso n={4} titulo="Periodo y delitos" sub="Ventana de análisis y delitos que se incluirán (se respetan las reglas estadísticas del dashboard)." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-[12.5px] font-semibold text-[#10233f]">Año de análisis
          <select value={e.anio} onChange={(ev) => despachar({ tipo: 'periodo', anio: ev.target.value, fechaInicial: '', fechaFinal: '' })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-[13px]">
            <option value="">Vigencia actual (a la fecha)</option>
            {anios.map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-semibold text-[#10233f]">Fecha inicial
          <input type="date" value={e.fechaInicial} onChange={(ev) => despachar({ tipo: 'periodo', fechaInicial: ev.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
        <label className="text-[12.5px] font-semibold text-[#10233f]">Fecha final
          <input type="date" value={e.fechaFinal} onChange={(ev) => despachar({ tipo: 'periodo', fechaFinal: ev.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" />
        </label>
      </div>
      {datos && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold uppercase text-slate-500">Periodo analizado</p><p className="text-[13.5px] font-bold text-[#10233f]">{fmt(datos.actualInicio)} – {fmt(datos.actualFin)}</p></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[11px] font-bold uppercase text-slate-500">Periodo de comparación</p><p className="text-[13.5px] font-bold text-[#10233f]">Mismo periodo de {datos.anioAnterior}</p></div>
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

function PasoComponentes({ e, despachar }: PropsPaso) {
  const disponibles = COMPONENTES.filter((c) => componenteDisponible(c.id, e.fuentes));
  return (
    <div>
      <TituloPaso n={5} titulo="Componentes del informe" sub="Elige qué se incluye en cada hoja del PDF. Solo aparecen los componentes de las fuentes seleccionadas." />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {disponibles.map((c) => {
          const activo = e.componentes.includes(c.id);
          const Icono = c.icono;
          return (
            <div key={c.id} className={`rounded-xl border-2 ${activo ? 'border-[#159089] bg-[#eaf6f1]' : 'border-slate-200 bg-white'}`}>
              <button type="button" onClick={() => despachar({ tipo: 'componente', componente: c.id })} aria-pressed={activo} className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
                <Icono size={19} className="mt-0.5 shrink-0 text-[#0f5f57]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-[#10233f]">{c.nombre}</span>
                  <span className="block text-[11.5px] leading-snug text-slate-500">{c.descripcion}</span>
                </span>
                <Marca activo={activo} />
              </button>
              {c.id === 'territorial' && activo && (
                <div className="flex gap-1.5 px-3 pb-2.5">
                  {([3, 5] as const).map((n) => (
                    <button key={n} type="button" onClick={() => despachar({ tipo: 'topBarrios', n })} aria-pressed={e.topBarrios === n}
                      className={`rounded-lg border px-2.5 py-1 text-[12px] font-bold ${e.topBarrios === n ? 'border-[#159089] bg-[#159089] text-white' : 'border-slate-300 bg-white text-[#10233f]'}`}>Top {n} barrios</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PasoResumen({ e, irA, datos, nodos, generando, mensaje }: {
  e: EstadoAsistente; irA: (p: number) => void; datos: DatosMicrogerencia | null; nodos: NodoMicrogerencia[];
  generando: '' | 'generando' | 'listo' | 'error'; mensaje: string;
}) {
  const [vista, setVista] = useState<'estructura' | 'lamina'>('estructura');
  const comp = e.componentes.filter((c) => componenteDisponible(c, e.fuentes));
  const opciones = useMemo(() => (datos ? opcionesCobertura(datos) : []), [datos]);
  const primera = nodos[0];
  const rutaPrimera = primera ? opciones.find((o) => o.nodo === primera)?.ruta ?? opciones[0]?.ruta ?? '' : '';
  const [cobLamina, setCobLamina] = useState(rutaPrimera);
  const filas: { paso: number; titulo: string; valor: string }[] = [
    { paso: 0, titulo: 'Fuentes', valor: e.fuentes.map((f) => FUENTES.find((x) => x.id === f)?.nombre ?? f).join(', ') },
    { paso: 1, titulo: 'Cobertura', valor: tituloCobertura(e) },
    { paso: 2, titulo: 'Unidades territoriales', valor: [
      e.estaciones.length ? `Estaciones: ${e.estaciones.map(etiquetaEstacion).join(', ')}` : '',
      e.zonas.length ? `Zonas: ${e.zonas.map((z) => etiquetaZona(valorDeClave(z))).join(', ')}` : '',
      e.cais.length ? `CAI: ${e.cais.map(valorDeClave).join(', ')}` : '',
      `Barrios: ${e.barrios.length ? e.barrios.join(', ') : 'todos'}`,
    ].filter(Boolean).join(' · ') },
    { paso: 3, titulo: 'Periodo', valor: datos ? `${datos.periodo} · corte ${fechaLargaIso(datos.fechaCorte ?? datos.actualFin)}` : '—' },
    { paso: 3, titulo: 'Delitos', valor: e.delitos.length ? e.delitos.join(', ') : 'Todos' },
    { paso: 4, titulo: 'Componentes', valor: comp.map((c) => (c === 'territorial' ? `Top ${e.topBarrios} barrios` : etiquetaComponente(c))).join(', ') },
  ];
  return (
    <div className="space-y-3">
      <TituloPaso n={6} titulo="Resumen y vista previa" sub="Revise la configuración. Puede volver a cualquier paso para modificarla." />
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {filas.map((f) => (
          <div key={f.titulo} className="flex items-start gap-3 px-3 py-2">
            <p className="w-[150px] shrink-0 text-[12.5px] font-bold text-slate-500">{f.titulo}</p>
            <p className="min-w-0 flex-1 text-[13px] text-[#10233f]">{f.valor}</p>
            <button type="button" onClick={() => irA(f.paso)} className="shrink-0 text-[12px] font-semibold text-[#0f5f57] hover:underline">Modificar</button>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        <button type="button" onClick={() => setVista('estructura')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${vista === 'estructura' ? 'bg-[#0f5f57] text-white' : 'border border-slate-300 text-[#10233f]'}`}><ClipboardList size={14} /> Estructura del PDF</button>
        {e.fuentes.includes('delictividad') && datos && <button type="button" onClick={() => setVista('lamina')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold ${vista === 'lamina' ? 'bg-[#0f5f57] text-white' : 'border border-slate-300 text-[#10233f]'}`}><Eye size={14} /> Lámina ejecutiva</button>}
      </div>

      {vista === 'estructura' ? (
        <ol className="space-y-1.5" data-estructura-pdf>
          {e.fuentes.includes('delictividad') && nodos.map((n, i) => (
            <li key={`${n.nombre}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e3f2ef] text-[11px] font-bold text-[#0f5f57]">{i + 1}</span>
              <span className="min-w-0 flex-1 font-bold text-[#10233f]">{nombreVisibleUnidad(n.nombre)}</span>
              <span className="text-slate-500">{datos?.anioAnterior}: <strong className="text-[#10233f]">{formatNumero(n.fecha2025)}</strong></span>
              <span className="text-slate-500">{datos?.anioActual}: <strong className="text-[#10233f]">{formatNumero(n.fecha2026)}</strong></span>
              <span className={n.dif > 0 ? 'font-bold text-rose-600' : n.dif < 0 ? 'font-bold text-emerald-600' : 'text-slate-400'}>{n.dif > 0 ? '+' : ''}{formatNumero(n.dif)}</span>
            </li>
          ))}
          {e.fuentes.includes('operatividad') && comp.includes('resumenOperatividad') && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12.5px] text-slate-600">+ Operatividad: tarjetas equivalentes (General, distritos, estaciones o CAI) y hoja de detalle</li>}
          {comp.includes('tablas') && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12.5px] text-slate-600">+ Tabla estadística consolidada</li>}
          {e.fuentes.includes('rnmc') && comp.includes('resumenRnmc') && <li className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12.5px] text-slate-600">+ Hoja resumen de RNMC</li>}
          {nodos.length === 0 && e.fuentes.includes('delictividad') && <li className="text-[12.5px] text-rose-600">No hay unidades con esta selección.</li>}
        </ol>
      ) : datos && (
        <div className="rounded-xl border border-slate-200 p-2">
          <InformeEjecutivoMicrogerencia datos={datos} cobertura={cobLamina || rutaPrimera} onCobertura={setCobLamina} barrios={e.barrios} />
        </div>
      )}

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
function PanelResumen({ e, despachar, datos }: PropsPaso & { datos: DatosMicrogerencia | null }) {
  const comp = e.componentes.filter((c) => componenteDisponible(c, e.fuentes));
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
  const nota = e.paso === 0 ? 'Puede seleccionar una o varias fuentes disponibles.' : e.paso === 1 ? 'La cobertura principal es de selección única.' : e.paso === 2 ? 'Puede seleccionar una o varias unidades.' : e.paso === 3 ? 'Sin delitos seleccionados se incluyen todos.' : e.paso === 4 ? 'Solo se muestran los componentes de las fuentes elegidas.' : 'Revise y genere el PDF.';
  return (
    <aside className="shrink-0 border-t border-slate-200 bg-slate-50/70 px-4 py-4 lg:w-[290px] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Resumen de la selección" data-panel-resumen>
      <p className="mb-3 rounded-lg bg-white px-3 py-2 text-[16px] font-extrabold text-[#10233f] shadow-sm">Resumen</p>
      <div className="space-y-3">
        {bloque('Fuentes seleccionadas', Layers, e.fuentes.length ? e.fuentes.map((f) => <Chip key={f} texto={FUENTES.find((x) => x.id === f)?.nombre ?? f} onQuitar={e.fuentes.length > 1 ? () => despachar({ tipo: 'fuente', fuente: f }) : undefined} />) : <span className="text-[12px] text-slate-400">Ninguna</span>)}
        {bloque('Cobertura', Building2, <Chip texto={COBERTURAS.find((c) => c.id === e.cobertura)?.nombre ?? ''} />)}
        {(e.cobertura === 'general' || e.cobertura === 'distrito1' || e.cobertura === 'distrito2') && bloque('Unidades', ShieldCheck, <span className="text-[12px] text-slate-600">{e.cobertura === 'general' ? 'Toda la jurisdicción' : estacionesDeCobertura(e).map(etiquetaEstacion).join(', ')}</span>)}
        {e.estaciones.length > 0 && bloque(`Estaciones seleccionadas (${e.estaciones.length})`, ShieldCheck, e.estaciones.map((s) => <Chip key={s} texto={etiquetaEstacion(s)} onQuitar={() => despachar({ tipo: 'alternar', campo: 'estaciones', valor: s })} />))}
        {e.zonas.length > 0 && bloque(`Zonas seleccionadas (${e.zonas.length})`, MapPin, e.zonas.map((k) => <Chip key={k} texto={etiquetaZona(valorDeClave(k))} onQuitar={() => despachar({ tipo: 'alternar', campo: 'zonas', valor: k })} />))}
        {e.cais.length > 0 && bloque(`CAI (${e.cais.length})`, Building2, e.cais.map((k) => <Chip key={k} texto={valorDeClave(k)} onQuitar={() => despachar({ tipo: 'alternar', campo: 'cais', valor: k })} />))}
        {bloque(`Barrios${e.barrios.length ? ` (${e.barrios.length})` : ''}`, MapPin, e.barrios.length ? e.barrios.slice(0, 12).map((b) => <Chip key={b} texto={b} onQuitar={() => despachar({ tipo: 'alternar', campo: 'barrios', valor: b })} />).concat(e.barrios.length > 12 ? [<span key="mas" className="text-[11.5px] text-slate-500">+{e.barrios.length - 12} más</span>] : []) : <span className="text-[12px] text-slate-600">Todos</span>)}
        {bloque('Periodo', CalendarDays, <span className="text-[12px] text-slate-600">{datos ? datos.periodo : e.anio || 'Vigencia actual'}</span>)}
        {bloque(`Delitos${e.delitos.length ? ` (${e.delitos.length})` : ''}`, ShieldCheck, e.delitos.length ? e.delitos.map((d) => <Chip key={d} texto={d} onQuitar={() => despachar({ tipo: 'alternar', campo: 'delitos', valor: d })} />) : <span className="text-[12px] text-slate-600">Todos</span>)}
        {bloque(`Componentes (${comp.length})`, LayoutGrid, comp.map((c) => <Chip key={c} texto={c === 'territorial' ? `Top ${e.topBarrios} barrios` : etiquetaComponente(c)} onQuitar={() => despachar({ tipo: 'componente', componente: c })} />))}
      </div>
      <p className="mt-4 flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11.5px] text-slate-600"><Info size={14} className="mt-0.5 shrink-0 text-[#0f5f57]" /> {nota}</p>
    </aside>
  );
}
