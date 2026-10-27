import { leerExcelComoFilas, delitoCorto } from './puntosStorage';
import { MAPA_CUADRANTE, MAPA_CAI } from './db2Mapeos';

// Lector del "Reporte General - IRISP1" — confirmado contra el archivo real
// descargado del aplicativo (IRISP1_28092026.xlsx: 117 filas, 37 columnas,
// la fila 1 es el título "Reporte General - IRISP1" y la 2 los encabezados;
// leerExcelComoFilas ya salta esa fila de título sola). Se lee por nombre de
// columna exacto, igual que RNMC, porque la matriz siempre sale igual.
//
// Las fechas vienen como TEXTO con formato colombiano de 12 horas:
// "25/08/2026 4:59:26 p. m." — no como fecha de Excel — por eso tienen su
// propio lector (parseFechaIrisp) que entiende "a. m." / "p. m.".

export interface RegistroIrisp {
  __id: string; // "Codigo" — ej. MEPOY-2026-121, único por información
  codigo: string;
  fecha: Date | null; // Fecha creación (la información entra al sistema)
  anio: number | null;
  mes: number | null; // 1-12
  delito: string; // nombre corto (H. Personas, Tráfico de Estupefacientes…)
  delitoTexto: string; // texto legal completo (ARTICULO 239. HURTO PERSONAS)

  estado: string; // Asignado / Avance Verificación / Avance Investigación / Investigación / Finalizado
  existencia: string; // Si existe / No existe / Por establecer
  clase: string; // Persona / Instalación Fija / Trafico De Estupefacientes / Estructura…
  fuente: string; // Via Pública / Redes de Apoyo / Puerta a Puerta / Reuniones Comunitarias
  tipoServicio: string;
  cantidad: number;

  region: string;
  unidad: string;
  dependencia: string; // texto completo
  estacion: string; // E-Norte / E-Sur / E-Timbio — mismo vocabulario del dashboard
  cuadrante: string; // código crudo
  zonaAtencion: string; // traducido vía MAPA_CUADRANTE
  municipio: string;
  zona: string; // Urbana / Rural
  barrio: string;
  direccion: string;
  lat: number | null;
  lon: number | null;

  unidadInforma: string; // CAI / Fuerza Disponible que reporta
  funcionarioInforma: string;
  caracteristicas: string;
  descripcionTramite: string;

  unidadVerifica: string;
  fechaAsignacionVerificacion: Date | null;
  fechaRespuestaVerificacion: Date | null;
  unidadInvestiga: string;
  fechaAsignacionInvestigacion: Date | null;
  fechaRespuestaInvestigacion: Date | null;

  cantidadSpoa: number;
  cantidadSiedco: number;
  nunc: string;

  fechaCorte: Date | null; // "Última fecha de actualización" del aplicativo
}

