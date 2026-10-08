import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BarChart3, Building2, CalendarDays, Car, ChevronRight, CloudUpload,
  Crosshair, Database, FileText, House, Landmark, ListChecks, Map as MapIcon, MapPin, MapPinned, RefreshCcw, Scale, Smartphone,
  Sword, Target, TrendingDown, TrendingUp, Upload, UserRound, Users,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { pedirClaveSesion, revisarErrorDeClave, MENSAJE_SIN_CLAVE } from '../utils/claveSesion';
import { leerMatrizComparendos, ultimaColumnaFuncionario, type RegistroComparendo } from '../data/rnmcParser';
import { guardarComparendos, cargarComparendos, descargarComparendosSupabase, subirComparendosSupabase } from '../data/rnmcStorage';
import { sincronizarCapaRnmcDesdeComparendos } from '../data/puntosStorage';
import { Card } from '../components/ui/Card';
import { IconoTitulo, SelectorTop, TarjetaRanking, rankear, type TopModo } from '../components/rnmc/RankingRnmc';
import { EvolucionTemporalRnmc, SelectorVista, TendenciaAnualDelito, TendenciaMini } from '../components/rnmc/GraficosRnmc';
import { MapaRnmc } from '../components/rnmc/MapaRnmc';
import { formatDecimal } from '../utils/aggregations';

const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';

// "NO APLICA LOCALIDAD - COMUNA" (comparendos fuera de las comunas de
// Popayán) no es una comuna: se deja por fuera de la tarjeta Comuna y del
// conteo de comunas. Los comparendos siguen contando en todo lo demás.
// Fecha del comparendo: la que viene del servidor llega como medianoche UTC
// ("2026-05-10") y en Colombia caería el día anterior — se lee en UTC en
// ese caso, y en hora local cuando la fecha salió del Excel.
function partesFecha(f: Date | null): { mes: number; dia: number; diaSemana: number } | null {
  if (!f || isNaN(f.getTime())) return null;
  const utc = f.getUTCHours() === 0 && f.getUTCMinutes() === 0 && f.getHours() !== 0;
  return utc
    ? { mes: f.getUTCMonth() + 1, dia: f.getUTCDate(), diaSemana: f.getUTCDay() }
    : { mes: f.getMonth() + 1, dia: f.getDate(), diaSemana: f.getDay() };
}
const DIAS_RNMC = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const comunaValida = (r: RegistroComparendo) => (/NO\s*APLICA/i.test(r.comuna) ? '' : r.comuna);

// Los tres comportamientos que se piden siempre juntos, en un solo
// componente — confirmados contra el archivo real (Art. 95, no 91: ese
// artículo no existe en la matriz, "Art. 95 Num. 1" sí, con 457 casos).
const COMPORTAMIENTOS_DESTACADOS = ['Art. 27 Num. 6', 'Art. 95 Num. 1', 'Art. 27 Num. 7'];

function conAporte(items: RegistroComparendo[], campo: (r: RegistroComparendo) => string, n: TopModo | number) {
  return rankear(items, campo, n);
}

const NOMBRE_DELITO: Record<string, string> = { 'H. Personas': 'Hurto a Personas', 'L. Personales': 'Lesiones Personales' };

// Ícono de cada comportamiento (solo presentación).
function iconoComportamiento(clave: string): ReactNode {
  if (/Art\. 27 Num\. 6/.test(clave)) return <Sword size={18} />;
  if (/Art\. 27 Num\. 7/.test(clave)) return <Crosshair size={18} />;
  if (/Art\. 95/.test(clave)) return <Smartphone size={18} />;
  if (/Art\. 140/.test(clave)) return <Car size={18} />;
  if (/Art\. 35/.test(clave)) return <AlertTriangle size={18} />;
  return <FileText size={18} />;
}

/**
 * "Aplicación Ley 1801 CNSCC": primero los 3 comportamientos destacados de
 * siempre (Art. 27 Num. 6, Art. 95 Num. 1, Art. 27 Num. 7) y luego los más
 * frecuentes hasta completar 5; "Ver todos" muestra la lista completa.
 * Casos = conteo real; % = casos / total de comparendos con estos filtros.
 */
