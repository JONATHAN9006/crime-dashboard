// PLAN CANDADO 2026 — MEPOY (documento "PLAN CANDADO 2026.docx", agosto 2026).
//
// Transcripción LITERAL de todas las tablas del documento: 5 puntos del
// cierre general MEPOY (numerados 1–5 en su propia tabla) + 45 puntos
// numerados 1–45 (CAI de las estaciones Norte y Sur, Carabineros, Terminal
// de Transportes y Guardia MEPOY). Total: 50 registros.
//
// Reglas de la transcripción:
//  · Dirección y lugar se copian tal cual (incluida la "Carrera 12 con
//    Carrera 17" del punto 23, como aparece en el documento).
//  · Celdas vacías del documento → null ("No especificado" en pantalla).
//  · Estación: solo la que el documento indica por estructura (los CAI 1–4
//    están bajo "ESTACIÓN NORTE" y los CAI 5–10 bajo "ESTACIÓN SUR"). Los
//    demás cierres no tienen estación en el documento → null.
//  · En los CAI 2–10 la columna se titula "CUADRANTE", pero su contenido
//    es la unidad (Comandante / Información); se guarda como unidad.
//  · El documento NO trae coordenadas: la ubicación se asigna aparte (ver
//    planCandadoUbicaciones.ts), sin tocar estos registros.

export type CategoriaPlanCandado =
  | 'Cierre general MEPOY'
  | 'CAI'
  | 'Carabineros'
  | 'Terminal de Transportes'
  | 'Guardia MEPOY (cierre perimetral)'
  | 'Punto agregado'; // agregado a mano desde el dashboard (no está en el documento)

export type EstacionPlanCandado = 'Norte' | 'Sur';

export interface PuntoPlanCandado {
  id: string; // identificador estable (no cambia aunque cambien las coordenadas)
  numero: number; // número tal como aparece en el documento
  categoria: CategoriaPlanCandado;
  estacion: EstacionPlanCandado | null;
  cai: string | null; // "CAI 1" … "CAI 10"
  caiNombre: string | null; // "Antonio Nariño"…
  unidad: string | null; // unidad según el documento Word (Comandante / Información…)
  // Matriz oficial «Plan_candado_2026.xlsx» (solo puntos 1–41; null si la
  // matriz no trae el dato o el punto no está en la matriz).
  responsablePrincipal: string | null;
  responsableSecundario: string | null;
  enMatriz: boolean; // el punto figura en la matriz oficial (Excel)
  agregado?: boolean; // creado a mano en el dashboard
  estacionPorUbicacion?: boolean; // la estación se tomó del límite de estaciones (por coordenada)
  direccion: string | null;
  lugar: string | null;
}

type Fila = [numero: number, unidad: string | null, direccion: string | null, lugar: string | null];

function grupo(
  categoria: CategoriaPlanCandado,
  filas: Fila[],
  extra: { estacion?: EstacionPlanCandado; cai?: string; caiNombre?: string; prefijo?: string } = {},
): PuntoPlanCandado[] {
  return filas.map(([numero, unidad, direccion, lugar]) => ({
    id: `${extra.prefijo ?? 'PC'}-${numero}`,
    numero,
    categoria,
    estacion: extra.estacion ?? null,
    cai: extra.cai ?? null,
    caiNombre: extra.caiNombre ?? null,
    unidad,
    direccion,
    lugar,
    responsablePrincipal: null,
    responsableSecundario: null,
    enMatriz: false,
  }));
}

export const CAI_PLAN_CANDADO: { cai: string; nombre: string; estacion: EstacionPlanCandado }[] = [
  { cai: 'CAI 1', nombre: 'Antonio Nariño', estacion: 'Norte' },
  { cai: 'CAI 2', nombre: 'La Paz', estacion: 'Norte' },
  { cai: 'CAI 3', nombre: 'La Estancia', estacion: 'Norte' },
  { cai: 'CAI 4', nombre: 'Benito Juárez', estacion: 'Norte' },
  { cai: 'CAI 5', nombre: 'La Floresta', estacion: 'Sur' },
  { cai: 'CAI 6', nombre: 'Alfonso López', estacion: 'Sur' },
  { cai: 'CAI 7', nombre: 'El Mirador', estacion: 'Sur' },
  { cai: 'CAI 8', nombre: 'Parque Informático', estacion: 'Sur' },
  { cai: 'CAI 9', nombre: 'María Occidente', estacion: 'Sur' },
  { cai: 'CAI 10', nombre: 'Lomas de Granada', estacion: 'Sur' },
];

