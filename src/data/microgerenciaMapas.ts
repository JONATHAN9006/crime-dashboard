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
import { MAPA_ESTACION, MAPA_CAI } from './db2Mapeos';
import { elegirColumnaFechaConfiable, extraerFechaDePunto } from '../utils/fechaPunto';

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

// Los nombres de CAI varían más que los de Estación (numerados "CAI 4" en
// los datos nuevos, o "CAI Comuna Cuatro" en el histórico) — en vez de una
// lista cerrada, se reconoce cualquier nodo que EMPIECE con "CAI", que es
// el patrón real de todos los nombres de CAI que usa el dashboard.
export const NOMBRES_CAI_CORTOS = new Set(Object.values(MAPA_CAI));
export function esNombreDeCai(nombre: string): boolean {
  return /^CAI\b/i.test(nombre.trim());
}

// Busca, entre todas las capas cargadas, la que trae los polígonos de
// Estación — probando cada columna de una muestra de features hasta
// encontrar una cuyos valores (crudos o ya traducidos) coincidan con
// nombres de estación conocidos.
async function localizarCapaDeEstaciones() {
  let capas = await cargarCapas();
  if (capas.length === 0) {
    // Justo después de un refresco de página, la base de datos local
    // puede tardar un instante en quedar lista — se reintenta una vez
    // después de una pequeña espera antes de darlo por vacío de verdad.
    await new Promise((r) => setTimeout(r, 400));
    capas = await cargarCapas();
  }
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
        // Se listan TODAS las columnas disponibles (no solo la elegida) —
        // el heurístico de respaldo pudo haber escogido una columna que
        // por casualidad tiene pocos valores únicos (ej. el municipio)
        // sin que esa sea en realidad la columna correcta de Estación; con
        // el listado completo se puede confirmar si existe otra columna
        // más apropiada que el heurístico pasó por alto.
        const resumenColumnas = columnas.map((c) => {
          const valores = todosLosFeatures.map((f) => String(f?.properties?.[c] ?? '').trim()).filter(Boolean);
          const unicos = [...new Set(valores)];
          return `  · "${c}": ${unicos.length} valor(es) distinto(s) — ejemplo(s): ${JSON.stringify(unicos.slice(0, 6))}`;
        }).join('\n');
        console.warn(
          `[Microgerencia→Mapa] "${capa.nombre}" — se detectó por nombre de capa (no por valor); columna elegida por respaldo: "${mejorColumna}" (${menosValores} valores distintos).\n` +
          `Todas las columnas disponibles en esta capa, por si alguna otra es la correcta:\n${resumenColumnas}`,
        );
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

// Igual que localizarCapaDeEstaciones, pero para la capa de CAI. Es una
// capa DISTINTA (más granular) — se reconoce por nombres que EMPIECEN con
// "CAI" en vez de comparar contra una lista cerrada, ya que el nombre
// exacto varía entre el histórico ("CAI Comuna Cuatro") y los datos nuevos
// ("CAI 4").
async function localizarCapaDeCai() {
  let capas = await cargarCapas();
  if (capas.length === 0) {
    await new Promise((r) => setTimeout(r, 400));
    capas = await cargarCapas();
  }
  if (capas.length === 0) return null;
  for (const capa of capas) {
    const feats = extraerFeatures(capa.geojson).slice(0, 200);
    if (feats.length === 0) continue;

    if ((capa as any).campoUnion) {
      const columna = (capa as any).campoUnion as string;
      if (feats.some((f) => esNombreDeCai(String(f?.properties?.[columna] ?? '')))) {
        return { capa, columna, features: extraerFeatures(capa.geojson) };
      }
    }

    const columnas = Object.keys(feats[0]?.properties ?? {});
    for (const columna of columnas) {
      const coincidencias = feats.filter((f) => esNombreDeCai(String(f?.properties?.[columna] ?? '')));
      if (coincidencias.length >= Math.min(2, feats.length)) return { capa, columna, features: extraerFeatures(capa.geojson) };
    }

    if (/CAI/i.test(capa.nombre)) {
      const todosLosFeatures = extraerFeatures(capa.geojson);
      let mejorColumna: string | null = null;
      let menosValores = Infinity;
      for (const columna of columnas) {
        const valores = todosLosFeatures.map((f) => String(f?.properties?.[columna] ?? '').trim());
        if (valores.some((v) => /^\d+$/.test(v))) continue;
        const unicos = new Set(valores.filter(Boolean));
        if (unicos.size >= 2 && unicos.size < menosValores) {
          menosValores = unicos.size;
          mejorColumna = columna;
        }
      }
      if (mejorColumna) return { capa, columna: mejorColumna, features: todosLosFeatures };
    }
  }
  console.warn('[Microgerencia→Mapa] Ninguna capa cargada parece tener polígonos de CAI (ningún valor de columna empieza con "CAI").');
  return null;
}

function nombreCaiDeFeature(feature: any, columna: string): string {
  const crudo = String(feature?.properties?.[columna] ?? '');
  return MAPA_CAI[crudo.toUpperCase()] ?? crudo;
}

async function obtenerPuntosFiltrados(delitoFiltrado: string | null, estacionCorta?: string, caiCorto?: string, fechaInicial?: string | null, fechaFinal?: string | null) {
  let capasPuntos = await cargarCapasPuntos();
  if (capasPuntos.length === 0) {
    await new Promise((r) => setTimeout(r, 400));
    capasPuntos = await cargarCapasPuntos();
  }
  let resultado = capasPuntos
    .filter((c) => c.visible)
    .flatMap((c) => c.puntos)
    .filter((p) => !delitoFiltrado || p.delitoCorto === delitoFiltrado)
    .filter((p) => !estacionCorta || p.estacionCorta === estacionCorta)
    .filter((p) => !caiCorto || p.caiCorto === caiCorto);

  // Filtro de Fecha inicial/final — antes NO EXISTÍA en absoluto en este
  // archivo (confirmado: el mapa de calor de Microgerencia siempre usaba
  // TODO el histórico sin importar qué rango de fechas estuviera
  // seleccionado en el dashboard). Usa la misma detección "por
  // comportamiento de los datos" que ya corrige esto en el Mapa
  // interactivo (ver utils/fechaPunto.ts) — así las dos partes del
  // dashboard filtran exactamente igual.
  if (fechaInicial || fechaFinal) {
    const columnaFecha = elegirColumnaFechaConfiable(resultado);
    const desde = fechaInicial ? new Date(fechaInicial) : null;
    const hasta = fechaFinal ? new Date(`${fechaFinal}T23:59:59`) : null;
    resultado = resultado.filter((p) => {
      const f = extraerFechaDePunto(p, columnaFecha);
      if (!f) return false;
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
      return true;
    });
  }

  if (resultado.length === 0) {
    console.warn('[Microgerencia→Mapa] Detalle de capas de puntos:', capasPuntos.map((c) => ({
      nombre: c.nombre,
      visible: c.visible,
      totalPuntos: c.puntos.length,
      ejemploPunto: c.puntos[0] ?? null,
    })));
  }
  return resultado;
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
export async function generarImagenMapaGeneral(delitoFiltrado: string | null, fechaInicial?: string | null, fechaFinal?: string | null): Promise<string | undefined> {
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
    if (featuresNorteSur.length === 0) {
      // Diagnóstico para cuando SÍ se encontró una capa/columna de
      // Estación, pero ninguno de sus valores coincidió con Norte/Sur —
      // se listan los valores CRUDOS reales (antes y después de pasar por
      // MAPA_ESTACION) para saber exactamente qué está trayendo la capa,
      // sin necesidad de compartir el shapefile completo: basta con abrir
      // la consola del navegador (F12 → pestaña "Console"), generar el
      // PDF de nuevo, y copiar este mensaje.
      const valoresCrudos = [...new Set(localizada.features.map((f) => String(f?.properties?.[localizada.columna] ?? '')))];
      const todasLasCapas = await cargarCapas();
      const resumenTodasLasCapas = todasLasCapas.map((capa) => {
        const feats = extraerFeatures(capa.geojson);
        if (feats.length === 0) return `  Capa "${capa.nombre}": (sin features)`;
        const columnas = Object.keys(feats[0]?.properties ?? {});
        const lineas = columnas.map((c) => {
          const valores = feats.map((f) => String(f?.properties?.[c] ?? '').trim()).filter(Boolean);
          const unicos = [...new Set(valores)];
          return `      · "${c}": ${unicos.length} valor(es) distinto(s) — ejemplo(s): ${JSON.stringify(unicos.slice(0, 6))}`;
        }).join('\n');
        return `  Capa "${capa.nombre}" (${feats.length} elementos):\n${lineas}`;
      }).join('\n');
      console.warn(
        `[Microgerencia→Mapa] Se detectó la capa "${localizada.capa.nombre}" (columna "${localizada.columna}") como la de Estación, pero NINGÚN valor coincidió con Norte/Sur — se está usando TODA la capa como respaldo.\n` +
        `Valores encontrados en esa columna: ${JSON.stringify(valoresCrudos)}\n` +
        `Traducidos por MAPA_ESTACION: ${JSON.stringify(valoresCrudos.map((v) => MAPA_ESTACION[v.toUpperCase()] ?? `(sin traducción: "${v}")`))}\n\n` +
        `Por si la división Norte/Sur está en OTRA capa cargada (ej. por cuadrante), aquí están TODAS las capas con sus columnas:\n${resumenTodasLasCapas}`,
      );
    }
    const featuresParaMapa = featuresNorteSur.length > 0 ? featuresNorteSur : localizada.features;
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, undefined, undefined, fechaInicial, fechaFinal);
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
      // Solo el contorno de Estación Norte+Sur + el mapa de calor — sin
      // calles ni terreno de fondo (a pedido explícito: a la escala de
      // toda la jurisdicción, las calles reales solo metían ruido visual
      // — nombres de veredas, ríos, vías — sin aportar nada al indicador).
      mostrarCalles: false,
    });
  } catch (err) {
    console.error('[Microgerencia→Mapa] Falló generando el mapa general:', err);
    return undefined;
  }
}

