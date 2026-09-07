import PptxGenJS from 'pptxgenjs';
import { useMemo } from 'react';
import type { CrimeRecord, FilterState } from '../types/crime';
import { agruparPor, formatDecimal, formatNumero, totalCasos } from '../utils/aggregations';
import { useKpis } from '../hooks/useKpis';
import { useRanking, useUrbanoRural } from '../hooks/useTerritorialAnalysis';
import { useTendenciaMensual, useTendenciaDiaSemana, useDistribucionHoraria } from '../hooks/useTemporalAnalysis';
import { useVentanaComparativa, useComparativoGeneral, useComparativoCategoria } from '../hooks/useComparativoHomologo';
import { useUltimasSemanas } from '../hooks/useUltimasSemanas';

const NAVY = '10233F';
const GREEN = '0F6B4C';
const GRAY = '64748B';
const RED = 'B91C1C';
const PALETA = ['10233F', '0F6B4C', 'B45309', '7C3AED', '0891B2', 'BE123C', '64748B', '059669', 'D97706'];

// ---------------------------------------------------------------------------
// Este módulo NO calcula nada por su cuenta: llama exactamente a los mismos
// hooks que usan las páginas del dashboard (useKpis, useRanking,
// useComparativoCategoria, useUltimasSemanas, etc.) con exactamente los mismos
// argumentos (filteredRecords / recordsBase + filtros vigentes). Así, la
// presentación es una réplica fiel de lo que el usuario ve en pantalla en el
// momento de generarla — no una fuente de cálculo paralela.
// ---------------------------------------------------------------------------
export function useDatosExportacionPptx(filteredRecords: CrimeRecord[], recordsBase: CrimeRecord[], filters: FilterState, todosLosRegistros?: CrimeRecord[], fechaMaxParametro?: Date | null) {
  const kpis = useKpis(filteredRecords);
  const ventana = useVentanaComparativa(recordsBase, filters, todosLosRegistros, fechaMaxParametro);
  const comparativoGeneral = useComparativoGeneral(ventana);
  // Misma definición que Indicadores.tsx: año COMPLETO (01/01–31/12) de la
  // vigencia anterior, para que el PowerPoint coincida exactamente con el dashboard.
  const totalGeneral = useMemo(
    () => totalCasos(recordsBase.filter((r) => r.anio === ventana.anioAnterior)),
    [recordsBase, ventana.anioAnterior],
  );

  const porEstacion = useRanking(filteredRecords, (r) => r.estacion, 10);
  const porZona = useUrbanoRural(filteredRecords);
  const porGenero = useRanking(filteredRecords, (r) => r.genero, 6);
  const porGrupoEdad = useRanking(filteredRecords, (r) => r.grupoEdad, 6);
  const porFranja = useRanking(filteredRecords, (r) => r.franjaHoraria, 4);

  const tendenciaMensual = useTendenciaMensual(filteredRecords);
  const diaSemana = useTendenciaDiaSemana(filteredRecords);
  const horaria = useDistribucionHoraria(filteredRecords);

  const cmpCuadrante = useComparativoCategoria(ventana, (r) => r.cuadrante, 10);
  const cmpBarrio = useComparativoCategoria(ventana, (r) => r.barrioHecho, 10);
  const cmpArma = useComparativoCategoria(ventana, (r) => r.armas, 10);
  const cmpModalidad = useComparativoCategoria(ventana, (r) => r.modalidad, 10);
  const cmpClaseSitio = useComparativoCategoria(ventana, (r) => r.claseSitio, 10);
  const cmpCausaLesion = useComparativoCategoria(ventana, (r) => r.causaLesion, 10);

  const ultimasSemanas = useUltimasSemanas(filteredRecords);

  return {
    kpis, ventana, comparativoGeneral, totalGeneral,
    porEstacion, porZona, porGenero, porGrupoEdad, porFranja,
    tendenciaMensual, diaSemana, horaria,
    cmpCuadrante, cmpBarrio, cmpArma, cmpModalidad, cmpClaseSitio, cmpCausaLesion,
    ultimasSemanas,
  };
}

