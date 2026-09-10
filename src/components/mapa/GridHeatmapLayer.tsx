import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { PuntoDensidad } from '../../utils/kernelDensity';

export interface GridHeatmapLayerProps {
  puntos: PuntoDensidad[];
  colores: string[]; // 5 clases fijas, de menor a mayor densidad
  ladoCeldaMetros?: number; // ~250m por defecto — el tamaño típico de una cuadrícula "compacta y densa"
  opacidad?: number;
}

// Mapa de calor COMPACTO por cuadrícula, no un degradado difuminado. Cada
// celda es un L.rectangle real (una figura vectorial anclada a coordenadas
// geográficas, igual que cualquier otro polígono del mapa) — por eso NUNCA
// se pierde ni se ve distinto al hacer zoom o mover el mapa: Leaflet la
// reposiciona sola, no es una imagen ni un canvas que haya que "escalar".
export function GridHeatmapLayer({ puntos, colores, ladoCeldaMetros = 250, opacidad = 0.65 }: GridHeatmapLayerProps) {
  const map = useMap();
  const grupoRef = useRef<L.LayerGroup | null>(null);

  const firma = useMemo(() => puntos.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('|'), [puntos]);

  useEffect(() => {
    if (grupoRef.current) {
      grupoRef.current.remove();
      grupoRef.current = null;
    }
    if (puntos.length === 0) return;

    // Tamaño de celda en grados — 1° de latitud ≈ 111.320 m siempre; 1° de
    // longitud depende de la latitud (se encoge hacia los polos), por eso
    // se ajusta con el coseno de la latitud promedio de los puntos.
    const latProm = puntos.reduce((a, p) => a + p.lat, 0) / puntos.length;
    const metrosPorGradoLat = 111320;
    const metrosPorGradoLon = 111320 * Math.cos((latProm * Math.PI) / 180);
    const altoCelda = ladoCeldaMetros / metrosPorGradoLat;
    const anchoCelda = ladoCeldaMetros / metrosPorGradoLon;

    // Conteo de puntos por celda de la cuadrícula (fishnet).
    const conteoPorCelda = new Map<string, { fila: number; col: number; casos: number }>();
    for (const p of puntos) {
      const fila = Math.floor(p.lat / altoCelda);
      const col = Math.floor(p.lon / anchoCelda);
      const clave = `${fila}:${col}`;
      const actual = conteoPorCelda.get(clave);
      if (actual) actual.casos += 1;
      else conteoPorCelda.set(clave, { fila, col, casos: 1 });
    }

    const celdas = Array.from(conteoPorCelda.values());
    const maxCasos = Math.max(...celdas.map((c) => c.casos), 1);

    // Clasificación en 5 clases por intervalos iguales sobre el máximo real
    // de la cuadrícula actual (se recalcula solo con cada cambio real de
    // puntos, nunca con el zoom).
    function colorDeCelda(casos: number): string {
      const proporcion = casos / maxCasos;
      const indice = Math.min(colores.length - 1, Math.floor(proporcion * colores.length));
      return colores[indice];
    }

    const grupo = L.layerGroup();
    for (const celda of celdas) {
      const sur = celda.fila * altoCelda;
      const norte = sur + altoCelda;
      const oeste = celda.col * anchoCelda;
      const este = oeste + anchoCelda;
      L.rectangle([[sur, oeste], [norte, este]], {
        color: 'transparent',
        weight: 0,
        fillColor: colorDeCelda(celda.casos),
        fillOpacity: opacidad,
        interactive: false,
      }).addTo(grupo);
    }
    grupo.addTo(map);
    grupoRef.current = grupo;

    return () => {
      grupo.remove();
      if (grupoRef.current === grupo) grupoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma, map, colores, ladoCeldaMetros, opacidad]);

  return null;
}
