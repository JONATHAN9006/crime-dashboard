import { getDb, STORE_PRODUCTOS } from './db';

export interface ProductoArchivo {
  nombreArchivo: string;
  tipoMime: string;
  dataUrl: string; // base64 completo (data:<mime>;base64,...)
  cargadoPor: string;
  fechaCarga: string; // ISO
}

export async function guardarProductoArchivo(numero: number, archivo: ProductoArchivo) {
  const db = await getDb();
  const actuales = (await db.get(STORE_PRODUCTOS, 'lista')) ?? {};
  actuales[numero] = archivo;
  await db.put(STORE_PRODUCTOS, actuales, 'lista');
}

// A diferencia de guardarProductoArchivo (agrega/reemplaza una clave), esta
// guarda la lista COMPLETA tal cual se le pase — se usa para poder borrar un
// producto (quitándolo del objeto antes de llamarla).
export async function guardarTodosLosProductos(lista: Record<number, ProductoArchivo>) {
  const db = await getDb();
  await db.put(STORE_PRODUCTOS, lista, 'lista');
}

export async function cargarProductosArchivos(): Promise<Record<number, ProductoArchivo>> {
  try {
    const db = await getDb();
    return (await db.get(STORE_PRODUCTOS, 'lista')) ?? {};
  } catch {
    return {};
  }
}

export function leerArchivoComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
