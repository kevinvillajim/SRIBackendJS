const crypto = require('crypto');
const { config } = require('../config/env');

// Algoritmo de encriptación 
const algorithm = 'aes-256-cbc';

// Generar clave de encriptación desde la clave de configuración
const getEncryptionKey = () => {
  // Crear una clave de 32 bytes (256 bits) a partir de la clave de configuración
  return crypto.createHash('sha256').update(config.security.encryptionKey).digest();
};

// Encriptar texto (versión corregida)
const encrypt = (text) => {
  if (!text) return null;
  
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16); // Vector de inicialización de 16 bytes
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combinar IV y texto encriptado
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('❌ Error encriptando:', error.message);
    throw new Error('Error en encriptación');
  }
};

// Desencriptar texto (versión corregida)
const decrypt = (encryptedData) => {
  if (!encryptedData) return null;
  
  try {
    const key = getEncryptionKey();
    const parts = encryptedData.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Formato de datos encriptados inválido');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Error desencriptando:', error.message);
    throw new Error('Error en desencriptación');
  }
};

// Función simplificada usando bcrypt para passwords (más segura para contraseñas)
const bcrypt = require('bcryptjs');

// Hashear contraseña (para almacenamiento seguro)
const hashPassword = async (password) => {
  if (!password) return null;
  
  try {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('❌ Error hasheando contraseña:', error.message);
    throw new Error('Error en hash de contraseña');
  }
};

// Verificar contraseña hasheada
const verifyPassword = async (password, hashedPassword) => {
  if (!password || !hashedPassword) return false;
  
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    console.error('❌ Error verificando contraseña:', error.message);
    return false;
  }
};

// Para certificados - versión temporal sin encriptación para debugging
const encryptCertificatePassword = (password) => {
  // TEMPORAL: No encriptar para debugging
  console.log('🔧 DEBUG: Almacenando contraseña sin encriptar (temporal)');
  return password; // Retornar texto plano temporalmente
};

const decryptCertificatePassword = (encryptedPassword) => {
  // TEMPORAL: No desencriptar para debugging
  console.log('🔧 DEBUG: Leyendo contraseña sin desencriptar (temporal)');
  return encryptedPassword; // Retornar tal como está
};

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  encryptCertificatePassword,
  decryptCertificatePassword
};