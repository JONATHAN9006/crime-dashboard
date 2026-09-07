import * as XLSX from 'xlsx';
import { getDb, STORE_PUNTOS } from './db';
import { MAPA_DELITO_IDX, MAPA_ESTACION_IDX, MAPA_BARRIO_IDX, normalizarClave } from './db2Transform';

export interface PuntoGeo {
  lat: number;
  lon: number;
  fila: Record<string, any>; // fila completa original, para el popup y los filtros
  // Delito ya traducido al nombre corto del dashboard (ej. "H. Personas"),
  // calculado una sola vez al cargar la capa — así el resto del código nunca
  // tiene que volver a decidir "a qué corresponde esto".
  delitoCorto: string | null;
  estacionCorta: string | null;
}

export type TipoCapaPuntos = 'irisp1' | 'delitos' | 'generico';

export interface CapaPuntos {
  id: string;
  nombre: string; // "IRISP1" | "Delitos" | lo que sea
  tipo: TipoCapaPuntos;
  archivoNombre: string;
  cargadoPor: string;
  fechaCarga: string; // ISO
  columnas: string[];
  colLat: string | null;
  colLon: string | null;
  colDelito: string | null;
  colEstado: string | null;
  colEstadoExistencia: string | null;
  colDependencia: string | null;
  puntos: PuntoGeo[];
  visible: boolean;
  filtroEstado: string[];
  filtroEstadoExistencia: string[];
  filtroDependencia: string[];
  // Delitos EXTRA que el usuario elige manualmente a mano en esta capa (por
  // su nombre corto), para verlos en el mapa aunque no exista ese delito
  // como opción en el filtro principal del dashboard (ej. "Receptación").
  // Se SUMAN a lo que ya coincide por el filtro principal — nunca lo
  // reemplazan ni afectan ningún otro componente del dashboard.
  filtroDelitoPropio: string[];
}

// --- Lectura del Excel a filas crudas -------------------------------------

export async function leerExcelComoFilas(file: File): Promise<{ filas: Record<string, any>[]; columnas: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'dd"/"mm"/"yyyy' });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<any[]>(hoja, { header: 1, defval: '' });

  let filaEncabezado = 0;
  for (let i = 0; i < Math.min(matriz.length, 5); i++) {
    const noVacias = (matriz[i] || []).filter((c) => String(c).trim() !== '').length;
    if (noVacias > 1) { filaEncabezado = i; break; }
  }

  const columnas = (matriz[filaEncabezado] || []).map((c) => String(c).trim()).filter(Boolean);
  const filas = XLSX.utils.sheet_to_json<Record<string, any>>(hoja, { range: filaEncabezado, defval: '' });
  return { filas, columnas };
}

// --- Detección automática de columnas (heurística, con respaldo manual) --

const PATRONES: Record<string, RegExp[]> = {
  lat: [/^latitud$/i, /^lat$/i, /latitud|latitude/i],
  lon: [/^longitud$/i, /^lon(g)?$/i, /longitud|longitude|^lng$/i],
  delito: [/^delito principal$/i, /^delito$/i, /delito/i, /conducta|tipolog/i],
  estado: [/^estado$/i],
  estadoExistencia: [/estado.*existencia|existencia.*estado/i],
  dependencia: [/^dependencia$/i, /^estacion$/i, /dependenc/i, /^unidad$/i, /estaci[oó]n|seccional/i],
};

export function detectarColumna(columnas: string[], tipo: keyof typeof PATRONES): string | null {
  for (const patron of PATRONES[tipo]) {
    const encontrada = columnas.find((c) => patron.test(c.trim()));
    if (encontrada) return encontrada;
  }
  return null;
}

// Detecta automáticamente si el archivo es "IRISP1" (trae "Delito Principal",
// "Estado Existencia") o "Delitos" (trae el mismo vocabulario crudo que el
// DB2: "DELITO", "ESTACION", "BARRIO_HECHO") — para elegir la estrategia de
// mapeo correcta sin que el usuario tenga que decirlo.
export function detectarTipoCapa(columnas: string[]): TipoCapaPuntos {
  const set = new Set(columnas.map((c) => c.trim().toUpperCase()));
  if (set.has('DELITO PRINCIPAL') || set.has('ESTADO EXISTENCIA')) return 'irisp1';
  if (set.has('DELITO') && (set.has('BARRIO_HECHO') || set.has('ESTACION'))) return 'delitos';
  return 'generico';
}

export function parseCoordenada(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const limpio = String(v).trim().replace(',', '.');
  const n = parseFloat(limpio);
  return isNaN(n) ? null : n;
}

// --- Traducción de Delito/Estación al nombre corto del dashboard ----------

