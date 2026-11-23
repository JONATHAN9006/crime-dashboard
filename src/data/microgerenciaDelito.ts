// Análisis específico por DELITO para la lámina «MICROGERENCIA | ANÁLISIS
// ESPECÍFICO POR DELITO». Todo sale de los registros ya filtrados por
// useMicrogerencia (mismos periodos, mismas reglas: se cuentan registros):
//   · t = total del año anterior (1 ene – 31 dic)
//   · a = año anterior hasta el mismo día y mes del corte
//   · b = año actual hasta el corte
// Las variables específicas se eligen POR DELITO (inventario de la matriz) y
// solo se muestran si los datos cargados traen valores válidos para ese
// delito: nada se inventa ni se rellena con ceros.
import type { CrimeRecord } from '../types/crime';
import type { DatosMicrogerencia, FilaTriple, NodoMicrogerencia } from './microgerencia';
import { predicadoDeNodo } from '../hooks/useMicrogerencia';
import { esZonaSinCuadrante } from '../utils/zonasAtencion';
// Nombre de zona sin el sufijo de estación que agrega Microgerencia.
const nombreZona = (n: string) => n.replace(/\s*\(.*\)\s*$/, '');

export type ClaveVariable =
  | 'modalidad' | 'armas' | 'causaLesion' | 'claseSitio' | 'conductas' | 'spoa' | 'unidadApoya'
  | 'movilAgresor' | 'movilVictima' | 'genero' | 'grupoEdad' | 'pais';

// Columnas que no tienen campo propio: se leen del registro crudo por el
// nombre del encabezado (tolerante a tildes, espacios y guiones).
const normEnc = (k: string) => k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const cacheClave = new Map<string, string | null>();
function deRaw(r: CrimeRecord, patron: RegExp, id: string): string {
  const raw = r.raw;
  if (!raw) return '';
  const claves = Object.keys(raw);
  const firma = `${id}|${claves.length}|${claves[0] ?? ''}`;
  let clave = cacheClave.get(firma);
  if (clave === undefined) {
    clave = claves.find((k) => patron.test(normEnc(k))) ?? null;
    cacheClave.set(firma, clave);
  }
  return clave ? String(raw[clave] ?? '') : '';
}

export const VARIABLES_DELITO: Record<ClaveVariable, { titulo: string; valor: (r: CrimeRecord) => string; forma: 'dona' | 'barras' }> = {
  modalidad: { titulo: 'Modalidad', valor: (r) => r.modalidad, forma: 'barras' },
  armas: { titulo: 'Arma o medio empleado', valor: (r) => r.armas, forma: 'barras' },
  causaLesion: { titulo: 'Causa de lesión o muerte', valor: (r) => r.causaLesion, forma: 'barras' },
  claseSitio: { titulo: 'Clase de sitio', valor: (r) => r.claseSitio, forma: 'barras' },
  conductas: { titulo: 'Conductas especiales', valor: (r) => deRaw(r, /CONDUCTAS?_ESPECIAL/, 'conductas'), forma: 'barras' },
  spoa: { titulo: 'Caracterización SPOA', valor: (r) => deRaw(r, /CARACTERIZ.*SPOA|SPOA.*CARACTERIZ|^CARACTERIZACION/, 'spoa'), forma: 'barras' },
  unidadApoya: { titulo: 'Unidad que apoya', valor: (r) => deRaw(r, /UNIDAD.*APOY|APOYA/, 'apoya'), forma: 'barras' },
  movilAgresor: { titulo: 'Movilidad del agresor', valor: (r) => r.movilAgresor ?? r.raw?.MOVIL_AGRESOR ?? '', forma: 'dona' },
  movilVictima: { titulo: 'Movilidad de la víctima', valor: (r) => r.movilVictima ?? r.raw?.MOVIL_VICTIMA ?? '', forma: 'dona' },
  genero: { titulo: 'Género de la víctima', valor: (r) => r.genero, forma: 'dona' },
  grupoEdad: { titulo: 'Grupo de edad de la víctima', valor: (r) => r.grupoEdad, forma: 'barras' },
  pais: { titulo: 'País de la persona', valor: (r) => deRaw(r, /^PAIS(_PERSONA)?$/, 'pais'), forma: 'barras' },
};

const sinTildes = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Plantilla de cada delito: variables en orden de prioridad y las de baja
 *  cobertura conocida (se muestran solo con advertencia y al final). */
