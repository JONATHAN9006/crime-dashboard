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
};

// El mapa, "Indicadores Tasa Cosec" y "Productos Esperados" pueden abrirse
// aunque todavía no haya datos cargados — ninguno de los tres depende de la
// base de datos de delitos.
const PAGINAS_SIN_DATOS: PaginaId[] = ['mapa', 'tasaCosec', 'productos', 'rnmc', 'irisp1', 'macri'];

// Páginas que NO muestran el panel de filtros generales de delitos: el mapa
// tiene el suyo propio, IRISP1 también (sus campos — Estado, Existencia,
// Fuente, Clase — no existen en Delictividad) y MACRI es una tabla de
// seguimiento de objetivos que cruza Delictividad por su cuenta.
// El mapa YA usa el filtro principal (una sola fuente de verdad): lo que se
// filtra aquí —delito, modalidad, estación, fechas…— se ve también en el mapa.
const PAGINAS_SIN_FILTRO_GENERAL: PaginaId[] = ['irisp1', 'macri'];

function Shell() {
  const [pagina, setPagina] = useState<PaginaId>('resumen');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { loading, loadError, records } = useData();
  const Pagina = PAGINAS[pagina];
  const requiereDatos = !PAGINAS_SIN_DATOS.includes(pagina);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activo={pagina} onCambiar={setPagina} abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onAbrirMenu={() => setMenuAbierto(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          {loading && (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">Cargando información...</div>
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
              {records.length > 0 && !PAGINAS_SIN_FILTRO_GENERAL.includes(pagina) && <FilterPanel />}
              <Pagina />
            </div>
          )}
        </main>
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
  return (
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
}
