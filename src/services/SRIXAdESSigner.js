const forge = require("node-forge");
const crypto = require("crypto");
const fs = require("fs");

/**
 * Firmador XAdES-BES para SRI Ecuador
 * Cumple con los estándares específicos de Uanataca y SRI
 */
class SRIXAdESSigner {
	constructor() {
		this.xmlns =
			'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"';
	}

	/**
	 * Firmar XML con certificado .p12
	 * @param {Buffer} p12Buffer - Buffer del archivo .p12
	 * @param {string} password - Contraseña del certificado
	 * @param {string} xmlContent - Contenido XML a firmar
	 * @returns {Promise<string>} XML firmado
	 */
	async signXML(p12Buffer, password, xmlContent) {
		try {
			console.log("🔐 Iniciando proceso de firmado XAdES-BES");

			// Limpiar XML (sin indentación)
			const cleanXml = this.cleanXML(xmlContent);

			// Extraer certificado y clave privada del .p12
			const {certificate, privateKey, certificateInfo} =
				await this.extractCertificateData(p12Buffer, password);

			// Generar números aleatorios para IDs únicos
			const randomIds = this.generateRandomIds();

			// Construir elementos de la firma
			const signedProperties = this.buildSignedProperties(
				certificateInfo,
				randomIds
			);
			const keyInfo = this.buildKeyInfo(
				certificate,
				certificateInfo.modulus,
				certificateInfo.exponent,
				randomIds
			);

			// Calcular hashes
			const xmlHash = this.calculateSHA1Hash(cleanXml);
			const signedPropertiesHash = this.calculateSHA1Hash(
				signedProperties.withNamespace
			);
			const keyInfoHash = this.calculateSHA1Hash(keyInfo.withNamespace);

			// Construir SignedInfo
			const signedInfo = this.buildSignedInfo(
				xmlHash,
				signedPropertiesHash,
				keyInfoHash,
				randomIds
			);

			// Firmar SignedInfo
			const signature = this.signData(signedInfo.withNamespace, privateKey);

			// Construir firma XAdES-BES completa
			const xadesSignature = this.buildXAdESSignature(
				signedInfo.content,
				signature,
				keyInfo.content,
				signedProperties.content,
				randomIds
			);

			// Insertar firma en el XML
			const signedXml = this.insertSignatureIntoXML(cleanXml, xadesSignature);

			console.log("✅ XML firmado exitosamente");
			return signedXml;
		} catch (error) {
			console.error("❌ Error firmando XML:", error.message);
			throw new Error(`Error en firma XAdES-BES: ${error.message}`);
		}
	}

	/**
	 * Limpiar XML eliminando indentación y espacios extra
	 */
	cleanXML(xml) {
		// Eliminar declaración XML si existe y recrearla
		let cleaned = xml.replace(/<\?xml[^>]*\?>/, "").trim();

		// Eliminar indentación y espacios entre tags
		cleaned = cleaned.replace(/>\s+</g, "><");

		// Agregar declaración XML estándar
		return '<?xml version="1.0" encoding="UTF-8"?>' + cleaned;
	}

