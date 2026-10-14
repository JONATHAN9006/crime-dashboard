import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type { OperatividadRecord } from '../../types/operatividad';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import { agruparCircunstancia, cuentaComoOperatividad, gramosDroga, tipoOperatividad, type UnidadDroga } from '../../utils/operatividadConteo';

// Comparativo de Operatividad con la MISMA estructura de la tabla del
// aplicativo institucional: grupos (Capturas, Vehículos recuperados, Droga
// incautada, Armas incautadas, Casos de mercancía), sus filas y un TOTAL por
// grupo, con DIF y % frente al mismo periodo del año anterior.
// Conteos = reglas oficiales (utils/operatividadConteo):
//   Capturas: cuenta de DELITO_ASOCIADO, partida por circunstancia
//     (Orden judicial / Flagrancia).
//   Vehículos: cuenta de CLASE_BIEN (Automotores / Motocicletas).
//   Droga: suma de CANTIDAD por clase de bien (gramos → kg con el botón).
//   Armas: cuenta de CLASE_BIEN partida por PERMISO_ARMA.
//   Mercancía: cuenta de TIPO_BIEN (Recuperada / Incautada).

export interface VentanaOp { inicio: Date; fin: Date; inicioAnt: Date; finAnt: Date; anioActual: number; anioAnterior: number }

interface Fila { etiqueta: string; anterior: number; actual: number; esDroga?: boolean }
interface Grupo { titulo: string; filas: Fila[]; esDroga?: boolean }

const normalizar = (s: string) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const ORDEN_DROGA = ['COCAINA', 'HEROINA', 'BASE DE COCA', 'BAZUCO', 'BASUCO', 'MARIHUANA'];

