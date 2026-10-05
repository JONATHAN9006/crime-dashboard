import type { OperatividadRecord } from '../types/operatividad';

// Desglose de Operatividad en los CONCEPTOS del informe institucional
// (Capturas por orden judicial / en flagrancia, Recuperación de
// automotores / motocicletas, Casos mercancía recuperada / incautada,
// A/F sin / con permiso, y cada droga en gramos).
//
// Regla de medida:
//  · Capturas, recuperaciones, mercancía y armas → se CUENTAN registros
//    (cada fila del archivo es una persona, un vehículo, un caso o un arma),
//    igual que contaba antes el comparativo por categoría.
//  · Drogas → se SUMA la columna CANTIDAD, que en la incautación de droga
//    trae los gramos (o las pastillas, en drogas de síntesis).
//
// Todo se reconoce por palabra clave sobre el texto sin tildes y en
// mayúsculas, porque el parser formatea los valores como título
// ("Incautacion Droga", "Orden Judicial Ley 906"…).

export type MedidaConcepto = 'conteo' | 'suma';

export interface ConceptoOperatividad {
  concepto: string;
  orden: number;
  medida: MedidaConcepto;
  grupo: 'Capturas' | 'Recuperaciones' | 'Mercancía' | 'Armas de fuego' | 'Drogas' | 'Otros';
  unidad: string; // texto corto para mostrar la unidad: 'casos', 'Gr', 'pastillas'…
}

