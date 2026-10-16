// MOTOR DE ANÁLISIS ESTRUCTURADO del Analista IA — sin modelo de lenguaje.
//
// Cada análisis se arma SOLO con cifras que ya vienen calculadas en
// ContextoAgenteIA (hooks/useAgenteIA.ts, que reutiliza los mismos hooks del
// dashboard). Aquí no se filtra ni se cuentan registros: solo se ordena,
// se compara y se redacta. Si un dato no está, se dice («Limitaciones»), no
// se estima. Funciona aunque el servicio de IA no esté configurado.
import type { ContextoAgenteIA } from '../types/agenteIA';
import type { FilaComparativaCategoria } from '../hooks/useComparativoHomologo';
import { formatDecimal, formatNumero } from '../utils/aggregations';
import { ejecutarHerramientaSobreContexto } from './agenteIATools';

export type TipoAnalisis =
  | 'comportamiento' | 'comparar' | 'temporal' | 'territorial' | 'modalidades'
  | 'operatividad' | 'preventivas' | 'ejecutivo' | 'recientes';

export type Tono = 'alza' | 'baja' | 'neutro' | 'info';

export interface Indicador { etiqueta: string; valor: string; detalle?: string; tono: Tono }
export interface ItemSeccion { texto: string; valor?: string; tono?: Tono }
export interface Seccion { titulo: string; icono: 'tiempo' | 'territorio' | 'lista' | 'operativo' | 'contexto'; items: ItemSeccion[] }

export interface AnalisisEstructurado {
  tipo: TipoAnalisis;
  titulo: string;
  hallazgo: { antes: string; destacado?: string; despues?: string; detalle: string; tono: Tono };
  indicadores: Indicador[];
  secciones: Seccion[];
  interpretacion: string | null;
  evidencia: string[];
  recomendaciones: string[];
  limitaciones: string[];
  // Pregunta lista para profundizar con el chat de IA (usa los filtros actuales).
  preguntaIA: string;
}

export const ACCESOS_ANALISIS: { tipo: TipoAnalisis; etiqueta: string; descripcion: string }[] = [
  { tipo: 'comportamiento', etiqueta: 'Comportamiento delictivo', descripcion: 'Casos, variación y dónde y cuándo se concentran' },
  { tipo: 'comparar', etiqueta: 'Comparar vigencias', descripcion: 'Mismo periodo del año anterior' },
  { tipo: 'temporal', etiqueta: 'Días y horas críticas', descripcion: 'Días, franjas y meses' },
  { tipo: 'territorial', etiqueta: 'Focalización territorial', descripcion: 'Estaciones, zonas, barrios y CAI' },
  { tipo: 'modalidades', etiqueta: 'Modalidades y circunstancias', descripcion: 'Modalidad, arma y clase de sitio' },
  { tipo: 'operatividad', etiqueta: 'Delitos y operatividad', descripcion: 'Resultados operativos del mismo periodo' },
  { tipo: 'preventivas', etiqueta: 'Acciones preventivas', descripcion: 'Planes según zona y horario' },
  { tipo: 'recientes', etiqueta: 'Cambios recientes', descripcion: 'Últimas 4 semanas' },
  { tipo: 'ejecutivo', etiqueta: 'Informe ejecutivo', descripcion: 'Informe completo para el mando' },
];

// ── utilidades ───────────────────────────────────────────────────────────
const n = formatNumero;
const pct = (v: number) => `${formatDecimal(v, 1)} %`;
const signo = (v: number) => (v > 0 ? `+${n(v)}` : n(v));
const tonoVar = (dif: number): Tono => (dif > 0 ? 'alza' : dif < 0 ? 'baja' : 'neutro');
const etiquetaHora = (h: string) => `${h.padStart(2, '0')}:00 – ${h.padStart(2, '0')}:59`;
const minus = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function etiquetaDelito(c: ContextoAgenteIA): string {
  if (c.metadatos.delitoUnicoSeleccionado) return c.metadatos.delitoUnicoSeleccionado;
  if (c.metadatos.cantidadDelitosSeleccionados > 0) return `${c.metadatos.cantidadDelitosSeleccionados} delitos seleccionados`;
  return 'Todos los delitos';
}

function textoVariacion(actual: number, anterior: number): string {
  if (anterior === 0) return actual === 0 ? 'sin casos en ninguno de los dos periodos' : 'sin casos en el periodo comparado (variación no calculable)';
  const v = ((actual - anterior) / anterior) * 100;
  return `${v > 0 ? '+' : ''}${formatDecimal(v, 1)} %`;
}

function varPct(f: { actual: number; anterior: number }): string {
  return f.anterior === 0 ? (f.actual > 0 ? 'sin casos antes' : '—') : textoVariacion(f.actual, f.anterior);
}

function filaComparada(f: FilaComparativaCategoria): ItemSeccion {
  return { texto: f.key, valor: `${n(f.actual)} (${signo(f.diferencia)}; ${varPct(f)})`, tono: tonoVar(f.diferencia) };
}

function periodoTexto(c: ContextoAgenteIA) {
  return `${c.periodoActual.inicio} a ${c.periodoActual.fin}`;
}