interface Plantilla { variables: ClaveVariable[]; bajaCobertura?: ClaveVariable[]; sensible?: boolean; compacta?: boolean }
export function plantillaDelito(delito: string): Plantilla {
  const n = sinTildes(delito);
  const hurtoBienes: ClaveVariable[] = ['modalidad', 'armas', 'claseSitio', 'conductas', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima'];
  if (/HOMICIDIO.*\bAT\b|HOMICIDIO.*TRANSITO/.test(n)) return { variables: ['modalidad', 'claseSitio', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima'], bajaCobertura: ['armas', 'causaLesion'] };
  if (/HOMICID/.test(n)) return { variables: ['causaLesion', 'armas', 'modalidad', 'claseSitio', 'conductas', 'spoa', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima'] };
  if (/LESIONES.*\bAT\b|LESION.*TRANSITO/.test(n)) return { variables: ['claseSitio', 'armas', 'grupoEdad', 'genero', 'movilAgresor', 'movilVictima'], bajaCobertura: ['modalidad', 'causaLesion'] };
  if (/LESION|^L\.\s*PERSON/.test(n)) return { variables: ['modalidad', 'armas', 'causaLesion', 'claseSitio', 'conductas', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima'] };
  if (/INTRAFAM|^V\.\s*INTRA/.test(n)) return { variables: ['modalidad', 'armas', 'causaLesion', 'claseSitio', 'conductas', 'genero', 'grupoEdad', 'movilVictima'], sensible: true };
  if (/SEXUAL/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'genero', 'grupoEdad'], bajaCobertura: ['causaLesion'], sensible: true };
  if (/SECUESTR/.test(n)) return { variables: ['armas', 'claseSitio', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima', 'modalidad'], sensible: true, compacta: true };
  if (/EXTORS/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'movilAgresor', 'genero', 'grupoEdad'] };
  if (/TERROR/.test(n)) return { variables: ['armas', 'claseSitio', 'conductas', 'movilVictima'], sensible: true, compacta: true };
  if (/CELULAR/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'genero', 'grupoEdad', 'spoa', 'movilAgresor', 'movilVictima'] };
  if (/BICICLET/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'spoa', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima'], compacta: true };
  if (/CABLE/.test(n)) return { variables: ['claseSitio', 'conductas', 'modalidad', 'unidadApoya', 'spoa', 'movilAgresor'], bajaCobertura: ['genero', 'grupoEdad'], compacta: true };
  if (/SEMOVIENT|ABIGEAT/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'genero', 'grupoEdad'], compacta: true };
  if (/RESIDENC/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'spoa', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima'] };
  if (/COMERCIO/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'movilAgresor', 'movilVictima'] };
  if (/PERSONAS/.test(n)) return { variables: ['modalidad', 'armas', 'claseSitio', 'conductas', 'spoa', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima', 'pais'] };
  if (/MOTO|AUTOMOTOR/.test(n)) return { variables: hurtoBienes };
  return { variables: ['modalidad', 'armas', 'claseSitio', 'genero', 'grupoEdad', 'movilAgresor', 'movilVictima', 'conductas'] };
}

/** Valores que no son información (no se cuentan en las variables). */
export const esValorValido = (v: string | null | undefined) => {
  const t = String(v ?? '').trim();
  return !!t && !/^(no reportad[oa]|sin dato|sin informaci[oó]n|no aplica|n\/?a|ninguno|-+|\.|0|sin establecer|no registra|desconocid[oa]|null|undefined)$/i.test(t);
};

export interface VariableDelito {
  clave: ClaveVariable; titulo: string; forma: 'dona' | 'barras';
  filas: { nombre: string; valor: number }[];
  /** Casos con valor válido (base de los porcentajes). */
  total: number;
  /** % de los casos del año actual que traen dato válido. */
  cobertura: number;
  bajaCobertura: boolean;
}

export interface AnalisisDelito {
  delito: string;
  t: number; a: number; b: number;
  /** % del delito sobre el total de delitos de la unidad (año actual al corte). */
  participacion: number | null;
  meses: { a: number; b: number; ant: number }[];
  trimestres: { a: number; b: number }[];
  sub: { singular: string; filas: FilaTriple[] };
  zonas: FilaTriple[];
  barrios: FilaTriple[];
  /** Lunes … domingo (año actual al corte). */
  dias: number[];
  /** 00–05:59 · 06–11:59 · 12–17:59 · 18–23:59 (año actual al corte, con hora válida). */
  franjas: number[];
  variables: VariableDelito[];
  sensible: boolean;
  compacta: boolean;
}

function subunidadesDe(nodo: NodoMicrogerencia, esGeneral: boolean): { singular: string; nodos: NodoMicrogerencia[] } {
  const hijos = esGeneral ? nodo.hijos.flatMap((d) => d.hijos) : nodo.hijos;
  const validos = hijos.filter((h) => !/no reportad/i.test(h.nombre));
  if (validos.length === 0) return { singular: '', nodos: [] };
  const tipo = validos[0].tipo;
  return { singular: tipo === 'estacion' ? 'Estación' : tipo === 'cai' ? 'CAI' : 'Zona', nodos: validos };
}

const ordenEdad = (n: string) => { const m = n.match(/\d+/); return m ? Number(m[0]) : 999; };

export function analizarDelito(datos: DatosMicrogerencia, nodo: NodoMicrogerencia, esGeneral: boolean, delito: string): AnalisisDelito | null {
  const reg = datos.registros;
  if (!reg) return null;
  const plantilla = plantillaDelito(delito);
  const enUnidad = esGeneral ? () => true : predicadoDeNodo(nodo);
  const pred = (r: CrimeRecord) => r.delito === delito && enUnidad(r);
  const T = reg.completo.filter(pred), Aa = reg.anterior.filter(pred), B = reg.actual.filter(pred);

  const porMes = (l: CrimeRecord[]) => { const m = new Array<number>(12).fill(0); for (const r of l) if (r.mes != null && r.mes >= 1 && r.mes <= 12) m[r.mes - 1]++; return m; };
  const mT = porMes(T), mA = porMes(Aa), mB = porMes(B);
  // a = año anterior COMPLETO por mes (para ver el año entero), ant = al corte.
  const meses = mT.map((v, i) => ({ a: v, b: mB[i], ant: mA[i] }));
  // Trimestres en periodos EQUIVALENTES: el año anterior hasta el mismo día
  // del corte (en los trimestres completos es igual al año completo).
  const trimestres = [0, 1, 2, 3].map((q) => ({ a: mA.slice(q * 3, q * 3 + 3).reduce((s, x) => s + x, 0), b: mB.slice(q * 3, q * 3 + 3).reduce((s, x) => s + x, 0) }));

  const triple = (p: (r: CrimeRecord) => boolean) => ({ t: T.filter(p).length, a: Aa.filter(p).length, b: B.filter(p).length });
  const { singular, nodos } = subunidadesDe(nodo, esGeneral);
  const sub = { singular, filas: nodos.map((n) => ({ nombre: n.nombre, ...triple(predicadoDeNodo(n)) })) };

  // Zonas de atención de la unidad (intersección con la cobertura).
  const zonas = (datos.zonas ?? [])
    .filter((z) => !esZonaSinCuadrante(nombreZona(z.nombre)))
    .map((z) => ({ nombre: z.nombre, ...triple(predicadoDeNodo(z)) }))
    .filter((z) => z.t + z.a + z.b > 0)
    .sort((x, y) => y.b - x.b || y.a - x.a);

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
  const claves = [...plantilla.variables, ...(plantilla.bajaCobertura ?? [])];
  for (const clave of claves) {
    const def = VARIABLES_DELITO[clave];
    const m = new Map<string, number>();
    for (const r of B) {
      const v = String(def.valor(r) ?? '').trim();
      if (!esValorValido(v)) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    let filas = Array.from(m, ([nombre, valor]) => ({ nombre, valor }));
    if (filas.length === 0) continue;
    // Delitos sensibles: categorías con menos de 3 casos se agrupan para no
    // permitir identificar personas.
    if (plantilla.sensible && (clave === 'genero' || clave === 'grupoEdad' || clave === 'movilVictima' || clave === 'pais')) {
      const chicas = filas.filter((f) => f.valor < 3);
      if (chicas.length > 0 && filas.length > 1) {
        filas = [...filas.filter((f) => f.valor >= 3), { nombre: 'Otros (menos de 3)', valor: chicas.reduce((s, f) => s + f.valor, 0) }];
      }
    }
    filas.sort(clave === 'grupoEdad' ? (x, y) => ordenEdad(x.nombre) - ordenEdad(y.nombre) : (x, y) => y.valor - x.valor);
    // Una variable con un solo valor no aporta lectura (salvo demografía).
    if (filas.length < 2 && clave !== 'genero' && clave !== 'grupoEdad') continue;
    const total = filas.reduce((s, f) => s + f.valor, 0);
    variables.push({
      clave, titulo: def.titulo, forma: def.forma, filas, total,
      cobertura: B.length > 0 ? (total / B.length) * 100 : 0,
      bajaCobertura: (plantilla.bajaCobertura ?? []).includes(clave),
    });
  }

  return {
    delito, t: T.length, a: Aa.length, b: B.length,
    participacion: nodo.fecha2026 > 0 ? (B.length / nodo.fecha2026) * 100 : null,
    meses, trimestres, sub, zonas, barrios, dias, franjas, variables,
    sensible: !!plantilla.sensible, compacta: !!plantilla.compacta,
  };
}
