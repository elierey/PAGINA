const http = require("http");
const fs = require("fs");
const path = require("path");

const PUBLIC_DIR = path.join(__dirname, "public");
const NOTION_VERSION = "2022-06-28";

loadEnvFile();

const PORT = Number(process.env.PORT || 4180);
const CONFIG = {
  token: process.env.NOTION_TOKEN || "",
  db: {
    requests: process.env.NOTION_DB_SOLICITUDES || "21ae3d021d1b4344b05c28c9ee7eba44",
    brands: process.env.NOTION_DB_MARCAS || "a11d78243cd941039e27f810969f8942",
    vendors: process.env.NOTION_DB_PROVEEDORES || "440bc180be9c486e834ea9cd264105e8",
    users: process.env.NOTION_DB_USUARIOS || "995bf3d3093343e595e6f335a8245365",
  },
  superAdmins: [
    "eliecermadrizgarcia2@gmail.com",
    "eliecermadrizgarcia@gmail.com",
    "pagaalrecibircolombia@gmail.com",
    "estefaniaalejopasante@gmail.com",
  ],
};

function loadEnvFile() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = valueParts.join("=").trim();
  }
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function plain(value) {
  return String(value || "");
}

function idFromName(value, existing = []) {
  const base = String(value || "registro")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "registro";
  const ids = new Set(existing.map((item) => item.id));
  let id = base;
  let n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  return id;
}

