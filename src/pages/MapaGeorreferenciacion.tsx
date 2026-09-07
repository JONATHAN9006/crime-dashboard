import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import shp from 'shpjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, FileUp, Layers, MapPin, Trash2, Eye, EyeOff, Palette, Info, X, User, Calendar, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import { Card, PageHeader } from '../components/ui/Card';
import { guardarCapas, cargarCapas, limpiarCapas, type CapaGeografica } from '../data/geoStorage';
import {
  guardarCapasPuntos, cargarCapasPuntos, delitosIrispEquivalentes, dependenciasIrispEquivalentes, type CapaPuntos, type TipoCapaPuntos,
} from '../data/puntosStorage';
import { KernelHeatmapLayer } from '../components/mapa/KernelHeatmapLayer';
import { construirGrillaComparativa } from '../data/mapaCalorAnalisis';
import { CargaCapaPuntosModal } from '../components/mapa/CargaCapaPuntosModal';
import { useData } from '../context/DataContext';
import { agruparPor } from '../utils/aggregations';
import type { CrimeRecord } from '../types/crime';
import { esModoConsulta } from '../utils/modoConsulta';

// Corrige las rutas de los íconos por defecto de Leaflet (problema conocido con bundlers).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CENTRO_DEFECTO: [number, number] = [2.4448, -76.6147];

const DIMENSIONES: { valor: 'estacion' | 'cuadrante' | 'barrioHecho'; etiqueta: string; getter: (r: CrimeRecord) => string }[] = [
  { valor: 'estacion', etiqueta: 'Estación', getter: (r) => r.estacion },
  { valor: 'cuadrante', etiqueta: 'Cuadrante', getter: (r) => r.cuadrante },
  { valor: 'barrioHecho', etiqueta: 'Barrio', getter: (r) => r.barrioHecho },
];

function contarFeatures(geojson: any): number {
  if (!geojson) return 0;
  if (Array.isArray(geojson)) return geojson.reduce((acc, g) => acc + (g.features?.length || 0), 0);
  return geojson.features?.length || 0;
}

// Detecta automáticamente las propiedades disponibles en los features de una
// capa, para que el usuario pueda elegir con cuál unir los datos filtrados
// (sin tener que adivinar el nombre exacto del campo).
function propiedadesDisponibles(geojson: any): string[] {
  const feats = Array.isArray(geojson) ? geojson.flatMap((g) => g.features || []) : geojson?.features || [];
  const props = new Set<string>();
  for (const f of feats.slice(0, 20)) {
    Object.keys(f.properties || {}).forEach((k) => props.add(k));
  }
  return Array.from(props);
}

function normalizar(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Paleta multicolor por delito — para la vista normal/exploratoria de cada
// capa (sin comparar), donde cada tipo de delito debe distinguirse con su
// propio color, tal como semaforiza el resto del dashboard.
const PALETA_DELITOS = [
  '#dc2626', '#116762', '#7c3aed', '#f2a340', '#0891b2',
  '#be123c', '#4338ca', '#059669', '#c2410c', '#9333ea',
  '#65a30d', '#0369a1', '#475569', '#ea580c', '#0d9488',
];

// El desplazamiento por fuente (offset) es lo que evita que, al filtrar UN
// solo delito, IRISP1 y Delitos terminen con el mismo color: ambos usarían
// la posición 0 de la lista si se calculara solo por índice del delito. Con
// el desplazamiento, IRISP1 siempre cae en la mitad opuesta de la paleta
// respecto a Delitos, para ese mismo delito — sin afectar el modo
// "Comparar" (que usa su propio esquema azul/rojo fijo, definido más abajo).
function colorPorDelito(valor: string, ordenDelitos: string[], tipo: TipoCapaPuntos): string {
  const idx = ordenDelitos.indexOf(valor);
  const offset = tipo === 'irisp1' ? Math.floor(PALETA_DELITOS.length / 2) : 0;
  return PALETA_DELITOS[((idx >= 0 ? idx : 0) + offset) % PALETA_DELITOS.length];
}

// Paleta fija para "semaforizar" cada delito con un color distinto y estable
// (el mismo delito siempre sale del mismo color, sin importar en qué orden
// aparezca en los datos).

// Conteo genérico por valor de texto — a diferencia de agruparPor (que solo
// acepta CrimeRecord[]), esta sirve para cualquier lista de valores crudos
// que vengan de un Excel externo como IRISP1.
function contarPorValor(valores: string[]): { key: string; casos: number }[] {
  const mapa = new Map<string, number>();
  for (const v of valores) mapa.set(v, (mapa.get(v) || 0) + 1);
  return Array.from(mapa.entries()).map(([key, casos]) => ({ key, casos })).sort((a, b) => b.casos - a.casos);
}

// Ajusta automáticamente el centro/zoom del mapa para que los puntos
// filtrados en ese momento siempre queden visibles — sin esto, al filtrar
// por un Delito o Estación específico los puntos podían quedar fuera del
// área que el usuario tenía encuadrada manualmente, y parecía que "no
// aparecía nada" aunque el conteo sí fuera correcto.

// Leaflet mide el tamaño del contenedor del mapa UNA vez al montarse — si
// después el contenedor cambia de tamaño (ej. al entrar/salir de pantalla
// completa, que pasa de 65vh a 100vh), el mapa se queda con el tamaño viejo
// hasta que se le avisa explícitamente con invalidateSize().
function AjustarTamanoAlCambiarPantallaCompleta({ activo }: { activo: boolean }) {
  const map = useMap();
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 80);
    return () => clearTimeout(id);
  }, [activo, map]);
  return null;
}

