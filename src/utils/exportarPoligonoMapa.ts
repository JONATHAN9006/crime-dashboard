// Exportador AISLADO del polígono seleccionado (Estación/CAI/Zona de
// Atención) con su mapa de calor Y las calles reales — construido
// dibujando directamente sobre un lienzo nuevo. Usa proyección Web
// Mercator (la MISMA que usan las tiles de calles de OpenStreetMap) para
// que las calles, el polígono y el mapa de calor calcen exactamente en la
// misma posición — no una proyección aproximada distinta a la de las
// tiles.
import { calcularKernelDensidad, type PuntoDensidad } from './kernelDensity';

export interface PuntoParaMapaCalor {
  lat: number;
  lon: number;
  delitoCorto?: string | null;
}

const ANCHO_LIENZO = 1200; // px — el alto sale solo, según la proporción Web Mercator real del área
const TAMANO_TILE = 256;

function extraerAnillos(feature: any): [number, number][][] {
  const anillos: [number, number][][] = [];
  function procesar(geom: any) {
    if (!geom) return;
    if (geom.type === 'Polygon') for (const anillo of geom.coordinates) anillos.push(anillo);
    else if (geom.type === 'MultiPolygon') for (const poligono of geom.coordinates) for (const anillo of poligono) anillos.push(anillo);
  }
  if (feature?.type === 'FeatureCollection') for (const f of feature.features || []) procesar(f.geometry);
  else procesar(feature?.geometry);
  return anillos;
}

// Proyección Web Mercator NORMALIZADA (0 a 1 en cada eje) — la misma
// fórmula que usa cualquier mapa de calles (OSM, Google Maps, etc.).
function lonAMercatorX(lon: number): number {
  return (lon + 180) / 360;
}
function latAMercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2;
}

