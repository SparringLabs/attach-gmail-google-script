/**
 * SPARRING Attach GMAIL
 * ===============================================================
 * 
 * Este script sincroniza automáticamente los adjuntos de correos electrónicos 
 * de Gmail a carpetas específicas en Google Drive, organizándolos por dominio del remitente.
 * 
 * @proyecto: SPARRING Attach GMAIL
 * @versión: 1.0.0
 * @autor: SPARRING.dev
 * @fecha: 2025-03-23
 * @licencia: MIT
 * @website: https://sparring.dev
 */

/*=====================================================================
 * CONFIGURACIÓN GLOBAL
 *=====================================================================*/

// Configuración del script con valores predeterminados
const CONFIG = {
  // Carpeta principal donde se guardarán todas las carpetas de dominio
  MAIN_FOLDER_NAME: "Adjuntos Mail",
  
  // Usar nombre de usuario de Gmail como nombre de carpeta principal
  USAR_NOMBRE_USUARIO: false,
  
  // Usar nombre de usuario para dominios genéricos (gmail, outlook, etc.)
  USAR_NOMBRE_PARA_DOMINIOS_GENERICOS: false,
  
  // Lista de dominios considerados genéricos (para organizar por nombre de usuario)
  DOMINIOS_GENERICOS: ["gmail.com", "outlook.com", "yahoo.com", "protonmail.com", "hotmail.com"],
  
  // Etiqueta que se aplicará a los correos procesados
  PROCESSED_LABEL_NAME: "AdjuntosSincronizados",
  
  // Número máximo de correos a procesar por ejecución (para evitar tiempos de ejecución largos)
  MAX_EMAILS_TO_PROCESS: 50,
  
  // Limite de días hacia atrás para buscar correos (0 = sin límite)
  DAYS_TO_LOOK_BACK: 0,
  
  // Dominios de correo específicos a incluir (vacío = todos los dominios)
  DOMINIOS_INCLUIDOS: [],
  
  // Dominios de correo específicos a excluir (mayor prioridad que DOMINIOS_INCLUIDOS)
  DOMINIOS_EXCLUIDOS: [],
  
  // Extensiones de archivo permitidas (vacío = todos los tipos de archivo)
  EXTENSIONES_PERMITIDAS: [],
  
  // Extensiones de archivo a excluir (mayor prioridad que EXTENSIONES_PERMITIDAS)
  EXTENSIONES_EXCLUIDAS: ["ics"],
  
  // Activar/desactivar notificaciones por correo
  ENVIAR_NOTIFICACIONES: true,
  
  // Nivel de detalle de las notificaciones ('basico', 'detallado')
  DETALLE_NOTIFICACIONES: 'basico',
  
  // Activar/desactivar organización por patrones en el asunto
  USAR_PATRONES_ASUNTO: false,
  
  // Lista de patrones a buscar en el asunto (ej: "ID000", "REF-", "CV")
  PATRONES_ASUNTO: []
};

/*=====================================================================
 * FUNCIONES DE GESTIÓN DE CONFIGURACIÓN
 *=====================================================================*/

/**
 * Carga la configuración guardada desde PropertiesService.
 * Se ejecuta automáticamente cuando se inicia el script.
 * @return {Object} La configuración cargada
 */
function cargarConfiguracion() {
  try {
    const propiedades = PropertiesService.getUserProperties();
    const configGuardada = propiedades.getProperty('CONFIG');
    
    if (configGuardada) {
      // Combinar la configuración guardada con los valores predeterminados
      const configCargada = JSON.parse(configGuardada);
      
      for (const key in configCargada) {
        if (CONFIG.hasOwnProperty(key)) {
          CONFIG[key] = configCargada[key];
        }
      }
      
      Logger.log('Configuración cargada correctamente desde almacenamiento.');
    } else {
      Logger.log('No se encontró configuración guardada. Usando valores predeterminados.');
    }
  } catch (error) {
    Logger.log(`Error al cargar la configuración: ${error.toString()}`);
  }
  
  return CONFIG;
}

/**
 * Guarda la configuración actual en PropertiesService para que persista entre ejecuciones.
 */
function guardarConfiguracion() {
  try {
    const propiedades = PropertiesService.getUserProperties();
    propiedades.setProperty('CONFIG', JSON.stringify(CONFIG));
    Logger.log('Configuración guardada correctamente.');
    return true;
  } catch (error) {
    Logger.log(`Error al guardar la configuración: ${error.toString()}`);
    return false;
  }
}

/*=====================================================================
 * FUNCIONES PRINCIPALES DE SINCRONIZACIÓN
 *=====================================================================*/

/**
 * Función principal que se ejecutará al iniciar el script manualmente o mediante un disparador.
 * Sincroniza adjuntos de Gmail a Google Drive según la configuración establecida.
 */
