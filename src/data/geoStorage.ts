import { getDb, STORE_GEO } from './db';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { restringirGeojsonAPopayan } from '../utils/territorioPiloto';
import { restriccionPopayanActiva } from '../utils/restriccionTerritorial';

// Perfil piloto (/piloto): las capas viven SOLO en memoria (nada se guarda
// en el equipo) y al leerlas se entregan ya recortadas a Popayán.
const esPiloto = () => obtenerModoAcceso() === 'piloto';
let capasPiloto: CapaGeografica[] = [];
const contarElementos = (g: any): number => {
  if (!g) return 0;
  if (Array.isArray(g)) return g.reduce((n, x) => n + contarElementos(x), 0);
  if (g.type === 'FeatureCollection') return (g.features ?? []).reduce((n: number, f: any) => n + (f?.type === 'FeatureCollection' ? contarElementos(f) : 1), 0);
  return 1;
};
/** Copia de las capas con solo lo de Popayán; una capa que queda vacía (toda fuera) ni se lista. */
export function restringirCapasAPopayan(capas: CapaGeografica[]): CapaGeografica[] {
  return capas
    .map((c) => ({ ...c, geojson: restringirGeojsonAPopayan(c.geojson) }))
    .filter((c) => contarElementos(c.geojson) > 0);
}

export interface EstiloElemento { color?: string | null; opacidad?: number | null }

/** Clave con la que se guarda el estilo de un polígono (por su nombre). */
export const claveNombreElemento = (v: unknown) =>
  `n:${String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ')}`;

/** Clave del polígono dentro de su capa: su nombre (campo) o su posición. */
export function claveDeElemento(capa: CapaGeografica, feature: any, campo?: string | null): string | null {
  const v = campo ? feature?.properties?.[campo] : null;
  if (v != null && String(v).trim()) return claveNombreElemento(v);
  const feats = (capa.geojson as any)?.features;
  const i = Array.isArray(feats) ? feats.indexOf(feature) : -1;
  return i >= 0 ? `i:${i}` : null;
}

/** Estilo propio guardado para un polígono (si lo tiene). Sin campo conocido
 *  se prueba con cada texto de sus atributos (ej. láminas de Microgerencia). */
export function estiloDeElemento(capa: CapaGeografica | undefined, feature: any, campo?: string | null): EstiloElemento | undefined {
  const e = capa?.estilosElemento;
  if (!capa || !e) return undefined;
  const clave = claveDeElemento(capa, feature, campo);
  if (clave && e[clave]) return e[clave];
  if (!campo) {
    for (const v of Object.values(feature?.properties ?? {})) {
      if (typeof v === 'string' && v.trim() && e[claveNombreElemento(v)]) return e[claveNombreElemento(v)];
    }
  }
  return undefined;
}

export interface CapaGeografica {
  id: string;
  nombre: string;
  geojson: unknown;
  visible: boolean;
  // Campo del GeoJSON (ej. "estacion", "NOMBRE_CUA") a usar para unir cada
  // elemento geográfico con los datos filtrados del dashboard.
  campoUnion: string | null;
  // A qué dimensión del dashboard corresponde ese campo, para saber contra
  // qué agrupar los casos filtrados (estación, cuadrante o barrio).
  dimension: 'estacion' | 'cuadrante' | 'barrioHecho' | null;
  colorearPorCasos: boolean;
  // Color elegido por el usuario para distinguir la capa en el mapa (borde y
  // relleno). Sin valor = estilo institucional de siempre. Es de cada equipo.
  color?: string | null;
  // Opacidad del relleno de toda la capa (0–100). Sin valor = la de siempre.
  opacidad?: number | null;
  // Estilo propio de cada polígono (color y opacidad), por nombre del
  // polígono («n:NOMBRE») o, si no tiene nombre, por su posición («i:3»).
  estilosElemento?: Record<string, EstiloElemento>;
  // Capa compartida con los demás equipos a través del servidor central
  // (ver geoSync.ts). Sin estos campos = la capa solo existe en este equipo.
  compartida?: boolean;
  versionCompartida?: string;
  partesCompartidas?: number;
}

export async function guardarCapas(capas: CapaGeografica[]) {
  if (esPiloto()) { capasPiloto = restriccionPopayanActiva() ? restringirCapasAPopayan(capas) : capas; return; }
  const db = await getDb();
  await db.put(STORE_GEO, { capas, fecha: new Date().toISOString() }, 'capas');
}

export async function cargarCapas(): Promise<CapaGeografica[]> {
  if (esPiloto()) return capasPiloto;
  try {
    const db = await getDb();
    const nuevo = await db.get(STORE_GEO, 'capas');
    if (nuevo?.capas) return nuevo.capas;
    // Compatibilidad con el formato anterior (una sola capa bajo la clave "capa").
    const legado = await db.get(STORE_GEO, 'capa');
    if (legado?.geojson) {
      return [{
        id: 'legado', nombre: legado.nombreArchivo || 'Capa cargada', geojson: legado.geojson,
        visible: true, campoUnion: null, dimension: null, colorearPorCasos: false,
      }];
    }
    return [];
  } catch {
    return [];
  }
}

export async function limpiarCapas() {
  if (esPiloto()) { capasPiloto = []; return; }
  const db = await getDb();
  await db.delete(STORE_GEO, 'capas');
  await db.delete(STORE_GEO, 'capa');
}
