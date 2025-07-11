require('dotenv').config();

const config = {
	// Servidor
	PORT: process.env.PORT || 3000,
	NODE_ENV: process.env.NODE_ENV || "development",

	// Base de datos
	database: {
		host: process.env.DB_HOST || "localhost",
		port: process.env.DB_PORT || 3306,
		user: process.env.DB_USER || "root",
		password: process.env.DB_PASSWORD || "",
		database: process.env.DB_NAME || "facturacion_sri",
		timezone: "Z",
		charset: "utf8mb4",
	},

	// Rutas de archivos
	paths: {
		uploads: process.env.UPLOADS_PATH || "./uploads",
		certificates: process.env.CERTIFICATES_PATH || "./uploads/certificates",
		xml: process.env.XML_PATH || "./uploads/xml",
	},

	// Seguridad
	security: {
		jwtSecret:
			process.env.JWT_SECRET || "default_jwt_secret_change_in_production",
		encryptionKey:
			process.env.ENCRYPTION_KEY ||
			"default_encryption_key_32_characters_long_minimum",
	},

	// URLs del SRI
	sri: {
		reception: {
			test:
				process.env.SRI_RECEPTION_URL_TEST ||
				"https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl",
			prod:
				process.env.SRI_RECEPTION_URL_PROD ||
				"https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl",
		},
		authorization: {
			test:
				process.env.SRI_AUTHORIZATION_URL_TEST ||
				"https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl",
			prod:
				process.env.SRI_AUTHORIZATION_URL_PROD ||
				"https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl",
		},
		endpoints: {
			reception: {
				test: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
				prod: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
			},
			authorization: {
				test: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
				prod: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
			},
		},
	},

	// Logging
	logging: {
		level: process.env.LOG_LEVEL || "info",
	},
};

// Validar configuraciones críticas
const validateConfig = () => {
  const required = [
    'DB_HOST',
    'DB_USER', 
    'DB_PASSWORD',
    'DB_NAME'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Variables de entorno faltantes:', missing.join(', '));
    process.exit(1);
  }
  
  // Verificar clave de encriptación
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
    console.warn('⚠️  ENCRYPTION_KEY muy corta o no configurada. Usando clave por defecto (NO para producción)');
  }
  
  console.log('✅ Configuración validada correctamente');
};

module.exports = {
  config,
  validateConfig
};