function syncAttachments() {
  try {
    // Cargar configuración guardada antes de iniciar
    cargarConfiguracion();
    
    Logger.log("Iniciando sincronización de adjuntos...");
    
    // Contar cuantos correos quedan pendientes por procesar
    const pendientes = contarCorreosPendientes();
    Logger.log(`Hay ${pendientes} correos pendientes por procesar en total.`);
    
    // Objeto para recopilar estadísticas de la sincronización
    const estadisticas = {
      iniciado: new Date(),
      correosProcesados: 0,
      adjuntosGuardados: 0,
      errores: 0,
      correosPendientes: pendientes,
      dominiosProcesados: {},
      extensionesProcesadas: {}
    };
    
    // Obtener o crear la carpeta principal donde se guardarán las carpetas de dominio
    const nombreCarpeta = obtenerNombreCarpetaPrincipal();
    const mainFolder = getOrCreateFolder(nombreCarpeta);
    
    // Obtener o crear la etiqueta para marcar correos ya procesados
    const processedLabel = getOrCreateLabel(CONFIG.PROCESSED_LABEL_NAME);
    
    // Obtener emails no procesados
    const emails = getUnprocessedEmails(processedLabel);
    
    Logger.log(`Se encontraron ${emails.length} correos sin procesar.`);
    
    // Procesar cada email
    let processedCount = 0;
    for (const email of emails) {
      if (processedCount >= CONFIG.MAX_EMAILS_TO_PROCESS) {
        Logger.log(`Se alcanzó el límite de ${CONFIG.MAX_EMAILS_TO_PROCESS} correos procesados.`);
        break;
      }
      
      const resultadoProceso = processEmail(email, mainFolder, processedLabel);
      processedCount++;
      
      // Actualizar estadísticas con el resultado del procesamiento
      estadisticas.correosProcesados++;
      estadisticas.adjuntosGuardados += resultadoProceso.adjuntosGuardados || 0;
      
      // Actualizar contadores por dominio
      if (resultadoProceso.dominio) {
        estadisticas.dominiosProcesados[resultadoProceso.dominio] = 
          (estadisticas.dominiosProcesados[resultadoProceso.dominio] || 0) + 1;
      }
      
      // Actualizar contadores por extensión
      if (resultadoProceso.extensiones && resultadoProceso.extensiones.length > 0) {
        for (const extension of resultadoProceso.extensiones) {
          estadisticas.extensionesProcesadas[extension] = 
            (estadisticas.extensionesProcesadas[extension] || 0) + 1;
        }
      }
    }
    
    // Registrar finalización y registrar estadísticas
    estadisticas.finalizado = new Date();
    estadisticas.tiempoTotal = (estadisticas.finalizado - estadisticas.iniciado) / 1000; // en segundos
    
    // Actualizar correos pendientes (restar los procesados)
    estadisticas.correosPendientes = Math.max(0, estadisticas.correosPendientes - estadisticas.correosProcesados);
    Logger.log(`Quedan ${estadisticas.correosPendientes} correos pendientes por procesar.`);
    
    Logger.log(`Sincronización completada. Se procesaron ${estadisticas.correosProcesados} correos con ${estadisticas.adjuntosGuardados} adjuntos guardados.`);
    
    // Enviar notificación por correo si está activado
    if (CONFIG.ENVIAR_NOTIFICACIONES) {
      enviarNotificacionSincronizacion(estadisticas);
    }
    
    return estadisticas;
  } catch (error) {
    Logger.log(`Error en la sincronización: ${error.toString()}`);
    
    // Enviar notificación de error si está activado
    if (CONFIG.ENVIAR_NOTIFICACIONES) {
      enviarNotificacionError(error);
    }
    
    throw error;
  }
}

/**
 * Obtiene correos electrónicos no procesados.
 * @param {GmailLabel} processedLabel - Etiqueta que marca correos ya procesados.
 * @return {GmailThread[]} - Array de hilos de correo no procesados.
 */
function getUnprocessedEmails(processedLabel) {
  // Construir la consulta para obtener correos con adjuntos y sin procesar
  let query = "has:attachment -label:" + processedLabel.getName();
  
  // Añadir restricción de fecha si está configurada
  if (CONFIG.DAYS_TO_LOOK_BACK > 0) {
    const date = new Date();
    date.setDate(date.getDate() - CONFIG.DAYS_TO_LOOK_BACK);
    const formattedDate = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy/MM/dd");
    query += " after:" + formattedDate;
  }
  
  // Buscar hilos que coincidan con la consulta
  const threads = GmailApp.search(query, 0, 500);
  const emails = [];
  
  // Extraer mensajes individuales de los hilos
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      if (message.getAttachments().length > 0) {
        emails.push(message);
      }
    }
    
    // Detener si alcanzamos el límite máximo de correos
    if (emails.length >= CONFIG.MAX_EMAILS_TO_PROCESS) {
      break;
    }
  }
  
  return emails;
}

/**
 * Extrae patrones del asunto de un correo electrónico.
 * @param {string} subject - El asunto del correo.
 * @return {string|null} - El patrón encontrado o null si no se encuentra ninguno.
 */
function extractSubjectPattern(subject) {
  if (!CONFIG.USAR_PATRONES_ASUNTO || !CONFIG.PATRONES_ASUNTO || CONFIG.PATRONES_ASUNTO.length === 0) {
    return null;
  }
  
  // Normalizar el asunto para facilitar la comparación (minúsculas, sin acentos)
  const normalizedSubject = normalizarTexto(subject).toLowerCase();
  
  // Buscar los patrones en el asunto normalizado
  for (const pattern of CONFIG.PATRONES_ASUNTO) {
    const normalizedPattern = normalizarTexto(pattern).toLowerCase();
    if (normalizedSubject.includes(normalizedPattern)) {
      // Extraer el patrón original del asunto original para preservar mayúsculas/minúsculas
      const patternIndex = normalizedSubject.indexOf(normalizedPattern);
      const originalPatternEnd = patternIndex + normalizedPattern.length;
      
      // Intentar extraer un ID completo si el patrón es seguido por números o letras
      // Por ejemplo, si el patrón es "ID" y el asunto es "ID001A - CV", extraerá "ID001A"
      let fullPatternMatch = subject.substring(patternIndex);
      const idMatch = fullPatternMatch.match(/^([A-Za-z0-9\-_]+)/); // Capturar alfanumericos y guiones
      
      if (idMatch && idMatch[1]) {
        return idMatch[1]; // Devuelve el ID completo
      }
      
      // Si no hay un ID completo, devolver el patrón original
      return pattern;
    }
  }
  
  return null;
}

