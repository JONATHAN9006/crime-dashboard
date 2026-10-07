import { useState, type ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import clsx from 'clsx';
import { formatNumero } from '../../utils/aggregations';

// Piezas visuales del módulo Mapa / Georreferenciación. Solo presentan lo
// que la página ya calculó (no filtran ni cuentan nada por su cuenta).

export type ValorTopMapa = 5 | 10 | 20 | 'todas';

export interface FilaTerritorial {
  key: string;
  casos: number;
  aportePct: number;
}

const fmtPct = (v: number) => `${v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** Recuadro de ícono de los títulos (mismo estilo de las demás páginas). */
export function IconoCaja({ children, tono = 'bg-[#e3f2ef] text-[#116762]', tamano = 'md' }: { children: ReactNode; tono?: string; tamano?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-lg', tono, tamano === 'sm' ? 'h-7 w-7' : tamano === 'lg' ? 'h-11 w-11' : 'h-9 w-9')}>
      {children}
    </span>
  );
}

/** Botones Top 5 | Top 10 | Top 20 | Todas (navy cuando está activo). */
export function SelectorTopMapa({ valor, onChange, opciones = [5, 10, 20, 'todas'], oscuro = false }: {
  valor: ValorTopMapa;
  onChange: (v: ValorTopMapa) => void;
  opciones?: ValorTopMapa[];
  oscuro?: boolean;
}) {
  return (
    <div className={clsx('flex shrink-0 overflow-hidden rounded-md border', oscuro ? 'border-white/20' : 'border-slate-200')} role="group" aria-label="Cantidad a mostrar">
      {opciones.map((op) => {
        const activo = valor === op;
        return (
          <button
            key={String(op)}
            type="button"
            onClick={() => onChange(op)}
            aria-pressed={activo}
            className={clsx(
              'px-2 py-[3px] text-[11px] font-semibold transition',
              oscuro
                ? activo ? 'bg-white text-[#10233f]' : 'text-slate-200 hover:bg-white/10'
                : activo ? 'bg-[#10233f] text-white' : 'bg-white text-[#10233f] hover:bg-slate-50',
            )}
          >
            {op === 'todas' ? 'Todas' : `Top ${op}`}
          </button>
        );
      })}
    </div>
  );
}

export function recortarTop<T>(filas: T[], top: ValorTopMapa): T[] {
  return top === 'todas' ? filas : filas.slice(0, top);
}

/** Lista de barras: nombre | barra | casos | (aporte %). El máximo va resaltado. */
export function ListaBarrasTerritorial({ filas, onFila, seleccionados = [], textoVacio = 'Sin registros con los filtros actuales.' }: {
  filas: FilaTerritorial[];
  onFila?: (key: string) => void;
  seleccionados?: string[];
  textoVacio?: string;
}) {
  if (filas.length === 0) return <p className="py-6 text-center text-xs text-slate-400">{textoVacio}</p>;
  const max = Math.max(...filas.map((f) => f.casos), 1);
  return (
    <ul className="space-y-[5px]">
      {filas.map((f, i) => {
        const esMax = i === 0 && f.casos === max;
        const marcado = seleccionados.includes(f.key);
        const contenido = (
          <>
            <span className={clsx('truncate text-left text-[12.5px]', marcado ? 'font-bold text-[#0b4a46]' : 'text-[#10233f]')} title={f.key}>{f.key}</span>
            <span className={clsx('relative h-[13px] rounded-sm bg-slate-100', esMax && 'outline outline-[1.5px] outline-offset-[2px] outline-dashed outline-red-600')}>
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${Math.max(2, (f.casos / max) * 100)}%`,
                  background: esMax ? '#0b4a46' : i % 2 === 0 ? 'linear-gradient(90deg,#0f5f57,#159089)' : 'linear-gradient(90deg,#64748b,#94a3b8)',
                }}
              />
            </span>
            <span className="text-right text-[12.5px] font-bold tabular-nums text-[#10233f]">{formatNumero(f.casos)}</span>
            <span className="text-right text-[11.5px] tabular-nums text-slate-500">({fmtPct(f.aportePct)})</span>
          </>
        );
        const clases = 'grid w-full items-center gap-2 [grid-template-columns:minmax(0,38%)_minmax(0,1fr)_42px_50px]';
        return (
          <li key={f.key}>
            {onFila ? (
              <button type="button" onClick={() => onFila(f.key)} title={marcado ? `Quitar "${f.key}" del filtro` : `Filtrar por "${f.key}"`} className={clsx(clases, 'rounded px-0.5 hover:bg-slate-50')}>
                {contenido}
              </button>
            ) : (
              <div className={clsx(clases, 'px-0.5')}>{contenido}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Tarjeta del análisis territorial inferior (Comunas, Barrios, Delitos, CAI, Zonas, Cuadrantes). */
export function TarjetaTerritorial({ titulo, icono, filas, topInicial = 10, nota, onFila, seleccionados, textoVacio }: {
  titulo: string;
  icono: ReactNode;
  filas: FilaTerritorial[];
  topInicial?: ValorTopMapa;
  nota?: string;
  onFila?: (key: string) => void;
  seleccionados?: string[];
  textoVacio?: string;
}) {
  const [top, setTop] = useState<ValorTopMapa>(topInicial);
  const visibles = recortarTop(filas, top);
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(16,35,63,0.04)]">
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex min-w-[170px] flex-1 items-center gap-2">
          <IconoCaja tamano="sm">{icono}</IconoCaja>
          <h3 className="text-[14px] font-bold leading-tight text-[#10233f]">{titulo}</h3>
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10.5px] font-semibold text-slate-500">{formatNumero(filas.length)}</span>
        </div>
        <SelectorTopMapa valor={top} onChange={setTop} />
      </header>
      <div className={clsx(top === 'todas' && 'max-h-[300px] overflow-y-auto pr-1')}>
        <ListaBarrasTerritorial filas={visibles} onFila={onFila} seleccionados={seleccionados} textoVacio={textoVacio} />
      </div>
      {nota && (
        <p className="mt-auto flex items-start gap-1 pt-2 text-[10.5px] leading-snug text-slate-400">
          <Info size={11} className="mt-[1px] shrink-0" /> {nota}
        </p>
      )}
    </section>
  );
}