	/**
	 * Extraer datos del certificado .p12
	 */
	async extractCertificateData(p12Buffer, password) {
		try {
			const p12B64 = forge.util.binary.base64.encode(new Uint8Array(p12Buffer));
			const p12Der = forge.util.decode64(p12B64);
			const p12Asn1 = forge.asn1.fromDer(p12Der);
			const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

			// Extraer certificado
			const certBags = p12.getBags({bagType: forge.pki.oids.certBag});
			const certificate = certBags[forge.pki.oids.certBag][0].cert;

			// Extraer clave privada
			const pkcs8Bags = p12.getBags({
				bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
			});
			const privateKey = pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;

			// Preparar datos del certificado
			const certificatePem = forge.pki.certificateToPem(certificate);
			let certificateBase64 = certificatePem
				.replace(/-----BEGIN CERTIFICATE-----/, "")
				.replace(/-----END CERTIFICATE-----/, "")
				.replace(/\r?\n|\r/g, "");

			// Formatear certificado en líneas de 76 caracteres
			certificateBase64 = certificateBase64.match(/.{1,76}/g).join("\n");

			// Calcular hash del certificado en formato DER
			const certificateAsn1 = forge.pki.certificateToAsn1(certificate);
			const certificateDer = forge.asn1.toDer(certificateAsn1).getBytes();
			const certificateHash = this.calculateSHA1Hash(certificateDer);

			// Extraer modulus y exponent
			const modulus = this.bigIntToBase64(privateKey.n);
			const exponent = this.hexToBase64(privateKey.e.data[0].toString(16));

			// Extraer issuer name con formato correcto para SRI
			const issuerName = this.formatIssuerName(certificate);

			// Extraer serial number
			const serialNumber = parseInt(certificate.serialNumber, 16);

			return {
				certificate: certificateBase64,
				privateKey,
				certificateInfo: {
					hash: certificateHash,
					modulus,
					exponent,
					issuerName,
					serialNumber,
				},
			};
		} catch (error) {
			throw new Error(
				`Error extrayendo datos del certificado: ${error.message}`
			);
		}
	}

	/**
	 * Formatear issuer name según estándares de SRI para Uanataca
	 */
	formatIssuerName(certificate) {
		// Verificar si es certificado de Uanataca y aplicar formato correcto
		const issuer = certificate.issuer;

		// Buscar el campo organizationName para identificar Uanataca
		const orgName =
			issuer.attributes.find((attr) => attr.name === "organizationName")
				?.value || "";
		const commonName =
			issuer.attributes.find((attr) => attr.name === "commonName")?.value || "";

		if (orgName.includes("UANATACA") || commonName.includes("UANATACA")) {
			// Determinar si es certificado de 1-3 años o 4-5 años basado en CN
			if (commonName.includes("2021")) {
				// Certificados de 4-5 años
				return "2.5.4.97=#0c0f56415445532d413636373231343939,CN=UANATACA CA2 2021,OU=TSP-UANATACA,O=UANATACA S.A.,L=Barcelona,C=ES";
			} else {
				// Certificados de 1-3 años (2016)
				return "2.5.4.97=#0c0f56415445532d413636373231343939,CN=UANATACA CA2 2016,OU=TSP-UANATACA,O=UANATACA S.A.,L=Barcelona (see current address at www.uanataca.com/address),C=ES";
			}
		}

		// Fallback para otros certificados
		const cn =
			issuer.attributes.find((attr) => attr.name === "commonName")?.value || "";
		const ou =
			issuer.attributes.find((attr) => attr.name === "organizationalUnitName")
				?.value || "";
		const o =
			issuer.attributes.find((attr) => attr.name === "organizationName")
				?.value || "";
		const l =
			issuer.attributes.find((attr) => attr.name === "localityName")?.value ||
			"";
		const c =
			issuer.attributes.find((attr) => attr.name === "countryName")?.value ||
			"";

		return `CN=${cn},OU=${ou},O=${o},L=${l},C=${c}`;
	}

	/**
	 * Generar IDs aleatorios para elementos de la firma
	 */
	generateRandomIds() {
		return {
			signature: Math.floor(Math.random() * 999000) + 990,
			certificate: Math.floor(Math.random() * 999000) + 990,
			signedProperties: Math.floor(Math.random() * 999000) + 990,
			signedInfo: Math.floor(Math.random() * 999000) + 990,
			signedPropertiesId: Math.floor(Math.random() * 999000) + 990,
			referenceId: Math.floor(Math.random() * 999000) + 990,
			signatureValue: Math.floor(Math.random() * 999000) + 990,
			object: Math.floor(Math.random() * 999000) + 990,
		};
	}

