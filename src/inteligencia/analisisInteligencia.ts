// ─────────────────────────────────────────────────────────────────────────
// CENTRO DE INTELIGENCIA – cálculos del Panel estratégico (solo administrador).
//
// Fuente única: los registros de Delictividad que ya calcula Microgerencia
// (useMicrogerencia) con los filtros generales del dashboard:
//   · T  = año anterior COMPLETO (1 ene – 31 dic)        → «Total {P}»
//   · Aa = año anterior hasta el mismo día del corte     → «{P}» comparable
//   · B  = año actual hasta la fecha de corte            → «{A}»
//   Diferencia = B − Aa · Variación = (B − Aa) / Aa × 100 (N/A si Aa = 0).
//
// Las alertas y la priorización son HALLAZGOS ESTADÍSTICOS sobre esas cifras:
// no son predicciones ni explican causas. Cada una dice qué criterio la generó.
// Los umbrales están en UMBRALES_ALERTA (configurables y documentados).
// ─────────────────────────────────────────────────────────────────────────
import type { CrimeRecord } from '../types/crime';
import { esValorValido } from '../data/microgerenciaDelito';

export const UMBRALES_ALERTA = {
  /** Incremento significativo (delito × estación): variación ≥ X % … */
  incrementoPct: 25,
  /** … con al menos N casos en el periodo comparable del año anterior. */
  incrementoMinBase: 10,
  /** Nivel ALTA del incremento si la variación es ≥ X %. */
  incrementoAltaPct: 50,
  /** Concentración territorial: un CAI reúne ≥ X % de los casos del delito … */
  concentracionTerritorialPct: 15,
  /** … y al menos N casos. */
  concentracionMinCasos: 30,
  /** Concentración horaria: la celda día × hora con más casos de un delito, mínimo N casos. */
  concentracionHorariaMin: 10,
  /** Aumento últimas 4 semanas vs. las 4 anteriores: ≥ X % y ≥ N casos más. */
  semanasPct: 10,
  semanasMinDif: 5,
  /** Variación desfavorable por estación: ≥ X % frente al periodo comparable. */
  estacionPct: 10,
  /** Reducción sostenida: variación ≤ −X % y los últimos 3 meses completos por debajo del año anterior. */
  reduccionPct: 10,
  /** Nuevo barrio en el Top: Top N del año actual que no estaba en el Top N comparable. */
  topBarrios: 10,
} as const;

export type NivelAlerta = 'ALTA' | 'MEDIA' | 'BAJA';
export type TipoAlerta = 'incremento' | 'territorial' | 'horaria' | 'semanas' | 'estacion' | 'reduccion' | 'barrioNuevo';

export interface Alerta {
  tipo: TipoAlerta;
  titulo: string;
  nivel: NivelAlerta;
  delito: string;
  estacion: string;
  lugar?: string;
  casos: number;
  /** Texto del detalle (ej. «61 casos (+52,5 %)»). */
  dif?: number;
  variacion?: number | null;
  participacion?: number;
  periodo: string;
  criterio: string;
}

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const variacion = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : null);
const valido = (v: string | null | undefined) => esValorValido(v) && !/^sin /i.test(String(v));

function contar<K>(lista: CrimeRecord[], clave: (r: CrimeRecord) => K | null): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of lista) { const k = clave(r); if (k == null) continue; m.set(k, (m.get(k) ?? 0) + 1); }
  return m;
}

export function moda(lista: CrimeRecord[], clave: (r: CrimeRecord) => string | null | undefined): { valor: string; casos: number } | null {
  const m = contar(lista, (r) => { const v = clave(r); return v && valido(v) ? v : null; });
  let mejor: { valor: string; casos: number } | null = null;
  for (const [valor, casos] of m) if (!mejor || casos > mejor.casos) mejor = { valor, casos };
  return mejor;
}

