import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from 'lucide-react';
import type { CrimeRecord } from '../../types/crime';
import { formatFecha } from '../../utils/aggregations';

interface ColumnDef {
  key: string;
  label: string;
  getter: (r: CrimeRecord) => string | number;
}

const TODAS_COLUMNAS: ColumnDef[] = [
  { key: 'fecha', label: 'Fecha', getter: (r) => formatFecha(r.fecha) },
  { key: 'anio', label: 'Año', getter: (r) => r.anio ?? '' },
  { key: 'estacion', label: 'Estación', getter: (r) => r.estacion },
  { key: 'cai', label: 'CAI', getter: (r) => r.cai },
  { key: 'cuadrante', label: 'Zonas de Atención', getter: (r) => r.cuadrante },
  { key: 'barrioHecho', label: 'Barrio', getter: (r) => r.barrioHecho },
  { key: 'delito', label: 'Delito', getter: (r) => r.delito },
  { key: 'modalidad', label: 'Modalidad', getter: (r) => r.modalidad },
  { key: 'zona', label: 'Zona', getter: (r) => r.zona },
  { key: 'claseSitio', label: 'Clase de sitio', getter: (r) => r.claseSitio },
  { key: 'armas', label: 'Armas', getter: (r) => r.armas },
  { key: 'causaLesion', label: 'Causa de lesión', getter: (r) => r.causaLesion },
  { key: 'genero', label: 'Género', getter: (r) => r.genero },
  { key: 'grupoEdad', label: 'Grupo de edad', getter: (r) => r.grupoEdad },
  { key: 'cantidad', label: 'Cantidad', getter: (r) => r.cantidad },
];

const COLUMNAS_DEFECTO = ['fecha', 'estacion', 'barrioHecho', 'delito', 'modalidad', 'zona', 'cantidad'];
const FILAS_POR_PAGINA = 25;

export function DataTable({ records }: { records: CrimeRecord[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [colVisibles, setColVisibles] = useState<string[]>(COLUMNAS_DEFECTO);
  const [ordenCol, setOrdenCol] = useState<string>('fecha');
  const [ordenDir, setOrdenDir] = useState<'asc' | 'desc'>('desc');
  const [pagina, setPagina] = useState(1);
  const [mostrarSelector, setMostrarSelector] = useState(false);

  const columnas = TODAS_COLUMNAS.filter((c) => colVisibles.includes(c.key));

  const filtrados = useMemo(() => {
    if (!busqueda.trim()) return records;
    const q = busqueda.toLowerCase();
    return records.filter((r) =>
      TODAS_COLUMNAS.some((c) => String(c.getter(r)).toLowerCase().includes(q)),
    );
  }, [records, busqueda]);

  const ordenados = useMemo(() => {
    const col = TODAS_COLUMNAS.find((c) => c.key === ordenCol);
    if (!col) return filtrados;
    const copia = [...filtrados];
    copia.sort((a, b) => {
      const av = col.getter(a);
      const bv = col.getter(b);
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), 'es');
      return ordenDir === 'asc' ? cmp : -cmp;
    });
    return copia;
  }, [filtrados, ordenCol, ordenDir]);

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = ordenados.slice((paginaSegura - 1) * FILAS_POR_PAGINA, paginaSegura * FILAS_POR_PAGINA);

  function cambiarOrden(key: string) {
    if (ordenCol === key) setOrdenDir(ordenDir === 'asc' ? 'desc' : 'asc');
    else {
      setOrdenCol(key);
      setOrdenDir('desc');
    }
  }

  function exportarCsv() {
    const header = columnas.map((c) => c.label).join(';');
    const filas = ordenados.map((r) => columnas.map((c) => `"${String(c.getter(r)).replace(/"/g, '""')}"`).join(';'));
    const contenido = [header, ...filas].join('\n');
    const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delitos_filtrados_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar en todos los campos..."
            className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-brand-navy focus:outline-none"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setMostrarSelector((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Columnas ({colVisibles.length})
          </button>
          {mostrarSelector && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg max-h-72 overflow-y-auto">
              {TODAS_COLUMNAS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={colVisibles.includes(c.key)}
                    onChange={(e) => {
                      setColVisibles((prev) => e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key));
                    }}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={exportarCsv}
          className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-navy-light"
        >
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-500">{ordenados.length.toLocaleString('es-CO')} registros encontrados</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {columnas.map((c) => (
                <th
                  key={c.key}
                  onClick={() => cambiarOrden(c.key)}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  <span className="flex items-center gap-1">
                    {c.label}
                    {ordenCol === c.key ? (ordenDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} className="opacity-30" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.__id} className="border-t border-slate-100 hover:bg-slate-50">
                {columnas.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-1.5 text-slate-700">{c.getter(r)}</td>
                ))}
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={columnas.length} className="px-3 py-6 text-center text-slate-400">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>Página {paginaSegura} de {totalPaginas}</span>
        <div className="flex gap-1.5">
          <button disabled={paginaSegura <= 1} onClick={() => setPagina((p) => p - 1)} className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-40">Anterior</button>
          <button disabled={paginaSegura >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="rounded border border-slate-300 px-2.5 py-1 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  );
}
