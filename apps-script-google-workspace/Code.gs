const APP = {
  title: "Eventos Especiales",
  defaultDomain: "empresaspolar.com",
  defaultCurrency: "USD",
  version: "google-workspace-formal-1.0.0",
};

const SHEETS = {
  users: "usuarios",
  brands: "marcas",
  vendors: "proveedores",
  requests: "solicitudes",
  audit: "auditoria",
};

const HEADERS = {
  users: ["id", "email", "nombre", "rol", "entidadId", "activo", "notas", "creadoEn", "actualizadoEn"],
  brands: ["id", "nombre", "razon", "activo", "creadoEn", "actualizadoEn"],
  vendors: ["id", "nombre", "servicio", "contacto", "correo", "activo", "creadoEn", "actualizadoEn"],
  requests: [
    "id",
    "marcaId",
    "razon",
    "descripcion",
    "responsable",
    "fecha",
    "proveedorId",
    "monto",
    "recursosAsignados",
    "montoAsignado",
    "pagado",
    "estado",
    "detalle",
    "creadoPor",
    "creadoEn",
    "actualizadoPor",
    "actualizadoEn",
    "eliminado",
  ],
  audit: ["fecha", "email", "rol", "accion", "entidad", "detalle"],
};

function doGet() {
  return HtmlService
    .createTemplateFromFile("Index")
    .evaluate()
    .setTitle(APP.title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function setupDatabase() {
  const ss = getSpreadsheet_();
  Object.keys(SHEETS).forEach((key) => ensureSheet_(ss, SHEETS[key], HEADERS[key]));

  seedIfEmpty_(SHEETS.brands, HEADERS.brands, [
    { id: "pepsi", nombre: "Pepsi", razon: "pcv", activo: true, creadoEn: now_(), actualizadoEn: now_() },
    { id: "polar-light", nombre: "Polar Light", razon: "cp", activo: true, creadoEn: now_(), actualizadoEn: now_() },
    { id: "minalba", nombre: "Minalba", razon: "pcv", activo: true, creadoEn: now_(), actualizadoEn: now_() },
    { id: "rockstar", nombre: "Rockstar", razon: "pcv", activo: true, creadoEn: now_(), actualizadoEn: now_() },
  ]);

  seedIfEmpty_(SHEETS.vendors, HEADERS.vendors, [
    { id: "dynapro", nombre: "Dynapro", servicio: "Produccion", contacto: "Contacto adm", correo: "proveedor.dynapro@empresa.com", activo: true, creadoEn: now_(), actualizadoEn: now_() },
    { id: "glow-agency", nombre: "Glow Agency", servicio: "Eventos", contacto: "Ejecutivo cuenta", correo: "proveedor.glow@empresa.com", activo: true, creadoEn: now_(), actualizadoEn: now_() },
  ]);

  const activeEmail = currentEmail_();
  const users = readObjects_(SHEETS.users);
  if (activeEmail && !users.some((user) => cleanEmail_(user.email) === activeEmail)) {
    appendObject_(SHEETS.users, HEADERS.users, {
      id: makeId_(activeEmail, users),
      email: activeEmail,
      nombre: activeEmail.split("@")[0],
      rol: "admin",
      entidadId: "",
      activo: true,
      notas: "Administrador inicial creado por setupDatabase",
      creadoEn: now_(),
      actualizadoEn: now_(),
    });
  }

  audit_("setup.database", "sistema", "Base revisada/creada");
  return { ok: true, spreadsheetUrl: ss.getUrl(), email: activeEmail };
}

function getBootstrapData() {
  setupDatabaseIfNeeded_();
  const context = getUserContext_();
  if (!context.authorized) return context;
  return buildPayload_(context);
}

function createRequest(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin", "marca"]);
    validateRequest_(payload, context);
    const amount = Number(payload.monto || 0);
    const resourcesAssigned = toBool_(payload.recursosAsignados);
    const request = {
      id: makeRequestId_(),
      marcaId: context.role === "marca" ? context.entidadId : payload.marcaId,
      razon: payload.razon,
      descripcion: payload.descripcion,
      responsable: payload.responsable,
      fecha: normalizeDate_(payload.fecha),
      proveedorId: payload.proveedorId,
      monto: amount,
      recursosAsignados: resourcesAssigned,
      montoAsignado: resourcesAssigned ? amount : Number(payload.montoAsignado || 0),
      pagado: toBool_(payload.pagado),
      estado: payload.estado || (resourcesAssigned ? "Recursos asignados" : "Solicitado"),
      detalle: payload.detalle || payload.descripcion,
      creadoPor: context.email,
      creadoEn: now_(),
      actualizadoPor: context.email,
      actualizadoEn: now_(),
      eliminado: false,
    };
    appendObject_(SHEETS.requests, HEADERS.requests, request);
    audit_("request.create", request.id, request.descripcion, context);
    return buildPayload_(context);
  });
}

