// Exportador AISLADO del polígono seleccionado (Estación/CAI/Zona de
// Atención) con su mapa de calor — construido dibujando directamente sobre
// un lienzo nuevo, SIN capturar pantalla (nada de html2canvas). Después de
// varios intentos fallidos capturando el DOM de Leaflet (paneles internos
// inflados, colores modernos de Tailwind que rompían el parser, coordenadas
// que no coincidían), esta es la vía confiable: se conoce exactamente la
// geometría del polígono y de la cuadrícula de calor, así que se proyectan
// a píxeles con matemáticas propias y se dibujan una por una. El fondo del
// lienzo es transparente por naturaleza (nunca se rellena) — todo lo que
// quede fuera del polígono simplemente nunca se pinta.
export interface PuntoParaMapaCalor {
  lat: number;
  lon: number;
  delitoCorto?: string | null;
}

const ANCHO_LIENZO = 1000; // px — el alto sale solo, según la proporción real del polígono

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

export async function exportarPoligonoAislado(opciones: {
  feature: any; // GeoJSON Feature o FeatureCollection del polígono ya seleccionado
  puntos: PuntoParaMapaCalor[]; // puntos YA filtrados (por delito, fecha, etc.) — nunca se recalculan aquí
  colores: string[]; // 5 clases, de menor a mayor densidad
  etiquetas: string[]; // líneas de texto ya armadas (nombre de zona, delito(s) y total)
  nombreArchivo: string;
  ladoCeldaMetros?: number;
  opacidadPoligono?: number; // 0 a 1
  opacidadCalor?: number; // 0 a 1
  colorBorde?: string;
}): Promise<void> {
  const { feature, puntos, colores, etiquetas, nombreArchivo, ladoCeldaMetros = 250, opacidadPoligono = 0.15, opacidadCalor = 0.75, colorBorde = '#000000' } = opciones;

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
  const correccionLon = Math.cos((latProm * Math.PI) / 180); // 1° de longitud "pesa" menos que 1° de latitud, salvo en el ecuador
  const anchoGeografico = (hiLon - loLon) * correccionLon;
  const altoGeografico = hiLat - loLat;
  const alto = Math.max(1, Math.round(ANCHO_LIENZO * (altoGeografico / anchoGeografico)));

  function lonAX(lon: number): number {
    return ((lon - loLon) / (hiLon - loLon)) * ANCHO_LIENZO;
  }
  function latAY(lat: number): number {
    return (1 - (lat - loLat) / (hiLat - loLat)) * alto; // se invierte: la latitud crece hacia arriba, el eje Y del lienzo crece hacia abajo
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

  // 2) Mapa de calor — cuadrícula de conteo real (mismo método que ya usa
  // el mapa en pantalla: celdas de "ladoCeldaMetros", 5 clases fijas de
  // color, nunca degradado) — recortada al polígono con ctx.clip(), así
  // ninguna celda se pinta por fuera de su forma.
  if (puntos.length > 0) {
    ctx.save();
    trazarAnillosComoRuta();
    ctx.clip();

    const metrosPorGradoLat = 111320;
    const metrosPorGradoLon = 111320 * correccionLon;
    const altoCeldaGrados = ladoCeldaMetros / metrosPorGradoLat;
    const anchoCeldaGrados = ladoCeldaMetros / metrosPorGradoLon;

    const conteoPorCelda = new Map<string, number>();
    for (const p of puntos) {
      const fila = Math.floor(p.lat / altoCeldaGrados);
      const col = Math.floor(p.lon / anchoCeldaGrados);
      const clave = `${fila}:${col}`;
      conteoPorCelda.set(clave, (conteoPorCelda.get(clave) ?? 0) + 1);
    }
    const maxCasosCelda = Math.max(...conteoPorCelda.values(), 1);

    ctx.globalAlpha = opacidadCalor;
    for (const [clave, casos] of conteoPorCelda) {
      const [filaStr, colStr] = clave.split(':');
      const fila = Number(filaStr), col = Number(colStr);
      const sur = fila * altoCeldaGrados, norte = sur + altoCeldaGrados;
      const oeste = col * anchoCeldaGrados, este = oeste + anchoCeldaGrados;
      const indiceColor = Math.min(colores.length - 1, Math.floor((casos / maxCasosCelda) * colores.length));
      ctx.fillStyle = colores[indiceColor];
      const x0 = lonAX(oeste), x1 = lonAX(este);
      const y0 = latAY(norte), y1 = latAY(sur);
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // 3) Borde del polígono, SIN recorte, para que quede nítido encima de todo.
  trazarAnillosComoRuta();
  ctx.strokeStyle = colorBorde;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 4) Etiquetas — mismo estilo que el resto de descargas del mapa.
  if (etiquetas.length > 0) {
    const tamanoFuente = 15;
    const alturaLinea = 21;
    const paddingX = 14, paddingY = 10, margenCaja = 12;
    ctx.font = `bold ${tamanoFuente}px Arial`;
    const anchoTexto = Math.max(...etiquetas.map((t) => ctx.measureText(t).width));
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(margenCaja, margenCaja, anchoTexto + paddingX * 2, paddingY * 2 + alturaLinea * etiquetas.length);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    etiquetas.forEach((texto, i) => {
      ctx.fillText(texto, margenCaja + paddingX, margenCaja + paddingY + alturaLinea * i + alturaLinea / 2);
    });
  }

  const enlace = document.createElement('a');
  enlace.download = `${nombreArchivo}.png`;
  enlace.href = canvas.toDataURL('image/png');
  enlace.click();
}