function filtrosTexto(c: ContextoAgenteIA): string {
  const f = c.filtros;
  const partes = [
    f.estacion.length ? `estación ${f.estacion.join(', ')}` : '',
    f.cuadrante.length ? `zona ${f.cuadrante.join(', ')}` : '',
    f.barrioHecho.length ? `barrio ${f.barrioHecho.join(', ')}` : '',
    f.cai.length ? `${f.cai.join(', ')}` : '',
    f.cantidadFiltrosAdicionalesActivos ? `${f.cantidadFiltrosAdicionalesActivos} filtro(s) adicional(es)` : '',
  ].filter(Boolean);
  return partes.length ? ` (${partes.join('; ')})` : '';
}

// Limitaciones comunes: periodo, base comparativa, calidad de los datos.
function limitacionesBase(c: ContextoAgenteIA, incluirHora = true, incluirTerritorio = true): string[] {
  const l: string[] = [];
  const { indicadores: i, calidadDatos: q } = c;
  if (c.periodoEnCurso) l.push(`La vigencia ${c.periodoActual.vigencia} está en curso (corte ${c.corteInformacion}): se compara con el mismo periodo de ${c.periodoComparativo.vigencia} (${c.periodoComparativo.inicio} a ${c.periodoComparativo.fin}), no con el año completo.`);
  if (i.totalCasosAnterior === 0) l.push(`No hay casos en el periodo comparado de ${c.periodoComparativo.vigencia}: la variación porcentual no se puede calcular.`);
  if (i.totalCasosActual > 0 && i.totalCasosActual < 30) l.push(`Con pocos casos (${n(i.totalCasosActual)}), un solo hecho cambia mucho los porcentajes; interpretar con cautela.`);
  if (q.registrosActual > 0) {
    if (incluirHora && q.sinHora / q.registrosActual > 0.05) l.push(`${pct((q.sinHora / q.registrosActual) * 100)} de los registros no tiene hora; el análisis horario se basa en ${n(c.resumenTemporal.casosConHora)} casos.`);
    if (incluirTerritorio && q.sinBarrio / q.registrosActual > 0.05) l.push(`${pct((q.sinBarrio / q.registrosActual) * 100)} de los registros no tiene barrio identificado.`);
    if (incluirTerritorio && q.sinZona / q.registrosActual > 0.05) l.push(`${pct((q.sinZona / q.registrosActual) * 100)} de los registros no tiene zona de atención asignada.`);
  }
  return l;
}

// Reutiliza la herramienta «sugerirAccionesPreventivas» (catálogo fijo de planes).
interface Preventivo { delito: string; planesRecomendados: string[]; zonaPrioritaria: { barrio: string | null; cuadrante: string | null }; diaPrioritario: { dia: string; casos: number } | null; franjaHorariaPreventiva: string | null }
function preventivo(c: ContextoAgenteIA): Preventivo | null {
  const delito = c.metadatos.delitoUnicoSeleccionado ?? c.resumenCategorias.delitos[0]?.key;
  if (!delito) return null;
  const r = ejecutarHerramientaSobreContexto('sugerirAccionesPreventivas', { delito }, c) as Preventivo & { error?: string };
  return r.error ? null : r;
}

function recomendaciones(c: ContextoAgenteIA): string[] {
  const p = preventivo(c);
  if (!p) return [];
  const lugar = [p.zonaPrioritaria.cuadrante, p.zonaPrioritaria.barrio ? `barrio ${p.zonaPrioritaria.barrio}` : null].filter(Boolean).join(' / ');
  const cuando = [p.diaPrioritario ? `los ${p.diaPrioritario.dia.toLowerCase()}` : null, p.franjaHorariaPreventiva ? `entre ${p.franjaHorariaPreventiva}` : null].filter(Boolean).join(', ');
  const r: string[] = [];
  if (lugar || cuando) r.push(`Priorizar ${lugar || 'los sectores de mayor concentración'}${cuando ? `, ${cuando}` : ''}, donde se concentra la mayor cantidad de casos de ${p.delito}.`);
  p.planesRecomendados.forEach((pl) => r.push(`Se sugiere ${pl}.`));
  r.push('Hacer seguimiento semanal del comportamiento para verificar si las acciones coinciden con una reducción de casos.');
  return r;
}

