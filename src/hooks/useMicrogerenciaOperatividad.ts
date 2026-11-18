import { agruparCircunstancia, contarOperatividad, cuentaComoOperatividad, gramosDroga, sumarDroga, tipoOperatividad } from '../utils/operatividadConteo';
import { GRUPOS_CICLO_VIDA } from '../utils/cicloVida';
import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import type { OperatividadRecord } from '../types/operatividad';
import { formatFecha } from '../utils/aggregations';
import type { DatosMicrogerencia, DetalleOperativo, NodoMicrogerencia, PuntoMes, PuntoTrimestre } from '../data/microgerencia';

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
function construirVentana(registros: OperatividadRecord[], periodo?: { inicio: string; fin: string } | null) {
  const conFecha = registros.filter((r) => r.fecha) as (OperatividadRecord & { fecha: Date })[];
  if (conFecha.length === 0) return null;
  const fechaMax = conFecha.reduce((max, r) => (r.fecha > max ? r.fecha : max), conFecha[0].fecha);
  // Asistente: el MISMO periodo de la lámina de Delictividad.
  const aFecha = (iso: string, finDia = false) => { const [a, m, d] = iso.split('-').map(Number); return finDia ? new Date(a, m - 1, d, 23, 59, 59) : new Date(a, m - 1, d); };
  const fin = periodo ? aFecha(periodo.fin, true) : fechaMax;
  const anioActual = fin.getFullYear();
  const anioAnterior = anioActual - 1;
  const actualInicio = periodo ? aFecha(periodo.inicio) : new Date(anioActual, 0, 1);
  // Corte real: el último dato dentro del periodo (no una fecha sin información).
  const actualFin = periodo ? conFecha.reduce<Date>((max, r) => (r.fecha <= fin && r.fecha > max ? r.fecha : max), actualInicio) : fechaMax;
  const anteriorInicio = new Date(anioAnterior, actualInicio.getMonth(), actualInicio.getDate());
  const anteriorFin = new Date(anioAnterior, actualFin.getMonth(), actualFin.getDate(), 23, 59, 59);
  const diasTranscurridos = Math.max(1, Math.round((actualFin.getTime() - actualInicio.getTime()) / 86400000) + 1);

  const recsActual = conFecha.filter((r) => r.fecha >= actualInicio && r.fecha <= actualFin);
  const recsAnterior = conFecha.filter((r) => r.fecha >= anteriorInicio && r.fecha <= anteriorFin);
  const recsAnioAnteriorCompleto = conFecha.filter((r) => r.anio === anioAnterior);
  return { recsActual, recsAnterior, recsAnioAnteriorCompleto, diasTranscurridos, anioActual, anioAnterior, actualInicio, actualFin, anteriorInicio, anteriorFin };
}

/**
 * Ajustes del asistente de Microgerencia: delitos asociados y el periodo de
 * la lámina de Delictividad. Sin ajustes, se usa todo como siempre (filtros
 * generales del dashboard y su propia fecha de corte).
 */
export interface AjustesOperatividad { delitos: string[]; periodo: { inicio: string; fin: string } | null }

