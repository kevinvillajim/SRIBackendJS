const fs = require("fs");
const path = require("path");
const SRIXAdESSigner = require("./SRIXAdESSigner");
const {config} = require("../config/env");

class SRISigningService {
	constructor() {
		this.signer = new SRIXAdESSigner();
	}

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

			const signedXml = await this.signer.signXML(
				p12Buffer,
				password,
				xmlContent
			);
			const validation = this.signer.validateSignedXML(signedXml);

			return {
				success: true,
				signedXml,
				validation,
				info: {
					originalSize: xmlContent.length,
					signedSize: signedXml.length,
					timestamp: new Date().toISOString(),
				},
			};
		} catch (error) {
			console.error("❌ Error en firmado desde archivo:", error.message);
			return {
				success: false,
				error: error.message,
				signedXml: null,
				validation: {isValid: false, errors: [error.message]},
			};
		}
	}

	async signXMLFromBuffer(p12Buffer, password, xmlContent) {
		try {
			console.log("📋 Iniciando firmado desde buffer");

			if (!Buffer.isBuffer(p12Buffer)) {
				throw new Error("El parámetro p12Buffer debe ser un Buffer válido");
			}

			if (!password || typeof password !== "string") {
				throw new Error("Contraseña del certificado requerida");
			}

			if (!xmlContent || typeof xmlContent !== "string") {
				throw new Error("Contenido XML requerido");
			}

			console.log(
				"✅ Buffer del certificado válido, tamaño:",
				p12Buffer.length,
				"bytes"
			);

			const signedXml = await this.signer.signXML(
				p12Buffer,
				password,
				xmlContent
			);
			const validation = this.signer.validateSignedXML(signedXml);
			const base64Xml = this.signer.xmlToBase64(signedXml);

			return {
				success: true,
				signedXml,
				base64Xml,
				validation,
				info: {
					originalSize: xmlContent.length,
					signedSize: signedXml.length,
					base64Size: base64Xml.length,
					timestamp: new Date().toISOString(),
				},
			};
		} catch (error) {
			console.error("❌ Error en firmado desde buffer:", error.message);
			return {
				success: false,
				error: error.message,
				signedXml: null,
				base64Xml: null,
				validation: {isValid: false, errors: [error.message]},
			};
		}
	}

	async signXMLForUser(user, xmlContent) {
		try {
			console.log("👤 Iniciando firmado para usuario:", user.ruc);

			if (!user.tiene_certificado || !user.certificado_activo) {
				throw new Error("Usuario no tiene certificado activo");
			}

			if (!user.certificado_filename) {
				throw new Error("Usuario no tiene archivo de certificado");
			}

			const certificatePath = path.join(
				config.paths.certificates,
				user.certificado_filename
			);
			return await this.signXMLFromFile(
				certificatePath,
				user.certificado_password,
				xmlContent
			);
		} catch (error) {
			console.error("❌ Error firmando para usuario:", error.message);
			return {
				success: false,
				error: error.message,
				signedXml: null,
				validation: {isValid: false, errors: [error.message]},
			};
		}
	}

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
				warnings: [],
				info: {
					fileSize: p12Buffer.length,
					timestamp: new Date().toISOString(),
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

	xmlToBase64(xmlContent) {
		return this.signer.xmlToBase64(xmlContent);
	}

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
}

module.exports = SRISigningService;