function updateRequest(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin", "marca"]);
    const table = readTable_(SHEETS.requests);
    const index = table.objects.findIndex((item) => item.id === payload.id && !toBool_(item.eliminado));
    if (index < 0) throw new Error("Solicitud no encontrada.");
    const current = table.objects[index];
    if (context.role === "marca" && current.marcaId !== context.entidadId) {
      throw new Error("No puedes editar solicitudes de otra marca.");
    }
    validateRequest_({ ...current, ...payload }, context);
    const amount = Number(payload.monto || current.monto || 0);
    const resourcesAssigned = toBool_(payload.recursosAsignados);
    const updated = {
      ...current,
      marcaId: context.role === "marca" ? context.entidadId : payload.marcaId,
      razon: payload.razon,
      descripcion: payload.descripcion,
      responsable: payload.responsable,
      fecha: normalizeDate_(payload.fecha),
      proveedorId: payload.proveedorId,
      monto: amount,
      recursosAsignados: resourcesAssigned,
      montoAsignado: resourcesAssigned ? (Number(payload.montoAsignado || 0) || amount) : Number(payload.montoAsignado || 0),
      pagado: toBool_(payload.pagado),
      estado: payload.estado || current.estado || "Solicitado",
      detalle: payload.detalle || payload.descripcion,
      actualizadoPor: context.email,
      actualizadoEn: now_(),
    };
    writeObjectRow_(SHEETS.requests, table.headers, index + 2, updated);
    audit_("request.update", updated.id, updated.descripcion, context);
    return buildPayload_(context);
  });
}

function advanceRequest(id) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    const table = readTable_(SHEETS.requests);
    const index = table.objects.findIndex((item) => item.id === id && !toBool_(item.eliminado));
    if (index < 0) throw new Error("Solicitud no encontrada.");
    const request = table.objects[index];
    const flow = ["Solicitado", "Cotizando", "Aprobado", "Recursos asignados", "Pagado"];
    const current = flow.indexOf(request.estado);
    const next = flow[current + 1];
    if (!next) return buildPayload_(context);
    request.estado = next;
    request.actualizadoPor = context.email;
    request.actualizadoEn = now_();
    if (next === "Recursos asignados") {
      request.recursosAsignados = true;
      request.montoAsignado = request.montoAsignado || request.monto;
    }
    if (next === "Pagado") {
      request.pagado = true;
      request.recursosAsignados = true;
      request.montoAsignado = request.montoAsignado || request.monto;
    }
    writeObjectRow_(SHEETS.requests, table.headers, index + 2, request);
    audit_("request.advance", request.id, next, context);
    return buildPayload_(context);
  });
}

function deleteRequest(id) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    const table = readTable_(SHEETS.requests);
    const index = table.objects.findIndex((item) => item.id === id && !toBool_(item.eliminado));
    if (index < 0) throw new Error("Solicitud no encontrada.");
    const request = table.objects[index];
    request.eliminado = true;
    request.actualizadoPor = context.email;
    request.actualizadoEn = now_();
    writeObjectRow_(SHEETS.requests, table.headers, index + 2, request);
    audit_("request.delete", request.id, request.descripcion, context);
    return buildPayload_(context);
  });
}

function createBrand(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    validateBrand_(payload);
    const brands = readObjects_(SHEETS.brands);
    const brand = {
      id: makeId_(payload.nombre, brands),
      nombre: payload.nombre,
      razon: payload.razon,
      activo: true,
      creadoEn: now_(),
      actualizadoEn: now_(),
    };
    appendObject_(SHEETS.brands, HEADERS.brands, brand);
    audit_("brand.create", brand.id, brand.nombre, context);
    return buildPayload_(context);
  });
}

