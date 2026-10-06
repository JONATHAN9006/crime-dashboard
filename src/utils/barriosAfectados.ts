import { puntoEnFeatureGeoJSON } from './puntoEnPoligono';

// Barrios más afectados para señalar con flecha en el mapa de calor.
//
// · El CONTEO sale de los mismos registros que ya filtra el panel "Filtros
//   de visualización" del mapa (delito, estación, CAI, zona, fechas…), por
//   el campo Barrio del DB2 — el mismo con el que se arma "Barrios
//   críticos" en el Resumen, así los números coinciden entre pantallas.
// · La UBICACIÓN de la flecha es el punto central (mediana) de los casos
//   de ese barrio que tienen coordenadas — cae justo donde se concentra el
//   calor. Si ese punto quedara fuera del polígono del barrio (barrio de
//   forma irregular) o el barrio no tuviera casos con coordenadas, se usa
//   el centro del polígono del barrio, cuando hay una capa de barrios
//   cargada en el mapa.

export interface FlechaBarrio {
  rango: number; // 1, 2, 3…
  barrio: string;
  // true = barrio agregado a mano por el usuario (se suma al Top N, nunca lo reemplaza).
  manual?: boolean;
  casos: number;
  lat: number;
  lon: number;
  // Dónde va el rótulo (si se fijó, ej. porque el usuario lo arrastró en
  // pantalla). Sin esto, se ubica solo, hacia afuera del grupo.
  rotuloLat?: number;
  rotuloLon?: number;
}

interface RegistroConBarrio {
  barrioHecho: string;
  lat: number | null;
  lon: number | null;
  cantidad?: number;
}

// Valores que NO son un barrio real y nunca se señalan con flecha (no se
// sabe dónde quedan). Se busca DENTRO del texto ya normalizado (sin
// tildes, en mayúsculas), no como texto exacto — así cubre todas las
// variantes: "PENDIENTE POR ASIGNAR", "Barrio pendiente por asignar",
// "SIN ASIGNAR", "NO SE ENCONTRÓ", etc. (antes la comparación era exacta y
// "PENDIENTE POR ASIGNAR" se colaba como si fuera un barrio).
const NO_ES_BARRIO = /PENDIENTE|POR ASIGNAR|SIN ASIGNAR|NO ASIGNAD|NO REPORTAD|SIN REPORTAR|SIN BARRIO|NO SE ENCONTR|NO ENCONTRAD|SIN INFORMACI|NO REGISTRA|SIN DATO|DESCONOCID|INDETERMINAD|^N\/?A$|^[-.\s]*$/;

/** ¿Es un nombre de barrio real (no "Pendiente por asignar", "Sin dato"…)? */
export function esBarrioReal(nombre: unknown): boolean {
  const n = normalizarNombre(nombre);
  return n !== '' && !NO_ES_BARRIO.test(n);
}

