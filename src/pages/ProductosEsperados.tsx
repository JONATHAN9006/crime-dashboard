import { useEffect, useRef, useState } from 'react';
import { UploadCloud, User, Calendar, FileText, Trash2 } from 'lucide-react';
import { Card, PageHeader } from '../components/ui/Card';
import {
  guardarProductoArchivo, guardarTodosLosProductos, cargarProductosArchivos, leerArchivoComoDataUrl, type ProductoArchivo,
} from '../data/productosStorage';

// Nombres tal cual se indicaron, en el orden de Producto 1 a Producto 6.
const NOMBRES_PRODUCTOS: string[] = [
  'IJ. Victor Guerrero',
  'Si. Cristhian Cedeño',
  'Si. Jonathan Gómez',
  'Si. Jonathan Gómez',
  'SI. Andres Enriquez',
  'SI. Andres Enriquez',
];

export function ProductosEsperados() {
  const [seleccionado, setSeleccionado] = useState(1);
  const [archivos, setArchivos] = useState<Record<number, ProductoArchivo>>({});
  const [cargadoPor, setCargadoPor] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cargarProductosArchivos().then(setArchivos);
  }, []);

  async function manejarArchivo(file: File) {
    setError(null);
    setCargando(true);
    try {
      const dataUrl = await leerArchivoComoDataUrl(file);
      const archivo: ProductoArchivo = {
        nombreArchivo: file.name,
        tipoMime: file.type,
        dataUrl,
        cargadoPor: cargadoPor.trim() || 'No identificado',
        fechaCarga: new Date().toISOString(),
      };
      await guardarProductoArchivo(seleccionado, archivo);
      setArchivos((prev) => ({ ...prev, [seleccionado]: archivo }));
    } catch {
      setError('No se pudo leer el archivo. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  async function quitarArchivo() {
    if (!confirm(`¿Quitar el archivo cargado para el Producto ${seleccionado}?`)) return;
    const nuevos = { ...archivos };
    delete nuevos[seleccionado];
    setArchivos(nuevos);
    await guardarTodosLosProductos(nuevos);
  }

  const actual = archivos[seleccionado];

  return (
    <div className="space-y-5">
      <PageHeader title="Productos Esperados" subtitle="Seguimiento de los 6 productos comprometidos, con su responsable asignado." />

      <Card title="Productos">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {NOMBRES_PRODUCTOS.map((nombre, i) => {
            const numero = i + 1;
            const activo = seleccionado === numero;
            const tieneArchivo = !!archivos[numero];
            return (
              <button
                key={numero}
                onClick={() => setSeleccionado(numero)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-colors ${
                  activo ? 'border-brand-green bg-brand-green/5' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${activo ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {numero}
                </span>
                <span className={`text-xs font-semibold ${activo ? 'text-brand-green' : 'text-slate-600'}`}>Producto {numero}</span>
                <span className="text-[11px] leading-tight text-slate-500">{nombre}</span>
                {tieneArchivo && <FileText size={12} className="text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title={`Producto ${seleccionado} — ${NOMBRES_PRODUCTOS[seleccionado - 1]}`}
        subtitle={actual ? undefined : 'Sin archivo cargado todavía para este producto.'}
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-600">¿Quién está cargando este producto?</span>
            <input
              type="text"
              value={cargadoPor}
              onChange={(e) => setCargadoPor(e.target.value)}
              placeholder="Tu nombre"
              className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-2 text-sm font-medium text-white hover:bg-brand-navy-light"
          >
            <UploadCloud size={14} /> {cargando ? 'Cargando...' : actual ? 'Reemplazar archivo' : 'Cargar archivo'}
          </button>
          {actual && (
            <button onClick={quitarArchivo} className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
              <Trash2 size={14} /> Quitar
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) manejarArchivo(f); }}
          />
        </div>

        {error && <p className="mb-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

        {actual ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><User size={12} /> {actual.cargadoPor}</span>
              <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(actual.fechaCarga).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span className="flex items-center gap-1"><FileText size={12} /> {actual.nombreArchivo}</span>
              <a href={actual.dataUrl} download={actual.nombreArchivo} className="font-medium text-brand-green hover:underline">Descargar</a>
            </div>

            {actual.tipoMime.startsWith('image/') ? (
              <img src={actual.dataUrl} alt={actual.nombreArchivo} className="max-h-[600px] w-full rounded-lg border border-slate-200 object-contain" />
            ) : actual.tipoMime === 'application/pdf' ? (
              <iframe src={actual.dataUrl} title={actual.nombreArchivo} className="h-[600px] w-full rounded-lg border border-slate-200" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500">
                <FileText size={24} />
                <p>Vista previa no disponible para este tipo de archivo — usa "Descargar" para abrirlo.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-400">
            <UploadCloud size={28} />
            <p>Aún no se ha cargado ningún archivo para el Producto {seleccionado}.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
