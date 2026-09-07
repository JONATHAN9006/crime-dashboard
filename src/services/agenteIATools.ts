// Capa de HERRAMIENTAS DETERMINÍSTICAS del Analista IA.
//
// REGLA FUNDAMENTAL DE ESTE ARCHIVO: cada función de aquí abajo SOLO lee y
// da forma a datos que ya vienen calculados dentro de "ContextoAgenteIA"
// (construido en hooks/useAgenteIA.ts a partir de los hooks existentes del
// dashboard). Ninguna función de este archivo sabe qué es un CrimeRecord,
// no importa datos crudos, no sabe filtrar, no promedia, no suma — solo
// recorta/ordena/formatea lo que otro código YA calculó. Esto es lo que
// garantiza que el modelo de lenguaje nunca pueda "inventar" un número: el
// número siempre viene de aquí, nunca del modelo.
import type { ContextoAgenteIA, EsquemaHerramienta } from '../types/agenteIA';
import type { FilaComparativaCategoria } from '../hooks/useComparativoHomologo';

const DIMENSIONES_VALIDAS = ['estaciones', 'cuadrantes', 'barrios', 'cais', 'modalidades', 'armas', 'clasesSitio'] as const;
type DimensionValida = (typeof DIMENSIONES_VALIDAS)[number];

function limitar<T>(arr: T[], top?: number): T[] {
  const n = typeof top === 'number' && top > 0 ? Math.min(top, 50) : arr.length;
  return arr.slice(0, n);
}

// ── ESQUEMAS (lo que el modelo ve como "herramientas disponibles") ──────
export const ESQUEMAS_HERRAMIENTAS: EsquemaHerramienta[] = [
  {
    name: 'obtenerContextoActual',
    description: 'Devuelve el resumen del estado actual del Dashboard: filtros activos, periodo actual y comparativo, y totales generales. Úsala primero si no sabes qué está viendo el usuario.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'obtenerKPIs',
    description: 'Devuelve el total de casos de la vigencia actual, el total del mismo periodo homólogo del año anterior, la diferencia absoluta y la variación porcentual.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'compararVigencias',
    description: 'Compara la vigencia actual contra la anterior para una dimensión específica (delito, estación, cuadrante, barrio, CAI, modalidad, arma o clase de sitio), respetando el corte de fecha homólogo exacto.',
    input_schema: {
      type: 'object',
      properties: {
        dimension: { type: 'string', description: 'Dimensión a comparar', enum: ['delitos', ...DIMENSIONES_VALIDAS] },
        top: { type: 'number', description: 'Cuántos elementos devolver (por defecto todos los disponibles, máximo 50)' },
      },
      required: ['dimension'],
    },
  },
  {
    name: 'analizarTemporalidad',
    description: 'Devuelve la distribución de casos por día de la semana, por hora, o por mes (vigencia actual vs. anterior), incluyendo el día y la hora con mayor concentración.',
    input_schema: {
      type: 'object',
      properties: { tipo: { type: 'string', description: 'Qué corte temporal devolver', enum: ['dia_semana', 'hora', 'mensual', 'todo'] } },
      required: ['tipo'],
    },
  },
  {
    name: 'analizarTerritorio',
    description: 'Devuelve los cuadrantes y/o barrios con mayor concentración de casos (ya calculados y ordenados de mayor a menor).',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', description: 'Qué nivel territorial devolver', enum: ['cuadrante', 'barrio', 'ambos'] },
        top: { type: 'number', description: 'Cuántos elementos devolver' },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'analizarDelitos',
    description: 'Devuelve los delitos ordenados por mayor incidencia, o filtrados a solo los que están en incremento o en reducción frente al año anterior, con su participación porcentual.',
    input_schema: {
      type: 'object',
      properties: {
        orden: { type: 'string', description: 'Criterio de orden/filtro', enum: ['mayor_incidencia', 'mayor_incremento', 'mayor_reduccion'] },
        top: { type: 'number', description: 'Cuántos delitos devolver' },
      },
      required: ['orden'],
    },
  },
];

