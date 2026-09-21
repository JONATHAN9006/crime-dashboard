export interface RemoteMeta {
  ok: boolean;
  ultimaActualizacion: string | null;
  ultimoUsuario: string | null;
  error?: string;
}

export interface RemotePushResult {
  ok: boolean;
  mensaje?: string;
  fecha?: string;
  error?: string;
}

// "dataset" es OPCIONAL en las 3 funciones — si no se pasa, el backend
// asume "delictividad" (el comportamiento de siempre, sin cambios). Se
// agrega "operatividad" como segundo dataset independiente, con su propio
// archivo y su propia fecha/usuario de actualización en el mismo backend.
export type DatasetRemoto = 'delictividad' | 'operatividad';

// Tamaño de cada pedazo pedido al backend, en caracteres — bastante por
// debajo del límite real de Apps Script (que la base ya alcanzó con
// ~2,8 MB de respuesta cortada) para dejar margen de sobra, incluso si la
// base sigue creciendo.
const TAMANO_TROZO = 1_500_000;
// Salvaguarda: nunca más de esta cantidad de pedazos, para no quedar en un
// bucle infinito si el backend respondiera algo inesperado (ej. nunca
// marca "esUltimo").
const MAX_TROZOS = 500;

export async function descargarCsvRemoto(backendUrl: string, dataset?: DatasetRemoto): Promise<string> {
  // Se pide el archivo POR PARTES (ver Code.gs, acción "chunk") y se unen
  // aquí — antes se pedía en una sola respuesta, y con la base ya por
  // encima de 100.000 registros (~24 MB), Google Apps Script cortaba esa
  // respuesta a la mitad (a los ~2,8 MB) sin ningún error visible: el
  // dashboard terminaba mostrando un pedazo incompleto y distinto de la
  // información cada vez que se recargaba. Pidiendo pedazos pequeños, cada
  // respuesta individual queda muy por debajo de ese límite, sin importar
  // cuánto crezca la base en el futuro.
  const parametroDataset = dataset ? `&dataset=${dataset}` : '';
  let offset = 0;
  let partes: string[] = [];
  for (let i = 0; i < MAX_TROZOS; i++) {
    const url = `${backendUrl}?action=chunk&offset=${offset}&length=${TAMANO_TROZO}&_=${Date.now()}${parametroDataset}`;
    const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!resp.ok) throw new Error(`El backend respondió con error ${resp.status} al pedir el pedazo en la posición ${offset}.`);
    const datos = await resp.json();
    if (!datos.ok) throw new Error(datos.error || 'El backend no pudo entregar la información en pedazos.');
    partes.push(datos.contenido ?? '');
    offset += (datos.contenido ?? '').length;
    if (datos.esUltimo || (datos.contenido ?? '').length === 0) break;
  }
  return partes.join('');
}

export async function consultarMetaRemota(backendUrl: string, dataset?: DatasetRemoto): Promise<RemoteMeta> {
  const parametroDataset = dataset ? `&dataset=${dataset}` : '';
  const url = `${backendUrl}?action=meta&_=${Date.now()}${parametroDataset}`;
  const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!resp.ok) throw new Error(`El backend respondió con error ${resp.status}`);
  return resp.json();
}

// Nota: Apps Script Web Apps no manejan bien preflight CORS con
// Content-Type: application/json cuando se envían encabezados custom, así
// que enviamos el cuerpo como texto plano (evita el preflight) y el propio
// script lo interpreta como JSON.
export async function subirCsvRemoto(backendUrl: string, token: string, csv: string, usuario: string, dataset?: DatasetRemoto): Promise<RemotePushResult> {
  const resp = await fetch(backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, csv, usuario, dataset }),
  });
  if (!resp.ok) throw new Error(`El backend respondió con error ${resp.status}`);
  return resp.json();
}
