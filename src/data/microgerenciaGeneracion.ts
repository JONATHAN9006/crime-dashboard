// Piezas para armar el PDF de Microgerencia, compartidas por el asistente
// (AsistenteMicrogerencia.tsx) y la vista anterior (ModalMicrogerencia.tsx).
// Antes vivían dentro del modal; se movieron aquí SIN cambiar su lógica.
import type { NodoMicrogerencia, DatosMicrogerencia } from './microgerencia';
import {
  generarImagenMapaGeneral, generarImagenMapaDistrito, generarImagenMapaEstacion, generarImagenMapaCai,
  generarImagenMapaGeneralPorTipo, generarImagenesParaNodosOperatividad, esNombreDeEstacion, esNombreDeCai,
} from './microgerenciaMapas';
import { dibujarSeccionResumenSimple, type SeccionExtraMicrogerencia } from './pdfMicrogerencia';
import { cargarComparendos } from './rnmcStorage';
import { agruparCircunstancia, cuentaComoOperatividad } from '../utils/operatividadConteo';
import type { OperatividadRecord } from '../types/operatividad';

/**
 * Mapa real (calles + mapa de calor) para MEPOY General, los distritos, las
 * estaciones y los CAI, en el mismo periodo que usan las cifras. Las zonas
 * de atención no tienen polígono propio: su tarjeta muestra el aviso.
 */
export async function imagenesParaNodos(nodos: NodoMicrogerencia[], delitos: string | readonly string[] | null, actualInicio: string, actualFin: string): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const nodo of nodos) {
    let img: string | undefined;
    if (nodo.nombre === 'MEPOY General — Consolidado') img = await generarImagenMapaGeneral(delitos, actualInicio, actualFin);
    else if (nodo.nombre === 'Distrito Uno' || nodo.nombre === 'Distrito Dos') img = await generarImagenMapaDistrito(nodo.nombre === 'Distrito Uno' ? 'UNO' : 'DOS', delitos, actualInicio, actualFin);
    else if (nodo.tipo !== 'zona' && esNombreDeEstacion(nodo.nombre)) img = await generarImagenMapaEstacion(nodo.nombre, delitos, actualInicio, actualFin);
    else if (nodo.tipo !== 'zona' && esNombreDeCai(nodo.nombre)) img = await generarImagenMapaCai(nodo.nombre, delitos, actualInicio, actualFin);
    if (img) mapa.set(nodo.nombre, img);
  }
  return mapa;
}

/** Nodo de Operatividad equivalente a un nodo de Delictividad (General, Distrito, Estación o CAI). */
export function nodoOperatividadEquivalente(datosOperatividad: DatosMicrogerencia | null, nombreDelictividad: string): NodoMicrogerencia | null {
  if (!datosOperatividad) return null;
  if (nombreDelictividad === 'MEPOY General — Consolidado') return datosOperatividad.general;
  if (nombreDelictividad === 'Distrito Uno') return datosOperatividad.distrito1;
  if (nombreDelictividad === 'Distrito Dos') return datosOperatividad.distrito2;
  const todasLasEstaciones = [...datosOperatividad.distrito1.hijos, ...datosOperatividad.distrito2.hijos];
  const porEstacion = todasLasEstaciones.find((n) => n.nombre === `${nombreDelictividad} (Operatividad)`);
  if (porEstacion) return porEstacion;
  for (const estacion of todasLasEstaciones) {
    const cai = estacion.hijos.find((n) => n.nombre === `${nombreDelictividad} (Operatividad)`);
    if (cai) return cai;
  }
  return null;
}

/** Tarjetas de Operatividad para los mismos nodos elegidos en Delictividad (con su mapa). */
export async function grupoOperatividad(datosOperatividad: DatosMicrogerencia | null, nombresDelictividad: string[]): Promise<{ nodos: NodoMicrogerencia[]; imagenes: Map<string, string> } | null> {
  if (!datosOperatividad) return null;
  const nodos = nombresDelictividad.map((n) => nodoOperatividadEquivalente(datosOperatividad, n)).filter((n): n is NodoMicrogerencia => n !== null);
  if (nodos.length === 0) return null;
  const imagenes = await generarImagenesParaNodosOperatividad(nodos, datosOperatividad.actualInicio, datosOperatividad.actualFin);
  return { nodos, imagenes };
}

