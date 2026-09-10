import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CrimeRecord, DatasetMeta, FilterState, UpdateMode, UpdateSummary } from '../types/crime';
import { emptyFilterState } from '../types/crime';
import { parseCsvText } from '../data/csvParser';
import { parseArchivo } from '../data/xlsxParser';
import { cargarDatosGuardados, guardarDatos, limpiarDatos } from '../data/storage';
import { fusionarRegistros, construirMeta, calcularColumnasNuevas } from '../data/datasetOps';
import { aplicarFiltros } from '../utils/filters';
import { obtenerConfig } from '../config';
import { descargarCsvRemoto, consultarMetaRemota, subirCsvRemoto } from '../data/remoteApi';
import { serializarCsv } from '../data/csvSerializer';

export type RemoteStatus = 'sin-configurar' | 'conectando' | 'conectado' | 'error';

const INTERVALO_SONDEO_MS = 45_000; // cada 45 segundos, sin recargar la página

// Delitos excluidos de TODO el dashboard (conteos, filtros, tablas, gráficos,
// mapas) — a pedido, porque generan duplicación con otro delito ya
// existente en la fuente de datos. No se modifica ni se elimina el registro
// original en ningún lado (ni en el backend, ni en la caché local): solo se
// excluyen de lo que la aplicación muestra y cuenta.
// Delitos excluidos de TODO el dashboard (conteos, filtros, tablas, gráficos,
// mapas) — a pedido, porque generan duplicación con otro delito ya
// existente en la fuente de datos. No se modifica ni se elimina el registro
// original en ningún lado (ni en el backend, ni en la caché local): solo se
// excluyen de lo que la aplicación muestra y cuenta.
// H. Bicicletas, H. Celular y H. Cable se RETIRARON de esta lista a pedido
// explícito posterior: sí se están midiendo correctamente y deben estar
// disponibles en filtros/tablas/gráficos — solo Lesiones AT y Homicidio en
// AT siguen excluidos.
const DELITOS_EXCLUIDOS_GLOBAL = new Set(['Lesiones AT', 'Homicidio en AT']);

interface DataContextValue {
  records: CrimeRecord[];
  filteredRecords: CrimeRecord[];
  meta: DatasetMeta | null;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  clearFilters: () => void;
  drillDown: (campo: keyof FilterState, valor: string) => void;
  loading: boolean;
  loadError: string | null;
  cargarArchivo: (file: File, modo: UpdateMode, token?: string, usuario?: string) => Promise<(UpdateSummary & { sincronizado?: boolean; errorSincronizacion?: string }) | { error: string }>;
  limpiarTodo: () => Promise<void>;
  lastColumns: string[];
  backendUrl: string;
  remoteStatus: RemoteStatus;
  remoteError: string | null;
  remoteMeta: { ultimaActualizacion: string | null; ultimoUsuario: string | null } | null;
  sincronizar: () => Promise<void>;
  recordsBase: CrimeRecord[];
  actualizacionDisponible: boolean; // true brevemente justo después de una sincronización automática (para mostrar un aviso tipo "toast")
  descartarAvisoActualizacion: () => void;
}

