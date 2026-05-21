# Control ADM Eventos Polar - App Notion

Esta es la pagina tipo app, equivalente visual a la version de Google, pero usando Notion como base.

## Que contiene

- Panel general con metricas.
- Login por correo registrado en Notion.
- Filtro por estado y buscador.
- Vista administrador, marca y proveedor.
- Crear y editar solicitudes.
- Avanzar estados de solicitudes.
- Configuracion de marcas, proveedores y usuarios.

## Importante

La pagina necesita una llave privada de Notion (`NOTION_TOKEN`) para leer y escribir la base. Esa llave no debe ponerse dentro del HTML porque quedaria visible para cualquiera.

## Como activarla

1. En Notion, crea una integracion interna.
2. Copia el token secreto de esa integracion.
3. Comparte las cuatro bases de Notion con esa integracion:
   - Solicitudes - Polar
   - Marcas - Polar
   - Proveedores - Polar
   - Usuarios y accesos - Polar
4. En esta carpeta, crea un archivo `.env` copiando `.env.example`.
5. Pega el token en `NOTION_TOKEN`.
6. Ejecuta:

```powershell
node server.js
```

7. Abre:

```text
http://127.0.0.1:4180
```

## Para compartirla con Estefania

Esta version no se debe compartir como puro archivo HTML, porque necesita el servidor que guarda la llave de Notion. Para que Estefania la use desde otra PC, hay dos caminos:

- Instalar la carpeta en su PC y configurar el mismo `NOTION_TOKEN`.
- Subirla a un hosting sencillo como Render, Railway, Vercel o un servidor interno, configurando la variable `NOTION_TOKEN` alla.

La version Google Sheets queda intacta. Esta carpeta es la version paralela para Notion.