/** Página de detalle de Operatividad (circunstancia, bienes, ubicación, situación jurídica). */
export function paginaDetalleOperatividad(registros: OperatividadRecord[]): SeccionExtraMicrogerencia | null {
  if (registros.length === 0) return null;
  const rank = (campo: (r: OperatividadRecord) => string) => {
    const m = new Map<string, number>();
    for (const r of registros) {
      if (!cuentaComoOperatividad(r)) continue; // conteo oficial; la droga va por cantidad
      const v = campo(r);
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return Array.from(m.entries()).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor);
  };
  const rankings = [
    { titulo: 'Circunstancia de captura', filas: rank((r) => agruparCircunstancia(r.circunstanciaCaptura)) },
    { titulo: 'Clase de bien', filas: rank((r) => r.claseBien) },
    { titulo: 'Tipo de bien', filas: rank((r) => r.tipoBien) },
    { titulo: 'Marca', filas: rank((r) => r.marca) },
    { titulo: 'Ciudad', filas: rank((r) => r.ciudad) },
    { titulo: 'País (persona)', filas: rank((r) => r.paisPersona) },
    { titulo: 'Permiso de arma', filas: rank((r) => r.permisoArma) },
    { titulo: 'Turno', filas: rank((r) => r.turno) },
    { titulo: 'Zona', filas: rank((r) => r.zona) },
    { titulo: 'Situación jurídica', filas: rank((r) => r.situacionJuridica) },
  ].filter((r) => r.filas.length > 0);
  if (rankings.length === 0) return null;
  return {
    titulo: 'Operatividad — Detalle',
    alturaPagina: 80 + rankings.length * 42,
    dibujarContenido: (pdf, x, y, ancho) => dibujarSeccionResumenSimple(pdf, x, y, ancho, {
      titulo: 'Operatividad — Detalle',
      subtitulo: `${registros.length.toLocaleString('es-CO')} registro(s) — circunstancia, bienes, ubicación y situación jurídica`,
      estadisticas: [],
      rankings,
    }),
  };
}

/** Página resumen de RNMC (comparendos, comportamientos y comunas, con su mapa). */
export async function seccionRnmc(): Promise<SeccionExtraMicrogerencia | null> {
  const guardado = await cargarComparendos();
  const registros = guardado?.registros ?? [];
  if (registros.length === 0) return null;
  const porComportamiento = new Map<string, number>();
  const porComuna = new Map<string, number>();
  const porZona = new Map<string, number>();
  for (const r of registros) {
    if (r.articuloNumeral) porComportamiento.set(r.articuloNumeral, (porComportamiento.get(r.articuloNumeral) || 0) + 1);
    if (r.comuna) porComuna.set(r.comuna, (porComuna.get(r.comuna) || 0) + 1);
    if (r.zonaAtencionHechos) porZona.set(r.zonaAtencionHechos, (porZona.get(r.zonaAtencionHechos) || 0) + 1);
  }
  const rank = (m: Map<string, number>) => Array.from(m.entries()).map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor);
  const imagenMapa = await generarImagenMapaGeneralPorTipo('rnmc', ['#fbcfe8', '#f472b6', '#ec4899', '#831843']);
  return {
    titulo: 'RNMC — Registro Nacional de Medidas Correctivas',
    alturaPagina: 190,
    dibujarContenido: (pdf, x, y, ancho) => dibujarSeccionResumenSimple(pdf, x, y, ancho, {
      titulo: 'RNMC — Registro Nacional de Medidas Correctivas',
      subtitulo: `${registros.length.toLocaleString('es-CO')} comparendo(s)`,
      estadisticas: [
        { valor: String(registros.length), etiqueta: 'Comparendos' },
        { valor: String(porComuna.size), etiqueta: 'Comunas' },
        { valor: String(porZona.size), etiqueta: 'Zonas de atención' },
      ],
      rankings: [
        { titulo: 'Comportamientos más registrados', filas: rank(porComportamiento) },
        { titulo: 'Comunas con más comparendos', filas: rank(porComuna) },
      ],
      imagenMapa,
    }),
  };
}
