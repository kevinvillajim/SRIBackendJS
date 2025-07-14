// Utilidades para generar respuestas consistentes
const {getEcuadorTime} = require("../config/env");

const success = (
	res,
	data = null,
	message = "Operación exitosa",
	status = 200
) => {
	const response = {
		success: true,
		message,
		timestamp: getEcuadorTime(),
	};

	if (data !== null) {
		response.data = data;
	}

	return res.status(status).json(response);
};

const error = (
	res,
	message = "Error interno",
	status = 500,
	details = null
) => {
	const response = {
		success: false,
		message,
		timestamp: getEcuadorTime(),
	};

	if (details) {
		response.details = details;
	}

	return res.status(status).json(response);
};

const created = (res, data, message = "Recurso creado exitosamente") => {
	return success(res, data, message, 201);
};

const notFound = (res, message = "Recurso no encontrado") => {
	return error(res, message, 404);
};

const badRequest = (res, message = "Solicitud inválida", details = null) => {
	return error(res, message, 400, details);
};

const unauthorized = (res, message = "No autorizado") => {
	return error(res, message, 401);
};

const forbidden = (res, message = "Acceso prohibido") => {
	return error(res, message, 403);
};

const conflict = (
	res,
	message = "Conflicto con el estado actual del recurso"
) => {
	return error(res, message, 409);
};

const serverError = (
	res,
	message = "Error interno del servidor",
	details = null
) => {
	return error(res, message, 500, details);
};

module.exports = {
	success,
	error,
	created,
	notFound,
	badRequest,
	unauthorized,
	forbidden,
	conflict,
	serverError,
};
