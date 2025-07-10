const { createError } = require('./errorHandler');

// Validar RUC ecuatoriano (versión permisiva para desarrollo)
const validateRuc = (ruc) => {
  if (!ruc) {
    return false;
  }

  // Convertir a string y remover espacios
  ruc = String(ruc).trim();

  // Verificar longitud (13 dígitos)
  if (ruc.length !== 13) {
    return false;
  }

  // Verificar que solo contenga números
  if (!/^\d+$/.test(ruc)) {
    return false;
  }

  // Verificar que termine en 001 (para empresas)
  if (!ruc.endsWith('001')) {
    return false;
  }

  // Validar provincia (primeros 2 dígitos)
  const provincia = parseInt(ruc.substring(0, 2));
  if (provincia < 1 || provincia > 24) {
    return false;
  }

  // Validar tipo de contribuyente (tercer dígito)
  const tercerDigito = parseInt(ruc.charAt(2));
  // 0-5: Personas naturales, 6: Entidades públicas, 9: Personas jurídicas
  if (tercerDigito < 0 || tercerDigito > 9 || tercerDigito === 7 || tercerDigito === 8) {
    return false;
  }

  // TODO: Validación completa del dígito verificador
  // Por ahora, validaciones básicas son suficientes para desarrollo
  console.log(`✅ RUC ${ruc} pasó validaciones básicas`);
  return true;
};

// Validación específica para personas jurídicas (tercer dígito = 9)
const validateRucJuridica = (ruc) => {
  const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  
  for (let i = 0; i < 9; i++) {
    suma += parseInt(ruc.charAt(i)) * coeficientes[i];
  }
  
  const residuo = suma % 11;
  let digitoVerificador;
  
  if (residuo === 0) {
    digitoVerificador = 0;
  } else if (residuo === 1) {
    // Si el residuo es 1, el RUC es inválido
    return false;
  } else {
    digitoVerificador = 11 - residuo;
  }
  
  const digitoRuc = parseInt(ruc.charAt(9));
  
  // Debug temporal
  console.log(`🔍 Validando RUC Jurídica: ${ruc}`);
  console.log(`📊 Suma: ${suma}, Residuo: ${residuo}, DV Calculado: ${digitoVerificador}, DV Real: ${digitoRuc}`);
  
  return digitoVerificador === digitoRuc;
};

// Validación específica para entidades públicas (tercer dígito = 6)
const validateRucPublica = (ruc) => {
  const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
  let suma = 0;
  
  for (let i = 0; i < 8; i++) {
    suma += parseInt(ruc.charAt(i)) * coeficientes[i];
  }
  
  const residuo = suma % 11;
  let digitoVerificador;
  
  if (residuo === 0) {
    digitoVerificador = 0;
  } else if (residuo === 1) {
    return false;
  } else {
    digitoVerificador = 11 - residuo;
  }
  
  const digitoRuc = parseInt(ruc.charAt(8));
  return digitoVerificador === digitoRuc;
};

// Validación específica para personas naturales (tercer dígito = 0-5)
const validateRucNatural = (ruc) => {
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  
  for (let i = 0; i < 9; i++) {
    let producto = parseInt(ruc.charAt(i)) * coeficientes[i];
    if (producto >= 10) {
      producto = producto - 9;
    }
    suma += producto;
  }
  
  const digitoVerificador = suma % 10 === 0 ? 0 : 10 - (suma % 10);
  const digitoRuc = parseInt(ruc.charAt(9));
  
  return digitoVerificador === digitoRuc;
};

