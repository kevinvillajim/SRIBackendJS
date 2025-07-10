const { createError } = require('./errorHandler');

// Validar datos básicos de facturación
const validateBillingData = (req, res, next) => {
  const errors = [];
  const { 
    infoFactura, 
    detalles, 
    infoAdicional 
  } = req.body;

  // Validar información de factura (obligatoria)
  if (!infoFactura) {
    errors.push('infoFactura es obligatoria');
  } else {
    // Validar campos obligatorios de infoFactura
    const requiredFields = [
      'fechaEmision',
      'dirEstablecimiento', 
      'obligadoContabilidad',
      'tipoIdentificacionComprador',
      'razonSocialComprador',
      'identificacionComprador',
      'direccionComprador',
      'totalSinImpuestos',
      'totalDescuento',
      'totalConImpuestos',
      'importeTotal',
      'moneda',
      'pagos'
    ];

    requiredFields.forEach(field => {
      if (!infoFactura[field]) {
        errors.push(`infoFactura.${field} es obligatorio`);
      }
    });

    // Validar formato de fecha
    if (infoFactura.fechaEmision && !/^\d{2}\/\d{2}\/\d{4}$/.test(infoFactura.fechaEmision)) {
      errors.push('infoFactura.fechaEmision debe tener formato DD/MM/YYYY');
    }

    // Validar obligado contabilidad
    if (infoFactura.obligadoContabilidad && !['SI', 'NO'].includes(infoFactura.obligadoContabilidad)) {
      errors.push('infoFactura.obligadoContabilidad debe ser "SI" o "NO"');
    }

    // Validar tipo identificación comprador
    const tiposValidos = ['04', '05', '06', '07', '08'];
    if (infoFactura.tipoIdentificacionComprador && 
        !tiposValidos.includes(infoFactura.tipoIdentificacionComprador)) {
      errors.push('infoFactura.tipoIdentificacionComprador debe ser válido (04, 05, 06, 07, 08)');
    }

    // Validar montos
    const camposMonetarios = ['totalSinImpuestos', 'totalDescuento', 'importeTotal'];
    camposMonetarios.forEach(campo => {
      if (infoFactura[campo] && isNaN(parseFloat(infoFactura[campo]))) {
        errors.push(`infoFactura.${campo} debe ser un número válido`);
      }
    });

    // Validar totalConImpuestos
    if (infoFactura.totalConImpuestos) {
      if (!infoFactura.totalConImpuestos.totalImpuesto || 
          !Array.isArray(infoFactura.totalConImpuestos.totalImpuesto)) {
        errors.push('infoFactura.totalConImpuestos.totalImpuesto debe ser un array');
      }
    }

    // Validar pagos
    if (infoFactura.pagos) {
      if (!infoFactura.pagos.pago || !Array.isArray(infoFactura.pagos.pago)) {
        errors.push('infoFactura.pagos.pago debe ser un array');
      }
    }
  }

  // Validar detalles (obligatorios)
  if (!detalles) {
    errors.push('detalles es obligatorio');
  } else {
    if (!detalles.detalle || !Array.isArray(detalles.detalle)) {
      errors.push('detalles.detalle debe ser un array');
    } else if (detalles.detalle.length === 0) {
      errors.push('debe incluir al menos un detalle');
    } else {
      // Validar cada detalle
      detalles.detalle.forEach((detalle, index) => {
        const requiredDetailFields = [
          'codigoPrincipal',
          'descripcion',
          'cantidad',
          'precioUnitario',
          'descuento',
          'precioTotalSinImpuesto',
          'impuestos'
        ];

        requiredDetailFields.forEach(field => {
          if (!detalle[field]) {
            errors.push(`detalles.detalle[${index}].${field} es obligatorio`);
          }
        });

        // Validar impuestos del detalle
        if (detalle.impuestos) {
          if (!detalle.impuestos.impuesto || !Array.isArray(detalle.impuestos.impuesto)) {
            errors.push(`detalles.detalle[${index}].impuestos.impuesto debe ser un array`);
          }
        }
      });
    }
  }

  if (errors.length > 0) {
    return next(createError('Errores de validación en datos de facturación', 400, errors));
  }

  next();
};

// Validar ID de usuario
const validateUserIdParam = (req, res, next) => {
  const { userId } = req.params;

  if (!userId || !/^\d+$/.test(userId)) {
    return next(createError('ID de usuario inválido', 400));
  }

  req.params.userId = parseInt(userId);
  next();
};

// Sanitizar datos de facturación
const sanitizeBillingData = (req, res, next) => {
  // Sanitizar strings en infoFactura
  if (req.body.infoFactura) {
    const stringFields = [
      'razonSocialComprador',
      'direccionComprador',
      'dirEstablecimiento'
    ];

    stringFields.forEach(field => {
      if (req.body.infoFactura[field]) {
        req.body.infoFactura[field] = req.body.infoFactura[field].toString().trim();
      }
    });

    // Convertir montos a string con formato correcto
    const moneyFields = [
      'totalSinImpuestos',
      'totalDescuento', 
      'importeTotal'
    ];

    moneyFields.forEach(field => {
      if (req.body.infoFactura[field]) {
        const value = parseFloat(req.body.infoFactura[field]);
        req.body.infoFactura[field] = value.toFixed(2);
      }
    });
  }

  // Sanitizar detalles
  if (req.body.detalles && req.body.detalles.detalle) {
    req.body.detalles.detalle.forEach(detalle => {
      if (detalle.descripcion) {
        detalle.descripcion = detalle.descripcion.toString().trim();
      }
      
      // Formatear montos
      const moneyFields = ['cantidad', 'precioUnitario', 'descuento', 'precioTotalSinImpuesto'];
      moneyFields.forEach(field => {
        if (detalle[field]) {
          const value = parseFloat(detalle[field]);
          if (field === 'cantidad') {
            detalle[field] = value.toFixed(6); // Cantidad con 6 decimales
          } else {
            detalle[field] = value.toFixed(2); // Precios con 2 decimales
          }
        }
      });
    });
  }

  next();
};

// Validar datos opcionales
const validateOptionalBillingData = (req, res, next) => {
  const warnings = [];

  // Validar reembolsos si están presentes
  if (req.body.reembolsos) {
    if (!req.body.reembolsos.reembolsoDetalle || !Array.isArray(req.body.reembolsos.reembolsoDetalle)) {
      warnings.push('reembolsos.reembolsoDetalle debe ser un array si se incluye');
    }
  }

  // Validar retenciones si están presentes
  if (req.body.retenciones) {
    if (!req.body.retenciones.retencion || !Array.isArray(req.body.retenciones.retencion)) {
      warnings.push('retenciones.retencion debe ser un array si se incluye');
    }
  }

  // Adjuntar warnings al request para uso posterior
  req.billingWarnings = warnings;

  next();
};

module.exports = {
  validateBillingData,
  validateUserIdParam,
  sanitizeBillingData,
  validateOptionalBillingData
};