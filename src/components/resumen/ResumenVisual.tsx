import type { ReactNode } from 'react';
import {
  ArrowDownRight, ArrowUpRight, Bike, Car, Crosshair, Info, Layers, Leaf, Minus, Package, PackageOpen, UserCheck, Users,
  type LucideIcon,
} from 'lucide-react';
import { formatDecimal, formatNumero } from '../../utils/aggregations';
import type { UnidadDroga } from '../../utils/operatividadConteo';

// «Resumen general» con la presentación nueva (Operatividad y Delictividad).
// SOLO cambia lo visual: recibe las mismas cifras que ya calculaba cada
// página y se adapta al ancho de su tarjeta (container queries), sin cambiar
// el tamaño de la tarjeta en la cuadrícula.

const pct1 = (n: number) => `${formatDecimal(n, 1)} %`;

// ── Operatividad ─────────────────────────────────────────────────────────
interface Tema { icono: LucideIcon; texto: string; fondo: string; borde: string; pastilla: string }
const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function temaCategoria(nombre: string): Tema {
  const n = norm(nombre);
  if (/CAPTUR/.test(n)) return { icono: UserCheck, texto: 'text-emerald-700', fondo: 'bg-emerald-100', borde: 'border-l-emerald-500', pastilla: 'bg-emerald-50 text-emerald-700' };
  if (/AUTOMOTOR/.test(n)) return { icono: Car, texto: 'text-blue-700', fondo: 'bg-blue-100', borde: 'border-l-blue-600', pastilla: 'bg-blue-50 text-blue-700' };
  if (/MOTO/.test(n)) return { icono: Bike, texto: 'text-violet-700', fondo: 'bg-violet-100', borde: 'border-l-violet-500', pastilla: 'bg-violet-50 text-violet-700' };
  if (/ARMA/.test(n)) return { icono: Crosshair, texto: 'text-rose-600', fondo: 'bg-rose-100', borde: 'border-l-rose-500', pastilla: 'bg-rose-50 text-rose-600' };
  if (/RECUPER/.test(n)) return { icono: PackageOpen, texto: 'text-orange-600', fondo: 'bg-orange-100', borde: 'border-l-orange-500', pastilla: 'bg-orange-50 text-orange-600' };
  if (/MERCANC|INCAUT/.test(n)) return { icono: Package, texto: 'text-sky-700', fondo: 'bg-sky-100', borde: 'border-l-sky-600', pastilla: 'bg-sky-50 text-sky-700' };
  return { icono: Layers, texto: 'text-slate-700', fondo: 'bg-slate-100', borde: 'border-l-slate-400', pastilla: 'bg-slate-100 text-slate-600' };
}
const MEDALLA = ['bg-amber-400 text-amber-950', 'bg-slate-300 text-slate-800', 'bg-orange-300 text-orange-950'];

/** Fila de 10 personas: se rellenan según el % (como el pictograma de la referencia). */
function Pictograma({ pct }: { pct: number }) {
  const llenas = pct / 10;
  const persona = (color: string) => (
    <>
      <circle cx="6" cy="4" r="3.2" fill={color} />
      <rect x="1.8" y="8.4" width="8.4" height="10" rx="3" fill={color} />
      <rect x="2.6" y="16" width="2.8" height="7.5" rx="1.2" fill={color} />
      <rect x="6.6" y="16" width="2.8" height="7.5" rx="1.2" fill={color} />
    </>
  );
  return (
    <div className="flex items-end gap-[2px]" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => {
        const fr = Math.max(0, Math.min(1, llenas - i));
        const id = `pic-${i}-${Math.round(fr * 100)}`;
        return (
          <svg key={i} viewBox="0 0 12 24" className="h-[24px] w-[12px]">
            <defs><clipPath id={id}><rect x="0" y="0" width={12 * fr} height="24" /></clipPath></defs>
            {persona('rgba(255,255,255,0.18)')}
            <g clipPath={`url(#${id})`}>{persona('#5eead4')}</g>
          </svg>
        );
      })}
    </div>
  );
}