function updateBrand(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    validateBrand_(payload);
    updateById_(SHEETS.brands, payload.id, {
      nombre: payload.nombre,
      razon: payload.razon,
      activo: payload.activo !== false,
      actualizadoEn: now_(),
    });
    audit_("brand.update", payload.id, payload.nombre, context);
    return buildPayload_(context);
  });
}

function deleteBrand(id) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    updateById_(SHEETS.brands, id, { activo: false, actualizadoEn: now_() });
    audit_("brand.disable", id, "Marca desactivada", context);
    return buildPayload_(context);
  });
}

function createVendor(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    validateVendor_(payload);
    const vendors = readObjects_(SHEETS.vendors);
    const vendor = {
      id: makeId_(payload.nombre, vendors),
      nombre: payload.nombre,
      servicio: payload.servicio,
      contacto: payload.contacto,
      correo: payload.correo,
      activo: true,
      creadoEn: now_(),
      actualizadoEn: now_(),
    };
    appendObject_(SHEETS.vendors, HEADERS.vendors, vendor);
    audit_("vendor.create", vendor.id, vendor.nombre, context);
    return buildPayload_(context);
  });
}

function updateVendor(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    validateVendor_(payload);
    updateById_(SHEETS.vendors, payload.id, {
      nombre: payload.nombre,
      servicio: payload.servicio,
      contacto: payload.contacto,
      correo: payload.correo,
      activo: payload.activo !== false,
      actualizadoEn: now_(),
    });
    audit_("vendor.update", payload.id, payload.nombre, context);
    return buildPayload_(context);
  });
}

function deleteVendor(id) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    updateById_(SHEETS.vendors, id, { activo: false, actualizadoEn: now_() });
    audit_("vendor.disable", id, "Proveedor desactivado", context);
    return buildPayload_(context);
  });
}

function createUser(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    validateUser_(payload);
    const users = readObjects_(SHEETS.users);
    const email = cleanEmail_(payload.email);
    if (users.some((user) => cleanEmail_(user.email) === email)) {
      throw new Error("Ese correo ya existe en usuarios.");
    }
    const user = {
      id: makeId_(email, users),
      email,
      nombre: payload.nombre || payload.email,
      rol: String(payload.rol || "marca").toLowerCase(),
      entidadId: payload.entidadId || "",
      activo: payload.activo !== false,
      notas: payload.notas || "",
      creadoEn: now_(),
      actualizadoEn: now_(),
    };
    appendObject_(SHEETS.users, HEADERS.users, user);
    audit_("user.create", user.email, user.rol, context);
    return buildPayload_(context);
  });
}

function updateUser(payload) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    validateUser_(payload);
    const email = cleanEmail_(payload.originalEmail || payload.email);
    const nextEmail = cleanEmail_(payload.email);
    const users = readObjects_(SHEETS.users);
    if (email !== nextEmail && users.some((user) => cleanEmail_(user.email) === nextEmail)) {
      throw new Error("Ese correo ya existe en usuarios.");
    }
    updateByField_(SHEETS.users, "email", email, {
      email: nextEmail,
      nombre: payload.nombre || payload.email,
      rol: String(payload.rol || "marca").toLowerCase(),
      entidadId: payload.entidadId || "",
      activo: payload.activo !== false,
      notas: payload.notas || "",
      actualizadoEn: now_(),
    });
    audit_("user.update", email, payload.rol, context);
    return buildPayload_(context);
  });
}

function deleteUser(email) {
  return withWriteLock_(() => {
    const context = requireRole_(["admin"]);
    const clean = cleanEmail_(email);
    if (clean === context.email) throw new Error("No puedes desactivar tu propio usuario.");
    updateByField_(SHEETS.users, "email", clean, { activo: false, actualizadoEn: now_() });
    audit_("user.disable", clean, "Usuario desactivado", context);
    return buildPayload_(context);
  });
}

