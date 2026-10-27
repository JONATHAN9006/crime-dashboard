// Bloqueo GLOBAL de descargas y cargas de archivos para los modos sin
// permiso (enlace /cai). Además de ocultar los botones (Card, encabezado,
// mapa…), aquí se corta la descarga en el punto final común a TODAS las
// librerías (xlsx, pptxgenjs, jsPDF, html2canvas + enlace <a download>), así
// que aunque algún botón quedara visible, no se descarga nada.
import { puedeDescargar, esSoloConsulta } from './permisos';

let instalado = false;

export function instalarBloqueoDescargas() {
  if (instalado || typeof window === 'undefined') return;
  const sinDescargas = !puedeDescargar();
  const soloConsulta = esSoloConsulta();
  if (!sinDescargas && !soloConsulta) return;
  instalado = true;
  const html = document.documentElement;
  if (sinDescargas) html.setAttribute('data-sin-descargas', '');
  if (soloConsulta) html.setAttribute('data-solo-consulta', '');

  if (sinDescargas) {
    const esDescarga = (a: HTMLAnchorElement) => a.hasAttribute('download') || a.href.startsWith('blob:') || a.href.startsWith('data:');
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (esDescarga(this)) { console.info('[Solo consulta] Descarga bloqueada.'); return; }
      return clickOriginal.call(this);
    };
    const abrirOriginal = window.open;
    window.open = function (url?: string | URL, ...resto: unknown[]) {
      const u = String(url ?? '');
      if (u.startsWith('blob:') || u.startsWith('data:')) { console.info('[Solo consulta] Descarga bloqueada.'); return null; }
      return (abrirOriginal as (...a: unknown[]) => Window | null).call(window, url, ...resto);
    } as typeof window.open;
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a');
      if (a && esDescarga(a as HTMLAnchorElement)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    // Copiar/arrastrar imágenes de los gráficos tampoco.
    document.addEventListener('dragstart', (e) => { if ((e.target as Element | null)?.closest?.('img,canvas,svg')) e.preventDefault(); }, true);
  }
  if (soloConsulta) {
    document.addEventListener('click', (e) => {
      const t = e.target as Element | null;
      const input = t?.closest?.('label')?.querySelector('input[type="file"]') ?? (t instanceof HTMLInputElement && t.type === 'file' ? t : null);
      if (input) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }, true);
  }
}
