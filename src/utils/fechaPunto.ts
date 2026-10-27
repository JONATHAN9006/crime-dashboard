// Detección de fecha para puntos de capas (Delitos/IRISP1/Operatividad/
// archivo cargado) — compartida entre el Mapa interactivo
// (MapaGeorreferenciacion.tsx) y el generador de imágenes de Microgerencia
// (microgerenciaMapas.ts), para que las dos partes filtren por fecha
// EXACTAMENTE igual. Antes vivía solo en el Mapa — Microgerencia tenía su
// propio camino de código que nunca filtraba por fecha en absoluto
// (confirmado: el mapa de calor del PDF de Microgerencia siempre usaba
// todo el histórico, sin importar qué fecha inicial/final se hubiera
// seleccionado).

// Convierte UN valor crudo de columna en una fecha real, si es que lo es —
// Date ya parseado, número de serie de Excel, o texto "dd/mm/aaaa" (con o
// sin hora/AM-PM pegado al final, que se ignora).
export function parsearValorFecha(valor: any): Date | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.getFullYear() >= 1990 && valor.getFullYear() <= 2035 ? valor : null;
  }
  if (typeof valor === 'number' && valor > 20000 && valor < 60000) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
    return !isNaN(fecha.getTime()) && fecha.getFullYear() >= 1990 && fecha.getFullYear() <= 2035 ? fecha : null;
  }
  if (typeof valor === 'string' && valor.trim()) {
    const partes = valor.trim().split(/[\/\-]/);
    if (partes.length === 3) {
      const [a, b, c] = partes.map((x) => parseInt(x, 10));
      if (c >= 1990 && c <= 2035) { const f = new Date(c, b - 1, a); if (!isNaN(f.getTime())) return f; }
      if (a >= 1990 && a <= 2035) { const f = new Date(a, b - 1, c); if (!isNaN(f.getTime())) return f; }
    }
    const intento = new Date(valor);
    if (!isNaN(intento.getTime()) && intento.getFullYear() >= 1990 && intento.getFullYear() <= 2035) return intento;
  }
  return null;
}

// Elige, para TODA una capa (no punto por punto), cuál de sus columnas
// "FECHA *" es la que de verdad sirve para filtrar — por CÓMO SE COMPORTAN
// los datos, no por cómo se llama la columna (ver el comentario original,
// más detallado, en el historial de MapaGeorreferenciacion.tsx). Resumen:
// una fecha ADMINISTRATIVA (creación, última edición) suele repetirse casi
// igual en todos los registros; la fecha REAL del hecho varía de uno a
// otro — esa variedad (cuántas fechas DISTINTAS aparecen) es la señal que
// se usa para elegir, no el nombre de la columna.
export function elegirColumnaFechaConfiable(puntos: { fila: Record<string, any> }[]): string | null {
  if (puntos.length === 0) return null;
  const clavesFecha = Object.keys(puntos[0].fila).filter((k) => /FECHA/i.test(k));
  if (clavesFecha.length === 0) return null;
  if (clavesFecha.length === 1) return clavesFecha[0];

  const muestra = puntos.length > 300 ? puntos.filter((_, i) => i % Math.ceil(puntos.length / 300) === 0) : puntos;
  const esAdministrativa = (k: string) => /actualiz|creaci[oó]n|asignaci[oó]n|respuesta|modificaci[oó]n|registro/i.test(k);

  const puntajes = clavesFecha.map((clave) => {
    const fechas = muestra.map((p) => parsearValorFecha(p.fila[clave])).filter((f): f is Date => f !== null);
    const distintas = new Set(fechas.map((f) => f.toDateString())).size;
    return { clave, conValor: fechas.length, distintas, administrativa: esAdministrativa(clave) };
  });

  puntajes.sort((a, b) => b.distintas - a.distintas || Number(a.administrativa) - Number(b.administrativa) || b.conValor - a.conValor);
  return puntajes[0].conValor > 0 ? puntajes[0].clave : null;
}

export function extraerFechaDePunto(p: { fila: Record<string, any> }, columnaElegida: string | null): Date | null {
  if (!columnaElegida) return null;
  return parsearValorFecha(p.fila[columnaElegida]);
}
