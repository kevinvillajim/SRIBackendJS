const { executeQuery } = require('../config/database');

class Document {
  constructor(data) {
    this.id = data.id;
    this.operacion_id = data.operacion_id;
    this.tipo_documento = data.tipo_documento;
    this.contenido_xml = data.contenido_xml;
    this.nombre_archivo = data.nombre_archivo;
    this.clave_acceso = data.clave_acceso;
    this.created_at = data.created_at;
  }

  // Crear nuevo documento XML
  static async create(documentData) {
    const {
      operacion_id,
      tipo_documento,
      contenido_xml,
      nombre_archivo,
      clave_acceso
    } = documentData;

    const query = `
      INSERT INTO documentos_xml (
        operacion_id, tipo_documento, contenido_xml, 
        nombre_archivo, clave_acceso
      ) VALUES (?, ?, ?, ?, ?)
    `;

    const params = [
      operacion_id,
      tipo_documento,
      contenido_xml,
      nombre_archivo,
      clave_acceso
    ];

    const result = await executeQuery(query, params);
    return await Document.findById(result.insertId);
  }

  // Buscar documento por ID
  static async findById(id) {
    const query = 'SELECT * FROM documentos_xml WHERE id = ?';
    const results = await executeQuery(query, [id]);
    
    if (results.length === 0) {
      return null;
    }
    
    return new Document(results[0]);
  }

  // Buscar documentos por operación
  static async findByOperationId(operacionId) {
    const query = `
      SELECT * FROM documentos_xml 
      WHERE operacion_id = ? 
      ORDER BY created_at ASC
    `;
    const results = await executeQuery(query, [operacionId]);
    
    return results.map(data => new Document(data));
  }

  // Buscar documento por tipo y operación
  static async findByOperationAndType(operacionId, tipoDocumento) {
    const query = `
      SELECT * FROM documentos_xml 
      WHERE operacion_id = ? AND tipo_documento = ?
    `;
    const results = await executeQuery(query, [operacionId, tipoDocumento]);
    
    if (results.length === 0) {
      return null;
    }
    
    return new Document(results[0]);
  }

  // Buscar documentos por clave de acceso
  static async findByAccessKey(claveAcceso) {
    const query = `
      SELECT * FROM documentos_xml 
      WHERE clave_acceso = ? 
      ORDER BY created_at ASC
    `;
    const results = await executeQuery(query, [claveAcceso]);
    
    return results.map(data => new Document(data));
  }

  // Obtener XML original y firmado de una operación
  static async getXMLsByOperation(operacionId) {
    const documents = await Document.findByOperationId(operacionId);
    
    const result = {
      original: null,
      firmado: null
    };

    documents.forEach(doc => {
      if (doc.tipo_documento === 'original') {
        result.original = doc;
      } else if (doc.tipo_documento === 'firmado') {
        result.firmado = doc;
      }
    });

    return result;
  }

  // Eliminar documentos de una operación
  static async deleteByOperationId(operacionId) {
    const query = 'DELETE FROM documentos_xml WHERE operacion_id = ?';
    await executeQuery(query, [operacionId]);
  }

  // Contar documentos por usuario (a través de operaciones)
  static async countByUserId(userId) {
    const query = `
      SELECT COUNT(*) as count 
      FROM documentos_xml d
      INNER JOIN operaciones_facturacion o ON d.operacion_id = o.id
      WHERE o.usuario_id = ?
    `;
    
    const results = await executeQuery(query, [userId]);
    return results[0].count;
  }

  // Obtener estadísticas de documentos
  static async getStats() {
    const query = `
      SELECT 
        tipo_documento,
        COUNT(*) as cantidad,
        AVG(LENGTH(contenido_xml)) as tamaño_promedio
      FROM documentos_xml 
      GROUP BY tipo_documento
    `;
    
    const results = await executeQuery(query);
    
    const stats = {
      total: 0,
      porTipo: {}
    };

    results.forEach(row => {
      stats.total += row.cantidad;
      stats.porTipo[row.tipo_documento] = {
        cantidad: row.cantidad,
        tamañoPromedio: Math.round(row.tamaño_promedio || 0)
      };
    });

    return stats;
  }

  // Método para obtener datos públicos (sin contenido XML completo)
  toPublicJSON() {
    const publicData = { ...this };
    // No incluir contenido XML completo en respuestas públicas por tamaño
    if (publicData.contenido_xml) {
      publicData.contenido_xml_length = publicData.contenido_xml.length;
      publicData.contenido_xml_preview = publicData.contenido_xml.substring(0, 200) + '...';
      delete publicData.contenido_xml;
    }
    return publicData;
  }

  // Método para obtener datos completos
  toJSON() {
    return { ...this };
  }
}

module.exports = Document;