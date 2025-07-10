const { executeQuery } = require('../config/database');

class User {
  constructor(data) {
    this.id = data.id;
    this.ruc = data.ruc;
    this.razon_social = data.razon_social;
    this.nombre_comercial = data.nombre_comercial;
    this.ambiente = data.ambiente;
    this.establecimiento = data.establecimiento;
    this.punto_emision = data.punto_emision;
    this.direccion_matriz = data.direccion_matriz;
    this.obligado_contabilidad = data.obligado_contabilidad;
    this.contribuyente_especial = data.contribuyente_especial;
    this.agente_retencion = data.agente_retencion;
    this.contribuyente_rimpe = data.contribuyente_rimpe;
    this.tiene_certificado = data.tiene_certificado;
    this.certificado_filename = data.certificado_filename;
    this.certificado_password = data.certificado_password;
    this.certificado_fecha_subida = data.certificado_fecha_subida;
    this.certificado_activo = data.certificado_activo;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Crear nuevo usuario
  static async create(userData) {
    const {
      ruc,
      razon_social,
      nombre_comercial,
      ambiente = '1',
      establecimiento = '001',
      punto_emision = '001',
      direccion_matriz,
      obligado_contabilidad = 'NO',
      contribuyente_especial,
      agente_retencion,
      contribuyente_rimpe
    } = userData;

    const query = `
      INSERT INTO usuarios (
        ruc, razon_social, nombre_comercial, ambiente, establecimiento, 
        punto_emision, direccion_matriz, obligado_contabilidad, 
        contribuyente_especial, agente_retencion, contribuyente_rimpe
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      ruc,
      razon_social,
      nombre_comercial || null,
      ambiente,
      establecimiento,
      punto_emision,
      direccion_matriz,
      obligado_contabilidad,
      contribuyente_especial || null,
      agente_retencion || null,
      contribuyente_rimpe || null
    ];

    const result = await executeQuery(query, params);
    
    // Obtener el usuario creado
    return await User.findById(result.insertId);
  }

  // Buscar usuario por ID
  static async findById(id) {
    const query = 'SELECT * FROM usuarios WHERE id = ?';
    const results = await executeQuery(query, [id]);
    
    if (results.length === 0) {
      return null;
    }
    
    return new User(results[0]);
  }

  // Buscar usuario por RUC
  static async findByRuc(ruc) {
    const query = 'SELECT * FROM usuarios WHERE ruc = ?';
    const results = await executeQuery(query, [ruc]);
    
    if (results.length === 0) {
      return null;
    }
    
    return new User(results[0]);
  }

  // Obtener todos los usuarios (con paginación)
  static async findAll(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM usuarios 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const results = await executeQuery(query, [limit, offset]);
    
    return results.map(userData => new User(userData));
  }

  // Actualizar usuario
  static async updateById(id, updateData) {
    const allowedFields = [
      'razon_social', 'nombre_comercial', 'ambiente', 
      'establecimiento', 'punto_emision', 'direccion_matriz',
      'obligado_contabilidad', 'contribuyente_especial', 
      'agente_retencion', 'contribuyente_rimpe'
    ];

    const fieldsToUpdate = [];
    const values = [];

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        fieldsToUpdate.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fieldsToUpdate.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    values.push(id);

    const query = `
      UPDATE usuarios 
      SET ${fieldsToUpdate.join(', ')} 
      WHERE id = ?
    `;

    await executeQuery(query, values);
    
    return await User.findById(id);
  }

  // Actualizar información del certificado
  static async updateCertificate(id, certificateData) {
    const {
      filename,
      password,
      activo = false
    } = certificateData;

    const query = `
      UPDATE usuarios 
      SET tiene_certificado = ?, certificado_filename = ?, 
          certificado_password = ?, certificado_fecha_subida = NOW(),
          certificado_activo = ?
      WHERE id = ?
    `;

    const params = [true, filename, password, activo, id];
    
    await executeQuery(query, params);
    
    return await User.findById(id);
  }

  // Activar/desactivar certificado
  static async toggleCertificate(id, activo) {
    const query = `
      UPDATE usuarios 
      SET certificado_activo = ?
      WHERE id = ?
    `;

    await executeQuery(query, [activo, id]);
    
    return await User.findById(id);
  }

  // Verificar si RUC ya existe
  static async existsByRuc(ruc) {
    const query = 'SELECT COUNT(*) as count FROM usuarios WHERE ruc = ?';
    const results = await executeQuery(query, [ruc]);
    
    return results[0].count > 0;
  }

  // Método para obtener datos públicos (sin info sensible)
  toPublicJSON() {
    const publicData = { ...this };
    delete publicData.certificado_password;
    return publicData;
  }

  // Método para obtener datos completos (para uso interno)
  toJSON() {
    return { ...this };
  }
}

module.exports = User;