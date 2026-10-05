import { useEffect, useMemo, useState } from 'react';
import { Scale, Upload, RefreshCcw, CloudUpload } from 'lucide-react';
import { useData } from '../context/DataContext';
import { obtenerConfig } from '../config';
import { pedirClaveSesion, revisarErrorDeClave, MENSAJE_SIN_CLAVE } from '../utils/claveSesion';
import { leerMatrizComparendos, type RegistroComparendo } from '../data/rnmcParser';
import { guardarComparendos, cargarComparendos, descargarComparendosSupabase, subirComparendosSupabase } from '../data/rnmcStorage';
import { sincronizarCapaRnmcDesdeComparendos } from '../data/puntosStorage';
import { AporteBarList } from '../components/charts/AporteBarList';
import { Card } from '../components/ui/Card';

const FUNCION_SUBIR_REGISTROS = '/.netlify/functions/subirRegistros';
type TopModo = 5 | 10 | 'todos';

// Los tres comportamientos que se piden siempre juntos, en un solo
// componente — confirmados contra el archivo real (Art. 95, no 91: ese
// artículo no existe en la matriz, "Art. 95 Num. 1" sí, con 457 casos).
const COMPORTAMIENTOS_DESTACADOS = ['Art. 27 Num. 6', 'Art. 95 Num. 1', 'Art. 27 Num. 7'];

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
            <button key={String(m)} onClick={() => setTopModo(m)} className={`rounded px-1.5 py-0.5 font-semibold ${topModo === m ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
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

function BloqueBarrasDelito({ titulo, registros, campo, nombreArchivo }: { titulo: string; registros: import('../types/crime').CrimeRecord[]; campo: (r: import('../types/crime').CrimeRecord) => string; nombreArchivo: string }) {
  const [topModo, setTopModo] = useState<TopModo>(10);
  const datos = useMemo(() => {
    const conteo = new Map<string, number>();
    let total = 0;
    for (const r of registros) {
      const v = campo(r);
      if (!v) continue;
      conteo.set(v, (conteo.get(v) || 0) + 1);
      total++;
    }
    const ordenado = Array.from(conteo.entries()).map(([key, casos]) => ({ key, casos, aportePct: total > 0 ? (casos / total) * 100 : 0 })).sort((a, b) => b.casos - a.casos);
    return topModo === 'todos' ? ordenado : ordenado.slice(0, topModo);
  }, [registros, campo, topModo]);
  return (
    <Card
      title={titulo}
      descargable={nombreArchivo}
      actions={
        <div className="flex gap-1 text-[10px]">
          {([5, 10, 'todos'] as TopModo[]).map((m) => (
            <button key={String(m)} onClick={() => setTopModo(m)} className={`rounded px-1.5 py-0.5 font-semibold ${topModo === m ? 'bg-brand-navy text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
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

/** Los 3 comportamientos destacados EN UN SOLO componente — a pedido explícito, no como tarjetas separadas. */
function ComportamientosDestacados({ registros }: { registros: RegistroComparendo[] }) {
  const filas = COMPORTAMIENTOS_DESTACADOS.map((clave) => {
    const encontrados = registros.filter((r) => r.articuloNumeral === clave);
    return { clave, casos: encontrados.length, texto: encontrados[0]?.comportamientoTexto ?? '' };
  });
  return (
    <Card title="Comportamientos contrarios a la convivencia" descargable="rnmc-comportamientos-destacados">
      <div className="space-y-2">
        {filas.map((f) => (
          <div key={f.clave} className="rounded-md bg-emerald-50 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">{f.clave}</span>
              <span className="text-sm font-bold text-brand-green">{f.casos}</span>
            </div>
            {f.texto && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{f.texto}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Vista partida en dos mitades: DELITO (izquierda, Delictividad) + LEY 1801 CNSCC (derecha, RNMC) — a pedido explícito, para comparar lado a lado. */
function VistaComparativa({ delito, registrosRnmc }: { delito: string; registrosRnmc: RegistroComparendo[] }) {
  const { filteredRecords } = useData();
  const registrosDelito = useMemo(() => filteredRecords.filter((r) => r.delito === delito), [filteredRecords, delito]);

  const total2025 = registrosDelito.filter((r) => r.anio === 2025).length;
  const total2026 = registrosDelito.filter((r) => r.anio === 2026).length;
  const dif = total2026 - total2025;
  const pct = total2025 > 0 ? Math.round((dif / total2025) * 100) : null;

  const nombreArchivo = delito.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '');

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {/* MITAD IZQUIERDA — Delito */}
      <div className="space-y-3">
        <div className="rounded-lg bg-brand-navy px-4 py-2 text-white">
          <p className="text-sm font-bold">Delito {delito === 'H. Personas' ? 'Hurto a Personas' : 'Lesiones Personales'}</p>
        </div>

        {/* "Cómo va el delito" — comparativo simple 2025 vs 2026 a la fecha. */}
        <Card title="Comportamiento del delito" descargable={`${nombreArchivo}-comportamiento`}>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div><p className="text-lg font-bold text-slate-700">{total2025}</p><p className="text-[10px] text-slate-500">2025 (a la fecha)</p></div>
            <div><p className="text-lg font-bold text-brand-navy">{total2026}</p><p className="text-[10px] text-slate-500">2026 (a la fecha)</p></div>
            <div><p className={`text-lg font-bold ${dif >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{dif >= 0 ? '+' : ''}{dif}</p><p className="text-[10px] text-slate-500">Diferencia</p></div>
            <div><p className={`text-lg font-bold ${dif >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{pct == null ? 'N/A' : `${pct >= 0 ? '+' : ''}${pct}%`}</p><p className="text-[10px] text-slate-500">Variación</p></div>
          </div>
        </Card>

        <BloqueBarrasDelito titulo="CAI más afectado" registros={registrosDelito} campo={(r) => r.cai} nombreArchivo={`${nombreArchivo}-cai`} />
        <BloqueBarrasDelito titulo="Barrios más afectados" registros={registrosDelito} campo={(r) => r.barrioHecho} nombreArchivo={`${nombreArchivo}-barrios`} />
        <BloqueBarrasDelito titulo="Armas más empleadas" registros={registrosDelito} campo={(r) => r.armas} nombreArchivo={`${nombreArchivo}-armas`} />
        <BloqueBarrasDelito titulo="Modalidades más presentadas" registros={registrosDelito} campo={(r) => r.modalidad} nombreArchivo={`${nombreArchivo}-modalidades`} />
      </div>

      {/* MITAD DERECHA — Ley 1801 CNSCC (RNMC), como contexto paralelo — no
          filtrado por este delito en particular (la matriz de comparendos
          no distingue "hurto"/"lesiones" como tal), sino el panorama
          general de aplicación de la ley en el mismo periodo. */}
      <div className="space-y-3">
        <div className="rounded-lg bg-brand-navy px-4 py-2 text-white">
          <p className="text-sm font-bold">Aplicación Ley 1801 CNSCC</p>
        </div>
        <ComportamientosDestacados registros={registrosRnmc} />
        <BloqueBarras titulo="Patrulla / Cuadrante" registros={registrosRnmc} campo={(r) => r.zonaAtencionHechos} nombreArchivo="rnmc-patrulla-cuadrante" />
        <BloqueBarras titulo="Unidad policial" registros={registrosRnmc} campo={(r) => r.unidadPolicial} nombreArchivo="rnmc-unidad" />
      </div>
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

  const { backendUrl, supabaseAnonKey } = obtenerConfig();
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
          const clave = pedirClaveSesion('subir los comparendos RNMC');
          if (!clave) throw new Error(MENSAJE_SIN_CLAVE);
          await subirComparendosSupabase(FUNCION_SUBIR_REGISTROS, clave, leidos, 'No identificado');
          setAviso('Sincronizado con el servidor central — todas las personas verán esta actualización.');
        } catch (e) {
          revisarErrorDeClave(e);
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
    const conMediacion = registrosFiltradosPorFecha.filter((r) => r.mediacionInSitu).length;
    const top = conAporte(registrosFiltradosPorFecha, (r) => r.articuloNumeral, 1)[0];
    return { total: registrosFiltradosPorFecha.length, zonas: zonas.size, comunas: comunas.size, funcionarios: funcionarios.size, conMediacion, top };
  }, [registrosFiltradosPorFecha]);

  const esModoDelictividad = modoActivo === 'H. Personas' || modoActivo === 'L. Personales';

  // Botones de Hurto/Lesiones — a pedido explícito, funcionan como
  // INTERRUPTOR: si ya estaba activo ese mismo, un segundo clic lo
  // desactiva y regresa al panel principal (Todos), igual para los dos.
  function alternarModoDelictividad(clave: 'H. Personas' | 'L. Personales') {
    setModoActivo((actual) => (actual === clave ? 'todos' : clave));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5">
        <Scale size={18} className="text-brand-green" />
        <h2 className="text-base font-bold text-slate-800">RNMC — Registro Nacional de Medidas Correctivas</h2>
        {fechaCarga && registros && <span className="ml-auto text-[11px] text-slate-500">{registros.length.toLocaleString('es-CO')} comparendo(s) · {new Date(fechaCarga).toLocaleString('es-CO')}</span>}
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {aviso && <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{aviso}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-brand-navy">Análisis Delitos vs RNMC</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => alternarModoDelictividad('H. Personas')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === 'H. Personas' ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Análisis Hurto a Personas</button>
            <button onClick={() => alternarModoDelictividad('L. Personales')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === 'L. Personales' ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Análisis Lesiones Personales</button>
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
      ) : esModoDelictividad ? (
        <VistaComparativa delito={modoActivo} registrosRnmc={registrosFiltradosPorFecha} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <button onClick={() => setModoActivo('todos')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === 'todos' ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Todos</button>
            {comportamientosDisponibles.map((c) => (
              <button key={c} onClick={() => setModoActivo(c)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${modoActivo === c ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>

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

            {resumen && (
              <Card title="Resumen general">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div><p className="text-lg font-bold text-brand-navy">{resumen.total.toLocaleString('es-CO')}</p><p className="text-[10px] text-slate-500">Comparendos</p></div>
                  <div><p className="text-lg font-bold text-brand-navy">{resumen.zonas}</p><p className="text-[10px] text-slate-500">Zonas de atención</p></div>
                  <div><p className="text-lg font-bold text-brand-navy">{resumen.comunas}</p><p className="text-[10px] text-slate-500">Comunas</p></div>
                  <div><p className="text-lg font-bold text-brand-navy">{resumen.funcionarios}</p><p className="text-[10px] text-slate-500">Funcionarios</p></div>
                  <div><p className="text-lg font-bold text-brand-navy">{resumen.conMediacion}</p><p className="text-[10px] text-slate-500">Mediación in situ</p></div>
                  {resumen.top && <div><p className="text-[10px] text-slate-500">Más frecuente</p><p className="text-[11px] font-semibold text-slate-700">{resumen.top.key}</p></div>}
                </div>
              </Card>
            )}

            <BloqueBarras titulo="Zona de atención / Cuadrante" registros={registrosVista} campo={(r) => r.zonaAtencionHechos} nombreArchivo="rnmc-zonas" />
            <BloqueBarras titulo="Unidad policial" registros={registrosVista} campo={(r) => r.unidadPolicial} nombreArchivo="rnmc-unidad" />
            <BloqueBarras titulo="Comuna" registros={registrosVista} campo={(r) => r.comuna} nombreArchivo="rnmc-comuna" />
            <BloqueBarras titulo="Funcionario policial" registros={registrosVista} campo={(r) => r.funcionario} nombreArchivo="rnmc-funcionario" />
          </div>
        </>
      )}
    </div>
  );
}
