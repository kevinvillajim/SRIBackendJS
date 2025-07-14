const fs = require("fs");
const path = require("path");
const SRIXAdESSigner = require("./SRIXAdESSigner");
const {config} = require("../config/env");

class SRISigningService {
	constructor() {
		this.signer = new SRIXAdESSigner();
	}

	/**
	 * Firma un contenido XML utilizando un buffer de certificado p12 y una contraseña.
	 * Esta función usa la implementación correcta de SRIXAdESSigner.
	 */
	async signXMLFromBuffer(p12Buffer, password, xmlContent) {
		try {
			console.log("📋 Iniciando firmado desde buffer...");

			if (!Buffer.isBuffer(p12Buffer)) {
				throw new Error("El parámetro p12Buffer debe ser un Buffer válido.");
			}
			if (!password) {
				throw new Error("La contraseña del certificado es requerida.");
			}
			if (!xmlContent) {
				throw new Error("El contenido XML es requerido.");
			}

			console.log(
				"✅ Buffer del certificado válido, tamaño:",
				p12Buffer.length,
				"bytes"
			);

			// Usar la implementación correcta de SRIXAdESSigner
			const signedXml = await this.signer.signXML(
				p12Buffer,
				password,
				xmlContent
			);
			const base64Xml = this.signer.xmlToBase64(signedXml);
			const validation = this.signer.validateSignedXML(signedXml);

			console.log("✅ XML firmado y validado exitosamente.");

			return {
				success: true,
				signedXml,
				base64Xml,
				validation,
				info: {
					originalSize: xmlContent.length,
					signedSize: signedXml.length,
					base64Size: base64Xml.length,
					timestamp: require("../config/env").getEcuadorTime(),
				},
			};
		} catch (error) {
			console.error("❌ Error en el proceso de firmado:", error.message);
			console.error("❌ Stack trace:", error.stack);
			return {
				success: false,
				error: `Error de firma: ${error.message}`,
				signedXml: null,
				base64Xml: null,
				validation: {isValid: false, errors: [error.message]},
			};
		}
	}

	/**
	 * Firma un XML desde un archivo de certificado (usa signXMLFromBuffer internamente)
	 */
	async signXMLFromFile(certificatePath, password, xmlContent) {
		try {
			console.log("📋 Iniciando firmado desde archivo:", certificatePath);

			if (!fs.existsSync(certificatePath)) {
				throw new Error(
					`Archivo de certificado no encontrado: ${certificatePath}`
				);
			}

			const p12Buffer = fs.readFileSync(certificatePath);
			console.log("✅ Certificado cargado, tamaño:", p12Buffer.length, "bytes");

			// Usar signXMLFromBuffer para consistencia
			return await this.signXMLFromBuffer(p12Buffer, password, xmlContent);
		} catch (error) {
			console.error("❌ Error en firmado desde archivo:", error.message);
			return {
				success: false,
				error: error.message,
				signedXml: null,
				base64Xml: null,
				validation: {isValid: false, errors: [error.message]},
			};
		}
	}

	/**
	 * Firma un XML para un usuario específico, obteniendo el certificado del archivo.
	 */
	async signXMLForUser(user, xmlContent) {
		try {
			console.log("👤 Iniciando firmado para usuario:", user.ruc);

			if (!user.tiene_certificado || !user.certificado_activo) {
				throw new Error("El usuario no tiene un certificado activo.");
			}
			if (!user.certificado_filename) {
				throw new Error(
					"El usuario no tiene un archivo de certificado asociado."
				);
			}
			if (!user.certificado_password) {
				throw new Error(
					"No se encontró la contraseña del certificado para el usuario."
				);
			}

			const certificatePath = path.join(
				config.paths.certificates,
				user.certificado_filename
			);

			if (!fs.existsSync(certificatePath)) {
				throw new Error(
					`Archivo de certificado no encontrado: ${certificatePath}`
				);
			}

			const p12Buffer = fs.readFileSync(certificatePath);

			// Usar signXMLFromBuffer para consistencia
			return await this.signXMLFromBuffer(
				p12Buffer,
				user.certificado_password,
				xmlContent
			);
		} catch (error) {
			console.error("❌ Error firmando para el usuario:", error.message);
			return {
				success: false,
				error: error.message,
				signedXml: null,
				base64Xml: null,
				validation: {isValid: false, errors: [error.message]},
			};
		}
	}

	/**
	 * Validar certificado con una prueba de firmado
	 */
	async validateCertificate(certificatePath, password) {
		try {
			console.log("🔍 Validando certificado:", certificatePath);

			if (!fs.existsSync(certificatePath)) {
				throw new Error("Archivo de certificado no encontrado");
			}

			const p12Buffer = fs.readFileSync(certificatePath);
			const testXml =
				'<?xml version="1.0" encoding="UTF-8"?><test id="comprobante"><data>test</data></test>';

			const result = await this.signXMLFromBuffer(p12Buffer, password, testXml);

			return {
				isValid: result.success,
				errors: result.success ? [] : [result.error],
				warnings: result.success ? [] : [],
				info: {
					fileSize: p12Buffer.length,
					timestamp: new Date().toISOString(),
					p12Loaded: result.success,
					status: result.success
						? "Certificado cargado correctamente"
						: "Error cargando certificado",
				},
			};
		} catch (error) {
			console.error("❌ Error validando certificado:", error.message);
			return {
				isValid: false,
				errors: [error.message],
				warnings: [],
				info: {},
			};
		}
	}

	/**
	 * Obtener información del certificado
	 */
	async getCertificateInfo(certificatePath, password) {
		try {
			const p12Buffer = fs.readFileSync(certificatePath);
			const {certificateInfo} = await this.signer.extractCertificateData(
				p12Buffer,
				password
			);

			return {
				success: true,
				info: {
					issuerName: certificateInfo.issuerName,
					serialNumber: certificateInfo.serialNumber,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error.message,
			};
		}
	}

	/**
	 * Convierte un string de XML a Base64.
	 */
	xmlToBase64(xmlContent) {
		return this.signer.xmlToBase64(xmlContent);
	}
}

module.exports = SRISigningService;
