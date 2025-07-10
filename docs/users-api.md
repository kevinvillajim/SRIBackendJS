# API de Usuarios - Facturación SRI

## Endpoints Disponibles

### 1. Registrar Usuario
**POST** `/api/users/register`

Registra un nuevo usuario factudador en el sistema.

**Body (JSON):**
```json
{
  "ruc": "1234567890001",                    // Obligatorio: RUC de 13 dígitos
  "razon_social": "EMPRESA S.A.",            // Obligatorio: Razón social
  "nombre_comercial": "EMPRESA",             // Opcional: Nombre comercial
  "direccion_matriz": "Av. Principal 123",  // Obligatorio: Dirección matriz
  "ambiente": "1",                           // Opcional: "1"=pruebas, "2"=producción
  "establecimiento": "001",                  // Opcional: Código establecimiento
  "punto_emision": "001",                    // Opcional: Código punto emisión
  "obligado_contabilidad": "SI",             // Opcional: "SI" o "NO"
  "contribuyente_especial": "123",           // Opcional: Código especial
  "agente_retencion": "1",                   // Opcional: Código agente
  "contribuyente_rimpe": "RIMPE"             // Opcional: Tipo RIMPE
}
```

**Respuesta exitosa (201):**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente",
  "data": {
    "id": 1,
    "ruc": "1234567890001",
    "razon_social": "EMPRESA S.A.",
    ...
  }
}
```

### 2. Obtener Usuario por ID
**GET** `/api/users/:id`

**Respuesta exitosa (200):**
```json
{
  "success": true,
  "message": "Usuario encontrado",
  "data": { ... }
}
```

### 3. Obtener Usuario por RUC
**GET** `/api/users/ruc/:ruc`

### 4. Listar Usuarios
**GET** `/api/users?page=1&limit=10`

**Query Parameters:**
- `page`: Número de página (default: 1)
- `limit`: Usuarios por página (max: 100, default: 10)

### 5. Actualizar Usuario
**PUT** `/api/users/:id`

**Body:** Campos a actualizar (solo incluir los que cambien)

### 6. Verificar Disponibilidad RUC
**GET** `/api/users/check-ruc/:ruc`

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "ruc": "1234567890001",
    "available": false,
    "exists": true
  }
}
```

### 7. Estado del Certificado
**GET** `/api/users/:id/certificate`

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "tiene_certificado": false,
    "certificado_activo": false,
    "certificado_fecha_subida": null,
    "filename": null
  }
}
```

### 8. Activar/Desactivar Certificado
**PUT** `/api/users/:id/certificate/toggle`

**Body:**
```json
{
  "activo": true
}
```

## Códigos de Error

- **400**: Datos de entrada inválidos
- **404**: Usuario no encontrado
- **409**: RUC ya existe
- **500**: Error interno del servidor

## Validaciones

### RUC Ecuatoriano
- Debe tener exactamente 13 dígitos
- Debe terminar en "001" (empresas)
- Tercer dígito debe ser "9" (empresas)
- Primeros dos dígitos: provincia válida (01-24)

### Campos Obligatorios
- `ruc`: RUC válido
- `razon_social`: No vacío, máximo 300 caracteres
- `direccion_matriz`: No vacío

### Valores Permitidos
- `ambiente`: "1" (pruebas) o "2" (producción)
- `obligado_contabilidad`: "SI" o "NO"
- `establecimiento`: 3 dígitos numéricos
- `punto_emision`: 3 dígitos numéricos