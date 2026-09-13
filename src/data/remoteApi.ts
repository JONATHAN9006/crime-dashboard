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

export async function descargarCsvRemoto(backendUrl: string, dataset?: DatasetRemoto): Promise<string> {
  // cache: 'no-store' + parámetro único en la URL: evita que el navegador
  // sirva una respuesta vieja guardada en caché para esta misma URL (Google
  // Apps Script no siempre envía encabezados que impidan el cacheo por sí solo).
  const parametroDataset = dataset ? `&dataset=${dataset}` : '';
  const url = `${backendUrl}${backendUrl.includes('?') ? '&' : '?'}_=${Date.now()}${parametroDataset}`;
  const resp = await fetch(url, { method: 'GET', cache: 'no-store' });
  if (!resp.ok) throw new Error(`El backend respondió con error ${resp.status}`);
  return resp.text();
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