/**
 * Procesa un correo electrónico, extrayendo sus adjuntos y guardándolos en la carpeta correspondiente.
 * @param {GmailMessage} email - El mensaje de correo a procesar.
 * @param {DriveFolder} mainFolder - La carpeta principal donde se crearán las subcarpetas de dominio.
 * @param {GmailLabel} processedLabel - Etiqueta para marcar el correo como procesado.
 */
function processEmail(email, mainFolder, processedLabel) {
  try {
    // Resultado del procesamiento para devolver estadísticas
    const resultado = {
      adjuntosGuardados: 0,
      dominio: null,
      extensiones: []
    };
    
    // Obtener información del remitente
    const from = email.getFrom();
    const domainInfo = extractDomain(from);
    
    if (!domainInfo.domain) {
      Logger.log(`No se pudo extraer el dominio de: ${from}`);
      return resultado;
    }
    
    const domain = domainInfo.domain;
    const username = domainInfo.username;
    resultado.dominio = domain;
    
    // Verificar si este dominio debe ser procesado o ignorado
    if (!isDomainAllowed(domain)) {
      Logger.log(`Dominio ignorado según configuración: ${domain}`);
      email.getThread().addLabel(processedLabel);
      return resultado;
    }
    
    // Determinar la carpeta base donde guardar los adjuntos (dominio o patrón de asunto)
    let baseFolder;
    const subject = email.getSubject();
    const subjectPattern = extractSubjectPattern(subject);
    
    if (CONFIG.USAR_PATRONES_ASUNTO && subjectPattern) {
      // Si hay un patrón en el asunto, lo usamos como carpeta base
      baseFolder = getOrCreateFolder(subjectPattern, mainFolder);
      Logger.log(`Usando patrón de asunto para carpeta: ${subjectPattern}`);
    } else {
      // Si no hay patrón, usamos el dominio (o usuario@dominio)
      let folderName = domain;
      if (CONFIG.USAR_NOMBRE_PARA_DOMINIOS_GENERICOS && 
          CONFIG.DOMINIOS_GENERICOS.includes(domain) && 
          username) {
        folderName = `${username}@${domain}`;
        Logger.log(`Usando nombre de usuario para dominio genérico: ${folderName}`);
      }
      baseFolder = getOrCreateFolder(folderName, mainFolder);
    }
    
    // Obtener adjuntos
    const attachments = email.getAttachments();
    if (attachments.length === 0) {
      return resultado;
    }
    
    // Crear subcarpeta con fecha y asunto para organizar mejor
    const date = Utilities.formatDate(email.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    // Acortar el asunto para el nombre de carpeta (primeros 30 caracteres)
    const shortSubject = subject.substring(0, 30);
    // No hace falta reemplazar caracteres aquí porque getOrCreateFolder ya normaliza
    const emailFolderName = `${date} - ${shortSubject}`;
    const emailFolder = getOrCreateFolder(emailFolderName, baseFolder);
    
    // Guardar cada adjunto
    for (const attachment of attachments) {
      let fileName = attachment.getName();
      
      // Verificar si el tipo de archivo está permitido
      if (!isFileTypeAllowed(fileName)) {
        Logger.log(`Tipo de archivo no permitido según configuración: ${fileName}`);
        continue;
      }
      
      // Normalizar el nombre del archivo para evitar problemas con caracteres especiales
      const fileNameOriginal = fileName;
      fileName = normalizarTexto(fileName);
      if (fileNameOriginal !== fileName) {
        Logger.log(`Nombre de archivo normalizado: "${fileNameOriginal}" -> "${fileName}"`);
      }
      
      const blob = attachment.copyBlob();
      const extension = getFileExtension(fileName).toLowerCase();
      
      // Verificar si el archivo ya existe para evitar duplicados
      if (!fileExists(emailFolder, fileName)) {
        emailFolder.createFile(blob);
        resultado.adjuntosGuardados++;
        
        // Registrar extensión para estadísticas
        if (extension && !resultado.extensiones.includes(extension)) {
          resultado.extensiones.push(extension);
        }
      }
    }
    
    // Marcar el correo como procesado añadiendo la etiqueta
    email.getThread().addLabel(processedLabel);
    
    Logger.log(`Procesado correo de ${from}: ${resultado.adjuntosGuardados} adjuntos guardados en ${emailFolderName}`);
    
    return resultado;
  } catch (error) {
    Logger.log(`Error procesando correo: ${error.toString()}`);
    return { adjuntosGuardados: 0, error: error.toString() };
  }
}

/*=====================================================================
 * FUNCIONES DE UTILIDAD PARA PROCESAMIENTO
 *=====================================================================*/

/**
 * Extrae el dominio y nombre de usuario de una dirección de correo electrónico.
 * @param {string} emailString - Cadena que contiene una dirección de correo.
 * @return {Object} - Objeto con el dominio y nombre de usuario extraídos.
 */
function extractDomain(emailString) {
  // Extraer dirección de correo de formato "Nombre <correo@dominio.com>"
  const fullEmailMatch = emailString.match(/<([^>]+)>/);
  
  let fullEmail;
  if (fullEmailMatch && fullEmailMatch.length > 1) {
    // Si está en formato "Nombre <correo@dominio.com>"
    fullEmail = fullEmailMatch[1];
  } else {
    // Si está en formato simple "correo@dominio.com"
    fullEmail = emailString.trim();
  }
  
  // Extraer el dominio y nombre de usuario (usuario@dominio.com)
  const parts = fullEmail.split('@');
  if (parts.length === 2) {
    return {
      domain: parts[1].toLowerCase(),
      username: parts[0].toLowerCase()
    };
  }
  
  return {
    domain: null,
    username: null
  };
}

/**
 * Obtiene o crea una carpeta en Google Drive.
 * @param {string} folderName - Nombre de la carpeta.
 * @param {DriveFolder} [parentFolder] - Carpeta padre (opcional).
 * @return {DriveFolder} - La carpeta obtenida o creada.
 */
/**
 * Normaliza un texto eliminando acentos, eñes y otros caracteres especiales.
 * @param {string} text - Texto a normalizar.
 * @return {string} - Texto normalizado.
 */
function normalizarTexto(text) {
  if (!text) return '';
  
  // Reemplazar caracteres especiales típicos del español
  const caracteres = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'ñ': 'n', 'Ñ': 'N',
    'ü': 'u', 'Ü': 'U',
    'ç': 'c', 'Ç': 'C'
  };
  
  // Reemplazar caracteres especiales por sus equivalentes sin acentos
  let textoNormalizado = text;
  for (const [especial, normal] of Object.entries(caracteres)) {
    textoNormalizado = textoNormalizado.replace(new RegExp(especial, 'g'), normal);
  }
  
  // Remover otros caracteres no seguros para nombres de archivos
  textoNormalizado = textoNormalizado.replace(/[\/*?"<>|]/g, '_');
  
  return textoNormalizado;
}

function getOrCreateFolder(folderName, parentFolder = null) {
  let folder;
  const parent = parentFolder || DriveApp.getRootFolder();
  
  // Normalizar el nombre de la carpeta para compatibilidad
  const nombreNormalizado = normalizarTexto(folderName);
  Logger.log(`Normalizando nombre de carpeta: "${folderName}" -> "${nombreNormalizado}"`); 
  
  // Buscar si la carpeta ya existe (por nombre original o normalizado)
  let folderIterator = parent.getFoldersByName(folderName);
  if (folderIterator.hasNext()) {
    folder = folderIterator.next();
  } else {
    // Intentar buscar por nombre normalizado (por si ya se creó así anteriormente)
    folderIterator = parent.getFoldersByName(nombreNormalizado);
    if (folderIterator.hasNext()) {
      folder = folderIterator.next();
    } else {
      // Crear la carpeta con nombre normalizado si no existe
      folder = parent.createFolder(nombreNormalizado);
    }
  }
  
  return folder;
}

/**
 * Obtiene o crea una etiqueta en Gmail.
 * @param {string} labelName - Nombre de la etiqueta.
 * @return {GmailLabel} - La etiqueta obtenida o creada.
 */
function getOrCreateLabel(labelName) {
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
  }
  return label;
}

/**
 * Verifica si un archivo ya existe en una carpeta.
 * @param {DriveFolder} folder - La carpeta donde buscar.
 * @param {string} fileName - Nombre del archivo a buscar.
 * @return {boolean} - true si el archivo existe, false en caso contrario.
 */
function fileExists(folder, fileName) {
  // Comprobar si existe con el nombre original
  let fileIterator = folder.getFilesByName(fileName);
  if (fileIterator.hasNext()) {
    return true;
  }
  
  // Si el nombre tiene caracteres especiales, comprobar también con el nombre normalizado
  const normalizedName = normalizarTexto(fileName);
  if (normalizedName !== fileName) {
    fileIterator = folder.getFilesByName(normalizedName);
    return fileIterator.hasNext();
  }
  
  return false;
}

/*=====================================================================
 * FUNCIONES DE AUTOMATIZACIÓN Y PLANIFICACIÓN
 *=====================================================================*/

/**
 * Obtiene el nombre de usuario de Gmail actual para usarlo como nombre de carpeta.
 * @return {string} Nombre de usuario o dirección de correo electrónico.
 */
function obtenerNombreUsuario() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email.split('@')[0]; // Tomar solo el nombre de usuario sin el dominio
  } catch (error) {
    Logger.log(`Error al obtener nombre de usuario: ${error.toString()}`);
    return 'Usuario';
  }
}

