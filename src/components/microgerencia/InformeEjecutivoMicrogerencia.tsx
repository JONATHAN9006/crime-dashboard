import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import '@fontsource-variable/roboto-condensed/index.css';
import urlFuenteLamina from '@fontsource-variable/roboto-condensed/files/roboto-condensed-latin-wght-normal.woff2?url';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  BarChart3, CalendarDays, ChevronDown, Database, FileImage, FileText, Landmark, LineChart as IconoLinea,
  MapPin, Percent, ShieldCheck, Target, Loader2, Info,
} from 'lucide-react';
import type { DatosMicrogerencia, NodoMicrogerencia } from '../../data/microgerencia';
import { generarImagenMapaLaminaNodo, esNombreDeCai, esNombreDeEstacion } from '../../data/microgerenciaMapas';
import { NOMBRES_ESTACION } from '../../hooks/useMicrogerencia';
import { formatNumero, formatDecimal } from '../../utils/aggregations';
import { nombreVisibleUnidad } from '../../data/microgerencia';

// ───────────────────────────────────────────────────────────────────────
// INFORME EJECUTIVO de Microgerencia — «MICROGERENCIA | CONSOLIDADO
// DELICTIVO». Reproduce la pieza institucional de referencia (lienzo fijo
// de 1672 × 941, que se escala al ancho disponible) con cifras REALES: todo
// sale de los nodos que ya calcula useMicrogerencia.ts (en vivo, con los
// filtros del dashboard). Aquí no se recalcula ninguna cifra; solo se
// organiza y se presenta. La «Cobertura» elige el nodo (MEPOY general,
// distrito, estación, CAI o zona de atención).
// ───────────────────────────────────────────────────────────────────────

export const ANCHO = 1672;
export const ALTO = 941;
export const FUENTE = "'Roboto Condensed Variable', 'Roboto Condensed', 'Arial Narrow', sans-serif";
export const C = {
  verdeOscuro: '#0b3d2c', verde: '#0e5a3c', verdeMedio: '#16714b', verdeVivo: '#23a347', lima: '#8cc63f',
  texto: '#1e2a33', gris2025: '#c9cdd1', azul: '#2f6fe0', rojo: '#e3262f', verdeDif: '#1f9a4a',
  borde: '#dde3e6', rosa: '#fde9eb', rosaBorde: '#f4b9bf', mentaKpi: '#e1f3e4', mentaBorde: '#9ccfa6',
};
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const TRIM_CORTOS = ['1er Trim.', '2do Trim.', '3er Trim.', '4to Trim.'];