export function ResumenOperatividadVisual({ total, categorias, droga }: {
  total: number;
  categorias: { key: string; casos: number; aportePct: number }[];
  droga: { gramos: number; unidad: UnidadDroga; botonUnidad: ReactNode } | null;
}) {
  const principal = categorias[0];
  const temaP = principal ? temaCategoria(principal.key) : null;
  return (
    <div className="@container space-y-2.5">
      {/* Franja principal */}
      <div className="rounded-xl bg-gradient-to-r from-[#10233f] via-[#0f3a4a] to-[#0f5f57] p-3 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-200">Total operatividad</p>
            <p className="text-[30px] font-extrabold leading-none tabular-nums">{formatNumero(total)}</p>
            <p className="mt-0.5 text-[11px] text-slate-300">Todas las categorías</p>
          </div>
          {principal && (
            <div className="flex items-center gap-2.5">
              <Pictograma pct={principal.aportePct} />
              <div className="leading-tight">
                <p className="text-[20px] font-extrabold text-[#5eead4] tabular-nums">{pct1(principal.aportePct)}</p>
                <p className="text-[10.5px] text-slate-200">corresponde a <b className="text-white">{principal.key}</b></p>
              </div>
            </div>
          )}
        </div>
        {principal && temaP && (
          <div className="mt-2.5 flex items-center gap-2.5 rounded-lg border-2 border-dashed border-[#5eead4]/60 bg-white/5 px-2.5 py-1.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#5eead4]/90 text-[#10233f]"><temaP.icono size={19} strokeWidth={2.2} /></span>
            <div className="min-w-0">
              <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[#5eead4]">Categoría principal</p>
              <p className="truncate text-[13.5px] font-bold" title={principal.key}>{principal.key} <span className="font-extrabold tabular-nums text-[#5eead4]">· {formatNumero(principal.casos)} · {pct1(principal.aportePct)}</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Tarjetas por categoría (con medalla para las 3 primeras) */}
      <div className="grid grid-cols-1 gap-2 @min-[300px]:grid-cols-2 @min-[620px]:grid-cols-3">
        {categorias.map((c, i) => {
          const t = temaCategoria(c.key);
          return (
            <div key={c.key} className={`relative flex min-w-0 items-center gap-2 rounded-lg border border-l-4 border-slate-200 bg-white px-2 py-2 ${t.borde}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${t.fondo} ${t.texto}`}><t.icono size={18} strokeWidth={2} /></span>
              <div className="min-w-0 flex-1">
                <p className="pr-5 text-[10.5px] font-semibold leading-tight text-[#10233f]" title={c.key}>{c.key}</p>
                <p className={`text-[17px] font-extrabold leading-tight tabular-nums ${t.texto}`}>{formatNumero(c.casos)}</p>
                <span className={`mt-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold ${t.pastilla}`}>
                  <Users size={10} /> {pct1(c.aportePct)} del total
                </span>
              </div>
              {i < 3 && (
                <span className={`absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-extrabold shadow-sm ${MEDALLA[i]}`} title={`Puesto ${i + 1}`}>{i + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Droga: cantidad aparte */}
      {droga && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2.5 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Leaf size={18} strokeWidth={2} /></span>
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold leading-tight text-[#10233f]">Incautación de droga</p>
            <p className="text-[10px] leading-tight text-slate-500">cantidad, no suma al total</p>
          </div>
          <p className="text-[19px] font-extrabold tabular-nums text-[#10233f]">
            {(droga.unidad === 'kg' ? droga.gramos / 1000 : droga.gramos).toLocaleString('es-CO', { maximumFractionDigits: 2 })} {droga.unidad}
          </p>
          <span className="rounded-full bg-emerald-100 px-2 py-[1px] text-[10.5px] font-semibold text-emerald-800">
            {droga.unidad === 'g'
              ? `${(droga.gramos / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} kg aprox.`
              : `${droga.gramos.toLocaleString('es-CO', { maximumFractionDigits: 0 })} g`}
          </span>
          <span className="ml-auto">{droga.botonUnidad}</span>
          <p className="flex w-full items-start gap-1 text-[10px] leading-snug text-amber-700">
            <Info size={11} className="mt-[1px] shrink-0" /> Corresponde a la cantidad de estupefacientes incautados y no se suma al total de operatividad.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Delictividad ─────────────────────────────────────────────────────────
export interface TarjetaResumen { titulo: string; valor: string; nota?: string; icono: ReactNode; tono: 'verde' | 'rojo' | 'azul'; colorValor?: string }
const TONO: Record<TarjetaResumen['tono'], string> = {
  verde: 'bg-emerald-50 text-emerald-700',
  rojo: 'bg-rose-50 text-rose-600',
  azul: 'bg-sky-50 text-sky-700',
};

export function ResumenDelictividadVisual({ anioActual, anioAnterior, casosActual, variacionAbs, variacionPct, desfavorable, principal, tarjetas }: {
  anioActual: number; anioAnterior: number; casosActual: number; variacionAbs: number; variacionPct: number | null; desfavorable: boolean;
  principal: { key: string; casos: number; pct: number } | null;
  tarjetas: TarjetaResumen[];
}) {
  const Flecha = variacionAbs > 0 ? ArrowUpRight : variacionAbs < 0 ? ArrowDownRight : Minus;
  const colorVar = variacionAbs === 0 ? 'bg-slate-100 text-slate-600' : desfavorable ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700';
  return (
    <div className="@container space-y-2.5">
      <div className="grid grid-cols-1 gap-2.5 @min-[420px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Casos del año actual */}
        <div className="relative overflow-hidden rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-3">
          <svg viewBox="0 0 60 40" className="pointer-events-none absolute bottom-2 right-2 h-12 w-[72px] opacity-70" aria-hidden>
            {[10, 16, 22, 26, 34].map((h, i) => <rect key={i} x={i * 12} y={40 - h} width="8" height={h} rx="2" fill="#bfdbfe" />)}
          </svg>
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500"><span className="h-3 w-1 rounded-full bg-[#159089]" /> Casos año actual ({anioActual})</p>
          <p className="mt-1 text-[32px] font-extrabold leading-none tabular-nums text-[#10233f]">{formatNumero(casosActual)}</p>
          <span className={`relative mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[12px] font-bold tabular-nums ${colorVar}`}>
            <Flecha size={14} strokeWidth={2.6} />
            {variacionAbs > 0 ? '+' : ''}{formatNumero(variacionAbs)} ({variacionPct === null ? 's/d' : `${variacionPct > 0 ? '+' : ''}${formatDecimal(variacionPct, 1)}%`}) vs. {anioAnterior}
          </span>
        </div>
        {/* Delito principal */}
        {principal && (
          <div className="rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/60 p-3">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500"><span className="h-3 w-1 rounded-full bg-rose-500" /> Delito principal</p>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><Users size={20} strokeWidth={2.2} /></span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold leading-tight text-[#10233f]" title={principal.key}>{principal.key}</p>
                <p className="whitespace-nowrap leading-tight">
                  <span className="text-[18px] font-extrabold tabular-nums text-rose-600">{formatNumero(principal.casos)}</span>
                  <span className="text-[11px] text-slate-500"> · {pct1(principal.pct)} de {anioActual}</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 @min-[640px]:grid-cols-4">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white px-2 py-2">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONO[t.tono]}`}>{t.icono}</span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-medium leading-tight text-slate-600">{t.titulo}</p>
              {/* Textos largos (ej. «Desfavorable») van un poco más pequeños y pueden
                  partirse, para que nunca se salgan del recuadro. */}
              <p className={`whitespace-nowrap ${t.valor.length > 8 ? 'text-[14px] @min-[640px]:text-[15px]' : 'text-[17px]'} font-extrabold leading-tight tabular-nums ${t.colorValor ?? 'text-[#10233f]'}`}>{t.valor}</p>
              {t.nota && <p className="text-[10px] leading-tight text-slate-500">{t.nota}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