/**
 * Obtiene el nombre de la carpeta principal según la configuración.
 * @return {string} Nombre de la carpeta principal.
 */
function obtenerNombreCarpetaPrincipal() {
  try {
    if (CONFIG.USAR_NOMBRE_USUARIO) {
      return normalizarTexto(obtenerNombreUsuario());
    } else {
      return CONFIG.MAIN_FOLDER_NAME;
    }
  } catch (error) {
    Logger.log(`Error al determinar nombre de carpeta: ${error.toString()}`);
    return CONFIG.MAIN_FOLDER_NAME;
  }
}

/**
 * Configura un disparador para ejecutar la sincronización automáticamente cada hora.
 * Se debe ejecutar manualmente una vez para configurar el disparador.
 */
function configureTrigger() {
  // Eliminar cualquier disparador existente para evitar duplicados
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'syncAttachments') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Crear un nuevo disparador para ejecutar cada hora
  ScriptApp.newTrigger('syncAttachments')
    .timeBased()
    .everyHours(1)
    .create();
  
  Logger.log('Disparador configurado para ejecutar la sincronización cada hora.');
}

/**
 * Obtiene el total de correos pendientes por procesar y muestra un mensaje.
 * @return {string} Mensaje con la información de correos pendientes.
 */
function obtenerEstadoPendientes() {
  try {
    const pendientes = contarCorreosPendientes();
    const mensaje = `Hay ${pendientes} correos pendientes por procesar.\n` +
                   `Con el límite actual de ${CONFIG.MAX_EMAILS_TO_PROCESS} correos por ejecución, ` +
                   `necesitarás aproximadamente ${Math.ceil(pendientes / CONFIG.MAX_EMAILS_TO_PROCESS)} ejecuciones para completar.`;
    return mensaje;
  } catch (error) {
    return "Error al contar correos pendientes: " + error.message;
  }
}

