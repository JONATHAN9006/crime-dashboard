import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Trash2, Undo2 } from 'lucide-react';
import { useData, type CriterioEliminacion } from '../../context/DataContext';
import { posiblesRepetidosPorAnio } from '../../data/datasetOps';
import { obtenerConfig } from '../../config';

// "Eliminar información" de Delictividad — tres formas, de la más común a
// la más fina:
//  1. Por AÑO completo (ej. se subió dos veces 2023: se elimina 2023 y se
//     vuelve a subir UNA vez). Muestra, por año, cuántos registros parecen
//     repetidos — si un año sale con una proporción alta, casi seguro se
//     cargó dos veces.
//  2. Deshacer una CARGA puntual (cada carga nueva queda marcada con su
//     archivo, fecha y usuario): quita exactamente lo que esa carga agregó.
//  3. Por RANGO de fechas.
// Nada se borra sin una confirmación explícita; con servidor central, se
// borra primero allá y solo si eso funciona se borra en este navegador.

export function EliminarInformacion({ token, usuario, requiereClave }: { token: string; usuario: string; requiereClave: boolean }) {
  const { registrosCompletos, eliminarRegistros, backendUrl } = useData();
  const { updatePassword } = obtenerConfig();
  const [pendiente, setPendiente] = useState<{ criterio: CriterioEliminacion; descripcion: string; cantidad: number; palabra: string } | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const anios = useMemo(() => {
    const repetidos = posiblesRepetidosPorAnio(registrosCompletos);
    return Array.from(repetidos.entries()).sort((a, b) => b[0] - a[0]).map(([anio, v]) => ({ anio, ...v, pct: v.total > 0 ? (v.repetidos / v.total) * 100 : 0 }));
  }, [registrosCompletos]);

  const lotes = useMemo(() => {
    const m = new Map<string, { loteId: string; archivo: string; fecha: string; usuario: string; cantidad: number }>();
    for (const r of registrosCompletos) {
      if (!r.loteId) continue;
      const l = m.get(r.loteId) ?? { loteId: r.loteId, archivo: r.loteArchivo ?? '—', fecha: r.loteFecha ?? '', usuario: r.loteUsuario ?? '—', cantidad: 0 };
      l.cantidad++;
      m.set(r.loteId, l);
    }
    return Array.from(m.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [registrosCompletos]);
  const sinLote = useMemo(() => registrosCompletos.filter((r) => !r.loteId).length, [registrosCompletos]);

  const enRango = useMemo(() => {
    if (!desde || !hasta) return 0;
    const d = new Date(`${desde}T00:00:00`), h = new Date(`${hasta}T23:59:59`);
    return registrosCompletos.filter((r) => r.fecha && r.fecha >= d && r.fecha <= h).length;
  }, [registrosCompletos, desde, hasta]);

  function pedir(criterio: CriterioEliminacion, descripcion: string, cantidad: number, palabra: string) {
    setResultado(null);
    setConfirmacion('');
    setPendiente({ criterio, descripcion, cantidad, palabra });
  }

  async function ejecutar() {
    if (!pendiente) return;
    // Sin servidor central, la clave se valida aquí contra la de config.js
    // (igual que al cargar un archivo).
    if (!backendUrl && updatePassword && token !== updatePassword) {
      setPendiente(null);
      setResultado({ ok: false, texto: 'Clave de actualización incorrecta. No se eliminó nada.' });
      return;
    }
    setTrabajando(true);
    const r = await eliminarRegistros(pendiente.criterio, token || undefined, usuario);
    setTrabajando(false);
    setPendiente(null);
    setResultado(r.error
      ? { ok: false, texto: r.error }
      : { ok: true, texto: `Se eliminaron ${r.eliminados.toLocaleString('es-CO')} registro(s)${r.sincronizado ? ' en este navegador y en el servidor central' : ' de este navegador'}.` });
  }

  const faltaClave = requiereClave && !token;

  return (
    <div className="space-y-4 text-sm">
      {faltaClave && (
        <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">Escribe la <b>clave de actualización</b> (arriba) para poder eliminar información.</p>
      )}

      {/* 1. Por año */}
      <div>
        <p className="mb-1.5 font-semibold text-slate-800">Por año</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400">
              <th className="pb-1 text-left font-medium">Año</th>
              <th className="pb-1 text-right font-medium">Registros</th>
              <th className="pb-1 text-right font-medium">Posibles repetidos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {anios.map((a) => (
              <tr key={a.anio} className="border-t border-slate-100">
                <td className="py-1.5 font-semibold text-slate-700">{a.anio}</td>
                <td className="py-1.5 text-right">{a.total.toLocaleString('es-CO')}</td>
                <td className={`py-1.5 text-right ${a.pct >= 25 ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                  {a.repetidos.toLocaleString('es-CO')} ({a.pct.toFixed(0)}%){a.pct >= 25 && <AlertTriangle size={11} className="ml-1 inline" />}
                </td>
                <td className="py-1.5 text-right">
                  <button
                    disabled={faltaClave || trabajando}
                    onClick={() => pedir({ tipo: 'anios', anios: [a.anio] }, `todo el año ${a.anio}`, a.total, String(a.anio))}
                    className="rounded-md border border-rose-200 px-2 py-0.5 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          "Posibles repetidos" = casos con la misma fecha, hora, delito, barrio, edad y género que otro del mismo año. Un porcentaje alto (en rojo) indica que ese año
          probablemente se cargó dos veces. Para corregirlo: elimina el año y vuelve a subir el archivo <b>una sola vez</b> (o súbelo con "Actualizar año completo", que reemplaza el año entero en un paso).
        </p>
      </div>

      {/* 2. Deshacer una carga */}
      <div>
        <p className="mb-1.5 font-semibold text-slate-800">Deshacer una carga</p>
        {lotes.length === 0 ? (
          <p className="text-xs text-slate-500">Todavía no hay cargas registradas. A partir de ahora, cada archivo que subas quedará registrado aquí y podrás deshacerlo si fue un error.</p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {lotes.map((l) => (
              <div key={l.loteId} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-700" title={l.archivo}>{l.archivo}</p>
                  <p className="text-[11px] text-slate-500">{l.fecha ? new Date(l.fecha).toLocaleString('es-CO') : '—'} · {l.usuario} · {l.cantidad.toLocaleString('es-CO')} registro(s) agregados</p>
                </div>
                <button
                  disabled={faltaClave || trabajando}
                  onClick={() => pedir({ tipo: 'lote', loteId: l.loteId }, `los ${l.cantidad.toLocaleString('es-CO')} registros que agregó la carga "${l.archivo}"`, l.cantidad, 'ELIMINAR')}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-rose-200 px-2 py-0.5 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                >
                  <Undo2 size={11} /> Deshacer
                </button>
              </div>
            ))}
          </div>
        )}
        {sinLote > 0 && lotes.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">{sinLote.toLocaleString('es-CO')} registro(s) se cargaron antes de que existiera este registro de cargas — para esos, usa "Por año" o "Por rango de fechas".</p>
        )}
      </div>

      {/* 3. Por rango de fechas */}
      <div>
        <p className="mb-1.5 font-semibold text-slate-800">Por rango de fechas</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-500">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
          <label className="text-xs text-slate-500">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-0.5 block rounded-md border border-slate-300 px-2 py-1 text-sm" /></label>
          <button
            disabled={faltaClave || trabajando || enRango === 0}
            onClick={() => pedir({ tipo: 'rango', desde, hasta }, `los registros del ${new Date(`${desde}T00:00:00`).toLocaleDateString('es-CO')} al ${new Date(`${hasta}T00:00:00`).toLocaleDateString('es-CO')}`, enRango, 'ELIMINAR')}
            className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
          >
            Eliminar {enRango > 0 ? `${enRango.toLocaleString('es-CO')} registro(s)` : ''}
          </button>
        </div>
      </div>

      {/* Confirmación */}
      {pendiente && (
        <div className="space-y-2 rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="flex items-start gap-1.5 text-rose-800">
            <Trash2 size={15} className="mt-0.5 shrink-0" />
            <span>Vas a eliminar <b>{pendiente.descripcion}</b> ({pendiente.cantidad.toLocaleString('es-CO')} registro(s)). Esto no se puede deshacer — tendrías que volver a subir el archivo.</span>
          </p>
          <label className="block text-xs text-rose-700">
            Para confirmar, escribe <b>{pendiente.palabra}</b>:
            <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoFocus className="mt-1 block w-40 rounded-md border border-rose-300 px-2 py-1 text-sm" />
          </label>
          <div className="flex gap-2">
            <button
              disabled={confirmacion.trim().toUpperCase() !== pendiente.palabra || trabajando}
              onClick={ejecutar}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
            >
              {trabajando ? 'Eliminando…' : 'Eliminar definitivamente'}
            </button>
            <button onClick={() => setPendiente(null)} disabled={trabajando} className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700">Cancelar</button>
          </div>
        </div>
      )}
      {resultado && (
        <p className={`flex items-start gap-1.5 rounded-lg p-2.5 text-xs ${resultado.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-700'}`}>
          {resultado.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
