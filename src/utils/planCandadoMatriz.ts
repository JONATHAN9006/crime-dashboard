import * as XLSX from 'xlsx';
import { PLAN_CANDADO_2026, etiquetaNumeroPlanCandado, type PuntoPlanCandado } from '../data/planCandado2026';
import type { MapaUbicaciones, UbicacionPlanCandado } from '../data/planCandadoUbicaciones';
import { parsearCoordenada, coordenadaEnRangoValido } from './coordenadasParser';

// Lectura y validación de la MATRIZ del Plan Candado (Excel/CSV).
//
// Formato oficial (Plan_candado_2026.xlsx): No. · Responsable Principal ·
// Responsable Secundario · Direccion · Lugar · Latitud · Longitud — con una
// fila de títulos genéricos encima (Columna1…), que se salta sola.
// También acepta el formato de «Exportar tabla» (ID, No, Latitud, Longitud).
//
// Reglas (no cambian ningún dato sin dejarlo explícito en el informe):
//  · Cada fila se une a SU punto por ID, o por No. (1–41 = puntos del
//    documento; M1–M5 = cierre general), comprobando que Dirección + Lugar
//    coincidan. Si el número no coincide pero Dirección + Lugar sí apuntan
//    a otro punto, se usa ese y se avisa. Nunca se crean puntos nuevos.
//  · Fila sin latitud ni longitud → queda pendiente (no es error).
//  · Coordenada ilegible o fuera de Popayán/Cauca → error, no se aplica.
//  · Coordenada igual a la actual → «sin cambios» (volver a cargar el mismo
//    archivo no duplica ni reescribe nada).
//  · Un punto CORREGIDO A MANO en el mapa no se sobrescribe: se informa.
//  · Si el archivo repite un punto, cuenta una vez (gana la última fila).

export interface InformeMatriz {
  archivo: string;
  procesados: number; // filas con datos leídas
  conCoordenadas: number; // filas con coordenada válida
  pendientes: { fila: number; punto: string; texto: string }[]; // filas sin coordenadas
  errores: string[];
  avisos: string[];
  nuevas: UbicacionPlanCandado[]; // lo que se aplicará al confirmar
  sinCambios: number;
  conservadasManuales: string[];
}

