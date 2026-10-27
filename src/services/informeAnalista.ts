// Texto plano y PDF del análisis del Analista IA (mismas cifras que se ven
// en pantalla: no se recalcula nada). La descarga respeta los permisos
// (puedeDescargar) y el bloqueo global de descargas (/jefe, /cai).
import { jsPDF } from 'jspdf';
import type { AnalisisEstructurado } from './analisisEstructurado';
import { etiquetaDelito } from './analisisEstructurado';
import type { ContextoAgenteIA } from '../types/agenteIA';
import { formatNumero } from '../utils/aggregations';

export function analisisATexto(a: AnalisisEstructurado, c: ContextoAgenteIA): string {
  const l: string[] = [];
  l.push(`${a.titulo.toUpperCase()} — ${etiquetaDelito(c)}`);
  l.push(`Periodo: ${c.periodoActual.inicio} a ${c.periodoActual.fin} · Comparado: ${c.periodoComparativo.inicio} a ${c.periodoComparativo.fin} · Corte: ${c.corteInformacion}`);
  l.push('');
  l.push('HALLAZGO PRINCIPAL');
  l.push(`${a.hallazgo.antes}${a.hallazgo.destacado ?? ''}${a.hallazgo.despues ?? ''}`);
  if (a.hallazgo.detalle) l.push(a.hallazgo.detalle);
  if (a.indicadores.length) {
    l.push('', 'INDICADORES');
    a.indicadores.forEach((i) => l.push(`- ${i.etiqueta}: ${i.valor}${i.detalle ? ` (${i.detalle})` : ''}`));
  }
  a.secciones.forEach((s) => {
    l.push('', s.titulo.toUpperCase());
    s.items.forEach((it) => l.push(`- ${it.texto}${it.valor ? `: ${it.valor}` : ''}`));
  });
  if (a.interpretacion) l.push('', 'INTERPRETACIÓN', a.interpretacion);
  if (a.evidencia.length) { l.push('', 'EVIDENCIA'); a.evidencia.forEach((e, i) => l.push(`${i + 1}. ${e}`)); }
  if (a.recomendaciones.length) { l.push('', 'RECOMENDACIONES OPERATIVAS'); a.recomendaciones.forEach((r) => l.push(`- ${r}`)); }
  if (a.limitaciones.length) { l.push('', 'LIMITACIONES'); a.limitaciones.forEach((r) => l.push(`- ${r}`)); }
  return l.join('\n');
}

const NAVY: [number, number, number] = [16, 35, 63];
const PETROLEO: [number, number, number] = [15, 95, 87];
const GRIS: [number, number, number] = [71, 85, 105];
const ROJO: [number, number, number] = [190, 18, 60];
const VERDE: [number, number, number] = [4, 120, 87];

