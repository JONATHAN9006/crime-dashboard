import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { calcularKernelDensidad, type PuntoDensidad } from '../../utils/kernelDensity';

export interface KernelHeatmapLayerProps {
  puntos: PuntoDensidad[];
  colores: string[];
  opacidad?: number;
}

// A diferencia de HeatmapLayer (leaflet.heat, que recalcula el radio en
// píxeles de pantalla en cada zoom), este componente calcula el Kernel
// Density UNA SOLA VEZ por cada cambio real de datos/filtro, y lo ancla al
// mapa como una imagen georreferenciada (L.imageOverlay) — el zoom solo
// escala esa imagen como cualquier otra capa del mapa, nunca vuelve a
// ejecutar el cálculo del kernel ni cambia su clasificación de colores.
export function KernelHeatmapLayer({ puntos, colores, opacidad = 0.75 }: KernelHeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.ImageOverlay | null>(null);

  // Firma de contenido (no de referencia) — para no recalcular el kernel si
  // el array de puntos cambia de identidad pero no de contenido real.
  const firma = useMemo(() => puntos.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|'), [puntos]);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.remove();
      layerRef.current = null;
    }
    const resultado = calcularKernelDensidad(puntos, colores);
    if (!resultado) return;
    const overlay = L.imageOverlay(resultado.dataUrl, resultado.bounds, {
      opacity: opacidad,
      interactive: false,
      pane: 'markerPane',
    });
    overlay.addTo(map);
    layerRef.current = overlay;
    return () => {
      overlay.remove();
      if (layerRef.current === overlay) layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, map]);

  return null;
}
