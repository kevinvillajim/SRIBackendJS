// src/utils/sriXmlGenerator.js - Estructura EXACTA que funciona con el SRI

const generateAccessKey = (
	fecha,
	ruc,
	ambiente,
	serie,
	secuencial,
	tipoEmision = "01"
) => {
	const [day, month, year] = fecha.split("/");
	const fechaPart = `${day}${month}${year}`;
	const tipoEmisionPart = tipoEmision.padStart(2, "0");
	const rucPart = ruc;
	const ambientePart = ambiente;
	const seriePart = serie.replace("-", "");
	const secuencialPart = secuencial.padStart(9, "0");

	const codigoPunto = "060";
	const timestamp = Date.now().toString().slice(-6);
	const codigoFinal = codigoPunto + timestamp;

	const claveBase =
		fechaPart +
		tipoEmisionPart +
		rucPart +
		ambientePart +
		seriePart +
		secuencialPart +
		codigoFinal;
	const verificador = calcularDigitoVerificador(claveBase);

	return claveBase + verificador;
};

const calcularDigitoVerificador = (clave) => {
	const factores = [2, 3, 4, 5, 6, 7];
	let suma = 0;
	let factor = 0;

	for (let i = clave.length - 1; i >= 0; i--) {
		suma += parseInt(clave[i]) * factores[factor];
		factor = (factor + 1) % 6;
	}

	const residuo = suma % 11;
	return residuo === 0 ? "0" : residuo === 1 ? "1" : (11 - residuo).toString();
};

// Generador que produce EXACTAMENTE la estructura del ejemplo que funciona
const createInvoice = (invoiceData) => {
	const {infoTributaria, infoFactura, detalles} = invoiceData;

	// Generar clave de acceso
	const serie = `${infoTributaria.estab}-${infoTributaria.ptoEmi}`;
	const claveAcceso = generateAccessKey(
		infoFactura.fechaEmision,
		infoTributaria.ruc,
		infoTributaria.ambiente,
		serie,
		infoTributaria.secuencial
	);

	// XML con estructura EXACTA del ejemplo que funciona
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
    <contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${infoFactura.fechaEmision}</fechaEmision>
    <dirEstablecimiento>${
			infoFactura.dirEstablecimiento || infoTributaria.dirMatriz
		}</dirEstablecimiento>
    <obligadoContabilidad>${
			infoFactura.obligadoContabilidad || "SI"
		}</obligadoContabilidad>
    <tipoIdentificacionComprador>${
			infoFactura.tipoIdentificacionComprador
		}</tipoIdentificacionComprador>
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
    <moneda>${infoFactura.moneda || "DOLAR"}</moneda>
    <pagos>
      ${generatePagos(infoFactura.pagos)}
    </pagos>
  </infoFactura>
  <detalles>
    ${generateDetalles(detalles)}
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="SISTEMA">Factura generada con sistema propio</campoAdicional>
  </infoAdicional>
</factura>`;

	return {
		xml: cleanXML(xml),
		claveAcceso,
	};
};

const generateTotalImpuestos = (totalConImpuestos) => {
	if (!totalConImpuestos || !totalConImpuestos.totalImpuesto) return "";

	const impuestos = Array.isArray(totalConImpuestos.totalImpuesto)
		? totalConImpuestos.totalImpuesto
		: [totalConImpuestos.totalImpuesto];

	return impuestos
		.map(
			(impuesto) => `
      <totalImpuesto>
        <codigo>${impuesto.codigo}</codigo>
        <codigoPorcentaje>${impuesto.codigoPorcentaje}</codigoPorcentaje>
        <baseImponible>${impuesto.baseImponible}</baseImponible>
        <tarifa>${impuesto.tarifa}</tarifa>
        <valor>${impuesto.valor}</valor>
      </totalImpuesto>`
		)
		.join("");
};

const generatePagos = (pagos) => {
	if (!pagos || !pagos.pago) return "";

	const pagosList = Array.isArray(pagos.pago) ? pagos.pago : [pagos.pago];

	return pagosList
		.map(
			(pago) => `
      <pago>
        <formaPago>${pago.formaPago}</formaPago>
        <total>${pago.total}</total>
      </pago>`
		)
		.join("");
};

const generateDetalles = (detalles) => {
	if (!detalles || !detalles.detalle) return "";

	const detallesList = Array.isArray(detalles.detalle)
		? detalles.detalle
		: [detalles.detalle];

	return detallesList
		.map(
			(detalle) => `
    <detalle>
      <codigoPrincipal>${detalle.codigoPrincipal || "SERV001"}</codigoPrincipal>
      <descripcion>${detalle.descripcion}</descripcion>
      <cantidad>${detalle.cantidad}</cantidad>
      <precioUnitario>${detalle.precioUnitario}</precioUnitario>
      <descuento>${detalle.descuento}</descuento>
      <precioTotalSinImpuesto>${
				detalle.precioTotalSinImpuesto
			}</precioTotalSinImpuesto>
      <impuestos>
        ${generateImpuestosDetalle(detalle.impuestos)}
      </impuestos>
    </detalle>`
		)
		.join("");
};

const generateImpuestosDetalle = (impuestos) => {
	if (!impuestos || !impuestos.impuesto) return "";

	const impuestosList = Array.isArray(impuestos.impuesto)
		? impuestos.impuesto
		: [impuestos.impuesto];

	return impuestosList
		.map(
			(impuesto) => `
        <impuesto>
          <codigo>${impuesto.codigo}</codigo>
          <codigoPorcentaje>${impuesto.codigoPorcentaje}</codigoPorcentaje>
          <tarifa>${impuesto.tarifa}</tarifa>
          <baseImponible>${impuesto.baseImponible}</baseImponible>
          <valor>${impuesto.valor}</valor>
        </impuesto>`
		)
		.join("");
};

const cleanXML = (xml) => {
	return xml
		.replace(/>\s+</g, "><")
		.replace(/\n\s*\n/g, "\n")
		.trim();
};

const generateSequential = () => {
	const timestamp = Date.now();
	const sequential = timestamp.toString().slice(-9);
	return sequential.padStart(9, "0");
};

module.exports = {
	createInvoice,
	generateAccessKey,
	calcularDigitoVerificador,
	generateSequential,
};
