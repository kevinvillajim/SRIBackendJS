const app = require('./app');
const { config, validateConfig } = require('./config/env');
const { testConnection, closePool } = require('./config/database');

// Validar configuración al inicio
validateConfig();

// Función para iniciar el servidor
const startServer = async () => {
  try {
    // Probar conexión a la base de datos
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error('❌ No se pudo conectar a la base de datos');
      process.exit(1);
    }

    // Iniciar servidor
    const server = app.listen(config.PORT, () => {
      console.log('🚀 Servidor iniciado exitosamente');
      console.log(`📍 URL: http://localhost:${config.PORT}`);
      console.log(`🌍 Entorno: ${config.NODE_ENV}`);
      console.log(`💾 Base de datos: ${config.database.host}:${config.database.port}/${config.database.database}`);
      console.log('⏰ Timestamp:', new Date().toISOString());
      console.log('─'.repeat(50));
    });

    // Manejo elegante del cierre del servidor
    const gracefulShutdown = (signal) => {
      console.log(`\n📥 Recibida señal ${signal}, cerrando servidor...`);
      
      server.close(async () => {
        console.log('🔴 Servidor HTTP cerrado');
        
        // Cerrar conexiones de base de datos
        await closePool();
        
        console.log('✅ Cierre elegante completado');
        process.exit(0);
      });
      
      // Forzar cierre después de 30 segundos
      setTimeout(() => {
        console.error('⚠️  Forzando cierre del servidor...');
        process.exit(1);
      }, 30000);
    };

    // Escuchar señales de cierre
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Manejo de errores no capturados
    process.on('uncaughtException', (error) => {
      console.error('❌ Excepción no capturada:', error);
      gracefulShutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Promesa rechazada no manejada:', reason);
      gracefulShutdown('unhandledRejection');
    });

  } catch (error) {
    console.error('❌ Error iniciando el servidor:', error.message);
    process.exit(1);
  }
};

// Iniciar servidor
startServer();