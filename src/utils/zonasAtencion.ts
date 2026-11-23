// Valores del campo de zona de atención que en realidad son solo el código de
// la estación (ej. «E-Norte», «E-Sur»): esos registros no están asociados a
// un cuadrante ni a una zona de atención, así que se omiten en los rankings
// de «Zonas de Atención». Sus casos siguen contando en todo lo demás.
export const esZonaSinCuadrante = (zona: string | null | undefined) => /^\s*E\s*-\s*[A-Za-zÁÉÍÓÚáéíóúÑñ]+\s*$/.test(String(zona ?? ''));
