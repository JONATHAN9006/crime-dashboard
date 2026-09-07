/**
 * BACKEND CENTRAL — Dashboard de Análisis Delictivo
 * ---------------------------------------------------
 * Este script guarda el archivo Base_de_Datos_General.csv "oficial" en una carpeta de
 * Google Drive y lo expone como una API sencilla para que el dashboard
 * (desplegado como sitio estático) pueda:
 *   - GET  → descargar siempre la última versión del CSV
 *   - GET ?action=meta → consultar cuándo fue la última actualización
 *   - POST → subir una nueva versión del CSV (protegido con un token)
 *
 * INSTALACIÓN: ver el archivo GUIA_DESPLIEGUE.md en la raíz del proyecto.
 */

// 1) Cambia esta clave por una que solo conozcan las personas de confianza
//    que pueden actualizar el dashboard. No la compartas públicamente.
const TOKEN = 'CAMBIA-ESTA-CLAVE-2026';

const FOLDER_NAME = 'Dashboard Delitos MEPOY';
const FILE_NAME = 'Base_de_Datos_General.csv';

function doGet(e) {
  const accion = e.parameter && e.parameter.action;

  if (accion === 'meta') {
    const props = PropertiesService.getScriptProperties();
    return respuestaJson_({
      ok: true,
      ultimaActualizacion: props.getProperty('ultimaActualizacion') || null,
      ultimoUsuario: props.getProperty('ultimoUsuario') || null,
      totalCaracteres: props.getProperty('totalCaracteres') || null,
    });
  }

  const archivo = obtenerArchivo_();
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

    const archivo = obtenerArchivo_();
    archivo.setContent(datos.csv);

    const props = PropertiesService.getScriptProperties();
    props.setProperty('ultimaActualizacion', new Date().toISOString());
    props.setProperty('ultimoUsuario', datos.usuario || 'No identificado');
    props.setProperty('totalCaracteres', String(datos.csv.length));

    return respuestaJson_({
      ok: true,
      mensaje: 'El dashboard central fue actualizado correctamente.',
      fecha: new Date().toISOString(),
    });
  } catch (err) {
    return respuestaJson_({ ok: false, error: 'Error procesando la actualización: ' + String(err) });
  }
}

function obtenerArchivo_() {
  const carpetas = DriveApp.getFoldersByName(FOLDER_NAME);
  const carpeta = carpetas.hasNext() ? carpetas.next() : DriveApp.createFolder(FOLDER_NAME);
  const archivos = carpeta.getFilesByName(FILE_NAME);
  if (archivos.hasNext()) return archivos.next();
  // Si no existe todavía, crea un archivo vacío; el primer "Actualizar información" lo llenará.
  return carpeta.createFile(FILE_NAME, '', MimeType.CSV);
}

function respuestaJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
