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
  for (const capa of capas) {
    const feats = extraerFeatures(capa.geojson).slice(0, 200);
    if (feats.length === 0) continue;
    const columnas = Object.keys(feats[0]?.properties ?? {});
    for (const columna of columnas) {
      const coincidencias = feats.filter((f) => {
        const valor = normalizar(f?.properties?.[columna]);
        return NOMBRES_ESTACION_CORTOS.has(f?.properties?.[columna]) || Object.keys(MAPA_ESTACION).some((k) => normalizar(k) === valor);
      });
      if (coincidencias.length >= Math.min(2, feats.length)) return { capa, columna, features: extraerFeatures(capa.geojson) };
    }
  }
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

/** Imagen de TODO Popayán (todas las estaciones juntas) — para "MEPOY General". */
export async function generarImagenMapaGeneral(delitoFiltrado: string | null): Promise<string | undefined> {
  try {
    const localizada = await localizarCapaDeEstaciones();
    if (!localizada || localizada.features.length === 0) {
      console.warn('[Microgerencia→Mapa] No se encontró ninguna capa de Estación cargada en "Mapa/Georreferenciación" (o ninguna columna suya coincide con nombres de estación conocidos).');
      return undefined;
    }
    const puntos = await obtenerPuntosFiltrados(delitoFiltrado);
    if (puntos.length === 0) {
      console.warn('[Microgerencia→Mapa] No hay puntos disponibles: revisa que exista una capa de PUNTOS visible (ej. "Delitos") cargada en "Mapa/Georreferenciación" — es un Excel aparte con columnas de latitud/longitud, distinto de la Matriz Base/DB2 principal.', { delitoFiltrado });
      return undefined;
    }
    const featureCollection = { type: 'FeatureCollection', features: localizada.features };
    return await generarDataUrlPoligonoAislado({
      feature: featureCollection,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      anchoLienzo: 700,
    });
  } catch (err) {
    console.error('[Microgerencia→Mapa] Falló generando el mapa general:', err);
    return undefined;
  }
}

/** Imagen de UNA estación específica (ej. "E-Norte") — para los nodos de Distrito/Estación. */
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
    return await generarDataUrlPoligonoAislado({
      feature,
      puntos,
      colores: ['#22c55e', '#a3e635', '#facc15', '#f97316', '#dc2626'],
      etiquetas: [],
      anchoLienzo: 700,
    });
  } catch (err) {
    console.error(`[Microgerencia→Mapa] Falló generando el mapa de "${nombreEstacionCorta}":`, err);
    return undefined;
  }
}