export function construirTablaOperatividad(registros: OperatividadRecord[], v: VentanaOp): Grupo[] {
  const enRango = (r: OperatividadRecord, ini: Date, fin: Date) => !!r.fecha && r.fecha >= ini && r.fecha <= fin;
  const actuales = registros.filter((r) => enRango(r, v.inicio, v.fin));
  const anteriores = registros.filter((r) => enRango(r, v.inicioAnt, v.finAnt));

  // Suma en ambos periodos de lo que cumpla la condición (1 por registro que
  // cuenta, o gramos si es droga).
  const par = (cond: (r: OperatividadRecord) => boolean, droga = false) => {
    const valor = (r: OperatividadRecord) => (droga ? gramosDroga(r) : cuentaComoOperatividad(r) ? 1 : 0);
    return {
      anterior: anteriores.filter(cond).reduce((a, r) => a + valor(r), 0),
      actual: actuales.filter(cond).reduce((a, r) => a + valor(r), 0),
    };
  };
  const tipo = (t: ReturnType<typeof tipoOperatividad>) => (r: OperatividadRecord) => tipoOperatividad(r.categoria) === t;
  const grupos: Grupo[] = [];

  // CAPTURAS
  const esCaptura = tipo('capturas');
  const circ = (r: OperatividadRecord) => agruparCircunstancia(r.circunstanciaCaptura);
  const capturas: Fila[] = [
    { etiqueta: 'Orden judicial', ...par((r) => esCaptura(r) && circ(r) === 'Orden judicial') },
    { etiqueta: 'En flagrancia', ...par((r) => esCaptura(r) && circ(r) === 'Flagrancia') },
  ];
  const otrasCapturas = par((r) => esCaptura(r) && circ(r) !== 'Orden judicial' && circ(r) !== 'Flagrancia');
  if (otrasCapturas.anterior + otrasCapturas.actual > 0) capturas.push({ etiqueta: 'Sin circunstancia registrada', ...otrasCapturas });
  grupos.push({ titulo: 'Capturas', filas: capturas });

  // VEHÍCULOS RECUPERADOS
  grupos.push({
    titulo: 'Vehículos recuperados',
    filas: [
      { etiqueta: 'Automotores', ...par(tipo('automotores')) },
      { etiqueta: 'Motocicletas', ...par(tipo('motos')) },
    ],
  });

  // DROGA INCAUTADA — una fila por cada clase que traiga el archivo
  const esDroga = tipo('droga');
  const clases = Array.from(new Set(registros.filter(esDroga).map((r) => r.claseBien || 'Sin clase')));
  clases.sort((a, b) => {
    const ia = ORDEN_DROGA.indexOf(normalizar(a)); const ib = ORDEN_DROGA.indexOf(normalizar(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  grupos.push({
    titulo: 'Droga incautada',
    esDroga: true,
    filas: clases.map((c) => ({ etiqueta: c, esDroga: true, ...par((r) => esDroga(r) && (r.claseBien || 'Sin clase') === c, true) })),
  });

  // ARMAS INCAUTADAS — por permiso
  const esArma = tipo('armas');
  const permiso = (r: OperatividadRecord) => {
    const p = normalizar(r.permisoArma).replace(/_/g, ' ');
    return /^CON/.test(p) ? 'Con permiso' : /^SIN/.test(p) ? 'Sin permiso' : 'Sin dato de permiso';
  };
  const armas: Fila[] = [
    { etiqueta: 'Con permiso', ...par((r) => esArma(r) && permiso(r) === 'Con permiso') },
    { etiqueta: 'Sin permiso', ...par((r) => esArma(r) && permiso(r) === 'Sin permiso') },
  ];
  const armasSinDato = par((r) => esArma(r) && permiso(r) === 'Sin dato de permiso');
  if (armasSinDato.anterior + armasSinDato.actual > 0) armas.push({ etiqueta: 'Sin dato de permiso', ...armasSinDato });
  grupos.push({ titulo: 'Armas incautadas', filas: armas });

  // CASOS DE MERCANCÍA
  const esMerc = tipo('mercancia');
  grupos.push({
    titulo: 'Casos de mercancía',
    filas: [
      { etiqueta: 'Recuperada (sin vehículos)', ...par((r) => esMerc(r) && /RECUPER/.test(normalizar(r.categoria))) },
      { etiqueta: 'Incautada (sin armas de fuego)', ...par((r) => esMerc(r) && /INCAUT/.test(normalizar(r.categoria))) },
    ],
  });

  // Cualquier otra categoría que traiga el archivo (sin inventar nada).
  const otras = Array.from(new Set(registros.filter(tipo('otra')).map((r) => r.categoria)));
  if (otras.length > 0) grupos.push({ titulo: 'Otras', filas: otras.map((c) => ({ etiqueta: c, ...par((r) => r.categoria === c) })) });

  return grupos.filter((g) => g.filas.some((f) => f.anterior + f.actual > 0));
}

function Variacion({ anterior, actual }: { anterior: number; actual: number }) {
  const dif = actual - anterior;
  const pct = anterior > 0 ? (dif / anterior) * 100 : null;
  const Icono = Math.abs(dif) < 1e-9 ? Minus : dif > 0 ? ArrowUp : ArrowDown;
  const color = Math.abs(dif) < 1e-9 ? 'text-slate-400' : dif > 0 ? 'text-emerald-600' : 'text-rose-600';
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {pct === null ? (actual > 0 ? 'Nuevo' : '—') : `${pct > 0 ? '+' : ''}${formatDecimal(pct, 1)}%`}
      <Icono size={17} strokeWidth={3} className={color} />
    </span>
  );
}

export function TablaOperatividadAgrupada({ grupos, ventana, unidad }: { grupos: Grupo[]; ventana: VentanaOp; unidad: UnidadDroga }) {
  const fmt = (n: number, droga?: boolean) => (droga
    ? (unidad === 'kg' ? n / 1000 : n).toLocaleString('es-CO', { maximumFractionDigits: unidad === 'kg' ? 1 : 0 })
    : formatNumero(n));
  const fmtDif = (n: number, droga?: boolean) => `${n > 0 ? '+' : ''}${fmt(n, droga)}`;
  const celda = 'border-b border-slate-200 px-2 py-[7px]';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] table-auto border-separate border-spacing-0 text-[15px]">
        <thead>
          <tr className="text-white">
            <th rowSpan={2} colSpan={2} className="rounded-tl-md bg-[#0f5f57] px-3 py-2 text-center text-[14.5px] font-bold uppercase">Tipo de operatividad</th>
            <th rowSpan={2} className="bg-[#10233f] px-2 py-2 text-center text-[17px] font-bold">{ventana.anioAnterior}</th>
            <th rowSpan={2} className="bg-[#10233f] px-2 py-2 text-center text-[17px] font-bold">{ventana.anioActual}</th>
            <th colSpan={2} className="rounded-tr-md bg-[#0f5f57] px-2 pt-1.5 text-center text-[13.5px] font-bold uppercase">Variación</th>
          </tr>
          <tr className="text-white">
            <th className="bg-[#0f5f57] px-2 pb-1.5 text-center text-[13px] font-bold uppercase">Dif.</th>
            <th className="bg-[#0f5f57] px-2 pb-1.5 text-center text-[13px] font-bold">%</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => {
            const totAnt = g.filas.reduce((a, f) => a + f.anterior, 0);
            const totAct = g.filas.reduce((a, f) => a + f.actual, 0);
            return [
              ...g.filas.map((f, i) => (
                <tr key={`${g.titulo}-${f.etiqueta}`}>
                  {i === 0 && (
                    <td rowSpan={g.filas.length + 1} className="w-[22%] border-b border-r border-slate-300 bg-slate-50 px-3 py-2 text-center text-[14.5px] font-bold uppercase leading-tight text-[#10233f]">
                      {g.titulo}
                      {g.esDroga && <span className="block text-[12.5px] font-semibold normal-case text-slate-500">({unidad === 'kg' ? 'Kilogramos' : 'Gramos'})</span>}
                    </td>
                  )}
                  <td className={`${celda} font-semibold text-[#10233f]`}>{f.etiqueta}</td>
                  <td className={`${celda} text-center tabular-nums text-slate-700`}>{fmt(f.anterior, f.esDroga)}</td>
                  <td className={`${celda} text-center tabular-nums text-slate-700`}>{fmt(f.actual, f.esDroga)}</td>
                  <td className={`${celda} text-center tabular-nums text-slate-700`}>{fmtDif(f.actual - f.anterior, f.esDroga)}</td>
                  <td className={`${celda} whitespace-nowrap pr-3 text-right tabular-nums text-[14px] text-slate-600`}><Variacion anterior={f.anterior} actual={f.actual} /></td>
                </tr>
              )),
              <tr key={`${g.titulo}-total`} className="bg-slate-200/70 font-bold text-[#10233f]">
                <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center text-[13.5px] uppercase">Total</td>
                <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{fmt(totAnt, g.esDroga)}</td>
                <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{fmt(totAct, g.esDroga)}</td>
                <td className="border-b-2 border-slate-300 px-2 py-[7px] text-center tabular-nums">{fmtDif(totAct - totAnt, g.esDroga)}</td>
                <td className="whitespace-nowrap border-b-2 border-slate-300 py-[7px] pl-2 pr-3 text-right tabular-nums text-[14px]"><Variacion anterior={totAnt} actual={totAct} /></td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