/**
 * Función de prueba que ejecuta una sincronización con un límite reducido.
 * Útil para verificar el funcionamiento del script sin procesar demasiados correos.
 */
function testSync() {
  // Primero mostrar estado de correos pendientes
  const mensajePendientes = obtenerEstadoPendientes();
  Logger.log(mensajePendientes);
  
  // Guardar configuración original
  const originalMax = CONFIG.MAX_EMAILS_TO_PROCESS;
  
  try {
    // Establecer un límite más bajo para la prueba
    CONFIG.MAX_EMAILS_TO_PROCESS = 5;
    Logger.log(`Ejecutando prueba con límite de ${CONFIG.MAX_EMAILS_TO_PROCESS} correos...`);
    
    // Ejecutar sincronización
    syncAttachments();
    
    // Restaurar configuración original
    CONFIG.MAX_EMAILS_TO_PROCESS = originalMax;
    
    return "Prueba de sincronización completada exitosamente.\n\n" + mensajePendientes;
  } catch (error) {
    // Restaurar configuración original en caso de error
    CONFIG.MAX_EMAILS_TO_PROCESS = originalMax;
    
    // Relanzar el error
    throw error;
  }
}

/**
 * Permite al usuario cambiar la configuración de la sincronización y la guarda automáticamente.
 * @param {Object} newConfig - Objeto con los nuevos valores de configuración.
 * 
 * Ejemplo de uso:
 * cambiarConfiguracion({
 *   MAIN_FOLDER_NAME: "Mi Carpeta de Adjuntos",
 *   MAX_EMAILS_TO_PROCESS: 100
 * });
 */
function cambiarConfiguracion(newConfig) {
  // Validar que newConfig sea un objeto
  if (!newConfig || typeof newConfig !== 'object') {
    throw new Error('Se esperaba un objeto de configuración');
  }
  
  // Actualizar propiedades de configuración
  for (const key in newConfig) {
    if (CONFIG.hasOwnProperty(key)) {
      CONFIG[key] = newConfig[key];
      Logger.log(`Configuración actualizada: ${key} = ${newConfig[key]}`);
    } else {
      Logger.log(`Propiedad desconocida ignorada: ${key}`);
    }
  }
  
  // Guardar cambios automáticamente para persistir entre ejecuciones
  guardarConfiguracion();
  
  Logger.log('Configuración actualizada y guardada correctamente.');
  return CONFIG;
}

/*=====================================================================
 * FUNCIONES DE INTERFAZ DE USUARIO
 *=====================================================================*/

/**
 * Función que se ejecuta cuando se abre la aplicación web.
 * Muestra la interfaz gráfica para configurar el script.
 * @return {HtmlOutput} La página web con la interfaz de usuario.
 */
function doGet() {
  // Cargar la configuración antes de mostrar la interfaz
  cargarConfiguracion();
  
  return HtmlService.createHtmlOutputFromFile('ConfiguracionUI')
    .setTitle('SPARRING Attach GMAIL - Configuración')
    .setWidth(850)
    .setHeight(600);
}

/*=====================================================================
 * FUNCIONES DE FILTRADO Y VALIDACIÓN
 *=====================================================================*/

/**
 * Verifica si un dominio debe ser procesado según la configuración de filtrado.
 * @param {string} domain - El dominio a verificar.
 * @return {boolean} - true si el dominio debe ser procesado, false si debe ser ignorado.
 */
function isDomainAllowed(domain) {
  // Si el dominio está en la lista de excluidos, siempre se ignora
  if (CONFIG.DOMINIOS_EXCLUIDOS && CONFIG.DOMINIOS_EXCLUIDOS.length > 0) {
    for (const excludedDomain of CONFIG.DOMINIOS_EXCLUIDOS) {
      // Comprobar coincidencia exacta o comodines (ejemplo: *.example.com)
      if (isWildcardMatch(domain, excludedDomain)) {
        return false;
      }
    }
  }
  
  // Si la lista de incluidos está vacía, se aceptan todos los dominios no excluidos
  if (!CONFIG.DOMINIOS_INCLUIDOS || CONFIG.DOMINIOS_INCLUIDOS.length === 0) {
    return true;
  }
  
  // Si hay una lista de incluidos, verificar si el dominio está en ella
  for (const includedDomain of CONFIG.DOMINIOS_INCLUIDOS) {
    if (isWildcardMatch(domain, includedDomain)) {
      return true;
    }
  }
  
  // Si hay una lista de incluidos pero el dominio no está en ella, se ignora
  return false;
}