	/**
	 * Construir SignedProperties según estándar XAdES-BES
	 */
	buildSignedProperties(certInfo, ids) {
		const now = new Date().toISOString();

		const content =
			`<etsi:SignedProperties Id="Signature${ids.signature}-SignedProperties${ids.signedProperties}">` +
			`<etsi:SignedSignatureProperties>` +
			`<etsi:SigningTime>${now}</etsi:SigningTime>` +
			`<etsi:SigningCertificate>` +
			`<etsi:Cert>` +
			`<etsi:CertDigest>` +
			`<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
			`<ds:DigestValue>${certInfo.hash}</ds:DigestValue>` +
			`</etsi:CertDigest>` +
			`<etsi:IssuerSerial>` +
			`<ds:X509IssuerName>${certInfo.issuerName}</ds:X509IssuerName>` +
			`<ds:X509SerialNumber>${certInfo.serialNumber}</ds:X509SerialNumber>` +
			`</etsi:IssuerSerial>` +
			`</etsi:Cert>` +
			`</etsi:SigningCertificate>` +
			`</etsi:SignedSignatureProperties>` +
			`<etsi:SignedDataObjectProperties>` +
			`<etsi:DataObjectFormat ObjectReference="#Reference-ID-${ids.referenceId}">` +
			`<etsi:Description>contenido comprobante</etsi:Description>` +
			`<etsi:MimeType>text/xml</etsi:MimeType>` +
			`</etsi:DataObjectFormat>` +
			`</etsi:SignedDataObjectProperties>` +
			`</etsi:SignedProperties>`;

		return {
			content,
			withNamespace: content.replace(
				"<etsi:SignedProperties",
				`<etsi:SignedProperties ${this.xmlns}`
			),
		};
	}

	/**
	 * Construir KeyInfo
	 */
	buildKeyInfo(certificate, modulus, exponent, ids) {
		const content =
			`<ds:KeyInfo Id="Certificate${ids.certificate}">` +
			`<ds:X509Data>` +
			`<ds:X509Certificate>${certificate}</ds:X509Certificate>` +
			`</ds:X509Data>` +
			`<ds:KeyValue>` +
			`<ds:RSAKeyValue>` +
			`<ds:Modulus>${modulus}</ds:Modulus>` +
			`<ds:Exponent>${exponent}</ds:Exponent>` +
			`</ds:RSAKeyValue>` +
			`</ds:KeyValue>` +
			`</ds:KeyInfo>`;

		return {
			content,
			withNamespace: content.replace(
				"<ds:KeyInfo",
				`<ds:KeyInfo ${this.xmlns}`
			),
		};
	}

	/**
	 * Construir SignedInfo
	 */
	buildSignedInfo(xmlHash, signedPropertiesHash, keyInfoHash, ids) {
		const content =
			`<ds:SignedInfo Id="Signature-SignedInfo${ids.signedInfo}">` +
			`<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>` +
			`<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod>` +
			`<ds:Reference Id="SignedPropertiesID${ids.signedPropertiesId}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature${ids.signature}-SignedProperties${ids.signedProperties}">` +
			`<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
			`<ds:DigestValue>${signedPropertiesHash}</ds:DigestValue>` +
			`</ds:Reference>` +
			`<ds:Reference URI="#Certificate${ids.certificate}">` +
			`<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
			`<ds:DigestValue>${keyInfoHash}</ds:DigestValue>` +
			`</ds:Reference>` +
			`<ds:Reference Id="Reference-ID-${ids.referenceId}" URI="#comprobante">` +
			`<ds:Transforms>` +
			`<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
			`</ds:Transforms>` +
			`<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>` +
			`<ds:DigestValue>${xmlHash}</ds:DigestValue>` +
			`</ds:Reference>` +
			`</ds:SignedInfo>`;

		return {
			content,
			withNamespace: content.replace(
				"<ds:SignedInfo",
				`<ds:SignedInfo ${this.xmlns}`
			),
		};
	}

	/**
	 * Construir firma XAdES-BES completa
	 */
	buildXAdESSignature(signedInfo, signature, keyInfo, signedProperties, ids) {
		return (
			`<ds:Signature ${this.xmlns} Id="Signature${ids.signature}">` +
			signedInfo +
			`<ds:SignatureValue Id="SignatureValue${ids.signatureValue}">${signature}</ds:SignatureValue>` +
			keyInfo +
			`<ds:Object Id="Signature${ids.signature}-Object${ids.object}">` +
			`<etsi:QualifyingProperties Target="#Signature${ids.signature}">` +
			signedProperties +
			`</etsi:QualifyingProperties>` +
			`</ds:Object>` +
			`</ds:Signature>`
		);
	}

