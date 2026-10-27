import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { claseDeDensidad, densidadKernelEnPunto, RADIO_BUSQUEDA_METROS } from '../../utils/kernelDensity';

// Consulta por clic sobre un mapa de calor Kernel: en la coordenada donde
// se hace clic calcula, con LA MISMA fórmula, radio (200 m) y proyección
// geodésica de la superficie, la densidad (eventos/m²) y lista los eventos
// reales que caen dentro del radio. Nada se estima ni se inventa: cada
// número sale de contar los puntos que ya se están pintando.

const ETIQUETAS_CLASE_DENSIDAD = ['Baja', 'Baja', 'Media', 'Alta', 'Crítica'];

interface PuntoConsultable {
  lat: number;
  lon: number;
  estacionCorta?: string | null;
  fila?: Record<string, unknown>;
}

function contarTop(valores: string[], n = 3): [string, number][] {
  const m = new Map<string, number>();
  for (const v of valores) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const fmt = (n: number) => n.toLocaleString('es-CO');

export function ConsultaDensidadKernel({ puntos, densidadMaxima, titulo }: {
  puntos: PuntoConsultable[];
  densidadMaxima: number | null;
  titulo: string;
}) {
  const mapa = useMap();

  useEffect(() => {
    const contenedor = mapa.getContainer();
    contenedor.style.cursor = 'crosshair';
    return () => { contenedor.style.cursor = ''; };
  }, [mapa]);

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      const { densidad, eventosEnRadio } = densidadKernelEnPunto(puntos, lat, lng);
      const enRadio = eventosEnRadio.map((i) => puntos[i]);
      const total = puntos.length;
      const clase = densidadMaxima ? claseDeDensidad(densidad, densidadMaxima) : null;
      const areaRadio = Math.PI * RADIO_BUSQUEDA_METROS * RADIO_BUSQUEDA_METROS;
      const lista = (pares: [string, number][]) => pares.map(([v, n]) => `${esc(v)} <b>${fmt(n)}</b>`).join(' · ') || '—';
      const categorias = contarTop(enRadio.map((p) => String(p.fila?.OPERATIVIDAD ?? '').trim()));
      const estaciones = contarTop(enRadio.map((p) => String(p.estacionCorta ?? '').trim()));
      const cuadrantes = contarTop(enRadio.map((p) => String(p.fila?.CUADRANTE ?? '').trim()));
      const html = `
        <div style="font:12px/1.45 system-ui,Arial,sans-serif;color:#10233f;min-width:220px">
          <div style="font-weight:800;font-size:12.5px;margin-bottom:4px">${esc(titulo)}</div>
          <div><b>Eventos en ${RADIO_BUSQUEDA_METROS} m:</b> ${fmt(enRadio.length)}${total ? ` (${(enRadio.length / total * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} % de ${fmt(total)} visibles)` : ''}</div>
          <div><b>Densidad:</b> ${densidad.toExponential(2)} eventos/m² <span style="color:#64748b">(${(densidad * 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} por km²)</span></div>
          <div><b>Nivel:</b> ${clase == null ? 'Bajo el umbral (sin color)' : ETIQUETAS_CLASE_DENSIDAD[clase]}</div>
          <div style="color:#64748b"><b>Área del radio:</b> ${fmt(Math.round(areaRadio))} m²</div>
          ${enRadio.length > 0 ? `
          <hr style="margin:5px 0;border:0;border-top:1px solid #e2e8f0">
          <div><b>Categoría:</b> ${lista(categorias)}</div>
          <div><b>Estación:</b> ${lista(estaciones)}</div>
          ${cuadrantes.length > 0 ? `<div><b>Cuadrante:</b> ${lista(cuadrantes)}</div>` : ''}` : ''}
        </div>`;
      L.popup({ maxWidth: 320 }).setLatLng(e.latlng).setContent(html).openOn(mapa);
    },
  });

  return null;
}
