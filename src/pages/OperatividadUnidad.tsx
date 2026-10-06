import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import {
  Bike, Boxes, Building2, Car, ChartPie, ClipboardList, Clock, Crosshair, FileBadge, Gavel, Globe, House,
  Layers, Leaf, MapPin, Package, PackageCheck, Scale, Shapes, Tags, TrendingUp, UserCheck, type LucideIcon,
} from 'lucide-react';
import { agruparPor, formatDecimal, formatNumero } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { AporteBarList, type FilaAporte } from '../components/charts/AporteBarList';
import { SelectorTopBotones, type ValorTop } from '../components/ui/SelectorTopBotones';
import { AZUL_TINTA, Top5Dona } from '../components/resumen/BloquesResumen';
import { EvolucionOperatividad } from '../components/operatividad/EvolucionOperatividad';

// Azul rey — SOLO para el recuadro que resalta la barra con más casos, para
// distinguir Operatividad de Delictividad (que usa recuadro rojo). El
// color de las barras en sí se queda igual al institucional de siempre.
const AZUL_REY = '#1d4ed8';

// Presentación (solo visual) — identidad institucional del dashboard.
const GRILLA = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';
const CLASE_TITULO = 'text-[14px] font-semibold leading-snug text-[#10233f]';
const TEXTO_SIN_REGISTROS = 'No hay registros disponibles para los filtros seleccionados.';
// Dona: verdes petróleo/turquesa, azul institucional y grises azulados.
const PALETA_DONA = ['#0f5f57', '#159089', '#1d4ed8', '#5eaaa8', '#64748b', '#94a3b8', '#0e7490', '#cbd5e1', '#334155'];

