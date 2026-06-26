# Facturación Electrónica ARCA (ex-AFIP) - DHMotopartes

Este documento describe la arquitectura y los requisitos técnicos necesarios para la integración con los Web Services oficiales de la **Administración de Ingresos Públicos de Argentina (ARCA / ex-AFIP)** para emitir comprobantes de factura electrónica válidos bajo la regulación del país.

---

## 🏛️ Arquitectura de la Integración

Debido a que el navegador de los clientes (frontend SPA) tiene restricciones de **CORS** y no debe tener acceso directo a las claves privadas de seguridad (.key) de las empresas, la arquitectura está dividida en dos capas:

1. **Capa Cliente (Frontend SPA):**
   * Configurada en [fiscal.js](file:///c:/Users/Julian%20Karata/Downloads/dhmotopartes/fiscal.js).
   * Interfaz unificada `FacturadorElectronico` que expone los métodos `obtenerEstado()` y `emitirComprobante()`.
   * En modo Cloud SaaS, utiliza `ARCAFacturadorAPI` la cual delega las firmas y llamadas seguras de AFIP a una **Supabase Edge Function** (`/functions/v1/arca-wsfe`).
   * En modo local/offline, utiliza `MockFacturador` para simular respuestas del servidor de homologación y no bloquear operaciones.
2. **Capa Servidor (Supabase Edge Function / API Gateway):**
   * Recibe la venta y los parámetros de configuración de la tienda.
   * Obtiene la clave privada (.key) y el certificado (.crt) de la base de datos de manera segura y realiza la firma criptográfica necesaria.
   * Ejecuta el protocolo SOAP/XML hacia los servidores de ARCA y retorna el resultado (número de comprobante y CAE) al cliente.

---

## 🔑 Credenciales y Requisitos de ARCA

Para que un negocio pueda facturar electrónicamente, el administrador de la tienda debe cargar los siguientes datos en la sección **Ajustes > Facturación Electrónica ARCA**:

1. **CUIT de la Empresa:** Clave Única de Identificación Tributaria (11 números sin guiones).
2. **Punto de Venta (POS):** Número de punto de venta habilitado en AFIP para factura electrónica web (Ej: 0001, 0005). Debe ser diferente al de facturación manual o controlador fiscal físico.
3. **Condición de IVA:** Responsable Inscripto (RI), Monotributista (MT), o Exento (EX).
4. **Certificado Digital (X.509 .crt / .pem):** Certificado obtenido en el sitio web de AFIP posterior a la firma del archivo CSR.
5. **Clave Privada (.key / .pem):** Clave criptográfica privada generada localmente mediante OpenSSL.

---

## 🌐 Endpoints de ARCA (ex-AFIP)

La comunicación se realiza contra dos servicios web obligatorios de ARCA:

### 1. WSAA (Web Service de Autenticación y Autorización)
Se utiliza para intercambiar un ticket de requerimiento de acceso (TRA) firmado digitalmente por un **Ticket de Acceso (TA)** temporal (Token y Sign) que dura 12 horas.
* **Homologación (Pruebas):** `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`
* **Producción (Real):** `https://wsaa.afip.gov.ar/ws/services/LoginCms`
* **Protocolo:** HTTPS SOAP v1.1. Requiere un payload codificado en formato PKCS#7 (CMS/S/MIME).

### 2. WSFEv1 (Web Service de Facturación Electrónica)
Es el servicio principal que autoriza los comprobantes de venta y otorga el CAE.
* **Homologación (Pruebas):** `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`
* **Producción (Real):** `https://servicios1.afip.gov.ar/wsfev1/service.asmx`
* **Protocolo:** SOAP v1.2 sobre HTTPS.
* **Métodos Clave del WSDL:**
  * `FECAESolicitar`: Método principal para enviar una factura o lote de facturas y obtener el CAE y su fecha de vencimiento.
  * `FECompUltimoAutorizado`: Devuelve el último número de comprobante autorizado para un CUIT, Punto de Venta y Tipo de Comprobante específico (evita duplicados o saltos en la numeración).
  * `FEDummy`: Devuelve el estado de salud de la base de datos, el servidor de autorización y la app de AFIP.
  * `FEParamGetTiposCbte` / `FEParamGetTiposDoc` / `FEParamGetTiposIva`: Auxiliares para consultar parámetros válidos de códigos de comprobante (p. ej., Factura A = 1, Factura B = 6, Factura C = 11).

---

## ⚙️ Pasos para dar de alta un comercio en AFIP

Para generar los archivos cargables en el sistema, el administrador debe:

1. **Generar la Clave Privada y el archivo de solicitud (CSR):**
   A través de una terminal con OpenSSL instalado:
   ```bash
   openssl genrsa -out dhmotopartes.key 2048
   openssl req -new -key dhmotopartes.key -subj "/C=AR/O=DHMotopartes/CN=TiendaNombre/serialNumber=CUIT20123456789" -out dhmotopartes.csr
   ```
2. **Obtener el Certificado de Pruebas (Homologación):**
   * Ingresar al portal de AFIP con Clave Fiscal.
   * Adherir el servicio "Regimen de Facturación Electrónica (REFE) - WSASS".
   * Subir el archivo `dhmotopartes.csr` para descargar el certificado `.crt` de pruebas.
3. **Delegación de Servicios:**
   * Vincular el certificado digital al CUIT del comercio para el web service `wsfe` mediante la herramienta "Administrador de Relaciones de Clave Fiscal" en la web de AFIP.
4. **Carga en DHMotopartes:**
   * Copiar el contenido del certificado digital (.crt) en el campo "Certificado Digital" del panel.
   * Copiar el contenido de la clave privada (.key) en el campo "Clave Privada" del panel.
   * Guardar la configuración.
