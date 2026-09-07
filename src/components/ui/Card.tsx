import React, { useRef, useState } from 'react';
import clsx from 'clsx';
import { ImageDown, Loader2 } from 'lucide-react';
import { exportarHtmlComoImagen } from '../../utils/exportarImagen';
import { useRegistrarEnPdf } from '../../context/RegistroPdfContext';

export function Card({ children, className, title, subtitle, actions, descargable }: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  // Nombre de archivo (sin extensión) — si se pasa, aparece un ícono para
  // descargar el título + el contenido de esta tarjeta como imagen PNG.
  descargable?: string;
}) {
  // Ref SOLO sobre el contenido (children) — nunca incluye el subtítulo ni
  // los botones de acción, así la imagen exportada trae exclusivamente el
  // título y la gráfica/tabla real.
  const contenidoRef = useRef<HTMLDivElement>(null);
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  // Se registra solo para el modal "Generar PDF" — no hace nada si la
  // página no está envuelta en ProveedorRegistroPdf (la mayoría de páginas).
  useRegistrarEnPdf(descargable, title, contenidoRef);

  async function descargarImagen() {
    if (!contenidoRef.current || descargando || !descargable) return;
    setDescargando(true);
    setErrorDescarga(null);
    try {
      // Se captura SIEMPRE el contenedor completo (no solo un <svg> elegido
      // "a ojo") — algunas gráficas (ej. de pastel) usan la leyenda propia
      // de Recharts, que es HTML/SVG aparte del gráfico principal; intentar
      // adivinar cuál era "el" SVG correcto dejaba la leyenda por fuera, o
      // en algunos casos encontraba un ícono pequeño en vez de la gráfica.
      // Capturando todo el contenedor con el motor ya verificado, se trae
      // exactamente lo mismo que se ve en pantalla, completo.
      await exportarHtmlComoImagen(contenidoRef.current, title, descargable);
    } catch (e) {
      setErrorDescarga('No se pudo generar la imagen. Inténtalo de nuevo.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className={clsx('rounded-xl border border-slate-200 bg-white p-4 shadow-sm', className)}>
      {(title || actions || descargable) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-semibold text-slate-800">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {descargable && (
              <button
                onClick={descargarImagen}
                title="Descargar esta información como imagen"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-brand-green hover:text-brand-green"
              >
                {descargando ? <Loader2 size={13} className="animate-spin" /> : <ImageDown size={13} />}
              </button>
            )}
          </div>
        </div>
      )}
      {errorDescarga && <p className="mb-2 text-xs text-rose-600">{errorDescarga}</p>}
      <div ref={contenidoRef}>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, metric, acciones }: { title: string; subtitle?: string; metric?: string; acciones?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {metric && (
          <span className="rounded-full bg-brand-navy/5 px-3 py-1 text-xs font-medium text-brand-navy">{metric}</span>
        )}
        {acciones}
      </div>
    </div>
  );
}

export function EmptyState({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
      {mensaje}
    </div>
  );
}
