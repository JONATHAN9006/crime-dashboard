import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import type { OperatividadRecord } from '../types/operatividad';
import { formatFecha } from '../utils/aggregations';
import type { DatosMicrogerencia, NodoMicrogerencia, PuntoMes, PuntoTrimestre } from '../data/microgerencia';

// Mismas estaciones y mismos nombres que useMicrogerencia.ts (Delictividad)
// — Operatividad usa las mismas 5 estaciones (confirmado: mismos nombres de
// campo que CrimeRecord, ver types/operatividad.ts), así que el Distrito
// Uno/Dos se arma exactamente igual.
const ESTACIONES_DISTRITO_1 = ['E-Norte', 'E-Sur'] as const;
const ESTACIONES_DISTRITO_2 = ['E-Timbio', 'E-Coconuco', 'E-Sotara'] as const;
// Nombres CON "(Operatividad)" al final — a propósito, para que nunca
// choquen con los nodos de Delictividad ("Distrito Uno", "Estación
// Norte"...) cuando ambos grupos de nodos se combinan en el MISMO PDF: el
// PDF identifica cada tarjeta por su nombre, así que dos fuentes con
// nombres idénticos se pisarían entre sí (la altura/escala calculada para
// una sobrescribiría a la otra). También deja más claro, con solo mirar
// el título de la página, de qué fuente es cada una.
const NOMBRES_ESTACION: Record<string, string> = {
  'E-Norte': 'Estación Norte (Operatividad)', 'E-Sur': 'Estación Sur (Operatividad)',
  'E-Timbio': 'Estación Timbio (Operatividad)', 'E-Coconuco': 'Estación Coconuco (Operatividad)', 'E-Sotara': 'Estación Sotara (Operatividad)',
};
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TRIMESTRES: { etiqueta: string; meses: number[] }[] = [
  { etiqueta: '1er Trimestre', meses: [1, 2, 3] },
  { etiqueta: '2do Trimestre', meses: [4, 5, 6] },
  { etiqueta: '3er Trimestre', meses: [7, 8, 9] },
  { etiqueta: '4to Trimestre', meses: [10, 11, 12] },
];

/**
 * Ventana comparativa SIMPLIFICADA (año actual "a la fecha" vs. mismo corte
 * del año anterior) — misma idea que useVentanaComparativa, pero genérica
 * sobre cualquier registro con fecha/año, para poder reutilizarla aquí con
 * OperatividadRecord en vez de CrimeRecord.
 */
function construirVentana(registros: OperatividadRecord[]) {
  const conFecha = registros.filter((r) => r.fecha) as (OperatividadRecord & { fecha: Date })[];
  if (conFecha.length === 0) return null;
  const fechaMax = conFecha.reduce((max, r) => (r.fecha > max ? r.fecha : max), conFecha[0].fecha);
  const anioActual = fechaMax.getFullYear();
  const anioAnterior = anioActual - 1;
  const actualInicio = new Date(anioActual, 0, 1);
  const actualFin = fechaMax;
  const anteriorInicio = new Date(anioAnterior, 0, 1);
  const anteriorFin = new Date(anioAnterior, fechaMax.getMonth(), fechaMax.getDate());
  const diasTranscurridos = Math.max(1, Math.round((actualFin.getTime() - actualInicio.getTime()) / 86400000) + 1);

  const recsActual = conFecha.filter((r) => r.fecha >= actualInicio && r.fecha <= actualFin);
  const recsAnterior = conFecha.filter((r) => r.fecha >= anteriorInicio && r.fecha <= anteriorFin);
  const recsAnioAnteriorCompleto = conFecha.filter((r) => r.anio === anioAnterior);
  return { recsActual, recsAnterior, recsAnioAnteriorCompleto, diasTranscurridos, anioActual, anioAnterior, actualInicio, actualFin };
}

