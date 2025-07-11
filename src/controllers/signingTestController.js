const {asyncHandler} = require("../middleware/errorHandler");
const {
	success,
	created,
	badRequest,
	serverError,
} = require("../utils/responses");
const SRISigningService = require("../services/SRISigningService");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configurar multer para upload temporal de certificados
const storage = multer.memoryStorage();
const upload = multer({
	storage: storage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
		files: 2, // Certificado + XML
	},
	fileFilter: (req, file, cb) => {
		if (file.fieldname === "certificate") {
			// Solo .p12 o .pfx para certificados
			const allowedExts = [".p12", ".pfx"];
			const fileExt = path.extname(file.originalname).toLowerCase();
			if (!allowedExts.includes(fileExt)) {
				return cb(
					new Error("Solo se permiten archivos .p12 o .pfx para certificados"),
					false
				);
			}
		} else if (file.fieldname === "xml") {
			// Solo .xml para archivos XML
			const fileExt = path.extname(file.originalname).toLowerCase();
			if (fileExt !== ".xml") {
				return cb(new Error("Solo se permiten archivos .xml"), false);
			}
		}
		cb(null, true);
	},
});

// Inicializar servicio de firmado
const signingService = new SRISigningService();

/**
 * Probar firmado con archivos subidos
 * POST /api/signing/test-upload
 * Espera: certificate (archivo .p12), xml (archivo .xml), password (string)
 */
const testSigningWithUpload = asyncHandler(async (req, res) => {
	console.log("🧪 Iniciando prueba de firmado con archivos subidos");

	try {
		// Verificar archivos subidos
		if (!req.files || !req.files.certificate || !req.files.xml) {
			return badRequest(
				res,
				"Se requieren los archivos: certificate (.p12) y xml (.xml)"
			);
		}

		const {password} = req.body;
		if (!password) {
			return badRequest(res, "Se requiere la contraseña del certificado");
		}

		const certificateFile = req.files.certificate[0];
		const xmlFile = req.files.xml[0];

		console.log(
			"📁 Archivo certificado:",
			certificateFile.originalname,
			"Tamaño:",
			certificateFile.size
		);
		console.log(
			"📁 Archivo XML:",
			xmlFile.originalname,
			"Tamaño:",
			xmlFile.size
		);

		// Convertir contenido XML a string
		const xmlContent = xmlFile.buffer.toString("utf8");

		// Firmar XML
		const signingResult = await signingService.signXMLFromBuffer(
			certificateFile.buffer,
			password,
			xmlContent
		);

		if (!signingResult.success) {
			return badRequest(res, "Error en el firmado", {
				error: signingResult.error,
				validation: signingResult.validation,
			});
		}

		console.log("✅ Prueba de firmado exitosa");

		const response = {
			success: true,
			originalXml: {
				filename: xmlFile.originalname,
				size: xmlFile.size,
			},
			certificate: {
				filename: certificateFile.originalname,
				size: certificateFile.size,
			},
			result: {
				signedXml: signingResult.signedXml,
				base64Xml: signingResult.base64Xml,
				validation: signingResult.validation,
				info: signingResult.info,
			},
			timestamp: new Date().toISOString(),
		};

		return success(res, response, "XML firmado exitosamente en prueba");
	} catch (error) {
		console.error("❌ Error en prueba de firmado:", error.message);
		return serverError(
			res,
			"Error procesando la prueba de firmado",
			error.message
		);
	}
});

/**
 * Probar firmado con datos en JSON
 * POST /api/signing/test-json
 * Espera: { certificateBase64, password, xmlContent }
 */
