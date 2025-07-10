const User = require('../models/User');
const { asyncHandler, createError } = require('../middleware/errorHandler');
const { success, created, notFound, conflict, badRequest } = require('../utils/responses');

// Registrar nuevo usuario
const registerUser = asyncHandler(async (req, res) => {
  const { ruc } = req.body;

  // Verificar si el RUC ya existe
  const existingUser = await User.existsByRuc(ruc);
  if (existingUser) {
    return conflict(res, 'El RUC ya está registrado en el sistema');
  }

  // Crear usuario
  const newUser = await User.create(req.body);

  return created(res, newUser.toPublicJSON(), 'Usuario registrado exitosamente');
});

// Obtener usuario por ID
const getUserById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  return success(res, user.toPublicJSON(), 'Usuario encontrado');
});

// Obtener usuario por RUC
const getUserByRuc = asyncHandler(async (req, res) => {
  const { ruc } = req.params;

  const user = await User.findByRuc(ruc);
  
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  return success(res, user.toPublicJSON(), 'Usuario encontrado');
});

// Listar todos los usuarios con paginación
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  // Validar límites
  if (limit > 100) {
    return badRequest(res, 'El límite máximo es 100 usuarios por página');
  }

  const users = await User.findAll(limit, offset);
  
  const response = {
    users: users.map(user => user.toPublicJSON()),
    pagination: {
      page,
      limit,
      total: users.length,
      hasNext: users.length === limit
    }
  };

  return success(res, response, 'Usuarios obtenidos exitosamente');
});

// Actualizar usuario
const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Verificar que el usuario existe
  const existingUser = await User.findById(id);
  if (!existingUser) {
    return notFound(res, 'Usuario no encontrado');
  }

  // Actualizar usuario
  const updatedUser = await User.updateById(id, req.body);

  return success(res, updatedUser.toPublicJSON(), 'Usuario actualizado exitosamente');
});

// Obtener estado del certificado
const getCertificateStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  
  if (!user) {
    return notFound(res, 'Usuario no encontrado');
  }

  const certificateInfo = {
    tiene_certificado: user.tiene_certificado,
    certificado_activo: user.certificado_activo,
    certificado_fecha_subida: user.certificado_fecha_subida,
    filename: user.certificado_filename
  };

  return success(res, certificateInfo, 'Estado del certificado obtenido');
});

// Activar/desactivar certificado
const toggleCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  if (typeof activo !== 'boolean') {
    return badRequest(res, 'El campo "activo" debe ser un valor booleano');
  }

  // Verificar que el usuario existe
  const existingUser = await User.findById(id);
  if (!existingUser) {
    return notFound(res, 'Usuario no encontrado');
  }

  // Verificar que tiene certificado
  if (!existingUser.tiene_certificado) {
    return badRequest(res, 'El usuario no tiene certificado cargado');
  }

  // Actualizar estado
  const updatedUser = await User.toggleCertificate(id, activo);

  return success(
    res, 
    updatedUser.toPublicJSON(), 
    `Certificado ${activo ? 'activado' : 'desactivado'} exitosamente`
  );
});

// Verificar disponibilidad de RUC
const checkRucAvailability = asyncHandler(async (req, res) => {
  const { ruc } = req.params;

  const exists = await User.existsByRuc(ruc);

  return success(res, {
    ruc,
    available: !exists,
    exists
  }, exists ? 'RUC ya está registrado' : 'RUC disponible');
});

module.exports = {
  registerUser,
  getUserById,
  getUserByRuc,
  getAllUsers,
  updateUser,
  getCertificateStatus,
  toggleCertificate,
  checkRucAvailability
};