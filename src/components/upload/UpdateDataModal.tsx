import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FolderOpen, Trash2, UploadCloud, X, CloudOff, Lock, RefreshCcw } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { UpdateMode, UpdateSummary } from '../../types/crime';
import { formatFechaHora } from '../../utils/aggregations';
import { obtenerConfig } from '../../config';
import { EliminarInformacion } from './EliminarInformacion';
import { claveGuardada, recordarClaveSesion, revisarErrorDeClave } from '../../utils/claveSesion';

type Resultado = (UpdateSummary & { sincronizado?: boolean; errorSincronizacion?: string; requiereConfirmacion?: boolean; totalFilasActual?: number; totalFilasNuevo?: number; requiereConfirmacionAnio?: boolean; aniosAReemplazar?: number[]; registrosAEliminar?: number; registrosDelArchivo?: number; requiereConfirmacionRepetidos?: boolean; coincidenciasRepetidas?: number; aniosRepetidos?: number[] }) | { error: string };

export function UpdateDataForm({ onCompletado }: { onCompletado?: () => void }) {
  const { cargarArchivo, limpiarTodo, meta, records, backendUrl, cargarArchivoOperatividad, operatividadMeta } = useData();
  const { updatePassword } = obtenerConfig();
  const [tipoDataset, setTipoDataset] = useState<'delictividad' | 'operatividad'>('delictividad');
  const [modo, setModo] = useState<UpdateMode>('agregar');
  const [archivo, setArchivo] = useState<File | null>(null);
  // Precargada con la clave de esta sesión (si ya se escribió en otro módulo).
  const [token, setToken] = useState(() => claveGuardada() ?? '');
  const [usuario, setUsuario] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [resultadoOperatividad, setResultadoOperatividad] = useState<{ registros: number } | { error: string } | null>(null);
  const [modoOperatividad, setModoOperatividad] = useState<'reemplazar' | 'agregar' | 'reemplazarAnio'>('reemplazarAnio');
  const inputRef = useRef<HTMLInputElement>(null);

  async function procesar() {
    if (!archivo) return;

    if (tipoDataset === 'operatividad') {
      setProcesando(true);
      const res = await cargarArchivoOperatividad(archivo, token || undefined, usuario, modoOperatividad);
      setResultadoOperatividad(res);
      setProcesando(false);
      return;
    }

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
    // Clave aceptada → se recuerda para esta pestaña (RNMC, IRISP1, MACRI y
    // capas del mapa ya no la vuelven a pedir); rechazada → se olvida.
    const textoError = 'error' in res ? res.error : (res as { errorSincronizacion?: string }).errorSincronizacion;
    if (textoError) revisarErrorDeClave(new Error(textoError));
    else if (token) recordarClaveSesion(token);
  }

  function reiniciar() {
    setArchivo(null);
    setToken('');
    setResultado(null);
    setResultadoOperatividad(null);
    onCompletado?.();
  }

  const requiereClave = !!backendUrl || (tipoDataset === 'delictividad' && !!updatePassword);

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">¿Qué información vas a subir?</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => { setTipoDataset('delictividad'); setResultado(null); setResultadoOperatividad(null); setArchivo(null); }}
          className={`rounded-lg border p-3 text-left text-sm ${tipoDataset === 'delictividad' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
        >
          <p className="font-semibold text-slate-800">🚔 Delictividad</p>
          <p className="mt-0.5 text-xs text-slate-500">Matriz Base o descarga DB2 (delitos, casos).</p>
        </button>
        <button
          onClick={() => { setTipoDataset('operatividad'); setResultado(null); setResultadoOperatividad(null); setArchivo(null); }}
          className={`rounded-lg border p-3 text-left text-sm ${tipoDataset === 'operatividad' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
        >
          <p className="font-semibold text-slate-800">🎯 Operatividad</p>
          <p className="mt-0.5 text-xs text-slate-500">Capturas, incautaciones, recuperaciones.</p>
        </button>
      </div>

      {tipoDataset === 'delictividad' && meta && (
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>Datos actuales: <strong>{records.length.toLocaleString('es-CO')}</strong> registros · Última actualización: {meta.ultimaActualizacion ? formatFechaHora(meta.ultimaActualizacion) : '—'}</p>
        </div>
      )}
      {tipoDataset === 'operatividad' && operatividadMeta && (
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p>Datos actuales: <strong>{operatividadMeta.totalRegistros.toLocaleString('es-CO')}</strong> registros · Última actualización: {operatividadMeta.ultimaActualizacion ? formatFechaHora(operatividadMeta.ultimaActualizacion) : '—'}</p>
        </div>
      )}

      {tipoDataset === 'operatividad' && (
        backendUrl ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-navy/20 bg-brand-navy/5 p-3 text-xs text-brand-navy">
            <UploadCloud size={15} className="mt-0.5 shrink-0" />
            <p>La Operatividad se sincroniza con el servidor central, igual que la Delictividad — cualquier persona que consulte el dashboard verá esta misma actualización.</p>
          </div>
        ) : (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <CloudOff size={15} className="mt-0.5 shrink-0" />
            <p>La Operatividad se guarda solo en este navegador (todavía no hay servidor central configurado).</p>
          </div>
        )
      )}

      {tipoDataset === 'operatividad' && (
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setModoOperatividad('agregar')}
            className={`rounded-lg border p-3 text-left text-sm ${modoOperatividad === 'agregar' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
          >
            <p className="font-semibold text-slate-800">Agregar información</p>
            <p className="mt-0.5 text-xs text-slate-500">Incorpora este archivo sin borrar lo ya cargado — para el año anterior (2025), que no se vuelve a subir.</p>
          </button>
          <button
            type="button"
            onClick={() => setModoOperatividad('reemplazarAnio')}
            className={`rounded-lg border p-3 text-left text-sm ${modoOperatividad === 'reemplazarAnio' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
          >
            <p className="font-semibold text-slate-800">Actualizar año completo</p>
            <p className="mt-0.5 text-xs text-slate-500">Reemplaza SOLO el/los año(s) que trae el archivo (ej. 2026) — los demás años quedan intactos. Recomendado para la matriz del año en curso.</p>
          </button>
          <button
            type="button"
            onClick={() => setModoOperatividad('reemplazar')}
            className={`rounded-lg border p-3 text-left text-sm ${modoOperatividad === 'reemplazar' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
          >
            <p className="font-semibold text-slate-800">Reemplazar todo</p>
            <p className="mt-0.5 text-xs text-slate-500">Elimina TODOS los años de Operatividad ya cargados y deja únicamente este archivo.</p>
          </button>
        </div>
      )}

      {tipoDataset === 'delictividad' && backendUrl && !resultado && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand-navy/20 bg-brand-navy/5 p-3 text-xs text-brand-navy">
          <UploadCloud size={15} className="mt-0.5 shrink-0" />
          <p>Este dashboard está conectado a un servidor central. Al cargar el archivo, la actualización quedará disponible para <strong>todas</strong> las personas que consulten el dashboard, no solo en este navegador.</p>
        </div>
      )}
      {tipoDataset === 'delictividad' && !backendUrl && !resultado && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <CloudOff size={15} className="mt-0.5 shrink-0" />
          <p>Este dashboard aún no está conectado a un servidor central: la actualización solo se guardará en este navegador.</p>
        </div>
      )}

      {!resultado && !resultadoOperatividad && (
        <>
          {tipoDataset === 'delictividad' && (
            <>
              <p className="mb-2 text-sm font-medium text-slate-700">Modo de actualización</p>
              <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                  onClick={() => setModo('agregar')}
                  className={`rounded-lg border p-3 text-left text-sm ${modo === 'agregar' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
                >
                  <p className="font-semibold text-slate-800">Agregar información</p>
                  <p className="mt-0.5 text-xs text-slate-500">Incorpora nuevos registros sin perder los existentes. Detecta duplicados automáticamente.</p>
                </button>
                <button
                  onClick={() => setModo('reemplazarAnio')}
                  className={`rounded-lg border p-3 text-left text-sm ${modo === 'reemplazarAnio' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
                >
                  <p className="font-semibold text-slate-800">Actualizar año completo</p>
                  <p className="mt-0.5 text-xs text-slate-500">Reemplaza SOLO el/los año(s) que trae el archivo (ej. todo 2026) — los demás años quedan intactos. Recomendado si siempre subes la misma matriz completa del año.</p>
                </button>
                <button
                  onClick={() => setModo('reemplazar')}
                  className={`rounded-lg border p-3 text-left text-sm ${modo === 'reemplazar' ? 'border-brand-green bg-brand-green/5 ring-1 ring-brand-green' : 'border-slate-200'}`}
                >
                  <p className="font-semibold text-slate-800">Reemplazar todo</p>
                  <p className="mt-0.5 text-xs text-slate-500">Elimina TODOS los años ya cargados y trabaja únicamente con el nuevo archivo.</p>
                </button>
              </div>
            </>
          )}

          <p className="mb-2 text-sm font-medium text-slate-700">Archivo de datos (CSV o Excel)</p>
          <div
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-6 text-center hover:border-brand-green"
          >
            <UploadCloud size={26} className="text-slate-400" />
            <p className="text-sm text-slate-600">{archivo ? archivo.name : 'Haz clic para seleccionar un archivo CSV o Excel (.xlsx)'}</p>
            <p className="text-xs text-slate-400">
              {tipoDataset === 'delictividad'
                ? 'Acepta Matriz Base (Año, Mes, Fecha Dia, Delito...) o una descarga DB2 directa del aplicativo (FECHA_HECHO, DELITOS, CANTIDAD...) — se transforma automáticamente.'
                : 'Excel con las columnas OPERATIVIDAD y DELITO_ASOCIADO (capturas, incautaciones, recuperaciones).'}
            </p>
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

          {tipoDataset === 'delictividad' && records.length > 0 && (
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Trash2 size={14} className="text-rose-500" /> Eliminar información (año, carga o rango de fechas)
              </summary>
              <div className="mt-3">
                <EliminarInformacion token={token} usuario={usuario} requiereClave={requiereClave} />
              </div>
            </details>
          )}

          {tipoDataset === 'delictividad' && (
            <button
              onClick={async () => { if (confirm('¿Eliminar todos los datos de este navegador? (esto no afecta al servidor central)')) { await limpiarTodo(); reiniciar(); } }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              <Trash2 size={13} /> Limpiar datos locales de este navegador
            </button>
          )}
        </>
      )}

      {resultadoOperatividad && 'error' in resultadoOperatividad && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{resultadoOperatividad.error}</p>
        </div>
      )}
      {resultadoOperatividad && !('error' in resultadoOperatividad) && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Operatividad actualizada</p>
              <p>Registros cargados: {resultadoOperatividad.registros}</p>
            </div>
          </div>
          <button onClick={reiniciar} className="mt-2 w-full rounded-lg bg-brand-navy py-2 text-sm font-semibold text-white">Cerrar</button>
        </div>
      )}

      {resultado && 'error' in resultado && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{resultado.error}</p>
        </div>
      )}

      {resultado && !('error' in resultado) && resultado.requiereConfirmacionAnio && (
        <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Vas a reemplazar por completo el/los año(s): {resultado.aniosAReemplazar?.join(', ')}</p>
              <p className="mt-1">
                Esto va a <strong>eliminar {resultado.registrosAEliminar?.toLocaleString('es-CO')} registro(s)</strong> que ya estaban guardados de {resultado.aniosAReemplazar?.length === 1 ? 'ese año' : 'esos años'}, y los va a reemplazar por los <strong>{resultado.registrosDelArchivo?.toLocaleString('es-CO')} registro(s)</strong> de este archivo. Los demás años NO se tocan.
              </p>
              <p className="mt-2 text-xs text-amber-700">Revisa que el/los año(s) de arriba sean los que esperabas antes de continuar — si ves un año que no debería estar ahí (ej. 2024 o 2025 en un archivo que debería ser solo de 2026), cancela y avísanos.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!archivo) return;
                setProcesando(true);
                const res = await cargarArchivo(archivo, modo, token || undefined, usuario, true);
                setResultado(res);
                setProcesando(false);
              }}
              disabled={procesando}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Sí, entiendo — reemplazar {resultado.aniosAReemplazar?.length === 1 ? 'ese año' : 'esos años'}
            </button>
            <button onClick={() => setResultado(null)} disabled={procesando} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && !('error' in resultado) && resultado.requiereConfirmacionRepetidos && (
        <div className="space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600" />
            <div className="text-sm text-rose-900">
              <p className="font-semibold">Este archivo parece repetir información que ya está cargada</p>
              <p className="mt-1">
                <strong>{resultado.coincidenciasRepetidas?.toLocaleString('es-CO')}</strong> de los {resultado.registrosDelArchivo?.toLocaleString('es-CO')} registros del archivo coinciden (misma fecha, hora, delito, barrio, edad y género) con casos ya guardados
                {resultado.aniosRepetidos && resultado.aniosRepetidos.length > 0 ? <> de <strong>{resultado.aniosRepetidos.join(', ')}</strong></> : null}.
                Si los agregas, esos casos quedarían <strong>sumados dos veces</strong>.
              </p>
              <p className="mt-2 text-xs text-rose-700">Si lo que quieres es actualizar ese año con este archivo, usa "Actualizar año completo": reemplaza el año entero sin duplicar.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={async () => {
                if (!archivo) return;
                setModo('reemplazarAnio');
                setProcesando(true);
                const res = await cargarArchivo(archivo, 'reemplazarAnio', token || undefined, usuario);
                setResultado(res);
                setProcesando(false);
              }}
              disabled={procesando}
              className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Usar "Actualizar año completo" (recomendado)
            </button>
            <button
              onClick={async () => {
                if (!archivo) return;
                setProcesando(true);
                const res = await cargarArchivo(archivo, 'agregar', token || undefined, usuario, true);
                setResultado(res);
                setProcesando(false);
              }}
              disabled={procesando}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              Agregar de todas formas
            </button>
            <button onClick={() => setResultado(null)} disabled={procesando} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {resultado && !('error' in resultado) && !resultado.requiereConfirmacionAnio && !resultado.requiereConfirmacionRepetidos && (
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
              {resultado.aniosReemplazados && resultado.aniosReemplazados.length > 0 ? (
                <>
                  <p>Año(s) reemplazado(s) por completo: {resultado.aniosReemplazados.join(', ')}</p>
                  <p>Registros viejos de esos años eliminados: {resultado.registrosAnterioresEliminados ?? 0}</p>
                  <p>Registros del archivo nuevo incorporados: {resultado.incorporados}</p>
                </>
              ) : (
                <>
                  <p>Registros encontrados: {resultado.nuevos}</p>
                  <p>Registros nuevos incorporados: {resultado.incorporados}</p>
                  <p>Registros duplicados detectados (omitidos): {resultado.duplicados}</p>
                </>
              )}
              {!!resultado.actualizadosConCoordenadas && (
                <p>De esos duplicados, se les agregó Latitud/Longitud a: {resultado.actualizadosConCoordenadas}</p>
              )}
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
              <div>
                <p>{resultado.errorSincronizacion || 'No se pudo sincronizar con el servidor central.'} Los datos quedaron guardados solo en este navegador.</p>
                {resultado.requiereConfirmacion && (
                  <>
                    <p className="mt-2 text-xs text-amber-700">
                      Guardado ahora: {resultado.totalFilasActual?.toLocaleString('es-CO')} registros · Lo que intentaste subir: {resultado.totalFilasNuevo?.toLocaleString('es-CO')} registros.
                      Antes de forzarlo, te recomendamos volver a descargar los datos más recientes y fusionar tu información sobre eso.
                    </p>
                    <button
                      onClick={async () => {
                        if (!archivo) return;
                        setProcesando(true);
                        const res = await cargarArchivo(archivo, modo, token || undefined, usuario, true);
                        setResultado(res);
                        setProcesando(false);
                      }}
                      disabled={procesando}
                      className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      Entiendo el riesgo — reemplazar de todas formas
                    </button>
                  </>
                )}
              </div>
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
