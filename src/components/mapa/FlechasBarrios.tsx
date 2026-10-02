import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { direccionesHaciaAfuera, type FlechaBarrio } from '../../utils/barriosAfectados';

// Flecha + rótulo por cada barrio más afectado, encima del mapa de calor.
// Es un ícono HTML (divIcon) anclado en la punta de la flecha, así que al
// hacer zoom la punta sigue clavada en el barrio y el rótulo conserva su
// tamaño legible (no se encoge ni crece con el mapa).

const LARGO = 66; // px desde la punta hasta el centro del rótulo
const CABEZA = 13;

function htmlFlecha(f: FlechaBarrio, d: { x: number; y: number }): string {
  const lx = d.x * LARGO, ly = d.y * LARGO;
  const dist = Math.hypot(lx, ly) || 1;
  const ux = -lx / dist, uy = -ly / dist; // del rótulo hacia la punta
  const baseX = -ux * CABEZA, baseY = -uy * CABEZA;
  const px = -uy * CABEZA * 0.55, py = ux * CABEZA * 0.55;
  const m = LARGO + 10; // margen del lienzo SVG alrededor de la punta
  const t = (x: number, y: number) => `${(x + m).toFixed(1)},${(y + m).toFixed(1)}`;
  const texto = `${f.rango}. ${f.barrio}`;
  const casos = `${f.casos.toLocaleString('es-CO')} caso${f.casos === 1 ? '' : 's'}`;
  return `
    <div style="position:relative;width:0;height:0;pointer-events:none">
      <svg width="${m * 2}" height="${m * 2}" style="position:absolute;left:${-m}px;top:${-m}px;overflow:visible;z-index:0">
        <line x1="${(lx + m).toFixed(1)}" y1="${(ly + m).toFixed(1)}" x2="${(baseX + m).toFixed(1)}" y2="${(baseY + m).toFixed(1)}" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
        <line x1="${(lx + m).toFixed(1)}" y1="${(ly + m).toFixed(1)}" x2="${(baseX + m).toFixed(1)}" y2="${(baseY + m).toFixed(1)}" stroke="#b91c1c" stroke-width="3.5" stroke-linecap="round"/>
        <polygon points="${t(0, 0)} ${t(baseX + px, baseY + py)} ${t(baseX - px, baseY - py)}" fill="#b91c1c" stroke="#ffffff" stroke-width="1.5"/>
      </svg>
      <div style="position:absolute;left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translate(-50%,-50%);z-index:1;white-space:nowrap;background:#ffffff;border:2px solid #b91c1c;border-radius:6px;padding:2px 7px;box-shadow:0 2px 6px rgba(0,0,0,.25);font:700 11.5px/1.25 system-ui,Arial,sans-serif;color:#7f1d1d;text-align:center">
        ${texto.replace(/</g, '&lt;')}<br><span style="font-weight:600;color:#475569;font-size:10.5px">${casos}</span>
      </div>
    </div>`;
}

export function FlechasBarrios({ flechas }: { flechas: FlechaBarrio[] }) {
  const iconos = useMemo(() => {
    const dirs = direccionesHaciaAfuera(flechas);
    return flechas.map((f, i) => L.divIcon({ className: 'flecha-barrio', html: htmlFlecha(f, dirs[i]), iconSize: [0, 0], iconAnchor: [0, 0] }));
  }, [flechas]);
  return (
    <>
      {flechas.map((f, i) => (
        <Marker key={`${f.rango}-${f.barrio}`} position={[f.lat, f.lon]} icon={iconos[i]} interactive={false} keyboard={false} zIndexOffset={1000} />
      ))}
    </>
  );
}
