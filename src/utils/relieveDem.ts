// ───────────────────────────────────────────────────────────────────────────
// ALTO RELIEVE a partir de un MODELO DE ELEVACIÓN DIGITAL (DEM).
//
// Fuente: «Terrain Tiles» de Mapzen en AWS Open Data (formato Terrarium),
// gratis, sin clave, con CORS. En Colombia se basa en SRTM (~30 m) y otras
// fuentes públicas; detalle nativo hasta el nivel de zoom 15.
//   https://registry.opendata.aws/terrain-tiles/
// Cada píxel trae la altura codificada en RGB:
//   altura (m) = R·256 + G + B/256 − 32768
//
// Con esas alturas se pinta, en el navegador, cada tile:
//  · Tintes hipsométricos (verde en tierras bajas → amarillo → ocres y
//    cafés en cordillera → gris y blanco en los páramos y volcanes), como
//    los mapas físicos de relieve.
//  · Sombreado multidireccional (luz del noroeste, oeste y norte) con
//    exageración vertical, que da el efecto de volumen.
// No cambia la ubicación de nada: es solo el fondo del mapa.
// ───────────────────────────────────────────────────────────────────────────

export const URL_DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const ZOOM_MAX_DEM = 15;
export const ATRIBUCION_DEM = 'Relieve: <a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (Mapzen/AWS, SRTM y otras fuentes)';

export type ModoRelieve = 'color' | 'sombra'; // color = hipsométrico + sombreado; sombra = solo sombreado (para mezclar con satélite)

export interface OpcionesRelieve {
  modo: ModoRelieve;
  exageracion: number; // 1 = real; 2–5 = más marcado
}

// Rampa hipsométrica (metros → color). Ajustada a la región andina del Cauca:
// valles ~1.000 m, Popayán ~1.750 m, páramos >3.200 m, Puracé ~4.600 m.
const RAMPA: [number, [number, number, number]][] = [
  [-50, [168, 211, 236]], // mar
  [0, [86, 160, 80]],
  [500, [110, 176, 84]],
  [1000, [150, 196, 98]],
  [1500, [186, 210, 112]],
  [1900, [214, 214, 128]],
  [2300, [222, 190, 116]],
  [2800, [200, 150, 90]],
  [3300, [170, 112, 72]],
  [3800, [150, 120, 104]],
  [4300, [205, 200, 196]],
  [4700, [250, 250, 250]],
];

