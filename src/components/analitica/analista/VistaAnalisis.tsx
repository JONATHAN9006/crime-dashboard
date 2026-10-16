import clsx from 'clsx';
import {
  AlertTriangle, BarChart3, Check, Clock, Copy, Database, FileDown, Lightbulb, ListChecks, MapPin,
  MessageSquareText, RefreshCw, ShieldCheck, Star, Target, TrendingDown, TrendingUp, Minus, Info,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AnalisisEstructurado, Indicador, Seccion, Tono } from '../../../services/analisisEstructurado';

// Vista del resultado de un análisis — tarjetas con jerarquía clara:
// hallazgo principal, indicadores, interpretación + evidencia, secciones,
// recomendación operativa y limitaciones. Puramente presentacional.

const TONO_TEXTO: Record<Tono, string> = { alza: 'text-rose-700', baja: 'text-emerald-700', neutro: 'text-slate-600', info: 'text-[#0f5f57]' };
const TONO_BARRA: Record<Tono, string> = { alza: 'bg-rose-500', baja: 'bg-emerald-500', neutro: 'bg-slate-300', info: 'bg-[#159089]' };
const TONO_FONDO: Record<Tono, string> = { alza: 'border-rose-200 bg-rose-50/60', baja: 'border-emerald-200 bg-emerald-50/50', neutro: 'border-slate-200 bg-white', info: 'border-slate-200 bg-white' };

function IconoIndicador({ ind }: { ind: Indicador }) {
  const cls = clsx('shrink-0', TONO_TEXTO[ind.tono]);
  if (/variaci/i.test(ind.etiqueta)) return ind.tono === 'alza' ? <TrendingUp size={20} className={cls} /> : ind.tono === 'baja' ? <TrendingDown size={20} className={cls} /> : <Minus size={20} className={cls} />;
  if (/franja|hora|semana/i.test(ind.etiqueta)) return <Clock size={20} className={cls} />;
  if (/zona|barrio/i.test(ind.etiqueta)) return <MapPin size={20} className={cls} />;
  return <BarChart3 size={20} className={cls} />;
}

function TarjetaIndicador({ ind }: { ind: Indicador }) {
  const largo = ind.valor.length > 12;
  return (
    <div className={clsx('flex min-w-0 flex-col rounded-xl border p-3.5', TONO_FONDO[ind.tono])}>
      <div className="flex items-center gap-2">
        <IconoIndicador ind={ind} />
        <p className="truncate text-[12.5px] font-semibold text-[#10233f]" title={ind.etiqueta}>{ind.etiqueta}</p>
      </div>
      <p className={clsx('mt-1.5 font-extrabold leading-tight tabular-nums', largo ? 'text-[17px]' : 'text-[24px]', ind.tono === 'neutro' ? 'text-[#10233f]' : TONO_TEXTO[ind.tono])} title={ind.valor}>{ind.valor}</p>
      {ind.detalle && <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{ind.detalle}</p>}
      <span className={clsx('mt-2.5 h-1 w-12 rounded-full', TONO_BARRA[ind.tono])} />
    </div>
  );
}

const ICONO_SECCION: Record<Seccion['icono'], ReactNode> = {
  tiempo: <Clock size={16} className="text-[#0f5f57]" />,
  territorio: <MapPin size={16} className="text-[#0f5f57]" />,
  lista: <ListChecks size={16} className="text-[#0f5f57]" />,
  operativo: <ShieldCheck size={16} className="text-[#0f5f57]" />,
  contexto: <Info size={16} className="text-[#0f5f57]" />,
};

