import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CrimeRecord, DatasetMeta, FilterState, PeriodoAnalisis, UpdateMode, UpdateSummary } from '../types/crime';
import type { OperatividadRecord } from '../types/operatividad';
import { parsearOperatividad, parsearOperatividadDesdeCsv } from '../data/operatividadParser';
import { serializarOperatividadCsv } from '../data/operatividadSerializer';
import { emptyFilterState } from '../types/crime';
import { parseCsvText, renormalizarCamposParametrizados } from '../data/csvParser';
import { parseArchivo } from '../data/xlsxParser';
import { cargarDatosGuardados, guardarDatos, limpiarDatos } from '../data/storage';
import { fusionarRegistros, construirMeta, calcularColumnasNuevas, derivarCaiDesdeCuadrante, eliminarDuplicadosPorIdentidadCruda } from '../data/datasetOps';
import { aplicarFiltros, aplicarFiltrosConPeriodos } from '../utils/filters';
import { obtenerConfig } from '../config';
import { descargarRegistrosSupabase, consultarMetaSupabase, subirRegistrosSupabase } from '../data/supabaseApi';
// Operatividad sigue en el backend de Apps Script/Drive de siempre — no se
// migró a Supabase todavía (ver operatividadBackendUrl en config.ts).
import { descargarCsvRemoto, consultarMetaRemota, subirCsvRemoto } from '../data/remoteApi';
import { serializarCsv } from '../data/csvSerializer';
import { sincronizarCapaDelitosDesdeRecords } from '../data/puntosStorage';
import { MAPA_DELITO } from '../data/db2Mapeos';

export type RemoteStatus = 'sin-configurar' | 'conectando' | 'conectado' | 'error';

const INTERVALO_SONDEO_MS = 90_000; // cada 90 segundos (antes 45) — con la
// base ya en ~24 MB, cada sondeo puede implicar varias peticiones seguidas
// al backend (ver descargarCsvRemoto); espaciarlas reduce cuántas veces al
// día se puede topar con una demora puntual de Google, sin perder la idea
// de "se actualiza solo, sin recargar la página".

// Delitos excluidos de TODO el dashboard (conteos, filtros, tablas, gráficos,
// mapas) — porque no se miden / reportan oficialmente, a pedido explícito, o
// porque generan duplicación con otro delito ya existente en la fuente de
// datos. No se modifica ni se elimina el registro original en ningún lado
// (ni en el backend, ni en la caché local): solo se excluyen de lo que la
// aplicación muestra y cuenta. Lista canónica en utils/delitosExcluidos.ts —
// no mantener una copia propia aquí (ya se desincronizó dos veces).
const DELITOS_EXCLUIDOS_GLOBAL = new Set(DELITOS_EXCLUIDOS_CANONICOS);

interface DataContextValue {
  records: CrimeRecord[];
  filteredRecords: CrimeRecord[];
  meta: DatasetMeta | null;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  clearFilters: () => void;
  periodos: PeriodoAnalisis[];
  setPeriodos: React.Dispatch<React.SetStateAction<PeriodoAnalisis[]>>;
  drillDown: (campo: keyof FilterState, valor: string) => void;
  loading: boolean;
  loadError: string | null;
  cargarArchivo: (file: File, modo: UpdateMode, token?: string, usuario?: string, forzar?: boolean) => Promise<(UpdateSummary & { sincronizado?: boolean; errorSincronizacion?: string; requiereConfirmacion?: boolean; totalFilasActual?: number; totalFilasNuevo?: number }) | { error: string }>;
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
  // Dataset de OPERATIVIDAD — separado del de delictividad, con su propia
  // carga, pero filtrado con los MISMOS filtros generales cuando el campo
  // tiene equivalente.
  operatividadRecords: OperatividadRecord[];
  filteredOperatividadRecords: OperatividadRecord[];
  operatividadMeta: { totalRegistros: number; ultimaActualizacion: Date | null; nombreArchivo: string } | null;
  cargarArchivoOperatividad: (file: File, token?: string, usuario?: string) => Promise<{ registros: number } | { error: string }>;
}

