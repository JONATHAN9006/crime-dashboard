import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { VariacionPct, claseDif } from './ComparativoComun';

// Comparativo de delitos con la MISMA estructura de la tabla institucional:
// filas sueltas (Homicidio, Lesiones, Feminicidios), «Modalidades de hurto»
// y «Modalidades de secuestro» con su TOTAL, y luego Delitos sexuales,
// Extorsión, Piratería, Terrorismo y Violencia intrafamiliar. Sin Hurto a
// celular, bicicletas, cable ni acciones subversivas (a pedido).

export interface CifraDelito { key: string; anterior: number; actual: number }
interface FilaT { etiqueta: string; anterior: number; actual: number }
interface Seccion { titulo?: string; filas: FilaT[] }

const norm = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
type Regla = [RegExp, string];
const SUELTAS_ARRIBA: Regla[] = [
  [/^HOMICIDIO$/, 'Homicidio doloso o intencional'],
  [/^L\.?\s*PERSONALES$|^LESIONES PERSONALES$/, 'Lesiones personales'],
  [/FEMINICID/, 'Feminicidios'],
];
const HURTO: Regla[] = [
  [/^H\.?\s*PERSONAS$/, 'Hurto personas'],
  [/^H\.?\s*RESIDENCIAS$/, 'Hurto residencias'],
  [/^H\.?\s*COMERCIO$/, 'Hurto comercio'],
  [/^H\.?\s*AUTOMOTORES$/, 'Hurto automotores'],
  [/^H\.?\s*MOTOS$/, 'Hurto motocicletas'],
  [/FINANCIERA|BANCO/, 'Hurto bancos'],
  [/SEMOVIENTE|ABIGEATO|GANADO/, 'Hurto a semovientes'],
];
const SECUESTRO: Regla[] = [
  [/^SECUESTRO SIMPLE$/, 'Secuestro simple'],
  [/^SECUESTRO EXTORSIVO$/, 'Secuestro extorsivo'],
];
const SUELTAS_ABAJO: Regla[] = [
  [/^DELITOS SEXUALES$/, 'Delitos sexuales'],
  [/^EXTORSION$/, 'Extorsión'],
  [/PIRATERIA/, 'Piratería'],
  [/^TERRORISMO$/, 'Terrorismo'],
  [/^V\.?\s*INTRAFAMILIAR$|VIOLENCIA INTRAFAMILIAR/, 'Violencia intrafamiliar'],
];
// Fuera de la tabla (a pedido) y los que MEPOY no mide.
const EXCLUIDOS = /CELULAR|BICICLETA|CABLE|SUBVERSIV|EN AT$|\bAT$/;

export function construirTablaDelitos(cifras: CifraDelito[], soloConDatos = false): Seccion[] {
  const usados = new Set<string>();
  const tomar = (reglas: Regla[]): FilaT[] => reglas.map(([re, etiqueta]) => {
    const encontrados = cifras.filter((c) => !usados.has(c.key) && re.test(norm(c.key)));
    encontrados.forEach((c) => usados.add(c.key));
    return {
      etiqueta,
      anterior: encontrados.reduce((a, c) => a + c.anterior, 0),
      actual: encontrados.reduce((a, c) => a + c.actual, 0),
      existe: encontrados.length > 0,
    };
  }).filter((f) => f.existe || (!soloConDatos && f.etiqueta !== 'Feminicidios')).map(({ etiqueta, anterior, actual }) => ({ etiqueta, anterior, actual }));
  cifras.filter((c) => EXCLUIDOS.test(norm(c.key))).forEach((c) => usados.add(c.key));
  const arriba = tomar(SUELTAS_ARRIBA);
  const hurto = tomar(HURTO);
  const secuestro = tomar(SECUESTRO);
  const abajo = tomar(SUELTAS_ABAJO);
  // Cualquier otro delito que traiga la base (sin inventar ni perder nada).
  const otros = cifras.filter((c) => !usados.has(c.key)).map((c) => ({ etiqueta: c.key, anterior: c.anterior, actual: c.actual }));
  return [
    { filas: arriba },
    { titulo: 'Modalidades de hurto', filas: hurto },
    { titulo: 'Modalidades de secuestro', filas: secuestro },
    { filas: [...abajo, ...otros] },
  ].filter((s) => s.filas.length > 0);
}

