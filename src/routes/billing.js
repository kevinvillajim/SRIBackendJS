const express = require("express");
const router = express.Router();

// Importar controladores
const {
	generateBilling,
	generateCompleteBilling,
	getOperation,
	getUserOperations,
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

// 📊 GET /api/billing/user/:userId/operations - Obtener operaciones de usuario
router.get("/user/:userId/operations", validateUserIdParam, getUserOperations);

// 📋 GET /api/billing - Información sobre los endpoints de facturación
router.get("/", (req, res) => {
	res.json({
		success: true,
		message: "API de Facturación Electrónica SRI Ecuador",
		version: "1.0.0",
		proceso: {
			description:
				"Proceso completo: XML → Firma XAdES-BES → Envío SRI → Autorización",
			steps: [
				"1. Recibe datos de facturación en JSON",
				"2. Genera XML de factura usando open-factura",
				"3. Firma XML con certificado digital (XAdES-BES)",
				"4. Envía XML firmado al SRI para recepción",
				"5. Solicita autorización al SRI con clave de acceso",
				"6. Devuelve resultado completo del proceso",
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
			},
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
		exampleUsage: {
			curl: `curl -X POST http://localhost:3000/api/billing/generate/1 \\
  -H "Content-Type: application/json" \\
  -d '{
    "infoFactura": {
      "fechaEmision": "11/07/2025",
      "dirEstablecimiento": "Dirección del establecimiento",
      "obligadoContabilidad": "SI",
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
      "propina": "0.00",
      "importeTotal": "115.00",
      "moneda": "DOLAR",
      "pagos": {
        "pago": [{
          "formaPago": "01",
          "total": "115.00"
        }]
      }
    },
    "detalles": {
      "detalle": [{
        "codigoPrincipal": "SERV001",
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
			"GET /api/billing/user/:userId/operations",
		],
	});
});

module.exports = router;