/**
 * Comprueba si un dominio coincide con un patrón que puede contener comodines.
 * @param {string} domain - El dominio a comprobar.
 * @param {string} pattern - El patrón que puede contener comodines (ej: *.example.com).
 * @return {boolean} - true si hay coincidencia, false si no.
 */
function isWildcardMatch(domain, pattern) {
  // Caso 1: Coincidencia exacta
  if (domain === pattern) {
    return true;
  }
  
  // Caso 2: Patrón con comodín al inicio (*.example.com)
  if (pattern.startsWith('*.')) {
    const patternSuffix = pattern.substring(1); // obtiene .example.com
    return domain.endsWith(patternSuffix);
  }
  
  // No hay coincidencia
  return false;
}

/**
 * Verifica si un tipo de archivo debe ser procesado según la configuración de filtrado.
 * @param {string} fileName - Nombre del archivo a verificar.
 * @return {boolean} - true si el archivo debe ser procesado, false si debe ser ignorado.
 */
function isFileTypeAllowed(fileName) {
  // Obtener la extensión del archivo (sin el punto)
  const extension = getFileExtension(fileName).toLowerCase();
  
  // Si no se pudo extraer la extensión, permitir el archivo
  if (!extension) {
    return true;
  }
  
  // Si la extensión está en la lista de excluidas, ignorar el archivo
  if (CONFIG.EXTENSIONES_EXCLUIDAS && CONFIG.EXTENSIONES_EXCLUIDAS.length > 0) {
    for (const excludedExt of CONFIG.EXTENSIONES_EXCLUIDAS) {
      // Normalizar extensión (quitar punto si existe y convertir a minúsculas)
      const normalizedExcludedExt = excludedExt.startsWith('.') ? 
        excludedExt.substring(1).toLowerCase() : excludedExt.toLowerCase();
      
      if (extension === normalizedExcludedExt) {
        return false;
      }
    }
  }
  
  // Si la lista de extensiones permitidas está vacía, aceptar todas las extensiones no excluidas
  if (!CONFIG.EXTENSIONES_PERMITIDAS || CONFIG.EXTENSIONES_PERMITIDAS.length === 0) {
    return true;
  }
  
  // Si hay una lista de extensiones permitidas, verificar si la extensión está en ella
  for (const allowedExt of CONFIG.EXTENSIONES_PERMITIDAS) {
    // Normalizar extensión (quitar punto si existe y convertir a minúsculas)
    const normalizedAllowedExt = allowedExt.startsWith('.') ? 
      allowedExt.substring(1).toLowerCase() : allowedExt.toLowerCase();
    
    if (extension === normalizedAllowedExt) {
      return true;
    }
  }
  
  // Si hay una lista de extensiones permitidas pero la extensión no está en ella, ignorar el archivo
  return false;
}

/**
 * Extrae la extensión de un nombre de archivo.
 * @param {string} fileName - Nombre del archivo.
 * @return {string} - La extensión del archivo sin el punto, o cadena vacía si no tiene extensión.
 */
function getFileExtension(fileName) {
  if (!fileName) {
    return '';
  }
  
  const parts = fileName.split('.');
  if (parts.length <= 1) {
    return ''; // No hay extensión
  }
  
  return parts[parts.length - 1];
}

/*=====================================================================
 * FUNCIONES DE GESTIÓN DE CARPETAS Y ETIQUETAS (DANGER ZONE)
 *=====================================================================*/

/**
 * Elimina la carpeta principal de adjuntos y todos sus contenidos.
 * @return {Object} Resultado de la operación con mensaje y éxito.
 */
function eliminarCarpetaPrincipal() {
  try {
    cargarConfiguracion();
    const nombreCarpeta = obtenerNombreCarpetaPrincipal();
    
    // Buscar la carpeta principal
    const folders = DriveApp.getFoldersByName(nombreCarpeta);
    if (!folders.hasNext()) {
      return { exito: false, mensaje: `No se encontró la carpeta "${nombreCarpeta}"` };
    }
    
    // Confirmar eliminación moviendo a la papelera
    const folder = folders.next();
    folder.setTrashed(true);
    
    return { 
      exito: true, 
      mensaje: `Se ha eliminado la carpeta "${nombreCarpeta}" y todo su contenido. Puede recuperarla de la papelera si fue un error.` 
    };
  } catch (error) {
    Logger.log(`Error al eliminar carpeta principal: ${error.toString()}`);
    return { exito: false, mensaje: `Error: ${error.toString()}` };
  }
}

/**
 * Elimina una carpeta de dominio específica y todos sus contenidos.
 * @param {string} dominio - El dominio cuya carpeta se va a eliminar.
 * @return {Object} Resultado de la operación con mensaje y éxito.
 */
