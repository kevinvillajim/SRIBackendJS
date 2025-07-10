const express = require('express');
const router = express.Router();

// Importar controladores
const {
  generateBilling,
  getOperation,
  getUserOperations
} = require('../controllers/billingController');

// Importar validaciones - CORREGIDO: billingValidation -> billingValidator
const {
  validateBillingData,
  validateUserIdParam,
  sanitizeBillingData,
  validateOptionalBillingData
} = require('../middleware/billingValidator');

// POST /api/billing/generate/:userId - Generar factura
router.post('/generate/:userId',
  validateUserIdParam,
  sanitizeBillingData,
  validateBillingData,
  validateOptionalBillingData,
  generateBilling
);

// GET /api/billing/operation/:operationId - Obtener operación específica
router.get('/operation/:operationId',
  getOperation
);

// GET /api/billing/user/:userId/operations - Obtener operaciones de usuario
router.get('/user/:userId/operations',
  validateUserIdParam,
  getUserOperations
);

// Middleware para rutas no encontradas
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta de facturación no encontrada',
    path: req.originalUrl
  });
});

module.exports = router;