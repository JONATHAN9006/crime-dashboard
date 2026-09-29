import { useEffect, useMemo, useState } from 'react';
import { Scale, Upload, RefreshCcw, CloudUpload, Lock } from 'lucide-react';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { leerMatrizComparendos, type RegistroComparendo } from '../data/rnmcParser';
import { guardarComparendos, cargarComparendos, descargarComparendosSupabase, subirComparendosSupabase } from '../data/rnmcStorage';
import { HorizontalBarChart } from '../components/charts/HorizontalBarChart';

const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';

// Top 10 (o menos si no hay tantos) con casos + aporte % — el mismo
// cálculo y el mismo formato de "NOMBRE + barra + número + %" que ya usa
// el resto del dashboard (ver HorizontalBarChart, reutilizado tal cual).
function topConAporte(items: RegistroComparendo[], campo: (r: RegistroComparendo) => string, n = 10) {
  const conteo = new Map<string, number>();
  let totalConValor = 0;
  for (const it of items) {
    const v = campo(it);
    if (!v) continue;
    conteo.set(v, (conteo.get(v) || 0) + 1);
    totalConValor++;
  }
  return Array.from(conteo.entries())
    .map(([key, casos]) => ({ key, casos, participacion: totalConValor > 0 ? (casos / totalConValor) * 100 : 0 }))
    .sort((a, b) => b.casos - a.casos)
    .slice(0, n);
}

function BloqueBarras({ titulo, registros, campo }: { titulo: string; registros: RegistroComparendo[]; campo: (r: RegistroComparendo) => string }) {
  const datos = useMemo(() => topConAporte(registros, campo), [registros, campo]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-navy">{titulo}</p>
      {datos.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">Sin datos suficientes.</p>
      ) : (
        <HorizontalBarChart data={datos} />
      )}
    </div>
  );
}

/** Los componentes de barras (comportamientos, zona, cuadrante, patrulla, unidad, comuna, funcionario) — se reutilizan igual para "Todos" y para un comportamiento específico; lo único que cambia es qué "registros" les llega ya filtrado. */
function GrillaAnalisis({ registros, mostrarComportamientos }: { registros: RegistroComparendo[]; mostrarComportamientos: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {mostrarComportamientos && (
        <BloqueBarras titulo="Comportamientos más registrados (Art./Num.)" registros={registros} campo={(r) => r.articuloNumeral} />
      )}
      <BloqueBarras titulo="Zonas de atención" registros={registros} campo={(r) => r.zonaAtencionHechos} />
      <BloqueBarras titulo="Cuadrantes" registros={registros} campo={(r) => r.cuadranteHechos} />
      <BloqueBarras titulo="Patrullas" registros={registros} campo={(r) => r.zonaAtencionPatrulla} />
      <BloqueBarras titulo="Unidad policial" registros={registros} campo={(r) => r.unidadPolicial} />
      <BloqueBarras titulo="Comuna" registros={registros} campo={(r) => r.comuna} />
      <BloqueBarras titulo="Funcionario policial" registros={registros} campo={(r) => r.funcionario} />
    </div>
  );
}

