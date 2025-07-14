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
const {config, getEcuadorTime} = require("../config/env");
const axios = require("axios");

// Importar funciones de open-factura
const {
	generateInvoice,
	generateInvoiceXml,
	documentReception,
	documentAuthorization,
} = require("open-factura");
// Inicializar servicio de firmado
const signingService = new SRISigningService();

// 🎯 ENDPOINT PRINCIPAL: Proceso simple de facturación
const generateCompleteBilling = asyncHandler(async (req, res) => {
	const {userId} = req.params;
	const billingData = req.body;

	console.log(
		"🧾 Iniciando proceso SIMPLE de facturación para usuario:",
		userId
	);

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
		// 3️⃣ PREPARAR DATOS PARA GENERAR XML (SIN clave de acceso)
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
				...(user.agente_retencion && {agenteRetencion: user.agente_retencion}),
				...(user.contribuyente_rimpe && {
					contribuyenteRimpe: user.contribuyente_rimpe,
				}),
			},
			infoFactura: {
				fechaEmision: billingData.infoFactura.fechaEmision,
				tipoIdentificacionComprador:
					billingData.infoFactura.tipoIdentificacionComprador,
				razonSocialComprador: billingData.infoFactura.razonSocialComprador,
				identificacionComprador:
					billingData.infoFactura.identificacionComprador,
				totalSinImpuestos: billingData.infoFactura.totalSinImpuestos,
				totalDescuento: billingData.infoFactura.totalDescuento,
				totalConImpuestos: billingData.infoFactura.totalConImpuestos,
				importeTotal: billingData.infoFactura.importeTotal,
				...(billingData.infoFactura.dirEstablecimiento && {
					dirEstablecimiento: billingData.infoFactura.dirEstablecimiento,
				}),
				...(billingData.infoFactura.contribuyenteEspecial && {
					contribuyenteEspecial: billingData.infoFactura.contribuyenteEspecial,
				}),
				...(user.obligado_contabilidad && {
					obligadoContabilidad: user.obligado_contabilidad,
				}),
				...(billingData.infoFactura.direccionComprador && {
					direccionComprador: billingData.infoFactura.direccionComprador,
				}),
				...(billingData.infoFactura.propina && {
					propina: billingData.infoFactura.propina,
				}),
				...(billingData.infoFactura.moneda && {
					moneda: billingData.infoFactura.moneda,
				}),
				...(billingData.infoFactura.pagos && {
					pagos: billingData.infoFactura.pagos,
				}),
			},
			detalles: billingData.detalles,
			...(billingData.reembolsos && {reembolsos: billingData.reembolsos}),
			...(billingData.retenciones && {retenciones: billingData.retenciones}),
			...(billingData.infoAdicional && {
				infoAdicional: billingData.infoAdicional,
			}),
		};

		console.log("📄 Generando XML con generador propio...");

		const {createInvoice} = require("../utils/sriXmlGenerator");

		const {xml, claveAcceso: accessKey} = createInvoice({
			infoTributaria: {
				ambiente: user.ambiente,
				tipoEmision: "1",
				razonSocial: user.razon_social,
				nombreComercial: user.nombre_comercial || user.razon_social,
				ruc: user.ruc,
				estab: user.establecimiento,
				ptoEmi: user.punto_emision,
				secuencial: generateSequential(billingData.secuencial),
				dirMatriz: user.direccion_matriz,
			},
			infoFactura: billingData.infoFactura, // Fecha mantiene formato DD/MM/YYYY
			detalles: billingData.detalles,
		});

		let invoiceXml = xml;

		// 1. Eliminar NaN (si aparece)
		invoiceXml = invoiceXml.replace(/NaN/g, "");

		// 2. Agregar namespace OBLIGATORIO para SRI
		invoiceXml = invoiceXml.replace(
			'<factura id="comprobante" version="1.1.0">',
			'<factura xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="comprobante" version="1.1.0">'
		);

		console.log("✅ Namespace agregado para SRI");

		// 🔧 DEBUG: Mostrar XML generado
		console.log("🔍 XML GENERADO:");
		console.log("=".repeat(50)); // ✅ Arreglar esto también
		console.log(invoiceXml);
		console.log("=".repeat(50));

		operation = await Operation.create({
			usuario_id: userId,
			clave_acceso: accessKey, // Clave temporal
			numero_secuencial: invoiceInput.infoTributaria.secuencial,
			fecha_emision: parseDate(billingData.infoFactura.fechaEmision),
			total_factura: parseFloat(billingData.infoFactura.importeTotal),
			estado: "xml_generado",
		});

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

		const signingResult = await signingService.signXMLForUser(user, invoiceXml);

		if (!signingResult.success) {
			throw new Error(`Error en firmado: ${signingResult.error}`);
		}

		console.log("✅ XML firmado exitosamente");
		await Operation.updateStatus(operation.id, "firmado");

		// Guardar XML firmado
		await Document.create({
			operacion_id: operation.id,
			tipo_documento: "firmado",
			contenido_xml: signingResult.signedXml,
			nombre_archivo: `factura_${accessKey}_firmado.xml`,
			clave_acceso: accessKey,
		});

		// 6️⃣ ENVIAR AL SRI usando open-factura (NO eliminar clave de acceso)
		console.log("📤 Enviando al SRI usando open-factura nativo...");
		await Operation.updateStatus(operation.id, "enviando_recepcion");

		let receptionResult = null;
		let authorizationResult = null;
		let estadoFinal = "firmado";

		try {
			// Usar endpoints correctos según ambiente
			const receptionUrl =
				user.ambiente === "1"
					? "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl"
					: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl";

			const authorizationUrl =
				user.ambiente === "1"
					? "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl"
					: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl";

			// RECEPCIÓN usando open-factura
			console.log("🚀 Paso 1: Enviando a recepción SRI con open-factura...");
			receptionResult = await documentReception(
				signingResult.base64Xml,
				receptionUrl
			);
			console.log("✅ Recepción SRI exitosa:", receptionResult);

			await Operation.updateReceptionResponse(operation.id, {
				success: true,
				status: 200,
				data: JSON.stringify(receptionResult),
				claveAcceso: accessKey,
				estado: receptionResult.estado || "RECIBIDA",
			});

			const estado =
				receptionResult?.RespuestaRecepcionComprobante?.estado || "NO_RECIBIDA";
			console.log("🔍 Estado real:", estado);
			if (estado === "RECIBIDA") {
				await Operation.updateStatus(operation.id, "recibido_sri");

				// Esperar antes de consultar autorización
				console.log("⏳ Esperando 5 segundos...");
				await new Promise((resolve) => setTimeout(resolve, 5000));

				// AUTORIZACIÓN usando open-factura
				console.log("🚀 Paso 2: Consultando autorización con open-factura...");
				authorizationResult = await documentAuthorization(
					accessKey,
					authorizationUrl
				);
				console.log("✅ Consulta autorización exitosa:", authorizationResult);

				// Determinar estado final
				if (authorizationResult && authorizationResult.numeroAutorizacion) {
					estadoFinal = "autorizado";
					console.log(
						"🎉 FACTURA AUTORIZADA! Número:",
						authorizationResult.numeroAutorizacion
					);
				} else if (
					authorizationResult &&
					authorizationResult.estado === "AUTORIZADO"
				) {
					estadoFinal = "autorizado";
					console.log("🎉 FACTURA AUTORIZADA!");
				} else {
					estadoFinal = "pendiente_autorizacion";
					console.log("⏳ Pendiente de autorización");
				}

				await Operation.updateAuthorizationResponse(
					operation.id,
					{
						success: true,
						numeroComprobantes: 1,
						numeroAutorizacion: authorizationResult?.numeroAutorizacion || null,
						autorizado: estadoFinal === "autorizado",
						estado: authorizationResult?.estado || null,
						rawResponse: JSON.stringify(authorizationResult),
					},
					authorizationResult?.numeroAutorizacion || null
				);
			} else {
				estadoFinal = "devuelta_sri";
				console.log("⚠️ Factura devuelta por SRI:", receptionResult.estado);
			}
		} catch (sriError) {
			console.error("❌ Error en SRI con open-factura:", sriError.message);
			await Operation.updateStatus(
				operation.id,
				"error_sri",
				`Error SRI: ${sriError.message}`
			);
			estadoFinal = "error_sri";
		}

		// 7️⃣ ACTUALIZAR ESTADO FINAL Y PREPARAR RESPUESTA
		await Operation.updateStatus(operation.id, estadoFinal);

		const finalOperation = await Operation.findById(operation.id);
		const documents = await Document.findByOperationId(operation.id);

		console.log(`🏁 Proceso completado. Estado final: ${estadoFinal}`);

		const response = {
			success: true,
			proceso: {
				estado: estadoFinal,
				completado: true,
				timestamp: getEcuadorTime(),
			},
			factura: {
				claveAcceso: accessKey,
				numeroAutorizacion: authorizationResult?.numeroAutorizacion || null,
				secuencial: invoiceInput.infoTributaria.secuencial,
				fechaEmision: billingData.infoFactura.fechaEmision,
				total: billingData.infoFactura.importeTotal,
				cliente: billingData.infoFactura.razonSocialComprador,
			},
			sri: {
				recepcion: receptionResult,
				autorizacion: authorizationResult,
				autorizado: estadoFinal === "autorizado",
				numeroAutorizacion: authorizationResult?.numeroAutorizacion || null,
			},
			firmado: {
				exitoso: signingResult.success,
				validacion: signingResult.validation,
				info: signingResult.info,
			},
			operacion: finalOperation.toJSON(),
			documentos: documents.map((doc) => doc.toPublicJSON()),
		};

		// Mensaje según estado
		let message = "";
		let httpStatus = 201;

		switch (estadoFinal) {
			case "autorizado":
				message =
					"🎉 Factura generada, firmada y AUTORIZADA por el SRI exitosamente";
				break;
			case "devuelta_sri":
				message = "⚠️ Factura devuelta por el SRI - revisar datos";
				httpStatus = 200;
				break;
			case "pendiente_autorizacion":
				message = "⏳ Factura enviada al SRI, pendiente de autorización";
				httpStatus = 200;
				break;
			case "error_sri":
				message =
					"⚠️ Factura generada y firmada, pero error comunicándose con el SRI";
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
			timestamp: getEcuadorTime(),
		});
	} catch (error) {
		console.error("❌ Error en proceso de facturación:", error.message);
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

// Función para reenviar al SRI
const reenviarSRI = asyncHandler(async (req, res) => {
	const {operationId} = req.params;

	const operation = await Operation.findById(operationId);
	if (!operation) {
		return notFound(res, "Operación no encontrada");
	}

	const documents = await Document.findByOperationId(operationId);
	const firmadoDoc = documents.find((doc) => doc.tipo_documento === "firmado");

	if (!firmadoDoc) {
		return badRequest(res, "No se encontró documento firmado para reenviar");
	}

	try {
		// Convertir XML firmado a base64
		const base64Xml = Buffer.from(firmadoDoc.contenido_xml, "utf8").toString(
			"base64"
		);

		// Obtener usuario para ambiente
		const user = await User.findById(operation.usuario_id);

		// Reenviar al SRI
		const receptionResult = await enviarRecepcionSRI(base64Xml, user.ambiente);

		if (receptionResult.claveAcceso) {
			// Consultar autorización
			await new Promise((resolve) => setTimeout(resolve, 3000));
			const authResult = await consultarAutorizacionSRI(
				receptionResult.claveAcceso,
				user.ambiente
			);

			// Actualizar operación
			await Operation.updateAuthorizationResponse(
				operation.id,
				authResult,
				authResult.numeroAutorizacion
			);

			const estadoFinal = authResult.autorizado
				? "autorizado"
				: "pendiente_autorizacion";
			await Operation.updateStatus(operation.id, estadoFinal);

			return success(
				res,
				{
					recepcion: receptionResult,
					autorizacion: authResult,
					estado: estadoFinal,
				},
				"Documento reenviado al SRI exitosamente"
			);
		} else {
			throw new Error("No se obtuvo clave de acceso del SRI");
		}
	} catch (error) {
		console.error("❌ Error reenviando al SRI:", error.message);
		return serverError(res, "Error reenviando al SRI", error.message);
	}
});

// Mantener compatibilidad
const generateBilling = generateCompleteBilling;

module.exports = {
	generateBilling,
	generateCompleteBilling,
	getOperation,
	getUserOperations,
	reenviarSRI,
};
