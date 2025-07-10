# API de Certificados - Facturación SRI

## Endpoints Disponibles

### 1. Subir Certificado
**POST** `/api/users/:id/certificate`

Sube un certificado .p12 para el usuario especificado.

**Content-Type:** `multipart/form-data`

**Body (Form Data):**
- `certificate` (File): Archivo .p12 o .pfx
- `password` (Text): Contraseña del certificado

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "message": "Certificado subido exitosamente",
  "data": {
    "message": "Certificado subido y validado exitosamente",
    "certificate": {
      "filename": "1_1720598400000.p12",
      "uploadDate": "2025-07-10T06:00:00.000Z",
      "fileSize": 2048,
      "isActive": true,
      "validation": {
        "isValid": true,
        "warnings": []
      }
    },
    "user": { ... }
  }
}
```

### 2. Obtener Estado del Certificado
**GET** `/api/users/:id/certificate/status`

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Estado del certificado obtenido",
  "data": {
    "hasCertificate": true,
    "isActive": true,
    "uploadDate": "2025-07-10T06:00:00.000Z",
    "filename": "1_1720598400000.p12",
    "fileExists": true,
    "fileInfo": {
      "exists": true,
      "size": 2048,
      "created": "2025-07-10T06:00:00.000Z",
      "modified": "2025-07-10T06:00:00.000Z"
    },
    "details": {
      "fileName": "1_1720598400000.p12",
      "fileSize": 2048,
      "uploadDate": "2025-07-10T06:00:00.000Z",
      "extension": ".p12"
    }
  }
}
```

### 3. Activar/Desactivar Certificado
**PUT** `/api/users/:id/certificate/toggle`

**Body:**
```json
{
  "active": true
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Certificado activado exitosamente",
  "data": { ... }
}
```

### 4. Validar Certificado
**POST** `/api/users/:id/certificate/validate`

Valida el certificado con la contraseña proporcionada.

**Body:**
```json
{
  "password": "contraseña_del_certificado"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Certificado validado exitosamente",
  "data": {
    "isValid": true,
    "errors": [],
    "warnings": [],
    "info": {
      "fileSize": 2048,
      "fileName": "1_1720598400000.p12",
      "p12Loaded": true,
      "status": "Certificado cargado correctamente"
    }
  }
}
```

### 5. Eliminar Certificado
**DELETE** `/api/users/:id/certificate`

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Certificado eliminado exitosamente",
  "data": { ... }
}
```

## Validaciones

### Archivo de Certificado
- **Extensiones permitidas:** `.p12`, `.pfx`
- **Tamaño máximo:** 5MB
- **Tipos MIME aceptados:** 
  - `application/x-pkcs12`
  - `application/pkcs12`
  - `application/octet-stream`

### Contraseña
- **Obligatoria:** Sí
- **Longitud mínima:** 4 caracteres (recomendado)
- **Longitud máxima:** 100 caracteres

## Seguridad

### Almacenamiento
- **Archivos:** Almacenados en filesystem (`/uploads/certificates/`)
- **Contraseñas:** Encriptadas con AES-256-CBC
- **Nombres de archivo:** Únicos con formato `{userId}_{timestamp}.p12`

### Validaciones de Seguridad
- Verificación de tipo de archivo
- Validación de estructura del certificado
- Encriptación de contraseñas en base de datos

## Códigos de Error

- **400**: Datos inválidos, archivo no válido
- **404**: Usuario no encontrado
- **413**: Archivo muy grande
- **500**: Error interno del servidor

## Casos de Uso

### 1. Flujo Completo
```bash
# 1. Subir certificado
POST /api/users/1/certificate
Form: certificate=file.p12, password=mypass

# 2. Verificar estado
GET /api/users/1/certificate/status

# 3. Validar certificado
POST /api/users/1/certificate/validate
Body: {"password": "mypass"}

# 4. Usar certificado para facturación
POST /api/billing/generate
```

### 2. Gestión de Estados
- **Sin certificado:** `hasCertificate: false`
- **Con certificado inactivo:** `hasCertificate: true, isActive: false`
- **Con certificado activo:** `hasCertificate: true, isActive: true`

## Notas Importantes

1. **Sustitución:** Al subir un nuevo certificado, el anterior se elimina automáticamente
2. **Activación automática:** Los certificados se activan automáticamente al subirlos
3. **Validación previa:** Los certificados se validan antes de almacenar
4. **Detección de errores:** Si el archivo físico no existe, se marca como inactivo automáticamente

## Integración con Facturación

Los certificados activos pueden ser utilizados directamente por el módulo de facturación para firmar documentos XML usando la librería `open-factura`.