/** Celda día × hora con más casos (y su total). */
export function celdaCritica(lista: CrimeRecord[]): { dia: number; hora: number; casos: number } | null {
  const m = contar(lista, (r) => (r.diaSemanaIndex != null && r.hora != null ? r.diaSemanaIndex * 24 + r.hora : null));
  let mejor: { dia: number; hora: number; casos: number } | null = null;
  for (const [k, casos] of m) if (!mejor || casos > mejor.casos) mejor = { dia: Math.floor(k / 24), hora: k % 24, casos };
  return mejor;
}
export const nombreDia = (i: number) => DIAS[i] ?? '';
export const horaTexto = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Ventanas de 7 días que terminan en la fecha de corte (S4 = la última). */
export function ultimasSemanas(B: CrimeRecord[], corte: Date, n = 4) {
  const fin = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate(), 23, 59, 59, 999);
  const ventanas = Array.from({ length: n * 2 }, (_, i) => {
    const hasta = new Date(fin); hasta.setDate(fin.getDate() - 7 * (n * 2 - 1 - i));
    const desde = new Date(hasta); desde.setDate(hasta.getDate() - 6); desde.setHours(0, 0, 0, 0);
    return { desde, hasta, casos: 0 };
  });
  for (const r of B) {
    if (!r.fecha) continue;
    const t = r.fecha.getTime();
    for (const v of ventanas) if (t >= v.desde.getTime() && t <= v.hasta.getTime()) { v.casos++; break; }
  }
  return { anteriores: ventanas.slice(0, n), recientes: ventanas.slice(n) };
}

export interface EntradaAnalisis {
  T: CrimeRecord[]; Aa: CrimeRecord[]; B: CrimeRecord[];
  corte: Date; anioActual: number; anioAnterior: number; periodo: string;
}