function limpiar(v: unknown): string {
  return String(v ?? '').trim();
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(limpiar(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function coordenada(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(limpiar(v).replace(',', '.'));
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

// "25/08/2026 4:59:26 p. m." / "1/09/2026 10:42:39 a. m." / "25/08/2026"
// También acepta fecha real de Excel o número serial, por si alguna
// exportación futura llegara con las celdas ya como fecha.
export function parseFechaIrisp(valor: unknown): Date | null {
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
  if (typeof valor === 'number' && valor > 20000 && valor < 80000) {
    const f = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
    return isNaN(f.getTime()) ? null : f;
  }
  const texto = limpiar(valor).toLowerCase();
  if (!texto) return null;
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?\.?\s*m?\.?)?/);
  if (!m) return null;
  let hora = m[4] ? Number(m[4]) : 0;
  const ampm = m[7];
  if (ampm === 'p' && hora < 12) hora += 12;
  if (ampm === 'a' && hora === 12) hora = 0;
  const f = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hora, m[5] ? Number(m[5]) : 0, m[6] ? Number(m[6]) : 0);
  return isNaN(f.getTime()) ? null : f;
}

// "ESTACION DE POLICIA NORTE POPAYAN - MEPOY" → "E-Norte" (mismo nombre que
// usa Delictividad, para poder cruzar ambos sin traducir a mano).
function estacionCortaIrisp(dependencia: string): string {
  const d = dependencia.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (d.includes('NORTE')) return 'E-Norte';
  if (d.includes('SUR')) return 'E-Sur';
  if (d.includes('TIMBIO')) return 'E-Timbio';
  if (d.includes('COCONUCO')) return 'E-Coconuco';
  if (d.includes('SOTARA')) return 'E-Sotara';
  return dependencia.replace(/^ESTACION DE POLICIA\s+/i, '').replace(/\s*-\s*MEPOY$/i, '').trim() || 'Sin estación';
}

// Nombres de unidad cortos, con las siglas institucionales — los textos
// completos ("SECCIONAL DE INTELIGENCIA POLICIAL MEPOY - MEPOY") no caben
// en ninguna gráfica. Los CAI se traducen con la MISMA tabla del DB2
// (MAPA_CAI → "CAI 3"), así coinciden con Delictividad.
function abreviarUnidad(texto: string): string {
  const t = texto.replace(/\s*-\s*MEPOY$/i, '').trim();
  if (!t) return '';
  const n = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (n.includes('INTELIGENCIA POLICIAL')) return 'SIPOL';
  if (n.includes('UNIDAD BASICA DE INVESTIGACION CRIMINAL')) return 'UBIC';
  if (n.includes('INVESTIGACION CRIMINAL')) return 'SIJIN';
  if (n.includes('FUERZA DISPONIBLE')) return 'Fuerza Disponible';
  if (n.startsWith('ESTACION DE POLICIA')) return estacionCortaIrisp(t);
  const cai = MAPA_CAI[n] ?? MAPA_CAI[n.replace(/^CAI (?!COMUNA)/, 'CAI COMUNA ')];
  return cai ?? t;
}

// Nombres cortos propios de IRISP1 para los delitos que el dashboard ya
// llama distinto — así la comparación contra Delictividad cruza directo.
// Se aplica DESPUÉS de delitoCorto (la tabla de la capa del mapa), sin
// tocar esa tabla para no alterar lo que ya muestra el mapa.
const EQUIVALENCIA_DASHBOARD: Record<string, string> = {
  'H. Entidades Comerciales': 'H. Comercio',
  'H. Entidades Financieras': 'Hurto E. Financieras',
};

export function filaARegistroIrisp(fila: Record<string, any>): RegistroIrisp | null {
  const codigo = limpiar(fila['Codigo']);
  if (!codigo) return null;
  const delitoTexto = limpiar(fila['Delito Principal']);
  const corto = delitoCorto(delitoTexto, 'irisp1');
  const fecha = parseFechaIrisp(fila['Fecha creación']);
  const dependencia = limpiar(fila['Dependencia']);
  const cuadrante = limpiar(fila['Cuadrante']);
  // "Municipio 2" trae POPAYAN/POPAYÁN mezclado; "Municipio" viene limpio.
  const municipio = limpiar(fila['Municipio']) || limpiar(fila['Municipio 2']);
  return {
    __id: codigo,
    codigo,
    fecha,
    anio: fecha ? fecha.getFullYear() : Number(codigo.match(/-(\d{4})-/)?.[1]) || null,
    mes: fecha ? fecha.getMonth() + 1 : null,
    delito: EQUIVALENCIA_DASHBOARD[corto] ?? corto,
    delitoTexto,
    estado: limpiar(fila['Estado']) || 'Sin estado',
    existencia: limpiar(fila['Estado Existencia']) || 'Por establecer',
    clase: limpiar(fila['Clase']) || 'Sin clase',
    fuente: limpiar(fila['Fuente']) || 'Sin fuente',
    tipoServicio: limpiar(fila['Tipo Servicio']),
    cantidad: numero(fila['Cantidad']),
    region: limpiar(fila['Región']),
    unidad: limpiar(fila['Unidad']),
    dependencia,
    estacion: estacionCortaIrisp(dependencia),
    cuadrante,
    zonaAtencion: MAPA_CUADRANTE[cuadrante.toUpperCase()] ?? (cuadrante || 'Sin cuadrante'),
    municipio,
    zona: limpiar(fila['Zona']) || 'Sin zona',
    barrio: limpiar(fila['Barrio']).toUpperCase(),
    direccion: limpiar(fila['Dirección']),
    lat: coordenada(fila['Latitud']),
    lon: coordenada(fila['Longitud']),
    unidadInforma: abreviarUnidad(limpiar(fila['Unidad Funcionario Informa'])) || 'No registra',
    funcionarioInforma: limpiar(fila['Funcionario Informa']),
    caracteristicas: limpiar(fila['Caracteristicas Generales']),
    descripcionTramite: limpiar(fila['Descripción Trámite']),
    unidadVerifica: abreviarUnidad(limpiar(fila['Unidad Verificación Existencia'])) || 'Sin asignar',
    fechaAsignacionVerificacion: parseFechaIrisp(fila['Fecha Asignación Verificación Existencia']),
    fechaRespuestaVerificacion: parseFechaIrisp(fila['Fecha Respuesta Verificación Existencia']),
    unidadInvestiga: abreviarUnidad(limpiar(fila['Unidad Proceso Investigativo'])) || 'Sin asignar',
    fechaAsignacionInvestigacion: parseFechaIrisp(fila['Fecha Asignación Proceso Investigativo']),
    fechaRespuestaInvestigacion: parseFechaIrisp(fila['Fecha Respuesta Proceso Investigativo']),
    cantidadSpoa: numero(fila['Cantidad SPOA']),
    cantidadSiedco: numero(fila['Cantidad SIEDCO']),
    nunc: limpiar(fila['NUNC']),
    fechaCorte: parseFechaIrisp(fila['Última fecha de actualización']),
  };
  // Nota: "Identificacion Funcionario Informa" (cédula del funcionario) se
  // descarta a propósito — no se usa en ningún análisis y no tiene por qué
  // quedar guardada en el navegador ni en el servidor.
}

export async function leerMatrizIrisp(file: File): Promise<{ registros: RegistroIrisp[]; filasCrudas: Record<string, any>[] }> {
  const { filas, columnas } = await leerExcelComoFilas(file);
  const requeridas = ['Codigo', 'Delito Principal', 'Estado', 'Estado Existencia'];
  const faltan = requeridas.filter((c) => !columnas.includes(c));
  if (faltan.length > 0) {
    throw new Error(`El archivo no parece ser el "Reporte General - IRISP1": faltan las columnas ${faltan.join(', ')}.`);
  }
  const registros: RegistroIrisp[] = [];
  const vistos = new Set<string>();
  for (const fila of filas) {
    const r = filaARegistroIrisp(fila);
    if (!r || vistos.has(r.__id)) continue;
    vistos.add(r.__id);
    registros.push(r);
  }
  return { registros, filasCrudas: filas };
}

// --- Tiempos de gestión ----------------------------------------------------

export function diasEntre(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const d = (b.getTime() - a.getTime()) / 86400000;
  return d >= 0 ? d : null;
}

// Orden lógico del flujo del aplicativo (no alfabético) — se usa para
// ordenar el embudo de estados.
export const ORDEN_ESTADOS = ['Asignado', 'Avance Verificación', 'Avance Investigación', 'Investigación', 'Finalizado'];
