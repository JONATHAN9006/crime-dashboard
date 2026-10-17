import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Upload, X, Eye, AlertTriangle, Trash2, Download } from 'lucide-react';
import { calcularKernelDensidad, type PuntoDensidad } from '../../utils/kernelDensity';
import { ControlEstiloPuntos } from './PanelesMapa';
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
    modoVisualizacion, setModoVisualizacion, coloresActivos, setColoresActivos, opacidad, setOpacidad, estiloPuntos, setEstiloPuntos,
    filtroDelito, setFiltroDelito, filtroCai, setFiltroCai,
    formatoDescarga, setFormatoDescarga, formatoDecimal, setFormatoDecimal, descargarCorregido,
    registros, registrosValidos, registrosInvalidos,
    opcionesDelito, opcionesCai, concentracionPorCai,
    campoSimbologia, setCampoSimbologia, setColoresCategoria, setCategoriasOcultas, categoriasSimbologia,
  } = estado;
  const camposSimbologia = encabezados.filter((h) => h !== colLat && h !== colLon);

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

              {modoVisualizacion === 'puntos' && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                  <label className="block font-semibold text-slate-700">Simbología de los puntos
                    <select value={campoSimbologia} onChange={(e) => { setCampoSimbologia(e.target.value); setCategoriasOcultas([]); }} className="mt-1 w-full rounded border border-slate-300 bg-white p-1 font-normal text-slate-700">
                      <option value="">Símbolo único (un solo color)</option>
                      {camposSimbologia.map((h) => <option key={h} value={h}>Valores únicos de «{h}»</option>)}
                    </select>
                  </label>
                  {campoSimbologia && (
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Valor · color · casos</span>
                        <button type="button" onClick={() => setColoresCategoria({})} className="text-blue-600 hover:underline">Colores por defecto</button>
                      </div>
                      <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                        {categoriasSimbologia.map((c) => (
                          <li key={c.valor} className="flex items-center gap-1.5">
                            <input type="checkbox" checked={c.visible} title={c.visible ? 'Ocultar en el mapa' : 'Mostrar en el mapa'}
                              onChange={(e) => setCategoriasOcultas((prev) => (e.target.checked ? prev.filter((v) => v !== c.valor) : [...prev, c.valor]))} />
                            <input type="color" value={c.color} onChange={(e) => setColoresCategoria((prev) => ({ ...prev, [c.valor]: e.target.value }))}
                              className="h-5 w-6 shrink-0 cursor-pointer rounded border border-slate-300 bg-white p-0" title="Cambiar color" />
                            <span className={`min-w-0 flex-1 truncate ${c.visible ? 'text-slate-700' : 'text-slate-400 line-through'}`} title={c.valor}>{c.valor}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">{formatoNumero(c.casos)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {campoSimbologia
                    ? <ControlEstiloPuntos estilo={{ ...estiloPuntos, color: null }} onChange={(e) => setEstiloPuntos({ ...estiloPuntos, escala: e.escala })} colorAuto="#3b82f6" textoAuto="Por valor" />
                    : <ControlEstiloPuntos estilo={estiloPuntos} onChange={setEstiloPuntos} colorAuto="#3b82f6" textoAuto="Original" />}
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

/** La capa que de verdad se dibuja en Leaflet — DEBE ir dentro de <MapContainer>. Pinta puntos (símbolo único o valores únicos, con su leyenda) o el mapa de calor según el estado del hook. */
export function CapaLeafletArchivoGeorreferenciado({ registrosFiltrados, modoVisualizacion, coloresActivos, opacidad, estiloPuntos, simbologiaPuntos, categoriasSimbologia, campoSimbologia, archivo, setColoresCategoria, setCategoriasOcultas }: Pick<CapaArchivoGeorreferenciadoState, 'registrosFiltrados' | 'modoVisualizacion' | 'coloresActivos' | 'opacidad' | 'estiloPuntos' | 'simbologiaPuntos' | 'categoriasSimbologia' | 'campoSimbologia' | 'archivo' | 'setColoresCategoria' | 'setCategoriasOcultas'>) {
  const map = useMap();
  const capaRef = useRef<L.Layer | null>(null);
  const leyendaRef = useRef<L.Control | null>(null);

  useEffect(() => {
    if (capaRef.current) { map.removeLayer(capaRef.current); capaRef.current = null; }
    if (registrosFiltrados.length === 0) return;

    if (modoVisualizacion === 'puntos') {
      const radio = Math.max(1.5, 4 * (estiloPuntos?.escala ?? 1));
      const marcadores: L.Layer[] = [];
      for (const r of registrosFiltrados) {
        const cat = simbologiaPuntos ? simbologiaPuntos(r) : null;
        if (simbologiaPuntos && (!cat || !cat.visible)) continue;
        const color = cat ? cat.color : (estiloPuntos?.color ?? '#3b82f6');
        marcadores.push(L.circleMarker([r.lat, r.lon], { radius: radio, color: cat ? '#ffffff' : (estiloPuntos?.color ?? '#1d4ed8'), fillColor: color, fillOpacity: opacidad / 100, weight: cat ? 0.8 : 1 }));
      }
      const grupo = L.layerGroup(marcadores);
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
  }, [map, registrosFiltrados, modoVisualizacion, coloresActivos, opacidad, estiloPuntos, simbologiaPuntos]);

  // Leyenda en el mapa (valores únicos): título = campo y cada valor con su
  // color y casos. El CUADRITO DE COLOR se puede tocar para elegir otro color
  // ahí mismo, y el nombre para ocultar/mostrar ese valor en el mapa.
  useEffect(() => {
    if (leyendaRef.current) { leyendaRef.current.remove(); leyendaRef.current = null; }
    if (modoVisualizacion !== 'puntos' || !campoSimbologia || categoriasSimbologia.length === 0) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
    const control = new L.Control({ position: 'bottomleft' });
    control.onAdd = () => {
      const div = L.DomUtil.create('div');
      div.setAttribute('style', 'background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;box-shadow:0 2px 8px rgba(0,0,0,.15);font:12px/1.35 system-ui,Arial,sans-serif;color:#10233f;max-height:300px;overflow:auto;min-width:170px;max-width:270px');
      div.innerHTML = `<div style="font-weight:700;margin-bottom:2px">${esc(campoSimbologia)}</div>`
        + (archivo ? `<div style="font-size:10.5px;color:#64748b;margin-bottom:2px">${esc(archivo.name)}</div>` : '')
        + '<div data-ocultar-en-descarga="1" style="font-size:10px;color:#94a3b8;margin-bottom:5px">Clic en el color para cambiarlo · clic en el nombre para ocultar</div>'
        + categoriasSimbologia.map((c, i) => `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;${c.visible ? '' : 'opacity:.45'}">`
          + `<label title="Cambiar color" style="position:relative;width:15px;height:15px;border-radius:50%;background:${c.color};border:2px solid #fff;box-shadow:0 0 0 1px ${c.color};flex-shrink:0;cursor:pointer;overflow:hidden"><input data-i="${i}" type="color" value="${c.color}" style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;border:0;padding:0"></label>`
          + `<span data-ocultar="${i}" title="${c.visible ? 'Ocultar' : 'Mostrar'} «${esc(c.valor)}»" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;${c.visible ? '' : 'text-decoration:line-through'}">${esc(c.valor)}</span>`
          + `<b style="font-variant-numeric:tabular-nums">${c.casos.toLocaleString('es-CO')}</b></div>`).join('');
      div.querySelectorAll<HTMLInputElement>('input[type=color]').forEach((inp) => {
        inp.addEventListener('change', () => {
          const c = categoriasSimbologia[Number(inp.dataset.i)];
          if (c) setColoresCategoria((prev) => ({ ...prev, [c.valor]: inp.value }));
        });
      });
      div.querySelectorAll<HTMLElement>('[data-ocultar]').forEach((el) => {
        el.addEventListener('click', () => {
          const c = categoriasSimbologia[Number(el.dataset.ocultar)];
          if (c) setCategoriasOcultas((prev) => (prev.includes(c.valor) ? prev.filter((v) => v !== c.valor) : [...prev, c.valor]));
        });
      });
      L.DomEvent.disableScrollPropagation(div);
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    control.addTo(map);
    leyendaRef.current = control;
  }, [map, modoVisualizacion, campoSimbologia, categoriasSimbologia, archivo, setColoresCategoria, setCategoriasOcultas]);

  useEffect(() => () => {
    if (capaRef.current) map.removeLayer(capaRef.current);
    if (leyendaRef.current) leyendaRef.current.remove();
  }, [map]);

  return null;
}