function nowString() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function notionHeaders() {
  if (!CONFIG.token) {
    throw new Error("Falta NOTION_TOKEN. Crea una integracion en Notion y coloca la llave en el archivo .env o en la consola.");
  }
  return {
    Authorization: `Bearer ${CONFIG.token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notion(pathname, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${pathname}`, {
    ...options,
    headers: { ...notionHeaders(), ...(options.headers || {}) },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data.message || `Notion respondio ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function queryDatabase(databaseId) {
  const results = [];
  let cursor;
  do {
    const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
    const data = await notion(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    results.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return results;
}

function richText(value) {
  return { rich_text: [{ text: { content: plain(value) } }] };
}

function title(value) {
  return { title: [{ text: { content: plain(value) } }] };
}

function select(value) {
  const name = plain(value);
  return name ? { select: { name } } : { select: null };
}

function checkbox(value) {
  return { checkbox: value === true || ["true", "si", "sí", "yes", "1", "x"].includes(String(value || "").toLowerCase()) };
}

function number(value) {
  const n = Number(value || 0);
  return { number: Number.isFinite(n) ? n : 0 };
}

function date(value) {
  return value ? { date: { start: String(value).slice(0, 10) } } : { date: null };
}

function email(value) {
  return { email: plain(value) || null };
}

function phone(value) {
  return { phone_number: plain(value) || null };
}

function propText(props, name) {
  const p = props[name];
  if (!p) return "";
  if (p.type === "title") return (p.title || []).map((x) => x.plain_text || "").join("");
  if (p.type === "rich_text") return (p.rich_text || []).map((x) => x.plain_text || "").join("");
  if (p.type === "email") return p.email || "";
  if (p.type === "phone_number") return p.phone_number || "";
  if (p.type === "select") return p.select?.name || "";
  if (p.type === "date") return p.date?.start || "";
  if (p.type === "number") return p.number ?? 0;
  if (p.type === "checkbox") return Boolean(p.checkbox);
  return "";
}

function mapBrand(page) {
  const props = page.properties || {};
  return {
    id: propText(props, "Codigo"),
    notionPageId: page.id,
    nombre: propText(props, "Marca"),
    area: propText(props, "Area"),
    activo: propText(props, "Activo"),
  };
}

function mapVendor(page) {
  const props = page.properties || {};
  return {
    id: propText(props, "Codigo"),
    notionPageId: page.id,
    nombre: propText(props, "Proveedor"),
    servicio: propText(props, "Servicio"),
    contacto: propText(props, "Contacto"),
    telefono: propText(props, "Telefono"),
    activo: propText(props, "Activo"),
  };
}

function mapUser(page) {
  const props = page.properties || {};
  return {
    email: cleanEmail(propText(props, "Email")),
    notionPageId: page.id,
    rol: String(propText(props, "Rol") || "").toLowerCase(),
    entidadId: propText(props, "Entidad ID"),
    nombre: propText(props, "Nombre"),
    activo: propText(props, "Activo"),
    notas: propText(props, "Notas"),
  };
}

function mapRequest(page) {
  const props = page.properties || {};
  return {
    id: propText(props, "Codigo"),
    notionPageId: page.id,
    marcaId: propText(props, "Marca ID"),
    razon: propText(props, "Razon"),
    descripcion: propText(props, "Solicitud"),
    responsable: propText(props, "Responsable"),
    fecha: propText(props, "Fecha"),
    proveedorId: propText(props, "Proveedor ID"),
    monto: Number(propText(props, "Monto") || 0),
    recursosAsignados: propText(props, "Recursos asignados"),
    montoAsignado: Number(propText(props, "Monto asignado") || 0),
    pagado: propText(props, "Pagado"),
    estado: propText(props, "Estado"),
    detalle: propText(props, "Detalle"),
    creadoPor: propText(props, "Creado por"),
    creadoEn: propText(props, "Creado en"),
    actualizadoEn: propText(props, "Actualizado en"),
  };
}

async function loadAll() {
  const [brandsRaw, vendorsRaw, usersRaw, requestsRaw] = await Promise.all([
    queryDatabase(CONFIG.db.brands),
    queryDatabase(CONFIG.db.vendors),
    queryDatabase(CONFIG.db.users),
    queryDatabase(CONFIG.db.requests),
  ]);
  return {
    brands: brandsRaw.map(mapBrand).filter((x) => x.id),
    vendors: vendorsRaw.map(mapVendor).filter((x) => x.id),
    users: usersRaw.map(mapUser).filter((x) => x.email),
    requests: requestsRaw.map(mapRequest).filter((x) => x.id),
  };
}

function contextFor(emailValue, users) {
  const email = cleanEmail(emailValue);
  if (!email) return { authorized: false, email, message: "Escribe el correo autorizado para entrar." };
  if (CONFIG.superAdmins.includes(email)) return { authorized: true, email, role: "admin", entidadId: "", nombre: email.split("@")[0] };
  const user = users.find((x) => x.email === email && x.activo);
  if (!user) return { authorized: false, email, message: `El correo ${email} no esta activo en Usuarios y accesos - Polar.` };
  return { authorized: true, email, role: user.rol, entidadId: user.entidadId || "", nombre: user.nombre || email };
}

function filterRequests(rows, ctx) {
  if (ctx.role === "admin") return rows;
  if (ctx.role === "marca") return rows.filter((r) => r.marcaId === ctx.entidadId);
  if (ctx.role === "proveedor") return rows.filter((r) => r.proveedorId === ctx.entidadId);
  return [];
}

function stats(rows) {
  return rows.reduce((s, r) => {
    const amount = Number(r.monto || 0);
    const assigned = Number(r.montoAsignado || 0);
    s.count += 1;
    s.requested += amount;
    s.assigned += assigned;
    s.pending += r.pagado ? 0 : (assigned || amount);
    return s;
  }, { count: 0, requested: 0, assigned: 0, pending: 0 });
}

async function payload(emailValue) {
  const data = await loadAll();
  const ctx = contextFor(emailValue, data.users);
  if (!ctx.authorized) return ctx;
  const activeBrands = data.brands.filter((x) => x.activo);
  const activeVendors = data.vendors.filter((x) => x.activo);
  const requests = filterRequests(data.requests, ctx);
  const vendorIds = new Set(requests.map((x) => x.proveedorId));
  const visibleBrands = ctx.role === "admin" ? activeBrands : activeBrands.filter((b) => b.id === ctx.entidadId || requests.some((r) => r.marcaId === b.id));
  const visibleVendors = ctx.role === "admin" || ctx.role === "marca" ? activeVendors : activeVendors.filter((v) => v.id === ctx.entidadId || vendorIds.has(v.id));
  return {
    authorized: true,
    user: ctx,
    brands: visibleBrands,
    vendors: visibleVendors,
    allBrands: ctx.role === "admin" ? activeBrands : visibleBrands,
    allVendors: ctx.role === "admin" || ctx.role === "marca" ? activeVendors : visibleVendors,
    allUsers: ctx.role === "admin" ? data.users : [],
    requests,
    stats: stats(requests),
  };
}

function requireRole(ctx, roles) {
  if (!ctx.authorized) throw new Error(ctx.message || "No autorizado.");
  if (!roles.includes(ctx.role)) throw new Error("No tienes permiso para realizar esta accion.");
}

async function getContextFromBody(body) {
  const data = await loadAll();
  const ctx = contextFor(body.email, data.users);
  return { data, ctx };
}

function requestProps(p, ctx, isUpdate = false) {
  const amount = Number(p.monto || 0);
  const res = checkbox(p.recursosAsignados).checkbox;
  return {
    ...(isUpdate ? {} : { "Codigo": richText(p.id || `REQ-${Date.now()}`) }),
    "Solicitud": title(p.descripcion || ""),
    "Marca ID": select(ctx.role === "marca" ? ctx.entidadId : p.marcaId),
    "Razon": select(p.razon || ""),
    "Responsable": richText(p.responsable || ""),
    "Fecha": date(p.fecha || ""),
    "Proveedor ID": select(p.proveedorId || ""),
    "Monto": number(amount),
    "Recursos asignados": checkbox(res),
    "Monto asignado": number(res ? amount : Number(p.montoAsignado || 0)),
    "Pagado": checkbox(p.pagado),
    "Estado": select(p.estado || (res ? "Recursos asignados" : "Solicitado")),
    "Detalle": richText(p.detalle || p.descripcion || ""),
    "Creado por": richText(p.creadoPor || ctx.email),
    "Actualizado en": richText(nowString()),
    ...(isUpdate ? {} : { "Creado en": date(new Date().toISOString().slice(0, 10)) }),
  };
}

async function findPageId(items, id, key = "id") {
  const item = items.find((x) => x[key] === id || x.notionPageId === id);
  if (!item) throw new Error("Registro no encontrado.");
  return item.notionPageId;
}

async function handleApi(req, res, pathname, body, query) {
  if (pathname === "/api/bootstrap" && req.method === "GET") {
    return sendJson(res, await payload(query.get("email")));
  }

  if (pathname === "/api/requests" && req.method === "POST") {
    const { ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin", "marca"]);
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: CONFIG.db.requests }, properties: requestProps(body.request || {}, ctx) }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/requests/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin", "marca"]);
    const current = data.requests.find((x) => x.id === body.request.id || x.notionPageId === body.request.notionPageId);
    if (!current) throw new Error("Solicitud no encontrada.");
    if (ctx.role === "marca" && current.marcaId !== ctx.entidadId) throw new Error("No puedes editar solicitudes de otra marca.");
    await notion(`/pages/${current.notionPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: requestProps({ ...current, ...(body.request || {}) }, ctx, true) }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/requests/advance" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const current = data.requests.find((x) => x.id === body.id || x.notionPageId === body.id);
    if (!current) throw new Error("Solicitud no encontrada.");
    const flow = ["Solicitado", "Cotizando", "Aprobado", "Recursos asignados", "Pagado"];
    const next = flow[flow.indexOf(current.estado) + 1];
    if (!next) return sendJson(res, await payload(body.email));
    const patch = {
      "Estado": select(next),
      "Actualizado en": richText(nowString()),
    };
    if (next === "Recursos asignados") {
      patch["Recursos asignados"] = checkbox(true);
      patch["Monto asignado"] = number(current.montoAsignado || current.monto);
    }
    if (next === "Pagado") {
      patch["Pagado"] = checkbox(true);
      patch["Recursos asignados"] = checkbox(true);
      patch["Monto asignado"] = number(current.montoAsignado || current.monto);
    }
    await notion(`/pages/${current.notionPageId}`, { method: "PATCH", body: JSON.stringify({ properties: patch }) });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/brands" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const item = body.brand || {};
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: CONFIG.db.brands },
        properties: {
          "Marca": title(item.nombre || ""),
          "Codigo": richText(item.id || idFromName(item.nombre, data.brands)),
          "Area": richText(item.area || ""),
          "Activo": checkbox(true),
        },
      }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/brands/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const item = body.brand || {};
    const pageId = await findPageId(data.brands, item.id);
    await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Marca": title(item.nombre || ""), "Area": richText(item.area || ""), "Activo": checkbox(true) } }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/vendors" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const item = body.vendor || {};
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: CONFIG.db.vendors },
        properties: {
          "Proveedor": title(item.nombre || ""),
          "Codigo": richText(item.id || idFromName(item.nombre, data.vendors)),
          "Servicio": richText(item.servicio || ""),
          "Contacto": richText(item.contacto || ""),
          "Telefono": phone(item.telefono || ""),
          "Activo": checkbox(true),
        },
      }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/vendors/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const item = body.vendor || {};
    const pageId = await findPageId(data.vendors, item.id);
    await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Proveedor": title(item.nombre || ""), "Servicio": richText(item.servicio || ""), "Contacto": richText(item.contacto || ""), "Telefono": phone(item.telefono || ""), "Activo": checkbox(true) } }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/users" && req.method === "POST") {
    const { ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const item = body.user || {};
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: CONFIG.db.users },
        properties: {
          "Nombre": title(item.nombre || item.email || ""),
          "Email": email(item.email || ""),
          "Rol": select(item.rol || "marca"),
          "Entidad ID": richText(item.entidadId || ""),
          "Activo": checkbox(item.activo !== false),
          "Notas": richText(item.notas || ""),
        },
      }),
    });
    return sendJson(res, await payload(body.email));
  }

  if (pathname === "/api/users/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(body);
    requireRole(ctx, ["admin"]);
    const item = body.user || {};
    const clean = cleanEmail(item.originalEmail || item.email);
    const current = data.users.find((x) => x.email === clean || x.notionPageId === item.notionPageId);
    if (!current) throw new Error("Usuario no encontrado.");
    await notion(`/pages/${current.notionPageId}`, {
      method: "PATCH",
      body: JSON.stringify({
        properties: {
          "Nombre": title(item.nombre || item.email || ""),
          "Email": email(item.email || ""),
          "Rol": select(item.rol || "marca"),
          "Entidad ID": richText(item.entidadId || ""),
          "Activo": checkbox(item.activo),
          "Notas": richText(item.notas || ""),
        },
      }),
    });
    return sendJson(res, await payload(body.email));
  }

  throw Object.assign(new Error("Ruta no encontrada."), { statusCode: 404 });
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function serveStatic(req, res, pathname) {
  const safe = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, safe));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("JSON invalido."));
      }
    });
    req.on("error", reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const body = req.method === "GET" ? {} : await readBody(req);
      return await handleApi(req, res, url.pathname, body, url.searchParams);
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, { ok: false, message: error.message || "Error interno" }, error.statusCode || 500);
  }
}).listen(PORT, () => {
  console.log(`Control Adm Eventos Polar Notion: http://127.0.0.1:${PORT}`);
});
