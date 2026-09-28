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
import { MAPA_ESTACION, MAPA_CAI, MAPA_CUADRANTE } from './db2Mapeos';
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

// Microgerencia nombra sus propios nodos con la forma LARGA ("Estación
// Norte", ver NOMBRES_ESTACION en useMicrogerencia.ts) — no con la corta
// ("E-Norte") que usa el resto del dashboard. Confirmado en producción:
// por esta diferencia de nombre, el chequeo "¿esto es un nodo de
// Estación?" en ModalMicrogerencia.tsx nunca coincidía, así que la imagen
// del mapa JAMÁS se generaba para Estación Norte/Sur — no era un límite
// de los datos ni de las capas, era una comparación de texto que nunca
// iba a coincidir. Esta función reconoce CUALQUIERA de las dos formas.
const NOMBRES_ESTACION_LARGOS = new Set(Object.values(MAPA_ESTACION).map((corto) => `ESTACION ${normalizar(corto).replace(/^E-/, '')}`));
export function esNombreDeEstacion(nombre: string): boolean {
  const norm = normalizar(nombre);
  return NOMBRES_ESTACION_CORTOS.has(nombre) || NOMBRES_ESTACION_LARGOS.has(norm);
}

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
export async function localizarCapaDeCai() {
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

export function nombreCaiDeFeature(feature: any, columna: string): string {
  const crudo = String(feature?.properties?.[columna] ?? '');
  return MAPA_CAI[crudo.toUpperCase()] ?? crudo;
}

// División oficial de CAI por Estación (misma que ya se usa para derivar el
// CAI desde la Zona de Atención — ver RANGOS_CAI_POR_ESTACION en
// csvParser.ts — y confirmada explícitamente por el usuario: Norte = CAI
// 1-4, Sur = CAI 5-10). Se usa para CONSTRUIR el contorno de cada Estación
// (y de "MEPOY General" = las dos juntas) UNIENDO los polígonos de sus
// propios CAI — no depende de tener una capa de Estación aparte, que era
// justo el problema (la única disponible, "JURIS_ESTACIONES_2026", trae
// municipios en vez de la división real de Norte/Sur). Como el CAI SÍ está
// bien cargado y confirmado, esto da un contorno confiable sin necesidad
// de conseguir un shapefile adicional.
const CAI_POR_ESTACION: Record<'NORTE' | 'SUR', Set<string>> = {
  NORTE: new Set(['CAI 1', 'CAI 2', 'CAI 3', 'CAI 4']),
  SUR: new Set(['CAI 5', 'CAI 6', 'CAI 7', 'CAI 8', 'CAI 9', 'CAI 10']),
};

async function construirEstacionDesdeCai(estacion: 'NORTE' | 'SUR' | 'AMBAS'): Promise<{ features: any[]; capaId: string } | null> {
  const localizada = await localizarCapaDeCai();
  if (!localizada) return null;
  const conjunto = estacion === 'AMBAS' ? null : CAI_POR_ESTACION[estacion];
  const features = localizada.features.filter((f) => {
    const nombreCai = nombreCaiDeFeature(f, localizada.columna);
    return conjunto === null ? esNombreDeCai(nombreCai) : conjunto.has(nombreCai);
  });
  return features.length > 0 ? { features, capaId: localizada.capa.id } : null;
}

// Las tres estaciones del Distrito Dos (rurales). A diferencia de Norte y
// Sur — que se construyen uniendo sus CAI — estas NO tienen CAI: su
// polígono sale de la capa de jurisdicción ("JURIS_ESTACIONES_2026"), donde
// cada una aparece como un elemento con su nombre (Timbío, Coconuco,
// Sotará). Esa capa NO sirve para Norte/Sur (trae el municipio completo de
// Popayán), pero sí es la fuente correcta para estas tres.
const ESTACIONES_RURALES = ['E-Timbio', 'E-Coconuco', 'E-Sotara'] as const;

// Traduce cualquier forma del nombre ("Estación Sotara" larga, "E-Sotara"
// corta) a la forma corta que usan los puntos guardados.
function aFormaCortaDeEstacion(nombre: string): string | null {
  const norm = normalizar(nombre);
  for (const corto of NOMBRES_ESTACION_CORTOS) {
    const c = normalizar(corto);
    if (norm === c || norm === `ESTACION ${c.replace(/^E-/, '')}`) return corto;
  }
  return null;
}

// Prefijos de código de cuadrante que pertenecen a una estación rural —
// se sacan de la MISMA tabla (MAPA_CUADRANTE) con la que el dashboard ya
// asigna cada registro a su zona de atención, para no duplicar esa
// información a mano. Ej.: "MEPOYMNVCCD02E01000000002" → "Z. Atención 2
// E-Timbio" da el prefijo "MEPOYMNVCCD02E01" (distrito 02, estación 01),
// que cubre TODOS los cuadrantes de Timbío aunque la tabla solo liste
// algunos.
function prefijosDeCuadranteParaEstacion(corta: string): string[] {
  const prefijos = new Set<string>();
  for (const [codigo, valor] of Object.entries(MAPA_CUADRANTE)) {
    const m = codigo.toUpperCase().match(/^(MEPOYMNVCCD\d{2}E\d{2})/);
    if (m && valor.endsWith(corta)) prefijos.add(m[1]);
  }
  return [...prefijos];
}

// Polígonos de los CUADRANTES de una estación rural (Timbío, Coconuco o
// Sotará) — los del shapefile de cuadrantes, identificados por el prefijo
// de su código. Es lo que se dibuja cuando se elige ESA estación (el
// contorno del distrito completo sí usa la capa de jurisdicción).
async function construirEstacionRuralDesdeCuadrantes(corta: string): Promise<{ features: any[]; capaId: string } | null> {
  const prefijos = prefijosDeCuadranteParaEstacion(corta);
  if (prefijos.length === 0) return null;
  let capas = await cargarCapas();
  if (capas.length === 0) {
    await new Promise((r) => setTimeout(r, 400));
    capas = await cargarCapas();
  }
  for (const capa of capas) {
    const feats = extraerFeatures(capa.geojson);
    if (feats.length === 0) continue;
    const encontrados = feats.filter((f) =>
      Object.values(f?.properties ?? {}).some((v) => {
        const s = normalizar(v);
        return prefijos.some((p) => s.startsWith(p));
      }),
    );
    if (encontrados.length > 0) return { features: encontrados, capaId: capa.id };
  }
  console.warn(`[Microgerencia→Mapa] Ninguna capa cargada tiene cuadrantes con código que empiece con ${JSON.stringify(prefijos)} (estación ${corta}) — se usará el polígono de jurisdicción como respaldo.`);
  return null;
}

// Busca, en las capas cargadas, los polígonos cuyo nombre (en cualquier
// columna, sin importar tildes ni mayúsculas) coincide con las estaciones
// pedidas — "Sotará" en la capa encaja con "E-Sotara" del dashboard.
async function construirEstacionesRuralesDesdeJurisdiccion(cortas: readonly string[]): Promise<{ features: any[]; capaId: string } | null> {
  let capas = await cargarCapas();
  if (capas.length === 0) {
    await new Promise((r) => setTimeout(r, 400));
    capas = await cargarCapas();
  }
  const objetivos = new Set(cortas.map((c) => normalizar(c).replace(/^E-/, '')));
  // Primero las capas cuyo nombre sugiere jurisdicción/estaciones.
  const ordenadas = [...capas].sort((a, b) => Number(/ESTAC|JURIS/i.test(b.nombre)) - Number(/ESTAC|JURIS/i.test(a.nombre)));
  for (const capa of ordenadas) {
    const feats = extraerFeatures(capa.geojson);
    if (feats.length === 0) continue;
    const columnas = Object.keys(feats[0]?.properties ?? {});
    for (const columna of columnas) {
      const encontrados = feats.filter((f) => objetivos.has(normalizar(f?.properties?.[columna])));
      if (encontrados.length > 0) return { features: encontrados, capaId: capa.id };
    }
  }
  console.warn(`[Microgerencia→Mapa] Ninguna capa cargada tiene polígonos con los nombres ${JSON.stringify([...objetivos])} (esperados: ${JSON.stringify(cortas)}).`);
  return null;
}

async function obtenerPuntosFiltrados(delitoFiltrado: string | null, estacionCorta?: string | readonly string[], caiCorto?: string, fechaInicial?: string | null, fechaFinal?: string | null) {
  let capasPuntos = await cargarCapasPuntos();
  if (capasPuntos.length === 0) {
    await new Promise((r) => setTimeout(r, 400));
    capasPuntos = await cargarCapasPuntos();
  }
  let resultado = capasPuntos
    .filter((c) => c.visible)
    .flatMap((c) => c.puntos)
    .filter((p) => !delitoFiltrado || p.delitoCorto === delitoFiltrado)
    .filter((p) => !estacionCorta || (typeof estacionCorta === 'string' ? p.estacionCorta === estacionCorta : estacionCorta.includes(p.estacionCorta ?? '')))
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

// Top 5 de barrios con más casos, para la etiqueta suave dentro del mapa —
// busca CUALQUIER columna que contenga "BARRIO" en el nombre (funciona con
// "BARRIO_HECHO" de Delitos y con lo que traiga cualquier otra capa
// cargada, sin depender de un nombre exacto).
function top5Barrios(puntos: { fila: Record<string, any> }[]): string[] | null {
  if (puntos.length === 0) return null;
  // Se busca la columna de barrio revisando TODOS los puntos (no solo el
  // primero) — "General" mezcla puntos de varias capas (Delitos, IRISP1,
  // Macri...) y no todas traen las mismas columnas; mirar solo el primero
  // hacía que la etiqueta desapareciera por completo si esa capa en
  // particular no tenía barrio, aunque las demás sí.
  const colBarrio = (() => {
    for (const p of puntos) {
      const encontrada = Object.keys(p.fila).find((k) => /BARRIO/i.test(k));
      if (encontrada) return encontrada;
    }
    return null;
  })();
  if (!colBarrio) return null;
  const conteo = new Map<string, number>();
  for (const p of puntos) {
    const valor = String(p.fila[colBarrio] ?? '').trim();
    if (!valor || /^(NO REPORTADO|SIN REPORTAR|SIN ASIGNAR|N\/A|NA|-)$/i.test(valor)) continue;
    conteo.set(valor, (conteo.get(valor) || 0) + 1);
  }
  if (conteo.size === 0) return null;
  return Array.from(conteo.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([barrio, casos], i) => `${i + 1}. ${barrio} — ${casos}`);
}

// A pedido explícito, después de que el verde suave se viera mal: fondo
// blanco limpio, texto oscuro — combina con cualquier mapa de calor de
// fondo, en vez de competir con los colores del propio mapa.
const COLOR_ETIQUETA_BARRIOS_FONDO = 'rgba(255, 255, 255, 0.94)';
const COLOR_ETIQUETA_BARRIOS_TEXTO = '#1e293b';


export async function generarImagenMapaGeneral(delitoFiltrado: string | null, fechaInicial?: string | null, fechaFinal?: string | null): Promise<string | undefined> {
  try {
    // Prioridad 1: construir el contorno UNIENDO los CAI 1-10 (confiables,
    // ya confirmados) — evita depender de una capa de Estación aparte,
    // que en la práctica ha resultado ser la equivocada (municipios en
    // vez de la división real de Norte/Sur). Prioridad 2 (respaldo): la
    // capa de Estación de siempre, solo si no hay ninguna capa de CAI
    // cargada todavía.
    const desdeCai = await construirEstacionDesdeCai('AMBAS');
    let featuresParaMapa: any[];
    let capaContornoId: string;

    if (desdeCai) {
      featuresParaMapa = [...desdeCai.features];
      capaContornoId = desdeCai.capaId;
    } else {
      const localizada = await localizarCapaDeEstaciones();
      if (!localizada || localizada.features.length === 0) {
        console.warn('[Microgerencia→Mapa] No se encontró ninguna capa de CAI ni de Estación cargada en "Mapa/Georreferenciación".');
        return undefined;
      }
      const featuresNorteSur = localizada.features.filter((f) => {
        const nombre = normalizar(nombreEstacionDeFeature(f, localizada.columna));
        return nombre === normalizar('E-Norte') || nombre === normalizar('E-Sur');
      });
      featuresParaMapa = [...(featuresNorteSur.length > 0 ? featuresNorteSur : localizada.features)];
      capaContornoId = localizada.capa.id;
    }

    // "General" = Norte + Sur (uniendo sus CAI) + Timbío — a pedido
    // explícito, se dejaron afuera Coconuco y Sotará para que el mapa se
    // vea más grande y legible (con las 5 estaciones, el área quedaba
    // demasiado repartida y cada una se veía chica).
    const desdeCuadrantesTimbio = await construirEstacionRuralDesdeCuadrantes('E-Timbio');
    if (desdeCuadrantesTimbio) {
      featuresParaMapa.push(...desdeCuadrantesTimbio.features);
    } else {
      const desdeJurisdiccionTimbio = await construirEstacionesRuralesDesdeJurisdiccion(['E-Timbio']);
      if (desdeJurisdiccionTimbio) featuresParaMapa.push(...desdeJurisdiccionTimbio.features);
    }

    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, ['E-Norte', 'E-Sur', 'E-Timbio'], undefined, fechaInicial, fechaFinal);
    if (puntos.length === 0) {
      console.warn('[Microgerencia→Mapa] No hay puntos disponibles: revisa que exista una capa de PUNTOS visible (ej. "Delitos") cargada en "Mapa/Georreferenciación".', { delitoFiltrado });
      return undefined;
    }
    const featureCollection = { type: 'FeatureCollection', features: featuresParaMapa };
    const anillosInternos = await obtenerAnillosInternos(featureCollection, capaContornoId);
    return await generarDataUrlPoligonoAislado({
      // Más margen (por defecto 0.08) — a pedido explícito: el polígono se
      // veía "cortado", pegado a los bordes del recuadro; con más aire
      // alrededor se ve completo y mejor ubicado dentro del marco.
      margen: 0.3,
      // Proporción típica de la caja del mapa en el PDF (ancho/alto). No es
      // exacta para CADA tarjeta (varía un poco según cuántos delitos
      // tenga), pero acerca mucho más el resultado a la forma real de la
      // caja que la proporción natural del polígono (más alta y angosta),
      // que era la fuente real del recorte.
      aspectoObjetivo: 0.85,
      feature: featureCollection,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      gruposEtiquetas: (() => { const t5 = top5Barrios(puntos); return t5 ? [{ titulo: 'TOP 5 BARRIOS', lineas: t5, colorFondo: COLOR_ETIQUETA_BARRIOS_FONDO, colorTexto: COLOR_ETIQUETA_BARRIOS_TEXTO }] : []; })(),
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
    // Misma prioridad que en generarImagenMapaGeneral: construir el
    // contorno de la Estación uniendo sus propios CAI (Norte = CAI 1-4,
    // Sur = CAI 5-10) — confiable y ya cargado — antes de recurrir a una
    // capa de Estación aparte.
    // Reconoce tanto la forma corta ("E-Norte", la que usa el resto del
    // dashboard) como la larga ("Estación Norte", la que usa Microgerencia
    // para nombrar sus propios nodos) — ver esNombreDeEstacion más arriba.
    const nombreNorm = normalizar(nombreEstacionCorta);
    const claveEstacion = (nombreNorm === normalizar('E-Norte') || nombreNorm === normalizar('Estacion Norte')) ? 'NORTE'
      : (nombreNorm === normalizar('E-Sur') || nombreNorm === normalizar('Estacion Sur')) ? 'SUR' : null;
    const desdeCai = claveEstacion ? await construirEstacionDesdeCai(claveEstacion) : null;
    // Estaciones rurales (Timbío, Coconuco, Sotará): no tienen CAI, su
    // polígono sale de la capa de jurisdicción, buscado por nombre.
    const cortaRural = aFormaCortaDeEstacion(nombreEstacionCorta);
    const esRural = cortaRural != null && (ESTACIONES_RURALES as readonly string[]).includes(cortaRural);
    // Al elegir una estación rural se dibujan los polígonos de SUS
    // cuadrantes; solo si no se encuentran, se cae al polígono de
    // jurisdicción de esa estación.
    const desdeCuadrantes = !desdeCai && esRural ? await construirEstacionRuralDesdeCuadrantes(cortaRural!) : null;
    const desdeJurisdiccion = !desdeCai && !desdeCuadrantes && esRural ? await construirEstacionesRuralesDesdeJurisdiccion([cortaRural!]) : null;

    let feature: any;
    let capaContornoId: string;

    if (desdeCai) {
      feature = { type: 'FeatureCollection', features: desdeCai.features };
      capaContornoId = desdeCai.capaId;
    } else if (desdeCuadrantes) {
      feature = { type: 'FeatureCollection', features: desdeCuadrantes.features };
      capaContornoId = desdeCuadrantes.capaId;
    } else if (desdeJurisdiccion) {
      feature = { type: 'FeatureCollection', features: desdeJurisdiccion.features };
      capaContornoId = desdeJurisdiccion.capaId;
    } else {
      const localizada = await localizarCapaDeEstaciones();
      if (!localizada) {
        console.warn(`[Microgerencia→Mapa] No se encontró la capa de CAI ni la de Estación (para "${nombreEstacionCorta}").`);
        return undefined;
      }
      const featureEncontrada = localizada.features.find((f) => normalizar(nombreEstacionDeFeature(f, localizada.columna)) === normalizar(nombreEstacionCorta));
      if (!featureEncontrada) {
        const valoresCrudos = [...new Set(localizada.features.map((f) => String(f?.properties?.[localizada.columna] ?? '')))];
        console.warn(
          `[Microgerencia→Mapa] La capa de Estación no tiene ningún polígono que coincida con "${nombreEstacionCorta}" en la columna "${localizada.columna}".\n` +
          `Valores encontrados en esa columna: ${JSON.stringify(valoresCrudos)}`,
        );
        return undefined;
      }
      feature = featureEncontrada;
      capaContornoId = localizada.capa.id;
    }

    // Los puntos guardan la estación en forma CORTA ("E-Norte") — si al
    // nodo le llegó la forma larga ("Estación Norte"), se traduce antes de
    // filtrar, o el filtro nunca encontraría ningún punto.
    const estacionCortaParaFiltro = claveEstacion === 'NORTE' ? 'E-Norte' : claveEstacion === 'SUR' ? 'E-Sur' : (cortaRural ?? nombreEstacionCorta);
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, estacionCortaParaFiltro, undefined, fechaInicial, fechaFinal);
    if (puntos.length === 0) {
      console.warn(`[Microgerencia→Mapa] No hay puntos disponibles para "${nombreEstacionCorta}" — revisa la capa de PUNTOS (ej. "Delitos") en "Mapa/Georreferenciación".`, { delitoFiltrado });
      return undefined;
    }
    // Con cuadrantes como contorno, cada uno ya dibuja su propio borde —
    // no hacen falta líneas internas aparte.
    const anillosInternos = desdeCuadrantes ? [] : await obtenerAnillosInternos(feature, capaContornoId);
    return await generarDataUrlPoligonoAislado({
      // Más margen (por defecto 0.08) — a pedido explícito: el polígono se
      // veía "cortado", pegado a los bordes del recuadro; con más aire
      // alrededor se ve completo y mejor ubicado dentro del marco.
      margen: 0.3,
      // Proporción típica de la caja del mapa en el PDF (ancho/alto). No es
      // exacta para CADA tarjeta (varía un poco según cuántos delitos
      // tenga), pero acerca mucho más el resultado a la forma real de la
      // caja que la proporción natural del polígono (más alta y angosta),
      // que era la fuente real del recorte.
      aspectoObjetivo: 0.85,
      feature,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      gruposEtiquetas: (() => { const t5 = top5Barrios(puntos); return t5 ? [{ titulo: 'TOP 5 BARRIOS', lineas: t5, colorFondo: COLOR_ETIQUETA_BARRIOS_FONDO, colorTexto: COLOR_ETIQUETA_BARRIOS_TEXTO }] : []; })(),
      anchoLienzo: 700,
      anillosInternos,
      // Las estaciones rurales abarcan cientos de km²: las calles reales a
      // esa escala solo meten ruido (y miles de teselas por descargar).
      mostrarCalles: !esRural,
    });
  } catch (err) {
    console.error(`[Microgerencia→Mapa] Falló generando el mapa de "${nombreEstacionCorta}":`, err);
    return undefined;
  }
}

/**
 * Imagen de un DISTRITO completo — Distrito Uno = Estación Norte + Sur (los
 * CAI 1 al 10 unidos), Distrito Dos = Timbío + Coconuco + Sotará (sus
 * polígonos de la capa de jurisdicción). Los puntos del mapa de calor son
 * solo los de las estaciones de ese distrito.
 */
export async function generarImagenMapaDistrito(distrito: 'UNO' | 'DOS', delitoFiltrado: string | null, fechaInicial?: string | null, fechaFinal?: string | null): Promise<string | undefined> {
  try {
    const estaciones: readonly string[] = distrito === 'UNO' ? ['E-Norte', 'E-Sur'] : ESTACIONES_RURALES;
    const origen = distrito === 'UNO' ? await construirEstacionDesdeCai('AMBAS') : await construirEstacionesRuralesDesdeJurisdiccion(ESTACIONES_RURALES);
    if (!origen) {
      console.warn(`[Microgerencia→Mapa] No se encontraron los polígonos del Distrito ${distrito === 'UNO' ? 'Uno (CAI 1-10)' : 'Dos (Timbío, Coconuco, Sotará)'}.`);
      return undefined;
    }
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado, estaciones, undefined, fechaInicial, fechaFinal);
    if (puntos.length === 0) {
      console.warn(`[Microgerencia→Mapa] No hay puntos para el Distrito ${distrito === 'UNO' ? 'Uno' : 'Dos'} — revisa la capa de PUNTOS (ej. "Delitos") y que esos registros traigan coordenadas.`, { delitoFiltrado });
      return undefined;
    }
    const feature = { type: 'FeatureCollection', features: origen.features };
    const anillosInternos = await obtenerAnillosInternos(feature, origen.capaId);
    return await generarDataUrlPoligonoAislado({
      margen: 0.3,
      aspectoObjetivo: 0.85,
      feature,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      gruposEtiquetas: (() => { const t5 = top5Barrios(puntos); return t5 ? [{ titulo: 'TOP 5 BARRIOS', lineas: t5, colorFondo: COLOR_ETIQUETA_BARRIOS_FONDO, colorTexto: COLOR_ETIQUETA_BARRIOS_TEXTO }] : []; })(),
      anchoLienzo: 700,
      anillosInternos,
      // A escala de distrito completo, las calles solo meten ruido.
      mostrarCalles: false,
    });
  } catch (err) {
    console.error(`[Microgerencia→Mapa] Falló generando el mapa del Distrito ${distrito}:`, err);
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
      // Más margen (por defecto 0.08) — a pedido explícito: el polígono se
      // veía "cortado", pegado a los bordes del recuadro; con más aire
      // alrededor se ve completo y mejor ubicado dentro del marco.
      margen: 0.3,
      // Proporción típica de la caja del mapa en el PDF (ancho/alto). No es
      // exacta para CADA tarjeta (varía un poco según cuántos delitos
      // tenga), pero acerca mucho más el resultado a la forma real de la
      // caja que la proporción natural del polígono (más alta y angosta),
      // que era la fuente real del recorte.
      aspectoObjetivo: 0.85,
      feature,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      gruposEtiquetas: (() => { const t5 = top5Barrios(puntos); return t5 ? [{ titulo: 'TOP 5 BARRIOS', lineas: t5, colorFondo: COLOR_ETIQUETA_BARRIOS_FONDO, colorTexto: COLOR_ETIQUETA_BARRIOS_TEXTO }] : []; })(),
      anchoLienzo: 700,
      anillosInternos,
    });
  } catch (err) {
    console.error(`[Microgerencia→Mapa] Falló generando el mapa de "${nombreCai}":`, err);
    return undefined;
  }
}