function cai(n: number, filas: Fila[]) {
  const c = CAI_PLAN_CANDADO[n - 1];
  return grupo('CAI', filas, { estacion: c.estacion, cai: c.cai, caiNombre: c.nombre });
}

// «Responsable Principal» de la matriz oficial Plan_candado_2026.xlsx
// (columna «No.» = número del punto 1–41). «Responsable Secundario» viene
// vacío en todas las filas de la matriz entregada (17-oct-2026).
export const RESPONSABLES_MATRIZ: Record<string, { principal: string | null; secundario: string | null }> = Object.fromEntries(
  Object.entries({
  'PC-1': 'Patrulla 1 Norte',
  'PC-2': 'Auxiliar de Información',
  'PC-3': 'Patrulla 1 Norte',
  'PC-4': 'Patrulla 2 Norte',
  'PC-5': 'Patrulla 3 Norte',
  'PC-6': 'Auxiliar de Información',
  'PC-7': 'Patrulla 3 Norte',
  'PC-8': 'Patrulla 7 Norte',
  'PC-9': 'Patrulla 6 Norte',
  'PC-10': 'Patrulla 12 Norte',
  'PC-11': 'Auxiliar de Información',
  'PC-12': 'Patrulla 8 Norte',
  'PC-13': 'Patrulla 18 Norte',
  'PC-14': 'Patrulla 15 Norte',
  'PC-15': 'Auxiliar de Información',
  'PC-16': 'Patrulla 13 Norte',
  'PC-17': 'Patrulla 16 Norte',
  'PC-18': 'Patrulla 17 Norte',
  'PC-19': 'Patrulla 4 Sur',
  'PC-20': 'Auxiliar de Información',
  'PC-21': 'Patrulla 3 Sur',
  'PC-22': 'Patrulla 1 Sur',
  'PC-23': 'Patrulla 8 Sur',
  'PC-24': 'Auxiliar de Información',
  'PC-25': 'Patrulla 5 Sur',
  'PC-26': 'Patrulla 7 Sur',
  'PC-27': 'Patrulla 12 Sur',
  'PC-28': 'Auxiliar de Información',
  'PC-29': 'Patrulla 9 Sur',
  'PC-30': 'Patrulla 10 Sur',
  'PC-31': 'Patrulla 14 Sur',
  'PC-32': 'Patrulla 20 Sur',
  'PC-33': 'Auxiliar de Información',
  'PC-34': 'Patrulla 17 Sur',
  'PC-35': 'Patrulla 18 Sur',
  'PC-36': 'Patrulla 15 Sur',
  'PC-37': 'Auxiliar de Información',
  'PC-38': 'Patrulla 21 Sur',
  'PC-39': 'Patrulla 23 Sur',
  'PC-40': 'Auxiliar de Información',
  'PC-41': 'Patrulla 22 Sur',
  } as Record<string, string>).map(([id, principal]) => [id, { principal, secundario: null }]),
);

