// ── ÁMBITO TERRITORIAL DEL PERFIL consulta_piloto ──────────────────────────
// Único lugar donde se define qué es "Popayán" para la prueba piloto de los
// comandantes de las Estaciones Norte y Sur. Lo usan TANTO el navegador
// (mapa, capas, registros) COMO el servidor (netlify/functions/datosPiloto),
// por eso este archivo no depende de window ni de nada del navegador.
//
// Límite oficial: polígono municipal de Popayán del DANE (MGN 2020) que ya
// usa el dashboard (data/municipiosMepoy.json). Si ese límite no está o no
// es coherente, TODO lo geográfico se niega (criterio de denegar por
// defecto): nunca se "adivina" el territorio.
import { MUNICIPIOS_MEPOY, type FeatureMunicipio } from '../data/municipiosMepoy';
import { puntoEnFeatureGeoJSON } from './puntoEnPoligono';

export interface Limites { sur: number; oeste: number; norte: number; este: number }

/** Parque Caldas — debe quedar dentro del polígono para considerarlo válido. */
const CENTRO_CONTROL = { lat: 2.4419, lon: -76.6063 };

const POPAYAN: FeatureMunicipio | null = MUNICIPIOS_MEPOY?.features?.find((f) => f?.properties?.municipio === 'Popayán') ?? null;

function calcularLimites(f: FeatureMunicipio | null): Limites | null {
  if (!f || f.geometry?.type !== 'MultiPolygon' || !Array.isArray(f.geometry.coordinates)) return null;
  let sur = Infinity, oeste = Infinity, norte = -Infinity, este = -Infinity;
  for (const poligono of f.geometry.coordinates) {
    for (const anillo of poligono ?? []) {
      for (const p of anillo ?? []) {
        const [lon, lat] = p;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        if (lat < sur) sur = lat;
        if (lat > norte) norte = lat;
        if (lon < oeste) oeste = lon;
        if (lon > este) este = lon;
      }
    }
  }
  return Number.isFinite(sur) ? { sur, oeste, norte, este } : null;
}

const LIMITES = calcularLimites(POPAYAN);

/**
 * ¿El límite de Popayán está disponible y es coherente? (geometría válida,
 * tamaño razonable de un municipio y el centro de la ciudad adentro).
 * Si devuelve false, el perfil piloto NO debe ver nada geográfico.
 */
export function territorioPilotoValido(): boolean {
  if (!POPAYAN || !LIMITES) return false;
  const alto = LIMITES.norte - LIMITES.sur;
  const ancho = LIMITES.este - LIMITES.oeste;
  if (!(alto > 0.05 && alto < 1.5 && ancho > 0.05 && ancho < 1.5)) return false;
  return puntoEnFeatureGeoJSON(CENTRO_CONTROL.lon, CENTRO_CONTROL.lat, POPAYAN);
}

/** Rectángulo que encierra Popayán (null si el límite no es válido). */
export function limitesPopayan(): Limites | null {
  return territorioPilotoValido() ? LIMITES : null;
}

/** El polígono de Popayán (solo si es válido). */
export function featurePopayan(): FeatureMunicipio | null {
  return territorioPilotoValido() ? POPAYAN : null;
}

/** ¿El punto (lat, lon) está DENTRO del límite municipal de Popayán? */
export function puntoEnPopayan(lat: unknown, lon: unknown): boolean {
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return false;
  const l = limitesPopayan();
  if (!l || !POPAYAN) return false;
  if (la < l.sur || la > l.norte || lo < l.oeste || lo > l.este) return false;
  return puntoEnFeatureGeoJSON(lo, la, POPAYAN);
}

// Tolerancia (~150 m) SOLO para decidir si un polígono/línea de una capa
// pertenece a Popayán: los vértices que coinciden con el borde municipal
// (barrios o comunas limítrofes) no deben contarse como "afuera".
const TOLERANCIA_GRADOS = 0.0014;
function puntoEnPopayanTolerante(lat: number, lon: number): boolean {
  if (puntoEnPopayan(lat, lon)) return true;
  const t = TOLERANCIA_GRADOS;
  return puntoEnPopayan(lat + t, lon) || puntoEnPopayan(lat - t, lon) || puntoEnPopayan(lat, lon + t) || puntoEnPopayan(lat, lon - t);
}

const sinTildes = (s: unknown) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ESTACIONES_FORANEAS = ['TIMBIO', 'COCONUCO', 'SOTARA', 'PURACE', 'PAISPAMBA'];

/** ¿La estación pertenece a OTRO municipio (Timbío, Sotará, Puracé/Coconuco)? */
export function estacionForanea(estacion: unknown): boolean {
  const e = sinTildes(estacion);
  return ESTACIONES_FORANEAS.some((x) => e.includes(x));
}
/** Estaciones de Popayán (Norte y Sur). */
export function estacionDePopayan(estacion: unknown): boolean {
  const e = sinTildes(estacion);
  if (!e || estacionForanea(e)) return false;
  return /\bNORTE\b|\bSUR\b|E-NORTE|E-SUR/.test(e);
}

const tieneCoordenadas = (r: { lat?: unknown; lon?: unknown }) =>
  r.lat !== null && r.lat !== undefined && r.lat !== '' && r.lon !== null && r.lon !== undefined && r.lon !== ''
  && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && !(Number(r.lat) === 0 && Number(r.lon) === 0);

/**
 * Regla de los REGISTROS DE DELITOS para el piloto: se incluyen los de las
 * Estaciones Norte y Sur (jurisdicción de Popayán) — EXACTAMENTE lo mismo que
 * ve el administrador filtrando Estación = E-Norte + E-Sur, para que las
 * cifras cuadren. Lo de Timbío, Sotará, Coconuco o sin estación, no.
 * Las coordenadas que caigan fuera del límite de Popayán se QUITAN del
 * registro (ver recortarCoordenadasPiloto): cuenta en las tablas, pero no
 * se ubica en el mapa fuera del territorio autorizado.
 */
