-- Base de datos para servicio de facturación electrónica SRI Ecuador
CREATE DATABASE IF NOT EXISTS facturacion_sri CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE facturacion_sri;

-- Tabla de usuarios facturadores
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ruc VARCHAR(13) NOT NULL UNIQUE,
    razon_social VARCHAR(300) NOT NULL,
    nombre_comercial VARCHAR(300),
    ambiente ENUM('1', '2') NOT NULL DEFAULT '1', -- 1=pruebas, 2=produccion
    establecimiento VARCHAR(3) NOT NULL DEFAULT '001',
    punto_emision VARCHAR(3) NOT NULL DEFAULT '001',
    direccion_matriz TEXT NOT NULL,
    obligado_contabilidad ENUM('SI', 'NO') NOT NULL DEFAULT 'NO',
    contribuyente_especial VARCHAR(50) NULL,
    agente_retencion VARCHAR(10) NULL,
    contribuyente_rimpe VARCHAR(100) NULL,
    
    -- Datos del certificado
    tiene_certificado BOOLEAN DEFAULT FALSE,
    certificado_filename VARCHAR(255) NULL,
    certificado_password VARCHAR(255) NULL, -- Encriptado
    certificado_fecha_subida TIMESTAMP NULL,
    certificado_activo BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_ruc (ruc),
    INDEX idx_ambiente (ambiente)
);

-- Tabla para almacenar documentos XML generados
CREATE TABLE documentos_xml (
    id INT AUTO_INCREMENT PRIMARY KEY,
    operacion_id INT NOT NULL,
    tipo_documento ENUM('original', 'firmado') NOT NULL,
    contenido_xml LONGTEXT NOT NULL,
    nombre_archivo VARCHAR(255) NOT NULL,
    clave_acceso VARCHAR(49) NOT NULL, -- Clave de acceso del comprobante
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_operacion (operacion_id),
    INDEX idx_clave_acceso (clave_acceso),
    INDEX idx_tipo (tipo_documento)
);

-- Tabla para registrar operaciones de facturación
CREATE TABLE operaciones_facturacion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    clave_acceso VARCHAR(49) NOT NULL UNIQUE,
    
    -- Datos de la operación
    numero_secuencial VARCHAR(9) NOT NULL,
    fecha_emision DATE NOT NULL,
    total_factura DECIMAL(12,2) NOT NULL,
    
    -- Estado de la operación
    estado ENUM('generando', 'xml_generado', 'firmado', 'enviado', 'autorizado', 'rechazado', 'error') NOT NULL DEFAULT 'generando',
    
    -- Respuestas del SRI
    respuesta_recepcion TEXT NULL,
    respuesta_autorizacion TEXT NULL,
    numero_autorizacion VARCHAR(50) NULL,
    fecha_autorizacion TIMESTAMP NULL,
    
    -- Información de errores
    mensaje_error TEXT NULL,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT,
    INDEX idx_usuario (usuario_id),
    INDEX idx_estado (estado),
    INDEX idx_fecha_emision (fecha_emision),
    INDEX idx_clave_acceso (clave_acceso)
);

-- Relación entre operaciones y documentos XML
ALTER TABLE documentos_xml 
ADD FOREIGN KEY (operacion_id) REFERENCES operaciones_facturacion(id) ON DELETE CASCADE;

-- Insertar usuario de prueba (opcional para testing)
INSERT INTO usuarios (
    ruc, 
    razon_social, 
    nombre_comercial, 
    ambiente, 
    direccion_matriz, 
    obligado_contabilidad
) VALUES (
    '0999999999001', 
    'EMPRESA DE PRUEBAS S.A.', 
    'EMPRESA PRUEBAS', 
    '1', 
    'Av. Principal 123, Quito, Ecuador', 
    'SI'
);