const axios = require("axios");
const xml2js = require("xml2js");

class SRISoapService {
	constructor() {
		this.timeout = 30000; // 30 segundos
	}

	/**
	 * Enviar comprobante al SRI para recepción
	 * @param {string} xmlBase64 - XML firmado en Base64
	 * @param {string} ambiente - '1' para pruebas, '2' para producción
	 * @returns {Promise<Object>} Respuesta del SRI
	 */
	async enviarComprobanteRecepcion(xmlBase64, ambiente = "1") {
		console.log("📤 Enviando comprobante al SRI para RECEPCIÓN");
		console.log("🌐 Ambiente:", ambiente === "1" ? "PRUEBAS" : "PRODUCCIÓN");
		console.log(
			"📦 Tamaño XML Base64:",
			xmlBase64?.length || "undefined",
			"caracteres"
		);

		// Validar entrada
		if (!xmlBase64) {
			throw new Error("xmlBase64 es requerido para recepción");
		}

		if (typeof xmlBase64 !== "string") {
			throw new Error("xmlBase64 debe ser una cadena de texto");
		}

		const endpoint =
			ambiente === "1"
				? "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline"
				: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline";

		// SOAP envelope correcto para recepción según SRI
		const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${xmlBase64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

		try {
			console.log("🔗 Endpoint recepción:", endpoint);
			console.log("📝 SOAP Request tamaño:", soapEnvelope.length, "caracteres");
			console.log(
				"📝 Primeros 500 chars del SOAP:",
				soapEnvelope.substring(0, 500)
			);

			const response = await axios.post(endpoint, soapEnvelope, {
				headers: {
					"Content-Type": "text/xml; charset=utf-8",
					SOAPAction: "",
					"User-Agent": "SRI-Ecuador-Client/1.0",
					Accept: "text/xml, application/xml, application/soap+xml",
				},
				timeout: this.timeout,
				maxRedirects: 5,
				validateStatus: function (status) {
					// Aceptar códigos de estado entre 200-299 y algunos 500 (errores SOAP)
					return (status >= 200 && status < 300) || status === 500;
				},
			});

			console.log("✅ Respuesta recibida del SRI");
			console.log("📊 Status:", response.status);
			console.log("📊 Headers:", JSON.stringify(response.headers, null, 2));
			console.log("📄 Response data type:", typeof response.data);
			console.log(
				"📄 Response data length:",
				response.data?.length || "undefined"
			);
			console.log(
				"📄 Primeros 1000 chars:",
				response.data?.substring(0, 1000) || "No data"
			);

			// Verificar que hay data
			if (!response.data) {
				throw new Error("Respuesta vacía del SRI");
			}

			// Parsear respuesta SOAP
			const result = await this.parsearRespuestaRecepcion(response.data);
			console.log(
				"🔍 Respuesta de recepción parseada:",
				JSON.stringify(result, null, 2)
			);

			return result;
		} catch (error) {
			console.error("❌ Error en recepción SRI:", error.message);
			console.error("❌ Error stack:", error.stack);

			if (error.response) {
				console.error("📄 Error status:", error.response.status);
				console.error(
					"📄 Error headers:",
					JSON.stringify(error.response.headers, null, 2)
				);
				console.error(
					"📄 Error data:",
					error.response.data?.substring(0, 1000) || "No error data"
				);
			}

			if (error.code) {
				console.error("📄 Error code:", error.code);
			}

			throw new Error(`Error en recepción SRI: ${error.message}`);
		}
	}

	/**
	 * Consultar autorización de comprobante
	 * @param {string} claveAcceso - Clave de acceso del comprobante
	 * @param {string} ambiente - '1' para pruebas, '2' para producción
	 * @returns {Promise<Object>} Respuesta del SRI
	 */
	async consultarAutorizacion(claveAcceso, ambiente = "1") {
		console.log("📋 Consultando autorización en SRI");
		console.log("🔑 Clave de acceso:", claveAcceso);
		console.log("🌐 Ambiente:", ambiente === "1" ? "PRUEBAS" : "PRODUCCIÓN");

		// Validar entrada
		if (!claveAcceso) {
			throw new Error("claveAcceso es requerida para autorización");
		}

		if (!this.validarClaveAcceso(claveAcceso)) {
			throw new Error(`Clave de acceso inválida: ${claveAcceso}`);
		}

		const endpoint =
			ambiente === "1"
				? "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline"
				: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline";

		const soapEnvelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

		try {
			console.log("🔗 Endpoint autorización:", endpoint);

			const response = await axios.post(endpoint, soapEnvelope, {
				headers: {
					"Content-Type": "text/xml; charset=utf-8",
					SOAPAction: "",
					"User-Agent": "SRI-Ecuador-Client/1.0",
					Accept: "text/xml, application/xml, application/soap+xml",
				},
				timeout: this.timeout,
				maxRedirects: 5,
				validateStatus: function (status) {
					return (status >= 200 && status < 300) || status === 500;
				},
			});

			console.log(
				"✅ Respuesta de autorización recibida, status:",
				response.status
			);

			if (!response.data) {
				throw new Error("Respuesta vacía del SRI en autorización");
			}

			// Parsear respuesta SOAP
			const result = await this.parsearRespuestaAutorizacion(response.data);
			console.log("🔍 Autorización parseada:", JSON.stringify(result, null, 2));

			return result;
		} catch (error) {
			console.error("❌ Error en autorización SRI:", error.message);

			if (error.response) {
				console.error("📄 Status:", error.response.status);
				console.error("📄 Data:", error.response.data?.substring(0, 500));
			}

			throw new Error(`Error en autorización SRI: ${error.message}`);
		}
	}

	/**
	 * Parsear respuesta SOAP de recepción
	 */
	async parsearRespuestaRecepcion(soapResponse) {
		try {
			console.log("🔍 Parseando respuesta de recepción...");
			console.log("📄 Tipo de respuesta:", typeof soapResponse);
			console.log("📄 Tamaño respuesta:", soapResponse?.length || "undefined");

			if (!soapResponse) {
				throw new Error("soapResponse es null o undefined");
			}

			if (typeof soapResponse !== "string") {
				throw new Error(
					`soapResponse debe ser string, recibido: ${typeof soapResponse}`
				);
			}

			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: false,
				tagNameProcessors: [xml2js.processors.stripPrefix],
				attrNameProcessors: [xml2js.processors.stripPrefix],
				trim: true,
				normalizeTags: false,
			});

			console.log("🔄 Iniciando parseo XML...");
			const result = await parser.parseStringPromise(soapResponse);
			console.log("✅ XML parseado exitosamente");
			console.log("🔍 Estructura parseada:", JSON.stringify(result, null, 2));

			// Navegar por la estructura SOAP - verificar cada paso
			if (!result) {
				throw new Error("Parser XML devolvió null/undefined");
			}

			if (!result.Envelope) {
				throw new Error("No se encontró elemento Envelope en respuesta SOAP");
			}

			const body = result.Envelope.Body;
			if (!body) {
				throw new Error("No se encontró elemento Body en respuesta SOAP");
			}

			console.log("🔍 Body encontrado:", JSON.stringify(body, null, 2));

			// Buscar diferentes posibles nombres de respuesta
			const response =
				body.validarComprobanteResponse ||
				body.recepcionComprobanteResponse ||
				body.RespuestaRecepcionComprobante;

			if (!response) {
				console.log("⚠️ No se encontró respuesta de recepción conocida");
				console.log("🔍 Claves disponibles en Body:", Object.keys(body));

				// Intentar con la primera clave disponible
				const firstKey = Object.keys(body)[0];
				if (firstKey) {
					console.log(`🔄 Intentando con clave: ${firstKey}`);
					const altResponse = body[firstKey];
					return {
						success: true,
						respuesta: altResponse,
						rawSoap: soapResponse,
						warning: `Respuesta encontrada con clave alternativa: ${firstKey}`,
					};
				}

				throw new Error("No se encontró respuesta válida en SOAP response");
			}

			return {
				success: true,
				respuesta: response,
				rawSoap: soapResponse,
			};
		} catch (error) {
			console.error(
				"❌ Error parseando respuesta de recepción:",
				error.message
			);
			console.error("❌ Stack:", error.stack);
			return {
				success: false,
				error: error.message,
				rawSoap: soapResponse,
				stack: error.stack,
			};
		}
	}

	/**
	 * Parsear respuesta SOAP de autorización
	 */
	async parsearRespuestaAutorizacion(soapResponse) {
		try {
			if (!soapResponse) {
				throw new Error("soapResponse es null o undefined");
			}

			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: false,
				tagNameProcessors: [xml2js.processors.stripPrefix],
				attrNameProcessors: [xml2js.processors.stripPrefix],
				trim: true,
			});

			const result = await parser.parseStringPromise(soapResponse);

			// Navegar por la estructura SOAP
			const body = result?.Envelope?.Body;
			const response = body?.autorizacionComprobanteResponse;

			if (!response) {
				throw new Error("No se encontró respuesta de autorización válida");
			}

			const respuestaAutorizacion = response.RespuestaAutorizacionComprobante;

			if (!respuestaAutorizacion) {
				throw new Error("No se encontró RespuestaAutorizacionComprobante");
			}

			// Extraer información importante
			const resultado = {
				success: true,
				claveAccesoConsultada: respuestaAutorizacion.claveAccesoConsultada,
				numeroComprobantes:
					parseInt(respuestaAutorizacion.numeroComprobantes) || 0,
				autorizaciones: respuestaAutorizacion.autorizaciones || {},
				rawSoap: soapResponse,
			};

			// Si hay autorizaciones, extraer la primera
			if (resultado.autorizaciones.autorizacion) {
				const autorizacion = Array.isArray(
					resultado.autorizaciones.autorizacion
				)
					? resultado.autorizaciones.autorizacion[0]
					: resultado.autorizaciones.autorizacion;

				resultado.autorizado = autorizacion.estado === "AUTORIZADO";
				resultado.numeroAutorizacion = autorizacion.numeroAutorizacion;
				resultado.fechaAutorizacion = autorizacion.fechaAutorizacion;
				resultado.ambiente = autorizacion.ambiente;
				resultado.mensajes = autorizacion.mensajes || [];
			} else {
				resultado.autorizado = false;
				resultado.numeroAutorizacion = null;
			}

			return resultado;
		} catch (error) {
			console.error(
				"❌ Error parseando respuesta de autorización:",
				error.message
			);
			return {
				success: false,
				error: error.message,
				rawSoap: soapResponse,
			};
		}
	}

	/**
	 * Validar formato de clave de acceso
	 */
	validarClaveAcceso(claveAcceso) {
		if (!claveAcceso || typeof claveAcceso !== "string") {
			console.log("❌ Clave de acceso inválida: no es string o está vacía");
			return false;
		}

		// Clave de acceso debe tener exactamente 49 dígitos
		if (claveAcceso.length !== 49) {
			console.log(
				`❌ Clave de acceso inválida: longitud ${claveAcceso.length}, esperada 49`
			);
			return false;
		}

		// Solo debe contener números
		if (!/^\d+$/.test(claveAcceso)) {
			console.log(
				"❌ Clave de acceso inválida: contiene caracteres no numéricos"
			);
			return false;
		}

		console.log("✅ Clave de acceso válida");
		return true;
	}

	/**
	 * Proceso completo: recepción + autorización
	 */
	async procesoCompletoSRI(xmlBase64, claveAcceso, ambiente = "1") {
		console.log("🎯 Iniciando proceso COMPLETO con SRI");
		console.log("📊 Parámetros:");
		console.log("  - xmlBase64 length:", xmlBase64?.length || "undefined");
		console.log("  - claveAcceso:", claveAcceso);
		console.log("  - ambiente:", ambiente);

		const resultado = {
			recepcion: null,
			autorizacion: null,
			autorizado: false,
			numeroAutorizacion: null,
			errores: [],
		};

		try {
			// 1. Validar entradas
			if (!xmlBase64) {
				throw new Error("xmlBase64 es requerido");
			}

			if (!claveAcceso) {
				throw new Error("claveAcceso es requerida");
			}

			if (!this.validarClaveAcceso(claveAcceso)) {
				throw new Error(`Clave de acceso inválida: ${claveAcceso}`);
			}

			// 2. Enviar a recepción
			console.log("🚀 Paso 1: Enviando a recepción...");
			try {
				resultado.recepcion = await this.enviarComprobanteRecepcion(
					xmlBase64,
					ambiente
				);
				console.log("✅ Recepción completada");
			} catch (recepcionError) {
				console.error("❌ Error en recepción:", recepcionError.message);
				resultado.errores.push(`Recepción: ${recepcionError.message}`);
				// Continuar con autorización even si recepción falla
			}

			// 3. Esperar un momento antes de consultar autorización
			console.log("⏳ Esperando 3 segundos antes de consultar autorización...");
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// 4. Consultar autorización
			console.log("🚀 Paso 2: Consultando autorización...");
			try {
				resultado.autorizacion = await this.consultarAutorizacion(
					claveAcceso,
					ambiente
				);

				if (resultado.autorizacion.success) {
					resultado.autorizado = resultado.autorizacion.autorizado;
					resultado.numeroAutorizacion =
						resultado.autorizacion.numeroAutorizacion;
					console.log("✅ Consulta de autorización completada");
					console.log(
						"📋 Estado:",
						resultado.autorizado ? "AUTORIZADO" : "NO AUTORIZADO"
					);

					if (resultado.autorizacion.numeroComprobantes === 0) {
						console.log(
							"⚠️ numeroComprobantes = 0, el SRI no recibió el comprobante"
						);
					}
				} else {
					resultado.errores.push(
						`Autorización: ${resultado.autorizacion.error}`
					);
				}
			} catch (autorizacionError) {
				console.error("❌ Error en autorización:", autorizacionError.message);
				resultado.errores.push(`Autorización: ${autorizacionError.message}`);
			}

			console.log("🎯 Proceso SRI completado");
			console.log("📊 Resultado final:", JSON.stringify(resultado, null, 2));
			return resultado;
		} catch (error) {
			console.error("❌ Error en proceso completo SRI:", error.message);
			resultado.errores.push(`General: ${error.message}`);
			return resultado;
		}
	}
}

module.exports = SRISoapService;