function norm(v: unknown): string {
  return String(v ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

// Conceptos fijos: se muestran SIEMPRE en el comparativo, aunque estén en
// cero (como Heroína en el informe de referencia), para que la tabla tenga
// siempre la misma forma mes a mes.
export const CONCEPTOS_FIJOS: ConceptoOperatividad[] = [
  { concepto: 'Capturas por orden judicial', orden: 1, medida: 'conteo', grupo: 'Capturas', unidad: 'capturas' },
  { concepto: 'Capturas en flagrancia', orden: 2, medida: 'conteo', grupo: 'Capturas', unidad: 'capturas' },
  { concepto: 'Recuperación de automotores', orden: 4, medida: 'conteo', grupo: 'Recuperaciones', unidad: 'automotores' },
  { concepto: 'Recuperación de motocicletas', orden: 5, medida: 'conteo', grupo: 'Recuperaciones', unidad: 'motocicletas' },
  { concepto: 'Casos mercancía recuperada', orden: 6, medida: 'conteo', grupo: 'Mercancía', unidad: 'casos' },
  { concepto: 'Casos mercancía incautada', orden: 7, medida: 'conteo', grupo: 'Mercancía', unidad: 'casos' },
  { concepto: 'A/F sin permiso', orden: 8, medida: 'conteo', grupo: 'Armas de fuego', unidad: 'armas' },
  { concepto: 'A/F con permiso', orden: 9, medida: 'conteo', grupo: 'Armas de fuego', unidad: 'armas' },
  { concepto: 'Cocaína (Gr)', orden: 11, medida: 'suma', grupo: 'Drogas', unidad: 'Gr' },
  { concepto: 'Heroína (Gr)', orden: 12, medida: 'suma', grupo: 'Drogas', unidad: 'Gr' },
  { concepto: 'Base de coca (Gr)', orden: 13, medida: 'suma', grupo: 'Drogas', unidad: 'Gr' },
  { concepto: 'Bazuco (Gr)', orden: 14, medida: 'suma', grupo: 'Drogas', unidad: 'Gr' },
  { concepto: 'Marihuana (Gr)', orden: 15, medida: 'suma', grupo: 'Drogas', unidad: 'Gr' },
  { concepto: 'Drogas de síntesis (Pastillas)', orden: 16, medida: 'suma', grupo: 'Drogas', unidad: 'pastillas' },
];
const POR_NOMBRE = new Map(CONCEPTOS_FIJOS.map((c) => [c.concepto, c]));
const fijo = (nombre: string) => POR_NOMBRE.get(nombre)!;

/** A qué concepto del informe pertenece un registro de Operatividad. */
export function clasificarOperatividad(r: OperatividadRecord): ConceptoOperatividad {
  const cat = norm(r.categoria);

  if (cat.includes('CAPTURA')) {
    const circ = norm(r.circunstanciaCaptura);
    if (/ORDEN JUDICIAL|^O\.? ?J\b/.test(circ)) return fijo('Capturas por orden judicial');
    if (circ.includes('FLAGRAN')) return fijo('Capturas en flagrancia');
    return { concepto: 'Capturas (otra circunstancia o sin reportar)', orden: 3, medida: 'conteo', grupo: 'Capturas', unidad: 'capturas' };
  }
  if (cat.includes('AUTOMOTOR') || cat.includes('VEHICULO')) return fijo('Recuperación de automotores');
  if (cat.includes('MOTOCICLETA') || cat.includes('MOTO ')) return fijo('Recuperación de motocicletas');
  if (cat.includes('MERCANCIA') && cat.includes('RECUPERAD')) return fijo('Casos mercancía recuperada');
  if (cat.includes('MERCANCIA') && cat.includes('INCAUTAD')) return fijo('Casos mercancía incautada');
  if (cat.includes('ARMA')) {
    const permiso = norm(r.permisoArma);
    if (/\bSIN\b|^NO\b/.test(permiso)) return fijo('A/F sin permiso');
    if (/\bCON\b|^SI\b|AMPARO|SALVOCONDUCTO|PORTE|TENENCIA/.test(permiso)) return fijo('A/F con permiso');
    return { concepto: 'A/F permiso no reportado', orden: 10, medida: 'conteo', grupo: 'Armas de fuego', unidad: 'armas' };
  }
  if (cat.includes('DROGA') || cat.includes('ESTUPEFACIENTE') || cat.includes('ALUCINOGENO')) {
    const tipo = norm(`${r.claseBien} ${r.tipoBien}`);
    if (tipo.includes('COCAIN') || tipo.includes('CLORHIDRATO')) return fijo('Cocaína (Gr)');
    if (tipo.includes('HEROIN')) return fijo('Heroína (Gr)');
    if (tipo.includes('BASE')) return fijo('Base de coca (Gr)');
    if (tipo.includes('BAZUCO') || tipo.includes('BASUCO')) return fijo('Bazuco (Gr)');
    if (/MARIHUANA|MARIGUANA|CANNABIS|CRIPA|CREEPY|CRIPY|HACHIS/.test(tipo)) return fijo('Marihuana (Gr)');
    if (/SINTESIS|SINTETIC|EXTASIS|EXTASIS|PASTILLA|LSD|ANFETAMIN|METANFETAMIN|TUSI|2C-?B|MDMA|POPPER|KETAMIN/.test(tipo)) return fijo('Drogas de síntesis (Pastillas)');
    return { concepto: 'Otras drogas', orden: 17, medida: 'suma', grupo: 'Drogas', unidad: 'cantidad' };
  }
  // Cualquier categoría nueva que traiga el archivo: su propia fila,
  // contada, para no perder nada.
  const nombre = r.categoria ? r.categoria.charAt(0).toUpperCase() + r.categoria.slice(1).toLowerCase() : 'Sin categoría';
  return { concepto: nombre, orden: 50, medida: 'conteo', grupo: 'Otros', unidad: 'casos' };
}

export function valorDe(r: OperatividadRecord, c: ConceptoOperatividad): number {
  return c.medida === 'suma' ? (Number.isFinite(r.cantidad) ? r.cantidad : 0) : 1;
}

/** Suma por concepto sobre una lista de registros. */
export function totalesPorConcepto(registros: OperatividadRecord[]): Map<string, { c: ConceptoOperatividad; valor: number; casos: number }> {
  const m = new Map<string, { c: ConceptoOperatividad; valor: number; casos: number }>();
  for (const r of registros) {
    const c = clasificarOperatividad(r);
    const previo = m.get(c.concepto) ?? { c, valor: 0, casos: 0 };
    previo.valor += valorDe(r, c);
    previo.casos += 1;
    m.set(c.concepto, previo);
  }
  return m;
}
