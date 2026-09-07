import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'crime-dashboard-db';
export const DB_VERSION = 4;
export const STORE_RECORDS = 'records';
export const STORE_META = 'meta';
export const STORE_GEO = 'geo';
export const STORE_PUNTOS = 'puntos';
export const STORE_PRODUCTOS = 'productos_esperados';

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_RECORDS)) db.createObjectStore(STORE_RECORDS);
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
        if (!db.objectStoreNames.contains(STORE_GEO)) db.createObjectStore(STORE_GEO);
        if (!db.objectStoreNames.contains(STORE_PUNTOS)) db.createObjectStore(STORE_PUNTOS);
        if (!db.objectStoreNames.contains(STORE_PRODUCTOS)) db.createObjectStore(STORE_PRODUCTOS);
      },
      // Si esta misma pestaña tiene la base abierta con una versión VIEJA y
      // otra pestaña/ventana intenta abrir una versión NUEVA (ej. después de
      // subir una actualización del dashboard), sin este manejador el
      // navegador se queda esperando indefinidamente a que la pestaña vieja
      // "suelte" la base — y la pantalla de la pestaña nueva se queda en
      // "Cargando información..." para siempre. Cerrando la conexión vieja
      // aquí, la nueva pestaña puede continuar sin que el usuario tenga que
      // cerrar manualmente ninguna otra ventana.
      blocking() {
        dbPromise?.then((db) => db.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}
