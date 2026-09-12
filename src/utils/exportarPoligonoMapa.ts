// Exportador AISLADO del polígono seleccionado (Estación/CAI/Zona de
// Atención) con su mapa de calor — construido dibujando directamente sobre
// un lienzo nuevo, SIN capturar pantalla (nada de html2canvas). Después de
// varios intentos fallidos capturando el DOM de Leaflet (paneles internos
// inflados, colores modernos de Tailwind que rompían el parser, coordenadas
// que no coincidían), esta es la vía confiable: se conoce exactamente la
// geometría del polígono y de la superficie de densidad, así que se
// proyectan a píxeles con matemáticas propias y se dibujan directamente. El
// fondo del lienzo es transparente por naturaleza (nunca se rellena) —
// todo lo que quede fuera del polígono simplemente nunca se pinta.
import { calcularKernelDensidad, type PuntoDensidad } from './kernelDensity';

export interface PuntoParaMapaCalor {
  lat: number;
  lon: number;
  delitoCorto?: string | null;
}

const ANCHO_LIENZO = 1200; // px — el alto sale solo, según la proporción real del polígono

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

function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function exportarPoligonoAislado(opciones: {
  feature: any; // GeoJSON Feature o FeatureCollection del polígono ya seleccionado
  puntos: PuntoParaMapaCalor[]; // puntos YA filtrados (por delito, fecha, etc.) — nunca se recalculan aquí
  colores: string[]; // 5 clases, de menor a mayor densidad
  etiquetas: string[]; // líneas de texto ya armadas (nombre de zona, delito(s) y total)
  nombreArchivo: string;
  opacidadPoligono?: number; // 0 a 1
  opacidadCalor?: number; // 0 a 1
  colorBorde?: string;
}): Promise<void> {
  const { feature, puntos, colores, etiquetas, nombreArchivo, opacidadPoligono = 0.15, opacidadCalor = 0.8, colorBorde = '#000000' } = opciones;

  const anillos = extraerAnillos(feature);
  if (anillos.length === 0) throw new Error('El polígono seleccionado no tiene geometría válida para exportar.');

  const todosLosPuntosAnillo = anillos.flat();
  const minLon = Math.min(...todosLosPuntosAnillo.map((p) => p[0]));
  const maxLon = Math.max(...todosLosPuntosAnillo.map((p) => p[0]));
  const minLat = Math.min(...todosLosPuntosAnillo.map((p) => p[1]));
  const maxLat = Math.max(...todosLosPuntosAnillo.map((p) => p[1]));

  // Margen alrededor del polígono (8% del tamaño, para que no quede pegado
  // a los bordes de la imagen, tal como se pidió).
  const margenLon = (maxLon - minLon) * 0.08 || 0.001;
  const margenLat = (maxLat - minLat) * 0.08 || 0.001;
  const loLon = minLon - margenLon, hiLon = maxLon + margenLon;
  const loLat = minLat - margenLat, hiLat = maxLat + margenLat;

  const latProm = (minLat + maxLat) / 2;
  const correccionLon = Math.cos((latProm * Math.PI) / 180);
  const anchoGeografico = (hiLon - loLon) * correccionLon;
  const altoGeografico = hiLat - loLat;
  const alto = Math.max(1, Math.round(ANCHO_LIENZO * (altoGeografico / anchoGeografico)));

  function lonAX(lon: number): number {
    return ((lon - loLon) / (hiLon - loLon)) * ANCHO_LIENZO;
  }
  function latAY(lat: number): number {
    return (1 - (lat - loLat) / (hiLat - loLat)) * alto;
  }

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO_LIENZO;
  canvas.height = alto;
  const ctx = canvas.getContext('2d')!;
  // OJO: nunca se rellena el fondo — se deja transparente a propósito.

  function trazarAnillosComoRuta() {
    ctx.beginPath();
    for (const anillo of anillos) {
      if (anillo.length === 0) continue;
      ctx.moveTo(lonAX(anillo[0][0]), latAY(anillo[0][1]));
      for (let i = 1; i < anillo.length; i++) ctx.lineTo(lonAX(anillo[i][0]), latAY(anillo[i][1]));
      ctx.closePath();
    }
  }

  // 1) Relleno tenue del polígono (para que se note el territorio incluso
  // donde no haya casos).
  trazarAnillosComoRuta();
  ctx.fillStyle = `rgba(17, 103, 98, ${opacidadPoligono})`;
  ctx.fill();

  // 2) Mapa de calor — SUPERFICIE CONTINUA (Kernel Density real, el mismo
  // método que ya usa el resto del dashboard — histograma + desenfoque
  // gaussiano, clasificado por fracción del máximo real, nunca una
  // cuadrícula de cuadrados) — recortada al polígono con ctx.clip().
  if (puntos.length > 0) {
    const resultadoKernel = calcularKernelDensidad(puntos as PuntoDensidad[], colores);
    if (resultadoKernel) {
      const img = await cargarImagen(resultadoKernel.dataUrl);
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

  // 3) Borde del polígono, SIN recorte, para que quede nítido encima de todo.
  trazarAnillosComoRuta();
  ctx.strokeStyle = colorBorde;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 4) Etiqueta — posicionamiento INTELIGENTE: se prueban las 4 esquinas
  // (con margen hacia adentro) y se elige la que tenga MENOS densidad de
  // calor pintada ahí (se mide revisando directamente los píxeles ya
  // dibujados en el lienzo) — así el cuadro de texto nunca tapa un
  // hotspot. Nunca se ubica fuera del polígono: las 4 candidatas ya están
  // adentro por construcción (esquinas del rectángulo del polígono,
  // recortadas con margen).
  if (etiquetas.length > 0) {
    const tamanoFuente = 15;
    const alturaLinea = 21;
    const paddingX = 14, paddingY = 10, margenCaja = 16;
    ctx.font = `bold ${tamanoFuente}px Arial`;
    const anchoCaja = Math.max(...etiquetas.map((t) => ctx.measureText(t).width)) + paddingX * 2;
    const altoCaja = paddingY * 2 + alturaLinea * etiquetas.length;

    const candidatas = [
      { x: margenCaja, y: margenCaja }, // superior izquierda
      { x: canvas.width - anchoCaja - margenCaja, y: margenCaja }, // superior derecha
      { x: margenCaja, y: canvas.height - altoCaja - margenCaja }, // inferior izquierda
      { x: canvas.width - anchoCaja - margenCaja, y: canvas.height - altoCaja - margenCaja }, // inferior derecha
    ];

    function densidadPromedioEn(x: number, y: number, ancho: number, alto: number): number {
      const xi = Math.max(0, Math.floor(x)), yi = Math.max(0, Math.floor(y));
      const anchoReal = Math.min(ancho, canvas.width - xi);
      const altoReal = Math.min(alto, canvas.height - yi);
      if (anchoReal <= 0 || altoReal <= 0) return Infinity;
      const datos = ctx.getImageData(xi, yi, anchoReal, altoReal).data;
      let suma = 0;
      for (let i = 3; i < datos.length; i += 4) suma += datos[i]; // canal alfa: a más opaco, más "calor" pintado ahí
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

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(mejor.x, mejor.y, anchoCaja, altoCaja);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    etiquetas.forEach((texto, i) => {
      ctx.fillText(texto, mejor.x + paddingX, mejor.y + paddingY + alturaLinea * i + alturaLinea / 2);
    });
  }

  const enlace = document.createElement('a');
  enlace.download = `${nombreArchivo}.png`;
  enlace.href = canvas.toDataURL('image/png');
  enlace.click();
}