const testSigningWithJSON = asyncHandler(async (req, res) => {
	console.log("🧪 Iniciando prueba de firmado con datos JSON");

	try {
		const {certificateBase64, password, xmlContent} = req.body;

		// Validar datos requeridos
		if (!certificateBase64) {
			return badRequest(
				res,
				"Se requiere certificateBase64 (archivo .p12 en base64)"
			);
		}

		if (!password) {
			return badRequest(
				res,
				"Se requiere password (contraseña del certificado)"
			);
		}

		if (!xmlContent) {
			return badRequest(res, "Se requiere xmlContent (contenido XML a firmar)");
		}

		// Convertir base64 a buffer
		let certificateBuffer;
		try {
			certificateBuffer = Buffer.from(certificateBase64, "base64");
		} catch (error) {
			return badRequest(res, "El certificateBase64 no es válido");
		}

		console.log(
			"📊 Datos recibidos - Certificado:",
			certificateBuffer.length,
			"bytes, XML:",
			xmlContent.length,
			"caracteres"
		);

		// Firmar XML
		const signingResult = await signingService.signXMLFromBuffer(
			certificateBuffer,
			password,
			xmlContent
		);

		if (!signingResult.success) {
			return badRequest(res, "Error en el firmado", {
				error: signingResult.error,
				validation: signingResult.validation,
			});
		}

		console.log("✅ Prueba de firmado JSON exitosa");

		const response = {
			success: true,
			input: {
				certificateSize: certificateBuffer.length,
				xmlSize: xmlContent.length,
			},
			result: {
				signedXml: signingResult.signedXml,
				base64Xml: signingResult.base64Xml,
				validation: signingResult.validation,
				info: signingResult.info,
			},
			timestamp: new Date().toISOString(),
		};

		return success(res, response, "XML firmado exitosamente en prueba JSON");
	} catch (error) {
		console.error("❌ Error en prueba JSON de firmado:", error.message);
		return serverError(
			res,
			"Error procesando la prueba JSON de firmado",
			error.message
		);
	}
});

/**
 * Validar certificado sin firmar
 * POST /api/signing/validate-certificate
 * Espera: certificate (archivo .p12), password (string)
 */
const validateCertificateOnly = asyncHandler(async (req, res) => {
	console.log("🔍 Iniciando validación de certificado");

	try {
		if (!req.files || !req.files.certificate) {
			return badRequest(res, "Se requiere el archivo certificate (.p12)");
		}

		const {password} = req.body;
		if (!password) {
			return badRequest(res, "Se requiere la contraseña del certificado");
		}

		const certificateFile = req.files.certificate[0];

		console.log(
			"📁 Validando certificado:",
			certificateFile.originalname,
			"Tamaño:",
			certificateFile.size
		);

		// Crear archivo temporal para validación
		const tempPath = path.join(
			__dirname,
			"../../temp_cert_" + Date.now() + ".p12"
		);
		fs.writeFileSync(tempPath, certificateFile.buffer);

		try {
			// Validar certificado
			const validation = await signingService.validateCertificate(
				tempPath,
				password
			);

			// Obtener información del certificado si es válido
			let certificateInfo = null;
			if (validation.isValid) {
				const infoResult = await signingService.getCertificateInfo(
					tempPath,
					password
				);
				if (infoResult.success) {
					certificateInfo = infoResult.info;
				}
			}

			const response = {
				validation,
				certificateInfo,
				fileInfo: {
					originalName: certificateFile.originalname,
					size: certificateFile.size,
					mimeType: certificateFile.mimetype,
				},
				timestamp: new Date().toISOString(),
			};

			// Limpiar archivo temporal
			fs.unlinkSync(tempPath);

			const message = validation.isValid
				? "Certificado válido"
				: "Certificado inválido";

			return success(res, response, message);
		} catch (validationError) {
			// Limpiar archivo temporal en caso de error
			if (fs.existsSync(tempPath)) {
				fs.unlinkSync(tempPath);
			}
			throw validationError;
		}
	} catch (error) {
		console.error("❌ Error validando certificado:", error.message);
		return serverError(res, "Error validando el certificado", error.message);
	}
});

/**
 * Convertir XML a Base64
 * POST /api/signing/xml-to-base64
 * Espera: { xmlContent }
 */
const xmlToBase64 = asyncHandler(async (req, res) => {
	try {
		const {xmlContent} = req.body;

		if (!xmlContent) {
			return badRequest(res, "Se requiere xmlContent");
		}

		const base64Xml = signingService.xmlToBase64(xmlContent);

		const response = {
			originalXml: xmlContent,
			base64Xml: base64Xml,
			info: {
				originalSize: xmlContent.length,
				base64Size: base64Xml.length,
				compression:
					(
						((xmlContent.length - base64Xml.length) / xmlContent.length) *
						100
					).toFixed(2) + "%",
			},
			timestamp: new Date().toISOString(),
		};

		return success(res, response, "XML convertido a Base64 exitosamente");
	} catch (error) {
		console.error("❌ Error convirtiendo XML a Base64:", error.message);
		return serverError(res, "Error convirtiendo XML a Base64", error.message);
	}
});

