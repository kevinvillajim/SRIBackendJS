const User = require('../models/User');
const Operation = require('../models/Operation');
const Document = require('../models/Document');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { success, created, notFound, badRequest, serverError } = require('../utils/responses');
const { decryptCertificatePassword } = require('../utils/encryption');
const { certificateFileExists } = require('../middleware/upload');
const { config } = require('../config/env');
const path = require('path');

// Importar funciones de open-factura
const {
  generateInvoice,
  generateInvoiceXml,
  getP12FromLocalFile,
  signXml,
  documentReception,
  documentAuthorization
} = require('open-factura');

// Generar factura completa
const generateBilling = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const billingData = req.body;

  console.log('🧾 Iniciando proceso de facturación para usuario:', userId);

  // 1. Verificar que el usuario existe
  const user = await User.findById(userId);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  // 2. Verificar que el usuario tiene certificado activo
  if (!user.tiene_certificado || !user.certificado_activo || !user.certificado_filename) {
    return badRequest(res, 'El usuario no tiene un certificado activo');
  }

  // 3. Verificar que el archivo de certificado existe
  if (!certificateFileExists(user.certificado_filename)) {
    await User.toggleCertificate(userId, false);
    return badRequest(res, 'Archivo de certificado no encontrado');
  }

  let operation = null;

  try {
    console.log('🧾 Preparando datos de facturación...');

    // 4. Preparar datos para open-factura
    const invoiceInput = {
      infoTributaria: {
        ambiente: user.ambiente,
        tipoEmision: "1",
        razonSocial: user.razon_social,
        nombreComercial: user.nombre_comercial || user.razon_social,
        ruc: user.ruc,
        codDoc: "01", // Factura
        estab: user.establecimiento,
        ptoEmi: user.punto_emision,
        secuencial: generateSequential(billingData.secuencial),
        dirMatriz: user.direccion_matriz,
        obligadoContabilidad: user.obligado_contabilidad,
        contribuyenteEspecial: user.contribuyente_especial,
        agenteRetencion: user.agente_retencion,
        contribuyenteRimpe: user.contribuyente_rimpe
      },
      infoFactura: billingData.infoFactura,
      detalles: billingData.detalles,
      reembolsos: billingData.reembolsos,
      retenciones: billingData.retenciones,
      infoSustitutivaGuiaRemision: billingData.infoSustitutivaGuiaRemision,
      otrosRubrosTerceros: billingData.otrosRubrosTerceros,
      tipoNegociable: billingData.tipoNegociable,
      maquinaFiscal: billingData.maquinaFiscal,
      infoAdicional: billingData.infoAdicional
    };

    console.log('🧾 Generando factura con open-factura...');

    // 5. Generar factura con open-factura
    const { invoice, accessKey } = generateInvoice(invoiceInput);
    
    console.log('🧾 Factura generada. Clave de acceso:', accessKey);

    // 6. Verificar que no existe operación con la misma clave de acceso
    const existingOperation = await Operation.findByAccessKey(accessKey);
    if (existingOperation) {
      return badRequest(res, 'Ya existe una operación con esta clave de acceso');
    }

    // 7. Crear operación en base de datos
    operation = await Operation.create({
      usuario_id: userId,
      clave_acceso: accessKey,
      numero_secuencial: invoiceInput.infoTributaria.secuencial,
      fecha_emision: parseDate(billingData.infoFactura.fechaEmision),
      total_factura: parseFloat(billingData.infoFactura.importeTotal),
      estado: 'xml_generado'
    });

    console.log('🧾 Operación creada con ID:', operation.id);

    // 8. Generar XML
    console.log('🧾 Generando XML...');
    const invoiceXml = generateInvoiceXml(invoice);

    // 9. Guardar XML original
    await Document.create({
      operacion_id: operation.id,
      tipo_documento: 'original',
      contenido_xml: invoiceXml,
      nombre_archivo: `factura_${accessKey}_original.xml`,
      clave_acceso: accessKey
    });

    console.log('🧾 XML original guardado');

    // 10. Cargar certificado y contraseña
    console.log('🧾 Cargando certificado...');
    const certificatePath = path.join(config.paths.certificates, user.certificado_filename);
    const p12Buffer = getP12FromLocalFile(certificatePath);
    const certificatePassword = decryptCertificatePassword(user.certificado_password);

    if (!p12Buffer) {
      throw new Error('No se pudo cargar el certificado');
    }

    // 11. Firmar XML
    console.log('🧾 Firmando XML...');
    await Operation.updateStatus(operation.id, 'firmado');

    const signedXml = await signXml(p12Buffer, certificatePassword, invoiceXml);

    // 12. Guardar XML firmado
    await Document.create({
      operacion_id: operation.id,
      tipo_documento: 'firmado',
      contenido_xml: signedXml,
      nombre_archivo: `factura_${accessKey}_firmado.xml`,
      clave_acceso: accessKey
    });

    console.log('🧾 XML firmado y guardado');

    // 13. Enviar al SRI para recepción
    console.log('🧾 Enviando al SRI...');
    await Operation.updateStatus(operation.id, 'enviado');

    const receptionUrl = user.ambiente === '1' 
      ? config.sri.reception.test 
      : config.sri.reception.prod;

    const receptionResult = await documentReception(signedXml, receptionUrl);
    
    console.log('🧾 Respuesta de recepción SRI:', receptionResult);
    await Operation.updateReceptionResponse(operation.id, receptionResult);

    // 14. Autorizar documento
    console.log('🧾 Solicitando autorización...');
    
    const authorizationUrl = user.ambiente === '1' 
      ? config.sri.authorization.test 
      : config.sri.authorization.prod;

    const authorizationResult = await documentAuthorization(accessKey, authorizationUrl);
    
    console.log('🧾 Respuesta de autorización SRI:', authorizationResult);

    // 15. Procesar respuesta de autorización
    let numeroAutorizacion = null;
    let estadoFinal = 'rechazado';

    if (authorizationResult && authorizationResult.RespuestaAutorizacionComprobante) {
      const autorizaciones = authorizationResult.RespuestaAutorizacionComprobante.autorizaciones;
      if (autorizaciones && autorizaciones.autorizacion) {
        const autorizacion = Array.isArray(autorizaciones.autorizacion) 
          ? autorizaciones.autorizacion[0] 
          : autorizaciones.autorizacion;
        
        if (autorizacion.estado === 'AUTORIZADO') {
          numeroAutorizacion = autorizacion.numeroAutorizacion;
          estadoFinal = 'autorizado';
        }
      }
    }

    await Operation.updateAuthorizationResponse(operation.id, authorizationResult, numeroAutorizacion);

    console.log(`🧾 Proceso completado. Estado final: ${estadoFinal}`);

    // 16. Preparar respuesta
    const finalOperation = await Operation.findById(operation.id);
    const documents = await Document.findByOperationId(operation.id);

    const response = {
      operation: finalOperation.toJSON(),
      documents: documents.map(doc => doc.toPublicJSON()),
      billingInfo: {
        accessKey,
        authorizationNumber: numeroAutorizacion,
        status: estadoFinal,
        receptionResponse: receptionResult,
        authorizationResponse: authorizationResult
      },
      warnings: req.billingWarnings || []
    };

    const message = estadoFinal === 'autorizado' 
      ? 'Factura generada y autorizada exitosamente'
      : 'Factura generada pero no autorizada por el SRI';

    return created(res, response, message);

  } catch (error) {
    console.error('❌ Error en proceso de facturación:', error);

    // Actualizar estado de operación si existe
    if (operation) {
      await Operation.updateStatus(operation.id, 'error', error.message);
    }

    // Determinar tipo de error
    let errorMessage = 'Error procesando la factura';
    if (error.message.includes('certificate') || error.message.includes('p12')) {
      errorMessage = 'Error con el certificado digital';
    } else if (error.message.includes('SRI') || error.message.includes('SOAP')) {
      errorMessage = 'Error comunicándose con el SRI';
    } else if (error.message.includes('XML')) {
      errorMessage = 'Error generando o firmando el XML';
    }

    return serverError(res, errorMessage, error.message);
  }
});

