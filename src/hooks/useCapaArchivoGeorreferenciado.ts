import { useEffect, useMemo, useState } from 'react';
import { leerArchivoGenerico, descargarRegistrosCorregidos } from '../utils/archivoGenericoParser';
import { detectarColumnasCandidatas, parsearCoordenada, coordenadaEnRangoValido, detectarColumnasInvertidas, inferirSignoParaCauca } from '../utils/coordenadasParser';
import { puntoEnFeatureGeoJSON } from '../utils/puntoEnPoligono';
import type { CapaGeografica } from '../data/geoStorage';

// Misma escala que usa Delitos (verde oscuro → verde → amarillo → naranja →
// rojo), a pedido explícito — reemplaza la escala azul independiente que
// tenía antes.
export const PALETA_ARCHIVO_CARGADO = ['#166534', '#84cc16', '#facc15', '#f97316', '#dc2626'];
export const ETIQUETAS_BANDA_ARCHIVO = ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'];

export interface RegistroArchivoGeo {
  lat: number;
  lon: number;
  valido: boolean;
  motivoInvalido?: string;
  fila: Record<string, unknown>;
  caiAsignado: string | null;
  estacionAsignada: string | null;
  zonaAsignada: string | null;
}

// Réplica MÍNIMA de extraerFeatures (ver MapaGeorreferenciacion.tsx) — a
// propósito duplicada aquí, en unas pocas líneas, para que esta capa de
// análisis no dependa de los interiores de la página del mapa y quede de
// verdad aislada ("capa de análisis independiente", como se pidió).
function extraerFeaturesLocal(geojson: any): any[] {
  if (!geojson) return [];
  if (Array.isArray(geojson)) return geojson.flatMap((g) => extraerFeaturesLocal(g));
  if (geojson.type === 'FeatureCollection') return geojson.features || [];
  if (geojson.type === 'Feature') return [geojson];
  return [];
}

/**
 * Todo el estado y la lógica de la capa temporal de "archivo
 * georreferenciado" — se llama UNA SOLA VEZ en el componente de la página
 * del mapa, y su resultado se reparte entre el panel de controles (fuera
 * del MapContainer) y la capa que se dibuja en Leaflet (adentro del
 * MapContainer, porque necesita useMap()) — de ahí que viva en un hook
 * propio en vez de en un solo componente.
 */
