const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/env');
const { createError } = require('./errorHandler');

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = config.paths.certificates;
    
    // Crear directorio si no existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generar nombre único: userId_timestamp.p12
    const userId = req.params.id;
    const timestamp = Date.now();
    const fileName = `${userId}_${timestamp}.p12`;
    
    // Guardar el nombre del archivo en el request para uso posterior
    req.certificateFilename = fileName;
    
    cb(null, fileName);
  }
});

// Filtro de archivos - solo .p12
const fileFilter = (req, file, cb) => {
  // Verificar extensión
  const allowedExtensions = ['.p12', '.pfx'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    return cb(createError('Solo se permiten archivos .p12 o .pfx', 400), false);
  }
  
  // Verificar MIME type
  const allowedMimeTypes = [
    'application/x-pkcs12',
    'application/pkcs12',
    'application/octet-stream'
  ];
  
  if (!allowedMimeTypes.includes(file.mimetype)) {
    console.log(`⚠️  MIME type no reconocido: ${file.mimetype}, pero extensión válida: ${fileExtension}`);
    // Permitir el archivo si la extensión es correcta
  }
  
  cb(null, true);
};

// Configuración de multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 1 // Solo un archivo
  }
});

// Middleware específico para certificados
const uploadCertificate = upload.single('certificate');

// Wrapper para manejo de errores de multer
const handleCertificateUpload = (req, res, next) => {
  uploadCertificate(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(createError('El archivo es muy grande. Máximo 5MB permitido', 413));
      } else if (err.code === 'LIMIT_FILE_COUNT') {
        return next(createError('Solo se permite un archivo por vez', 400));
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(createError('Campo de archivo inesperado. Use "certificate"', 400));
      } else {
        return next(createError(`Error de upload: ${err.message}`, 400));
      }
    } else if (err) {
      return next(err);
    }
    
    // Verificar que se subió un archivo
    if (!req.file) {
      return next(createError('No se proporcionó ningún archivo de certificado', 400));
    }
    
    next();
  });
};

// Función para eliminar archivo de certificado
const deleteCertificateFile = (filename) => {
  try {
    const filePath = path.join(config.paths.certificates, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Archivo eliminado: ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error eliminando archivo ${filename}:`, error.message);
    return false;
  }
};

// Función para verificar si un archivo existe
const certificateFileExists = (filename) => {
  try {
    const filePath = path.join(config.paths.certificates, filename);
    return fs.existsSync(filePath);
  } catch (error) {
    console.error(`❌ Error verificando archivo ${filename}:`, error.message);
    return false;
  }
};

// Función para obtener información del archivo
const getCertificateFileInfo = (filename) => {
  try {
    const filePath = path.join(config.paths.certificates, filename);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        exists: true,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime
      };
    }
    return { exists: false };
  } catch (error) {
    console.error(`❌ Error obteniendo info del archivo ${filename}:`, error.message);
    return { exists: false, error: error.message };
  }
};

module.exports = {
  handleCertificateUpload,
  deleteCertificateFile,
  certificateFileExists,
  getCertificateFileInfo
};