export function TablaDelitosAgrupada({ secciones, anioAnterior, anioActual, mostrarAporte }: { secciones: Seccion[]; anioAnterior: number; anioActual: number; mostrarAporte: boolean }) {
  const todas = secciones.flatMap((s) => s.filas);
  const granAnt = todas.reduce((a, f) => a + f.anterior, 0);
  const granAct = todas.reduce((a, f) => a + f.actual, 0);
  const aporte = (n: number) => (mostrarAporte ? <span className="block whitespace-nowrap text-[11.5px] font-semibold text-[#1d4ed8]">{granAct > 0 ? `${formatDecimal((n / granAct) * 100, 1)}%` : '—'} aporte</span> : null);
  const fmtDif = (n: number) => `${n > 0 ? '+' : ''}${formatNumero(n)}`;
  const celda = 'border-b border-slate-200 px-2 py-[7px]';
  const filaDatos = (f: FilaT) => (
    <>
      <td className={`${celda} text-center tabular-nums text-slate-700`}>{formatNumero(f.anterior)}</td>
      <td className={`${celda} text-center tabular-nums text-slate-700`}>{formatNumero(f.actual)}{aporte(f.actual)}</td>
      <td className={`${celda} text-center font-semibold tabular-nums ${claseDif(f.actual - f.anterior, false)}`}>{fmtDif(f.actual - f.anterior)}</td>
      <td className={`${celda} whitespace-nowrap pr-3 text-right text-[14px]`}><VariacionPct anterior={f.anterior} actual={f.actual} subirEsBueno={false} /></td>
    </>
  );
  const filaTotal = (titulo: string, ant: number, act: number, fuerte = false) => (
    <tr key={titulo} className={fuerte ? 'bg-[#10233f] font-bold text-white' : 'bg-slate-200/70 font-bold text-[#10233f]'}>
      <td colSpan={fuerte ? 2 : 1} className={`border-b-2 border-slate-300 px-3 py-[7px] text-[13.5px] uppercase ${fuerte ? 'rounded-bl-md' : 'text-center'}`}>{titulo}</td>
      <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{formatNumero(ant)}</td>
      <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{formatNumero(act)}{fuerte ? null : aporte(act)}</td>
      <td className={`border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums ${fuerte ? '' : claseDif(act - ant, false)}`}>{fmtDif(act - ant)}</td>
      <td className={`whitespace-nowrap border-b-2 border-slate-300 py-[7px] pl-2 pr-3 text-right text-[14px] ${fuerte ? 'rounded-br-md' : ''}`}><VariacionPct anterior={ant} actual={act} subirEsBueno={false} negrita /></td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] table-auto border-separate border-spacing-0 text-[15px]">
        <thead>
          <tr className="text-white">
            <th rowSpan={2} colSpan={2} className="rounded-tl-md bg-[#0f5f57] px-3 py-2 text-center text-[14.5px] font-bold uppercase">Tipo de delito</th>
            <th rowSpan={2} className="bg-[#10233f] px-2 py-2 text-center text-[17px] font-bold">{anioAnterior}</th>
            <th rowSpan={2} className="bg-[#10233f] px-2 py-2 text-center text-[17px] font-bold">{anioActual}</th>
            <th colSpan={2} className="rounded-tr-md bg-[#0f5f57] px-2 pt-1.5 text-center text-[13.5px] font-bold uppercase">Variación</th>
          </tr>
          <tr className="text-white">
            <th className="bg-[#0f5f57] px-2 pb-1.5 text-center text-[13px] font-bold uppercase">Dif.</th>
            <th className="bg-[#0f5f57] px-2 pb-1.5 text-center text-[13px] font-bold">%</th>
          </tr>
        </thead>
        <tbody>
          {secciones.flatMap((s, si) => {
            if (!s.titulo) {
              return s.filas.map((f) => (
                <tr key={`${si}-${f.etiqueta}`}>
                  <td colSpan={2} className={`${celda} px-3 font-semibold uppercase text-[#10233f]`}>{f.etiqueta}</td>
                  {filaDatos(f)}
                </tr>
              ));
            }
            const totAnt = s.filas.reduce((a, f) => a + f.anterior, 0);
            const totAct = s.filas.reduce((a, f) => a + f.actual, 0);
            return [
              ...s.filas.map((f, i) => (
                <tr key={`${si}-${f.etiqueta}`}>
                  {i === 0 && (
                    <td rowSpan={s.filas.length + 1} className="w-[20%] border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-center text-[14.5px] font-bold uppercase leading-tight text-[#10233f]">{s.titulo}</td>
                  )}
                  <td className={`${celda} font-semibold uppercase text-[#10233f]`}>{f.etiqueta}</td>
                  {filaDatos(f)}
                </tr>
              )),
              filaTotal(`Total ${s.titulo?.replace('Modalidades de ', '')}`, totAnt, totAct),
            ];
          })}
          {filaTotal('Total general', granAnt, granAct, true)}
        </tbody>
      </table>
    </div>
  );
}
