import { useEffect, useRef, useState } from 'react';
import { restriccionPopayanActiva } from '../../utils/restriccionTerritorial';
import { reportarEventoSeguridad } from '../../cuentas/apiCuentas';
import { Pane, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import clsx from 'clsx';
import { Mountain, Navigation } from 'lucide-react';
import { canvasRelieve, ZOOM_MAX_DEM, ATRIBUCION_DEM, type ModoRelieve } from '../../utils/relieveDem';

// ───────────────────────────────────────────────────────────────────────────
// ALTO RELIEVE para el mapa (Leaflet).
//
// El relieve se PINTA en el navegador a partir de un modelo de elevación
// digital (Terrain Tiles / SRTM, ver utils/relieveDem.ts): tintes por altura
// (verde → amarillo → ocre → café → blanco en los volcanes) + sombreado
// multidireccional con exageración vertical, como los mapas físicos.
// Leaflet es 2D: no hay cámara inclinada (eso exigiría rehacer el módulo con
// MapLibre GL); el volumen se logra con el sombreado.
// Es solo el fondo: no toca capas, filtros, calor, puntos ni cálculos, y el
// mapa no se vuelve a crear (mismo centro y zoom).
//  · Mapa / Híbrido → relieve a color + vías y nombres encima (Esri Reference).
//  · Satélite      → la imagen satelital con el sombreado del relieve encima.
// ───────────────────────────────────────────────────────────────────────────

export type IntensidadRelieve = 'suave' | 'media' | 'fuerte';
const EXAGERACION: Record<IntensidadRelieve, number> = { suave: 1.4, media: 2.4, fuerte: 4 };
export interface OpcionesRelieveMapa { intensidad: IntensidadRelieve; vias: boolean }

export function useRelieveGuardado(clave: string) {
  const [activo, setActivo] = useState(() => { try { return localStorage.getItem(clave) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(clave, activo ? '1' : '0'); } catch { /* opcional */ } }, [clave, activo]);
  return [activo, setActivo] as const;
}

export function useOpcionesRelieve() {
  const [op, setOp] = useState<OpcionesRelieveMapa>(() => {
    try { return { intensidad: 'media', vias: true, ...JSON.parse(localStorage.getItem('mepoy-relieve-opciones') || '{}') }; } catch { return { intensidad: 'media', vias: true }; }
  });
  useEffect(() => { try { localStorage.setItem('mepoy-relieve-opciones', JSON.stringify(op)); } catch { /* opcional */ } }, [op]);
  return [op, setOp] as const;
}

export function exageracionDe(op: OpcionesRelieveMapa) {
  return EXAGERACION[op.intensidad];
}

// Capa de Leaflet que pinta cada tile del relieve desde el DEM.
const CapaDem = L.GridLayer.extend({
  createTile(this: L.GridLayer & { options: L.GridLayerOptions & { modo: ModoRelieve; exageracion: number } }, coords: L.Coords, done: L.DoneCallback) {
    const tile = document.createElement('canvas');
    tile.width = 256; tile.height = 256;
    canvasRelieve(coords.z, coords.x, coords.y, { modo: this.options.modo, exageracion: this.options.exageracion })
      .then((c) => { tile.getContext('2d')!.drawImage(c, 0, 0); done(undefined, tile); })
      .catch((e) => done(e instanceof Error ? e : new Error(String(e)), tile));
    return tile;
  },
});

function GridDem({ modo, exageracion, pane, zIndex, opacity, onError }: { modo: ModoRelieve; exageracion: number; pane?: string; zIndex: number; opacity: number; onError: () => void }) {
  const map = useMap();
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    const capa = new (CapaDem as unknown as new (o: object) => L.GridLayer)({
      modo, exageracion, pane: pane ?? 'tilePane', zIndex, opacity,
      maxNativeZoom: ZOOM_MAX_DEM, maxZoom: 20, tileSize: 256, keepBuffer: 2, updateWhenZooming: false,
      attribution: ATRIBUCION_DEM,
    });
    capa.on('tileerror', () => errorRef.current());
    capa.addTo(map);
    return () => { capa.remove(); };
  }, [map, modo, exageracion, pane, zIndex, opacity]);
  return null;
}