export function descargarInformePdf(a: AnalisisEstructurado, c: ContextoAgenteIA) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 16;
  const W = 210 - M * 2;
  let y = 0;
  const salto = (alto: number) => { if (y + alto > 282) { doc.addPage(); y = 18; } };
  // La fuente estándar del PDF no trae ▲ ▼ → ·: se reemplazan por texto equivalente.
  const limpiar = (t: string) => t.replace(/▲/g, 'Aumento:').replace(/▼/g, 'Reducción:').replace(/→/g, '->').replace(/ /g, ' ');
  const parrafo = (txtOriginal: string, size = 10, color = GRIS, estilo: 'normal' | 'bold' = 'normal', sangria = 0) => {
    const txt = limpiar(txtOriginal);
    doc.setFont('helvetica', estilo); doc.setFontSize(size); doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(txt, W - sangria) as string[];
    lineas.forEach((ln) => { salto(size * 0.45 + 1); doc.text(ln, M + sangria, y); y += size * 0.45 + 1; });
  };
  const titulo = (txt: string) => {
    y += 3; salto(10);
    doc.setFillColor(...PETROLEO); doc.rect(M, y - 4, 2.2, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...NAVY);
    doc.text(txt, M + 4.5, y + 0.6); y += 7;
  };

  // Encabezado institucional
  doc.setFillColor(...NAVY); doc.rect(0, 0, 210, 30, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(170, 220, 210);
  doc.text('SISTEMA INTEGRAL DE INFORMACIÓN POLICIAL — MEPOY', M, 10);
  doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  doc.text(a.tipo === 'ejecutivo' ? 'Informe ejecutivo' : `Analista IA — ${a.titulo}`, M, 19);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(210, 225, 235);
  doc.text(`${etiquetaDelito(c)} · Corte de información: ${c.corteInformacion}`, M, 25.5);
  y = 38;

  // En el informe ejecutivo el contexto ya es su sección 1.
  if (a.tipo !== 'ejecutivo') titulo('Contexto y periodo analizado');
  if (a.tipo !== 'ejecutivo') parrafo(`Periodo analizado: ${c.periodoActual.inicio} a ${c.periodoActual.fin}. Periodo comparado: ${c.periodoComparativo.inicio} a ${c.periodoComparativo.fin}.`);
  const f = c.filtros;
  const filtros = [
    f.delito.length ? `Delito: ${f.delito.join(', ')}` : 'Delito: todos',
    f.estacion.length ? `Estación: ${f.estacion.join(', ')}` : '',
    f.cuadrante.length ? `Zona de atención: ${f.cuadrante.join(', ')}` : '',
    f.barrioHecho.length ? `Barrio: ${f.barrioHecho.join(', ')}` : '',
    f.cai.length ? `CAI: ${f.cai.join(', ')}` : '',
    f.cantidadFiltrosAdicionalesActivos ? `${f.cantidadFiltrosAdicionalesActivos} filtro(s) adicional(es)` : '',
  ].filter(Boolean).join(' · ');
  if (a.tipo !== 'ejecutivo') parrafo(`Filtros activos: ${filtros}. Registros del periodo: ${formatNumero(c.calidadDatos.registrosActual)}.`);

  titulo('Hallazgo principal');
  parrafo(`${a.hallazgo.antes}${a.hallazgo.destacado ?? ''}${a.hallazgo.despues ?? ''}`, 11.5, NAVY, 'bold');
  if (a.hallazgo.detalle) parrafo(a.hallazgo.detalle);

  if (a.indicadores.length) {
    titulo('Indicadores principales');
    const col = Math.min(a.indicadores.length, 3);
    const anchoC = (W - (col - 1) * 3) / col;
    a.indicadores.forEach((ind, i) => {
      if (i % col === 0) { salto(20); if (i > 0) y += 19; }
      const x = M + (i % col) * (anchoC + 3);
      doc.setDrawColor(220, 226, 232); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y - 3, anchoC, 17, 2, 2, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS); doc.text(ind.etiqueta, x + 3, y + 1.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...(ind.tono === 'alza' ? ROJO : ind.tono === 'baja' ? VERDE : NAVY));
      doc.text(doc.splitTextToSize(limpiar(ind.valor), anchoC - 6)[0], x + 3, y + 8);
      if (ind.detalle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.text(doc.splitTextToSize(limpiar(ind.detalle), anchoC - 6)[0], x + 3, y + 12.3); }
    });
    y += 19;
  }

  a.secciones.forEach((s) => {
    titulo(s.titulo.replace(/^\d+(-\d+)?\.\s*/, ''));
    s.items.forEach((it) => parrafo(`•  ${it.texto}${it.valor ? `: ${it.valor}` : ''}`, 9.8, GRIS, 'normal', 2));
  });
  if (a.interpretacion) { titulo('Interpretación'); parrafo(a.interpretacion); }
  if (a.evidencia.length) { titulo('Evidencia del dashboard'); a.evidencia.forEach((e, i) => parrafo(`${i + 1}. ${e}`, 9.8, GRIS, 'normal', 2)); }
  if (a.recomendaciones.length) { titulo('Recomendaciones operativas'); a.recomendaciones.forEach((r) => parrafo(`•  ${r}`, 9.8, GRIS, 'normal', 2)); }
  if (a.limitaciones.length) { titulo('Limitaciones'); a.limitaciones.forEach((r) => parrafo(`•  ${r}`, 9, [146, 64, 14], 'normal', 2)); }

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
    doc.text(`Generado el ${new Date().toLocaleString('es-CO')} con los filtros y registros del dashboard · Página ${p} de ${paginas}`, M, 291);
  }
  const nombre = `${a.tipo === 'ejecutivo' ? 'Informe_ejecutivo' : `Analisis_${a.tipo}`}_${etiquetaDelito(c).replace(/[^\p{L}\p{N}]+/gu, '_')}_${c.corteInformacion.replace(/\//g, '-')}.pdf`;
  doc.save(nombre);
}