export type DatosExportacionPptx = ReturnType<typeof useDatosExportacionPptx> & {
  filteredRecords: CrimeRecord[];
  filters: FilterState;
};

function etiquetasFiltrosActivos(filters: FilterState): string[] {
  const etiquetas: Record<string, string> = {
    estacion: 'Estación', cai: 'CAI', cuadrante: 'Cuadrante', barrioHecho: 'Barrio',
    delito: 'Delito', zona: 'Zona', genero: 'Género', armas: 'Arma', modalidad: 'Modalidad',
    claseSitio: 'Clase de sitio', causaLesion: 'Causa de lesión', grupoEdad: 'Grupo de edad',
    franjaHoraria: 'Hora (intervalo)', anio: 'Año', mes: 'Mes', diaSemana: 'Día de la semana',
    horaExacta: 'Hora exacta',
  };
  const salida: string[] = [];
  for (const [key, label] of Object.entries(etiquetas)) {
    const valor = (filters as any)[key] as string[];
    if (Array.isArray(valor) && valor.length > 0) salida.push(`${label}: ${valor.join(', ')}`);
  }
  if (filters.fechaInicial) salida.push(`Desde: ${filters.fechaInicial}`);
  if (filters.fechaFinal) salida.push(`Hasta: ${filters.fechaFinal}`);
  return salida.length > 0 ? salida : ['Sin filtros activos (se considera la totalidad de los datos cargados)'];
}

// --- Helpers de maquetación --------------------------------------------------

function tituloSlide(slide: PptxGenJS.Slide, texto: string) {
  slide.addText(texto, { x: 0.4, y: 0.25, w: 12.5, h: 0.55, fontSize: 20, bold: true, color: NAVY });
}

interface Cuadrante { x: number; y: number; w: number; h: number; }
const CUAD_2x2: Cuadrante[] = [
  { x: 0.4, y: 1.0, w: 6.1, h: 3.1 },
  { x: 6.7, y: 1.0, w: 6.2, h: 3.1 },
  { x: 0.4, y: 4.25, w: 6.1, h: 3.1 },
  { x: 6.7, y: 4.25, w: 6.2, h: 3.1 },
];

function subtitulo(slide: PptxGenJS.Slide, texto: string, c: Cuadrante) {
  slide.addText(texto, { x: c.x, y: c.y, w: c.w, h: 0.3, fontSize: 12, bold: true, color: '334155' });
}

function graficoBarras(slide: PptxGenJS.Slide, c: Cuadrante, categorias: string[], valores: number[], color = NAVY) {
  if (categorias.length === 0) {
    slide.addText('Sin datos con los filtros actuales.', { x: c.x, y: c.y + 0.35, w: c.w, h: 0.5, fontSize: 10, color: GRAY, italic: true });
    return;
  }
  slide.addChart('bar', [{ name: 'Casos', labels: categorias, values: valores }], {
    x: c.x, y: c.y + 0.32, w: c.w, h: c.h - 0.35,
    chartColors: [color], showValue: true, dataLabelColor: '334155', dataLabelFontSize: 8,
    catAxisLabelFontSize: 8, valAxisLabelFontSize: 8, showLegend: false, barGapWidthPct: 30,
  });
}

function graficoBarrasHorizontal(slide: PptxGenJS.Slide, c: Cuadrante, categorias: string[], valores: number[], color = NAVY) {
  if (categorias.length === 0) {
    slide.addText('Sin datos con los filtros actuales.', { x: c.x, y: c.y + 0.35, w: c.w, h: 0.5, fontSize: 10, color: GRAY, italic: true });
    return;
  }
  slide.addChart('bar', [{ name: 'Casos', labels: categorias, values: valores }], {
    x: c.x, y: c.y + 0.32, w: c.w, h: c.h - 0.35,
    barDir: 'bar',
    chartColors: [color], showValue: true, dataLabelColor: '334155', dataLabelFontSize: 8,
    catAxisLabelFontSize: 8, valAxisLabelFontSize: 8, showLegend: false,
  });
}