function TarjetaSeccion({ s }: { s: Seccion }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="mb-2 flex items-center gap-2 text-[13.5px] font-bold text-[#10233f]">{ICONO_SECCION[s.icono]} {s.titulo}</p>
      <ul className="divide-y divide-slate-100">
        {s.items.map((it, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
            <span className="min-w-0 text-slate-700">{it.texto}</span>
            {it.valor && <span className={clsx('shrink-0 text-right font-semibold tabular-nums', it.tono && it.tono !== 'neutro' ? TONO_TEXTO[it.tono] : 'text-[#10233f]')}>{it.valor}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VistaAnalisis({ analisis, desactualizado, onActualizar, onProfundizar, onDescargar, textoPlano }: {
  analisis: AnalisisEstructurado;
  desactualizado: boolean;
  onActualizar: () => void;
  onProfundizar: (() => void) | null;
  onDescargar: (() => void) | null;
  textoPlano: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const h = analisis.hallazgo;
  const colorDestacado = h.tono === 'alza' ? 'text-rose-700' : h.tono === 'baja' ? 'text-emerald-700' : 'text-[#0f5f57]';
  return (
    <div className="space-y-3.5">
      {desactualizado && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="min-w-0 flex-1">Este análisis se generó con una selección anterior. No corresponde a los filtros actuales.</span>
          <button type="button" onClick={onActualizar} className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"><RefreshCw size={13} /> Actualizar con la selección actual</button>
        </div>
      )}

      {/* Hallazgo principal */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-wide text-orange-600">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500 text-white"><Star size={14} fill="currentColor" /></span>
            Hallazgo principal · {analisis.titulo}
          </p>
          <span className="flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700"><Database size={12} /> Basado en los filtros y registros del dashboard</span>
        </div>
        <h3 className="mt-2.5 text-[20px] font-extrabold leading-snug text-[#10233f] sm:text-[23px]">
          {h.antes}{h.destacado && <span className={colorDestacado}>{h.destacado}</span>}{h.despues}
        </h3>
        {h.detalle && <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{h.detalle}</p>}
      </section>

      {analisis.indicadores.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
          {analisis.indicadores.map((ind) => <TarjetaIndicador key={ind.etiqueta} ind={ind} />)}
        </div>
      )}

      {(analisis.interpretacion || analisis.evidencia.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {analisis.interpretacion && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-1.5 flex items-center gap-2 text-[14px] font-bold text-[#10233f]"><Lightbulb size={17} className="text-amber-500" /> ¿Qué significa?</p>
              <p className="text-[13px] leading-relaxed text-slate-600">{analisis.interpretacion}</p>
            </div>
          )}
          {analisis.evidencia.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-1.5 flex items-center gap-2 text-[14px] font-bold text-[#10233f]"><BarChart3 size={17} className="text-[#0f5f57]" /> Evidencia del dashboard</p>
              <ol className="space-y-1.5">
                {analisis.evidencia.map((e, i) => (
                  <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-slate-600">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e3f2ef] text-[11px] font-bold text-[#0f5f57]">{i + 1}</span>
                    {e}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {analisis.secciones.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {analisis.secciones.map((s) => <TarjetaSeccion key={s.titulo} s={s} />)}
        </div>
      )}

      {analisis.recomendaciones.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-[#f1f9f7] p-4">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[14px] font-bold text-[#0f5f57]"><Target size={18} /> Recomendación operativa</p>
            <span className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200"><Check size={11} /> Según la concentración de casos</span>
          </div>
          <ul className="ml-4 list-disc space-y-1 text-[12.5px] leading-snug text-slate-700 marker:text-[#159089]">
            {analisis.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {analisis.limitaciones.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
          <p className="mb-1 flex items-center gap-2 text-[13px] font-bold text-amber-800"><AlertTriangle size={15} /> Limitaciones</p>
          <ul className="ml-4 list-disc space-y-0.5 text-[12px] leading-snug text-amber-900">
            {analisis.limitaciones.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {onProfundizar && analisis.preguntaIA && (
          <button type="button" onClick={onProfundizar} className="flex items-center gap-1.5 rounded-lg bg-[#10233f] px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1c3557]"><MessageSquareText size={14} /> Profundizar con IA</button>
        )}
        <button type="button" onClick={() => navigator.clipboard?.writeText(textoPlano).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); })} className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50">
          {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar texto'}
        </button>
        {onDescargar && (
          <button type="button" onClick={onDescargar} className="flex items-center gap-1.5 rounded-lg border border-[#0f5f57] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#0f5f57] hover:bg-[#e3f2ef]"><FileDown size={14} /> Descargar informe PDF</button>
        )}
      </div>
    </div>
  );
}