function buildPayload_(context) {
  const brands = readObjects_(SHEETS.brands).filter((item) => toBool_(item.activo));
  const vendors = readObjects_(SHEETS.vendors).filter((item) => toBool_(item.activo));
  const allRequests = readObjects_(SHEETS.requests).filter((item) => !toBool_(item.eliminado));
  const requests = filterRequests_(allRequests, context);
  const vendorIds = new Set(requests.map((item) => item.proveedorId));
  const visibleBrands = context.role === "admin"
    ? brands
    : brands.filter((item) => item.id === context.entidadId || requests.some((request) => request.marcaId === item.id));
  const visibleVendors = context.role === "admin" || context.role === "marca"
    ? vendors
    : vendors.filter((item) => item.id === context.entidadId || vendorIds.has(item.id));

  return {
    authorized: true,
    user: context,
    brands: visibleBrands,
    vendors: visibleVendors,
    allBrands: context.role === "admin" ? brands : visibleBrands,
    allVendors: context.role === "admin" || context.role === "marca" ? vendors : visibleVendors,
    allUsers: context.role === "admin" ? readObjects_(SHEETS.users) : [],
    requests,
    stats: summarize_(requests),
    config: {
      title: APP.title,
      version: APP.version,
      currency: getSetting_("CURRENCY", APP.defaultCurrency),
      domain: getAllowedDomain_(),
    },
  };
}

function getUserContext_() {
  const email = currentEmail_();
  if (!email) {
    return {
      authorized: false,
      email: "",
      message: "No se pudo leer tu correo. La app debe publicarse como Google Workspace y ejecutarse como el usuario que accede.",
    };
  }
  if (!emailAllowed_(email)) {
    return {
      authorized: false,
      email,
      message: `El correo ${email} no pertenece al dominio autorizado.`,
    };
  }
  const user = readObjects_(SHEETS.users).find((item) => cleanEmail_(item.email) === email && toBool_(item.activo));
  if (!user) {
    return {
      authorized: false,
      email,
      message: `El correo ${email} no esta autorizado. Un administrador debe agregarlo en la pestana usuarios.`,
    };
  }
  return {
    authorized: true,
    email,
    role: String(user.rol || "").toLowerCase(),
    entidadId: user.entidadId || "",
    nombre: user.nombre || email,
  };
}

function requireRole_(roles) {
  const context = getUserContext_();
  if (!context.authorized) throw new Error(context.message);
  if (!roles.includes(context.role)) throw new Error("No tienes permiso para realizar esta accion.");
  return context;
}

function filterRequests_(requests, context) {
  if (context.role === "admin") return requests;
  if (context.role === "marca") return requests.filter((item) => item.marcaId === context.entidadId);
  if (context.role === "proveedor") return requests.filter((item) => item.proveedorId === context.entidadId);
  return [];
}

function summarize_(requests) {
  return requests.reduce((stats, request) => {
    const amount = Number(request.monto || 0);
    const assigned = Number(request.montoAsignado || 0);
    stats.count += 1;
    stats.requested += amount;
    stats.assigned += assigned;
    stats.pending += toBool_(request.pagado) ? 0 : (assigned || amount);
    return stats;
  }, { count: 0, requested: 0, assigned: 0, pending: 0 });
}

function validateRequest_(payload, context) {
  const brands = readObjects_(SHEETS.brands).filter((item) => toBool_(item.activo));
  const vendors = readObjects_(SHEETS.vendors).filter((item) => toBool_(item.activo));
  const brandId = context.role === "marca" ? context.entidadId : payload.marcaId;
  if (context.role === "admin") requireValue_(payload.marcaId, "Marca");
  if (context.role === "marca") requireValue_(context.entidadId, "Marca autorizada");
  if (!brands.some((brand) => brand.id === brandId)) throw new Error("Marca no valida o inactiva.");
  requireValue_(payload.razon, "Razon");
  requireValue_(payload.descripcion, "Descripcion");
  requireValue_(payload.responsable, "Responsable");
  requireValue_(payload.fecha, "Fecha");
  requireValue_(payload.proveedorId, "Proveedor");
  if (!vendors.some((vendor) => vendor.id === payload.proveedorId)) throw new Error("Proveedor no valido o inactivo.");
  const amount = Number(payload.monto || 0);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Monto invalido.");
}

function validateBrand_(payload) {
  requireValue_(payload.nombre, "Marca");
  requireValue_(payload.razon, "Razon");
}

function validateVendor_(payload) {
  requireValue_(payload.nombre, "Proveedor");
  requireValue_(payload.servicio, "Servicio");
}