function graficoLineasComparativo(slide: PptxGenJS.Slide, c: Cuadrante, categorias: string[], seriesA: { nombre: string; valores: number[] }, seriesB: { nombre: string; valores: number[] }) {
  if (categorias.length === 0) {
    slide.addText('Sin datos con los filtros actuales.', { x: c.x, y: c.y + 0.35, w: c.w, h: 0.5, fontSize: 10, color: GRAY, italic: true });
    return;
  }
  slide.addChart('line', [
    { name: seriesA.nombre, labels: categorias, values: seriesA.valores },
    { name: seriesB.nombre, labels: categorias, values: seriesB.valores },
  ], {
    x: c.x, y: c.y + 0.32, w: c.w, h: c.h - 0.35,
    chartColors: [GRAY, NAVY],
    lineDataSymbol: 'circle', lineSize: 2,
    showValue: true, dataLabelFontSize: 7, dataLabelColor: '334155',
    catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
    showLegend: true, legendPos: 'b', legendFontSize: 8,
  });
}

// Gráfica circular con etiquetas Y leyenda a un lado (nombre + cantidad + %),
// para que la información no dependa únicamente del tooltip.
function graficoCircular(slide: PptxGenJS.Slide, c: Cuadrante, datos: { key: string; casos: number }[]) {
  if (datos.length === 0) {
    slide.addText('Sin datos con los filtros actuales.', { x: c.x, y: c.y + 0.35, w: c.w, h: 0.5, fontSize: 10, color: GRAY, italic: true });
    return;
  }
  const total = datos.reduce((a, d) => a + d.casos, 0);
  const anchoGrafico = c.w * 0.55;
  slide.addChart('pie', [{ name: 'Casos', labels: datos.map((d) => d.key), values: datos.map((d) => d.casos) }], {
    x: c.x, y: c.y + 0.32, w: anchoGrafico, h: c.h - 0.35,
    chartColors: PALETA,
    showLegend: false, showValue: false, showLabel: false, showPercent: false,
  });
  // Leyenda manual al lado con "Nombre — cantidad — %" (más legible que la
  // leyenda nativa de pptxgenjs cuando los nombres son largos).
  const filasLeyenda = datos.slice(0, 8).map((d, i) => ({
    text: `${d.key} — ${formatNumero(d.casos)} — ${total ? formatDecimal((d.casos / total) * 100) : '0'}%`,
    options: { bullet: { code: '25A0', color: PALETA[i % PALETA.length] }, color: '334155', breakLine: true, fontSize: 8.5 },
  }));
  slide.addText(filasLeyenda as any, { x: c.x + anchoGrafico + 0.1, y: c.y + 0.4, w: c.w - anchoGrafico - 0.1, h: c.h - 0.4, valign: 'top' });
}

