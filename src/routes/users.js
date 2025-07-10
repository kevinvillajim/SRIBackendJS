const express = require('express');
const router = express.Router();

// Importar controladores
const {
  registerUser,
  getUserById,
  getUserByRuc,
  getAllUsers,
  updateUser,
  getCertificateStatus,
  toggleCertificate,
  checkRucAvailability
} = require('../controllers/userController');

// Importar controladores de certificados
const {
  uploadCertificate,
  getCertificateStatus: getCertStatus,
  toggleCertificate: toggleCert,
  deleteCertificate,
  validateCertificate
} = require('../controllers/certificateController');

// Importar validaciones
const {
  validateUserRegistration,
  validateUserId,
  validateUserUpdate,
  sanitizeUserData
} = require('../middleware/validation');

// Importar middleware de upload
const { handleCertificateUpload } = require('../middleware/upload');

// Rutas públicas

// POST /api/users/register - Registrar nuevo usuario
router.post('/register', 
  sanitizeUserData,
  validateUserRegistration,
  registerUser
);

// GET /api/users - Listar usuarios con paginación
router.get('/', getAllUsers);

// GET /api/users/check-ruc/:ruc - Verificar disponibilidad de RUC
router.get('/check-ruc/:ruc', checkRucAvailability);

// GET /api/users/ruc/:ruc - Obtener usuario por RUC
router.get('/ruc/:ruc', getUserByRuc);

// GET /api/users/:id - Obtener usuario por ID
router.get('/:id', 
  validateUserId,
  getUserById
);

// PUT /api/users/:id - Actualizar usuario
router.put('/:id',
  validateUserId,
  sanitizeUserData,
  validateUserUpdate,
  updateUser
);

// Rutas para gestión de certificados

// POST /api/users/:id/certificate - Subir certificado
router.post('/:id/certificate',
  validateUserId,
  handleCertificateUpload,
  uploadCertificate
);

// GET /api/users/:id/certificate - Obtener estado del certificado (manteniendo compatibilidad)
router.get('/:id/certificate',
  validateUserId,
  getCertStatus
);

// GET /api/users/:id/certificate/status - Obtener estado del certificado
router.get('/:id/certificate/status',
  validateUserId,
  getCertStatus
);

// PUT /api/users/:id/certificate/toggle - Activar/desactivar certificado
router.put('/:id/certificate/toggle',
  validateUserId,
  toggleCert
);

// DELETE /api/users/:id/certificate - Eliminar certificado
router.delete('/:id/certificate',
  validateUserId,
  deleteCertificate
);

// POST /api/users/:id/certificate/validate - Validar certificado con contraseña
router.post('/:id/certificate/validate',
  validateUserId,
  validateCertificate
);

// Middleware para manejar rutas no encontradas en este módulo
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta de usuarios no encontrada',
    path: req.originalUrl
  });
});

module.exports = router;