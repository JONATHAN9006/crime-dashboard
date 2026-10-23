import { useEffect, useState } from 'react';
import { sincronizarCapasDesdeServidor } from './data/geoSync';
import { DataProvider, useData } from './context/DataContext';
import { Sidebar, type PaginaId } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { FilterPanel } from './components/filters/FilterPanel';
import { ResumenEjecutivo } from './pages/ResumenEjecutivo';
import { AnalisisUnidad } from './pages/AnalisisUnidad';
import { OperatividadUnidad } from './pages/OperatividadUnidad';
import { Rnmc } from './pages/Rnmc';
import { Macri } from './pages/Macri';
import { Irisp1 } from './pages/Irisp1';
import { UltimasSemanas } from './pages/UltimasSemanas';
import { MatrizCalor } from './pages/MatrizCalor';
import { MapaGeorreferenciacion } from './pages/MapaGeorreferenciacion';
import { IndicadoresTasaCosec } from './pages/IndicadoresTasaCosec';
import { Comparativo } from './pages/Comparativo';
import { TablaDatos } from './pages/TablaDatos';
import { CalidadDatos } from './pages/CalidadDatos';
import { ProductosEsperados } from './pages/ProductosEsperados';
import { AgenteIAFlotante } from './components/analitica/AgenteIAFlotante';
import { obtenerModoAcceso } from './utils/modoAcceso';
import { DASHBOARD_ACCESS } from './config/dashboardAccess';
import { AccesosCai } from './pages/AccesosCai';
import { PlanCandado2026 } from './pages/PlanCandado2026';
import { PuertaCai } from './cai/PuertaCai';
import { PuertaAdmin } from './admin/PuertaAdmin';
import { tieneAcceso } from './utils/permisos';

// Protección de RUTA, no solo de menú: aunque algo intente abrir una página
// no autorizada para el modo actual (/piloto, /cai, /jefe…), se muestra
// Inicio / Resumen en su lugar. El administrador (ruta raíz) lo ve todo.
function paginaPermitida(p: PaginaId): boolean {
  return p in PAGINAS && tieneAcceso(p as Parameters<typeof tieneAcceso>[0]);
}

const PAGINAS: Record<PaginaId, React.ComponentType> = {
  resumen: ResumenEjecutivo,
  unidad: AnalisisUnidad,
  operatividadUnidad: OperatividadUnidad,
  rnmc: Rnmc,
  irisp1: Irisp1,
  macri: Macri,
  ultimasSemanas: UltimasSemanas,
  matrizCalor: MatrizCalor,
  mapa: MapaGeorreferenciacion,
  tasaCosec: IndicadoresTasaCosec,
  comparativo: Comparativo,
  tabla: TablaDatos,
  calidad: CalidadDatos,
  productos: ProductosEsperados,
  accesosCai: AccesosCai,
  planCandado: PlanCandado2026,
};

// El mapa, "Indicadores Tasa Cosec" y "Productos Esperados" pueden abrirse
// aunque todavía no haya datos cargados — ninguno de los tres depende de la
// base de datos de delitos.
const PAGINAS_SIN_DATOS: PaginaId[] = ['mapa', 'tasaCosec', 'productos', 'rnmc', 'irisp1', 'macri', 'accesosCai', 'planCandado'];

// Páginas que NO muestran el panel de filtros generales de delitos: el mapa
// tiene el suyo propio, IRISP1 también (sus campos — Estado, Existencia,
// Fuente, Clase — no existen en Delictividad) y MACRI es una tabla de
// seguimiento de objetivos que cruza Delictividad por su cuenta.
// El mapa YA usa el filtro principal (una sola fuente de verdad): lo que se
// filtra aquí —delito, modalidad, estación, fechas…— se ve también en el mapa.
// Plan Candado tiene su propia barra compacta (Estación y CAI son los del filtro principal).
const PAGINAS_SIN_FILTRO_GENERAL: PaginaId[] = ['irisp1', 'macri', 'accesosCai', 'planCandado'];