// ── EJECUCIÓN (dispatcher puro: contexto + parámetros → resultado) ──────
export function ejecutarHerramientaSobreContexto(nombre: string, parametros: Record<string, unknown>, contexto: ContextoAgenteIA): unknown {
  switch (nombre) {
    case 'obtenerContextoActual':
      return {
        filtros: contexto.filtros,
        periodoActual: contexto.periodoActual,
        periodoComparativo: contexto.periodoComparativo,
        delitoUnicoSeleccionado: contexto.metadatos.delitoUnicoSeleccionado,
        cantidadDelitosSeleccionados: contexto.metadatos.cantidadDelitosSeleccionados,
        totalRegistrosFiltrados: contexto.metadatos.totalRegistrosFiltrados,
      };

    case 'obtenerKPIs':
      return contexto.indicadores;

    case 'compararVigencias': {
      const dimension = String(parametros.dimension ?? '');
      const top = typeof parametros.top === 'number' ? parametros.top : undefined;
      const filas: FilaComparativaCategoria[] | undefined = dimension === 'delitos'
        ? contexto.resumenCategorias.delitos
        : DIMENSIONES_VALIDAS.includes(dimension as DimensionValida)
          ? contexto.resumenCategorias[dimension as DimensionValida]
          : undefined;
      if (!filas) return { error: `Dimensión no reconocida: "${dimension}". Usa una de: delitos, ${DIMENSIONES_VALIDAS.join(', ')}.` };
      return { dimension, periodoActual: contexto.periodoActual, periodoComparativo: contexto.periodoComparativo, filas: limitar(filas, top) };
    }

    case 'analizarTemporalidad': {
      const tipo = String(parametros.tipo ?? 'todo');
      const base = {
        diaMasCritico: contexto.resumenTemporal.diaMasCritico,
        horaMasCritica: contexto.resumenTemporal.horaMasCritica,
      };
      if (tipo === 'dia_semana') return { ...base, porDiaSemana: contexto.resumenTemporal.porDiaSemana };
      if (tipo === 'hora') return { ...base, porHora: contexto.resumenTemporal.porHora };
      if (tipo === 'mensual') return { ...base, porMes: contexto.resumenTemporal.porMes };
      return { ...base, porDiaSemana: contexto.resumenTemporal.porDiaSemana, porHora: contexto.resumenTemporal.porHora, porMes: contexto.resumenTemporal.porMes };
    }

    case 'analizarTerritorio': {
      const tipo = String(parametros.tipo ?? 'ambos');
      const top = typeof parametros.top === 'number' ? parametros.top : undefined;
      const resultado: Record<string, unknown> = {};
      if (tipo === 'cuadrante' || tipo === 'ambos') resultado.cuadrantesCriticos = limitar(contexto.resumenTerritorial.cuadrantesCriticos, top);
      if (tipo === 'barrio' || tipo === 'ambos') resultado.barriosCriticos = limitar(contexto.resumenTerritorial.barriosCriticos, top);
      return resultado;
    }

    case 'analizarDelitos': {
      const orden = String(parametros.orden ?? 'mayor_incidencia');
      const top = typeof parametros.top === 'number' ? parametros.top : undefined;
      let filas = [...contexto.resumenCategorias.delitos];
      if (orden === 'mayor_incremento') filas = filas.filter((f) => f.diferencia > 0).sort((a, b) => b.diferencia - a.diferencia);
      else if (orden === 'mayor_reduccion') filas = filas.filter((f) => f.diferencia < 0).sort((a, b) => a.diferencia - b.diferencia);
      else filas = filas.sort((a, b) => b.actual - a.actual);
      return { orden, filas: limitar(filas, top) };
    }

    default:
      return { error: `Herramienta no reconocida: "${nombre}".` };
  }
}
