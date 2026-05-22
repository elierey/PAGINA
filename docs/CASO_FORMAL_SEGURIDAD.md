# Caso formal de seguridad - Eventos Especiales Polar

## Objetivo

Preparar una version revisable por Tecnologia / Seguridad para el sistema de control administrativo de presupuestos de eventos. Esta version mantiene la funcionalidad de solicitudes, marcas, proveedores, usuarios, exportacion y permisos por rol, pero agrega controles de seguridad y un marco de aprobacion formal.

## Alcance de la version

- Aplicacion web privada para gestion de solicitudes de eventos.
- Base de datos compartida en Notion mediante integracion server-side.
- Acceso por usuario registrado, rol y entidad asignada.
- Roles soportados:
  - Administrador: ve y administra todo.
  - Marca: ve y crea solicitudes solo de su marca.
  - Proveedor: ve informacion asociada a su proveedor.
- Exportacion CSV limitada a las solicitudes visibles para la cuenta conectada.

## Controles implementados en esta rama

1. **Sesion segura**
   - La sesion se guarda en cookie `HttpOnly`.
   - El token de sesion ya no se guarda en `localStorage`.
   - La cookie usa `SameSite=Strict`.
   - En produccion puede marcarse como `Secure`.

2. **Dominio y correos permitidos**
   - Variable `ALLOWED_EMAIL_DOMAINS` para restringir acceso a dominios corporativos, por ejemplo `empresaspolar.com`.
   - Variable `ALLOWED_EMAILS` para excepciones controladas de revision.
   - El bloqueo se ejecuta en servidor, no solo en pantalla.

3. **Control de roles en servidor**
   - Las acciones administrativas solo funcionan para rol `admin`.
   - Las marcas no pueden editar solicitudes de otras marcas.
   - El filtrado de datos visibles se calcula en servidor y se replica en la interfaz.

4. **Contrasenas protegidas**
   - Nuevos usuarios y cambios de contrasena se guardan con PBKDF2-SHA256.
   - Se mantiene compatibilidad con contrasenas antiguas en texto plano para poder migrar sin bloquear usuarios.
   - La app ya no devuelve contrasenas al navegador.

5. **Validacion de datos**
   - Campos obligatorios en solicitudes, marcas, proveedores y usuarios.
   - Validacion de correo, rol, fecha y monto.
   - Limite de monto para evitar errores de carga accidental.

6. **Protecciones HTTP**
   - `Content-Security-Policy` restringida a recursos propios.
   - `X-Frame-Options: DENY`.
   - `X-Content-Type-Options: nosniff`.
   - `Referrer-Policy: no-referrer`.
   - `Permissions-Policy` bloquea camara, microfono y geolocalizacion.

7. **Limites de abuso**
   - Rate limit por IP/ruta.
   - Limite especial para intentos de login.
   - Limite de tamano para cuerpos JSON.

8. **Auditoria**
   - Registro estructurado de eventos importantes:
     - login aprobado / rechazado
     - creacion, edicion, avance y eliminacion de solicitudes
     - cambios en marcas, proveedores y usuarios
     - errores de servidor
   - No se registran tokens ni contrasenas.

9. **Secretos fuera del navegador**
   - El token de Notion se mantiene solo en variables de entorno del servidor.
   - El navegador nunca recibe `NOTION_TOKEN`, IDs internos sensibles de integracion ni contrasenas.

## Configuracion recomendada para aprobacion

```env
APP_MODE=formal-review
NODE_ENV=production
SESSION_SECRET=clave-larga-generada-por-ti
SECURE_COOKIES=true
AUDIT_LOG=true
ALLOWED_EMAIL_DOMAINS=empresaspolar.com
ALLOWED_EMAILS=correo.revisor@empresaspolar.com
```

## Recomendaciones para pasar a uso oficial

1. Mover el hosting a una cuenta aprobada por Empresas Polar o Google Workspace corporativo.
2. Crear una integracion de Notion o Google Workspace propiedad de la empresa, no de una cuenta personal.
3. Definir responsable del sistema, responsable de datos y responsable de soporte.
4. Documentar politica de respaldo, retencion y eliminacion de datos.
5. Probar con usuarios reales de marcas/proveedores antes de produccion.
6. Validar si Notion es una base aprobada por IT; si no, migrar la misma logica a Google Sheets / Apps Script corporativo.

## Riesgo residual

Esta rama mejora el perfil de seguridad de la aplicacion, pero no reemplaza una revision formal de IT. La aprobacion final depende de:

- Politicas internas de hosting.
- Politicas de uso de Notion.
- Manejo de datos personales o financieros.
- Requisitos de auditoria y respaldo.
- Gestion de cuentas y bajas de usuarios.

## Estado

Version preparada como rama separada: `caso-formal-seguridad`.

La version publicada actual no se modifica hasta que esta rama sea revisada, aprobada y fusionada.
