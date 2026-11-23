import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useVentanaComparativa } from './useComparativoHomologo';
import type { CrimeRecord } from '../types/crime';
import { formatFecha } from '../utils/aggregations';
import type { AjustesMicrogerencia, DatosMicrogerencia, NodoMicrogerencia, PuntoMes, PuntoTrimestre } from '../data/microgerencia';
import { aplicarFiltros } from '../utils/filters';
import { etiquetaPeriodo, mesesElegidos } from '../data/periodoMicrogerencia';
import type { FilterState } from '../types/crime';

export const ESTACIONES_DISTRITO_1 = ['E-Norte', 'E-Sur'] as const;
export const ESTACIONES_DISTRITO_2 = ['E-Timbio', 'E-Coconuco', 'E-Sotara'] as const;
export const NOMBRES_ESTACION: Record<string, string> = {
  'E-Norte': 'Estación Norte', 'E-Sur': 'Estación Sur',
  'E-Timbio': 'Estación Timbio', 'E-Coconuco': 'Estación Coconuco', 'E-Sotara': 'Estación Sotara',
};
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TRIMESTRES: { etiqueta: string; meses: number[] }[] = [
  { etiqueta: '1er Trimestre', meses: [1, 2, 3] },
  { etiqueta: '2do Trimestre', meses: [4, 5, 6] },
  { etiqueta: '3er Trimestre', meses: [7, 8, 9] },
  { etiqueta: '4to Trimestre', meses: [10, 11, 12] },
];

function ordenarCai(a: string, b: string): number {
  const na = parseInt(a.replace(/\D+/g, ''), 10);
  const nb = parseInt(b.replace(/\D+/g, ''), 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, 'es');
}

/**
 * "Microgerencia y Proyección Delictiva" — CALCULADO EN VIVO a partir de
 * "recordsBase" (todo lo cargado, respetando el filtro de Delito y demás
 * filtros de la barra lateral — EXCEPTO año/mes/fecha, que maneja la propia
 * ventana homóloga) — nunca de un archivo separado. Reutiliza
 * useVentanaComparativa (la MISMA lógica de ventana homóloga que ya usa el
 * resto del dashboard). Si hay un delito filtrado, cada nodo queda acotado
 * a ese delito — ver "delitoFiltrado" en el resultado.
 *
 * Mantiene EXACTAMENTE las mismas columnas que trae la Hoja3 del Excel
 * original (Total 2025, año a la fecha ×2, DIF, %, Aporte %, Proyección,
 * Trimestres, Meses) en cada nivel — estación, CAI, zona de atención y
 * delito — para no perder esa estructura.
 */