// Pantalla de carga; en el enlace piloto muestra el avance de la descarga.
function CargandoInformacion() {
  const [pct, setPct] = useState<number | null>(null);
  useEffect(() => {
    const f = (e: Event) => setPct((e as CustomEvent<number>).detail);
    window.addEventListener('mepoy-progreso-carga', f);
    return () => window.removeEventListener('mepoy-progreso-carga', f);
  }, []);
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-slate-400">
      <span>Cargando información{pct !== null ? ` · ${pct} %` : '...'}</span>
      {pct !== null && (
        <span className="h-1.5 w-56 overflow-hidden rounded-full bg-slate-200">
          <span className="block h-full rounded-full bg-[#116762] transition-all" style={{ width: `${pct}%` }} />
        </span>
      )}
    </div>
  );
}

function Shell() {
  const [pagina, setPagina] = useState<PaginaId>('resumen');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { loading, loadError, records } = useData();
  const paginaSegura: PaginaId = paginaPermitida(pagina) ? pagina : 'resumen';
  const Pagina = PAGINAS[paginaSegura];
  const requiereDatos = !PAGINAS_SIN_DATOS.includes(paginaSegura);
  const cambiarPagina = (p: PaginaId) => setPagina(paginaPermitida(p) ? p : 'resumen');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activo={paginaSegura} onCambiar={cambiarPagina} abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onAbrirMenu={() => setMenuAbierto(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          {loading && (
            <CargandoInformacion />
          )}
          {!loading && loadError && records.length === 0 && requiereDatos && (
            <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-800">
              {loadError}
            </div>
          )}
          {!loading && (records.length > 0 || !requiereDatos) && (
            <div className="space-y-5">
              {/* El Mapa de Georreferenciación tiene su PROPIO panel de
                  filtros (dentro de la página misma) — los filtros
                  generales del dashboard no se muestran ahí, mientras que
                  el resto de los módulos los sigue usando exactamente igual
                  que siempre. */}
              {records.length > 0 && !PAGINAS_SIN_FILTRO_GENERAL.includes(paginaSegura) && <FilterPanel />}
              <Pagina />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function EnlaceRetirado() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,#116762_0%,#0a3d39_45%,#10233f_100%)] px-4">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-6 text-center shadow-2xl">
        <img src="/assets/escudo-sidebar.png" alt="Escudo Policía Nacional" className="mx-auto mb-3 h-14 w-14 object-contain" draggable={false} />
        <p className="text-[16px] font-bold text-[#10233f]">Este enlace ya no está disponible</p>
        <p className="mt-1.5 text-[13px] text-slate-500">La consulta del dashboard se hace ahora por el enlace de consulta, con usuario y contraseña. Solicítalo al administrador.</p>
      </div>
    </div>
  );
}

export default function App() {
  const modoAcceso = obtenerModoAcceso();
  const accesoAnalistaIA = !modoAcceso || DASHBOARD_ACCESS[modoAcceso].analistaIA;
  // Capas geográficas compartidas (shapefiles que cargaron otros equipos):
  // se traen al abrir el dashboard, en segundo plano, para que el mapa y
  // Microgerencia las tengan sin que nadie tenga que volver a subirlas.
  useEffect(() => {
    sincronizarCapasDesdeServidor().catch((e) => console.warn('[Capas compartidas] No se pudo sincronizar al abrir:', e));
  }, []);
  const app = (
    <DataProvider>
      <Shell />
      {/* Flotante, fuera del intercambio de páginas: disponible en
          Indicadores, Análisis por Unidad, Resumen o cualquier otra
          pantalla, sin necesidad de una página dedicada. Se oculta por
          completo (bloqueo funcional real, no solo visual) si está
          deshabilitado para el modo de acceso actual (/jefe). */}
      {accesoAnalistaIA && <AgenteIAFlotante />}
    </DataProvider>
  );
  // Enlace de los comandantes de CAI: nada se carga (ni los datos) hasta
  // que ingresan con su usuario y contraseña desde Popayán.
  // Enlace principal (sin /interno, /jefe ni /cai): administrador, con
  // usuario y contraseña validados en el servidor.
  // /piloto (Estaciones Norte y Sur): mismo ingreso validado en el servidor,
  // con perfil consulta_piloto.
  // Enlaces retirados: /jefe y /cai. Los jefes y comandantes usan /piloto.
  if (modoAcceso === 'jefe' || modoAcceso === 'cai') return <EnlaceRetirado />;
  if (modoAcceso === 'piloto') return <PuertaCai>{app}</PuertaCai>;
  if (modoAcceso === null) return <PuertaAdmin>{app}</PuertaAdmin>;
  return app;
}
