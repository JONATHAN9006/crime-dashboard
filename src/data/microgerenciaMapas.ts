// Puente entre Microgerencia y el sistema de mapas — genera una imagen
// real (calles + mapa de calor) para incrustar en el PDF, reutilizando las
// MISMAS capas y puntos que ya se cargaron en "Mapa / Georreferenciación"
// (se leen directo de su almacenamiento local, sin que el usuario tenga
// que tener esa página abierta). Si no hay capas o puntos cargados
// todavía, devuelve undefined — el PDF ya sabe mostrar la lista de
// delitos como respaldo cuando no hay imagen disponible.
import { cargarCapas } from './geoStorage';
import { cargarCapasPuntos } from './puntosStorage';
import { generarDataUrlPoligonoAislado } from '../utils/exportarPoligonoMapa';
import { MAPA_ESTACION } from './db2Mapeos';

function normalizar(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extraerFeatures(geojson: any): any[] {
  return Array.isArray(geojson) ? geojson.flatMap((g) => g.features || []) : geojson?.features || [];
}

// Nombres cortos de estación (los que ya usa el resto del dashboard, ej.
// "E-Norte") — se arma a partir de los VALORES de la misma tabla que
// traduce el dataset principal, para no duplicar la lista a mano.
export const NOMBRES_ESTACION_CORTOS = new Set(Object.values(MAPA_ESTACION));

// Busca, entre todas las capas cargadas, la que trae los polígonos de
// Estación — probando cada columna de una muestra de features hasta
// encontrar una cuyos valores (crudos o ya traducidos) coincidan con
// nombres de estación conocidos.
async function localizarCapaDeEstaciones() {
  const capas = await cargarCapas();
  if (capas.length === 0) {
    console.warn('[Microgerencia→Mapa] cargarCapas() no devolvió ninguna capa — no hay shapefiles guardados en este navegador.');
    return null;
  }
  for (const capa of capas) {
    const feats = extraerFeatures(capa.geojson).slice(0, 200);
    if (feats.length === 0) continue;

    // Si esta capa ya tiene un campo elegido a mano (el mismo selector de
    // respaldo del Mapa, para cuando la detección automática no basta),
    // se usa ESE directamente — sin necesidad de que vuelva a adivinar.
    if ((capa as any).campoUnion) {
      const columna = (capa as any).campoUnion as string;
      const valores = feats.map((f) => normalizar(f?.properties?.[columna]));
      const pareceEstacion = valores.some((v) => Object.keys(MAPA_ESTACION).some((k) => normalizar(k) === v)) || feats.some((f) => NOMBRES_ESTACION_CORTOS.has(f?.properties?.[columna]));
      if (pareceEstacion) return { capa, columna, features: extraerFeatures(capa.geojson) };
    }

    const columnas = Object.keys(feats[0]?.properties ?? {});
    for (const columna of columnas) {
      const coincidencias = feats.filter((f) => {
        const valor = normalizar(f?.properties?.[columna]);
        return NOMBRES_ESTACION_CORTOS.has(f?.properties?.[columna]) || Object.keys(MAPA_ESTACION).some((k) => normalizar(k) === valor);
      });
      if (coincidencias.length >= Math.min(2, feats.length)) return { capa, columna, features: extraerFeatures(capa.geojson) };
    }

    // Respaldo: si el NOMBRE de la capa ya sugiere que es de estaciones
    // (ej. "JURIS_ESTACIONES_2026") pero ninguna columna coincidió por
    // valor, se elige la columna con MENOS valores distintos entre las que
    // no sean puramente numéricas — una Estación real tiene pocos valores
    // únicos (2 a 6), muy distinto de un ID (uno por cada elemento).
    if (/ESTAC/i.test(capa.nombre)) {
      const todosLosFeatures = extraerFeatures(capa.geojson);
      let mejorColumna: string | null = null;
      let menosValores = Infinity;
      for (const columna of columnas) {
        const valores = todosLosFeatures.map((f) => String(f?.properties?.[columna] ?? '').trim());
        if (valores.some((v) => /^\d+$/.test(v))) continue; // descarta columnas puramente numéricas (IDs)
        const unicos = new Set(valores.filter(Boolean));
        if (unicos.size >= 2 && unicos.size < menosValores) {
          menosValores = unicos.size;
          mejorColumna = columna;
        }
      }
      if (mejorColumna) {
        console.warn(`[Microgerencia→Mapa] "${capa.nombre}" — se detectó por nombre de capa (no por valor); columna elegida por respaldo: "${mejorColumna}" (${menosValores} valores distintos).`);
        return { capa, columna: mejorColumna, features: todosLosFeatures };
      }
    }
  }

  // Diagnóstico: si no se encontró nada, se muestra QUÉ había disponible
  // (capas, columnas y un par de valores de ejemplo de cada una) para
  // poder identificar la causa real en vez de seguir adivinando a ciegas.
  // Se imprime como TEXTO PLANO (no un objeto colapsado) para poder
  // copiarlo directo desde la consola sin tener que expandir nada.
  const detalle = capas.map((capa) => {
    const feats = extraerFeatures(capa.geojson).slice(0, 3);
    const columnas = Object.keys(feats[0]?.properties ?? {});
    const lineas = columnas.map((col) => `      ${col}: ${JSON.stringify(feats.map((f) => f?.properties?.[col]))}`);
    return `  Capa "${capa.nombre}" (campoUnionManual: ${(capa as any).campoUnion ?? 'ninguno'}):\n${lineas.join('\n')}`;
  }).join('\n');
  console.warn(`[Microgerencia→Mapa] Ninguna columna coincidió con nombres de estación. Columnas y valores de ejemplo de cada capa:\n${detalle}`);
  return null;
}

function nombreEstacionDeFeature(feature: any, columna: string): string {
  const crudo = String(feature?.properties?.[columna] ?? '');
  return MAPA_ESTACION[crudo.toUpperCase()] ?? crudo;
}

async function obtenerPuntosFiltrados(delitoFiltrado: string | null, estacionCorta?: string) {
  const capasPuntos = await cargarCapasPuntos();
  return capasPuntos
    .filter((c) => c.visible)
    .flatMap((c) => c.puntos)
    .filter((p) => !delitoFiltrado || p.delitoCorto === delitoFiltrado)
    .filter((p) => !estacionCorta || p.estacionCorta === estacionCorta);
}

function extraerAnillosDeFeature(feature: any): [number, number][][] {
  const anillos: [number, number][][] = [];
  const geom = feature?.geometry;
  if (!geom) return anillos;
  if (geom.type === 'Polygon') for (const anillo of geom.coordinates) anillos.push(anillo);
  else if (geom.type === 'MultiPolygon') for (const poligono of geom.coordinates) for (const anillo of poligono) anillos.push(anillo);
  return anillos;
}

// Punto-en-polígono simple (ray casting) — para ubicar un punto
// representativo de cada CAI dentro (o no) del área que se está
// exportando, y así saber si dibujar su línea interna.
function puntoEnAnillo(x: number, y: number, anillo: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}
function puntoEnFeature(x: number, y: number, feature: any): boolean {
  return extraerAnillosDeFeature(feature).some((anillo) => puntoEnAnillo(x, y, anillo));
}

// Límites internos (ej. CAI dentro de una Estación) que caen dentro del
// área que se está exportando — misma idea que ya usa la descarga del
// mapa principal: se identifica la capa más granular DISTINTA de la que
// ya se está usando como contorno principal, y se dibujan sus features
// cuyo punto representativo caiga dentro.
async function obtenerAnillosInternos(featureOColeccion: any, capaContornoId: string): Promise<[number, number][][]> {
  const capas = await cargarCapas();
  let mejorCapa: any = null;
  let maxElementos = 0;
  for (const capa of capas) {
    if (capa.id === capaContornoId) continue;
    const cantidad = extraerFeatures(capa.geojson).length;
    if (cantidad > maxElementos) {
      maxElementos = cantidad;
      mejorCapa = capa;
    }
  }
  if (!mejorCapa) return [];
  const anillos: [number, number][][] = [];
  for (const f of extraerFeatures(mejorCapa.geojson)) {
    const anillosF = extraerAnillosDeFeature(f);
    const punto = anillosF[0]?.[0];
    if (!punto) continue;
    if (puntoEnFeature(punto[0], punto[1], featureOColeccion)) anillos.push(...anillosF);
  }
  return anillos;
}

/** Imagen de Popayán (Estación Norte + Sur) — para "MEPOY General". */
export async function generarImagenMapaGeneral(delitoFiltrado: string | null): Promise<string | undefined> {
  try {
    const localizada = await localizarCapaDeEstaciones();
    if (!localizada || localizada.features.length === 0) {
      console.warn('[Microgerencia→Mapa] No se encontró ninguna capa de Estación cargada en "Mapa/Georreferenciación" (o ninguna columna suya coincide con nombres de estación conocidos).');
      return undefined;
    }
    // "General" = Norte + Sur (el área urbana) — no las estaciones rurales.
    const featuresNorteSur = localizada.features.filter((f) => {
      const nombre = normalizar(nombreEstacionDeFeature(f, localizada.columna));
      return nombre === normalizar('E-Norte') || nombre === normalizar('E-Sur');
    });
    const featuresParaMapa = featuresNorteSur.length > 0 ? featuresNorteSur : localizada.features;
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado);
    if (puntos.length === 0) {
      console.warn('[Microgerencia→Mapa] No hay puntos disponibles: revisa que exista una capa de PUNTOS visible (ej. "Delitos") cargada en "Mapa/Georreferenciación".', { delitoFiltrado });
      return undefined;
    }
    const featureCollection = { type: 'FeatureCollection', features: featuresParaMapa };
    const anillosInternos = await obtenerAnillosInternos(featureCollection, localizada.capa.id);
    return await generarDataUrlPoligonoAislado({
      feature: featureCollection,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      anchoLienzo: 700,
      anillosInternos,
    });
  } catch (err) {
    console.error('[Microgerencia→Mapa] Falló generando el mapa general:', err);
    return undefined;
  }
}