export function useMicrogerencia(ajustes?: AjustesMicrogerencia | null): DatosMicrogerencia | null {
  const { records, recordsBase: recordsBaseDashboard, registrosVisibles, filters: filtrosDashboard, meta } = useData();
  // Asistente: delitos, periodo y barrios propios; la parte territorial la
  // maneja el árbol (Distrito/Estación/CAI/Zona), así que los filtros
  // territoriales del dashboard no se aplican aquí. Los demás filtros del
  // dashboard (armas, modalidad, hora…) se respetan como siempre.
  const filters: FilterState = useMemo(() => (ajustes
    ? {
      ...filtrosDashboard,
      delito: ajustes.delitos,
      barrioHecho: ajustes.barrios,
      municipio: [], estacion: [], cai: [], cuadrante: [],
      anio: ajustes.anio ? [ajustes.anio] : [], mes: ajustes.meses ?? [],
      fechaInicial: ajustes.fechaInicial, fechaFinal: ajustes.fechaFinal,
    }
    : filtrosDashboard), [ajustes, filtrosDashboard]);
  const recordsBaseAjustada = useMemo(
    () => (ajustes ? aplicarFiltros(registrosVisibles, { ...filters, anio: [], mes: [], fechaInicial: null, fechaFinal: null }) : null),
    [ajustes, registrosVisibles, filters],
  );
  const recordsBase = recordsBaseAjustada ?? recordsBaseDashboard;
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);

  return useMemo(() => {
    if (!ventana.disponible) return null;
    const { diasTranscurridos, anioActual, anioAnterior } = ventana;
    // Filtro de MES (panel principal o asistente): se cuentan SOLO esos
    // meses en los tres periodos (Total del año anterior incluido). La
    // ventana va del primer al último mes elegido, así que sin esto meses
    // sueltos como Jun, Jul y Dic arrastraban también Ago – Nov.
    const mesesSel = mesesElegidos(filters.mes);
    const enMeses = (r: CrimeRecord) => mesesSel.length === 0 || (r.mes != null && mesesSel.includes(r.mes));
    const recsActual = mesesSel.length ? ventana.recsActual.filter(enMeses) : ventana.recsActual;
    const recsAnterior = mesesSel.length ? ventana.recsAnterior.filter(enMeses) : ventana.recsAnterior;
    const recsAnioAnteriorCompleto = mesesSel.length ? ventana.recsAnioAnteriorCompleto.filter(enMeses) : ventana.recsAnioAnteriorCompleto;
    const totalGeneralFecha2026 = recsActual.length;

    // ── Cálculo de nodos (rendimiento) ───────────────────────────────
    // Mismas cifras de siempre, pero cada unidad recorre sus registros UNA
    // sola vez: antes se filtraban los años completos ~35 veces por unidad
    // y por cada delito (meses, trimestres, totales), y con ~80 unidades
    // la ventana de Microgerencia tardaba varios segundos en abrir.
    const recordsBaseAnteriores = recordsBase.filter((r) => r.anio != null && r.anio < anioActual && enMeses(r));
    const porMes = (lista: CrimeRecord[]) => {
      const m = new Array<number>(12).fill(0);
      for (const r of lista) if (r.mes != null && r.mes >= 1 && r.mes <= 12) m[r.mes - 1]++;
      return m;
    };
    function nodoBase(nombre: string, T: CrimeRecord[], Aa: CrimeRecord[], B: CrimeRecord[], hijos: NodoMicrogerencia[]): NodoMicrogerencia {
      const total2025 = T.length;
      const fecha2025 = Aa.length;
      const fecha2026 = B.length;
      const dif = fecha2026 - fecha2025;
      const pct = fecha2025 > 0 ? (dif / fecha2025) * 100 : (fecha2026 > 0 ? 100 : null);
      const aportePct = totalGeneralFecha2026 > 0 ? (fecha2026 / totalGeneralFecha2026) * 100 : 0;
      const casosDia = diasTranscurridos > 0 ? fecha2026 / diasTranscurridos : 0;
      const terminaAnio = casosDia * 365;
      const difConAnioAnterior = terminaAnio - total2025;
      const mT = porMes(T), mB = porMes(B);
      const meses: PuntoMes[] = NOMBRES_MES.map((etiqueta, i) => ({ etiqueta, anio2025: mT[i], anio2026: mB[i], dif: mB[i] - mT[i] }));
      const trimestres: PuntoTrimestre[] = TRIMESTRES.map(({ etiqueta, meses: ms }) => {
        const anio2025 = ms.reduce((s, m) => s + mT[m - 1], 0);
        const anio2026 = ms.reduce((s, m) => s + mB[m - 1], 0);
        return { etiqueta, anio2025, anio2026, dif: anio2026 - anio2025 };
      });
      return { nombre, total2025, fecha2025, fecha2026, dif, pct, aportePct, casosDia, terminaAnio, difConAnioAnterior, trimestres, meses, delitos: [], hijos };
    }
    const agrupar = (lista: CrimeRecord[]) => {
      const m = new Map<string, CrimeRecord[]>();
      for (const r of lista) { const l = m.get(r.delito); if (l) l.push(r); else m.set(r.delito, [r]); }
      return m;
    };

    function calcularNodo(nombre: string, pred: (r: CrimeRecord) => boolean, hijos: NodoMicrogerencia[] = [], incluirDelitos = true): NodoMicrogerencia {
      const T = recsAnioAnteriorCompleto.filter(pred);
      const Aa = recsAnterior.filter(pred);
      const B = recsActual.filter(pred);
      const nodo = nodoBase(nombre, T, Aa, B, hijos);
      if (!incluirDelitos) return nodo;
      // Barrios más afectados (año actual a la fecha) — para «Distribución territorial».
      const conteoBarrio = new Map<string, number>();
      for (const r of B) {
        const b = (r.barrioHecho ?? '').trim();
        if (!b || /^no reportad/i.test(b) || /^sin /i.test(b)) continue;
        conteoBarrio.set(b, (conteoBarrio.get(b) ?? 0) + 1);
      }
      const barrios = Array.from(conteoBarrio, ([n, casos]) => ({ nombre: n, casos })).sort((a, b) => b.casos - a.casos).slice(0, 10);
      // Histórico anual: los años que REALMENTE existen en los datos (sin
      // rellenar años vacíos); el año actual es el acumulado a la fecha.
      const porAnio = new Map<number, number>();
      for (const r of recordsBaseAnteriores) if (pred(r)) porAnio.set(r.anio!, (porAnio.get(r.anio!) ?? 0) + 1);
      const finAnio = new Date(anioActual, 11, 31);
      const historico = [
        ...Array.from(porAnio, ([anio, casos]) => ({ anio, casos, parcial: false })).sort((a, b) => a.anio - b.anio),
        { anio: anioActual, casos: nodo.fecha2026, parcial: ventana.actualFin < finAnio },
      ];
      // Desglose por delito: se agrupa una vez (mismo orden de aparición de antes).
      const gT = agrupar(T), gA = agrupar(Aa), gB = agrupar(B);
      const nombresDelitosNodo = Array.from(new Set([...B, ...Aa].map((r) => r.delito).filter((d) => d && d !== 'NO REPORTADO')));
      const delitosDelNodo = nombresDelitosNodo
        .map((d) => nodoBase(d, gT.get(d) ?? [], gA.get(d) ?? [], gB.get(d) ?? [], []))
        .sort((a, b) => b.fecha2026 - a.fecha2026);
      return { ...nodo, delitos: delitosDelNodo.map((d) => ({ ...d, tipo: 'delito' as const })), barrios, historico };
    }

    function cuadrantesDe(estacion: string, caiFiltro: string | null): NodoMicrogerencia[] {
      const universo = recsActual.filter((r) => r.estacion === estacion && (!caiFiltro || r.cai === caiFiltro) && r.cuadrante && r.cuadrante !== 'No Reportado');
      const cuadrantes = Array.from(new Set(universo.map((r) => r.cuadrante))).sort((a, b) => a.localeCompare(b, 'es'));
      return cuadrantes.map((cua) => ({ ...calcularNodo(cua, (r) => r.estacion === estacion && r.cuadrante === cua && (!caiFiltro || r.cai === caiFiltro)), estacion, tipo: 'zona' as const }));
    }

    function caisDe(estacion: string): NodoMicrogerencia[] {
      const universo = recsActual.filter((r) => r.estacion === estacion && r.cai && r.cai !== 'No Reportado');
      const cais = Array.from(new Set(universo.map((r) => r.cai))).sort(ordenarCai);
      return cais.map((cai) => ({ ...calcularNodo(cai, (r) => r.estacion === estacion && r.cai === cai, cuadrantesDe(estacion, cai)), estacion, tipo: 'cai' as const }));
    }

    const nodosDistrito1 = ESTACIONES_DISTRITO_1.map((est) => ({ ...calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est, caisDe(est)), estacion: est, tipo: 'estacion' as const }));
    const distrito1 = { ...calcularNodo('Distrito Uno', (r) => (ESTACIONES_DISTRITO_1 as readonly string[]).includes(r.estacion), nodosDistrito1), tipo: 'distrito' as const };

    const nodosDistrito2 = ESTACIONES_DISTRITO_2.map((est) => ({ ...calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est, cuadrantesDe(est, null)), estacion: est, tipo: 'estacion' as const }));
    const distrito2 = { ...calcularNodo('Distrito Dos', (r) => (ESTACIONES_DISTRITO_2 as readonly string[]).includes(r.estacion), nodosDistrito2), tipo: 'distrito' as const };

    const general = { ...calcularNodo('MEPOY General — Consolidado', () => true, [distrito1, distrito2]), tipo: 'general' as const };

    // Zonas de atención por estación (una por estación + zona, sin partir
    // por CAI) — para la cobertura «Zonas de Atención» del asistente.
    const zonas: NodoMicrogerencia[] = [...ESTACIONES_DISTRITO_1, ...ESTACIONES_DISTRITO_2].flatMap((est) => {
      const nombres = Array.from(new Set([...recsActual, ...recsAnterior].filter((r) => r.estacion === est && r.cuadrante && r.cuadrante !== 'No Reportado').map((r) => r.cuadrante)))
        .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
      return nombres.map((cua) => ({ ...calcularNodo(cua, (r) => r.estacion === est && r.cuadrante === cua), estacion: est, tipo: 'zona' as const }));
    });
    const delitos = general.delitos;

    // Barrios elegidos en el asistente: cada uno como unidad propia (solo
    // sus registros). Se ubica en la estación donde ocurre la mayoría.
    const barriosUnidad: NodoMicrogerencia[] = (ajustes?.barrios ?? []).map((b) => {
      const pred = (r: CrimeRecord) => (r.barrioHecho ?? '').trim() === b;
      const porEst = new Map<string, number>();
      for (const r of [...recsActual, ...recsAnterior]) if (pred(r)) porEst.set(r.estacion, (porEst.get(r.estacion) ?? 0) + 1);
      // Solo si casi todo el barrio cae en una estación (un mismo nombre
      // de barrio puede existir en varias); si no, se trata como de MEPOY.
      const total = [...porEst.values()].reduce((x, y) => x + y, 0);
      const [principal, casos] = [...porEst].sort((x, y) => y[1] - x[1])[0] ?? [];
      const estacion = principal && total > 0 && (casos ?? 0) / total >= 0.9 ? principal : undefined;
      return { ...calcularNodo(b, pred), tipo: 'barrio' as const, ...(estacion ? { estacion } : {}) };
    });

    return {
      diasHastaLaFecha: diasTranscurridos,
      periodo: `Del ${formatFecha(ventana.actualInicio)} al ${formatFecha(ventana.actualFin)} (vigencia ${anioActual} vs. ${anioAnterior})`,
      // Mismo rango que ya usa toda la Microgerencia para sus números (el
      // "año actual a la fecha") — se expone también como fecha simple
      // (aaaa-mm-dd) para que el mapa de calor filtre exactamente el mismo
      // periodo que las tablas, en vez de usar todo el histórico (ver
      // ModalMicrogerencia.tsx → generarImagenesParaNodos).
      actualInicio: ventana.actualInicio.toISOString().slice(0, 10),
      actualFin: ventana.actualFin.toISOString().slice(0, 10),
      anioActual, anioAnterior,
      fechaCorte: (() => {
        const ts = ventana.recsActual.reduce((m, r) => (r.fecha && r.fecha.getTime() > m ? r.fecha.getTime() : m), 0);
        const d = ts > 0 ? new Date(ts) : ventana.actualFin;
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })(),
      delitoFiltrado: filters.delito.length === 1 ? filters.delito[0] : filters.delito.length > 1 ? `${filters.delito.length} delitos seleccionados` : null,
      general, distrito1, distrito2, delitos, zonas, barriosUnidad,
      registros: { completo: recsAnioAnteriorCompleto, anterior: recsAnterior, actual: recsActual },
      mesesSeleccionados: mesesSel,
      periodoEtiqueta: etiquetaPeriodo(ventana.actualInicio, ventana.actualFin, mesesSel, !!(filters.fechaInicial && filters.fechaFinal)),
      comparacionEtiqueta: etiquetaPeriodo(ventana.anteriorInicio, ventana.anteriorFin, mesesSel, !!(filters.fechaInicial && filters.fechaFinal)),
      delitosSeleccionados: [...filters.delito],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventana, filters.delito, filters.barrioHecho, ajustes?.barrios]);
}

/**
 * Predicado de los registros de una unidad del árbol (las MISMAS reglas con
 * que se arman los nodos arriba): General, Distrito, Estación, CAI, Zona o Barrio.
 */
export function predicadoDeNodo(n: NodoMicrogerencia): (r: CrimeRecord) => boolean {
  if (n.tipo === 'general' || /^MEPOY General/.test(n.nombre)) return () => true;
  if (n.tipo === 'distrito' || n.nombre === 'Distrito Uno' || n.nombre === 'Distrito Dos') {
    const ests: readonly string[] = n.nombre === 'Distrito Uno' ? ESTACIONES_DISTRITO_1 : ESTACIONES_DISTRITO_2;
    return (r) => ests.includes(r.estacion);
  }
  if (n.tipo === 'cai') return (r) => r.estacion === n.estacion && r.cai === n.nombre;
  if (n.tipo === 'zona') return (r) => r.estacion === n.estacion && r.cuadrante === n.nombre;
  if (n.tipo === 'barrio') return (r) => (r.barrioHecho ?? '').trim() === n.nombre;
  if (n.estacion) return (r) => r.estacion === n.estacion;
  return () => false;
}
