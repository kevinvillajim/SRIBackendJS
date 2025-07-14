const express = require("express");
const router = express.Router();

// Importar controladores
const {
	generateBilling,
	generateCompleteBilling,
	getOperation,
	getUserOperations,
	reenviarSRI,
} = require("../controllers/billingController");

// Importar validaciones
const {
	validateBillingData,
	validateUserIdParam,
	sanitizeBillingData,
	validateOptionalBillingData,
} = require("../middleware/billingValidator");

// 🎯 ENDPOINT PRINCIPAL: Proceso completo de facturación
// POST /api/billing/generate/:userId - Generar factura completa (XML → Firma → SRI)
router.post(
	"/generate/:userId",
	validateUserIdParam,
	sanitizeBillingData,
	validateBillingData,
	validateOptionalBillingData,
	generateCompleteBilling
);

// 📋 ENDPOINT ALTERNATIVO: Solo para compatibilidad
// POST /api/billing/complete/:userId - Alias del endpoint principal
router.post(
	"/complete/:userId",
	validateUserIdParam,
	sanitizeBillingData,
	validateBillingData,
	validateOptionalBillingData,
	generateCompleteBilling
);

// 📄 GET /api/billing/operation/:operationId - Obtener operación específica
router.get("/operation/:operationId", getOperation);

// 🔄 POST /api/billing/operation/:operationId/reenviar - Reenviar al SRI
router.post("/operation/:operationId/reenviar", reenviarSRI);

// 📊 GET /api/billing/user/:userId/operations - Obtener operaciones de usuario
router.get("/user/:userId/operations", validateUserIdParam, getUserOperations);

// 📋 GET /api/billing - Información sobre los endpoints de facturación
router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "API de Facturación Electrónica SRI Ecuador",
		version: "2.0.0",
		proceso: {
			description:
				"Proceso completo: XML → Firma XAdES-BES → Envío SRI → Autorización",
			steps: [
				"1. Recibe datos de facturación en JSON",
				"2. Genera XML de factura usando open-factura",
				"3. Firma XML con certificado digital (XAdES-BES)",
				"4. Envía XML firmado al SRI para recepción (SOAP manual)",
				"5. Solicita autorización al SRI con clave de acceso (SOAP manual)",
				"6. Devuelve resultado completo del proceso",
			],
		},
		improvements: {
			v2: [
				"🔧 Implementación SOAP manual para SRI",
				"📤 Mejor manejo de recepción y autorización",
				"🔍 Validación de clave de acceso",
				"🔄 Endpoint para reenviar al SRI",
				"📊 Estados más específicos (no_recibido_sri, pendiente_autorizacion)",
				"⚠️ Mejor manejo de errores y advertencias",
			],
		},
		endpoints: {
			main: {
				url: "POST /api/billing/generate/:userId",
				description: "Generar factura completa con proceso SRI",
				input: "JSON con datos de facturación",
				output: "Resultado completo del proceso",
			},
			operations: {
				getOne: "GET /api/billing/operation/:operationId",
				getByUser: "GET /api/billing/user/:userId/operations",
				reenviar: "POST /api/billing/operation/:operationId/reenviar",
			},
		},
		sriIntegration: {
			method: "SOAP manual (reemplaza open-factura)",
			endpoints: {
				recepcion: {
					test: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
					prod: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
				},
				autorizacion: {
					test: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
					prod: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
				},
			},
			features: [
				"Validación de clave de acceso (49 dígitos)",
				"Parseo automático de respuestas SOAP",
				"Manejo de errores HTTP y SOAP",
				"Timeout configurable (30 segundos)",
				"Retry automático con espera",
			],
		},
		requirements: {
			user: "Usuario debe existir y tener certificado activo",
			certificate: "Certificado .p12 de Uanataca subido y validado",
			data: "Datos de facturación en formato JSON válido",
		},
		response: {
			success: "Estado del proceso completo",
			factura: "Información de la factura generada",
			sri: "Respuestas del SRI (recepción y autorización)",
			firmado: "Información del proceso de firmado",
			operacion: "Datos de la operación en base de datos",
			documentos: "Lista de documentos generados",
		},
		estadosOperacion: [
			"xml_generado",
			"firmando",
			"firmado",
			"enviando_sri",
			"autorizado",
			"no_recibido_sri",
			"pendiente_autorizacion",
			"error_sri",
			"error",
		],
		exampleUsage: {
			curl: `curl -X POST http://localhost:3000/api/billing/generate/1 \\
  -H "Content-Type: application/json" \\
  -d '{
    "infoFactura": {
      "fechaEmision": "11/07/2025",
      "tipoIdentificacionComprador": "05",
      "razonSocialComprador": "CLIENTE EJEMPLO",
      "identificacionComprador": "1720598877",
      "totalSinImpuestos": "100.00",
      "totalDescuento": "0.00",
      "totalConImpuestos": {
        "totalImpuesto": [{
          "codigo": "2",
          "codigoPorcentaje": "4",
          "baseImponible": "100.00",
          "tarifa": "15.00",
          "valor": "15.00"
        }]
      },
      "importeTotal": "115.00"
    },
    "detalles": {
      "detalle": [{
        "descripcion": "SERVICIO DE PRUEBA",
        "cantidad": "1.000000",
        "precioUnitario": "100.000000",
        "descuento": "0.00",
        "precioTotalSinImpuesto": "100.00",
        "impuestos": {
          "impuesto": [{
            "codigo": "2",
            "codigoPorcentaje": "4",
            "tarifa": "15.00",
            "baseImponible": "100.00",
            "valor": "15.00"
          }]
        }
      }]
    }
  }'`,
			reenviar: `curl -X POST http://localhost:3000/api/billing/operation/6/reenviar`,
		},
		timestamp: new Date().toISOString(),
	});
});

// Middleware para rutas no encontradas
router.use("*", (req, res) => {
	res.status(404).json({
		success: false,
		message: "Ruta de facturación no encontrada",
		path: req.originalUrl,
		availableRoutes: [
			"GET /api/billing",
			"POST /api/billing/generate/:userId",
			"POST /api/billing/complete/:userId",
			"GET /api/billing/operation/:operationId",
			"POST /api/billing/operation/:operationId/reenviar",
			"GET /api/billing/user/:userId/operations",
		],
	});
});

module.exports = router;
