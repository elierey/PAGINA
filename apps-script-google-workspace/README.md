# Version Google Workspace / Apps Script

Esta carpeta contiene una version separada de la app para correr dentro de Google Apps Script con correos corporativos. No reemplaza ni modifica la version actual de Render/Notion.

## Que resuelve

- Acceso con cuenta Google corporativa del dominio permitido.
- La base de datos vive en Google Sheets.
- La hoja puede quedar privada para administradores, porque la web app se ejecuta como el usuario que la despliega.
- Cada usuario queda filtrado por su correo y rol:
  - `admin`: ve todo y configura marcas, proveedores y usuarios.
  - `marca`: ve y crea solicitudes solo de su marca.
  - `proveedor`: ve solo solicitudes asociadas a su proveedor.
- Exportacion CSV por marca y fecha.
- Edicion, avance y eliminacion logica de solicitudes.
- Auditoria basica en la pestana `auditoria`.

## Archivos

- `Code.gs`: servidor, permisos, lectura/escritura en Sheets y auditoria.
- `Index.html`: interfaz completa de la app.
- `appsscript.json`: configuracion del proyecto Apps Script.

## Instalacion recomendada

1. Crear una hoja nueva en Google Sheets desde la cuenta corporativa que sera duena del sistema.
2. Entrar a `Extensiones > Apps Script`.
3. Pegar `Code.gs` en el archivo `Code.gs`.
4. Crear un archivo HTML llamado `Index` y pegar `Index.html`.
5. Activar la vista del manifiesto y reemplazar `appsscript.json`.
6. En `Configuracion del proyecto > Propiedades de secuencia de comandos`, agregar:
   - `ALLOWED_DOMAIN`: `empresaspolar.com`
   - `CURRENCY`: `USD`
   - `SPREADSHEET_ID`: solo si el script no esta creado dentro de la hoja.
7. Ejecutar una vez la funcion `setupDatabase`.
8. Revisar la pestana `usuarios`: el correo que ejecuto `setupDatabase` queda como primer `admin`.
9. Agregar los demas usuarios con su rol y `entidadId`.

## Despliegue

En `Implementar > Nueva implementacion > Aplicacion web`:

- Ejecutar como: `Usuario que implementa la aplicacion`.
- Quien tiene acceso: `Usuarios del dominio`.

Ese punto es importante: asi la app puede leer/escribir en la hoja sin darle a todos acceso directo a la base. La identidad real se toma del correo corporativo activo y se valida contra la pestana `usuarios`.

## Estructura de la hoja

La funcion `setupDatabase` crea automaticamente:

- `usuarios`
- `marcas`
- `proveedores`
- `solicitudes`
- `auditoria`

Para usuarios de marca, `entidadId` debe ser el `id` de la marca. Para usuarios proveedores, `entidadId` debe ser el `id` del proveedor.

## Seguridad incluida

- Restriccion por dominio corporativo.
- Autorizacion por rol en el servidor, no solo en pantalla.
- Validacion de marcas/proveedores activos antes de crear solicitudes.
- Eliminacion logica, no borrado destructivo.
- Auditoria de creaciones, cambios, avances y eliminaciones.
- Bloqueo de escritura para evitar choques si dos personas guardan al mismo tiempo.

## Nota para pruebas

La URL `/dev` de Apps Script solo funciona para usuarios con acceso de edicion al script. Para Estefania y usuarios finales siempre se debe usar la URL `/exec` de la implementacion publicada.
