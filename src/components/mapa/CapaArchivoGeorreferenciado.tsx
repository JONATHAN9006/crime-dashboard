import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Upload, X, Eye, AlertTriangle, Trash2, Download } from 'lucide-react';
import { calcularKernelDensidad, type PuntoDensidad } from '../../utils/kernelDensity';
import { PALETA_ARCHIVO_CARGADO, ETIQUETAS_BANDA_ARCHIVO, type CapaArchivoGeorreferenciadoState } from '../../hooks/useCapaArchivoGeorreferenciado';

// ---------------------------------------------------------------------------
// Capa TEMPORAL de análisis (ver el hook useCapaArchivoGeorreferenciado para
// el estado/lógica) — todo vive SOLO en memoria del navegador. No toca
// DataContext, no toca Delitos, no toca IRISP1, no toca la base
// institucional en absoluto (punto 20 del pedido). Al recargar la página, o
// al darle "Eliminar archivo", desaparece sin dejar rastro.
//
// Va en DOS piezas porque necesitan vivir en dos partes distintas del árbol
// de componentes: el panel de controles (este archivo, función de abajo)
// va en la barra de herramientas de arriba del mapa; la capa que se dibuja
// en Leaflet (más abajo) tiene que ir DENTRO de <MapContainer>, porque
// useMap() solo funciona ahí.
// ---------------------------------------------------------------------------

function formatoNumero(n: number): string {
  return n.toLocaleString('es-CO');
}