// ── análisis base (comportamiento) ───────────────────────────────────────
function comportamiento(c: ContextoAgenteIA): AnalisisEstructurado {
  const i = c.indicadores;
  const delito = etiquetaDelito(c);
  const dif = i.diferencia;
  const dia = c.resumenTemporal.diaMasCritico;
  const franja = c.resumenTemporal.franjasCriticas[0];
  const zona = c.resumenTerritorial.cuadrantesCriticos[0];
  const barrio = c.resumenTerritorial.barriosCriticos[0];
  const mesTop = [...c.resumenTemporal.porMes].filter((m) => (m.actual ?? 0) > 0).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0))[0];
  const cambio = i.totalCasosAnterior === 0 ? 'sin base de comparación' : dif > 0 ? `aumento del ${formatDecimal(Math.abs(i.variacionPct ?? 0), 1)} %` : dif < 0 ? `reducción del ${formatDecimal(Math.abs(i.variacionPct ?? 0), 1)} %` : 'sin variación';
  const indicadores: Indicador[] = [
    { etiqueta: `Casos ${c.periodoActual.vigencia}`, valor: n(i.totalCasosActual), detalle: periodoTexto(c), tono: 'info' },
    { etiqueta: `Casos ${c.periodoComparativo.vigencia}`, valor: n(i.totalCasosAnterior), detalle: 'Mismo periodo', tono: 'neutro' },
    { etiqueta: 'Variación', valor: i.variacionPct === null ? 'N/A' : `${i.variacionPct > 0 ? '+' : ''}${formatDecimal(i.variacionPct, 1)} %`, detalle: `${signo(dif)} casos`, tono: tonoVar(dif) },
  ];
  if (franja) indicadores.push({ etiqueta: 'Franja crítica', valor: franja.franja, detalle: `${n(franja.casos)} casos · ${pct(franja.participacion)}`, tono: 'info' });
  if (zona || barrio) indicadores.push({ etiqueta: 'Zona prioritaria', valor: (zona ?? barrio)!.key, detalle: `${n((zona ?? barrio)!.casos)} casos · ${pct((zona ?? barrio)!.participacion)}`, tono: 'info' });
  const temporal: ItemSeccion[] = [];
  if (dia) temporal.push({ texto: `Día con más casos: ${dia.key.toLowerCase()}`, valor: `${n(dia.casos)} casos` });
  if (franja) temporal.push({ texto: `Franja de 3 horas con más casos: ${franja.franja}`, valor: `${pct(franja.participacion)} de los casos con hora` });
  if (mesTop) temporal.push({ texto: `Mes con más casos en ${c.periodoActual.vigencia}: ${mesTop.mes.toLowerCase()}`, valor: `${n(mesTop.actual ?? 0)} casos` });
  const territorial: ItemSeccion[] = [];
  if (zona) territorial.push({ texto: `Zona de atención: ${zona.key}`, valor: `${n(zona.casos)} · ${pct(zona.participacion)}` });
  if (barrio) territorial.push({ texto: `Barrio: ${barrio.key}`, valor: `${n(barrio.casos)} · ${pct(barrio.participacion)}` });
  const est = c.resumenCategorias.estaciones[0];
  if (est) territorial.push({ texto: `Estación: ${est.key}`, valor: `${n(est.actual)} (${signo(est.diferencia)})`, tono: tonoVar(est.diferencia) });
  const evidencia: string[] = [];
  evidencia.push(`${n(i.totalCasosActual)} casos entre ${periodoTexto(c)} frente a ${n(i.totalCasosAnterior)} en el mismo periodo de ${c.periodoComparativo.vigencia} (${signo(dif)}).`);
  if (franja) evidencia.push(`La franja ${franja.franja} concentra ${pct(franja.participacion)} de los casos con hora registrada.`);
  if (barrio) evidencia.push(`El barrio ${barrio.key} registra ${n(barrio.casos)} casos (${pct(barrio.participacion)} del total).`);
  const interp = i.totalCasosAnterior === 0
    ? `No es posible medir la variación porque no hubo casos en el periodo comparado.`
    : `${i.diferencia === 0 ? 'No se observa variación' : `Se observa un ${cambio}`} en ${delito === 'Todos los delitos' ? 'el total de delitos' : delito} frente al mismo periodo de ${c.periodoComparativo.vigencia}.${franja ? ` Los casos se concentran en la franja ${franja.franja}` : ''}${zona ? `${franja ? ' y' : ' Los casos se concentran'} en ${zona.key}` : ''}${franja || zona ? ', lo que orienta dónde y cuándo focalizar el servicio.' : ''} Estas cifras describen el comportamiento registrado; no explican por sí solas sus causas.`;
  return {
    tipo: 'comportamiento',
    titulo: 'Comportamiento delictivo',
    hallazgo: {
      antes: `${delito}${filtrosTexto(c)}: `,
      destacado: cambio,
      despues: ` frente al mismo periodo de ${c.periodoComparativo.vigencia}.`,
      detalle: `${n(i.totalCasosActual)} casos entre ${periodoTexto(c)}, frente a ${n(i.totalCasosAnterior)} en ${c.periodoComparativo.inicio} a ${c.periodoComparativo.fin}.`,
      tono: tonoVar(dif),
    },
    indicadores,
    secciones: [
      ...(temporal.length ? [{ titulo: 'Comportamiento temporal', icono: 'tiempo' as const, items: temporal }] : []),
      ...(territorial.length ? [{ titulo: 'Focalización territorial', icono: 'territorio' as const, items: territorial }] : []),
    ],
    interpretacion: interp,
    evidencia,
    recomendaciones: recomendaciones(c),
    limitaciones: limitacionesBase(c),
    preguntaIA: `Analiza el comportamiento de ${delito}${filtrosTexto(c)} entre ${periodoTexto(c)} frente al mismo periodo de ${c.periodoComparativo.vigencia}: hallazgo principal, indicadores, comportamiento temporal y territorial, interpretación, recomendaciones y limitaciones.`,
  };
}

