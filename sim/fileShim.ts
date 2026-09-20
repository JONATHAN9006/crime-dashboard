import { readFileSync } from 'fs';
class FileReaderShim {
  onload: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  result: any = null; error: any = null;
  async readAsArrayBuffer(file: File) {
    try { this.result = await file.arrayBuffer(); this.onload?.({ target: this }); }
    catch (e) { this.error = e; this.onerror?.({ target: this }); }
  }
  async readAsText(file: File) {
    try { this.result = await file.text(); this.onload?.({ target: this }); }
    catch (e) { this.error = e; this.onerror?.({ target: this }); }
  }
}
// @ts-expect-error polyfill
globalThis.FileReader = FileReaderShim;
export function makeFile(path: string, name: string): File {
  const buf = readFileSync(path);
  const isText = /\.csv$/i.test(name);
  return new File([new Blob([buf])], name, { type: isText ? 'text/csv' : 'application/octet-stream' });
}
