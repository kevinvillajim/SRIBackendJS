const express = require("express");
const router = express.Router();

// Importar controladores
const {
	testSigningWithUpload,
	testSigningWithJSON,
	validateCertificateOnly,
	xmlToBase64,
	testWithSRISample,
	uploadMiddleware,
} = require("../controllers/signingTestController");

// Ruta de información sobre las pruebas de firma
router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "API de Pruebas de Firma XAdES-BES para SRI Ecuador",
		version: "1.0.0",
		endpoints: {
			testUpload: {
				method: "POST",
				path: "/test-upload",
				description:
					"Probar firmado subiendo archivos certificate (.p12) y xml (.xml)",
				fields: {
					certificate: "Archivo .p12 del certificado",
					xml: "Archivo .xml a firmar",
					password: "Contraseña del certificado",
				},
			},
			testJSON: {
				method: "POST",
				path: "/test-json",
				description: "Probar firmado enviando datos en JSON",
				body: {
					certificateBase64: "Certificado .p12 codificado en base64",
					password: "Contraseña del certificado",
					xmlContent: "Contenido XML a firmar",
				},
			},
			validateCertificate: {
				method: "POST",
				path: "/validate-certificate",
				description: "Validar certificado sin firmar",
				fields: {
					certificate: "Archivo .p12 del certificado",
					password: "Contraseña del certificado",
				},
			},
			xmlToBase64: {
				method: "POST",
				path: "/xml-to-base64",
				description: "Convertir XML a Base64 para envío al SRI",
				body: {
					xmlContent: "Contenido XML a convertir",
				},
			},
			testSRISample: {
				method: "POST",
				path: "/test-sri-sample",
				description: "Probar con XML de ejemplo del SRI",
				fields: {
					certificate: "Archivo .p12 del certificado",
					password: "Contraseña del certificado",
				},
			},
		},
		notes: [
			"Todas las rutas son para pruebas y desarrollo",
			"Los certificados deben ser de Uanataca para cumplir con estándares del SRI",
			"El XML resultante incluye firma XAdES-BES compatible con SRI Ecuador",
			"Se valida automáticamente el formato del IssuerName para Uanataca",
		],
		timestamp: new Date().toISOString(),
	});
});

// POST /api/signing/test-upload - Probar firmado con archivos subidos
router.post("/test-upload", uploadMiddleware, testSigningWithUpload);

// POST /api/signing/test-json - Probar firmado con datos JSON
router.post("/test-json", testSigningWithJSON);

// POST /api/signing/validate-certificate - Validar certificado solamente
router.post("/validate-certificate", uploadMiddleware, validateCertificateOnly);

// POST /api/signing/xml-to-base64 - Convertir XML a Base64
router.post("/xml-to-base64", xmlToBase64);

// POST /api/signing/test-sri-sample - Probar con XML de ejemplo del SRI
router.post("/test-sri-sample", uploadMiddleware, testWithSRISample);

// Middleware para rutas no encontradas
router.use("*", (req, res) => {
	res.status(404).json({
		success: false,
		message: "Ruta de pruebas de firma no encontrada",
		path: req.originalUrl,
		availableRoutes: [
			"GET /",
			"POST /test-upload",
			"POST /test-json",
			"POST /validate-certificate",
			"POST /xml-to-base64",
			"POST /test-sri-sample",
		],
	});
});

module.exports = router;