function comparar(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const delitos = c.resumenCategorias.delitos;
  const unico = !!c.metadatos.delitoUnicoSeleccionado;
  const sube = delitos.filter((d) => d.diferencia > 0).sort((a, b) => b.diferencia - a.diferencia).slice(0, 5);
  const baja = delitos.filter((d) => d.diferencia < 0).sort((a, b) => a.diferencia - b.diferencia).slice(0, 5);
  const meses = c.resumenTemporal.porMes.filter((m) => m.actual !== null || m.anterior !== null)
    .map((m) => ({ mes: m.mes, actual: m.actual ?? 0, anterior: m.anterior ?? 0 }));
  const mesSube = [...meses].sort((a, b) => (b.actual - b.anterior) - (a.actual - a.anterior))[0];
  const mesBaja = [...meses].sort((a, b) => (a.actual - a.anterior) - (b.actual - b.anterior))[0];
  const secciones: Seccion[] = [];
  if (!unico && sube.length) secciones.push({ titulo: 'Delitos con mayor incremento', icono: 'lista', items: sube.map(filaComparada) });
  if (!unico && baja.length) secciones.push({ titulo: 'Delitos con mayor reducción', icono: 'lista', items: baja.map(filaComparada) });
  if (c.resumenCategorias.estaciones.length) secciones.push({ titulo: 'Por estación', icono: 'territorio', items: c.resumenCategorias.estaciones.slice(0, 6).map(filaComparada) });
  const itemsMes: ItemSeccion[] = [];
  if (mesSube && mesSube.actual - mesSube.anterior > 0) itemsMes.push({ texto: `Mayor aumento mensual: ${mesSube.mes.toLowerCase()}`, valor: `${n(mesSube.anterior)} → ${n(mesSube.actual)}`, tono: 'alza' });
  if (mesBaja && mesBaja.actual - mesBaja.anterior < 0) itemsMes.push({ texto: `Mayor reducción mensual: ${mesBaja.mes.toLowerCase()}`, valor: `${n(mesBaja.anterior)} → ${n(mesBaja.actual)}`, tono: 'baja' });
  if (itemsMes.length) secciones.push({ titulo: 'Meses', icono: 'tiempo', items: itemsMes });
  const evidencia = [...base.evidencia.slice(0, 1)];
  if (!unico && sube[0]) evidencia.push(`El mayor incremento lo registra ${sube[0].key}: ${n(sube[0].anterior)} → ${n(sube[0].actual)} (${signo(sube[0].diferencia)}).`);
  if (!unico && baja[0]) evidencia.push(`La mayor reducción la registra ${baja[0].key}: ${n(baja[0].anterior)} → ${n(baja[0].actual)} (${signo(baja[0].diferencia)}).`);
  return {
    ...base,
    tipo: 'comparar',
    titulo: `Comparación ${c.periodoActual.vigencia} vs ${c.periodoComparativo.vigencia}`,
    secciones,
    evidencia,
    interpretacion: `La comparación usa periodos equivalentes: ${periodoTexto(c)} frente a ${c.periodoComparativo.inicio} a ${c.periodoComparativo.fin}.${!unico && sube[0] ? ` El cambio general está influido principalmente por ${sube[0].key}${baja[0] ? `, mientras ${baja[0].key} compensa en parte con su reducción` : ''}.` : ''}`,
    recomendaciones: unico || !sube[0] ? base.recomendaciones : [`Revisar en detalle ${sube.slice(0, 3).map((s) => s.key).join(', ')}, que explican la mayor parte del aumento.`, ...base.recomendaciones.slice(0, 2)],
    preguntaIA: `Compara ${etiquetaDelito(c)}${filtrosTexto(c)} entre ${periodoTexto(c)} y el mismo periodo de ${c.periodoComparativo.vigencia}: qué delitos, estaciones y meses explican el cambio.`,
  };
}

function temporal(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const dias = [...c.resumenTemporal.porDiaSemana].sort((a, b) => b.casos - a.casos);
  const franjas = c.resumenTemporal.franjasCriticas.slice(0, 4);
  const horas = [...c.resumenTemporal.porHora].sort((a, b) => b.casos - a.casos).filter((h) => h.casos > 0).slice(0, 3);
  const meses = c.resumenTemporal.porMes.filter((m) => (m.actual ?? 0) > 0).sort((a, b) => (b.actual ?? 0) - (a.actual ?? 0)).slice(0, 3);
  const secciones: Seccion[] = [
    { titulo: 'Días de la semana', icono: 'tiempo', items: dias.map((d) => ({ texto: d.key, valor: `${n(d.casos)} · ${pct(d.participacion)}` })) },
  ];
  if (franjas.length) secciones.push({ titulo: 'Franjas de 3 horas', icono: 'tiempo', items: franjas.map((f) => ({ texto: f.franja, valor: `${n(f.casos)} · ${pct(f.participacion)}` })) });
  if (horas.length) secciones.push({ titulo: 'Horas con más casos', icono: 'tiempo', items: horas.map((h) => ({ texto: etiquetaHora(h.hora), valor: `${n(h.casos)} casos` })) });
  if (meses.length) secciones.push({ titulo: `Meses con más casos (${c.periodoActual.vigencia})`, icono: 'tiempo', items: meses.map((m) => ({ texto: m.mes, valor: `${n(m.actual ?? 0)} casos` })) });
  const top2 = dias.slice(0, 2);
  const partFinde = c.resumenTemporal.porDiaSemana.filter((d) => /s[aá]bado|domingo/i.test(d.key)).reduce((a, d) => a + d.participacion, 0);
  return {
    ...base,
    tipo: 'temporal',
    titulo: 'Días y horas críticas',
    hallazgo: franjas[0]
      ? { antes: 'La mayor concentración se presenta en la franja ', destacado: franjas[0].franja, despues: top2[0] ? ` y los ${top2[0].key.toLowerCase()}.` : '.', detalle: `${pct(franjas[0].participacion)} de los casos con hora registrada ocurre en esa franja.`, tono: 'info' }
      : { antes: 'No hay información horaria suficiente para identificar franjas críticas.', detalle: '', tono: 'neutro' },
    secciones,
    evidencia: [
      ...(top2.length ? [`Los días con más casos son ${top2.map((d) => `${d.key.toLowerCase()} (${n(d.casos)})`).join(' y ')}.`] : []),
      ...(franjas[0] ? [`La franja ${franjas[0].franja} reúne ${n(franjas[0].casos)} casos.`] : []),
      `Sábado y domingo suman ${pct(partFinde)} de los casos.`,
    ],
    interpretacion: franjas[0] ? `La distribución horaria y semanal indica en qué momentos coincide el mayor número de hechos registrados; es la base para programar turnos y presencia preventiva en esos horarios.` : null,
    limitaciones: limitacionesBase(c, true, false),
    preguntaIA: `¿En qué días, franjas horarias y meses se concentra ${etiquetaDelito(c)}${filtrosTexto(c)} entre ${periodoTexto(c)}?`,
  };
}

