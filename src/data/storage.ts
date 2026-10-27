import type { CrimeRecord } from '../types/crime';
import { getDb, STORE_RECORDS, STORE_META } from './db';
import { obtenerModoAcceso } from '../utils/modoAcceso';

// Perfil piloto (/piloto): NO lee ni escribe la copia local del navegador.
// Así nunca ve datos completos que haya guardado otro perfil en ese equipo,
// ni deja copia permanente de nada: todo vive solo en memoria de la sesión.
const esPiloto = () => obtenerModoAcceso() === 'piloto';

// Súbela cada vez que un cambio en db2Transform.ts (o en cualquier lógica
// que afecte los VALORES ya guardados, ej. renombrar "Patrulla" -> "Z.
// Atención") deba invalidar los datos que un usuario ya tenga guardados en
// su navegador. Los datos guardados con una versión distinta a esta se
// descartan y se vuelven a calcular desde la fuente automáticamente.
//
// v3: se agregaron los campos "lat"/"lon" a CrimeRecord. Un registro
// guardado ANTES de esto no tiene esas dos propiedades en absoluto
// (quedan "undefined", no "null"), y una comparación como "!== null" en
// otra parte del código los confundía con coordenadas válidas — subir la
// versión descarta ese caché viejo para que todo se recalcule ya con el
// campo presente y en null.
export const VERSION_TRANSFORMACION = 3;

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
  return records.map((r) => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null, lat: r.lat ?? null, lon: r.lon ?? null }));
}

export async function guardarDatos(records: CrimeRecord[], nombreArchivo: string, fechaMaxParametro?: Date | null) {
  if (esPiloto()) return;
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
  if (esPiloto()) return null;
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
  if (esPiloto()) return;
  const db = await getDb();
  const tx = db.transaction([STORE_RECORDS, STORE_META], 'readwrite');
  await tx.objectStore(STORE_RECORDS).delete('dataset');
  await tx.objectStore(STORE_META).delete('info');
  await tx.done;
}

// ── Copia del enlace de CONSULTA (/piloto) ────────────────────────────────
// Separada por usuario y ámbito (nunca se mezcla con la del administrador ni
// con la de otro usuario). Con ella, abrir el dashboard otra vez no vuelve a
// descargar todo: solo se confirma con el servidor que nada cambió. Se borra
// al cerrar sesión.
interface CopiaConsulta { records: any[]; sello: string | null; conteo: number | null; version: number }
const claveCopia = (usuario: string, ambito: string) => `consulta:${usuario}:${ambito}`;

export async function guardarCopiaConsulta(usuario: string, ambito: string, records: CrimeRecord[], sello: string | null, conteo: number | null) {
  try {
    const db = await getDb();
    const copia: CopiaConsulta = { records: serialize(records), sello, conteo, version: VERSION_TRANSFORMACION };
    await db.put(STORE_RECORDS, copia, claveCopia(usuario, ambito));
  } catch { /* sin espacio: la próxima vez simplemente se descarga */ }
}

export async function cargarCopiaConsulta(usuario: string, ambito: string): Promise<{ records: CrimeRecord[]; sello: string | null; conteo: number | null } | null> {
  try {
    const db = await getDb();
    const c = (await db.get(STORE_RECORDS, claveCopia(usuario, ambito))) as CopiaConsulta | undefined;
    if (!c || c.version !== VERSION_TRANSFORMACION || !Array.isArray(c.records)) return null;
    return { records: deserialize(c.records), sello: c.sello, conteo: c.conteo };
  } catch {
    return null;
  }
}

export async function borrarCopiasConsulta() {
  try {
    const db = await getDb();
    const claves = await db.getAllKeys(STORE_RECORDS);
    for (const k of claves) if (String(k).startsWith('consulta:')) await db.delete(STORE_RECORDS, k);
  } catch { /* nada que borrar */ }
}
