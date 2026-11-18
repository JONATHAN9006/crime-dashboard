// Textos del análisis ejecutivo de Microgerencia, armados SOLO con las
// cifras del nodo (ya calculadas en useMicrogerencia.ts). Los usan la lámina
// ejecutiva (InformeEjecutivoMicrogerencia.tsx) y el PDF, para que digan
// exactamente lo mismo.
import type { NodoMicrogerencia } from './microgerencia';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const num = (n: number) => Math.round(n).toLocaleString('es-CO');
const signo = (n: number) => (n > 0 ? '+' : '');
const pct0 = (p: number | null) => (p === null ? 'nuevo' : `${signo(p)}${Math.round(p)}%`);
const pct1 = (p: number | null) => (p === null ? 'N/A' : `${signo(p)}${p.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

export function fechaLargaIso(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES_LARGOS[m - 1]} de ${a}`;
}

export function hallazgosNodo(nodo: NodoMicrogerencia, anioActual: number, anioAnterior: number, fechaCorteIso: string): { titulo: string; texto: string }[] {
  const mesCorte = Number(fechaCorteIso.split('-')[1]) - 1;
  const rango = `ene – ${MESES_CORTOS[mesCorte].toLowerCase()}`;
  const lista: { titulo: string; texto: string }[] = [];
  const sentido = nodo.dif > 0 ? 'un incremento' : nodo.dif < 0 ? 'una reducción' : 'una variación';
  lista.push({
    titulo: 'Comportamiento general',
    texto: `En el periodo analizado (${rango} ${anioActual}) se registran ${num(nodo.fecha2026)} delitos, con ${sentido} de ${signo(nodo.dif)}${num(nodo.dif)} casos (${pct0(nodo.pct)}) frente a ${anioAnterior}.`,
  });
  const top = [...nodo.delitos].sort((a, b) => b.fecha2026 - a.fecha2026);
  if (top.length > 0) {
    const [d1, d2] = top;
    lista.push({
      titulo: 'Delitos de mayor participación',
      texto: `${d1.nombre} (${num(d1.fecha2026)}; ${pct0(d1.pct)})${d2 ? ` y ${d2.nombre} (${num(d2.fecha2026)}; ${pct0(d2.pct)}) concentran` : ' concentra'} la mayor variación absoluta.`,
    });
  }
  const proyDif = Math.round(nodo.difConAnioAnterior);
  const proyPct = nodo.total2025 > 0 ? (proyDif / nodo.total2025) * 100 : null;
  lista.push({
    titulo: 'Tendencia y proyección',
    texto: `De mantenerse la tendencia actual, se proyecta un total de ${num(nodo.terminaAnio)} delitos en ${anioActual}, lo que representa ${signo(proyDif)}${num(proyDif)} casos (${pct1(proyPct)}) frente al total de ${anioAnterior}.`,
  });
  return lista;
}

export function notaCalidadDato(anioActual: number, fechaCorteIso: string): string {
  const mesCorte = Number(fechaCorteIso.split('-')[1]) - 1;
  const sinCierre = MESES_LARGOS.slice(mesCorte + 1);
  if (sinCierre.length === 0) return `La información de ${anioActual} llega hasta el ${fechaLargaIso(fechaCorteIso)}; las cifras pueden variar por reportes pendientes o depuración.`;
  const meses = sinCierre.length === 1 ? sinCierre[0] : `${sinCierre.slice(0, -1).join(', ')} y ${sinCierre[sinCierre.length - 1]}`;
  return `Los valores en cero (0) de ${meses} de ${anioActual} pueden corresponder a información pendiente de reporte o no consolidada, y no deben interpretarse como una reducción confirmada del delito.`;
}