function territorial(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const zonas = c.resumenTerritorial.cuadrantesCriticos;
  const barrios = c.resumenTerritorial.barriosCriticos;
  const secciones: Seccion[] = [];
  if (c.resumenCategorias.estaciones.length) secciones.push({ titulo: 'Estaciones', icono: 'territorio', items: c.resumenCategorias.estaciones.slice(0, 6).map(filaComparada) });
  if (zonas.length) secciones.push({ titulo: 'Zonas de atención', icono: 'territorio', items: zonas.map((z) => ({ texto: z.key, valor: `${n(z.casos)} · ${pct(z.participacion)}` })) });
  if (barrios.length) secciones.push({ titulo: 'Barrios', icono: 'territorio', items: barrios.map((b) => ({ texto: b.key, valor: `${n(b.casos)} · ${pct(b.participacion)}` })) });
  const cais = c.resumenCategorias.cais.filter((x) => x.key && x.key !== 'NO REPORTADO').slice(0, 5);
  if (cais.length) secciones.push({ titulo: 'CAI', icono: 'territorio', items: cais.map(filaComparada) });
  const top3 = barrios.slice(0, 3).reduce((a, b) => a + b.participacion, 0);
  return {
    ...base,
    tipo: 'territorial',
    titulo: 'Focalización territorial',
    hallazgo: zonas[0] || barrios[0]
      ? { antes: 'La mayor concentración territorial está en ', destacado: (zonas[0] ?? barrios[0]).key, despues: barrios[0] && zonas[0] ? `, con el barrio ${barrios[0].key} como el más afectado.` : '.', detalle: `${n((zonas[0] ?? barrios[0]).casos)} casos (${pct((zonas[0] ?? barrios[0]).participacion)} del total).`, tono: 'info' }
      : { antes: 'No hay información territorial suficiente para identificar sectores críticos.', detalle: '', tono: 'neutro' },
    secciones,
    evidencia: [
      ...(zonas[0] ? [`${zonas[0].key} concentra ${pct(zonas[0].participacion)} de los casos.`] : []),
      ...(barrios.length >= 3 ? [`Los 3 barrios más afectados suman ${pct(top3)} de los casos.`] : []),
    ],
    interpretacion: barrios.length >= 3 ? `${top3 >= 30 ? 'Una parte importante' : 'Una parte'} de los casos se concentra en pocos barrios, lo que permite focalizar la presencia policial sin dispersar recursos.` : null,
    limitaciones: limitacionesBase(c, false, true),
    preguntaIA: `¿Dónde se concentra ${etiquetaDelito(c)}${filtrosTexto(c)} entre ${periodoTexto(c)} (estaciones, zonas de atención, barrios y CAI)?`,
  };
}

function modalidades(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const limpia = (f: FilaComparativaCategoria[]) => f.filter((x) => x.key && !/^(NO REPORTAD|SIN DATO|NO APLICA)/i.test(x.key)).slice(0, 5);
  const mods = limpia(c.resumenCategorias.modalidades);
  const armas = limpia(c.resumenCategorias.armas);
  const sitios = limpia(c.resumenCategorias.clasesSitio);
  const secciones: Seccion[] = [];
  if (mods.length) secciones.push({ titulo: 'Modalidades', icono: 'lista', items: mods.map(filaComparada) });
  if (armas.length) secciones.push({ titulo: 'Armas o medios empleados', icono: 'lista', items: armas.map(filaComparada) });
  if (sitios.length) secciones.push({ titulo: 'Clase de sitio', icono: 'lista', items: sitios.map(filaComparada) });
  const lim = limitacionesBase(c, false, false);
  if (!mods.length && !armas.length && !sitios.length) lim.push('Los registros filtrados no traen modalidad, arma ni clase de sitio diligenciadas.');
  const top = mods[0] ?? armas[0];
  return {
    ...base,
    tipo: 'modalidades',
    titulo: 'Modalidades y circunstancias',
    hallazgo: top
      ? { antes: 'La modalidad más frecuente es ', destacado: mods[0]?.key ?? '—', despues: armas[0] ? `, y el medio más empleado es ${armas[0].key}.` : '.', detalle: mods[0] ? `${n(mods[0].actual)} casos (${signo(mods[0].diferencia)} frente a ${c.periodoComparativo.vigencia}).` : '', tono: 'info' }
      : { antes: 'No hay información suficiente de modalidades o circunstancias.', detalle: '', tono: 'neutro' },
    secciones,
    evidencia: [
      ...(mods[0] ? [`${mods[0].key}: ${n(mods[0].actual)} casos (${pct(mods[0].aportePct)} del total).`] : []),
      ...(armas[0] ? [`${armas[0].key}: ${n(armas[0].actual)} casos.`] : []),
      ...(sitios[0] ? [`El sitio más frecuente es ${sitios[0].key} (${n(sitios[0].actual)}).`] : []),
    ],
    interpretacion: top ? 'Conocer la forma de comisión más frecuente permite ajustar los planes de registro y control (personas, vehículos o sitios) al tipo de hecho que más se repite.' : null,
    limitaciones: lim,
    preguntaIA: `¿Qué modalidades, armas y clases de sitio predominan en ${etiquetaDelito(c)}${filtrosTexto(c)} entre ${periodoTexto(c)} y cómo cambiaron frente a ${c.periodoComparativo.vigencia}?`,
  };
}

