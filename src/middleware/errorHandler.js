const {config, getLogTimestamp} = require("../config/env");

// Middleware principal de manejo de errores
const errorHandler = (error, req, res, next) => {
	// Log del error
	const timestamp = getLogTimestamp();
	console.error(`[${timestamp}] ERROR en ${req.method} ${req.originalUrl}:`);
	console.error(error);

	// Respuesta base
	let response = {
		success: false,
		message: "Error interno del servidor",
		timestamp,
	};

	// Diferentes tipos de errores
	if (error.name === "ValidationError") {
		// Errores de validación
		response.status = 400;
		response.message = "Error de validación";
		response.details = error.details || error.message;
	} else if (error.code === "ER_DUP_ENTRY") {
		// Error de entrada duplicada en MySQL
		response.status = 409;
		response.message = "Registro duplicado";
		response.details = "El recurso ya existe";
	} else if (error.code === "ER_NO_REFERENCED_ROW_2") {
		// Error de referencia foránea en MySQL
		response.status = 400;
		response.message = "Referencia inválida";
		response.details = "El registro referenciado no existe";
	} else if (error.code === "ENOENT") {
		// Archivo no encontrado
		response.status = 404;
		response.message = "Archivo no encontrado";
	} else if (error.code === "LIMIT_FILE_SIZE") {
		// Archivo muy grande (Multer)
		response.status = 413;
		response.message = "Archivo muy grande";
		response.details = "El archivo excede el tamaño máximo permitido";
	} else if (error.code === "LIMIT_UNEXPECTED_FILE") {
		// Campo de archivo inesperado (Multer)
		response.status = 400;
		response.message = "Campo de archivo inválido";
	} else if (error.status) {
		// Errores con status definido (incluyendo validaciones personalizadas)
		response.status = error.status;
		response.message = error.message || "Error del cliente";
		if (error.details) {
			response.details = error.details;
		}
	} else {
		// Error genérico del servidor
		response.status = 500;
		response.message = "Error interno del servidor";
	}

	// En desarrollo, incluir información adicional
	if (config.NODE_ENV === "development") {
		response.stack = error.stack;
		// Si no hay detalles ya asignados, usar el mensaje del error
		if (!response.details) {
			response.details = error.details || error.message;
		}
	}

	// Enviar respuesta
	res.status(response.status).json(response);
};

// Middleware para manejar errores async
const asyncHandler = (fn) => {
	return (req, res, next) => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
};

// Función para crear errores personalizados
const createError = (message, status = 500, details = null) => {
	const error = new Error(message);
	error.status = status;
	if (details) error.details = details;
	return error;
};

module.exports = {
	errorHandler,
	asyncHandler,
	createError,
};