function AjustarVistaAPuntos({ puntos }: { puntos: { lat: number; lon: number }[] }) {
  const map = useMap();
  const firma = puntos.map((p) => `${p.lat},${p.lon}`).join('|');
  useEffect(() => {
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView([puntos[0].lat, puntos[0].lon], Math.max(map.getZoom(), 14));
      return;
    }
    const bounds = L.latLngBounds(puntos.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);
  return null;
}

function LeyendaGradiente({ titulo, colores }: { titulo: string; colores: string[] }) {
  return (
    <div>
      <p className="mb-1 font-semibold text-slate-700">{titulo}</p>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-400">Baja</span>
        <span className="h-2.5 w-16 rounded-full" style={{ background: `linear-gradient(to right, ${colores.join(', ')})` }} />
        <span className="text-[10px] text-slate-400">Alta</span>
      </div>
    </div>
  );
}

function FiltroChips({ titulo, valores, seleccionados, onToggle }: {
  titulo: string; valores: string[]; seleccionados: string[]; onToggle: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{titulo}</p>
      <div className="flex flex-wrap gap-1">
        {valores.map((v) => {
          const activo = seleccionados.includes(v);
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              className={`rounded-full border px-2 py-0.5 text-[11px] ${activo ? 'border-brand-green bg-brand-green text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TablaResumen({ titulo, filas }: { titulo: string; filas: { key: string; casos: number }[] }) {
  const total = filas.reduce((a, f) => a + f.casos, 0);
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{titulo}</p>
      <table className="w-full text-xs">
        <tbody>
          {filas.map((f) => (
            <tr key={f.key} className="border-b border-slate-100 last:border-0">
              <td className="py-1 text-slate-600">{f.key}</td>
              <td className="py-1 text-right font-semibold text-slate-800">{f.casos}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 font-bold text-slate-700">
            <td className="py-1">Total</td>
            <td className="py-1 text-right">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Escala de color verde→amarillo→naranja→rojo, igual a la usada en la Matriz
// de Calor, para mantener coherencia visual en todo el dashboard.
function colorPorIntensidad(valor: number, max: number): string {
  if (max === 0 || valor === 0) return '#eef2f0';
  const intensidad = valor / max;
  if (intensidad < 0.2) return '#c7ecd3';
  if (intensidad < 0.4) return '#8fd6a3';
  if (intensidad < 0.6) return '#f5d949';
  if (intensidad < 0.8) return '#f2a340';
  return '#d92b2b';
}

export function MapaGeorreferenciacion() {
  const { filteredRecords, filters } = useData();
  const soloLectura = esModoConsulta();
  const [capas, setCapas] = useState<CapaGeografica[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [capasPuntos, setCapasPuntos] = useState<CapaPuntos[]>([]);
  const [modalCapaPuntos, setModalCapaPuntos] = useState<string | null>(null);
  const [modoComparacion, setModoComparacion] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  // En pantalla completa: qué fuente se está explorando (IRISP1 o Delitos) y
  // qué delito específico está seleccionado (null = todos, sin filtrar).
  const [panelFuenteFullscreen, setPanelFuenteFullscreen] = useState<'irisp1' | 'delitos' | null>(null);
  // Selección INDEPENDIENTE por fuente — cada una se puede agregar/quitar
  // por su cuenta. Elegir un delito en una fuente intenta automáticamente
  // encontrar y agregar su correspondencia real en la otra (nunca la
  // inventa: solo si el mismo nombre corto existe de verdad ahí).
  const [seleccionIrisp1, setSeleccionIrisp1] = useState<string | null>(null);
  const [seleccionDelitos, setSeleccionDelitos] = useState<string | null>(null);
  const [capaExpandida, setCapaExpandida] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const guardadas = await cargarCapas();
      setCapas(guardadas);
      const guardadasPuntos = await cargarCapasPuntos();
      setCapasPuntos(guardadasPuntos);
    })();
  }, []);

  async function persistirPuntos(nuevas: CapaPuntos[]) {
    setCapasPuntos(nuevas);
    await guardarCapasPuntos(nuevas);
  }

  async function guardarNuevaCapaPuntos(capa: CapaPuntos) {
    await persistirPuntos([...capasPuntos.filter((c) => c.nombre !== capa.nombre), capa]);
    setModalCapaPuntos(null);
  }

  async function quitarCapaPuntos(id: string) {
    if (!confirm('¿Quitar esta capa de puntos?')) return;
    await persistirPuntos(capasPuntos.filter((c) => c.id !== id));
  }

  async function actualizarCapaPuntos(id: string, cambios: Partial<CapaPuntos>) {
    await persistirPuntos(capasPuntos.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  }

  function alternarVisibilidadPorTipo(tipo: 'irisp1' | 'delitos', visible: boolean) {
    persistirPuntos(capasPuntos.map((c) => (c.tipo === tipo ? { ...c, visible } : c)));
  }

  function alternarDelitoPropio(capa: CapaPuntos, delitoCorto: string) {
    const actual = capa.filtroDelitoPropio;
    const nuevo = actual.includes(delitoCorto) ? actual.filter((v) => v !== delitoCorto) : [...actual, delitoCorto];
    actualizarCapaPuntos(capa.id, { filtroDelitoPropio: nuevo });
  }

  function alternarFiltroCapa(capa: CapaPuntos, campo: 'filtroEstado' | 'filtroEstadoExistencia' | 'filtroDependencia', valor: string) {
    const actual = capa[campo];
    const nuevo = actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor];
    actualizarCapaPuntos(capa.id, { [campo]: nuevo } as Partial<CapaPuntos>);
  }

  async function persistir(nuevas: CapaGeografica[]) {
    setCapas(nuevas);
    await guardarCapas(nuevas);
  }

  async function manejarArchivo(file: File) {
    setError(null);
    setCargando(true);
    try {
      let geojson: any;
      if (/\.(geojson|json)$/i.test(file.name)) {
        const texto = await file.text();
        geojson = JSON.parse(texto);
      } else if (/\.zip$/i.test(file.name)) {
        const buffer = await file.arrayBuffer();
        geojson = await shp(buffer);
      } else {
        setError('Formato no soportado. Sube un archivo .zip (con .shp, .shx, .dbf y .prj comprimidos juntos) o un archivo .geojson/.json.');
        setCargando(false);
        return;
      }
      const nueva: CapaGeografica = {
        id: `${Date.now()}`,
        nombre: file.name.replace(/\.(zip|geojson|json)$/i, ''),
        geojson,
        visible: true,
        campoUnion: null,
        dimension: null,
        colorearPorCasos: false,
      };
      await persistir([...capas, nueva]);
      setCapaExpandida(nueva.id);
    } catch (e) {
      setError('No se pudo procesar el archivo. Verifica que el .zip contenga los 4 componentes del mismo shapefile (.shp, .shx, .dbf, .prj) sin carpetas dentro del zip.');
    } finally {
      setCargando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function quitarCapa(id: string) {
    if (!confirm('¿Quitar esta capa geográfica?')) return;
    await persistir(capas.filter((c) => c.id !== id));
  }

  async function actualizarCapa(id: string, cambios: Partial<CapaGeografica>) {
    await persistir(capas.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  }

  async function limpiarTodo() {
    if (!confirm('¿Quitar todas las capas geográficas cargadas?')) return;
    await limpiarCapas();
    setCapas([]);
  }

  // Conteo de casos filtrados por cada dimensión (estación/cuadrante/barrio),
  // usando exactamente los mismos filtros globales del dashboard — así el
  // mapa nunca depende de una fuente de datos distinta al resto de la app.
  const conteosPorDimension = useMemo(() => {
    const mapa: Record<string, Map<string, number>> = {};
    for (const dim of DIMENSIONES) {
      const agrupado = agruparPor(filteredRecords, dim.getter);
      mapa[dim.valor] = new Map(agrupado.map((a) => [normalizar(a.key), a.casos]));
    }
    return mapa;
  }, [filteredRecords]);


  // Para cada capa de puntos: qué valores de Delito Principal equivalen al
  // Delito activo en el filtro general (cruce por palabra clave), y los
  // puntos que finalmente se muestran tras aplicar ese cruce + los filtros
  // propios de la capa (Estado / Estado de existencia / Dependencia).
  const capasPuntosProcesadas = useMemo(() => {
    return capasPuntos.map((capa) => {
      // "Delitos" trae el mismo vocabulario que el DB2 (DELITO, ESTACION),
      // así que cada punto YA se tradujo a nombre corto exacto al cargar la
      // capa (ver puntosStorage.ts) — el cruce con el filtro del dashboard es
      // una comparación directa, sin adivinar por palabra clave. "IRISP1"
      // trae texto legal libre, así que sigue necesitando el cruce difuso.
      const esExacto = capa.tipo === 'delitos';

      const valoresDelitoCrudos = capa.colDelito ? [...new Set(capa.puntos.map((p) => String(p.fila[capa.colDelito!] ?? '')))] : [];
      const equivalentesDifuso = !esExacto && capa.colDelito && filters.delito.length > 0
        ? delitosIrispEquivalentes(filters.delito, valoresDelitoCrudos)
        : null;

      const valoresDependenciaCrudos = capa.colDependencia ? [...new Set(capa.puntos.map((p) => String(p.fila[capa.colDependencia!] ?? '')))] : [];
      const equivalentesEstacionDifuso = !esExacto && capa.colDependencia && filters.estacion.length > 0
        ? dependenciasIrispEquivalentes(filters.estacion, valoresDependenciaCrudos)
        : null;

      // Todos los delitos (nombre corto) que esta capa debe mostrar: los que
      // coincidan con el filtro del dashboard, MÁS los que el usuario haya
      // marcado a mano en el selector propio de la capa (delitos que no
      // existen como opción en el filtro principal, ej. "Receptación").
      const delitosCortosAMostrar = filters.delito.length > 0 || capa.filtroDelitoPropio.length > 0
        ? new Set([...filters.delito, ...capa.filtroDelitoPropio])
        : null; // null = sin filtro de delito activo, se muestra todo

      const puntosFiltrados = capa.puntos.filter((p) => {
        if (esExacto && capa.colDelito && delitosCortosAMostrar && !delitosCortosAMostrar.has(p.delitoCorto ?? '')) return false;
        if (esExacto && capa.colDependencia && filters.estacion.length > 0 && !filters.estacion.includes(p.estacionCorta ?? '')) return false;
        if (!esExacto && equivalentesDifuso && capa.filtroDelitoPropio.length === 0 && !equivalentesDifuso.has(String(p.fila[capa.colDelito!] ?? ''))) return false;
        if (!esExacto && equivalentesEstacionDifuso && !equivalentesEstacionDifuso.has(String(p.fila[capa.colDependencia!] ?? ''))) return false;
        if (capa.colEstado && capa.filtroEstado.length > 0 && !capa.filtroEstado.includes(String(p.fila[capa.colEstado] ?? ''))) return false;
        if (capa.colEstadoExistencia && capa.filtroEstadoExistencia.length > 0 && !capa.filtroEstadoExistencia.includes(String(p.fila[capa.colEstadoExistencia] ?? ''))) return false;
        if (capa.colDependencia && capa.filtroDependencia.length > 0 && !capa.filtroDependencia.includes(String(p.fila[capa.colDependencia] ?? ''))) return false;
        return true;
      });

      // Todos los delitos distintos que trae la capa (nombre corto), para el
      // selector propio "manipulables" — incluye los que YA coinciden con el
      // dashboard y los que no, para que el usuario pueda sumar cualquiera.
      const todosLosDelitosCortos = capa.colDelito
        ? [...new Set(capa.puntos.map((p) => p.delitoCorto).filter((d): d is string => !!d))].sort()
        : [];

      const ordenDelitos = capa.colDelito
        ? contarPorValor(puntosFiltrados.map((p) => p.delitoCorto ?? String(p.fila[capa.colDelito!] ?? ''))).map((d) => d.key)
        : [];
      const resumenEstado = capa.colEstado
        ? contarPorValor(puntosFiltrados.map((p) => String(p.fila[capa.colEstado!] ?? 'Sin dato')))
        : [];
      const resumenExistencia = capa.colEstadoExistencia
        ? contarPorValor(puntosFiltrados.map((p) => String(p.fila[capa.colEstadoExistencia!] ?? 'Sin dato')))
        : [];

      return { capa, puntosFiltrados, ordenDelitos, resumenEstado, resumenExistencia, todosLosDelitosCortos };
    });
  }, [capasPuntos, filters.delito, filters.estacion]);

  // Puntos de cada fuente que están efectivamente visibles en el mapa AHORA
  // MISMO (capa encendida + filtros aplicados) — SIEMPRE separados entre sí,
  // nunca combinados en una sola lista. El mapa de calor comparativo y la
  // grilla de coincidencia se calculan a partir de estas dos listas.
  const puntosDelitosVisibles = useMemo(
    () => capasPuntosProcesadas
      .filter(({ capa }) => capa.tipo === 'delitos' && capa.visible)
      .flatMap(({ puntosFiltrados }) => puntosFiltrados.map((p) => ({ lat: p.lat, lon: p.lon }))),
    [capasPuntosProcesadas],
  );
  const puntosIrisp1Visibles = useMemo(
    () => capasPuntosProcesadas
      .filter(({ capa }) => capa.tipo === 'irisp1' && capa.visible)
      .flatMap(({ puntosFiltrados }) => puntosFiltrados.map((p) => ({ lat: p.lat, lon: p.lon }))),
    [capasPuntosProcesadas],
  );

  // --- Pantalla completa: exploración independiente por delito -----------
  // En este modo se navega TODOS los puntos de la fuente elegida (sin
  // depender del filtro principal del dashboard) — se listan con su
  // conteo, y al elegir uno se filtra el mapa a ese delito específico.
  // OJO: no se exige "capa.visible" aquí — elegir la fuente con el botón de
  // pantalla completa (IRISP1/Delitos) YA es la intención explícita de
  // verla, sin importar si el checkbox de arriba (fuera de pantalla
  // completa) está marcado o no. Exigirlo era justo el bug: si esa capa
  // seguía "apagada" desde antes de entrar a pantalla completa, no
  // aparecía ni un punto ni el mapa de calor al elegir un delito.
  const puntosCrudosPorTipo = (tipo: 'irisp1' | 'delitos') => capasPuntosProcesadas
    .filter(({ capa }) => capa.tipo === tipo)
    .flatMap(({ capa }) => capa.puntos.map((p) => ({ lat: p.lat, lon: p.lon, delitoCorto: p.delitoCorto })));

  const tablaDelitosFullscreen = useMemo(() => {
    if (!panelFuenteFullscreen) return [];
    const puntos = puntosCrudosPorTipo(panelFuenteFullscreen);
    return contarPorValor(puntos.map((p) => p.delitoCorto ?? 'NO REPORTADO'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelFuenteFullscreen, capasPuntosProcesadas]);

  // Puntos a mostrar en el mapa: en pantalla completa, cada fuente muestra
  // ÚNICAMENTE el delito seleccionado PARA ESA FUENTE (seleccionIrisp1 /
  // seleccionDelitos son independientes entre sí) — sin selección para esa
  // fuente, no se muestra nada de ella (el mapa base queda limpio hasta que
  // se elija algo). Fuera de pantalla completa, sigue el comportamiento de
  // siempre (checkbox de arriba).
  const puntosDelitosParaMostrar = useMemo(() => {
    if (pantallaCompleta) {
      return seleccionDelitos ? puntosCrudosPorTipo('delitos').filter((p) => (p.delitoCorto ?? 'NO REPORTADO') === seleccionDelitos) : [];
    }
    return puntosDelitosVisibles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantallaCompleta, seleccionDelitos, puntosDelitosVisibles, capasPuntosProcesadas]);

  const puntosIrisp1ParaMostrar = useMemo(() => {
    if (pantallaCompleta) {
      return seleccionIrisp1 ? puntosCrudosPorTipo('irisp1').filter((p) => (p.delitoCorto ?? 'NO REPORTADO') === seleccionIrisp1) : [];
    }
    return puntosIrisp1Visibles;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantallaCompleta, seleccionIrisp1, puntosIrisp1Visibles, capasPuntosProcesadas]);

  function elegirFuenteFullscreen(fuente: 'irisp1' | 'delitos') {
    // Esto SOLO abre/cierra la tabla para explorar esa fuente — ya no toca
    // ninguna selección; elegir qué se ve en el mapa es responsabilidad de
    // seleccionarDelitoDesde() / quitarSeleccion(), completamente aparte.
    setPanelFuenteFullscreen((actual) => (actual === fuente ? null : fuente));
  }

  /**
   * Al elegir un delito desde la tabla de una fuente, se agrega esa
   * selección Y se verifica de verdad (por nombre corto exacto, nunca
   * inventado) si el MISMO delito existe también en la otra fuente — si
   * existe, se agrega automáticamente ahí también, para poder comparar de
   * inmediato. El usuario conserva control total: cada selección se puede
   * quitar por separado con su propia X (quitarSeleccion), sin afectar la
   * de la otra fuente.
   */
  function seleccionarDelitoDesde(fuente: 'irisp1' | 'delitos', delito: string) {
    if (fuente === 'irisp1') {
      setSeleccionIrisp1(delito);
      const existeEnDelitos = puntosCrudosPorTipo('delitos').some((p) => (p.delitoCorto ?? 'NO REPORTADO') === delito);
      if (existeEnDelitos) setSeleccionDelitos(delito);
    } else {
      setSeleccionDelitos(delito);
      const existeEnIrisp1 = puntosCrudosPorTipo('irisp1').some((p) => (p.delitoCorto ?? 'NO REPORTADO') === delito);
      if (existeEnIrisp1) setSeleccionIrisp1(delito);
    }
  }

  function quitarSeleccion(fuente: 'irisp1' | 'delitos') {
    if (fuente === 'irisp1') setSeleccionIrisp1(null);
    else setSeleccionDelitos(null);
  }

  // Sincronización directa: el checkbox superior de cada fuente es lo único
  // que decide si su mapa de calor se dibuja — "Comparar" ya NO es un
  // requisito para verlo, solo agrega el análisis de correspondencia usando
  // las fuentes que estén encendidas en ese momento (si solo una está
  // encendida, simplemente no habrá nada con qué cruzarla, sin que eso
  // rompa nada).
  // En pantalla completa: el estado depende ÚNICAMENTE de qué haya
  // seleccionado en "Limpiar filtros" para cada fuente — ninguna
  // selección = mapa base; solo una = su mapa de calor propio; las dos =
  // modo comparación automático (ver punto 13 de la lógica pedida).
  const mostrarCalorDelitos = pantallaCompleta ? !!seleccionDelitos : capasPuntos.some((c) => c.tipo === 'delitos' && c.visible);
  const mostrarCalorIrisp1 = pantallaCompleta ? !!seleccionIrisp1 : capasPuntos.some((c) => c.tipo === 'irisp1' && c.visible);

  // Grilla de correspondencia espacial: se activa con "Comparar" (modo
  // normal) O automáticamente en pantalla completa cuando AMBAS fuentes
  // tienen un delito seleccionado a la vez — en ambos casos usa los puntos
  // "para mostrar" de cada fuente, que ya reflejan el filtro que
  // corresponda en cada modo.
  const grillaComparativa = useMemo(
    () => (modoComparacion || (pantallaCompleta && seleccionIrisp1 && seleccionDelitos)
      ? construirGrillaComparativa(puntosDelitosParaMostrar, puntosIrisp1ParaMostrar)
      : []),
    [modoComparacion, pantallaCompleta, seleccionIrisp1, seleccionDelitos, puntosDelitosParaMostrar, puntosIrisp1ParaMostrar],
  );

  const filtrosActivos = [
    filters.anio.length > 0 && `Año: ${filters.anio.join(', ')}`,
    filters.mes.length > 0 && `Mes: ${filters.mes.join(', ')}`,
    filters.fechaInicial && `Desde: ${filters.fechaInicial}`,
    filters.fechaFinal && `Hasta: ${filters.fechaFinal}`,
    filters.estacion.length > 0 && `Estación: ${filters.estacion.join(', ')}`,
    filters.delito.length > 0 && `Delito: ${filters.delito.join(', ')}`,
    filters.cuadrante.length > 0 && `Cuadrante: ${filters.cuadrante.join(', ')}`,
    filters.barrioHecho.length > 0 && `Barrio: ${filters.barrioHecho.join(', ')}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <PageHeader title="Mapa / Georreferenciación" subtitle="Visualiza y compara varias capas geográficas (Shapefile o GeoJSON) sobre el territorio." />

      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <Info size={14} className="mt-0.5 shrink-0 text-brand-navy" />
        <p>
          El mapa usa los mismos <strong>filtros generales</strong> del dashboard (arriba de esta página) — no hay filtros duplicados aquí.{' '}
          {filtrosActivos.length > 0
            ? <>Filtros activos: <strong>{filtrosActivos.join(' · ')}</strong> ({filteredRecords.length.toLocaleString('es-CO')} registros).</>
            : <>Actualmente no hay filtros activos: se consideran los {filteredRecords.length.toLocaleString('es-CO')} registros cargados.</>}
        </p>
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-brand-navy" />
            <p className="text-sm font-semibold text-slate-700">Capas cargadas ({capas.length})</p>
            {/* Interruptores para los PUNTOS individuales de cada fuente
                (independiente del mapa de calor de abajo). */}
            <div className="ml-3 flex items-center gap-3 border-l border-slate-200 pl-3 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={capasPuntos.some((c) => c.tipo === 'irisp1' && c.visible)}
                  onChange={(e) => alternarVisibilidadPorTipo('irisp1', e.target.checked)}
                  disabled={!capasPuntos.some((c) => c.tipo === 'irisp1')}
                />
                <span className="h-2 w-2 rounded-full bg-[#2563eb]" /> IRISP1
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={capasPuntos.some((c) => c.tipo === 'delitos' && c.visible)}
                  onChange={(e) => alternarVisibilidadPorTipo('delitos', e.target.checked)}
                  disabled={!capasPuntos.some((c) => c.tipo === 'delitos')}
                />
                <span className="h-2 w-2 rounded-full bg-[#dc2626]" /> Delitos
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={modoComparacion} onChange={(e) => setModoComparacion(e.target.checked)} />
                Comparar IRISP1 vs Delitos
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            {!soloLectura && (
              <>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy-light"
                >
                  <FileUp size={14} /> {cargando ? 'Procesando...' : 'Cargar capa'}
                </button>
                <button
                  onClick={() => setModalCapaPuntos('IRISP1')}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-green px-3 py-1.5 text-sm font-medium text-brand-green hover:bg-brand-green/5"
                >
                  <FileUp size={14} /> IRISP1
                </button>
                <button
                  onClick={() => setModalCapaPuntos('Delitos')}
                  className="flex items-center gap-1.5 rounded-lg border border-brand-green px-3 py-1.5 text-sm font-medium text-brand-green hover:bg-brand-green/5"
                >
                  <FileUp size={14} /> Delitos
                </button>
                {capas.length > 0 && (
                  <button onClick={limpiarTodo} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50">
                    <Trash2 size={14} /> Quitar todas
                  </button>
                )}
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".zip,.geojson,.json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }}
            />
          </div>
        </div>

        {/* La leyenda de cada escala aparece en cuanto su mapa de calor está
            encendido (sincronizado con el checkbox de esa fuente); el aviso
            de correspondencia solo cuando "Comparar" también está activo. */}
        {(mostrarCalorDelitos || mostrarCalorIrisp1) && (
          <div className="mb-3 flex flex-wrap items-center gap-5 text-xs text-slate-600">
            {mostrarCalorDelitos && <LeyendaGradiente titulo="Delitos" colores={['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626']} />}
            {mostrarCalorIrisp1 && <LeyendaGradiente titulo="IRISP1" colores={['#60a5fa', '#3b82f6', '#6366f1', '#7c3aed', '#581c87']} />}
            {modoComparacion && mostrarCalorDelitos && mostrarCalorIrisp1 && (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: 'radial-gradient(circle, #ec4899, #a21caf)' }} />
                Correspondencia espacial (pasa el mouse sobre el mapa)
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {modalCapaPuntos && (
          <CargaCapaPuntosModal
            nombreCapa={modalCapaPuntos}
            onCerrar={() => setModalCapaPuntos(null)}
            onGuardar={guardarNuevaCapaPuntos}
          />
        )}

        {/* Panel de control de capas: activar/desactivar, y configurar coloreado por casos */}
        {capas.length > 0 && (
          <div className="space-y-2">
            {capas.map((capa) => {
              const props = propiedadesDisponibles(capa.geojson);
              return (
                <div key={capa.id} className="rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between gap-2 p-2.5">
                    <label className="flex flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={capa.visible}
                        onChange={(e) => actualizarCapa(capa.id, { visible: e.target.checked })}
                      />
                      {capa.visible ? <Eye size={14} className="text-brand-green" /> : <EyeOff size={14} className="text-slate-300" />}
                      <span className="text-sm font-medium text-slate-700">{capa.nombre}</span>
                      <span className="text-xs text-slate-400">({contarFeatures(capa.geojson)} elementos)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCapaExpandida(capaExpandida === capa.id ? null : capa.id)}
                        className="flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        <Palette size={12} /> Colorear por casos
                      </button>
                      {!soloLectura && (
                        <button onClick={() => quitarCapa(capa.id)} className="text-slate-400 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {capaExpandida === capa.id && (
                    <div className="border-t border-slate-100 bg-slate-50 p-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={capa.colorearPorCasos}
                            onChange={(e) => actualizarCapa(capa.id, { colorearPorCasos: e.target.checked })}
                          />
                          Colorear por cantidad de casos filtrados
                        </label>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">¿A qué corresponde esta capa?</label>
                          <select
                            value={capa.dimension ?? ''}
                            onChange={(e) => actualizarCapa(capa.id, { dimension: (e.target.value || null) as any })}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">Selecciona...</option>
                            {DIMENSIONES.map((d) => <option key={d.valor} value={d.valor}>{d.etiqueta}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Campo del archivo con el nombre</label>
                          <select
                            value={capa.campoUnion ?? ''}
                            onChange={(e) => actualizarCapa(capa.id, { campoUnion: e.target.value || null })}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">Selecciona...</option>
                            {props.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Ejemplo: si esta capa trae los polígonos de las estaciones y el archivo tiene una columna llamada "NOMBRE", selecciona "Estación" y "NOMBRE" — el mapa comparará ese valor contra los nombres de estación de los datos filtrados (ej. "E-Norte") para colorear cada polígono según su cantidad de casos.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}


        {/* Capas de puntos (IRISP1 / Delitos): quién y cuándo las cargó,
            filtros propios, semaforización por delito y tabla resumen. */}
        {capasPuntosProcesadas.map(({ capa, puntosFiltrados, resumenEstado, resumenExistencia, ordenDelitos, todosLosDelitosCortos }) => (
          <div key={capa.id} className="mb-3 rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5">
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input type="checkbox" checked={capa.visible} onChange={(e) => actualizarCapaPuntos(capa.id, { visible: e.target.checked })} />
                {capa.visible ? <Eye size={14} className="text-brand-green" /> : <EyeOff size={14} className="text-slate-300" />}
                <span className="text-sm font-medium text-slate-700">{capa.nombre}</span>
                <span className="text-xs text-slate-400">({puntosFiltrados.length} de {capa.puntos.length} puntos)</span>
              </label>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><User size={11} /> {capa.cargadoPor}</span>
                <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(capa.fechaCarga).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                {!soloLectura && (
                  <button onClick={() => quitarCapaPuntos(capa.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                )}
              </div>
            </div>

            {capa.visible && (capa.colEstado || capa.colEstadoExistencia || capa.colDependencia) && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 bg-slate-50 p-3 sm:grid-cols-3">
                {capa.colEstado && (
                  <FiltroChips
                    titulo="Estado del trámite"
                    valores={[...new Set(capa.puntos.map((p) => String(p.fila[capa.colEstado!] ?? 'Sin dato')))]}
                    seleccionados={capa.filtroEstado}
                    onToggle={(v) => alternarFiltroCapa(capa, 'filtroEstado', v)}
                  />
                )}
                {capa.colEstadoExistencia && (
                  <FiltroChips
                    titulo="Estado de existencia"
                    valores={[...new Set(capa.puntos.map((p) => String(p.fila[capa.colEstadoExistencia!] ?? 'Sin dato')))]}
                    seleccionados={capa.filtroEstadoExistencia}
                    onToggle={(v) => alternarFiltroCapa(capa, 'filtroEstadoExistencia', v)}
                  />
                )}
                {capa.colDependencia && (
                  <FiltroChips
                    titulo="Dependencia"
                    valores={[...new Set(capa.puntos.map((p) => String(p.fila[capa.colDependencia!] ?? 'Sin dato')))]}
                    seleccionados={capa.filtroDependencia}
                    onToggle={(v) => alternarFiltroCapa(capa, 'filtroDependencia', v)}
                  />
                )}
              </div>
            )}

            {capa.visible && (resumenEstado.length > 0 || resumenExistencia.length > 0) && (
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
                {resumenExistencia.length > 0 && (
                  <TablaResumen titulo="Por estado de existencia" filas={resumenExistencia} />
                )}
                {resumenEstado.length > 0 && (
                  <TablaResumen titulo="Por estado del trámite" filas={resumenEstado} />
                )}
              </div>
            )}

            {capa.visible && capa.colDelito && ordenDelitos.length > 0 && (
              <div className="border-t border-slate-100 p-3">
                {modoComparacion ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: capa.tipo === 'irisp1' ? '#2563eb' : '#dc2626' }} />
                    Modo comparación: {capa.tipo === 'irisp1' ? 'azul (IRISP1)' : 'rojo (Delitos)'}
                  </span>
                ) : (
                  <>
                    <span className="mb-1.5 block text-[11px] font-semibold text-slate-500">Semaforización (un color por delito):</span>
                    <div className="flex flex-col gap-1">
                      {ordenDelitos.map((d) => (
                        <span key={d} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorPorDelito(d, ordenDelitos, capa.tipo) }} />
                          {d}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Delitos "manipulables": todos los que trae esta capa, existan o
                no como opción en el filtro principal del dashboard — permite
                sumar al mapa delitos como "Receptación" que el dashboard no
                conoce, sin afectar ningún otro componente. */}
            {capa.visible && todosLosDelitosCortos.length > 0 && (
              <div className="border-t border-slate-100 p-3">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">
                  Agregar delitos al mapa (independiente del filtro principal):
                </p>
                <div className="flex flex-wrap gap-1">
                  {todosLosDelitosCortos.map((d) => {
                    const activo = capa.filtroDelitoPropio.includes(d);
                    const yaCubiertoPorFiltroPrincipal = filters.delito.includes(d);
                    return (
                      <button
                        key={d}
                        onClick={() => alternarDelitoPropio(capa, d)}
                        title={yaCubiertoPorFiltroPrincipal ? 'Ya está incluido por el filtro principal del dashboard' : undefined}
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          activo || yaCubiertoPorFiltroPrincipal
                            ? 'border-brand-green bg-brand-green text-white'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filters.delito.length > 0 && capa.colDelito && puntosFiltrados.length === 0 && (
              <p className="border-t border-slate-100 p-3 text-xs text-slate-400">
                Ningún punto de "{capa.nombre}" coincide con el Delito seleccionado en el filtro general.
              </p>
            )}
          </div>
        ))}

        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="mb-1 font-semibold text-slate-700">Cómo cargar un Shapefile:</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>Reúne los 4 archivos del mismo shapefile: <code>.shp</code>, <code>.shx</code>, <code>.dbf</code> y <code>.prj</code> (todos con el mismo nombre).</li>
            <li>Selecciónalos todos y comprímelos juntos en un único archivo <code>.zip</code> (sin crear una carpeta dentro del zip).</li>
            <li>Sube ese <code>.zip</code> con el botón "Cargar capa". Puedes repetir esto para cargar varias capas (ej. Estaciones, Cuadrantes, Barrios) y activarlas/desactivarlas por separado.</li>
          </ol>
          <p className="mt-2">También puedes cargar directamente un archivo <code>.geojson</code> o <code>.json</code>.</p>
        </div>
      </Card>

      <Card className={clsx('overflow-hidden p-0', pantallaCompleta && 'fixed inset-0 z-[9999] rounded-none')}>
        <div className="relative" style={{ height: pantallaCompleta ? '100vh' : '65vh', width: '100%' }}>
          {/* Botón de pantalla completa — siempre visible, arriba a la
              derecha del mapa. En pantalla completa se convierte en el
              botón de salir. */}
          <button
            onClick={() => setPantallaCompleta((v) => !v)}
            className="absolute right-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md hover:bg-white"
          >
            {pantallaCompleta ? <><X size={14} /> Salir de pantalla completa</> : <><Maximize2 size={14} /> Pantalla completa</>}
          </button>

          {/* Controles de exploración por delito — solo en pantalla
              completa: elegir fuente (IRISP1/Delitos), ver su tabla de
              delitos con conteo, elegir uno para filtrar el mapa, y limpiar
              para volver a ver todos. */}
          {pantallaCompleta && (
            <div className="absolute left-16 top-3 z-[1000] flex flex-col gap-2">
              {/* left-16 (en vez de left-3) para separarlo claramente de los
                  controles de zoom (+/-) de Leaflet, que viven en la esquina
                  superior izquierda del mapa — antes quedaban casi pegados. */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => elegirFuenteFullscreen('irisp1')}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold shadow-md',
                    panelFuenteFullscreen === 'irisp1' ? 'bg-blue-600 text-white' : 'bg-white/95 text-slate-700 hover:bg-white',
                  )}
                >
                  IRISP1
                </button>
                <button
                  onClick={() => elegirFuenteFullscreen('delitos')}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold shadow-md',
                    panelFuenteFullscreen === 'delitos' ? 'bg-rose-600 text-white' : 'bg-white/95 text-slate-700 hover:bg-white',
                  )}
                >
                  Delitos
                </button>

                {/* "Limpiar filtros": cada fuente seleccionada tiene su
                    propia X — quitar una NO afecta a la otra. Cuando las dos
                    están presentes, el mapa entra solo en modo comparación
                    (ver mostrarCalorDelitos/mostrarCalorIrisp1). */}
                {seleccionIrisp1 && (
                  <button
                    onClick={() => quitarSeleccion('irisp1')}
                    className="flex items-center gap-1 rounded-lg border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-md hover:bg-white"
                  >
                    <X size={12} /> {seleccionIrisp1} (IRISP1)
                  </button>
                )}
                {seleccionDelitos && (
                  <button
                    onClick={() => quitarSeleccion('delitos')}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-md hover:bg-white"
                  >
                    <X size={12} /> {seleccionDelitos} (Delitos)
                  </button>
                )}
              </div>

              {panelFuenteFullscreen && (
                <div className="max-h-[70vh] w-64 overflow-y-auto rounded-lg bg-white/98 shadow-lg">
                  <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
                    {panelFuenteFullscreen === 'irisp1' ? 'IRISP1' : 'Delitos'} — todos los delitos
                  </p>
                  <ul>
                    {tablaDelitosFullscreen.map((d) => {
                      const seleccionado = (panelFuenteFullscreen === 'irisp1' ? seleccionIrisp1 : seleccionDelitos) === d.key;
                      return (
                        <li key={d.key}>
                          <button
                            onClick={() => seleccionarDelitoDesde(panelFuenteFullscreen, d.key)}
                            className={clsx(
                              'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-50',
                              seleccionado && 'bg-brand-green/10 font-semibold text-brand-green',
                            )}
                          >
                            <span>{d.key}</span>
                            <span className="text-slate-400">{d.casos}</span>
                          </button>
                        </li>
                      );
                    })}
                    {tablaDelitosFullscreen.length === 0 && <li className="px-3 py-2 text-xs text-slate-400">Sin puntos cargados para esta fuente.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          <MapContainer center={CENTRO_DEFECTO} zoom={12} style={{ height: '100%', width: '100%' }}>
            <AjustarTamanoAlCambiarPantallaCompleta activo={pantallaCompleta} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {capas.filter((c) => c.visible).map((capa) => {
              const conteos = capa.dimension ? conteosPorDimension[capa.dimension] : null;
              const maxCasos = conteos ? Math.max(...Array.from(conteos.values()), 0) : 0;

              function estiloFeature(feature: any) {
                if (capa.colorearPorCasos && conteos && capa.campoUnion) {
                  const valorCrudo = feature?.properties?.[capa.campoUnion!];
                  const casos = conteos.get(normalizar(valorCrudo)) ?? 0;
                  return { color: '#475569', weight: 1.5, fillColor: colorPorIntensidad(casos, maxCasos), fillOpacity: 0.65 };
                }
                return { color: '#116762', weight: 2, fillColor: '#116762', fillOpacity: 0.15 };
              }

              function onEachFeature(feature: any, layer: L.Layer) {
                const props = feature.properties || {};
                let filas = Object.entries(props).slice(0, 10).map(([k, v]) => `<tr><td style="padding-right:8px;color:#64748b;font-weight:600">${k}</td><td>${v}</td></tr>`).join('');
                if (capa.colorearPorCasos && conteos && capa.campoUnion) {
                  const casos = conteos.get(normalizar(props[capa.campoUnion])) ?? 0;
                  filas = `<tr><td style="padding-right:8px;color:#116762;font-weight:700">Casos (filtro actual)</td><td style="font-weight:700">${casos}</td></tr>` + filas;
                }
                layer.bindPopup(`<div style="font-size:12px;max-width:220px"><table>${filas || '<tr><td>Sin atributos</td></tr>'}</table></div>`);
              }

              return (
                <GeoJSONLayer
                  key={`${capa.id}-${capa.colorearPorCasos}-${capa.campoUnion}-${capa.dimension}-${filteredRecords.length}`}
                  data={capa.geojson as any}
                  style={estiloFeature}
                  onEachFeature={onEachFeature}
                />
              );
            })}

            {/* Puntos de IRISP1 / Delitos, coloreados por delito (semaforización) */}
            {/* Encuadra el mapa en los puntos visibles cada vez que cambian
                (por un filtro de Delito/Estación, o al cargar una capa
                nueva) — en pantalla completa, se encuadra según lo que se
                esté explorando por delito en ese momento. */}
            <AjustarVistaAPuntos
              puntos={
                pantallaCompleta && (seleccionDelitos || seleccionIrisp1)
                  ? [...puntosDelitosParaMostrar, ...puntosIrisp1ParaMostrar]
                  : capasPuntosProcesadas
                      .filter(({ capa }) => capa.visible)
                      .flatMap(({ puntosFiltrados }) => puntosFiltrados.map((p) => ({ lat: p.lat, lon: p.lon })))
              }
            />

            {/* Mapa de calor de Delitos: Kernel Density geográficamente fijo
                (ver src/utils/kernelDensity.ts) — 5 clases por cuantiles,
                verde → amarillo → naranja → rojo. Se calcula UNA SOLA VEZ y
                se ancla como imagen a coordenadas reales: el zoom del mapa
                solo escala esa imagen, nunca recalcula el kernel ni cambia
                su clasificación. Se calcula EXCLUSIVAMENTE con los puntos de
                capas tipo "delitos" — nunca se mezcla con los de IRISP1.
                Depende ÚNICAMENTE del checkbox "Delitos" de arriba — ya NO
                requiere que "Comparar" esté activo: se enciende y apaga con
                su propio checkbox, en sincronía directa con la capa. */}
            {mostrarCalorDelitos && (
              <KernelHeatmapLayer
                puntos={puntosDelitosParaMostrar}
                colores={['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626']}
              />
            )}

            {/* Mapa de calor de IRISP1: mismo Kernel Density geográficamente
                fijo, con su propia escala de 5 clases (azul → morado),
                completamente distinta a la de Delitos. Se calcula
                EXCLUSIVAMENTE con los puntos de capas tipo "irisp1", y
                depende únicamente del checkbox "IRISP1" de arriba, igual
                que Delitos. */}
            {mostrarCalorIrisp1 && (
              <KernelHeatmapLayer
                puntos={puntosIrisp1ParaMostrar}
                colores={['#60a5fa', '#3b82f6', '#6366f1', '#7c3aed', '#581c87']}
              />
            )}

            {/* Modo comparación: grilla de celdas con la coincidencia entre
                ambas fuentes (ver src/data/mapaCalorAnalisis.ts para la
                fórmula exacta). Solo se dibujan las celdas con actividad real
                en ambas fuentes, para no saturar el mapa. */}
            {(modoComparacion || (pantallaCompleta && seleccionIrisp1 && seleccionDelitos)) && grillaComparativa
              .filter((c) => c.casosDelitos > 0 && c.casosIrisp1 > 0)
              .map((c, i) => (
                <CircleMarker
                  key={`comp-${i}`}
                  center={[c.lat, c.lon]}
                  radius={9}
                  pane="markerPane"
                  pathOptions={{
                    color: c.clasificacion === 'alta' ? '#a21caf' : c.clasificacion === 'media' ? '#ec4899' : '#f472b6',
                    weight: 2,
                    fillColor: c.clasificacion === 'alta' ? '#a21caf' : c.clasificacion === 'media' ? '#ec4899' : '#f472b6',
                    fillOpacity: 0.35,
                  }}
                >
                  <Tooltip direction="top" offset={[0, -6]}>
                    <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                      <strong>Zona analizada</strong><br />
                      Delitos: {c.casosDelitos}<br />
                      IRISP1: {c.casosIrisp1}<br />
                      Densidad Delitos: {(c.intensidadDelitos * 100).toFixed(0)}%<br />
                      Densidad IRISP1: {(c.intensidadIrisp1 * 100).toFixed(0)}%<br />
                      <strong>Correspondencia espacial: {c.coincidenciaPct.toFixed(0)}%</strong><br />
                      {c.clasificacion === 'alta' ? '🟢 Alta correspondencia' : c.clasificacion === 'media' ? '🟡 Media correspondencia' : '🔴 Baja correspondencia'}
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}

            {/* En modo comparación, los puntos individuales se ocultan por
                completo — la comparación se lee del mapa de calor (más
                abajo) y de la grilla de coincidencia, sin puntos sueltos que
                compitan visualmente con el degradado. */}
            {!modoComparacion && !(pantallaCompleta && (seleccionIrisp1 || seleccionDelitos)) && capasPuntosProcesadas.filter(({ capa }) => capa.visible).map(({ capa, puntosFiltrados, ordenDelitos }) => (
              puntosFiltrados.map((p, i) => {
                // Vista normal (sin comparar): cada delito con su propio
                // color, igual que semaforiza el resto del dashboard.
                const color = capa.colDelito ? colorPorDelito(p.delitoCorto ?? '', ordenDelitos, capa.tipo) : (capa.tipo === 'irisp1' ? '#2563eb' : capa.tipo === 'delitos' ? '#dc2626' : '#116762');
                return (
                  <CircleMarker
                    key={`${capa.id}-${i}`}
                    center={[p.lat, p.lon]}
                    radius={7}
                    // pane="markerPane": Leaflet dibuja los polígonos (GeoJSON)
                    // en su propio "overlayPane", y por defecto CircleMarker
                    // también usaría ese mismo pane — cuando cambia cualquier
                    // filtro del dashboard, el polígono se vuelve a dibujar
                    // (para recalcular sus colores) y, al reinsertarse,
                    // terminaba tapando los puntos aunque siguieran ahí.
                    // Poniéndolos en "markerPane" (que Leaflet siempre pinta
                    // por encima) quedan visibles pase lo que pase con los
                    // polígonos.
                    pane="markerPane"
                    pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: color, fillOpacity: 0.9 }}
                  >
                    <Popup>
                      <div style={{ fontSize: 12, maxWidth: 260 }}>
                        {/* El nombre/alias de la persona (cuando el archivo lo
                            trae, ej. la columna "Nombre" de IRISP1) se
                            resalta arriba de todo, en vez de perderse entre
                            las demás columnas. */}
                        {(() => {
                          const claveNombre = Object.keys(p.fila).find((k) => /^nombre$/i.test(k.trim()) || /alias/i.test(k));
                          const valorNombre = claveNombre ? p.fila[claveNombre] : null;
                          return valorNombre ? (
                            <p style={{ marginBottom: 6, fontWeight: 700, color: '#0f172a', borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                              {valorNombre}
                            </p>
                          ) : null;
                        })()}
                        <table>
                          <tbody>
                            {Object.entries(p.fila)
                              .filter(([k]) => !/^nombre$/i.test(k.trim()) && !/alias/i.test(k))
                              .slice(0, 12)
                              .filter(([, v]) => v !== '' && v !== undefined)
                              .map(([k, v]) => (
                                <tr key={k}>
                                  <td style={{ paddingRight: 8, color: '#64748b', fontWeight: 600, verticalAlign: 'top' }}>{k}</td>
                                  <td>{String(v)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })
            ))}
          </MapContainer>
        </div>
      </Card>

      {capas.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin size={13} /> El mapa se centra en Popayán por defecto. Al cargar una capa, ajusta el zoom manualmente para ubicarla.
        </div>
      )}
    </div>
  );
}
