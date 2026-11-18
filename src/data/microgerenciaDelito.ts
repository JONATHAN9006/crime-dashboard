// Análisis específico por DELITO para la lámina «MICROGERENCIA | ANÁLISIS
// ESPECÍFICO POR DELITO». Todo sale de los registros ya filtrados por
// useMicrogerencia (mismos periodos, mismas reglas: se cuentan registros):
//   · t = total del año anterior (1 ene – 31 dic)
//   · a = año anterior hasta el mismo día y mes del corte
//   · b = año actual hasta el corte
// Las variables específicas se eligen POR DELITO y solo si la matriz trae
// valores válidos para ese delito (nada se inventa ni se rellena).
import type { CrimeRecord } from '../types/crime';
import type { DatosMicrogerencia, FilaTriple, NodoMicrogerencia } from './microgerencia';
import { predicadoDeNodo } from '../hooks/useMicrogerencia';

export type ClaveVariable = 'modalidad' | 'armas' | 'causaLesion' | 'claseSitio' | 'movilAgresor' | 'movilVictima' | 'genero' | 'grupoEdad';

export const VARIABLES_DELITO: Record<ClaveVariable, { titulo: string; valor: (r: CrimeRecord) => string }> = {
  modalidad: { titulo: 'Modalidad', valor: (r) => r.modalidad },
  armas: { titulo: 'Arma o medio empleado', valor: (r) => r.armas },
  causaLesion: { titulo: 'Causa de la lesión', valor: (r) => r.causaLesion },
  claseSitio: { titulo: 'Clase de sitio', valor: (r) => r.claseSitio },
  movilAgresor: { titulo: 'Móvil del agresor', valor: (r) => r.movilAgresor ?? r.raw?.MOVIL_AGRESOR ?? '' },
  movilVictima: { titulo: 'Móvil de la víctima', valor: (r) => r.movilVictima ?? r.raw?.MOVIL_VICTIMA ?? '' },
  genero: { titulo: 'Género de la víctima', valor: (r) => r.genero },
  grupoEdad: { titulo: 'Grupo de edad de la víctima', valor: (r) => r.grupoEdad },
};

const TODAS: ClaveVariable[] = ['modalidad', 'armas', 'movilAgresor', 'claseSitio', 'causaLesion', 'movilVictima', 'genero', 'grupoEdad'];

/** Orden de interés de las variables según el tipo de delito. */
function prioridad(delito: string): ClaveVariable[] {
  const n = delito.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/HOMICID/.test(n)) return ['armas', 'movilAgresor', 'claseSitio', 'genero', 'grupoEdad', 'modalidad'];
  if (/LESION|^L\.\s*PERSON/.test(n)) return ['armas', 'causaLesion', 'claseSitio', 'genero', 'grupoEdad', 'modalidad'];
  if (/INTRAFAM|^V\.\s*INTRA|SEXUAL/.test(n)) return ['genero', 'grupoEdad', 'armas', 'claseSitio', 'modalidad'];
  if (/EXTORS|SECUESTR/.test(n)) return ['modalidad', 'armas', 'claseSitio', 'genero', 'grupoEdad'];
  if (/TERROR/.test(n)) return ['modalidad', 'armas', 'claseSitio'];
  if (/HURTO|^H\.|PIRATER/.test(n)) return ['modalidad', 'armas', 'movilAgresor', 'claseSitio', 'movilVictima'];
  return TODAS;
}

/** Valores que no son información (no se cuentan en las variables). */
export const esValorValido = (v: string | null | undefined) => {
  const t = String(v ?? '').trim();
  return !!t && !/^(no reportad[oa]|sin dato|sin informaci[oó]n|no aplica|n\/?a|ninguno|-+|\.|0|sin establecer|no registra|desconocid[oa])$/i.test(t);
};

export interface VariableDelito { clave: ClaveVariable; titulo: string; filas: { nombre: string; valor: number }[]; total: number }

export interface AnalisisDelito {
  delito: string;
  t: number; a: number; b: number;
  /** % del delito sobre el total de delitos de la unidad (año actual al corte). */
  participacion: number | null;
  meses: { a: number; b: number }[];
  trimestres: { a: number; b: number }[];
  sub: { singular: string; filas: FilaTriple[] };
  barrios: FilaTriple[];
  /** Lunes … domingo (año actual al corte). */
  dias: number[];
  /** 00–05:59 · 06–11:59 · 12–17:59 · 18–23:59 (año actual al corte, con hora válida). */
  franjas: number[];
  variables: VariableDelito[];
}

