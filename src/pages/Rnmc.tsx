import { useEffect, useMemo, useState } from 'react';
import { Scale, Upload, RefreshCcw, CloudUpload } from 'lucide-react';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { leerMatrizComparendos, type RegistroComparendo } from '../data/rnmcParser';
import { guardarComparendos, cargarComparendos, descargarComparendosSupabase, subirComparendosSupabase } from '../data/rnmcStorage';
import { sincronizarCapaRnmcDesdeComparendos } from '../data/puntosStorage';
import { AporteBarList } from '../components/charts/AporteBarList';
import { Card } from '../components/ui/Card';

const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';
type TopModo = 5 | 10 | 'todos';

function conAporte(items: RegistroComparendo[], campo: (r: RegistroComparendo) => string, n: TopModo | number) {
  const conteo = new Map<string, number>();
  let total = 0;
  for (const it of items) {
    const v = campo(it);
    if (!v) continue;
    conteo.set(v, (conteo.get(v) || 0) + 1);
    total++;
  }
  const ordenado = Array.from(conteo.entries())
    .map(([key, casos]) => ({ key, casos, aportePct: total > 0 ? (casos / total) * 100 : 0 }))
    .sort((a, b) => b.casos - a.casos);
  return n === 'todos' ? ordenado : ordenado.slice(0, n);
}