function colorAltura(h: number): [number, number, number] {
  if (h <= RAMPA[0][0]) return RAMPA[0][1];
  for (let i = 1; i < RAMPA.length; i++) {
    const [h1, c1] = RAMPA[i];
    if (h <= h1) {
      const [h0, c0] = RAMPA[i - 1];
      const t = (h - h0) / (h1 - h0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMPA[RAMPA.length - 1][1];
}

/** Alturas (m) de un tile Terrarium ya dibujado en un canvas de 256×256. */
export function decodificarTerrarium(datos: Uint8ClampedArray): Float32Array {
  const n = datos.length / 4;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = datos[i * 4] * 256 + datos[i * 4 + 1] + datos[i * 4 + 2] / 256 - 32768;
  return h;
}

/** Metros por píxel en el nivel z y la fila de tile ty (en el centro del tile). */
function metrosPorPixel(z: number, ty: number, tam: number): number {
  const n = Math.PI - (2 * Math.PI * (ty + 0.5)) / Math.pow(2, z);
  const lat = Math.atan(Math.sinh(n));
  return (40075016.686 * Math.cos(lat)) / (Math.pow(2, z) * tam);
}

/**
 * Pinta el relieve de un tile. `alturas` es una matriz tam×tam.
 * Devuelve RGBA listo para putImageData.
 */
export function pintarRelieve(alturas: Float32Array, tam: number, z: number, ty: number, op: OpcionesRelieve): Uint8ClampedArray {
  const mpp = metrosPorPixel(z, ty, tam);
  const salida = new Uint8ClampedArray(tam * tam * 4);
  const ex = op.exageracion;
  // Luces (acimut en grados, peso): multidireccional, dominante del noroeste.
  const luces: [number, number][] = [[315, 0.55], [270, 0.2], [0, 0.15], [225, 0.1]];
  const alt = (40 * Math.PI) / 180;
  const sinAlt = Math.sin(alt), cosAlt = Math.cos(alt);
  const lucesRad = luces.map(([a, w]) => [((360 - a + 90) % 360) * (Math.PI / 180), w] as const);
  const H = (x: number, y: number) => alturas[Math.min(tam - 1, Math.max(0, y)) * tam + Math.min(tam - 1, Math.max(0, x))];
  for (let y = 0; y < tam; y++) {
    for (let x = 0; x < tam; x++) {
      const h = alturas[y * tam + x];
      // Pendiente por diferencias centrales (en los bordes, de un solo lado).
      const x0 = x > 0 ? x - 1 : x, x1 = x < tam - 1 ? x + 1 : x;
      const y0 = y > 0 ? y - 1 : y, y1 = y < tam - 1 ? y + 1 : y;
      const dzdx = ((H(x1, y) - H(x0, y)) / ((x1 - x0) * mpp)) * ex;
      const dzdy = ((H(x, y0) - H(x, y1)) / ((y1 - y0) * mpp)) * ex; // norte positivo
      // Normal de la superficie y luz (modelo de Lambert).
      const nx = -dzdx, ny = -dzdy, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      let sombra = 0;
      for (const [az, w] of lucesRad) {
        const lx = Math.cos(az) * cosAlt, ly = Math.sin(az) * cosAlt, lz = sinAlt;
        sombra += w * Math.max(0, (nx * lx + ny * ly + nz * lz) / nl);
      }
      // sombra ≈ sinAlt en terreno plano; se normaliza para que lo plano quede ~1.
      const s = Math.min(1.25, sombra / sinAlt);
      const i = (y * tam + x) * 4;
      if (op.modo === 'sombra') {
        const g = Math.round(255 * Math.min(1, 0.25 + 0.75 * s));
        salida[i] = g; salida[i + 1] = g; salida[i + 2] = g; salida[i + 3] = 255;
      } else {
        const [r, gg, b] = colorAltura(h);
        const f = 0.42 + 0.62 * s; // contraste del volumen
        const brillo = Math.max(0, s - 1) * 40; // pequeño brillo en laderas iluminadas
        salida[i] = Math.min(255, r * f + brillo);
        salida[i + 1] = Math.min(255, gg * f + brillo);
        salida[i + 2] = Math.min(255, b * f + brillo);
        salida[i + 3] = 255;
      }
    }
  }
  return salida;
}

function urlDem(z: number, x: number, y: number) {
  return URL_DEM.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

// Caché pequeña de alturas (la usan el mapa y la descarga).
const cache = new Map<string, Promise<Float32Array>>();
export function cargarAlturas(z: number, x: number, y: number): Promise<Float32Array> {
  const k = `${z}/${x}/${y}`;
  let p = cache.get(k);
  if (!p) {
    p = new Promise<Float32Array>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          resolve(decodificarTerrarium(ctx.getImageData(0, 0, c.width, c.height).data));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('No se pudo cargar el modelo de elevación.'));
      img.src = urlDem(z, x, y);
    });
    p.catch(() => cache.delete(k));
    cache.set(k, p);
    if (cache.size > 400) cache.delete(cache.keys().next().value as string);
  }
  return p;
}

/** Canvas 256×256 con el relieve pintado del tile z/x/y. */
export async function canvasRelieve(z: number, x: number, y: number, op: OpcionesRelieve): Promise<HTMLCanvasElement> {
  const alturas = await cargarAlturas(z, x, y);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(pintarRelieve(alturas, 256, z, y, op) as unknown as Uint8ClampedArray<ArrayBuffer>, 256, 256), 0, 0);
  return c;
}
