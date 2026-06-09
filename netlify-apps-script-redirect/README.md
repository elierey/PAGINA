# Redireccion estable para Eventos Especiales

Este mini proyecto de Netlify sirve para que el usuario entregue siempre el mismo dominio, aunque cambie el enlace interno de Google Apps Script.

## Como funciona

1. El usuario abre el dominio de Netlify o el dominio propio.
2. Netlify lee la variable `APP_TARGET_URL`.
3. Si la variable apunta a un enlace valido de Google Apps Script terminado en `/exec`, redirige a ese enlace.
4. Si la variable no existe, muestra una pantalla de configuracion.

## Variable requerida

En Netlify, configurar:

```txt
APP_TARGET_URL=https://script.google.com/macros/s/PEGA_AQUI_EL_ID/exec
```

Tambien sirve la variante corporativa:

```txt
APP_TARGET_URL=https://script.google.com/a/macros/empresaspolar.com/s/PEGA_AQUI_EL_ID/exec
```

## Cambiar el enlace luego

Cuando Apps Script genere un enlace nuevo:

1. Entra al proyecto en Netlify.
2. Ve a `Site configuration > Environment variables`.
3. Edita `APP_TARGET_URL`.
4. Guarda.

El dominio publico no cambia.
