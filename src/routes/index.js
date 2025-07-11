const express = require("express");
const router = express.Router();

// Importar rutas específicas
const userRoutes = require("./users");
const billingRoutes = require("./billing");
const signingRoutes = require("./signing"); // Nueva ruta para pruebas de firma

// Ruta de información de la API
router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "API de Facturación SRI Ecuador con Firmado XAdES-BES",
		version: "1.0.0",
		features: [
			"Gestión de usuarios y certificados digitales",
			"Generación de facturas electrónicas",
			"Firmado XAdES-BES compatible con SRI Ecuador",
			"Soporte completo para certificados Uanataca",
			"Validación automática de firmas digitales",
			"Conversión a Base64 para envío al SRI",
		],
		endpoints: {
			users: {
				register: "POST /api/users/register",
				getById: "GET /api/users/:id",
				getByRuc: "GET /api/users/ruc/:ruc",
				getAll: "GET /api/users",
				update: "PUT /api/users/:id",
				checkRuc: "GET /api/users/check-ruc/:ruc",
			},
			certificates: {
				upload: "POST /api/users/:id/certificate",
				status: "GET /api/users/:id/certificate/status",
				toggle: "PUT /api/users/:id/certificate/toggle",
				delete: "DELETE /api/users/:id/certificate",
				validate: "POST /api/users/:id/certificate/validate",
			},
			billing: {
				generate: "POST /api/billing/generate/:userId",
				getOperation: "GET /api/billing/operation/:operationId",
				getUserOperations: "GET /api/billing/user/:userId/operations",
			},
			signing: {
				info: "GET /api/signing",
				testUpload: "POST /api/signing/test-upload",
				testJSON: "POST /api/signing/test-json",
				validateCertificate: "POST /api/signing/validate-certificate",
				xmlToBase64: "POST /api/signing/xml-to-base64",
				testSRISample: "POST /api/signing/test-sri-sample",
			},
			health: "GET /health",
			info: "GET /api/info",
		},
		signingInfo: {
			standard: "XAdES-BES para SRI Ecuador",
			supportedCertificates: "Uanataca (1-3 años y 4-5 años)",
			outputFormat: "XML firmado + Base64 para SRI",
			validation: "Automática con estándares SRI",
		},
		timestamp: new Date().toISOString(),
	});
});

// Ruta de prueba de conexión a BD
router.get("/test-db", async (req, res) => {
	try {
		const {testConnection} = require("../config/database");
		const connected = await testConnection();

		res.json({
			success: true,
			database: {
				connected,
				timestamp: new Date().toISOString(),
			},
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: "Error probando conexión a base de datos",
			error: error.message,
		});
	}
});

// Ruta de test de encriptación (solo desarrollo)
router.get("/test-encryption", (req, res) => {
	try {
		const {
			encryptCertificatePassword,
			decryptCertificatePassword,
		} = require("../utils/encryption");

		const testPassword = "test123";
		console.log("🔧 TEST: Encriptando contraseña:", testPassword);

		const encrypted = encryptCertificatePassword(testPassword);
		console.log("🔧 TEST: Contraseña encriptada:", encrypted);

		const decrypted = decryptCertificatePassword(encrypted);
		console.log("🔧 TEST: Contraseña desencriptada:", decrypted);

		const success = testPassword === decrypted;

		res.json({
			success: true,
			test: {
				original: testPassword,
				encrypted: encrypted,
				decrypted: decrypted,
				match: success,
			},
			message: success
				? "Encriptación funciona correctamente"
				: "Error en encriptación",
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error.message,
			message: "Error en test de encriptación",
		});
	}
});

// Ruta de test del firmador XAdES-BES
router.get("/test-signing", async (req, res) => {
	try {
		const SRISigningService = require("../services/SRISigningService");
		const signingService = new SRISigningService();

		// XML de prueba simple
		const testXml = `<?xml version="1.0" encoding="UTF-8"?>
<test id="comprobante">
  <data>Prueba de firmado XAdES-BES</data>
  <timestamp>${new Date().toISOString()}</timestamp>
</test>`;

		res.json({
			success: true,
			message: "Servicio de firmado XAdES-BES inicializado correctamente",
			test: {
				xmlSample: testXml,
				xmlSize: testXml.length,
				base64Size: signingService.xmlToBase64(testXml).length,
			},
			info: {
				signerClass: "SRIXAdESSigner",
				serviceClass: "SRISigningService",
				standard: "XAdES-BES para SRI Ecuador",
				supportedCertificates: "Uanataca .p12/.pfx",
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error.message,
			message: "Error inicializando servicio de firmado",
		});
	}
});

// Ruta de información del servidor
router.get("/info", (req, res) => {
	const {config} = require("../config/env");

	res.json({
		success: true,
		server: {
			environment: config.NODE_ENV,
			uptime: process.uptime(),
			memory: process.memoryUsage(),
			timestamp: new Date().toISOString(),
			nodeVersion: process.version,
			features: {
				database: "MySQL con pool de conexiones",
				certificates: "Soporte .p12/.pfx con encriptación",
				signing: "XAdES-BES compatible con SRI Ecuador",
				validation: "Automática para certificados Uanataca",
			},
		},
		paths: {
			certificates: config.paths.certificates,
			uploads: config.paths.uploads,
			xml: config.paths.xml,
		},
	});
});

// Rutas específicas
router.use("/users", userRoutes);
router.use("/billing", billingRoutes);
router.use("/signing", signingRoutes); // Nueva ruta para pruebas de firma

// Ruta para manejar endpoints no implementados aún
router.use("*", (req, res) => {
	res.status(501).json({
		success: false,
		message: "Endpoint no implementado aún",
		path: req.originalUrl,
		method: req.method,
		availableRoutes: {
			api: "GET /api",
			users: "/api/users/*",
			billing: "/api/billing/*",
			signing: "/api/signing/*",
			tests: [
				"GET /api/test-db",
				"GET /api/test-encryption",
				"GET /api/test-signing",
			],
		},
	});
});

module.exports = router;
