import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '@fontsource-variable/roboto-condensed/index.css';
import {
  Area, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BarChart3, CalendarDays, ChevronDown, Database, FileImage, FileText, Landmark, LineChart as IconoLinea,
  MapPin, Percent, ShieldCheck, Target, Loader2, Info,
} from 'lucide-react';
import type { DatosMicrogerencia, NodoMicrogerencia } from '../../data/microgerencia';
import {
  generarImagenMapaCai, generarImagenMapaDistrito, generarImagenMapaEstacion, generarImagenMapaGeneral,
  esNombreDeCai, esNombreDeEstacion,
} from '../../data/microgerenciaMapas';
import { formatNumero, formatDecimal } from '../../utils/aggregations';

// ───────────────────────────────────────────────────────────────────────
// INFORME EJECUTIVO de Microgerencia — «MICROGERENCIA | CONSOLIDADO
// DELICTIVO». Reproduce la pieza institucional de referencia (lienzo fijo
// de 1672 × 941, que se escala al ancho disponible) con cifras REALES: todo
// sale de los nodos que ya calcula useMicrogerencia.ts (en vivo, con los
// filtros del dashboard). Aquí no se recalcula ninguna cifra; solo se
// organiza y se presenta. La «Cobertura» elige el nodo (MEPOY general,
// distrito, estación, CAI o zona de atención).
// ───────────────────────────────────────────────────────────────────────

const ANCHO = 1672;
const ALTO = 941;
const FUENTE = "'Roboto Condensed Variable', 'Roboto Condensed', 'Arial Narrow', sans-serif";
const C = {
  verdeOscuro: '#0b3d2c', verde: '#0e5a3c', verdeMedio: '#16714b', verdeVivo: '#23a347', lima: '#8cc63f',
  texto: '#1e2a33', gris2025: '#c9cdd1', azul: '#2f6fe0', rojo: '#e3262f', verdeDif: '#1f9a4a',
  borde: '#dde3e6', rosa: '#fde9eb', rosaBorde: '#f4b9bf', mentaKpi: '#e1f3e4', mentaBorde: '#9ccfa6',
};
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TRIM_CORTOS = ['1er Trim.', '2do Trim.', '3er Trim.', '4to Trim.'];

