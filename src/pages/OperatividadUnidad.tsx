import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { agruparPor, formatNumero } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { AporteBarList } from '../components/charts/AporteBarList';
import { SelectorTopBotones, type ValorTop } from '../components/ui/SelectorTopBotones';
import { totalesPorConcepto, type ConceptoOperatividad } from '../utils/desgloseOperatividad';

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
  const [topCircunstancia, setTopCircunstancia] = useState<ValorTop>(10);
  const [topClaseBien, setTopClaseBien] = useState<ValorTop>(10);
  const [topTipoBien, setTopTipoBien] = useState<ValorTop>(10);
  const [topMarca, setTopMarca] = useState<ValorTop>(10);
  const [topTurno, setTopTurno] = useState<ValorTop>(10);
  const [topCiudad, setTopCiudad] = useState<ValorTop>(10);
  const [topPaisPersona, setTopPaisPersona] = useState<ValorTop>(10);
  const [topPermisoArma, setTopPermisoArma] = useState<ValorTop>(10);
  const [topSituacionJuridica, setTopSituacionJuridica] = useState<ValorTop>(10);

  // Por defecto (sin ningún año elegido en el filtro general), se muestra
  // SOLO el año más reciente cargado — a pedido explícito, para que el
  // total de esta página coincida con el de "Comparativo de Operatividad"
  // en Inicio/Resumen en vez de sumar silenciosamente todos los años
  // cargados (2025+2026). Si el usuario SÍ elige uno o más años en el
  // filtro general, esa elección manda tal cual (incluida la suma de
  // varios años si elige más de uno).
  const registros = useMemo(() => {
    if (filters.anio.length > 0) return filteredOperatividadRecords;
    const conFecha = filteredOperatividadRecords.filter((r): r is typeof r & { anio: number } => r.anio != null);
    if (conFecha.length === 0) return filteredOperatividadRecords;
    const anioMasReciente = Math.max(...conFecha.map((r) => r.anio));
    return filteredOperatividadRecords.filter((r) => r.anio === anioMasReciente);
  }, [filteredOperatividadRecords, filters.anio]);
  const total = registros.length;

  const porCategoria = agruparPor(registros, (r) => r.categoria || 'Sin categoría');
  const conAportePorCategoria = conAporte(porCategoria);

  const porCuadranteCompleto = agruparPor(registros, (r) => r.cuadrante || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porCuadrante = conAporte(recortar(porCuadranteCompleto, topZona));

  const porBarrioCompleto = agruparPor(registros, (r) => r.barrioHecho || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porBarrio = conAporte(recortar(porBarrioCompleto, topBarrio));

  const porDelitoCompleto = agruparPor(registros, (r) => r.delitoAsociado || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porDelito = conAporte(recortar(porDelitoCompleto, topDelito));

  // Detalle propio de Operatividad (circunstancia, bienes, ubicación de la
  // persona, situación jurídica) — a pedido explícito: estaba en el tipo
  // de datos pero nunca se mostraba en pantalla, solo en el PDF de
  // Microgerencia. Mismo patrón que las demás tarjetas de esta página.
  // Etiquetas más cortas para que quepan bien en la barra — a pedido
  // explícito. "Orden Judicial Ley 906/600" pasa a "O.J Ley 906"/"O.J Ley
  // 600" (conservando cuál de las dos leyes es, en vez de perder ese dato
  // fusionando ambas en una sola etiqueta "O.J").
  //
  // Actualización (a pedido): en Circunstancia de captura, "O.J Ley 906" y
  // "O.J Ley 600" se juntan en un solo ítem "Orden Judicial".
  const unificarOrdenJudicial = (v: string) => (/^(ORDEN JUDICIAL|O\.?\s?J\b)/i.test(v.trim()) ? 'Orden Judicial' : v);
  // "No reportado" y equivalentes NO se muestran como un ítem más (ej. en
  // Marca). Antes se comparaba contra 'NO REPORTADO' exacto, pero el parser
  // formatea los valores como título ("No Reportado") y se colaba.
  const esNoReportado = (v: string) => /^(NO REPORTAD[OA]|SIN REPORTAR|NO REPORTA|SIN INFORMACION|SIN INFORMACIÓN|N\/?A|-)$/i.test(v.trim());
  const rankear = (campo: (r: (typeof registros)[number]) => string, top: ValorTop, transformar: (v: string) => string = (v) => v) =>
    conAporte(recortar(agruparPor(registros, (r) => transformar(campo(r) || 'NO REPORTADO')).filter((d) => !esNoReportado(d.key)), top));
  const porCircunstancia = rankear((r) => r.circunstanciaCaptura, topCircunstancia, unificarOrdenJudicial);
  const porClaseBien = rankear((r) => r.claseBien, topClaseBien);
  const porTipoBien = rankear((r) => r.tipoBien, topTipoBien);
  const porMarca = rankear((r) => r.marca, topMarca);
  const porTurno = rankear((r) => r.turno, topTurno);
  const porCiudad = rankear((r) => r.ciudad, topCiudad);
  const porPaisPersona = rankear((r) => r.paisPersona, topPaisPersona);
  const porPermisoArma = rankear((r) => r.permisoArma, topPermisoArma);
  const porSituacionJuridica = rankear((r) => r.situacionJuridica, topSituacionJuridica);

  // Incautaciones (a pedido): armas de fuego, mercancía incautada y cada
  // droga con sus gramos — con los filtros generales, mismo criterio de
  // conceptos que el Comparativo de Operatividad del Resumen.
  const incautaciones = (() => {
    const t = totalesPorConcepto(registros);
    const grupos: { titulo: string; filas: { c: ConceptoOperatividad; valor: number; casos: number }[] }[] = [
      { titulo: 'Drogas', filas: [] },
      { titulo: 'Armas de fuego', filas: [] },
      { titulo: 'Mercancía incautada', filas: [] },
    ];
    for (const v of t.values()) {
      if (v.c.grupo === 'Drogas') grupos[0].filas.push(v);
      else if (v.c.grupo === 'Armas de fuego') grupos[1].filas.push(v);
      else if (v.c.concepto === 'Casos mercancía incautada') grupos[2].filas.push(v);
    }
    for (const g of grupos) g.filas.sort((a, b) => a.c.orden - b.c.orden);
    return grupos;
  })();

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
              <AporteBarList data={conAportePorCategoria} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por delito asociado" descargable="operatividad-delito" actions={<SelectorTopBotones valor={topDelito} onChange={setTopDelito} />}>
              <AporteBarList data={porDelito} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por zona de atención" descargable="operatividad-zona" actions={<SelectorTopBotones valor={topZona} onChange={setTopZona} />}>
              <AporteBarList data={porCuadrante} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Por barrio" descargable="operatividad-barrio" actions={<SelectorTopBotones valor={topBarrio} onChange={setTopBarrio} />}>
              <AporteBarList data={porBarrio} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Circunstancia de captura" descargable="operatividad-circunstancia" actions={<SelectorTopBotones valor={topCircunstancia} onChange={setTopCircunstancia} />}>
              <AporteBarList data={porCircunstancia} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Permiso de arma" descargable="operatividad-permiso-arma" actions={<SelectorTopBotones valor={topPermisoArma} onChange={setTopPermisoArma} />}>
              <AporteBarList data={porPermisoArma} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Incautaciones" subtitle="Drogas (gramos), armas de fuego y mercancía incautada — con los filtros actuales" descargable="operatividad-incautaciones" className="lg:col-span-3">
              {incautaciones.every((g) => g.filas.length === 0) ? (
                <p className="py-6 text-center text-xs text-slate-400">No hay incautaciones con los filtros actuales.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {incautaciones.map((g) => (
                    <div key={g.titulo}>
                      <p className="mb-1.5 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-brand-navy">{g.titulo}</p>
                      {g.filas.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin registros.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[11px] text-slate-400">
                              <th className="pb-1 text-left font-medium">Concepto</th>
                              <th className="pb-1 text-right font-medium">Cantidad</th>
                              <th className="pb-1 text-right font-medium">Casos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.filas.map(({ c, valor, casos }) => (
                              <tr key={c.concepto} className="border-t border-slate-100">
                                <td className="py-1.5 pr-2 text-[13px] text-slate-700">{c.concepto}</td>
                                <td className="py-1.5 text-right text-[15px] font-bold text-slate-800">
                                  {formatNumero(Math.round(valor))}
                                  {c.medida === 'suma' && !c.concepto.includes('(') && <span className="ml-1 text-[11px] font-medium text-slate-400">{c.unidad}</span>}
                                </td>
                                <td className="py-1.5 text-right text-[13px] text-slate-500">{formatNumero(casos)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Clase de bien" descargable="operatividad-clase-bien" actions={<SelectorTopBotones valor={topClaseBien} onChange={setTopClaseBien} />}>
              <AporteBarList data={porClaseBien} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Tipo de bien" descargable="operatividad-tipo-bien" actions={<SelectorTopBotones valor={topTipoBien} onChange={setTopTipoBien} />}>
              <AporteBarList data={porTipoBien} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Marca" descargable="operatividad-marca" actions={<SelectorTopBotones valor={topMarca} onChange={setTopMarca} />}>
              <AporteBarList data={porMarca} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Turno" descargable="operatividad-turno" actions={<SelectorTopBotones valor={topTurno} onChange={setTopTurno} />}>
              <AporteBarList data={porTurno} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Ciudad" descargable="operatividad-ciudad" actions={<SelectorTopBotones valor={topCiudad} onChange={setTopCiudad} />}>
              <AporteBarList data={porCiudad} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="País (persona)" descargable="operatividad-pais-persona" actions={<SelectorTopBotones valor={topPaisPersona} onChange={setTopPaisPersona} />}>
              <AporteBarList data={porPaisPersona} colorBordeMaximo={AZUL_REY} />
            </Card>
            <Card title="Situación jurídica" descargable="operatividad-situacion-juridica" actions={<SelectorTopBotones valor={topSituacionJuridica} onChange={setTopSituacionJuridica} />}>
              <AporteBarList data={porSituacionJuridica} colorBordeMaximo={AZUL_REY} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