export function calcularAlertas({ Aa, B, corte, anioAnterior, periodo }: EntradaAnalisis): Alerta[] {
  const U = UMBRALES_ALERTA;
  const comp = `${periodo} vs. ${periodo.replace(/\d{4}$/, String(anioAnterior))}`;
  const alertas: Alerta[] = [];

  // 1) Incremento significativo: delito × estación.
  const kDE = (r: CrimeRecord) => (valido(r.delito) && valido(r.estacion) ? `${r.delito}|${r.estacion}` : null);
  const bDE = contar(B, kDE), aDE = contar(Aa, kDE);
  const incrementos = [...bDE].map(([k, b]) => ({ k, b, a: aDE.get(k) ?? 0 }))
    .filter((x) => x.a >= U.incrementoMinBase && (variacion(x.a, x.b) ?? 0) >= U.incrementoPct)
    .sort((x, y) => (y.b - y.a) - (x.b - x.a));
  for (const x of incrementos.slice(0, 2)) {
    const [delito, estacion] = x.k.split('|');
    const v = variacion(x.a, x.b)!;
    alertas.push({ tipo: 'incremento', titulo: 'Incremento significativo', nivel: v >= U.incrementoAltaPct ? 'ALTA' : 'MEDIA', delito, estacion, casos: x.b, dif: x.b - x.a, variacion: v, periodo: comp,
      criterio: `Variación ≥ ${U.incrementoPct} % con al menos ${U.incrementoMinBase} casos en ${anioAnterior}.` });
  }

  // 2) Concentración territorial: delito × CAI sobre el total del delito.
  const porDelito = contar(B, (r) => (valido(r.delito) ? r.delito : null));
  const kDC = (r: CrimeRecord) => (valido(r.delito) && valido(r.cai) ? `${r.delito}|${r.cai}|${r.estacion}` : null);
  const terr = [...contar(B, kDC)].map(([k, casos]) => { const [delito, cai, estacion] = k.split('|'); const tot = porDelito.get(delito) ?? 0; return { delito, cai, estacion, casos, pct: tot ? (casos / tot) * 100 : 0 }; })
    .filter((x) => x.casos >= U.concentracionMinCasos && x.pct >= U.concentracionTerritorialPct)
    .sort((x, y) => y.casos - x.casos);
  if (terr[0]) {
    const x = terr[0];
    alertas.push({ tipo: 'territorial', titulo: 'Concentración territorial', nivel: x.pct >= 25 ? 'ALTA' : 'MEDIA', delito: x.delito, estacion: x.estacion, lugar: x.cai, casos: x.casos, participacion: x.pct, periodo,
      criterio: `Un CAI reúne ≥ ${U.concentracionTerritorialPct} % de los casos del delito (mín. ${U.concentracionMinCasos}).` });
  }

  // 3) Concentración horaria: celda día × hora con más casos de un mismo delito.
  let mejorH: { delito: string; dia: number; hora: number; casos: number } | null = null;
  const porDelitoLista = new Map<string, CrimeRecord[]>();
  for (const r of B) if (valido(r.delito)) { const l = porDelitoLista.get(r.delito); if (l) l.push(r); else porDelitoLista.set(r.delito, [r]); }
  for (const [delito, lista] of porDelitoLista) {
    const c = celdaCritica(lista);
    if (c && c.casos >= U.concentracionHorariaMin && (!mejorH || c.casos > mejorH.casos)) mejorH = { delito, ...c };
  }
  if (mejorH) {
    const estacion = moda((porDelitoLista.get(mejorH.delito) ?? []).filter((r) => r.diaSemanaIndex === mejorH!.dia && r.hora === mejorH!.hora), (r) => r.estacion)?.valor ?? '';
    alertas.push({ tipo: 'horaria', titulo: 'Concentración horaria', nivel: 'MEDIA', delito: mejorH.delito, estacion, lugar: `${nombreDia(mejorH.dia)} ${horaTexto(mejorH.hora)}`, casos: mejorH.casos,
      participacion: B.length ? (mejorH.casos / B.length) * 100 : 0, periodo,
      criterio: `Celda día × hora con más casos de un delito (mín. ${U.concentracionHorariaMin}).` });
  }

  // 4) Aumento en las últimas 4 semanas frente a las 4 anteriores (por delito).
  const sem = ultimasSemanas(B, corte);
  const enRango = (r: CrimeRecord, d: Date, h: Date) => !!r.fecha && r.fecha >= d && r.fecha <= h;
  const ant = { d: sem.anteriores[0].desde, h: sem.anteriores[3].hasta }, rec = { d: sem.recientes[0].desde, h: sem.recientes[3].hasta };
  const aumentos = [...porDelitoLista].map(([delito, lista]) => {
    const a = lista.filter((r) => enRango(r, ant.d, ant.h)).length, b = lista.filter((r) => enRango(r, rec.d, rec.h)).length;
    return { delito, a, b, lista };
  }).filter((x) => x.b - x.a >= U.semanasMinDif && (variacion(x.a, x.b) ?? 0) >= U.semanasPct).sort((x, y) => (y.b - y.a) - (x.b - x.a));
  if (aumentos[0]) {
    const x = aumentos[0];
    alertas.push({ tipo: 'semanas', titulo: 'Aumento últimas 4 semanas', nivel: 'MEDIA', delito: x.delito, estacion: 'MEPOY', casos: x.b, dif: x.b - x.a, variacion: variacion(x.a, x.b),
      periodo: 'Últimas 4 semanas vs. 4 anteriores', criterio: `≥ ${U.semanasPct} % y ≥ ${U.semanasMinDif} casos más que las 4 semanas previas.` });
  }

  // 5) Variación desfavorable por estación (todas las conductas).
  const bE = contar(B, (r) => (valido(r.estacion) ? r.estacion : null)), aE = contar(Aa, (r) => (valido(r.estacion) ? r.estacion : null));
  const desf = [...bE].map(([estacion, b]) => ({ estacion, b, a: aE.get(estacion) ?? 0 }))
    .filter((x) => x.a > 0 && (variacion(x.a, x.b) ?? 0) >= U.estacionPct).sort((x, y) => (variacion(y.a, y.b) ?? 0) - (variacion(x.a, x.b) ?? 0));
  if (desf[0]) {
    const x = desf[0];
    alertas.push({ tipo: 'estacion', titulo: 'Variación desfavorable por estación', nivel: (variacion(x.a, x.b) ?? 0) >= 25 ? 'ALTA' : 'MEDIA', delito: 'Todos los delitos', estacion: x.estacion, casos: x.b, dif: x.b - x.a, variacion: variacion(x.a, x.b), periodo: comp,
      criterio: `Estación con variación ≥ ${U.estacionPct} % frente al periodo comparable.` });
  }

  // 6) Reducción sostenida: delito que baja ≥ X % y en sus 3 últimos meses completos.
  const mesCorte = corte.getMonth();
  const ultimoDiaMes = new Date(corte.getFullYear(), mesCorte + 1, 0).getDate();
  const ultimoCompleto = corte.getDate() === ultimoDiaMes ? mesCorte : mesCorte - 1;
  const meses = [ultimoCompleto - 2, ultimoCompleto - 1, ultimoCompleto].filter((m) => m >= 0);
  const reducciones = [...porDelitoLista].map(([delito, lista]) => {
    const listaA = Aa.filter((r) => r.delito === delito);
    const b = lista.length, a = listaA.length;
    const sostenida = meses.length === 3 && meses.every((m) => lista.filter((r) => r.mes === m + 1).length < listaA.filter((r) => r.mes === m + 1).length);
    return { delito, a, b, sostenida };
  }).filter((x) => x.sostenida && (variacion(x.a, x.b) ?? 0) <= -U.reduccionPct).sort((x, y) => (x.b - x.a) - (y.b - y.a));
  if (reducciones[0]) {
    const x = reducciones[0];
    alertas.push({ tipo: 'reduccion', titulo: 'Reducción sostenida', nivel: 'BAJA', delito: x.delito, estacion: 'MEPOY', casos: x.b, dif: x.b - x.a, variacion: variacion(x.a, x.b), periodo: comp,
      criterio: `Variación ≤ −${U.reduccionPct} % y menos casos que ${anioAnterior} en los 3 últimos meses completos.` });
  }

  // 7) Nuevo barrio en el Top N (año actual vs. periodo comparable).
  const kB = (r: CrimeRecord) => (valido(r.barrioHecho) ? r.barrioHecho.trim() : null);
  const topB = [...contar(B, kB)].sort((x, y) => y[1] - x[1]).slice(0, U.topBarrios);
  const topA = new Set([...contar(Aa, kB)].sort((x, y) => y[1] - x[1]).slice(0, U.topBarrios).map(([b]) => b));
  const nuevo = topB.find(([b]) => !topA.has(b));
  if (nuevo) {
    const lista = B.filter((r) => kB(r) === nuevo[0]);
    alertas.push({ tipo: 'barrioNuevo', titulo: 'Nuevo barrio en el Top', nivel: 'BAJA', delito: moda(lista, (r) => r.delito)?.valor ?? '', estacion: moda(lista, (r) => r.estacion)?.valor ?? '', lugar: nuevo[0], casos: nuevo[1],
      participacion: B.length ? (nuevo[1] / B.length) * 100 : 0, periodo: comp,
      criterio: `Entra al Top ${U.topBarrios} de barrios y no estaba en el Top ${U.topBarrios} comparable de ${anioAnterior}.` });
  }

  const orden: Record<NivelAlerta, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  return alertas.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
}

