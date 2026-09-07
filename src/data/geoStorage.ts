import { getDb, STORE_GEO } from './db';

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
}

export async function guardarCapas(capas: CapaGeografica[]) {
  const db = await getDb();
  await db.put(STORE_GEO, { capas, fecha: new Date().toISOString() }, 'capas');
}

export async function cargarCapas(): Promise<CapaGeografica[]> {
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
  const db = await getDb();
  await db.delete(STORE_GEO, 'capas');
  await db.delete(STORE_GEO, 'capa');
}
