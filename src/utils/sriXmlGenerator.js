// src/utils/sriXmlGenerator.js - COPIA EXACTA del XML que SÍ FUNCIONA

const createInvoice = (invoiceData) => {
    const { infoFactura, detalles } = invoiceData;
    
    // Usar datos REALES de la empresa que SÍ FUNCIONA temporalmente para prueba
    const fechaActual = infoFactura.fechaEmision;
    const [dia, mes, año] = fechaActual.split("/");
    
    // Generar secuencial único basado en timestamp
    const timestamp = Date.now();
    const secuencial = timestamp.toString().slice(-6).padStart(9, "0");
    
    // Clave de acceso usando ALGORITMO REAL (copiado del ejemplo que funciona)
    const claveAcceso = generateClaveAccesoReal(fechaActual, secuencial);
    
    // XML EXACTAMENTE igual al ejemplo que funciona, solo cambiando lo mínimo
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>1</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>BUSINESSCONNECT S.A.S.</razonSocial>
    <nombreComercial>BUSINESSCONNECT</nombreComercial>
    <ruc>1793204144001</ruc>
    <claveAcceso>${claveAcceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>${secuencial}</secuencial>
    <dirMatriz>RAMIREZ DAVALOS Y AV. AMAZONAS EDIFICIO CENTRO AMAZONAS OF. 402</dirMatriz>
    <contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fechaActual}</fechaEmision>
    <dirEstablecimiento>RAMIREZ DAVALOS Y AV. AMAZONAS EDIFICIO CENTRO AMAZONAS OF. 402</dirEstablecimiento>
    <obligadoContabilidad>SI</obligadoContabilidad>
    <tipoIdentificacionComprador>${infoFactura.tipoIdentificacionComprador}</tipoIdentificacionComprador>
    <razonSocialComprador>${infoFactura.razonSocialComprador}</razonSocialComprador>
    <identificacionComprador>${infoFactura.identificacionComprador}</identificacionComprador>
    <totalSinImpuestos>${infoFactura.totalSinImpuestos}</totalSinImpuestos>
    <totalDescuento>${infoFactura.totalDescuento}</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>${infoFactura.totalSinImpuestos}</baseImponible>
        <tarifa>15.00</tarifa>
        <valor>15.00</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${infoFactura.importeTotal}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>01</formaPago>
        <total>${infoFactura.importeTotal}</total>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>SERV001</codigoPrincipal>
      <descripcion>${detalles.detalle[0].descripcion}</descripcion>
      <cantidad>${detalles.detalle[0].cantidad}</cantidad>
      <precioUnitario>${parseFloat(detalles.detalle[0].precioUnitario).toFixed(6)}</precioUnitario>
      <descuento>${detalles.detalle[0].descuento}</descuento>
      <precioTotalSinImpuesto>${detalles.detalle[0].precioTotalSinImpuesto}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>4</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>${detalles.detalle[0].precioTotalSinImpuesto}</baseImponible>
          <valor>15.00</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="PRUEBA">Factura generada para probar sistema</campoAdicional>
  </infoAdicional>
</factura>`;
    
return {
    xml: xml.trim(),  // Solo quitar espacios al inicio/final, mantener formato interno
    claveAcceso
};
};

// Algoritmo de clave de acceso REAL basado en el ejemplo que funciona
function generateClaveAccesoReal(fecha, secuencial) {
    const [dia, mes, año] = fecha.split("/");
    
    // Formato: ddmmaaaaTTemisorrrrrrrrrrrrASccccccsssssssssxxxxxxxxx
    const fechaParte = dia + mes + año;                    // 8 dígitos: 14072025
    const tipoEmision = "01";                               // 2 dígitos: 01  
    const ruc = "1793204144001";                           // 13 dígitos: 1793204144001
    const ambiente = "1";                                   // 1 dígito: 1
    const serie = "001001";                                // 6 dígitos: 001001
    const secuencialParte = secuencial.padStart(9, "0");  // 9 dígitos
    
    // Los últimos 9 dígitos: usar patrón del ejemplo real
    // El ejemplo tiene: 66214153 + verificador
    // Vamos a usar timestamp + padding para unicidad
    const timestamp = Date.now().toString().slice(-8);
    const codigoNumerico = timestamp.padStart(8, "0");
    
    // Construir clave base (48 dígitos)
    const claveBase = fechaParte + tipoEmision + ruc + ambiente + serie + secuencialParte + codigoNumerico;
    
    // Calcular dígito verificador módulo 11
    const verificador = calcularModulo11(claveBase);
    
    return claveBase + verificador;
}

function calcularModulo11(clave) {
    const multiplicadores = [2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7];
    
    let suma = 0;
    for (let i = 0; i < clave.length; i++) {
        suma += parseInt(clave[i]) * multiplicadores[i];
    }
    
    const residuo = suma % 11;
    
    if (residuo === 0) return "0";
    if (residuo === 1) return "1"; 
    return (11 - residuo).toString();
}

module.exports = {
    createInvoice
};