// Obtener operación por ID
const getOperation = asyncHandler(async (req, res) => {
  const { operationId } = req.params;

  const operation = await Operation.findById(operationId);
  if (!operation) {
    return notFound(res, 'Operación no encontrada');
  }

  const documents = await Document.findByOperationId(operationId);

  const response = {
    operation: operation.toJSON(),
    documents: documents.map(doc => doc.toPublicJSON())
  };

  return success(res, response, 'Operación obtenida exitosamente');
});

// Obtener operaciones de un usuario
const getUserOperations = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  if (limit > 100) {
    return badRequest(res, 'El límite máximo es 100 operaciones por página');
  }

  const user = await User.findById(userId);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  const operations = await Operation.findByUserId(userId, limit, offset);
  const stats = await Operation.getStatsByUserId(userId);

  const response = {
    operations: operations.map(op => op.toJSON()),
    stats,
    pagination: {
      page,
      limit,
      total: operations.length,
      hasNext: operations.length === limit
    }
  };

  return success(res, response, 'Operaciones obtenidas exitosamente');
});

// Funciones auxiliares
const generateSequential = (providedSequential) => {
  if (providedSequential) {
    return String(providedSequential).padStart(9, '0');
  }
  
  // Generar secuencial automático basado en timestamp
  const timestamp = Date.now();
  const sequential = timestamp.toString().slice(-9);
  return sequential.padStart(9, '0');
};

const parseDate = (dateString) => {
  // Convertir DD/MM/YYYY a YYYY-MM-DD para MySQL
  const [day, month, year] = dateString.split('/');
  return `${year}-${month}-${day}`;
};

module.exports = {
  generateBilling,
  getOperation,
  getUserOperations
};