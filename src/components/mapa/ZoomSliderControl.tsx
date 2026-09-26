import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';

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

  // Si el usuario hace zoom con la rueda del mouse, pellizco táctil, o
  // doble clic, la barra se actualiza sola para reflejar el zoom real.
  useEffect(() => {
    const actualizar = () => setZoom(map.getZoom());
    map.on('zoomend', actualizar);
    return () => { map.off('zoomend', actualizar); };
  }, [map]);

  return (
    <div
      className="leaflet-bar leaflet-control flex flex-col items-center gap-1 bg-white p-1.5 rounded shadow"
      style={{ position: 'absolute', top: 80, left: 10, zIndex: 1000, height: 140 }}
      // Evita que arrastrar la barra también arrastre/haga zoom al mapa de abajo.
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
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
