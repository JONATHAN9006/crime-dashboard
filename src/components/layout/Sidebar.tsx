import { useEffect, useState } from 'react';
import {
  Home, Building2, CalendarDays, Flame, Map, X, Table2, Database, ChevronsLeft, ChevronsRight,
  Activity, Package, Eye, Target, Scale, Shield, Network, LineChart,
} from 'lucide-react';
import clsx from 'clsx';
import { esModoConsulta } from '../../utils/modoConsulta';
import { obtenerModoAcceso } from '../../utils/modoAcceso';
import { DASHBOARD_ACCESS } from '../../config/dashboardAccess';

export type PaginaId =
  | 'resumen' | 'unidad' | 'operatividadUnidad' | 'rnmc' | 'irisp1' | 'macri' | 'ultimasSemanas'
  | 'matrizCalor' | 'mapa' | 'tasaCosec'
  | 'comparativo' | 'tabla' | 'calidad' | 'productos';

// Ítems bloqueados temporalmente para presentarle al jefe por partes — se ven
// atenuados, no se puede entrar, y al pasar el mouse se explica por qué. Para
// habilitar uno, basta con quitarlo de esta lista.
const PAGINAS_BLOQUEADAS: PaginaId[] = ['ultimasSemanas', 'matrizCalor', 'mapa', 'tasaCosec', 'comparativo', 'tabla', 'calidad', 'productos'];
const MENSAJE_BLOQUEADO = 'Este componente se encuentra en análisis y construcción.';

type ItemMenu = { id: PaginaId; label: string; icon: React.ElementType };

// Mismos módulos de siempre, agrupados por sección (solo cambia la
// presentación del menú, no qué módulos existen ni sus permisos).
const GRUPOS: { titulo: string; items: ItemMenu[]; soloCompleto?: boolean }[] = [
  {
    titulo: 'Análisis principal',
    items: [
      { id: 'resumen', label: 'Inicio / Resumen', icon: Home },
      { id: 'unidad', label: 'Delictividad por Unidad', icon: Building2 },
      { id: 'operatividadUnidad', label: 'Operatividad por Unidad', icon: Target },
    ],
  },
  {
    titulo: 'Análisis especializado',
    items: [
      { id: 'rnmc', label: 'RNMC', icon: Scale },
      { id: 'irisp1', label: 'IRISP1', icon: Shield },
      { id: 'macri', label: 'MACRI', icon: Network },
    ],
  },
  {
    titulo: 'Seguimiento',
    items: [
      { id: 'ultimasSemanas', label: 'Últimas 4 Semanas', icon: CalendarDays },
      { id: 'matrizCalor', label: 'Matriz de Calor', icon: Flame },
      { id: 'mapa', label: 'Mapa / Georreferenciación', icon: Map },
      { id: 'tasaCosec', label: 'Indicadores Tasa Cosec', icon: Activity },
    ],
  },
  {
    // En modo consulta (solo lectura) esta sección no se muestra, igual que antes.
    titulo: 'Análisis adicionales',
    soloCompleto: true,
    items: [
      { id: 'comparativo', label: 'Comparativo Anual', icon: LineChart },
      { id: 'tabla', label: 'Tabla de Datos', icon: Table2 },
      { id: 'calidad', label: 'Calidad de Datos', icon: Database },
      { id: 'productos', label: 'Productos Esperados', icon: Package },
    ],
  },
];