import { excluirDelitosOmitidos } from '../utils/delitosExcluidos';

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<CrimeRecord[]>([]);
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilterState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastColumns, setLastColumns] = useState<string[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('sin-configurar');
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteMeta, setRemoteMeta] = useState<{ ultimaActualizacion: string | null; ultimoUsuario: string | null } | null>(null);
  const [actualizacionDisponible, setActualizacionDisponible] = useState(false);
  const ultimaCargaRef = useRef<string | null>(null);

  const { backendUrl } = obtenerConfig();

  const persistirYActualizar = useCallback(
    async (nuevosRegistrosCrudos: CrimeRecord[], archivo: string, columnas: string[], fechaRef?: Date, fechaMaxParametro?: Date | null) => {
      const nuevosRegistros = excluirDelitosOmitidos(nuevosRegistrosCrudos);
      setRecords(nuevosRegistros);
      const ahora = fechaRef ?? new Date();
      setMeta(construirMeta(nuevosRegistros, archivo, ahora, columnas, fechaMaxParametro ?? null));
      setLastColumns(columnas);
      await guardarDatos(nuevosRegistros, archivo, fechaMaxParametro ?? null);
    },
    [],
  );

  const cargarDesdeBackend = useCallback(async (): Promise<boolean> => {
    if (!backendUrl) return false;
    setRemoteStatus('conectando');
    try {
      const [texto, metaRemota] = await Promise.all([
        descargarCsvRemoto(backendUrl),
        consultarMetaRemota(backendUrl).catch(() => null),
      ]);
      if (!texto || texto.trim().length === 0) {
        // El backend existe pero aún no tiene archivo cargado; no es un error.
        setRemoteStatus('conectado');
        setRemoteMeta(metaRemota ? { ultimaActualizacion: metaRemota.ultimaActualizacion, ultimoUsuario: metaRemota.ultimoUsuario } : null);
        return false;
      }
      const parsed = parseCsvText(texto);
      if (parsed.columnasFaltantes.length > 0) {
        setRemoteStatus('error');
        setRemoteError(`El archivo central no tiene las columnas requeridas: ${parsed.columnasFaltantes.join(', ')}.`);
        return false;
      }
      const fechaRef = metaRemota?.ultimaActualizacion ? new Date(metaRemota.ultimaActualizacion) : new Date();
      await persistirYActualizar(parsed.registros, 'Delitos.csv (central)', parsed.columnasDetectadas, fechaRef, parsed.fechaMaxParametro);
      setRemoteStatus('conectado');
      setRemoteError(null);
      setRemoteMeta(metaRemota ? { ultimaActualizacion: metaRemota.ultimaActualizacion, ultimoUsuario: metaRemota.ultimoUsuario } : null);
      ultimaCargaRef.current = metaRemota?.ultimaActualizacion ?? null;
      setActualizacionDisponible(false);
      return true;
    } catch (e) {
      setRemoteStatus('error');
      setRemoteError('No fue posible conectar con el backend central. Se muestran los últimos datos disponibles en este navegador.');
      return false;
    }
  }, [backendUrl, persistirYActualizar]);

  // Carga inicial: si hay backend configurado, intenta traer de ahí primero.
  // Si no hay backend o falla, usa lo guardado localmente; si tampoco hay nada, usa el archivo por defecto.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLoading(true);

      if (backendUrl) {
        const ok = await cargarDesdeBackend();
        if (ok) {
          if (!cancelado) setLoading(false);
          return;
        }
      }

      try {
        const guardado = await cargarDatosGuardados();
        if (guardado && guardado.records.length > 0) {
          if (cancelado) return;
          const registrosFiltrados = excluirDelitosOmitidos(guardado.records);
          setRecords(registrosFiltrados);
          const cols = registrosFiltrados.length ? Object.keys(registrosFiltrados[0].raw) : [];
          setLastColumns(cols);
          setMeta(construirMeta(
            registrosFiltrados, guardado.meta.nombreArchivo, new Date(guardado.meta.ultimaActualizacion), cols,
            guardado.meta.fechaMaxParametro ? new Date(guardado.meta.fechaMaxParametro) : null,
          ));
          setLoading(false);
          return;
        }
      } catch {
        // sigue con carga por defecto
      }

      try {
        const resp = await fetch('/Base_de_Datos_General.csv');
        if (!resp.ok) throw new Error('No se encontró el archivo de datos por defecto.');
        const text = await resp.text();
        const parsed = parseCsvText(text);
        if (cancelado) return;
        if (parsed.columnasFaltantes.length > 0) {
          setLoadError(`El archivo no puede ser procesado porque faltan las columnas requeridas: ${parsed.columnasFaltantes.join(', ')}.`);
          setLoading(false);
          return;
        }
        await persistirYActualizar(parsed.registros, 'Base_de_Datos_General.csv', parsed.columnasDetectadas, undefined, parsed.fechaMaxParametro);
      } catch (e) {
        if (!cancelado) setLoadError('No fue posible cargar datos iniciales. Utiliza "Actualizar información" para cargar un archivo.');
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sondeo periódico en segundo plano: si alguien más actualizó el servidor
  // central, se trae la información nueva automáticamente (sin que nadie
  // tenga que hacer clic en nada) y solo se muestra un aviso breve que
  // desaparece solo — pensado para alguien que ya tiene el dashboard abierto
  // (ej. el jefe en una reunión) y no debería tener que estar pendiente.
  useEffect(() => {
    if (!backendUrl) return;
    const intervalo = setInterval(async () => {
      try {
        const metaRemota = await consultarMetaRemota(backendUrl);
        if (metaRemota.ultimaActualizacion && metaRemota.ultimaActualizacion !== ultimaCargaRef.current) {
          const ok = await cargarDesdeBackend();
          if (ok) {
            setActualizacionDisponible(true);
            setTimeout(() => setActualizacionDisponible(false), 6000);
          }
        }
      } catch {
        // Fallo de red puntual: no interrumpir al usuario, se reintentará en el siguiente ciclo.
      }
    }, INTERVALO_SONDEO_MS);
    return () => clearInterval(intervalo);
  }, [backendUrl, cargarDesdeBackend]);

  const cargarArchivo = useCallback(
    async (file: File, modo: UpdateMode, token?: string, usuario?: string) => {
      try {
        const parsed = await parseArchivo(file);
        if (parsed.columnasFaltantes.length > 0) {
          return { error: `El archivo no puede ser procesado porque faltan las columnas requeridas: ${parsed.columnasFaltantes.join(', ')}.` };
        }
        const columnasNuevas = calcularColumnasNuevas(lastColumns, parsed.columnasDetectadas);

        let registrosFinales: CrimeRecord[];
        let resumen: UpdateSummary;

        if (modo === 'reemplazar' || records.length === 0) {
          registrosFinales = parsed.registros;
          resumen = {
            nuevos: parsed.registros.length,
            duplicados: 0,
            incorporados: parsed.registros.length,
            totalFinal: parsed.registros.length,
            columnasNuevas,
            columnasFaltantes: [],
          };
        } else {
          const fusion = fusionarRegistros(records, parsed.registros, columnasNuevas, []);
          registrosFinales = fusion.registros;
          resumen = fusion.resumen;
        }

        // Diagnóstico de la transformación DB2 (si el archivo cargado era una
        // descarga cruda del aplicativo): filas con errores y valores nuevos
        // detectados que no existían en la tabla de correspondencia.
        resumen.formatoDetectado = parsed.formatoDetectado;
        resumen.filasConErroresDB2 = parsed.filasConErroresDB2;
        resumen.valoresNuevosDB2 = parsed.valoresNuevosDB2;

        const columnasFinal = Array.from(new Set([...lastColumns, ...parsed.columnasDetectadas]));
        await persistirYActualizar(registrosFinales, file.name, columnasFinal, undefined, parsed.fechaMaxParametro);

        // Si hay backend configurado, sube el dataset final (ya fusionado) para que
        // todos los que consulten el dashboard vean esta misma actualización.
        if (backendUrl) {
          if (!token) {
            return { ...resumen, sincronizado: false, errorSincronizacion: 'No se sincronizó con el servidor central: falta la clave de actualización.' };
          }
          try {
            const csvCompleto = serializarCsv(registrosFinales);
            const res = await subirCsvRemoto(backendUrl, token, csvCompleto, usuario || 'No identificado');
            if (!res.ok) {
              return { ...resumen, sincronizado: false, errorSincronizacion: res.error || 'El servidor central rechazó la actualización.' };
            }
            await consultarMetaRemota(backendUrl).then((m) => {
              setRemoteMeta({ ultimaActualizacion: m.ultimaActualizacion, ultimoUsuario: m.ultimoUsuario });
              ultimaCargaRef.current = m.ultimaActualizacion;
            }).catch(() => {});
            setRemoteStatus('conectado');
            setActualizacionDisponible(false);
            return { ...resumen, sincronizado: true };
          } catch (e) {
            return { ...resumen, sincronizado: false, errorSincronizacion: 'No fue posible conectar con el servidor central para sincronizar.' };
          }
        }

        return resumen;
      } catch (e) {
        return { error: 'Ocurrió un error al procesar el archivo. Verifica que sea un CSV válido.' };
      }
    },
    [records, lastColumns, persistirYActualizar, backendUrl],
  );

  const limpiarTodo = useCallback(async () => {
    await limpiarDatos();
    setRecords([]);
    setMeta(null);
    setLastColumns([]);
    setFilters(emptyFilterState);
  }, []);

  const clearFilters = useCallback(() => setFilters(emptyFilterState), []);

  const drillDown = useCallback((campo: keyof FilterState, valor: string) => {
    setFilters((prev) => ({ ...prev, [campo]: [valor] }));
  }, []);

  const sincronizar = useCallback(async () => {
    await cargarDesdeBackend();
  }, [cargarDesdeBackend]);

  const descartarAvisoActualizacion = useCallback(() => setActualizacionDisponible(false), []);

  // Delitos excluidos de TODO el dashboard (conteos, filtros, tablas,
  // gráficos, mapas) — a pedido, porque generan duplicación con otro delito
  // ya existente. Se filtran aquí, en el punto donde "records" se expone al
  // resto de la aplicación, para que ningún componente vuelva a mostrarlos
  // ni aparezcan como opción en ningún filtro — pero el estado interno
  // "records" (usado para sincronizar/subir al backend) NUNCA se modifica,
  // así que la fuente de datos original permanece intacta.
  const registrosVisibles = useMemo(
    () => records.filter((r) => !DELITOS_EXCLUIDOS_GLOBAL.has(r.delito)),
    [records],
  );

  const filteredRecords = useMemo(() => aplicarFiltros(registrosVisibles, filters), [registrosVisibles, filters]);

  // Filtrado por todos los criterios EXCEPTO año/mes/fecha: sirve de base para
  // los comparativos homólogos (año actual vs. año anterior), que necesitan
  // definir su propia ventana de fechas independientemente del filtro de fecha
  // literal aplicado al resto del dashboard.
  const recordsBase = useMemo(
    () => aplicarFiltros(registrosVisibles, { ...filters, anio: [], mes: [], fechaInicial: null, fechaFinal: null }),
    [registrosVisibles, filters],
  );

  const value: DataContextValue = {
    records: registrosVisibles,
    filteredRecords,
    meta,
    filters,
    setFilters,
    clearFilters,
    drillDown,
    loading,
    loadError,
    cargarArchivo,
    limpiarTodo,
    lastColumns,
    backendUrl,
    remoteStatus,
    remoteError,
    remoteMeta,
    sincronizar,
    recordsBase,
    actualizacionDisponible,
    descartarAvisoActualizacion,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
}
