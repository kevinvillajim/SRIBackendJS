const fs = require('fs');
const path = require('path');
const { getP12FromLocalFile } = require('open-factura');

// Validar archivo de certificado .p12
const validateCertificateFile = async (filePath, password) => {
  console.log('🔧 DEBUG: Iniciando validación de certificado');
  console.log('🔧 DEBUG: Archivo:', filePath);
  console.log('🔧 DEBUG: Password proporcionado:', password ? 'SÍ' : 'NO');
  
  const validation = {
    isValid: false,
    errors: [],
    warnings: [],
    info: {}
  };

  try {
    // Verificar que el archivo existe
    console.log('🔧 DEBUG: Verificando existencia del archivo...');
    if (!fs.existsSync(filePath)) {
      validation.errors.push('El archivo de certificado no existe');
      return validation;
    }
    console.log('🔧 DEBUG: Archivo existe');

    // Verificar tamaño del archivo
    console.log('🔧 DEBUG: Verificando tamaño del archivo...');
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      validation.errors.push('El archivo está vacío');
      return validation;
    }

    if (stats.size > 5 * 1024 * 1024) { // 5MB
      validation.errors.push('El archivo es muy grande (máximo 5MB)');
      return validation;
    }

    validation.info.fileSize = stats.size;
    validation.info.fileName = path.basename(filePath);
    console.log('🔧 DEBUG: Archivo válido, tamaño:', stats.size, 'bytes');

    // Intentar cargar el certificado usando open-factura
    try {
      console.log('🔧 DEBUG: Intentando cargar certificado con open-factura...');
      const p12Buffer = getP12FromLocalFile(filePath);
      console.log('🔧 DEBUG: P12 cargado, tipo:', typeof p12Buffer, 'longitud:', p12Buffer?.byteLength);
      
      if (!p12Buffer) {
        validation.errors.push('No se pudo leer el archivo como certificado .p12');
        return validation;
      }

      validation.info.p12Loaded = true;
      
      // Validación básica de estructura
      if (p12Buffer.byteLength < 100) {
        validation.warnings.push('El archivo parece muy pequeño para un certificado válido');
      }

      // TODO: Aquí se podría agregar validación más profunda del certificado
      // usando node-forge o similar para verificar:
      // - Validez temporal del certificado
      // - Emisor del certificado
      // - Tipo de certificado (firma digital)
      
      validation.isValid = true;
      validation.info.status = 'Certificado cargado correctamente';
      console.log('🔧 DEBUG: Certificado validado exitosamente');

    } catch (certificateError) {
      console.log('🔧 DEBUG: Error procesando certificado:', certificateError.message);
      validation.errors.push(`Error al procesar el certificado: ${certificateError.message}`);
      
      // Errores comunes de certificados
      if (certificateError.message.includes('password') || 
          certificateError.message.includes('Invalid') ||
          certificateError.message.includes('decrypt')) {
        validation.errors.push('La contraseña del certificado podría ser incorrecta');
      }
    }

  } catch (error) {
    console.log('🔧 DEBUG: Error general validando certificado:', error.message);
    validation.errors.push(`Error validando certificado: ${error.message}`);
  }

  console.log('🔧 DEBUG: Resultado final de validación:', validation);
  return validation;
};

// Validar contraseña del certificado
const validateCertificatePassword = (password) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  if (!password) {
    validation.errors.push('La contraseña del certificado es obligatoria');
    return validation;
  }

  if (typeof password !== 'string') {
    validation.errors.push('La contraseña debe ser una cadena de texto');
    return validation;
  }

  if (password.length < 4) {
    validation.warnings.push('La contraseña parece muy corta');
  }

  if (password.length > 100) {
    validation.errors.push('La contraseña es muy larga (máximo 100 caracteres)');
    return validation;
  }

  validation.isValid = true;
  return validation;
};

// Extraer información básica del certificado (sin validar contraseña)
const getCertificateBasicInfo = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      fileName: path.basename(filePath),
      fileSize: stats.size,
      uploadDate: stats.birthtime,
      lastModified: stats.mtime,
      extension: path.extname(filePath).toLowerCase()
    };
  } catch (error) {
    return {
      error: `No se pudo obtener información del archivo: ${error.message}`
    };
  }
};

// Función para validar formato del archivo (sin cargar el contenido)
const validateFileFormat = (filePath) => {
  const validation = {
    isValid: false,
    errors: [],
    warnings: []
  };

  try {
    // Verificar extensión
    const extension = path.extname(filePath).toLowerCase();
    const allowedExtensions = ['.p12', '.pfx'];
    
    if (!allowedExtensions.includes(extension)) {
      validation.errors.push(`Extensión no válida: ${extension}. Se requiere .p12 o .pfx`);
      return validation;
    }

    // Verificar que el archivo existe y no está vacío
    if (!fs.existsSync(filePath)) {
      validation.errors.push('El archivo no existe');
      return validation;
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      validation.errors.push('El archivo está vacío');
      return validation;
    }

    // Leer los primeros bytes para verificar firma del archivo
    const buffer = fs.readFileSync(filePath, { start: 0, end: 15 });
    
    // Los archivos .p12/.pfx tienen signatures específicas
    // Esto es una validación básica de formato
    if (buffer.length < 16) {
      validation.warnings.push('El archivo parece muy pequeño');
    }

    validation.isValid = true;

  } catch (error) {
    validation.errors.push(`Error validando formato: ${error.message}`);
  }

  return validation;
};

module.exports = {
  validateCertificateFile,
  validateCertificatePassword,
  getCertificateBasicInfo,
  validateFileFormat
};