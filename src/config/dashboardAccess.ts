// ── CONFIGURACIÓN CENTRALIZADA DE ACCESO ────────────────────────────────
// Único lugar donde se decide qué herramientas están disponibles en cada
// modo (/jefe vs /interno). Para desbloquear algo para el jefe, basta con
// cambiar su valor a "true" aquí — nunca hay que tocar el componente en sí.
//
// Las claves de páginas (resumen, indicadores, unidad, ...) coinciden
// EXACTAMENTE con PaginaId (ver components/layout/Sidebar.tsx) para poder
// reutilizar el mismo identificador sin traducir entre dos sistemas.
// Las claves que no son páginas completas (tendenciaMensual, tendenciaDiaria,
// microgerencia, analistaIA) controlan componentes/herramientas puntuales
// DENTRO de una página o flotantes — cada uno se revisa en su propio lugar.
export interface AccesoHerramientas {
  resumen: boolean;
  unidad: boolean;
  operatividadUnidad: boolean;
  rnmc: boolean;
  irisp1: boolean;
  macri: boolean;
  ultimasSemanas: boolean;
  matrizCalor: boolean;
  mapa: boolean;
  tasaCosec: boolean;
  comparativo: boolean;
  tabla: boolean;
  calidad: boolean;
  productos: boolean;
  tendenciaMensual: boolean;
  tendenciaDiaria: boolean;
  microgerencia: boolean;
  analistaIA: boolean;
  // Descargar imágenes, Excel, CSV, PowerPoint, PDF y mapas.
  descargas: boolean;
  // "Actualizar información", "Sincronizar" y cargar matrices o capas.
  actualizarInformacion: boolean;
  // Página "Accesos CAI" (registro de ingresos de los comandantes) — solo administrador.
  accesosCai: boolean;
  // Módulo «Plan Candado 2026» (georreferenciación de puntos de control).
  planCandado: boolean;
  // La «X» que elimina capas del mapa (Capas cargadas) — solo el administrador (enlace raíz).
  eliminarCapas: boolean;
}

export const DASHBOARD_ACCESS: Record<'jefe' | 'interno' | 'cai' | 'piloto', AccesoHerramientas> = {
  // Vista para presentar a los superiores — solo lo ya validado. Para
  // desbloquear algo aquí, cambia su "false" a "true": aparece solo, sin
  // tocar ningún componente.
  jefe: {
    resumen: true,
    unidad: true,
    operatividadUnidad: true,
    // Módulos nuevos, todavía en construcción — ocultos para el jefe hasta
    // que estén listos (cambiar a true para habilitarlos).
    rnmc: false,
    irisp1: false,
    macri: false,
    ultimasSemanas: true,
    matrizCalor: true,
    mapa: false,
    tasaCosec: false,
    comparativo: false,
    tabla: false,
    calidad: false,
    productos: false,
    tendenciaMensual: false,
    tendenciaDiaria: false,
    microgerencia: false,
    analistaIA: false,
    // SOLO CONSULTA: sin descargar imágenes ni archivos, sin modificar ni cargar matrices.
    descargas: false,
    actualizarInformacion: false,
    accesosCai: false,
    planCandado: false,
    eliminarCapas: false,
  },
  // Vista de trabajo interno — todo disponible, siempre.
  interno: {
    resumen: true,
    unidad: true,
    operatividadUnidad: true,
    rnmc: true,
    irisp1: true,
    macri: true,
    ultimasSemanas: true,
    matrizCalor: true,
    mapa: true,
    tasaCosec: true,
    comparativo: true,
    tabla: true,
    calidad: true,
    productos: true,
    tendenciaMensual: true,
    tendenciaDiaria: true,
    microgerencia: true,
    analistaIA: true,
    descargas: true,
    actualizarInformacion: true,
    accesosCai: true,
    planCandado: false,
    // Sin la «X» de las capas (para no borrar capas compartidas por error).
    eliminarCapas: false,
  },
  // Comandantes de CAI (enlace /cai, con usuario y contraseña) — SOLO
  // CONSULTA: sin descargas, sin actualizar ni cargar información, sin
  // Microgerencia, MACRI, IRISP1 ni Analista IA.
  cai: {
    resumen: true,
    unidad: true,
    operatividadUnidad: true,
    rnmc: true,
    irisp1: false,
    macri: false,
    ultimasSemanas: true,
    matrizCalor: true,
    mapa: true,
    tasaCosec: true,
    comparativo: true,
    tabla: true,
    calidad: false,
    productos: false,
    tendenciaMensual: true,
    tendenciaDiaria: true,
    microgerencia: false,
    analistaIA: false,
    descargas: false,
    actualizarInformacion: false,
    accesosCai: false,
    planCandado: false,
    eliminarCapas: false,
  },
  // Perfil consulta_piloto (/piloto) — Estaciones Norte y Sur. SOLO estos
  // seis módulos; todo lo demás desaparece del menú y su página no abre
  // aunque se intente directamente (ver App.tsx). Sin cargas, descargas,
  // edición ni módulos administrativos.
  piloto: {
    resumen: true,
    unidad: true,
    operatividadUnidad: true,
    rnmc: false,
    irisp1: false,
    macri: false,
    ultimasSemanas: true,
    matrizCalor: true,
    mapa: true,
    tasaCosec: false,
    comparativo: false,
    tabla: false,
    calidad: false,
    productos: false,
    tendenciaMensual: true,
    tendenciaDiaria: true,
    microgerencia: false,
    analistaIA: false,
    descargas: false,
    actualizarInformacion: false,
    accesosCai: false,
    planCandado: false,
    eliminarCapas: false,
  },
};

/** ¿Es el perfil de la prueba piloto (todo lo geográfico limitado a Popayán)? */
export const esPerfilPiloto = (modo: string | null | undefined) => modo === 'piloto';
