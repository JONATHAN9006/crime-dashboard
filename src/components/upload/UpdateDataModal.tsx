import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FolderOpen, Trash2, UploadCloud, X, CloudOff, Lock, RefreshCcw } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { UpdateMode, UpdateSummary } from '../../types/crime';
import { formatFechaHora } from '../../utils/aggregations';
import { obtenerConfig } from '../../config';

type Resultado = (UpdateSummary & { sincronizado?: boolean; errorSincronizacion?: string }) | { error: string };

export function UpdateDataForm({ onCompletado }: { onCompletado?: () => void }) {
  const { cargarArchivo, limpiarTodo, meta, records, backendUrl } = useData();
  const { updatePassword } = obtenerConfig();
  const [modo, setModo] = useState<UpdateMode>('agregar');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [token, setToken] = useState('');
  const [usuario, setUsuario] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function procesar() {
    if (!archivo) return;

    // Protección local: si no hay backend configurado, la clave se valida en el
    // propio navegador contra la clave definida en config.js.
    if (!backendUrl && updatePassword && token !== updatePassword) {
      setResultado({ error: 'Clave de actualización incorrecta. No se realizaron cambios.' });
      return;
    }

    setProcesando(true);
    const res = await cargarArchivo(archivo, modo, token || undefined, usuario);
    setResultado(res);
    setProcesando(false);
  }

  function reiniciar() {
    setArchivo(null);
    setToken('');
    setResultado(null);
    onCompletado?.();
  }

  const requiereClave = !!backendUrl || !!updatePassword;

  return (
    <div>
      {meta && (
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>Datos actuales: <strong>{records.length.toLocaleString('es-CO')}</strong> registros · Última actualización: {meta.ultimaActualizacion ? formatFechaHora(meta.ultimaActualizacion) : '—'}</p>
        </div>
      )}

      {backendUrl && !resultado && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-navy/20 bg-brand-navy/5 p-3 text-xs text-brand-navy">
          <UploadCloud size={15} className="mt-0.5 shrink-0" />
          <p>Este dashboard está conectado a un servidor central. Al cargar el archivo, la actualización quedará disponible para <strong>todas</strong> las personas que consulten el dashboard, no solo en este navegador.</p>
        </div>
      )}
      {!backendUrl && !resultado && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <CloudOff size={15} className="mt-0.5 shrink-0" />
          <p>Este dashboard aún no está conectado a un servidor central: la actualización solo se guardará en este navegador.</p>
        </div>
      )}

      {!resultado && (
        <>
          <p className="mb-2 text-sm font-medium text-slate-700">Modo de actualización</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setModo('agregar')}
              className={`rounded-lg border p-3 text-left text-sm ${modo === 'agregar' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
            >
              <p className="font-semibold text-slate-800">Agregar información</p>
              <p className="mt-0.5 text-xs text-slate-500">Incorpora nuevos registros sin perder los existentes. Detecta duplicados automáticamente.</p>
            </button>
            <button
              onClick={() => setModo('reemplazar')}
              className={`rounded-lg border p-3 text-left text-sm ${modo === 'reemplazar' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
            >
              <p className="font-semibold text-slate-800">Reemplazar información</p>
              <p className="mt-0.5 text-xs text-slate-500">Elimina los datos actuales y trabaja únicamente con el nuevo archivo.</p>
            </button>
          </div>

          <p className="mb-2 text-sm font-medium text-slate-700">Archivo de datos (CSV o Excel)</p>
          <div
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-center hover:border-brand-green"
          >
            <UploadCloud size={26} className="text-slate-400" />
            <p className="text-sm text-slate-600">{archivo ? archivo.name : 'Haz clic para seleccionar un archivo CSV o Excel (.xlsx)'}</p>
            <p className="text-xs text-slate-400">Acepta Matriz Base (Año, Mes, Fecha Dia, Delito...) o una descarga DB2 directa del aplicativo (FECHA_HECHO, DELITOS, CANTIDAD...) — se transforma automáticamente.</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="mt-4 space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Tu nombre (queda registrado en el historial)</label>
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Ej: Jonathan"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            {requiereClave && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
                  <Lock size={11} /> Clave de actualización
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Clave compartida con las personas de confianza"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            )}
          </div>

          <button
            disabled={!archivo || procesando || (requiereClave && !token)}
            onClick={procesar}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-navy py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <FolderOpen size={16} /> {procesando ? 'Procesando...' : 'Cargar y validar archivo'}
          </button>

          <button
            onClick={async () => { if (confirm('¿Eliminar todos los datos de este navegador? (esto no afecta al servidor central)')) { await limpiarTodo(); reiniciar(); } }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
          >
            <Trash2 size={13} /> Limpiar datos locales de este navegador
          </button>
        </>
      )}

      {resultado && 'error' in resultado && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{resultado.error}</p>
        </div>
      )}

      {resultado && !('error' in resultado) && (
        <div className="space-y-2">
          {resultado.formatoDetectado === 'db2' && (
            <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800">
              <RefreshCcw size={16} className="mt-0.5 shrink-0" />
              <p>Se detectó una descarga DB2 (formato del aplicativo) y se transformó automáticamente a la estructura normalizada del dashboard.</p>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Actualización completada</p>
              <p>Registros encontrados: {resultado.nuevos}</p>
              <p>Registros nuevos incorporados: {resultado.incorporados}</p>
              <p>Registros duplicados detectados (omitidos): {resultado.duplicados}</p>
              {resultado.filasConErroresDB2 !== undefined && (
                <p>Registros con errores (omitidos): {resultado.filasConErroresDB2.length}</p>
              )}
              <p className="mt-1 text-xs text-emerald-600">Total en el dataset: {resultado.totalFinal.toLocaleString('es-CO')} registros</p>
            </div>
          </div>

          {resultado.filasConErroresDB2 && resultado.filasConErroresDB2.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="mb-1 font-semibold">Detalle de errores encontrados (no se incorporaron al dashboard):</p>
              <ul className="max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4">
                {resultado.filasConErroresDB2.slice(0, 15).map((e, i) => (
                  <li key={i}>Fila {e.indice + 2}: {e.motivo}</li>
                ))}
              </ul>
              {resultado.filasConErroresDB2.length > 15 && <p className="mt-1">... y {resultado.filasConErroresDB2.length - 15} más.</p>}
            </div>
          )}

          {resultado.valoresNuevosDB2 && resultado.valoresNuevosDB2.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">Valores nuevos detectados (no existían en la tabla de correspondencia; se conservaron tal cual):</p>
              <ul className="max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4">
                {resultado.valoresNuevosDB2.slice(0, 15).map((v, i) => <li key={i}>{v}</li>)}
              </ul>
              {resultado.valoresNuevosDB2.length > 15 && <p className="mt-1">... y {resultado.valoresNuevosDB2.length - 15} más.</p>}
            </div>
          )}

          {backendUrl && resultado.sincronizado && (
            <div className="flex items-start gap-2 rounded-lg bg-brand-navy/5 p-3 text-sm text-brand-navy">
              <UploadCloud size={16} className="mt-0.5 shrink-0" />
              <p>Sincronizado con el servidor central. Todas las personas verán esta actualización al abrir o sincronizar el dashboard.</p>
            </div>
          )}
          {backendUrl && resultado.sincronizado === false && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p>{resultado.errorSincronizacion || 'No se pudo sincronizar con el servidor central.'} Los datos quedaron guardados solo en este navegador.</p>
            </div>
          )}

          {resultado.columnasNuevas.length > 0 && (
            <p className="text-xs text-slate-500">Nuevas columnas detectadas y conservadas: {resultado.columnasNuevas.join(', ')}</p>
          )}
          <button onClick={reiniciar} className="mt-2 w-full rounded-lg bg-brand-navy py-2 text-sm font-semibold text-white">
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

export function UpdateDataModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">📂 Actualizar información</h2>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          <UpdateDataForm onCompletado={onCerrar} />
        </div>
      </div>
    </div>
  );
}