/**
 * Probar con XML de ejemplo del SRI
 * POST /api/signing/test-sri-sample
 * Espera: certificate (archivo .p12), password (string)
 */
const testWithSRISample = asyncHandler(async (req, res) => {
	console.log("🧪 Iniciando prueba con XML de ejemplo del SRI");

	try {
		if (!req.files || !req.files.certificate) {
			return badRequest(res, "Se requiere el archivo certificate (.p12)");
		}

		const {password} = req.body;
		if (!password) {
			return badRequest(res, "Se requiere la contraseña del certificado");
		}

		// XML de ejemplo simplificado para pruebas
		const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
<infoTributaria>
<ambiente>1</ambiente>
<tipoEmision>1</tipoEmision>
<razonSocial>EMPRESA DE PRUEBA</razonSocial>
<nombreComercial>EMPRESA PRUEBA</nombreComercial>
<ruc>1234567890001</ruc>
<claveAcceso>1001202501123456789000110010010000000011234567890</claveAcceso>
<codDoc>01</codDoc>
<estab>001</estab>
<ptoEmi>001</ptoEmi>
<secuencial>000000001</secuencial>
<dirMatriz>DIRECCION DE PRUEBA</dirMatriz>
</infoTributaria>
<infoFactura>
<fechaEmision>10/01/2025</fechaEmision>
<dirEstablecimiento>DIRECCION DE PRUEBA</dirEstablecimiento>
<obligadoContabilidad>NO</obligadoContabilidad>
<tipoIdentificacionComprador>05</tipoIdentificacionComprador>
<razonSocialComprador>CLIENTE DE PRUEBA</razonSocialComprador>
<identificacionComprador>1234567890</identificacionComprador>
<totalSinImpuestos>100.00</totalSinImpuestos>
<totalDescuento>0.00</totalDescuento>
<totalConImpuestos>
<totalImpuesto>
<codigo>2</codigo>
<codigoPorcentaje>2</codigoPorcentaje>
<baseImponible>100.00</baseImponible>
<valor>12.00</valor>
</totalImpuesto>
</totalConImpuestos>
<propina>0.00</propina>
<importeTotal>112.00</importeTotal>
<moneda>DOLAR</moneda>
</infoFactura>
<detalles>
<detalle>
<codigoPrincipal>001</codigoPrincipal>
<descripcion>PRODUCTO DE PRUEBA</descripcion>
<cantidad>1.000000</cantidad>
<precioUnitario>100.000000</precioUnitario>
<descuento>0.00</descuento>
<precioTotalSinImpuesto>100.00</precioTotalSinImpuesto>
<impuestos>
<impuesto>
<codigo>2</codigo>
<codigoPorcentaje>2</codigoPorcentaje>
<tarifa>12.00</tarifa>
<baseImponible>100.00</baseImponible>
<valor>12.00</valor>
</impuesto>
</impuestos>
</detalle>
</detalles>
</factura>`;

		const certificateFile = req.files.certificate[0];

		// Firmar XML de ejemplo
		const signingResult = await signingService.signXMLFromBuffer(
			certificateFile.buffer,
			password,
			sampleXml
		);

		if (!signingResult.success) {
			return badRequest(res, "Error firmando XML de ejemplo", {
				error: signingResult.error,
				validation: signingResult.validation,
			});
		}

		console.log("✅ Prueba con XML del SRI exitosa");

		const response = {
			success: true,
			sampleXml: sampleXml,
			certificate: {
				filename: certificateFile.originalname,
				size: certificateFile.size,
			},
			result: {
				signedXml: signingResult.signedXml,
				base64Xml: signingResult.base64Xml,
				validation: signingResult.validation,
				info: signingResult.info,
			},
			timestamp: new Date().toISOString(),
		};

		return success(
			res,
			response,
			"XML de ejemplo del SRI firmado exitosamente"
		);
	} catch (error) {
		console.error("❌ Error en prueba con XML del SRI:", error.message);
		return serverError(
			res,
			"Error procesando la prueba con XML del SRI",
			error.message
		);
	}
});

// Middleware de multer para las rutas que lo necesitan
const uploadMiddleware = upload.fields([
	{name: "certificate", maxCount: 1},
	{name: "xml", maxCount: 1},
]);

module.exports = {
	testSigningWithUpload,
	testSigningWithJSON,
	validateCertificateOnly,
	xmlToBase64,
	testWithSRISample,
	uploadMiddleware,
};
