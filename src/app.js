const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const { config } = require('./config/env');

// Importar rutas
const routes = require('./routes');

// Importar middleware personalizado
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Crear directorios necesarios si no existen
const createDirectories = () => {
  const dirs = [
    config.paths.uploads,
    config.paths.certificates,
    config.paths.xml
  ];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Directorio creado: ${dir}`);
    }
  });
};

// Crear directorios
createDirectories();

// Middlewares de seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configurado para desarrollo
const corsOptions = {
  origin: config.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Cambiar en producción
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Middlewares básicos de Express
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware para logging básico de requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV
  });
});

// Rutas principales
app.use('/api', routes);

// Ruta para archivos estáticos (opcional)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
    path: req.originalUrl
  });
});

// Middleware de manejo de errores (debe ir al final)
app.use(errorHandler);

module.exports = app;