// Ícono de cada categoría según su nombre (sin escudos ni emblemas).
function iconoCategoria(nombre: string): LucideIcon {
  const n = nombre.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/CAPTUR/.test(n)) return UserCheck;
  if (/AUTOMOTOR|VEHICUL|CARRO/.test(n)) return Car; // antes que MOTO: "AUTOMOTORES" contiene "MOTO"
  if (/MOTO/.test(n)) return Bike;
  if (/ARMA/.test(n)) return Crosshair;
  if (/DROGA|ESTUPEF|MARIHUAN|COCA/.test(n)) return Leaf;
  if (/RECUPER/.test(n)) return PackageCheck;
  if (/MERCANC|INCAUT/.test(n)) return Package;
  return Layers;
}

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
  const acortarEtiqueta = (v: string) => v.replace(/^ORDEN JUDICIAL\b/i, 'O.J');
  const rankear = (campo: (r: (typeof registros)[number]) => string, top: ValorTop) =>
    conAporte(recortar(agruparPor(registros, (r) => acortarEtiqueta(campo(r) || 'NO REPORTADO')).filter((d) => d.key !== 'NO REPORTADO'), top));
  const porCircunstancia = rankear((r) => r.circunstanciaCaptura, topCircunstancia);
  const porClaseBien = rankear((r) => r.claseBien, topClaseBien);
  const porTipoBien = rankear((r) => r.tipoBien, topTipoBien);
  const porMarca = rankear((r) => r.marca, topMarca);
  const porTurno = rankear((r) => r.turno, topTurno);
  const porCiudad = rankear((r) => r.ciudad, topCiudad);
  const porPaisPersona = rankear((r) => r.paisPersona, topPaisPersona);
  const porPermisoArma = rankear((r) => r.permisoArma, topPermisoArma);
  const porSituacionJuridica = rankear((r) => r.situacionJuridica, topSituacionJuridica);

  const filtrosActivos = [
    filters.delito.length > 0 && `Delito: ${filters.delito.join(', ')}`,
    filters.estacion.length > 0 && `Estación: ${filters.estacion.join(', ')}`,
    filters.cuadrante.length > 0 && `Zona de Atención: ${filters.cuadrante.join(', ')}`,
    filters.barrioHecho.length > 0 && `Barrio: ${filters.barrioHecho.join(', ')}`,
    filters.anio.length > 0 && `Año: ${filters.anio.join(', ')}`,
    filters.mes.length > 0 && `Mes: ${filters.mes.join(', ')}`,
  ].filter(Boolean) as string[];

  const categoriaConMasCasos = conAportePorCategoria[0];

  // Período que realmente se está mostrando (no se agrega ningún selector
  // nuevo: manda el filtro general, o el año más reciente por defecto).
  const aniosMostrados = Array.from(new Set(registros.map((r) => r.anio).filter((a): a is number => a != null))).sort();
  const periodo = filters.anio.length > 0
    ? `Año ${filters.anio.join(', ')}${filters.mes.length > 0 ? ` · ${filters.mes.join(', ')}` : ''}`
    : aniosMostrados.length > 0
      ? `Año ${aniosMostrados.join(', ')} (más reciente)${filters.mes.length > 0 ? ` · ${filters.mes.join(', ')}` : ''}`
      : undefined;

  // Todas las tarjetas de ranking comparten el mismo aspecto.
  const tarjeta = (titulo: string, archivo: string, Icono: LucideIcon, data: FilaAporte[], top?: { valor: ValorTop; set: (v: ValorTop) => void }) => (
    <Card
      title={titulo}
      descargable={archivo}
      icono={<Icono size={17} strokeWidth={2} className="shrink-0 text-[#0f5f57]" />}
      claseTitulo={CLASE_TITULO}
      actions={top ? <SelectorTopBotones valor={top.valor} onChange={top.set} institucional /> : undefined}
    >
      <AporteBarList data={data} colorBordeMaximo={AZUL_REY} compacta textoVacio={TEXTO_SIN_REGISTROS} />
    </Card>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operatividad por Unidad"
        subtitle="Capturas, incautaciones y recuperaciones — mismos filtros generales del dashboard, cruzados con el Delito asociado."
        metric={periodo}
      />

      {!operatividadMeta && (
        <Card>
          <p className="text-sm text-slate-500">Todavía no se ha cargado información de Operatividad. Ve a "Actualizar información" → "🎯 Operatividad" para subir el archivo.</p>
        </Card>
      )}

      {operatividadMeta && (
        <>
          {filtrosActivos.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Filtros activos: <strong>{filtrosActivos.join(' · ')}</strong> ({formatNumero(total)} registros de operatividad)
            </div>
          )}

          {/* FILA 1 — Resumen ejecutivo · Distribución · Evolución */}
          <div className={GRILLA}>
            <Card
              title="Resumen general"
              subtitle="Totales de operatividad con los filtros actuales"
              descargable="resumen-operatividad"
              icono={<ClipboardList size={17} strokeWidth={2} className="shrink-0 text-[#0f5f57]" />}
              claseTitulo={CLASE_TITULO}
            >
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total operatividad</p>
                    <p className="text-[26px] font-bold leading-tight tabular-nums" style={{ color: AZUL_TINTA }}>{formatNumero(total)}</p>
                    <p className="whitespace-nowrap text-[11px] text-slate-500">Todas las categorías</p>
                  </div>
                  {categoriaConMasCasos && (
                    <div className="min-w-0 rounded-md px-2.5 py-1.5 text-right" style={{ border: `2px dashed ${AZUL_REY}`, backgroundColor: 'rgba(29, 78, 216, 0.05)' }}>
                      <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-500">Categoría principal</p>
                      <p className="truncate text-[13px] font-bold" style={{ color: AZUL_TINTA }} title={categoriaConMasCasos.key}>{categoriaConMasCasos.key}</p>
                      <p className="whitespace-nowrap text-[11.5px] tabular-nums text-slate-600">{formatNumero(categoriaConMasCasos.casos)} · {formatDecimal(categoriaConMasCasos.aportePct, 1)} %</p>
                    </div>
                  )}
                </div>
                {conAportePorCategoria.map((c, i) => {
                  const Icono = iconoCategoria(c.key);
                  return (
                    <div key={c.key} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${i % 2 === 0 ? 'bg-[#0f5f57]/10 text-[#0f5f57]' : 'bg-slate-100 text-slate-600'}`}>
                        <Icono size={16} strokeWidth={2} />
                      </span>
                      <div className="min-w-0">
                        <p className="min-h-[2.5em] break-words text-[10.5px] font-medium leading-tight text-slate-600" title={c.key}>{c.key}</p>
                        <p className="whitespace-nowrap text-[14px] font-bold leading-tight tabular-nums" style={{ color: AZUL_TINTA }}>
                          {formatNumero(c.casos)} <span className="text-[11px] font-medium text-slate-500">· {formatDecimal(c.aportePct, 1)} %</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card
              title="Distribución por categoría"
              subtitle="Aporte de cada tipo de operatividad al total"
              descargable="operatividad-distribucion"
              icono={<ChartPie size={17} strokeWidth={2} className="shrink-0 text-[#0f5f57]" />}
              claseTitulo={CLASE_TITULO}
            >
              {porCategoria.length > 0
                ? <Top5Dona filas={porCategoria} total={total} colores={PALETA_DONA} etiquetaCentro="operatividad" anchoNombre={150} />
                : <p className="py-8 text-center text-sm text-slate-400">{TEXTO_SIN_REGISTROS}</p>}
            </Card>

            <Card
              title="Evolución temporal"
              subtitle="Operatividad total en el tiempo (mismos filtros)"
              descargable="operatividad-evolucion"
              icono={<TrendingUp size={17} strokeWidth={2} className="shrink-0 text-[#0f5f57]" />}
              claseTitulo={CLASE_TITULO}
            >
              <EvolucionOperatividad registros={registros} />
            </Card>
          </div>

          {/* FILA 2 — los tres ejes principales de análisis */}
          <div className={GRILLA}>
            {/* Sin Top N, como antes: son pocas categorías y siempre se ven todas. */}
            {tarjeta('Por categoría de operatividad', 'operatividad-categoria', Layers, conAportePorCategoria)}
            {tarjeta('Por delito asociado', 'operatividad-delito', Scale, porDelito, { valor: topDelito, set: setTopDelito })}
            {tarjeta('Por zona de atención', 'operatividad-zona', MapPin, porCuadrante, { valor: topZona, set: setTopZona })}
          </div>

          {/* FILA 3 */}
          <div className={GRILLA}>
            {tarjeta('Por barrio', 'operatividad-barrio', House, porBarrio, { valor: topBarrio, set: setTopBarrio })}
            {tarjeta('Circunstancia de captura', 'operatividad-circunstancia', UserCheck, porCircunstancia, { valor: topCircunstancia, set: setTopCircunstancia })}
            {tarjeta('Permiso de arma', 'operatividad-permiso-arma', FileBadge, porPermisoArma, { valor: topPermisoArma, set: setTopPermisoArma })}
          </div>

          {/* FILA 4 */}
          <div className={GRILLA}>
            {tarjeta('Clase de bien', 'operatividad-clase-bien', Boxes, porClaseBien, { valor: topClaseBien, set: setTopClaseBien })}
            {tarjeta('Tipo de bien', 'operatividad-tipo-bien', Shapes, porTipoBien, { valor: topTipoBien, set: setTopTipoBien })}
            {tarjeta('Marca', 'operatividad-marca', Tags, porMarca, { valor: topMarca, set: setTopMarca })}
          </div>

          {/* FILA 5 */}
          <div className={GRILLA}>
            {tarjeta('Turno', 'operatividad-turno', Clock, porTurno, { valor: topTurno, set: setTopTurno })}
            {tarjeta('Ciudad', 'operatividad-ciudad', Building2, porCiudad, { valor: topCiudad, set: setTopCiudad })}
            {tarjeta('País (persona)', 'operatividad-pais-persona', Globe, porPaisPersona, { valor: topPaisPersona, set: setTopPaisPersona })}
          </div>

          {/* FILA 6 */}
          <div className={GRILLA}>
            {tarjeta('Situación jurídica', 'operatividad-situacion-juridica', Gavel, porSituacionJuridica, { valor: topSituacionJuridica, set: setTopSituacionJuridica })}
          </div>
        </>
      )}
    </div>
  );
}