/** Imagen de UNA estación específica (ej. "E-Norte") — para los nodos de Distrito/Estación. Incluye las líneas internas de CAI. */
export async function generarImagenMapaEstacion(nombreEstacionCorta: string, delitoFiltrado: string | null, fechaInicial?: string | null, fechaFinal?: string | null): Promise<string | undefined> {
  try {
    const localizada = await localizarCapaDeEstaciones();
    if (!localizada) {
      console.warn(`[Microgerencia→Mapa] No se encontró la capa de Estación (para "${nombreEstacionCorta}").`);
      return undefined;
    }
    const feature = localizada.features.find((f) => normalizar(nombreEstacionDeFeature(f, localizada.columna)) === normalizar(nombreEstacionCorta));
    if (!feature) {
      const valoresCrudos = [...new Set(localizada.features.map((f) => String(f?.properties?.[localizada.columna] ?? '')))];
      console.warn(
        `[Microgerencia→Mapa] La capa de Estación no tiene ningún polígono que coincida con "${nombreEstacionCorta}" en la columna "${localizada.columna}".\n` +
        `Valores encontrados en esa columna: ${JSON.stringify(valoresCrudos)}`,
      );
      return undefined;
    }
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, nombreEstacionCorta, undefined, fechaInicial, fechaFinal);
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

/** Imagen de UN CAI específico (ej. "CAI 4") — recortada solo a su propio polígono. */
export async function generarImagenMapaCai(nombreCai: string, delitoFiltrado: string | null, fechaInicial?: string | null, fechaFinal?: string | null): Promise<string | undefined> {
  try {
    const localizada = await localizarCapaDeCai();
    if (!localizada) {
      console.warn(`[Microgerencia→Mapa] No se encontró la capa de CAI (para "${nombreCai}").`);
      return undefined;
    }
    const feature = localizada.features.find((f) => normalizar(nombreCaiDeFeature(f, localizada.columna)) === normalizar(nombreCai));
    if (!feature) {
      console.warn(`[Microgerencia→Mapa] La capa de CAI no tiene ningún polígono que coincida con "${nombreCai}" en la columna "${localizada.columna}".`);
      return undefined;
    }
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, undefined, nombreCai, fechaInicial, fechaFinal);
    if (puntos.length === 0) {
      console.warn(`[Microgerencia→Mapa] No hay puntos disponibles para "${nombreCai}" — revisa la capa de PUNTOS (ej. "Delitos") en "Mapa/Georreferenciación".`, { delitoFiltrado });
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
    console.error(`[Microgerencia→Mapa] Falló generando el mapa de "${nombreCai}":`, err);
    return undefined;
  }
}
