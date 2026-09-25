import type { CrimeRecord, DatasetMeta, DataQuality, UpdateSummary } from '../types/crime';
import { COLUMNAS_REQUERIDAS, buildRecordId } from './csvParser';
import { maxDe, minDe } from '../utils/mathSeguro';

export function fusionarRegistros(
  existentes: CrimeRecord[],
  nuevos: CrimeRecord[],
  columnasNuevas: string[],
  columnasFaltantes: string[],
): { registros: CrimeRecord[]; registrosParaSincronizar: CrimeRecord[]; resumen: UpdateSummary } {
  // Mapa por __id de los YA cargados, para poder actualizar uno en su
  // lugar cuando el "duplicado" trae datos que el guardado no tenía —
  // antes, un duplicado se descartaba siempre entero, así que resubir el
  // mismo archivo con una columna nueva (coordenadas, o un campo que
  // antes no se reconocía, ej. "ARMA_MEDIOS") no servía de nada: la
  // versión vieja, sin ese dato, seguía ganando. Se revisan los campos de
  // texto que normalmente vienen "NO REPORTADO" cuando faltan, más
  // lat/lon (que usan null en vez de ese texto).
  const CAMPOS_TEXTO_RELLENABLES = ['armas', 'causaLesion', 'barrioHecho', 'turno', 'modalidad', 'claseSitio', 'grupoEdad'] as const;
  const existentesPorId = new Map(existentes.map((r) => [r.__id, r]));
  const paraAgregar: CrimeRecord[] = [];
  const paraActualizar: CrimeRecord[] = [];
  let duplicados = 0;
  let actualizadosConCoordenadas = 0;

  for (const r of nuevos) {
    const previo = existentesPorId.get(r.__id);
    if (previo) {
      duplicados += 1;
      // Mismo diagnóstico que en eliminarDuplicadosPorIdentidadCruda: si
      // "coinciden en identidad" pero el delito es distinto, es casi
      // seguro una colisión falsa (dos hechos reales sin relación, no un
      // duplicado) — se avisa en la consola en vez de perder el registro
      // nuevo en silencio.
      if (previo.delito !== r.delito) {
        console.warn(
          `[Fusión de registros] El registro nuevo coincide en identidad con uno ya guardado, pero el delito es distinto — se conserva el ya guardado, revisa si es una colisión falsa:\n` +
          `  · Ya guardado: "${previo.delito}" (fecha ${previo.fechaTexto ?? previo.fecha})\n` +
          `  · Nuevo:       "${r.delito}" (fecha ${r.fechaTexto ?? r.fecha})`,
        );
      }
      let cambios: Partial<CrimeRecord> = {};
      if ((previo.lat == null || previo.lon == null) && r.lat != null && r.lon != null) {
        cambios = { ...cambios, lat: r.lat, lon: r.lon };
        actualizadosConCoordenadas += 1;
      }
      for (const campo of CAMPOS_TEXTO_RELLENABLES) {
        const valorPrevio = previo[campo];
        const valorNuevo = r[campo];
        if ((!valorPrevio || valorPrevio === 'NO REPORTADO') && valorNuevo && valorNuevo !== 'NO REPORTADO') {
          cambios = { ...cambios, [campo]: valorNuevo };
        }
      }
      if (Object.keys(cambios).length > 0) {
        const actualizado = { ...previo, ...cambios };
        existentesPorId.set(r.__id, actualizado);
        paraActualizar.push(actualizado);
      }
    } else {
      paraAgregar.push(r);
      existentesPorId.set(r.__id, r);
    }
  }

  const registros = [...existentes.map((r) => existentesPorId.get(r.__id) ?? r), ...paraAgregar];

  return {
    registros,
    // Solo los registros NUEVOS o MODIFICADOS por esta fusión — pensado
    // para el backend de Supabase (ver subirRegistrosSupabase): en vez de
    // reenviar el dataset COMPLETO en cada actualización (como se hacía
    // con el CSV completo a Google Drive), solo hace falta guardar estos.
    // Los registros ya existentes sin cambios ni se tocan.
    registrosParaSincronizar: [...paraAgregar, ...paraActualizar],
    resumen: {
      nuevos: nuevos.length,
      duplicados,
      incorporados: paraAgregar.length,
      totalFinal: registros.length,
      columnasNuevas,
      columnasFaltantes,
      actualizadosConCoordenadas,
    },
  };
}

export function calcularColumnasNuevas(previas: string[], actuales: string[]): string[] {
  const set = new Set(previas);
  return actuales.filter((c) => !set.has(c));
}

