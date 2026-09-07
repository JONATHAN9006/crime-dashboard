import type { CrimeRecord } from '../types/crime';
import { getDb, STORE_RECORDS, STORE_META } from './db';

// Súbela cada vez que un cambio en db2Transform.ts (o en cualquier lógica
// que afecte los VALORES ya guardados, ej. renombrar "Patrulla" -> "Z.
// Atención") deba invalidar los datos que un usuario ya tenga guardados en
// su navegador. Los datos guardados con una versión distinta a esta se
// descartan y se vuelven a calcular desde la fuente automáticamente.
export const VERSION_TRANSFORMACION = 2;

interface StoredMeta {
  nombreArchivo: string;
  ultimaActualizacion: string; // ISO
  // Fecha de corte oficial del sistema (columna FECHA_MAX_PARAMETRO de DB2),
  // guardada aparte porque no se puede reconstruir a partir de los registros.
  fechaMaxParametro: string | null; // ISO
  // Versión de la lógica de transformación (db2Transform.ts) con la que se
  // generaron estos registros guardados. Si el código cambia de forma que
  // afecta los VALORES ya calculados (ej. renombrar "Patrulla" a "Z.
  // Atención"), basta con subir VERSION_TRANSFORMACION en db.ts para que
  // cualquier dato guardado con una versión anterior se descarte solo y se
  // vuelva a calcular desde la fuente — sin esto, un usuario que ya tenía
  // datos guardados seguiría viendo los valores viejos indefinidamente,
  // aunque el código ya esté corregido.
  versionTransformacion?: number;
}

// Los objetos Date no serializan bien en IndexedDB structured clone si vienen de
// distintos "realms"; los guardamos como epoch ms y los reconstruimos al leer.
function serialize(records: CrimeRecord[]) {
  return records.map((r) => ({ ...r, fecha: r.fecha ? r.fecha.getTime() : null }));
}

function deserialize(records: any[]): CrimeRecord[] {
  return records.map((r) => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null }));
}

export async function guardarDatos(records: CrimeRecord[], nombreArchivo: string, fechaMaxParametro?: Date | null) {
  const db = await getDb();
  const tx = db.transaction([STORE_RECORDS, STORE_META], 'readwrite');
  await tx.objectStore(STORE_RECORDS).put(serialize(records), 'dataset');
  const meta: StoredMeta = {
    nombreArchivo,
    ultimaActualizacion: new Date().toISOString(),
    fechaMaxParametro: fechaMaxParametro ? fechaMaxParametro.toISOString() : null,
    versionTransformacion: VERSION_TRANSFORMACION,
  };
  await tx.objectStore(STORE_META).put(meta, 'info');
  await tx.done;
}

export async function cargarDatosGuardados(): Promise<{ records: CrimeRecord[]; meta: StoredMeta } | null> {
  try {
    const db = await getDb();
    const raw = await db.get(STORE_RECORDS, 'dataset');
    const meta = await db.get(STORE_META, 'info');
    if (!raw || !meta) return null;
    // Si lo guardado viene de una versión de transformación anterior (o no
    // tiene ninguna, de antes de que existiera este control), se descarta
    // como si no existiera — quien llama esto sigue con su siguiente
    // alternativa (backend o archivo por defecto), que sí aplica la lógica
    // de transformación actual.
    if (meta.versionTransformacion !== VERSION_TRANSFORMACION) return null;
    return { records: deserialize(raw), meta };
  } catch {
    return null;
  }
}

export async function limpiarDatos() {
  const db = await getDb();
  const tx = db.transaction([STORE_RECORDS, STORE_META], 'readwrite');
  await tx.objectStore(STORE_RECORDS).delete('dataset');
  await tx.objectStore(STORE_META).delete('info');
  await tx.done;
}