/** Un componente de barras con su PROPIO selector Top 5 / Top 10 / Todos — cada tarjeta se ajusta de forma independiente, a pedido explícito. */
function BloqueBarras({ titulo, registros, campo, nombreArchivo }: { titulo: string; registros: RegistroComparendo[]; campo: (r: RegistroComparendo) => string; nombreArchivo: string }) {
  const [topModo, setTopModo] = useState<TopModo>(10);
  const datos = useMemo(() => conAporte(registros, campo, topModo), [registros, campo, topModo]);
  return (
    <Card
      title={titulo}
      descargable={nombreArchivo}
      actions={
        <div className="flex gap-1 text-[10px]">
          {([5, 10, 'todos'] as TopModo[]).map((m) => (
            <button
              key={String(m)}
              onClick={() => setTopModo(m)}
              className={`rounded px-1.5 py-0.5 font-semibold ${topModo === m ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {m === 'todos' ? 'Todos' : `Top ${m}`}
            </button>
          ))}
        </div>
      }
    >
      {datos.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">Sin datos suficientes.</p> : <AporteBarList data={datos} />}
    </Card>
  );
}

/** Análisis de Hurto a Personas / Lesiones Personales — cruzado con Delictividad (esos delitos no existen en la matriz de comparendos). */
function AnalisisDelitoDelictividad({ delito }: { delito: string }) {
  const { filteredRecords } = useData();
  const registros = useMemo(() => filteredRecords.filter((r) => r.delito === delito), [filteredRecords, delito]);
  const nombreArchivo = delito.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');
  const bloques: { titulo: string; campo: (r: (typeof registros)[number]) => string }[] = [
    { titulo: 'CAI más afectado', campo: (r) => r.cai },
    { titulo: 'Barrios más afectados', campo: (r) => r.barrioHecho },
    { titulo: 'Armas más empleadas', campo: (r) => r.armas },
    { titulo: 'Modalidades más presentadas', campo: (r) => r.modalidad },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div className="xl:col-span-3 rounded-lg bg-brand-navy px-4 py-2 text-white">
        <p className="text-sm font-bold">{delito} — {registros.length.toLocaleString('es-CO')} caso(s) en Delictividad</p>
      </div>
      {bloques.map(({ titulo, campo }) => (
        <BloqueBarras key={titulo} titulo={titulo} registros={registros as any} campo={campo as any} nombreArchivo={`${nombreArchivo}-${titulo.toLowerCase().replace(/\s+/g, '-')}`} />
      ))}
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
  const [modoActivo, setModoActivo] = useState<'todos' | 'H. Personas' | 'L. Personales' | string>('todos');

  const { backendUrl, supabaseAnonKey, updatePassword } = obtenerConfig();
  const sincronizacionDisponible = !!backendUrl && !!supabaseAnonKey;

  useEffect(() => {
    (async () => {
      if (sincronizacionDisponible) {
        try {
          const remotos = await descargarComparendosSupabase(backendUrl, supabaseAnonKey);
          if (remotos.length > 0) {
            setRegistros(remotos);
            setFechaCarga(new Date().toISOString());
            await guardarComparendos(remotos);
            sincronizarCapaRnmcDesdeComparendos(remotos).catch(() => {});
            return;
          }
        } catch { /* sin servidor disponible por ahora — se sigue con el local */ }
      }
      const local = await cargarComparendos();
      if (local) {
        setRegistros(local.registros);
        setFechaCarga(local.fecha);
        sincronizarCapaRnmcDesdeComparendos(local.registros).catch(() => {});
      }
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
      setModoActivo('todos');
      sincronizarCapaRnmcDesdeComparendos(leidos).catch(() => {});

      if (sincronizacionDisponible) {
        setSincronizando(true);
        try {
          await subirComparendosSupabase(FUNCION_SUBIR_REGISTROS, updatePassword || 'sin-clave', leidos, 'No identificado');
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

  const registrosFiltradosPorFecha = useMemo(() => {
    if (!registros) return [];
    return registros.filter((r) => {
      if (filters.anio.length > 0 && (r.anio == null || !filters.anio.includes(String(r.anio)))) return false;
      if (filters.fechaInicial && (!r.fecha || r.fecha < new Date(filters.fechaInicial))) return false;
      if (filters.fechaFinal && (!r.fecha || r.fecha > new Date(`${filters.fechaFinal}T23:59:59`))) return false;
      return true;
    });
  }, [registros, filters.anio, filters.fechaInicial, filters.fechaFinal]);

  const comportamientosDisponibles = useMemo(
    () => conAporte(registrosFiltradosPorFecha, (r) => r.articuloNumeral, 12).map((c) => c.key),
    [registrosFiltradosPorFecha],
  );

  const registrosVista = useMemo(
    () => (modoActivo === 'todos' || modoActivo === 'H. Personas' || modoActivo === 'L. Personales' ? registrosFiltradosPorFecha : registrosFiltradosPorFecha.filter((r) => r.articuloNumeral === modoActivo)),
    [registrosFiltradosPorFecha, modoActivo],
  );

  const resumen = useMemo(() => {
    if (!registrosFiltradosPorFecha.length) return null;
    const zonas = new Set(registrosFiltradosPorFecha.map((r) => r.zonaAtencionHechos).filter(Boolean));
    const comunas = new Set(registrosFiltradosPorFecha.map((r) => r.comuna).filter(Boolean));
    const funcionarios = new Set(registrosFiltradosPorFecha.map((r) => r.funcionario).filter(Boolean));
    const top = conAporte(registrosFiltradosPorFecha, (r) => r.articuloNumeral, 1)[0];
    return { total: registrosFiltradosPorFecha.length, zonas: zonas.size, comunas: comunas.size, funcionarios: funcionarios.size, top };
  }, [registrosFiltradosPorFecha]);

  const esModoDelictividad = modoActivo === 'H. Personas' || modoActivo === 'L. Personales';

  return (
    <div className="space-y-4">
      {/* Título simple, sombreado — a pedido explícito, ya no un recuadro con borde. */}
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5">
        <Scale size={18} className="text-brand-green" />
        <h2 className="text-base font-bold text-slate-800">RNMC — Registro Nacional de Medidas Correctivas</h2>
        {fechaCarga && registros && <span className="ml-auto text-[11px] text-slate-500">{registros.length.toLocaleString('es-CO')} comparendo(s) · {new Date(fechaCarga).toLocaleString('es-CO')}</span>}
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{aviso}</div>}

      {/* Recuadro chico: Análisis Delitos vs RNMC (izquierda) + botón de carga (derecha). */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-navy">Análisis Delitos vs RNMC</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setModoActivo('H. Personas')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === 'H. Personas' ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Análisis Hurto a Personas</button>
            <button onClick={() => setModoActivo('L. Personales')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === 'L. Personales' ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Análisis Lesiones Personales</button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
          {sincronizando ? <CloudUpload size={14} className="animate-pulse" /> : registros ? <RefreshCcw size={14} /> : <Upload size={14} />}
          {cargando ? 'Leyendo…' : sincronizando ? 'Sincronizando…' : registros ? 'Actualizar matriz' : 'Cargar matriz de comparendos'}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={cargando || sincronizando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }} />
        </label>
      </div>

      {!registros ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga la matriz de comparendos para ver el análisis — información sujeta a variación según lo cargado.
        </div>
      ) : (
        <>
          {!esModoDelictividad && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <button onClick={() => setModoActivo('todos')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === 'todos' ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todos</button>
              {comportamientosDisponibles.map((c) => (
                <button key={c} onClick={() => setModoActivo(c)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === c ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
              ))}
            </div>
          )}

          {esModoDelictividad ? (
            <AnalisisDelitoDelictividad delito={modoActivo} />
          ) : (
            <>
              <div className="rounded-lg bg-brand-navy px-4 py-2 text-white">
                <p className="text-sm font-bold">
                  {modoActivo === 'todos' ? 'Análisis general RNMC — todos los comportamientos' : `Análisis RNMC — ${modoActivo}`}
                  <span className="ml-2 font-normal text-slate-300">({registrosVista.length.toLocaleString('es-CO')} comparendo(s))</span>
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {modoActivo === 'todos' && (
                  <BloqueBarras titulo="Comportamientos más registrados (Art./Num.)" registros={registrosVista} campo={(r) => r.articuloNumeral} nombreArchivo="rnmc-comportamientos" />
                )}

                {/* "Resumen general" entre Comportamientos y Zona de atención — a pedido explícito. */}
                {resumen && (
                  <Card title="Resumen general">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div><p className="text-lg font-bold text-brand-navy">{resumen.total.toLocaleString('es-CO')}</p><p className="text-[10px] text-slate-500">Comparendos</p></div>
                      <div><p className="text-lg font-bold text-brand-navy">{resumen.zonas}</p><p className="text-[10px] text-slate-500">Zonas de atención</p></div>
                      <div><p className="text-lg font-bold text-brand-navy">{resumen.comunas}</p><p className="text-[10px] text-slate-500">Comunas</p></div>
                      <div><p className="text-lg font-bold text-brand-navy">{resumen.funcionarios}</p><p className="text-[10px] text-slate-500">Funcionarios</p></div>
                      {resumen.top && <div className="col-span-2 mt-1 border-t border-slate-100 pt-1"><p className="text-[10px] text-slate-500">Comportamiento más frecuente</p><p className="text-xs font-semibold text-slate-700">{resumen.top.key} ({resumen.top.casos})</p></div>}
                    </div>
                  </Card>
                )}

                {/* "Zona de Atención" y "Cuadrante" se unificaron en un solo
                    componente — confirmado contra el archivo real:
                    CUADRANTE_HECHOS y CUADRANTE_CARGO_POL son el MISMO valor
                    en el 100% de las filas, así que esta matriz no trae, en
                    los datos, un concepto de "patrulla" distinto del
                    cuadrante donde ocurrió el hecho. */}
                <BloqueBarras titulo="Zona de atención / Cuadrante" registros={registrosVista} campo={(r) => r.zonaAtencionHechos} nombreArchivo="rnmc-zonas" />
                <BloqueBarras titulo="Unidad policial" registros={registrosVista} campo={(r) => r.unidadPolicial} nombreArchivo="rnmc-unidad" />
                <BloqueBarras titulo="Comuna" registros={registrosVista} campo={(r) => r.comuna} nombreArchivo="rnmc-comuna" />
                <BloqueBarras titulo="Funcionario policial" registros={registrosVista} campo={(r) => r.funcionario} nombreArchivo="rnmc-funcionario" />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
