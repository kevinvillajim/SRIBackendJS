const fs = require("fs");
const path = require("path");
const SRISigningService = require("../services/SRISigningService");

// Inicializar servicio de firmado para validaciones
const signingService = new SRISigningService();

// Validar archivo de certificado .p12 usando el nuevo servicio
const validateCertificateFile = async (filePath, password) => {
	console.log(
		"🔧 DEBUG: Iniciando validación de certificado con SRISigningService"
	);
	console.log("🔧 DEBUG: Archivo:", filePath);
	console.log("🔧 DEBUG: Password proporcionado:", password ? "SÍ" : "NO");

	const validation = {
		isValid: false,
		errors: [],
		warnings: [],
		info: {},
	};

	try {
		// Verificar que el archivo existe
		console.log("🔧 DEBUG: Verificando existencia del archivo...");
		if (!fs.existsSync(filePath)) {
			validation.errors.push("El archivo de certificado no existe");
			return validation;
		}
		console.log("🔧 DEBUG: Archivo existe");

		// Verificar tamaño del archivo
		console.log("🔧 DEBUG: Verificando tamaño del archivo...");
		const stats = fs.statSync(filePath);
		if (stats.size === 0) {
			validation.errors.push("El archivo está vacío");
			return validation;
		}

		if (stats.size > 5 * 1024 * 1024) {
			// 5MB
			validation.errors.push("El archivo es muy grande (máximo 5MB)");
			return validation;
		}

		validation.info.fileSize = stats.size;
		validation.info.fileName = path.basename(filePath);
		console.log("🔧 DEBUG: Archivo válido, tamaño:", stats.size, "bytes");

		// Usar el servicio de firmado para validar el certificado
		try {
			console.log("🔧 DEBUG: Validando certificado con SRISigningService...");

			const serviceValidation = await signingService.validateCertificate(
				filePath,
				password
			);
			console.log(
				"🔧 DEBUG: Resultado de validación del servicio:",
				serviceValidation
			);

			if (!serviceValidation.isValid) {
				validation.errors = serviceValidation.errors;
				validation.warnings = serviceValidation.warnings;
				return validation;
			}

			// Si la validación es exitosa, obtener información adicional del certificado
			const certInfo = await signingService.getCertificateInfo(
				filePath,
				password
			);
			if (certInfo.success) {
				validation.info.certificateInfo = certInfo.info;
				console.log(
					"🔧 DEBUG: Información del certificado obtenida:",
					certInfo.info
				);
			}

			validation.isValid = true;
			validation.warnings = serviceValidation.warnings;
			validation.info.status =
				"Certificado validado correctamente con SRISigningService";
			validation.info.serviceValidation = serviceValidation.info;

			console.log("🔧 DEBUG: Certificado validado exitosamente");
		} catch (certificateError) {
			console.log(
				"🔧 DEBUG: Error procesando certificado:",
				certificateError.message
			);
			validation.errors.push(
				`Error al procesar el certificado: ${certificateError.message}`
			);

			// Errores comunes de certificados
			if (
				certificateError.message.includes("password") ||
				certificateError.message.includes("Invalid") ||
				certificateError.message.includes("decrypt")
			) {
				validation.errors.push(
					"La contraseña del certificado podría ser incorrecta"
				);
			} else if (
				certificateError.message.includes("format") ||
				certificateError.message.includes("parse")
			) {
				validation.errors.push("El formato del certificado no es válido");
			} else if (
				certificateError.message.includes("UANATACA") ||
				certificateError.message.includes("issuer")
			) {
				validation.warnings.push(
					"El certificado podría no ser de Uanataca (requerido para SRI)"
				);
			}
		}
	} catch (error) {
		console.log(
			"🔧 DEBUG: Error general validando certificado:",
			error.message
		);
		validation.errors.push(`Error validando certificado: ${error.message}`);
	}

	console.log("🔧 DEBUG: Resultado final de validación:", validation);
	return validation;
};

// Validar contraseña del certificado
const validateCertificatePassword = (password) => {
	const validation = {
		isValid: false,
		errors: [],
		warnings: [],
	};

	if (!password) {
		validation.errors.push("La contraseña del certificado es obligatoria");
		return validation;
	}

	if (typeof password !== "string") {
		validation.errors.push("La contraseña debe ser una cadena de texto");
		return validation;
	}

	if (password.length < 4) {
		validation.warnings.push(
			"La contraseña parece muy corta (mínimo recomendado: 4 caracteres)"
		);
	}

	if (password.length > 100) {
		validation.errors.push(
			"La contraseña es muy larga (máximo 100 caracteres)"
		);
		return validation;
	}

	// Verificar caracteres especiales que podrían causar problemas
	if (password.includes('"') || password.includes("'")) {
		validation.warnings.push(
			"La contraseña contiene comillas, asegúrese de que sea correcta"
		);
	}

	validation.isValid = true;
	return validation;
};