function AplicacionLey1801({ registros }: { registros: RegistroComparendo[] }) {
  const [verTodos, setVerTodos] = useState(false);
  const filas = useMemo(() => {
    const total = registros.length;
    const porClave = new Map<string, { casos: number; texto: string }>();
    for (const r of registros) {
      if (!r.articuloNumeral) continue;
      const v = porClave.get(r.articuloNumeral) ?? { casos: 0, texto: r.comportamientoTexto };
      v.casos++;
      porClave.set(r.articuloNumeral, v);
    }
    const destacados = COMPORTAMIENTOS_DESTACADOS.map((clave) => ({ clave, casos: porClave.get(clave)?.casos ?? 0, texto: porClave.get(clave)?.texto ?? '' }));
    const resto = Array.from(porClave.entries())
      .filter(([clave]) => !COMPORTAMIENTOS_DESTACADOS.includes(clave))
      .sort((x, y) => y[1].casos - x[1].casos)
      .map(([clave, v]) => ({ clave, casos: v.casos, texto: v.texto }));
    return [...destacados, ...resto].map((f) => ({ ...f, pct: total > 0 ? (f.casos / total) * 100 : 0 }));
  }, [registros]);
  const visibles = verTodos ? filas : filas.slice(0, 5);
  const tonos = ['bg-[#e6f0fb] text-[#1e4f8f]', 'bg-[#eef2f7] text-[#10233f]', 'bg-[#e3f2ef] text-[#116762]', 'bg-[#eef2f7] text-[#10233f]', 'bg-rose-50 text-rose-600'];
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-[#0f5f57] px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15"><Scale size={18} /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight">Aplicación Ley 1801 CNSCC</p>
            <p className="truncate text-[11.5px] text-white/80">Comportamientos contrarios a la convivencia más frecuentes asociados al delito</p>
          </div>
        </div>
        <button type="button" onClick={() => setVerTodos((v) => !v)} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/40 px-2.5 py-1 text-[11.5px] font-semibold hover:bg-white/10">
          <ListChecks size={14} /> {verTodos ? 'Ver menos' : 'Ver todos'} <ArrowRight size={13} />
        </button>
      </div>
      <div className={`space-y-2 p-3 ${verTodos ? 'max-h-[420px] overflow-y-auto' : ''}`}>
        {visibles.map((f, i) => (
          <div key={f.clave} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tonos[i % tonos.length]}`}>{iconoComportamiento(f.clave)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold text-[#10233f]">{f.clave}</p>
              {f.texto && <p className="line-clamp-2 text-[11px] leading-snug text-slate-500" title={f.texto}>{f.texto}</p>}
            </div>
            <div className="w-[64px] shrink-0 rounded-md bg-[#e3f2ef] px-2 py-1 text-center">
              <p className="text-[15px] font-bold tabular-nums text-[#0b4a46]">{f.casos.toLocaleString('es-CO')}</p>
              <p className="text-[10.5px] tabular-nums text-[#116762]">{formatDecimal(f.pct, 1)}%</p>
            </div>
          </div>
        ))}
        {visibles.length === 0 && <p className="py-6 text-center text-xs text-slate-400">No hay comparendos para los filtros seleccionados.</p>}
      </div>
    </section>
  );
}

function KpiDelito({ valor, etiqueta, icono, tono, fondoIcono }: { valor: string; etiqueta: string; icono: ReactNode; tono: string; fondoIcono: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-3 ${tono}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg shadow-sm ${fondoIcono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[21px] font-bold leading-tight tabular-nums">{valor}</p>
        <p className="text-[11.5px] leading-tight text-slate-600">{etiqueta}</p>
      </div>
    </div>
  );
}

/** Vista "Delitos vs RNMC": el delito (Delictividad) junto a la aplicación de la Ley 1801 (RNMC). */
function VistaComparativa({ delito, registrosRnmc }: { delito: string; registrosRnmc: RegistroComparendo[] }) {
  const { filteredRecords } = useData();
  const registrosDelito = useMemo(() => filteredRecords.filter((r) => r.delito === delito), [filteredRecords, delito]);

  const total2025 = registrosDelito.filter((r) => r.anio === 2025).length;
  const total2026 = registrosDelito.filter((r) => r.anio === 2026).length;
  const dif = total2026 - total2025;
  const pct = total2025 > 0 ? Math.round((dif / total2025) * 100) : null;
  const bajo = dif < 0;

  const nombreArchivo = delito.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
  const titulo = NOMBRE_DELITO[delito] ?? delito;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.12fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 bg-[#10233f] px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15"><UserRound size={18} /></span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-tight">Delito {titulo}</p>
                <p className="truncate text-[11.5px] text-white/80">Comparativo anual y variación del comportamiento del delito</p>
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/40 px-2.5 py-1 text-[11.5px] font-semibold">Comparativo anual 2025 vs 2026</span>
          </div>
          <div className="p-4">
            <div>
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiDelito valor={total2025.toLocaleString('es-CO')} etiqueta="2025 (a la fecha)" icono={<FileText size={20} className="text-[#2563eb]" />} fondoIcono="bg-white" tono="bg-[#eaf2fd] text-[#10233f]" />
                <KpiDelito valor={total2026.toLocaleString('es-CO')} etiqueta="2026 (a la fecha)" icono={<BarChart3 size={20} className="text-[#10b981]" />} fondoIcono="bg-white" tono="bg-[#e7f6ef] text-[#10233f]" />
                <KpiDelito valor={`${dif >= 0 ? '+' : ''}${dif.toLocaleString('es-CO')}`} etiqueta="Diferencia" icono={bajo ? <ArrowDown size={20} className="text-white" /> : <ArrowUp size={20} className="text-white" />} fondoIcono="rounded-full bg-[#ef4444]" tono="bg-[#fdeceb] text-[#dc2626]" />
                <KpiDelito valor={pct == null ? 'N/A' : `${pct >= 0 ? '+' : ''}${pct}%`} etiqueta="Variación" icono={bajo ? <TrendingDown size={20} className="text-[#0f766e]" /> : <TrendingUp size={20} className="text-[#0f766e]" />} fondoIcono="bg-white" tono="bg-[#e7f6ef] text-[#0f766e]" />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[13.5px] font-bold text-[#10233f]">Tendencia mensual del delito</p>
                <span className="flex items-center gap-3 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#a5b4cb]" />2025</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#159089]" />2026</span>
                </span>
              </div>
              <TendenciaAnualDelito items={registrosDelito} anioA={2025} anioB={2026} />
            </div>
          </div>
        </section>

        <AplicacionLey1801 registros={registrosRnmc} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TarjetaRanking titulo="CAI más afectado" icono={<IconoTitulo><Building2 size={17} /></IconoTitulo>} registros={registrosDelito} campo={(r) => r.cai} archivo={`${nombreArchivo}-cai`} resaltarMaximo />
        <TarjetaRanking titulo="Barrios más afectados" icono={<IconoTitulo><House size={17} /></IconoTitulo>} registros={registrosDelito} campo={(r) => r.barrioHecho} archivo={`${nombreArchivo}-barrios`} resaltarMaximo />
        <TarjetaRanking titulo="Patrulla / Cuadrante" icono={<IconoTitulo><MapPinned size={17} /></IconoTitulo>} registros={registrosRnmc} campo={(r) => r.zonaAtencionHechos} archivo="rnmc-patrulla-cuadrante" resaltarMaximo />
        <TarjetaRanking titulo="Unidad policial" icono={<IconoTitulo tono="bg-[#e3f2ef] text-[#116762]"><Landmark size={17} /></IconoTitulo>} registros={registrosRnmc} campo={(r) => r.unidadPolicial} archivo="rnmc-unidad" resaltarMaximo topInicial={5} />
        <TarjetaRanking titulo="Comuna" icono={<IconoTitulo tono="bg-[#e3f2ef] text-[#116762]"><MapPin size={17} /></IconoTitulo>} registros={registrosRnmc} campo={comunaValida} archivo="rnmc-comuna" resaltarMaximo topInicial={5} />
        <TarjetaRanking titulo="Funcionario policial" icono={<IconoTitulo tono="bg-[#e3f2ef] text-[#116762]"><Users size={17} /></IconoTitulo>} registros={registrosRnmc} campo={(r) => r.funcionario} archivo="rnmc-funcionario" resaltarMaximo topInicial={5} />
        {/* Se conservan las dos tarjetas que ya tenía esta vista. */}
        <TarjetaRanking titulo="Armas más empleadas" icono={<IconoTitulo><Crosshair size={17} /></IconoTitulo>} registros={registrosDelito} campo={(r) => r.armas} archivo={`${nombreArchivo}-armas`} resaltarMaximo topInicial={5} />
        <TarjetaRanking titulo="Modalidades más presentadas" icono={<IconoTitulo><Target size={17} /></IconoTitulo>} registros={registrosDelito} campo={(r) => r.modalidad} archivo={`${nombreArchivo}-modalidades`} resaltarMaximo topInicial={5} />
      </div>
    </div>
  );
}

function KpiGeneral({ valor, titulo, detalle, icono, tono, fondoIcono, extra }: { valor: ReactNode; titulo: string; detalle?: string; icono: ReactNode; tono: string; fondoIcono: string; extra?: ReactNode }) {
  return (
    <div className={`relative flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-3 ${tono}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fondoIcono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[21px] font-extrabold leading-none tabular-nums text-[#10233f]">{valor}</p>
        <p className="mt-1 text-[11.5px] font-medium leading-tight text-[#1f3352]">{titulo}</p>
        {detalle && <p className="text-[10.5px] leading-tight text-slate-500">{detalle}</p>}
      </div>
      {extra && <span className="absolute right-2 top-2 opacity-80">{extra}</span>}
    </div>
  );
}

function TarjetaDistribucion({ registros }: { registros: RegistroComparendo[] }) {
  const [top, setTop] = useState<TopModo>(10);
  const filas = useMemo(() => rankear(registros, (r) => r.zonaAtencionHechos, top), [registros, top]);
  return (
    <Card title="Distribución geográfica" icono={<IconoTitulo><MapIcon size={17} /></IconoTitulo>} claseTitulo="text-[13.5px] font-bold leading-snug text-[#10233f]" actions={<SelectorTop valor={top} onChange={setTop} />}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <MapaRnmc registros={registros} />
        <div className="min-w-0">
          <p className="mb-1.5 text-[11.5px] font-bold text-[#10233f]">{top === 'todos' ? 'Todas las zonas de atención' : `Top ${top} zonas de atención`}</p>
          <div className={top === 'todos' ? 'max-h-[300px] overflow-y-auto pr-1' : ''}>
            <TablaTop filas={filas} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Tabla compacta sin barras (para la lista junto al mapa). */
function TablaTop({ filas }: { filas: { key: string; casos: number; aportePct: number }[] }) {
  if (filas.length === 0) return <p className="py-6 text-center text-xs text-slate-400">Sin datos.</p>;
  return (
    <table className="text-[11.5px]">
      <thead>
        <tr className="text-[10.5px] text-slate-500">
          <th className="pb-1 pr-2 text-left font-semibold">#</th>
          <th className="pb-1 pr-3 text-left font-semibold">Zona</th>
          <th className="pb-1 pr-3 text-right text-[10px] font-semibold">Registros</th>
          <th className="pb-1 text-right text-[10px] font-semibold">Aporte</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.key} className="border-t border-slate-100">
            <td className="py-[4px] pr-2 font-semibold tabular-nums text-slate-600">{i + 1}</td>
            <td className="max-w-[118px] truncate whitespace-nowrap py-[4px] pr-3 text-slate-700" title={f.key}>{f.key}</td>
            <td className="py-[4px] pr-3 text-right font-bold tabular-nums text-[#10233f]">{f.casos.toLocaleString('es-CO')}</td>
            <td className="py-[4px] text-right tabular-nums text-slate-500">{formatDecimal(f.aportePct, 1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TarjetaEvolucion({ registros }: { registros: RegistroComparendo[] }) {
  const [vista, setVista] = useState<'mensual' | 'semanal'>('mensual');
  return (
    <Card title="Evolución temporal" descargable="rnmc-evolucion" icono={<IconoTitulo><CalendarDays size={17} /></IconoTitulo>} claseTitulo="text-[13.5px] font-bold leading-snug text-[#10233f]" actions={<SelectorVista valor={vista} onChange={setVista} />}>
      <EvolucionTemporalRnmc items={registros} vista={vista} />
    </Card>
  );
}

export function Rnmc() {
  const { filters } = useData();
  const [registros, setRegistros] = useState<RegistroComparendo[] | null>(null);
  const [fechaCarga, setFechaCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [modoActivo, setModoActivo] = useState<'todos' | 'H. Personas' | 'L. Personales' | string>('todos');

  const { backendUrl, supabaseAnonKey } = obtenerConfig();
  const sincronizacionDisponible = !!backendUrl && !!supabaseAnonKey;

  useEffect(() => {
    (async () => {
      if (sincronizacionDisponible) {
        try {
          const remotosCrudos = await descargarComparendosSupabase(backendUrl, supabaseAnonKey);
          // Los comparendos del servidor que se subieron con una versión
          // anterior del lector no traen el funcionario (la columna cambió de
          // POLICIA_IMPUSO a POLICIA_IMPONE). Si este navegador ya tiene esa
          // información (mismo expediente), se completa con ella en vez de
          // mostrar la tarjeta vacía.
          const localPrevio = await cargarComparendos();
          const funcionarioLocal = new Map((localPrevio?.registros ?? []).filter((r) => r.funcionario).map((r) => [r.__id, r.funcionario]));
          const remotos = remotosCrudos.map((r) => (r.funcionario || !funcionarioLocal.has(r.__id) ? r : { ...r, funcionario: funcionarioLocal.get(r.__id)! }));
          const sinFuncionario = remotos.filter((r) => !r.funcionario).length;
          if (remotos.length > 0 && sinFuncionario / remotos.length > 0.5) {
            setAviso('Los comparendos guardados en el servidor no traen el funcionario que impone (se subieron con una versión anterior). Vuelve a cargar la matriz RNMC para actualizarlos.');
          }
          if (remotos.length > 0) {
            setRegistros(remotos);
            setFechaCarga(new Date().toISOString());
            await guardarComparendos(remotos);
            sincronizarCapaRnmcDesdeComparendos(remotos).catch(() => {});
            return;
          }
        } catch { /* sin servidor disponible por ahora — se sigue con el local */ }
      }
      const local = await cargarComparendos();
      if (local) {
        setRegistros(local.registros);
        setFechaCarga(local.fecha);
        sincronizarCapaRnmcDesdeComparendos(local.registros).catch(() => {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manejarArchivo(file: File) {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const leidos = await leerMatrizComparendos(file);
      if (leidos.length === 0) throw new Error('El archivo no tiene filas de datos.');
      // Confirmación visible de dónde salió "Funcionario policial".
      const conFuncionario = leidos.filter((r) => r.funcionario).length;
      const { columna, candidatas } = ultimaColumnaFuncionario;
      const resumenFuncionario = columna
        ? `Funcionario policial: columna "${columna}" — ${conFuncionario.toLocaleString('es-CO')} de ${leidos.length.toLocaleString('es-CO')} comparendos con funcionario.`
        : `No se encontró la columna del funcionario que impone (se buscó POLICIA_IMPONE / POLICIA_IMPUSO). Columnas parecidas en el archivo: ${candidatas.join(', ') || 'ninguna'}.`;
      await guardarComparendos(leidos);
      setRegistros(leidos);
      setFechaCarga(new Date().toISOString());
      setModoActivo('todos');
      sincronizarCapaRnmcDesdeComparendos(leidos).catch(() => {});

      if (!sincronizacionDisponible) setAviso(resumenFuncionario);
      if (sincronizacionDisponible) {
        setSincronizando(true);
        try {
          const clave = pedirClaveSesion('subir los comparendos RNMC');
          if (!clave) throw new Error(MENSAJE_SIN_CLAVE);
          await subirComparendosSupabase(FUNCION_SUBIR_REGISTROS, clave, leidos, 'No identificado');
          setAviso(`Sincronizado con el servidor central — todas las personas verán esta actualización. ${resumenFuncionario}`);
        } catch (e) {
          revisarErrorDeClave(e);
          setAviso(`Los datos quedaron guardados en este navegador, pero no se pudo sincronizar con el servidor: ${e instanceof Error ? e.message : 'error desconocido'}. ${resumenFuncionario} Mientras no se sincronice, al recargar la página se volverán a ver los datos viejos del servidor.`);
        } finally {
          setSincronizando(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  const registrosFiltradosPorFecha = useMemo(() => {
    if (!registros) return [];
    return registros.filter((r) => {
      if (filters.anio.length > 0 && (r.anio == null || !filters.anio.includes(String(r.anio)))) return false;
      // Mes, día de la semana y día del mes del filtro principal también aplican a RNMC.
      const p = partesFecha(r.fecha);
      if (filters.mes.length > 0 && (!p || !filters.mes.includes(String(p.mes)))) return false;
      if ((filters.diaMes ?? []).length > 0 && (!p || !filters.diaMes.includes(String(p.dia)))) return false;
      if (filters.diaSemana.length > 0) {
        if (!p) return false;
        const dia = DIAS_RNMC[p.diaSemana];
        if (!filters.diaSemana.some((d) => d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() === dia)) return false;
      }
      if (filters.fechaInicial && (!r.fecha || r.fecha < new Date(filters.fechaInicial))) return false;
      if (filters.fechaFinal && (!r.fecha || r.fecha > new Date(`${filters.fechaFinal}T23:59:59`))) return false;
      return true;
    });
  }, [registros, filters.anio, filters.mes, filters.diaMes, filters.diaSemana, filters.fechaInicial, filters.fechaFinal]);

  const comportamientosDisponibles = useMemo(
    () => conAporte(registrosFiltradosPorFecha, (r) => r.articuloNumeral, 12).map((c) => c.key),
    [registrosFiltradosPorFecha],
  );

  const registrosVista = useMemo(
    () => (modoActivo === 'todos' || modoActivo === 'H. Personas' || modoActivo === 'L. Personales' ? registrosFiltradosPorFecha : registrosFiltradosPorFecha.filter((r) => r.articuloNumeral === modoActivo)),
    [registrosFiltradosPorFecha, modoActivo],
  );

  const resumen = useMemo(() => {
    if (!registrosFiltradosPorFecha.length) return null;
    const zonas = new Set(registrosFiltradosPorFecha.map((r) => r.zonaAtencionHechos).filter(Boolean));
    const comunas = new Set(registrosFiltradosPorFecha.map(comunaValida).filter(Boolean));
    const funcionarios = new Set(registrosFiltradosPorFecha.map((r) => r.funcionario).filter(Boolean));
    const conMediacion = registrosFiltradosPorFecha.filter((r) => r.mediacionInSitu).length;
    const top = conAporte(registrosFiltradosPorFecha, (r) => r.articuloNumeral, 1)[0];
    return { total: registrosFiltradosPorFecha.length, zonas: zonas.size, comunas: comunas.size, funcionarios: funcionarios.size, conMediacion, top };
  }, [registrosFiltradosPorFecha]);

  const esModoDelictividad = modoActivo === 'H. Personas' || modoActivo === 'L. Personales';

  // Botones de Hurto/Lesiones — a pedido explícito, funcionan como
  // INTERRUPTOR: si ya estaba activo ese mismo, un segundo clic lo
  // desactiva y regresa al panel principal (Todos), igual para los dos.
  function alternarModoDelictividad(clave: 'H. Personas' | 'L. Personales') {
    setModoActivo((actual) => (actual === clave ? 'todos' : clave));
  }

  // Variación frente al MISMO periodo del año anterior (mismas fechas, un
  // año antes). Si la matriz no trae ese año, no se muestra un número.
  const variacionAnual = useMemo(() => {
    if (!registros || registrosFiltradosPorFecha.length === 0) return null;
    let min: Date | null = null, max: Date | null = null;
    for (const r of registrosFiltradosPorFecha) {
      if (!r.fecha) continue;
      if (!min || r.fecha < min) min = r.fecha;
      if (!max || r.fecha > max) max = r.fecha;
    }
    if (!min || !max) return null;
    const desde = new Date(min.getFullYear() - 1, min.getMonth(), min.getDate());
    const hasta = new Date(max.getFullYear() - 1, max.getMonth(), max.getDate(), 23, 59, 59);
    const previo = registros.filter((r) => r.fecha && r.fecha >= desde && r.fecha <= hasta).length;
    if (previo === 0) return null;
    return ((registrosFiltradosPorFecha.length - previo) / previo) * 100;
  }, [registros, registrosFiltradosPorFecha]);

  const chipsRef = useRef<HTMLDivElement>(null);
  const tituloVista = esModoDelictividad
    ? 'Análisis comparativo, tendencias y principales comportamientos del registro de medidas correctivas.'
    : 'Visión general del registro, principales comportamientos y distribución territorial.';

  return (
    <div className="space-y-4">
      {/* ENCABEZADO */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Scale size={30} className="shrink-0 text-[#116762]" />
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-[#10233f]">RNMC — Registro Nacional de Medidas Correctivas</h1>
            <p className="text-[13px] text-slate-500">{tituloVista}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fechaCarga && registros && (esModoDelictividad ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-[#cfe8e1] bg-[#eef8f5] px-3.5 py-2">
              <CalendarDays size={18} className="text-[#116762]" />
              <div className="text-[11.5px] leading-tight text-[#10233f]">
                <p className="font-semibold">{registros.length.toLocaleString('es-CO')} comparendo(s)</p>
                <p className="text-slate-600">{new Date(fechaCarga).toLocaleString('es-CO')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 rounded-xl border border-[#cfe8e1] bg-[#eef8f5] px-3.5 py-2">
                <CalendarDays size={18} className="text-[#116762]" />
                <div className="text-[11.5px] leading-tight text-[#10233f]">
                  <p>Última actualización</p>
                  <p className="text-slate-600">{new Date(fechaCarga).toLocaleString('es-CO')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
                <Target size={18} className="text-[#10233f]" />
                <div className="text-[11.5px] leading-tight text-[#10233f]">
                  <p className="font-bold">{registrosFiltradosPorFecha.length.toLocaleString('es-CO')} registros</p>
                  <p className="text-slate-600">según filtros actuales</p>
                </div>
              </div>
            </>
          ))}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#10233f] px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">
            {sincronizando ? <CloudUpload size={16} className="animate-pulse" /> : registros ? <RefreshCcw size={16} /> : <Upload size={16} />}
            {cargando ? 'Leyendo…' : sincronizando ? 'Sincronizando…' : registros ? 'Actualizar matriz' : 'Cargar matriz de comparendos'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={cargando || sincronizando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }} />
          </label>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{aviso}</div>}

      {/* PESTAÑAS + COMPORTAMIENTOS */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          {esModoDelictividad ? (
            <span className="mr-2 border-b-2 border-[#10233f] pb-0.5 text-[12.5px] font-bold uppercase tracking-wide text-[#10233f]">Análisis Delitos vs RNMC</span>
          ) : (
            <button type="button" onClick={() => setModoActivo('todos')} className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold ${!esModoDelictividad ? 'bg-[#0f5f57] text-white' : 'border border-slate-200 bg-white text-[#10233f]'}`}>
              <Landmark size={15} /> Análisis general
            </button>
          )}
          {(['H. Personas', 'L. Personales'] as const).map((clave) => (
            <button
              key={clave}
              type="button"
              onClick={() => alternarModoDelictividad(clave)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold ${modoActivo === clave ? 'bg-[#0f5f57] text-white' : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50'}`}
            >
              <Users size={15} /> Análisis {NOMBRE_DELITO[clave]}
            </button>
          ))}
        </div>
        {registros && (
          <div className="flex items-center gap-2">
            <div ref={chipsRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth pb-0.5 [scrollbar-width:none]">
              <button type="button" onClick={() => setModoActivo('todos')} className={`shrink-0 rounded-lg px-4 py-1.5 text-[12.5px] font-semibold ${modoActivo === 'todos' || esModoDelictividad ? 'bg-[#0f5f57] text-white' : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50'}`}>Todos</button>
              {comportamientosDisponibles.map((c) => (
                <button key={c} type="button" onClick={() => setModoActivo(c)} className={`shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium ${modoActivo === c ? 'bg-[#0f5f57] text-white' : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50'}`}>{c}</button>
              ))}
            </div>
            <button type="button" aria-label="Ver más comportamientos" onClick={() => chipsRef.current?.scrollBy({ left: 300 })} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50">
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>

      {!registros ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga la matriz de comparendos para ver el análisis — información sujeta a variación según lo cargado.
        </div>
      ) : esModoDelictividad ? (
        <VistaComparativa delito={modoActivo} registrosRnmc={registrosFiltradosPorFecha} />
      ) : (
        <>
          {/* INDICADORES */}
          {resumen && (
            <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[1.15fr_1.1fr_1fr_1fr_1fr_1fr_1.2fr]">
              <div className="flex min-w-0 items-center gap-3 border-slate-200 px-2 py-2 2xl:border-r">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] shadow-sm"><Database size={28} className="text-white" /></span>
                <div className="min-w-0">
                  <p className="text-[26px] font-extrabold leading-none tabular-nums text-[#10233f]">{resumen.total.toLocaleString('es-CO')}</p>
                  <p className="mt-1 text-[13px] font-semibold leading-tight text-[#10233f]">Registros RNMC</p>
                  <p className="text-[11px] leading-tight text-slate-500">Según filtros actuales</p>
                </div>
              </div>
              <KpiGeneral
                valor={variacionAnual == null ? '—' : `${variacionAnual > 0 ? '+' : ''}${formatDecimal(variacionAnual, 0)}%`}
                titulo={variacionAnual == null ? 'Sin datos del año anterior' : 'vs. mismo periodo del año anterior'}
                icono={variacionAnual != null && variacionAnual < 0 ? <TrendingDown size={24} className="text-white" /> : <TrendingUp size={24} className="text-white" />}
                fondoIcono="rounded-full bg-[#10b981]"
                tono="border-emerald-100 bg-emerald-50/70"
                extra={<BarChart3 size={14} className="text-emerald-500" />}
              />
              <KpiGeneral valor={resumen.zonas} titulo="Zonas de atención" detalle="con registros" icono={<Users size={24} className="text-white" />} fondoIcono="bg-[#3b82f6]" tono="border-blue-100 bg-blue-50/70" />
              <KpiGeneral valor={resumen.comunas} titulo="Comunas" detalle="con registros" icono={<Building2 size={24} className="text-white" />} fondoIcono="bg-[#6d5bd0]" tono="border-indigo-100 bg-indigo-50/70" />
              <KpiGeneral valor={resumen.funcionarios} titulo="Funcionarios" detalle="relacionados" icono={<UserRound size={24} className="text-white" />} fondoIcono="bg-[#d4a017]" tono="border-amber-100 bg-amber-50/70" />
              <KpiGeneral valor={resumen.conMediacion} titulo="Mediaciones in situ" icono={<FileText size={24} className="text-white" />} fondoIcono="bg-[#ef4444]" tono="border-rose-100 bg-rose-50/70" />
              <div className="min-w-0 px-2">
                <p className="mb-1 text-[12px] font-bold text-[#10233f]">Tendencia general</p>
                <TendenciaMini items={registrosFiltradosPorFecha} />
              </div>
            </div>
          )}

          {modoActivo !== 'todos' && (
            <div className="rounded-lg bg-[#10233f] px-4 py-2 text-white">
              <p className="text-sm font-bold">
                Análisis RNMC — {modoActivo}
                <span className="ml-2 font-normal text-slate-300">({registrosVista.length.toLocaleString('es-CO')} comparendo(s))</span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-[1fr_1.4fr_1fr]">
            <TarjetaRanking titulo="Comportamientos más registrados (Art./Num.)" icono={<IconoTitulo><FileText size={17} /></IconoTitulo>} registros={registrosVista} campo={(r) => r.articuloNumeral} encabezado="Artículo" archivo="rnmc-comportamientos" />
            <TarjetaDistribucion registros={registrosVista} />
            <TarjetaEvolucion registros={registrosVista} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TarjetaRanking titulo="Unidad policial" icono={<IconoTitulo><Landmark size={17} /></IconoTitulo>} registros={registrosVista} campo={(r) => r.unidadPolicial} encabezado="Unidad policial" archivo="rnmc-unidad" />
            <TarjetaRanking titulo="Comuna" icono={<IconoTitulo tono="bg-[#e3f2ef] text-[#116762]"><MapPin size={17} /></IconoTitulo>} registros={registrosVista} campo={comunaValida} encabezado="Comuna" archivo="rnmc-comuna" />
            <TarjetaRanking titulo="Funcionario policial" icono={<IconoTitulo><UserRound size={17} /></IconoTitulo>} registros={registrosVista} campo={(r) => r.funcionario} encabezado="Funcionario policial" archivo="rnmc-funcionario" />
          </div>

          {/* "Aplicación Ley 1801 CNSCC" se retiró de aquí a pedido: repetía
              exactamente la tarjeta "Comportamientos más registrados (Art./Num.)". */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TarjetaRanking titulo="Barrios más afectados" icono={<IconoTitulo tono="bg-[#e3f2ef] text-[#116762]"><House size={17} /></IconoTitulo>} registros={registrosVista} campo={(r) => r.barrio} encabezado="Barrio" archivo="rnmc-barrios" topInicial={5} />
            <TarjetaRanking titulo="Patrulla / Cuadrante" icono={<IconoTitulo><MapPinned size={17} /></IconoTitulo>} registros={registrosVista} campo={(r) => r.zonaAtencionHechos} encabezado="Patrulla / Cuadrante" archivo="rnmc-zonas" topInicial={5} />
          </div>
        </>
      )}
    </div>
  );
}
