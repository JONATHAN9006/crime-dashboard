import { useEffect, useMemo, useState } from 'react';
import { Scale, Upload, RefreshCcw, ShieldAlert, MapPin, Users, Radio, Building2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { leerMatrizComparendos, type RegistroComparendo } from '../data/rnmcParser';
import { guardarComparendos, cargarComparendos } from '../data/rnmcStorage';

// Los tres comportamientos que se piden destacar siempre primero, en este
// orden — el resto del "top" de comportamientos se arma solo, por
// frecuencia, debajo de estos tres.
const COMPORTAMIENTOS_DESTACADOS = ['Art. 27 Num. 6', 'Art. 95 Num. 1', 'Art. 27 Num. 7'];

function topN<T>(items: T[], campo: (item: T) => string, n = 5): { valor: string; casos: number }[] {
  const conteo = new Map<string, number>();
  for (const it of items) {
    const v = campo(it);
    if (!v) continue;
    conteo.set(v, (conteo.get(v) || 0) + 1);
  }
  return Array.from(conteo.entries()).map(([valor, casos]) => ({ valor, casos })).sort((a, b) => b.casos - a.casos).slice(0, n);
}

function TablaTop({ titulo, filas, icono: Icono }: { titulo: string; filas: { valor: string; casos: number }[]; icono: React.ElementType }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-navy">
        <Icono size={13} /> {titulo}
      </p>
      {filas.length === 0 ? (
        <p className="text-xs text-slate-400">Sin datos suficientes.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {filas.map((f, i) => (
            <li key={f.valor} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-1 last:border-0">
              <span className="truncate text-slate-700"><span className="mr-1.5 text-slate-400">{i + 1}.</span>{f.valor}</span>
              <span className="shrink-0 font-semibold text-brand-green">{f.casos}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Análisis de un delito puntual (Hurto a Personas / Lesiones Personales) contra el dataset de Delictividad ya cargado. */
function AnalisisDelito({ delito }: { delito: string }) {
  const { filteredRecords } = useData();
  const registros = useMemo(() => filteredRecords.filter((r) => r.delito === delito), [filteredRecords, delito]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-brand-navy px-3 py-2 text-white">
        <p className="text-sm font-bold">{delito} — {registros.length.toLocaleString('es-CO')} caso(s)</p>
      </div>
      <TablaTop titulo="CAI más afectado" filas={topN(registros, (r) => r.cai)} icono={Building2} />
      <TablaTop titulo="Zonas de atención más afectadas" filas={topN(registros, (r) => r.cuadrante)} icono={MapPin} />
      <TablaTop titulo="Barrios más afectados" filas={topN(registros, (r) => r.barrioHecho)} icono={MapPin} />
      <TablaTop titulo="Armas más empleadas" filas={topN(registros, (r) => r.armas)} icono={ShieldAlert} />
      <TablaTop titulo="Modalidades más presentadas" filas={topN(registros, (r) => r.modalidad)} icono={Radio} />
    </div>
  );
}

/** Panel "Aplicación Ley 1801 CNSCC" — a partir de la matriz de comparendos. */
function PanelCNSCC({ registros }: { registros: RegistroComparendo[] }) {
  const destacados = COMPORTAMIENTOS_DESTACADOS.map((clave) => {
    const encontrados = registros.filter((r) => r.articuloNumeral === clave);
    return { clave, casos: encontrados.length, texto: encontrados[0]?.comportamientoTexto ?? '' };
  });
  const topComportamientos = topN(registros, (r) => r.articuloNumeral).filter((t) => !COMPORTAMIENTOS_DESTACADOS.includes(t.valor));

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-brand-navy px-3 py-2 text-white">
        <p className="text-sm font-bold">Aplicación Ley 1801 — CNSCC ({registros.length.toLocaleString('es-CO')} comparendo(s))</p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-navy"><Scale size={13} /> Comportamientos contrarios a la convivencia</p>
        <div className="space-y-2">
          {destacados.map((d) => (
            <div key={d.clave} className="rounded-md bg-emerald-50 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800">{d.clave}</span>
                <span className="text-sm font-bold text-brand-green">{d.casos}</span>
              </div>
              {d.texto && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{d.texto}</p>}
            </div>
          ))}
        </div>
        {topComportamientos.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[11px] font-semibold uppercase text-slate-400">Otros comportamientos frecuentes</p>
            <ol className="space-y-1 text-sm">
              {topComportamientos.map((f, i) => (
                <li key={f.valor} className="flex items-center justify-between gap-2">
                  <span className="truncate text-slate-700">{i + 1}. {f.valor}</span>
                  <span className="font-semibold text-brand-green">{f.casos}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      <TablaTop titulo="Comunas con más comparendos" filas={topN(registros, (r) => r.comuna)} icono={Building2} />
      <TablaTop titulo="Zonas de atención con más comparendos" filas={topN(registros, (r) => r.zonaAtencionHechos)} icono={MapPin} />
      <TablaTop titulo="Patrulla / cuadrante que más comparendos realiza" filas={topN(registros, (r) => r.zonaAtencionPatrulla)} icono={Radio} />
      <TablaTop titulo="Unidad policial que más comparendos realiza" filas={topN(registros, (r) => r.unidadPolicial)} icono={Building2} />
      <TablaTop titulo="Funcionario que más comparendos realiza" filas={topN(registros, (r) => r.funcionario)} icono={Users} />
    </div>
  );
}

export function Rnmc() {
  const [registros, setRegistros] = useState<RegistroComparendo[] | null>(null);
  const [fechaCarga, setFechaCarga] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delitoActivo, setDelitoActivo] = useState<'H. Personas' | 'L. Personales'>('H. Personas');

  useEffect(() => {
    cargarComparendos().then((datos) => {
      if (datos) { setRegistros(datos.registros); setFechaCarga(datos.fecha); }
    });
  }, []);

  async function manejarArchivo(file: File) {
    setCargando(true);
    setError(null);
    try {
      const leidos = await leerMatrizComparendos(file);
      if (leidos.length === 0) throw new Error('El archivo no tiene filas de datos.');
      await guardarComparendos(leidos);
      setRegistros(leidos);
      setFechaCarga(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-brand-green"><Scale size={22} /></div>
          <div>
            <h2 className="text-base font-bold text-slate-800">RNMC — Registro Nacional de Medidas Correctivas</h2>
            {fechaCarga ? (
              <p className="text-xs text-slate-500">{registros?.length.toLocaleString('es-CO')} comparendo(s) cargado(s) · Actualizado el {new Date(fechaCarga).toLocaleString('es-CO')}</p>
            ) : (
              <p className="text-xs text-slate-500">Aún no se ha cargado la matriz de comparendos.</p>
            )}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
          {registros ? <RefreshCcw size={14} /> : <Upload size={14} />}
          {cargando ? 'Leyendo…' : registros ? 'Actualizar matriz' : 'Cargar matriz de comparendos'}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={cargando} onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }} />
        </label>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!registros ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          Carga la matriz de comparendos para ver el análisis — información sujeta a variación según lo cargado.
        </div>
      ) : (
        <>
          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="self-center text-xs font-semibold text-slate-500">Analizar:</span>
            {(['H. Personas', 'L. Personales'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDelitoActivo(d)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${delitoActivo === d ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Análisis {d === 'H. Personas' ? 'Hurto a Personas' : 'Lesiones Personales'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AnalisisDelito delito={delitoActivo} />
            <PanelCNSCC registros={registros} />
          </div>
        </>
      )}
    </div>
  );
}
