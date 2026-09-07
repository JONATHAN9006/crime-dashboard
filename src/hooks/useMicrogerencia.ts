import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useVentanaComparativa } from './useComparativoHomologo';
import { emptyFilterState } from '../types/crime';
import type { CrimeRecord } from '../types/crime';
import { formatFecha } from '../utils/aggregations';
import type { DatosMicrogerencia, NodoMicrogerencia, PuntoMes, PuntoTrimestre } from '../data/microgerencia';

const ESTACIONES_DISTRITO_1 = ['E-Norte', 'E-Sur'] as const;
const ESTACIONES_DISTRITO_2 = ['E-Timbio', 'E-Coconuco', 'E-Sotara'] as const;
const NOMBRES_ESTACION: Record<string, string> = {
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
 * "records" (todo lo ya cargado en el dashboard, el mismo Excel/CSV que se
 * sube por "Actualizar información") — nunca de un archivo separado.
 * Reutiliza useVentanaComparativa (la MISMA lógica de ventana homóloga que
 * ya usa el resto del dashboard), ignorando a propósito los filtros de la
 * barra lateral: es un reporte de estado general de TODA la unidad.
 *
 * Mantiene EXACTAMENTE las mismas columnas que trae la Hoja3 del Excel
 * original (Total 2025, año a la fecha ×2, DIF, %, Aporte %, Proyección,
 * Trimestres, Meses) en cada nivel — estación, CAI, zona de atención y
 * delito — para no perder esa estructura.
 */
export function useMicrogerencia(): DatosMicrogerencia | null {
  const { records, meta } = useData();
  const ventana = useVentanaComparativa(records, emptyFilterState, records, meta?.fechaMaxParametro);

  return useMemo(() => {
    if (!ventana.disponible) return null;
    const { recsActual, recsAnterior, recsAnioAnteriorCompleto, diasTranscurridos, anioActual, anioAnterior } = ventana;
    const totalGeneralFecha2026 = recsActual.length;

    function calcularTrimestresYMeses(pred: (r: CrimeRecord) => boolean): { trimestres: PuntoTrimestre[]; meses: PuntoMes[] } {
      const meses: PuntoMes[] = NOMBRES_MES.map((etiqueta, i) => {
        const mesNum = i + 1;
        const anio2025 = recsAnterior.filter((r) => pred(r) && r.mes === mesNum).length;
        const anio2026 = recsActual.filter((r) => pred(r) && r.mes === mesNum).length;
        return { etiqueta, anio2025, anio2026, dif: anio2026 - anio2025 };
      });
      const trimestres: PuntoTrimestre[] = TRIMESTRES.map(({ etiqueta, meses: mesesTrimestre }) => {
        const anio2025 = recsAnterior.filter((r) => pred(r) && r.mes !== null && mesesTrimestre.includes(r.mes)).length;
        const anio2026 = recsActual.filter((r) => pred(r) && r.mes !== null && mesesTrimestre.includes(r.mes)).length;
        return { etiqueta, anio2025, anio2026, dif: anio2026 - anio2025 };
      });
      return { trimestres, meses };
    }

    function calcularNodo(nombre: string, pred: (r: CrimeRecord) => boolean, hijos: NodoMicrogerencia[] = []): NodoMicrogerencia {
      const total2025 = recsAnioAnteriorCompleto.filter(pred).length;
      const fecha2025 = recsAnterior.filter(pred).length;
      const fecha2026 = recsActual.filter(pred).length;
      const dif = fecha2026 - fecha2025;
      const pct = fecha2025 > 0 ? (dif / fecha2025) * 100 : null;
      const aportePct = totalGeneralFecha2026 > 0 ? (fecha2026 / totalGeneralFecha2026) * 100 : 0;
      const casosDia = diasTranscurridos > 0 ? fecha2026 / diasTranscurridos : 0;
      const terminaAnio = casosDia * 365;
      const difConAnioAnterior = terminaAnio - total2025;
      const { trimestres, meses } = calcularTrimestresYMeses(pred);
      return { nombre, total2025, fecha2025, fecha2026, dif, pct, aportePct, casosDia, terminaAnio, difConAnioAnterior, trimestres, meses, hijos };
    }

    function cuadrantesDe(estacion: string, caiFiltro: string | null): NodoMicrogerencia[] {
      const universo = recsActual.filter((r) => r.estacion === estacion && (!caiFiltro || r.cai === caiFiltro) && r.cuadrante && r.cuadrante !== 'No Reportado');
      const cuadrantes = Array.from(new Set(universo.map((r) => r.cuadrante))).sort((a, b) => a.localeCompare(b, 'es'));
      return cuadrantes.map((cua) => calcularNodo(cua, (r) => r.estacion === estacion && r.cuadrante === cua && (!caiFiltro || r.cai === caiFiltro)));
    }

    function caisDe(estacion: string): NodoMicrogerencia[] {
      const universo = recsActual.filter((r) => r.estacion === estacion && r.cai && r.cai !== 'No Reportado');
      const cais = Array.from(new Set(universo.map((r) => r.cai))).sort(ordenarCai);
      return cais.map((cai) => calcularNodo(cai, (r) => r.estacion === estacion && r.cai === cai, cuadrantesDe(estacion, cai)));
    }

    const nodosDistrito1 = ESTACIONES_DISTRITO_1.map((est) => calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est, caisDe(est)));
    const distrito1 = calcularNodo('Distrito Uno', (r) => (ESTACIONES_DISTRITO_1 as readonly string[]).includes(r.estacion), nodosDistrito1);

    const nodosDistrito2 = ESTACIONES_DISTRITO_2.map((est) => calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est, cuadrantesDe(est, null)));
    const distrito2 = calcularNodo('Distrito Dos', (r) => (ESTACIONES_DISTRITO_2 as readonly string[]).includes(r.estacion), nodosDistrito2);

    const general = calcularNodo('MEPOY General — Consolidado', () => true, [distrito1, distrito2]);

    const nombresDelitos = Array.from(new Set([...recsActual, ...recsAnterior].map((r) => r.delito).filter((d) => d && d !== 'NO REPORTADO')));
    const delitos = nombresDelitos
      .map((delito) => calcularNodo(delito, (r) => r.delito === delito))
      .sort((a, b) => b.fecha2026 - a.fecha2026);

    return {
      diasHastaLaFecha: diasTranscurridos,
      periodo: `Del ${formatFecha(ventana.actualInicio)} al ${formatFecha(ventana.actualFin)} (vigencia ${anioActual} vs. ${anioAnterior})`,
      anioActual, anioAnterior,
      general, distrito1, distrito2, delitos,
    };
  }, [ventana]);
}
