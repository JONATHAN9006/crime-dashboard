import { useMemo, useState } from 'react';
import { maxDe } from '../utils/mathSeguro';
import { useData } from '../context/DataContext';
import {
  Bike, Boxes, Building2, Car, ChartPie, ClipboardList, Clock, Crosshair, FileBadge, Gavel, Globe, House,
  Layers, Leaf, MapPin, Package, PackageCheck, Scale, Shapes, Tags, TrendingUp, UserCheck, type LucideIcon,
} from 'lucide-react';
import { formatDecimal, formatNumero } from '../utils/aggregations';
import { Card, PageHeader } from '../components/ui/Card';
import { AporteBarList, type FilaAporte } from '../components/charts/AporteBarList';
import { SelectorTopBotones, type ValorTop } from '../components/ui/SelectorTopBotones';
import { AZUL_TINTA, Top5Dona } from '../components/resumen/BloquesResumen';
import { EvolucionOperatividad, claveTramo, type UnidadTramo } from '../components/operatividad/EvolucionOperatividad';
import { BotonUnidadDroga } from '../components/operatividad/BotonUnidadDroga';
import { ResumenOperatividadVisual } from '../components/resumen/ResumenVisual';
import {
  agruparCircunstancia, contarOperatividad, cuentaComoOperatividad, formatearDroga, sumarDroga, tipoOperatividad,
  totalDrogaGramos, totalOperatividad, type UnidadDroga,
} from '../utils/operatividadConteo';

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
  const [unidadDroga, setUnidadDroga] = useState<UnidadDroga>('g');

  // Por defecto (sin ningún año elegido en el filtro general), se muestra
  // SOLO el año más reciente cargado — a pedido explícito, para que el
  // total de esta página coincida con el de "Comparativo de Operatividad"
  // en Inicio/Resumen en vez de sumar silenciosamente todos los años
  // cargados (2025+2026). Si el usuario SÍ elige uno o más años en el
  // filtro general, esa elección manda tal cual (incluida la suma de
  // varios años si elige más de uno).
  const registrosBase = useMemo(() => {
    if (filters.anio.length > 0) return filteredOperatividadRecords;
    const conFecha = filteredOperatividadRecords.filter((r): r is typeof r & { anio: number } => r.anio != null);
    if (conFecha.length === 0) return filteredOperatividadRecords;
    const anioMasReciente = maxDe(conFecha.map((r) => r.anio));
    return filteredOperatividadRecords.filter((r) => r.anio === anioMasReciente);
  }, [filteredOperatividadRecords, filters.anio]);

  // ── Clic para filtrar (misma dinámica de Delictividad) ────────────────
  // Clic en una barra o en un punto de la evolución → todos los componentes
  // de esta página muestran solo eso; otro clic en lo mismo lo quita. Se
  // pueden combinar varios (ej. una categoría + un mes). Solo afecta esta
  // página; el filtro principal del dashboard no cambia.
  type Rec = (typeof registrosBase)[number];
  const CAMPOS_SEL = {
    categoria: { etiqueta: 'Categoría', valor: (r: Rec) => r.categoria || 'Sin categoría' },
    delito: { etiqueta: 'Delito asociado', valor: (r: Rec) => r.delitoAsociado },
    zona: { etiqueta: 'Zona de atención', valor: (r: Rec) => r.cuadrante },
    barrio: { etiqueta: 'Barrio', valor: (r: Rec) => r.barrioHecho },
    circunstancia: { etiqueta: 'Circunstancia', valor: (r: Rec) => agruparCircunstancia(r.circunstanciaCaptura) },
    permiso: { etiqueta: 'Permiso de arma', valor: (r: Rec) => r.permisoArma.replace(/_/g, ' ') },
    claseBien: { etiqueta: 'Clase de bien', valor: (r: Rec) => r.claseBien },
    tipoBien: { etiqueta: 'Tipo de bien', valor: (r: Rec) => r.tipoBien },
    marca: { etiqueta: 'Marca', valor: (r: Rec) => r.marca },
    turno: { etiqueta: 'Turno', valor: (r: Rec) => r.turno },
    ciudad: { etiqueta: 'Ciudad', valor: (r: Rec) => r.ciudad },
    pais: { etiqueta: 'País', valor: (r: Rec) => r.paisPersona },
    situacion: { etiqueta: 'Situación jurídica', valor: (r: Rec) => r.situacionJuridica },
  } as const;
  type CampoSel = keyof typeof CAMPOS_SEL;
  const [seleccion, setSeleccion] = useState<Partial<Record<CampoSel, string>>>({});
  const [tramoSel, setTramoSel] = useState<{ clave: string; unidad: UnidadTramo; etiqueta: string } | null>(null);
  const alternar = (campo: CampoSel, valor: string) => setSeleccion((prev) => {
    const n = { ...prev };
    if (n[campo] === valor) delete n[campo]; else n[campo] = valor;
    return n;
  });
  const cumpleSeleccion = (r: Rec) => (Object.entries(seleccion) as [CampoSel, string][]).every(([c, v]) => CAMPOS_SEL[c].valor(r) === v);
  const registrosSinTramo = useMemo(() => registrosBase.filter(cumpleSeleccion), [registrosBase, seleccion]); // eslint-disable-line react-hooks/exhaustive-deps
  const registros = useMemo(
    () => (tramoSel ? registrosSinTramo.filter((r) => r.fecha && claveTramo(r.fecha, tramoSel.unidad) === tramoSel.clave) : registrosSinTramo),
    [registrosSinTramo, tramoSel],
  );
  const chipsSeleccion = [
    ...(Object.entries(seleccion) as [CampoSel, string][]).map(([c, v]) => ({ id: c as string, texto: `${CAMPOS_SEL[c].etiqueta}: ${v}`, quitar: () => alternar(c, v) })),
    ...(tramoSel ? [{ id: 'tramo', texto: `${tramoSel.unidad === 'mes' ? 'Mes' : 'Semana'}: ${tramoSel.etiqueta}`, quitar: () => setTramoSel(null) }] : []),
  ];
  // Conteo como las tablas dinámicas oficiales (ver utils/operatividadConteo):
  // Capturas = cuenta de DELITO_ASOCIADO; Automotores, Motocicletas y Armas
  // = cuenta de CLASE_BIEN; Mercancía = cuenta de TIPO_BIEN. La droga es
  // una CANTIDAD (gramos): no entra al total ni al aporte, va aparte.
  const total = totalOperatividad(registros);
  const gramosDroga = totalDrogaGramos(registros);
  const hayDroga = registros.some((r) => tipoOperatividad(r.categoria) === 'droga');
  const fmtDroga = (g: number) => formatearDroga(g, unidadDroga);

  const porCategoria = contarOperatividad(registros, (r) => r.categoria || 'Sin categoría');
  const conAportePorCategoria = conAporte(porCategoria);

  const porCuadranteCompleto = contarOperatividad(registros, (r) => r.cuadrante || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porCuadrante = conAporte(recortar(porCuadranteCompleto, topZona));

  const porBarrioCompleto = contarOperatividad(registros, (r) => r.barrioHecho || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porBarrio = conAporte(recortar(porBarrioCompleto, topBarrio));

  // Capturas por delito asociado (Cuenta de DELITO_ASOCIADO, solo capturas).
  const capturas = registros.filter((r) => tipoOperatividad(r.categoria) === 'capturas');
  const porDelitoCompleto = contarOperatividad(capturas, (r) => r.delitoAsociado || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO');
  const porDelito = conAporte(recortar(porDelitoCompleto, topDelito));

  // Droga: suma de CANTIDAD por clase de bien (gramos; botón g/kg).
  const drogaPorClase = conAporte(sumarDroga(registros, (r) => r.claseBien || 'Sin clase'));

  // Detalle propio de Operatividad (circunstancia, bienes, ubicación de la
  // persona, situación jurídica) — a pedido explícito: estaba en el tipo
  // de datos pero nunca se mostraba en pantalla, solo en el PDF de
  // Microgerencia. Mismo patrón que las demás tarjetas de esta página.
  // Etiquetas más cortas para que quepan bien en la barra — a pedido
  // explícito. "Orden Judicial Ley 906/600" pasa a "O.J Ley 906"/"O.J Ley
  // 600" (conservando cuál de las dos leyes es, en vez de perder ese dato
  // fusionando ambas en una sola etiqueta "O.J").
  // Circunstancia de captura: solo "Orden judicial" (Ley 906 y Ley 600
  // juntas, sin la ley) y "Flagrancia" — a pedido explícito.
  const rankear = (campo: (r: (typeof registros)[number]) => string, top: ValorTop, base = registros) =>
    conAporte(recortar(contarOperatividad(base, (r) => campo(r) || 'NO REPORTADO').filter((d) => d.key !== 'NO REPORTADO'), top));
  const armas = registros.filter((r) => tipoOperatividad(r.categoria) === 'armas');
  const porCircunstancia = rankear((r) => agruparCircunstancia(r.circunstanciaCaptura), topCircunstancia, capturas);
  const porClaseBien = rankear((r) => r.claseBien, topClaseBien);
  const porTipoBien = rankear((r) => r.tipoBien, topTipoBien);
  const porMarca = rankear((r) => r.marca, topMarca);
  const porTurno = rankear((r) => r.turno, topTurno);
  const porCiudad = rankear((r) => r.ciudad, topCiudad);
  const porPaisPersona = rankear((r) => r.paisPersona, topPaisPersona);
  const porPermisoArma = rankear((r) => r.permisoArma.replace(/_/g, ' '), topPermisoArma, armas);
  const porSituacionJuridica = rankear((r) => r.situacionJuridica, topSituacionJuridica, capturas);
  const haySituacionJuridica = porSituacionJuridica.length > 0;

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
  const tarjeta = (titulo: string, archivo: string, Icono: LucideIcon, data: FilaAporte[], top?: { valor: ValorTop; set: (v: ValorTop) => void }, campo?: CampoSel) => (
    <Card
      title={titulo}
      descargable={archivo}
      icono={<Icono size={17} strokeWidth={2} className="shrink-0 text-[#0f5f57]" />}
      claseTitulo={CLASE_TITULO}
      actions={top ? <SelectorTopBotones valor={top.valor} onChange={top.set} institucional /> : undefined}
    >
      <AporteBarList data={data} colorBordeMaximo={AZUL_REY} compacta textoVacio={TEXTO_SIN_REGISTROS} onBarClick={campo ? (k) => alternar(campo, k) : undefined} />
      {campo && seleccion[campo] && (
        <button type="button" onClick={() => alternar(campo, seleccion[campo]!)} className="mt-2 text-[11px] font-semibold text-[#1d4ed8] hover:underline">✓ {seleccion[campo]} · clic para quitar</button>
      )}
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
          {chipsSeleccion.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#1d4ed8]/25 bg-[#eef2ff] px-3 py-2 text-[12px] text-[#10233f]">
              <span className="font-semibold">Seleccionado con clic:</span>
              {chipsSeleccion.map((c) => (
                <button key={c.id} type="button" onClick={c.quitar} title="Quitar" className="flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 font-semibold text-[#1d4ed8] ring-1 ring-[#1d4ed8]/30 hover:bg-[#1d4ed8] hover:text-white">
                  {c.texto} <span aria-hidden>×</span>
                </button>
              ))}
              <button type="button" onClick={() => { setSeleccion({}); setTramoSel(null); }} className="ml-auto font-semibold text-slate-600 underline hover:text-[#10233f]">Ver toda la información</button>
            </div>
          )}
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
              <ResumenOperatividadVisual
                total={total}
                categorias={conAportePorCategoria}
                droga={hayDroga ? { gramos: gramosDroga, unidad: unidadDroga, botonUnidad: <BotonUnidadDroga unidad={unidadDroga} onChange={setUnidadDroga} /> } : null}
              />
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
              <EvolucionOperatividad
                registros={registrosSinTramo.filter(cuentaComoOperatividad)}
                seleccion={tramoSel?.clave ?? null}
                onSeleccionar={(t) => setTramoSel((prev) => (prev?.clave === t.clave ? null : t))}
              />
            </Card>
          </div>

          {/* FILA 2 — los tres ejes principales de análisis */}
          <div className={GRILLA}>
            {/* Sin Top N, como antes: son pocas categorías y siempre se ven todas. */}
            {tarjeta('Por categoría de operatividad', 'operatividad-categoria', Layers, conAportePorCategoria, undefined, 'categoria')}
            {tarjeta('Capturas por delito asociado', 'operatividad-delito', Scale, porDelito, { valor: topDelito, set: setTopDelito }, 'delito')}
            {tarjeta('Por zona de atención', 'operatividad-zona', MapPin, porCuadrante, { valor: topZona, set: setTopZona }, 'zona')}
          </div>

          {/* FILA 3 */}
          <div className={GRILLA}>
            {tarjeta('Por barrio', 'operatividad-barrio', House, porBarrio, { valor: topBarrio, set: setTopBarrio }, 'barrio')}
            {tarjeta('Circunstancia de captura', 'operatividad-circunstancia', UserCheck, porCircunstancia, { valor: topCircunstancia, set: setTopCircunstancia }, 'circunstancia')}
            {tarjeta('Armas de fuego por permiso', 'operatividad-permiso-arma', FileBadge, porPermisoArma, { valor: topPermisoArma, set: setTopPermisoArma }, 'permiso')}
          </div>

          {/* FILA 4 */}
          <div className={GRILLA}>
            {tarjeta('Clase de bien', 'operatividad-clase-bien', Boxes, porClaseBien, { valor: topClaseBien, set: setTopClaseBien }, 'claseBien')}
            {tarjeta('Tipo de bien', 'operatividad-tipo-bien', Shapes, porTipoBien, { valor: topTipoBien, set: setTopTipoBien }, 'tipoBien')}
            {tarjeta('Marca', 'operatividad-marca', Tags, porMarca, { valor: topMarca, set: setTopMarca }, 'marca')}
          </div>

          {/* FILA 5 */}
          <div className={GRILLA}>
            {tarjeta('Turno', 'operatividad-turno', Clock, porTurno, { valor: topTurno, set: setTopTurno }, 'turno')}
            {tarjeta('Ciudad', 'operatividad-ciudad', Building2, porCiudad, { valor: topCiudad, set: setTopCiudad }, 'ciudad')}
            {tarjeta('País (persona)', 'operatividad-pais-persona', Globe, porPaisPersona, { valor: topPaisPersona, set: setTopPaisPersona }, 'pais')}
          </div>

          {/* FILA 6 — Droga (suma de cantidad, botón g/kg) y situación jurídica de los capturados */}
          <div className={GRILLA}>
            {hayDroga && (
              <Card
                title="Incautación de droga"
                subtitle={`Suma de cantidad por clase · total ${fmtDroga(gramosDroga)}`}
                descargable="operatividad-droga"
                icono={<Leaf size={17} strokeWidth={2} className="shrink-0 text-[#0f5f57]" />}
                claseTitulo={CLASE_TITULO}
                actions={<BotonUnidadDroga unidad={unidadDroga} onChange={setUnidadDroga} />}
              >
                <AporteBarList
                  data={drogaPorClase}
                  onBarClick={(k) => alternar('claseBien', k)}
                  colorBordeMaximo={AZUL_REY}
                  compacta
                  anchoValor={96}
                  formatoValor={fmtDroga}
                  textoVacio={TEXTO_SIN_REGISTROS}
                />
              </Card>
            )}
            {haySituacionJuridica && tarjeta('Situación jurídica de los capturados', 'operatividad-situacion-juridica', Gavel, porSituacionJuridica, { valor: topSituacionJuridica, set: setTopSituacionJuridica }, 'situacion')}
          </div>
        </>
      )}
    </div>
  );
}
