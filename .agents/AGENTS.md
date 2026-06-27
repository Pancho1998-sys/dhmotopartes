# Reglas del Proyecto - DHMotopartes

## Pruebas en Navegador y Credenciales de Test

Siempre que realices pruebas en el navegador (usando agentes web o de forma interactiva), debes seguir estas reglas estrictas de comportamiento:

1. **Credenciales oficiales de login:**
   * **Correo electrónico:** `dhmotopartes@gmail.com`
   * **Contraseña:** `cajero123`
   Usa exclusivamente estas credenciales para iniciar sesión en la aplicación al testear flujos en Supabase.

2. **Limpieza obligatoria de datos:**
   * La cuenta de `dhmotopartes@gmail.com` pertenece a la tienda real de producción a la cual se le entregará el sistema.
   * Cualquier registro generado en la base de datos de forma temporal para verificar el funcionamiento (ventas de prueba, clientes simulados, configuraciones de prueba o movimientos de caja) **debe ser eliminado o revertido inmediatamente** al finalizar la validación, garantizando que el entorno oficial no se ensucie con datos de prueba.
   * **IMPORTANTE:** Bajo ninguna circunstancia se deben borrar, alterar o modificar los datos reales que ya estaban previamente cargados en la base de datos (productos reales de la tienda, clientes existentes, configuración fiscal original o historial previo de ventas). La limpieza se aplica única y exclusivamente a los nuevos datos temporales que nosotros hayamos creado durante la prueba.