export function registroEnPopayan(r: { lat?: unknown; lon?: unknown; estacion?: unknown } | null | undefined): boolean {
  if (!r || !territorioPilotoValido()) return false;
  return estacionDePopayan(r.estacion);
}

/** Copia del registro sin coordenadas si estas caen fuera de Popayán. */
export function recortarCoordenadasPiloto<T extends { lat?: unknown; lon?: unknown }>(r: T): T {
  if (!tieneCoordenadas(r) || puntoEnPopayan(r.lat, r.lon)) return r;
  return { ...r, lat: null, lon: null };
}

/**
 * OPERATIVIDAD (fuente aparte, con unidades que no siempre son estaciones):
 * de las Estaciones Norte/Sur, o —si no es de otro municipio— con
 * coordenadas dentro de Popayán.
 */
export function operatividadEnPopayan(r: { lat?: unknown; lon?: unknown; estacion?: unknown } | null | undefined): boolean {
  if (!r || !territorioPilotoValido()) return false;
  if (estacionDePopayan(r.estacion)) return true;
  return !estacionForanea(r.estacion) && tieneCoordenadas(r) && puntoEnPopayan(r.lat, r.lon);
}

// ── Capas geográficas (GeoJSON) ────────────────────────────────────────────
type Pos = [number, number];
function verticesDe(geom: any, salida: Pos[]) {
  if (!geom) return;
  const recorrer = (c: any) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === 'number' && typeof c[1] === 'number') { salida.push([c[0], c[1]]); return; }
    for (const x of c) recorrer(x);
  };
  if (geom.type === 'GeometryCollection') { for (const g of geom.geometries ?? []) verticesDe(g, salida); return; }
  recorrer(geom.coordinates);
}

function centroideAnillo(anillo: Pos[]): Pos | null {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [x0, y0] = anillo[j];
    const [x1, y1] = anillo[i];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-14) return null;
  return [cx / (3 * a), cy / (3 * a)];
}

/** Anillo exterior más grande de un Polygon/MultiPolygon (para su centroide). */
function anilloPrincipal(geom: any): Pos[] | null {
  const anillos: Pos[][] = [];
  if (geom?.type === 'Polygon') anillos.push(geom.coordinates?.[0]);
  if (geom?.type === 'MultiPolygon') for (const p of geom.coordinates ?? []) anillos.push(p?.[0]);
  let mejor: Pos[] | null = null;
  let mayor = -1;
  for (const r of anillos) {
    if (!Array.isArray(r) || r.length < 4) continue;
    let s = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
    if (Math.abs(s) > mayor) { mayor = Math.abs(s); mejor = r; }
  }
  return mejor;
}

/**
 * ¿Un elemento de una capa pertenece a Popayán?
 *  · Punto → estrictamente dentro del límite.
 *  · Línea / polígono → su centroide dentro Y al menos la mitad de sus
 *    vértices dentro (con tolerancia de borde). Así una comuna o barrio de
 *    Popayán se conserva, y Timbío, Sotará o Puracé (aunque compartan
 *    borde) quedan fuera.
 */
export function featureEnPopayan(feature: any): boolean {
  const geom = feature?.geometry;
  if (!geom || !territorioPilotoValido()) return false;
  if (geom.type === 'Point') return puntoEnPopayan(geom.coordinates?.[1], geom.coordinates?.[0]);
  const vs: Pos[] = [];
  verticesDe(geom, vs);
  if (vs.length === 0) return false;
  if (geom.type === 'MultiPoint') return vs.every(([lon, lat]) => puntoEnPopayan(lat, lon));
  const paso = Math.max(1, Math.floor(vs.length / 300));
  let dentro = 0, total = 0;
  for (let i = 0; i < vs.length; i += paso) {
    total++;
    if (puntoEnPopayanTolerante(vs[i][1], vs[i][0])) dentro++;
  }
  if (dentro / total < 0.5) return false;
  const anillo = anilloPrincipal(geom);
  const c = anillo ? centroideAnillo(anillo) : null;
  if (c) return puntoEnPopayanTolerante(c[1], c[0]);
  // Líneas: punto medio aproximado.
  const medio = vs[Math.floor(vs.length / 2)];
  return puntoEnPopayanTolerante(medio[1], medio[0]);
}

/**
 * Devuelve una COPIA del GeoJSON con solo los elementos de Popayán (la capa
 * original no se toca). Un GeoJSON que no se pueda interpretar se devuelve
 * vacío (se deniega por defecto).
 */
export function restringirGeojsonAPopayan<T = unknown>(geojson: T): T {
  const vacio = { type: 'FeatureCollection', features: [] } as unknown as T;
  const g = geojson as any;
  if (!g || !territorioPilotoValido()) return vacio;
  if (Array.isArray(g)) return g.map((x) => restringirGeojsonAPopayan(x)) as unknown as T;
  if (g.type === 'FeatureCollection') {
    const features = (g.features ?? []).flatMap((f: any) => {
      if (f?.type === 'FeatureCollection') {
        const sub = restringirGeojsonAPopayan(f) as any;
        return sub.features.length ? [sub] : [];
      }
      return featureEnPopayan(f) ? [f] : [];
    });
    return { ...g, features } as T;
  }
  if (g.type === 'Feature') return (featureEnPopayan(g) ? g : { type: 'FeatureCollection', features: [] }) as T;
  if (typeof g.type === 'string' && 'coordinates' in g) return (featureEnPopayan({ type: 'Feature', geometry: g }) ? g : vacio) as T;
  return vacio;
}
