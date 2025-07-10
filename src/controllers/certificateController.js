const User = require('../models/User');
const { executeQuery } = require('../config/database');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { success, created, notFound, badRequest, serverError } = require('../utils/responses');
const { encryptCertificatePassword, decryptCertificatePassword } = require('../utils/encryption');
const { 
  validateCertificateFile, 
  validateCertificatePassword,
  getCertificateBasicInfo 
} = require('../utils/certificateValidator');
const { 
  deleteCertificateFile, 
  certificateFileExists,
  getCertificateFileInfo 
} = require('../middleware/upload');
const path = require('path');
const { config } = require('../config/env');

// Subir certificado
const uploadCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  // Verificar que el usuario existe
  const user = await User.findById(id);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  // Verificar que se subió un archivo
  if (!req.file) {
    return badRequest(res, 'No se proporcionó archivo de certificado');
  }

  // Validar contraseña
  const passwordValidation = validateCertificatePassword(password);
  if (!passwordValidation.isValid) {
    // Eliminar archivo subido si la validación falla
    deleteCertificateFile(req.certificateFilename);
    return badRequest(res, 'Contraseña inválida', passwordValidation.errors);
  }

  try {
    console.log('🔧 DEBUG: Iniciando validación de certificado');
    console.log('🔧 DEBUG: Archivo:', req.certificateFilename);
    console.log('🔧 DEBUG: Contraseña recibida:', password ? 'SÍ' : 'NO');
    
    // Ruta completa del archivo
    const filePath = path.join(config.paths.certificates, req.certificateFilename);
    console.log('🔧 DEBUG: Ruta del archivo:', filePath);

    // Validar el archivo de certificado
    console.log('🔧 DEBUG: Validando archivo de certificado...');
    const fileValidation = await validateCertificateFile(filePath, password);
    console.log('🔧 DEBUG: Resultado de validación:', fileValidation);
    
    if (!fileValidation.isValid) {
      console.log('🔧 DEBUG: Validación falló, eliminando archivo');
      // Eliminar archivo si la validación falla
      deleteCertificateFile(req.certificateFilename);
      return badRequest(res, 'Certificado inválido', fileValidation.errors);
    }

    // Si el usuario ya tiene un certificado, eliminar el archivo anterior
    if (user.certificado_filename) {
      console.log('🔧 DEBUG: Eliminando certificado anterior:', user.certificado_filename);
      deleteCertificateFile(user.certificado_filename);
    }

    // Encriptar contraseña
    console.log('🔧 DEBUG: Encriptando contraseña...');
    const encryptedPassword = encryptCertificatePassword(password);
    console.log('🔧 DEBUG: Contraseña encriptada exitosamente');

    // Actualizar información del certificado en la base de datos
    console.log('🔧 DEBUG: Actualizando base de datos...');
    const updatedUser = await User.updateCertificate(id, {
      filename: req.certificateFilename,
      password: encryptedPassword,
      activo: true // Activar automáticamente al subir
    });
    console.log('🔧 DEBUG: Base de datos actualizada exitosamente');

    // Preparar respuesta
    const response = {
      message: 'Certificado subido y validado exitosamente',
      certificate: {
        filename: req.certificateFilename,
        uploadDate: new Date().toISOString(),
        fileSize: req.file.size,
        isActive: true,
        validation: {
          isValid: fileValidation.isValid,
          warnings: fileValidation.warnings
        }
      },
      user: updatedUser.toPublicJSON()
    };

    // Agregar advertencias si las hay
    if (fileValidation.warnings.length > 0 || passwordValidation.warnings.length > 0) {
      response.warnings = [
        ...fileValidation.warnings,
        ...passwordValidation.warnings
      ];
    }

    return created(res, response, 'Certificado subido exitosamente');

  } catch (error) {
    // Eliminar archivo en caso de error
    deleteCertificateFile(req.certificateFilename);
    console.error('❌ Error procesando certificado:', error);
    console.error('❌ Stack trace:', error.stack);
    
    // Mensaje de error más específico
    let errorMessage = 'Error procesando el certificado';
    if (error.message.includes('encriptación')) {
      errorMessage = 'Error en la encriptación de la contraseña';
    } else if (error.message.includes('database') || error.message.includes('MySQL')) {
      errorMessage = 'Error guardando en la base de datos';
    } else if (error.message.includes('certificate') || error.message.includes('p12')) {
      errorMessage = 'Error validando el certificado';
    }
    
    return serverError(res, errorMessage, error.message);
  }
});