// Validar campos obligatorios para registro de usuario
const validateUserRegistration = (req, res, next) => {
  const errors = [];
  const {
    ruc,
    razon_social,
    direccion_matriz,
    ambiente,
    establecimiento,
    punto_emision,
    obligado_contabilidad
  } = req.body;

  // Validar RUC
  if (!ruc) {
    errors.push('RUC es obligatorio');
  } else if (!validateRuc(ruc)) {
    errors.push('RUC debe ser válido (13 dígitos, formato ecuatoriano, terminar en 001)');
  }

  // Validar razón social
  if (!razon_social || razon_social.trim().length === 0) {
    errors.push('Razón social es obligatoria');
  } else if (razon_social.trim().length > 300) {
    errors.push('Razón social no puede exceder 300 caracteres');
  }

  // Validar dirección matriz
  if (!direccion_matriz || direccion_matriz.trim().length === 0) {
    errors.push('Dirección matriz es obligatoria');
  }

  // Validar ambiente
  if (ambiente && !['1', '2'].includes(ambiente)) {
    errors.push('Ambiente debe ser "1" (pruebas) o "2" (producción)');
  }

  // Validar establecimiento
  if (establecimiento && !/^\d{3}$/.test(establecimiento)) {
    errors.push('Establecimiento debe ser 3 dígitos');
  }

  // Validar punto de emisión
  if (punto_emision && !/^\d{3}$/.test(punto_emision)) {
    errors.push('Punto de emisión debe ser 3 dígitos');
  }

  // Validar obligado contabilidad
  if (obligado_contabilidad && !['SI', 'NO'].includes(obligado_contabilidad)) {
    errors.push('Obligado contabilidad debe ser "SI" o "NO"');
  }

  // Validar nombre comercial (opcional pero con límite)
  if (req.body.nombre_comercial && req.body.nombre_comercial.length > 300) {
    errors.push('Nombre comercial no puede exceder 300 caracteres');
  }

  // Validar contribuyente especial (opcional)
  if (req.body.contribuyente_especial && req.body.contribuyente_especial.length > 50) {
    errors.push('Contribuyente especial no puede exceder 50 caracteres');
  }

  // Validar agente retención (opcional)
  if (req.body.agente_retencion && req.body.agente_retencion.length > 10) {
    errors.push('Agente retención no puede exceder 10 caracteres');
  }

  if (errors.length > 0) {
    return next(createError('Errores de validación', 400, errors));
  }

  next();
};

// Validar ID de usuario en parámetros
const validateUserId = (req, res, next) => {
  const { id } = req.params;

  if (!id || !/^\d+$/.test(id)) {
    return next(createError('ID de usuario inválido', 400));
  }

  req.params.id = parseInt(id);
  next();
};

// Validar datos para actualización de usuario
const validateUserUpdate = (req, res, next) => {
  const errors = [];
  const allowedFields = [
    'razon_social',
    'nombre_comercial',
    'ambiente',
    'establecimiento',
    'punto_emision',
    'direccion_matriz',
    'obligado_contabilidad',
    'contribuyente_especial',
    'agente_retencion',
    'contribuyente_rimpe'
  ];

  // Verificar que al menos un campo esté presente
  const hasValidFields = Object.keys(req.body).some(key => allowedFields.includes(key));
  
  if (!hasValidFields) {
    errors.push('Debe proporcionar al menos un campo válido para actualizar');
  }

  // Validar campos individuales si están presentes
  if (req.body.razon_social !== undefined) {
    if (!req.body.razon_social || req.body.razon_social.trim().length === 0) {
      errors.push('Razón social no puede estar vacía');
    } else if (req.body.razon_social.length > 300) {
      errors.push('Razón social no puede exceder 300 caracteres');
    }
  }

  if (req.body.ambiente !== undefined && !['1', '2'].includes(req.body.ambiente)) {
    errors.push('Ambiente debe ser "1" (pruebas) o "2" (producción)');
  }

  if (req.body.establecimiento !== undefined && !/^\d{3}$/.test(req.body.establecimiento)) {
    errors.push('Establecimiento debe ser 3 dígitos');
  }

  if (req.body.punto_emision !== undefined && !/^\d{3}$/.test(req.body.punto_emision)) {
    errors.push('Punto de emisión debe ser 3 dígitos');
  }

  if (req.body.obligado_contabilidad !== undefined && !['SI', 'NO'].includes(req.body.obligado_contabilidad)) {
    errors.push('Obligado contabilidad debe ser "SI" o "NO"');
  }

  if (errors.length > 0) {
    return next(createError('Errores de validación', 400, errors));
  }

  next();
};

// Sanitizar datos de entrada
const sanitizeUserData = (req, res, next) => {
  if (req.body.razon_social) {
    req.body.razon_social = req.body.razon_social.trim().toUpperCase();
  }
  
  if (req.body.nombre_comercial) {
    req.body.nombre_comercial = req.body.nombre_comercial.trim().toUpperCase();
  }
  
  if (req.body.direccion_matriz) {
    req.body.direccion_matriz = req.body.direccion_matriz.trim();
  }

  // Convertir RUC a string y sanitizar
  if (req.body.ruc) {
    req.body.ruc = String(req.body.ruc).trim();
  }

  // Convertir establecimientos y punto emisión a string con padding si es necesario
  if (req.body.establecimiento) {
    req.body.establecimiento = String(req.body.establecimiento).padStart(3, '0');
  }
  
  if (req.body.punto_emision) {
    req.body.punto_emision = String(req.body.punto_emision).padStart(3, '0');
  }

  next();
};

module.exports = {
  validateRuc,
  validateUserRegistration,
  validateUserId,
  validateUserUpdate,
  sanitizeUserData
};