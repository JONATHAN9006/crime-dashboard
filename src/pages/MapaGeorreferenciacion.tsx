import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON as GeoJSONLayer, CircleMarker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import shp from 'shpjs';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertCircle, FileUp, Layers, MapPin, Trash2, Eye, EyeOff, Palette, Info, X, User, Calendar, Maximize2, Download } from 'lucide-react';
import clsx from 'clsx';
import { Card, PageHeader } from '../components/ui/Card';
import { guardarCapas, cargarCapas, limpiarCapas, type CapaGeografica } from '../data/geoStorage';
import {
  guardarCapasPuntos, cargarCapasPuntos, delitosIrispEquivalentes, dependenciasIrispEquivalentes, type CapaPuntos, type TipoCapaPuntos,
} from '../data/puntosStorage';
import { KernelHeatmapLayer } from '../components/mapa/KernelHeatmapLayer';
import { puntoEnFeatureGeoJSON } from '../utils/puntoEnPoligono';
import { exportarPoligonoAislado, generarDataUrlPoligonoAislado } from '../utils/exportarPoligonoMapa';
import { construirGrillaComparativa } from '../data/mapaCalorAnalisis';
import { CargaCapaPuntosModal } from '../components/mapa/CargaCapaPuntosModal';
import { useData } from '../context/DataContext';
import { agruparPor, formatNumero } from '../utils/aggregations';
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

function extraerFeatures(geojson: any): any[] {
  return Array.isArray(geojson) ? geojson.flatMap((g) => g.features || []) : geojson?.features || [];
}

// Todos los anillos (contornos) de polígono de un feature — o de VARIOS, si
// "feature" en realidad es una FeatureCollection (la selección "Filtro
// activo (N zonas)" combina así varios polígonos en una sola unidad). Cada
// anillo es un array de [lon, lat] — el formato crudo de GeoJSON, todavía
// sin proyectar a píxeles.
function extraerAnillosDeFeature(feature: any): [number, number][][] {
  const anillos: [number, number][][] = [];
  function procesarGeometria(geom: any) {
    if (!geom) return;
    if (geom.type === 'Polygon') {
      for (const anillo of geom.coordinates) anillos.push(anillo);
    } else if (geom.type === 'MultiPolygon') {
      for (const poligono of geom.coordinates) for (const anillo of poligono) anillos.push(anillo);
    }
  }
  if (feature?.type === 'FeatureCollection') {
    for (const f of feature.features || []) procesarGeometria(f.geometry);
  } else {
    procesarGeometria(feature?.geometry);
  }
  return anillos;
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

// Detecta SOLO, sin que el usuario tenga que configurar nada, cuál columna
// del shapefile es la que trae el nombre del CAI/Estación/Cuadrante — mira
// cada columna de una muestra de polígonos y cuenta cuántos de sus valores
// ya existen en los datos cargados (ej. "E-Norte", "CAI 5"). La columna con
// más coincidencias gana. Si el shapefile no trae ninguna columna
// reconocible, devuelve null.
function detectarCampoUnion(geojson: any, valoresConocidos: Set<string>): string | null {
  const features = extraerFeatures(geojson).slice(0, 300);
  if (features.length === 0 || valoresConocidos.size === 0) return null;
  const aciertosPorCampo = new Map<string, number>();
  for (const f of features) {
    for (const [clave, valor] of Object.entries(f?.properties ?? {})) {
      if (typeof valor !== 'string' && typeof valor !== 'number') continue;
      if (valoresConocidos.has(normalizar(valor))) {
        aciertosPorCampo.set(clave, (aciertosPorCampo.get(clave) ?? 0) + 1);
      }
    }
  }
  let mejorCampo: string | null = null;
  let mejorConteo = 0;
  for (const [campo, conteo] of aciertosPorCampo) {
    if (conteo > mejorConteo) {
      mejorCampo = campo;
      mejorConteo = conteo;
    }
  }
  return mejorCampo;
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

// Selección por clic — a nivel de MAPA (no por capa individual). Si dos
// polígonos se superponen en el punto donde se hizo clic (ej. el contorno
// grande de una Estación y, adentro, un Cuadrante más pequeño), Leaflet por
// sí solo le entrega el clic al que esté dibujado ENCIMA — que puede no ser
// el que el usuario quiso tocar. Aquí se prueba el punto contra TODAS las
// capas visibles con el mismo punto-en-polígono ya usado para el mapa de
// calor, y de todas las que sí contienen ese punto, se elige la de MENOR
// área — es decir, la más específica/anidada (el Cuadrante antes que su
// Estación, si ambos contienen el punto).
function SeleccionPorClicEnMapa({ capas, camposUnion, onSeleccionar }: { capas: CapaGeografica[]; camposUnion: Map<string, string | null>; onSeleccionar: (sel: { capaId: string; feature: any; nombre: string } | null) => void }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      let mejor: { capaId: string; feature: any; nombre: string; area: number } | null = null;
      for (const capa of capas) {
        if (!capa.visible) continue;
        const campo = camposUnion.get(capa.id);
        for (const f of extraerFeatures(capa.geojson)) {
          if (!puntoEnFeatureGeoJSON(lng, lat, f)) continue;
          const bounds = L.geoJSON(f).getBounds();
          const area = (bounds.getNorth() - bounds.getSouth()) * (bounds.getEast() - bounds.getWest());
          if (!mejor || area < mejor.area) {
            const nombre = campo && f.properties?.[campo] ? String(f.properties[campo]) : (f.properties?.nombre || f.properties?.NOMBRE || 'Zona seleccionada');
            mejor = { capaId: capa.id, feature: f, nombre, area };
          }
        }
      }
      onSeleccionar(mejor ? { capaId: mejor.capaId, feature: mejor.feature, nombre: mejor.nombre } : null);
    },
  });
  return null;
}

// Guarda la instancia real de Leaflet en una ref accesible desde fuera del
// árbol de componentes del mapa (la necesita la descarga, para proyectar
// las coordenadas del polígono seleccionado a píxeles y poder recortar la
// imagen exactamente a su forma).
function CapturarInstanciaDeMapa({ mapaRef }: { mapaRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapaRef.current = map;
  }, [map, mapaRef]);
  return null;
}

