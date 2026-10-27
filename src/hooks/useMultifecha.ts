import { useCallback, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { aplicarFiltros, fechaHoraDeRegistro, limiteDePeriodo } from '../utils/filters';
import { anioDePeriodo, textoRango } from '../utils/vigenciasMultifecha';
import { esValorPendiente } from '../utils/valoresPendientes';
import type { CrimeRecord, PeriodoAnalisis } from '../types/crime';

// ───────────────────────────────────────────────────────────────────────────
// FUENTE ÚNICA del módulo Multifecha. Todas las tarjetas, tablas, resumen,
// matriz de calor, mapa y últimas 4 semanas leen de aquí, para que nunca
// muestren cifras distintas entre sí.
//  · Filtros generales (delito, estación, CAI, …) se aplican primero; la
//    fecha, el Año y el Mes NO, porque el tiempo lo define cada vigencia.
//  · Cada vigencia cuenta SOLO los registros dentro de su propio rango
//    (fecha + horario); una vigencia (año) puede tener varios rangos y
//    cuenta su UNIÓN — un registro nunca se cuenta dos veces.
//  · Variación = ÚLTIMA vigencia − PRIMERA vigencia (orden cronológico).
//    Variación % = variación / primera × 100; si la primera es 0 → null (N/A).
// ───────────────────────────────────────────────────────────────────────────

export interface VigenciaMF {
  id: string;
  anio: number;
  /** "2025". */
  etiqueta: string;
  /** "4–7 sep" (o "4–7 sep + 20–23 sep" con varios periodos). */
  rango: string;
  /** Primer periodo (el predeterminado). */
  periodo: PeriodoAnalisis;
  /** Todos los periodos del año, en orden cronológico. */
  periodos: { periodo: PeriodoAnalisis; inicio: Date; fin: Date }[];
  inicio: Date;
  fin: Date;
  registros: CrimeRecord[];
}

export interface FilaVigencias {
  key: string;
  porVigencia: number[];
  total: number;
  primera: number;
  ultima: number;
  varAbs: number;
  varPct: number | null;
}

export function variacionPct(primera: number, ultima: number): number | null {
  return primera > 0 ? ((ultima - primera) / primera) * 100 : null;
}

export function useMultifecha() {
  const { records, filters, periodos, drillDown } = useData();

  const base = useMemo(
    () => aplicarFiltros(records, { ...filters, fechaInicial: null, fechaFinal: null, anio: [], mes: [] }),
    [records, filters],
  );

  const vigencias: VigenciaMF[] = useMemo(() => {
    // Una vigencia = un AÑO, con uno o varios periodos (rangos) propios.
    // Sus casos son la UNIÓN de esos rangos: un registro que caiga en dos
    // periodos superpuestos se cuenta una sola vez.
    const validos = periodos
      .filter((p) => p.fechaInicial && p.fechaFinal && p.fechaInicial <= p.fechaFinal)
      .map((p) => ({ p, inicio: limiteDePeriodo(p.fechaInicial, p.horaInicial || '00:00'), fin: limiteDePeriodo(p.fechaFinal, p.horaFinal || '23:59') }));
    const porAnio = new Map<number, typeof validos>();
    for (const v of validos) {
      const anio = anioDePeriodo(v.p) ?? v.inicio.getFullYear();
      porAnio.set(anio, [...(porAnio.get(anio) ?? []), v]);
    }
    const anios = Array.from(porAnio.keys()).sort((a, b) => a - b);
    const asignados = new Set<string>();
    return anios.map((anio) => {
      const rangos = porAnio.get(anio)!.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
      const registros: CrimeRecord[] = [];
      for (const r of base) {
        if (asignados.has(r.__id)) continue;
        const fh = fechaHoraDeRegistro(r);
        if (fh && rangos.some((x) => fh >= x.inicio && fh <= x.fin)) { registros.push(r); asignados.add(r.__id); }
      }
      return {
        id: `vig-${anio}`,
        anio,
        etiqueta: String(anio),
        rango: rangos.map((x) => textoRango(x.p.fechaInicial, x.p.fechaFinal)).join(' + '),
        periodo: rangos[0].p,
        periodos: rangos.map((x) => ({ periodo: x.p, inicio: x.inicio, fin: x.fin })),
        inicio: rangos[0].inicio,
        fin: rangos.reduce((m, x) => (x.fin > m ? x.fin : m), rangos[0].fin),
        registros,
      };
    });
  }, [periodos, base]);

  const union = useMemo(() => vigencias.flatMap((v) => v.registros), [vigencias]);
  const primera = vigencias[0] ?? null;
  const ultima = vigencias.length > 0 ? vigencias[vigencias.length - 1] : null;
  const comparable = vigencias.length >= 2;
  const totalPrimera = primera?.registros.length ?? 0;
  const totalUltima = ultima?.registros.length ?? 0;

  /** Casos por vigencia para una dimensión (delito, estación, CAI, …). */
  const tabla = useCallback((getter: (r: CrimeRecord) => string | null | undefined): FilaVigencias[] => {
    const conteo = new Map<string, number[]>();
    vigencias.forEach((v, i) => {
      for (const r of v.registros) {
        const k = getter(r);
        if (!k || esValorPendiente(k) || k === 'NO REPORTADO') continue;
        let fila = conteo.get(k);
        if (!fila) { fila = new Array(vigencias.length).fill(0); conteo.set(k, fila); }
        fila[i]++;
      }
    });
    const n = vigencias.length;
    return Array.from(conteo.entries())
      .map(([key, porVigencia]) => {
        const p0 = porVigencia[0] ?? 0;
        const pN = porVigencia[n - 1] ?? 0;
        return { key, porVigencia, total: porVigencia.reduce((a, b) => a + b, 0), primera: p0, ultima: pN, varAbs: pN - p0, varPct: variacionPct(p0, pN) };
      })
      .sort((a, b) => b.ultima - a.ultima || b.total - a.total || a.key.localeCompare(b.key, 'es'));
  }, [vigencias]);

  return {
    base,
    vigencias,
    union,
    primera,
    ultima,
    comparable,
    totalGeneral: union.length,
    totalPrimera,
    totalUltima,
    varAbs: totalUltima - totalPrimera,
    varPct: variacionPct(totalPrimera, totalUltima),
    tabla,
    drillDown,
    filters,
  };
}

export type ContextoMultifecha = ReturnType<typeof useMultifecha>;