export interface Prioridad {
  delito: string; estacion: string; cai: string; barrio: string;
  dia: string; hora: string; modalidad: string; arma: string;
  casos: number; casosComparable: number; variacion: number | null; puntaje: number; justificacion: string;
}

/**
 * Priorización operacional (hallazgo estadístico, no orden operativa):
 * combinaciones delito × CAI del año actual; puntaje = casos × (1 + aumento %
 * acotado entre 0 y 100) / 100 → pesa el volumen y, en segundo lugar, el
 * crecimiento. Se toma la mejor combinación de cada delito (Top 3 delitos).
 */
export function calcularPrioridades({ Aa, B }: EntradaAnalisis, n = 3): Prioridad[] {
  const k = (r: CrimeRecord) => (valido(r.delito) && valido(r.cai) ? `${r.delito}|${r.cai}` : null);
  const bK = new Map<string, CrimeRecord[]>();
  for (const r of B) { const c = k(r); if (!c) continue; const l = bK.get(c); if (l) l.push(r); else bK.set(c, [r]); }
  const aK = contar(Aa, k);
  const candidatos = [...bK].map(([c, lista]) => {
    const [delito, cai] = c.split('|');
    const a = aK.get(c) ?? 0, b = lista.length, v = variacion(a, b);
    return { delito, cai, lista, a, b, v, puntaje: b * (1 + Math.min(100, Math.max(0, v ?? 0)) / 100) };
  }).filter((x) => x.b >= 10).sort((x, y) => y.puntaje - x.puntaje);
  const salida: Prioridad[] = [];
  const vistos = new Set<string>();
  for (const x of candidatos) {
    if (vistos.has(x.delito)) continue;
    vistos.add(x.delito);
    const celda = celdaCritica(x.lista);
    const barrio = moda(x.lista, (r) => r.barrioHecho);
    salida.push({
      delito: x.delito, cai: x.cai, estacion: moda(x.lista, (r) => r.estacion)?.valor ?? '', barrio: barrio?.valor ?? '',
      dia: celda ? nombreDia(celda.dia) : '', hora: celda ? horaTexto(celda.hora) : '',
      modalidad: moda(x.lista, (r) => r.modalidad)?.valor ?? '', arma: moda(x.lista, (r) => r.armas)?.valor ?? '',
      casos: x.b, casosComparable: x.a, variacion: x.v, puntaje: x.puntaje,
      justificacion: `${x.b} casos en ${x.cai}${x.v === null ? ' (sin casos comparables)' : `, ${x.v >= 0 ? '+' : ''}${x.v.toFixed(1).replace('.', ',')} % frente al periodo comparable`}${barrio ? `; barrio con más casos: ${barrio.valor} (${barrio.casos})` : ''}.`,
    });
    if (salida.length >= n) break;
  }
  return salida;
}
