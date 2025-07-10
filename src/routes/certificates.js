const express = require('express');
const router = express.Router();

// Importar controladores
const {
  uploadCertificate,
  getCertificateStatus,
  toggleCertificate,
  deleteCertificate,
  validateCertificate
} = require('../controllers/certificateController');

// Importar middleware
const { validateUserId } = require('../middleware/validation');
const { handleCertificateUpload } = require('../middleware/upload');

// POST /api/users/:id/certificate - Subir certificado
router.post('/:id/certificate',
  validateUserId,
  handleCertificateUpload,
  uploadCertificate
);

// GET /api/users/:id/certificate/status - Obtener estado del certificado
router.get('/:id/certificate/status',
  validateUserId,
  getCertificateStatus
);

// PUT /api/users/:id/certificate/toggle - Activar/desactivar certificado
router.put('/:id/certificate/toggle',
  validateUserId,
  toggleCertificate
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

module.exports = router;