# Eventos Especiales Polar

Aplicacion web para control administrativo de solicitudes, presupuestos, marcas y proveedores.

## Version formal de seguridad

La rama `caso-formal-seguridad` contiene una version preparada para revision interna:

- Sesion por cookie `HttpOnly`.
- Restriccion opcional por dominio corporativo.
- Contrasenas nuevas con hash PBKDF2.
- Roles validados en servidor.
- Headers de seguridad.
- Rate limit.
- Auditoria de acciones importantes.
- Documentacion de aprobacion en `docs/`.

La rama `main` conserva la version publicada actual. No fusionar esta rama sin revisar la configuracion de entorno y hacer prueba funcional.
