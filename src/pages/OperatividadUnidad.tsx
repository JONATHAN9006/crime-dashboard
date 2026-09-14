import { useState } from 'react';
import { useData } from '../context/DataContext';
import { agruparPor, formatNumero } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { VerticalBarList } from '../components/charts/VerticalBarList';
import { SelectorTopBotones, type ValorTop } from '../components/ui/SelectorTopBotones';

// Azul rey — SOLO para el recuadro que resalta la barra con más casos, para
// distinguir Operatividad de Delictividad (que usa recuadro rojo). El
// color de las barras en sí se queda igual al institucional de siempre.
const AZUL_REY = '#1d4ed8';

function recortar<T extends { casos: number }>(lista: T[], top: ValorTop): T[] {
  return top === 'todas' ? lista : lista.slice(0, top);
}

function conAporte<T extends { casos: number }>(lista: T[]) {
  const total = lista.reduce((a, d) => a + d.casos, 0);
  return lista.map((d) => ({ ...d, aportePct: total > 0 ? (d.casos / total) * 100 : 0 }));
}

// "Operatividad por Unidad" — mismo espíritu que "Delictividad por Unidad"
// (tabla de resumen + barras con aporte %), pero sobre el dataset de
// Operatividad (capturas, incautaciones, recuperaciones), que se filtra
// con los MISMOS filtros generales del dashboard (ver DataContext:
// filteredOperatividadRecords ya viene cruzado por Delito, Estación,
// Cuadrante, Barrio, Año, Mes y fecha — con Delito, Estación y Zona de
// Atención ya traducidos al mismo vocabulario del filtro general).
export function OperatividadUnidad() {
  const { filteredOperatividadRecords, operatividadMeta, filters } = useData();
  const [topBarrio, setTopBarrio] = useState<ValorTop>(5);
  const [topDelito, setTopDelito] = useState<ValorTop>(10);
  const [topZona, setTopZona] = useState<ValorTop>(10);

  const registros = filteredOperatividadRecords;
  const total = registros.length;

  const porCategoria = agruparPor(registros, (r) => r.categoria || 'Sin categoría');
  const conAportePorCategoria = conAporte(porCategoria);

  const porCuadranteCompleto = agruparPor(registros, (r) => r.cuadrante || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porCuadrante = conAporte(recortar(porCuadranteCompleto, topZona));

  const porBarrioCompleto = agruparPor(registros, (r) => r.barrioHecho || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porBarrio = conAporte(recortar(porBarrioCompleto, topBarrio));

  const porDelitoCompleto = agruparPor(registros, (r) => r.delitoAsociado || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porDelito = conAporte(recortar(porDelitoCompleto, topDelito));

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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Por categoría de operatividad" descargable="operatividad-categoria">
              <VerticalBarList data={conAportePorCategoria} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por delito asociado" descargable="operatividad-delito" actions={<SelectorTopBotones valor={topDelito} onChange={setTopDelito} />}>
              <VerticalBarList data={porDelito} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por zona de atención" descargable="operatividad-zona" actions={<SelectorTopBotones valor={topZona} onChange={setTopZona} />}>
              <VerticalBarList data={porCuadrante} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por barrio" descargable="operatividad-barrio" actions={<SelectorTopBotones valor={topBarrio} onChange={setTopBarrio} />}>
              <VerticalBarList data={porBarrio} colorBordeMaximo={AZUL_REY} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
