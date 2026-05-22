const storage = (() => {
  const memory = new Map();
  const cookieDays = 7;

  function canUseCookies() {
    return typeof document !== "undefined" && typeof document.cookie === "string";
  }

  function fromCookie(key) {
    if (!canUseCookies()) return "";
    const prefix = `${encodeURIComponent(key)}=`;
    const part = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : "";
  }

  function toCookie(key, value) {
    if (!canUseCookies()) return;
    const maxAge = cookieDays * 24 * 60 * 60;
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; samesite=lax`;
  }

  function removeCookie(key) {
    if (!canUseCookies()) return;
    document.cookie = `${encodeURIComponent(key)}=; max-age=0; path=/; samesite=lax`;
  }

  try {
    const test = "__polar_storage_test__";
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return {
      getItem: (key) => window.localStorage.getItem(key) || fromCookie(key),
      setItem: (key, value) => {
        window.localStorage.setItem(key, value);
        toCookie(key, value);
      },
      removeItem: (key) => {
        window.localStorage.removeItem(key);
        removeCookie(key);
      },
    };
  } catch {
    return {
      getItem: (key) => fromCookie(key) || memory.get(key) || "",
      setItem: (key, value) => {
        memory.set(key, String(value));
        toCookie(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
        removeCookie(key);
      },
    };
  }
})();

const state = {
  email: storage.getItem("polar_notion_email") || "",
  sessionToken: storage.getItem("polar_session_token") || "",
  password: "",
  data: null,
  currentView: "admin",
  viewer: "",
  search: "",
  status: "",
  sort: "",
};

const $ = (id) => document.getElementById(id);

const esc = (value) => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const money = (value) => {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
};

function brandName(id) {
  return state.data?.allBrands?.find((x) => x.id === id)?.nombre || id || "";
}

function vendorName(id) {
  return state.data?.allVendors?.find((x) => x.id === id)?.nombre || id || "";
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 2600);
}

function showError(message) {
  $("errorBox").textContent = message || "";
  $("errorBox").classList.toggle("hidden", !message);
}

function askConfirm(message) {
  return new Promise((resolve) => {
    const dialog = $("confirmDialog");
    const accept = $("confirmAccept");
    const cancel = $("confirmCancel");
    const text = $("confirmText");
    let done = false;

    function finish(value) {
      if (done) return;
      done = true;
      accept.removeEventListener("click", onAccept);
      cancel.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancelEvent);
      if (dialog.open) dialog.close();
      resolve(value);
    }

    function onAccept() {
      finish(true);
    }

    function onCancel() {
      finish(false);
    }

    function onCancelEvent(event) {
      event.preventDefault();
      finish(false);
    }

    text.textContent = message;
    accept.addEventListener("click", onAccept);
    cancel.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancelEvent);
    dialog.showModal();
  });
}

function acceptData(data) {
  state.data = data;
  if (data.user?.email) {
    state.email = data.user.email;
    storage.setItem("polar_notion_email", state.email);
  }
  if (data.sessionToken) {
    state.sessionToken = data.sessionToken;
    storage.setItem("polar_session_token", state.sessionToken);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || "No se pudo conectar con Notion.");
  return data;
}

async function load() {
  showError("");
  $("userCard").textContent = "Cargando...";
  try {
    const data = await api("/api/bootstrap", {
      method: "POST",
      body: JSON.stringify({ email: state.email, password: state.password, sessionToken: state.sessionToken }),
    });
    if (!data.authorized) {
      storage.removeItem("polar_notion_email");
      storage.removeItem("polar_session_token");
      state.sessionToken = "";
      $("app").classList.add("hidden");
      $("login").classList.remove("hidden");
      $("emailInput").value = state.email || "";
      showToast(data.message || "Correo no autorizado");
      return;
    }
    acceptData(data);
    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");
    if (data.user.role !== "admin") state.currentView = data.user.role;
    render();
  } catch (error) {
    $("app").classList.add("hidden");
    $("login").classList.remove("hidden");
    showError(error.message);
    $("userCard").innerHTML = `<strong>Error de carga</strong><span>${error.message}</span>`;
  }
}

function visibleRequests() {
  let rows = [...(state.data?.requests || [])];
  if (state.data.user.role === "admin") {
    if (state.currentView === "marca" && state.viewer) rows = rows.filter((r) => r.marcaId === state.viewer);
    if (state.currentView === "proveedor" && state.viewer) rows = rows.filter((r) => r.proveedorId === state.viewer);
  }
  if (state.status) rows = rows.filter((r) => r.estado === state.status);
  if (state.search) {
    const needle = state.search.toLowerCase();
    rows = rows.filter((r) => [
      r.descripcion,
      r.detalle,
      r.responsable,
      brandName(r.marcaId),
      vendorName(r.proveedorId),
      r.estado,
    ].join(" ").toLowerCase().includes(needle));
  }
  if (state.sort === "amount") {
    rows.sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0));
  }
  if (state.sort === "recent") {
    rows.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  }
  if (state.sort === "reason") {
    rows.sort((a, b) => String(a.razon || "").localeCompare(String(b.razon || ""), "es", { sensitivity: "base" }));
  }
  return rows;
}

function render() {
  const { user } = state.data;
  $("userCard").innerHTML = `<strong>${user.nombre || user.email}</strong><span>${user.email} - ${user.role}</span>`;

  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", user.role !== "admin"));
  document.querySelectorAll(".can-create").forEach((el) => el.classList.toggle("hidden", !["admin", "marca"].includes(user.role)));
  $("roleTabs").classList.toggle("hidden", user.role !== "admin");
  $("viewerPanel").classList.toggle("hidden", user.role !== "admin");

  document.querySelectorAll(".role-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.currentView);
  });

  renderViewer();
  renderMetrics();
  renderRequests();
  renderVendors();
  renderRequestOptions();
}

function renderViewer() {
  const select = $("viewerSelect");
  if (state.currentView === "admin") {
    select.innerHTML = `<option value="">Todo el sistema</option>`;
    state.viewer = "";
    $("accessText").textContent = "El administrador ve todas las marcas, solicitudes, proveedores, montos y recursos.";
    return;
  }
  const source = state.currentView === "marca" ? state.data.allBrands : state.data.allVendors;
  const label = state.currentView === "marca" ? "Todas las marcas" : "Todos los proveedores";
  select.innerHTML = `<option value="">${label}</option>` + source.map((item) => `<option value="${item.id}">${item.nombre}</option>`).join("");
  select.value = state.viewer;
  $("accessText").textContent = state.currentView === "marca"
    ? "Vista filtrada por marca."
    : "Vista filtrada por proveedor.";
}

function renderMetrics() {
  const rows = visibleRequests();
  const stats = rows.reduce((s, r) => {
    const amount = Number(r.monto || 0);
    const assigned = Number(r.montoAsignado || 0);
    s.count += 1;
    s.requested += amount;
    s.assigned += assigned;
    s.pending += r.pagado ? 0 : (assigned || amount);
    return s;
  }, { count: 0, requested: 0, assigned: 0, pending: 0 });
  $("statCount").textContent = stats.count;
  $("statRequested").textContent = money(stats.requested);
  $("statAssigned").textContent = money(stats.assigned);
  $("statPending").textContent = money(stats.pending);
}

function renderRequests() {
  const rows = visibleRequests();
  $("requestCount").textContent = `${rows.length} registros`;
  $("requestsBody").innerHTML = rows.map((r) => {
    const resourceClass = r.recursosAsignados ? "pill ok" : "pill";
    const paidClass = r.pagado ? "pill paid" : "pill";
    const canAdvance = state.data.user.role === "admin" && r.estado !== "Pagado";
    const canEdit = state.data.user.role === "admin" || state.data.user.role === "marca";
    const canDelete = state.data.user.role === "admin";
    return `
      <tr>
        <td><strong>${brandName(r.marcaId)}</strong></td>
        <td>${r.razon || ""}</td>
        <td><strong>${r.descripcion || ""}</strong><div class="sub">${r.detalle || ""}</div></td>
        <td>${r.responsable || ""}</td>
        <td>${(r.fecha || "").slice(0, 10)}</td>
        <td>${vendorName(r.proveedorId)}</td>
        <td><strong>${money(r.monto)}</strong><span class="${paidClass}">${r.pagado ? "Pagado" : "Pendiente"}</span></td>
        <td><span class="${resourceClass}">${r.recursosAsignados ? "Si" : "No"}</span><div class="sub">${r.recursosAsignados ? `${money(r.montoAsignado)} asignado` : "Pendiente por asignar"}</div></td>
        <td>
          <div class="row-actions">
            ${canEdit ? `<button class="ghost" data-edit="${r.id}">Editar</button>` : ""}
            ${canAdvance ? `<button class="ghost" data-advance="${r.id}">Avanzar</button>` : ""}
            ${canDelete ? `<button class="danger" data-delete-request="${r.id}" data-delete-request-name="${esc(r.descripcion || r.id)}">Eliminar</button>` : ""}
          </div>
        </td>
      </tr>`;
  }).join("");
}

function renderVendors() {
  const vendors = state.data.vendors || [];
  $("vendorCount").textContent = `${vendors.length} visibles`;
  $("vendorList").innerHTML = vendors.map((v) => `
    <article class="vendor-item">
      <strong>${v.nombre}</strong>
      <div class="sub">${v.servicio || ""}</div>
      <div class="sub">${v.contacto || ""}</div>
      <div>${v.telefono || ""}</div>
    </article>`).join("");
}

function renderRequestOptions() {
  $("requestBrand").innerHTML = state.data.allBrands.map((b) => `<option value="${b.id}">${b.nombre}</option>`).join("");
  $("requestVendor").innerHTML = state.data.allVendors.map((v) => `<option value="${v.id}">${v.nombre}</option>`).join("");
  if (state.data.user.role === "marca") {
    $("requestBrand").value = state.data.user.entidadId;
    $("requestBrand").disabled = true;
  } else {
    $("requestBrand").disabled = false;
  }
}

function exportableBrands() {
  const ids = [...new Set(visibleRequests().map((r) => r.marcaId).filter(Boolean))];
  return ids
    .map((id) => ({ id, nombre: brandName(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

function openSortDialog() {
  $("sortDialog").showModal();
}

function applySort(mode) {
  state.sort = mode;
  renderMetrics();
  renderRequests();
  $("sortDialog").close();
  const labels = { amount: "monto", recent: "fecha reciente", reason: "razon" };
  showToast(`Solicitudes organizadas por ${labels[mode]}`);
}

function openExportDialog() {
  const brands = exportableBrands();
  $("exportDay").value = "";
  $("exportFrom").value = "";
  $("exportTo").value = "";
  $("exportBrandList").innerHTML = brands.length
    ? brands.map((brand) => `
      <label class="check-item">
        <input type="checkbox" value="${esc(brand.id)}" checked>
        <span>${esc(brand.nombre)}</span>
      </label>`).join("")
    : `<p class="confirm-text">No hay solicitudes visibles para exportar.</p>`;
  $("downloadCsvBtn").disabled = brands.length === 0;
  $("exportDialog").showModal();
}

function selectedExportBrandIds() {
  return [...$("exportBrandList").querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function exportDateRange() {
  const day = $("exportDay").value;
  if (day) return { from: day, to: day };
  return {
    from: $("exportFrom").value,
    to: $("exportTo").value,
  };
}

function isWithinExportDates(request) {
  const date = String(request.fecha || "").slice(0, 10);
  const { from, to } = exportDateRange();
  if (!date) return !from && !to;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv() {
  const selected = new Set(selectedExportBrandIds());
  if (!selected.size) {
    showToast("Selecciona al menos una marca");
    return;
  }
  const rows = visibleRequests().filter((request) => selected.has(request.marcaId) && isWithinExportDates(request));
  if (!rows.length) {
    showToast("No hay solicitudes para exportar con esos filtros");
    return;
  }
  const headers = ["Marca", "Razon", "Descripcion", "Detalle", "Responsable", "Fecha", "Proveedor", "Monto", "Recursos asignados", "Monto asignado", "Pagado", "Estado"];
  const lines = [
    headers.map(csvCell).join(";"),
    ...rows.map((request) => [
      brandName(request.marcaId),
      request.razon,
      request.descripcion,
      request.detalle,
      request.responsable,
      request.fecha,
      vendorName(request.proveedorId),
      Number(request.monto || 0),
      request.recursosAsignados ? "Si" : "No",
      Number(request.montoAsignado || 0),
      request.pagado ? "Si" : "No",
      request.estado,
    ].map(csvCell).join(";")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `solicitudes-eventos-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  $("exportDialog").close();
  showToast("CSV exportado");
}

function openNewRequest() {
  $("requestDialogTitle").textContent = "Nueva solicitud";
  $("requestId").value = "";
  $("requestForm").reset();
  renderRequestOptions();
  $("requestDialog").showModal();
}

function openEditRequest(id) {
  const request = state.data.requests.find((r) => r.id === id);
  if (!request) return;
  $("requestDialogTitle").textContent = "Editar solicitud";
  $("requestId").value = request.id;
  $("requestBrand").value = request.marcaId;
  $("requestReason").value = request.razon;
  $("requestDescription").value = request.descripcion;
  $("requestOwner").value = request.responsable;
  $("requestDate").value = (request.fecha || "").slice(0, 10);
  $("requestVendor").value = request.proveedorId;
  $("requestAmount").value = request.monto || 0;
  $("requestResources").checked = Boolean(request.recursosAsignados);
  $("requestDetail").value = request.detalle || "";
  $("requestDialog").showModal();
}

async function saveRequest(event) {
  event.preventDefault();
  const request = {
    id: $("requestId").value,
    marcaId: $("requestBrand").value,
    razon: $("requestReason").value,
    descripcion: $("requestDescription").value,
    responsable: $("requestOwner").value,
    fecha: $("requestDate").value,
    proveedorId: $("requestVendor").value,
    monto: Number($("requestAmount").value || 0),
    recursosAsignados: $("requestResources").checked,
    detalle: $("requestDetail").value,
  };
  const path = request.id ? "/api/requests/update" : "/api/requests";
  acceptData(await api(path, { method: "POST", body: JSON.stringify({ email: state.email, password: state.password, sessionToken: state.sessionToken, request }) }));
  $("requestDialog").close();
  render();
  showToast(request.id ? "Solicitud actualizada" : "Solicitud creada");
}

async function advanceRequest(id) {
  acceptData(await api("/api/requests/advance", { method: "POST", body: JSON.stringify({ email: state.email, password: state.password, sessionToken: state.sessionToken, id }) }));
  render();
  showToast("Solicitud avanzada");
}

async function deleteRequest(button) {
  const id = button.dataset.deleteRequest;
  const name = button.dataset.deleteRequestName || id;
  const firstOk = await askConfirm(`Vas a eliminar el evento: ${name}. Esta accion lo quitara de la app y de la base de datos.`);
  if (!firstOk) return;
  const secondOk = await askConfirm(`Ultima confirmacion: seguro que quieres eliminar definitivamente este evento?`);
  if (!secondOk) return;
  acceptData(await api("/api/requests/delete", { method: "POST", body: JSON.stringify({ email: state.email, password: state.password, sessionToken: state.sessionToken, id }) }));
  render();
  showToast("Evento eliminado");
}

function settingsRows(type) {
  if (type === "brands") {
    const rows = state.data.allBrands.map((b) => `
      <form class="settings-row" data-kind="brand">
        <input name="id" type="hidden" value="${b.id}">
        <label>Marca<input name="nombre" value="${b.nombre || ""}"></label>
        <label>Razon<input name="area" value="${b.area || ""}"></label>
        <span></span>
        <div class="setting-actions">
          <button class="ghost" type="submit">Guardar</button>
          <button class="danger" type="button" data-delete-kind="brand" data-delete-id="${b.id}" data-delete-name="${b.nombre || b.id}">Eliminar</button>
        </div>
      </form>`).join("");
    return `<div class="settings-list">${rows}${newBrandForm()}</div>`;
  }
  if (type === "vendors") {
    const rows = state.data.allVendors.map((v) => `
      <form class="settings-row vendor" data-kind="vendor">
        <input name="id" type="hidden" value="${v.id}">
        <label>Proveedor<input name="nombre" value="${v.nombre || ""}"></label>
        <label>Servicio<input name="servicio" value="${v.servicio || ""}"></label>
        <label>Contacto<input name="contacto" value="${v.contacto || ""}"></label>
        <label>Correo<input name="telefono" value="${v.telefono || ""}"></label>
        <div class="setting-actions">
          <button class="ghost" type="submit">Guardar</button>
          <button class="danger" type="button" data-delete-kind="vendor" data-delete-id="${v.id}" data-delete-name="${v.nombre || v.id}">Eliminar</button>
        </div>
      </form>`).join("");
    return `<div class="settings-list">${rows}${newVendorForm()}</div>`;
  }
  const rows = state.data.allUsers.map((u) => `
    <form class="settings-row user" data-kind="user">
      <input name="originalEmail" type="hidden" value="${esc(u.email)}">
      <label>Nombre<input name="nombre" value="${esc(u.nombre)}"></label>
      <label>Email<input name="email" value="${esc(u.email)}"></label>
      <label>Rol<select name="rol">${["admin", "marca", "proveedor"].map((r) => `<option ${u.rol === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
      <label>Entidad ID<input name="entidadId" value="${esc(u.entidadId)}"></label>
      <label>Contrasena<input name="password" value="${esc(u.password || "POLAR2026")}"></label>
      <label class="check"><input name="activo" type="checkbox" ${u.activo ? "checked" : ""}> Activo</label>
      <div class="setting-actions">
        <button class="ghost" type="submit">Guardar</button>
        <button class="danger" type="button" data-delete-kind="user" data-delete-id="${esc(u.email)}" data-delete-name="${esc(u.nombre || u.email)}">Eliminar</button>
      </div>
    </form>`).join("");
  return `<div class="settings-list">${rows}${newUserForm()}</div>`;
}

function newBrandForm() {
  return `<form class="settings-row" data-kind="brand-new"><label>Nueva marca<input name="nombre"></label><label>Razon<input name="area"></label><span></span><button class="primary">Agregar</button></form>`;
}

function newVendorForm() {
  return `<form class="settings-row vendor" data-kind="vendor-new"><label>Nuevo proveedor<input name="nombre"></label><label>Servicio<input name="servicio"></label><label>Contacto<input name="contacto"></label><label>Correo<input name="telefono"></label><button class="primary">Agregar</button></form>`;
}

function newUserForm() {
  return `<form class="settings-row user" data-kind="user-new"><label>Nombre<input name="nombre"></label><label>Email<input name="email"></label><label>Rol<select name="rol"><option>admin</option><option>marca</option><option>proveedor</option></select></label><label>Entidad ID<input name="entidadId"></label><label>Contrasena<input name="password" value="POLAR2026"></label><label class="check"><input name="activo" type="checkbox" checked> Activo</label><button class="primary">Agregar</button></form>`;
}

function openSettings() {
  $("settingsContent").innerHTML = settingsRows("brands");
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === "brands"));
  $("settingsDialog").showModal();
}

async function saveSetting(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.activo = form.querySelector('[name="activo"]')?.checked ?? true;
  const kind = form.dataset.kind;
  let path;
  let body;
  if (kind === "brand") { path = "/api/brands/update"; body = { brand: data }; }
  if (kind === "brand-new") { path = "/api/brands"; body = { brand: data }; }
  if (kind === "vendor") { path = "/api/vendors/update"; body = { vendor: data }; }
  if (kind === "vendor-new") { path = "/api/vendors"; body = { vendor: data }; }
  if (kind === "user") { path = "/api/users/update"; body = { user: data }; }
  if (kind === "user-new") { path = "/api/users"; body = { user: data }; }
  acceptData(await api(path, { method: "POST", body: JSON.stringify({ email: state.email, password: state.password, sessionToken: state.sessionToken, ...body }) }));
  if (kind === "user" && [data.originalEmail, data.email].includes(state.email)) state.password = data.password || "POLAR2026";
  render();
  $("settingsContent").innerHTML = settingsRows(document.querySelector(".tab.active").dataset.tab);
  showToast("Configuracion guardada");
}

async function deleteSetting(button) {
  const kind = button.dataset.deleteKind;
  const id = button.dataset.deleteId;
  const name = button.dataset.deleteName || id;
  const labels = { brand: "marca", vendor: "proveedor", user: "usuario" };
  const ok = await askConfirm(`Vas a eliminar ${labels[kind] || "registro"}: ${name}. Esta accion lo borra de la app y de la base de datos. Seguro que quieres eliminarlo?`);
  if (!ok) return;
  const paths = {
    brand: "/api/brands/delete",
    vendor: "/api/vendors/delete",
    user: "/api/users/delete",
  };
  const payload = kind === "user" ? { userEmail: id } : { id };
  acceptData(await api(paths[kind], { method: "POST", body: JSON.stringify({ email: state.email, password: state.password, sessionToken: state.sessionToken, ...payload }) }));
  render();
  $("settingsContent").innerHTML = settingsRows(document.querySelector(".tab.active").dataset.tab);
  showToast("Registro eliminado");
}

document.addEventListener("submit", async (event) => {
  try {
    if (event.target.id === "loginForm") {
      event.preventDefault();
      state.email = $("emailInput").value.trim().toLowerCase();
      state.password = $("passwordInput").value;
      state.sessionToken = "";
      storage.removeItem("polar_session_token");
      await load();
    }
    if (event.target.id === "requestForm") await saveRequest(event);
    if (event.target.matches(".settings-row")) {
      event.preventDefault();
      await saveSetting(event.target);
    }
  } catch (error) {
    showError(error.message);
    showToast("Error");
  }
});

document.addEventListener("click", async (event) => {
  try {
    const close = event.target.closest("[data-close]");
    if (close) close.closest("dialog").close();
    const tab = event.target.closest(".role-button");
    if (tab) {
      state.currentView = tab.dataset.view;
      state.viewer = "";
      render();
    }
    const settingsTab = event.target.closest(".tab");
    if (settingsTab) {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      settingsTab.classList.add("active");
      $("settingsContent").innerHTML = settingsRows(settingsTab.dataset.tab);
    }
    const sortChoice = event.target.closest("[data-sort]");
    if (sortChoice) applySort(sortChoice.dataset.sort);
    const edit = event.target.closest("[data-edit]");
    if (edit) openEditRequest(edit.dataset.edit);
    const advance = event.target.closest("[data-advance]");
    if (advance) await advanceRequest(advance.dataset.advance);
    const removeRequest = event.target.closest("[data-delete-request]");
    if (removeRequest) await deleteRequest(removeRequest);
    const remove = event.target.closest("[data-delete-kind]");
    if (remove) await deleteSetting(remove);
  } catch (error) {
    showError(error.message);
    showToast("Error");
  }
});

$("refreshBtn").addEventListener("click", load);
$("newRequestBtn").addEventListener("click", openNewRequest);
$("settingsBtn").addEventListener("click", openSettings);
$("sortBtn").addEventListener("click", openSortDialog);
$("exportBtn").addEventListener("click", openExportDialog);
$("downloadCsvBtn").addEventListener("click", downloadCsv);
$("selectAllBrands").addEventListener("click", () => {
  $("exportBrandList").querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = true; });
});
$("clearAllBrands").addEventListener("click", () => {
  $("exportBrandList").querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = false; });
});
$("clearExportDates").addEventListener("click", () => {
  $("exportDay").value = "";
  $("exportFrom").value = "";
  $("exportTo").value = "";
});
$("exportDay").addEventListener("change", () => {
  if ($("exportDay").value) {
    $("exportFrom").value = "";
    $("exportTo").value = "";
  }
});
["exportFrom", "exportTo"].forEach((id) => {
  $(id).addEventListener("change", () => {
    if ($(id).value) $("exportDay").value = "";
  });
});
$("logoutBtn").addEventListener("click", () => {
  storage.removeItem("polar_notion_email");
  storage.removeItem("polar_session_token");
  state.email = "";
  state.sessionToken = "";
  state.password = "";
  state.data = null;
  $("app").classList.add("hidden");
  $("login").classList.remove("hidden");
});
$("viewerSelect").addEventListener("change", (event) => {
  state.viewer = event.target.value;
  renderMetrics();
  renderRequests();
});
$("searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderMetrics();
  renderRequests();
});
$("statusFilter").addEventListener("change", (event) => {
  state.status = event.target.value;
  renderMetrics();
  renderRequests();
});
$("togglePasswordBtn").addEventListener("click", () => {
  const visible = $("passwordInput").type === "text";
  $("passwordInput").type = visible ? "password" : "text";
  $("togglePasswordBtn").classList.toggle("is-visible", !visible);
  $("togglePasswordBtn").setAttribute("aria-label", visible ? "Mostrar contrasena" : "Ocultar contrasena");
});

if (state.email) $("emailInput").value = state.email;
if (state.sessionToken) load();
