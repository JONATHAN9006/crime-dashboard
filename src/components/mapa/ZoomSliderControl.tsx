import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Control de zoom con una barra deslizante en vez de los botones +/- de
 * Leaflet — a pedido explícito. Se coloca DENTRO de <MapContainer> (usa
 * useMap()). Debe usarse junto con <MapContainer zoomControl={false}>
 * para que no queden los dos controles de zoom a la vez.
 */
export function ZoomSliderControl() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  const minZoom = map.getMinZoom() || 3;
  const maxZoom = map.getMaxZoom() && map.getMaxZoom() !== Infinity ? map.getMaxZoom() : 18;
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Si el usuario hace zoom con la rueda del mouse, pellizco táctil, o
  // doble clic, la barra se actualiza sola para reflejar el zoom real.
  useEffect(() => {
    const actualizar = () => setZoom(map.getZoom());
    map.on('zoomend', actualizar);
    return () => { map.off('zoomend', actualizar); };
  }, [map]);

  // El React onMouseDown/stopPropagation NO alcanza a bloquear el arrastre
  // del mapa — Leaflet engancha sus propios eventos nativos (mousedown,
  // touchstart) directamente sobre el contenedor del mapa para iniciar el
  // "pan", y esos escuchas nativos pueden dispararse antes de que React
  // procese el evento sintético, sin importar cuántos stopPropagation se
  // pongan del lado de React. Por eso el clic para arrastrar la barra
  // nunca funcionaba: el mapa "se robaba" el gesto para sí mismo. La
  // forma correcta (la que usa el propio Leaflet para sus controles
  // nativos) es L.DomEvent.disableClickPropagation/disableScrollPropagation,
  // que desactiva esos escuchas nativos específicamente para este
  // elemento.
  useEffect(() => {
    if (!contenedorRef.current) return;
    L.DomEvent.disableClickPropagation(contenedorRef.current);
    L.DomEvent.disableScrollPropagation(contenedorRef.current);
  }, []);

  return (
    <div
      ref={contenedorRef}
      className="leaflet-bar leaflet-control flex flex-col items-center gap-1 bg-white p-1.5 rounded shadow"
      style={{ position: 'absolute', top: 80, left: 10, zIndex: 1000, height: 140 }}
    >
      <span className="text-[10px] font-semibold text-slate-500">+</span>
      <input
        type="range"
        min={minZoom}
        max={maxZoom}
        step={1}
        value={zoom}
        onChange={(e) => {
          const nuevoZoom = Number(e.target.value);
          setZoom(nuevoZoom);
          map.setZoom(nuevoZoom);
        }}
        // Barra vertical — se logra rotando un input horizontal normal.
        style={{ writingMode: 'vertical-lr' as any, direction: 'rtl', width: 20, height: 100, cursor: 'pointer' }}
        title={`Zoom: ${zoom}`}
      />
      <span className="text-[10px] font-semibold text-slate-500">−</span>
    </div>
  );
}