export function useMicrogerenciaOperatividad(): DatosMicrogerencia | null {
  const { filteredOperatividadRecords } = useData();

  return useMemo(() => {
    const ventana = construirVentana(filteredOperatividadRecords);
    if (!ventana) return null;
    const { recsActual, recsAnterior, recsAnioAnteriorCompleto, diasTranscurridos, anioActual, anioAnterior } = ventana;
    const totalGeneralFecha2026 = recsActual.length;

    function calcularTrimestresYMeses(pred: (r: OperatividadRecord) => boolean) {
      const meses: PuntoMes[] = NOMBRES_MES.map((etiqueta, i) => {
        const mesNum = i + 1;
        const anio2025 = recsAnioAnteriorCompleto.filter((r) => pred(r) && r.mes === mesNum).length;
        const anio2026 = recsActual.filter((r) => pred(r) && r.mes === mesNum).length;
        return { etiqueta, anio2025, anio2026, dif: anio2026 - anio2025 };
      });
      const trimestres: PuntoTrimestre[] = TRIMESTRES.map(({ etiqueta, meses: mesesTrimestre }) => {
        const anio2025 = recsAnioAnteriorCompleto.filter((r) => pred(r) && r.mes !== null && mesesTrimestre.includes(r.mes)).length;
        const anio2026 = recsActual.filter((r) => pred(r) && r.mes !== null && mesesTrimestre.includes(r.mes)).length;
        return { etiqueta, anio2025, anio2026, dif: anio2026 - anio2025 };
      });
      return { trimestres, meses };
    }

    function calcularNodo(nombre: string, pred: (r: OperatividadRecord) => boolean, hijos: NodoMicrogerencia[] = [], incluirCategorias = true): NodoMicrogerencia {
      const total2025 = recsAnioAnteriorCompleto.filter(pred).length;
      const fecha2025 = recsAnterior.filter(pred).length;
      const fecha2026 = recsActual.filter(pred).length;
      const dif = fecha2026 - fecha2025;
      const pct = fecha2025 > 0 ? (dif / fecha2025) * 100 : (fecha2026 > 0 ? 100 : null);
      const aportePct = totalGeneralFecha2026 > 0 ? (fecha2026 / totalGeneralFecha2026) * 100 : 0;
      const casosDia = diasTranscurridos > 0 ? fecha2026 / diasTranscurridos : 0;
      const terminaAnio = casosDia * 365;
      const difConAnioAnterior = terminaAnio - total2025;
      const { trimestres, meses } = calcularTrimestresYMeses(pred);
      // "delitos" se reutiliza para el Top 10 de CATEGORÍAS (capturas,
      // incautaciones, etc.) — mismo mecanismo que el desglose por delito
      // de Delictividad, ordenado de mayor a menor y recortado a 10 en la
      // tarjeta (dibujarTarjetaNodo ya hace ese recorte).
      let categoriasDelNodo: NodoMicrogerencia[] = [];
      if (incluirCategorias) {
        const universo = [...recsActual, ...recsAnterior].filter(pred);
        const nombresCategorias = Array.from(new Set(universo.map((r) => r.categoria).filter((c) => c && c !== 'NO REPORTADO')));
        categoriasDelNodo = nombresCategorias
          .map((cat) => calcularNodo(cat, (r) => pred(r) && r.categoria === cat, [], false))
          .sort((a, b) => b.fecha2026 - a.fecha2026);
      }
      return { nombre, total2025, fecha2025, fecha2026, dif, pct, aportePct, casosDia, terminaAnio, difConAnioAnterior, trimestres, meses, delitos: categoriasDelNodo, hijos };
    }

    // Distrito Uno / Dos + estaciones — misma estructura que Delictividad.
    // "Comuna" no es un campo propio de Operatividad (no existe esa
    // columna en esta matriz); la agrupación más cercana disponible es la
    // Estación, así que el desglose por unidad queda a ese nivel.
    const nodosDistrito1 = ESTACIONES_DISTRITO_1.map((est) => calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est));
    const distrito1 = calcularNodo('Distrito Uno (Operatividad)', (r) => (ESTACIONES_DISTRITO_1 as readonly string[]).includes(r.estacion), nodosDistrito1);
    const nodosDistrito2 = ESTACIONES_DISTRITO_2.map((est) => calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est));
    const distrito2 = calcularNodo('Distrito Dos (Operatividad)', (r) => (ESTACIONES_DISTRITO_2 as readonly string[]).includes(r.estacion), nodosDistrito2);
    const general = calcularNodo('Operatividad — Consolidado', () => true, [distrito1, distrito2]);

    return {
      diasHastaLaFecha: diasTranscurridos,
      periodo: `Del ${formatFecha(ventana.actualInicio)} al ${formatFecha(ventana.actualFin)} (vigencia ${anioActual} vs. ${anioAnterior})`,
      actualInicio: ventana.actualInicio.toISOString().slice(0, 10),
      actualFin: ventana.actualFin.toISOString().slice(0, 10),
      anioActual, anioAnterior,
      delitoFiltrado: null,
      general, distrito1, distrito2, delitos: general.delitos,
    };
  }, [filteredOperatividadRecords]);
}
