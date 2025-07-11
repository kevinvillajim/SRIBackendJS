const User = require("../models/User");
const Operation = require("../models/Operation");
const Document = require("../models/Document");
const {asyncHandler} = require("../middleware/errorHandler");
const {
	success,
	created,
	notFound,
	badRequest,
	serverError,
} = require("../utils/responses");
const {decryptCertificatePassword} = require("../utils/encryption");
const {certificateFileExists} = require("../middleware/upload");
const SRISigningService = require("../services/SRISigningService");
const {config} = require("../config/env");

// Importar funciones de open-factura para generación de XML y comunicación con SRI
const {
	generateInvoice,
	generateInvoiceXml,
	documentReception,
	documentAuthorization,
} = require("open-factura");

// Inicializar servicio de firmado
const signingService = new SRISigningService();

// 🎯 ENDPOINT PRINCIPAL: Generar factura completa con todo el proceso SRI
const generateCompleteBilling = asyncHandler(async (req, res) => {
	const {userId} = req.params;
	const billingData = req.body;

	console.log(
		"🧾 Iniciando proceso COMPLETO de facturación para usuario:",
		userId
	);
	console.log("📝 Datos recibidos:", JSON.stringify(billingData, null, 2));

	// 1️⃣ VERIFICAR USUARIO
	const user = await User.findById(userId);
	if (!user) {
		return notFound(res, "Usuario no encontrado");
	}

	// 2️⃣ VERIFICAR CERTIFICADO
	if (
		!user.tiene_certificado ||
		!user.certificado_activo ||
		!user.certificado_filename
	) {
		return badRequest(res, "El usuario no tiene un certificado activo");
	}

	if (!certificateFileExists(user.certificado_filename)) {
		await User.toggleCertificate(userId, false);
		return badRequest(res, "Archivo de certificado no encontrado");
	}

	let operation = null;

	try {
		// 3️⃣ PREPARAR DATOS PARA GENERAR XML
		const invoiceInput = {
			infoTributaria: {
				ambiente: user.ambiente,
				tipoEmision: "1",
				razonSocial: user.razon_social,
				nombreComercial: user.nombre_comercial || user.razon_social,
				ruc: user.ruc,
				codDoc: "01",
				estab: user.establecimiento,
				ptoEmi: user.punto_emision,
				secuencial: generateSequential(billingData.secuencial),
				dirMatriz: user.direccion_matriz,
				obligadoContabilidad: user.obligado_contabilidad,
				contribuyenteEspecial: user.contribuyente_especial,
				agenteRetencion: user.agente_retencion,
				contribuyenteRimpe: user.contribuyente_rimpe,
			},
			infoFactura: billingData.infoFactura,
			detalles: billingData.detalles,
			reembolsos: billingData.reembolsos,
			retenciones: billingData.retenciones,
			infoSustitutivaGuiaRemision: billingData.infoSustitutivaGuiaRemision,
			otrosRubrosTerceros: billingData.otrosRubrosTerceros,
			tipoNegociable: billingData.tipoNegociable,
			maquinaFiscal: billingData.maquinaFiscal,
			infoAdicional: billingData.infoAdicional,
		};

		// 4️⃣ GENERAR FACTURA Y XML
		console.log("📄 Generando factura...");
		const {invoice, accessKey} = generateInvoice(invoiceInput);
		console.log("✅ Factura generada. Clave de acceso:", accessKey);

		// Verificar operación duplicada
		const existingOperation = await Operation.findByAccessKey(accessKey);
		if (existingOperation) {
			return badRequest(
				res,
				"Ya existe una operación con esta clave de acceso",
				{
					accessKey,
					existingOperationId: existingOperation.id,
				}
			);
		}

		// Crear operación en base de datos
		operation = await Operation.create({
			usuario_id: userId,
			clave_acceso: accessKey,
			numero_secuencial: invoiceInput.infoTributaria.secuencial,
			fecha_emision: parseDate(billingData.infoFactura.fechaEmision),
			total_factura: parseFloat(billingData.infoFactura.importeTotal),
			estado: "xml_generado",
		});

		// Generar XML
		console.log("🔨 Generando XML...");
		const invoiceXml = generateInvoiceXml(invoice);
		console.log("✅ XML generado, tamaño:", invoiceXml.length, "caracteres");

		// Guardar XML original
		await Document.create({
			operacion_id: operation.id,
			tipo_documento: "original",
			contenido_xml: invoiceXml,
			nombre_archivo: `factura_${accessKey}_original.xml`,
			clave_acceso: accessKey,
		});

		// 5️⃣ FIRMAR XML
		console.log("🔐 Firmando XML...");
		await Operation.updateStatus(operation.id, "firmando");

		const certificatePassword = decryptCertificatePassword(
			user.certificado_password
		);
		const signingResult = await signingService.signXMLForUser(user, invoiceXml);

		if (!signingResult.success) {
			throw new Error(`Error en firmado: ${signingResult.error}`);
		}

		console.log("✅ XML firmado exitosamente");
		console.log("📊 Info de firmado:", signingResult.info);

		// Validar firma
		if (!signingResult.validation.isValid) {
			console.warn(
				"⚠️ Advertencias en validación de firma:",
				signingResult.validation.warnings
			);
			if (signingResult.validation.errors.length > 0) {
				throw new Error(
					`Errores en validación de firma: ${signingResult.validation.errors.join(
						", "
					)}`
				);
			}
		}

		await Operation.updateStatus(operation.id, "firmado");

		// Guardar XML firmado
		await Document.create({
			operacion_id: operation.id,
			tipo_documento: "firmado",
			contenido_xml: signingResult.signedXml,
			nombre_archivo: `factura_${accessKey}_firmado.xml`,
			clave_acceso: accessKey,
		});

		// 6️⃣ ENVIAR AL SRI - RECEPCIÓN
		console.log("📤 Enviando al SRI para RECEPCIÓN...");
		await Operation.updateStatus(operation.id, "enviando_recepcion");

		let receptionResult = null;
		let authorizationResult = null;
		let numeroAutorizacion = null;
		let estadoFinal = "firmado";

		try {
			const receptionUrl =
				user.ambiente === "1"
					? config.sri.reception.test
					: config.sri.reception.prod;

			console.log("🌐 URL de recepción:", receptionUrl);
			console.log(
				"📦 Enviando XML en Base64, tamaño:",
				signingResult.base64Xml.length,
				"caracteres"
			);

			receptionResult = await documentReception(
				signingResult.base64Xml,
				receptionUrl
			);
			console.log(
				"✅ Respuesta de RECEPCIÓN SRI:",
				JSON.stringify(receptionResult, null, 2)
			);

			await Operation.updateReceptionResponse(operation.id, receptionResult);
			await Operation.updateStatus(operation.id, "recibido_sri");

			// 7️⃣ ENVIAR AL SRI - AUTORIZACIÓN
			console.log("📋 Solicitando AUTORIZACIÓN al SRI...");
			await Operation.updateStatus(operation.id, "solicitando_autorizacion");

			const authorizationUrl =
				user.ambiente === "1"
					? config.sri.authorization.test
					: config.sri.authorization.prod;

			console.log("🌐 URL de autorización:", authorizationUrl);
			console.log("🔑 Clave de acceso para autorización:", accessKey);

			authorizationResult = await documentAuthorization(
				accessKey,
				authorizationUrl
			);
			console.log(
				"✅ Respuesta de AUTORIZACIÓN SRI:",
				JSON.stringify(authorizationResult, null, 2)
			);

			// 8️⃣ PROCESAR RESPUESTA DE AUTORIZACIÓN
			if (
				authorizationResult &&
				authorizationResult.RespuestaAutorizacionComprobante
			) {
				const autorizaciones =
					authorizationResult.RespuestaAutorizacionComprobante.autorizaciones;
				if (autorizaciones && autorizaciones.autorizacion) {
					const autorizacion = Array.isArray(autorizaciones.autorizacion)
						? autorizaciones.autorizacion[0]
						: autorizaciones.autorizacion;

					console.log("📄 Estado de autorización:", autorizacion.estado);

					if (autorizacion.estado === "AUTORIZADO") {
						numeroAutorizacion = autorizacion.numeroAutorizacion;
						estadoFinal = "autorizado";
						console.log("🎉 FACTURA AUTORIZADA! Número:", numeroAutorizacion);
					} else {
						estadoFinal = "rechazado";
						console.log("❌ Factura RECHAZADA por el SRI");
					}
				}
			}

			await Operation.updateAuthorizationResponse(
				operation.id,
				authorizationResult,
				numeroAutorizacion
			);
		} catch (sriError) {
			console.error("❌ Error comunicándose con el SRI:", sriError.message);
			await Operation.updateStatus(
				operation.id,
				"error_sri",
				`Error SRI: ${sriError.message}`
			);

			// No fallar completamente si hay error del SRI, pero notificar
			estadoFinal = "firmado_error_sri";
		}

		// 9️⃣ ACTUALIZAR ESTADO FINAL Y PREPARAR RESPUESTA
		await Operation.updateStatus(operation.id, estadoFinal);

		const finalOperation = await Operation.findById(operation.id);
		const documents = await Document.findByOperationId(operation.id);

		console.log(`🏁 Proceso completado. Estado final: ${estadoFinal}`);

		// 🎯 RESPUESTA COMPLETA
		const response = {
			success: true,
			proceso: {
				estado: estadoFinal,
				completado: true,
				timestamp: new Date().toISOString(),
			},
			factura: {
				claveAcceso: accessKey,
				numeroAutorizacion: numeroAutorizacion,
				secuencial: invoiceInput.infoTributaria.secuencial,
				fechaEmision: billingData.infoFactura.fechaEmision,
				total: billingData.infoFactura.importeTotal,
				cliente: billingData.infoFactura.razonSocialComprador,
			},
			sri: {
				recepcion: receptionResult,
				autorizacion: authorizationResult,
				autorizado: estadoFinal === "autorizado",
				numeroAutorizacion: numeroAutorizacion,
			},
			firmado: {
				exitoso: signingResult.success,
				validacion: signingResult.validation,
				info: signingResult.info,
			},
			operacion: finalOperation.toJSON(),
			documentos: documents.map((doc) => doc.toPublicJSON()),
		};

		// Determinar mensaje de respuesta
		let message = "";
		let httpStatus = 201;

		switch (estadoFinal) {
			case "autorizado":
				message =
					"🎉 Factura generada, firmada y AUTORIZADA por el SRI exitosamente";
				break;
			case "rechazado":
				message = "⚠️ Factura generada y firmada, pero RECHAZADA por el SRI";
				httpStatus = 200;
				break;
			case "firmado_error_sri":
				message =
					"⚠️ Factura generada y firmada exitosamente, pero error comunicándose con el SRI";
				response.advertencias = ["Error de comunicación con el SRI"];
				httpStatus = 200;
				break;
			default:
				message = "✅ Factura generada y firmada exitosamente";
				break;
		}

		return res.status(httpStatus).json({
			success: true,
			message,
			data: response,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("❌ Error general en proceso de facturación:", error.message);
		console.error("❌ Stack:", error.stack);

		if (operation) {
			await Operation.updateStatus(operation.id, "error", error.message);
		}

		return serverError(res, "Error procesando la factura", {
			error: error.message,
			step: operation ? operation.estado : "inicial",
			accessKey: operation ? operation.clave_acceso : null,
		});
	}
});

// 📋 ENDPOINT: Obtener operación por ID
const getOperation = asyncHandler(async (req, res) => {
	const {operationId} = req.params;

	const operation = await Operation.findById(operationId);
	if (!operation) {
		return notFound(res, "Operación no encontrada");
	}

	const documents = await Document.findByOperationId(operationId);

	const response = {
		operation: operation.toJSON(),
		documents: documents.map((doc) => doc.toPublicJSON()),
	};

	return success(res, response, "Operación obtenida exitosamente");
});

// 📋 ENDPOINT: Obtener operaciones de un usuario
const getUserOperations = asyncHandler(async (req, res) => {
	const {userId} = req.params;
	const page = parseInt(req.query.page) || 1;
	const limit = parseInt(req.query.limit) || 10;
	const offset = (page - 1) * limit;

	if (limit > 100) {
		return badRequest(res, "El límite máximo es 100 operaciones por página");
	}

	const user = await User.findById(userId);
	if (!user) {
		return notFound(res, "Usuario no encontrado");
	}

	const operations = await Operation.findByUserId(userId, limit, offset);
	const stats = await Operation.getStatsByUserId(userId);

	const response = {
		operations: operations.map((op) => op.toJSON()),
		stats,
		pagination: {
			page,
			limit,
			total: operations.length,
			hasNext: operations.length === limit,
		},
	};

	return success(res, response, "Operaciones obtenidas exitosamente");
});

// 🔧 FUNCIONES AUXILIARES
const generateSequential = (providedSequential) => {
	if (providedSequential) {
		return String(providedSequential).padStart(9, "0");
	}

	const timestamp = Date.now();
	const sequential = timestamp.toString().slice(-9);
	return sequential.padStart(9, "0");
};

const parseDate = (dateString) => {
	const [day, month, year] = dateString.split("/");
	return `${year}-${month}-${day}`;
};

// Mantener compatibilidad con el endpoint anterior
const generateBilling = generateCompleteBilling;

module.exports = {
	generateBilling,
	generateCompleteBilling,
	getOperation,
	getUserOperations,
};
