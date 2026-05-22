const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUBLIC_DIR = path.join(__dirname, "public");
const NOTION_VERSION = "2022-06-28";
const DEFAULT_PASSWORD = "POLAR2026";
const SESSION_COOKIE = "polar_session";
const SESSION_DAYS = 7;
const BODY_LIMIT_BYTES = 256 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

loadEnvFile();

function csv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const PORT = Number(process.env.PORT || 4180);
const CONFIG = {
  token: process.env.NOTION_TOKEN || "",
  appMode: process.env.APP_MODE || "standard",
  sessionSecret: process.env.SESSION_SECRET || "",
  allowedEmailDomains: csv(process.env.ALLOWED_EMAIL_DOMAINS || ""),
  allowedEmails: csv(process.env.ALLOWED_EMAILS || ""),
  auditEnabled: process.env.AUDIT_LOG !== "false",
  secureCookies: process.env.NODE_ENV === "production" || process.env.SECURE_COOKIES === "true",
  db: {
    requests: cleanNotionId(process.env.NOTION_DB_SOLICITUDES || "21ae3d021d1b4344b05c28c9ee7eba44"),
    brands: cleanNotionId(process.env.NOTION_DB_MARCAS || "a11d78243cd941039e27f810969f8942"),
    vendors: cleanNotionId(process.env.NOTION_DB_PROVEEDORES || "440bc180be9c486e834ea9cd264105e8"),
    users: cleanNotionId(process.env.NOTION_DB_USUARIOS || "995bf3d3093343e595e6f335a8245365"),
  },
  superAdmins: [
    "eliecermadrizgarcia2@gmail.com",
    "eliecermadrizgarcia@gmail.com",
    "pagaalrecibircolombia@gmail.com",
    "estefaniaalejopasante@gmail.com",
  ],
};

if (!CONFIG.sessionSecret) {
  CONFIG.sessionSecret = crypto
    .createHash("sha256")
    .update(`${CONFIG.token || "polar-local-session"}:${__dirname}`)
    .digest("hex");
}

let usersPasswordSchemaReady = false;
const rateBuckets = new Map();

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
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function plain(value) {
  return String(value || "");
}

function cleanNotionId(value) {
  const raw = String(value || "").replace(/-/g, "");
  const match = raw.match(/[0-9a-fA-F]{32}/);
  return match ? match[0] : String(value || "").trim();
}

function cleanPassword(value) {
  return String(value || "").trim();
}

function isHashedPassword(value) {
  return String(value || "").startsWith("pbkdf2$");
}

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const iterations = 120000;
  const digest = crypto.pbkdf2Sync(cleanPassword(value || DEFAULT_PASSWORD), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2$${iterations}$${salt}$${digest}`;
}

function verifyPassword(input, stored) {
  const candidate = cleanPassword(input);
  const expected = cleanPassword(stored || DEFAULT_PASSWORD);
  if (!isHashedPassword(expected)) return candidate === expected;
  const [, iterationsValue, salt, digest] = expected.split("$");
  const iterations = Number(iterationsValue || 0);
  if (!iterations || !salt || !digest) return false;
  const candidateDigest = crypto.pbkdf2Sync(candidate, salt, iterations, 32, "sha256").toString("base64url");
  if (candidateDigest.length !== digest.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidateDigest), Buffer.from(digest));
}

function publicUser(user) {
  const { password, ...safeUser } = user;
  safeUser.passwordConfigured = Boolean(password);
  return safeUser;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", CONFIG.sessionSecret).update(payload).digest("base64url");
}

function createSessionToken(emailValue) {
  const payload = base64url(JSON.stringify({
    email: cleanEmail(emailValue),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  }));
  return `${payload}.${signSessionPayload(payload)}`;
}

function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || signature !== signSessionPayload(payload)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.email || Number(session.exp || 0) < Date.now()) return null;
    return { email: cleanEmail(session.email) };
  } catch {
    return null;
  }
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function readSessionFromRequest(req, body = {}) {
  const cookies = parseCookies(req);
  return body.sessionToken || cookies[SESSION_COOKIE] || "";
}

function sessionCookie(token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (CONFIG.secureCookies) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie() {
  const parts = [`${SESSION_COOKIE}=`, "Max-Age=0", "Path=/", "HttpOnly", "SameSite=Strict"];
  if (CONFIG.secureCookies) parts.push("Secure");
  return parts.join("; ");
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

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function limitRate(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, reset: now + windowMs };
  if (bucket.reset < now) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > max) {
    const error = new Error("Demasiados intentos. Espera unos minutos y vuelve a intentar.");
    error.statusCode = 429;
    throw error;
  }
}

function emailAllowed(emailValue) {
  const email = cleanEmail(emailValue);
  const domain = email.split("@")[1] || "";
  if (CONFIG.allowedEmails.includes(email)) return true;
  if (!CONFIG.allowedEmailDomains.length) return true;
  return CONFIG.allowedEmailDomains.includes(domain);
}

function audit(req, action, ctx = {}, detail = {}) {
  if (!CONFIG.auditEnabled) return;
  const entry = {
    at: new Date().toISOString(),
    action,
    ip: req ? clientIp(req) : "",
    email: cleanEmail(ctx.email || detail.email || ""),
    role: ctx.role || "",
    target: detail.target || "",
    result: detail.result || "ok",
  };
  console.log(`[audit] ${JSON.stringify(entry)}`);
}

function securityHeaders(contentType, extra = {}) {
  return {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
    ...extra,
  };
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

async function ensureUsersPasswordSchema() {
  if (usersPasswordSchemaReady) return;
  await notion(`/databases/${CONFIG.db.users}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        "Password": { rich_text: {} },
      },
    }),
  });
  usersPasswordSchemaReady = true;
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
    password: propText(props, "Password") || DEFAULT_PASSWORD,
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

