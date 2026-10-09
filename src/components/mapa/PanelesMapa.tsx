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

// ── Estilo de los puntos (color y tamaño) ─────────────────────────────────
// Solo cambia CÓMO se dibuja cada punto en el mapa; no toca qué puntos se
// muestran ni ningún conteo. color = null → color automático de siempre
// (por delito o el color propio de la fuente).
export interface EstiloPuntos {
  color: string | null;
  /** Multiplicador del radio de siempre (1 = tamaño original). */
  escala: number;
}
export const ESTILO_PUNTOS_POR_DEFECTO: EstiloPuntos = { color: null, escala: 1 };
const COLORES_RAPIDOS = ['#dc2626', '#d97706', '#facc15', '#16a34a', '#0f5f57', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#10233f', '#000000', '#ffffff'];
const ESCALA_MIN = 0.5;
const ESCALA_MAX = 3;

/** Editor compacto de color + tamaño de los puntos de una capa. */
export function ControlEstiloPuntos({ estilo, onChange, textoAuto = 'Automático', colorAuto, oscuro = false }: {
  estilo: EstiloPuntos;
  onChange: (e: EstiloPuntos) => void;
  /** Texto del botón que vuelve al color de siempre (ej. "Por delito"). */
  textoAuto?: string;
  /** Color que se ve cuando está en automático (para la muestra). */
  colorAuto: string;
  oscuro?: boolean;
}) {
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, estilo.escala || 1));
  const cambiarEscala = (v: number) => onChange({ ...estilo, escala: Math.round(Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v)) * 4) / 4 });
  const texto = oscuro ? 'text-slate-200' : 'text-slate-600';
  const botonTam = clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded text-[14px] font-bold leading-none', oscuro ? 'bg-white/10 text-white hover:bg-white/20' : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50');
  return (
    <div className={clsx('space-y-2 rounded-lg p-2 text-[11px]', oscuro ? 'bg-white/5' : 'border border-slate-200 bg-white')}>
      <div>
        <p className={clsx('mb-1 font-semibold', texto)}>Color de los puntos</p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onChange({ ...estilo, color: null })}
            aria-pressed={estilo.color == null}
            title="Volver al color de siempre"
            className={clsx('rounded px-1.5 py-[3px] font-semibold', estilo.color == null
              ? (oscuro ? 'bg-white text-[#10233f]' : 'bg-[#10233f] text-white')
              : (oscuro ? 'bg-white/10 text-slate-200 hover:bg-white/20' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'))}
          >
            {textoAuto}
          </button>
          {COLORES_RAPIDOS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ ...estilo, color: c })}
              aria-label={`Color ${c}`}
              aria-pressed={estilo.color === c}
              className={clsx('h-[18px] w-[18px] rounded-full ring-1', estilo.color === c ? 'ring-2 ring-offset-1 ' + (oscuro ? 'ring-white ring-offset-[#10233f]' : 'ring-[#10233f]') : oscuro ? 'ring-white/30' : 'ring-slate-300')}
              style={{ background: c }}
            />
          ))}
          <label title="Elegir otro color" className={clsx('relative flex h-[18px] w-[18px] cursor-pointer items-center justify-center overflow-hidden rounded-full ring-1', oscuro ? 'ring-white/30' : 'ring-slate-300')} style={{ background: 'conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#6366f1,#ec4899,#ef4444)' }}>
            <input type="color" value={estilo.color ?? colorAuto} onChange={(e) => onChange({ ...estilo, color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </div>
      <div>
        <p className={clsx('mb-1 flex items-center justify-between font-semibold', texto)}>
          <span>Tamaño de los puntos</span>
          <span className="tabular-nums">{Math.round(escala * 100)}%</span>
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" className={botonTam} onClick={() => cambiarEscala(escala - 0.25)} aria-label="Puntos más pequeños">−</button>
          <input type="range" min={ESCALA_MIN} max={ESCALA_MAX} step={0.25} value={escala} onChange={(e) => cambiarEscala(Number(e.target.value))} className="min-w-0 flex-1 accent-[#22a67a]" aria-label="Tamaño de los puntos" />
          <button type="button" className={botonTam} onClick={() => cambiarEscala(escala + 0.25)} aria-label="Puntos más grandes">+</button>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
            <span className="rounded-full ring-1 ring-white" style={{ width: Math.max(3, 8 * escala), height: Math.max(3, 8 * escala), background: estilo.color ?? colorAuto }} />
          </span>
        </div>
        {escala !== 1 && (
          <button type="button" onClick={() => cambiarEscala(1)} className={clsx('mt-1 underline', oscuro ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-[#10233f]')}>Tamaño original</button>
        )}
      </div>
    </div>
  );
}