function normalizarTexto(v: unknown): string {
  return String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// IRISP1 trae el texto largo del artículo penal (ej. "ARTICULO 239. HURTO
// PERSONAS"). Esta tabla se construyó a partir de los 9 valores REALES vistos
// en el archivo revisado — incluye tanto los que ya existen como categoría en
// el dashboard, como los que NO existen ahí (Receptación, Tráfico de
// Estupefacientes, H. Entidades Financieras) y por eso necesitan su propio
// nombre corto para poder seleccionarse en el mapa.
const ETIQUETAS_IRISP: Record<string, string> = {
  'ARTICULO 111. LESIONES PERSONALES': 'L. Personales',
  'ARTICULO 239. HURTO AUTOMOTORES': 'H. Automotores',
  'ARTICULO 239. HURTO ENTIDADES COMERCIALES': 'H. Entidades Comerciales',
  'ARTICULO 239. HURTO ENTIDADES FINANCIERAS': 'H. Entidades Financieras',
  'ARTICULO 239. HURTO MOTOCICLETAS': 'H. Motos',
  'ARTICULO 239. HURTO PERSONAS': 'H. Personas',
  'ARTICULO 239. HURTO RESIDENCIAS': 'H. Residencias',
  // Ojo: el archivo real trae "ARTICILOS" (sin la U) — es un error de tipeo
  // en el sistema origen, no un valor distinto; se deja tal cual viene.
  'ARTICULO 327 C. RECEPTACION CON BASE A LOS ARTICILOS 327 A Y B': 'Receptación',
  'ARTICULO 376. TRAFICO, FABRICACION O PORTE DE ESTUPEFACIENTES': 'Tráfico de Estupefacientes',
};

// Si aparece un valor de IRISP1 que no está en la tabla de arriba (un delito
// nuevo que no se había visto), en vez de mostrar el texto legal completo se
// arma un nombre corto razonable quitando el "ARTICULO ###." del inicio.
function etiquetaCortaGenerica(valorCrudo: string): string {
  const sinArticulo = valorCrudo.replace(/^ART[IÍ]CULO\s+[\dA-Z]+\.?\s*/i, '').trim();
  const base = sinArticulo || valorCrudo;
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}

// Traduce el valor crudo de Delito Principal (IRISP1) o DELITO (Delitos) al
// nombre corto que usa el dashboard — con la estrategia correcta según el
// tipo de capa: coincidencia EXACTA (misma tabla que usa el DB2) para
// "Delitos", y la tabla curada de arriba (con respaldo genérico) para IRISP1.
export function delitoCorto(valorCrudo: string, tipo: TipoCapaPuntos): string {
  if (!valorCrudo) return 'NO REPORTADO';
  if (tipo === 'delitos') {
    return MAPA_DELITO_IDX[normalizarClave(valorCrudo)] ?? etiquetaCortaGenerica(valorCrudo);
  }
  return ETIQUETAS_IRISP[normalizarTexto(valorCrudo)] ?? etiquetaCortaGenerica(valorCrudo);
}

export function estacionCorta(valorCrudo: string, tipo: TipoCapaPuntos): string | null {
  if (!valorCrudo) return null;
  if (tipo === 'delitos') return MAPA_ESTACION_IDX[normalizarClave(valorCrudo)] ?? null;
  // Para IRISP1 la "Dependencia" es un texto largo tipo "ESTACION DE POLICIA
  // NORTE POPAYAN - MEPOY" — se resuelve por palabra clave en
  // dependenciasIrispEquivalentes más abajo, no aquí.
  return null;
}

export function construirPuntos(
  filas: Record<string, any>[],
  colLat: string,
  colLon: string,
  colDelito: string | null,
  tipo: TipoCapaPuntos,
  colDependencia: string | null,
): PuntoGeo[] {
  const puntos: PuntoGeo[] = [];
  for (const fila of filas) {
    const lat = parseCoordenada(fila[colLat]);
    const lon = parseCoordenada(fila[colLon]);
    if (lat === null || lon === null) continue;
    if (lat < -4.5 || lat > 13.5 || lon < -82 || lon > -66.5) continue;
    const delitoCrudo = colDelito ? String(fila[colDelito] ?? '') : '';
    const dependenciaCruda = colDependencia ? String(fila[colDependencia] ?? '') : '';
    puntos.push({
      lat, lon, fila,
      delitoCorto: colDelito ? delitoCorto(delitoCrudo, tipo) : null,
      estacionCorta: colDependencia ? estacionCorta(dependenciaCruda, tipo) : null,
    });
  }
  return puntos;
}

// --- Cruce por palabra clave (para IRISP1, cuyo texto es libre) ----------

const PALABRAS_CLAVE_DELITO: Record<string, string[]> = {
  'H. PERSONAS': ['HURTO PERSONAS'],
  'H. RESIDENCIAS': ['HURTO RESIDENCIAS'],
  'H. MOTOS': ['HURTO MOTOCICLETAS', 'HURTO MOTOS'],
  'H. AUTOMOTORES': ['HURTO AUTOMOTORES'],
  'H. COMERCIO': ['HURTO ENTIDADES COMERCIALES', 'HURTO COMERCIO'],
  'H. CELULAR': ['HURTO CELULAR', 'HURTO TERMINALES', 'HURTO EQUIPOS TERMINALES MOVILES'],
  'H. BICICLETAS': ['HURTO BICICLETAS'],
  'H. SEMOVIENTES': ['HURTO ABIGEATO', 'HURTO SEMOVIENTES', 'HURTO A SEMOVIENTES', 'HURTO A GANADO'],
  'H. CABLE': ['HURTO CABLE'],
  'H. PIRATERIA': ['PIRATERIA'],
  'L. PERSONALES': ['LESIONES PERSONALES'],
  'LESIONES AT': ['LESIONES CULPOSAS', 'ACCIDENTE DE TRANSITO'],
  'V. INTRAFAMILIAR': ['VIOLENCIA INTRAFAMILIAR'],
  'DELITOS SEXUALES': ['ACCESO CARNAL', 'ACTOS SEXUALES', 'DELITOS SEXUALES'],
  'EXTORSION': ['EXTORSION', 'EXTORCION'],
  'HOMICIDIO': ['HOMICIDIO'],
  'HOMICIDIO EN AT': ['HOMICIDIO CULPOSO', 'HOMICIDIO EN ACCIDENTE'],
  'TERRORISMO': ['TERRORISMO'],
  'SECUESTRO EXTORSIVO': ['SECUESTRO EXTORSIVO'],
  'SECUESTRO SIMPLE': ['SECUESTRO SIMPLE'],
};

export function delitosIrispEquivalentes(delitosDelDashboard: string[], valoresIrisp: string[]): Set<string> {
  const resultado = new Set<string>();
  const valoresNorm = valoresIrisp.map((v) => ({ original: v, norm: normalizarTexto(v) }));
  for (const delito of delitosDelDashboard) {
    const claves = PALABRAS_CLAVE_DELITO[normalizarTexto(delito)] ?? [normalizarTexto(delito)];
    for (const clave of claves) {
      const claveNorm = normalizarTexto(clave);
      for (const { original, norm } of valoresNorm) {
        if (norm.includes(claveNorm)) resultado.add(original);
      }
    }
  }
  return resultado;
}

export function dependenciasIrispEquivalentes(estacionesDelDashboard: string[], valoresDependencia: string[]): Set<string> {
  const resultado = new Set<string>();
  const valoresNorm = valoresDependencia.map((v) => ({ original: v, norm: normalizarTexto(v) }));
  for (const estacion of estacionesDelDashboard) {
    const clave = normalizarTexto(estacion).replace(/^E[.\-]?\s*/, '');
    for (const { original, norm } of valoresNorm) {
      if (norm.includes(clave)) resultado.add(original);
    }
  }
  return resultado;
}

// --- Persistencia (IndexedDB) ---------------------------------------------

export async function guardarCapasPuntos(capas: CapaPuntos[]) {
  const db = await getDb();
  await db.put(STORE_PUNTOS, capas, 'capas');
}

export async function cargarCapasPuntos(): Promise<CapaPuntos[]> {
  try {
    const db = await getDb();
    const data = await db.get(STORE_PUNTOS, 'capas');
    const capas: any[] = data ?? [];
    // Migración defensiva: las capas guardadas ANTES de agregar "tipo" y
    // "filtroDelitoPropio" no tienen esos campos — sin este relleno, acceder
    // a ellos (ej. capa.filtroDelitoPropio.includes(...)) revienta toda la
    // página en blanco la primera vez que se abre el mapa después de una
    // actualización. Se completan con valores por defecto seguros.
    return capas.map((c) => ({
      tipo: c.tipo ?? 'generico',
      filtroDelitoPropio: c.filtroDelitoPropio ?? [],
      filtroEstado: c.filtroEstado ?? [],
      filtroEstadoExistencia: c.filtroEstadoExistencia ?? [],
      filtroDependencia: c.filtroDependencia ?? [],
      colEstadoExistencia: c.colEstadoExistencia ?? null,
      ...c,
      puntos: (c.puntos ?? []).map((p: any) => ({
        delitoCorto: p.delitoCorto ?? null,
        estacionCorta: p.estacionCorta ?? null,
        ...p,
      })),
    }));
  } catch {
    return [];
  }
}
