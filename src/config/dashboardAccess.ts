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
  indicadores: boolean;
  unidad: boolean;
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
}

export const DASHBOARD_ACCESS: Record<'jefe' | 'interno', AccesoHerramientas> = {
  // Vista para presentar a los superiores — solo lo ya validado. Para
  // desbloquear algo aquí, cambia su "false" a "true": aparece solo, sin
  // tocar ningún componente.
  jefe: {
    resumen: true,
    indicadores: true,
    unidad: true,
    ultimasSemanas: false,
    matrizCalor: false,
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
  },
  // Vista de trabajo interno — todo disponible, siempre.
  interno: {
    resumen: true,
    indicadores: true,
    unidad: true,
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
  },
};