function sinTildes(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function clave(v: unknown) {
  return sinTildes(String(v ?? '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const ALIAS: Record<string, RegExp> = {
  id: /^id$/,
  no: /^(no|n|numero|nro|punto)$/,
  direccion: /^direccion$/,
  lugar: /^lugar$/,
  lat: /^(lat|latitud|latitude|y)$/,
  lon: /^(lon|long|longitud|longitude|lng|x)$/,
};

function columnaDe(encabezados: string[], tipo: keyof typeof ALIAS): number {
  return encabezados.findIndex((h) => ALIAS[tipo].test(sinTildes(h).toLowerCase().replace(/[^a-z]/g, '')));
}

export async function leerMatrizPlanCandado(file: File, actuales: MapaUbicaciones): Promise<InformeMatriz> {
  const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '' });
  // Fila de encabezados: la primera (de las 6 primeras) que tenga Latitud y Longitud.
  let iEnc = -1;
  for (let i = 0; i < Math.min(6, matriz.length); i++) {
    const enc = (matriz[i] ?? []).map((c) => String(c));
    if (columnaDe(enc, 'lat') >= 0 && columnaDe(enc, 'lon') >= 0) { iEnc = i; break; }
  }
  if (iEnc < 0) throw new Error('No se encontraron las columnas Latitud y Longitud en las primeras filas del archivo.');
  const enc = (matriz[iEnc] ?? []).map((c) => String(c));
  const c = { id: columnaDe(enc, 'id'), no: columnaDe(enc, 'no'), dir: columnaDe(enc, 'direccion'), lugar: columnaDe(enc, 'lugar'), lat: columnaDe(enc, 'lat'), lon: columnaDe(enc, 'lon') };
  if (c.id < 0 && c.no < 0 && (c.dir < 0 || c.lugar < 0)) throw new Error('Falta la columna «No.» (o ID, o Dirección y Lugar) para identificar cada punto.');

  const porId = new Map(PLAN_CANDADO_2026.map((p) => [p.id.toUpperCase(), p]));
  const porDireccionLugar = new Map(PLAN_CANDADO_2026.map((p) => [`${clave(p.direccion)}|${clave(p.lugar)}`, p]));
  const informe: InformeMatriz = { archivo: file.name, procesados: 0, conCoordenadas: 0, pendientes: [], errores: [], avisos: [], nuevas: [], sinCambios: 0, conservadasManuales: [] };
  const aplicar = new Map<string, UbicacionPlanCandado>();
  const vistos = new Set<string>();

  for (let i = iEnc + 1; i < matriz.length; i++) {
    const fila = matriz[i] ?? [];
    if (fila.every((v) => String(v).trim() === '')) continue;
    const nFila = i + 1;
    informe.procesados++;
    const celda = (k: number) => (k >= 0 ? fila[k] : '');

    // 1) ¿A qué punto corresponde?
    let p: PuntoPlanCandado | undefined;
    const id = String(celda(c.id)).trim().toUpperCase();
    const no = String(celda(c.no)).trim().toUpperCase();
    if (id) p = porId.get(id);
    else if (/^M\d+$/.test(no)) p = porId.get(`MEPOY-${no.slice(1)}`);
    else if (/^\d+(\.0+)?$/.test(no)) p = porId.get(`PC-${parseInt(no, 10)}`);
    const dl = c.dir >= 0 && c.lugar >= 0 ? porDireccionLugar.get(`${clave(celda(c.dir))}|${clave(celda(c.lugar))}`) : undefined;
    if (p && dl && dl.id !== p.id) {
      informe.avisos.push(`Fila ${nFila}: el número dice punto ${etiquetaNumeroPlanCandado(p)}, pero la dirección y el lugar son los del punto ${etiquetaNumeroPlanCandado(dl)}; se usó el punto ${etiquetaNumeroPlanCandado(dl)}.`);
      p = dl;
    } else if (!p) p = dl;
    if (!p) { informe.errores.push(`Fila ${nFila}: no corresponde a ningún punto del Plan Candado (No. «${no || id || '—'}»).`); continue; }
    if (vistos.has(p.id)) informe.avisos.push(`Fila ${nFila}: el punto ${etiquetaNumeroPlanCandado(p)} está repetido en el archivo; se tomó esta última fila.`);
    vistos.add(p.id);

    // 2) Coordenadas.
    const latTxt = String(celda(c.lat)).trim();
    const lonTxt = String(celda(c.lon)).trim();
    if (!latTxt && !lonTxt) {
      informe.pendientes.push({ fila: nFila, punto: etiquetaNumeroPlanCandado(p), texto: `${p.direccion ?? ''} — ${p.lugar ?? ''}` });
      aplicar.delete(p.id);
      continue;
    }
    const lat = parsearCoordenada(celda(c.lat));
    const lon = parsearCoordenada(celda(c.lon));
    if (lat == null || lon == null) { informe.errores.push(`Fila ${nFila} (punto ${etiquetaNumeroPlanCandado(p)}): latitud o longitud con formato no válido («${latTxt}», «${lonTxt}»).`); continue; }
    if (!coordenadaEnRangoValido(lat, lon)) { informe.errores.push(`Fila ${nFila} (punto ${etiquetaNumeroPlanCandado(p)}): la coordenada ${lat}, ${lon} queda fuera de Popayán/Cauca (¿latitud y longitud invertidas o sin signo?).`); continue; }
    informe.conCoordenadas++;

    // 3) ¿Qué se hace con ella?
    const actual = actuales[p.id];
    if (actual && Math.abs(actual.lat - lat) < 1e-7 && Math.abs(actual.lon - lon) < 1e-7) { informe.sinCambios++; aplicar.delete(p.id); continue; }
    if (actual?.fuente === 'mapa') { informe.conservadasManuales.push(etiquetaNumeroPlanCandado(p)); aplicar.delete(p.id); continue; }
    aplicar.set(p.id, { __id: p.id, lat, lon, fuente: 'archivo', actualizadoPor: 'Administrador', fecha: new Date().toISOString() });
  }
  informe.nuevas = Array.from(aplicar.values());
  if (informe.procesados === 0) throw new Error('El archivo no tiene filas con datos debajo de los encabezados.');
  return informe;
}