export function normalizarNombre(v: unknown): string {
  return String(v ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function mediana(valores: number[]): number {
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Centro aproximado de un polígono (promedio del anillo exterior más grande). */
function centroPoligono(feature: any): { lat: number; lon: number } | null {
  const geom = feature?.geometry;
  if (!geom) return null;
  const poligonos: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let mejor: number[][] | null = null;
  for (const p of poligonos) if (p[0] && (!mejor || p[0].length > mejor.length)) mejor = p[0];
  if (!mejor || mejor.length === 0) return null;
  const lon = mejor.reduce((a, c) => a + c[0], 0) / mejor.length;
  const lat = mejor.reduce((a, c) => a + c[1], 0) / mejor.length;
  return { lat, lon };
}

export function calcularTopBarrios(
  registros: RegistroConBarrio[],
  cantidad: number,
  opciones: { poligonosBarrio?: Map<string, any>; dentroDe?: any; adicionales?: string[] } = {},
): FlechaBarrio[] {
  const { poligonosBarrio, dentroDe, adicionales = [] } = opciones;
  const porBarrio = new Map<string, { nombre: string; casos: number; lats: number[]; lons: number[] }>();
  for (const r of registros) {
    const nombre = String(r.barrioHecho ?? '').trim();
    if (!nombre || NO_ES_BARRIO.test(normalizarNombre(nombre))) continue;
    const tieneCoord = typeof r.lat === 'number' && isFinite(r.lat) && typeof r.lon === 'number' && isFinite(r.lon);
    // En la descarga de una zona/CAI solo cuentan los casos que caen dentro.
    if (dentroDe && (!tieneCoord || !puntoEnFeatureGeoJSON(r.lon as number, r.lat as number, dentroDe))) continue;
    const clave = normalizarNombre(nombre);
    const g = porBarrio.get(clave) ?? { nombre, casos: 0, lats: [], lons: [] };
    g.casos += r.cantidad || 1;
    if (tieneCoord) { g.lats.push(r.lat as number); g.lons.push(r.lon as number); }
    porBarrio.set(clave, g);
  }

  // Dónde apunta la flecha de un barrio: mediana de sus casos (o el centro
  // de su polígono si esa mediana cae fuera o no hay casos con coordenadas).
  const ubicar = (clave: string, g: { lats: number[]; lons: number[] } | undefined): { lat: number; lon: number } | null => {
    const poligono = poligonosBarrio?.get(clave);
    let ubicacion: { lat: number; lon: number } | null = null;
    if (g && g.lats.length > 0) {
      ubicacion = { lat: mediana(g.lats), lon: mediana(g.lons) };
      if (poligono && !puntoEnFeatureGeoJSON(ubicacion.lon, ubicacion.lat, poligono)) {
        ubicacion = centroPoligono(poligono) ?? ubicacion;
      }
    } else if (poligono) {
      ubicacion = centroPoligono(poligono);
      // En la descarga de una zona/CAI, un barrio sin casos dentro solo se
      // señala si su polígono queda dentro de esa zona.
      if (ubicacion && dentroDe && !puntoEnFeatureGeoJSON(ubicacion.lon, ubicacion.lat, dentroDe)) ubicacion = null;
    }
    return ubicacion;
  };

  const resultado: FlechaBarrio[] = [];
  const incluidos = new Set<string>();
  const ordenados = Array.from(porBarrio.entries()).sort((a, b) => b[1].casos - a[1].casos);
  for (const [clave, g] of ordenados) {
    if (resultado.length >= cantidad) break;
    const ubicacion = ubicar(clave, g);
    // Sin coordenadas ni polígono no hay dónde apuntar — se salta y se
    // toma el siguiente barrio, para no dibujar una flecha al vacío.
    if (!ubicacion) continue;
    incluidos.add(clave);
    resultado.push({ rango: resultado.length + 1, barrio: g.nombre, casos: g.casos, ...ubicacion });
  }

  // Barrios agregados a mano: SE SUMAN al Top N (que nunca se oculta ni se
  // reemplaza). Si uno ya está en el Top, no se repite. Sus casos son los
  // de los mismos registros filtrados (pueden ser 0 si con estos filtros
  // no tiene casos; entonces se ubica por su polígono, si hay capa).
  for (const nombre of adicionales) {
    const clave = normalizarNombre(nombre);
    if (!clave || incluidos.has(clave) || NO_ES_BARRIO.test(clave)) continue;
    const g = porBarrio.get(clave);
    const ubicacion = ubicar(clave, g);
    if (!ubicacion) continue;
    incluidos.add(clave);
    resultado.push({ rango: resultado.length + 1, barrio: g?.nombre ?? String(nombre).trim(), casos: g?.casos ?? 0, manual: true, ...ubicacion });
  }
  return resultado;
}

/**
 * Dirección "hacia afuera" de cada flecha (unitaria, en pantalla: x a la
 * derecha, y hacia abajo): desde el centro del grupo de barrios hacia cada
 * barrio, para que los rótulos se abran en abanico y no se monten unos
 * sobre otros. Si un barrio queda justo en el centro, se usa una dirección
 * fija según su puesto.
 */
export function direccionesHaciaAfuera(flechas: { lat: number; lon: number }[]): { x: number; y: number }[] {
  if (flechas.length === 0) return [];
  const cLat = flechas.reduce((a, f) => a + f.lat, 0) / flechas.length;
  const cLon = flechas.reduce((a, f) => a + f.lon, 0) / flechas.length;
  const coseno = Math.cos((cLat * Math.PI) / 180);
  const fijas = [{ x: -0.7, y: -0.7 }, { x: 0.7, y: -0.7 }, { x: -0.7, y: 0.7 }, { x: 0.7, y: 0.7 }, { x: 0, y: -1 }];
  return flechas.map((f, i) => {
    const x = (f.lon - cLon) * coseno;
    const y = -(f.lat - cLat);
    const largo = Math.hypot(x, y);
    if (flechas.length === 1 || largo < 1e-6) return fijas[i % fijas.length];
    // Nunca totalmente horizontal: siempre algo hacia arriba o abajo, para
    // que el rótulo no tape la fila de calor de al lado.
    let ux = x / largo, uy = y / largo;
    if (Math.abs(uy) < 0.35) { uy = uy < 0 ? -0.35 : 0.35; const n = Math.hypot(ux, uy); ux /= n; uy /= n; }
    return { x: ux, y: uy };
  });
}

/** Dibuja flechas + rótulos sobre un canvas (descarga del mapa). */
export function dibujarFlechasBarrios(
  ctx: CanvasRenderingContext2D,
  flechas: FlechaBarrio[],
  aPixel: (lat: number, lon: number) => { x: number; y: number },
  anchoLienzo: number,
  altoLienzo: number,
) {
  const visibles = flechas.map((f) => ({ f, p: aPixel(f.lat, f.lon) })).filter(({ p }) => p.x >= 0 && p.x <= anchoLienzo && p.y >= 0 && p.y <= altoLienzo);
  if (visibles.length === 0) return;
  const dirs = direccionesHaciaAfuera(visibles.map(({ f }) => f));
  const escala = anchoLienzo / 1200;
  const largo = Math.max(60, 95 * escala);
  const tamFuente = Math.max(11, Math.round(15 * escala));
  const grosor = Math.max(2.5, 3.5 * escala);
  const cabeza = Math.max(10, 15 * escala);

  visibles.forEach(({ f, p }, i) => {
    const d = dirs[i];
    // Punto del rótulo: el que se dejó en pantalla (arrastrado o
    // automático) si viene; si no, hacia afuera. Siempre empujado hacia
    // adentro si se sale del lienzo.
    const fijo = f.rotuloLat != null && f.rotuloLon != null ? aPixel(f.rotuloLat, f.rotuloLon) : null;
    let lx = fijo ? fijo.x : p.x + d.x * largo, ly = fijo ? fijo.y : p.y + d.y * largo;
    ctx.font = `bold ${tamFuente}px Arial`;
    const texto = `${f.rango}. ${f.barrio} — ${f.casos.toLocaleString('es-CO')} caso${f.casos === 1 ? '' : 's'}`;
    const anchoCaja = ctx.measureText(texto).width + tamFuente * 1.2;
    const altoCaja = tamFuente * 1.9;
    lx = Math.min(Math.max(lx, anchoCaja / 2 + 4), anchoLienzo - anchoCaja / 2 - 4);
    ly = Math.min(Math.max(ly, altoCaja / 2 + 4), altoLienzo - altoCaja / 2 - 4);

    // Línea desde el rótulo hasta la punta (sin llegar del todo, la cabeza cubre el resto).
    const vx = p.x - lx, vy = p.y - ly;
    const dist = Math.hypot(vx, vy) || 1;
    const ux = vx / dist, uy = vy / dist;
    const baseX = p.x - ux * cabeza, baseY = p.y - uy * cabeza;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = grosor + 3;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(baseX, baseY); ctx.stroke();
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = grosor;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(baseX, baseY); ctx.stroke();
    // Cabeza de flecha.
    const px = -uy * cabeza * 0.55, py = ux * cabeza * 0.55;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(baseX + px, baseY + py);
    ctx.lineTo(baseX - px, baseY - py);
    ctx.closePath();
    ctx.fillStyle = '#b91c1c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();

    // Rótulo.
    const x0 = lx - anchoCaja / 2, y0 = ly - altoCaja / 2;
    const radio = altoCaja / 4;
    ctx.beginPath();
    ctx.moveTo(x0 + radio, y0);
    ctx.arcTo(x0 + anchoCaja, y0, x0 + anchoCaja, y0 + altoCaja, radio);
    ctx.arcTo(x0 + anchoCaja, y0 + altoCaja, x0, y0 + altoCaja, radio);
    ctx.arcTo(x0, y0 + altoCaja, x0, y0, radio);
    ctx.arcTo(x0, y0, x0 + anchoCaja, y0, radio);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = Math.max(1.5, 2 * escala);
    ctx.stroke();
    ctx.fillStyle = '#7f1d1d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, lx, ly + 0.5);
    ctx.textAlign = 'left';
  });
}