export function calcularCalidadDatos(records: CrimeRecord[]): DataQuality {
  const total = records.length;
  let fechaInvalida = 0;
  let sinDelito = 0;
  let sinBarrio = 0;
  let sinCantidad = 0;
  let noReportadoCount = 0;

  for (const r of records) {
    if (!r.fecha) fechaInvalida += 1;
    if (!r.delito || r.delito === 'NO REPORTADO') sinDelito += 1;
    if (!r.barrioHecho || r.barrioHecho === 'NO REPORTADO') sinBarrio += 1;
    if (!r.cantidad) sinCantidad += 1;
    if (
      r.armas === 'NO REPORTADO' ||
      r.modalidad === 'NO REPORTADO' ||
      r.genero === 'NO REPORTADO'
    ) {
      noReportadoCount += 1;
    }
  }

  const problematicos = new Set<number>();
  records.forEach((r, i) => {
    if (!r.fecha || (!r.delito || r.delito === 'NO REPORTADO') || !r.cantidad) {
      problematicos.add(i);
    }
  });

  const porcentajeValidos = total ? ((total - problematicos.size) / total) * 100 : 100;

  return {
    totalRegistros: total,
    fechaInvalida,
    sinDelito,
    sinBarrio,
    sinCantidad,
    noReportadoCount,
    duplicadosDetectados: 0,
    porcentajeValidos,
  };
}

export function construirMeta(
  records: CrimeRecord[],
  nombreArchivo: string,
  ultimaActualizacion: Date | null,
  columnasDetectadas: string[],
  fechaMaxParametro: Date | null = null,
): DatasetMeta {
  const fechas = records.filter((r) => r.fecha).map((r) => r.fecha!.getTime());
  const fechaMin = fechas.length ? new Date(minDe(fechas)) : null;
  const fechaMax = fechas.length ? new Date(maxDe(fechas)) : null;

  const aniosDisponibles = Array.from(new Set(records.filter((r) => r.anio).map((r) => r.anio!))).sort((a, b) => a - b);
  const estacionesDisponibles = Array.from(new Set(records.map((r) => r.estacion).filter(Boolean))).sort();
  const barriosDisponibles = Array.from(new Set(records.map((r) => r.barrioHecho).filter(Boolean))).sort();
  const delitosDisponibles = Array.from(new Set(records.map((r) => r.delito).filter(Boolean))).sort();

  const columnasConocidas = new Set<string>([
    // Formato histórico
    'FECHA_HECHO', 'HORA HECHO', 'HORA_24', 'HORA_HECHO', 'CANTIDAD', 'DELITOS', 'MODALIDAD', 'ARMAS',
    'ESTACION', 'CAI', 'CUADRANTE', 'BARRIOS_HECHO', 'BARRIO-CIUDAD', 'ZONA', 'ZONA2', 'CLASE_SITIO',
    'GENERO', 'GRUPO EDAD LEY', 'EDAD', 'DIA_SEMANA', 'DIA_SEMANA (grupo)', 'ANIO', 'SEMANA', 'NoSEMANA',
    'CAUSA_LESION',
    // Formato oficial vigente (Base_de_Datos_General)
    'Año', 'Hora_24', 'Mes', 'Dia', 'Mes resumido', 'dia resumido', 'Fecha Dia', 'Semana2', 'Delito',
    'Total General Año Anterior', 'Estación Final', 'CAI Final', 'Cuadrante Final', 'Genero Final',
    'Zona Final', 'Clase Sitio Final', 'Arma Final', 'Modalidad Final', 'Causa Lesion Final',
    'Barrio Hecho Final', 'Grupo Edad Ley Final',
  ]);
  const columnasDesconocidas = columnasDetectadas.filter((c) => !columnasConocidas.has(c));

  return {
    totalRegistros: records.length,
    totalCasos: records.length,
    fechaMin,
    fechaMax,
    aniosDisponibles,
    estacionesDisponibles,
    barriosDisponibles,
    delitosDisponibles,
    ultimaActualizacion,
    nombreArchivo,
    columnasDetectadas,
    columnasDesconocidas,
    calidad: calcularCalidadDatos(records),
    fechaMaxParametro,
  };
}

export { COLUMNAS_REQUERIDAS };