import { excluirDelitosOmitidos, DELITOS_EXCLUIDOS_CANONICOS } from '../utils/delitosExcluidos';

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<CrimeRecord[]>([]);
  const [meta, setMeta] = useState<DatasetMeta | null>(null);
  const [filters, setFilters] = useState<FilterState>(emptyFilterState);
  const [periodos, setPeriodos] = useState<PeriodoAnalisis[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastColumns, setLastColumns] = useState<string[]>([]);
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('sin-configurar');
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteMeta, setRemoteMeta] = useState<{ ultimaActualizacion: string | null; ultimoUsuario: string | null } | null>(null);
  const [actualizacionDisponible, setActualizacionDisponible] = useState(false);
  const ultimaCargaRef = useRef<string | null>(null);

  // "backendUrl" es la URL del proyecto de Supabase (ver src/config.ts —
  // se conserva el nombre para no tener que tocar Header.tsx/UpdateDataModal.tsx,
  // que solo lo usan como "¿hay servidor central configurado?").
  const { backendUrl, supabaseAnonKey, operatividadBackendUrl } = obtenerConfig();
  // Ruta de la función de Netlify que hace las escrituras (ver
  // netlify/functions/subirRegistros.ts) — siempre la misma, relativa al
  // propio sitio (mismo origen, sin necesidad de configurarla aparte).
  const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';

  // Re-normaliza el delito de CUALQUIER registro (nuevo o ya guardado)
  // contra la misma tabla de traducción de siempre — no solo al parsear un
  // archivo nuevo. Sin esto, un registro que ya estaba guardado con un
  // nombre crudo (ej. "HOMICIDIOS EN AT" en vez de "Homicidio en AT") se
  // quedaba así para siempre, aunque la tabla ya tuviera la traducción
  // correcta — y al no coincidir con el nombre exacto que usa la lista de
  // exclusión, se colaba como si fuera un delito distinto y sin excluir.
  // Es idempotente: un delito que ya viene en forma corta ("Homicidio") no
  // coincide con ninguna clave de la tabla (crudas, en mayúsculas) y se
  // deja tal cual.
  function renormalizarDelitos(records: CrimeRecord[]): CrimeRecord[] {
    return records.map((r) => {
      const canonico = MAPA_DELITO[r.delito.toUpperCase()];
      if (canonico) return canonico !== r.delito ? { ...r, delito: canonico } : r;
      // Sin traducción en la tabla: si quedó en mayúsculas de corrido
      // (ej. "ACOSO SEXUAL"), se le da formato de Título para que no se
      // vea gritando al lado de los que sí están bien formateados.
      if (r.delito !== 'NO REPORTADO' && r.delito === r.delito.toUpperCase()) {
        const formateado = r.delito.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_, sep: string, letra: string) => sep + letra.toUpperCase());
        return formateado !== r.delito ? { ...r, delito: formateado } : r;
      }
      return r;
    });
  }

  const persistirYActualizar = useCallback(
    async (nuevosRegistrosCrudos: CrimeRecord[], archivo: string, columnas: string[], fechaRef?: Date, fechaMaxParametro?: Date | null) => {
      const conDelitosCorregidos = renormalizarCamposParametrizados(renormalizarDelitos(nuevosRegistrosCrudos));
      const sinExcluidos = excluirDelitosOmitidos(conDelitosCorregidos);
      // El CAI se completa por Cuadrante ANTES de guardar — así, tanto
      // "records" como la capa "Delitos" del mapa (que se sincroniza justo
      // debajo) ya ven el CAI derivado, sin depender de que cada pantalla
      // haga su propia reparación por su cuenta.
      const conCaiDerivado = derivarCaiDesdeCuadrante(sinExcluidos);
      // Limpieza de duplicados reales que ya hubieran quedado guardados por
      // el bug de identidad (ver datasetOps.ts) — se aplica SIEMPRE, no
      // solo al subir un archivo nuevo, para que la corrección tome efecto
      // de inmediato con lo que ya está guardado, sin depender de que se
      // vuelva a subir nada.
      const { registros: nuevosRegistros, eliminados: duplicadosLimpiados } = eliminarDuplicadosPorIdentidadCruda(conCaiDerivado);
      if (duplicadosLimpiados > 0) {
        console.info(`[persistirYActualizar] Se fusionaron ${duplicadosLimpiados} registro(s) duplicado(s) detectado(s) con la identidad corregida.`);
      }
      setRecords(nuevosRegistros);
      const ahora = fechaRef ?? new Date();
      setMeta(construirMeta(nuevosRegistros, archivo, ahora, columnas, fechaMaxParametro ?? null));
      setLastColumns(columnas);
      await guardarDatos(nuevosRegistros, archivo, fechaMaxParametro ?? null);
      // IMPORTANTE: se sincroniza con los registros YA filtrados
      // (nuevosRegistros), nunca con los crudos — si se usaran los crudos,
      // la capa "Delitos" del mapa terminaría incluyendo delitos que en
      // todo el resto del dashboard están excluidos a propósito (ej.
      // "H. Celular"), y el total del mapa no cuadraría con el de
      // "Delictividad por Unidad" (bug real: pasó exactamente esto).
      try { await sincronizarCapaDelitosDesdeRecords(nuevosRegistros); } catch { /* si falla, el mapa simplemente sigue con lo que ya tenía */ }
    },
    [],
  );

  const descargaEnCursoRef = useRef(false);
  const cargarDesdeBackend = useCallback(async (): Promise<boolean> => {
    if (!backendUrl) return false;
    // Con una base grande, la descarga completa (varios pedazos seguidos)
    // puede tardar más de un minuto — más que el intervalo del sondeo
    // automático. Sin este seguro, el sondeo podía arrancar una SEGUNDA
    // descarga completa mientras la primera todavía estaba en curso: las
    // dos compitiendo por la misma conexión, pisándose entre sí, daban
    // exactamente el síntoma de "conecta y se desconecta a cada rato" que
    // se venía reportando — no era un error real del servidor.
    if (descargaEnCursoRef.current) return false;
    descargaEnCursoRef.current = true;
    setRemoteStatus('conectando');
    try {
      const [registrosRemotos, metaRemota] = await Promise.all([
        descargarRegistrosSupabase(backendUrl, supabaseAnonKey),
        consultarMetaSupabase(backendUrl, supabaseAnonKey).catch(() => null),
      ]);
      if (!registrosRemotos || registrosRemotos.length === 0) {
        // El backend existe pero aún no tiene datos cargados; no es un error.
        setRemoteStatus('conectado');
        setRemoteMeta(metaRemota ? { ultimaActualizacion: metaRemota.ultimaActualizacion, ultimoUsuario: metaRemota.ultimoUsuario } : null);
        return false;
      }
      // A diferencia del CSV (que traía las columnas crudas y había que
      // volver a interpretar), cada fila de Supabase YA es un CrimeRecord
      // completo y procesado (así se guardó al subirlo) — no hace falta
      // volver a parsear nada aquí, ni validar columnas requeridas.
      const columnasDetectadas = registrosRemotos[0] ? Object.keys(registrosRemotos[0].raw || {}) : [];
      const fechaRef = metaRemota?.ultimaActualizacion ? new Date(metaRemota.ultimaActualizacion) : new Date();
      await persistirYActualizar(registrosRemotos, 'Delitos (Supabase, central)', columnasDetectadas, fechaRef, null);
      setRemoteStatus('conectado');
      setRemoteError(null);
      setRemoteMeta(metaRemota ? { ultimaActualizacion: metaRemota.ultimaActualizacion, ultimoUsuario: metaRemota.ultimoUsuario } : null);
      ultimaCargaRef.current = metaRemota?.ultimaActualizacion ?? null;
      setActualizacionDisponible(false);
      return true;
    } catch (e) {
      // Antes este error se perdía por completo — el banner solo decía
      // "no fue posible conectar", sin forma de saber SI era un problema
      // de red, un error del backend, o un CORS bloqueado. Ahora queda en
      // la consola con el mensaje real, para poder diagnosticar sin tener
      // que adivinar (F12 → Console, buscar "[Backend central]").
      console.error('[Backend central] Falló la descarga:', e);
      setRemoteStatus('error');
      setRemoteError('No fue posible conectar con el backend central. Se muestran los últimos datos disponibles en este navegador.');
      return false;
    } finally {
      descargaEnCursoRef.current = false;
    }
  }, [backendUrl, supabaseAnonKey, persistirYActualizar]);

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
    async (file: File, modo: UpdateMode, token?: string, usuario?: string, forzar?: boolean) => {
      try {
        const parsed = await parseArchivo(file);
        if (parsed.columnasFaltantes.length > 0) {
          return { error: `El archivo no puede ser procesado porque faltan las columnas requeridas: ${parsed.columnasFaltantes.join(', ')}.` };
        }
        const columnasNuevas = calcularColumnasNuevas(lastColumns, parsed.columnasDetectadas);

        let registrosFinales: CrimeRecord[];
        let registrosParaSincronizar: CrimeRecord[];
        let resumen: UpdateSummary;

        if (modo === 'reemplazar' || records.length === 0) {
          registrosFinales = parsed.registros;
          registrosParaSincronizar = parsed.registros;
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
          registrosParaSincronizar = fusion.registrosParaSincronizar;
          resumen = fusion.resumen;
        }

        // Diagnóstico de la transformación DB2 (si el archivo cargado era una
        // descarga cruda del aplicativo): filas con errores y valores nuevos
        // detectados que no existían en la tabla de correspondencia.
        resumen.formatoDetectado = parsed.formatoDetectado;
        resumen.filasConErroresDB2 = parsed.filasConErroresDB2;
        resumen.valoresNuevosDB2 = parsed.valoresNuevosDB2;

        // El parámetro oficial de corte ("a la fecha") solo viaja en archivos
        // DB2; un archivo sin esa columna (ej. una carga histórica antigua)
        // NO debe borrar el valor ya conocido de una carga DB2 anterior —
        // por eso se conserva el de `meta` si el archivo recién subido no
        // trae uno propio, en vez de sobrescribirlo siempre con el del
        // último archivo (que en modo "agregar" puede no ser el más
        // completo de los dos).
        const fechaMaxParametroFinal = parsed.fechaMaxParametro ?? meta?.fechaMaxParametro ?? null;

        const columnasFinal = Array.from(new Set([...lastColumns, ...parsed.columnasDetectadas]));
        await persistirYActualizar(registrosFinales, file.name, columnasFinal, undefined, fechaMaxParametroFinal);

        // Si hay backend configurado, sube solo los registros NUEVOS o
        // MODIFICADOS de esta fusión (ver registrosParaSincronizar en
        // fusionarRegistros) — a diferencia del CSV completo que se subía
        // antes a Google Drive, aquí cada registro se guarda por separado
        // (upsert por su propio id), así que nunca hace falta reenviar el
        // dataset entero para agregar unos pocos registros nuevos.
        if (backendUrl) {
          if (!token) {
            return { ...resumen, sincronizado: false, errorSincronizacion: 'No se sincronizó con el servidor central: falta la clave de actualización.' };
          }
          try {
            const res = await subirRegistrosSupabase(FUNCION_SUBIR_REGISTROS, token, registrosParaSincronizar, usuario || 'No identificado', undefined, forzar);
            if (!res.ok) {
              // Nota: con Supabase (upsert por registro individual) ya no
              // existe la carrera de "quién sube de último pisa todo el
              // archivo" que sí existía con el CSV en Drive — esta rama
              // queda por compatibilidad de tipos, pero el backend nuevo
              // normalmente no la produce.
              if (res.requiereConfirmacion) {
                return {
                  ...resumen,
                  sincronizado: false,
                  errorSincronizacion: res.error || 'El servidor central tiene una versión con más registros que la tuya.',
                  requiereConfirmacion: true,
                  totalFilasActual: res.totalFilasActual,
                  totalFilasNuevo: res.totalFilasNuevo,
                };
              }
              return { ...resumen, sincronizado: false, errorSincronizacion: res.error || 'El servidor central rechazó la actualización.' };
            }
            await consultarMetaSupabase(backendUrl, supabaseAnonKey).then((m) => {
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
    [records, lastColumns, persistirYActualizar, backendUrl, meta],
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

  // Cuando no hay periodos de análisis activos, esto es EXACTAMENTE
  // aplicarFiltros(registrosVisibles, filters) de siempre — el modo de una
  // sola fecha no cambia en nada (ver aplicarFiltrosConPeriodos).
  const filteredRecords = useMemo(() => aplicarFiltrosConPeriodos(registrosVisibles, filters, periodos), [registrosVisibles, filters, periodos]);

  // Filtrado por todos los criterios EXCEPTO año/mes/fecha: sirve de base para
  // los comparativos homólogos (año actual vs. año anterior), que necesitan
  // definir su propia ventana de fechas independientemente del filtro de fecha
  // literal aplicado al resto del dashboard.
  const recordsBase = useMemo(
    () => aplicarFiltros(registrosVisibles, { ...filters, anio: [], mes: [], fechaInicial: null, fechaFinal: null }),
    [registrosVisibles, filters],
  );

  // ── Dataset de OPERATIVIDAD ──────────────────────────────────────────
  // Mismo patrón que Delictividad: si hay backend configurado, se
  // sincroniza con el servidor central (todos ven la misma actualización);
  // si no, se guarda solo en este navegador (localStorage) como respaldo.
  const [operatividadRecords, setOperatividadRecords] = useState<OperatividadRecord[]>([]);
  const [operatividadMeta, setOperatividadMeta] = useState<{ totalRegistros: number; ultimaActualizacion: Date | null; nombreArchivo: string } | null>(null);

  function guardarOperatividadLocal(registros: OperatividadRecord[], ultimaActualizacion: Date, nombreArchivo: string) {
    setOperatividadRecords(registros);
    setOperatividadMeta({ totalRegistros: registros.length, ultimaActualizacion, nombreArchivo });
    try {
      localStorage.setItem('mepoy-operatividad', JSON.stringify({ registros, ultimaActualizacion, nombreArchivo }));
    } catch { /* si no cabe en localStorage, se queda solo en memoria para esta sesión */ }
  }

  useEffect(() => {
    // Espera a que la Delictividad termine de cargar/sincronizar antes de
    // pedir Operatividad — NUNCA deben competir al mismo tiempo por el
    // mismo backend. Google Apps Script (nivel gratuito) tiene un límite
    // bajo de ejecuciones simultáneas; pedir los dos datasets a la vez
    // puede hacer que una de las solicitudes de Delictividad falle o
    // regrese una respuesta incompleta — visto de primera mano.
    if (loading) return;
    let cancelado = false;
    (async () => {
      // Margen de seguridad adicional: deja que la sincronización principal
      // termine de asentarse antes de disparar la de Operatividad.
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelado) return;

      // 1) Si hay backend, intenta traer la versión central primero — las
      // dos llamadas van UNA DESPUÉS DE LA OTRA (no en paralelo), para no
      // sumarle más carga simultánea al mismo backend compartido.
      // Nota: Operatividad sigue en el backend de Apps Script/Drive de
      // siempre (operatividadBackendUrl) — no se migró a Supabase todavía.
      if (operatividadBackendUrl) {
        try {
          const csv = await descargarCsvRemoto(operatividadBackendUrl, 'operatividad');
          const metaRemota = await consultarMetaRemota(operatividadBackendUrl, 'operatividad').catch(() => null);
          if (cancelado) return;
          const registros = parsearOperatividadDesdeCsv(csv);
          if (registros.length > 0) {
            guardarOperatividadLocal(
              registros,
              metaRemota?.ultimaActualizacion ? new Date(metaRemota.ultimaActualizacion) : new Date(),
              'Servidor central',
            );
            return;
          }
        } catch { /* si falla la conexión, se sigue con lo que haya guardado localmente */ }
      }
      // 2) Respaldo local (sin backend, o backend sin datos todavía).
      try {
        const guardado = localStorage.getItem('mepoy-operatividad');
        if (guardado) {
          const datos = JSON.parse(guardado);
          const registros: OperatividadRecord[] = (datos.registros || []).map((r: any) => ({ ...r, fecha: r.fecha ? new Date(r.fecha) : null }));
          setOperatividadRecords(registros);
          setOperatividadMeta({ totalRegistros: registros.length, ultimaActualizacion: datos.ultimaActualizacion ? new Date(datos.ultimaActualizacion) : null, nombreArchivo: datos.nombreArchivo || '' });
        }
      } catch { /* si el navegador bloquea localStorage o el dato está corrupto, simplemente arranca vacío */ }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatividadBackendUrl, loading]);

  const cargarArchivoOperatividad = useCallback(async (file: File, token?: string, usuario?: string): Promise<{ registros: number } | { error: string }> => {
    try {
      const { registros } = await parsearOperatividad(file);
      if (registros.length === 0) return { error: 'No se encontraron registros válidos en el archivo (¿tiene las columnas OPERATIVIDAD y DELITO_ASOCIADO?).' };

      const ahora = new Date();

      if (operatividadBackendUrl) {
        if (!token) return { error: 'No se sincronizó con el servidor central: falta la clave de actualización.' };
        try {
          const csv = serializarOperatividadCsv(registros);
          const res = await subirCsvRemoto(operatividadBackendUrl, token, csv, usuario || 'No identificado', 'operatividad');
          if (!res.ok) return { error: res.error || 'El servidor central rechazó la actualización de Operatividad.' };
        } catch {
          return { error: 'No fue posible conectar con el servidor central para sincronizar Operatividad.' };
        }
        guardarOperatividadLocal(registros, ahora, 'Servidor central');
      } else {
        guardarOperatividadLocal(registros, ahora, file.name);
      }

      return { registros: registros.length };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'No fue posible leer el archivo de Operatividad.' };
    }
  }, [operatividadBackendUrl]);

  // Se filtra con los MISMOS filtros generales del dashboard, usando el
  // campo equivalente de cada uno (Delito ↔ delitoAsociado, Estación,
  // Cuadrante, Barrio, Año, Mes, rango de fecha) — nunca los filtros que no
  // tienen equivalente en este dataset (armas, modalidad, género, etc.).
  const filteredOperatividadRecords = useMemo(() => {
    return operatividadRecords.filter((r) => {
      if (filters.delito.length > 0 && !filters.delito.includes(r.delitoAsociado)) return false;
      if (filters.estacion.length > 0 && !filters.estacion.includes(r.estacion)) return false;
      if (filters.cuadrante.length > 0 && !filters.cuadrante.includes(r.cuadrante)) return false;
      if (filters.barrioHecho.length > 0 && !filters.barrioHecho.includes(r.barrioHecho)) return false;
      if (filters.zona.length > 0 && !filters.zona.includes(r.zona)) return false;
      if (filters.anio.length > 0 && (r.anio === null || !filters.anio.includes(String(r.anio)))) return false;
      if (filters.mes.length > 0 && (r.mes === null || !filters.mes.includes(String(r.mes)))) return false;
      if (filters.fechaInicial && (!r.fecha || r.fecha < new Date(filters.fechaInicial))) return false;
      if (filters.fechaFinal && (!r.fecha || r.fecha > new Date(filters.fechaFinal + 'T23:59:59'))) return false;
      return true;
    });
  }, [operatividadRecords, filters]);

  const value: DataContextValue = {
    records: registrosVisibles,
    filteredRecords,
    meta,
    filters,
    setFilters,
    clearFilters,
    periodos,
    setPeriodos,
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
    operatividadRecords,
    filteredOperatividadRecords,
    operatividadMeta,
    cargarArchivoOperatividad,
    descartarAvisoActualizacion,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de DataProvider');
  return ctx;
}
