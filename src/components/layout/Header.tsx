import { useState } from 'react';
import { Menu, FolderOpen, Info, RefreshCw, Cloud, CloudOff, FileDown, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { formatFecha, formatFechaHora, formatNumero } from '../../utils/aggregations';
import { UpdateDataModal } from '../upload/UpdateDataModal';
import { useDatosExportacionPptx, generarPowerPoint } from '../../data/pptxExport';
import { esModoConsulta } from '../../utils/modoConsulta';

export function Header({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { records, meta, filteredRecords, recordsBase, filters, backendUrl, remoteStatus, remoteError, remoteMeta, sincronizar, actualizacionDisponible, descartarAvisoActualizacion } = useData();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [generandoPptx, setGenerandoPptx] = useState(false);
  const soloLectura = esModoConsulta();

  // Todos los cálculos del PowerPoint provienen de los mismos hooks que usan
  // las páginas del dashboard — ver data/pptxExport.ts.
  const datosPptx = useDatosExportacionPptx(filteredRecords, recordsBase, filters, records, meta?.fechaMaxParametro);

  const actualizadoHoy = meta?.ultimaActualizacion
    ? (Date.now() - meta.ultimaActualizacion.getTime()) < 1000 * 60 * 60 * 24 * 30
    : false;

  async function onSincronizar() {
    setSincronizando(true);
    await sincronizar();
    setSincronizando(false);
  }

  async function onDescargarPptx() {
    if (filteredRecords.length === 0) return;
    setGenerandoPptx(true);
    try {
      await generarPowerPoint({ ...datosPptx, filteredRecords, filters });
    } finally {
      setGenerandoPptx(false);
    }
  }

  return (
    <>
      {actualizacionDisponible && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl" style={{ animation: 'toast-in 0.25s ease-out' }}>
          <Cloud size={16} className="shrink-0 text-emerald-400" />
          <span>Información actualizada automáticamente{remoteMeta?.ultimoUsuario ? ` (por ${remoteMeta.ultimoUsuario})` : ''}.</span>
          <button onClick={descartarAvisoActualizacion} className="text-slate-400 hover:text-white" title="Cerrar">
            <X size={15} />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button className="text-slate-500 lg:hidden" onClick={onAbrirMenu}><Menu size={22} /></button>
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${actualizadoHoy ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                <p className="text-xs font-medium text-slate-500">
                  {actualizadoHoy ? 'Datos actualizados' : 'Información pendiente de actualización'}
                </p>
                {backendUrl && (
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${remoteStatus === 'conectado' ? 'bg-emerald-50 text-emerald-600' : remoteStatus === 'error' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                    {remoteStatus === 'conectado' ? <Cloud size={11} /> : <CloudOff size={11} />}
                    {remoteStatus === 'conectado' ? 'Servidor central' : remoteStatus === 'error' ? 'Error de conexión' : 'Conectando...'}
                  </span>
                )}
              </div>
              {meta && (
                <p className="hidden text-[11px] text-slate-400 sm:block">
                  Periodo: {formatFecha(meta.fechaMin)} – {formatFecha(meta.fechaMax)} · {formatNumero(filteredRecords.length)} registros en vista actual
                  {backendUrl && remoteMeta?.ultimoUsuario ? ` · Última actualización por ${remoteMeta.ultimoUsuario}` : ''}
                </p>
              )}
              {backendUrl && remoteStatus === 'error' && remoteError && (
                <p className="text-[11px] text-rose-500">{remoteError}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!soloLectura && backendUrl && (
              <button
                onClick={onSincronizar}
                disabled={sincronizando}
                title="Traer la última versión del servidor central"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Sincronizar</span>
              </button>
            )}
            {!soloLectura && (
              <button
                onClick={onDescargarPptx}
                disabled={generandoPptx || filteredRecords.length === 0}
                title="Genera un PowerPoint según los filtros actualmente seleccionados"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileDown size={14} /> <span className="hidden sm:inline">{generandoPptx ? 'Generando...' : 'Descargar PowerPoint'}</span>
              </button>
            )}
            {!soloLectura && (
              <button
                onClick={() => setModalAbierto(true)}
                className="flex items-center gap-2 rounded-lg bg-brand-green px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-green-dark"
              >
                <FolderOpen size={15} /> <span className="hidden sm:inline">Actualizar información</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <UpdateDataModal abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
    </>
  );
}

export function DataStatusPanel() {
  const { records, meta, backendUrl, remoteMeta } = useData();
  if (!meta) return null;

  // Desglose de "Total de casos" por año — el total general no dice de qué
  // vigencia es cada uno; esto lo aclara sin quitar el dato general.
  const casosPorAnio = meta.aniosDisponibles.map((anio) => ({
    label: `Total casos ${anio}`,
    valor: formatNumero(records.filter((r) => String(r.anio) === String(anio)).length),
  }));
  // Rango de años para el título del total general (ej. "2025-2026"), o el
  // año único si solo hay uno — se arma solo, sin fechas fijas en el código.
  const aniosOrdenados = [...meta.aniosDisponibles].sort();
  const rangoAnios = aniosOrdenados.length > 1
    ? `${aniosOrdenados[0]}-${aniosOrdenados[aniosOrdenados.length - 1]}`
    : aniosOrdenados[0] ?? '';

  const items = [
    { label: 'Última actualización', valor: meta.ultimaActualizacion ? formatFechaHora(meta.ultimaActualizacion) : '—' },
    { label: 'Primer registro', valor: formatFecha(meta.fechaMin) },
    { label: 'Último registro', valor: formatFecha(meta.fechaMax) },
    { label: `Total de casos (${rangoAnios})`, valor: formatNumero(meta.totalCasos) },
    ...casosPorAnio,
    { label: 'Años disponibles', valor: meta.aniosDisponibles.join(', ') || '—' },
    { label: 'Estaciones disponibles', valor: String(meta.estacionesDisponibles.length) },
    { label: 'Barrios disponibles', valor: String(meta.barriosDisponibles.length) },
    { label: 'Delitos disponibles', valor: String(meta.delitosDisponibles.length) },
    { label: 'Origen de los datos', valor: backendUrl ? 'Servidor central' : 'Este navegador' },
    ...(backendUrl && remoteMeta?.ultimoUsuario ? [{ label: 'Última actualización por', valor: remoteMeta.ultimoUsuario }] : []),
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Info size={15} className="text-brand-navy" />
        <h3 className="text-sm font-semibold text-slate-800">Estado de la información</h3>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.label}>
            <dt className="text-[11px] uppercase tracking-wide text-slate-400">{it.label}</dt>
            <dd className="text-sm font-semibold text-slate-800">{it.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
