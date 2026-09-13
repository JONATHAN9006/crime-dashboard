import { useState } from 'react';
import { useData } from '../context/DataContext';
import { agruparPor, formatNumero } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { AporteBarList } from '../components/charts/AporteBarList';

// "Operatividad por Unidad" — mismo espíritu que "Delictividad por Unidad"
// (tabla de resumen + barras con aporte %), pero sobre el dataset de
// Operatividad (capturas, incautaciones, recuperaciones), que se filtra
// con los MISMOS filtros generales del dashboard (ver DataContext:
// filteredOperatividadRecords ya viene cruzado por Delito, Estación,
// Cuadrante, Barrio, Año, Mes y fecha).
export function OperatividadUnidad() {
  const { filteredOperatividadRecords, operatividadMeta, filters } = useData();
  const [topBarrio, setTopBarrio] = useState(10);
  const [topDelito, setTopDelito] = useState(10);

  const registros = filteredOperatividadRecords;
  const total = registros.length;

  const porCategoria = agruparPor(registros, (r) => r.categoria || 'Sin categoría');
  const conAportePorCategoria = porCategoria.map((d) => ({ ...d, aportePct: total > 0 ? (d.casos / total) * 100 : 0 }));

  const porEstacion = agruparPor(registros, (r) => r.estacion || 'NO REPORTADO');
  const conAportePorEstacion = porEstacion.map((d) => ({ ...d, aportePct: total > 0 ? (d.casos / total) * 100 : 0 }));

  const porCuadrante = agruparPor(registros, (r) => r.cuadrante || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const conAportePorCuadrante = porCuadrante.map((d) => ({ ...d, aportePct: total > 0 ? (d.casos / total) * 100 : 0 }));

  const porBarrioCompleto = agruparPor(registros, (r) => r.barrioHecho || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const totalBarrios = porBarrioCompleto.reduce((a, d) => a + d.casos, 0);
  const porBarrio = porBarrioCompleto.slice(0, topBarrio).map((d) => ({ ...d, aportePct: totalBarrios > 0 ? (d.casos / totalBarrios) * 100 : 0 }));

  const porDelitoCompleto = agruparPor(registros, (r) => r.delitoAsociado || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const totalDelitoAsoc = porDelitoCompleto.reduce((a, d) => a + d.casos, 0);
  const porDelito = porDelitoCompleto.slice(0, topDelito).map((d) => ({ ...d, aportePct: totalDelitoAsoc > 0 ? (d.casos / totalDelitoAsoc) * 100 : 0 }));

  const filtrosActivos = [
    filters.delito.length > 0 && `Delito: ${filters.delito.join(', ')}`,
    filters.estacion.length > 0 && `Estación: ${filters.estacion.join(', ')}`,
    filters.cuadrante.length > 0 && `Cuadrante: ${filters.cuadrante.join(', ')}`,
    filters.barrioHecho.length > 0 && `Barrio: ${filters.barrioHecho.join(', ')}`,
    filters.anio.length > 0 && `Año: ${filters.anio.join(', ')}`,
    filters.mes.length > 0 && `Mes: ${filters.mes.join(', ')}`,
  ].filter(Boolean) as string[];

  const categoriaConMasCasos = conAportePorCategoria[0];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operatividad por Unidad"
        subtitle="Capturas, incautaciones y recuperaciones — mismos filtros generales del dashboard, cruzados con el Delito asociado."
      />

      {!operatividadMeta && (
        <Card>
          <p className="text-sm text-slate-500">Todavía no se ha cargado información de Operatividad. Ve a "Actualizar información" → "🎯 Operatividad" para subir el archivo.</p>
        </Card>
      )}

      {operatividadMeta && (
        <>
          {filtrosActivos.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Filtros activos: <strong>{filtrosActivos.join(' · ')}</strong> ({formatNumero(total)} registros de operatividad)
            </div>
          )}

          <Card title="Resumen general" subtitle="Totales de operatividad con los filtros actuales" descargable="resumen-operatividad">
            <table className="w-full text-sm">
              <tbody>
                {[
                  { etiqueta: 'Total operatividad (todas las categorías)', valor: formatNumero(total) },
                  { etiqueta: 'Categoría con más casos', valor: categoriaConMasCasos ? `${categoriaConMasCasos.key} (${formatNumero(categoriaConMasCasos.casos)})` : '—' },
                  ...conAportePorCategoria.map((c) => ({ etiqueta: c.key, valor: `${formatNumero(c.casos)} (${c.aportePct.toFixed(1)}%)` })),
                ].map((fila, i) => (
                  <tr key={fila.etiqueta} className={i % 2 === 0 ? 'bg-slate-50/60' : ''}>
                    <td className="rounded-l-lg py-2 pl-3 font-medium text-slate-600">{fila.etiqueta}</td>
                    <td className="rounded-r-lg py-2 pr-3 text-right text-base font-bold text-slate-800">{fila.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Por categoría de operatividad" descargable="operatividad-categoria">
              <AporteBarList data={conAportePorCategoria} />
            </Card>
            <Card title="Por delito asociado" descargable="operatividad-delito" actions={<SelectorTop valor={topDelito} onChange={setTopDelito} />}>
              {porDelito.length > 0 ? <AporteBarList data={porDelito} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
            </Card>
            <Card title="Por estación" descargable="operatividad-estacion">
              {conAportePorEstacion.length > 0 ? <AporteBarList data={conAportePorEstacion} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
            </Card>
            <Card title="Por zona de atención (cuadrante)" descargable="operatividad-cuadrante">
              {conAportePorCuadrante.length > 0 ? <AporteBarList data={conAportePorCuadrante} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
            </Card>
            <Card title="Por barrio — Top" descargable="operatividad-barrio" actions={<SelectorTop valor={topBarrio} onChange={setTopBarrio} />}>
              {porBarrio.length > 0 ? <AporteBarList data={porBarrio} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function SelectorTop({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
      {[5, 10, 15, 20].map((n) => <option key={n} value={n}>Top {n}</option>)}
    </select>
  );
}
