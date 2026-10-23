import { useEffect, useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────
// TEMPORADAS ESPECIALES — configuración central.
//
// Cada temporada define un rango de fechas (mes/día, inclusivo) evaluado en
// la zona horaria indicada. Fuera del rango el dashboard se ve exactamente
// igual que siempre. No se guarda nada en el navegador: el estado se
// calcula con la fecha cada vez.
//
// Para revisar el diseño en otra fecha: ?tema=halloween (forzar) o
// ?tema=normal (apagar) en la dirección. Solo dura mientras esté en la URL.
// ──────────────────────────────────────────────────────────────────────────

export type TemporadaId = 'halloween';

export interface Temporada {
  id: TemporadaId;
  /** Primer día activo (inclusivo). */
  inicio: { mes: number; dia: number };
  /** Último día activo (inclusivo). Al día siguiente a las 00:00 vuelve a normal. */
  fin: { mes: number; dia: number };
  zona: string;
}

export const TEMPORADAS: Temporada[] = [
  { id: 'halloween', inicio: { mes: 10, dia: 1 }, fin: { mes: 10, dia: 31 }, zona: 'America/Bogota' },
];

/** Mes y día de una fecha en la zona horaria indicada. */
export function fechaEnZona(fecha: Date, zona: string): { mes: number; dia: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: zona, month: 'numeric', day: 'numeric' }).formatToParts(fecha);
  return {
    mes: Number(partes.find((p) => p.type === 'month')?.value),
    dia: Number(partes.find((p) => p.type === 'day')?.value),
  };
}

function enRango(t: Temporada, fecha: Date): boolean {
  const { mes, dia } = fechaEnZona(fecha, t.zona);
  const v = mes * 100 + dia;
  const a = t.inicio.mes * 100 + t.inicio.dia;
  const b = t.fin.mes * 100 + t.fin.dia;
  return a <= b ? v >= a && v <= b : v >= a || v <= b; // admite rangos que cruzan el año
}

function temporadaForzada(): TemporadaId | 'normal' | null {
  try {
    const t = new URLSearchParams(window.location.search).get('tema');
    if (t === 'normal') return 'normal';
    if (t && TEMPORADAS.some((x) => x.id === t)) return t as TemporadaId;
  } catch { /* sin ventana */ }
  return null;
}

/**
 * Temporada activa para una fecha (función pura respecto a la fecha: se
 * puede probar con cualquier día sin tocar el reloj del sistema).
 */
export function temporadaActiva(fecha: Date = new Date(), usarUrl = true): TemporadaId | null {
  if (usarUrl) {
    const f = temporadaForzada();
    if (f === 'normal') return null;
    if (f) return f;
  }
  return TEMPORADAS.find((t) => enRango(t, fecha))?.id ?? null;
}

/** Revisa cada minuto: si la pantalla queda abierta, el 1 de noviembre a las 00:00 vuelve a normal. */
export function useTemporada(): TemporadaId | null {
  const [activa, setActiva] = useState<TemporadaId | null>(() => temporadaActiva());
  useEffect(() => {
    const id = window.setInterval(() => setActiva(temporadaActiva()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  return activa;
}