const PUNTOS_DOCUMENTO: PuntoPlanCandado[] = [
  // ── MEPOY (tabla general, numeración propia 1–5) ──
  ...grupo('Cierre general MEPOY', [
    [1, 'CDTE CAI 2', 'Salida a Cali', 'Variante Norte'],
    [2, 'Patrulla', null, 'Glorieta Sena Norte'],
    [3, 'Patrulla', null, 'Piedra sur'],
    [4, 'Patrulla', 'Variante Sur', 'Sector D1'],
    [5, 'Patrulla', 'Sector Transito', 'Glorieta Transito'],
  ], { prefijo: 'MEPOY' }),

  // ── ESTACIÓN NORTE ──
  ...cai(1, [
    [1, 'Comandante', 'Transversal 9 con Calle 7N', 'Glorieta de la Toscana'],
    [2, 'Información', 'Transversal 9 (Glorieta)', 'Antonio Nariño (Frente al CAI)'],
    [3, null, 'Carrera 9 con Calle 1N', 'Semáforos del Modelo'],
    [4, null, 'Carrera 9 con Calle 25N', 'Semáforos del Campanario'],
  ]),
  ...cai(2, [
    [5, 'Comandante', 'Carrera 17 – Variante Norte', 'Entre Pinos'],
    [6, 'Información', 'Calle 71N (Semáforos)', 'La Paz (Frente al CAI)'],
    [7, null, 'Transversal 9N', 'Glorieta de Bella Vista'],
    [8, null, 'Carrera 9 con Calle 71N', 'Sena Norte – La Paz'],
    [9, null, 'Autopista Norte', 'Puente Norte'],
  ]),
  ...cai(3, [
    [10, 'Comandante', 'Carrera 6 con Calle 7N', 'Barrio Bolívar'],
    [11, 'Información', 'Carrera 6 con Calle 20N', 'La Estancia (Frente al CAI)'],
    [12, null, 'Carrera 6 (Mi Vaquita)', 'Puente Nuevo'],
    [13, null, 'Calle 25N – Vía al Huila', 'Estación de Servicio Primax'],
  ]),
  ...cai(4, [
    [14, 'Comandante', 'Calle 4 con Carrera 17', 'Semáforos del Valencia'],
    [15, 'Información', 'Calle 8 con Carrera 11', 'Benito Juárez (Frente al CAI)'],
    [16, null, 'Calle 5 con Carrera 2E', 'Cruce del Colegio Melvin Jones'],
    [17, null, 'Calle 13 con Carrera 17', 'Glorieta la Chirimía'],
    [18, null, 'Calle 13 con Carrera 4', 'Polideportivo Alfonso López'],
  ]),

  // ── ESTACIÓN SUR ──
  ...cai(5, [
    [19, 'Comandante', 'Carrera 3 con Calle 17', 'Cárcel de Mujeres'],
    [20, 'Información', 'Carrera 1E', 'La Floresta (Frente al CAI)'],
    [21, null, 'Carrera 2E con Calle 17', 'Glorieta de los Sauces'],
    [22, null, 'Carrera 7E con Calle 13E', 'Los Braceros (Palo de Árbol)'],
  ]),
  ...cai(6, [
    [23, 'Comandante', 'Carrera 12 con Carrera 17', 'Piedra Sur'],
    [24, 'Información', 'Calle 16 con Carrera 4', 'Alfonso López (Frente al CAI)'],
    [25, null, 'Calle 13 con Carrera 9', 'Plaza de Toros'],
    [26, null, 'Autopista Sur', 'Los Faroles'],
  ]),
  ...cai(7, [
    [27, 'Comandante', 'Carrera 29 – Variante Sur', 'Entrada San Fernando'],
    [28, 'Información', 'Calle 14 con Carrera 28', 'El Mirador (Frente al CAI)'],
    [29, null, 'Variante Sur - Sintéticas', 'Vda. Puelenje'],
    [30, null, 'Carrera 23 con Calle 9', 'Puente de Tomas Cipriano'],
    [31, null, 'Carrera 37 – Variante Sur', 'Semáforos Vereda de Torres'],
  ]),
  ...cai(8, [
    [32, 'Comandante', 'Calle 5 con Carrera 28', 'Puente Chune'],
    [33, 'Información', 'Calle 5 con Carrera 23', 'Parque Informático (Frente al CAI)'],
    [34, null, 'Calle 5 con Carrera 17', 'Semáforos La Esmeralda'],
    [35, null, 'Calle 9 con Carrera 20', 'El Guayabal'],
  ]),
  ...cai(9, [
    [36, 'Comandante', 'Carrera 48A – Variante Sur', 'Villa Colombia'],
    [37, 'Información', 'Carrera 41 con Calle 2', 'María Occidente (Frente al CAI)'],
    [38, null, 'Carrera 37 con Calle 5', 'Iglesia de la María Occidente'],
  ]),
  ...cai(10, [
    [39, 'Comandante', 'Vía al Tambo', 'La Bascula'],
    [40, 'Información', 'Calle 5 Esquina', 'Lomas de Granada (Frente al CAI)'],
    [41, null, 'Calle 5 con Carrera 51', 'Bomba Transtambo'],
  ]),

  // ── OTROS CIERRES ──
  ...grupo('Carabineros', [[42, 'Comandante de Guardia', 'Por la Variante', 'Frente al Fuerte de Carabineros']]),
  ...grupo('Terminal de Transportes', [[43, 'Comandante de Guardia', 'Transversal 9N con Carrera 11', 'Glorieta del Terminal de Transporte']]),
  ...grupo('Guardia MEPOY (cierre perimetral)', [
    [44, 'Recorredora 1 y 2', 'Transversal 9N con Carrera 11', 'Glorieta del Terminal de Transporte'],
    [45, 'Recorredora 3 y 4', 'Carrera 17 con Calle 8', 'Frente a Remo Yamaha'],
  ]),
];