export function useMicrogerenciaOperatividad(ajustes?: AjustesOperatividad | null): DatosMicrogerencia | null {
  const { filteredOperatividadRecords: filtradosDashboard, operatividadRecords, filters, records } = useData();
  // Con ajustes: la parte territorial la maneja el árbol del asistente, así
  // que solo se aplican el delito asociado elegido y los filtros propios de
  // Operatividad (categoría, zona urbana/rural).
  const filteredOperatividadRecords = useMemo(() => {
    if (!ajustes) return filtradosDashboard;
    return operatividadRecords.filter((r) => {
      if (ajustes.delitos.length > 0 && !ajustes.delitos.includes(r.delitoAsociado)) return false;
      if ((filters.categoriaOperatividad ?? []).length > 0 && !filters.categoriaOperatividad.includes(r.categoria)) return false;
      if (filters.zona.length > 0 && !filters.zona.includes(r.zona)) return false;
      return true;
    });
  }, [ajustes, filtradosDashboard, operatividadRecords, filters.categoriaOperatividad, filters.zona]);

  // Operatividad no trae una columna de CAI propia — pero SÍ trae
  // cuadrante, con el MISMO formato de código que Delictividad
  // (confirmado: mapearCuadrante/traducirDependenciaAZona son las mismas
  // funciones). Como Delictividad SÍ tiene cuadrante Y CAI juntos en el
  // mismo registro, se arma un cruce cuadrante→CAI a partir de ESOS
  // registros y se le aplica a Operatividad — así se puede armar el nivel
  // de CAI para Operatividad sin que el archivo lo traiga directamente.
  const cuadranteACai = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const r of records) {
      if (r.cuadrante && r.cuadrante !== 'No Reportado' && r.cai && r.cai !== 'No Reportado' && !mapa.has(r.cuadrante)) {
        mapa.set(r.cuadrante, r.cai);
      }
    }
    return mapa;
  }, [records]);

  return useMemo(() => {
    // Conteo oficial: solo los registros que cuentan (la droga va por cantidad, aparte).
    const contables = filteredOperatividadRecords.filter(cuentaComoOperatividad);
    const ventana = construirVentana(contables, ajustes?.periodo);
    if (!ventana) return null;
    const { recsActual, recsAnterior, recsAnioAnteriorCompleto, diasTranscurridos, anioActual, anioAnterior } = ventana;
    // Todos los registros (incluida la droga, que va por cantidad) en cada periodo.
    const enRango = (r: OperatividadRecord, a: Date, b: Date) => !!r.fecha && r.fecha >= a && r.fecha <= b;
    const todosActual = filteredOperatividadRecords.filter((r) => enRango(r, ventana.actualInicio, ventana.actualFin));
    const todosAnterior = filteredOperatividadRecords.filter((r) => enRango(r, ventana.anteriorInicio, ventana.anteriorFin));
    const lista = (filas: { key: string; casos: number }[]) => filas.filter((f) => f.key && !/^no reportad/i.test(f.key)).map((f) => ({ nombre: f.key, valor: f.casos }));

    /** Detalle de la lámina de Operatividad (periodo comparable del año actual). */
    function detalleOperativo(pred: (r: OperatividadRecord) => boolean): DetalleOperativo {
      const act = todosActual.filter(pred);
      const capt = act.filter((r) => tipoOperatividad(r.categoria) === 'capturas');
      const edades = new Map(contarOperatividad(capt, (r) => r.grupoEdad || '').map((d) => [d.key, d.casos] as const));
      return {
        drogaG2026: act.reduce((a, r) => a + gramosDroga(r), 0),
        drogaG2025: todosAnterior.filter(pred).reduce((a, r) => a + gramosDroga(r), 0),
        drogaPorClase: lista(sumarDroga(act, (r) => r.claseBien || 'Sin clase')),
        capturasPorDelito: lista(contarOperatividad(capt, (r) => r.delitoAsociado || '')),
        circunstancia: lista(contarOperatividad(capt, (r) => agruparCircunstancia(r.circunstanciaCaptura))),
        genero: lista(contarOperatividad(capt, (r) => r.genero ?? '')),
        grupoEdad: GRUPOS_CICLO_VIDA.filter((g) => (edades.get(g) ?? 0) > 0).map((g) => ({ nombre: g, valor: edades.get(g)! })),
      };
    }
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
      // Para la lámina ejecutiva (mismas cifras; solo se presentan):
      // barrios del año actual e histórico anual de los años con datos.
      let barrios: { nombre: string; casos: number }[] | undefined;
      let historico: { anio: number; casos: number; parcial: boolean }[] | undefined;
      if (incluirCategorias) {
        const conteoBarrio = new Map<string, number>();
        for (const r of recsActual) {
          if (!pred(r)) continue;
          const b = (r.barrioHecho ?? '').trim();
          if (!b || /^no reportad/i.test(b) || /^sin /i.test(b)) continue;
          conteoBarrio.set(b, (conteoBarrio.get(b) ?? 0) + 1);
        }
        barrios = Array.from(conteoBarrio, ([nombre, casos]) => ({ nombre, casos })).sort((a, b) => b.casos - a.casos).slice(0, 10);
        const porAnio = new Map<number, number>();
        for (const r of contables) {
          if (r.anio == null || r.anio >= anioActual || !pred(r)) continue;
          porAnio.set(r.anio, (porAnio.get(r.anio) ?? 0) + 1);
        }
        historico = [
          ...Array.from(porAnio, ([anio, casos]) => ({ anio, casos, parcial: false })).sort((a, b) => a.anio - b.anio),
          { anio: anioActual, casos: fecha2026, parcial: ventana!.actualFin < new Date(anioActual, 11, 31) },
        ];
      }
      const operativo = incluirCategorias ? detalleOperativo(pred) : undefined;
      return { nombre, total2025, fecha2025, fecha2026, dif, pct, aportePct, casosDia, terminaAnio, difConAnioAnterior, trimestres, meses, delitos: categoriasDelNodo, hijos, barrios, historico, operativo };
    }

    function caisDe(estacion: string): NodoMicrogerencia[] {
      const universo = recsActual.filter((r) => r.estacion === estacion && cuadranteACai.get(r.cuadrante));
      const cais = Array.from(new Set(universo.map((r) => cuadranteACai.get(r.cuadrante)!))).sort((a, b) => a.localeCompare(b, 'es'));
      return cais.map((cai) => ({ ...calcularNodo(`${cai} (Operatividad)`, (r) => r.estacion === estacion && cuadranteACai.get(r.cuadrante) === cai), tipo: 'cai' as const, estacion }));
    }

    // Distrito Uno / Dos + estaciones — misma estructura que Delictividad.
    // "Comuna" no es un campo propio de Operatividad (no existe esa
    // columna en esta matriz); la agrupación más cercana disponible es la
    // Estación, así que el desglose por unidad queda a ese nivel.
    const nodosDistrito1 = ESTACIONES_DISTRITO_1.map((est) => ({ ...calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est, caisDe(est)), tipo: 'estacion' as const, estacion: est }));
    const distrito1 = { ...calcularNodo('Distrito Uno (Operatividad)', (r) => (ESTACIONES_DISTRITO_1 as readonly string[]).includes(r.estacion), nodosDistrito1), tipo: 'distrito' as const };
    const nodosDistrito2 = ESTACIONES_DISTRITO_2.map((est) => ({ ...calcularNodo(NOMBRES_ESTACION[est], (r) => r.estacion === est, caisDe(est)), tipo: 'estacion' as const, estacion: est }));
    const distrito2 = { ...calcularNodo('Distrito Dos (Operatividad)', (r) => (ESTACIONES_DISTRITO_2 as readonly string[]).includes(r.estacion), nodosDistrito2), tipo: 'distrito' as const };
    const general = { ...calcularNodo('Operatividad — Consolidado', () => true, [distrito1, distrito2]), tipo: 'general' as const };
    // Zonas de atención (mismo vocabulario de Delictividad: el cuadrante).
    const zonas: NodoMicrogerencia[] = [];
    for (const est of [...ESTACIONES_DISTRITO_1, ...ESTACIONES_DISTRITO_2]) {
      const nombresZona = Array.from(new Set([...recsActual, ...recsAnterior].filter((r) => r.estacion === est && r.cuadrante && r.cuadrante !== 'No Reportado').map((r) => r.cuadrante))).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
      for (const z of nombresZona) zonas.push({ ...calcularNodo(`${z} (Operatividad)`, (r) => r.estacion === est && r.cuadrante === z), tipo: 'zona' as const, estacion: est });
    }
    const fechaCorte = (() => {
      const d = ventana.actualFin;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    return {
      diasHastaLaFecha: diasTranscurridos,
      periodo: `Del ${formatFecha(ventana.actualInicio)} al ${formatFecha(ventana.actualFin)} (vigencia ${anioActual} vs. ${anioAnterior})`,
      actualInicio: ventana.actualInicio.toISOString().slice(0, 10),
      actualFin: ventana.actualFin.toISOString().slice(0, 10),
      anioActual, anioAnterior,
      delitoFiltrado: null, fechaCorte,
      general, distrito1, distrito2, delitos: general.delitos, zonas,
    };
  }, [filteredOperatividadRecords, ajustes?.periodo?.inicio, ajustes?.periodo?.fin]); // eslint-disable-line react-hooks/exhaustive-deps
}