/** Capas de relieve. Va dentro de <MapContainer>, después del mapa base. */
export function CapaRelieve({ activo, base, opciones, onErrorCarga }: { activo: boolean; base: 'mapa' | 'satelite' | 'hibrido'; opciones: OpcionesRelieveMapa; onErrorCarga?: (hay: boolean) => void }) {
  const [errores, setErrores] = useState(0);
  useEffect(() => { setErrores(0); }, [activo, base]);
  useEffect(() => { onErrorCarga?.(errores > 6); }, [errores, onErrorCarga]);
  if (!activo) return null;
  const ex = EXAGERACION[opciones.intensidad];
  const alError = () => setErrores((n) => n + 1);
  if (base === 'satelite') {
    return (
      <Pane name="relieve-sombreado" style={{ zIndex: 250, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
        <GridDem modo="sombra" exageracion={ex} pane="relieve-sombreado" zIndex={1} opacity={0.85} onError={alError} />
      </Pane>
    );
  }
  return (
    <>
      <GridDem modo="color" exageracion={ex} zIndex={5} opacity={1} onError={alError} />
      {opciones.vias && (
        <>
          <TileLayer key="relieve-vias" zIndex={6} url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} opacity={0.9} attribution="Vías y nombres © Esri" />
          <TileLayer key="relieve-lugares" zIndex={7} url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxNativeZoom={19} maxZoom={20} />
        </>
      )}
    </>
  );
}

/** Interruptor «Mapa normal | Alto relieve» y, con el relieve activo, su intensidad y las vías. */
export function SelectorRelieve({ activo, onCambiar, opciones, onOpciones, compacto = false }: { activo: boolean; onCambiar: (v: boolean) => void; opciones?: OpcionesRelieveMapa; onOpciones?: (o: OpcionesRelieveMapa) => void; compacto?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Visualización del terreno">
        {!compacto && <span className="hidden pl-1.5 pr-0.5 text-[11px] font-semibold text-slate-500 xl:inline">Terreno:</span>}
        {([[false, 'Mapa normal'], [true, 'Alto relieve']] as const).map(([v, t]) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={activo === v}
            onClick={() => onCambiar(v)}
            className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold', activo === v ? (v ? 'bg-[#116762] text-white shadow-sm' : 'bg-[#10233f] text-white shadow-sm') : 'text-slate-600 hover:bg-white')}
          >
            {v && <Mountain size={13} />} {t}
          </button>
        ))}
      </div>
      {activo && opciones && onOpciones && <OpcionesRelieveControl opciones={opciones} onOpciones={onOpciones} />}
    </div>
  );
}

export function OpcionesRelieveControl({ opciones, onOpciones }: { opciones: OpcionesRelieveMapa; onOpciones: (o: OpcionesRelieveMapa) => void }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-[#116762]/30 bg-[#e3f2ef] px-1.5 py-0.5 text-[11.5px] text-[#0f5f57]">
      <span className="font-semibold">Relieve:</span>
      {(['suave', 'media', 'fuerte'] as const).map((i) => (
        <button key={i} type="button" aria-pressed={opciones.intensidad === i} onClick={() => onOpciones({ ...opciones, intensidad: i })} className={clsx('rounded px-1.5 py-0.5 font-semibold capitalize', opciones.intensidad === i ? 'bg-[#116762] text-white' : 'hover:bg-white')}>{i}</button>
      ))}
      <label className="ml-1 flex cursor-pointer items-center gap-1 font-semibold">
        <input type="checkbox" className="h-3.5 w-3.5 accent-[#116762]" checked={opciones.vias} onChange={(e) => onOpciones({ ...opciones, vias: e.target.checked })} /> Vías y nombres
      </label>
    </div>
  );
}

// ── Ir a un territorio ────────────────────────────────────────────────────
// Primero se busca el territorio en las capas geográficas cargadas (su
// polígono oficial). Si no está, se centra en la cabecera, con coordenadas
// de referencia públicas:
//  · Popayán: centro usado por el dashboard.
//  · Timbío: 2°21′10″N 76°40′55″O (Wikipedia / Kiddle).
//  · Coconuco: 2°20′53″N 76°30′03″O — es la CABECERA del municipio de
//    Puracé (no es un municipio aparte); «Puracé» lleva al mismo municipio.
//  · Sotará: 2.250, -76.583 (Wikipedia; cabecera Paispamba).
export interface TerritorioNavegable { id: string; nombre: string; patron: RegExp; centro: [number, number]; zoom: number; nota?: string }
export const TERRITORIOS: TerritorioNavegable[] = [
  { id: 'popayan', nombre: 'Popayán', patron: /POPAYAN|E-?NORTE|E-?SUR/, centro: [2.4448, -76.6147], zoom: 13 },
  { id: 'timbio', nombre: 'Timbío', patron: /TIMBIO/, centro: [2.3528, -76.6819], zoom: 14 },
  { id: 'coconuco', nombre: 'Coconuco (Puracé)', patron: /COCONUCO/, centro: [2.3481, -76.5008], zoom: 14, nota: 'Cabecera del municipio de Puracé' },
  { id: 'purace', nombre: 'Puracé', patron: /PURACE/, centro: [2.3481, -76.5008], zoom: 12, nota: 'Municipio (cabecera: Coconuco)' },
  { id: 'sotara', nombre: 'Sotará', patron: /SOTARA|PAISPAMBA/, centro: [2.25, -76.583], zoom: 13 },
];

function normalizar(v: unknown) {
  return String(v ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

type CapaConGeo = { visible?: boolean; nombre: string; geojson: unknown };
function featuresDe(g: any): any[] {
  if (!g) return [];
  if (Array.isArray(g)) return g.flatMap(featuresDe);
  if (g.type === 'FeatureCollection') return g.features ?? [];
  if (g.type === 'Feature') return [g];
  return [];
}

function limitesDe(features: any[]): L.LatLngBounds | null {
  let b: L.LatLngBounds | null = null;
  const agregar = (c: any) => {
    if (typeof c?.[0] === 'number') { const ll = L.latLng(c[1], c[0]); b = b ? b.extend(ll) : L.latLngBounds(ll, ll); }
    else if (Array.isArray(c)) c.forEach(agregar);
  };
  for (const f of features) agregar(f?.geometry?.coordinates);
  return b;
}

/** Menú «Ir a» (va en la barra de herramientas, FUERA del mapa, para que sus clics no lleguen al mapa). */
export function IrATerritorio({ capas, obtenerMapa }: { capas: CapaConGeo[]; obtenerMapa: () => L.Map | null }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);
  // Perfil piloto: solo Popayán; cualquier otro destino se rechaza y queda registrado.
  const piloto = restriccionPopayanActiva();
  const territorios = piloto ? TERRITORIOS.filter((t) => t.id === 'popayan') : TERRITORIOS;
  function ir(t: TerritorioNavegable) {
    setAbierto(false);
    if (piloto && t.id !== 'popayan') { reportarEventoSeguridad('geo_fuera'); return; }
    const map = obtenerMapa();
    if (!map) return;
    const coinciden = capas.flatMap((c) => featuresDe(c.geojson)).filter((f) => Object.values(f?.properties ?? {}).some((v) => t.patron.test(normalizar(v))));
    const b = coinciden.length > 0 ? limitesDe(coinciden) : null;
    if (b && b.isValid()) map.flyToBounds(b, { padding: [30, 30], maxZoom: 15, duration: 0.8 });
    else map.flyTo(t.centro, t.zoom, { duration: 0.8 });
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} title="Ir a un territorio" className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-[#10233f] hover:bg-slate-50">
        <Navigation size={13} /> Ir a
      </button>
      {abierto && (
        <div className="absolute right-0 top-9 z-[1100] w-[210px] rounded-xl border border-slate-200 bg-white p-1.5 text-[12.5px] shadow-lg">
          {territorios.map((t) => (
            <button key={t.id} type="button" onClick={() => ir(t)} className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-[#e3f2ef]">
              <span className="font-semibold text-[#10233f]">{t.nombre}</span>
              {t.nota && <span className="block text-[10.5px] text-slate-400">{t.nota}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Selector de estilo cartográfico (Mapa / Georreferenciación) ───────────
export type EstiloCartografico = 'operativo' | 'sombreado' | 'relieve3d' | 'satelite3d';

/** «Mapa operativo | Relieve sombreado | Relieve 3D | Satélite 3D». El operativo es el predeterminado. */
export function SelectorEstiloMapa({ estilo, onCambiar }: { estilo: EstiloCartografico; onCambiar: (e: EstiloCartografico) => void }) {
  const opciones: [EstiloCartografico, string, string][] = [
    ['operativo', 'Mapa operativo', 'El mapa de trabajo de siempre'],
    ['sombreado', 'Relieve sombreado', 'Relieve con colores por altura y sombras (2D)'],
    ['relieve3d', 'Relieve 3D', 'Terreno en 3D con inclinación y rotación'],
    ['satelite3d', 'Satélite 3D', 'Imagen satelital sobre el terreno en 3D'],
  ];
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="radiogroup" aria-label="Estilo cartográfico">
      {opciones.map(([e, t, d]) => (
        <button
          key={e}
          type="button"
          role="radio"
          aria-checked={estilo === e}
          title={d}
          onClick={() => onCambiar(e)}
          className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-semibold', estilo === e ? (e === 'operativo' ? 'bg-[#10233f] text-white shadow-sm' : 'bg-[#116762] text-white shadow-sm') : 'text-slate-600 hover:bg-white')}
        >
          {e !== 'operativo' && <Mountain size={13} />} {t}
        </button>
      ))}
    </div>
  );
}
