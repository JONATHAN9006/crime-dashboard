import type { CrimeRecord } from '../types/crime';
import { formatNumero, formatDecimal } from '../utils/aggregations';
import { esValorPendiente } from '../utils/valoresPendientes';
import { contarPor, descomponerCambio, maximoDe, type DescomposicionCambio } from './cambio';

// "Lectura ejecutiva": frases armadas SOLO con cifras calculadas de los
// registros del periodo — ningún texto fijo que no dependa de los datos.
// Cada frase guarda las cifras que la sostienen (campo `base`), para poder
// rastrearla hasta los datos originales si un superior pregunta.

export interface FraseLectura {
  tema: 'total' | 'explicacion' | 'contrapeso' | 'territorio' | 'tiempo';
  texto: string;
  base: string; // de dónde sale la cifra, en palabras
}

const signo = (n: number) => (n > 0 ? `+${formatNumero(n)}` : formatNumero(n));
const pct = (n: number | null) => (n === null ? 'sin base de comparación' : `${n > 0 ? '+' : ''}${formatDecimal(n, 1)} %`);
const fecha = (d: Date) => d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
const real = (v: string) => !!v && !esValorPendiente(v) && !/^(NO REPORTAD|SIN |N\/?A$)/i.test(v.trim());

/** Franja de 3 horas que contiene la hora h (0-23): "18:00 a 20:59". */
export function franjaDeTresHoras(h: number): string {
  const ini = Math.floor(h / 3) * 3;
  return `${String(ini).padStart(2, '0')}:00 a ${String(ini + 2).padStart(2, '0')}:59`;
}

export function construirLecturaEjecutiva(p: {
  recsActual: CrimeRecord[];
  recsAnterior: CrimeRecord[];
  anioActual: number;
  anioAnterior: number;
  inicio: Date;
  fin: Date;
}): { frases: FraseLectura[]; cambio: DescomposicionCambio } {
  const cant = (r: CrimeRecord) => r.cantidad || 1;
  const cambio = descomponerCambio(contarPor(p.recsActual, (r) => r.delito, cant), contarPor(p.recsAnterior, (r) => r.delito, cant));
  const frases: FraseLectura[] = [];
  const periodo = `Del ${fecha(p.inicio)} al ${fecha(p.fin)} de ${p.anioActual}`;

  // 1. Total y variación.
  const { totalActual, totalAnterior, diferenciaTotal, variacionTotalPct } = cambio;
  const sentido = diferenciaTotal > 0 ? 'un aumento' : diferenciaTotal < 0 ? 'una reducción' : 'el mismo nivel';
  frases.push({
    tema: 'total',
    texto: diferenciaTotal === 0
      ? `${periodo}, la MEPOY registra ${formatNumero(totalActual)} casos, la misma cifra que en el mismo periodo de ${p.anioAnterior}.`
      : `${periodo}, la MEPOY registra ${formatNumero(totalActual)} casos: ${sentido} de ${formatNumero(Math.abs(diferenciaTotal))} (${pct(variacionTotalPct)}) frente a los ${formatNumero(totalAnterior)} del mismo periodo de ${p.anioAnterior}.`,
    base: `Suma de casos ${p.anioActual} y ${p.anioAnterior} en la misma ventana de fechas, con los filtros actuales.`,
  });

  // 2. Qué delito explica el cambio (mismo sentido del cambio total).
  if (diferenciaTotal !== 0) {
    const mismoSentido = cambio.filas.filter((f) => Math.sign(f.diferencia) === Math.sign(diferenciaTotal));
    const [primero, segundo] = mismoSentido;
    if (primero && primero.aportePct !== null) {
      let texto = `${diferenciaTotal > 0 ? 'El aumento' : 'La reducción'} lo explica principalmente ${primero.clave} (${signo(primero.diferencia)} casos, ${formatDecimal(primero.aportePct, 1)} % del cambio total)`;
      if (segundo && segundo.aportePct !== null) texto += `, seguido de ${segundo.clave} (${signo(segundo.diferencia)}, ${formatDecimal(segundo.aportePct, 1)} %)`;
      frases.push({ tema: 'explicacion', texto: `${texto}.`, base: 'Aporte al cambio = diferencia del delito ÷ diferencia total × 100.' });
    }
    // 3. Lo que fue en sentido contrario (lo compensa en parte).
    const contrario = cambio.filas.find((f) => Math.sign(f.diferencia) === -Math.sign(diferenciaTotal));
    if (contrario) {
      frases.push({
        tema: 'contrapeso',
        texto: `En sentido contrario, ${contrario.clave} ${contrario.diferencia < 0 ? 'bajó' : 'subió'} ${formatNumero(Math.abs(contrario.diferencia))} casos (${pct(contrario.variacionPct)}), lo que ${diferenciaTotal > 0 ? 'moderó el aumento' : 'moderó la reducción'}.`,
        base: 'Delito con mayor diferencia en sentido opuesto al total.',
      });
    }
  }

  // 4. Dónde: estación y zona de atención con más casos en el periodo actual.
  const est = maximoDe(contarPor(p.recsActual.filter((r) => real(r.estacion)), (r) => r.estacion, cant));
  const zona = maximoDe(contarPor(p.recsActual.filter((r) => real(r.cuadrante)), (r) => r.cuadrante, cant));
  if (est && totalActual > 0) {
    let texto = `La mayor concentración territorial está en ${est.clave} (${formatNumero(est.valor)} casos, ${formatDecimal((est.valor / totalActual) * 100, 1)} % del total)`;
    if (zona) texto += `; la zona de atención con más casos es ${zona.clave} (${formatNumero(zona.valor)})`;
    frases.push({ tema: 'territorio', texto: `${texto}.`, base: `Conteo por estación y por zona de atención en ${p.anioActual}; se omiten valores no reportados.` });
  }

  // 5. Cuándo: franja de 3 horas y día de la semana con más casos.
  const conHora = p.recsActual.filter((r) => r.hora !== null && r.hora !== undefined);
  const franja = maximoDe(contarPor(conHora, (r) => franjaDeTresHoras(r.hora as number), cant));
  const dia = maximoDe(contarPor(p.recsActual.filter((r) => real(r.diaSemana)), (r) => r.diaSemana, cant));
  const totalConHora = conHora.reduce((s, r) => s + cant(r), 0);
  if (franja && totalConHora > 0) {
    let texto = `La franja horaria de mayor ocurrencia es de ${franja.clave} (${formatDecimal((franja.valor / totalConHora) * 100, 1)} % de los casos con hora registrada)`;
    if (dia) texto += ` y el día con más casos es el ${dia.clave.toLowerCase()} (${formatNumero(dia.valor)})`;
    frases.push({ tema: 'tiempo', texto: `${texto}.`, base: `Franjas de 3 horas sobre ${formatNumero(totalConHora)} casos con hora; día de la semana del hecho.` });
  }

  return { frases, cambio };
}