export const signo = (n: number) => (n > 0 ? '+' : '');
export const pct1 = (p: number | null) => (p === null ? 'Nuevo' : `${signo(p)}${formatDecimal(p, 1)}%`);
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
export function subunidades(nodo: NodoMicrogerencia, esGeneral: boolean): { titulo: string; singular: string; filas: NodoMicrogerencia[] } {
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

export const nombreCorto = (n: string) => nombreVisibleUnidad(n.replace(/\s*\(Operatividad\)$/, '').replace(/^Operatividad\s+—\s+Consolidado$/, 'MEPOY General')).replace(/^Estación\s+/i, 'Est. ').replace(/\s+—\s+Consolidado$/, '');

// Eje Y con marcas «redondas» (0, 200, 400… como en la lámina de referencia).
function pasoBonito(max: number, marcas = 6): number {
  const bruto = Math.max(1, max) / marcas;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}
export function techoBonito(max: number): number {
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

export function marcasEjeValores(valores: number[]): number[] {
  return marcasEje(valores.map((v) => ({ '0000': v })));
}

// Etiqueta de barra sin choques: las dos barras de un grupo se separan
// hacia afuera cuando sus alturas son parecidas.
export interface EtiquetaProps { x?: number | string; y?: number | string; width?: number | string; value?: unknown }
export function EtiquetaBarra({ x, y, width, value, lado, tam = 17 }: EtiquetaProps & { lado: 'izq' | 'der'; tam?: number }) {
  if (value == null) return null;
  const nx = Number(x), ny = Number(y), w = Number(width);
  const texto = formatNumero(Number(value));
  const ancho = texto.length * tam * 0.54;
  // Si el texto es más ancho que la barra, se corre hacia afuera del grupo
  // (con un pequeño aire) para que las dos cifras nunca se monten.
  const desplaza = ancho > w + 2 ? (ancho - w) / 2 + 2 : 0;
  const cx = nx + w / 2 + (lado === 'izq' ? -desplaza : desplaza);
  return <text x={cx} y={ny - 5} textAnchor="middle" style={{ fontSize: tam, fontWeight: 700, fill: '#1e2a33', fontFamily: FUENTE }}>{texto}</text>;
}

/** Texto ejecutivo del comportamiento trimestral (con advertencia del trimestre incompleto). */
function analisisTrimestral(nodo: NodoMicrogerencia, trim: { i: number; dif: number | null; pct: number | null; parcial: boolean; futuro: boolean; sub: string }[], rango: string, A: number, P: number): string {
  const ord = ['1er', '2do', '3er', '4to'];
  const completos = trim.filter((t) => !t.parcial && !t.futuro && t.dif != null);
  const partes: string[] = [];
  partes.push(`En el periodo ${rango} ${A} se registra ${nodo.dif > 0 ? 'un incremento' : nodo.dif < 0 ? 'una reducción' : 'una variación'} de ${signo(nodo.dif)}${formatNumero(nodo.dif)} casos (${pct1(nodo.pct)}) frente al mismo periodo de ${P}.`);
  const alza = [...completos].filter((t) => (t.dif ?? 0) > 0).sort((a, b) => (b.dif ?? 0) - (a.dif ?? 0))[0];
  const baja = [...completos].filter((t) => (t.dif ?? 0) < 0).sort((a, b) => (a.dif ?? 0) - (b.dif ?? 0))[0];
  if (alza) partes.push(`El mayor aumento se presenta en el ${ord[alza.i]} trimestre (${signo(alza.dif!)}${formatNumero(alza.dif!)}; ${pct1(alza.pct)})${baja ? '' : '.'}`);
  if (baja) partes.push(`${alza ? 'y' : 'La'} mayor disminución en el ${ord[baja.i]} trimestre (${formatNumero(baja.dif!)}; ${pct1(baja.pct)}).`);
  if (!alza && !baja && completos.length) partes.push('Los trimestres cerrados no presentan variación.');
  const parcial = trim.find((t) => t.parcial && t.dif != null);
  if (parcial) {
    partes.push(`El ${ord[parcial.i]} trimestre ${parcial.sub ? `${parcial.sub} ` : ''}está incompleto: su diferencia de ${signo(parcial.dif!)}${formatNumero(parcial.dif!)} casos (${pct1(parcial.pct)}) frente al trimestre completo de ${P} se asocia al corte parcial de la información y no constituye una ${parcial.dif! < 0 ? 'disminución' : 'variación'} confirmada.`);
  }
  return partes.join(' ').replace(') y ', ') y ').replace(/\)\s+y mayor/, '), y la mayor');
}

// ── Piezas ─────────────────────────────────────────────────────────────
export function Panel({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: React.ReactNode }) {
  return (
    <section
      className="absolute flex flex-col overflow-hidden rounded-[14px] bg-white"
      style={{ left: x, top: y, width: w, height: h, border: `1px solid ${C.borde}`, boxShadow: '0 3px 10px rgba(20,40,30,0.10)' }}
    >
      {children}
    </section>
  );
}

export function TituloPanel({ icono: Icono, children, derecha }: { icono: typeof BarChart3; children: React.ReactNode; derecha?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-3">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-white" style={{ background: C.verde }}><Icono size={20} strokeWidth={2.4} /></span>
      <h3 className="flex-1 text-[21px] font-bold leading-none" style={{ color: C.texto }}>{children}</h3>
      {derecha}
    </div>
  );
}

export function Leyenda({ items }: { items: { color: string; texto: string; linea?: boolean }[] }) {
  return (
    <div className="flex items-center gap-4 text-[15px]" style={{ color: C.texto }}>
      {items.map((it) => (
        <span key={it.texto} className="flex items-center gap-1.5 whitespace-nowrap">
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
        <p className="whitespace-nowrap text-[16px] font-bold leading-[1.1]" style={{ color: tono === 'rosa' ? '#7a1d24' : C.texto }}>
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

// ── Encabezado y pie comunes (Delictividad y Operatividad) ─────────────
/** Título completo de las hojas de la microgerencia delictiva (reemplaza «MICROGERENCIA | CONSOLIDADO DELICTIVO»). */
export const TITULO_INFORME_DELICTIVO = { blanco: 'INFORME ESTADÍSTICO', lima: 'DEL SERVICIO DE POLICÍA' };

export function EncabezadoLamina({ titulo, periodo, corte, cobertura, fuente, comparacion, delito, tituloCompleto }: { titulo: string; periodo: string; corte: string; cobertura: string; fuente: string; comparacion?: string; delito?: string; tituloCompleto?: { blanco: string; lima: string } }) {
  return (
    <div className="absolute left-0 top-0 h-[108px] w-full overflow-hidden" style={{ background: `linear-gradient(90deg, ${C.verdeOscuro} 0%, #0d4733 45%, #0b3d2c 100%)` }}>
      <div className="absolute top-0 h-full" style={{ left: 600, width: 880, background: 'linear-gradient(90deg,#0f5038,#0c4431)', clipPath: 'polygon(40px 0,100% 0,100% 100%,0 100%)' }} />
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
      {tituloCompleto ? (
        <h2 className="absolute whitespace-nowrap font-extrabold leading-none tracking-[0.3px] text-white" style={{ left: 680, top: 15, fontSize: 34 }} data-titulo-lamina>
          {tituloCompleto.blanco} {tituloCompleto.lima}
        </h2>
      ) : (
        <h2 className="absolute whitespace-nowrap font-extrabold leading-none tracking-[0.3px] text-white" style={{ left: 680, top: 14, fontSize: titulo.length > 24 ? 33 : 38 }} data-titulo-lamina>
          MICROGERENCIA <span className="mx-1 text-white">|</span> <span style={{ color: '#9fdc3a' }}>{titulo}</span>
        </h2>
      )}
      <div className="absolute flex items-center whitespace-nowrap text-white" style={{ left: delito ? 136 : comparacion ? 150 : 310, top: comparacion ? 80 : 79, gap: delito ? 14 : comparacion ? 22 : 28, fontSize: delito ? 14 : comparacion ? 15.5 : 17 }}>
        {delito && <span className="flex items-center gap-1.5"><Target size={19} /> Delito analizado: <strong className="uppercase" style={{ color: '#d4f53c', fontSize: 16 }}>{delito}</strong></span>}
        <span className="flex items-center gap-2"><CalendarDays size={20} /> Período de análisis: {periodo}</span>
        {comparacion && <span className="flex items-center gap-2"><CalendarDays size={20} /> Comparación: {comparacion}</span>}
        <span className="flex items-center gap-2"><BarChart3 size={20} /> Corte de información: {fechaLarga(corte)}</span>
        <span className="flex items-center gap-2"><MapPin size={20} /> Cobertura: {cobertura}</span>
        <span className="flex items-center gap-2"><Database size={20} /> Fuente: {fuente}</span>
      </div>
      <img src="/assets/popayan-territorio-seguro-blanco.png" alt="Popayán Territorio Seguro" className="absolute h-[104px] w-auto" style={{ right: 36, top: 2 }} />
    </div>
  );
}

export function PieLamina({ fuente, nota }: { fuente: string; nota?: string }) {
  return (
    <div className="absolute bottom-0 left-0 flex h-[58px] w-full items-center justify-between overflow-hidden pl-5" style={{ background: `linear-gradient(90deg, ${C.verdeOscuro}, #0d4433 55%, ${C.verdeOscuro})` }}>
      <div className="absolute top-0 h-full" style={{ left: 860, width: 820, background: 'linear-gradient(90deg,#0f5038,#0c4431)', clipPath: 'polygon(60px 0,100% 0,100% 100%,0 100%)' }} />
      <div className="absolute top-0 h-full" style={{ left: 838, width: 80, background: C.lima, clipPath: 'polygon(60px 0,70px 0,10px 100%,0 100%)' }} />
      <p className="relative whitespace-nowrap text-[17px] text-white">{nota ? <><strong>Nota:</strong> {nota}</> : <><strong>Fuente:</strong> {fuente}. Información sujeta a variación.</>}</p>
      <img src="/assets/mepoy-footer-iconos-blanco.png" alt="Trabajo articulado · Prevención efectiva · Comunidad segura" className="relative mr-6 h-[56px] w-auto" />
    </div>
  );
}

// Textos según la fuente (mismo diseño para Delictividad y Operatividad).
export type FuenteLamina = 'delictividad' | 'operatividad';
const TEXTOS: Record<FuenteLamina, { consolidado: string; historico: string; total: string; mensual: string; top: string; columna: string; densidad: string }> = {
  delictividad: { consolidado: 'CONSOLIDADO DELICTIVO', historico: 'Histórico del comportamiento delictivo', total: 'Total delitos', mensual: 'Comportamiento mensual de delitos', top: 'Top 10 delitos', columna: 'Delito', densidad: 'Densidad delictiva' },
  operatividad: { consolidado: 'CONSOLIDADO OPERATIVO', historico: 'Histórico de la operatividad', total: 'Total resultados', mensual: 'Distribución mensual de resultados', top: 'Top 10 resultados operativos', columna: 'Resultado', densidad: 'Densidad operativa' },
};

// ── Mapa (silueta de la unidad con su mapa de calor) ───────────────────
// Proporción de la caja del mapa en la lámina (ancho / alto).
const ASPECTO_MAPA = 292 / 214;

export function MapaCobertura({ nodo, esGeneral, delitos, barrios, inicio, fin, fuente, aspecto = ASPECTO_MAPA }: {
  aspecto?: number; fuente: FuenteLamina; nodo: NodoMicrogerencia; esGeneral: boolean; delitos: string | readonly string[] | null; barrios: readonly string[]; inicio: string; fin: string;
}) {
  const [estado, setEstado] = useState<{ img?: string; cargando: boolean }>({ cargando: true });
  const clave = `${aspecto}|${fuente}|${nodo.nombre}|${nodo.estacion ?? ''}|${String(delitos)}|${barrios.join(',')}|${inicio}|${fin}`;
  useEffect(() => {
    let vivo = true;
    setEstado({ cargando: true });
    generarImagenMapaLaminaNodo(nodo, esGeneral, delitos, inicio, fin, { aspecto, ancho: 1000, barrios: barrios.length ? barrios : undefined }, fuente === 'operatividad' ? 'operatividad' : undefined)
      .then((img) => { if (vivo) setEstado({ img, cargando: false }); })
      .catch(() => { if (vivo) setEstado({ cargando: false }); });
    return () => { vivo = false; };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (estado.cargando) return <div data-mapa-cargando className="flex h-full items-center justify-center text-slate-400"><Loader2 size={26} className="animate-spin" /></div>;
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

/** Nombre de la unidad para encabezados (zonas y barrios con su estación). */
export function etiquetaUnidad(nodo: NodoMicrogerencia, esGeneral: boolean): string {
  if (esGeneral) return 'MEPOY General';
  const est = nodo.estacion ? nombreCorto(NOMBRES_ESTACION[nodo.estacion as keyof typeof NOMBRES_ESTACION] ?? nodo.estacion) : '';
  if (nodo.tipo === 'zona') return `${nombreCorto(nodo.nombre)}${est && !nodo.nombre.includes(nodo.estacion ?? '§') ? ` · ${est}` : ''}`;
  if (nodo.tipo === 'barrio') return `Barrio ${nodo.nombre}${est ? ` · ${est}` : ''}`;
  if (nodo.tipo === 'cai') return `${nombreCorto(nodo.nombre)}${est ? ` · ${est}` : ''}`;
  return nombreCorto(nodo.nombre);
}

export function InformeEjecutivoMicrogerencia({ datos, cobertura, onCobertura, barrios = [], fuente = 'delictividad' }: {
  datos: DatosMicrogerencia; cobertura: string; onCobertura: (ruta: string) => void; barrios?: readonly string[]; fuente?: FuenteLamina;
}) {
  const opciones = useMemo(() => opcionesCobertura(datos), [datos]);
  const opcion = opciones.find((o) => o.ruta === cobertura) ?? opciones[0];
  const nodo = opcion.nodo;
  const esGeneral = opcion.nivel === 0;
  const [topBarrios, setTopBarrios] = useState<3 | 5>(5);
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

  const corte = datos.fechaCorte ?? datos.actualFin;
  const tituloNodo = esGeneral ? 'MEPOY General' : nombreCorto(nodo.nombre);

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
      const lienzo = await capturarLamina(refLienzo.current);
      const nombre = `Microgerencia_${fuente === 'operatividad' ? 'Operatividad_' : ''}${tituloNodo.replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, '_')}_${corte}`;
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
        // Hoja horizontal con la MISMA proporción de la lámina (ancho A4):
        // sin franjas blancas arriba ni abajo.
        const anchoMm = 297;
        const altoMm = (anchoMm * ALTO) / ANCHO;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [anchoMm, altoMm] });
        pdf.addImage(lienzo.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, anchoMm, altoMm);
        pdf.save(`${nombre}.pdf`);
      }
    } finally {
      setEscala(anterior);
      setExportando('');
    }
  }

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
          <LaminaMicrogerencia ref={refLienzo} datos={datos} fuente={fuente} nodo={nodo} esGeneral={esGeneral} topBarrios={topBarrios} onTopBarrios={setTopBarrios} barriosFiltro={barrios} />
        </div>
      </div>
    </div>
  );
}

/** Espera a que el mapa y las imágenes de la lámina estén dibujados. */
// ── Tipografía de las láminas ────────────────────────────────────────────
// La lámina se diseña con Roboto Condensed. Si al dibujarla o capturarla la
// fuente aún no estaba descargada, el navegador usaba otra más ancha y los
// textos se montaban unos sobre otros («apeñuzcado»). Por eso: 1) se espera
// a que la fuente esté cargada antes de armar la lámina y 2) la imagen se
// genera con la fuente incrustada (no depende de lo instalado en el equipo).
let cssFuente: Promise<string> | null = null;
function cssFuenteEmbebida(): Promise<string> {
  cssFuente ??= fetch(urlFuenteLamina)
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
    .then((b) => new Promise<string>((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => mal(fr.error); fr.readAsDataURL(b); }))
    .then((d) => ['Roboto Condensed Variable', 'Roboto Condensed'].map((familia) =>
      `@font-face{font-family:'${familia}';font-style:normal;font-display:block;font-weight:100 900;src:url(${d}) format('woff2-variations'),url(${d}) format('woff2');}`).join('\n'))
    .catch(() => { cssFuente = null; return ''; });
  return cssFuente;
}

export async function cargarFuenteLamina(): Promise<void> {
  try {
    await Promise.all([400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 16px "Roboto Condensed Variable"`, 'Áa0–')));
    await document.fonts.ready;
  } catch { /* sin API de fuentes: se sigue igual */ }
}

export async function esperarLamina(el: HTMLElement, maxMs = 30000): Promise<void> {
  await cargarFuenteLamina();
  const t0 = Date.now();
  while (el.querySelector('[data-mapa-cargando]') && Date.now() - t0 < maxMs) await new Promise((r) => setTimeout(r, 200));
  await Promise.all(Array.from(el.querySelectorAll('img')).map((img) => (img.complete && img.naturalWidth > 0 ? null : img.decode().catch(() => null))));
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}

/** Lámina a lienzo (html-to-image, tamaño real ×2): idéntica a la pantalla. */
export async function capturarLamina(el: HTMLElement, pixelRatio = 2): Promise<HTMLCanvasElement> {
  await esperarLamina(el);
  const { toCanvas } = await import('html-to-image');
  const fontEmbedCSS = await cssFuenteEmbebida();
  return toCanvas(el, { pixelRatio, width: ANCHO, height: ALTO, backgroundColor: '#f3f5f4', cacheBust: false, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) });
}

/** La lámina ejecutiva (1672 × 941) de UNA unidad. */
export const LaminaMicrogerencia = forwardRef<HTMLDivElement, {
  datos: DatosMicrogerencia; nodo: NodoMicrogerencia; esGeneral: boolean; topBarrios: 3 | 5;
  onTopBarrios?: (n: 3 | 5) => void; barriosFiltro?: readonly string[]; fuente?: FuenteLamina;
}>(function LaminaMicrogerencia({ datos, nodo, esGeneral, topBarrios, onTopBarrios, barriosFiltro = [], fuente = 'delictividad' }, refLienzo) {
  const T = TEXTOS[fuente];
  const [menuTop, setMenuTop] = useState(false);
  const setTopBarrios = (n: 3 | 5) => onTopBarrios?.(n);
  const { anioActual: A, anioAnterior: P } = datos;
  const corte = datos.fechaCorte ?? datos.actualFin;
  const mesCorte = Number(corte.split('-')[1]) - 1;
  // Periodo «inteligente» según los filtros (meses, fechas o año a la fecha).
  const periodoA = datos.periodoEtiqueta ?? `Ene – ${MESES_CORTOS[mesCorte]} ${A}`;
  const periodoP = datos.comparacionEtiqueta ?? `Ene – ${MESES_CORTOS[mesCorte]} ${P}`;
  const rangoMeses = periodoA.replace(/\s\d{4}$/, '');
  const mesesSel = datos.mesesSeleccionados ?? [];
  const mesElegido = (i: number) => mesesSel.length === 0 || mesesSel.includes(i + 1);
  const sinProyeccion = mesesSel.length > 0 || /^\d/.test(periodoA);
  const tituloNodo = etiquetaUnidad(nodo, esGeneral);
  const tituloCorto = esGeneral ? 'MEPOY General' : nombreCorto(nodo.nombre);

  const proyDif = Math.round(nodo.difConAnioAnterior);
  const proyPct = nodo.total2025 > 0 ? (proyDif / nodo.total2025) * 100 : null;

  // Periodos sin consolidar: después del corte NO hay dato (no es «0»).
  const diaCorte = Number(corte.split('-')[2]);
  const mesParcial = diaCorte < new Date(A, mesCorte + 1, 0).getDate();
  const trimCorte = Math.floor(mesCorte / 3);
  const trimParcial = mesParcial || mesCorte % 3 !== 2;
  const datosTrim = nodo.trimestres.map((t, i) => {
    // Con filtro de meses: un trimestre sin meses elegidos no se compara
    // (queda en blanco) y uno cuyos meses elegidos aún no llegan, tampoco.
    const mesesTrim = [i * 3, i * 3 + 1, i * 3 + 2].filter(mesElegido);
    const fuera = mesesTrim.length === 0;
    const futuro = i > trimCorte || fuera || mesesTrim.every((m) => m > mesCorte);
    const pct = !futuro && t.anio2025 > 0 ? (t.dif / t.anio2025) * 100 : null;
    const parcial = !futuro && i === trimCorte && trimParcial;
    return { i, nombre: TRIM_CORTOS[i], sub: parcial ? `(${MESES_CORTOS[i * 3]} – ${MESES_CORTOS[mesCorte]})` : '', [P]: fuera ? null : t.anio2025, [A]: futuro ? null : t.anio2026, dif: futuro ? null : t.dif, pct, parcial, futuro };
  });
  // Meses fuera del filtro: «—» (no son cero, simplemente no se analizan).
  const datosMes = nodo.meses.map((m, i) => ({ nombre: MESES_CORTOS[i], [P]: mesElegido(i) ? m.anio2025 : null, [A]: i > mesCorte || !mesElegido(i) ? null : m.anio2026, dif: i > mesCorte || !mesElegido(i) ? null : m.dif, parcial: i === mesCorte && mesParcial }));
  const historico = (nodo.historico ?? []).map((h) => ({ anio: String(h.anio), casos: h.casos, parcial: h.parcial, actual: h.anio === A }));

  const barrios = [...(nodo.barrios ?? [])].sort((x, y) => y.casos - x.casos).slice(0, topBarrios);
  const top10 = [...nodo.delitos].sort((a, b) => b.fecha2026 - a.fecha2026).slice(0, 10);
  const subBase = subunidades(nodo, esGeneral);
  // Siempre de mayor a menor (casos del año actual al corte).
  const sub = { ...subBase, filas: [...subBase.filas].sort((x, y) => y.fecha2026 - x.fecha2026 || y.fecha2025 - x.fecha2025) };
  const tot = sub.filas.reduce((acc, f) => ({ t: acc.t + f.total2025, a: acc.a + f.fecha2025, b: acc.b + f.fecha2026 }), { t: 0, a: 0, b: 0 });
  const totDif = tot.b - tot.a;
  const totPct = tot.a > 0 ? (totDif / tot.a) * 100 : null;

  const analisisTrim = useMemo(() => analisisTrimestral(nodo, datosTrim, rangoMeses, A, P), [nodo, datosTrim, rangoMeses, A, P]);

  const ejeY = { fontSize: 14, fill: C.texto, fontFamily: FUENTE };
  const tip = { fontSize: 13, borderRadius: 8, fontFamily: FUENTE };

  return (
          <div ref={refLienzo} data-informe-microgerencia className="relative overflow-hidden" style={{ width: ANCHO, height: ALTO, background: '#f3f5f4', fontFamily: FUENTE, color: C.texto }}>

            <EncabezadoLamina titulo={T.consolidado} tituloCompleto={fuente === 'delictividad' ? TITULO_INFORME_DELICTIVO : undefined} periodo={periodoA} comparacion={periodoP} corte={corte} cobertura={esGeneral ? 'MEPOY (Popayán)' : tituloNodo} fuente="Aplicativo Los Andes" />

            {/* ── FILA 1 · KPI ───────────────────────────────────────── */}
            <div className="absolute flex items-center gap-4 overflow-hidden text-white" style={{ left: 20, top: 122, width: 362, height: 100, background: `linear-gradient(90deg, ${C.verde}, ${C.verdeMedio})`, clipPath: 'polygon(0 0,100% 0,calc(100% - 26px) 100%,0 100%)', borderRadius: '14px 0 0 14px' }}>
              <span className="ml-5 flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[12px] border-[3px] border-white"><BarChart3 size={36} strokeWidth={2.6} /></span>
              <p className="font-bold leading-[1.08]" style={{ fontSize: tituloCorto.length > 22 ? 23 : tituloCorto.length > 16 ? 27 : 32 }}>{tituloCorto}<span className="block">Consolidado</span></p>
              <span className="absolute top-0 h-full w-[7px]" style={{ right: 14, background: C.lima, transform: 'skewX(-14deg)' }} />
            </div>
            <Kpi x={392} w={160} icono={CalendarDays} etiqueta={`Total ${P}`} valor={<span className="text-[34px]">{formatNumero(nodo.total2025)}</span>} />
            <Kpi x={562} w={166} icono={CalendarDays} etiqueta={`${P}`} sub={`(${rangoMeses})`} valor={<span className="text-[34px]">{formatNumero(nodo.fecha2025)}</span>} />
            <Kpi x={738} w={167} icono={CalendarDays} etiqueta={`${A}`} sub={`(${rangoMeses})`} valor={<span className="text-[34px]">{formatNumero(nodo.fecha2026)}</span>} tono="verde" />
            <Kpi x={915} w={167} icono={BarChart3} etiqueta="Diferencia" sub={`(${A} – ${P})`} valor={<span className="text-[34px]">{signo(nodo.dif)}{formatNumero(nodo.dif)}</span>} tono={nodo.dif > 0 ? 'rosa' : 'blanco'} />
            <Kpi x={1092} w={158} icono={Percent} etiqueta="Variación" valor={<span className="text-[40px]">{pct0(nodo.pct)}</span>} tono={nodo.dif > 0 ? 'rosa' : 'blanco'} />
            {/* La proyección anual solo tiene sentido con el año a la fecha; con
                meses sueltos o fechas personalizadas no se proyecta. */}
            {sinProyeccion ? (
              <>
                <Kpi x={1260} w={195} icono={Target} etiqueta={`Proyectado ${A}`} sub="(no aplica)" valor={<span className="text-[30px] text-slate-400">N/A</span>} />
                <Kpi x={1465} w={187} icono={BarChart3} etiqueta={`Proy. vs ${P}`} sub="(periodo filtrado)" valor={<span className="text-[30px] text-slate-400">N/A</span>} tono="blanco" />
              </>
            ) : (
              <>
                <Kpi x={1260} w={195} icono={Target} etiqueta={`Proyectado ${A}`} sub="(Ene – Dic)" valor={<span className="text-[34px]">{formatNumero(Math.round(nodo.terminaAnio))}</span>} />
                <Kpi x={1465} w={187} icono={BarChart3} etiqueta={`Proy. vs ${P}`} valor={<span className="block text-[32px] leading-[1.05]">{signo(proyDif)}{formatNumero(proyDif)}<span className="block text-[27px]">({pct1(proyPct)})</span></span>} tono={proyDif > 0 ? 'rosa' : 'blanco'} />
              </>
            )}

            {/* ── FILA 2 ─────────────────────────────────────────────── */}
            <Panel x={14} y={232} w={573} h={270}>
              <TituloPanel
                icono={BarChart3}
                derecha={(
                  <div className="rounded-[6px] px-2 py-[2px] text-center text-[14.5px] font-bold leading-[1.15]" style={{ color: C.rojo, border: `1.5px solid ${C.rojo}`, background: '#fff5f5' }}>
                    Δ {A} vs {P}
                    <span className="block" style={{ color: colDif(nodo.dif) }}>{signo(nodo.dif)}{formatNumero(nodo.dif)} casos | {pct1(nodo.pct)}</span>
                  </div>
                )}
              ><span className="italic">{T.historico}</span></TituloPanel>
              <div className="relative min-h-0 flex-1 px-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={historico} margin={{ top: 26, right: 14, left: 2, bottom: 0 }} barCategoryGap="14%">
                    <CartesianGrid vertical={false} stroke="#edf0f1" />
                    <XAxis dataKey="anio" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} height={40}
                      tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
                        const h = historico.find((d) => d.anio === payload?.value);
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text dy={14} textAnchor="middle" style={{ fontSize: 15, fontWeight: 700, fill: C.texto, fontFamily: FUENTE }}>{payload?.value}</text>
                            {h?.parcial && <text dy={28} textAnchor="middle" style={{ fontSize: 11.5, fill: C.texto, fontFamily: FUENTE }}>({rangoMeses.replace(/ – /g, '–')})</text>}
                          </g>
                        );
                      }} />
                    <YAxis width={56} tick={ejeY} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEjeValores(historico.map((h) => h.casos))} allowDecimals={false} />
                    <Tooltip contentStyle={tip} formatter={(v) => formatNumero(Number(v))} />
                    <Bar dataKey="casos" name={T.total} isAnimationActive={false}>
                      {historico.map((h) => <Cell key={h.anio} fill={h.actual ? C.verde : '#8fcf9a'} />)}
                      <LabelList dataKey="casos" position="top" offset={9} style={{ fontSize: 17, fill: C.texto, fontWeight: 700, fontFamily: FUENTE }} formatter={(v: unknown) => formatNumero(Number(v))} />
                    </Bar>
                    <Line type="linear" dataKey="casos" name="Tendencia anual" stroke={C.azul} strokeWidth={2.4} dot={{ r: 4.5, fill: '#fff', stroke: C.azul, strokeWidth: 2.2 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center pb-1"><Leyenda items={[{ color: '#8fcf9a', texto: T.total }, { color: C.azul, texto: 'Tendencia anual', linea: true }]} /></div>
            </Panel>

            <Panel x={1148} y={232} w={512} h={270}>
              <TituloPanel icono={IconoLinea}>{T.mensual}</TituloPanel>
              <div className="relative h-[130px] pr-2">
                <div className="absolute right-4 top-0 z-[1] rounded bg-white/85 px-1"><Leyenda items={[{ color: C.azul, texto: String(P), linea: true }, { color: C.verdeVivo, texto: String(A), linea: true }]} /></div>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={datosMes} margin={{ top: 24, right: 12, left: 2, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mg-area-2025" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.azul} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={C.azul} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#edf0f1" />
                    <XAxis dataKey="nombre" hide />
                    <YAxis width={52} tick={{ ...ejeY, fontSize: 13 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEje(datosMes)} allowDecimals={false} />
                    <Tooltip contentStyle={tip} formatter={(v) => (v == null ? 'Sin consolidar' : formatNumero(Number(v)))} />
                    <Area type="monotone" dataKey={String(P)} stroke={C.azul} strokeWidth={2.4} fill="url(#mg-area-2025)" dot={{ r: 4, fill: '#fff', stroke: C.azul, strokeWidth: 2 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey={String(A)} stroke={C.verdeVivo} strokeWidth={2.8} connectNulls={false} dot={{ r: 4.5, fill: '#fff', stroke: C.verdeVivo, strokeWidth: 2.2 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <table className="mx-3 border-collapse text-center text-[15px] leading-[20px]" style={{ width: 'calc(100% - 24px)' }}>
                <thead><tr><th className="w-[52px]" />{datosMes.map((m) => <th key={m.nombre} className="pb-0.5 font-bold">{m.nombre}{m.parcial ? '*' : ''}</th>)}</tr></thead>
                <tbody>
                  <tr style={{ background: '#e7effc' }}><th className="rounded-l-md py-0.5 font-bold" style={{ color: C.azul }}>{P}</th>{datosMes.map((m) => <td key={m.nombre} className="py-0.5" style={{ color: m[P] == null ? '#a3acb2' : undefined }}>{m[P] == null ? '—' : formatNumero(Number(m[P]))}</td>)}</tr>
                  <tr style={{ background: '#e3f3e6' }}><th className="rounded-l-md py-0.5 font-bold" style={{ color: C.verdeDif }}>{A}</th>{datosMes.map((m) => <td key={m.nombre} className="py-0.5" style={{ color: m[A] == null ? '#a3acb2' : undefined }}>{m[A] == null ? '—' : formatNumero(Number(m[A]))}</td>)}</tr>
                  <tr><th className="py-0.5 font-bold">Dif.</th>{datosMes.map((m) => <td key={m.nombre} className="py-0.5 font-bold" style={{ color: m.dif == null ? '#a3acb2' : colDif(m.dif) }}>{m.dif == null ? '—' : `${signo(m.dif)}${formatNumero(m.dif)}`}</td>)}</tr>
                </tbody>
              </table>
              {(mesParcial || mesCorte < 11) && <p className="mt-0.5 px-3 text-[11px] leading-tight text-slate-500">{mesParcial ? `* ${MESES_LARGOS[mesCorte]} parcial (hasta el ${diaCorte}). ` : ''}{mesCorte < 11 ? '«—» = sin información consolidada aún.' : ''}</p>}
            </Panel>

            <Panel x={1102} y={512} w={558} h={346}>
              <TituloPanel
                icono={MapPin}
                derecha={(
                  <div className="relative">
                    <button type="button" onClick={() => setMenuTop((v) => !v)} className="flex items-center gap-2 whitespace-nowrap rounded-[8px] border bg-white px-3 py-1 text-[16px] font-bold" style={{ borderColor: C.borde, color: C.texto }}>
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
              >Mapa de Georreferenciación</TituloPanel>
              <div className="relative min-h-0 flex-1">
                {/* Mapa: ocupa la mayor parte del panel */}
                <div className="absolute" style={{ left: 6, top: 2, width: 330, bottom: 6 }}>
                  <MapaCobertura fuente={fuente} nodo={nodo} esGeneral={esGeneral} delitos={datos.delitosSeleccionados?.length ? datos.delitosSeleccionados : null} barrios={barriosFiltro} inicio={datos.actualInicio} fin={datos.actualFin} aspecto={330 / 284} />
                </div>
                <div className="absolute flex flex-col gap-1.5" style={{ left: 342, right: 8, top: 4 }}>
                  <div className="overflow-hidden rounded-[8px] border bg-white" style={{ borderColor: C.borde }}>
                    <p className="px-2.5 py-[3px] text-[15px] font-bold text-white" style={{ background: C.verde }}>Top {topBarrios} barrios ({A})</p>
                    {barrios.length === 0 ? <p className="px-2.5 py-2 text-[14px] text-slate-500">Sin barrios reportados.</p> : (
                      <ol className="px-1.5 py-0.5">
                        {barrios.map((b, i) => (
                          <li key={b.nombre} className="flex items-center gap-1 py-[1px] text-[14.5px]">
                            <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white" style={{ background: C.verdeVivo }}>{i + 1}</span>
                            <span className="min-w-0 flex-1 truncate" title={b.nombre}>{b.nombre}</span>
                            <span className="tabular-nums">{formatNumero(b.casos)}</span>
                            <span className="w-[44px] text-right text-[13px] tabular-nums">({formatDecimal(nodo.fecha2026 > 0 ? (b.casos / nodo.fecha2026) * 100 : 0, 1)}%)</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                  <div className="rounded-[8px] border bg-white px-2.5 py-1 text-[14px]" style={{ borderColor: C.borde }}>
                    <p className="font-bold leading-tight">{T.densidad}</p>
                    <div className="mt-0.5 h-[11px] rounded-[3px]" style={{ background: 'linear-gradient(90deg,#22b33a,#a6d84a,#f7e33b,#f59a2b,#e3262f)' }} />
                    <div className="flex justify-between text-[13px] font-bold leading-tight"><span>Baja</span><span>Alta</span></div>
                  </div>
                </div>
              </div>
            </Panel>

            {/* ── FILA 3 ─────────────────────────────────────────────── */}
            <Panel x={12} y={512} w={574} h={346}>
              <TituloPanel icono={ShieldCheck}>{T.top} <span className="text-[17px] font-normal">(consolidado)</span></TituloPanel>
              <table className="mx-4 mt-2 border-collapse text-[16.5px]" style={{ width: 'calc(100% - 32px)' }}>
                <thead>
                  <tr className="text-left font-bold">
                    <th className="w-[26px] pb-1">#</th><th className="pb-1">{T.columna}</th>
                    <th className="pb-1 text-right">Total {P}</th><th className="pb-1 text-right">{P}</th><th className="pb-1 text-right">{A}</th>
                    <th className="pb-1 text-right">Dif.</th><th className="pb-1 pr-1 text-right">Variación</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((d, i) => (
                    <tr key={d.nombre} className="leading-[25.5px]">
                      <td>{i + 1}</td>
                      <td className="max-w-[230px] truncate pr-2" title={d.nombre}>{d.nombre}</td>
                      <td className="text-right font-bold">{formatNumero(d.total2025)}</td>
                      <td className="text-right">{formatNumero(d.fecha2025)}</td>
                      <td className="text-right font-bold">{formatNumero(d.fecha2026)}</td>
                      <td className="text-right font-bold" style={{ color: colDif(d.dif) }}>{signo(d.dif)}{formatNumero(d.dif)}</td>
                      <td className="pr-1 text-right font-bold" style={{ color: colDif(d.dif) }}>{pct0(d.pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            <Panel x={597} y={512} w={494} h={346}>
              <TituloPanel icono={sub.filas.length ? Landmark : MapPin}>{sub.filas.length ? `${sub.titulo} (${esGeneral ? 'MEPOY – General' : tituloCorto})` : <>Barrios más afectados <span className="text-[17px] font-normal">({A})</span></>}</TituloPanel>
              {sub.filas.length === 0 ? (
                (nodo.barrios ?? []).length === 0 ? (
                  <p className="px-4 py-8 text-center text-[16px] text-slate-500">Sin barrios reportados para esta unidad en el periodo.</p>
                ) : (
                  <table className="mx-3 mt-2 border-collapse text-[16px]" style={{ width: 'calc(100% - 24px)' }}>
                    <thead>
                      <tr className="font-bold" style={{ background: '#eef1f2' }}>
                        <th className="rounded-l-md px-2 py-0.5 text-left">#</th><th className="py-0.5 text-left">Barrio</th>
                        <th className="py-0.5 text-right">Casos {A}</th><th className="py-0.5 pl-3 text-left">Participación</th><th className="rounded-r-md px-2 py-0.5 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(nodo.barrios ?? []).slice(0, 10).map((b, i, arr) => (
                        <tr key={b.nombre} className="leading-[25px]">
                          <td className="px-2">{i + 1}</td>
                          <td className="max-w-[170px] truncate" title={b.nombre}>{b.nombre}</td>
                          <td className="text-right font-bold tabular-nums">{formatNumero(b.casos)}</td>
                          <td className="pl-3"><div className="h-[13px] rounded-[2px]" style={{ width: `${Math.max(3, (b.casos / Math.max(1, arr[0].casos)) * 120)}px`, background: C.verde }} /></td>
                          <td className="px-2 text-right tabular-nums">{formatDecimal(nodo.fecha2026 > 0 ? (b.casos / nodo.fecha2026) * 100 : 0, 1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
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
                    <p className="whitespace-nowrap text-[17px] font-bold">Comparativo por {sub.singular === 'CAI' ? 'CAI' : sub.singular.toLowerCase()} ({P} vs {A})</p>
                    <Leyenda items={[{ color: C.gris2025, texto: String(P) }, { color: C.verde, texto: String(A) }]} />
                  </div>
                  <div className="min-h-0 flex-1 px-1 pb-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sub.filas.slice(0, 8).map((f) => ({ nombre: nombreCorto(f.nombre), [P]: f.fecha2025, [A]: f.fecha2026 }))} margin={{ top: 18, right: 12, left: 0, bottom: 0 }} barGap={3} barCategoryGap="22%">
                        <CartesianGrid vertical={false} stroke="#edf0f1" />
                        <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} height={38}
                          tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
                            // Nombre partido en dos renglones (sin montarse con el vecino).
                            const n = Math.min(8, sub.filas.length);
                            const tam = n > 5 ? 11.5 : 13.5;
                            const maxCar = Math.floor(470 / Math.max(1, n) / (tam * 0.45));
                            const palabras = String(payload?.value ?? '').split(/\s+/);
                            const lineas: string[] = [''];
                            for (const w of palabras) {
                              const actual = lineas[lineas.length - 1];
                              if (!actual || (actual + ' ' + w).length <= maxCar) lineas[lineas.length - 1] = actual ? `${actual} ${w}` : w;
                              else if (lineas.length < 2) lineas.push(w);
                              else lineas[1] = `${lineas[1]} ${w}`;
                            }
                            const corta = (t: string) => (t.length > maxCar ? `${t.slice(0, Math.max(3, maxCar - 1))}…` : t);
                            return (
                              <g transform={`translate(${x},${y})`}>
                                {lineas.map((l, i) => <text key={i} dy={12 + i * (tam + 1)} textAnchor="middle" style={{ fontSize: tam, fill: C.texto, fontFamily: FUENTE }}>{corta(l)}</text>)}
                              </g>
                            );
                          }} />
                        <YAxis width={48} tick={{ ...ejeY, fontSize: 12 }} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} />
                        <Tooltip contentStyle={tip} formatter={(v) => formatNumero(Number(v))} />
                        <Bar dataKey={String(P)} fill={C.gris2025} isAnimationActive={false}>
                          <LabelList dataKey={String(P)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="izq" tam={sub.filas.length > 5 ? 11.5 : 13} />} />
                        </Bar>
                        <Bar dataKey={String(A)} fill={C.verde} isAnimationActive={false}>
                          <LabelList dataKey={String(A)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="der" tam={sub.filas.length > 5 ? 11.5 : 13} />} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </Panel>

            <Panel x={598} y={232} w={540} h={270}>
              <TituloPanel icono={BarChart3} derecha={<Leyenda items={[{ color: C.gris2025, texto: String(P) }, { color: C.verde, texto: String(A) }]} />}>Comportamiento trimestral</TituloPanel>
              <div className="relative min-h-0 flex-1">
                <div className="absolute grid grid-cols-4 text-center" style={{ left: 64, right: 12, top: 4 }}>
                  {datosTrim.map((t) => (
                    <div key={t.nombre} className="flex justify-center">
                      {t.dif == null ? <span className="text-[13px] text-slate-400">—</span> : (
                        <span className="whitespace-nowrap rounded-[5px] px-1.5 text-center text-[13px] font-bold leading-[1.15]" style={{ color: colDif(t.dif), border: `1.5px solid ${colDif(t.dif)}`, background: t.dif > 0 ? '#fff1f2' : t.dif < 0 ? '#ecf8ef' : '#fff' }}>
                          {signo(t.dif)}{formatNumero(t.dif)}{t.parcial ? '*' : ''} <span className="text-[11.5px]">({pct1(t.pct)})</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosTrim} margin={{ top: 46, right: 12, left: 8, bottom: 0 }} barGap={4} barCategoryGap="20%">
                    <CartesianGrid vertical={false} stroke="#edf0f1" />
                    <XAxis dataKey="nombre" axisLine={{ stroke: '#9aa3a8' }} tickLine={false} interval={0} height={36}
                      tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
                        const t = datosTrim.find((d) => d.nombre === payload?.value);
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text dy={14} textAnchor="middle" style={{ fontSize: 15, fill: C.texto, fontFamily: FUENTE }}>{payload?.value}</text>
                            {t?.sub && <text dy={28} textAnchor="middle" style={{ fontSize: 12.5, fill: C.texto, fontFamily: FUENTE }}>{t.sub}</text>}
                          </g>
                        );
                      }} />
                    <YAxis width={56} tick={ejeY} axisLine={{ stroke: '#9aa3a8' }} tickLine={false} tickFormatter={(v) => formatNumero(v)} domain={[0, (max: number) => techoBonito(max)]} ticks={marcasEje(datosTrim)} allowDecimals={false} />
                    <Tooltip contentStyle={tip} formatter={(v) => (v == null ? 'Sin consolidar' : formatNumero(Number(v)))} />
                    <Bar dataKey={String(P)} fill={C.gris2025} isAnimationActive={false}>
                      <LabelList dataKey={String(P)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="izq" />} />
                    </Bar>
                    <Bar dataKey={String(A)} fill={C.verde} isAnimationActive={false}>
                      <LabelList dataKey={String(A)} content={(props) => <EtiquetaBarra {...(props as EtiquetaProps)} lado="der" />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mx-3 mb-2 mt-1 flex items-start gap-2 rounded-[10px] px-2.5 py-1.5" style={{ background: '#fbf3df', border: '1px solid #efe0b8' }}>
                <span className="mt-0.5 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full border-2" style={{ borderColor: '#b07a1e', color: '#b07a1e' }}><Info size={15} strokeWidth={2.6} /></span>
                <p className="text-[11.5px] leading-[1.2]"><strong>Análisis trimestral:</strong> {analisisTrim}</p>
              </div>
            </Panel>

            <PieLamina fuente="Aplicativo Los Andes" />
          </div>
  );
});