function validateUser_(payload) {
  const email = cleanEmail_(payload.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email invalido.");
  if (!emailAllowed_(email)) throw new Error("El usuario debe pertenecer al dominio permitido.");
  const role = String(payload.rol || "").toLowerCase();
  if (!["admin", "marca", "proveedor"].includes(role)) throw new Error("Rol invalido.");
  if (["marca", "proveedor"].includes(role) && !String(payload.entidadId || "").trim()) {
    throw new Error("Los usuarios de marca/proveedor deben tener Entidad ID.");
  }
  if (role === "marca" && !readObjects_(SHEETS.brands).some((brand) => brand.id === payload.entidadId && toBool_(brand.activo))) {
    throw new Error("La Entidad ID de marca no existe o esta inactiva.");
  }
  if (role === "proveedor" && !readObjects_(SHEETS.vendors).some((vendor) => vendor.id === payload.entidadId && toBool_(vendor.activo))) {
    throw new Error("La Entidad ID de proveedor no existe o esta inactiva.");
  }
}

function requireValue_(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} es obligatorio.`);
}

function setupDatabaseIfNeeded_() {
  const ss = getSpreadsheet_();
  Object.keys(SHEETS).forEach((key) => ensureSheet_(ss, SHEETS[key], HEADERS[key]));
}

function getSpreadsheet_() {
  const id = getSetting_("SPREADSHEET_ID", "");
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("No hay Google Sheet activo. Crea el script desde Extensiones > Apps Script dentro de la hoja.");
  return active;
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = firstRow.some((cell) => String(cell || "").trim());
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function seedIfEmpty_(sheetName, headers, rows) {
  const table = readTable_(sheetName);
  if (table.objects.length) return;
  rows.forEach((row) => appendObject_(sheetName, headers, row));
}

function readObjects_(sheetName) {
  return readTable_(sheetName).objects;
}

function readTable_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error(`No existe la pestana ${sheetName}. Ejecuta setupDatabase.`);
  const range = sheet.getDataRange();
  const values = range.getNumRows() ? range.getValues() : [[]];
  const headers = (values[0] || []).map((header) => String(header || "").trim()).filter(Boolean);
  const objects = values.slice(1)
    .filter((row) => row.some((cell) => cell !== "" && cell !== null))
    .map((row) => {
      const object = {};
      headers.forEach((header, index) => {
        object[header] = normalizeValue_(row[index]);
      });
      return object;
    });
  return { sheet, headers, objects };
}

function appendObject_(sheetName, headers, object) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  sheet.appendRow(headers.map((header) => object[header] ?? ""));
}

function writeObjectRow_(sheetName, headers, rowNumber, object) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map((header) => object[header] ?? "")]);
}

function updateById_(sheetName, id, patch) {
  updateByField_(sheetName, "id", id, patch);
}

function updateByField_(sheetName, field, value, patch) {
  const table = readTable_(sheetName);
  const index = table.objects.findIndex((item) => String(item[field] || "").toLowerCase() === String(value || "").toLowerCase());
  if (index < 0) throw new Error("Registro no encontrado.");
  const updated = { ...table.objects[index], ...patch };
  writeObjectRow_(sheetName, table.headers, index + 2, updated);
}

function audit_(action, entity, detail, context) {
  try {
    const ctx = context || { email: currentEmail_(), role: "" };
    appendObject_(SHEETS.audit, HEADERS.audit, {
      fecha: now_(),
      email: ctx.email || "",
      rol: ctx.role || "",
      accion: action,
      entidad: entity,
      detalle: detail,
    });
  } catch (error) {
    console.warn(`Audit failed: ${error.message}`);
  }
}

function withWriteLock_(fn) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getSetting_(key, fallback) {
  return PropertiesService.getScriptProperties().getProperty(key) || fallback;
}

function getAllowedDomain_() {
  return String(getSetting_("ALLOWED_DOMAIN", APP.defaultDomain)).trim().toLowerCase();
}

function emailAllowed_(email) {
  const domain = getAllowedDomain_();
  if (!domain) return true;
  return cleanEmail_(email).endsWith(`@${domain}`);
}

function currentEmail_() {
  return cleanEmail_(Session.getActiveUser().getEmail() || "");
}

function cleanEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeValue_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return value;
}

function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value || "").slice(0, 10);
}

function toBool_(value) {
  if (value === true) return true;
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "si", "yes", "1", "x"].includes(normalized);
}

function makeId_(name, existing) {
  const base = String(name || "registro")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "registro";
  const ids = new Set(existing.map((item) => item.id));
  let id = base;
  let suffix = 2;
  while (ids.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function makeRequestId_() {
  return `REQ-${Date.now()}`;
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}
