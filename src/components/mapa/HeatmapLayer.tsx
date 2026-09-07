import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

// leaflet.heat (la librería del mapa de calor) SIEMPRE pinta su lienzo en el
// "overlayPane" del mapa, sin importar qué "pane" se le indique — es una
// limitación de la propia librería, no un descuido nuestro. Los polígonos
// (Cuadrantes, CAI, Jurisdicción Estación...) también viven en ese mismo
// pane, y cada vez que se redibujan por un cambio de filtro, terminaban
// pintándose ENCIMA del mapa de calor. Este parche hace que si se le pasa
// `pane` en las opciones, sí lo respete de verdad — así el calor se puede
// ubicar en "markerPane" (una capa de Leaflet que siempre se pinta por
// encima de "overlayPane"), quedando siempre visible sin importar el orden
// en que se redibuje cada cosa.
const HeatLayerProto = (L as any).HeatLayer?.prototype;
if (HeatLayerProto && !HeatLayerProto.__paneParcheado) {
  HeatLayerProto.onAdd = function (map: L.Map) {
    this._map = map;
    if (!this._canvas) this._initCanvas();
    const pane = map.getPane(this.options.pane || 'overlayPane') || map.getPane('overlayPane')!;
    pane.appendChild(this._canvas);
    map.on('moveend', this._reset, this);
    if (map.options.zoomAnimation && (L as any).Browser.any3d) map.on('zoomanim', this._animateZoom, this);
    this._reset();
  };
  HeatLayerProto.onRemove = function (map: L.Map) {
    const pane = map.getPane(this.options.pane || 'overlayPane') || map.getPane('overlayPane')!;
    pane.removeChild(this._canvas);
    map.off('moveend', this._reset, this);
    if (map.options.zoomAnimation) map.off('zoomanim', this._animateZoom, this);
  };
  HeatLayerProto.__paneParcheado = true;
}

export interface HeatmapLayerProps {
  puntos: { lat: number; lon: number }[];
  gradient: Record<number, string>;
  radius?: number;
  blur?: number;
  maxOpacidad?: number;
}

// Envoltorio de React sobre L.heatLayer (leaflet.heat) — a diferencia de
// pintar un CircleMarker por punto, esto calcula una verdadera densidad
// espacial: superpone muchos puntos cercanos y el propio algoritmo del
// plugin acumula su "calor", dando más intensidad donde hay más
// concentración real, no solo más puntos sueltos del mismo color.
//
// radius/blur por defecto: 38/30. Un blur bajo respecto al radio (ej. 22/12,
// como se probó antes) da manchas con un borde bastante marcado — se ve más
// a "muchos círculos superpuestos" que a una superficie continua. Con blur
// cercano o mayor al radio, los puntos cercanos se funden en una sola mancha
// suave, y las zonas de verdadera concentración siguen llegando al color más
// intenso del degradado — no se pierde fuerza, solo se gana continuidad.
export function HeatmapLayer({ puntos, gradient, radius = 38, blur = 30, maxOpacidad = 0.8 }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    const capa = L.heatLayer(
      puntos.map((p) => [p.lat, p.lon, 1]),
      { radius, blur, maxZoom: 17, gradient, minOpacity: 0.15, pane: 'markerPane' } as any,
    );
    capa.addTo(map);
    layerRef.current = capa;
    return () => {
      capa.remove();
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Actualiza los puntos y el degradado sin recrear la capa desde cero cada
  // vez (evita el parpadeo al cambiar de filtro).
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setLatLngs(puntos.map((p) => [p.lat, p.lon, 1]));
    layerRef.current.setOptions({ gradient, radius, blur, minOpacity: 0.15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, gradient, radius, blur]);

  return null;
}
