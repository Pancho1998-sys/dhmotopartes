# Guía de Configuración: Trasladar DH Motopartes a la Nube (Firebase)

Esta guía te ayudará a crear tu proyecto gratuito en Google Firebase, obtener tus credenciales, configurar el sistema y migrar tus datos locales actuales a la nube de manera segura.

---

## Paso 1: Crear el Proyecto en Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com/) e inicia sesión con tu cuenta de Google.
2. Haz clic en **Agregar proyecto** (o *Add project*).
3. Escribe el nombre del proyecto: `dhmotopartes` (o el de tu preferencia) y haz clic en **Continuar**.
4. Desactiva la opción de *Google Analytics* para este proyecto (no es necesario y acelera la creación) y haz clic en **Crear proyecto**.
5. Espera unos segundos y haz clic en **Continuar**.

---

## Paso 2: Crear la Base de Datos (Realtime Database)

1. En el panel izquierdo de Firebase, haz clic en **Compilación** (o *Build*) y selecciona **Realtime Database**.
2. Haz clic en el botón **Crear base de datos** (o *Create database*).
3. Selecciona la ubicación más cercana (por ejemplo, **us-central1** / Estados Unidos) y presiona **Siguiente**.
4. Selecciona **Comenzar en modo de prueba** (*Start in test mode*) para permitir la migración inicial de datos. Haz clic en **Habilitar**.

---

## Paso 3: Configurar la Autenticación (Login)

1. En el panel izquierdo, haz clic en **Compilación** (o *Build*) y selecciona **Authentication**.
2. Haz clic en **Comenzar** (*Get started*).
3. En la pestaña **Método de inicio de sesión**, selecciona **Correo electrónico/contraseña** (*Email/Password*).
4. Activa la primera casilla (**Habilitar**) y haz clic en **Guardar**.
5. Ve a la pestaña **Users** (Usuarios) arriba y haz clic en el botón **Agregar usuario**.
6. Escribe el correo electrónico que quieras usar como administrador (ej: `admin@dhmotopartes.com`) y una contraseña segura. Recuerda estos datos, ya que los usarás para iniciar sesión en tu punto de venta. Haz clic en **Agregar usuario**.

---

## Paso 4: Obtener las Credenciales de Conexión

1. Haz clic en el ícono de **Configuración** (engranaje) en la parte superior izquierda, junto a *Descripción general del proyecto*, y selecciona **Configuración del proyecto**.
2. En la pestaña *General*, baja hasta la sección *Tus apps* y haz clic en el ícono de **Web** (representado por `</>`).
3. Registra tu aplicación con el nombre: `dhmotopartes-pos` y haz clic en **Registrar app** (no es necesario activar Firebase Hosting).
4. Te aparecerá un bloque de código JavaScript con un objeto llamado `firebaseConfig`. Copia **únicamente** los valores dentro de las llaves `{ ... }`. Se verá similar a esto:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "dhmotopartes-XXXX.firebaseapp.com",
     databaseURL: "https://dhmotopartes-XXXX-default-rtdb.firebaseio.com",
     projectId: "dhmotopartes-XXXX",
     storageBucket: "dhmotopartes-XXXX.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567:web:abcd1234"
   };
   ```

---

## Paso 5: Aplicar la Configuración al Sistema

Debes pegar esta configuración en **ambos** archivos `firebase-config.js` del proyecto:

1. Abre el archivo **`dhmotopartes/firebase-config.js`** y reemplaza el bloque `firebaseConfig` con tus credenciales copiadas en el Paso 4.
2. Abre el archivo **`dhmotopartes-web/firebase-config.js`** y reemplaza el bloque `firebaseConfig` con las **mismas** credenciales.

---

## Paso 6: Migrar tus Datos Actuales a la Nube

Una vez configuradas tus credenciales en el archivo, puedes subir tus productos, clientes e historial de ventas actuales:

1. Abre una consola de comandos en tu computadora dentro de la carpeta `dhmotopartes`.
2. Ejecuta el script de migración corriendo:
   ```bash
   python migrate_to_firebase.py
   ```
3. El script leerá tu archivo `dhmotopartes_db.json` local y lo subirá automáticamente a tu base de datos Firebase. Te indicará en pantalla si el proceso fue exitoso.

---

## Paso 7: Asegurar la Base de Datos (Muy Importante)

Dado que tus datos ahora están en internet, debemos configurarla para que solo tú puedas modificarlos:

1. En la consola de Firebase, regresa a **Realtime Database** en el menú izquierdo.
2. Selecciona la pestaña **Reglas** (*Rules*) en la parte superior central.
3. Reemplaza el texto existente por las siguientes reglas de seguridad:
   ```json
   {
     "rules": {
       "pos_db": {
         ".read": true,
         ".write": "auth != null"
       }
     }
   }
   ```
   *(Esto permite que tus clientes lean el catálogo en tu web pública, pero solo tú puedas modificar el inventario y registrar ventas al iniciar sesión con contraseña).*
4. Haz clic en **Publicar** (*Publish*).

¡Eso es todo! Ahora tu sistema está 100% en la nube y puedes abrir el `index.html` de `dhmotopartes/` en cualquier PC o tablet, iniciar sesión con tu correo y contraseña del Paso 3, y vender con sincronización en tiempo real.