const signo = (n: number) => (n > 0 ? '+' : '');
const pct1 = (p: number | null) => (p === null ? 'Nuevo' : `${signo(p)}${formatDecimal(p, 1)}%`);
const pct0 = (p: number | null) => (p === null ? 'Nuevo' : `${signo(p)}${Math.round(p)}%`);
const colDif = (n: number) => (n > 0 ? C.rojo : n < 0 ? C.verdeDif : '#8a949b');

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES_LARGOS[m - 1]} de ${a}`;
}

export interface OpcionCobertura { ruta: string; etiqueta: string; nivel: number; nodo: NodoMicrogerencia }

/** Lista plana de coberturas: General → Distritos → Estaciones → CAI / Zonas. */
export function opcionesCobertura(datos: DatosMicrogerencia): OpcionCobertura[] {
  const salida: OpcionCobertura[] = [];
  const recorrer = (nodo: NodoMicrogerencia, ruta: string, nivel: number) => {
    salida.push({ ruta, etiqueta: nivel === 0 ? 'MEPOY General' : nodo.nombre, nivel, nodo });
    nodo.hijos.forEach((h) => recorrer(h, `${ruta}>${h.nombre}`, nivel + 1));
  };
  recorrer(datos.general, datos.general.nombre, 0);
  return salida;
}

/** Subunidades de la tabla central (MEPOY General → sus 5 estaciones). */
function subunidades(nodo: NodoMicrogerencia, esGeneral: boolean): { titulo: string; singular: string; filas: NodoMicrogerencia[] } {
  if (esGeneral) {
    const estaciones = nodo.hijos.flatMap((d) => d.hijos);
    if (estaciones.length > 0) return { titulo: 'Estaciones', singular: 'Estación', filas: estaciones };
  }
  const filas = nodo.hijos;
  if (filas.length === 0) return { titulo: '', singular: '', filas: [] };
  const primero = filas[0].nombre;
  if (esNombreDeEstacion(primero) || /^Estaci/i.test(primero)) return { titulo: 'Estaciones', singular: 'Estación', filas };
  if (esNombreDeCai(primero) || /^CAI/i.test(primero)) return { titulo: 'CAI', singular: 'CAI', filas };
  return { titulo: 'Zonas de atención', singular: 'Zona', filas };
}

const nombreCorto = (n: string) => n.replace(/^Estación\s+/i, 'Est. ').replace(/\s+—\s+Consolidado$/, '');

// Eje Y con marcas «redondas» (0, 200, 400… como en la lámina de referencia).
function pasoBonito(max: number, marcas = 6): number {
  const bruto = Math.max(1, max) / marcas;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
function techoBonito(max: number): number {
  const paso = pasoBonito(max);
  return Math.ceil(Math.max(1, max) / paso) * paso;
}
function marcasEje(filas: Record<string, unknown>[]): number[] {
  let max = 0;
  for (const f of filas) for (const [k, v] of Object.entries(f)) if (/^\d{4}$/.test(k) && typeof v === 'number') max = Math.max(max, v);
  const paso = pasoBonito(max);
  const techo = techoBonito(max);
  const salida: number[] = [];
  for (let v = 0; v <= techo + 1e-9; v += paso) salida.push(Math.round(v * 100) / 100);
  return salida;
}

// ── Piezas ─────────────────────────────────────────────────────────────
function Panel({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: React.ReactNode }) {
  return (
    <section
      className="absolute flex flex-col overflow-hidden rounded-[14px] bg-white"
      style={{ left: x, top: y, width: w, height: h, border: `1px solid ${C.borde}`, boxShadow: '0 3px 10px rgba(20,40,30,0.10)' }}
    >
      {children}
    </section>
  );
}

function TituloPanel({ icono: Icono, children, derecha }: { icono: typeof BarChart3; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white" style={{ background: C.verde }}><Icono size={20} strokeWidth={2.4} /></span>
      <h3 className="flex-1 text-[21px] font-bold leading-none" style={{ color: C.texto }}>{children}</h3>
      {derecha}
    </div>
  );
}

function Leyenda({ items }: { items: { color: string; texto: string; linea?: boolean }[] }) {
  return (
    <div className="flex items-center gap-4 text-[15px]" style={{ color: C.texto }}>
      {items.map((it) => (
        <span key={it.texto} className="flex items-center gap-1.5">
          {it.linea ? (
            <span className="relative inline-block h-[3px] w-6 rounded" style={{ background: it.color }}>
              <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white" style={{ borderColor: it.color }} />
            </span>
          ) : <span className="inline-block h-[15px] w-[15px] rounded-[3px]" style={{ background: it.color }} />}
          {it.texto}
        </span>
      ))}
    </div>
  );
}

function Kpi({ x, w, icono: Icono, etiqueta, sub, valor, tono = 'blanco' }: {
  x: number; w: number; icono: typeof BarChart3; etiqueta: string; sub?: string; valor: React.ReactNode; tono?: 'blanco' | 'verde' | 'rosa';
}) {
  const fondo = tono === 'verde' ? C.mentaKpi : tono === 'rosa' ? C.rosa : '#ffffff';
  const borde = tono === 'verde' ? C.mentaBorde : tono === 'rosa' ? C.rosaBorde : C.borde;
  const colorIcono = tono === 'rosa' ? C.rojo : C.texto;
  return (
    <div className="absolute flex flex-col rounded-[12px] px-3.5 pt-2.5" style={{ left: x, top: 122, width: w, height: 100, background: fondo, border: `1px solid ${borde}`, boxShadow: '0 3px 8px rgba(20,40,30,0.10)' }}>
      <div className="flex items-start gap-2">
        <Icono size={26} strokeWidth={2.2} style={{ color: colorIcono }} className="mt-0.5 shrink-0" />
        <p className="text-[16px] font-bold leading-[1.1]" style={{ color: tono === 'rosa' ? '#7a1d24' : C.texto }}>
          {etiqueta}{sub && <span className="block text-[15px] font-medium">{sub}</span>}
        </p>
      </div>
      <div className="flex flex-1 items-center justify-center pb-1 text-center font-bold leading-none" style={{ color: tono === 'rosa' ? C.rojo : C.texto }}>{valor}</div>
    </div>
  );
}

function CajaDif({ valor }: { valor: number | null }) {
  if (valor == null) return <span />;
  const color = valor > 0 ? C.rojo : valor < 0 ? C.verdeDif : '#8a949b';
  return (
    <span className="rounded-[5px] px-1.5 py-[1px] text-[15px] font-bold" style={{ color, border: `1.5px solid ${color}`, background: valor > 0 ? '#fff1f2' : valor < 0 ? '#ecf8ef' : '#fff' }}>
      {signo(valor)}{formatNumero(valor)}
    </span>
  );
}

// ── Mapa (misma imagen real que usa el PDF de Microgerencia) ────────────
function MapaCobertura({ nodo, esGeneral, delitoFiltrado, inicio, fin }: {
  nodo: NodoMicrogerencia; esGeneral: boolean; delitoFiltrado: string | null; inicio: string; fin: string;
}) {
  const [estado, setEstado] = useState<{ img?: string; cargando: boolean }>({ cargando: true });
  const clave = `${nodo.nombre}|${delitoFiltrado}|${inicio}|${fin}`;
  useEffect(() => {
    let vivo = true;
    setEstado({ cargando: true });
    (async () => {
      try {
        let img: string | undefined;
        if (esGeneral) img = await generarImagenMapaGeneral(delitoFiltrado, inicio, fin);
        else if (nodo.nombre === 'Distrito Uno' || nodo.nombre === 'Distrito Dos') img = await generarImagenMapaDistrito(nodo.nombre === 'Distrito Uno' ? 'UNO' : 'DOS', delitoFiltrado, inicio, fin);
        else if (esNombreDeEstacion(nodo.nombre)) img = await generarImagenMapaEstacion(nodo.nombre, delitoFiltrado, inicio, fin);
        else if (esNombreDeCai(nodo.nombre)) img = await generarImagenMapaCai(nodo.nombre, delitoFiltrado, inicio, fin);
        if (vivo) setEstado({ img, cargando: false });
      } catch {
        if (vivo) setEstado({ cargando: false });
      }
    })();
    return () => { vivo = false; };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (estado.cargando) return <div className="flex h-full items-center justify-center text-slate-400"><Loader2 size={26} className="animate-spin" /></div>;
  if (!estado.img) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center text-[14px]" style={{ color: C.verde }}>
        <MapPin size={26} />
        Mapa no disponible para esta cobertura.
        <span className="text-[12.5px] text-slate-500">Abra «Mapa / Georreferenciación» una vez para cargar las capas.</span>
      </div>
    );
  }
  return <img src={estado.img} alt={`Mapa de densidad delictiva — ${nodo.nombre}`} className="h-full w-full object-contain" />;
}

// ── Informe ────────────────────────────────────────────────────────────
export function InformeEjecutivoMicrogerencia({ datos, cobertura, onCobertura }: {
  datos: DatosMicrogerencia; cobertura: string; onCobertura: (ruta: string) => void;
}) {
  const opciones = useMemo(() => opcionesCobertura(datos), [datos]);
  const opcion = opciones.find((o) => o.ruta === cobertura) ?? opciones[0];
  const nodo = opcion.nodo;
  const esGeneral = opcion.nivel === 0;
  const [topBarrios, setTopBarrios] = useState<3 | 5>(5);
  const [menuTop, setMenuTop] = useState(false);
  const [exportando, setExportando] = useState<'' | 'png' | 'pdf'>('');
  const refLienzo = useRef<HTMLDivElement>(null);
  const refMarco = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);

  // El lienzo (1672 px) se escala al ancho disponible, como una lámina.
  useLayoutEffect(() => {
    const el = refMarco.current;
    if (!el) return;
    const medir = () => setEscala(Math.max(0.2, Math.min(1, el.clientWidth / ANCHO)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { anioActual: A, anioAnterior: P } = datos;
  const corte = datos.fechaCorte ?? datos.actualFin;
  const mesCorte = Number(corte.split('-')[1]) - 1;
  const rangoMeses = `Ene – ${MESES_CORTOS[mesCorte]}`;
  const tituloNodo = esGeneral ? 'MEPOY General' : nombreCorto(nodo.nombre);

  const proyDif = Math.round(nodo.difConAnioAnterior);
  const proyPct = nodo.total2025 > 0 ? (proyDif / nodo.total2025) * 100 : null;

  const datosTrim = nodo.trimestres.map((t, i) => ({ nombre: TRIM_CORTOS[i], [P]: t.anio2025, [A]: t.anio2026, dif: t.dif }));
  const datosMes = nodo.meses.map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: m.anio2025, [A]: m.anio2026, dif: m.dif }));

  const barrios = (nodo.barrios ?? []).slice(0, topBarrios);
  const top10 = [...nodo.delitos].sort((a, b) => b.fecha2026 - a.fecha2026).slice(0, 10);
  const maxTop = Math.max(1, ...top10.map((d) => d.fecha2026));
  const sub = subunidades(nodo, esGeneral);
  const tot = sub.filas.reduce((acc, f) => ({ t: acc.t + f.total2025, a: acc.a + f.fecha2025, b: acc.b + f.fecha2026 }), { t: 0, a: 0, b: 0 });
  const totDif = tot.b - tot.a;
  const totPct = tot.a > 0 ? (totDif / tot.a) * 100 : null;

  const hallazgos = useMemo(() => {
    const lista: { titulo: string; texto: string }[] = [];
    const sentido = nodo.dif > 0 ? 'un incremento' : nodo.dif < 0 ? 'una reducción' : 'una variación';
    lista.push({
      titulo: 'Comportamiento general',
      texto: `En el periodo analizado (${rangoMeses.toLowerCase()} ${A}) se registran ${formatNumero(nodo.fecha2026)} delitos, con ${sentido} de ${signo(nodo.dif)}${formatNumero(nodo.dif)} casos (${pct0(nodo.pct)}) frente a ${P}.`,
    });
    if (top10.length > 0) {
      const [d1, d2] = top10;
      lista.push({
        titulo: 'Delitos de mayor participación',
        texto: `${d1.nombre} (${formatNumero(d1.fecha2026)}; ${pct0(d1.pct)})${d2 ? ` y ${d2.nombre} (${formatNumero(d2.fecha2026)}; ${pct0(d2.pct)}) concentran` : ' concentra'} la mayor variación absoluta.`,
      });
    }
    lista.push({
      titulo: 'Tendencia y proyección',
      texto: `De mantenerse la tendencia actual, se proyecta un total de ${formatNumero(Math.round(nodo.terminaAnio))} delitos en ${A}, lo que representa ${signo(proyDif)}${formatNumero(proyDif)} casos (${pct1(proyPct)}) frente al total de ${P}.`,
    });
    return lista;
  }, [nodo, top10, rangoMeses, A, P, proyDif, proyPct]);

  const mesesSinCierre = MESES_LARGOS.slice(mesCorte + 1);
  const textoMesesNota = mesesSinCierre.length === 0 ? '' : mesesSinCierre.length === 1 ? mesesSinCierre[0] : `${mesesSinCierre.slice(0, -1).join(', ')} y ${mesesSinCierre[mesesSinCierre.length - 1]}`;

  async function exportar(tipo: 'png' | 'pdf') {
    if (!refLienzo.current) return;
    setExportando(tipo);
    const anterior = escala;
    try {
      setEscala(1); // se captura a tamaño real
      await new Promise((r) => setTimeout(r, 120));
      // Lienzo fijo: lo dibuja el propio navegador (html-to-image, vía SVG),
      // así la exportación queda idéntica a la pantalla: fuente, franjas
      // inclinadas y colores incluidos.
      const { toCanvas } = await import('html-to-image');
      const lienzo = await toCanvas(refLienzo.current, { pixelRatio: 2, width: ANCHO, height: ALTO, backgroundColor: '#f3f5f4', cacheBust: false });
      const nombre = `Microgerencia_${tituloNodo.replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, '_')}_${corte}`;
      if (tipo === 'png') {
        const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/png'));
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${nombre}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const ap = pdf.internal.pageSize.getWidth();
        const hp = pdf.internal.pageSize.getHeight();
        const k = Math.min(ap / lienzo.width, hp / lienzo.height);
        pdf.addImage(lienzo.toDataURL('image/jpeg', 0.93), 'JPEG', (ap - lienzo.width * k) / 2, (hp - lienzo.height * k) / 2, lienzo.width * k, lienzo.height * k);
        pdf.save(`${nombre}.pdf`);
      }
    } finally {
      setEscala(anterior);
      setExportando('');
    }
  }

  const ejeY = { fontSize: 14, fill: C.texto, fontFamily: FUENTE };
  const tip = { fontSize: 13, borderRadius: 8, fontFamily: FUENTE };

  return (
    <div className="space-y-2">
      {/* Controles (fuera del informe) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <label className="flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-[#10233f]">
          <MapPin size={15} className="text-[#0f5f57]" /> Cobertura
          <select value={opcion.ruta} onChange={(e) => onCobertura(e.target.value)} aria-label="Cobertura del informe"
            className="min-w-0 max-w-[260px] rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12.5px] font-medium focus:border-[#159089] focus:outline-none">
            {opciones.map((o) => <option key={o.ruta} value={o.ruta}>{' '.repeat(o.nivel * 3)}{o.etiqueta}</option>)}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => exportar('png')} disabled={!!exportando} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-[#0f5f57] hover:border-[#159089] disabled:opacity-60">
            {exportando === 'png' ? <Loader2 size={14} className="animate-spin" /> : <FileImage size={14} />} Imagen
          </button>
          <button type="button" onClick={() => exportar('pdf')} disabled={!!exportando} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f5f57] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#116762] disabled:opacity-60">
            {exportando === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF del informe
          </button>
        </div>
      </div>

      <div ref={refMarco} className="w-full overflow-hidden" style={{ height: ALTO * escala }}>
        <div style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
          <div ref={refLienzo} data-informe-microgerencia className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>

            {/* ── ENCABEZADO ─────────────────────────────────────────── */}
            <div className="absolute left-0 top-0 h-[108px] w-full overflow-hidden" style={{ background: `linear-gradient(90deg, ${C.verdeOscuro} 0%, #0d4733 45%, #0b3d2c 100%)` }}>
              {/* panel central inclinado */}
              <div className="absolute top-0 h-full" style={{ left: 600, width: 880, background: 'linear-gradient(90deg,#0f5038,#0c4431)', clipPath: 'polygon(40px 0,100% 0,100% 100%,0 100%)' }} />
              {/* franjas lima */}
              <div className="absolute top-0 h-full" style={{ left: 596, width: 14, background: C.lima, clipPath: 'polygon(40px 0,54px 0,14px 100%,0 100%)', transform: 'translateX(-14px)' }} />
              <div className="absolute top-0 h-full" style={{ left: 618, width: 60, background: C.lima, opacity: 0.85, clipPath: 'polygon(40px 0,46px 0,6px 100%,0 100%)' }} />
              <div className="absolute bottom-0 left-0 h-[3px] w-full" style={{ background: `linear-gradient(90deg, transparent, ${C.lima} 30%, ${C.lima} 70%, transparent)`, opacity: 0.6 }} />

              <span className="absolute flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white p-[3px] shadow-[0_0_0_3px_rgba(255,255,255,0.25)]" style={{ left: 44, top: 8 }}>
                <img src="/assets/escudo-policia.png" alt="Escudo Policía Nacional" className="h-full w-full rounded-full object-contain" />
              </span>
              <div className="absolute" style={{ left: 146, top: 10 }}>
                <div className="leading-[1.12] text-white">
                  <p className="text-[27px] font-bold tracking-[0.2px]">POLICÍA NACIONAL DE COLOMBIA</p>
                  <p className="text-[21.5px] font-bold">POLICÍA METROPOLITANA DE POPAYÁN – MEPOY</p>
                </div>
              </div>

              <h2 className="absolute whitespace-nowrap text-[38px] font-extrabold leading-none tracking-[0.3px] text-white" style={{ left: 680, top: 14 }}>
                MICROGERENCIA <span className="mx-1 text-white">|</span> <span style={{ color: '#9fdc3a' }}>CONSOLIDADO DELICTIVO</span>
              </h2>
              <div className="absolute flex items-center gap-7 whitespace-nowrap text-[17px] text-white" style={{ left: 310, top: 79 }}>
                <span className="flex items-center gap-2"><CalendarDays size={20} /> Período de análisis: {rangoMeses} {A}</span>
                <span className="flex items-center gap-2"><BarChart3 size={20} /> Corte de información: {fechaLarga(corte)}</span>
                <span className="flex items-center gap-2"><MapPin size={20} /> Cobertura: {esGeneral ? 'MEPOY (Popayán)' : nombreCorto(nodo.nombre)}</span>
                <span className="flex items-center gap-2"><Database size={20} /> Fuente: Aplicativo Los Andes</span>
              </div>
              <img src="/assets/popayan-territorio-seguro-blanco.png" alt="Popayán Territorio Seguro" className="absolute h-[104px] w-auto" style={{ right: 36, top: 2 }} />
            </div>

            {/* ── FILA 1 · KPI ───────────────────────────────────────── */}
            <div className="absolute flex items-center gap-4 overflow-hidden text-white" style={{ left: 20, top: 122, width: 362, height: 100, background: `linear-gradient(90deg, ${C.verde}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 26px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
              <span className="ml-5 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><BarChart3 size={36} strokeWidth={2.6} /></span>
              <p className="text-[32px] font-bold leading-[1.08]">{tituloNodo}<span className="block">Consolidado</span></p>
              <span className="absolute top-0 h-full w-[7px]" style={{ right: 14, background: C.lima, transform: 'skewX(-14deg)' }} />
            </div>
            <Kpi x={392} w={160} icono={CalendarDays} etiqueta={`Total ${P}`} valor={<span className="text-[34px]">{formatNumero(nodo.total2025)}</span>} />
            <Kpi x={562} w={166} icono={CalendarDays} etiqueta={`${P}`} sub={`(${rangoMeses})`} valor={<span className="text-[34px]">{formatNumero(nodo.fecha2025)}</span>} />
            <Kpi x={738} w={167} icono={CalendarDays} etiqueta={`${A}`} sub={`(${rangoMeses})`} valor={<span className="text-[34px]">{formatNumero(nodo.fecha2026)}</span>} tono="verde" />
            <Kpi x={915} w={167} icono={BarChart3} etiqueta="Diferencia" sub={`(${A} – ${P})`} valor={<span className="text-[34px]">{signo(nodo.dif)}{formatNumero(nodo.dif)}</span>} tono={nodo.dif > 0 ? 'rosa' : 'blanco'} />
            <Kpi x={1092} w={158} icono={Percent} etiqueta="Variación" valor={<span className="text-[40px]">{pct0(nodo.pct)}</span>} tono={nodo.dif > 0 ? 'rosa' : 'blanco'} />
            <Kpi x={1260} w={195} icono={Target} etiqueta={`Proyectado ${A}`} sub="(Ene – Dic)" valor={<span className="text-[34px]">{formatNumero(Math.round(nodo.terminaAnio))}</span>} />
            <Kpi x={1465} w={187} icono={BarChart3} etiqueta={`Proy. vs ${P}`} valor={<span className="block text-[32px] leading-[1.05]">{signo(proyDif)}{formatNumero(proyDif)}<span className="block text-[27px]">({pct1(proyPct)})</span></span>} tono={proyDif > 0 ? 'rosa' : 'blanco'} />

            {/* ── FILA 2 ─────────────────────────────────────────────── */}
            <Panel x={20} y={236} w={528} h={252}>
              <TituloPanel icono={BarChart3} derecha={<Leyenda items={[{ color: C.gris2025, texto: String(P) }, { color: C.verde, texto: String(A) }]} />}>Comparativo trimestral</TituloPanel>
              <div className="relative flex-1">
                <div className="absolute left-[58px] right-[10px] top-[6px] grid grid-cols-4 text-center">
                  {datosTrim.map((t) => <div key={t.nombre}><CajaDif valor={t.dif} /></div>)}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosTrim} margin={{ top: 46, right: 10, left: 4, bottom: 2 }} barGap={2} barCategoryGap="22%">
                    <CartesianGrid vertical={false} stroke="#edf0f1" />
                    <XAxis dataKey="nombre" tick={{ ...ejeY, fontSize: 16 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} />
                    <YAxis width={54} tick={ejeY} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEje(datosTrim)} allowDecimals={false} />
                    <Tooltip contentStyle={tip} formatter={(v) => formatNumero(Number(v))} />
                    <Bar dataKey={String(P)} fill={C.gris2025} isAnimationActive={false}>
                      <LabelList dataKey={String(P)} position="top" style={{ fontSize: 17, fill: C.texto, fontWeight: 700, fontFamily: FUENTE }} formatter={(v: unknown) => formatNumero(Number(v))} />
                    </Bar>
                    <Bar dataKey={String(A)} fill={C.verde} isAnimationActive={false}>
                      <LabelList dataKey={String(A)} position="top" style={{ fontSize: 17, fill: C.texto, fontWeight: 700, fontFamily: FUENTE }} formatter={(v: unknown) => formatNumero(Number(v))} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel x={560} y={236} w={588} h={252}>
              <TituloPanel icono={IconoLinea} derecha={<Leyenda items={[{ color: C.azul, texto: String(P), linea: true }, { color: C.verdeVivo, texto: String(A), linea: true }]} />}>Distribución mensual de delitos</TituloPanel>
              <div className="h-[132px] pr-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={datosMes} margin={{ top: 8, right: 8, left: 2, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mg-area-2025" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.azul} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={C.azul} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#edf0f1" />
                    <XAxis dataKey="nombre" hide />
                    <YAxis width={52} tick={{ ...ejeY, fontSize: 13 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEje(datosMes)} allowDecimals={false} />
                    <Tooltip contentStyle={tip} formatter={(v) => formatNumero(Number(v))} />
                    <Area type="monotone" dataKey={String(P)} stroke={C.azul} strokeWidth={2.4} fill="url(#mg-area-2025)" dot={{ r: 4, fill: '#fff', stroke: C.azul, strokeWidth: 2 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey={String(A)} stroke={C.verdeVivo} strokeWidth={2.8} dot={{ r: 4.5, fill: '#fff', stroke: C.verdeVivo, strokeWidth: 2.2 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <table className="mx-3 border-collapse text-center text-[15px] leading-[19px]" style={{ width: 'calc(100% - 24px)' }}>
                <thead><tr><th className="w-[52px]" />{datosMes.map((m) => <th key={m.nombre} className="pb-0.5 font-bold">{m.nombre}</th>)}</tr></thead>
                <tbody>
                  <tr style={{ background: '#e7effc' }}><th className="rounded-l-md py-0.5 font-bold" style={{ color: C.azul }}>{P}</th>{datosMes.map((m) => <td key={m.nombre} className="py-0.5">{formatNumero(Number(m[P]))}</td>)}</tr>
                  <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md py-0.5 font-bold" style={{ color: C.verdeDif }}>{A}</th>{datosMes.map((m) => <td key={m.nombre} className="py-0.5">{formatNumero(Number(m[A]))}</td>)}</tr>
                  <tr><th className="py-0.5 font-bold">Dif.</th>{datosMes.map((m) => <td key={m.nombre} className="py-0.5 font-bold" style={{ color: colDif(m.dif) }}>{signo(m.dif)}{formatNumero(m.dif)}</td>)}</tr>
                </tbody>
              </table>
            </Panel>

            <Panel x={1160} y={236} w={492} h={252}>
              <TituloPanel
                icono={MapPin}
                derecha={(
                  <div className="relative">
                    <button type="button" onClick={() => setMenuTop((v) => !v)} className="flex items-center gap-2 rounded-[8px] border bg-white px-3 py-1 text-[16px] font-bold" style={{ borderColor: C.borde, color: C.texto }}>
                      Top {topBarrios} barrios <ChevronDown size={18} />
                    </button>
                    {menuTop && (
                      <div className="absolute right-0 z-10 mt-1 overflow-hidden rounded-[8px] border bg-white text-[16px] shadow-lg" style={{ borderColor: C.borde }}>
                        {([3, 5] as const).map((n) => (
                          <button key={n} type="button" onClick={() => { setTopBarrios(n); setMenuTop(false); }} className="block w-full px-4 py-1.5 text-left hover:bg-[#e1f3e4]" style={{ fontWeight: n === topBarrios ? 700 : 400 }}>Top {n} barrios</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              >Distribución territorial</TituloPanel>
              <div className="flex flex-1 gap-2 px-3 pb-2 pt-1">
                <div className="flex w-[236px] shrink-0 flex-col">
                  <div className="min-h-0 flex-1">
                    <MapaCobertura nodo={nodo} esGeneral={esGeneral} delitoFiltrado={datos.delitoFiltrado} inicio={datos.actualInicio} fin={datos.actualFin} />
                  </div>
                  <div className="mx-auto mt-1 w-[150px] text-[14px]">
                    <p className="font-bold">Densidad delictiva</p>
                    <div className="h-[14px] rounded-[3px]" style={{ background: 'linear-gradient(90deg,#3cb44b,#a6d84a,#f7e33b,#f59a2b,#e3262f)' }} />
                    <div className="flex justify-between font-bold"><span>Baja</span><span>Alta</span></div>
                  </div>
                </div>
                <div className="mt-1 flex-1 self-start overflow-hidden rounded-[8px] border" style={{ borderColor: C.borde }}>
                  <p className="px-2.5 py-1 text-[16px] font-bold text-white" style={{ background: C.verde }}>Top {topBarrios} barrios ({A})</p>
                  {barrios.length === 0 ? <p className="px-2.5 py-2 text-[14px] text-slate-500">Sin barrios reportados.</p> : (
                    <ol className="px-2 py-1">
                      {barrios.map((b, i) => (
                        <li key={b.nombre} className="flex items-center gap-2 py-[3px] text-[16px]">
                          <span className="flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: C.verdeVivo }}>{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate">{b.nombre}</span>
                          <span className="tabular-nums">{formatNumero(b.casos)}</span>
                          <span className="w-[54px] text-right tabular-nums">({formatDecimal(nodo.fecha2026 > 0 ? (b.casos / nodo.fecha2026) * 100 : 0, 1)}%)</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            </Panel>

            {/* ── FILA 3 ─────────────────────────────────────────────── */}
            <Panel x={20} y={502} w={592} h={356}>
              <TituloPanel icono={ShieldCheck}>Top 10 delitos <span className="text-[17px] font-normal">(consolidado)</span></TituloPanel>
              <table className="mx-4 mt-2 border-collapse text-[16.5px]" style={{ width: 'calc(100% - 32px)' }}>
                <thead>
                  <tr className="text-left font-bold">
                    <th className="w-[26px] pb-1">#</th><th className="pb-1">Delito</th>
                    <th className="pb-1 text-right">Total {P}</th><th className="pb-1 text-right">{P}</th><th className="pb-1 text-right">{A}</th>
                    <th className="pb-1 text-right">Dif.</th><th className="pb-1 text-right">Variación</th><th className="w-[124px] pb-1" />
                  </tr>
                </thead>
                <tbody>
                  {top10.map((d, i) => (
                    <tr key={d.nombre} className="leading-[25.5px]">
                      <td>{i + 1}</td>
                      <td className="max-w-[150px] truncate">{d.nombre}</td>
                      <td className="text-right font-bold">{formatNumero(d.total2025)}</td>
                      <td className="text-right">{formatNumero(d.fecha2025)}</td>
                      <td className="text-right font-bold">{formatNumero(d.fecha2026)}</td>
                      <td className="text-right font-bold" style={{ color: colDif(d.dif) }}>{signo(d.dif)}{formatNumero(d.dif)}</td>
                      <td className="text-right font-bold" style={{ color: colDif(d.dif) }}>{pct0(d.pct)}</td>
                      <td className="pl-3">
                        <div className="flex items-center gap-1">
                          <span className="h-[16px]" style={{ width: Math.max(6, (d.fecha2026 / maxTop) * 82), background: `linear-gradient(90deg, ${C.verde}, ${C.verdeMedio})` }} />
                          <span className="text-[13.5px] font-bold">{formatNumero(d.fecha2026)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel x={624} y={502} w={508} h={356}>
              <TituloPanel icono={Landmark}>{sub.filas.length ? `${sub.titulo} (${esGeneral ? 'MEPOY – General' : tituloNodo})` : 'Unidades territoriales'}</TituloPanel>
              {sub.filas.length === 0 ? (
                <p className="px-4 py-8 text-center text-[16px] text-slate-500">Esta cobertura no tiene subunidades para comparar.</p>
              ) : (
                <>
                  <table className="mx-3 mt-2 border-collapse text-[16px]" style={{ width: 'calc(100% - 24px)' }}>
                    <thead>
                      <tr className="font-bold" style={{ background: '#eef1f2' }}>
                        <th className="rounded-l-md px-2 py-0.5 text-left">{sub.singular}</th>
                        <th className="py-0.5 text-right">Total {P}</th><th className="py-0.5 text-right">{P}</th><th className="py-0.5 text-right">{A}</th>
                        <th className="py-0.5 text-right">Dif.</th><th className="rounded-r-md px-2 py-0.5 text-right">Variación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sub.filas.slice(0, 8).map((f) => (
                        <tr key={f.nombre} className="leading-[21px]">
                          <td className="max-w-[150px] truncate px-2">{nombreCorto(f.nombre)}</td>
                          <td className="text-right font-bold">{formatNumero(f.total2025)}</td>
                          <td className="text-right">{formatNumero(f.fecha2025)}</td>
                          <td className="text-right font-bold">{formatNumero(f.fecha2026)}</td>
                          <td className="text-right font-bold" style={{ color: colDif(f.dif) }}>{signo(f.dif)}{formatNumero(f.dif)}</td>
                          <td className="px-2 text-right font-bold" style={{ color: colDif(f.dif) }}>{pct1(f.pct)}</td>
                        </tr>
                      ))}
                      <tr className="text-[17px] font-bold text-white">
                        <td className="rounded-l-[8px] px-2 py-[3px]" style={{ background: C.verde }}>Total {esGeneral ? 'MEPOY' : ''}</td>
                        <td className="py-[3px] text-right" style={{ background: C.verde }}>{formatNumero(tot.t)}</td>
                        <td className="py-[3px] text-right" style={{ background: C.verde }}>{formatNumero(tot.a)}</td>
                        <td className="py-[3px] text-right" style={{ background: C.verde }}>{formatNumero(tot.b)}</td>
                        <td className="py-[3px] text-right" style={{ background: C.verde }}>{signo(totDif)}{formatNumero(totDif)}</td>
                        <td className="rounded-r-[8px] px-2 py-[3px] text-right" style={{ background: C.verde }}>{pct1(totPct)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-2 flex items-center justify-between px-4">
                    <p className="text-[17px] font-bold">Comparativo por {sub.singular === 'CAI' ? 'CAI' : sub.singular.toLowerCase()} ({P} vs {A})</p>
                    <Leyenda items={[{ color: C.gris2025, texto: String(P) }, { color: C.verde, texto: String(A) }]} />
                  </div>
                  <div className="min-h-0 flex-1 px-1 pb-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sub.filas.slice(0, 8).map((f) => ({ nombre: nombreCorto(f.nombre), [P]: f.fecha2025, [A]: f.fecha2026 }))} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="18%">
                        <CartesianGrid vertical={false} stroke="#edf0f1" />
                        <XAxis dataKey="nombre" tick={{ ...ejeY, fontSize: 13.5 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} />
                        <YAxis width={48} tick={{ ...ejeY, fontSize: 12 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} />
                        <Tooltip contentStyle={tip} formatter={(v) => formatNumero(Number(v))} />
                        <Bar dataKey={String(P)} fill={C.gris2025} isAnimationActive={false}>
                          <LabelList dataKey={String(P)} position="top" style={{ fontSize: 14, fill: C.texto, fontWeight: 700, fontFamily: FUENTE }} formatter={(v: unknown) => formatNumero(Number(v))} />
                        </Bar>
                        <Bar dataKey={String(A)} fill={C.verde} isAnimationActive={false}>
                          <LabelList dataKey={String(A)} position="top" style={{ fontSize: 14, fill: C.texto, fontWeight: 700, fontFamily: FUENTE }} formatter={(v: unknown) => formatNumero(Number(v))} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </Panel>

            <Panel x={1142} y={502} w={510} h={356}>
              <TituloPanel icono={FileText}>Principales hallazgos <span className="text-[19px] font-normal">(análisis ejecutivo)</span></TituloPanel>
              <div className="flex flex-1 flex-col gap-[7px] px-3 pb-3 pt-2">
                {hallazgos.map((h, i) => (
                  <div key={h.titulo} className="flex items-center gap-3 rounded-[10px] border bg-white px-3 py-[7px]" style={{ borderColor: C.borde }}>
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-white" style={{ background: C.verdeVivo }}>{i + 1}</span>
                    <p className="text-[14.5px] leading-[1.25]"><strong>{h.titulo}:</strong> {h.texto}</p>
                  </div>
                ))}
                <div className="mt-auto flex items-center gap-3 rounded-[10px] px-3 py-2.5" style={{ background: '#fbf3df', border: '1px solid #efe0b8' }}>
                  <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: '#b07a1e', color: '#b07a1e' }}><Info size={22} strokeWidth={2.6} /></span>
                  <p className="text-[13.5px] leading-[1.25]">
                    <strong>Nota sobre la calidad del dato:</strong>{' '}
                    {textoMesesNota
                      ? <>Los valores en cero (0) de {textoMesesNota} de {A} pueden corresponder a información pendiente de reporte o no consolidada, y no deben interpretarse como una reducción confirmada del delito.</>
                      : <>La información de {A} está completa hasta el {fechaLarga(corte)}; las cifras pueden variar por reportes pendientes o depuración.</>}
                  </p>
                </div>
              </div>
            </Panel>

            {/* ── PIE ────────────────────────────────────────────────── */}
            <div className="absolute bottom-0 left-0 flex h-[62px] w-full items-center justify-between overflow-hidden pl-8" style={{ background: `linear-gradient(90deg, ${C.verdeOscuro}, #0e4a36 60%, ${C.verdeOscuro})` }}>
              <div className="absolute top-0 h-full" style={{ left: 600, width: 260, background: 'rgba(255,255,255,0.04)', clipPath: 'polygon(40px 0,100% 0,calc(100% - 40px) 100%,0 100%)' }} />
              <p className="relative text-[17px] text-white">Fuente: Aplicativo Los Andes. Información sujeta a variación.</p>
              <img src="/assets/mepoy-footer-iconos-blanco.png" alt="Trabajo articulado · Prevención efectiva · Comunidad segura" className="relative mr-6 h-[58px] w-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