// Tres tamaños de pantalla, con los mismos cortes de Tailwind:
//  · 'movil'   (< 768 px)        → menú oculto; se abre con ☰ como cajón encima.
//  · 'compacto'(768 – 1023 px)  → franja angosta FIJA, solo íconos, con el
//                                   nombre en un recuadro al pasar el mouse
//                                   (ej. el dashboard a media pantalla).
//  · 'amplio'  (≥ 1024 px)       → menú completo, con la flecha para angostarlo.
type TamanoPantalla = 'movil' | 'compacto' | 'amplio';
function tamanoActual(): TamanoPantalla {
  if (typeof window === 'undefined') return 'amplio';
  if (window.matchMedia('(min-width: 1024px)').matches) return 'amplio';
  if (window.matchMedia('(min-width: 768px)').matches) return 'compacto';
  return 'movil';
}
function useTamanoPantalla(): TamanoPantalla {
  const [tamano, setTamano] = useState<TamanoPantalla>(tamanoActual);
  useEffect(() => {
    const consultas = [window.matchMedia('(min-width: 1024px)'), window.matchMedia('(min-width: 768px)')];
    const actualizar = () => setTamano(tamanoActual());
    consultas.forEach((q) => q.addEventListener('change', actualizar));
    return () => consultas.forEach((q) => q.removeEventListener('change', actualizar));
  }, []);
  return tamano;
}

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
  item: ItemMenu;
  activo: PaginaId;
  onCambiar: (id: PaginaId) => void;
  onCerrar: () => void;
  colapsado: boolean;
  onHover: (texto: string, top: number, esBloqueo: boolean) => void;
  onSalir: () => void;
}) {
  const Icon = item.icon;
  const activeItem = activo === item.id;
  const modoAcceso = obtenerModoAcceso();
  // Ruta raíz (modoAcceso === null): EXACTAMENTE el comportamiento de
  // siempre, sin tocar nada. Solo en /jefe o /interno se consulta la
  // configuración centralizada (dashboardAccess.ts) en su lugar.
  const bloqueado = modoAcceso
    ? !DASHBOARD_ACCESS[modoAcceso][item.id as keyof typeof DASHBOARD_ACCESS['jefe']]
    : !esModoConsulta() && PAGINAS_BLOQUEADAS.includes(item.id);
  const mensajeBloqueo = modoAcceso === 'jefe' ? 'Próximamente — en desarrollo.' : MENSAJE_BLOQUEADO;
  return (
    <button
      onClick={() => { if (bloqueado) return; onCambiar(item.id); onCerrar(); }}
      onMouseEnter={(e) => {
        // Los ítems bloqueados muestran su mensaje siempre (esté el sidebar
        // colapsado o no) — los demás solo muestran su etiqueta cuando el
        // sidebar está colapsado (y por lo tanto el texto no se ve).
        if (!bloqueado && !colapsado) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onHover(bloqueado ? mensajeBloqueo : item.label, rect.top + rect.height / 2, bloqueado);
      }}
      onMouseLeave={onSalir}
      aria-label={item.label}
      aria-disabled={bloqueado}
      className={clsx(
        'relative flex w-full items-center rounded-lg text-left text-[14px] font-semibold tracking-[-0.01em] transition-colors',
        colapsado ? 'h-11 justify-center' : 'gap-3 px-3 py-2.5',
        bloqueado
          ? 'cursor-not-allowed text-white/35'
          : activeItem
            ? 'bg-[#1d6f68] text-white shadow-sm'
            : 'text-white/90 hover:bg-white/[0.07] hover:text-white',
      )}
    >
      {/* Elemento activo: barra lateral de color a la izquierda. */}
      {activeItem && !bloqueado && <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-[#5eead4]" />}
      <Icon size={colapsado ? 21 : 19} strokeWidth={1.9} className="shrink-0" />
      {!colapsado && <span className="leading-tight">{item.label}</span>}
    </button>
  );
}

export function Sidebar({ activo, onCambiar, abierto, onCerrar }: {
  activo: PaginaId;
  onCambiar: (id: PaginaId) => void;
  abierto: boolean;
  onCerrar: () => void;
}) {
  // Preferencia del usuario (flecha) — solo aplica en pantalla amplia. En
  // pantalla compacta el menú SIEMPRE va angosto (solo íconos), y en móvil
  // el cajón que se abre con ☰ SIEMPRE va completo (con nombres).
  const [colapsadoManual, setColapsadoManual] = useState(false);
  const tamano = useTamanoPantalla();
  const colapsado = tamano === 'compacto' || (tamano === 'amplio' && colapsadoManual);
  // El tooltip de los ítems del menú se maneja aquí (fuera del <nav>, que
  // tiene scroll vertical) para que NO quede recortado por el overflow del
  // contenedor con scroll — así siempre se sobrepone visible al sidebar.
  const [tooltipItem, setTooltipItem] = useState<{ texto: string; top: number; esBloqueo: boolean } | null>(null);

  return (
    <>
      {abierto && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={onCerrar} />}
      {/* CAUSA del espacio en blanco a media pantalla: antes este <aside>
          llevaba "relative" y "fixed" a la vez. En Tailwind v4 "relative"
          queda después en el CSS y gana, así que por debajo de 1024 px el
          menú NO salía del flujo: se corría hacia la izquierda (fuera de
          vista) pero seguía ocupando sus 256 px — de ahí la franja vacía.
          Ahora: en móvil es "fixed" (cajón encima del contenido); desde
          768 px es "relative" (ocupa su ancho real y el resto del dashboard
          se reacomoda en el espacio que queda). */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex shrink-0 transform flex-col bg-[#0a3d39] transition-[width,transform] duration-300 ease-in-out md:relative md:translate-x-0',
          colapsado ? 'w-[68px]' : 'w-[260px]',
          abierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* ── Encabezado institucional: escudo, nombre del sistema, dependencia y botón contraer ── */}
        <div className={clsx('flex shrink-0 items-center border-b border-white/10', colapsado ? 'justify-center px-2 py-4' : 'gap-3 px-4 py-4')}>
          <div className="group relative shrink-0">
            {/* Escudo recortado sobre fondo transparente y a mayor resolución
                (escudo-sidebar.png): ocupa todo el círculo blanco, sin el
                recuadro blanco pixelado del archivo original. */}
            <div className={clsx('flex items-center justify-center rounded-full bg-white p-[2px] shadow-[0_2px_6px_rgba(0,0,0,0.25)] ring-2 ring-white/20', colapsado ? 'h-10 w-10' : 'h-[50px] w-[50px]')}>
              <img src="/assets/escudo-sidebar.png" alt="Escudo Policía Nacional" className="h-full w-full object-contain" draggable={false} />
            </div>
            {colapsado && <TooltipLateral texto="Análisis Delictivo — MEPOY · Popayán" />}
          </div>
          {!colapsado && (
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] font-bold leading-tight text-white">Análisis Delictivo</p>
              <p className="truncate text-[12.5px] text-emerald-100/80">MEPOY - Popayán</p>
            </div>
          )}
          {!colapsado && (
            <button aria-label="Cerrar menú" className="text-emerald-100/70 hover:text-white md:hidden" onClick={onCerrar}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* Botón contraer / expandir: montado SOBRE la línea del borde derecho
            del menú (mitad adentro, mitad afuera), a la altura del escudo —
            el mismo botón y en el mismo lugar con el menú abierto o contraído. */}
        {tamano === 'amplio' && (
          <button
            type="button"
            onClick={() => setColapsadoManual((v) => !v)}
            title={colapsado ? 'Expandir menú' : 'Contraer menú'}
            aria-label={colapsado ? 'Expandir menú' : 'Contraer menú'}
            className="absolute -right-[15px] top-[27px] z-50 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-[#0a3d39] bg-white text-[#0a3d39] shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-colors hover:bg-[#e3f2ef] hover:text-[#116762]"
          >
            {colapsado ? <ChevronsRight size={16} strokeWidth={2.4} /> : <ChevronsLeft size={16} strokeWidth={2.4} />}
          </button>
        )}

        {/* ── Secciones del menú ── */}
        <nav className={clsx('flex-1 overflow-y-auto py-3', colapsado ? 'px-2' : 'px-3')}>
          {GRUPOS.filter((g) => !g.soloCompleto || !esModoConsulta()).map((grupo, gi) => (
            <div key={grupo.titulo} className={clsx(gi > 0 && (colapsado ? 'mt-2.5 border-t border-white/10 pt-2.5' : 'mt-3 border-t border-white/10 pt-3'))}>
              {!colapsado && (
                <p className="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/55">
                  {grupo.titulo}
                  <span className="h-px w-6 bg-emerald-100/30" />
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {grupo.items.map((item) => (
                  <ItemBoton
                    key={item.id}
                    item={item}
                    activo={activo}
                    onCambiar={onCambiar}
                    onCerrar={onCerrar}
                    colapsado={colapsado}
                    onHover={(texto, top, esBloqueo) => setTooltipItem({ texto, top, esBloqueo })}
                    onSalir={() => setTooltipItem(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Tooltip flotante de los ítems (fuera del <nav> con scroll para que nunca se recorte). */}
        {tooltipItem && (colapsado || tooltipItem.esBloqueo) && (
          <span
            className={clsx(
              'pointer-events-none absolute z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#10233f] px-3 py-2 text-[13px] font-semibold text-white shadow-lg',
              colapsado ? 'left-[76px]' : 'left-[268px]',
            )}
            style={{ top: tooltipItem.top }}
          >
            {tooltipItem.texto}
            <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#10233f]" />
          </span>
        )}

        {/* ── Pie institucional ── */}
        <div className={clsx('shrink-0 border-t border-white/10', colapsado ? 'flex justify-center px-2 py-3' : 'flex items-center gap-3 px-4 py-3')}>
          <div className="group relative shrink-0">
            <div className={clsx('flex items-center justify-center rounded-full border border-white/25 bg-white/5', colapsado ? 'h-10 w-10' : 'h-12 w-12')}>
              <img src="/assets/icono-analitica.svg" alt="Análisis de datos" className={colapsado ? 'h-7 w-7' : 'h-8 w-8'} />
            </div>
            {colapsado && <TooltipLateral texto="Elaborado por: Ing. Jonathan Gomez · v2026.10.08 · v134" posicion="arriba" />}
          </div>
          {!colapsado && (
            <div className="min-w-0">
              {esModoConsulta() && (
                <p className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-amber-300">
                  <Eye size={11} /> Modo consulta — solo lectura
                </p>
              )}
              {obtenerModoAcceso() && (
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#5eead4]">
                  {obtenerModoAcceso() === 'jefe' ? 'Vista ejecutiva' : 'Vista interna'}
                </p>
              )}
              <p className="truncate text-[11.5px] text-emerald-100/75">Elaborado por: <span className="font-semibold text-white">Ing. Jonathan Gomez</span></p>
              <p className="text-[10.5px] text-emerald-100/50">v2026.10.08 · v134</p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
