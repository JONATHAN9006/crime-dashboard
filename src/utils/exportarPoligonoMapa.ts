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

export interface OpcionesPoligonoAislado {
  feature: any;
  puntos: PuntoParaMapaCalor[];
  colores: (string | null)[];
  etiquetas: string[];
  gruposEtiquetas?: { titulo: string; lineas: string[] }[]; // varias cajas separadas (ej. una por año); si se pasa, tiene prioridad sobre "etiquetas"
  opacidadPoligono?: number;
  opacidadCalor?: number;
  opacidadEtiquetas?: number;
  colorBorde?: string;
  anillosInternos?: [number, number][][];
  anchoLienzo?: number; // más chico = más rápido (ideal para miniaturas de vista previa)
  tamanoFuenteBase?: number; // tamaño de referencia a 1200px de ancho (por defecto 15)
  margen?: number; // margen alrededor del polígono, como fracción de su ancho/alto (por defecto 0.08); 0 = recorte exacto, sin nada sobresaliendo
}

// Núcleo compartido: dibuja el polígono + calles + mapa de calor + etiqueta
// en un lienzo nuevo y lo devuelve — SIN decidir qué hacer con el
// resultado (eso lo deciden las funciones de más abajo: descargar, copiar
// al portapapeles, o generar una miniatura de vista previa).
export async function generarCanvasPoligonoAislado(opciones: OpcionesPoligonoAislado): Promise<HTMLCanvasElement> {
  const { feature, puntos, colores, etiquetas, gruposEtiquetas = [], opacidadPoligono = 0.08, opacidadCalor = 0.8, opacidadEtiquetas = 1, colorBorde = '#000000', anillosInternos = [], anchoLienzo = 1200, tamanoFuenteBase = 15 } = opciones;

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

  const alto = Math.max(1, Math.round(anchoLienzo * (altoMerc / anchoMerc)));

  function lonAX(lon: number): number {
    return ((lonAMercatorX(lon) - mercLoX) / anchoMerc) * anchoLienzo;
  }
  function latAY(lat: number): number {
    return ((latAMercatorY(lat) - mercLoY) / altoMerc) * alto;
  }

  const canvas = document.createElement('canvas');
  canvas.width = anchoLienzo;
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

  // Fondo neutro — SOLO dentro del polígono (recortado, igual que las
  // calles de abajo), para el caso de que una calle puntual no llegara a
  // cargar. Antes se pintaba en TODO el lienzo, sin recortar — así,
  // cualquier hueco entre el polígono y el borde del lienzo (o entre dos
  // polígonos separados, si la capa incluye territorios lejanos) se veía
  // como un bloque beige sólido en vez de transparente. Ahora, fuera del
  // polígono, el lienzo queda genuinamente transparente.
  ctx.save();
  trazarAnillosComoRuta();
  ctx.clip();
  ctx.fillStyle = '#e5e3df';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 1) CALLES REALES — recortadas al polígono con ctx.clip() antes de
  // dibujar nada más.
  //
  // El zoom se calcula SIEMPRE según el área real a cubrir — antes tenía
  // un mínimo forzado de 13, pensado para zonas pequeñas (un CAI, un
  // cuadrante). Para un área mucho más grande (el mapa general, que puede
  // cubrir toda la ciudad), ese mínimo obligaba a pedir muchísimas más
  // calles ("tiles") de las que en realidad hacían falta para el tamaño
  // de la imagen — cientos, en vez de una docena — y esa sobrecarga de
  // peticiones simultáneas terminaba dejando la mayoría sin cargar
  // (silenciosamente, cada una queda transparente si falla), por lo que
  // en la imagen final solo se veían los bordes de los polígonos, sin
  // calles ni mapa de calor debajo. Ahora el zoom se ajusta al tamaño
  // real del área — una zona pequeña sigue pidiendo el mismo detalle de
  // siempre, y una zona grande pide menos tiles, pero más grandes, en vez
  // de miles de tiles diminutos.
  const zoom = Math.max(3, Math.min(18, Math.floor(Math.log2(anchoLienzo / (anchoMerc * TAMANO_TILE)))));
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
              const xIzq = ((tx / escalaMundo - mercLoX) / anchoMerc) * anchoLienzo;
              const yArriba = ((ty / escalaMundo - mercLoY) / altoMerc) * alto;
              const anchoTile = ((1 / escalaMundo) / anchoMerc) * anchoLienzo;
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

  // 4b) Límites internos (ej. cuadrantes dentro de una estación o CAI, o
  // las capas administrativas cargadas para el mapa general). Se envuelve
  // en try/catch a propósito: esto se dibuja DESPUÉS de las calles y el
  // mapa de calor, que ya quedaron listos en el canvas — si una geometría
  // rara acá fallara, no debe borrar ni impedir lo que ya se dibujó antes.
  if (anillosInternos.length > 0) {
    try {
      ctx.beginPath();
      for (const anillo of anillosInternos) {
        if (anillo.length === 0) continue;
        ctx.moveTo(lonAX(anillo[0][0]), latAY(anillo[0][1]));
        for (let i = 1; i < anillo.length; i++) ctx.lineTo(lonAX(anillo[i][0]), latAY(anillo[i][1]));
        ctx.closePath();
      }
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.stroke();
    } catch (e) {
      console.warn('[exportarPoligonoMapa] No se pudieron dibujar los límites internos, se sigue sin ellos:', e);
    }
  }

  // 5) Etiqueta(s) — esquina con menos densidad de calor pintada ahí.
  // "gruposEtiquetas" dibuja VARIAS cajas separadas y apiladas (ej. una por
  // año: 2023, 2024, 2025 cada una aparte) en vez de una sola caja con
  // todo mezclado; si no se pasa, se usa "etiquetas" como una sola caja
  // (comportamiento de siempre, para CAI/zona que no lo necesitan).
  const grupos = gruposEtiquetas.length > 0 ? gruposEtiquetas : (etiquetas.length > 0 ? [{ titulo: '', lineas: etiquetas }] : []);
  if (grupos.length > 0) {
    const tamanoFuente = Math.max(9, Math.round(tamanoFuenteBase * (anchoLienzo / 1200)));
    const tamanoFuenteTitulo = Math.round(tamanoFuente * 1.05);
    const alturaLinea = Math.round(tamanoFuente * 1.4);
    const paddingX = Math.round(tamanoFuente * 0.7), paddingY = Math.round(tamanoFuente * 0.5), margenCaja = 16, espacioEntreCajas = 8;
    ctx.font = `bold ${tamanoFuente}px Arial`;

    const cajas = grupos.map((g) => {
      const lineasConTitulo = g.titulo ? [g.titulo, ...g.lineas] : g.lineas;
      const ancho = Math.max(...lineasConTitulo.map((t) => ctx.measureText(t).width)) + paddingX * 2;
      const alto = paddingY * 2 + alturaLinea * lineasConTitulo.length;
      return { lineasConTitulo, ancho, alto };
    });
    const anchoCaja = Math.max(...cajas.map((c) => c.ancho));
    const altoTotal = cajas.reduce((suma, c) => suma + c.alto, 0) + espacioEntreCajas * (cajas.length - 1);

    const candidatas = [
      { x: margenCaja, y: margenCaja },
      { x: canvas.width - anchoCaja - margenCaja, y: margenCaja },
      { x: margenCaja, y: canvas.height - altoTotal - margenCaja },
      { x: canvas.width - anchoCaja - margenCaja, y: canvas.height - altoTotal - margenCaja },
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
      const d = densidadPromedioEn(c.x, c.y, anchoCaja, altoTotal);
      if (d < mejorDensidad) {
        mejorDensidad = d;
        mejor = c;
      }
    }

    ctx.globalAlpha = opacidadEtiquetas;
    let yActual = mejor.y;
    for (const caja of cajas) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(mejor.x, yActual, anchoCaja, caja.alto);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      caja.lineasConTitulo.forEach((texto, i) => {
        ctx.fillText(texto, mejor.x + paddingX, yActual + paddingY + alturaLinea * i + alturaLinea / 2);
      });
      yActual += caja.alto + espacioEntreCajas;
    }
    ctx.globalAlpha = 1;
  }

  return canvas;
}

// Descarga el PNG (o lo copia al portapapeles) — construido sobre el mismo
// núcleo de arriba.
export async function exportarPoligonoAislado(opciones: OpcionesPoligonoAislado & { nombreArchivo: string; alPortapapeles?: boolean }): Promise<void> {
  const canvas = await generarCanvasPoligonoAislado(opciones);

  if (opciones.alPortapapeles) {
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
  enlace.download = `${opciones.nombreArchivo}.png`;
  enlace.href = dataUrl;
  enlace.click();
}

// Genera SOLO el data URL (para usarlo como miniatura de vista previa, ej.
// <img src={...}/>) — usa un lienzo más chico por defecto para que
// generar varias miniaturas a la vez (una por CAI) no sea lento.
export async function generarDataUrlPoligonoAislado(opciones: OpcionesPoligonoAislado): Promise<string> {
  const canvas = await generarCanvasPoligonoAislado({ anchoLienzo: 420, ...opciones });
  return canvas.toDataURL('image/png');
}
