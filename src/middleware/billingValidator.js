const {createError} = require("./errorHandler");

// Validar datos básicos de facturación según estructura real del SRI
const validateBillingData = (req, res, next) => {
	const errors = [];
	const {infoFactura, detalles, infoAdicional} = req.body;

	// Validar información de factura (obligatoria)
	if (!infoFactura) {
		errors.push("infoFactura es obligatoria");
	} else {
		// Campos obligatorios según el XML real del SRI
		const requiredFields = [
			"fechaEmision",
			"dirEstablecimiento",
			"obligadoContabilidad",
			"tipoIdentificacionComprador",
			"razonSocialComprador",
			"identificacionComprador",
			// 'direccionComprador', // NO es obligatorio en SRI
			"totalSinImpuestos",
			"totalDescuento",
			"totalConImpuestos",
			"importeTotal",
			"moneda",
			"pagos",
		];

		requiredFields.forEach((field) => {
			if (
				infoFactura[field] === undefined ||
				infoFactura[field] === null ||
				infoFactura[field] === ""
			) {
				errors.push(`infoFactura.${field} es obligatorio`);
			}
		});

		// Validar formato de fecha (DD/MM/YYYY)
		if (
			infoFactura.fechaEmision &&
			!/^\d{2}\/\d{2}\/\d{4}$/.test(infoFactura.fechaEmision)
		) {
			errors.push("infoFactura.fechaEmision debe tener formato DD/MM/YYYY");
		}

		// Validar obligado contabilidad
		if (
			infoFactura.obligadoContabilidad &&
			!["SI", "NO"].includes(infoFactura.obligadoContabilidad)
		) {
			errors.push('infoFactura.obligadoContabilidad debe ser "SI" o "NO"');
		}

		// Validar tipo identificación comprador
		const tiposValidos = ["04", "05", "06", "07", "08"];
		if (
			infoFactura.tipoIdentificacionComprador &&
			!tiposValidos.includes(infoFactura.tipoIdentificacionComprador)
		) {
			errors.push(
				"infoFactura.tipoIdentificacionComprador debe ser válido (04, 05, 06, 07, 08)"
			);
		}

		// Validar montos (deben ser números válidos)
		const camposMonetarios = [
			"totalSinImpuestos",
			"totalDescuento",
			"importeTotal",
		];
		camposMonetarios.forEach((campo) => {
			if (infoFactura[campo] && isNaN(parseFloat(infoFactura[campo]))) {
				errors.push(`infoFactura.${campo} debe ser un número válido`);
			}
		});

		// Validar propina si está presente
		if (
			infoFactura.propina !== undefined &&
			isNaN(parseFloat(infoFactura.propina))
		) {
			errors.push("infoFactura.propina debe ser un número válido");
		}

		// Validar totalConImpuestos
		if (infoFactura.totalConImpuestos) {
			if (
				!infoFactura.totalConImpuestos.totalImpuesto ||
				!Array.isArray(infoFactura.totalConImpuestos.totalImpuesto)
			) {
				errors.push(
					"infoFactura.totalConImpuestos.totalImpuesto debe ser un array"
				);
			} else {
				// Validar cada impuesto
				infoFactura.totalConImpuestos.totalImpuesto.forEach(
					(impuesto, index) => {
						const requiredImpuestoFields = [
							"codigo",
							"codigoPorcentaje",
							"baseImponible",
							"valor",
						];
						requiredImpuestoFields.forEach((field) => {
							if (
								impuesto[field] === undefined ||
								impuesto[field] === null ||
								impuesto[field] === ""
							) {
								errors.push(
									`infoFactura.totalConImpuestos.totalImpuesto[${index}].${field} es obligatorio`
								);
							}
						});
					}
				);
			}
		}

		// Validar pagos
		if (infoFactura.pagos) {
			if (!infoFactura.pagos.pago || !Array.isArray(infoFactura.pagos.pago)) {
				errors.push("infoFactura.pagos.pago debe ser un array");
			} else {
				// Validar cada pago
				infoFactura.pagos.pago.forEach((pago, index) => {
					if (!pago.formaPago) {
						errors.push(
							`infoFactura.pagos.pago[${index}].formaPago es obligatorio`
						);
					}
					if (!pago.total) {
						errors.push(
							`infoFactura.pagos.pago[${index}].total es obligatorio`
						);
					}
				});
			}
		}
	}

	// Validar detalles (obligatorios)
	if (!detalles) {
		errors.push("detalles es obligatorio");
	} else {
		if (!detalles.detalle || !Array.isArray(detalles.detalle)) {
			errors.push("detalles.detalle debe ser un array");
		} else if (detalles.detalle.length === 0) {
			errors.push("debe incluir al menos un detalle");
		} else {
			// Validar cada detalle
			detalles.detalle.forEach((detalle, index) => {
				const requiredDetailFields = [
					"codigoPrincipal",
					"descripcion",
					"cantidad",
					"precioUnitario",
					"descuento",
					"precioTotalSinImpuesto",
					"impuestos",
				];

				requiredDetailFields.forEach((field) => {
					if (
						detalle[field] === undefined ||
						detalle[field] === null ||
						(typeof detalle[field] === "string" && detalle[field] === "")
					) {
						errors.push(`detalles.detalle[${index}].${field} es obligatorio`);
					}
				});

				// Validar impuestos del detalle
				if (detalle.impuestos) {
					if (
						!detalle.impuestos.impuesto ||
						!Array.isArray(detalle.impuestos.impuesto)
					) {
						errors.push(
							`detalles.detalle[${index}].impuestos.impuesto debe ser un array`
						);
					} else {
						// Validar cada impuesto del detalle
						detalle.impuestos.impuesto.forEach((impuesto, impIndex) => {
							const requiredImpuestoFields = [
								"codigo",
								"codigoPorcentaje",
								"tarifa",
								"baseImponible",
								"valor",
							];
							requiredImpuestoFields.forEach((field) => {
								if (
									impuesto[field] === undefined ||
									impuesto[field] === null ||
									impuesto[field] === ""
								) {
									errors.push(
										`detalles.detalle[${index}].impuestos.impuesto[${impIndex}].${field} es obligatorio`
									);
								}
							});
						});
					}
				}
			});
		}
	}

	if (errors.length > 0) {
		return next(
			createError("Errores de validación en datos de facturación", 400, errors)
		);
	}

	next();
};