	/**
	 * Insertar firma en XML
	 */
	insertSignatureIntoXML(xml, signature) {
		// Buscar el tag de cierre del elemento raíz y insertar antes
		const rootEndTagMatch = xml.match(/<\/(\w+)>$/);
		if (!rootEndTagMatch) {
			throw new Error(
				"No se pudo encontrar el tag de cierre del elemento raíz"
			);
		}

		const rootTag = rootEndTagMatch[1];
		return xml.replace(`</${rootTag}>`, `${signature}</${rootTag}>`);
	}

	/**
	 * Calcular hash SHA1
	 */
	calculateSHA1Hash(data) {
		const md = forge.md.sha1.create();
		md.update(data, "utf8");
		return forge.util.encode64(md.digest().bytes());
	}

	/**
	 * Firmar datos con clave privada
	 */
	signData(data, privateKey) {
		const md = forge.md.sha1.create();
		md.update(data, "utf8");
		const signature = privateKey.sign(md);
		return forge.util
			.encode64(signature)
			.match(/.{1,76}/g)
			.join("\n");
	}

	/**
	 * Convertir BigInt a Base64
	 */
	bigIntToBase64(bigInt) {
		const hex = bigInt.toString(16);
		const bytes = hex
			.match(/\w{2}/g)
			.map((byte) => String.fromCharCode(parseInt(byte, 16)));
		const base64 = forge.util.encode64(bytes.join(""));
		return base64.match(/.{1,76}/g).join("\n");
	}

	/**
	 * Convertir hex a Base64
	 */
	hexToBase64(hex) {
		const paddedHex = ("00" + hex).slice(-Math.max(hex.length, 2));
		const bytes = paddedHex
			.match(/\w{2}/g)
			.map((byte) => String.fromCharCode(parseInt(byte, 16)));
		return forge.util.encode64(bytes.join(""));
	}

	/**
	 * Convertir XML firmado a Base64 (para envío al SRI)
	 */
	xmlToBase64(xmlContent) {
		return Buffer.from(xmlContent, "utf8").toString("base64");
	}

	/**
	 * Validar XML firmado (verificación básica)
	 */
	validateSignedXML(signedXml) {
		const validation = {
			isValid: false,
			errors: [],
			warnings: [],
		};

		try {
			// Verificar que contiene firma
			if (!signedXml.includes("<ds:Signature")) {
				validation.errors.push("XML no contiene firma digital");
				return validation;
			}

			// Verificar elementos obligatorios XAdES-BES
			const requiredElements = [
				"<ds:SignedInfo",
				"<ds:SignatureValue",
				"<ds:KeyInfo",
				"<etsi:SignedProperties",
				"<ds:X509IssuerName",
			];

			requiredElements.forEach((element) => {
				if (!signedXml.includes(element)) {
					validation.errors.push(`Elemento requerido faltante: ${element}`);
				}
			});

			// Verificar formato específico del SRI para Uanataca
			if (signedXml.includes("<ds:X509IssuerName>")) {
				const issuerMatch = signedXml.match(
					/<ds:X509IssuerName>(.*?)<\/ds:X509IssuerName>/
				);
				if (issuerMatch) {
					const issuerName = issuerMatch[1];
					if (
						!issuerName.includes("VATES-A66721499") &&
						!issuerName.includes("#0c0f56415445532d413636373231343939")
					) {
						validation.warnings.push(
							"IssuerName podría no tener el formato correcto para Uanataca"
						);
					}
				}
			}

			if (validation.errors.length === 0) {
				validation.isValid = true;
			}
		} catch (error) {
			validation.errors.push(`Error validando XML: ${error.message}`);
		}

		return validation;
	}
}

module.exports = SRIXAdESSigner;
