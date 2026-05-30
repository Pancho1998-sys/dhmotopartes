# DHMotopartes - Sistema de Ventas para Repuestos de Motos y Herramientas

DHMotopartes es un sistema de punto de venta (POS) y administración de inventario moderno, interactivo y con un diseño estético premium, diseñado especialmente para comercios de repuestos de motocicletas y venta de herramientas mecánicas.

---

## 🚀 Cómo Ejecutar el Sistema (Recomendado)

Ahora el sistema incluye un servidor backend empaquetado en un archivo ejecutable para Windows. Esto permite tener una base de datos centralizada compartida en tiempo real y abrir el sistema desde múltiples dispositivos.

### 1. Iniciar el Servidor (`dhmotopartes.exe`)
* Haz doble clic en **`dhmotopartes.exe`** en la carpeta principal.
* Se abrirá una ventana de comandos (consola) que iniciará el servidor web.
* El sistema **abrirá automáticamente** tu navegador web predeterminado en `http://localhost:8000`.

### 2. Conectar otras computadoras o celulares de la tienda
* Deja la ventana de comandos abierta en la computadora principal (servidor).
* Abre el navegador en cualquier otra PC, notebook, tablet o celular que esté **conectado a la misma red Wi-Fi o red local**.
* Escribe la dirección IP local que aparece en la consola del servidor. Por ejemplo:
  `http://192.168.1.50:8000` (reemplaza por la IP que indique la ventana de tu consola).
* ¡Listo! Todas las terminales verán y guardarán la información en tiempo real de forma sincronizada.

---

## 💾 Base de Datos Centralizada (`dhmotopartes_db.json`)

Al utilizar `dhmotopartes.exe`, los datos se guardan automáticamente en un archivo de texto llamado **`dhmotopartes_db.json`** en la misma carpeta del ejecutable.
* **Sincronización:** Cada cambio (venta, producto agregado, cliente nuevo) se refleja inmediatamente en todos los dispositivos conectados.
* **Respaldos:** Puedes copiar el archivo `dhmotopartes_db.json` a un pendrive o la nube para hacer copias de seguridad de toda tu información en segundos.

---

## 🔌 Respaldo Fuera de Línea (Fallback Offline)

Si por alguna razón no deseas abrir el ejecutable, aún puedes hacer doble clic en el archivo **`index.html`** directamente. El sistema se abrirá y guardará los datos en la memoria interna de ese navegador (`LocalStorage`).
* *Nota:* En este modo fuera de línea, los datos no se compartirán con otras PCs, ya que el navegador almacena la base de datos de manera aislada en esa computadora.

---

## Características Principales

- **Panel de Control (Dashboard):** Métricas clave en tiempo real, alertas de stock mínimo y un gráfico dinámico de tendencias de ventas diario/semanal.
- **Punto de Venta (POS):** Interfaz ágil e intuitiva con catálogo categorizado, buscador rápido por SKU o nombre de repuesto, gestión de carrito, aplicación de descuentos y procesamiento de pagos con cálculo de cambio. Habilitado para soporte de lector de código de barras.
- **Control de Inventario:** Listado completo de repuestos y herramientas con indicador visual de stock (Suficiente, Bajo, Agotado) y formularios para agregar, editar o eliminar productos.
- **Gestión de Clientes (CRM):** Registro de clientes frecuentes, historial de compras y acumulación de puntos de fidelidad.
- **Historial de Ventas:** Buscador y filtro de transacciones pasadas, visualización de recibos y función para anular/reembolsar compras.
- **Configuración:** Ajustes de nombre de la tienda, tasa de impuestos, moneda, alternancia de tema Claro/Oscuro y herramientas de respaldo (importar/exportar base de datos en JSON y exportar historial de ventas en CSV).
