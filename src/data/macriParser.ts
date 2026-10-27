import * as XLSX from 'xlsx';

// Lector de la matriz de objetivos GIOC (módulo MACRI). Acepta los DOS
// formatos que existen hoy:
//
//  1. La exportación completa del aplicativo (Ejemplo_GIOC.xlsx: 44
//     columnas — ID OBJETIVO, ESTADO ACTUAL, FECHA FINAL, GRUPO, NOMBRE
//     OBJETIVO, DELITO PRINCIPAL, ESTRATEGIA, LOCALIDAD/ COMUNA, LATITUD…).
//  2. La tabla de seguimiento armada a mano (260902_1613_GIOC_2026_MEPOY:
//     13 columnas, encabezado en DOS filas con SE CUMPLE → SI / NO y
//     PRORROGA → X, más ZONA INJERENCIA y APORTE EN CASOS).
//
// En los dos casos se busca la fila de encabezado por el texto "NOMBRE
// OBJETIVO" (no por posición), y cada columna por su nombre.

export interface ObjetivoMacri {
  __id: string; // clave estable: nombre del objetivo normalizado (ver claveObjetivo)
  idObjetivo: string; // "ID OBJETIVO" del aplicativo, si viene
  fechaFinal: Date | null;
  estadoActual: string;
  estadoOriginal: string;
  grupo: string;
  nombreObjetivo: string;
  tipologia: string;
  delitoPrincipalTexto: string; // "ARTÍCULO 239. HURTO A MOTOCICLETAS"
  delitoPrincipal: string; // nombre corto del dashboard: "H. Motos"
  modalidad: string;
  estrategia: string;
  fase: string;
  integrantes: number | null;
  zonaTexto: string; // tal cual viene: "Comuna 7", "COMUNA SIETE"…
  comuna: number | null; // 7
  barrio: string;
  lat: number | null;
  lon: number | null;
  // Valores que trae la tabla manual (formato 2) — se usan SOLO como valor
  // inicial; lo que el usuario guarde en el dashboard tiene prioridad.
  seCumpleArchivo: 'SI' | 'NO' | null;
  prorrogaArchivo: boolean;
  aporteArchivo: string;
}

