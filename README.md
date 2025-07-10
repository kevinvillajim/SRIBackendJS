# Backend Facturación SRI Ecuador

API REST para facturación electrónica compatible con el SRI de Ecuador utilizando la librería open-factura.

## Características

- ✅ Registro de usuarios facturadores
- ✅ Gestión de certificados .p12
- ✅ Generación de facturas electrónicas
- ✅ Autorización automática con el SRI
- ✅ Almacenamiento de XMLs y respuestas

## Instalación

1. **Clonar y configurar:**
```bash
git clone <repository-url>
cd facturacion-sri-backend
npm install
```

2. **Configurar base de datos:**
```bash
# Crear base de datos MySQL
mysql -u root -p < database/schema.sql
```

3. **Configurar variables de entorno:**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Iniciar servidor:**
```bash
# Desarrollo
npm run dev

# Producción
npm start
```

## Estructura del Proyecto

```
src/
├── config/          # Configuraciones
├── models/          # Modelos de datos
├── controllers/     # Lógica de negocio
├── routes/          # Definición de rutas
├── middleware/      # Middleware personalizado
└── utils/           # Utilidades
```

## API Endpoints

### Usuarios
- `POST /api/users/register` - Registrar nuevo usuario
- `GET /api/users/:id` - Obtener datos del usuario

### Certificados
- `POST /api/users/:id/certificate` - Subir certificado .p12
- `GET /api/users/:id/certificate/status` - Estado del certificado

### Facturación
- `POST /api/billing/generate` - Generar y procesar factura

## Base de Datos

### Tablas principales:
- **usuarios**: Datos tributarios y configuración
- **operaciones_facturacion**: Registro de operaciones
- **documentos_xml**: XMLs generados y firmados

## Tecnologías

- Node.js + Express
- MySQL
- open-factura (SRI Ecuador)
- Multer (upload archivos)

## Licencia

ISC