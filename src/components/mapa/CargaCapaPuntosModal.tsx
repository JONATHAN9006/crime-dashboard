import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UploadCloud, CheckCircle2 } from 'lucide-react';
import {
  leerExcelComoFilas, detectarColumna, detectarTipoCapa, construirPuntos, type CapaPuntos,
} from '../../data/puntosStorage';

export function CargaCapaPuntosModal({ nombreCapa, onCerrar, onGuardar }: {
  nombreCapa: string;
  onCerrar: () => void;
  onGuardar: (capa: CapaPuntos) => void;
}) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargadoPor, setCargadoPor] = useState('');
  const [filas, setFilas] = useState<Record<string, any>[] | null>(null);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [colLat, setColLat] = useState<string>('');
  const [colLon, setColLon] = useState<string>('');
  const [colDelito, setColDelito] = useState<string>('');
  const [colEstado, setColEstado] = useState<string>('');
  const [colEstadoExistencia, setColEstadoExistencia] = useState<string>('');
  const [colDependencia, setColDependencia] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function manejarArchivo(f: File) {
    setError(null);
    setArchivo(f);
    setProcesando(true);
    try {
      const { filas: filasLeidas, columnas: cols } = await leerExcelComoFilas(f);
      if (filasLeidas.length === 0) {
        setError('El archivo no tiene filas de datos.');
        setProcesando(false);
        return;
      }
      setFilas(filasLeidas);
      setColumnas(cols);
      // Detección automática — el usuario puede corregir cualquiera abajo
      // antes de confirmar, así que un acierto parcial no rompe nada.
      setColLat(detectarColumna(cols, 'lat') ?? '');
      setColLon(detectarColumna(cols, 'lon') ?? '');
      setColDelito(detectarColumna(cols, 'delito') ?? '');
      setColEstado(detectarColumna(cols, 'estado') ?? '');
      setColEstadoExistencia(detectarColumna(cols, 'estadoExistencia') ?? '');
      setColDependencia(detectarColumna(cols, 'dependencia') ?? '');
    } catch (e) {
      setError('No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) o CSV válido.');
    } finally {
      setProcesando(false);
    }
  }

  function confirmar() {
    if (!filas || !colLat || !colLon) {
      setError('Selecciona cuál columna trae la Latitud y cuál la Longitud — son obligatorias para poder ubicar los puntos.');
      return;
    }
    const tipo = detectarTipoCapa(columnas);
    const puntos = construirPuntos(filas, colLat, colLon, colDelito || null, tipo, colDependencia || null);
    if (puntos.length === 0) {
      setError('Ninguna fila tiene coordenadas válidas con las columnas seleccionadas. Revisa que Latitud/Longitud sean las correctas.');
      return;
    }
    const capa: CapaPuntos = {
      id: `${Date.now()}`,
      nombre: nombreCapa,
      tipo,
      archivoNombre: archivo?.name ?? '',
      cargadoPor: cargadoPor.trim() || 'No identificado',
      fechaCarga: new Date().toISOString(),
      columnas,
      colLat, colLon,
      colDelito: colDelito || null,
      colEstado: colEstado || null,
      colEstadoExistencia: colEstadoExistencia || null,
      colDependencia: colDependencia || null,
      puntos,
      visible: true,
      filtroEstado: [],
      filtroEstadoExistencia: [],
      filtroDependencia: [],
      filtroDelitoPropio: [],
    };
    onGuardar(capa);
  }

  return createPortal(
    // z-[10000] + portal directo a document.body: el mapa de Leaflet usa
    // z-index propios muy altos en sus controles (hasta 1000), y si este
    // formulario se queda dentro del árbol normal de la página, el mapa
    // puede terminar "comiéndose" la parte de abajo del formulario (el botón
    // de confirmar quedaba tapado). Renderizarlo directo en el body, por
    // encima de todo, lo resuelve de raíz.
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Cargar capa: {nombreCapa}</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">¿Quién está cargando esta información?</span>
          <input
            type="text"
            value={cargadoPor}
            onChange={(e) => setCargadoPor(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="mb-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-brand-green hover:text-brand-green">
          <UploadCloud size={18} />
          {archivo ? archivo.name : `Selecciona el Excel de ${nombreCapa} (.xlsx)`}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }} />
        </label>

        {procesando && <p className="text-sm text-slate-400">Leyendo archivo...</p>}

        {error && <p className="mb-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

        {filas && (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 size={14} /> {filas.length} filas leídas, {columnas.length} columnas detectadas. Confirma o corrige abajo cuál columna corresponde a cada dato:
            </p>

            <SelectorColumna label="Latitud (obligatorio)" columnas={columnas} valor={colLat} onChange={setColLat} requerido />
            <SelectorColumna label="Longitud (obligatorio)" columnas={columnas} valor={colLon} onChange={setColLon} requerido />
            <SelectorColumna label="Delito principal (opcional)" columnas={columnas} valor={colDelito} onChange={setColDelito} />
            <SelectorColumna label="Estado del trámite (opcional) — ej. Investigación, Finalizado" columnas={columnas} valor={colEstado} onChange={setColEstado} />
            <SelectorColumna label="Estado de existencia (opcional) — ej. Si existe, No existe" columnas={columnas} valor={colEstadoExistencia} onChange={setColEstadoExistencia} />
            <SelectorColumna label="Dependencia (opcional)" columnas={columnas} valor={colDependencia} onChange={setColDependencia} />

            <p className="text-[11px] text-slate-400">
              Con Delito principal seleccionado, esta capa se filtrará automáticamente según el Delito activo en el filtro general del dashboard (comparando por palabra clave, no por texto exacto — los dos sistemas nombran los delitos distinto). Los demás campos habilitan tablas y filtros propios de esta capa en el mapa.
            </p>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={!filas}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:bg-brand-green-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cargar {filas ? `${filas.length} puntos` : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SelectorColumna({ label, columnas, valor, onChange, requerido }: {
  label: string; columnas: string[]; valor: string; onChange: (v: string) => void; requerido?: boolean;
}) {
  return (
    <label className="block">
      <span className={`mb-1 block text-xs font-medium ${requerido ? 'text-slate-700' : 'text-slate-500'}`}>{label}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
        <option value="">{requerido ? '— Selecciona una columna —' : '— No aplica / no usar —'}</option>
        {columnas.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </label>
  );
}
