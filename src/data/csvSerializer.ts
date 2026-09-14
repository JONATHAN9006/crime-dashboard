import type { CrimeRecord } from '../types/crime';

const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const escapar = (valor: string) => {
  const v = valor ?? '';
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
};

// Reconstruye un CSV en el ÚNICO esquema normalizado "oficial vigente" (el
// mismo de Base_de_Datos_General.csv / db2Transform.ts), a partir de los
// campos YA NORMALIZADOS de cada CrimeRecord — nunca de las columnas
// "raw" originales de cada archivo.
//
// IMPORTANTE — por qué NO se usa r.raw aquí: cuando el dataset mezcla
// registros de dos orígenes distintos (ej. un archivo histórico con
// columnas "CAI"/"ESTACION"/"CUADRANTE" + una descarga DB2 ya transformada
// con columnas "CAI Final"/"Estación Final"/"Cuadrante Final"), unir las
// columnas raw de todos los orígenes en un solo CSV combinado hace que cada
// fila termine con AMBOS nombres de columna — uno vacío, porque esa fila
// no venía de ese formato. Al volver a leer ese CSV combinado, el
// buscador de columnas (findColumn, en csvParser.ts) podía quedarse con la
// columna vacía en vez de la que sí tenía el dato real, dejando en blanco
// CAI, Estación, Cuadrante, Barrio, Armas, Modalidad, Clase de sitio y
// Turno para todos los registros del segundo origen (bug verificado:
// reproducido exactamente con un archivo histórico 2003-2023 + una
// descarga DB2 2025-2026 fusionados y sincronizados con el backend).
// Exportar siempre el mismo esquema fijo, construido desde los campos ya
// normalizados, elimina esta clase de error de raíz sin importar cuántos
// formatos de origen distintos se hayan mezclado.
export function serializarCsv(records: CrimeRecord[], fechaMaxParametro?: Date | null): string {
  if (records.length === 0) return '';

  const columnas = [
    'Año', 'Hora_24', 'Mes', 'Dia', 'Mes resumido', 'dia resumido', 'Fecha Dia', 'Semana2',
    'Delito', 'Estación Final', 'CAI Final', 'Cuadrante Final', 'Genero Final', 'Zona Final',
    'Clase Sitio Final', 'Arma Final', 'Modalidad Final', 'Causa Lesion Final',
    'Barrio Hecho Final', 'Grupo Edad Ley Final', 'EDAD', 'CANTIDAD', 'FECHA_MAX_PARAMETRO',
  ];

  const fechaMaxTexto = fechaMaxParametro
    ? `${String(fechaMaxParametro.getDate()).padStart(2, '0')}/${String(fechaMaxParametro.getMonth() + 1).padStart(2, '0')}/${fechaMaxParametro.getFullYear()}`
    : '';

  const lineas: string[] = [columnas.map(escapar).join(';')];
  for (const r of records) {
    const anio = r.fecha ? r.fecha.getFullYear() : (r.anio ?? '');
    const mesIdx = r.fecha ? r.fecha.getMonth() : (r.mes ? r.mes - 1 : null);
    const diaSemanaIdx = r.fecha ? r.fecha.getDay() : null;
    const fila = [
      String(anio ?? ''),
      r.hora !== null && r.hora !== undefined ? String(r.hora) : '',
      mesIdx !== null ? MESES_NOMBRE[mesIdx] : (r.nombreMes || ''),
      diaSemanaIdx !== null ? DIAS_NOMBRE[diaSemanaIdx] : (r.diaSemana || ''),
      mesIdx !== null ? MESES_CORTO[mesIdx] : '',
      diaSemanaIdx !== null ? DIAS_CORTO[diaSemanaIdx] : '',
      r.dia !== null && r.dia !== undefined ? String(r.dia) : '',
      r.semana !== null && r.semana !== undefined ? String(r.semana) : '',
      r.delito || '',
      r.estacion || '',
      r.cai || '',
      r.cuadrante || '',
      r.genero || '',
      r.zona || '',
      r.claseSitio || '',
      r.armas || '',
      r.modalidad || '',
      r.causaLesion || '',
      r.barrioHecho || '',
      r.grupoEdad || '',
      r.edad !== null && r.edad !== undefined ? String(r.edad) : '',
      String(r.cantidad ?? 1),
      fechaMaxTexto,
    ];
    lineas.push(fila.map(escapar).join(';'));
  }
  return lineas.join('\r\n');
}