function tablaComparativa(slide: PptxGenJS.Slide, c: Cuadrante, etiqueta: string, filas: { key: string; anterior: number; actual: number; diferencia: number; variacionPct: number | null }[], anioAnterior: number, anioActual: number) {
  if (filas.length === 0) {
    slide.addText('Sin datos con los filtros actuales.', { x: c.x, y: c.y + 0.35, w: c.w, h: 0.5, fontSize: 10, color: GRAY, italic: true });
    return;
  }
  const filasTabla = [
    [
      { text: etiqueta, options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 8 } },
      { text: String(anioAnterior), options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 8, align: 'right' as const } },
      { text: String(anioActual), options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 8, align: 'right' as const } },
      { text: 'DIF', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 8, align: 'right' as const } },
      { text: '%', options: { bold: true, color: 'FFFFFF', fill: { color: NAVY }, fontSize: 8, align: 'right' as const } },
    ],
    ...filas.slice(0, 6).map((f) => {
      const desfavorable = (f.variacionPct ?? 0) > 0.01;
      const favorable = (f.variacionPct ?? 0) < -0.01;
      const colorVar = desfavorable ? RED : favorable ? GREEN : '64748B';
      return [
        { text: f.key, options: { fontSize: 8, color: '334155' } },
        { text: formatNumero(f.anterior), options: { fontSize: 8, align: 'right' as const, color: '334155' } },
        { text: formatNumero(f.actual), options: { fontSize: 8, align: 'right' as const, color: '334155' } },
        { text: `${f.diferencia >= 0 ? '+' : ''}${formatNumero(f.diferencia)}`, options: { fontSize: 8, align: 'right' as const, color: colorVar, bold: true } },
        { text: f.variacionPct === null ? 'N/A' : `${f.variacionPct >= 0 ? '+' : ''}${formatDecimal(f.variacionPct, 0)}%`, options: { fontSize: 8, align: 'right' as const, color: colorVar, bold: true } },
      ];
    }),
  ];
  slide.addTable(filasTabla as any, { x: c.x, y: c.y + 0.32, w: c.w, h: c.h - 0.35, autoPage: false, border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, colW: [c.w * 0.4, c.w * 0.15, c.w * 0.15, c.w * 0.15, c.w * 0.15] });
}

function listaSimple(slide: PptxGenJS.Slide, c: Cuadrante, items: { key: string; casos: number }[]) {
  if (items.length === 0) {
    slide.addText('Sin datos con los filtros actuales.', { x: c.x, y: c.y + 0.35, w: c.w, h: 0.5, fontSize: 10, color: GRAY, italic: true });
    return;
  }
  const filas = items.slice(0, 6).map((it) => ({
    text: `${it.key}: ${formatNumero(it.casos)} casos`,
    options: { bullet: true, breakLine: true, fontSize: 9, color: '334155' },
  }));
  slide.addText(filas as any, { x: c.x, y: c.y + 0.32, w: c.w, h: c.h - 0.35, valign: 'top' });
}

// -----------------------------------------------------------------------