function operatividad(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const op = c.operatividad;
  const lim: string[] = ['La operatividad y los delitos se registran en bases distintas: que ocurran en el mismo periodo no demuestra que una explique a la otra.'];
  if (!op.disponible || op.grupos.length === 0) {
    lim.push('No hay registros de operatividad cargados para este periodo y filtros.');
    return { ...base, tipo: 'operatividad', titulo: 'Delitos y operatividad', hallazgo: { antes: 'No hay información de operatividad para comparar con los delitos.', detalle: 'Cargue la matriz de operatividad para habilitar este análisis.', tono: 'neutro' }, indicadores: base.indicadores.slice(0, 3), secciones: [], evidencia: [], interpretacion: null, recomendaciones: [], limitaciones: lim, preguntaIA: base.preguntaIA };
  }
  const fmtU = (v: number, u: 'casos' | 'kg') => (u === 'kg' ? `${formatDecimal(v, 1)} kg` : n(v));
  const cap = op.grupos.find((g) => /captur/i.test(g.titulo));
  const indicadores: Indicador[] = [base.indicadores[0], base.indicadores[2]];
  op.grupos.slice(0, 3).forEach((g) => indicadores.push({ etiqueta: g.titulo, valor: fmtU(g.actual, g.unidad), detalle: `${g.actual - g.anterior >= 0 ? '+' : ''}${fmtU(g.actual - g.anterior, g.unidad)} vs ${op.periodoComparativo?.vigencia ?? ''}`, tono: g.actual > g.anterior ? 'baja' : g.actual < g.anterior ? 'alza' : 'neutro' }));
  const secciones: Seccion[] = op.grupos.map((g) => ({
    titulo: `${g.titulo}${g.unidad === 'kg' ? ' (kg)' : ''}`,
    icono: 'operativo' as const,
    items: g.filas.map((f) => ({ texto: f.etiqueta, valor: `${fmtU(f.anterior, g.unidad)} → ${fmtU(f.actual, g.unidad)}`, tono: f.actual > f.anterior ? 'baja' as Tono : f.actual < f.anterior ? 'alza' as Tono : 'neutro' as Tono })),
  }));
  if (op.periodoActual && op.periodoActual.fin !== c.periodoActual.fin) lim.push(`La operatividad tiene corte al ${op.periodoActual.fin} y los delitos al ${c.periodoActual.fin}; los periodos no son idénticos.`);
  const delitoTxt = c.metadatos.delitoUnicoSeleccionado ? ` asociadas a ${c.metadatos.delitoUnicoSeleccionado}` : '';
  return {
    ...base,
    tipo: 'operatividad',
    titulo: 'Delitos y operatividad',
    hallazgo: cap
      ? { antes: `Se registran `, destacado: `${n(cap.actual)} capturas${delitoTxt}`, despues: ` en ${op.periodoActual?.vigencia} (${cap.actual - cap.anterior >= 0 ? '+' : ''}${n(cap.actual - cap.anterior)} frente a ${op.periodoComparativo?.vigencia}).`, detalle: `En el mismo periodo, los delitos ${c.indicadores.diferencia > 0 ? 'aumentaron' : c.indicadores.diferencia < 0 ? 'disminuyeron' : 'no variaron'} (${signo(c.indicadores.diferencia)}).`, tono: 'info' }
      : { antes: 'Resultados operativos del mismo periodo evaluable.', detalle: '', tono: 'info' },
    indicadores,
    secciones,
    evidencia: op.grupos.slice(0, 4).map((g) => `${g.titulo}: ${fmtU(g.anterior, g.unidad)} en ${op.periodoComparativo?.vigencia} → ${fmtU(g.actual, g.unidad)} en ${op.periodoActual?.vigencia}.`),
    interpretacion: 'La comparación muestra el volumen de resultados operativos junto al comportamiento delictivo del mismo periodo. Sirve para orientar el esfuerzo operativo, pero no permite afirmar que uno cause el otro.',
    recomendaciones: [cap && c.indicadores.diferencia > 0 && cap.actual <= cap.anterior ? 'Los delitos aumentan sin un aumento de capturas: evaluar reforzar la operatividad en las zonas y horarios críticos.' : 'Mantener la operatividad focalizada en las zonas y horarios de mayor concentración.', ...base.recomendaciones.slice(0, 2)],
    limitaciones: lim,
    preguntaIA: `Relaciona el comportamiento de ${etiquetaDelito(c)}${filtrosTexto(c)} con los resultados operativos (capturas, recuperaciones, incautaciones) del mismo periodo, sin afirmar causalidad.`,
  };
}

