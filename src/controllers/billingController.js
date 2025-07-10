const User = require('../models/User');
const Operation = require('../models/Operation');
const Document = require('../models/Document');
const { asyncHandler } = require('../middleware/errorHandler');
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

  // Verificar usuario
  const user = await User.findById(userId);
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  // Verificar certificado
  if (!user.tiene_certificado || !user.certificado_activo || !user.certificado_filename) {
    return badRequest(res, 'El usuario no tiene un certificado activo');
  }

  if (!certificateFileExists(user.certificado_filename)) {
    await User.toggleCertificate(userId, false);
    return badRequest(res, 'Archivo de certificado no encontrado');
  }

  let operation = null;

  try {
    // Preparar datos para open-factura
    const invoiceInput = {
      infoTributaria: {
        ambiente: user.ambiente,
        tipoEmision: "1",
        razonSocial: user.razon_social,
        nombreComercial: user.nombre_comercial || user.razon_social,
        ruc: user.ruc,
        codDoc: "01",
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

    // Generar factura
    const { invoice, accessKey } = generateInvoice(invoiceInput);
    console.log('✅ Factura generada. Clave de acceso:', accessKey);

    // Verificar operación duplicada
    const existingOperation = await Operation.findByAccessKey(accessKey);
    if (existingOperation) {
      return badRequest(res, 'Ya existe una operación con esta clave de acceso');
    }

    // Crear operación
    operation = await Operation.create({
      usuario_id: userId,
      clave_acceso: accessKey,
      numero_secuencial: invoiceInput.infoTributaria.secuencial,
      fecha_emision: parseDate(billingData.infoFactura.fechaEmision),
      total_factura: parseFloat(billingData.infoFactura.importeTotal),
      estado: 'xml_generado'
    });

    // Generar XML
    const invoiceXml = generateInvoiceXml(invoice);
    console.log('✅ XML generado');

    // Guardar XML original
    await Document.create({
      operacion_id: operation.id,
      tipo_documento: 'original',
      contenido_xml: invoiceXml,
      nombre_archivo: `factura_${accessKey}_original.xml`,
      clave_acceso: accessKey
    });

    // Cargar certificado
    const certificatePath = path.join(config.paths.certificates, user.certificado_filename);
    const p12Buffer = getP12FromLocalFile(certificatePath);
    const certificatePassword = decryptCertificatePassword(user.certificado_password);

    if (!p12Buffer) {
      throw new Error('No se pudo cargar el certificado');
    }

    // Intentar firmado con manejo de errores específico
    console.log('🔐 Intentando firmar XML...');
    
    try {
      // Limpiar XML antes de firmar
      let cleanXml = invoiceXml.trim();
      
      // Agregar encoding si no existe
      if (!cleanXml.includes('encoding=')) {
        cleanXml = cleanXml.replace('<?xml version="1.0"?>', '<?xml version="1.0" encoding="UTF-8"?>');
      }
      
      console.log('🔧 DEBUG: Iniciando firmado con parámetros:');
      console.log('🔧 DEBUG: - p12Buffer type:', typeof p12Buffer);
      console.log('🔧 DEBUG: - p12Buffer length:', p12Buffer.byteLength);
      console.log('🔧 DEBUG: - password length:', certificatePassword.length);
      console.log('🔧 DEBUG: - xml length:', cleanXml.length);
      
      const signedXml = await signXml(p12Buffer, certificatePassword, cleanXml);
      
      console.log('✅ XML firmado exitosamente');
      await Operation.updateStatus(operation.id, 'firmado');

      // Guardar XML firmado
      await Document.create({
        operacion_id: operation.id,
        tipo_documento: 'firmado',
        contenido_xml: signedXml,
        nombre_archivo: `factura_${accessKey}_firmado.xml`,
        clave_acceso: accessKey
      });

      // Continuar con envío al SRI
      console.log('📤 Enviando al SRI...');
      await Operation.updateStatus(operation.id, 'enviado');

      try {
        const receptionUrl = user.ambiente === '1' 
          ? config.sri.reception.test 
          : config.sri.reception.prod;

        const receptionResult = await documentReception(signedXml, receptionUrl);
        console.log('✅ Respuesta de recepción SRI:', receptionResult);
        await Operation.updateReceptionResponse(operation.id, receptionResult);

        // Autorizar documento
        console.log('📋 Solicitando autorización...');
        
        const authorizationUrl = user.ambiente === '1' 
          ? config.sri.authorization.test 
          : config.sri.authorization.prod;

        const authorizationResult = await documentAuthorization(accessKey, authorizationUrl);
        console.log('✅ Respuesta de autorización SRI:', authorizationResult);

        // Procesar respuesta de autorización
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

        console.log(`🎉 Proceso completado. Estado final: ${estadoFinal}`);

        // Respuesta completa
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
          }
        };

        const message = estadoFinal === 'autorizado' 
          ? 'Factura generada, firmada y autorizada exitosamente'
          : 'Factura generada y firmada, pero no autorizada por el SRI';

        return created(res, response, message);

      } catch (sriError) {
        console.error('❌ Error comunicándose con el SRI:', sriError.message);
        await Operation.updateStatus(operation.id, 'error', `Error SRI: ${sriError.message}`);
        
        // Responder con éxito del firmado aunque falle el SRI
        const finalOperation = await Operation.findById(operation.id);
        const documents = await Document.findByOperationId(operation.id);

        const response = {
          operation: finalOperation.toJSON(),
          documents: documents.map(doc => doc.toPublicJSON()),
          billingInfo: {
            accessKey,
            authorizationNumber: null,
            status: 'firmado',
            receptionResponse: null,
            authorizationResponse: null
          },
          warnings: [`Error comunicándose con el SRI: ${sriError.message}`]
        };

        return created(res, response, 'Factura generada y firmada exitosamente (error en SRI)');
      }

    } catch (signError) {
      console.error('❌ Error específico en firmado:', signError.message);
      console.error('❌ Stack completo:', signError.stack);
      
      // Información detallada del error
      if (signError.message.includes('attributes')) {
        console.error('❌ Error relacionado con atributos del certificado');
        console.error('❌ Posibles causas:');
        console.error('   - Certificado corrupto o inválido');
        console.error('   - Contraseña incorrecta');
        console.error('   - Formato de certificado no compatible');
      }
      
      await Operation.updateStatus(operation.id, 'error', `Error firmado: ${signError.message}`);
      
      // Responder con error específico de firmado
      const finalOperation = await Operation.findById(operation.id);
      const documents = await Document.findByOperationId(operation.id);

      const response = {
        operation: finalOperation.toJSON(),
        documents: documents.map(doc => doc.toPublicJSON()),
        billingInfo: {
          accessKey,
          authorizationNumber: null,
          status: 'error',
          receptionResponse: null,
          authorizationResponse: null
        },
        warnings: [`Error en firmado: ${signError.message}`]
      };

      return created(res, response, 'Factura generada pero no se pudo firmar');
    }

  } catch (error) {
    console.error('❌ Error general:', error.message);

    if (operation) {
      await Operation.updateStatus(operation.id, 'error', error.message);
    }

    return serverError(res, 'Error procesando la factura', error.message);
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
  
  const timestamp = Date.now();
  const sequential = timestamp.toString().slice(-9);
  return sequential.padStart(9, '0');
};

const parseDate = (dateString) => {
  const [day, month, year] = dateString.split('/');
  return `${year}-${month}-${day}`;
};

module.exports = {
  generateBilling,
  getOperation,
  getUserOperations
};