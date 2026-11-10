import { MUNICIPIOS_MEPOY, type NombreMunicipio } from '../data/municipiosMepoy';

// Municipio de un registro, en este orden:
//   1. La columna MUNICIPIO de la matriz (o CIUDAD si no trae MUNICIPIO).
//   2. Registros sin esa columna (copias antiguas): por la estación
//      (Norte/Sur → Popayán · Timbío · Sotará · Coconuco → Puracé).
//   3. Si tampoco, por la coordenada (límites DANE MGN 2020).
//   4. Si no hay nada → «Sin municipio».
export const SIN_MUNICIPIO = 'Sin municipio';

const sinTildes = (s: unknown) => String(s ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function municipioPorEstacion(estacion: unknown): NombreMunicipio | null {
  const e = sinTildes(estacion);
  if (!e) return null;
  if (e.includes('TIMBIO')) return 'Timbío';
  if (e.includes('SOTARA') || e.includes('PAISPAMBA')) return 'Sotará';
  if (e.includes('COCONUCO') || e.includes('PURACE')) return 'Puracé';
  if (e.includes('POPAYAN') || /\b(NORTE|SUR)\b/.test(e)) return 'Popayán';
  return null;
}

function dentroDeAnillo(lon: number, lat: number, anillo: [number, number][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function municipioPorCoordenada(lat: number | null | undefined, lon: number | null | undefined): NombreMunicipio | null {
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const f of MUNICIPIOS_MEPOY.features) {
    for (const poligono of f.geometry.coordinates) {
      if (!dentroDeAnillo(lon, lat, poligono[0])) continue;
      if (poligono.slice(1).some((hueco) => dentroDeAnillo(lon, lat, hueco))) continue;
      return f.properties.municipio;
    }
  }
  return null;
}

// Nombre canónico: «POPAYÁN», «Popayán (CT)» → «Popayán»; «SOTARÁ PAISPAMBA» → «Sotará».
const CANONICOS: [RegExp, string][] = [
  [/^POPAYAN/, 'Popayán'], [/^TIMBIO/, 'Timbío'], [/^SOTARA|PAISPAMBA/, 'Sotará'],
  [/^PURACE|COCONUCO/, 'Puracé'], [/^CAJIBIO/, 'Cajibío'], [/^BOGOTA/, 'Bogotá D.C.'],
];
export function canonizarMunicipio(v: unknown): string {
  const limpio = String(v ?? '').replace(/\(CT\)/gi, '').replace(/\s+/g, ' ').trim();
  if (!limpio) return '';
  const e = sinTildes(limpio);
  if (/^(NO REPORTAD|SIN |N\/?A$|NULL$|-$)/.test(e)) return '';
  for (const [re, nombre] of CANONICOS) if (re.test(e)) return nombre;
  return limpio.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

const normClave = (k: string) => sinTildes(k).replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');
function municipioDeFila(raw: Record<string, unknown> | undefined): string {
  if (!raw) return '';
  let ciudad = '';
  for (const k of Object.keys(raw)) {
    const n = normClave(k);
    if (n === 'MUNICIPIO' || n === 'MUNICIPIO_HECHO') { const m = canonizarMunicipio(raw[k]); if (m) return m; }
    else if (n === 'CIUDAD' && !ciudad) ciudad = canonizarMunicipio(raw[k]);
  }
  return ciudad;
}

const cachePorRegistro = new WeakMap<object, string>();
const cacheEstacion = new Map<string, NombreMunicipio | null>();
const cacheCoord = new Map<string, NombreMunicipio | null>();

export function municipioDe(r: { estacion?: unknown; lat?: number | null; lon?: number | null; raw?: Record<string, unknown> }): string {
  const guardado = cachePorRegistro.get(r);
  if (guardado !== undefined) return guardado;
  const m = calcularMunicipio(r);
  cachePorRegistro.set(r, m);
  return m;
}

function calcularMunicipio(r: { estacion?: unknown; lat?: number | null; lon?: number | null; raw?: Record<string, unknown> }): string {
  const deFila = municipioDeFila(r.raw);
  if (deFila) return deFila;
  const clave = String(r.estacion ?? '');
  let m = cacheEstacion.get(clave);
  if (m === undefined) { m = municipioPorEstacion(clave); cacheEstacion.set(clave, m); }
  if (m) return m;
  if (r.lat == null || r.lon == null) return SIN_MUNICIPIO;
  const k = `${r.lat},${r.lon}`;
  let c = cacheCoord.get(k);
  if (c === undefined) { c = municipioPorCoordenada(r.lat, r.lon); cacheCoord.set(k, c); }
  return c ?? SIN_MUNICIPIO;
}