function preventivas(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const p = preventivo(c);
  if (!p) return { ...base, tipo: 'preventivas', titulo: 'Acciones preventivas', hallazgo: { antes: 'No hay información suficiente para proponer acciones focalizadas.', detalle: '', tono: 'neutro' }, secciones: [], evidencia: [], recomendaciones: [], interpretacion: null };
  const items: ItemSeccion[] = [];
  if (p.zonaPrioritaria.cuadrante) items.push({ texto: 'Zona de atención prioritaria', valor: p.zonaPrioritaria.cuadrante });
  if (p.zonaPrioritaria.barrio) items.push({ texto: 'Barrio prioritario', valor: p.zonaPrioritaria.barrio });
  if (p.diaPrioritario) items.push({ texto: 'Día prioritario', valor: `${p.diaPrioritario.dia} (${n(p.diaPrioritario.casos)} casos)` });
  if (p.franjaHorariaPreventiva) items.push({ texto: 'Franja horaria preventiva', valor: p.franjaHorariaPreventiva });
  return {
    ...base,
    tipo: 'preventivas',
    titulo: 'Acciones preventivas',
    hallazgo: { antes: `Focalizar el servicio para ${p.delito} en `, destacado: p.zonaPrioritaria.cuadrante ?? p.zonaPrioritaria.barrio ?? 'los sectores críticos', despues: p.franjaHorariaPreventiva ? `, entre ${p.franjaHorariaPreventiva}.` : '.', detalle: 'Zona, día y horario salen de la mayor concentración de casos del periodo.', tono: 'info' },
    secciones: [{ titulo: 'Dónde y cuándo', icono: 'territorio', items }, { titulo: 'Planes sugeridos', icono: 'operativo', items: p.planesRecomendados.map((pl) => ({ texto: pl })) }],
    interpretacion: 'Las acciones se proponen donde y cuando se concentra el delito. Son recomendaciones para el mando: su efecto debe verificarse con el seguimiento de las semanas siguientes.',
    preguntaIA: `Propón acciones preventivas para ${p.delito}${filtrosTexto(c)} según las zonas y horarios de mayor concentración entre ${periodoTexto(c)}.`,
  };
}

function recientes(c: ContextoAgenteIA): AnalisisEstructurado {
  const base = comportamiento(c);
  const r = c.cambiosRecientes;
  if (!r.disponible || r.semanas.length < 4) {
    return { ...base, tipo: 'recientes', titulo: 'Cambios recientes', hallazgo: { antes: 'No hay datos suficientes de las últimas 4 semanas.', detalle: '', tono: 'neutro' }, secciones: [], evidencia: [], interpretacion: null, limitaciones: [] };
  }
  const [s1, , , s4] = r.semanas;
  const v = r.variacionPrimeraVsUltimaPct;
  const items: ItemSeccion[] = [];
  if (r.delitoMayorAumento) items.push({ texto: `Mayor aumento: ${r.delitoMayorAumento.delito}`, valor: `${n(r.delitoMayorAumento.primera)} → ${n(r.delitoMayorAumento.ultima)}`, tono: 'alza' });
  if (r.delitoMayorDisminucion) items.push({ texto: `Mayor disminución: ${r.delitoMayorDisminucion.delito}`, valor: `${n(r.delitoMayorDisminucion.primera)} → ${n(r.delitoMayorDisminucion.ultima)}`, tono: 'baja' });
  return {
    ...base,
    tipo: 'recientes',
    titulo: 'Cambios recientes (últimas 4 semanas)',
    hallazgo: { antes: 'Entre la primera y la última de las 4 semanas, los casos ', destacado: v === null ? 'no se pueden comparar' : v > 0 ? `aumentan ${formatDecimal(v, 1)} %` : v < 0 ? `disminuyen ${formatDecimal(Math.abs(v), 1)} %` : 'se mantienen', despues: '.', detalle: `${s1.inicio}–${s1.fin}: ${n(s1.total)} casos · ${s4.inicio}–${s4.fin}: ${n(s4.total)} casos.`, tono: v === null ? 'neutro' : v > 0 ? 'alza' : v < 0 ? 'baja' : 'neutro' },
    indicadores: r.semanas.map((w, i) => ({ etiqueta: `Semana ${i + 1}`, valor: n(w.total), detalle: `${w.inicio} – ${w.fin}`, tono: i === 3 ? tonoVar(w.total - s1.total) : 'neutro' })),
    secciones: items.length ? [{ titulo: 'Delitos que más cambian', icono: 'lista', items }] : [],
    evidencia: r.semanas.map((w) => `${w.inicio} – ${w.fin}: ${n(w.total)} casos.`),
    interpretacion: 'Las 4 semanas son ventanas de 7 días hasta la última fecha con datos. Un cambio de una semana a otra puede ser coyuntural; conviene confirmarlo con varias semanas seguidas.',
    limitaciones: ['Ventanas cortas: pocas semanas no bastan para establecer una tendencia.'],
    preguntaIA: `¿Qué cambió en las últimas 4 semanas para ${etiquetaDelito(c)}${filtrosTexto(c)}?`,
  };
}

