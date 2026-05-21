# Publicar la app y conectar administracioneventospolar.online

Dominio comprado:

```text
administracioneventospolar.online
```

## 1. Subir la app a Render

1. Entra a https://render.com
2. Crea cuenta o inicia sesion.
3. Crea un nuevo **Web Service**.
4. Sube este proyecto o conectalo desde GitHub.
5. Configura:

```text
Name: control-adm-eventos-polar
Runtime: Node
Build Command: npm install
Start Command: npm start
```

6. En **Environment Variables**, agrega:

```text
NOTION_TOKEN=tu_token_privado
PORT=10000
NOTION_DB_SOLICITUDES=21ae3d021d1b4344b05c28c9ee7eba44
NOTION_DB_MARCAS=a11d78243cd941039e27f810969f8942
NOTION_DB_PROVEEDORES=440bc180be9c486e834ea9cd264105e8
NOTION_DB_USUARIOS=995bf3d3093343e595e6f335a8245365
```

7. Render dara una URL parecida a:

```text
https://control-adm-eventos-polar.onrender.com
```

## 2. Conectar el dominio en Render

1. En Render, abre el servicio.
2. Ve a **Settings**.
3. Busca **Custom Domains**.
4. Agrega:

```text
administracioneventospolar.online
www.administracioneventospolar.online
```

Render te mostrara los valores DNS exactos.

## 3. Cambios en GoDaddy

En GoDaddy > Domain > DNS Records:

1. Borra o reemplaza el registro:

```text
Type: A
Name: @
Data: WebsiteBuilder Site
```

2. Borra o reemplaza el registro:

```text
Type: CNAME
Name: www
Data: administracioneventospolar.online.
```

3. Coloca los registros que te diga Render.

Normalmente sera algo parecido a:

```text
Type: CNAME
Name: www
Data: control-adm-eventos-polar.onrender.com
TTL: 1 Hour
```

Y para el dominio raiz `@`, Render puede pedir un A record o un CNAME/ALIAS segun lo que muestre.

## 4. Esperar

El DNS puede tardar entre 5 minutos y 24 horas. Normalmente en GoDaddy se ve en menos de 30 minutos.

Cuando Render marque el dominio como **Verified**, la app abrira en:

```text
https://administracioneventospolar.online
```
