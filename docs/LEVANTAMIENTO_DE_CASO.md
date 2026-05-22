# Levantamiento de caso - Sistema de Eventos Especiales

## Necesidad

El area administrativa de eventos necesita una herramienta para centralizar solicitudes, presupuestos, proveedores, marcas, responsables, montos y estado de recursos. El proceso actual depende de cuadros administrativos manuales y seguimiento por mensajeria, lo que dificulta controlar visibilidad, pagos, asignacion de recursos y actualizacion de informacion.

## Propuesta

Implementar una aplicacion web privada para que:

- Administracion vea todo el sistema.
- Cada marca vea unicamente su informacion.
- Cada proveedor vea unicamente lo que le corresponde.
- Los administradores puedan crear, editar, eliminar, exportar y configurar usuarios.
- El sistema mantenga una base compartida con permisos y trazabilidad.

## Medidas solicitadas para revision

- Acceso restringido por correos autorizados.
- Preferencia por dominio corporativo.
- Sesiones seguras.
- Roles y permisos en servidor.
- Auditoria de acciones importantes.
- Proteccion de contrasenas.
- Exportaciones controladas.
- No exponer tokens o claves en el navegador.

## Beneficio esperado

- Menos errores de seguimiento.
- Mejor visibilidad de presupuestos pendientes y aprobados.
- Control de quien ve cada marca o proveedor.
- Informacion centralizada para eventos y plataformas.
- Base preparada para convertirse en herramienta interna formal.

## Alternativas tecnicas

1. Mantener version web con hosting aprobado y base en Notion si IT lo permite.
2. Migrar a Google Apps Script / Google Workspace si se requiere que todo quede dentro del ecosistema corporativo.
3. Usar la version actual como piloto y luego migrar la base a una plataforma aprobada.

## Recomendacion

Usar esta rama como piloto formal de revision. Si Seguridad/IT aprueba Notion y Render o un hosting equivalente, se puede continuar con esta arquitectura. Si no lo aprueban, la logica de permisos y pantallas ya queda documentada para migrarla a Google Apps Script o infraestructura corporativa.