function cargarImagen(url: string, conCors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (conCors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export async function exportarPoligonoAislado(opciones: {
  feature: any;
  puntos: PuntoParaMapaCalor[];
  colores: string[];
  etiquetas: string[];
  nombreArchivo: string;
  opacidadPoligono?: number;
  opacidadCalor?: number;
  opacidadEtiquetas?: number;
  colorBorde?: string;
  alPortapapeles?: boolean;
}): Promise<void> {
  const { feature, puntos, colores, etiquetas, nombreArchivo, opacidadPoligono = 0.08, opacidadCalor = 0.8, opacidadEtiquetas = 1, colorBorde = '#000000', alPortapapeles = false } = opciones;

  const anillos = extraerAnillos(feature);
  if (anillos.length === 0) throw new Error('El polígono seleccionado no tiene geometría válida para exportar.');

  const todosLosPuntosAnillo = anillos.flat();
  const minLon = Math.min(...todosLosPuntosAnillo.map((p) => p[0]));
  const maxLon = Math.max(...todosLosPuntosAnillo.map((p) => p[0]));
  const minLat = Math.min(...todosLosPuntosAnillo.map((p) => p[1]));
  const maxLat = Math.max(...todosLosPuntosAnillo.map((p) => p[1]));

  const margenLon = (maxLon - minLon) * 0.08 || 0.001;
  const margenLat = (maxLat - minLat) * 0.08 || 0.001;
  const loLon = minLon - margenLon, hiLon = maxLon + margenLon;
  const loLat = minLat - margenLat, hiLat = maxLat + margenLat;

  const mercLoX = lonAMercatorX(loLon), mercHiX = lonAMercatorX(hiLon);
  const mercLoY = latAMercatorY(hiLat), mercHiY = latAMercatorY(loLat);
  const anchoMerc = mercHiX - mercLoX;
  const altoMerc = mercHiY - mercLoY;

  const alto = Math.max(1, Math.round(ANCHO_LIENZO * (altoMerc / anchoMerc)));

  function lonAX(lon: number): number {
    return ((lonAMercatorX(lon) - mercLoX) / anchoMerc) * ANCHO_LIENZO;
  }
  function latAY(lat: number): number {
    return ((latAMercatorY(lat) - mercLoY) / altoMerc) * alto;
  }

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO_LIENZO;
  canvas.height = alto;
  const ctx = canvas.getContext('2d')!;

  function trazarAnillosComoRuta() {
    ctx.beginPath();
    for (const anillo of anillos) {
      if (anillo.length === 0) continue;
      ctx.moveTo(lonAX(anillo[0][0]), latAY(anillo[0][1]));
      for (let i = 1; i < anillo.length; i++) ctx.lineTo(lonAX(anillo[i][0]), latAY(anillo[i][1]));
      ctx.closePath();
    }
  }

  // 1) CALLES REALES — recortadas al polígono con ctx.clip() antes de
  // dibujar nada más.
  const zoom = Math.max(13, Math.min(18, Math.floor(Math.log2(ANCHO_LIENZO / (anchoMerc * TAMANO_TILE)))));
  const escalaMundo = Math.pow(2, zoom);
  const txMin = Math.floor(mercLoX * escalaMundo);
  const txMax = Math.floor(mercHiX * escalaMundo);
  const tyMin = Math.floor(mercLoY * escalaMundo);
  const tyMax = Math.floor(mercHiY * escalaMundo);

  ctx.save();
  trazarAnillosComoRuta();
  ctx.clip();
  try {
    const tareasTiles: Promise<void>[] = [];
    for (let tx = txMin; tx <= txMax; tx++) {
      for (let ty = tyMin; ty <= tyMax; ty++) {
        const subdominio = ['a', 'b', 'c'][(tx + ty) % 3];
        const url = `https://${subdominio}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
        tareasTiles.push(
          cargarImagen(url, true)
            .then((img) => {
              const xIzq = ((tx / escalaMundo - mercLoX) / anchoMerc) * ANCHO_LIENZO;
              const yArriba = ((ty / escalaMundo - mercLoY) / altoMerc) * alto;
              const anchoTile = ((1 / escalaMundo) / anchoMerc) * ANCHO_LIENZO;
              const altoTile = ((1 / escalaMundo) / altoMerc) * alto;
              ctx.drawImage(img, xIzq, yArriba, anchoTile + 0.5, altoTile + 0.5);
            })
            .catch(() => { /* tile puntual falló — se deja transparente ahí y se sigue */ }),
        );
      }
    }
    await Promise.all(tareasTiles);
  } finally {
    ctx.restore();
  }

  // 2) Relleno MUY tenue adicional, encima de las calles.
  trazarAnillosComoRuta();
  ctx.fillStyle = `rgba(17, 103, 98, ${opacidadPoligono})`;
  ctx.fill();

  // 3) Mapa de calor — superficie continua (Kernel Density, Silverman/ArcGIS).
  if (puntos.length > 0) {
    const resultadoKernel = calcularKernelDensidad(puntos as PuntoDensidad[], colores);
    if (resultadoKernel) {
      const img = await cargarImagen(resultadoKernel.dataUrl, false);
      const [[latSur, lonOeste], [latNorte, lonEste]] = resultadoKernel.bounds;
      const x0 = lonAX(lonOeste), x1 = lonAX(lonEste);
      const y0 = latAY(latNorte), y1 = latAY(latSur);

      ctx.save();
      trazarAnillosComoRuta();
      ctx.clip();
      ctx.globalAlpha = opacidadCalor;
      ctx.drawImage(img, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // 4) Borde del polígono, sin recorte.
  trazarAnillosComoRuta();
  ctx.strokeStyle = colorBorde;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 5) Etiqueta — esquina con menos densidad de calor pintada ahí.
  if (etiquetas.length > 0) {
    const tamanoFuente = 15;
    const alturaLinea = 21;
    const paddingX = 14, paddingY = 10, margenCaja = 16;
    ctx.font = `bold ${tamanoFuente}px Arial`;
    const anchoCaja = Math.max(...etiquetas.map((t) => ctx.measureText(t).width)) + paddingX * 2;
    const altoCaja = paddingY * 2 + alturaLinea * etiquetas.length;

    const candidatas = [
      { x: margenCaja, y: margenCaja },
      { x: canvas.width - anchoCaja - margenCaja, y: margenCaja },
      { x: margenCaja, y: canvas.height - altoCaja - margenCaja },
      { x: canvas.width - anchoCaja - margenCaja, y: canvas.height - altoCaja - margenCaja },
    ];

    function densidadPromedioEn(x: number, y: number, ancho: number, alto2: number): number {
      const xi = Math.max(0, Math.floor(x)), yi = Math.max(0, Math.floor(y));
      const anchoReal = Math.min(ancho, canvas.width - xi);
      const altoReal = Math.min(alto2, canvas.height - yi);
      if (anchoReal <= 0 || altoReal <= 0) return Infinity;
      const datos = ctx.getImageData(xi, yi, anchoReal, altoReal).data;
      let suma = 0;
      for (let i = 3; i < datos.length; i += 4) suma += datos[i];
      return suma / (anchoReal * altoReal);
    }

    let mejor = candidatas[0];
    let mejorDensidad = Infinity;
    for (const c of candidatas) {
      const d = densidadPromedioEn(c.x, c.y, anchoCaja, altoCaja);
      if (d < mejorDensidad) {
        mejorDensidad = d;
        mejor = c;
      }
    }

    ctx.globalAlpha = opacidadEtiquetas;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(mejor.x, mejor.y, anchoCaja, altoCaja);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    etiquetas.forEach((texto, i) => {
      ctx.fillText(texto, mejor.x + paddingX, mejor.y + paddingY + alturaLinea * i + alturaLinea / 2);
    });
    ctx.globalAlpha = 1;
  }

  if (alPortapapeles) {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No fue posible generar la imagen para copiarla al portapapeles.');
    if (!navigator.clipboard || !('write' in navigator.clipboard)) {
      throw new Error('Este navegador no permite copiar imágenes al portapapeles — usa "Descargar imagen" en su lugar.');
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return;
  }

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (err) {
    console.error('[exportarPoligonoAislado] El lienzo quedó bloqueado (canvas "tainted") — probablemente por las tiles de calles:', err);
    throw new Error('No fue posible generar la imagen (el lienzo quedó bloqueado). Revisa la consola (F12) para más detalle.');
  }
  const enlace = document.createElement('a');
  enlace.download = `${nombreArchivo}.png`;
  enlace.href = dataUrl;
  enlace.click();
}