/** KPI de la franja superior. */
export function KpiMapa({ titulo, valor, detalle, icono, tono, destacado = false }: {
  titulo: string;
  valor: number | null;
  detalle: string;
  icono: ReactNode;
  /** Clases del fondo de la tarjeta y del recuadro del ícono. */
  tono: { tarjeta: string; icono: string; valor: string };
  destacado?: boolean;
}) {
  if (destacado) {
    return (
      <div className="flex min-w-0 items-center gap-2.5 rounded-xl bg-[#10233f] px-3 py-3 text-white shadow-sm">
        <IconoCaja tono="bg-white/10 text-white">{icono}</IconoCaja>
        <div className="min-w-0">
          <p className="text-[24px] font-extrabold leading-none tabular-nums">{valor == null ? '—' : formatNumero(valor)}</p>
          <p className="mt-1 text-[11.5px] font-semibold leading-tight text-slate-200">{titulo}</p>
          <p className="text-[10px] leading-tight text-slate-400">{detalle}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={clsx('flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2.5', tono.tarjeta)}>
      <IconoCaja tono={tono.icono} tamano="sm">{icono}</IconoCaja>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold text-[#10233f]" title={titulo}>{titulo}</p>
        <p className={clsx('text-[22px] font-extrabold leading-tight tabular-nums', tono.valor)}>{valor == null ? '—' : formatNumero(valor)}</p>
        <p className="text-[10px] leading-tight text-slate-500">{detalle}</p>
      </div>
    </div>
  );
}

/** Indicador pequeño del encabezado (Vigencia, Registros, Capas, Última actualización). */
export function IndicadorEncabezado({ icono, titulo, valor }: { icono: ReactNode; titulo: string; valor: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(16,35,63,0.04)]">
      <span className="shrink-0 text-[#116762]">{icono}</span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[10.5px] text-slate-500">{titulo}</p>
        <p className="truncate text-[12.5px] font-bold text-[#10233f]" title={valor}>{valor}</p>
      </div>
    </div>
  );
}

/** Sección plegable del panel lateral oscuro. */
export function SeccionPanelOscuro({ titulo, icono, children, abiertaInicial = true, accion }: {
  titulo: string;
  icono: ReactNode;
  children: ReactNode;
  abiertaInicial?: boolean;
  accion?: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  return (
    <section className="border-b border-white/10 px-4 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <IconoCaja tono="bg-white/10 text-emerald-200" tamano="sm">{icono}</IconoCaja>
          <span className="truncate text-[13.5px] font-bold">{titulo}</span>
        </button>
        {accion}
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-label={abierta ? `Plegar ${titulo}` : `Desplegar ${titulo}`} className="rounded p-0.5 text-slate-300 hover:bg-white/10">
          <ChevronDown size={15} className={clsx('transition', abierta ? 'rotate-180' : '')} />
        </button>
      </div>
      {abierta && <div className="mt-2.5">{children}</div>}
    </section>
  );
}
