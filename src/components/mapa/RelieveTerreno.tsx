import { useEffect, useRef, useState } from 'react';
import { Pane, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import clsx from 'clsx';
import { Mountain, Navigation } from 'lucide-react';

// ───────────────────────────────────────────────────────────────────────────
// ALTO RELIEVE para el mapa (Leaflet).
//
// Leaflet dibuja mapas en 2D: no tiene terreno 3D con cámara inclinada (eso
// exigiría cambiar todo el módulo a MapLibre GL / Mapbox GL). La alternativa
// viable, sin reconstruir nada, es la usada en cartografía topográfica:
//  · Sombreado del relieve (hillshade) calculado a partir de un modelo de
//    elevación digital — Esri World Hillshade — superpuesto con mezcla
//    «multiplicar», para que montañas, valles y cañones se lean en
//    relieve sobre el mapa base elegido (Mapa, Satélite o Híbrido).
//  · Con el mapa de calles: base topográfica OpenTopoMap (curvas de nivel,
//    tintes por altura y sombreado, a partir de SRTM).
// Es solo la cartografía de fondo: no toca capas, filtros, calor, puntos,
// ni cálculos; el mapa no se vuelve a crear al activarlo o desactivarlo
// (mismo centro y zoom).
//
// Fuentes (sin clave de API):
//  · Esri World Hillshade — © Esri, USGS, NGA, NASA, CGIAR, N Robinson,
//    NCEAS, NLS, OS, NMA, Geodatastyrelsen, Rijkswaterstaat, GSA,
//    Geoland, FEMA, Intermap y la comunidad GIS.
//  · OpenTopoMap — datos © OpenStreetMap contributors, SRTM; estilo ©
//    OpenTopoMap (CC-BY-SA). Uso moderado (servidor comunitario).
// ───────────────────────────────────────────────────────────────────────────

export const URL_SOMBREADO = 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';
const URL_TOPO = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';

export function useRelieveGuardado(clave: string) {
  const [activo, setActivo] = useState(() => { try { return localStorage.getItem(clave) === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(clave, activo ? '1' : '0'); } catch { /* opcional */ } }, [clave, activo]);
  return [activo, setActivo] as const;
}

/** Capas de relieve. Va dentro de <MapContainer>, después del mapa base. */
export function CapaRelieve({ activo, base, onErrorCarga }: { activo: boolean; base: 'mapa' | 'satelite' | 'hibrido'; onErrorCarga?: (hay: boolean) => void }) {
  const [errores, setErrores] = useState(0);
  useEffect(() => { setErrores(0); }, [activo, base]);
  useEffect(() => { onErrorCarga?.(errores > 6); }, [errores, onErrorCarga]);
  if (!activo) return null;
  const alError = { tileerror: () => setErrores((n) => n + 1) };
  return (
    <>
      {base === 'mapa' && (
        <TileLayer
          key="relieve-topo"
          url={URL_TOPO}
          subdomains={['a', 'b', 'c']}
          maxNativeZoom={17}
          maxZoom={20}
          attribution='Relieve: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), SRTM'
          eventHandlers={alError}
        />
      )}
      {/* Panel propio entre el fondo (200) y las capas temáticas (400): el
          sombreado oscurece montañas y valles sin tapar polígonos, calor ni puntos. */}
      <Pane name="relieve-sombreado" style={{ zIndex: 250, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
        <TileLayer
          key="relieve-sombreado"
          url={URL_SOMBREADO}
          maxNativeZoom={16}
          maxZoom={20}
          opacity={base === 'mapa' ? 0.55 : 0.7}
          attribution="Sombreado del relieve © Esri, USGS, NASA, CGIAR"
          eventHandlers={alError}
        />
      </Pane>
    </>
  );
}

/** Interruptor «Mapa normal | Alto relieve». */
export function SelectorRelieve({ activo, onCambiar, compacto = false }: { activo: boolean; onCambiar: (v: boolean) => void; compacto?: boolean }) {
  return (
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
  function ir(t: TerritorioNavegable) {
    setAbierto(false);
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
          {TERRITORIOS.map((t) => (
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
