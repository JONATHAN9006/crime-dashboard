import type { OperatividadRecord } from '../types/operatividad';
import { gramosDroga } from './operatividadConteo';

// ── Cifras OFICIALES de cierre de la droga ───────────────────────────────
// El cuadro institucional «Actividad operativa» trae la marihuana con una
// cifra que no sale sumando la matriz (la matriz del 17/11/2026 suma
// 525.421 g sin los dos registros excluidos y 1.471.021 g con el de la Vía
// Popayán–Coconuco; el cuadro dice 791.296 g). Por solicitud del usuario,
// hasta la fecha de corte se usa la cifra oficial y DESPUÉS se sigue
// sumando lo que traiga la matriz.
//
// Cómo funciona: se suma la droga de esa clase entre el 1 de enero y la
// fecha de corte y se agrega UNA fila de ajuste (fecha = corte, sin barrio,
// sin coordenadas ni estación) por la diferencia con la cifra oficial. Se
// recalcula con cada actualización, así que si la matriz corrige registros
// anteriores al corte el total sigue igual al oficial, y todo lo posterior
// al corte se suma normal. Solo se aplica al mostrar: nunca se guarda ni se
// sube al servidor.
export interface AjusteOficialDroga { anio: number; claseBien: string; hasta: [number, number]; gramos: number; fuente: string }

export const AJUSTES_OFICIALES_DROGA: AjusteOficialDroga[] = [
  { anio: 2025, claseBien: 'MARIHUANA', hasta: [11, 17], gramos: 687_602, fuente: 'Actividad operativa 01 ene – 17 nov' },
  { anio: 2026, claseBien: 'MARIHUANA', hasta: [11, 17], gramos: 791_296, fuente: 'Actividad operativa 01 ene – 17 nov' },
];

export const PREFIJO_AJUSTE = 'ajuste-oficial-';
const sinTildes = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
export const esAjusteOficial = (r: OperatividadRecord) => r.__id.startsWith(PREFIJO_AJUSTE);

export function aplicarAjustesOficiales(registros: OperatividadRecord[]): OperatividadRecord[] {
  const base = registros.filter((r) => !esAjusteOficial(r));
  const nuevos: OperatividadRecord[] = [];
  for (const aj of AJUSTES_OFICIALES_DROGA) {
    const inicio = new Date(aj.anio, 0, 1);
    const fin = new Date(aj.anio, aj.hasta[0] - 1, aj.hasta[1], 23, 59, 59, 999);
    const deLaClase = base.filter((r) => gramosDroga(r) > 0 && sinTildes(r.claseBien).includes(aj.claseBien));
    const enCorte = deLaClase.filter((r) => r.fecha && r.fecha >= inicio && r.fecha <= fin);
    // Sin datos de ese año (ej. matriz que aún no se ha cargado) no se ajusta.
    if (enCorte.length === 0) continue;
    const suma = enCorte.reduce((a, r) => a + gramosDroga(r), 0);
    const diferencia = Math.round((aj.gramos - suma) * 10) / 10;
    if (Math.abs(diferencia) < 0.05) continue;
    const modelo = enCorte[0];
    const conteoDelito = new Map<string, number>();
    for (const r of enCorte) conteoDelito.set(r.delitoAsociado, (conteoDelito.get(r.delitoAsociado) ?? 0) + 1);
    const delito = [...conteoDelito].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const fecha = new Date(aj.anio, aj.hasta[0] - 1, aj.hasta[1], 12);
    nuevos.push({
      ...modelo,
      __id: `${PREFIJO_AJUSTE}${aj.claseBien.toLowerCase()}-${aj.anio}`,
      fecha, anio: aj.anio, mes: aj.hasta[0], nombreMes: modelo.nombreMes && modelo.mes === aj.hasta[0] ? modelo.nombreMes : '',
      diaSemana: '', turno: '',
      cantidad: diferencia,
      delitoAsociado: delito,
      estacion: '', cuadrante: '', barrioHecho: '', zona: '', unidad: modelo.unidad, dependencia: '',
      marca: '', circunstanciaCaptura: '', situacionJuridica: '', genero: '', edad: null, grupoEdad: '',
      valor: null, ciudad: '', paisPersona: '', permisoArma: '',
      lat: null, lon: null,
      raw: { AJUSTE: `Cifra oficial ${aj.fuente} ${aj.anio}: ${aj.gramos} g` },
    });
  }
  return nuevos.length ? [...base, ...nuevos] : base;
}

/** Nota para mostrar bajo las tablas de droga. */
export const notaAjustesOficiales = () => {
  const porClase = new Map<string, AjusteOficialDroga[]>();
  for (const a of AJUSTES_OFICIALES_DROGA) porClase.set(a.claseBien, [...(porClase.get(a.claseBien) ?? []), a]);
  return [...porClase].map(([clase, l]) => `${clase.charAt(0)}${clase.slice(1).toLowerCase()}: cifra oficial del cuadro «Actividad operativa» al ${l.map((a) => `${a.hasta[1]}/${a.hasta[0]}/${a.anio}`).join(' y ')}; lo posterior se suma de la matriz.`).join(' ');
};
