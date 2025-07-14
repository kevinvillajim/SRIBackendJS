// src/utils/sriXmlGenerator.js

/**
 * Generador de XML para facturas SRI Ecuador
 * Genera la estructura exacta requerida por el SRI basada en ejemplos reales
 */

// Generar clave de acceso según formato exacto del ejemplo real del SRI
const generateAccessKey = (
	fecha,
	ruc,
	ambiente,
	serie,
	secuencial,
	tipoEmision = "01"
) => {
	// Ejemplo real que funciona: 0605202501120603993300110010010000000600608364218 (49 dígitos)
	// Estructura observada: ddMMyyyyTTrrrrrrrrrrrrssssssnnnnnnnnnxxxxxxxxxx

	const [day, month, year] = fecha.split("/");
	const fechaPart = `${day}${month}${year}`; // 8 dígitos: 06052025
	const tipoEmisionPart = tipoEmision.padStart(2, "0"); // 2 dígitos: 01
	const rucPart = ruc; // 13 dígitos: 1206039933001
	const ambientePart = ambiente; // 1 dígito: 1
	const seriePart = serie.replace("-", ""); // 6 dígitos: 001001
	const secuencialPart = secuencial.padStart(9, "0"); // 9 dígitos: 000000060

	// Para los últimos 9 dígitos (no 8), voy a usar un patrón basado en el ejemplo
	// En el ejemplo: 0608364218 pero esos son 10 dígitos en el original
	// Para llegar a 49 total: 8+2+13+1+6+9+9+1 = 49
	const codigoPunto = "060"; // Código fijo como en el ejemplo (3 dígitos)
	const timestamp = Date.now().toString().slice(-6); // 6 dígitos únicos
	const codigoFinal = codigoPunto + timestamp; // 9 dígitos total

	// Construir clave sin dígito verificador (48 dígitos)
	const claveBase =
		fechaPart +
		tipoEmisionPart +
		rucPart +
		ambientePart +
		seriePart +
		secuencialPart +
		codigoFinal;

	// Calcular dígito verificador
	const verificador = calcularDigitoVerificador(claveBase);

	const claveCompleta = claveBase + verificador;

	console.log(`🔑 Generando clave de acceso (formato exacto SRI):`);
	console.log(`📅 Fecha: ${fechaPart} (${day}/${month}/${year})`);
	console.log(`🔢 Tipo emisión: ${tipoEmisionPart}`);
	console.log(`🏢 RUC: ${rucPart}`);
	console.log(`🌍 Ambiente: ${ambientePart}`);
	console.log(`📍 Serie: ${seriePart}`);
	console.log(`🔢 Secuencial: ${secuencialPart} (9 dígitos)`);
	console.log(`📄 Código final: ${codigoFinal} (9 dígitos)`);
	console.log(`✅ Verificador: ${verificador}`);
	console.log(
		`🔑 Clave completa: ${claveCompleta} (${claveCompleta.length} dígitos)`
	);

	if (claveCompleta.length !== 49) {
		console.error(
			`❌ ERROR: Clave de acceso debe tener 49 dígitos, pero tiene ${claveCompleta.length}`
		);
		console.error(
			`🔧 Desglose: fecha(${fechaPart.length}) + tipo(${
				tipoEmisionPart.length
			}) + ruc(${rucPart.length}) + ambiente(${ambientePart.length}) + serie(${
				seriePart.length
			}) + secuencial(${secuencialPart.length}) + codigo(${
				codigoFinal.length
			}) + verificador(1) = ${
				fechaPart.length +
				tipoEmisionPart.length +
				rucPart.length +
				ambientePart.length +
				seriePart.length +
				secuencialPart.length +
				codigoFinal.length +
				1
			}`
		);
	} else {
		console.log(`✅ CORRECTO: Clave de acceso tiene exactamente 49 dígitos`);
	}

	return claveCompleta;
};

// Calcular dígito verificador módulo 11 (método estándar SRI)
const calcularDigitoVerificador = (clave) => {
	const factores = [2, 3, 4, 5, 6, 7];
	let suma = 0;
	let factor = 0;

	// Recorrer de derecha a izquierda
	for (let i = clave.length - 1; i >= 0; i--) {
		suma += parseInt(clave[i]) * factores[factor];
		factor = (factor + 1) % 6;
	}

	const residuo = suma % 11;
	let digitoVerificador;

	if (residuo === 0) {
		digitoVerificador = 0;
	} else if (residuo === 1) {
		digitoVerificador = 1; // En algunos casos especiales
	} else {
		digitoVerificador = 11 - residuo;
	}

	return digitoVerificador.toString();
};