export async function generarPowerPoint(datos: DatosExportacionPptx): Promise<void> {
  const {
    filteredRecords, filters, kpis, ventana, comparativoGeneral: cmp, totalGeneral,
    porEstacion, porZona, porGenero, porGrupoEdad, porFranja,
    tendenciaMensual, diaSemana, horaria,
    cmpCuadrante, cmpBarrio, cmpArma, cmpModalidad, cmpClaseSitio, cmpCausaLesion,
    ultimasSemanas,
  } = datos;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  const filtrosActivos = etiquetasFiltrosActivos(filters);
  const fechaGeneracion = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
  const desfavorable = cmp.variacionPct !== null && cmp.variacionPct > 0;
  const colorTendencia = desfavorable ? RED : GREEN;
  const { anioActual, anioAnterior } = ventana;

  // ---- Portada -------------------------------------------------------
  const portada = pptx.addSlide();
  portada.background = { color: NAVY };
  portada.addText('Dashboard de Análisis Delictivo', { x: 0.6, y: 2.5, w: 12, h: 1, fontSize: 32, bold: true, color: 'FFFFFF' });
  portada.addText('Réplica analítica del dashboard según los filtros seleccionados', { x: 0.6, y: 3.35, w: 11, h: 0.5, fontSize: 15, color: 'CBD5E1' });
  portada.addText(`${formatNumero(filteredRecords.length)} registros considerados · Generado: ${fechaGeneracion}`, { x: 0.6, y: 3.95, w: 10, h: 0.4, fontSize: 12, color: 'FFFFFF' });
  portada.addText('Filtros aplicados:', { x: 0.6, y: 4.7, w: 6, h: 0.35, fontSize: 12, bold: true, color: 'FFFFFF' });
  portada.addText(filtrosActivos.map((f) => ({ text: f, options: { bullet: true, breakLine: true, color: 'E2E8F0', fontSize: 11 } })) as any, { x: 0.6, y: 5.1, w: 11, h: 1.8 });

  // ---- Diapositiva 1: Resumen ejecutivo (comparativo general) --------
  const s1 = pptx.addSlide();
  tituloSlide(s1, 'Resumen Ejecutivo — Comparativo General');
  const tarjetas = [
    { t: 'Total General', v: formatNumero(totalGeneral), color: GREEN },
    { t: `Casos año anterior (${anioAnterior})`, v: formatNumero(cmp.casosAnterior), color: GRAY },
    { t: `Casos año actual (${anioActual})`, v: formatNumero(cmp.casosActual), color: NAVY },
    { t: 'Diferencia absoluta', v: `${cmp.variacionAbs >= 0 ? '+' : ''}${formatNumero(cmp.variacionAbs)}`, color: colorTendencia },
    { t: 'Diferencia %', v: cmp.variacionPct === null ? 'N/A' : `${cmp.variacionPct >= 0 ? '+' : ''}${formatDecimal(cmp.variacionPct)}%`, color: colorTendencia },
    { t: 'Tendencia', v: desfavorable ? 'Desfavorable ▲' : 'Favorable ▼', color: colorTendencia },
  ];
  tarjetas.forEach((t, i) => {
    const col = i % 3;
    const fila = Math.floor(i / 3);
    const x = 0.4 + col * 4.25;
    const y = 1.15 + fila * 2.3;
    s1.addShape('roundRect', { x, y, w: 4.0, h: 2.0, fill: { color: 'F1F5F9' }, line: { color: 'E2E8F0', width: 1 }, rectRadius: 0.08 });
    s1.addText(t.t.toUpperCase(), { x: x + 0.2, y: y + 0.18, w: 3.6, h: 0.7, fontSize: 10, color: GRAY, bold: true });
    s1.addText(t.v, { x: x + 0.2, y: y + 0.85, w: 3.6, h: 1.0, fontSize: 19, color: t.color, bold: true });
  });
  s1.addText(
    `Nota: ${ventana.esRangoPersonalizado ? 'comparación sobre el rango de fechas seleccionado, contrastado con el mismo rango un año atrás.' : 'comparación "a la fecha": 1 de enero al último dato disponible de cada año, para no comparar un año completo contra uno parcial.'}`,
    { x: 0.4, y: 5.9, w: 12.5, h: 0.5, fontSize: 9, italic: true, color: GRAY },
  );

  // ---- Diapositiva 2: Comportamiento temporal -------------------------
  const s2 = pptx.addSlide();
  tituloSlide(s2, 'Comportamiento Temporal');
  subtitulo(s2, `Tendencia mensual (${anioAnterior} vs ${anioActual})`, CUAD_2x2[0]);
  graficoLineasComparativo(
    s2, CUAD_2x2[0], tendenciaMensual.map((m: any) => m.mes),
    { nombre: String(anioAnterior), valores: tendenciaMensual.map((m: any) => m[String(anioAnterior)] || 0) },
    { nombre: String(anioActual), valores: tendenciaMensual.map((m: any) => m[String(anioActual)] || 0) },
  );
  subtitulo(s2, 'Casos por día de la semana', CUAD_2x2[1]);
  graficoBarras(s2, CUAD_2x2[1], diaSemana.map((d) => d.dia), diaSemana.map((d) => d.casos), GREEN);
  subtitulo(s2, 'Distribución por hora del hecho', CUAD_2x2[2]);
  graficoBarras(s2, CUAD_2x2[2], horaria.map((h) => h.hora), horaria.map((h) => h.casos), NAVY);
  subtitulo(s2, 'Concentración horaria (franja del día)', CUAD_2x2[3]);
  graficoCircular(s2, CUAD_2x2[3], porFranja.map((f) => ({ key: f.key, casos: f.casos })));

  // ---- Diapositiva 3: Distribución territorial ------------------------
  const s3 = pptx.addSlide();
  tituloSlide(s3, 'Distribución Territorial');
  subtitulo(s3, 'Casos por estación', CUAD_2x2[0]);
  graficoBarrasHorizontal(s3, CUAD_2x2[0], porEstacion.map((e) => e.key), porEstacion.map((e) => e.casos), GREEN);
  subtitulo(s3, `Top 10 cuadrantes (${anioAnterior} vs ${anioActual})`, CUAD_2x2[1]);
  tablaComparativa(s3, CUAD_2x2[1], 'Cuadrante', cmpCuadrante, anioAnterior, anioActual);
  subtitulo(s3, `Top 10 barrios (${anioAnterior} vs ${anioActual})`, CUAD_2x2[2]);
  tablaComparativa(s3, CUAD_2x2[2], 'Barrio', cmpBarrio, anioAnterior, anioActual);
  subtitulo(s3, 'Zonas de mayor afectación', CUAD_2x2[3]);
  graficoCircular(s3, CUAD_2x2[3], porZona.map((z) => ({ key: z.key, casos: z.casos })));

  // ---- Diapositiva 4: Caracterización de los casos --------------------
  const s4 = pptx.addSlide();
  tituloSlide(s4, 'Caracterización de los Casos');
  subtitulo(s4, `Top 10 armas empleadas (${anioAnterior} vs ${anioActual})`, CUAD_2x2[0]);
  tablaComparativa(s4, CUAD_2x2[0], 'Arma', cmpArma, anioAnterior, anioActual);
  subtitulo(s4, `Modalidades principales (${anioAnterior} vs ${anioActual})`, CUAD_2x2[1]);
  tablaComparativa(s4, CUAD_2x2[1], 'Modalidad', cmpModalidad, anioAnterior, anioActual);
  subtitulo(s4, `Clase de sitio (${anioAnterior} vs ${anioActual})`, CUAD_2x2[2]);
  tablaComparativa(s4, CUAD_2x2[2], 'Clase de sitio', cmpClaseSitio, anioAnterior, anioActual);
  subtitulo(s4, `Causa de lesión (${anioAnterior} vs ${anioActual})`, CUAD_2x2[3]);
  tablaComparativa(s4, CUAD_2x2[3], 'Causa de lesión', cmpCausaLesion, anioAnterior, anioActual);

  // ---- Diapositiva 5: Caracterización de población --------------------
  const s5 = pptx.addSlide();
  tituloSlide(s5, 'Caracterización de Población');
  const cGrande: Cuadrante = { x: 0.6, y: 1.2, w: 6.0, h: 5.2 };
  const cGrande2: Cuadrante = { x: 6.9, y: 1.2, w: 6.0, h: 5.2 };
  subtitulo(s5, 'Distribución por género', cGrande);
  graficoCircular(s5, cGrande, porGenero.map((g) => ({ key: g.key, casos: g.casos })));
  subtitulo(s5, 'Distribución por grupo de edad', cGrande2);
  graficoCircular(s5, cGrande2, porGrupoEdad.map((g) => ({ key: g.key, casos: g.casos })));

  // ---- Diapositiva 6: Últimas 4 semanas — evolución -------------------
  const s6 = pptx.addSlide();
  tituloSlide(s6, 'Comportamiento de las Últimas 4 Semanas');
  if (ultimasSemanas.disponible) {
    const topDelitos = [...ultimasSemanas.porDelito]
      .sort((a, b) => (b.semanas[0] + b.semanas[1] + b.semanas[2] + b.semanas[3]) - (a.semanas[0] + a.semanas[1] + a.semanas[2] + a.semanas[3]))
      .slice(0, 5);
    const nombresSemanas = ultimasSemanas.semanas.map((s) => s.nombre.replace(' (más reciente)', ''));
    const series = topDelitos.map((d, i) => ({ name: d.delito, labels: nombresSemanas, values: d.semanas }));
    if (series.length > 0) {
      s6.addChart('line', series as any, {
        x: 0.6, y: 1.1, w: 12.1, h: 4.6,
        chartColors: PALETA,
        lineDataSymbol: 'circle', lineSize: 2.5,
        showValue: true, dataLabelFontSize: 8,
        catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
        showLegend: true, legendPos: 'b', legendFontSize: 9,
      });
    }
    s6.addText(
      `Total últimas 4 semanas: ${formatNumero(ultimasSemanas.totalVentana)} casos · Variación semana 4 vs semana 1: ${ultimasSemanas.variacionTotalPct === null ? 'N/A' : `${ultimasSemanas.variacionTotalPct >= 0 ? '+' : ''}${formatDecimal(ultimasSemanas.variacionTotalPct)}%`} · Delito con mayor aumento: ${ultimasSemanas.delitoMayorAumento?.delito ?? '—'}`,
      { x: 0.6, y: 5.85, w: 12.1, h: 0.6, fontSize: 11, color: (ultimasSemanas.variacionTotalPct ?? 0) > 0 ? RED : GREEN, bold: true },
    );
  } else {
    s6.addText('No hay suficientes datos con fecha para este análisis.', { x: 0.6, y: 1.3, fontSize: 14, color: GRAY });
  }

  // ---- Diapositiva 7: Factores asociados — últimas 4 semanas ----------
  const s7 = pptx.addSlide();
  tituloSlide(s7, 'Factores Asociados — Últimas 4 Semanas');
  if (ultimasSemanas.disponible) {
    subtitulo(s7, 'Armas empleadas', CUAD_2x2[0]);
    listaSimple(s7, CUAD_2x2[0], ultimasSemanas.armasTop);
    subtitulo(s7, 'Cuadrantes de mayor afectación', CUAD_2x2[1]);
    listaSimple(s7, CUAD_2x2[1], ultimasSemanas.cuadrantesTop);
    subtitulo(s7, 'Causa de lesión', CUAD_2x2[2]);
    listaSimple(s7, CUAD_2x2[2], ultimasSemanas.causaLesionTop);
    subtitulo(s7, 'Clase de sitio', CUAD_2x2[3]);
    listaSimple(s7, CUAD_2x2[3], ultimasSemanas.claseSitioTop);
  } else {
    s7.addText('No hay suficientes datos con fecha para este análisis.', { x: 0.6, y: 1.3, fontSize: 14, color: GRAY });
  }

  // ---- Diapositiva 7b: Barrios y horarios más afectados (últimas 4 semanas) ----
  const s7b = pptx.addSlide();
  tituloSlide(s7b, 'Barrios y Horarios Más Afectados — Últimas 4 Semanas');
  if (ultimasSemanas.disponible) {
    const cIzq: Cuadrante = { x: 0.6, y: 1.2, w: 6.0, h: 5.2 };
    const cDer: Cuadrante = { x: 6.9, y: 1.2, w: 6.0, h: 5.2 };
    subtitulo(s7b, 'Barrios más afectados (Top 5)', cIzq);
    listaSimple(s7b, cIzq, ultimasSemanas.barriosTop);
    subtitulo(s7b, 'Horario más afectado (franja)', cDer);
    if (ultimasSemanas.franjaTop) {
      s7b.addText(ultimasSemanas.franjaTop.key, { x: cDer.x, y: cDer.y + 0.5, w: cDer.w, h: 0.6, fontSize: 22, bold: true, color: NAVY });
      s7b.addText(`${formatNumero(ultimasSemanas.franjaTop.casos)} casos · ${formatDecimal(ultimasSemanas.franjaTop.participacion)}% del total de la ventana`, { x: cDer.x, y: cDer.y + 1.2, w: cDer.w, h: 0.5, fontSize: 12, color: GRAY });
    } else {
      s7b.addText('Sin datos.', { x: cDer.x, y: cDer.y + 0.4, fontSize: 12, color: GRAY });
    }
  } else {
    s7b.addText('No hay suficientes datos con fecha para este análisis.', { x: 0.6, y: 1.3, fontSize: 14, color: GRAY });
  }

  const nombreArchivo = `Informe_Delitos_${new Date().toISOString().slice(0, 10)}.pptx`;
  await pptx.writeFile({ fileName: nombreArchivo });
}
