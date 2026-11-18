// Mapa de calor «estilo lámina» para la Microgerencia: la silueta de la
// unidad rellena con una superficie continua verde → amarillo → naranja →
// rojo (igual a la leyenda «Densidad delictiva» de la lámina), sin calles
// ni fondo, con el borde exterior y los límites internos finos.
//
// No reemplaza al mapa de calor del módulo de Georreferenciación (Kernel
// de 200 m): es solo la representación visual para la lámina ejecutiva,
// a escala de toda la unidad, sobre los MISMOS puntos y contornos.

export interface OpcionesMapaLamina {
  feature: any;
  puntos: { lat: number; lon: number }[];
  anillosInternos?: [number, number][][];
  /** Proporción ancho/alto de la caja donde va la imagen. */
  aspecto: number;
  /** Ancho del lienzo en píxeles. */
  ancho?: number;
}

function anillosDe(feature: any): [number, number][][] {
  const salida: [number, number][][] = [];
  const procesar = (g: any) => {
    if (!g) return;
    if (g.type === 'Polygon') for (const a of g.coordinates) salida.push(a);
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) for (const a of p) salida.push(a);
    else if (g.type === 'GeometryCollection') for (const h of g.geometries ?? []) procesar(h);
  };
  if (feature?.type === 'FeatureCollection') for (const f of feature.features ?? []) procesar(f.geometry);
  else if (feature?.type === 'Feature') procesar(feature.geometry);
  else procesar(feature);
  return salida;
}

const mercX = (lon: number) => (lon + 180) / 360;
const mercY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / Math.PI) / 2;
};

// Rampa continua (misma de la leyenda de la lámina).
const RAMPA: [number, [number, number, number]][] = [
  [0, [76, 184, 72]],
  [0.18, [125, 200, 66]],
  [0.4, [214, 226, 60]],
  [0.58, [248, 214, 50]],
  [0.76, [245, 146, 40]],
  [1, [218, 36, 42]],
];
function colorRampa(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMPA.length; i++) {
    const [t1, c1] = RAMPA[i];
    if (v <= t1) {
      const [t0, c0] = RAMPA[i - 1];
      const f = (v - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return RAMPA[RAMPA.length - 1][1];
}

/** Desenfoque gaussiano aproximado (3 pasadas de caja, separable). */
function desenfocar(datos: Float32Array, w: number, h: number, sigma: number) {
  const radio = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  const tmp = new Float32Array(datos.length);
  const pasada = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h, m = horizontal ? h : w;
    for (let j = 0; j < m; j++) {
      let suma = 0;
      const at = (i: number) => (horizontal ? j * w + i : i * w + j);
      for (let i = -radio; i <= radio; i++) suma += src[at(Math.min(n - 1, Math.max(0, i)))];
      for (let i = 0; i < n; i++) {
        dst[at(i)] = suma / (2 * radio + 1);
        suma += src[at(Math.min(n - 1, i + radio + 1))] - src[at(Math.max(0, i - radio))];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pasada(datos, tmp, true);
    pasada(tmp, datos, false);
  }
}

export async function generarMapaCalorLamina({ feature, puntos, anillosInternos = [], aspecto, ancho = 1100 }: OpcionesMapaLamina): Promise<string> {
  const anillos = anillosDe(feature).filter((a) => a.length > 2);
  if (anillos.length === 0) throw new Error('Sin geometría para el mapa.');

  // Encuadre (Mercator) con poco aire, ajustado a la proporción de la caja.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const a of anillos) for (const [lon, lat] of a) {
    const x = mercX(lon), y = mercY(lat);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const mx = (x1 - x0) * 0.035 || 1e-6, my = (y1 - y0) * 0.035 || 1e-6;
  x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  let w = x1 - x0, h = y1 - y0;
  if (w / h < aspecto) { const extra = (h * aspecto - w) / 2; x0 -= extra; x1 += extra; w = x1 - x0; }
  else { const extra = (w / aspecto - h) / 2; y0 -= extra; y1 += extra; h = y1 - y0; }

  const W = Math.round(ancho);
  const H = Math.round(ancho / aspecto);
  const aPx = (lon: number, lat: number): [number, number] => [((mercX(lon) - x0) / w) * W, ((mercY(lat) - y0) / h) * H];

  const lienzo = document.createElement('canvas');
  lienzo.width = W; lienzo.height = H;
  const ctx = lienzo.getContext('2d')!;
  const trazar = (lista: [number, number][][]) => {
    ctx.beginPath();
    for (const a of lista) {
      a.forEach(([lon, lat], i) => { const [x, y] = aPx(lon, lat); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath();
    }
  };

  // Superficie de densidad en una grilla reducida.
  const GW = 260;
  const GH = Math.max(40, Math.round(GW / aspecto));
  const grilla = new Float32Array(GW * GH);
  let usados = 0;
  for (const p of puntos) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const [px, py] = aPx(p.lon, p.lat);
    const gx = (px / W) * GW, gy = (py / H) * GH;
    if (gx < 0 || gy < 0 || gx >= GW - 1 || gy >= GH - 1) continue;
    const ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    grilla[iy * GW + ix] += (1 - fx) * (1 - fy);
    grilla[iy * GW + ix + 1] += fx * (1 - fy);
    grilla[(iy + 1) * GW + ix] += (1 - fx) * fy;
    grilla[(iy + 1) * GW + ix + 1] += fx * fy;
    usados++;
  }

  // Ancho de banda proporcional al tamaño de la silueta (no al lienzo).
  let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  for (const a of anillos) for (const [lon, lat] of a) {
    const [x, y] = aPx(lon, lat);
    if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y;
  }
  const ladoSilueta = Math.max(1, Math.min(sx1 - sx0, sy1 - sy0)) * (GW / W);
  desenfocar(grilla, GW, GH, Math.max(1.6, ladoSilueta * 0.045));

  const valores = Array.from(grilla).filter((v) => v > 1e-6).sort((a, b) => a - b);
  const techo = valores.length ? valores[Math.min(valores.length - 1, Math.floor(valores.length * 0.995))] : 1;
  const chico = document.createElement('canvas');
  chico.width = GW; chico.height = GH;
  const cctx = chico.getContext('2d')!;
  const img = cctx.createImageData(GW, GH);
  for (let i = 0; i < grilla.length; i++) {
    const t = usados > 0 && techo > 0 ? Math.pow(Math.min(1, grilla[i] / techo), 0.62) : 0;
    const [r, g, b] = colorRampa(t);
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  cctx.putImageData(img, 0, 0);

  ctx.save();
  trazar(anillos);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(chico, 0, 0, W, H);
  ctx.restore();

  const k = W / 600;
  ctx.lineJoin = 'round';
  if (anillosInternos.length > 0) {
    trazar(anillosInternos);
    ctx.strokeStyle = 'rgba(30,40,38,0.55)';
    ctx.lineWidth = 0.9 * k;
    ctx.stroke();
  }
  trazar(anillos);
  ctx.strokeStyle = '#1f2d2a';
  ctx.lineWidth = 1.7 * k;
  ctx.stroke();

  return lienzo.toDataURL('image/png');
}
