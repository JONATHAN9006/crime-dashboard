/**
 * BACKEND CENTRAL — Dashboard de Análisis Delictivo
 * ---------------------------------------------------
 * Este script guarda los archivos CSV "oficiales" en una carpeta de Google
 * Drive y los expone como una API sencilla para que el dashboard pueda:
 *   - GET  ?action=chunk → descargar el CSV POR PARTES (ver más abajo)
 *   - GET  (sin action)  → descargar el CSV completo en una sola respuesta
 *                          (se mantiene por compatibilidad; ver aviso abajo)
 *   - GET ?action=meta → consultar cuándo fue la última actualización
 *   - POST → subir una nueva versión del CSV (protegido con un token)
 *
 * Soporta DOS datasets independientes — Delictividad (el de siempre) y
 * Operatividad (capturas/incautaciones) — cada uno con su propio archivo.
 *
 * VERSIÓN 2 — CORRECCIÓN IMPORTANTE: en vez de buscar el archivo POR
 * NOMBRE cada vez (con DriveApp.getFilesByName), ahora se guarda el ID
 * real del archivo la PRIMERA vez que se crea, y de ahí en adelante
 * siempre se usa ESE id exacto (DriveApp.getFileById). Esto es más
 * robusto: Google Drive permite tener varias carpetas o archivos con el
 * MISMO nombre, y buscar por nombre puede terminar encontrando (o
 * creando) uno distinto al que realmente se viene usando — lo cual podía
 * hacer que un dataset pisara al otro sin ningún error visible. Con el ID
 * guardado, siempre se apunta exactamente al mismo archivo, sin ambigüedad.
 *
 * VERSIÓN 3 — CORRECCIÓN IMPORTANTE (descarga por partes): con la base ya
 * en más de 100.000 registros (~24 MB), la respuesta de "GET sin action"
 * quedaba por encima del límite práctico de tamaño de una respuesta de
 * Apps Script — el navegador recibía la descarga CORTADA a la mitad, en
 * un punto distinto cada vez, sin ningún error visible. Por eso el
 * dashboard podía mostrar un número de casos distinto en cada recarga,
 * aunque los datos guardados en Drive siempre estuvieran completos y
 * correctos. Ahora el dashboard pide el archivo en pedazos pequeños
 * (?action=chunk&offset=...&length=...) y los une él mismo — cada
 * respuesta individual queda muy por debajo del límite, sin importar
 * cuánto crezca la base en el futuro.
 *
 * INSTALACIÓN: ver el archivo GUIA_DESPLIEGUE.md en la raíz del proyecto.
 */

// 1) Cambia esta clave por una que solo conozcan las personas de confianza
//    que pueden actualizar el dashboard. No la compartas públicamente.
const TOKEN = 'Cieps2026**';

const FOLDER_NAME = 'Dashboard Delitos MEPOY';

// Un archivo y una clave de metadatos por cada dataset. "clavePropiedadId"
// es donde se guarda el ID REAL del archivo en Drive, una vez creado.
const DATASETS = {
  delictividad: { archivo: 'Base_de_Datos_General.csv', prefijoMeta: '', clavePropiedadId: 'idArchivo_delictividad' },
  operatividad: { archivo: 'Operatividad.csv', prefijoMeta: 'operatividad_', clavePropiedadId: 'idArchivo_operatividad' },
};

function obtenerDataset_(parametro) {
  const clave = (parametro || 'delictividad').toLowerCase();
  return DATASETS[clave] ? clave : 'delictividad';
}