function subunidadesDe(nodo: NodoMicrogerencia, esGeneral: boolean): { singular: string; nodos: NodoMicrogerencia[] } {
  const hijos = esGeneral ? nodo.hijos.flatMap((d) => d.hijos) : nodo.hijos;
  const validos = hijos.filter((h) => !/no reportad/i.test(h.nombre));
  if (validos.length === 0) return { singular: '', nodos: [] };
  const tipo = validos[0].tipo;
  return { singular: tipo === 'estacion' ? 'Estación' : tipo === 'cai' ? 'CAI' : 'Zona', nodos: validos };
}

export function analizarDelito(datos: DatosMicrogerencia, nodo: NodoMicrogerencia, esGeneral: boolean, delito: string, maxVariables = 3): AnalisisDelito | null {
  const reg = datos.registros;
  if (!reg) return null;
  const enUnidad = esGeneral ? () => true : predicadoDeNodo(nodo);
  const pred = (r: CrimeRecord) => r.delito === delito && enUnidad(r);
  const T = reg.completo.filter(pred), Aa = reg.anterior.filter(pred), B = reg.actual.filter(pred);

  const meses = Array.from({ length: 12 }, (_, i) => ({ a: T.filter((r) => r.mes === i + 1).length, b: B.filter((r) => r.mes === i + 1).length }));
  const trimestres = [0, 1, 2, 3].map((q) => ({ a: meses.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.a, 0), b: meses.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.b, 0) }));

  const { singular, nodos } = subunidadesDe(nodo, esGeneral);
  const sub = {
    singular,
    filas: nodos.map((n) => {
      const p = predicadoDeNodo(n);
      return { nombre: n.nombre, t: T.filter(p).length, a: Aa.filter(p).length, b: B.filter(p).length };
    }),
  };

  const porBarrio = new Map<string, FilaTriple>();
  ([['t', T], ['a', Aa], ['b', B]] as const).forEach(([campo, lista]) => {
    for (const r of lista) {
      const n = (r.barrioHecho ?? '').trim();
      if (!esValorValido(n) || /^sin /i.test(n)) continue;
      const f = porBarrio.get(n) ?? { nombre: n, t: 0, a: 0, b: 0 };
      f[campo]++;
      porBarrio.set(n, f);
    }
  });
  const barrios = Array.from(porBarrio.values()).sort((x, y) => y.b - x.b || y.a - x.a).slice(0, 10);

  const dias = Array(7).fill(0);
  const franjas = Array(4).fill(0);
  for (const r of B) {
    if (r.diaSemanaIndex != null && r.diaSemanaIndex >= 0 && r.diaSemanaIndex < 7) dias[r.diaSemanaIndex]++;
    if (r.hora != null && r.hora >= 0 && r.hora < 24) franjas[Math.floor(r.hora / 6)]++;
  }

  const variables: VariableDelito[] = [];
  for (const clave of [...prioridad(delito), ...TODAS.filter((c) => !prioridad(delito).includes(c))]) {
    if (variables.length >= maxVariables) break;
    const m = new Map<string, number>();
    for (const r of B) {
      const v = String(VARIABLES_DELITO[clave].valor(r) ?? '').trim();
      if (!esValorValido(v)) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    const filas = Array.from(m, ([nombre, valor]) => ({ nombre, valor })).sort((x, y) => y.valor - x.valor);
    // Una variable con un único valor no aporta lectura (ej. todo «Femenino»
    // en delitos sexuales sí aporta: se deja si hay al menos 1 registro).
    if (filas.length === 0) continue;
    variables.push({ clave, titulo: VARIABLES_DELITO[clave].titulo, filas, total: filas.reduce((s, f) => s + f.valor, 0) });
  }

  return {
    delito, t: T.length, a: Aa.length, b: B.length,
    participacion: nodo.fecha2026 > 0 ? (B.length / nodo.fecha2026) * 100 : null,
    meses, trimestres, sub, barrios, dias, franjas, variables,
  };
}
