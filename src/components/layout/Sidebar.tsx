import { useState } from 'react';
import {
  LayoutDashboard, Gauge, Building2, CalendarRange, Flame,
  Map, X, GitCompare, Table2, ShieldCheck, ChevronLeft, UserRound, Activity, Package, Eye, Bot,
} from 'lucide-react';
import clsx from 'clsx';
import { esModoConsulta } from '../../utils/modoConsulta';

export type PaginaId =
  | 'resumen' | 'indicadores' | 'unidad' | 'ultimasSemanas'
  | 'matrizCalor' | 'mapa' | 'tasaCosec'
  | 'comparativo' | 'tabla' | 'calidad' | 'productos' | 'agenteIA';

// Ítems bloqueados temporalmente para presentarle al jefe por partes — se ven
// atenuados, no se puede entrar, y al pasar el mouse se explica por qué. Para
// habilitar uno, basta con quitarlo de esta lista.
const PAGINAS_BLOQUEADAS: PaginaId[] = ['ultimasSemanas', 'matrizCalor', 'mapa', 'tasaCosec', 'comparativo', 'tabla', 'calidad', 'productos'];
const MENSAJE_BLOQUEADO = 'Este componente se encuentra en análisis y construcción.';

const ITEMS_PRINCIPALES: { id: PaginaId; label: string; icon: React.ElementType }[] = [
  { id: 'resumen', label: 'Inicio / Resumen', icon: LayoutDashboard },
  { id: 'indicadores', label: 'Indicadores', icon: Gauge },
  { id: 'unidad', label: 'Análisis por Unidad', icon: Building2 },
  { id: 'ultimasSemanas', label: 'Últimas 4 Semanas', icon: CalendarRange },
  { id: 'matrizCalor', label: 'Matriz de Calor', icon: Flame },
  { id: 'mapa', label: 'Mapa / Georreferenciación', icon: Map },
  { id: 'tasaCosec', label: 'Indicadores Tasa Cosec', icon: Activity },
];

const ITEMS_ADICIONALES: { id: PaginaId; label: string; icon: React.ElementType }[] = [
  { id: 'comparativo', label: 'Comparativo Anual', icon: GitCompare },
  { id: 'tabla', label: 'Tabla de Datos', icon: Table2 },
  { id: 'calidad', label: 'Calidad de Datos', icon: ShieldCheck },
  { id: 'productos', label: 'Productos Esperados', icon: Package },
  { id: 'agenteIA', label: '🤖 Analista IA', icon: Bot },
];

// Tooltip propio (CSS puro con group-hover): aparece de inmediato al pasar el
// cursor, sin depender del tooltip nativo del navegador (que tiene retraso y
// no se puede darle estilo). Solo se activa cuando el sidebar está angosto.
function TooltipLateral({ texto, posicion = 'lateral' }: { texto: string; posicion?: 'lateral' | 'arriba' }) {
  return (
    <span
      className={clsx(
        'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100',
        posicion === 'lateral' ? 'left-full top-1/2 ml-2 -translate-y-1/2' : 'bottom-full left-1/2 mb-2 -translate-x-1/2',
      )}
    >
      {texto}
      <span
        className={clsx(
          'absolute h-2 w-2 rotate-45 bg-slate-900',
          posicion === 'lateral' ? 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'left-1/2 top-full -translate-x-1/2 -translate-y-1/2',
        )}
      />
    </span>
  );
}

function ItemBoton({ item, activo, onCambiar, onCerrar, colapsado, onHover, onSalir }: {
  item: { id: PaginaId; label: string; icon: React.ElementType };
  activo: PaginaId;
  onCambiar: (id: PaginaId) => void;
  onCerrar: () => void;
  colapsado: boolean;
  onHover: (texto: string, top: number) => void;
  onSalir: () => void;
}) {
  const Icon = item.icon;
  const activeItem = activo === item.id;
  const bloqueado = !esModoConsulta() && PAGINAS_BLOQUEADAS.includes(item.id);
  return (
    <button
      onClick={() => { if (bloqueado) return; onCambiar(item.id); onCerrar(); }}
      onMouseEnter={(e) => {
        // Los ítems bloqueados muestran su mensaje siempre (esté el sidebar
        // colapsado o no) — los demás solo muestran su etiqueta cuando el
        // sidebar está colapsado (y por lo tanto el texto no se ve).
        if (!bloqueado && !colapsado) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onHover(bloqueado ? MENSAJE_BLOQUEADO : item.label, rect.top + rect.height / 2);
      }}
      onMouseLeave={onSalir}
      aria-label={item.label}
      aria-disabled={bloqueado}
      className={clsx(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
        colapsado && 'justify-center px-2',
        bloqueado
          ? 'cursor-not-allowed text-white/35 font-bold'
          : activeItem
            ? 'bg-brand-green-dark text-white font-bold shadow-inner'
            : 'text-white font-bold hover:bg-white/10',
      )}
    >
      <Icon size={16} className="shrink-0" />
      {!colapsado && item.label}
    </button>
  );
}

