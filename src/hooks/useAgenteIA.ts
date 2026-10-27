import { useCallback, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { calcularVentanaFechas, useVentanaComparativa, useComparativoCategoria, useComparativoGeneral } from './useComparativoHomologo';
import { useUltimasSemanas } from './useUltimasSemanas';
import { construirTablaOperatividad } from '../components/resumen/TablaOperatividadAgrupada';
import { esValorPendiente } from '../utils/valoresPendientes';
import { participacionPct, totalCasos } from '../utils/aggregations';
import { useTendenciaDiaSemana, useDistribucionHoraria } from './useTemporalAnalysis';
import { useCuadrantesCriticos, useBarriosCriticos } from './useInsights';
import { formatFecha } from '../utils/aggregations';
import { ejecutarHerramientaSobreContexto, ESQUEMAS_HERRAMIENTAS } from '../services/agenteIATools';
import { enviarMensajeAgente, agenteIAEstaConfigurado } from '../services/agenteIA';
import type { ContextoAgenteIA, MensajeChat, ResultadoHerramienta } from '../types/agenteIA';

const LIMITE_CATEGORIAS = 10;

/**
 * "Analista IA" — hook AISLADO y de solo lectura. Reutiliza EXACTAMENTE los
 * mismos hooks que ya usa el resto del dashboard (useVentanaComparativa,
 * useComparativoCategoria, useTendenciaDiaSemana, useDistribucionHoraria,
 * useCuadrantesCriticos, useBarriosCriticos) para construir un único objeto
 * de contexto — nunca recalcula nada por su cuenta, nunca toca
 * DataContext/FilterPanel/filters.ts. El "Analista Virtual" existente
 * (components/analitica/AnalistaVirtual.tsx) sigue funcionando exactamente
 * igual, sin ningún cambio.
 */
export function useAgenteIA() {
  const { records, recordsBase, filteredRecords, filters, meta, operatividadRecords } = useData();
  const ventana = useVentanaComparativa(recordsBase, filters, records, meta?.fechaMaxParametro);
  const cmpGeneral = useComparativoGeneral(ventana);
  const cmpDelito = useComparativoCategoria(ventana, (r) => r.delito, LIMITE_CATEGORIAS);
  const cmpEstacion = useComparativoCategoria(ventana, (r) => r.estacion, LIMITE_CATEGORIAS);
  const cmpCuadrante = useComparativoCategoria(ventana, (r) => r.cuadrante, LIMITE_CATEGORIAS);
  const cmpBarrio = useComparativoCategoria(ventana, (r) => r.barrioHecho, LIMITE_CATEGORIAS);
  const cmpCai = useComparativoCategoria(ventana, (r) => r.cai, LIMITE_CATEGORIAS);
  const cmpModalidad = useComparativoCategoria(ventana, (r) => r.modalidad, LIMITE_CATEGORIAS);
  const cmpArma = useComparativoCategoria(ventana, (r) => r.armas, LIMITE_CATEGORIAS);
  const cmpClaseSitio = useComparativoCategoria(ventana, (r) => r.claseSitio, LIMITE_CATEGORIAS);
  const porDiaSemana = useTendenciaDiaSemana(ventana.recsActual);
  const porHora = useDistribucionHoraria(ventana.recsActual);
  const cuadrantesCriticos = useCuadrantesCriticos(ventana.recsActual, 5);
  const barriosCriticos = useBarriosCriticos(ventana.recsActual, 5);
  // Últimas 4 semanas: mismo hook y mismos registros que la página «Últimas 4 Semanas».
  const ultimas = useUltimasSemanas(filteredRecords);

  // Operatividad del mismo periodo evaluable (regla única calcularVentanaFechas,
  // igual que la tabla de Inicio), con los mismos filtros generales.
  const operatividad = useMemo(() => {
    let maxTs = 0;
    for (const r of operatividadRecords) { const t = r.fecha?.getTime() ?? 0; if (t > maxTs) maxTs = t; }
    if (maxTs === 0) return { disponible: false, periodoActual: null, periodoComparativo: null, grupos: [] };
    const v = calcularVentanaFechas({ anios: filters.anio, meses: filters.mes, fechaInicial: filters.fechaInicial, fechaFinal: filters.fechaFinal, fechaMaxDatos: new Date(maxTs) });
    const base = operatividadRecords.filter((r) => {
      if ((filters.categoriaOperatividad ?? []).length > 0 && !filters.categoriaOperatividad.includes(r.categoria)) return false;
      if (filters.delito.length > 0 && !filters.delito.includes(r.delitoAsociado)) return false;
      if (filters.estacion.length > 0 && !filters.estacion.includes(r.estacion)) return false;
      if (filters.cuadrante.length > 0 && !filters.cuadrante.includes(r.cuadrante)) return false;
      if (filters.barrioHecho.length > 0 && !filters.barrioHecho.includes(r.barrioHecho)) return false;
      return true;
    });
    const grupos = construirTablaOperatividad(base, { inicio: v.actualInicio, fin: v.actualFin, inicioAnt: v.anteriorInicio, finAnt: v.anteriorFin, anioActual: v.actualFin.getFullYear(), anioAnterior: v.anteriorFin.getFullYear() });
    const kg = (g: number) => Math.round((g / 1000) * 10) / 10;
    return {
      disponible: true,
      periodoActual: { inicio: formatFecha(v.actualInicio), fin: formatFecha(v.actualFin), vigencia: v.actualFin.getFullYear() },
      periodoComparativo: { inicio: formatFecha(v.anteriorInicio), fin: formatFecha(v.anteriorFin), vigencia: v.anteriorFin.getFullYear() },
      grupos: grupos.map((g) => {
        const filas = g.filas.map((f) => ({ etiqueta: f.etiqueta, actual: g.esDroga ? kg(f.actual) : f.actual, anterior: g.esDroga ? kg(f.anterior) : f.anterior }));
        return {
          titulo: g.titulo,
          unidad: (g.esDroga ? 'kg' : 'casos') as 'kg' | 'casos',
          actual: g.esDroga ? kg(g.filas.reduce((a, f) => a + f.actual, 0)) : g.filas.reduce((a, f) => a + f.actual, 0),
          anterior: g.esDroga ? kg(g.filas.reduce((a, f) => a + f.anterior, 0)) : g.filas.reduce((a, f) => a + f.anterior, 0),
          filas,
        };
      }),
    };
  }, [operatividadRecords, filters]);

  // Mensual "actual vs anterior" simplificado (mes -> valor por vigencia) —
  // se arma aquí mismo con un agrupamiento simple sobre recsActual/recsAnterior,
  // ya filtrados; no requiere el hook completo de tendencia mensual (que
  // además calcula polinomios que el agente no necesita).
  const porMes = useMemo(() => {
    const NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const actual = new Map<number, number>();
    const anterior = new Map<number, number>();
    for (const r of ventana.recsActual) if (r.mes) actual.set(r.mes, (actual.get(r.mes) || 0) + 1);
    for (const r of ventana.recsAnterior) if (r.mes) anterior.set(r.mes, (anterior.get(r.mes) || 0) + 1);
    return NOMBRES.map((nombre, i) => ({ mes: nombre, actual: actual.get(i + 1) ?? null, anterior: anterior.get(i + 1) ?? null }));
  }, [ventana.recsActual, ventana.recsAnterior]);

  const contexto: ContextoAgenteIA = useMemo(() => {
    const diaTop = [...porDiaSemana].sort((a, b) => b.casos - a.casos)[0] ?? null;
    const horaTop = [...porHora].sort((a, b) => b.casos - a.casos)[0] ?? null;
    const totalDias = porDiaSemana.reduce((a, d) => a + d.casos, 0);
    const casosConHora = porHora.reduce((a, h) => a + h.casos, 0);
    const franjas = Array.from({ length: 8 }, (_, i) => {
      const casos = porHora.filter((h) => Math.floor(h.horaNum / 3) === i).reduce((a, h) => a + h.casos, 0);
      return { franja: `${String(i * 3).padStart(2, '0')}:00 – ${String(i * 3 + 2).padStart(2, '0')}:59`, casos, participacion: participacionPct(casos, casosConHora) };
    }).filter((f) => f.casos > 0).sort((a, b) => b.casos - a.casos);
    const fechaCorte = meta?.fechaMaxParametro ? new Date(meta.fechaMaxParametro) : null;
    const recs = ventana.recsActual;
    return {
      filtros: {
        delito: filters.delito,
        estacion: filters.estacion,
        cuadrante: filters.cuadrante,
        barrioHecho: filters.barrioHecho,
        cai: filters.cai,
        anio: filters.anio,
        mes: filters.mes,
        fechaInicial: filters.fechaInicial,
        fechaFinal: filters.fechaFinal,
        cantidadFiltrosAdicionalesActivos: [
          filters.zona, filters.genero, filters.armas, filters.modalidad, filters.claseSitio,
          filters.causaLesion, filters.grupoEdad, filters.franjaHoraria, filters.turno, filters.diaSemana, filters.horaExacta,
        ].filter((v) => v.length > 0).length,
      },
      periodoActual: { inicio: formatFecha(ventana.actualInicio), fin: formatFecha(ventana.actualFin), vigencia: ventana.anioActual },
      periodoComparativo: { inicio: formatFecha(ventana.anteriorInicio), fin: formatFecha(ventana.anteriorFin), vigencia: ventana.anioAnterior },
      corteInformacion: formatFecha(fechaCorte ?? ventana.actualFin),
      periodoEnCurso: ventana.anioActual === (fechaCorte ?? ventana.actualFin).getFullYear() && !ventana.esRangoPersonalizado,
      indicadores: {
        totalCasosActual: cmpGeneral.casosActual,
        totalCasosAnterior: cmpGeneral.casosAnterior,
        diferencia: cmpGeneral.casosActual - cmpGeneral.casosAnterior,
        variacionPct: cmpGeneral.variacionPct,
        totalAnioAnteriorCompleto: totalCasos(ventana.recsAnioAnteriorCompleto),
      },
      resumenCategorias: {
        delitos: cmpDelito, estaciones: cmpEstacion, cuadrantes: cmpCuadrante, barrios: cmpBarrio,
        cais: cmpCai, modalidades: cmpModalidad, armas: cmpArma, clasesSitio: cmpClaseSitio,
      },
      resumenTemporal: {
        porDiaSemana: porDiaSemana.map((d) => ({ key: d.dia, casos: d.casos, participacion: participacionPct(d.casos, totalDias) })),
        porHora: porHora.map((h) => ({ hora: h.hora, casos: h.casos })),
        porMes,
        diaMasCritico: diaTop ? { key: diaTop.dia, casos: diaTop.casos } : null,
        horaMasCritica: horaTop && horaTop.casos > 0 ? { hora: horaTop.hora, casos: horaTop.casos } : null,
        franjasCriticas: franjas,
        casosConHora,
      },
      resumenTerritorial: {
        cuadrantesCriticos: cuadrantesCriticos.map((c) => ({ key: c.key, casos: c.casos, participacion: c.participacion })),
        barriosCriticos: barriosCriticos.map((b) => ({ key: b.key, casos: b.casos, participacion: b.participacion })),
      },
      operatividad,
      cambiosRecientes: {
        disponible: ultimas.disponible,
        semanas: ultimas.semanas.map((w) => ({ nombre: w.nombre, inicio: formatFecha(w.inicio), fin: formatFecha(w.fin), total: w.total })),
        variacionPrimeraVsUltimaPct: ultimas.variacionTotalPct,
        delitoMayorAumento: ultimas.delitoMayorAumento ? { delito: ultimas.delitoMayorAumento.delito, primera: ultimas.delitoMayorAumento.semanas[0], ultima: ultimas.delitoMayorAumento.semanas[3] } : null,
        delitoMayorDisminucion: ultimas.delitoMayorDisminucion ? { delito: ultimas.delitoMayorDisminucion.delito, primera: ultimas.delitoMayorDisminucion.semanas[0], ultima: ultimas.delitoMayorDisminucion.semanas[3] } : null,
      },
      calidadDatos: {
        registrosActual: recs.length,
        sinHora: recs.filter((r) => r.hora === null || r.hora === undefined).length,
        sinBarrio: recs.filter((r) => esValorPendiente(r.barrioHecho)).length,
        sinZona: recs.filter((r) => esValorPendiente(r.cuadrante)).length,
      },
      metadatos: {
        totalRegistrosFiltrados: ventana.recsActual.length,
        delitoUnicoSeleccionado: filters.delito.length === 1 ? filters.delito[0] : null,
        cantidadDelitosSeleccionados: filters.delito.length,
        generadoEn: new Date().toISOString(),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventana, cmpGeneral, cmpDelito, cmpEstacion, cmpCuadrante, cmpBarrio, cmpCai, cmpModalidad, cmpArma, cmpClaseSitio, porDiaSemana, porHora, porMes, cuadrantesCriticos, barriosCriticos, filters, ultimas, operatividad, meta]);

  // ── Chat: historial de sesión (nunca persistido) ──────────────────────
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idContador = useRef(0);
  const nuevoId = () => `m${Date.now()}-${idContador.current++}`;

  const preguntar = useCallback(async (texto: string) => {
    const textoLimpio = texto.trim();
    if (!textoLimpio || cargando) return;
    setError(null);
    const mensajeUsuario: MensajeChat = { id: nuevoId(), rol: 'user', texto: textoLimpio, timestamp: Date.now() };
    const historialParaEnvio = [...mensajes, mensajeUsuario].map((m) => ({ rol: m.rol, texto: m.texto }));
    setMensajes((prev) => [...prev, mensajeUsuario]);
    setCargando(true);

    try {
      // Bucle de herramientas: el backend puede pedir varias rondas de
      // herramientas antes de dar la respuesta final. Límite de seguridad
      // (6 rondas) para nunca quedar en un ciclo infinito si algo falla.
      const resultadosAcumulados: ResultadoHerramienta[] = [];
      let historialCrudo: unknown = undefined;
      let rondas = 0;
      while (rondas < 6) {
        rondas += 1;
        const respuesta = await enviarMensajeAgente({ mensajes: historialParaEnvio, contexto, resultadosHerramientas: resultadosAcumulados, historialCrudo });

        if (respuesta.tipo === 'error') {
          setError(respuesta.mensaje);
          setCargando(false);
          return;
        }
        if (respuesta.tipo === 'respuesta') {
          setMensajes((prev) => [...prev, { id: nuevoId(), rol: 'assistant', texto: respuesta.texto, timestamp: Date.now() }]);
          setCargando(false);
          return;
        }
        // tipo === 'llamada_herramienta': se ejecutan LOCALMENTE (nunca en
        // el backend, que no tiene acceso a los datos), se acumulan para
        // la siguiente ronda, y se guarda el historial nativo devuelto
        // (incluye el turno donde el modelo pidió la herramienta) para
        // reenviarlo tal cual — sin esto, el proveedor rechaza la ronda
        // siguiente por no poder emparejar el resultado con su solicitud.
        historialCrudo = respuesta.historialCrudo;
        resultadosAcumulados.length = 0;
        for (const llamada of respuesta.llamadas) {
          const resultado = ejecutarHerramientaSobreContexto(llamada.nombre, llamada.parametros, contexto);
          resultadosAcumulados.push({ id: llamada.id, nombre: llamada.nombre, resultado });
        }
      }
      setError('El análisis tomó demasiadas iteraciones sin llegar a una respuesta. Intenta reformular la pregunta.');
    } catch {
      setError('En este momento no fue posible procesar el análisis. Los datos del Dashboard continúan disponibles.');
    } finally {
      setCargando(false);
    }
  }, [mensajes, contexto, cargando]);

  const limpiarConversacion = useCallback(() => {
    setMensajes([]);
    setError(null);
  }, []);

  return {
    contexto, mensajes, cargando, error, preguntar, limpiarConversacion,
    configurado: agenteIAEstaConfigurado(),
    esquemasHerramientas: ESQUEMAS_HERRAMIENTAS,
  };
}