/** Imagen de UNA estación específica (ej. "E-Norte") — para los nodos de Distrito/Estación. Incluye las líneas internas de CAI. */
export async function generarImagenMapaEstacion(nombreEstacionCorta: string, delitoFiltrado: string | null): Promise<string | undefined> {
  try {
    const localizada = await localizarCapaDeEstaciones();
    if (!localizada) {
      console.warn(`[Microgerencia→Mapa] No se encontró la capa de Estación (para "${nombreEstacionCorta}").`);
      return undefined;
    }
    const feature = localizada.features.find((f) => normalizar(nombreEstacionDeFeature(f, localizada.columna)) === normalizar(nombreEstacionCorta));
    if (!feature) {
      console.warn(`[Microgerencia→Mapa] La capa de Estación no tiene ningún polígono que coincida con "${nombreEstacionCorta}" en la columna "${localizada.columna}".`);
      return undefined;
    }
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, nombreEstacionCorta);
    if (puntos.length === 0) {
      console.warn(`[Microgerencia→Mapa] No hay puntos disponibles para "${nombreEstacionCorta}" — revisa la capa de PUNTOS (ej. "Delitos") en "Mapa/Georreferenciación".`, { delitoFiltrado });
      return undefined;
    }
    const anillosInternos = await obtenerAnillosInternos(feature, localizada.capa.id);
    return await generarDataUrlPoligonoAislado({
      feature,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      anchoLienzo: 700,
      anillosInternos,
    });
  } catch (err) {
    console.error(`[Microgerencia→Mapa] Falló generando el mapa de "${nombreEstacionCorta}":`, err);
    return undefined;
  }
}