function eliminarCarpetaDominio(dominio) {
  try {
    if (!dominio) {
      return { exito: false, mensaje: "Debe especificar un dominio válido" };
    }
    
    cargarConfiguracion();
    const nombreCarpeta = obtenerNombreCarpetaPrincipal();
    
    // Buscar la carpeta principal
    const mainFolders = DriveApp.getFoldersByName(nombreCarpeta);
    if (!mainFolders.hasNext()) {
      return { exito: false, mensaje: `No se encontró la carpeta principal "${nombreCarpeta}"` };
    }
    
    const mainFolder = mainFolders.next();
    
    // Buscar la carpeta del dominio (tanto nombre original como normalizado)
    let dominioFolder = null;
    let domainFolders = mainFolder.getFoldersByName(dominio);
    
    if (domainFolders.hasNext()) {
      dominioFolder = domainFolders.next();
    } else {
      // Intentar con nombre normalizado
      const dominioNormalizado = normalizarTexto(dominio);
      domainFolders = mainFolder.getFoldersByName(dominioNormalizado);
      if (domainFolders.hasNext()) {
        dominioFolder = domainFolders.next();
      }
      
      // Buscar también por patrón usuario@dominio si es un dominio genérico
      if (!dominioFolder && CONFIG.DOMINIOS_GENERICOS.includes(dominio)) {
        // Buscar todas las carpetas dentro de la carpeta principal
        const allFolders = mainFolder.getFolders();
        while (allFolders.hasNext()) {
          const folder = allFolders.next();
          const folderName = folder.getName();
          // Verificar si termina con @dominio
          if (folderName.endsWith(`@${dominio}`)) {
            dominioFolder = folder;
            break;
          }
        }
      }
    }
    
    if (!dominioFolder) {
      return { exito: false, mensaje: `No se encontró ninguna carpeta para el dominio "${dominio}"` };
    }
    
    // Confirmar eliminación moviendo a la papelera
    dominioFolder.setTrashed(true);
    
    return { 
      exito: true, 
      mensaje: `Se ha eliminado la carpeta del dominio "${dominio}" y todo su contenido. Puede recuperarla de la papelera si fue un error.` 
    };
  } catch (error) {
    Logger.log(`Error al eliminar carpeta de dominio: ${error.toString()}`);
    return { exito: false, mensaje: `Error: ${error.toString()}` };
  }
}

/*=====================================================================
 * FUNCIONES DE NOTIFICACIÓN
 *=====================================================================*/

/**
 * Cuenta cuántos correos quedan pendientes por procesar (sin la etiqueta de procesados).
 * @return {number} - Número de correos pendientes por procesar.
 */
function contarCorreosPendientes() {
  try {
    // Obtener la etiqueta que marca los correos como procesados
    const processedLabel = getOrCreateLabel(CONFIG.PROCESSED_LABEL_NAME);
    
    // Construir la consulta que excluye los correos con la etiqueta de procesados
    let query = '-label:' + CONFIG.PROCESSED_LABEL_NAME;
    
    // Añadir filtro de fecha si está configurado
    if (CONFIG.DAYS_TO_LOOK_BACK > 0) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - CONFIG.DAYS_TO_LOOK_BACK);
      const formattedDate = Utilities.formatDate(pastDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
      query += ' after:' + formattedDate;
    }
    
    // Contar todos los mensajes que coinciden con la consulta
    return GmailApp.search(query).reduce((count, thread) => count + thread.getMessageCount(), 0);
  } catch (error) {
    Logger.log('Error al contar correos pendientes: ' + error.message);
    return -1; // Valor de error
  }
}

/**
 * Envía un correo electrónico con el resumen de la sincronización.
 * @param {Object} estadisticas - Objeto con estadísticas de la sincronización.
 */
function enviarNotificacionSincronizacion(estadisticas) {
  try {
    const email = Session.getActiveUser().getEmail();
    const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    const asunto = `Resumen de sincronización de adjuntos - ${fecha}`;
    
    // Crear el contenido del correo según el nivel de detalle configurado
    let contenido = `Sincronización completada el ${fecha}\n\n`;
    contenido += `Resumen:\n`;
    contenido += `- Correos procesados: ${estadisticas.correosProcesados}\n`;
    contenido += `- Adjuntos guardados: ${estadisticas.adjuntosGuardados}\n`;
    
    // Añadir información sobre correos pendientes
    if (estadisticas.correosPendientes !== undefined) {
      contenido += `- Correos pendientes: ${estadisticas.correosPendientes}\n`;
      if (estadisticas.correosPendientes > 0) {
        const ejecucionesPendientes = Math.ceil(estadisticas.correosPendientes / CONFIG.MAX_EMAILS_TO_PROCESS);
        contenido += `  (Requiere aprox. ${ejecucionesPendientes} ejecuciones más)\n`;
      }
    }
    contenido += `- Tiempo total: ${Math.round(estadisticas.tiempoTotal)} segundos\n\n`;
    
    // Si el nivel de detalle es "detallado", añadir información adicional
    if (CONFIG.DETALLE_NOTIFICACIONES === 'detallado') {
      // Añadir información de dominios procesados
      if (Object.keys(estadisticas.dominiosProcesados).length > 0) {
        contenido += `Dominios procesados:\n`;
        for (const dominio in estadisticas.dominiosProcesados) {
          contenido += `- ${dominio}: ${estadisticas.dominiosProcesados[dominio]} correos\n`;
        }
        contenido += `\n`;
      }
      
      // Añadir información de extensiones procesadas
      if (Object.keys(estadisticas.extensionesProcesadas).length > 0) {
        contenido += `Tipos de archivo guardados:\n`;
        for (const extension in estadisticas.extensionesProcesadas) {
          contenido += `- .${extension}: ${estadisticas.extensionesProcesadas[extension]} archivos\n`;
        }
      }
    }
    
    // Añadir enlace a la carpeta principal
    try {
      const mainFolder = DriveApp.getFoldersByName(CONFIG.MAIN_FOLDER_NAME).next();
      const folderUrl = mainFolder.getUrl();
      contenido += `\nAcceder a la carpeta de adjuntos: ${folderUrl}\n`;
    } catch (e) {
      // Si no se puede obtener la URL de la carpeta, omitir esta parte
    }
    
    // Enviar correo
    GmailApp.sendEmail(email, asunto, contenido);
    Logger.log(`Notificación de sincronización enviada a ${email}`);
  } catch (error) {
    Logger.log(`Error al enviar notificación: ${error.toString()}`);
  }
}