// Validar ID de usuario
const validateUserIdParam = (req, res, next) => {
	const {userId} = req.params;

	if (!userId || !/^\d+$/.test(userId)) {
		return next(createError("ID de usuario inválido", 400));
	}

	req.params.userId = parseInt(userId);
	next();
};

// Sanitizar datos de facturación
const sanitizeBillingData = (req, res, next) => {
	// Sanitizar strings en infoFactura
	if (req.body.infoFactura) {
		const stringFields = ["razonSocialComprador", "dirEstablecimiento"];

		// Solo sanitizar direccionComprador si existe (no es obligatorio)
		if (req.body.infoFactura.direccionComprador) {
			stringFields.push("direccionComprador");
		}

		stringFields.forEach((field) => {
			if (req.body.infoFactura[field]) {
				req.body.infoFactura[field] = req.body.infoFactura[field]
					.toString()
					.trim();
			}
		});

		// Convertir montos a string con formato correcto
		const moneyFields = ["totalSinImpuestos", "totalDescuento", "importeTotal"];

		// Agregar propina si existe
		if (req.body.infoFactura.propina !== undefined) {
			moneyFields.push("propina");
		}

		moneyFields.forEach((field) => {
			if (req.body.infoFactura[field] !== undefined) {
				const value = parseFloat(req.body.infoFactura[field]);
				req.body.infoFactura[field] = value.toFixed(2);
			}
		});

		// Asegurar que propina tenga valor por defecto
		if (req.body.infoFactura.propina === undefined) {
			req.body.infoFactura.propina = "0.00";
		}
	}

	// Sanitizar detalles
	if (req.body.detalles && req.body.detalles.detalle) {
		req.body.detalles.detalle.forEach((detalle) => {
			if (detalle.descripcion) {
				detalle.descripcion = detalle.descripcion.toString().trim();
			}

			// Formatear montos
			const moneyFields = [
				"cantidad",
				"precioUnitario",
				"descuento",
				"precioTotalSinImpuesto",
			];
			moneyFields.forEach((field) => {
				if (detalle[field] !== undefined) {
					const value = parseFloat(detalle[field]);
					if (field === "cantidad") {
						detalle[field] = value.toFixed(6); // Cantidad con 6 decimales
					} else {
						detalle[field] = value.toFixed(2); // Precios con 2 decimales
					}
				}
			});
		});
	}

	next();
};

// Validar datos opcionales
const validateOptionalBillingData = (req, res, next) => {
	const warnings = [];

	// Validar reembolsos si están presentes
	if (req.body.reembolsos) {
		if (
			!req.body.reembolsos.reembolsoDetalle ||
			!Array.isArray(req.body.reembolsos.reembolsoDetalle)
		) {
			warnings.push(
				"reembolsos.reembolsoDetalle debe ser un array si se incluye"
			);
		}
	}

	// Validar retenciones si están presentes
	if (req.body.retenciones) {
		if (
			!req.body.retenciones.retencion ||
			!Array.isArray(req.body.retenciones.retencion)
		) {
			warnings.push("retenciones.retencion debe ser un array si se incluye");
		}
	}

	// Validar infoAdicional si está presente
	if (req.body.infoAdicional) {
		if (
			req.body.infoAdicional.campoAdicional &&
			!Array.isArray(req.body.infoAdicional.campoAdicional)
		) {
			warnings.push(
				"infoAdicional.campoAdicional debe ser un array si se incluye"
			);
		}
	}

	// Adjuntar warnings al request para uso posterior
	req.billingWarnings = warnings;

	next();
};

module.exports = {
	validateBillingData,
	validateUserIdParam,
	sanitizeBillingData,
	validateOptionalBillingData,
};
