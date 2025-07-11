const mysql = require("mysql2/promise");
const {config} = require("./env");

// Pool de conexiones para mejor rendimiento con opciones válidas para MySQL2
const pool = mysql.createPool({
	host: config.database.host,
	port: config.database.port,
	user: config.database.user,
	password: config.database.password,
	database: config.database.database,
	timezone: config.database.timezone,
	charset: config.database.charset,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
	// Usar connectTimeout en lugar de timeout
	connectTimeout: 60000, // 60 segundos
	// Remover acquireTimeout ya que no es soportado por mysql2
	// acquireTimeout: 60000, // No soportado
	// timeout: 60000, // No soportado
});

// Función para probar la conexión
const testConnection = async () => {
	try {
		const connection = await pool.getConnection();
		console.log("✅ Conexión a MySQL establecida correctamente");
		connection.release();
		return true;
	} catch (error) {
		console.error("❌ Error conectando a MySQL:", error.message);
		return false;
	}
};

// Función para ejecutar queries con manejo de errores
const executeQuery = async (query, params = []) => {
	try {
		const [results] = await pool.execute(query, params);
		return results;
	} catch (error) {
		console.error("❌ Error ejecutando query:", error.message);
		throw error;
	}
};

// Función para transacciones
const executeTransaction = async (queries) => {
	const connection = await pool.getConnection();
	await connection.beginTransaction();

	try {
		const results = [];
		for (const {query, params} of queries) {
			const [result] = await connection.execute(query, params);
			results.push(result);
		}

		await connection.commit();
		connection.release();
		return results;
	} catch (error) {
		await connection.rollback();
		connection.release();
		throw error;
	}
};

// Cerrar pool de conexiones de forma elegante
const closePool = async () => {
	try {
		await pool.end();
		console.log("✅ Pool de conexiones MySQL cerrado");
	} catch (error) {
		console.error("❌ Error cerrando pool MySQL:", error.message);
	}
};

module.exports = {
	pool,
	testConnection,
	executeQuery,
	executeTransaction,
	closePool,
};
