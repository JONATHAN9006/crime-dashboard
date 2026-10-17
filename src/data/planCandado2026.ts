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
  | 'Guardia MEPOY (cierre perimetral)';

export type EstacionPlanCandado = 'Norte' | 'Sur';

export interface PuntoPlanCandado {
  id: string; // identificador estable (no cambia aunque cambien las coordenadas)
  numero: number; // número tal como aparece en el documento
  categoria: CategoriaPlanCandado;
  estacion: EstacionPlanCandado | null;
  cai: string | null; // "CAI 1" … "CAI 10"
  caiNombre: string | null; // "Antonio Nariño"…
  unidad: string | null; // responsable / unidad
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

export const PLAN_CANDADO_2026: PuntoPlanCandado[] = [
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

/** Etiqueta corta del grupo visual de un punto: su CAI o su categoría. */
export function grupoVisualPlanCandado(p: PuntoPlanCandado): string {
  return p.cai ? `${p.cai} - ${p.caiNombre}` : p.categoria;
}

/** Texto del número tal como debe leerse (el cierre general tiene numeración propia). */
export function etiquetaNumeroPlanCandado(p: PuntoPlanCandado): string {
  return p.categoria === 'Cierre general MEPOY' ? `M${p.numero}` : String(p.numero);
}
