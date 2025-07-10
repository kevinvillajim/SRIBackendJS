const express = require('express');
const router = express.Router();

// Importar rutas específicas
const userRoutes = require('./users');
const billingRoutes = require('./billing');

// Ruta de información de la API
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API de Facturación SRI Ecuador',
    version: '1.0.0',
    endpoints: {
      users: {
        register: 'POST /api/users/register',
        getById: 'GET /api/users/:id',
        getByRuc: 'GET /api/users/ruc/:ruc',
        getAll: 'GET /api/users',
        update: 'PUT /api/users/:id',
        checkRuc: 'GET /api/users/check-ruc/:ruc'
      },
      certificates: {
        upload: 'POST /api/users/:id/certificate',
        status: 'GET /api/users/:id/certificate/status',
        toggle: 'PUT /api/users/:id/certificate/toggle',
        delete: 'DELETE /api/users/:id/certificate',
        validate: 'POST /api/users/:id/certificate/validate'
      },
      billing: {
        generate: 'POST /api/billing/generate/:userId',
        getOperation: 'GET /api/billing/operation/:operationId',
        getUserOperations: 'GET /api/billing/user/:userId/operations'
      },
      health: '/health'
    },
    timestamp: new Date().toISOString()
  });
});

// Ruta de prueba de conexión a BD
router.get('/test-db', async (req, res) => {
  try {
    const { testConnection } = require('../config/database');
    const connected = await testConnection();
    
    res.json({
      success: true,
      database: {
        connected,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error probando conexión a base de datos',
      error: error.message
    });
  }
});

// Ruta de test de encriptación (solo desarrollo)
router.get('/test-encryption', (req, res) => {
  try {
    const { encryptCertificatePassword, decryptCertificatePassword } = require('../utils/encryption');
    
    const testPassword = 'test123';
    console.log('🔧 TEST: Encriptando contraseña:', testPassword);
    
    const encrypted = encryptCertificatePassword(testPassword);
    console.log('🔧 TEST: Contraseña encriptada:', encrypted);
    
    const decrypted = decryptCertificatePassword(encrypted);
    console.log('🔧 TEST: Contraseña desencriptada:', decrypted);
    
    const success = testPassword === decrypted;
    
    res.json({
      success: true,
      test: {
        original: testPassword,
        encrypted: encrypted,
        decrypted: decrypted,
        match: success
      },
      message: success ? 'Encriptación funciona correctamente' : 'Error en encriptación'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error en test de encriptación'
    });
  }
});

// Ruta de información del servidor
router.get('/info', (req, res) => {
  const { config } = require('../config/env');
  
  res.json({
    success: true,
    server: {
      environment: config.NODE_ENV,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version
    }
  });
});

// Rutas específicas
router.use('/users', userRoutes);
router.use('/billing', billingRoutes);

// Ruta para manejar endpoints no implementados aún
router.use('*', (req, res) => {
  res.status(501).json({
    success: false,
    message: 'Endpoint no implementado aún',
    path: req.originalUrl,
    method: req.method
  });
});

module.exports = router;