export function Sidebar({ activo, onCambiar, abierto, onCerrar }: {
  activo: PaginaId;
  onCambiar: (id: PaginaId) => void;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [colapsado, setColapsado] = useState(false);
  // El tooltip de los ítems del menú se maneja aquí (fuera del <nav>, que
  // tiene scroll vertical) para que NO quede recortado por el overflow del
  // contenedor con scroll — así siempre se sobrepone visible al sidebar.
  const [tooltipItem, setTooltipItem] = useState<{ texto: string; top: number } | null>(null);

  return (
    <>
      {abierto && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onCerrar} />}
      <aside
        className={clsx(
          'relative fixed inset-y-0 left-0 z-40 transform bg-brand-green-darkest transition-[width,transform] duration-300 ease-in-out lg:static lg:translate-x-0',
          colapsado ? 'w-20' : 'w-64',
          abierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Botón para angostar/expandir el sidebar (flecha animada) */}
        <button
          onClick={() => setColapsado((v) => !v)}
          title={colapsado ? 'Expandir menú' : 'Contraer menú'}
          className="absolute -right-3 top-8 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-colors hover:text-brand-green lg:flex"
        >
          <ChevronLeft size={14} className={clsx('transition-transform duration-300 ease-in-out', colapsado && 'rotate-180')} />
        </button>

        <div className={clsx('flex items-center px-5 py-5', colapsado ? 'justify-center px-3' : 'justify-between')}>
          <div className="group relative flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/95 p-1">
              <img src="/assets/escudo-policia.png" alt="Escudo Policía Nacional" className="h-full w-full object-contain" />
            </div>
            {!colapsado && (
              <div>
                <p className="text-sm font-bold leading-tight text-white">Análisis Delictivo</p>
                <p className="text-[11px] text-emerald-100/70">MEPOY · Popayán</p>
              </div>
            )}
            {colapsado && <TooltipLateral texto="Análisis Delictivo — MEPOY · Popayán" />}
          </div>
          {!colapsado && (
            <button className="text-emerald-100/70 hover:text-white lg:hidden" onClick={onCerrar}>
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="mt-1 flex flex-col gap-0.5 overflow-y-auto px-3 pb-16" style={{ maxHeight: 'calc(100vh - 130px)' }}>
          {ITEMS_PRINCIPALES.map((item) => (
            <ItemBoton
              key={item.id}
              item={item}
              activo={activo}
              onCambiar={onCambiar}
              onCerrar={onCerrar}
              colapsado={colapsado}
              onHover={(texto, top) => setTooltipItem({ texto, top })}
              onSalir={() => setTooltipItem(null)}
            />
          ))}

          {!esModoConsulta() && (
            <>
              <div className="my-2 border-t border-white/15" />
              {!colapsado && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100/50">Análisis adicionales</p>}
              {ITEMS_ADICIONALES.map((item) => (
                <ItemBoton
                  key={item.id}
                  item={item}
                  activo={activo}
                  onCambiar={onCambiar}
                  onCerrar={onCerrar}
                  colapsado={colapsado}
                  onHover={(texto, top) => setTooltipItem({ texto, top })}
                  onSalir={() => setTooltipItem(null)}
                />
              ))}
            </>
          )}
          {!colapsado && (
            <div className="mt-8 flex justify-center">
              <img src="/assets/icono-analitica.svg" alt="Análisis de datos" className="h-16 w-16 opacity-90" />
            </div>
          )}
        </nav>

        {/* Tooltip flotante de los ítems: se renderiza FUERA del <nav> con
            scroll, posicionado según las coordenadas del ítem con el cursor
            encima, para que nunca quede recortado. Colapsado: aparece para
            cualquier ítem (reemplaza la etiqueta oculta). Expandido: solo
            para ítems bloqueados, explicando por qué no se puede entrar. */}
        {tooltipItem && (colapsado || tooltipItem.texto === MENSAJE_BLOQUEADO) && (
          <span
            className={clsx(
              'pointer-events-none absolute z-50 max-w-[220px] -translate-y-1/2 whitespace-normal rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
              colapsado ? 'left-[72px]' : 'left-[264px]',
            )}
            style={{ top: tooltipItem.top }}
          >
            {tooltipItem.texto}
            <span className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-slate-900" />
          </span>
        )}

        {/* Pie del sidebar: se contrae a un solo ícono con tooltip cuando el
            menú está angosto, en vez de simplemente perder el texto. */}
        <div className={clsx('absolute inset-x-0 bottom-0 border-t border-white/15 py-3', colapsado ? 'flex justify-center px-2' : 'px-5')}>
          {colapsado ? (
            <div className="group relative flex flex-col items-center gap-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-emerald-50">
                <UserRound size={14} />
              </div>
              <TooltipLateral texto="Elaborado por: Ing. Jonathan Gomez · v2026.08.29-t" posicion="arriba" />
            </div>
          ) : (
            <>
              {esModoConsulta() && (
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  <Eye size={11} /> Modo consulta — solo lectura
                </p>
              )}
              <p className="text-[11px] text-emerald-100/70">Elaborado por: <span className="font-semibold text-white">Ing. Jonathan Gomez</span></p>
              <p className="mt-0.5 text-[10px] text-emerald-100/50">v2026.08.29-t</p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