function doGet(e) {
  const accion = e && e.parameter && e.parameter.action;
  const dataset = obtenerDataset_(e && e.parameter && e.parameter.dataset);
  const config = DATASETS[dataset];

  if (accion === 'meta') {
    const props = PropertiesService.getScriptProperties();
    return respuestaJson_({
      ok: true,
      ultimaActualizacion: props.getProperty(config.prefijoMeta + 'ultimaActualizacion') || null,
      ultimoUsuario: props.getProperty(config.prefijoMeta + 'ultimoUsuario') || null,
      totalCaracteres: props.getProperty(config.prefijoMeta + 'totalCaracteres') || null,
      // Dato de diagnóstico — para poder confirmar desde afuera (visitando
      // la URL con ?action=meta) que cada dataset SÍ tiene un ID de
      // archivo propio y distinto.
      idArchivo: props.getProperty(config.clavePropiedadId) || null,
    });
  }

  if (accion === 'chunk') {
    // Entrega el archivo POR PARTES — ver "VERSIÓN 3" en el comentario de
    // arriba. offset/length vienen en caracteres, no bytes; "length" es
    // el TAMAÑO MÁXIMO pedido, la respuesta puede ser más corta si ya se
    // llegó al final del archivo. "totalCaracteres" en la respuesta le
    // permite al dashboard saber cuándo ya juntó todo.
    const offset = Math.max(0, parseInt((e.parameter && e.parameter.offset) || '0', 10) || 0);
    const length = Math.max(1, parseInt((e.parameter && e.parameter.length) || '1500000', 10) || 1500000);
    const contenido = obtenerArchivo_(config).getBlob().getDataAsString('UTF-8');
    const trozo = contenido.substring(offset, offset + length);
    return respuestaJson_({
      ok: true,
      contenido: trozo,
      offset: offset,
      totalCaracteres: contenido.length,
      esUltimo: offset + trozo.length >= contenido.length,
    });
  }

  // Respuesta completa en un solo bloque — se conserva por compatibilidad
  // (ej. si alguien abre la URL directo en el navegador para revisarla),
  // pero el dashboard YA NO la usa para bases grandes: usa "?action=chunk".
  const archivo = obtenerArchivo_(config);
  const contenido = archivo.getBlob().getDataAsString('UTF-8');
  const salida = ContentService.createTextOutput(contenido);
  salida.setMimeType(ContentService.MimeType.CSV);
  return salida;
}

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);

    if (!datos.token || datos.token !== TOKEN) {
      return respuestaJson_({ ok: false, error: 'Token inválido. No tienes autorización para actualizar el dashboard.' });
    }
    if (!datos.csv || typeof datos.csv !== 'string' || datos.csv.trim().length === 0) {
      return respuestaJson_({ ok: false, error: 'No se recibió contenido CSV válido.' });
    }

    const dataset = obtenerDataset_(datos.dataset);
    const config = DATASETS[dataset];

    const archivo = obtenerArchivo_(config);

    // SEGURO CONTRA "CARRERAS" ENTRE DOS PERSONAS ACTUALIZANDO CASI AL
    // MISMO TIEMPO: antes, quien subiera de ÚLTIMO ganaba siempre, sin
    // ningún aviso — si dos personas actualizaban con poca diferencia de
    // tiempo, la segunda subida (aunque fuera una versión más VIEJA o
    // incompleta, ej. de un navegador que no había hecho la última
    // corrección) borraba silenciosamente el trabajo de la primera. Se
    // detectó justo así: una carga correcta (con más registros) fue
    // reemplazada momentos después por una con menos. Ahora, si el
    // archivo nuevo trae MENOS filas que el que ya está guardado, se
    // rechaza — a menos que se mande "forzar: true" explícitamente (para
    // el caso legítimo de una limpieza que sí reduce el total a propósito).
    const totalFilasActual = contarFilasCsv_(archivo.getBlob().getDataAsString('UTF-8'));
    const totalFilasNuevo = contarFilasCsv_(datos.csv);
    if (!datos.forzar && totalFilasActual > 0 && totalFilasNuevo < totalFilasActual) {
      return respuestaJson_({
        ok: false,
        error: 'La versión que intentas subir tiene ' + totalFilasNuevo + ' registros, menos que los ' + totalFilasActual + ' que ya están guardados en el servidor central — probablemente alguien más actualizó justo antes que tú. Vuelve a descargar los datos más recientes y fusiona tu información sobre eso antes de reintentar.',
        totalFilasActual: totalFilasActual,
        totalFilasNuevo: totalFilasNuevo,
        requiereConfirmacion: true,
      });
    }

    archivo.setContent(datos.csv);

    const props = PropertiesService.getScriptProperties();
    props.setProperty(config.prefijoMeta + 'ultimaActualizacion', new Date().toISOString());
    props.setProperty(config.prefijoMeta + 'ultimoUsuario', datos.usuario || 'No identificado');
    props.setProperty(config.prefijoMeta + 'totalCaracteres', String(datos.csv.length));

    return respuestaJson_({
      ok: true,
      mensaje: 'El dashboard central fue actualizado correctamente (dataset: ' + dataset + ').',
      fecha: new Date().toISOString(),
      idArchivo: archivo.getId(),
    });
  } catch (err) {
    return respuestaJson_({ ok: false, error: 'Error procesando la actualización: ' + String(err) });
  }
}

// Cuenta filas de datos en un CSV (sin contar el encabezado ni líneas
// vacías) — solo se usa como número aproximado para el seguro contra
// carreras de arriba, no necesita ser perfecto, solo consistente entre
// una llamada y otra.
function contarFilasCsv_(csv) {
  if (!csv) return 0;
  const lineas = csv.split('\n').filter(function (l) { return l.trim().length > 0; });
  return Math.max(0, lineas.length - 1);
}

// Devuelve SIEMPRE el mismo objeto de archivo para este dataset — primero
// intenta el ID ya guardado (rápido y sin ambigüedad); solo si nunca se ha
// creado, lo busca/crea por nombre UNA vez y guarda su ID para todas las
// veces siguientes.
function obtenerArchivo_(config) {
  const props = PropertiesService.getScriptProperties();
  const idGuardado = props.getProperty(config.clavePropiedadId);

  if (idGuardado) {
    try {
      return DriveApp.getFileById(idGuardado);
    } catch (err) {
      // El archivo con ese ID ya no existe (se borró a mano, por ejemplo)
      // — se recrea abajo y se guarda un ID nuevo.
    }
  }

  const carpetas = DriveApp.getFoldersByName(FOLDER_NAME);
  const carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(FOLDER_NAME);
  const archivosExistentes = carpeta.getFilesByName(config.archivo);
  const archivo = archivosExistentes.hasNext() ? archivosExistentes.next() : carpeta.createFile(config.archivo, '', MimeType.CSV);

  props.setProperty(config.clavePropiedadId, archivo.getId());
  return archivo;
}

function respuestaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
