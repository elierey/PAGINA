import type { Config, Context } from "@netlify/functions";

const DEFAULT_TARGET_URL =
  "https://script.google.com/macros/s/AKfycbxUs3LWw7e_UtGB1ZzslGdJJjDGE8UhvaK8HHxf7XZbXtvDOgXYq3s4p7EHpNEXBBmIKg/exec";

function renderSetupPage() {
  return new Response(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Eventos Especiales</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: #eef4f8;
        color: #12243a;
        font-family: Montserrat, "Segoe UI", Arial, sans-serif;
      }

      main {
        width: min(560px, 100%);
        background: #fff;
        border: 1px solid #d7e4ef;
        border-radius: 8px;
        padding: 32px;
        box-shadow: 0 24px 70px rgba(0, 68, 119, .14);
      }

      h1 { margin: 0 0 12px; font-size: 2rem; }
      p { color: #607489; line-height: 1.5; }
      code {
        display: block;
        margin-top: 14px;
        padding: 12px;
        background: #f6f9fb;
        border: 1px solid #d7e4ef;
        border-radius: 8px;
        overflow-x: auto;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Eventos Especiales</h1>
      <p>El dominio esta listo. Falta configurar en Netlify la variable <strong>APP_TARGET_URL</strong> con el enlace publicado de Google Apps Script que termina en <strong>/exec</strong>.</p>
      <code>APP_TARGET_URL=https://script.google.com/macros/s/.../exec</code>
    </main>
  </body>
</html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isAllowedTarget(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "script.google.com" && url.pathname.endsWith("/exec");
  } catch {
    return false;
  }
}

export default async (request: Request, context: Context) => {
  const target = Netlify.env.get("APP_TARGET_URL")?.trim() || DEFAULT_TARGET_URL;
  if (!target || !isAllowedTarget(target)) return renderSetupPage();

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(target);
  targetUrl.search = sourceUrl.search;

  return Response.redirect(targetUrl.toString(), 302);
};

export const config: Config = {
  path: "/*",
};
