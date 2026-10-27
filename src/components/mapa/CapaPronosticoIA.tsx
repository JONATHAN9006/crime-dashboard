import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { CrimeRecord } from '../../types/crime';
import { generarPronostico, type Horizonte } from '../../utils/analisisPredictivo';
import { localizarCapaDeCai, nombreCaiDeFeature } from '../../data/microgerenciaMapas';

// Escala de 4 colores pedida explícitamente (🟢 baja → 🟡 moderada → 🟠 alta
// → 🔴 muy alta) — más granular que los 3 niveles del motor (Alto/
// Moderado/Bajo), así que aquí se mapea el índice de concentración
// directamente a estos 4 tonos, solo para la representación visual del
// mapa (el cálculo real sigue siendo el mismo de utils/analisisPredictivo.ts).
function colorPorIndice(indice: number): string {
  if (indice >= 5) return '#dc2626'; // muy alta
  if (indice >= 3) return '#f97316'; // alta
  if (indice >= 1.5) return '#facc15'; // moderada
  return '#22c55e'; // baja (no debería llegar aquí, ver umbral mínimo abajo)
}

interface CapaPronosticoIAProps {
  activo: boolean;
  delito: string | null;
  horizonteHoras: Horizonte;
  records: CrimeRecord[];
}

/** Capa "Pronóstico analítico" — colorea los CAI según la concentración pronosticada para el horizonte y delito seleccionados. DEBE ir dentro de <MapContainer>. */
export function CapaPronosticoIA({ activo, delito, horizonteHoras, records }: CapaPronosticoIAProps) {
  const map = useMap();
  const capaRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function dibujar() {
      if (capaRef.current) { map.removeLayer(capaRef.current); capaRef.current = null; }
      if (!activo || records.length === 0) return;

      // Se piden más alertas de las que se van a mostrar como tarjetas
      // (maxAlertas alto) porque aquí interesa TODA zona con evidencia
      // suficiente, no solo el top — cada CAI que califique se colorea.
      const { alertas } = generarPronostico(records, { delito, dimensionZona: 'cai', horizonteHoras, maxAlertas: 30 });
      if (cancelado || alertas.length === 0) return;

      // Un CAI puede aparecer en varias alertas (distintos días/franjas
      // dentro del mismo horizonte) — para colorear el polígono se usa su
      // concentración MÁS ALTA entre todas sus alertas.
      const indicePorCai = new Map<string, number>();
      for (const a of alertas) {
        const actual = indicePorCai.get(a.zona) ?? 0;
        if (a.indiceConcentracion > actual) indicePorCai.set(a.zona, a.indiceConcentracion);
      }

      const localizada = await localizarCapaDeCai();
      if (cancelado || !localizada) return;

      const featuresColoreadas = localizada.features
        .map((f) => {
          const nombreCai = nombreCaiDeFeature(f, localizada.columna);
          const indice = indicePorCai.get(nombreCai);
          if (indice == null) return null;
          return { ...f, properties: { ...f.properties, __indicePronostico: indice, __nombreCaiPronostico: nombreCai } };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null);

      if (featuresColoreadas.length === 0) return;

      const capa = L.geoJSON({ type: 'FeatureCollection', features: featuresColoreadas } as any, {
        style: (feature) => ({
          color: '#1e293b',
          weight: 1.5,
          fillColor: colorPorIndice(feature!.properties.__indicePronostico),
          fillOpacity: 0.55,
        }),
        onEachFeature: (feature, layer) => {
          const indice = feature.properties.__indicePronostico as number;
          const nombre = feature.properties.__nombreCaiPronostico as string;
          layer.bindTooltip(
            `<b>${nombre}</b><br/>Concentración pronosticada: ${indice.toFixed(1)}×<br/><span style="font-size:10px;color:#64748b">Basado en patrones históricos — no es una certeza de ocurrencia.</span>`,
            { sticky: true },
          );
        },
      });
      capa.addTo(map);
      capaRef.current = capa;
    }
    dibujar();
    return () => { cancelado = true; };
  }, [map, activo, delito, horizonteHoras, records]);

  useEffect(() => () => { if (capaRef.current) map.removeLayer(capaRef.current); }, [map]);

  return null;
}
