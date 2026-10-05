import type { ReactNode } from 'react';
import { useData } from '../../context/DataContext';
import { formatDecimal, formatFecha, formatFechaHora, formatNumero } from '../../utils/aggregations';

// Piezas visuales del Resumen ejecutivo, maquetadas según la imagen de
// referencia. Solo presentan: todas las cifras llegan calculadas desde
// ResumenEjecutivo con los datos y filtros reales.

export const AZUL_TINTA = '#10233f';

export function IconoEscudo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M20 2 L35 7 V18 C35 28 28.5 35 20 38 C11.5 35 5 28 5 18 V7 Z" fill="#1d3a6b" />
      <path d="M20 5.5 L32 9.5 V18.3 C32 26.4 26.9 32.2 20 34.8 C13.1 32.2 8 26.4 8 18.3 V9.5 Z" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M20 11 L22.4 17.3 L29 17.5 L23.8 21.6 L25.6 28 L20 24.3 L14.4 28 L16.2 21.6 L11 17.5 L17.6 17.3 Z" fill="#ffffff" />
    </svg>
  );
}

export function KpiResumen({ titulo, valor, detalle, nota, icono, fondoIcono, fondo = 'bg-white', colorDetalle = 'text-slate-500' }: {
  titulo: string;
  valor: string;
  detalle?: ReactNode;
  nota?: string;
  icono: ReactNode;
  fondoIcono: string;
  fondo?: string;
  colorDetalle?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 ${fondo}`}>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${fondoIcono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{titulo}</p>
        <p className={`truncate font-bold leading-tight ${valor.length > 12 ? 'text-[18px]' : 'text-[22px]'}`} style={{ color: AZUL_TINTA }} title={valor}>{valor}</p>
        {detalle && <p className={`truncate text-[12.5px] font-medium ${colorDetalle}`}>{detalle}</p>}
        {nota && <p className="truncate text-[11px] text-slate-400">{nota}</p>}
      </div>
    </div>
  );
}

const COLORES_TOP5 = ['#ef3e55', '#1f3a6e', '#14a37f', '#1e4f8f', '#8a86da', '#a3acb9'];

export function Top5Dona({ filas, total }: { filas: { key: string; casos: number }[]; total: number }) {
  const sumaTop = filas.reduce((a, f) => a + f.casos, 0);
  const otros = Math.max(0, total - sumaTop);
  const items = [...filas.map((f, i) => ({ ...f, color: COLORES_TOP5[i] })), ...(otros > 0 ? [{ key: 'Otros', casos: otros, color: COLORES_TOP5[5] }] : [])];
  const R = 62, r = 38, C = 80;
  let ang = -Math.PI / 2;
  const arcos = items.map((it) => {
    const frac = total > 0 ? it.casos / total : 0;
    const a0 = ang, a1 = ang + frac * Math.PI * 2;
    ang = a1;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    const d = frac >= 0.9999
      ? `M ${p(R, 0)} A ${R} ${R} 0 1 1 ${p(R, Math.PI)} A ${R} ${R} 0 1 1 ${p(R, 0)} M ${p(r, 0)} A ${r} ${r} 0 1 0 ${p(r, Math.PI)} A ${r} ${r} 0 1 0 ${p(r, 0)} Z`
      : `M ${p(R, a0)} A ${R} ${R} 0 ${grande} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${grande} 0 ${p(r, a0)} Z`;
    return { ...it, d };
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg width={160} height={160} viewBox="0 0 160 160" className="shrink-0" role="img" aria-label="Distribución de los delitos más afectados">
        {arcos.map((a) => <path key={a.key} d={a.d} fill={a.color} stroke="#ffffff" strokeWidth="1.5" />)}
        <text x={C} y={C - 1} textAnchor="middle" fontSize="19" fontWeight="700" fill={AZUL_TINTA}>{formatNumero(total)}</text>
        <text x={C} y={C + 16} textAnchor="middle" fontSize="11.5" fill="#64748b">casos</text>
      </svg>
      <table className="min-w-[200px] flex-1 text-[13px]">
        <tbody>
          {items.map((it) => (
            <tr key={it.key}>
              <td className="py-[3px] pr-2"><span className="mr-2 inline-block h-3 w-3 rounded-sm align-[-1px]" style={{ background: it.color }} /><span className="text-slate-700">{it.key}</span></td>
              <td className="py-[3px] pr-1 text-right font-semibold" style={{ color: AZUL_TINTA }}>{formatNumero(it.casos)}</td>
              <td className="py-[3px] text-right text-slate-500">({formatDecimal(total > 0 ? (it.casos / total) * 100 : 0, 1)} %)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingTerritorial({ cabeza, filas }: { cabeza: string; filas: { key: string; casos: number; participacion: number }[] }) {
  if (filas.length === 0) return <p className="text-sm text-slate-400">Sin datos.</p>;
  return (
    <table className="w-full text-[13.5px]">
      <thead>
        <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <th className="w-8 py-1.5 text-left">#</th>
          <th className="py-1.5 text-left">{cabeza}</th>
          <th className="py-1.5 text-right">Casos</th>
          <th className="w-16 py-1.5 text-right">%</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.key} className="border-b border-slate-100 last:border-0">
            <td className="py-[7px] font-bold" style={{ color: AZUL_TINTA }}>{i + 1}</td>
            <td className="truncate py-[7px] text-slate-700" title={f.key}>{f.key}</td>
            <td className="py-[7px] text-right font-bold" style={{ color: AZUL_TINTA }}>{formatNumero(f.casos)}</td>
            <td className="py-[7px] text-right text-slate-500">{formatDecimal(f.participacion, 1)} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ListaCasos({ cabeza, filas }: { cabeza: string; filas: { key: string; casos: number }[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between border-b border-slate-200 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
        <span>{cabeza}</span><span>Casos</span>
      </div>
      {filas.length === 0 ? <p className="text-sm text-slate-400">Sin datos.</p> : (
        <ul className="text-[13px]">
          {filas.map((f) => (
            <li key={f.key} className="flex justify-between gap-2 border-b border-slate-100 py-[3px] last:border-0">
              <span className="truncate text-slate-700" title={f.key}>{f.key}</span>
              <span className="shrink-0 font-bold" style={{ color: AZUL_TINTA }}>{formatNumero(f.casos)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HorarioFranja({ franja, casos, participacion }: { franja: string; casos: number; participacion: number }) {
  return (
    <div className="pt-1">
      <p className="text-[20px] font-bold leading-tight" style={{ color: AZUL_TINTA }}>{franja}</p>
      <p className="mt-1.5 text-[13px] text-slate-500">{formatNumero(casos)} casos - {formatDecimal(participacion, 1)} % del total del periodo</p>
      <div className="mt-4 h-3 w-full rounded-full bg-slate-200">
        <div className="h-3 rounded-full bg-[#137a6f]" style={{ width: `${Math.min(100, participacion)}%` }} />
      </div>
      <p className="mt-2 text-[15px] font-bold" style={{ color: AZUL_TINTA }}>{formatDecimal(participacion, 1)} %</p>
    </div>
  );
}

/** "Estado de la información" compacto: 8 datos en dos columnas. */
export function EstadoInformacionCompacto() {
  const { meta } = useData();
  if (!meta) return <p className="text-sm text-slate-400">Sin datos cargados.</p>;
  const anios = [...meta.aniosDisponibles].sort();
  const rango = anios.length > 1 ? `${anios[0]} - ${anios[anios.length - 1]}` : String(anios[0] ?? '—');
  const items = [
    ['Última actualización', meta.ultimaActualizacion ? formatFechaHora(meta.ultimaActualizacion) : '—'],
    ['Primer registro', formatFecha(meta.fechaMin)],
    ['Último registro', formatFecha(meta.fechaMax)],
    [`Total de casos (${rango.replace(' - ', '-')})`, formatNumero(meta.totalCasos)],
    ['Años disponibles', rango],
    ['Estaciones disponibles', String(meta.estacionesDisponibles.length)],
    ['Barrios disponibles', String(meta.barriosDisponibles.length)],
    ['Delitos disponibles', String(meta.delitosDisponibles.length)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
      {items.map(([etiqueta, valor]) => (
        <div key={etiqueta} className="min-w-0">
          <dt className="truncate text-[11px] text-slate-400">{etiqueta}</dt>
          <dd className="truncate text-[12.5px] font-bold" style={{ color: AZUL_TINTA }}>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}