export function useCapaArchivoGeorreferenciado(capas: CapaGeografica[], camposUnionAutoDetectados: Map<string, string | null>) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filasCrudas, setFilasCrudas] = useState<Record<string, unknown>[]>([]);
  const [colLat, setColLat] = useState('');
  const [colLon, setColLon] = useState('');
  const [pidiendoColumnas, setPidiendoColumnas] = useState(false);
  const [invertidasConfirmadas, setInvertidasConfirmadas] = useState(false);
  const [avisoInvertidas, setAvisoInvertidas] = useState<string | null>(null);

  const [modoVisualizacion, setModoVisualizacion] = useState<'puntos' | 'calor'>('calor');
  const [coloresActivos, setColoresActivos] = useState<(string | null)[]>(PALETA_ARCHIVO_CARGADO);
  const [opacidad, setOpacidad] = useState(70);

  const [filtroDelito, setFiltroDelito] = useState('Todos');
  const [filtroCai, setFiltroCai] = useState('Todos');

  // Descarga del archivo corregido (punto "nivel dios" del pedido) — dos
  // elecciones independientes: formato de archivo y separador decimal.
  const [formatoDescarga, setFormatoDescarga] = useState<'excel' | 'csv'>('excel');
  const [formatoDecimal, setFormatoDecimal] = useState<'punto' | 'coma'>('punto');

  async function manejarArchivo(file: File) {
    setError(null);
    setCargando(true);
    try {
      const { encabezados: enc, filas } = await leerArchivoGenerico(file);
      if (filas.length === 0) throw new Error('El archivo no tiene filas de datos.');
      setArchivo(file);
      setEncabezados(enc);
      setFilasCrudas(filas);
      const candLat = detectarColumnasCandidatas(enc, 'lat');
      const candLon = detectarColumnasCandidatas(enc, 'lon');
      if (candLat.length === 1 && candLon.length === 1) {
        setColLat(candLat[0]);
        setColLon(candLon[0]);
        setPidiendoColumnas(false);
      } else {
        setColLat(candLat[0] || '');
        setColLon(candLon[0] || '');
        setPidiendoColumnas(true);
      }
      setInvertidasConfirmadas(false);
      setAvisoInvertidas(null);
      setFiltroDelito('Todos');
      setFiltroCai('Todos');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No fue posible leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  function limpiarTodo() {
    setArchivo(null);
    setEncabezados([]);
    setFilasCrudas([]);
    setColLat('');
    setColLon('');
    setPidiendoColumnas(false);
    setError(null);
    setAvisoInvertidas(null);
  }

  const registros: RegistroArchivoGeo[] = useMemo(() => {
    if (!colLat || !colLon || filasCrudas.length === 0) return [];
    const muestra: [number | null, number | null][] = filasCrudas.slice(0, 200).map((f) => [parsearCoordenada(f[colLat]), parsearCoordenada(f[colLon])]);
    const deteccion = detectarColumnasInvertidas(muestra);
    const usarInvertido = invertidasConfirmadas && deteccion.invertidas;

    return filasCrudas.map((fila) => {
      let lat = parsearCoordenada(fila[colLat]);
      let lon = parsearCoordenada(fila[colLon]);
      if (usarInvertido && lat != null && lon != null) [lat, lon] = [lon, lat];
      if (lat != null && lon != null) {
        // Muchos archivos de campo (típicamente convertidos a mano desde
        // grados/minutos/segundos) omiten el signo negativo o la letra
        // cardinal en la longitud — se sobreentiende porque "obviamente
        // estamos en Colombia". Confirmado en producción: un archivo real
        // traía "76°35'54.98"" (sin signo ni W) para una longitud que debía
        // ser -76.599 — sin este ajuste, quedaba fuera de rango y se
        // descartaba un archivo completo que en realidad estaba bien.
        // Ver inferirSignoParaCauca: SOLO actúa cuando el valor, en su
        // signo opuesto, cae en el rango típico de Popayán/Cauca — nunca
        // adivina si ya viene con signo correcto o fuera de ese rango.
        lat = inferirSignoParaCauca(lat, 'lat');
        lon = inferirSignoParaCauca(lon, 'lon');
      }
      if (lat == null || lon == null) {
        return { lat: 0, lon: 0, valido: false, motivoInvalido: 'No se pudo interpretar la coordenada', fila, caiAsignado: null, estacionAsignada: null, zonaAsignada: null };
      }
      if (!coordenadaEnRangoValido(lat, lon)) {
        return { lat, lon, valido: false, motivoInvalido: 'Fuera del rango geográfico esperado', fila, caiAsignado: null, estacionAsignada: null, zonaAsignada: null };
      }
      let caiAsignado: string | null = null;
      let estacionAsignada: string | null = null;
      let zonaAsignada: string | null = null;
      for (const capa of capas) {
        const campo = camposUnionAutoDetectados.get(capa.id);
        if (!campo) continue;
        for (const feature of extraerFeaturesLocal(capa.geojson)) {
          if (!puntoEnFeatureGeoJSON(lon, lat, feature)) continue;
          const valor = String((feature?.properties as any)?.[campo] ?? '').trim();
          if (!valor) continue;
          const valorNorm = valor.toUpperCase();
          if (/^CAI[\s-]?\d+/.test(valorNorm) || /^CAI\s+\S/.test(valor)) caiAsignado = caiAsignado ?? valor;
          else if (/^E[-\s]|ESTAC/.test(valorNorm)) estacionAsignada = estacionAsignada ?? valor;
          else zonaAsignada = zonaAsignada ?? valor;
        }
      }
      return { lat, lon, valido: true, fila, caiAsignado, estacionAsignada, zonaAsignada };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasCrudas, colLat, colLon, invertidasConfirmadas, capas, camposUnionAutoDetectados]);

  useEffect(() => {
    if (!colLat || !colLon || filasCrudas.length === 0 || invertidasConfirmadas) return;
    const muestra: [number | null, number | null][] = filasCrudas.slice(0, 200).map((f) => [parsearCoordenada(f[colLat]), parsearCoordenada(f[colLon])]);
    const deteccion = detectarColumnasInvertidas(muestra);
    setAvisoInvertidas(deteccion.invertidas ? deteccion.motivo : null);
  }, [colLat, colLon, filasCrudas, invertidasConfirmadas]);

  const registrosValidos = useMemo(() => registros.filter((r) => r.valido), [registros]);
  const registrosInvalidos = useMemo(() => registros.filter((r) => !r.valido), [registros]);

  const colDelitoDetectada = useMemo(() => encabezados.find((h) => /delito/i.test(h)), [encabezados]);
  const opcionesDelito = useMemo(() => {
    if (!colDelitoDetectada) return [];
    return Array.from(new Set(registrosValidos.map((r) => String(r.fila[colDelitoDetectada] ?? '').trim()).filter(Boolean))).sort();
  }, [registrosValidos, colDelitoDetectada]);
  const opcionesCai = useMemo(() => Array.from(new Set(registrosValidos.map((r) => r.caiAsignado).filter((v): v is string => !!v))).sort(), [registrosValidos]);

  const registrosFiltrados = useMemo(() => registrosValidos.filter((r) => {
    if (filtroDelito !== 'Todos' && colDelitoDetectada && String(r.fila[colDelitoDetectada] ?? '').trim() !== filtroDelito) return false;
    if (filtroCai !== 'Todos' && r.caiAsignado !== filtroCai) return false;
    return true;
  }), [registrosValidos, filtroDelito, filtroCai, colDelitoDetectada]);

  const concentracionPorCai = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const r of registrosFiltrados) conteo.set(r.caiAsignado ?? 'Sin CAI asignado', (conteo.get(r.caiAsignado ?? 'Sin CAI asignado') || 0) + 1);
    const total = registrosFiltrados.length || 1;
    return Array.from(conteo.entries()).map(([cai, casos]) => ({ cai, casos, aportePct: (casos / total) * 100 })).sort((a, b) => b.casos - a.casos);
  }, [registrosFiltrados]);

  function descargarCorregido() {
    // Se descargan TODOS los registros (válidos e inválidos) — los
    // inválidos quedan marcados como tales en la columna "Estado" en vez
    // de excluirse, para que quede claro cuáles hay que revisar a mano.
    descargarRegistrosCorregidos(registros, formatoDescarga, formatoDecimal);
  }

  return {
    archivo, cargando, error, manejarArchivo, limpiarTodo,
    encabezados, colLat, setColLat, colLon, setColLon, pidiendoColumnas, setPidiendoColumnas,
    invertidasConfirmadas, setInvertidasConfirmadas, avisoInvertidas, setAvisoInvertidas,
    modoVisualizacion, setModoVisualizacion, coloresActivos, setColoresActivos, opacidad, setOpacidad,
    filtroDelito, setFiltroDelito, filtroCai, setFiltroCai,
    formatoDescarga, setFormatoDescarga, formatoDecimal, setFormatoDecimal, descargarCorregido,
    registros, registrosValidos, registrosInvalidos, registrosFiltrados,
    opcionesDelito, opcionesCai, concentracionPorCai, colDelitoDetectada,
  };
}

export type CapaArchivoGeorreferenciadoState = ReturnType<typeof useCapaArchivoGeorreferenciado>;
