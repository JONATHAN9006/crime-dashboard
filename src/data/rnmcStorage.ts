import { getDb, STORE_RNMC } from './db';
import type { RegistroComparendo } from './rnmcParser';

// Guardado LOCAL (en este navegador) — a diferencia de Delictividad, esto
// todavía no se sincroniza con el servidor central. Si más adelante se
// necesita que lo vean varias personas a la vez, se puede migrar al mismo
// patrón de Supabase que ya usa Delictividad.
export async function guardarComparendos(registros: RegistroComparendo[]) {
  const db = await getDb();
  await db.put(STORE_RNMC, { registros, fecha: new Date().toISOString() }, 'comparendos');
}

export async function cargarComparendos(): Promise<{ registros: RegistroComparendo[]; fecha: string } | null> {
  const db = await getDb();
  const datos = await db.get(STORE_RNMC, 'comparendos');
  if (!datos?.registros) return null;
  return { registros: datos.registros, fecha: datos.fecha };
}