function AjustarVistaAPoligono({ feature }: { feature: any }) {
  const map = useMap();
  useEffect(() => {
    if (!feature) return;
    try {
      const capa = L.geoJSON(feature);
      map.fitBounds(capa.getBounds(), { padding: [30, 30], maxZoom: 17 });
    } catch { /* geometría inválida — se ignora, el mapa se queda como estaba */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature]);
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
  const { records } = useData();

  // Filtros PROPIOS de este módulo — independientes del filtro general del
  // dashboard (que aquí ni siquiera se muestra). Empiezan vacíos siempre
  // que se entra a la página; cambiar aquí NUNCA afecta a ningún otro
  // módulo, y viceversa.
  const [filtrosMapa, setFiltrosMapa] = useState({
    delito: [] as string[],
    estacion: [] as string[],
    cai: [] as string[],
    cuadrante: [] as string[],
    barrioHecho: [] as string[],
  });
  const filters = filtrosMapa; // alias interno — así el resto del archivo, que ya usa "filters.delito" etc., no hay que reescribirlo entero.

  // Registros filtrados SOLO con los filtros propios del mapa — reemplaza
  // al "filteredRecords" global (que aquí no aplica) para lo poco que se
  // usa (el conteo "colorear por casos" y el texto informativo).
  const filteredRecords = useMemo(() => {
    return records.filter((r) =>
      (filtrosMapa.delito.length === 0 || filtrosMapa.delito.includes(r.delito)) &&
      (filtrosMapa.estacion.length === 0 || filtrosMapa.estacion.includes(r.estacion)) &&
      (filtrosMapa.cai.length === 0 || filtrosMapa.cai.includes(r.cai)) &&
      (filtrosMapa.cuadrante.length === 0 || filtrosMapa.cuadrante.includes(r.cuadrante)) &&
      (filtrosMapa.barrioHecho.length === 0 || filtrosMapa.barrioHecho.includes(r.barrioHecho)),
    );
  }, [records, filtrosMapa]);

  // Opciones disponibles para cada filtro — SOLO valores que de verdad
  // existen en los datos cargados (nunca una lista vacía ni inventada).
  const esValorReal = (v: string) => !!v && !['NO REPORTADO', 'SIN REPORTAR', 'SIN ASIGNAR', 'N/A', 'NA', '-'].includes(v.trim().toUpperCase());
  const opcionesFiltroMapa = useMemo(() => ({
    delito: Array.from(new Set(records.map((r) => r.delito).filter(esValorReal))).sort(),
    estacion: Array.from(new Set(records.map((r) => r.estacion).filter(esValorReal))).sort(),
    cai: Array.from(new Set(records.map((r) => r.cai).filter(esValorReal))).sort(),
    cuadrante: Array.from(new Set(records.map((r) => r.cuadrante).filter(esValorReal))).sort(),
    barrioHecho: Array.from(new Set(records.map((r) => r.barrioHecho).filter(esValorReal))).sort(),
  }), [records]);

  const [mostrarSelectorFuentes, setMostrarSelectorFuentes] = useState(false);
  const [mostrarEnConstruccion, setMostrarEnConstruccion] = useState<string | null>(null);
  const [mostrarFiltrosMapa, setMostrarFiltrosMapa] = useState(false);
  // Fuentes propias del módulo — Operatividad y Macri quedan como
  // interruptores preparados (sin datos ni capa real detrás todavía); se
  // activan solos en cuanto se cargue su Excel correspondiente más adelante.
  const [fuentesActivas, setFuentesActivas] = useState({ irisp1: true, delitos: true, operatividad: false, macri: false });

  // Colores por CAI — configurables a mano, se guardan en localStorage para
  // que se mantengan mientras se use el dashboard (no se pierden al
  // refrescar la página). Nunca afectan el color del mapa de calor, solo
  // sirven para diferenciar visualmente cada CAI.
  const [coloresCai, setColoresCai] = useState<Record<string, string>>(() => {
    try {
      const guardado = localStorage.getItem('mepoy-colores-cai');
      return guardado ? JSON.parse(guardado) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try { localStorage.setItem('mepoy-colores-cai', JSON.stringify(coloresCai)); } catch { /* si el navegador bloquea localStorage, simplemente no se guarda */ }
  }, [coloresCai]);
  const PALETA_CAI_DEFECTO = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f97316', '#14b8a6', '#eab308', '#ec4899'];
  function colorDeCai(nombreCai: string): string {
    if (coloresCai[nombreCai]) return coloresCai[nombreCai];
    const indice = opcionesFiltroMapa.cai.indexOf(nombreCai);
    return PALETA_CAI_DEFECTO[indice % PALETA_CAI_DEFECTO.length] ?? '#116762';
  }

  // Transparencia configurable — independiente para el mapa de calor, el
  // relleno de los polígonos, y las etiquetas. 0 a 100 (%).
  const [opacidades, setOpacidades] = useState({ calor: 70, poligono: 100, etiquetas: 100 });
  // Los paneles de detalle de cada fuente de puntos (Estado del trámite,
  // Dependencia, Semaforización, etc.) ahora empiezan COLAPSADOS — con el
  // nuevo panel "Filtros de visualización" de la izquierda, ya no hace
  // falta tenerlos abiertos por defecto; siguen disponibles con un clic
  // para quien los necesite.
  const [capasDetalleAbiertas, setCapasDetalleAbiertas] = useState<Set<string>>(new Set());

  // Jerarquía real cuadrante → CAI → estación, tomada de los datos ya
  // cargados — así, si un shapefile trae solo el nombre del CUADRANTE (el
  // caso más común), igual se puede saber si ese cuadrante pertenece al CAI
  // o a la estación que el usuario tenga filtrados arriba.
  const jerarquiaCuadrantes = useMemo(() => {
    const mapa = new Map<string, { cai: string | null; estacion: string | null }>();
    for (const r of records) {
      if (r.cuadrante && !mapa.has(normalizar(r.cuadrante))) {
        mapa.set(normalizar(r.cuadrante), { cai: r.cai, estacion: r.estacion });
      }
    }
    return mapa;
  }, [records]);

  // Igual que arriba pero a nivel de CAI — necesaria para que un polígono
  // de CAI (no de cuadrante) también se resalte cuando el filtro activo es
  // por Estación (ej. "Estación Norte" debe resaltar sus CAI 1-4 Y sus
  // cuadrantes, no solo estos últimos).
  const jerarquiaCai = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const r of records) {
      if (r.cai && !mapa.has(normalizar(r.cai))) mapa.set(normalizar(r.cai), r.estacion);
    }
    return mapa;
  }, [records]);

  // CAI que pertenecen a la Estación filtrada en este momento — se
  // recalcula solo cuando cambia la Estación o la lista real de CAI. Vacío
  // si no hay ninguna Estación filtrada (o si hay más de una).
  const caiDeEstacionActiva = useMemo(() => {
    if (filtrosMapa.estacion.length !== 1) return [];
    const estacionNorm = normalizar(filtrosMapa.estacion[0]);
    return opcionesFiltroMapa.cai.filter((cai) => normalizar(jerarquiaCai.get(normalizar(cai)) ?? '') === estacionNorm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrosMapa.estacion, jerarquiaCai, opcionesFiltroMapa.cai]);

  // Todo lo que el dashboard ya conoce como "nombre real" de una zona
  // (estación, CAI o cuadrante) — se usa para adivinar solo qué columna de
  // cada shapefile corresponde a cuál cosa, sin que el usuario tenga que
  // configurarlo a mano.
  const valoresConocidos = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.estacion) set.add(normalizar(r.estacion));
      if (r.cai) set.add(normalizar(r.cai));
      if (r.cuadrante) set.add(normalizar(r.cuadrante));
    }
    return set;
  }, [records]);

  // ¿Este valor (el que traiga el shapefile en su campo de unión) coincide
  // con el CAI, la Estación o el Cuadrante que el usuario tenga
  // seleccionados arriba en Filtros? Si el shapefile es a nivel de
  // cuadrante o de CAI, resuelve primero a qué CAI/estación pertenece antes
  // de comparar.
  function coincideConFiltrosActivos(valorCrudo: unknown): boolean {
    if (!valorCrudo) return false;
    const norm = normalizar(valorCrudo);
    if (filters.cai.some((c) => normalizar(c) === norm)) return true;
    if (filters.estacion.some((e) => normalizar(e) === norm)) return true;
    if (filters.cuadrante.some((c) => normalizar(c) === norm)) return true;
    const infoCuadrante = jerarquiaCuadrantes.get(norm);
    if (infoCuadrante) {
      if (infoCuadrante.cai && filters.cai.some((c) => normalizar(c) === normalizar(infoCuadrante.cai))) return true;
      if (infoCuadrante.estacion && filters.estacion.some((e) => normalizar(e) === normalizar(infoCuadrante.estacion))) return true;
    }
    const estacionDelCai = jerarquiaCai.get(norm);
    if (estacionDelCai && filters.estacion.some((e) => normalizar(e) === normalizar(estacionDelCai))) return true;
    return false;
  }
  const soloLectura = esModoConsulta();
  const [capas, setCapas] = useState<CapaGeografica[]>([]);

  // Campo de unión EFECTIVO por capa: el que el usuario haya configurado a
  // mano (si lo hizo), o si no, el que se detecte solo. Así el resaltado
  // por filtro funciona aunque nadie haya tocado la configuración manual de
  // "Colorear por casos".
  const camposUnionAutoDetectados = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const capa of capas) {
      mapa.set(capa.id, capa.campoUnion ?? detectarCampoUnion(capa.geojson, valoresConocidos));
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capas, valoresConocidos]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [capasPuntos, setCapasPuntos] = useState<CapaPuntos[]>([]);
  // Zona seleccionada (clic sobre un polígono de una capa cargada) — para
  // recortar el mapa de calor a solo esa zona y poder descargarla aparte.
  const [zonaSeleccionada, setZonaSeleccionada] = useState<{ capaId: string; feature: any; nombre: string } | null>(null);
  const [delitoZonaSeleccionada, setDelitoZonaSeleccionada] = useState<string | null>(null);

  // Todos los polígonos, de CUALQUIER capa visible, que coincidan con el
  // CAI/Estación/Cuadrante filtrados arriba — se recalcula solo cuando
  // cambian los filtros o las capas cargadas.
  const featuresPorFiltroActivo = useMemo(() => {
    const resultado: any[] = [];
    for (const capa of capas) {
      if (!capa.visible) continue;
      const campo = camposUnionAutoDetectados.get(capa.id);
      if (!campo) continue;
      for (const f of extraerFeatures(capa.geojson)) {
        if (coincideConFiltrosActivos(f?.properties?.[campo])) resultado.push(f);
      }
    }
    return resultado;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capas, camposUnionAutoDetectados, filters.cai, filters.estacion, filters.cuadrante, jerarquiaCuadrantes, jerarquiaCai]);

  // "Zona activa" = lo que se haya seleccionado con un clic puntual, o —
  // si no hay ningún clic— TODOS los polígonos que ya coincidan con el
  // filtro de arriba, tratados como una sola unidad (mismo mapa de calor
  // recortado, mismo botón de descarga, mismo encuadre automático).
  const zonaActiva = zonaSeleccionada
    ? zonaSeleccionada
    : featuresPorFiltroActivo.length > 0
      ? {
          capaId: '__filtro__',
          feature: { type: 'FeatureCollection', features: featuresPorFiltroActivo },
          nombre: `Filtro activo (${featuresPorFiltroActivo.length} zona${featuresPorFiltroActivo.length === 1 ? '' : 's'})`,
        }
      : null;
  const [descargandoZona, setDescargandoZona] = useState(false);
  const mapaRef = useRef<L.Map | null>(null);
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

  // Puntos (de la fuente que esté visible en ese momento — Delitos o
  // IRISP1, lo que sea que ya se esté mostrando) que caen DENTRO del
  // polígono seleccionado — recalculado solo cuando cambia la zona, la
  // fuente de puntos, o el delito elegido específicamente para esa zona.
  // Universo de puntos con su delito conservado (capasPuntosProcesadas trae
  // el objeto completo; las listas "...ParaMostrar" de arriba ya lo
  // recortan a solo {lat, lon} para el mapa de calor general) — de aquí
  // salen los puntos reales para recortar por polígono.
  const todosLosPuntosVisiblesConDelito = useMemo(
    () => capasPuntosProcesadas.filter(({ capa }) => capa.visible).flatMap(({ puntosFiltrados }) => puntosFiltrados),
    [capasPuntosProcesadas],
  );

  const delitosDisponiblesEnZona = useMemo(() => {
    if (!zonaActiva) return [];
    const universo = todosLosPuntosVisiblesConDelito.filter((p) => puntoEnFeatureGeoJSON(p.lon, p.lat, zonaActiva.feature));
    return Array.from(new Set(universo.map((p) => p.delitoCorto ?? 'NO REPORTADO'))).sort();
  }, [zonaActiva, todosLosPuntosVisiblesConDelito]);

  const puntosEnZonaParaCalor = useMemo(() => {
    if (!zonaActiva) return [];
    return todosLosPuntosVisiblesConDelito.filter((p) => {
      if (delitoZonaSeleccionada && (p.delitoCorto ?? 'NO REPORTADO') !== delitoZonaSeleccionada) return false;
      return puntoEnFeatureGeoJSON(p.lon, p.lat, zonaActiva.feature);
    });
  }, [zonaActiva, delitoZonaSeleccionada, todosLosPuntosVisiblesConDelito]);

  // Límites internos de CUADRANTE que caen dentro de una zona dada — se
  // dibujan también en la imagen exportada (además del contorno de la zona
  // en sí), para que se vea la subdivisión interna.
  function calcularAnillosCuadrantesInternos(feature: any): [number, number][][] {
    const anillos: [number, number][][] = [];
    for (const capa of capas) {
      const campo = camposUnionAutoDetectados.get(capa.id);
      if (!campo) continue;
      for (const f of extraerFeatures(capa.geojson)) {
        const valor = String(f?.properties?.[campo] ?? '');
        const esCuadrante = opcionesFiltroMapa.cuadrante.some((c) => normalizar(c) === normalizar(valor));
        if (!esCuadrante) continue;
        const geom = f.geometry;
        const puntoRepresentativo: [number, number] | undefined = geom?.type === 'Polygon' ? geom.coordinates[0]?.[0] : geom?.type === 'MultiPolygon' ? geom.coordinates[0]?.[0]?.[0] : undefined;
        if (!puntoRepresentativo) continue;
        if (puntoEnFeatureGeoJSON(puntoRepresentativo[0], puntoRepresentativo[1], feature)) {
          anillos.push(...extraerAnillosDeFeature(f));
        }
      }
    }
    return anillos;
  }

  // Busca el polígono PROPIO de un CAI (no el de la estación completa) —
  // recorre las capas cargadas y devuelve el primer feature cuyo campo
  // detectado coincida con ese nombre de CAI exacto.
  function buscarFeatureDeCai(nombreCai: string): any | null {
    for (const capa of capas) {
      const campo = camposUnionAutoDetectados.get(capa.id);
      if (!campo) continue;
      for (const f of extraerFeatures(capa.geojson)) {
        const valor = String(f?.properties?.[campo] ?? '');
        if (normalizar(valor) === normalizar(nombreCai)) return f;
      }
    }
    return null;
  }

  // Miniaturas de mapa de calor, una por cada CAI de la Estación
  // seleccionada — se regeneran solas cuando cambia la lista de CAI o el
  // delito filtrado. Cada una usa el MISMO motor de dibujo que la
  // descarga principal (calles + Kernel Density + borde), solo que a un
  // tamaño más chico para que las 3-4 se generen rápido.
  const [previsualizacionesCai, setPrevisualizacionesCai] = useState<Record<string, string | 'cargando' | 'error'>>({});

  useEffect(() => {
    if (caiDeEstacionActiva.length === 0) return;
    let cancelado = false;
    for (const nombreCai of caiDeEstacionActiva) {
      setPrevisualizacionesCai((prev) => ({ ...prev, [nombreCai]: 'cargando' }));
      const feature = buscarFeatureDeCai(nombreCai);
      if (!feature) {
        setPrevisualizacionesCai((prev) => ({ ...prev, [nombreCai]: 'error' }));
        continue;
      }
      const puntosDeEsteCai = todosLosPuntosVisiblesConDelito.filter((p) => puntoEnFeatureGeoJSON(p.lon, p.lat, feature));
      const conteoPorDelito = new Map<string, number>();
      for (const p of puntosDeEsteCai) conteoPorDelito.set(p.delitoCorto ?? 'No reportado', (conteoPorDelito.get(p.delitoCorto ?? 'No reportado') ?? 0) + 1);
      const etiquetas = [`${nombreCai} — Total: ${puntosDeEsteCai.length} caso${puntosDeEsteCai.length === 1 ? '' : 's'}`];
      generarDataUrlPoligonoAislado({
        feature,
        puntos: puntosDeEsteCai,
        colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
        etiquetas,
        opacidadCalor: opacidades.calor / 100,
        opacidadPoligono: opacidades.poligono / 100,
        opacidadEtiquetas: opacidades.etiquetas / 100,
      })
        .then((dataUrl) => { if (!cancelado) setPrevisualizacionesCai((prev) => ({ ...prev, [nombreCai]: dataUrl })); })
        .catch(() => { if (!cancelado) setPrevisualizacionesCai((prev) => ({ ...prev, [nombreCai]: 'error' })); });
    }
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caiDeEstacionActiva.join(','), filtrosMapa.delito.join(','), opacidades.calor, opacidades.poligono, opacidades.etiquetas]);

  async function descargarPrevisualizacionCai(nombreCai: string) {
    const feature = buscarFeatureDeCai(nombreCai);
    if (!feature) return;
    const puntosDeEsteCai = todosLosPuntosVisiblesConDelito.filter((p) => puntoEnFeatureGeoJSON(p.lon, p.lat, feature));
    const conteoPorDelito = new Map<string, number>();
    for (const p of puntosDeEsteCai) conteoPorDelito.set(p.delitoCorto ?? 'No reportado', (conteoPorDelito.get(p.delitoCorto ?? 'No reportado') ?? 0) + 1);
    const lineasDelito = Array.from(conteoPorDelito.entries()).sort((a, b) => b[1] - a[1]).map(([d, c]) => `${d}: ${c} caso${c === 1 ? '' : 's'}`);
    try {
      await exportarPoligonoAislado({
        feature,
        puntos: puntosDeEsteCai,
        colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
        etiquetas: [`${nombreCai} — Total: ${puntosDeEsteCai.length} caso${puntosDeEsteCai.length === 1 ? '' : 's'}`, ...lineasDelito],
        nombreArchivo: `mapa-calor-${nombreCai}`.replace(/\s+/g, '-'),
        opacidadCalor: opacidades.calor / 100,
        opacidadPoligono: opacidades.poligono / 100,
        opacidadEtiquetas: opacidades.etiquetas / 100,
      });
    } catch (err) {
      console.error('[MapaGeorreferenciacion] Falló la descarga de la miniatura de CAI:', err);
      setError(`No fue posible descargar el mapa de ${nombreCai}. Revisa la consola (F12).`);
    }
  }

  async function descargarZonaSeleccionada() {
    if (!zonaActiva) return;
    setDescargandoZona(true);
    try {
      const anillosCuadrantesInternos = calcularAnillosCuadrantesInternos(zonaActiva.feature);

      // Desglose REAL por delito — cada línea sale de contar
      // puntosEnZonaParaCalor (los mismos puntos que ya se están pintando
      // en el mapa de calor), agrupados por delito. Nunca es un número
      // inventado: si dice "Homicidio: 3", es porque hay exactamente 3
      // puntos de Homicidio dentro de ese polígono.
      const conteoPorDelito = new Map<string, number>();
      for (const p of puntosEnZonaParaCalor) {
        const nombre = p.delitoCorto ?? 'No reportado';
        conteoPorDelito.set(nombre, (conteoPorDelito.get(nombre) ?? 0) + 1);
      }
      const lineasDelito = Array.from(conteoPorDelito.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([delito, casos]) => `${delito}: ${casos} caso${casos === 1 ? '' : 's'}`);
      const etiquetas = [
        `${zonaActiva.nombre} — Total: ${puntosEnZonaParaCalor.length} caso${puntosEnZonaParaCalor.length === 1 ? '' : 's'}`,
        ...lineasDelito,
      ];
      await exportarPoligonoAislado({
        feature: zonaActiva.feature,
        puntos: puntosEnZonaParaCalor,
        colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
        etiquetas,
        nombreArchivo: `mapa-calor-${zonaActiva.nombre}`.replace(/\s+/g, '-'),
        opacidadCalor: opacidades.calor / 100,
        opacidadPoligono: opacidades.poligono / 100,
        opacidadEtiquetas: opacidades.etiquetas / 100,
        anillosInternos: anillosCuadrantesInternos,
      });
    } catch (err) {
      console.error('[MapaGeorreferenciacion] Falló la descarga del mapa de calor:', err);
      setError('No fue posible generar la imagen del mapa. Revisa la consola del navegador (F12) para más detalle.');
    } finally {
      setDescargandoZona(false);
    }
  }

  async function copiarZonaAlPortapapeles() {
    if (!zonaActiva) return;
    setDescargandoZona(true);
    try {
      const anillosCuadrantesInternos = calcularAnillosCuadrantesInternos(zonaActiva.feature);
      const conteoPorDelito = new Map<string, number>();
      for (const p of puntosEnZonaParaCalor) {
        const nombre = p.delitoCorto ?? 'No reportado';
        conteoPorDelito.set(nombre, (conteoPorDelito.get(nombre) ?? 0) + 1);
      }
      const lineasDelito = Array.from(conteoPorDelito.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([delito, casos]) => `${delito}: ${casos} caso${casos === 1 ? '' : 's'}`);
      const etiquetas = [
        `${zonaActiva.nombre} — Total: ${puntosEnZonaParaCalor.length} caso${puntosEnZonaParaCalor.length === 1 ? '' : 's'}`,
        ...lineasDelito,
      ];
      await exportarPoligonoAislado({
        feature: zonaActiva.feature,
        puntos: puntosEnZonaParaCalor,
        colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
        etiquetas,
        nombreArchivo: `mapa-calor-${zonaActiva.nombre}`.replace(/\s+/g, '-'),
        opacidadCalor: opacidades.calor / 100,
        opacidadPoligono: opacidades.poligono / 100,
        opacidadEtiquetas: opacidades.etiquetas / 100,
        alPortapapeles: true,
        anillosInternos: anillosCuadrantesInternos,
      });
    } catch (err) {
      console.error('[MapaGeorreferenciacion] Falló la copia al portapapeles:', err);
      setError('No fue posible copiar la imagen al portapapeles. Revisa la consola (F12), o usa "Descargar imagen".');
    } finally {
      setDescargandoZona(false);
    }
  }

  function ajustarVistaAZonaActiva() {
    if (!mapaRef.current || !zonaActiva) return;
    try {
      const capaTemporal = L.geoJSON(zonaActiva.feature);
      mapaRef.current.fitBounds(capaTemporal.getBounds(), { padding: [30, 30], maxZoom: 17 });
    } catch { /* geometría inválida — se ignora */ }
  }

  // Descarga del mapa GENERAL — no depende de tener una zona seleccionada:
  // toma el rectángulo de lo que se está viendo en pantalla en ese momento
  // como si fuera el "polígono", con exactamente los mismos puntos que ya
  // se están mostrando (respetando los checkboxes de IRISP1/Delitos
  // activos y el filtro de este mapa).
  async function descargarMapaGeneral() {
    if (!mapaRef.current) return;
    setDescargandoZona(true);
    try {
      const bounds = mapaRef.current.getBounds();
      const sur = bounds.getSouth(), norte = bounds.getNorth(), oeste = bounds.getWest(), este = bounds.getEast();
      const featureRectangular = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[oeste, sur], [este, sur], [este, norte], [oeste, norte], [oeste, sur]]] },
        properties: {},
      };
      const puntosVisibles = todosLosPuntosVisiblesConDelito;

      const conteoPorDelito = new Map<string, number>();
      for (const p of puntosVisibles) {
        const nombre = p.delitoCorto ?? 'No reportado';
        conteoPorDelito.set(nombre, (conteoPorDelito.get(nombre) ?? 0) + 1);
      }
      const lineasDelito = Array.from(conteoPorDelito.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([delito, casos]) => `${delito}: ${casos} caso${casos === 1 ? '' : 's'}`);
      const etiquetas = [
        `Mapa general — Total: ${puntosVisibles.length} caso${puntosVisibles.length === 1 ? '' : 's'}`,
        ...lineasDelito,
      ];

      await exportarPoligonoAislado({
        feature: featureRectangular,
        puntos: puntosVisibles,
        colores: mostrarCalorIrisp1 && !mostrarCalorDelitos ? ['#60a5fa', '#3b82f6', '#6366f1', '#7c3aed', '#581c87'] : ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
        etiquetas,
        nombreArchivo: 'mapa-general-mepoy',
        opacidadCalor: opacidades.calor / 100,
        opacidadPoligono: 0,
        opacidadEtiquetas: opacidades.etiquetas / 100,
      });
    } catch (err) {
      console.error('[MapaGeorreferenciacion] Falló la descarga del mapa general:', err);
      setError('No fue posible generar la imagen del mapa general. Revisa la consola del navegador (F12) para más detalle.');
    } finally {
      setDescargandoZona(false);
    }
  }

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
  const mostrarCalorDelitos = fuentesActivas.delitos && (pantallaCompleta ? !!seleccionDelitos : capasPuntos.some((c) => c.tipo === 'delitos' && c.visible));
  const mostrarCalorIrisp1 = fuentesActivas.irisp1 && (pantallaCompleta ? !!seleccionIrisp1 : capasPuntos.some((c) => c.tipo === 'irisp1' && c.visible));

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
    filters.estacion.length > 0 && `Estación: ${filters.estacion.join(', ')}`,
    filters.delito.length > 0 && `Delito: ${filters.delito.join(', ')}`,
    filters.cai.length > 0 && `CAI: ${filters.cai.join(', ')}`,
    filters.cuadrante.length > 0 && `Zona de Atención: ${filters.cuadrante.join(', ')}`,
    filters.barrioHecho.length > 0 && `Barrio: ${filters.barrioHecho.join(', ')}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <PageHeader title="Mapa / Georreferenciación" subtitle="Visualiza y compara varias capas geográficas (Shapefile o GeoJSON) sobre el territorio." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr_260px]">
        {/* ── COLUMNA IZQUIERDA: Filtros de visualización ── */}
        <div className="rounded-xl bg-brand-navy p-4 text-white lg:sticky lg:top-4 lg:self-start">
          <p className="mb-3 text-sm font-bold">Filtros de visualización</p>

          <div className="space-y-3">
            {([
              ['delito', 'Delito'], ['cuadrante', 'Zona de Atención'], ['estacion', 'Estación'], ['cai', 'CAI'], ['barrioHecho', 'Barrio'],
            ] as const).map(([clave, etiqueta]) => (
              <div key={clave}>
                <label className="mb-1 block text-xs font-semibold text-slate-300">{etiqueta}</label>
                <select
                  value={filtrosMapa[clave][0] ?? ''}
                  onChange={(e) => setFiltrosMapa((prev) => ({ ...prev, [clave]: e.target.value ? [e.target.value] : [] }))}
                  className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white"
                >
                  <option value="" className="text-slate-800">Todos</option>
                  {opcionesFiltroMapa[clave].map((v) => <option key={v} value={v} className="text-slate-800">{v}</option>)}
                </select>
              </div>
            ))}
          </div>

          {capas.length > 0 && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">Capas cargadas</p>
              <div className="space-y-1.5">
                {capas.map((capa) => (
                  <label key={capa.id} className="flex cursor-pointer items-center gap-2 text-xs">
                    <input type="checkbox" checked={capa.visible} onChange={(e) => actualizarCapa(capa.id, { visible: e.target.checked })} />
                    <span className="truncate">{capa.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMostrarSelectorFuentes(true)}
            className="mt-4 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
          >
            📊 Seleccionar fuentes
          </button>

          {!soloLectura && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cargar información</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20"
              >
                <FileUp size={13} /> {cargando ? 'Procesando...' : 'Cargar capa'}
              </button>
              <button
                type="button"
                onClick={() => setModalCapaPuntos('IRISP1')}
                className="flex w-full items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
              >
                <FileUp size={13} /> IRISP1
              </button>
              <button
                type="button"
                onClick={() => setModalCapaPuntos('Delitos')}
                className="flex w-full items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
              >
                <FileUp size={13} /> Delitos
              </button>
              <button type="button" onClick={() => setMostrarEnConstruccion('Operatividad')} className="flex w-full items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10">
                <FileUp size={13} /> Operatividad
              </button>
              <button type="button" onClick={() => setMostrarEnConstruccion('Macri')} className="flex w-full items-center gap-1.5 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10">
                <FileUp size={13} /> Macri
              </button>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setFiltrosMapa({ delito: [], estacion: [], cai: [], cuadrante: [], barrioHecho: [] })}
              className="flex-1 rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold hover:bg-white/10"
            >
              🔄 Limpiar
            </button>
          </div>

          <p className="mt-3 text-[11px] text-slate-400">
            {filtrosActivos.length > 0
              ? <>{filteredRecords.length.toLocaleString('es-CO')} registros con estos filtros.</>
              : <>Sin filtros — {filteredRecords.length.toLocaleString('es-CO')} registros considerados.</>}
            {' '}Propios de este mapa, no afectan al resto del dashboard.
          </p>
        </div>

        {/* ── COLUMNA CENTRAL: el mapa en sí (todo lo que ya existía) ── */}
        <div className="min-w-0 space-y-5">

      {mostrarSelectorFuentes && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" onClick={() => setMostrarSelectorFuentes(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-bold text-slate-700">Seleccionar fuentes</p>
            <div className="space-y-2">
              {[
                { clave: 'irisp1' as const, etiqueta: 'IRISP1', disponible: true },
                { clave: 'delitos' as const, etiqueta: 'Delitos', disponible: true },
                { clave: 'operatividad' as const, etiqueta: 'Operatividad', disponible: false },
                { clave: 'macri' as const, etiqueta: 'Macri', disponible: false },
              ].map((f) => (
                <label key={f.clave} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${f.disponible ? 'border-slate-200' : 'border-slate-100 text-slate-400'}`}>
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fuentesActivas[f.clave]}
                      disabled={!f.disponible}
                      onChange={(e) => setFuentesActivas((prev) => ({ ...prev, [f.clave]: e.target.checked }))}
                    />
                    {f.etiqueta}
                  </span>
                  {!f.disponible && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">Próximamente</span>}
                </label>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">Operatividad y Macri quedan listas para activarse solas en cuanto se cargue su información correspondiente (capturas, incautaciones, etc.) — todavía no hay datos de esas fuentes.</p>
            <button type="button" onClick={() => setMostrarSelectorFuentes(false)} className="mt-3 w-full rounded-lg bg-brand-navy px-3 py-2 text-sm font-semibold text-white">Cerrar</button>
          </div>
        </div>
      )}

      {mostrarEnConstruccion && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4" onClick={() => setMostrarEnConstruccion(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-3xl">🚧</p>
            <p className="mb-1 text-sm font-bold text-slate-700">{mostrarEnConstruccion} — En construcción</p>
            <p className="mb-4 text-xs text-slate-500">Esta fuente todavía no tiene información cargada. En cuanto se suba el Excel correspondiente, se activa aquí mismo.</p>
            <button type="button" onClick={() => setMostrarEnConstruccion(null)} className="w-full rounded-lg bg-brand-navy px-3 py-2 text-sm font-semibold text-white">Entendido</button>
          </div>
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
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

        <input
          ref={inputRef}
          type="file"
          accept=".zip,.geojson,.json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }}
        />
      </Card>


      <Card className={clsx('overflow-hidden p-0', pantallaCompleta && 'fixed inset-0 z-[9999] rounded-none')}>
        <div data-mapa-contenedor className="relative" style={{ height: pantallaCompleta ? '100vh' : '65vh', width: '100%' }}>
          {/* Botón de pantalla completa — siempre visible, arriba a la
              derecha del mapa. En pantalla completa se convierte en el
              botón de salir. */}
          <button
            onClick={() => setPantallaCompleta((v) => !v)}
            className="absolute right-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-md hover:bg-white"
          >
            {pantallaCompleta ? <><X size={14} /> Salir de pantalla completa</> : <><Maximize2 size={14} /> Pantalla completa</>}
          </button>

          {/* Descarga del mapa GENERAL — siempre disponible, sin necesidad
              de seleccionar ninguna zona (a diferencia del panel de "Zona
              seleccionada", que solo aparece con un clic o un filtro
              activo). */}
          <button
            onClick={descargarMapaGeneral}
            disabled={descargandoZona}
            className="absolute right-3 top-12 z-[1000] flex items-center gap-1.5 rounded-lg bg-brand-green px-3 py-1.5 text-xs font-medium text-white shadow-md hover:bg-brand-green/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={14} /> {descargandoZona ? 'Generando...' : 'Descargar mapa'}
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
            <CapturarInstanciaDeMapa mapaRef={mapaRef} />
            <SeleccionPorClicEnMapa
              capas={capas}
              camposUnion={camposUnionAutoDetectados}
              onSeleccionar={(sel) => {
                setZonaSeleccionada((actual) => (actual?.feature === sel?.feature ? null : sel));
                setDelitoZonaSeleccionada(null);
              }}
            />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {capas.filter((c) => c.visible).map((capa) => {
              const conteos = capa.dimension ? conteosPorDimension[capa.dimension] : null;
              const maxCasos = conteos ? Math.max(...Array.from(conteos.values()), 0) : 0;

              function estiloFeature(feature: any) {
                const esSeleccionadaPorClic = zonaSeleccionada?.capaId === capa.id && zonaSeleccionada.feature === feature;
                const campoEfectivo = camposUnionAutoDetectados.get(capa.id);
                // Resalta TODOS los polígonos que correspondan al CAI, la
                // Estación o el Cuadrante filtrados arriba — no solo el que
                // se haya seleccionado con un clic puntual.
                const esSeleccionadaPorFiltro = campoEfectivo ? coincideConFiltrosActivos(feature?.properties?.[campoEfectivo]) : false;
                const opacidadPoligono = opacidades.poligono / 100;
                if (esSeleccionadaPorClic || esSeleccionadaPorFiltro) {
                  return { color: '#000000', weight: 4, fillColor: '#000000', fillOpacity: 0.4 * opacidadPoligono };
                }
                if (capa.colorearPorCasos && conteos && capa.campoUnion) {
                  const valorCrudo = feature?.properties?.[capa.campoUnion!];
                  const casos = conteos.get(normalizar(valorCrudo)) ?? 0;
                  return { color: '#000000', weight: 1.5, fillColor: colorPorIntensidad(casos, maxCasos), fillOpacity: 0.65 * opacidadPoligono };
                }
                // Capas de CAI (dimensión sin "colorear por casos" activo):
                // usan el color propio configurable de cada CAI en vez del
                // verde institucional genérico, para diferenciarlos entre sí.
                if (campoEfectivo && opcionesFiltroMapa.cai.length > 0) {
                  const valorCrudo = String(feature?.properties?.[campoEfectivo] ?? '');
                  const coincideCai = opcionesFiltroMapa.cai.find((c) => normalizar(c) === normalizar(valorCrudo));
                  if (coincideCai) {
                    return { color: '#000000', weight: 2, fillColor: colorDeCai(coincideCai), fillOpacity: 0.25 * opacidadPoligono };
                  }
                }
                return { color: '#000000', weight: 2, fillColor: '#116762', fillOpacity: 0.15 * opacidadPoligono };
              }

              function onEachFeature(feature: any, layer: L.Layer) {
                const props = feature.properties || {};
                let filas = Object.entries(props).slice(0, 10).map(([k, v]) => `<tr><td style="padding-right:8px;color:#64748b;font-weight:600">${k}</td><td>${v}</td></tr>`).join('');
                if (capa.colorearPorCasos && conteos && capa.campoUnion) {
                  const casos = conteos.get(normalizar(props[capa.campoUnion])) ?? 0;
                  filas = `<tr><td style="padding-right:8px;color:#116762;font-weight:700">Casos (filtro actual)</td><td style="font-weight:700">${casos}</td></tr>` + filas;
                }
                layer.bindPopup(`<div style="font-size:12px;max-width:220px"><table>${filas || '<tr><td>Sin atributos</td></tr>'}</table></div>`);
                // La SELECCIÓN por clic ya no se maneja aquí (por-capa) sino
                // una sola vez a nivel de todo el mapa — ver
                // SeleccionPorClicEnMapa — para elegir siempre el polígono
                // más específico cuando hay varios superpuestos en el mismo
                // punto. Aquí solo queda el popup con los atributos.
              }

              return (
                <GeoJSONLayer
                  key={`${capa.id}-${capa.colorearPorCasos}-${capa.campoUnion}-${camposUnionAutoDetectados.get(capa.id)}-${capa.dimension}-${filteredRecords.length}-${zonaSeleccionada?.capaId ?? ''}:${zonaSeleccionada?.nombre ?? ''}-${filters.cai.join(',')}-${filters.estacion.join(',')}-${filters.cuadrante.join(',')}-${opacidades.poligono}-${JSON.stringify(coloresCai)}`}
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
                opacidad={opacidades.calor / 100}
              />
            )}

            {/* Mapa de calor de IRISP1: misma cuadrícula compacta, con su
                propia escala de 5 clases (azul → morado), completamente
                distinta a la de Delitos. Se calcula EXCLUSIVAMENTE con los
                puntos de capas tipo "irisp1", y depende únicamente del
                checkbox "IRISP1" de arriba, igual que Delitos. */}
            {mostrarCalorIrisp1 && (
              <KernelHeatmapLayer
                puntos={puntosIrisp1ParaMostrar}
                colores={['#60a5fa', '#3b82f6', '#6366f1', '#7c3aed', '#581c87']}
                opacidad={opacidades.calor / 100}
              />
            )}

            {/* Zona seleccionada con un clic sobre un polígono cargado: el
                mapa se encuadra en ella y, si hay puntos dentro, se pinta un
                mapa de calor recortado a EXACTAMENTE esos puntos (nunca
                mezclado con el resto del mapa) — ver panel flotante para
                elegir el delito y descargar. */}
            {zonaActiva && (
              <>
                <AjustarVistaAPoligono feature={zonaActiva.feature} />
                {puntosEnZonaParaCalor.length > 0 && (
                  <KernelHeatmapLayer puntos={puntosEnZonaParaCalor} colores={['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626']} opacidad={opacidades.calor / 100} />
                )}
              </>
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

            {/* Los puntos individuales se ocultan por completo en modo
                comparación, y también cuando cualquiera de los dos mapas de
                calor (Delitos o IRISP1) está activo — se pidió ver
                directamente el mapa de calor "ya pintado", sin los puntos
                sueltos compitiendo visualmente con la cuadrícula de color. */}
            {!modoComparacion && !mostrarCalorDelitos && !mostrarCalorIrisp1 && capasPuntosProcesadas.filter(({ capa }) => capa.visible).map(({ capa, puntosFiltrados, ordenDelitos }) => (
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

          {/* Panel flotante de la zona seleccionada — aparece con un clic
              sobre cualquier polígono de una capa cargada (ej. el CAI 5).
              El botón de descarga usa exactamente el mismo motor de
              exportación de imágenes que el resto del dashboard. */}
          {zonaActiva && (
            <div className="absolute right-3 top-3 z-[1000] w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Zona seleccionada</p>
                  <p className="text-sm font-bold text-slate-800">{zonaActiva.nombre}</p>
                </div>
                <button onClick={() => setZonaSeleccionada(null)} className="text-slate-400 hover:text-slate-600" title="Quitar selección">
                  <X size={16} />
                </button>
              </div>

              <label className="mb-1 block text-[11px] font-semibold text-slate-500">Delito dentro de esta zona</label>
              <select
                value={delitoZonaSeleccionada ?? ''}
                onChange={(e) => setDelitoZonaSeleccionada(e.target.value || null)}
                className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              >
                <option value="">Todos los delitos</option>
                {delitosDisponiblesEnZona.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>

              <p className="mb-2 text-xs text-slate-500">{formatNumero(puntosEnZonaParaCalor.length)} punto(s) dentro del polígono</p>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={ajustarVistaAZonaActiva}
                  className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-navy hover:text-brand-navy"
                >
                  🎯 Ajustar a polígono
                </button>
                <button
                  onClick={descargarZonaSeleccionada}
                  disabled={descargandoZona || puntosEnZonaParaCalor.length === 0}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:bg-brand-green/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={13} />
                  {descargandoZona ? '...' : 'Descargar'}
                </button>
                <button
                  onClick={copiarZonaAlPortapapeles}
                  disabled={descargandoZona || puntosEnZonaParaCalor.length === 0}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-brand-navy hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-50"
                >
                  📋 Copiar
                </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {caiDeEstacionActiva.length > 0 && (
        <Card>
          <p className="mb-3 text-sm font-bold text-slate-700">CAI de {filtrosMapa.estacion[0]} — mapa de calor por CAI</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {caiDeEstacionActiva.map((cai) => {
              const seleccionado = filtrosMapa.cai.includes(cai);
              const previa = previsualizacionesCai[cai];
              return (
                <div key={cai} className={`overflow-hidden rounded-lg border ${seleccionado ? 'border-slate-800 ring-1 ring-slate-800' : 'border-slate-200'}`}>
                  <button
                    type="button"
                    onClick={() => setFiltrosMapa((prev) => ({ ...prev, cai: seleccionado ? [] : [cai] }))}
                    className="flex aspect-square w-full items-center justify-center bg-slate-50"
                    title="Clic para resaltar este CAI en el mapa de arriba"
                  >
                    {previa === 'cargando' || !previa ? (
                      <span className="text-xs text-slate-400">Generando…</span>
                    ) : previa === 'error' ? (
                      <span className="px-2 text-center text-xs text-slate-400">Sin geometría propia para este CAI</span>
                    ) : (
                      <img src={previa} alt={`Mapa de calor de ${cai}`} className="h-full w-full object-contain" />
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 py-1.5">
                    <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-600">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorDeCai(cai) }} />
                      {cai}
                    </span>
                    <button
                      type="button"
                      onClick={() => descargarPrevisualizacionCai(cai)}
                      disabled={typeof previa !== 'string' || previa === 'error'}
                      className="shrink-0 text-slate-400 hover:text-brand-navy disabled:cursor-not-allowed disabled:opacity-40"
                      title={`Descargar mapa de ${cai}`}
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Haz clic en una miniatura para resaltar ese CAI en el mapa de arriba — un segundo clic lo quita. El ícono de descarga baja esa imagen individual.</p>
        </Card>
      )}

      {capas.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin size={13} /> El mapa se centra en Popayán por defecto. Al cargar una capa, ajusta el zoom manualmente para ubicarla.
        </div>
      )}
        </div>
        {/* fin columna central */}

        {/* ── COLUMNA DERECHA: Configuración visual ── */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4 lg:self-start">
          <p className="mb-3 text-sm font-bold text-slate-700">🎨 Configuración visual</p>

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Colores de CAI</p>
          {opcionesFiltroMapa.cai.length === 0 ? (
            <p className="mb-4 text-xs text-slate-400">Todavía no hay CAI en los datos cargados.</p>
          ) : (
            <div className="mb-4 space-y-1.5">
              {opcionesFiltroMapa.cai.map((nombreCai) => (
                <div key={nombreCai} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600" title={nombreCai}>{nombreCai}</span>
                  <input
                    type="color"
                    value={colorDeCai(nombreCai)}
                    onChange={(e) => setColoresCai((prev) => ({ ...prev, [nombreCai]: e.target.value }))}
                    className="h-6 w-9 shrink-0 cursor-pointer rounded border border-slate-200"
                    title={`Color de ${nombreCai}`}
                  />
                </div>
              ))}
            </div>
          )}

          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Transparencia</p>
          <div className="space-y-3">
            {([
              ['calor', 'Mapa de calor'], ['poligono', 'Polígono'], ['etiquetas', 'Etiquetas'],
            ] as const).map(([clave, etiqueta]) => (
              <div key={clave}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{etiqueta}</span>
                  <span className="font-semibold text-slate-700">{opacidades[clave]}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={opacidades[clave]}
                  onChange={(e) => setOpacidades((prev) => ({ ...prev, [clave]: Number(e.target.value) }))}
                  className="w-full accent-brand-green"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-400">Los colores de CAI y la transparencia se guardan mientras uses el dashboard.</p>
        </div>
      </div>
    </div>
  );
}