export const PLAN_CANDADO_2026: PuntoPlanCandado[] = PUNTOS_DOCUMENTO.map((p) => {
  const r = RESPONSABLES_MATRIZ[p.id];
  return r ? { ...p, responsablePrincipal: r.principal, responsableSecundario: r.secundario, enMatriz: true } : p;
});

/** Etiqueta corta del grupo visual de un punto: su CAI o su categoría. */
export function grupoVisualPlanCandado(p: PuntoPlanCandado): string {
  return p.cai ? `${p.cai} - ${p.caiNombre}` : p.categoria;
}

/** Texto del número tal como debe leerse (el cierre general tiene numeración propia). */
export function etiquetaNumeroPlanCandado(p: PuntoPlanCandado): string {
  return p.categoria === 'Cierre general MEPOY' ? `M${p.numero}` : String(p.numero);
}

// Coordenadas OFICIALES entregadas por MEPOY en «Plan_candado_2026.xlsx»
// (17-oct-2026). Se unieron a cada punto por Dirección + Lugar (las 41 filas
// del archivo coinciden con los puntos 1–41 del documento). [lat, lon].
// No traen coordenadas en el archivo: punto 9 (Autopista Norte – Puente
// Norte) y punto 27 (Carrera 29 – Variante Sur – Entrada San Fernando).
// El cierre general MEPOY (M1–M5) y los puntos 42–45 no vienen en el archivo.
// Una corrección hecha en el mapa o importada después tiene prioridad.
export const COORDENADAS_OFICIALES_PLAN_CANDADO: Record<string, [number, number]> = {
  'PC-1': [2.4518244, -76.6053293],
  'PC-2': [2.4553662, -76.59775],
  'PC-3': [2.4460519, -76.6072735],
  'PC-4': [2.4592463, -76.5932134],
  'PC-5': [2.4903223, -76.5849971],
  'PC-6': [2.4789442, -76.5611811],
  'PC-7': [2.4813107, -76.5745714],
  'PC-8': [2.4828091, -76.562594],
  'PC-10': [2.4472251, -76.6033665],
  'PC-11': [2.4533481, -76.5941287],
  'PC-12': [2.470219, -76.5781225],
  'PC-13': [2.4381373, -76.5886491],
  'PC-14': [2.4452559, -76.6146863],
  'PC-15': [2.4403164, -76.6116703],
  'PC-16': [2.439464, -76.6007915],
  'PC-17': [2.4369692, -76.616091],
  'PC-18': [2.4339853, -76.6066606],
  'PC-19': [2.4318615, -76.6065999],
  'PC-20': [2.4340079, -76.601518],
  'PC-21': [2.4307858, -76.6031115],
  'PC-22': [2.4326499, -76.5987434],
  'PC-23': [2.4342321, -76.6168976],
  'PC-24': [2.4327764, -76.6071195],
  'PC-25': [2.4351501, -76.6113666],
  'PC-26': [2.4255067, -76.6221502],
  'PC-28': [2.4442253, -76.6270955],
  'PC-29': [2.427928, -76.6214473],
  'PC-30': [2.4442751, -76.6223647],
  'PC-31': [2.4412824, -76.6374474],
  'PC-32': [2.4495474, -76.6246998],
  'PC-33': [2.4471551, -76.6202653],
  'PC-34': [2.4447573, -76.6147172],
  'PC-35': [2.4406109, -76.6198216],
  'PC-36': [2.4597406, -76.6378004],
  'PC-37': [2.4567347, -76.6327099],
  'PC-38': [2.4526211, -76.6319576],
  'PC-39': [2.4823658, -76.6464234],
  'PC-40': [2.4586556, -76.6437311],
  'PC-41': [2.4552182, -76.6394999],
};
export const ARCHIVO_COORDENADAS_OFICIALES = 'Plan_candado_2026.xlsx';