function limpiar(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function normalizar(v: unknown): string {
  return limpiar(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function claveObjetivo(nombre: string): string {
  return normalizar(nombre).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Fechas: texto "30/10/2026", Date, o número serial de Excel. El serial se
// convierte a fecha LOCAL (no UTC), para que "30/09/2026" no termine
// mostrándose como 29/09 en Colombia.
export function parseFechaMacri(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }
  const t = limpiar(v);
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const m2 = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  return null;
}

const NUMEROS: Record<string, number> = { UNO: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6, SIETE: 7, OCHO: 8, NUEVE: 9, DIEZ: 10 };

/** "Comuna 7" / "COMUNA SIETE" / "C-7" → 7 */
export function extraerComuna(texto: string): number | null {
  const t = normalizar(texto);
  if (!t) return null;
  const m = t.match(/(?:COMUNA|^C)\s*-?\s*(\d{1,2})\b/);
  if (m) return Number(m[1]);
  const p = t.match(/COMUNA\s+([A-Z]+)/);
  if (p && NUMEROS[p[1]]) return NUMEROS[p[1]];
  return null;
}

// Texto libre de delito (artículo penal o lo que escriban en "aporte") →
// nombre corto del dashboard. Por palabra clave, porque la redacción varía
// ("HURTOS PERSONAS", "HURTO A PERSONAS", "ARTÍCULO 239. HURTO A PERSONAS").
// null = no tiene equivalente en la base de Delictividad (ej. tráfico de
// estupefacientes, extinción de dominio).
const REGLAS_DELITO: [RegExp, string][] = [
  [/HURTO.*MOTO/, 'H. Motos'],
  [/HURTO.*PERSONA/, 'H. Personas'],
  [/HURTO.*RESIDENC/, 'H. Residencias'],
  [/HURTO.*(COMERC|ENTIDADES COMERCIALES)/, 'H. Comercio'],
  [/HURTO.*(AUTOMOTOR|VEHICUL|CARRO)/, 'H. Automotores'],
  [/HURTO.*CELULAR/, 'H. Celular'],
  [/HURTO.*BICICLET/, 'H. Bicicletas'],
  [/HURTO.*(FINANCIER|BANCO)/, 'Hurto E. Financieras'],
  [/HURTO.*SEMOVIENT/, 'H. Semovientes'],
  [/SECUESTRO.*EXTORSIV/, 'Secuestro Extorsivo'],
  [/SECUESTRO/, 'Secuestro Simple'],
  [/EXTORSION/, 'Extorsion'],
  [/HOMICIDIO/, 'Homicidio'],
  [/LESION/, 'L. Personales'],
  [/VIOLENCIA INTRAFAMILIAR/, 'V. Intrafamiliar'],
  [/SEXUAL|ACCESO CARNAL|ACTO SEXUAL/, 'Delitos Sexuales'],
  [/TERRORISMO/, 'Terrorismo'],
];

export function delitoDashboard(texto: string): string | null {
  const t = normalizar(texto);
  for (const [re, nombre] of REGLAS_DELITO) if (re.test(t)) return nombre;
  return null;
}

/** Nombre corto para mostrar, aunque no exista en Delictividad. */
export function delitoCortoMacri(texto: string): string {
  const d = delitoDashboard(texto);
  if (d) return d;
  const t = normalizar(texto);
  if (/ESTUPEFACIENTE/.test(t)) return 'Tráfico de Estupefacientes';
  const sinArticulo = limpiar(texto).replace(/^ART[IÍ]CULO\s+[\dA-Z]+[.,]?\s*/i, '');
  return sinArticulo ? sinArticulo.charAt(0).toUpperCase() + sinArticulo.slice(1).toLowerCase() : 'Sin delito';
}

// ── Aporte en casos ──────────────────────────────────────────────────────
// Lo que se escribe en "APORTE EN CASOS" puede ser:
//   "10"                                  → 10 casos del delito principal
//   "6 HURTOS PERSONAS"                   → 6 casos de H. Personas
//   "6 LESIONES PERSONALES\n16 HURTOS…"   → varios delitos, uno por línea
//   "EXTINCION DE DOMINIO 1 PREDIO"       → resultado no medible en casos
export interface ItemAporte { casos: number; delito: string | null; texto: string }

export function interpretarAporte(texto: string, delitoPrincipal: string | null): { items: ItemAporte[]; noMedible: string | null } {
  const crudo = String(texto ?? '').trim();
  if (!crudo) return { items: [], noMedible: null };
  if (/^\d+(?:[.,]\d+)?$/.test(crudo)) {
    return { items: [{ casos: Number(crudo.replace(',', '.')), delito: delitoPrincipal, texto: crudo }], noMedible: null };
  }
  const items: ItemAporte[] = [];
  // Se parte por saltos de línea, comas, "y" o "+", y en cada pedazo se
  // busca "número + texto de delito".
  for (const pedazo of crudo.split(/\n|;|,|\+|\s+Y\s+/i)) {
    const m = pedazo.trim().match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const delito = delitoDashboard(m[2]);
    if (delito) items.push({ casos: Number(m[1]), delito, texto: pedazo.trim() });
  }
  if (items.length === 0) return { items: [], noMedible: limpiar(crudo) };
  return { items, noMedible: null };
}

// ── Lectura del archivo ──────────────────────────────────────────────────

function buscarColumna(encabezado: string[], ...nombres: string[]): number {
  const norm = encabezado.map(normalizar);
  for (const n of nombres) {
    const i = norm.indexOf(normalizar(n));
    if (i !== -1) return i;
  }
  return -1;
}

function marcado(v: unknown): boolean {
  const t = normalizar(v);
  return t !== '' && t !== 'NO' && t !== '0' && t !== 'FALSE';
}

function numeroONull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(limpiar(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export async function leerMatrizMacri(file: File): Promise<ObjetivoMacri[]> {
  const libro = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  // Se toma la primera hoja que tenga "NOMBRE OBJETIVO" (el archivo manual
  // trae la tabla en "Hoja3", no necesariamente en la primera).
  for (const nombreHoja of libro.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombreHoja], { header: 1, defval: '', raw: true });
    const filaEnc = matriz.slice(0, 10).findIndex((f) => f.some((c) => normalizar(c) === 'NOMBRE OBJETIVO'));
    if (filaEnc === -1) continue;
    const enc = (matriz[filaEnc] as unknown[]).map((c) => limpiar(c));
    const sub = (matriz[filaEnc + 1] ?? []) as unknown[];
    // Formato manual: la fila siguiente al encabezado es la de "SI | NO | X".
    const tieneSubencabezado = sub.some((c) => normalizar(c) === 'SI') && sub.some((c) => normalizar(c) === 'NO');
    const inicio = filaEnc + (tieneSubencabezado ? 2 : 1);

    const c = {
      id: buscarColumna(enc, 'ID OBJETIVO'),
      fecha: buscarColumna(enc, 'FECHA FINAL'),
      estado: buscarColumna(enc, 'ESTADO ACTUAL'),
      estadoOrig: buscarColumna(enc, 'ESTADO ORIGINAL'),
      grupo: buscarColumna(enc, 'GRUPO'),
      nombre: buscarColumna(enc, 'NOMBRE OBJETIVO'),
      tipologia: buscarColumna(enc, 'TIPOLOGIA'),
      delito: buscarColumna(enc, 'DELITO PRINCIPAL'),
      modalidad: buscarColumna(enc, 'MODALIDAD'),
      estrategia: buscarColumna(enc, 'ESTRATEGIA'),
      fase: buscarColumna(enc, 'FASE'),
      integrantes: buscarColumna(enc, 'CANTIDAD INTEGRANTES'),
      zona: buscarColumna(enc, 'ZONA INJERENCIA', 'LOCALIDAD/ COMUNA', 'LOCALIDAD/COMUNA', 'LOCALIDAD / COMUNA', 'COMUNA'),
      barrio: buscarColumna(enc, 'BARRIO'),
      lat: buscarColumna(enc, 'LATITUD'),
      lon: buscarColumna(enc, 'LONGITUD'),
      seCumple: buscarColumna(enc, 'SE CUMPLE'),
      prorroga: buscarColumna(enc, 'PRORROGA', 'PRÓRROGA'),
      aporte: buscarColumna(enc, 'APORTE EN CASOS'),
    };
    if (c.delito === -1) throw new Error('No se encontró la columna "DELITO PRINCIPAL" en la matriz.');

    const objetivos: ObjetivoMacri[] = [];
    const usadas = new Set<string>();
    for (const fila of matriz.slice(inicio) as unknown[][]) {
      const val = (i: number) => (i >= 0 ? fila[i] : '');
      const nombre = limpiar(val(c.nombre));
      if (!nombre) continue;
      const grupo = limpiar(val(c.grupo));
      let clave = claveObjetivo(nombre);
      if (usadas.has(clave)) clave = `${clave}--${claveObjetivo(grupo)}`;
      usadas.add(clave);
      const delitoTexto = limpiar(val(c.delito));
      const zonaTexto = limpiar(val(c.zona));
      // SE CUMPLE: en el formato manual son dos columnas (SI y NO, la de NO
      // queda justo a la derecha, sin encabezado propio por la celda combinada).
      let seCumple: 'SI' | 'NO' | null = null;
      if (c.seCumple >= 0) {
        if (tieneSubencabezado) {
          if (marcado(val(c.seCumple))) seCumple = 'SI';
          else if (marcado(val(c.seCumple + 1))) seCumple = 'NO';
        } else {
          const t = normalizar(val(c.seCumple));
          seCumple = t === 'SI' || t === 'X' ? 'SI' : t === 'NO' ? 'NO' : null;
        }
      }
      const prorroga = c.prorroga >= 0 && (marcado(val(c.prorroga)) || (tieneSubencabezado && marcado(val(c.prorroga + 1))));
      objetivos.push({
        __id: clave,
        idObjetivo: limpiar(val(c.id)),
        fechaFinal: parseFechaMacri(val(c.fecha)),
        estadoActual: limpiar(val(c.estado)) || 'Sin estado',
        estadoOriginal: limpiar(val(c.estadoOrig)),
        grupo: grupo || 'Sin grupo',
        nombreObjetivo: nombre,
        tipologia: limpiar(val(c.tipologia)),
        delitoPrincipalTexto: delitoTexto,
        delitoPrincipal: delitoCortoMacri(delitoTexto),
        modalidad: limpiar(val(c.modalidad)),
        estrategia: limpiar(val(c.estrategia)),
        fase: limpiar(val(c.fase)),
        integrantes: numeroONull(val(c.integrantes)),
        zonaTexto,
        comuna: extraerComuna(zonaTexto),
        barrio: limpiar(val(c.barrio)),
        lat: numeroONull(val(c.lat)),
        lon: numeroONull(val(c.lon)),
        seCumpleArchivo: seCumple,
        prorrogaArchivo: prorroga,
        aporteArchivo: c.aporte >= 0 ? String(val(c.aporte) ?? '').trim() : '',
      });
    }
    return objetivos;
  }
  throw new Error('El archivo no parece ser la matriz GIOC: no se encontró la columna "NOMBRE OBJETIVO".');
}