/**
 * Envía un correo electrónico con información sobre un error ocurrido.
 * @param {Error} error - El error que ocurrió.
 */
function enviarNotificacionError(error) {
  try {
    const email = Session.getActiveUser().getEmail();
    const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    const asunto = `Error en sincronización de adjuntos - ${fecha}`;
    
    let contenido = `Ha ocurrido un error durante la sincronización de adjuntos el ${fecha}:\n\n`;
    contenido += `${error.toString()}\n\n`;
    contenido += `Por favor, revise la configuración del script y los registros para más detalles.`;
    
    GmailApp.sendEmail(email, asunto, contenido);
    Logger.log(`Notificación de error enviada a ${email}`);
  } catch (e) {
    Logger.log(`Error al enviar notificación de error: ${e.toString()}`);
  }
}

/**
 * Restablece la configuración a sus valores predeterminados.
 */
function restablecerConfiguracion() {
  // Valores predeterminados
  const defaultConfig = {
    MAIN_FOLDER_NAME: "Adjuntos Mail",
    PROCESSED_LABEL_NAME: "AdjuntosSincronizados",
    MAX_EMAILS_TO_PROCESS: 50,
    DAYS_TO_LOOK_BACK: 0,
    DOMINIOS_INCLUIDOS: [],
    DOMINIOS_EXCLUIDOS: [],
    EXTENSIONES_PERMITIDAS: [],
    EXTENSIONES_EXCLUIDAS: [],
    ENVIAR_NOTIFICACIONES: true,
    DETALLE_NOTIFICACIONES: 'basico'
  };
  
  // Aplicar valores predeterminados
  for (const key in defaultConfig) {
    CONFIG[key] = defaultConfig[key];
  }
  
  // Guardar cambios
  guardarConfiguracion();
  
  Logger.log('Configuración restablecida a valores predeterminados.');
  return CONFIG;
}

/**
 * Elimina la etiqueta de correos procesados para permitir reprocesarlos.
 * @return {Object} Resultado de la operación con mensaje y éxito.
 */
function resetearEtiquetasProcesados() {
  try {
    cargarConfiguracion();
    
    // Buscar la etiqueta
    const etiquetas = GmailApp.getUserLabels();
    let etiquetaProcesados = null;
    
    for (const etiqueta of etiquetas) {
      if (etiqueta.getName() === CONFIG.PROCESSED_LABEL_NAME) {
        etiquetaProcesados = etiqueta;
        break;
      }
    }
    
    if (!etiquetaProcesados) {
      return { exito: false, mensaje: `No se encontró la etiqueta "${CONFIG.PROCESSED_LABEL_NAME}"` };
    }
    
    // Contar cuántos correos tienen la etiqueta
    const busqueda = `label:${CONFIG.PROCESSED_LABEL_NAME}`;
    const hilos = GmailApp.search(busqueda, 0, 500); // Limitamos a 500 por rendimiento
    const totalHilos = hilos.length;
    let totalCorreos = 0;
    
    for (const hilo of hilos) {
      const mensajes = hilo.getMessages();
      totalCorreos += mensajes.length;
      // Quitar la etiqueta al hilo
      hilo.removeLabel(etiquetaProcesados);
    }
    
    // Enviar notificación por correo
    enviarNotificacionReseteo(totalHilos, totalCorreos);
    
    return { 
      exito: true, 
      mensaje: `Se han reseteado ${totalHilos} hilos de correo (${totalCorreos} mensajes). Estos correos serán procesados nuevamente en la próxima ejecución.` 
    };
  } catch (error) {
    Logger.log(`Error al resetear etiquetas: ${error.toString()}`);
    return { exito: false, mensaje: `Error: ${error.toString()}` };
  }
}

/**
 * Envía un correo electrónico informando que se han reseteado las etiquetas para un nuevo procesamiento.
 * @param {number} totalHilos - Número de hilos de correo reseteados.
 * @param {number} totalCorreos - Número total de mensajes reseteados.
 */
function enviarNotificacionReseteo(totalHilos, totalCorreos) {
  try {
    const email = Session.getActiveUser().getEmail();
    const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    const asunto = `Correos listos para reprocesamiento - ${fecha}`;
    
    let contenido = `Se han preparado correos para un nuevo procesamiento de adjuntos el ${fecha}:\n\n`;
    contenido += `• ${totalHilos} hilos de correo han sido reseteados\n`;
    contenido += `• ${totalCorreos} mensajes serán procesados en la próxima ejecución\n\n`;
    contenido += `Los adjuntos de estos correos serán sincronizados automáticamente cuando `;
    contenido += `se ejecute nuevamente el script de sincronización.\n\n`;
    contenido += `Si desea iniciar el proceso inmediatamente, puede ejecutar manualmente la función "sincronizarAdjuntos".`;
    
    // Enviar correo
    GmailApp.sendEmail(email, asunto, contenido);
    Logger.log(`Notificación de reseteo enviada a ${email}`);
  } catch (error) {
    Logger.log(`Error al enviar notificación de reseteo: ${error.toString()}`);
  }
}
