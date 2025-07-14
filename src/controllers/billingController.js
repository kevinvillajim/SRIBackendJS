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
const axios = require("axios");

// Importar funciones de open-factura solo para generación de XML
const {generateInvoice, generateInvoiceXml} = require("open-factura");

// Inicializar servicio de firmado
const signingService = new SRISigningService();

// 🔧 SOAP MANUAL PARA SRI (reemplaza open-factura bugueada)
async function enviarAlSRI(xmlBase64, ambiente = "1") {
	const endpoint =
		ambiente === "1"
			? "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline"
			: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline";

	const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${xmlBase64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

	try {
		const response = await axios.post(endpoint, soap, {
			headers: {
				"Content-Type": "text/xml; charset=utf-8",
				SOAPAction: "",
			},
			timeout: 30000,
		});

		return {
			success: true,
			status: response.status,
			data: response.data,
		};
	} catch (error) {
		throw new Error(`Error SRI Recepción: ${error.message}`);
	}
}

async function consultarAutorizacion(claveAcceso, ambiente = "1") {
	const endpoint =
		ambiente === "1"
			? "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline"
			: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline";

	const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

	try {
		const response = await axios.post(endpoint, soap, {
			headers: {
				"Content-Type": "text/xml; charset=utf-8",
				SOAPAction: "",
			},
			timeout: 30000,
		});

		// Parseo simple de la respuesta
		const data = response.data;

		// Buscar numeroComprobantes
		const numeroComprobantesMatch = data.match(
			/<numeroComprobantes>(\d+)<\/numeroComprobantes>/
		);
		const numeroComprobantes = numeroComprobantesMatch
			? parseInt(numeroComprobantesMatch[1])
			: 0;

		// Buscar número de autorización
		const autorizacionMatch = data.match(
			/<numeroAutorizacion>([^<]+)<\/numeroAutorizacion>/
		);
		const numeroAutorizacion = autorizacionMatch ? autorizacionMatch[1] : null;

		// Buscar estado
		const estadoMatch = data.match(/<estado>([^<]+)<\/estado>/);
		const estado = estadoMatch ? estadoMatch[1] : null;

		return {
			success: true,
			numeroComprobantes,
			numeroAutorizacion,
			autorizado: estado === "AUTORIZADO",
			estado,
			rawResponse: data,
		};
	} catch (error) {
		throw new Error(`Error SRI Autorización: ${error.message}`);
	}
}

// 🎯 ENDPOINT PRINCIPAL: Generar factura completa con todo el proceso SRI
const generateCompleteBilling = asyncHandler(async (req, res) => {
	const {userId} = req.params;
	const billingData = req.body;

	console.log(
		"🧾 Iniciando proceso COMPLETO de facturación para usuario:",
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

		// 6️⃣ ENVIAR AL SRI usando SOAP manual
		console.log("📤 Enviando al SRI usando SOAP manual...");
		await Operation.updateStatus(operation.id, "enviando_recepcion");

		let receptionResult = null;
		let authorizationResult = null;
		let numeroAutorizacion = null;
		let estadoFinal = "firmado";

		try {
			// RECEPCIÓN
			console.log("🚀 Paso 1: Enviando a recepción SRI...");
			receptionResult = await enviarAlSRI(
				signingResult.base64Xml,
				user.ambiente
			);
			console.log("✅ Recepción SRI exitosa");

			await Operation.updateReceptionResponse(operation.id, receptionResult);
			await Operation.updateStatus(operation.id, "recibido_sri");

			// Esperar antes de consultar autorización
			console.log("⏳ Esperando 3 segundos...");
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// AUTORIZACIÓN
			console.log("🚀 Paso 2: Consultando autorización SRI...");
			authorizationResult = await consultarAutorizacion(
				accessKey,
				user.ambiente
			);
			console.log("✅ Consulta autorización exitosa");
			console.log("📊 Resultado:", authorizationResult);

			if (
				authorizationResult.autorizado &&
				authorizationResult.numeroAutorizacion
			) {
				estadoFinal = "autorizado";
				numeroAutorizacion = authorizationResult.numeroAutorizacion;
				console.log("🎉 FACTURA AUTORIZADA! Número:", numeroAutorizacion);
			} else if (authorizationResult.numeroComprobantes === 0) {
				estadoFinal = "no_recibido_sri";
				console.log("⚠️ El SRI no recibió el comprobante");
			} else {
				estadoFinal = "pendiente_autorizacion";
				console.log("⏳ Pendiente de autorización");
			}

			await Operation.updateAuthorizationResponse(
				operation.id,
				authorizationResult,
				numeroAutorizacion
			);
		} catch (sriError) {
			console.error("❌ Error en SRI:", sriError.message);
			await Operation.updateStatus(
				operation.id,
				"error_sri",
				`Error SRI: ${sriError.message}`
			);
			estadoFinal = "error_sri";
		}

		// 9️⃣ ACTUALIZAR ESTADO FINAL Y PREPARAR RESPUESTA
		await Operation.updateStatus(operation.id, estadoFinal);

		const finalOperation = await Operation.findById(operation.id);
		const documents = await Document.findByOperationId(operation.id);

		console.log(`🏁 Proceso completado. Estado final: ${estadoFinal}`);

		// RESPUESTA
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

		// Mensaje según estado
		let message = "";
		let httpStatus = 201;

		switch (estadoFinal) {
			case "autorizado":
				message =
					"🎉 Factura generada, firmada y AUTORIZADA por el SRI exitosamente";
				break;
			case "no_recibido_sri":
				message = "⚠️ Factura generada y firmada, pero NO RECIBIDA por el SRI";
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

// Mantener compatibilidad
const generateBilling = generateCompleteBilling;

module.exports = {
	generateBilling,
	generateCompleteBilling,
	getOperation,
	getUserOperations,
};
