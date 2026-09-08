import { useCallback, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { useVentanaComparativa, useComparativoCategoria, useComparativoGeneral } from './useComparativoHomologo';
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
  const { records, recordsBase, filters, meta } = useData();
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
      indicadores: {
        totalCasosActual: cmpGeneral.casosActual,
        totalCasosAnterior: cmpGeneral.casosAnterior,
        diferencia: cmpGeneral.casosActual - cmpGeneral.casosAnterior,
        variacionPct: cmpGeneral.variacionPct,
      },
      resumenCategorias: {
        delitos: cmpDelito, estaciones: cmpEstacion, cuadrantes: cmpCuadrante, barrios: cmpBarrio,
        cais: cmpCai, modalidades: cmpModalidad, armas: cmpArma, clasesSitio: cmpClaseSitio,
      },
      resumenTemporal: {
        porDiaSemana: porDiaSemana.map((d) => ({ key: d.dia, casos: d.casos, participacion: 0 })),
        porHora: porHora.map((h) => ({ hora: h.hora, casos: h.casos })),
        porMes,
        diaMasCritico: diaTop ? { key: diaTop.dia, casos: diaTop.casos } : null,
        horaMasCritica: horaTop ? { hora: horaTop.hora, casos: horaTop.casos } : null,
      },
      resumenTerritorial: {
        cuadrantesCriticos: cuadrantesCriticos.map((c) => ({ key: c.key, casos: c.casos, participacion: c.participacion })),
        barriosCriticos: barriosCriticos.map((b) => ({ key: b.key, casos: b.casos, participacion: b.participacion })),
      },
      metadatos: {
        totalRegistrosFiltrados: ventana.recsActual.length,
        delitoUnicoSeleccionado: filters.delito.length === 1 ? filters.delito[0] : null,
        cantidadDelitosSeleccionados: filters.delito.length,
        generadoEn: new Date().toISOString(),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventana, cmpGeneral, cmpDelito, cmpEstacion, cmpCuadrante, cmpBarrio, cmpCai, cmpModalidad, cmpArma, cmpClaseSitio, porDiaSemana, porHora, porMes, cuadrantesCriticos, barriosCriticos, filters]);

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
