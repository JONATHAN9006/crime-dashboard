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
    // Todos los registros (incluida la droga, que va por cantidad) en cada
    // periodo: «Total año anterior» (1 ene – 31 dic) y los dos periodos
    // comparables al MISMO corte. Un registro sin fecha pero con año y mes
    // se ubica por su mes (solo pasa con matrices antiguas).
    const enRango = (r: OperatividadRecord, a: Date, b: Date) => {
      if (r.fecha) return r.fecha >= a && r.fecha <= b;
      if (r.anio == null || r.mes == null) return false;
      const ini = new Date(r.anio, r.mes - 1, 1), fin = new Date(r.anio, r.mes, 0, 23, 59, 59);
      return ini >= new Date(a.getFullYear(), a.getMonth(), 1) && fin <= new Date(b.getFullYear(), b.getMonth() + 1, 0, 23, 59, 59) && r.anio === b.getFullYear();
    };
    const todosActual = filteredOperatividadRecords.filter((r) => enRango(r, ventana.actualInicio, ventana.actualFin));
    const todosAnterior = filteredOperatividadRecords.filter((r) => enRango(r, ventana.anteriorInicio, ventana.anteriorFin));
    const todosAnioAnterior = filteredOperatividadRecords.filter((r) => r.anio === anioAnterior);
    const valido = (k: string) => !!k && !/^no reportad/i.test(k) && !/^sin (clase|categor)/i.test(k);

    /** Agrupa por clave en los tres periodos (casos que cuentan, o gramos de droga). */
    function triple(base: OperatividadRecord[][], clave: (r: OperatividadRecord) => string, medida: 'casos' | 'gramos') {
      const m = new Map<string, { t: number; a: number; b: number }>();
      (['t', 'a', 'b'] as const).forEach((campo, i) => {
        for (const r of base[i]) {
          const v = medida === 'gramos' ? gramosDroga(r) : cuentaComoOperatividad(r) ? 1 : 0;
          if (!v) continue;
          const k = clave(r);
          if (!valido(k)) continue;
          const fila = m.get(k) ?? { t: 0, a: 0, b: 0 };
          fila[campo] += v;
          m.set(k, fila);
        }
      });
      return Array.from(m, ([nombre, f]) => ({ nombre, ...f })).sort((x, y) => y.b - x.b || y.a - x.a);
    }
    // Permiso del arma: «sin permiso» / «con permiso» (valores de la matriz).
    const grupoPermiso = (v: string) => {
      const n = (v || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').trim();
      if (!n || /NO REPORT/.test(n)) return '';
      return /\bSIN\b|\bNO\b|ILEGAL/.test(n) ? 'Sin permiso' : 'Con permiso';
    };

    /** Detalle de la lámina de Operatividad: Total año anterior · año anterior al corte · año actual al corte. */
    function detalleOperativo(pred: (r: OperatividadRecord) => boolean): DetalleOperativo {
      const base = [todosAnioAnterior.filter(pred), todosAnterior.filter(pred), todosActual.filter(pred)];
      const de = (tipo: string) => base.map((l) => l.filter((r) => tipoOperatividad(r.categoria) === tipo));
      const capt = de('capturas');
      const edades = triple(capt, (r) => r.grupoEdad || '', 'casos');
      const drogaTot = triple(de('droga'), () => 'total', 'gramos')[0] ?? { t: 0, a: 0, b: 0 };
      const generos = new Map(contarOperatividad(capt[2], (r) => r.genero ?? '').map((d) => [d.key, d.casos] as const));
      return {
        drogaG2025: drogaTot.a,
        drogaG2026: drogaTot.b,
        drogaGTotal2025: drogaTot.t,
        drogaPorClase: triple(de('droga'), (r) => r.claseBien || '', 'gramos'),
        capturasPorDelito: triple(capt, (r) => r.delitoAsociado || '', 'casos'),
        circunstancia: triple(capt, (r) => agruparCircunstancia(r.circunstanciaCaptura), 'casos'),
        genero: Array.from(generos, ([nombre, valor]) => ({ nombre, valor })).filter((g) => valido(g.nombre)).sort((x, y) => y.valor - x.valor),
        grupoEdad: GRUPOS_CICLO_VIDA.map((g) => edades.find((e) => e.nombre === g)).filter((e): e is NonNullable<typeof e> => !!e),
        armasPermiso: triple(de('armas'), (r) => grupoPermiso(r.permisoArma), 'casos'),
      };
    }

    const totalGeneralFecha2026 = recsActual.length;

    // Mismas cifras, recorriendo los registros de cada unidad UNA sola vez
    // (antes ~35 filtros por unidad y por categoría: abría muy lento).
    const contablesAnteriores = contables.filter((r) => r.anio != null && r.anio < anioActual);
    const porMes = (lista: OperatividadRecord[]) => {
      const m = new Array<number>(12).fill(0);
      for (const r of lista) if (r.mes != null && r.mes >= 1 && r.mes <= 12) m[r.mes - 1]++;
      return m;
    };
    function nodoBase(nombre: string, T: OperatividadRecord[], Aa: OperatividadRecord[], B: OperatividadRecord[], hijos: NodoMicrogerencia[]): NodoMicrogerencia {
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
        const anio2025 = ms.reduce((s2, m) => s2 + mT[m - 1], 0);
        const anio2026 = ms.reduce((s2, m) => s2 + mB[m - 1], 0);
        return { etiqueta, anio2025, anio2026, dif: anio2026 - anio2025 };
      });
      return { nombre, total2025, fecha2025, fecha2026, dif, pct, aportePct, casosDia, terminaAnio, difConAnioAnterior, trimestres, meses, delitos: [], hijos };
    }
    const agrupar = (lista: OperatividadRecord[]) => {
      const m = new Map<string, OperatividadRecord[]>();
      for (const r of lista) { const l = m.get(r.categoria); if (l) l.push(r); else m.set(r.categoria, [r]); }
      return m;
    };

    function calcularNodo(nombre: string, pred: (r: OperatividadRecord) => boolean, hijos: NodoMicrogerencia[] = [], incluirCategorias = true): NodoMicrogerencia {
      const T = recsAnioAnteriorCompleto.filter(pred);
      const Aa = recsAnterior.filter(pred);
      const B = recsActual.filter(pred);
      const nodo = nodoBase(nombre, T, Aa, B, hijos);
      if (!incluirCategorias) return nodo;
      // "delitos" se reutiliza para las CATEGORÍAS (capturas, incautaciones…).
      const gT = agrupar(T), gA = agrupar(Aa), gB = agrupar(B);
      const nombresCategorias = Array.from(new Set([...B, ...Aa].map((r) => r.categoria).filter((c) => c && c !== 'NO REPORTADO')));
      const categoriasDelNodo = nombresCategorias
        .map((cat) => nodoBase(cat, gT.get(cat) ?? [], gA.get(cat) ?? [], gB.get(cat) ?? [], []))
        .sort((a, b) => b.fecha2026 - a.fecha2026);
      // Para la lámina ejecutiva: barrios del año actual e histórico anual.
      const conteoBarrio = new Map<string, number>();
      for (const r of B) {
        const b = (r.barrioHecho ?? '').trim();
        if (!b || /^no reportad/i.test(b) || /^sin /i.test(b)) continue;
        conteoBarrio.set(b, (conteoBarrio.get(b) ?? 0) + 1);
      }
      const barrios = Array.from(conteoBarrio, ([n, casos]) => ({ nombre: n, casos })).sort((a, b) => b.casos - a.casos).slice(0, 10);
      const porAnio = new Map<number, number>();
      for (const r of contablesAnteriores) if (pred(r)) porAnio.set(r.anio!, (porAnio.get(r.anio!) ?? 0) + 1);
      const historico = [
        ...Array.from(porAnio, ([anio, casos]) => ({ anio, casos, parcial: false })).sort((a, b) => a.anio - b.anio),
        { anio: anioActual, casos: nodo.fecha2026, parcial: ventana!.actualFin < new Date(anioActual, 11, 31) },
      ];
      const operativo = detalleOperativo(pred);
      return { ...nodo, delitos: categoriasDelNodo, barrios, historico, operativo };
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
