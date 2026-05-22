# Checklist de aprobacion TI

## Acceso

- [ ] El dominio permitido esta definido en `ALLOWED_EMAIL_DOMAINS`.
- [ ] Los usuarios activos corresponden a personas autorizadas.
- [ ] Los usuarios inactivos no pueden entrar.
- [ ] Cada marca/proveedor ve solo sus solicitudes.
- [ ] El administrador conserva vista completa.

## Autenticacion

- [ ] La contrasena inicial fue cambiada por los usuarios reales.
- [ ] Las contrasenas nuevas se guardan con hash.
- [ ] Las sesiones expiran despues del periodo definido.
- [ ] Cerrar sesion elimina la cookie de sesion.

## Datos

- [ ] La base de datos es propiedad de una cuenta corporativa.
- [ ] La integracion tiene permisos minimos necesarios.
- [ ] Existe politica de respaldo.
- [ ] Existe politica de retencion y eliminacion.
- [ ] Las exportaciones CSV solo contienen datos visibles para el usuario.

## Seguridad tecnica

- [ ] El servicio corre en HTTPS.
- [ ] `SESSION_SECRET` fue configurado con una clave fuerte.
- [ ] `NOTION_TOKEN` no aparece en el codigo ni en el navegador.
- [ ] Los headers de seguridad estan activos.
- [ ] El rate limit de login esta activo.
- [ ] El log de auditoria esta activo.

## Operacion

- [ ] Existe responsable funcional del area administrativa/eventos.
- [ ] Existe responsable tecnico del despliegue.
- [ ] Existe procedimiento para crear, desactivar y eliminar usuarios.
- [ ] Existe procedimiento para reportar errores.
- [ ] Existe procedimiento para cambios futuros.

## Decision

- [ ] Aprobado para piloto.
- [ ] Aprobado para produccion.
- [ ] Requiere ajustes antes de aprobar.