export function Rnmc() {
  const { filters } = useData();
  const [registros, setRegistros] = useState<RegistroComparendo[] | null>(null);
  const [fechaCarga, setFechaCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [comportamientoActivo, setComportamientoActivo] = useState<string | null>(null); // null = "Todos"

  const { backendUrl, supabaseAnonKey, updatePassword } = obtenerConfig();
  const sincronizacionDisponible = !!backendUrl && !!supabaseAnonKey;

  // Al entrar: primero intenta el servidor central (para que todos vean lo
  // mismo), y si no hay conexión o todavía no hay nada ahí, usa lo último
  // guardado en este navegador.
  useEffect(() => {
    (async () => {
      if (sincronizacionDisponible) {
        try {
          const remotos = await descargarComparendosSupabase(backendUrl, supabaseAnonKey);
          if (remotos.length > 0) {
            setRegistros(remotos);
            setFechaCarga(new Date().toISOString());
            await guardarComparendos(remotos);
            return;
          }
        } catch { /* sin servidor disponible por ahora — se sigue con el local */ }
      }
      const local = await cargarComparendos();
      if (local) { setRegistros(local.registros); setFechaCarga(local.fecha); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manejarArchivo(file: File) {
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const leidos = await leerMatrizComparendos(file);
      if (leidos.length === 0) throw new Error('El archivo no tiene filas de datos.');
      await guardarComparendos(leidos);
      setRegistros(leidos);
      setFechaCarga(new Date().toISOString());
      setComportamientoActivo(null);

      if (sincronizacionDisponible) {
        if (updatePassword && token !== updatePassword) {
          setAviso('Los datos quedaron guardados en este navegador. Para que TODOS los vean, ingresa la clave de actualización y vuelve a subir el archivo.');
          return;
        }
        setSincronizando(true);
        try {
          await subirComparendosSupabase(FUNCION_SUBIR_REGISTROS, token || 'sin-clave', leidos, 'No identificado');
          setAviso('Sincronizado con el servidor central — todas las personas verán esta actualización.');
        } catch (e) {
          setAviso(`Los datos quedaron guardados en este navegador, pero no se pudo sincronizar con el servidor: ${e instanceof Error ? e.message : 'error desconocido'}`);
        } finally {
          setSincronizando(false);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  // Filtros GENERALES del dashboard que sí tienen sentido aplicar aquí —
  // año y fecha, porque la matriz de comparendos también trae su propia
  // fecha del hecho. El resto de los filtros generales (delito, estación,
  // CAI...) son propios de Delictividad y no existen en esta matriz, así
  // que no se intenta forzar una relación que los datos no tienen (punto 6
  // del pedido: no asumir relaciones que no existen).
  const registrosFiltradosPorFecha = useMemo(() => {
    if (!registros) return [];
    return registros.filter((r) => {
      if (filters.anio.length > 0 && (r.anio == null || !filters.anio.includes(String(r.anio)))) return false;
      if (filters.fechaInicial && (!r.fecha || r.fecha < new Date(filters.fechaInicial))) return false;
      if (filters.fechaFinal && (!r.fecha || r.fecha > new Date(`${filters.fechaFinal}T23:59:59`))) return false;
      return true;
    });
  }, [registros, filters.anio, filters.fechaInicial, filters.fechaFinal]);

  // Comportamientos disponibles para los botones — se arman SOLOS a partir
  // de lo que de verdad trae la matriz (top 12 por frecuencia), nunca de
  // una lista fija — así nunca se le atribuye a un comportamiento una
  // categoría que no existe en los datos.
  const comportamientosDisponibles = useMemo(
    () => topConAporte(registrosFiltradosPorFecha, (r) => r.articuloNumeral, 12).map((c) => c.key),
    [registrosFiltradosPorFecha],
  );

  const registrosVista = useMemo(
    () => (comportamientoActivo ? registrosFiltradosPorFecha.filter((r) => r.articuloNumeral === comportamientoActivo) : registrosFiltradosPorFecha),
    [registrosFiltradosPorFecha, comportamientoActivo],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-brand-green"><Scale size={22} /></div>
          <div>
            <h2 className="text-base font-bold text-slate-800">RNMC — Registro Nacional de Medidas Correctivas</h2>
            {fechaCarga && registros ? (
              <p className="text-xs text-slate-500">{registros.length.toLocaleString('es-CO')} comparendo(s) · Actualizado el {new Date(fechaCarga).toLocaleString('es-CO')}</p>
            ) : (
              <p className="text-xs text-slate-500">Aún no se ha cargado la matriz de comparendos.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sincronizacionDisponible && updatePassword && (
            <div className="relative">
              <Lock size={12} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Clave para publicar"
                className="w-36 rounded-lg border border-slate-200 py-1.5 pl-6 pr-2 text-xs"
              />
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
            {sincronizando ? <CloudUpload size={14} className="animate-pulse" /> : registros ? <RefreshCcw size={14} /> : <Upload size={14} />}
            {cargando ? 'Leyendo…' : sincronizando ? 'Sincronizando…' : registros ? 'Actualizar matriz' : 'Cargar matriz de comparendos'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={cargando || sincronizando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }} />
          </label>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{aviso}</div>}

      {!registros ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga la matriz de comparendos para ver el análisis — información sujeta a variación según lo cargado.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <button
              onClick={() => setComportamientoActivo(null)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${comportamientoActivo === null ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Todos
            </button>
            {comportamientosDisponibles.map((c) => (
              <button
                key={c}
                onClick={() => setComportamientoActivo(c)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${comportamientoActivo === c ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-brand-navy px-4 py-2.5 text-white">
            <p className="text-sm font-bold">
              {comportamientoActivo ? `Análisis RNMC — ${comportamientoActivo}` : 'Análisis general RNMC — todos los comportamientos'}
              <span className="ml-2 font-normal text-slate-300">({registrosVista.length.toLocaleString('es-CO')} comparendo(s))</span>
            </p>
          </div>

          <GrillaAnalisis registros={registrosVista} mostrarComportamientos={comportamientoActivo === null} />
        </>
      )}
    </div>
  );
}
