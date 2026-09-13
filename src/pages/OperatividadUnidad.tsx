import { useState } from 'react';
import { useData } from '../context/DataContext';
import { agruparPor, formatNumero } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { AporteBarList } from '../components/charts/AporteBarList';

// Azul rey — SOLO para el recuadro que resalta la barra con más casos, para
// distinguir Operatividad de Delictividad (que usa recuadro rojo). El
// color de las barras en sí se queda igual al institucional de siempre.
const AZUL_REY = '#1d4ed8';

// "Operatividad por Unidad" — mismo espíritu que "Delictividad por Unidad"
// (tabla de resumen + barras con aporte %), pero sobre el dataset de
// Operatividad (capturas, incautaciones, recuperaciones), que se filtra
// con los MISMOS filtros generales del dashboard (ver DataContext:
// filteredOperatividadRecords ya viene cruzado por Delito, Estación,
// Cuadrante, Barrio, Año, Mes y fecha — con Delito y Estación ya
// traducidos al mismo vocabulario del filtro general).
export function OperatividadUnidad() {
  const { filteredOperatividadRecords, operatividadMeta, filters } = useData();
  const [topBarrio, setTopBarrio] = useState<number | 'todas'>(5);
  const [topDelito, setTopDelito] = useState(10);
  const [topZona, setTopZona] = useState(10);

  const registros = filteredOperatividadRecords;
  const total = registros.length;

  const porCategoria = agruparPor(registros, (r) => r.categoria || 'Sin categoría');
  const conAportePorCategoria = porCategoria.map((d) => ({ ...d, aportePct: total > 0 ? (d.casos / total) * 100 : 0 }));

  const porCuadranteCompleto = agruparPor(registros, (r) => r.cuadrante || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const totalZonas = porCuadranteCompleto.reduce((a, d) => a + d.casos, 0);
  const porCuadrante = porCuadranteCompleto.slice(0, topZona).map((d) => ({ ...d, aportePct: totalZonas > 0 ? (d.casos / totalZonas) * 100 : 0 }));

  const porBarrioCompleto = agruparPor(registros, (r) => r.barrioHecho || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const totalBarrios = porBarrioCompleto.reduce((a, d) => a + d.casos, 0);
  const porBarrioRecortado = topBarrio === 'todas' ? porBarrioCompleto : porBarrioCompleto.slice(0, topBarrio);
  const porBarrio = porBarrioRecortado.map((d) => ({ ...d, aportePct: totalBarrios > 0 ? (d.casos / totalBarrios) * 100 : 0 }));

  const porDelitoCompleto = agruparPor(registros, (r) => r.delitoAsociado || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const totalDelitoAsoc = porDelitoCompleto.reduce((a, d) => a + d.casos, 0);
  const porDelito = porDelitoCompleto.slice(0, topDelito).map((d) => ({ ...d, aportePct: totalDelitoAsoc > 0 ? (d.casos / totalDelitoAsoc) * 100 : 0 }));

  const filtrosActivos = [
    filters.delito.length > 0 && `Delito: ${filters.delito.join(', ')}`,
    filters.estacion.length > 0 && `Estación: ${filters.estacion.join(', ')}`,
    filters.cuadrante.length > 0 && `Zona de Atención: ${filters.cuadrante.join(', ')}`,
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

          {/* Resumen general — compacto y centrado, mismo criterio que en Delictividad. */}
          <Card title="Resumen general" subtitle="Totales de operatividad con los filtros actuales" descargable="resumen-operatividad" className="mx-auto max-w-xl">
            <table className="w-full text-sm">
              <tbody>
                {[
                  { etiqueta: 'Total operatividad (todas las categorías)', valor: formatNumero(total) },
                  { etiqueta: 'Categoría con más casos', valor: categoriaConMasCasos ? `${categoriaConMasCasos.key} (${formatNumero(categoriaConMasCasos.casos)})` : '—' },
                  ...conAportePorCategoria.map((c) => ({ etiqueta: c.key, valor: `${formatNumero(c.casos)} (${c.aportePct.toFixed(1)}%)` })),
                ].map((fila, i) => (
                  <tr key={fila.etiqueta} className={i % 2 === 0 ? 'bg-slate-50/60' : ''}>
                    <td className="rounded-l-lg py-1.5 pl-3 text-xs font-medium text-slate-600">{fila.etiqueta}</td>
                    <td className="rounded-r-lg py-1.5 pr-3 text-right text-sm font-bold text-slate-800">{fila.valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* 3 componentes por fila — Categoría, Delito asociado y Zona de
              Atención por ahora (se quitó "Por Estación" a pedido). */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Por categoría de operatividad" descargable="operatividad-categoria">
              <AporteBarList data={conAportePorCategoria} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por delito asociado" descargable="operatividad-delito" actions={<SelectorTop valor={topDelito} onChange={setTopDelito} />}>
              {porDelito.length > 0 ? <AporteBarList data={porDelito} colorBordeMaximo={AZUL_REY} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
            </Card>
            <Card title="Por zona de atención" descargable="operatividad-zona" actions={<SelectorTopZona valor={topZona} onChange={setTopZona} />}>
              {porCuadrante.length > 0 ? <AporteBarList data={porCuadrante} colorBordeMaximo={AZUL_REY} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
            </Card>
            <Card title="Por barrio" descargable="operatividad-barrio" actions={<SelectorTopBarrio valor={topBarrio} onChange={setTopBarrio} />}>
              {porBarrio.length > 0 ? <AporteBarList data={porBarrio} colorBordeMaximo={AZUL_REY} /> : <p className="py-6 text-center text-sm text-slate-400">Sin datos.</p>}
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

function SelectorTopZona({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
      <option value={5}>Top 5</option>
      <option value={10}>Top 10</option>
    </select>
  );
}

function SelectorTopBarrio({ valor, onChange }: { valor: number | 'todas'; onChange: (v: number | 'todas') => void }) {
  return (
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
    >
      <option value={5}>Top 5</option>
      <option value={10}>Top 10</option>
      <option value="todas">Todas</option>
    </select>
  );
}