// Limpieza de los duplicados que YA quedaron guardados por el bug real de
// buildRecordId (antes usaba delito/cuadrante ya traducidos — cada mejora
// a esas traducciones hacía que resubir el mismo archivo se viera como
// "todo nuevo" y lo duplicara entero). Recalcula la identidad de cada
// registro con la lógica NUEVA (basada en texto crudo, ver
// csvParser.ts:buildRecordId) y, si dos registros ya guardados coinciden
// en esa identidad, se quedan con el más completo (con coordenadas y CAI,
// si alguno los tiene) en vez de sumar los dos. Es idempotente: si ya no
// hay duplicados, no cambia nada.
export function eliminarDuplicadosPorIdentidadCruda(records: CrimeRecord[]): { registros: CrimeRecord[]; eliminados: number } {
  const porIdentidad = new Map<string, CrimeRecord>();
  for (const r of records) {
    // Se usa el __id YA calculado (asignado al momento de leer el
    // archivo — ver csvParser.ts), NUNCA se recalcula aquí con
    // buildRecordId(r, 0). ¿Por qué importa? csvParser.ts, al leer un
    // archivo, ya resuelve ahí mismo el caso de varios registros con
    // identidad de contenido idéntica (ej. varias víctimas de una misma
    // edad y género en el mismo hecho) agregándoles un sufijo de
    // posición para no perder a ninguna — si esta función recalculara la
    // identidad desde cero, ese sufijo desaparecería y esas víctimas
    // volverían a chocar entre sí justo aquí, deshaciendo esa corrección.
    const id = r.__id || buildRecordId(r, 0);
    const previo = porIdentidad.get(id);
    if (!previo) {
      porIdentidad.set(id, r);
      continue;
    }
    // Diagnóstico: si dos registros "coinciden en identidad" pero tienen
    // un DELITO distinto, casi seguro es una colisión falsa (dos hechos
    // reales distintos que por coincidencia comparten OBJECTID+fecha) y
    // no un duplicado real — antes esto pasaba en silencio, sin dejar
    // ningún rastro; ahora al menos queda avisado en la consola para
    // poder revisarlo, en vez de perder el registro sin enterarse.
    if (previo.delito !== r.delito) {
      console.warn(
        `[Deduplicación] Dos registros con la misma identidad pero delito distinto — se conserva solo uno, revisa si es una colisión falsa:\n` +
        `  · Delito "${previo.delito}" (fecha ${previo.fechaTexto ?? previo.fecha})\n` +
        `  · Delito "${r.delito}" (fecha ${r.fechaTexto ?? r.fecha})`,
      );
    }
    // Se queda el más "completo": con coordenadas antes que sin ellas, y
    // con CAI real antes que sin él — nunca se descarta información,
    // siempre se prefiere quien más tiene.
    const previoCompleto = (previo.lat != null && previo.lon != null ? 2 : 0) + (previo.cai && previo.cai !== 'NO REPORTADO' ? 1 : 0);
    const actualCompleto = (r.lat != null && r.lon != null ? 2 : 0) + (r.cai && r.cai !== 'NO REPORTADO' ? 1 : 0);
    porIdentidad.set(id, actualCompleto > previoCompleto ? r : previo);
  }
  const registros = Array.from(porIdentidad.values());
  return { registros, eliminados: records.length - registros.length };
}

// Deriva el CAI a partir del Cuadrante para registros que traen uno pero no
// el otro (ej. los archivos COR_DELITOS_2024/2025, que sí traen Cuadrante
// pero no CAI en absoluto). La asignación Cuadrante -> CAI NO se inventa:
// se aprende directamente de los registros que YA tienen ambos campos bien
// diligenciados (el DB2 y el histórico sí traen los dos), asumiendo que esa
// asignación geográfica es estable — un cuadrante siempre pertenece al
// mismo CAI. Si un cuadrante nunca apareció junto a un CAI real en ningún
// registro cargado, se deja tal cual (NO REPORTADO) — nunca se adivina.
export function derivarCaiDesdeCuadrante(records: CrimeRecord[]): CrimeRecord[] {
  // El cuadrante "vacío" puede venir como "NO REPORTADO" (mayúsculas) o
  // como "No Reportado" (con mayúscula/minúscula mixta — así lo devuelve
  // mapearCuadrante en algunos casos, ver db2Transform.ts). Sin esta
  // comparación insensible a mayúsculas, esos registros "sin cuadrante
  // real" se colaban como si fueran un cuadrante válido, y terminaban
  // asignando un CAI cualquiera a TODO lo que no tenía cuadrante — se
  // detectó justo así, verificando con datos reales antes de entregarlo.
  const esCuadranteReal = (v: string) => !!v && v.toUpperCase() !== 'NO REPORTADO';
  const esCaiReal = (v: string) => !!v && v.toUpperCase() !== 'NO REPORTADO';

  const cuadranteACai = new Map<string, string>();
  for (const r of records) {
    if (esCuadranteReal(r.cuadrante) && esCaiReal(r.cai)) {
      if (!cuadranteACai.has(r.cuadrante)) cuadranteACai.set(r.cuadrante, r.cai);
    }
  }
  if (cuadranteACai.size === 0) return records;

  let actualizados = 0;
  const resultado = records.map((r) => {
    if (!esCaiReal(r.cai) && esCuadranteReal(r.cuadrante) && cuadranteACai.has(r.cuadrante)) {
      actualizados += 1;
      return { ...r, cai: cuadranteACai.get(r.cuadrante)! };
    }
    return r;
  });
  if (actualizados > 0) {
    console.info(`[derivarCaiDesdeCuadrante] CAI completado por cuadrante en ${actualizados} registro(s).`);
  }
  return resultado;
}