function ejecutivo(c: ContextoAgenteIA): AnalisisEstructurado {
  const b = comportamiento(c);
  const t = temporal(c);
  const terr = territorial(c);
  const cmp = comparar(c);
  const i = c.indicadores;
  const contexto: ItemSeccion[] = [
    { texto: 'Delito', valor: etiquetaDelito(c) },
    { texto: 'Periodo analizado', valor: periodoTexto(c) },
    { texto: 'Periodo comparado', valor: `${c.periodoComparativo.inicio} a ${c.periodoComparativo.fin}` },
    { texto: 'Corte de información', valor: c.corteInformacion },
  ];
  if (filtrosTexto(c)) contexto.push({ texto: 'Filtros', valor: filtrosTexto(c).slice(2, -1) });
  contexto.push({ texto: 'Registros del periodo', valor: n(c.calidadDatos.registrosActual) });
  const conclusiones: string[] = [];
  if (i.totalCasosAnterior > 0) conclusiones.push(`${etiquetaDelito(c)} ${i.diferencia > 0 ? 'aumenta' : i.diferencia < 0 ? 'disminuye' : 'se mantiene'} frente al mismo periodo de ${c.periodoComparativo.vigencia} (${signo(i.diferencia)} casos; ${textoVariacion(i.totalCasosActual, i.totalCasosAnterior)}).`);
  if (t.hallazgo.destacado) conclusiones.push(`El mayor riesgo horario está en ${t.hallazgo.destacado}.`);
  if (terr.hallazgo.destacado) conclusiones.push(`La mayor concentración territorial está en ${terr.hallazgo.destacado}.`);
  return {
    ...b,
    tipo: 'ejecutivo',
    titulo: 'Informe ejecutivo',
    secciones: [
      { titulo: '1. Contexto y periodo analizado', icono: 'contexto', items: contexto },
      { titulo: '2-3. Indicadores y comparación', icono: 'lista', items: [
        { texto: `Casos ${c.periodoActual.vigencia}`, valor: n(i.totalCasosActual) },
        { texto: `Casos ${c.periodoComparativo.vigencia} (mismo periodo)`, valor: n(i.totalCasosAnterior) },
        { texto: 'Diferencia', valor: signo(i.diferencia), tono: tonoVar(i.diferencia) },
        { texto: 'Variación', valor: textoVariacion(i.totalCasosActual, i.totalCasosAnterior), tono: tonoVar(i.diferencia) },
        { texto: `Total ${c.periodoComparativo.vigencia} completo (referencia)`, valor: n(i.totalAnioAnteriorCompleto) },
        ...cmp.secciones.filter((s) => /incremento|reducción/.test(s.titulo)).flatMap((s) => s.items.slice(0, 2).map((it) => ({ ...it, texto: `${s.titulo.includes('incremento') ? '▲' : '▼'} ${it.texto}` }))),
      ] },
      { titulo: '4. Hallazgos temporales', icono: 'tiempo', items: t.secciones.flatMap((s) => s.items.slice(0, 2).map((it) => ({ ...it, texto: `${s.titulo}: ${minus(it.texto)}` }))) },
      { titulo: '4. Hallazgos territoriales', icono: 'territorio', items: terr.secciones.flatMap((s) => s.items.slice(0, 2).map((it) => ({ ...it, texto: `${s.titulo}: ${it.texto}` }))) },
      { titulo: '6. Conclusiones', icono: 'lista', items: conclusiones.map((x) => ({ texto: x })) },
    ],
    interpretacion: b.interpretacion,
    evidencia: [...b.evidencia, ...t.evidencia.slice(0, 1), ...terr.evidencia.slice(0, 1)],
    preguntaIA: `Genera un informe ejecutivo para el comandante sobre ${etiquetaDelito(c)}${filtrosTexto(c)} entre ${periodoTexto(c)} frente al mismo periodo de ${c.periodoComparativo.vigencia}, con contexto, indicadores, comparación, hallazgos temporales y territoriales, interpretación, conclusiones y recomendaciones.`,
  };
}

export function generarAnalisis(tipo: TipoAnalisis, c: ContextoAgenteIA): AnalisisEstructurado {
  if (c.indicadores.totalCasosActual === 0 && tipo !== 'operatividad' && tipo !== 'recientes') {
    return {
      tipo, titulo: ACCESOS_ANALISIS.find((a) => a.tipo === tipo)?.etiqueta ?? 'Análisis',
      hallazgo: { antes: 'No hay casos registrados para la selección actual en el periodo analizado.', detalle: `${etiquetaDelito(c)}${filtrosTexto(c)} · ${periodoTexto(c)}.`, tono: 'neutro' },
      indicadores: [], secciones: [], interpretacion: null, evidencia: [], recomendaciones: [],
      limitaciones: ['Revise los filtros activos: con cero casos no es posible calcular indicadores ni concentraciones.'],
      preguntaIA: '',
    };
  }
  switch (tipo) {
    case 'comparar': return comparar(c);
    case 'temporal': return temporal(c);
    case 'territorial': return territorial(c);
    case 'modalidades': return modalidades(c);
    case 'operatividad': return operatividad(c);
    case 'preventivas': return preventivas(c);
    case 'recientes': return recientes(c);
    case 'ejecutivo': return ejecutivo(c);
    default: return comportamiento(c);
  }
}

/** Firma de la selección: si cambia, un análisis guardado ya no corresponde a lo que se ve. */
export function firmaContexto(c: ContextoAgenteIA): string {
  return JSON.stringify([c.filtros, c.periodoActual, c.indicadores.totalCasosActual, c.indicadores.totalCasosAnterior]);
}
