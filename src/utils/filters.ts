import type { CrimeRecord, FilterState, PeriodoAnalisis } from '../types/crime';

function matchMulti(value: string, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(value);
}

// "new Date('2026-01-15')" (una fecha-solo-día en formato ISO, que es
// justo lo que entrega un <input type="date">) se interpreta como
// MEDIANOCHE EN UTC, no en la zona horaria local — un comportamiento del
// propio lenguaje, no un descuido de este archivo. En Colombia (UTC-5) eso
// equivale a las 7:00 PM del día ANTERIOR en hora local. Como
// "r.fecha" (ver csvParser.ts) sí se construye en hora LOCAL
// (new Date(año, mes, día)), comparar una contra la otra sin corregir este
// desfase de zona horaria producía resultados incorrectos — el caso más
// grave: al fijar "Fecha final", ese día seleccionado terminaba
// excluyéndose por completo (el "+23:59:59" se aplicaba sobre el día
// anterior, no sobre el día que realmente se eligió). Esta función
// convierte el string a una fecha en hora LOCAL, igual que "r.fecha", para
// que la comparación sea consistente sin importar la zona horaria del
// navegador.
export function parsearFechaLocal(iso: string): Date | null {
  const partes = iso.split('-').map(Number);
  if (partes.length !== 3 || partes.some((p) => Number.isNaN(p))) return null;
  const [anio, mes, dia] = partes;
  return new Date(anio, mes - 1, dia);
}

export function aplicarFiltros(records: CrimeRecord[], f: FilterState): CrimeRecord[] {
  const fechaIni = f.fechaInicial ? parsearFechaLocal(f.fechaInicial) : null;
  const fechaFin = f.fechaFinal ? parsearFechaLocal(f.fechaFinal) : null;
  if (fechaFin) fechaFin.setHours(23, 59, 59, 999);

  return records.filter((r) => {
    if (!matchMulti(r.estacion, f.estacion)) return false;
    if (!matchMulti(r.cai, f.cai)) return false;
    if (!matchMulti(r.cuadrante, f.cuadrante)) return false;
    if (!matchMulti(r.barrioHecho, f.barrioHecho)) return false;
    if (!matchMulti(r.delito, f.delito)) return false;
    if (!matchMulti(r.zona, f.zona)) return false;
    if (!matchMulti(r.genero, f.genero)) return false;
    if (!matchMulti(r.armas, f.armas)) return false;
    if (!matchMulti(r.modalidad, f.modalidad)) return false;
    if (!matchMulti(r.claseSitio, f.claseSitio)) return false;
    if (!matchMulti(r.causaLesion, f.causaLesion)) return false;
    if (!matchMulti(r.grupoEdad, f.grupoEdad)) return false;
    if (!matchMulti(r.franjaHoraria, f.franjaHoraria)) return false;
    if (!matchMulti(r.turno, f.turno)) return false;
    if (!matchMulti(r.diaSemana, f.diaSemana)) return false;
    if (f.horaExacta.length > 0 && !f.horaExacta.includes(String(r.hora))) return false;
    if (f.anio.length > 0 && !f.anio.includes(String(r.anio))) return false;
    if (f.mes.length > 0 && !f.mes.includes(String(r.mes))) return false;
    if (fechaIni && (!r.fecha || r.fecha < fechaIni)) return false;
    if (fechaFin && (!r.fecha || r.fecha > fechaFin)) return false;
    return true;
  });
}

export function contarFiltrosActivos(f: FilterState): number {
  let n = 0;
  for (const key of Object.keys(f) as (keyof FilterState)[]) {
    const v = f[key];
    if (Array.isArray(v)) n += v.length > 0 ? 1 : 0;
    else if (v) n += 1;
  }
  return n;
}

// Combina un registro con su hora exacta en una sola Fecha, para poder
// compararlo contra el rango horaInicial-horaFinal de un periodo. Usa la
// hora ya calculada del registro (r.hora, 0-23); si no existe, se asume
// 00:00 (el registro solo se descarta por fecha, nunca por hora faltante).
function fechaHoraDeRegistro(r: CrimeRecord): Date | null {
  if (!r.fecha) return null;
  const d = new Date(r.fecha);
  d.setHours(r.hora ?? 0, 0, 0, 0);
  return d;
}

function limiteDePeriodo(fecha: string, hora: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [h, m] = hora.split(':').map(Number);
  return new Date(anio, mes - 1, dia, h, m, 0, 0);
}

// Aplica los filtros normales (delito, estación, CAI, etc. — TODO menos la
// fecha) y, si hay periodos de análisis activos, exige además que la
// fecha+hora del registro caiga dentro de AL MENOS UNO de esos periodos
// (unión, nunca suma) — un registro que calce con dos periodos a la vez
// solo se cuenta una vez, porque es un filtro (sí/no), no una suma por
// periodo. Cuando no hay periodos activos, el comportamiento es IDÉNTICO
// al de aplicarFiltros con fechaInicial/fechaFinal de siempre — el modo de
// una sola fecha no cambia en nada.
export function aplicarFiltrosConPeriodos(records: CrimeRecord[], f: FilterState, periodos: PeriodoAnalisis[]): CrimeRecord[] {
  if (periodos.length === 0) return aplicarFiltros(records, f);

  const sinFecha = aplicarFiltros(records, { ...f, fechaInicial: null, fechaFinal: null });
  const ventanas = periodos.map((p) => ({
    inicio: limiteDePeriodo(p.fechaInicial, p.horaInicial || '00:00'),
    fin: limiteDePeriodo(p.fechaFinal, p.horaFinal || '23:59'),
  }));
  return sinFecha.filter((r) => {
    const fh = fechaHoraDeRegistro(r);
    if (!fh) return false;
    return ventanas.some((v) => fh >= v.inicio && fh <= v.fin);
  });
}
