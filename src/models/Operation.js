const { executeQuery } = require('../config/database');

class Operation {
  constructor(data) {
    this.id = data.id;
    this.usuario_id = data.usuario_id;
    this.clave_acceso = data.clave_acceso;
    this.numero_secuencial = data.numero_secuencial;
    this.fecha_emision = data.fecha_emision;
    this.total_factura = data.total_factura;
    this.estado = data.estado;
    this.respuesta_recepcion = data.respuesta_recepcion;
    this.respuesta_autorizacion = data.respuesta_autorizacion;
    this.numero_autorizacion = data.numero_autorizacion;
    this.fecha_autorizacion = data.fecha_autorizacion;
    this.mensaje_error = data.mensaje_error;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Crear nueva operación
  static async create(operationData) {
    const {
      usuario_id,
      clave_acceso,
      numero_secuencial,
      fecha_emision,
      total_factura,
      estado = 'generando'
    } = operationData;

    const query = `
      INSERT INTO operaciones_facturacion (
        usuario_id, clave_acceso, numero_secuencial, 
        fecha_emision, total_factura, estado
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [
      usuario_id,
      clave_acceso,
      numero_secuencial,
      fecha_emision,
      total_factura,
      estado
    ];

    const result = await executeQuery(query, params);
    return await Operation.findById(result.insertId);
  }

  // Buscar operación por ID
  static async findById(id) {
    const query = 'SELECT * FROM operaciones_facturacion WHERE id = ?';
    const results = await executeQuery(query, [id]);
    
    if (results.length === 0) {
      return null;
    }
    
    return new Operation(results[0]);
  }

  // Buscar operación por clave de acceso
  static async findByAccessKey(claveAcceso) {
    const query = 'SELECT * FROM operaciones_facturacion WHERE clave_acceso = ?';
    const results = await executeQuery(query, [claveAcceso]);
    
    if (results.length === 0) {
      return null;
    }
    
    return new Operation(results[0]);
  }

  // Buscar operaciones por usuario
  static async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM operaciones_facturacion 
      WHERE usuario_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const results = await executeQuery(query, [userId, limit, offset]);
    
    return results.map(data => new Operation(data));
  }

  // Actualizar estado de operación
  static async updateStatus(id, estado, mensaje_error = null) {
    const query = `
      UPDATE operaciones_facturacion 
      SET estado = ?, mensaje_error = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    await executeQuery(query, [estado, mensaje_error, id]);
    return await Operation.findById(id);
  }

  // Actualizar respuesta de recepción
  static async updateReceptionResponse(id, respuesta) {
    const query = `
      UPDATE operaciones_facturacion 
      SET respuesta_recepcion = ?, estado = 'enviado', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    await executeQuery(query, [JSON.stringify(respuesta), id]);
    return await Operation.findById(id);
  }

  // Actualizar respuesta de autorización
  static async updateAuthorizationResponse(id, respuesta, numeroAutorizacion = null) {
    const estado = numeroAutorizacion ? 'autorizado' : 'rechazado';
    
    const query = `
      UPDATE operaciones_facturacion 
      SET respuesta_autorizacion = ?, numero_autorizacion = ?, 
          fecha_autorizacion = CURRENT_TIMESTAMP, estado = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    
    await executeQuery(query, [
      JSON.stringify(respuesta), 
      numeroAutorizacion, 
      estado, 
      id
    ]);
    
    return await Operation.findById(id);
  }

  // Obtener estadísticas de operaciones por usuario
  static async getStatsByUserId(userId) {
    const query = `
      SELECT 
        estado,
        COUNT(*) as cantidad,
        SUM(total_factura) as total_monto
      FROM operaciones_facturacion 
      WHERE usuario_id = ? 
      GROUP BY estado
    `;
    
    const results = await executeQuery(query, [userId]);
    
    const stats = {
      total: 0,
      montoTotal: 0,
      porEstado: {}
    };

    results.forEach(row => {
      stats.total += row.cantidad;
      stats.montoTotal += parseFloat(row.total_monto || 0);
      stats.porEstado[row.estado] = {
        cantidad: row.cantidad,
        monto: parseFloat(row.total_monto || 0)
      };
    });

    return stats;
  }

  // Verificar si existe una operación con el mismo secuencial para el usuario
  static async existsBySequential(userId, secuencial) {
    const query = `
      SELECT COUNT(*) as count 
      FROM operaciones_facturacion 
      WHERE usuario_id = ? AND numero_secuencial = ?
    `;
    
    const results = await executeQuery(query, [userId, secuencial]);
    return results[0].count > 0;
  }

  // Método para obtener datos públicos
  toJSON() {
    return { ...this };
  }
}

module.exports = Operation;