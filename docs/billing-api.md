# API de Facturación - SRI Ecuador

## Descripción

El módulo de facturación integra la librería `open-factura` para generar, firmar y enviar facturas electrónicas al SRI de Ecuador.

## Flujo de Facturación

1. **Validación**: Datos de entrada y usuario con certificado activo
2. **Generación**: Factura JSON y XML usando `open-factura`
3. **Firmado**: XML con certificado .p12 del usuario
4. **Envío**: Documento al SRI para recepción
5. **Autorización**: Solicitud de autorización al SRI
6. **Almacenamiento**: XMLs y respuestas en base de datos

## Endpoints

### 1. Generar Factura
**POST** `/api/billing/generate/:userId`

Genera una factura completa desde datos hasta autorización del SRI.

**Parámetros:**
- `userId`: ID del usuario que emite la factura

**Body (JSON):**
```json
{
  "secuencial": "000000001",
  "infoFactura": {
    "fechaEmision": "10/07/2025",
    "dirEstablecimiento": "Dirección del establecimiento",
    "obligadoContabilidad": "SI",
    "tipoIdentificacionComprador": "05",
    "razonSocialComprador": "NOMBRE DEL CLIENTE",
    "identificacionComprador": "1234567890",
    "direccionComprador": "Dirección del cliente",
    "totalSinImpuestos": "100.00",
    "totalDescuento": "0.00",
    "totalConImpuestos": {
      "totalImpuesto": [
        {
          "codigo": "2",
          "codigoPorcentaje": "2",
          "baseImponible": "100.00",
          "tarifa": "12.00",
          "valor": "12.00"
        }
      ]
    },
    "importeTotal": "112.00",
    "moneda": "DOLAR",
    "pagos": {
      "pago": [
        {
          "formaPago": "01",
          "total": "112.00",
          "plazo": "30",
          "unidadTiempo": "dias"
        }
      ]
    }
  },
  "detalles": {
    "detalle": [
      {
        "codigoPrincipal": "PROD001",
        "descripcion": "Descripción del producto",
        "cantidad": "1.000000",
        "precioUnitario": "100.000000",
        "descuento": "0.00",
        "precioTotalSinImpuesto": "100.00",
        "impuestos": {
          "impuesto": [
            {
              "codigo": "2",
              "codigoPorcentaje": "2",
              "tarifa": "12.00",
              "baseImponible": "100.00",
              "valor": "12.00"
            }
          ]
        }
      }
    ]
  }
}
```

**Respuesta Exitosa (201):**
```json
{
  "success": true,
  "message": "Factura generada y autorizada exitosamente",
  "data": {
    "operation": {
      "id": 1,
      "usuario_id": 1,
      "clave_acceso": "1007202501179320414400110010010000000011234567890",
      "numero_secuencial": "000000001",
      "fecha_emision": "2025-07-10",
      "total_factura": "112.00",
      "estado": "autorizado",
      "numero_autorizacion": "1234567890123456789",
      "created_at": "2025-07-10T06:00:00.000Z"
    },
    "documents": [
      {
        "id": 1,
        "tipo_documento": "original",
        "nombre_archivo": "factura_1007202501179320414400110010010000000011234567890_original.xml",
        "contenido_xml_length": 2048,
        "contenido_xml_preview": "<?xml version=\"1.0\"?>..."
      },
      {
        "id": 2,
        "tipo_documento": "firmado",
        "nombre_archivo": "factura_1007202501179320414400110010010000000011234567890_firmado.xml",
        "contenido_xml_length": 5120,
        "contenido_xml_preview": "<?xml version=\"1.0\"?>..."
      }
    ],
    "billingInfo": {
      "accessKey": "1007202501179320414400110010010000000011234567890",
      "authorizationNumber": "1234567890123456789",
      "status": "autorizado",
      "receptionResponse": { ... },
      "authorizationResponse": { ... }
    }
  }
}
```

### 2. Obtener Operación
**GET** `/api/billing/operation/:operationId`

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "operation": { ... },
    "documents": [ ... ]
  }
}
```

### 3. Operaciones de Usuario
**GET** `/api/billing/user/:userId/operations?page=1&limit=10`

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "operations": [ ... ],
    "stats": {
      "total": 10,
      "montoTotal": 1000.00,
      "porEstado": {
        "autorizado": { "cantidad": 8, "monto": 800.00 },
        "rechazado": { "cantidad": 2, "monto": 200.00 }
      }
    },
    "pagination": { ... }
  }
}
```

## Campos Obligatorios

### infoFactura
- `fechaEmision`: Formato DD/MM/YYYY
- `dirEstablecimiento`: Dirección del establecimiento
- `obligadoContabilidad`: "SI" o "NO"
- `tipoIdentificacionComprador`: "04", "05", "06", "07", "08"
- `razonSocialComprador`: Nombre/razón social del cliente
- `identificacionComprador`: RUC/cédula del cliente
- `direccionComprador`: Dirección del cliente
- `totalSinImpuestos`: Total antes de impuestos
- `totalDescuento`: Total de descuentos
- `totalConImpuestos`: Array con impuestos aplicados
- `importeTotal`: Total final de la factura
- `moneda`: Generalmente "DOLAR"
- `pagos`: Array con formas de pago

### detalles
- `detalle`: Array con al menos un producto/servicio
  - `codigoPrincipal`: Código del producto
  - `descripcion`: Descripción del producto/servicio
  - `cantidad`: Cantidad (6 decimales)
  - `precioUnitario`: Precio unitario
  - `descuento`: Descuento aplicado
  - `precioTotalSinImpuesto`: Subtotal sin impuestos
  - `impuestos`: Array con impuestos del ítem

## Estados de Operación

- **generando**: Iniciando proceso
- **xml_generado**: XML creado
- **firmado**: XML firmado con certificado
- **enviado**: Enviado al SRI para recepción
- **autorizado**: Autorizado por el SRI ✅
- **rechazado**: Rechazado por el SRI ❌
- **error**: Error en el proceso ❌

## Códigos de Impuestos

### Tipos de Impuesto (codigo)
- **2**: IVA
- **3**: ICE  
- **5**: IRBPNR

### Porcentajes IVA (codigoPorcentaje)
- **0**: 0%
- **2**: 12%
- **3**: 14%
- **6**: No objeto de impuesto
- **7**: Exento de IVA
- **8**: IVA diferenciado

### Formas de Pago (formaPago)
- **01**: Sin utilización del sistema financiero
- **15**: Compensación de deudas
- **16**: Tarjeta de débito
- **17**: Dinero electrónico
- **18**: Tarjeta prepago
- **19**: Tarjeta de crédito
- **20**: Otros con utilización del sistema financiero

## Requisitos Previos

1. **Usuario registrado** con datos tributarios completos
2. **Certificado digital .p12** cargado y activo
3. **Ambiente SRI habilitado** (pruebas o producción)
4. **Datos de factura válidos** según especificaciones SRI

## Errores Comunes

- **400**: Datos de factura inválidos
- **400**: Usuario sin certificado activo
- **404**: Usuario no encontrado
- **500**: Error comunicándose con el SRI
- **500**: Error con certificado digital
- **500**: Error generando/firmando XML

## Ejemplo Completo

Ver archivo `examples/invoice-example.json` para un ejemplo completo de datos de factura válidos.