// Obtener estado del certificado
const getCertificateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  // Información básica del certificado
  const certificateInfo = {
    hasCertificate: user.tiene_certificado,
    isActive: user.certificado_activo,
    uploadDate: user.certificado_fecha_subida,
    filename: user.certificado_filename
  };

  // Si tiene certificado, verificar el archivo físico
  if (user.tiene_certificado && user.certificado_filename) {
    const fileExists = certificateFileExists(user.certificado_filename);
    const fileInfo = getCertificateFileInfo(user.certificado_filename);
    
    certificateInfo.fileExists = fileExists;
    certificateInfo.fileInfo = fileInfo;

    // Si el archivo no existe, marcar como inactivo
    if (!fileExists && user.certificado_activo) {
      await User.toggleCertificate(id, false);
      certificateInfo.isActive = false;
      certificateInfo.warning = 'Archivo de certificado no encontrado, marcado como inactivo';
    }

    // Información adicional del certificado
    if (fileExists) {
      const basicInfo = getCertificateBasicInfo(
        path.join(config.paths.certificates, user.certificado_filename)
      );
      certificateInfo.details = basicInfo;
    }
  }

  return success(res, certificateInfo, 'Estado del certificado obtenido');
});

// Activar/desactivar certificado
const toggleCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return badRequest(res, 'El campo "active" debe ser un valor booleano');
  }

  const user = await User.findById(id);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  if (!user.tiene_certificado) {
    return badRequest(res, 'El usuario no tiene certificado cargado');
  }

  // Verificar que el archivo existe antes de activar
  if (active && user.certificado_filename) {
    const fileExists = certificateFileExists(user.certificado_filename);
    if (!fileExists) {
      return badRequest(res, 'No se puede activar: archivo de certificado no encontrado');
    }
  }

  const updatedUser = await User.toggleCertificate(id, active);

  return success(
    res,
    updatedUser.toPublicJSON(),
    `Certificado ${active ? 'activado' : 'desactivado'} exitosamente`
  );
});

// Eliminar certificado
const deleteCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  if (!user.tiene_certificado) {
    return badRequest(res, 'El usuario no tiene certificado para eliminar');
  }

  try {
    // Eliminar archivo físico
    if (user.certificado_filename) {
      deleteCertificateFile(user.certificado_filename);
    }

    // Limpiar información del certificado en la base de datos
    const updatedUser = await User.updateCertificate(id, {
      filename: null,
      password: null,
      activo: false
    });

    // Actualizar flags
    await executeQuery(
      'UPDATE usuarios SET tiene_certificado = false WHERE id = ?',
      [id]
    );

    return success(res, updatedUser.toPublicJSON(), 'Certificado eliminado exitosamente');

  } catch (error) {
    console.error('❌ Error eliminando certificado:', error);
    return serverError(res, 'Error eliminando el certificado', error.message);
  }
});

// Validar certificado con contraseña
const validateCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  const user = await User.findById(id);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  if (!user.tiene_certificado || !user.certificado_filename) {
    return badRequest(res, 'El usuario no tiene certificado cargado');
  }

  // Verificar archivo
  const filePath = path.join(config.paths.certificates, user.certificado_filename);
  if (!certificateFileExists(user.certificado_filename)) {
    return badRequest(res, 'Archivo de certificado no encontrado');
  }

  try {
    // Validar con la contraseña proporcionada
    const validation = await validateCertificateFile(filePath, password);

    const response = {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings,
      info: validation.info
    };

    if (validation.isValid) {
      return success(res, response, 'Certificado validado exitosamente');
    } else {
      return badRequest(res, 'Validación del certificado fallida', response);
    }

  } catch (error) {
    console.error('❌ Error validando certificado:', error);
    return serverError(res, 'Error validando el certificado', error.message);
  }
});

module.exports = {
  uploadCertificate,
  getCertificateStatus,
  toggleCertificate,
  deleteCertificate,
  validateCertificate
};