// Extraer información básica del certificado (sin validar contraseña)
const getCertificateBasicInfo = (filePath) => {
	try {
		const stats = fs.statSync(filePath);
		return {
			fileName: path.basename(filePath),
			fileSize: stats.size,
			uploadDate: stats.birthtime,
			lastModified: stats.mtime,
			extension: path.extname(filePath).toLowerCase(),
			sizeFormatted: formatFileSize(stats.size),
		};
	} catch (error) {
		return {
			error: `No se pudo obtener información del archivo: ${error.message}`,
		};
	}
};

// Función para validar formato del archivo (sin cargar el contenido)
const validateFileFormat = (filePath) => {
	const validation = {
		isValid: false,
		errors: [],
		warnings: [],
	};

	try {
		// Verificar extensión
		const extension = path.extname(filePath).toLowerCase();
		const allowedExtensions = [".p12", ".pfx"];

		if (!allowedExtensions.includes(extension)) {
			validation.errors.push(
				`Extensión no válida: ${extension}. Se requiere .p12 o .pfx`
			);
			return validation;
		}

		// Verificar que el archivo existe y no está vacío
		if (!fs.existsSync(filePath)) {
			validation.errors.push("El archivo no existe");
			return validation;
		}

		const stats = fs.statSync(filePath);
		if (stats.size === 0) {
			validation.errors.push("El archivo está vacío");
			return validation;
		}

		if (stats.size < 100) {
			validation.warnings.push(
				"El archivo parece muy pequeño para un certificado válido"
			);
		}

		// Leer los primeros bytes para verificar firma del archivo
		try {
			const buffer = fs.readFileSync(filePath, {start: 0, end: 15});

			// Los archivos .p12/.pfx son archivos PKCS#12 que comienzan con secuencias específicas
			if (buffer.length < 16) {
				validation.warnings.push("El archivo parece muy pequeño");
			}

			// Verificación básica de formato PKCS#12
			// Los archivos PKCS#12 típicamente comienzan con 0x30 (SEQUENCE ASN.1)
			if (buffer.length > 0 && buffer[0] !== 0x30) {
				validation.warnings.push(
					"El archivo podría no ser un certificado PKCS#12 válido"
				);
			}
		} catch (readError) {
			validation.warnings.push("No se pudo verificar el contenido del archivo");
		}

		validation.isValid = true;
	} catch (error) {
		validation.errors.push(`Error validando formato: ${error.message}`);
	}

	return validation;
};

// Función auxiliar para formatear tamaño de archivo
const formatFileSize = (bytes) => {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Validar certificado para uso específico con SRI
const validateCertificateForSRI = async (filePath, password) => {
	console.log("🏛️ Validando certificado específicamente para SRI Ecuador");

	const validation = await validateCertificateFile(filePath, password);

	if (!validation.isValid) {
		return validation;
	}

	// Validaciones adicionales específicas para SRI
	try {
		const certInfo = await signingService.getCertificateInfo(
			filePath,
			password
		);

		if (certInfo.success && certInfo.info) {
			const issuerName = certInfo.info.issuerName || "";

			// Verificar que sea certificado de Uanataca
			if (
				!issuerName.includes("UANATACA") &&
				!issuerName.includes("VATES-A66721499")
			) {
				validation.warnings.push(
					"El certificado no parece ser de Uanataca, podría ser rechazado por el SRI"
				);
			}

			// Verificar formato del IssuerName
			if (issuerName.includes("UANATACA")) {
				if (issuerName.includes("2016")) {
					validation.info.certificateType = "Uanataca 2016 (1-3 años)";
				} else if (issuerName.includes("2021")) {
					validation.info.certificateType = "Uanataca 2021 (4-5 años)";
				} else {
					validation.warnings.push(
						"No se pudo determinar el tipo de certificado Uanataca"
					);
				}
			}

			validation.info.sriCompatible = true;
			validation.info.issuerName = issuerName;
		}
	} catch (error) {
		validation.warnings.push(
			`No se pudo verificar compatibilidad con SRI: ${error.message}`
		);
	}

	return validation;
};

module.exports = {
	validateCertificateFile,
	validateCertificatePassword,
	getCertificateBasicInfo,
	validateFileFormat,
	validateCertificateForSRI,
	formatFileSize,
};