// Generar factura con estructura exacta del SRI
const generateInvoiceXML = (invoiceData) => {
	const {infoTributaria, infoFactura, detalles, infoAdicional} = invoiceData;

	// Generar clave de acceso si no se proporciona
	const serie = `${infoTributaria.estab}-${infoTributaria.ptoEmi}`;
	const claveAcceso =
		infoTributaria.claveAcceso ||
		generateAccessKey(
			infoFactura.fechaEmision,
			infoTributaria.ruc,
			infoTributaria.ambiente,
			serie,
			infoTributaria.secuencial
		);

	// Generar guiaRemision automáticamente si no se proporciona
	const guiaRemision =
		infoFactura.guiaRemision ||
		`${infoTributaria.estab}-${infoTributaria.ptoEmi}-${infoTributaria.secuencial}`;

	// Construcción del XML siguiendo la estructura exacta del ejemplo
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${infoTributaria.ambiente}</ambiente>
    <tipoEmision>${infoTributaria.tipoEmision || "1"}</tipoEmision>
    <razonSocial>${infoTributaria.razonSocial}</razonSocial>
    <nombreComercial>${infoTributaria.nombreComercial}</nombreComercial>
    <ruc>${infoTributaria.ruc}</ruc>
    <claveAcceso>${claveAcceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${infoTributaria.estab}</estab>
    <ptoEmi>${infoTributaria.ptoEmi}</ptoEmi>
    <secuencial>${infoTributaria.secuencial}</secuencial>
    <dirMatriz>${infoTributaria.dirMatriz}</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${infoFactura.fechaEmision}</fechaEmision>
    <dirEstablecimiento>${infoFactura.dirEstablecimiento}</dirEstablecimiento>
    <tipoIdentificacionComprador>${
			infoFactura.tipoIdentificacionComprador
		}</tipoIdentificacionComprador>
    <guiaRemision>${guiaRemision}</guiaRemision>
    <razonSocialComprador>${
			infoFactura.razonSocialComprador
		}</razonSocialComprador>
    <identificacionComprador>${
			infoFactura.identificacionComprador
		}</identificacionComprador>
    <totalSinImpuestos>${infoFactura.totalSinImpuestos}</totalSinImpuestos>
    <totalDescuento>${infoFactura.totalDescuento}</totalDescuento>
    <totalConImpuestos>
      ${generateTotalImpuestos(infoFactura.totalConImpuestos)}
    </totalConImpuestos>
    <propina>${infoFactura.propina || "0.00"}</propina>
    <importeTotal>${infoFactura.importeTotal}</importeTotal>
    <moneda>${infoFactura.moneda}</moneda>
    <pagos>
      ${generatePagos(infoFactura.pagos)}
    </pagos>
  </infoFactura>
  <detalles>
    ${generateDetalles(detalles)}
  </detalles>
  ${infoAdicional ? generateInfoAdicional(infoAdicional) : ""}
</factura>`;

	return {
		xml: cleanXML(xml),
		claveAcceso,
	};
};

// Limpiar XML eliminando espacios extra manteniendo la estructura
const cleanXML = (xml) => {
	return xml
		.replace(/>\s+</g, "><") // Eliminar espacios entre tags
		.replace(/\n\s*\n/g, "\n") // Eliminar líneas vacías múltiples
		.trim();
};

// Generar totalConImpuestos (sin tarifa en totalConImpuestos, solo en detalles)
const generateTotalImpuestos = (totalConImpuestos) => {
	if (!totalConImpuestos || !totalConImpuestos.totalImpuesto) return "";

	const impuestos = Array.isArray(totalConImpuestos.totalImpuesto)
		? totalConImpuestos.totalImpuesto
		: [totalConImpuestos.totalImpuesto];

	return impuestos
		.map(
			(impuesto) =>
				`<totalImpuesto><codigo>${impuesto.codigo}</codigo><codigoPorcentaje>${impuesto.codigoPorcentaje}</codigoPorcentaje><baseImponible>${impuesto.baseImponible}</baseImponible><tarifa>${impuesto.tarifa}</tarifa><valor>${impuesto.valor}</valor></totalImpuesto>`
		)
		.join("");
};

// Generar pagos (incluir unidadTiempo como en el ejemplo)
const generatePagos = (pagos) => {
	if (!pagos || !pagos.pago) return "";

	const pagosList = Array.isArray(pagos.pago) ? pagos.pago : [pagos.pago];

	return pagosList
		.map(
			(pago) =>
				`<pago><formaPago>${pago.formaPago}</formaPago><total>${
					pago.total
				}</total>${
					pago.unidadTiempo
						? `<unidadTiempo>${pago.unidadTiempo}</unidadTiempo>`
						: ""
				}</pago>`
		)
		.join("");
};

// Generar detalles
const generateDetalles = (detalles) => {
	if (!detalles || !detalles.detalle) return "";

	const detallesList = Array.isArray(detalles.detalle)
		? detalles.detalle
		: [detalles.detalle];

	return detallesList
		.map(
			(detalle) =>
				`<detalle><codigoPrincipal>${
					detalle.codigoPrincipal
				}</codigoPrincipal>${
					detalle.codigoAuxiliar
						? `<codigoAuxiliar>${detalle.codigoAuxiliar}</codigoAuxiliar>`
						: ""
				}<descripcion>${detalle.descripcion}</descripcion><cantidad>${
					detalle.cantidad
				}</cantidad><precioUnitario>${
					detalle.precioUnitario
				}</precioUnitario><descuento>${
					detalle.descuento
				}</descuento><precioTotalSinImpuesto>${
					detalle.precioTotalSinImpuesto
				}</precioTotalSinImpuesto>${
					detalle.impuestos ? generateImpuestosDetalle(detalle.impuestos) : ""
				}</detalle>`
		)
		.join("");
};

// Generar impuestos de detalle
const generateImpuestosDetalle = (impuestos) => {
	if (!impuestos || !impuestos.impuesto) return "";

	const impuestosList = Array.isArray(impuestos.impuesto)
		? impuestos.impuesto
		: [impuestos.impuesto];

	const impuestosXml = impuestosList
		.map(
			(impuesto) =>
				`<impuesto><codigo>${impuesto.codigo}</codigo><codigoPorcentaje>${impuesto.codigoPorcentaje}</codigoPorcentaje><tarifa>${impuesto.tarifa}</tarifa><baseImponible>${impuesto.baseImponible}</baseImponible><valor>${impuesto.valor}</valor></impuesto>`
		)
		.join("");

	return `<impuestos>${impuestosXml}</impuestos>`;
};

// Generar información adicional
const generateInfoAdicional = (infoAdicional) => {
	if (!infoAdicional || !infoAdicional.campoAdicional) return "";

	const campos = Array.isArray(infoAdicional.campoAdicional)
		? infoAdicional.campoAdicional
		: [infoAdicional.campoAdicional];

	const camposXml = campos
		.map((campo) => {
			if (typeof campo === "object" && campo.nombre && campo.valor) {
				return `<campoAdicional nombre="${campo.nombre}">${campo.valor}</campoAdicional>`;
			}
			return "";
		})
		.filter((campo) => campo)
		.join("");

	return `<infoAdicional>${camposXml}</infoAdicional>`;
};

// Función principal para crear factura
const createInvoice = (invoiceData) => {
	// Generar secuencial si no se proporciona
	if (!invoiceData.infoTributaria.secuencial) {
		invoiceData.infoTributaria.secuencial = generateSequential();
	}

	// Asegurar formato de secuencial (9 dígitos)
	invoiceData.infoTributaria.secuencial = String(
		invoiceData.infoTributaria.secuencial
	).padStart(9, "0");

	return generateInvoiceXML(invoiceData);
};

// Generar secuencial único
const generateSequential = () => {
	const timestamp = Date.now();
	const sequential = timestamp.toString().slice(-9);
	return sequential.padStart(9, "0");
};

module.exports = {
	createInvoice,
	generateInvoiceXML,
	generateAccessKey,
	calcularDigitoVerificador,
	generateSequential,
};
