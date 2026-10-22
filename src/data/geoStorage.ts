import { getDb, STORE_GEO } from './db';
import { obtenerModoAcceso } from '../utils/modoAcceso';
import { restringirGeojsonAPopayan } from '../utils/territorioPiloto';

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
  // Capa compartida con los demás equipos a través del servidor central
  // (ver geoSync.ts). Sin estos campos = la capa solo existe en este equipo.
  compartida?: boolean;
  versionCompartida?: string;
  partesCompartidas?: number;
}

export async function guardarCapas(capas: CapaGeografica[]) {
  if (esPiloto()) { capasPiloto = restringirCapasAPopayan(capas); return; }
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