function contextFor(emailValue, users, passwordValue, requirePassword = false, sessionToken = "") {
  const session = readSessionToken(sessionToken);
  const email = cleanEmail(session?.email || emailValue);
  if (!email) return { authorized: false, email, message: "Escribe el correo autorizado para entrar." };
  if (!emailAllowed(email)) return { authorized: false, email, message: "Este correo no pertenece al dominio autorizado para esta version formal." };
  const user = users.find((x) => x.email === email && x.activo);
  const isSuperAdmin = CONFIG.superAdmins.includes(email);
  if (!user && !isSuperAdmin) return { authorized: false, email, message: `El correo ${email} no esta activo en Usuarios y accesos - Polar.` };
  if (requirePassword && !session) {
    const expected = user?.password || DEFAULT_PASSWORD;
    if (!verifyPassword(passwordValue, expected)) return { authorized: false, email, message: "Contrasena incorrecta." };
  }
  if (isSuperAdmin) return { authorized: true, email, role: "admin", entidadId: user?.entidadId || "", nombre: user?.nombre || email.split("@")[0] };
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

async function payload(emailValue, passwordValue, requirePassword = true, sessionToken = "") {
  const data = await loadAll();
  const ctx = contextFor(emailValue, data.users, passwordValue, requirePassword, sessionToken);
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
    allUsers: ctx.role === "admin" ? data.users.map(publicUser) : [],
    requests,
    sessionToken: "",
    security: {
      mode: CONFIG.appMode,
      allowedEmailDomains: CONFIG.allowedEmailDomains,
      session: "httpOnly-cookie",
      audit: CONFIG.auditEnabled,
    },
    stats: stats(requests),
  };
}

function requireRole(ctx, roles) {
  if (!ctx.authorized) throw new Error(ctx.message || "No autorizado.");
  if (!roles.includes(ctx.role)) throw new Error("No tienes permiso para realizar esta accion.");
}

async function getContextFromBody(req, body) {
  const data = await loadAll();
  const ctx = contextFor(body.email, data.users, body.password, true, readSessionFromRequest(req, body));
  return { data, ctx };
}

async function responsePayload(req, body, passwordValue = body.password) {
  return payload(body.email, passwordValue, true, readSessionFromRequest(req, body));
}

function requireText(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} es obligatorio.`);
}

function requireDate(value, label) {
  const text = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} debe tener una fecha valida.`);
}

function requireAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("El monto debe ser un numero positivo.");
  if (amount > 100000000) throw new Error("El monto supera el limite permitido para revision.");
}

function validateRequestInput(request, ctx) {
  if (ctx.role === "admin") requireText(request.marcaId, "Marca");
  requireText(request.razon, "Razon");
  requireText(request.descripcion, "Descripcion");
  requireText(request.responsable, "Responsable");
  requireDate(request.fecha, "Fecha");
  requireText(request.proveedorId, "Proveedor");
  requireAmount(request.monto);
}