/** El panel de controles — arrastrar/soltar, detección de columnas, validación, leyenda, transparencia, filtros y resumen. Sin dependencia de Leaflet. */
export function PanelArchivoGeorreferenciado(estado: CapaArchivoGeorreferenciadoState) {
  const [arrastrando, setArrastrando] = useState(false);
  const [mostrarInvalidos, setMostrarInvalidos] = useState(false);
  const {
    archivo, cargando, error, manejarArchivo, limpiarTodo,
    encabezados, colLat, setColLat, colLon, setColLon, pidiendoColumnas, setPidiendoColumnas,
    invertidasConfirmadas, setInvertidasConfirmadas, avisoInvertidas, setAvisoInvertidas,
    modoVisualizacion, setModoVisualizacion, coloresActivos, setColoresActivos, opacidad, setOpacidad,
    filtroDelito, setFiltroDelito, filtroCai, setFiltroCai,
    formatoDescarga, setFormatoDescarga, formatoDecimal, setFormatoDecimal, descargarCorregido,
    registros, registrosValidos, registrosInvalidos,
    opcionesDelito, opcionesCai, concentracionPorCai,
  } = estado;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">Cargar información georreferenciada</h3>

      {!archivo && (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) manejarArchivo(f); }}
          className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-xs transition-colors ${arrastrando ? 'border-blue-400 bg-blue-50' : 'border-slate-300'}`}
        >
          <Upload size={20} className="text-slate-400" />
          <p className="text-slate-600">Arrastra un archivo aquí, o</p>
          <label className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500">
            Seleccionar archivo
            <input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }} />
          </label>
          <p className="text-slate-500">CSV, XLS o XLSX</p>
        </div>
      )}

      {cargando && <p className="text-xs text-slate-500">Leyendo archivo…</p>}
      {error && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600">{error}</p>}

      {archivo && !cargando && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded border border-slate-200 bg-white p-2 text-xs text-slate-600">
            <span className="truncate">{archivo.name}</span>
            <button onClick={limpiarTodo} className="ml-2 flex shrink-0 items-center gap-1 rounded bg-red-100 px-2 py-1 text-red-700 hover:bg-red-200" title="Eliminar archivo">
              <Trash2 size={12} /> Eliminar archivo
            </button>
          </div>

          {pidiendoColumnas && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs">
              <p className="mb-1 flex items-center gap-1 text-amber-700"><AlertTriangle size={12} /> Confirma cuáles columnas son Latitud y Longitud:</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-slate-600">Columna LATITUD:
                  <select value={colLat} onChange={(e) => setColLat(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 text-slate-700">
                    <option value="">— Selecciona —</option>
                    {encabezados.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label className="text-slate-600">Columna LONGITUD:
                  <select value={colLon} onChange={(e) => setColLon(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 text-slate-700">
                    <option value="">— Selecciona —</option>
                    {encabezados.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              </div>
              {colLat && colLon && (
                <button onClick={() => setPidiendoColumnas(false)} className="mt-2 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-500">Confirmar</button>
              )}
            </div>
          )}

          {avisoInvertidas && !invertidasConfirmadas && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              <p className="mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Latitud/Longitud parecen estar invertidas.</p>
              <p className="mb-2 text-amber-700/80">{avisoInvertidas}</p>
              <div className="flex gap-2">
                <button onClick={() => setInvertidasConfirmadas(true)} className="rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-500">Sí, intercambiarlas</button>
                <button onClick={() => setAvisoInvertidas(null)} className="rounded bg-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-300">No, dejarlas así</button>
              </div>
            </div>
          )}

          {!pidiendoColumnas && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded border border-slate-200 bg-white p-2"><div className="text-slate-500">Registros cargados</div><div className="font-bold text-slate-800">{formatoNumero(registros.length)}</div></div>
                <div className="rounded border border-slate-200 bg-white p-2"><div className="text-slate-500">Válidas</div><div className="font-bold text-emerald-600">{formatoNumero(registrosValidos.length)}</div></div>
                <div className="rounded border border-slate-200 bg-white p-2">
                  <div className="text-slate-500">Inválidas</div>
                  <div className="font-bold text-red-600">{formatoNumero(registrosInvalidos.length)}</div>
                  {registrosInvalidos.length > 0 && (
                    <button onClick={() => setMostrarInvalidos(true)} className="mt-1 flex items-center gap-1 text-blue-600 hover:underline">
                      <Eye size={10} /> Ver
                    </button>
                  )}
                </div>
              </div>

              {mostrarInvalidos && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setMostrarInvalidos(false)}>
                  <div className="max-h-[70vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-semibold">Registros con coordenadas inválidas ({registrosInvalidos.length})</h4>
                      <button onClick={() => setMostrarInvalidos(false)}><X size={18} /></button>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead><tr className="border-b"><th className="p-1">Motivo</th><th className="p-1">{colLat}</th><th className="p-1">{colLon}</th></tr></thead>
                      <tbody>
                        {registrosInvalidos.slice(0, 200).map((r, i) => (
                          <tr key={i} className="border-b"><td className="p-1 text-red-600">{r.motivoInvalido}</td><td className="p-1">{String(r.fila[colLat])}</td><td className="p-1">{String(r.fila[colLon])}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {registrosInvalidos.length > 200 && <p className="mt-2 text-xs text-slate-500">Mostrando los primeros 200 de {registrosInvalidos.length}.</p>}
                  </div>
                </div>
              )}

              <div className="flex gap-3 text-xs text-slate-600">
                <label className="flex items-center gap-1"><input type="radio" checked={modoVisualizacion === 'puntos'} onChange={() => setModoVisualizacion('puntos')} /> Mostrar puntos</label>
                <label className="flex items-center gap-1"><input type="radio" checked={modoVisualizacion === 'calor'} onChange={() => setModoVisualizacion('calor')} /> Mostrar mapa de calor</label>
              </div>

              {modoVisualizacion === 'calor' && (
                <div className="space-y-1 text-xs text-slate-600">
                  {PALETA_ARCHIVO_CARGADO.map((color, i) => (
                    <label key={color} className="flex items-center gap-2">
                      <input type="checkbox" checked={coloresActivos[i] !== null} onChange={(e) => setColoresActivos((prev) => prev.map((c, j) => (j === i ? (e.target.checked ? color : null) : c)))} />
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />
                      {ETIQUETAS_BANDA_ARCHIVO[i]}
                    </label>
                  ))}
                </div>
              )}

              <div className="text-xs text-slate-600">
                <label className="mb-1 block">Transparencia — archivo cargado ({opacidad}%)</label>
                <input type="range" min={10} max={100} value={opacidad} onChange={(e) => setOpacidad(Number(e.target.value))} className="w-full" />
              </div>

              {(opcionesDelito.length > 0 || opcionesCai.length > 0) && (
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  {opcionesDelito.length > 0 && (
                    <label>Delito:
                      <select value={filtroDelito} onChange={(e) => setFiltroDelito(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 text-slate-700">
                        <option>Todos</option>
                        {opcionesDelito.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </label>
                  )}
                  {opcionesCai.length > 0 && (
                    <label>CAI:
                      <select value={filtroCai} onChange={(e) => setFiltroCai(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 text-slate-700">
                        <option>Todos</option>
                        {opcionesCai.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {concentracionPorCai.length > 0 && (
                <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                  <p className="mb-1 font-semibold text-slate-700">Concentración por CAI</p>
                  <ol className="space-y-0.5 text-slate-600">
                    {concentracionPorCai.slice(0, 10).map((c, i) => (
                      <li key={c.cai} className="flex justify-between">
                        <span>{i + 1}. {c.cai}</span>
                        <span className="tabular-nums">{formatoNumero(c.casos)} casos · {c.aportePct.toFixed(1)}%</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Descarga del archivo corregido — Latitud/Longitud ya
                  normalizadas a decimal, listas para reutilizar. */}
              <div className="rounded border border-slate-200 bg-white p-2 text-xs">
                <p className="mb-1.5 font-semibold text-slate-700">Descargar coordenadas corregidas</p>
                <div className="mb-2">
                  <p className="mb-1 text-slate-500">Descargar en:</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={formatoDescarga === 'excel'} onChange={() => setFormatoDescarga('excel')} /> Excel</label>
                    <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={formatoDescarga === 'csv'} onChange={() => setFormatoDescarga('csv')} /> CSV</label>
                  </div>
                </div>
                <div className="mb-2">
                  <p className="mb-1 text-slate-500">Descargar coordenadas en:</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={formatoDecimal === 'punto'} onChange={() => setFormatoDecimal('punto')} /> Decimales con punto</label>
                    <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={formatoDecimal === 'coma'} onChange={() => setFormatoDecimal('coma')} /> Decimales con coma</label>
                  </div>
                </div>
                <button onClick={descargarCorregido} className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500">
                  <Download size={14} /> Descargar {registros.length.toLocaleString('es-CO')} registros corregidos
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** La capa que de verdad se dibuja en Leaflet — DEBE ir dentro de <MapContainer>. Sin UI propia, solo pinta puntos o el mapa de calor según el estado del hook. */
export function CapaLeafletArchivoGeorreferenciado({ registrosFiltrados, modoVisualizacion, coloresActivos, opacidad }: Pick<CapaArchivoGeorreferenciadoState, 'registrosFiltrados' | 'modoVisualizacion' | 'coloresActivos' | 'opacidad'>) {
  const map = useMap();
  const capaRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (capaRef.current) { map.removeLayer(capaRef.current); capaRef.current = null; }
    if (registrosFiltrados.length === 0) return;

    if (modoVisualizacion === 'puntos') {
      const grupo = L.layerGroup(registrosFiltrados.map((r) => L.circleMarker([r.lat, r.lon], { radius: 4, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: opacidad / 100, weight: 1 })));
      grupo.addTo(map);
      capaRef.current = grupo;
      return;
    }

    const puntos: PuntoDensidad[] = registrosFiltrados.map((r) => ({ lat: r.lat, lon: r.lon }));
    const resultado = calcularKernelDensidad(puntos, coloresActivos);
    if (!resultado) return;
    const overlay = L.imageOverlay(resultado.dataUrl, resultado.bounds, { opacity: opacidad / 100, interactive: false });
    overlay.addTo(map);
    capaRef.current = overlay;
  }, [map, registrosFiltrados, modoVisualizacion, coloresActivos, opacidad]);

  useEffect(() => () => { if (capaRef.current) map.removeLayer(capaRef.current); }, [map]);

  return null;
}