function validateBrandInput(item) {
  requireText(item.nombre, "Marca");
  requireText(item.area, "Razon");
}

function validateVendorInput(item) {
  requireText(item.nombre, "Proveedor");
  requireText(item.servicio, "Servicio");
}

function validateUserInput(item) {
  requireText(item.nombre || item.email, "Nombre");
  const mail = cleanEmail(item.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new Error("Email invalido.");
  if (!["admin", "marca", "proveedor"].includes(String(item.rol || "").toLowerCase())) throw new Error("Rol invalido.");
  if (!emailAllowed(mail)) throw new Error("El usuario debe pertenecer al dominio o lista permitida.");
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
  if (pathname === "/api/bootstrap" && (req.method === "GET" || req.method === "POST")) {
    const emailValue = req.method === "GET" ? query.get("email") : body.email;
    const passwordValue = req.method === "GET" ? query.get("password") : body.password;
    const sessionToken = req.method === "GET" ? query.get("sessionToken") : readSessionFromRequest(req, body);
    limitRate(`login:${clientIp(req)}:${cleanEmail(emailValue)}`, 8, LOGIN_WINDOW_MS);
    const data = await payload(emailValue, passwordValue, true, sessionToken);
    if (data.authorized) {
      const token = createSessionToken(data.user.email);
      audit(req, "login", data.user, { target: "session", result: "ok" });
      return sendJson(res, data, 200, { "Set-Cookie": sessionCookie(token) });
    }
    audit(req, "login", { email: emailValue }, { target: "session", result: "denied" });
    return sendJson(res, data);
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    audit(req, "logout", { email: body.email || "" }, { target: "session" });
    return sendJson(res, { ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }

  if (pathname === "/api/requests" && req.method === "POST") {
    const { ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin", "marca"]);
    validateRequestInput(body.request || {}, ctx);
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { database_id: CONFIG.db.requests }, properties: requestProps(body.request || {}, ctx) }),
    });
    audit(req, "request.create", ctx, { target: body.request?.descripcion || "solicitud" });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/requests/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin", "marca"]);
    const current = data.requests.find((x) => x.id === body.request.id || x.notionPageId === body.request.notionPageId);
    if (!current) throw new Error("Solicitud no encontrada.");
    if (ctx.role === "marca" && current.marcaId !== ctx.entidadId) throw new Error("No puedes editar solicitudes de otra marca.");
    validateRequestInput({ ...current, ...(body.request || {}) }, ctx);
    await notion(`/pages/${current.notionPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: requestProps({ ...current, ...(body.request || {}) }, ctx, true) }),
    });
    audit(req, "request.update", ctx, { target: current.id });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/requests/advance" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const current = data.requests.find((x) => x.id === body.id || x.notionPageId === body.id);
    if (!current) throw new Error("Solicitud no encontrada.");
    const flow = ["Solicitado", "Cotizando", "Aprobado", "Recursos asignados", "Pagado"];
    const next = flow[flow.indexOf(current.estado) + 1];
    if (!next) return sendJson(res, await responsePayload(req, body));
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
    audit(req, "request.advance", ctx, { target: `${current.id}:${next}` });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/requests/delete" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const current = data.requests.find((x) => x.id === body.id || x.notionPageId === body.id);
    if (!current) throw new Error("Solicitud no encontrada.");
    await notion(`/pages/${current.notionPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    audit(req, "request.delete", ctx, { target: current.id });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/brands" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const item = body.brand || {};
    validateBrandInput(item);
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
    audit(req, "brand.create", ctx, { target: item.nombre });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/brands/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const item = body.brand || {};
    validateBrandInput(item);
    const pageId = await findPageId(data.brands, item.id);
    await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Marca": title(item.nombre || ""), "Area": richText(item.area || ""), "Activo": checkbox(true) } }),
    });
    audit(req, "brand.update", ctx, { target: item.id });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/brands/delete" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const pageId = await findPageId(data.brands, body.id);
    await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    audit(req, "brand.delete", ctx, { target: body.id });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/vendors" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const item = body.vendor || {};
    validateVendorInput(item);
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
    audit(req, "vendor.create", ctx, { target: item.nombre });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/vendors/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const item = body.vendor || {};
    validateVendorInput(item);
    const pageId = await findPageId(data.vendors, item.id);
    await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: { "Proveedor": title(item.nombre || ""), "Servicio": richText(item.servicio || ""), "Contacto": richText(item.contacto || ""), "Telefono": phone(item.telefono || ""), "Activo": checkbox(true) } }),
    });
    audit(req, "vendor.update", ctx, { target: item.id });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/vendors/delete" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const pageId = await findPageId(data.vendors, body.id);
    await notion(`/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    audit(req, "vendor.delete", ctx, { target: body.id });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/users" && req.method === "POST") {
    const { ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    await ensureUsersPasswordSchema();
    const item = body.user || {};
    validateUserInput(item);
    await notion("/pages", {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: CONFIG.db.users },
        properties: {
          "Nombre": title(item.nombre || item.email || ""),
          "Email": email(item.email || ""),
          "Rol": select(item.rol || "marca"),
          "Entidad ID": richText(item.entidadId || ""),
          "Password": richText(hashPassword(item.password || DEFAULT_PASSWORD)),
          "Activo": checkbox(item.activo !== false),
          "Notas": richText(item.notas || ""),
        },
      }),
    });
    audit(req, "user.create", ctx, { target: cleanEmail(item.email) });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/users/update" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    await ensureUsersPasswordSchema();
    const item = body.user || {};
    validateUserInput(item);
    const clean = cleanEmail(item.originalEmail || item.email);
    const current = data.users.find((x) => x.email === clean || x.notionPageId === item.notionPageId);
    if (!current) throw new Error("Usuario no encontrado.");
    const properties = {
      "Nombre": title(item.nombre || item.email || ""),
      "Email": email(item.email || ""),
      "Rol": select(item.rol || "marca"),
      "Entidad ID": richText(item.entidadId || ""),
      "Activo": checkbox(item.activo),
      "Notas": richText(item.notas || ""),
    };
    if (cleanPassword(item.password)) properties["Password"] = richText(hashPassword(item.password));
    await notion(`/pages/${current.notionPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
    audit(req, "user.update", ctx, { target: cleanEmail(item.email) });
    return sendJson(res, await responsePayload(req, body));
  }

  if (pathname === "/api/users/delete" && req.method === "POST") {
    const { data, ctx } = await getContextFromBody(req, body);
    requireRole(ctx, ["admin"]);
    const clean = cleanEmail(body.userEmail);
    if (clean === ctx.email && !CONFIG.superAdmins.includes(ctx.email)) {
      throw new Error("No puedes eliminar tu propio usuario administrador.");
    }
    const current = data.users.find((x) => x.email === clean || x.notionPageId === body.notionPageId);
    if (!current) throw new Error("Usuario no encontrado.");
    await notion(`/pages/${current.notionPageId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    audit(req, "user.delete", ctx, { target: clean });
    return sendJson(res, await responsePayload(req, body));
  }

  throw Object.assign(new Error("Ruta no encontrada."), { statusCode: 404 });
}

function sendJson(res, data, statusCode = 200, headers = {}) {
  res.writeHead(statusCode, securityHeaders("application/json; charset=utf-8", {
    "Cache-Control": "no-store",
    ...headers,
  }));
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
    const cache = path.extname(file) === ".html" ? "no-store" : "public, max-age=3600";
    res.writeHead(200, securityHeaders(mime[path.extname(file)] || "application/octet-stream", { "Cache-Control": cache }));
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > BODY_LIMIT_BYTES) {
        reject(Object.assign(new Error("La solicitud es demasiado grande."), { statusCode: 413 }));
        req.destroy();
      }
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
    limitRate(`${clientIp(req)}:${url.pathname}`, 180, RATE_WINDOW_MS);
    if (url.pathname === "/healthz") {
      return sendJson(res, { ok: true, mode: CONFIG.appMode });
    }
    if (url.pathname.startsWith("/api/")) {
      const body = req.method === "GET" ? {} : await readBody(req);
      return await handleApi(req, res, url.pathname, body, url.searchParams);
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    audit(req, "error", {}, { target: url.pathname, result: error.message || "error" });
    sendJson(res, { ok: false, message: error.message || "Error interno" }, error.statusCode || 500);
  }
}).listen(PORT, () => {
  console.log(`Control Adm Eventos Polar Notion: http://127.0.0.1:${PORT}`);
});
