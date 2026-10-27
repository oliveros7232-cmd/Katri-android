/* Katri Locos POS - interfaz (PC y celular) */
"use strict";
const Q = new URLSearchParams(location.search);
const S = {
  modo: location.pathname.startsWith("/mesero") ? "mesero" : "pc",
  enApp: Q.get("app") === "1",
  vista: "mesas", menu: [], mesas: [], info: {},
  mesero: localStorage.getItem("mesero") || "",
};
document.body.classList.toggle("modo-mesero", S.modo === "mesero");
document.body.classList.toggle("con-titlebar", S.enApp);

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const h = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => "$" + Math.round(n || 0).toLocaleString("es-CO");
const hoyISO = (d = new Date()) => { const z = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const hora = (ts) => (ts || "").slice(11, 16);
const hace = (ts) => { const m = Math.max(0, Math.round((Date.now() - new Date(ts.replace(" ", "T")).getTime()) / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

async function apiRed(path, metodo = "GET", cuerpo) {
  const r = await fetch(path, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  let d = {};
  try { d = await r.json(); } catch (e) { /* vacío */ }
  if (!r.ok) throw new Error(d.error || "Error de conexión con el servidor");
  return d;
}
/* en el celular (mesero) las llamadas pasan por el modo sin conexión */
function api(path, metodo = "GET", cuerpo) {
  if (S.modo === "mesero" && typeof OFF !== "undefined" && !S.enApp) return OFF.llamar(path, metodo, cuerpo);
  return apiRed(path, metodo, cuerpo);
}
let toastT;
function toast(msg, error = false, ms) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast" + (error ? " error" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), ms || (error ? 4500 : 2200));
}
const falla = (e) => toast(e.message || String(e), true);

/* acciones delegadas dentro de un contenedor */
function acciones(el, mapa) {
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b || !el.contains(b)) return;
    const f = mapa[b.dataset.act];
    if (f) f(b.dataset, b, ev);
  });
}

/* ---------------- modales ---------------- */
const pilaModales = [];
function modal(titulo, { clase = "", pie = true } = {}) {
  const velo = document.createElement("div");
  velo.className = "velo";
  velo.innerHTML = `<div class="modal ${clase}"><div class="m-cab"><h2>${titulo}</h2><button class="x" data-x>✕</button></div><div class="m-cuerpo"></div>${pie ? '<div class="m-pie"></div>' : ""}</div>`;
  document.body.appendChild(velo);
  const m = {
    el: velo, caja: $(".modal", velo), cuerpo: $(".m-cuerpo", velo), pie: $(".m-pie", velo),
    titulo: (t) => ($(".m-cab h2", velo).innerHTML = t),
    cerrar: () => { velo.remove(); const i = pilaModales.indexOf(m); if (i >= 0) pilaModales.splice(i, 1); if (m.alCerrar) m.alCerrar(); },
  };
  $("[data-x]", velo).onclick = () => m.cerrar();
  velo.addEventListener("mousedown", (e) => { if (e.target === velo && clase.indexOf("fijo") < 0) m.cerrar(); });
  pilaModales.push(m);
  return m;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pilaModales.length) pilaModales[pilaModales.length - 1].cerrar(); });
function confirmar(texto, etiqueta = "Sí, continuar", clase = "rojo") {
  return new Promise((res) => {
    const m = modal("Confirmar", { clase: "medio" });
    m.cuerpo.innerHTML = `<p style="font-size:16px;margin:6px 0">${texto}</p>`;
    m.pie.innerHTML = `<button class="btn" data-act="no">Cancelar</button><button class="btn ${clase}" data-act="si">${etiqueta}</button>`;
    let hecho = false;
    m.alCerrar = () => { if (!hecho) res(false); };
    acciones(m.el, { no: () => m.cerrar(), si: () => { hecho = true; m.cerrar(); res(true); } });
  });
}

/* ---------------- barra de título propia (ventana sin marco) ---------------- */
function iniciarBarra() {
  if (!S.enApp) return;
  const llamar = async (fn) => { try { const r = await window.pywebview.api[fn](); if (fn === "alternar") iconoMax(r); } catch (e) { /* sin api */ } };
  const iconoMax = (maximizada) => {
    $("#tb-max").innerHTML = maximizada
      ? '<svg viewBox="0 0 14 14"><rect x="2.5" y="4.5" width="7" height="7"/><path d="M4.5 4.5v-2h7v7h-2"/></svg>'
      : '<svg viewBox="0 0 14 14"><rect x="2.5" y="2.5" width="9" height="9"/></svg>';
  };
  $("#tb-min").onclick = () => llamar("minimizar");
  $("#tb-max").onclick = () => llamar("alternar");
  $("#tb-close").onclick = () => llamar("cerrar");
  iconoMax(true);
  document.addEventListener("dblclick", (e) => { if (e.target.closest(".tb-marca")) llamar("alternar"); });
}

/* ---------------- navegación ---------------- */
const VISTAS_PC = [["mesas", "Mesas"], ["domicilios", "Domicilios"], ["personal", "Personal"], ["reportes", "Reportes"], ["menu", "Menú"], ["config", "Configuración"]];
const VISTAS_MESERO = window.KatriNative ? [["mesas", "Mesas"], ["domicilios", "Domic."], ["personal", "Personal"], ["config", "Ajustes"]] : [["mesas", "Mesas"], ["domicilios", "Domic."], ["personal", "Personal"], ["reportes", "Reportes"], ["menu", "Menú"], ["config", "Config."]];
function pintarNav() {
  const v = S.modo === "pc" ? VISTAS_PC : VISTAS_MESERO;
  $("#nav").innerHTML = v.map(([k, t]) => `<button class="${S.vista === k ? "act" : ""}" data-act="vista" data-v="${k}">${t}</button>`).join("") +
    (S.modo === "pc" ? `<span class="espacio"></span><span class="reloj" id="reloj"></span>` : "");
}
acciones($("#nav"), { vista: (d) => { S.vista = d.v; render(); } });
setInterval(() => { const r = $("#reloj"); if (r) r.textContent = new Date().toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }, 1000);

/* cada vista usa un contenedor nuevo para no acumular manejadores de clic */
function vista(html) {
  const main = $("#main");
  main.innerHTML = "";
  const d = document.createElement("div");
  d.innerHTML = html;
  main.appendChild(d);
  return d;
}

let timerRef;
function render() {
  pintarNav();
  clearInterval(timerRef);
  const f = { mesas: vMesas, domicilios: vDomicilios, personal: vPersonal, reportes: vReportes, menu: vMenu, config: vConfig }[S.vista];
  f();
  if (S.vista === "mesas" || S.vista === "domicilios") {
    timerRef = setInterval(() => { if (!pilaModales.length) f(true); }, 6000);
  }
}

/* ================= MESAS ================= */
async function vMesas(silencioso) {
  const vv = S.vista;
  try { S.mesas = await api("/api/mesas"); } catch (e) { if (!silencioso) falla(e); return; }
  if (vv !== S.vista) return;
  const ocup = S.mesas.filter((m) => m.cuenta).length;
  const main = vista(`
    <div class="fila" style="margin-bottom:10px"><h1 class="crece" style="font-size:24px">Mesas</h1>
    ${S.modo === "mesero" ? `<button class="btn peq" data-act="nombre">👤 ${h(S.mesero || "¿Quién atiende?")}</button>` : ""}</div>
    <div class="leyenda"><span><i class="punto" style="background:#2f9e5f"></i>Libre (${S.mesas.length - ocup})</span><span><i class="punto" style="background:var(--rojo)"></i>Ocupada (${ocup})</span></div>
    <div class="rejilla">${S.mesas.map((m) => `
      <button class="mesa ${m.cuenta ? "ocupada" : ""}" data-act="mesa" data-id="${m.id}">
        <div><div class="n">${h(m.nombre)}</div><div class="u">${h(m.ubicacion || "")}</div></div>
        <div class="e">${m.cuenta ? `${money(m.cuenta.total)}<div class="muted" style="font-size:12px;font-weight:400">${m.cuenta.n_items} prod. · ${hace(m.cuenta.creada)}</div>` : "Libre"}</div>
      </button>`).join("")}</div>`);
  acciones(main, {
    mesa: (d) => abrirMesa(+d.id),
    nombre: () => pedirNombre(),
  });
}
async function abrirMesa(id) {
  const m = S.mesas.find((x) => x.id === id);
  if (m.cuenta) verCuenta(m.cuenta.id);
  else tomarPedido({ tipo: "mesa", mesa: m });
}
function pedirNombre(obligatorio) {
  const m = modal("¿Quién atiende?", { clase: "medio" + (obligatorio ? " fijo" : "") });
  m.cuerpo.innerHTML = `<label>Nombre del mesero</label><input id="nm" value="${h(S.mesero)}" placeholder="Ej. Ana" autocomplete="off">`;
  m.pie.innerHTML = `<button class="btn pri" data-act="ok">Guardar</button>`;
  setTimeout(() => $("#nm", m.el).focus(), 50);
  const guardar = () => { const v = $("#nm", m.el).value.trim(); if (!v) return toast("Escribe un nombre", true); S.mesero = v; localStorage.setItem("mesero", v); m.cerrar(); if (S.vista === "mesas") vMesas(true); };
  acciones(m.el, { ok: guardar });
  $("#nm", m.el).addEventListener("keydown", (e) => { if (e.key === "Enter") guardar(); });
}

/* ================= CUENTA ================= */
function detalleItem(it) {
  const o = it.opciones || {}; const p = [];
  Object.entries(o.grupos || {}).forEach(([g, v]) => {
    const c = {}; v.forEach((x) => (c[x] = (c[x] || 0) + 1));
    p.push(Object.entries(c).map(([k, n]) => (n > 1 ? `${n}× ${h(k)}` : h(k))).join(", "));
  });
  (o.quitar || []).forEach((q) => p.push(`<b>sin ${h(q)}</b>`));
  (o.extras || []).forEach((e) => p.push(`+ ${h(e.nombre.replace("Adición ", ""))}`));
  if (o.nota) p.push(`“${h(o.nota)}”`);
  return p.join(" · ");
}
async function verCuenta(id) {
  let cu;
  try { cu = await api("/api/cuentas/" + id); } catch (e) { return falla(e); }
  const titulo = cu.tipo === "mesa" ? `${h(cu.mesa)}${cu.ubicacion ? " · " + h(cu.ubicacion) : ""}` : `Domicilio${cu.cliente ? " · " + h(cu.cliente) : ""}`;
  const m = modal(titulo, { clase: "" });
  const abierta = cu.estado === "abierta";
  const pintar = (c) => {
    let html = "";
    if (c.tipo === "domicilio") html += `<div class="tarjeta" style="margin-bottom:8px;font-size:14px"><b>${h(c.cliente || "Sin nombre")}</b> ${c.telefono ? "· " + h(c.telefono) : ""}<br>📍 ${h(c.direccion)}${c.notas ? `<br><span class="muted">${h(c.notas)}</span>` : ""}</div>`;
    let ronda = 0;
    c.items.forEach((it) => {
      if (it.ronda !== ronda) { ronda = it.ronda; html += `<div class="ronda">Pedido ${ronda} · ${hora(it.creado)}</div>`; }
      html += `<div class="linea"><span class="q">${it.cantidad}×</span><div class="t">${h(it.nombre)}<div class="d">${detalleItem(it)}</div></div><span class="p dinero">${money(it.total)}</span>${abierta ? `<button class="del" title="Quitar" data-act="del" data-id="${it.id}">✕</button>` : ""}</div>`;
    });
    if (!c.items.length) html += `<div class="vacio">Sin productos</div>`;
    if (c.cargos) html += `<div class="subl"><span>Subtotal</span><span class="dinero">${money(c.subtotal)}</span></div><div class="subl"><span>Envase para llevar ${money(c.bandeja)}${c.costo_domicilio ? " + domicilio " + money(c.costo_domicilio) : ""}</span><span class="dinero">${money(c.cargos)}</span></div>`;
    html += `<div class="total-grande"><span>Total a cobrar</span><span class="v dinero">${money(c.total)}</span></div>`;
    if (!abierta) html += `<div class="muted">Cuenta ${c.estado} · ${h(c.metodo_pago || "")} ${c.propina ? "· propina " + money(c.propina) : ""}</div>`;
    m.cuerpo.innerHTML = html;
    m.pie.innerHTML = abierta
      ? `<button class="btn fantasma rojo peq" data-act="anular">Anular cuenta</button><span style="flex:1"></span><button class="btn" data-act="reimp">🖨 Reimprimir</button><button class="btn" data-act="mas">+ Agregar pedido</button><button class="btn verde" data-act="cobrar">Cobrar y cerrar</button>`
      : `<button class="btn" data-act="x">Cerrar</button>`;
    cu = c;
  };
  pintar(cu);
  acciones(m.el, {
    x: () => m.cerrar(),
    del: async (d) => { if (!(await confirmar("¿Quitar este producto de la cuenta?", "Quitar"))) return; try { await api("/api/items/" + d.id, "DELETE"); pintar(await api("/api/cuentas/" + id)); } catch (e) { falla(e); } },
    mas: () => { m.cerrar(); tomarPedido({ tipo: "cuenta", cuenta: cu }); },
    reimp: async () => { try { const x = await api(`/api/cuentas/${id}/reimprimir`, "POST", {}); if (x.ok) toast("Última comanda reimpresa ✓"); else toast(x.error || "No se pudo imprimir", true, 6000); } catch (e) { falla(e); } },
    anular: async () => { if (!(await confirmar("¿Anular toda la cuenta? La mesa quedará libre y no cuenta en ventas.", "Anular cuenta"))) return; try { await api(`/api/cuentas/${id}/anular`, "POST", {}); m.cerrar(); toast("Cuenta anulada"); render(); } catch (e) { falla(e); } },
    cobrar: () => { cobrar(cu, m); },
  });
}

function cobrar(cu, mCuenta) {
  const m = modal("Cobrar y cerrar", { clase: "medio" });
  let metodo = "", propina = 0;
  const metodos = ["Efectivo", "Tarjeta", "Transferencia", "Otro"];
  const pintar = () => {
    const total = cu.total + propina;
    m.cuerpo.innerHTML = `
      <div class="total-grande" style="padding-top:0"><span>Cuenta</span><span class="v dinero" style="font-size:28px">${money(cu.total)}</span></div>
      <label>Método de pago</label>
      <div class="opciones">${metodos.map((x) => `<button class="op ${metodo === x ? "sel" : ""}" data-act="met" data-m="${x}">${x}</button>`).join("")}</div>
      <label>Propina (opcional)</label>
      <div class="fila"><input id="prop" type="number" min="0" step="500" value="${propina || ""}" placeholder="0" style="width:140px">
        <div class="rapidos"><button class="chip" data-act="pp" data-p="0">Sin propina</button><button class="chip" data-act="pp" data-p="10">10%</button></div></div>
      ${metodo === "Efectivo" ? `<label>Efectivo recibido</label><input id="rec" type="number" min="0" step="1000" placeholder="${total}"><div id="cambio" class="subl" style="margin-top:6px"></div>` : ""}
      <div class="sep"></div>
      <div class="total-grande" style="padding:0"><span>Total con propina</span><span class="v dinero" style="font-size:28px">${money(total)}</span></div>`;
    const rec = $("#rec", m.el);
    const calc = () => { const r = +rec.value || 0; $("#cambio", m.el).innerHTML = r ? `<span>Cambio a devolver</span><b class="dinero" style="color:var(--amarillo)">${money(Math.max(0, r - total))}</b>` : ""; };
    if (rec) rec.addEventListener("input", calc);
    $("#prop", m.el).addEventListener("change", (e) => { propina = Math.max(0, +e.target.value || 0); pintar(); });
  };
  pintar();
  m.pie.innerHTML = `<button class="btn" data-act="no">Volver</button><button class="btn verde" data-act="ok">Confirmar cobro y liberar</button>`;
  acciones(m.el, {
    met: (d) => { const p = +$("#prop", m.el).value || 0; propina = p; metodo = d.m; pintar(); },
    pp: (d) => { propina = d.p === "0" ? 0 : Math.round((cu.total * +d.p) / 100 / 500) * 500; pintar(); },
    no: () => m.cerrar(),
    ok: async () => {
      if (!metodo) return toast("Elige el método de pago", true);
      propina = +$("#prop", m.el).value || 0;
      try {
        await api(`/api/cuentas/${cu.id}/cerrar`, "POST", { metodo_pago: metodo, propina, recibido: +($("#rec", m.el)?.value || 0) });
        m.cerrar(); mCuenta.cerrar(); toast("Cuenta cerrada. Mesa disponible ✓"); render();
      } catch (e) { falla(e); }
    },
  });
}

/* ================= TOMA DE PEDIDO ================= */
async function tomarPedido(dest) {
  try { S.menu = await api("/api/menu"); } catch (e) { return falla(e); }
  if (!S.mesero && S.modo === "mesero") return pedirNombre(true);
  const adiciones = (S.menu.find((c) => c.nombre === "Adiciones") || { productos: [] }).productos;
  const titulo = dest.tipo === "mesa" ? `${h(dest.mesa.nombre)}${dest.mesa.ubicacion ? " · " + h(dest.mesa.ubicacion) : ""}` : dest.tipo === "cuenta" ? (dest.cuenta.tipo === "mesa" ? h(dest.cuenta.mesa) : "Domicilio " + h(dest.cuenta.cliente || "")) : "Nuevo domicilio";
  const m = modal(`${titulo} <span class="badge">pedido</span>`, { clase: "ancho", pie: false });
  const estrecho = S.modo === "mesero" || window.innerWidth < 900;
  m.caja.classList.toggle("estrecho", estrecho);
  m.cuerpo.style.padding = "0";
  m.cuerpo.style.overflow = "hidden";
  let cat = S.menu.filter((c) => c.nombre !== "Adiciones")[0].id;
  let cart = [];
  const precioLinea = (l) => (l.p.precio + l.extras.reduce((a, e) => a + e.precio, 0)) * l.cantidad;
  const totalCart = () => cart.reduce((a, l) => a + precioLinea(l), 0);
  m.cuerpo.innerHTML = `<div class="pedido ${estrecho ? "estrecho" : ""}"><div class="p-menu"><div class="cats" id="cats"></div><div class="prods" id="prods"></div></div><div class="p-carro"><div class="carro-lista" id="carro"></div><div class="carro-pie" id="cpie"></div></div></div>`;
  const pCats = () => ($("#cats", m.el).innerHTML = S.menu.filter((c) => c.nombre !== "Adiciones").map((c) => `<button class="${c.id === cat ? "act" : ""}" data-act="cat" data-id="${c.id}">${h(c.nombre)}</button>`).join(""));
  const pProds = () => {
    const c = S.menu.find((x) => x.id === cat);
    $("#prods", m.el).innerHTML = c.productos.map((p) => `<button class="prod" data-act="prod" data-id="${p.id}"><span class="nm">${h(p.nombre)} ${p.encargo ? '<span class="badge">por encargo</span>' : ""}</span><span class="ds">${h(p.descripcion)}</span><span class="pr dinero">${money(p.precio)}</span></button>`).join("");
  };
  const pCarro = () => {
    $("#carro", m.el).innerHTML = cart.length ? cart.map((l, i) => `
      <div class="linea"><div class="stepper"><button data-act="menos" data-i="${i}">−</button><span>${l.cantidad}</span><button data-act="mas" data-i="${i}">+</button></div>
      <div class="t">${h(l.p.nombre)}<div class="d">${detalleItem({ opciones: { grupos: l.grupos, quitar: l.quitar, extras: l.extras, nota: l.nota } })}</div></div>
      <span class="p dinero">${money(precioLinea(l))}</span></div>`).join("") : `<div class="vacio">Toca un producto para agregarlo</div>`;
    const dom = dest.tipo === "domicilio" || (dest.tipo === "cuenta" && dest.cuenta.tipo === "domicilio");
    $("#cpie", m.el).innerHTML = `<div class="total-grande" style="padding-top:0"><span>Este pedido</span><span class="v dinero" style="font-size:26px">${money(totalCart())}</span></div><div class="fila"><button class="btn" data-act="salir">Cancelar</button><button class="btn pri crece" data-act="enviar" ${cart.length ? "" : "disabled"}>Enviar a cocina</button></div>`;
  };
  pCats(); pProds(); pCarro();
  const agregar = (p, cfg) => {
    if (!cfg.complejo) { const e = cart.find((l) => l.p.id === p.id && !l.complejo && !l.nota); if (e) { e.cantidad++; return; } }
    cart.push({ p, cantidad: 1, grupos: {}, quitar: [], extras: [], nota: "", ...cfg });
  };
  acciones(m.el, {
    cat: (d) => { cat = +d.id; pCats(); pProds(); },
    prod: (d) => {
      const p = S.menu.flatMap((c) => c.productos).find((x) => x.id === +d.id);
      if ((p.grupos && p.grupos.length) || (p.quitar && p.quitar.length)) opcionesProducto(p, adiciones, (cfg) => { cart.push({ p, ...cfg, complejo: true }); pCarro(); });
      else { agregar(p, {}); pCarro(); }
    },
    menos: (d) => { const l = cart[+d.i]; if (--l.cantidad <= 0) cart.splice(+d.i, 1); pCarro(); },
    mas: (d) => { cart[+d.i].cantidad++; pCarro(); },
    salir: async () => { if (!cart.length || (await confirmar("¿Descartar este pedido?", "Descartar"))) m.cerrar(); },
    enviar: async () => {
      const items = cart.map((l) => ({ producto_id: l.p.id, cantidad: l.cantidad, grupos: l.grupos, quitar: l.quitar, extras: l.extras.map((e) => e.id), nota: l.nota }));
      const cuerpo = { mesero: S.mesero || "Caja", items };
      try {
        let r;
        if (dest.tipo === "mesa") r = await api(`/api/mesas/${dest.mesa.id}/pedido`, "POST", cuerpo);
        else if (dest.tipo === "cuenta") r = await api(`/api/cuentas/${dest.cuenta.id}/pedido`, "POST", cuerpo);
        else r = await api("/api/domicilios", "POST", { ...dest.datos, ...cuerpo });
        m.cerrar();
        if (r.impresion && r.impresion.ok) toast("Pedido enviado e impreso en cocina ✓");
        else mostrarComanda(r);
        render();
      } catch (e) { falla(e); }
    },
  });
}
function mostrarComanda(r) {
  const m = modal("Pedido enviado ✓", { clase: "medio" });
  const imp = r.impresion || {};
  const aviso = imp.offline ? imp.error : imp.sin_impresora ? "No hay impresora configurada en el PC, por eso no se imprimió." : `⚠ No se pudo imprimir: ${imp.error || "error desconocido"}`;
  m.cuerpo.innerHTML = `<p class="muted" style="margin-top:0">Total de la cuenta hasta ahora: <b class="dinero" style="color:var(--amarillo)">${money(r.total)}</b>.</p><p style="color:var(--rojo,#ff6b5b)">${h(aviso)}</p><div class="pre">${h(r.comanda)}</div>`;
  m.pie.innerHTML = `<button class="btn" data-act="re">Reintentar impresión</button>${window.KatriNative ? '<button class="btn" data-act="cel">Imprimir desde el celular</button>' : ""}<button class="btn pri" data-act="ok">Listo</button>`;
  acciones(m.el, {
    ok: () => m.cerrar(),
    cel: async () => { toast("Imprimiendo…", false, 2000); const pr = await OFF.imprimirNativo(r.comanda); if (pr.ok) { toast("Impreso desde el celular ✓"); m.cerrar(); } else toast(pr.msg || "No se pudo imprimir", true, 6000); },
    re: async () => { try { const x = await api(`/api/cuentas/${r.cuenta_id}/reimprimir`, "POST", { ronda: r.ronda }); if (x.ok) { toast("Impreso en cocina ✓"); m.cerrar(); } else toast(x.error || "No se pudo imprimir", true, 5000); } catch (e) { falla(e); } },
  });
}

function opcionesProducto(p, adiciones, alAgregar) {
  const m = modal(h(p.nombre), { clase: "" });
  const st = { cantidad: 1, grupos: {}, quitar: [], extras: {}, nota: "" };
  (p.grupos || []).forEach((g) => (st.grupos[g.nombre] = []));
  /* el patacón se puede combinar verde y maduro (1 a 2). Las proteínas siempre se pueden elegir de 1 a 3, sin importar cuántas diga el producto */
  const visible = (g) => !g.depende || (st.grupos[g.depende.grupo] || []).includes(g.depende.valor);
  const lim = (g) => (g.multi ? { min: 1, max: g.opciones.length } : /^prote[ií]na/i.test(g.nombre) ? { min: 1, max: 3 } : /^patac[oó]n/i.test(g.nombre) ? { min: 1, max: 2 } : { min: g.cantidad, max: g.cantidad });
  const faltan = () => (p.grupos || []).filter((g) => visible(g) && st.grupos[g.nombre].length < lim(g).min);
  const extrasLista = () => Object.entries(st.extras).flatMap(([id, n]) => Array(n).fill(adiciones.find((a) => a.id === +id)));
  const precio = () => (p.precio + extrasLista().reduce((a, e) => a + e.precio, 0)) * st.cantidad;
  const pintar = () => {
    let html = p.descripcion ? `<div class="muted" style="font-size:13px">${h(p.descripcion)}</div>` : "";
    (p.grupos || []).forEach((g) => {
      if (!visible(g)) { st.grupos[g.nombre] = []; return; }
      const sel = st.grupos[g.nombre]; const cnt = {}; sel.forEach((x) => (cnt[x] = (cnt[x] || 0) + 1));
      const L = lim(g);
      const pista = g.multi ? `elige una o varias (${sel.length})` : L.max === 1 ? "elige 1" : L.min === L.max ? `elige ${L.max} (${sel.length}/${L.max})` : `elige de ${L.min} a ${L.max} (${sel.length}/${L.max}) · repite para doble`;
      html += `<div class="grupo-t"><b>${h(g.nombre)}</b><small>${pista} ${L.max > 1 && sel.length ? `<a href="#" data-act="reset" data-g="${h(g.nombre)}" style="color:var(--rosa)">borrar</a>` : ""}</small></div><div class="opciones">${g.opciones.map((o) => `<button class="op ${cnt[o] ? "sel" : ""}" data-act="op" data-g="${h(g.nombre)}" data-o="${h(o)}">${h(o)}${cnt[o] && L.max > 1 && !g.multi ? `<span class="cnt" data-act="opmenos" data-g="${h(g.nombre)}" data-o="${h(o)}">${cnt[o]} −</span>` : ""}</button>`).join("")}</div>`;
    });
    if ((p.quitar || []).length) html += `<div class="grupo-t"><b>Quitar ingredientes</b><small>toca para quitar</small></div><div class="opciones">${p.quitar.map((q) => `<button class="op quitar ${st.quitar.includes(q) ? "sel" : ""}" data-act="q" data-q="${h(q)}">Sin ${h(q)}</button>`).join("")}</div>`;
    if (adiciones.length) html += `<div class="grupo-t"><b>Adiciones</b><small>cobran aparte</small></div>${adiciones.map((a) => `<div class="extra"><span class="nm">${h(a.nombre.replace("Adición ", ""))} <span class="muted">${money(a.precio)}</span></span><div class="stepper"><button data-act="emenos" data-id="${a.id}">−</button><span>${st.extras[a.id] || 0}</span><button data-act="emas" data-id="${a.id}">+</button></div></div>`).join("")}`;
    html += `<label>Nota para cocina</label><input id="nota" value="${h(st.nota)}" placeholder="Ej. bien tostado, salsa aparte..." autocomplete="off">`;
    m.cuerpo.innerHTML = html;
    $("#nota", m.el).addEventListener("input", (e) => (st.nota = e.target.value));
    const f = faltan();
    m.pie.innerHTML = `<div class="stepper"><button data-act="cmenos">−</button><span>${st.cantidad}</span><button data-act="cmas">+</button></div><span style="flex:1;text-align:right;font-weight:700;color:var(--amarillo)" class="dinero">${money(precio())}</span><button class="btn pri" data-act="ok" ${f.length ? "disabled" : ""}>${f.length ? "Falta: " + h(f[0].nombre.split(" (")[0]) : "Agregar"}</button>`;
  };
  pintar();
  acciones(m.el, {
    op: (d) => {
      const g = p.grupos.find((x) => x.nombre === d.g), sel = st.grupos[g.nombre], L = lim(g);
      if (g.multi) {
        const i = sel.indexOf(d.o);
        if (i >= 0) sel.splice(i, 1);
        else if (/^todas?$/i.test(d.o)) st.grupos[g.nombre] = [d.o];
        else { st.grupos[g.nombre] = sel.filter((x) => !/^todas?$/i.test(x)); st.grupos[g.nombre].push(d.o); }
      } else if (L.max === 1) st.grupos[g.nombre] = [d.o];
      else if (sel.length < L.max) sel.push(d.o);
      else toast(`Máximo ${L.max}. Toca el “−” de una opción o “borrar” para cambiar`, true);
      pintar();
    },
    opmenos: (d) => { const sel = st.grupos[d.g]; const i = sel.lastIndexOf(d.o); if (i >= 0) sel.splice(i, 1); pintar(); },
    reset: (d, b, ev) => { ev.preventDefault(); st.grupos[d.g] = []; pintar(); },
    q: (d) => { const i = st.quitar.indexOf(d.q); if (i >= 0) st.quitar.splice(i, 1); else st.quitar.push(d.q); pintar(); },
    emas: (d) => { st.extras[d.id] = (st.extras[d.id] || 0) + 1; pintar(); },
    emenos: (d) => { if (st.extras[d.id]) st.extras[d.id]--; pintar(); },
    cmas: () => { st.cantidad++; pintar(); },
    cmenos: () => { if (st.cantidad > 1) st.cantidad--; pintar(); },
    ok: () => { alAgregar({ cantidad: st.cantidad, grupos: st.grupos, quitar: st.quitar, extras: extrasLista(), nota: st.nota.trim() }); m.cerrar(); },
  });
}

/* ================= DOMICILIOS ================= */
async function vDomicilios(silencioso) {
  let lista;
  const vv = S.vista;
  try { lista = await api("/api/cuentas?tipo=domicilio&hoy=1"); } catch (e) { if (!silencioso) falla(e); return; }
  if (vv !== S.vista) return;
  const abiertas = lista.filter((c) => c.estado === "abierta"), cerr = lista.filter((c) => c.estado === "cerrada");
  const tarj = (c) => `<button class="mesa ${c.estado === "abierta" ? "ocupada" : ""}" style="border-color:${c.estado === "abierta" ? "var(--rojo)" : "#444"};background:${c.estado === "abierta" ? "rgba(70,20,20,.85)" : "rgba(30,30,30,.85)"};text-align:left" data-act="ver" data-id="${c.id}"><div><div class="n" style="font-size:17px">${h(c.cliente || "Sin nombre")}</div><div class="u">📍 ${h(c.direccion)}</div><div class="u">${h(c.telefono || "")}</div></div><div class="e" style="color:var(--amarillo)">${money(c.total)}<div class="muted" style="font-size:12px;font-weight:400">${hora(c.creada)} · ${c.estado}</div></div></button>`;
  const main = vista(`<div class="fila" style="margin-bottom:12px"><h1 class="crece" style="font-size:24px">Domicilios</h1><button class="btn pri" data-act="nuevo">+ Nuevo domicilio</button></div>
    <h3 style="font-size:15px;margin:6px 0 10px">Por cobrar (${abiertas.length})</h3>
    ${abiertas.length ? `<div class="rejilla" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${abiertas.map(tarj).join("")}</div>` : '<div class="vacio">No hay domicilios abiertos</div>'}
    ${cerr.length ? `<h3 style="font-size:15px;margin:22px 0 10px">Cerrados hoy (${cerr.length})</h3><div class="rejilla" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${cerr.map(tarj).join("")}</div>` : ""}`);
  acciones(main, { nuevo: formDomicilio, ver: (d) => verCuenta(+d.id) });
}
function formDomicilio() {
  const m = modal("Nuevo domicilio", { clase: "medio" });
  m.cuerpo.innerHTML = `<label>Teléfono</label><input id="d-t" type="tel" inputmode="tel" autocomplete="off" placeholder="Si ya pidió antes, se llenan sus datos"><div id="d-aviso" class="muted" style="font-size:13px;min-height:18px"></div><label>Nombre del cliente</label><input id="d-n" autocomplete="off"><label>Dirección *</label><input id="d-d" autocomplete="off"><label>Observaciones</label><input id="d-o" autocomplete="off" placeholder="Ej. torre 2, apto 301, pagar con billete de 50"><p class="muted" style="font-size:13px">Si lleva envase, agrégalo como producto («Envase para llevar»).</p>`;
  let tb;
  $("#d-t", m.el).addEventListener("input", (e) => {
    clearTimeout(tb);
    const tel = e.target.value.replace(/\D/g, "");
    if (tel.length < 7) { $("#d-aviso", m.el).textContent = ""; return; }
    tb = setTimeout(async () => {
      try {
        const c = await api("/api/clientes?tel=" + tel);
        if (!c.telefono) { $("#d-aviso", m.el).textContent = "Cliente nuevo: sus datos se guardarán con este pedido."; return; }
        $("#d-n", m.el).value = c.cliente || ""; $("#d-d", m.el).value = c.direccion || ""; $("#d-o", m.el).value = c.notas || "";
        $("#d-aviso", m.el).innerHTML = "✓ <b style='color:var(--verde,#3ecf6e)'>Cliente guardado</b>: datos cargados. Corrige lo que haya cambiado.";
      } catch (er) { /* sin conexión: se llena a mano */ }
    }, 350);
  });
  m.pie.innerHTML = `<button class="btn" data-act="no">Cancelar</button><button class="btn pri" data-act="ok">Elegir productos →</button>`;
  setTimeout(() => $("#d-t", m.el).focus(), 50);
  acciones(m.el, {
    no: () => m.cerrar(),
    ok: () => {
      const datos = { cliente: $("#d-n", m.el).value, telefono: $("#d-t", m.el).value, direccion: $("#d-d", m.el).value, notas: $("#d-o", m.el).value };
      if (!datos.direccion.trim()) return toast("Falta la dirección", true);
      m.cerrar(); tomarPedido({ tipo: "domicilio", datos });
    },
  });
}

/* ================= REPORTES ================= */
let repEstado = { desde: hoyISO(), hasta: hoyISO() };
async function vReportes() {
  const main = vista(`<h1 style="font-size:24px;margin-bottom:10px">Reportes de ventas</h1>
    <div class="tarjeta"><div class="fila"><div><label style="margin-top:0">Desde</label><input type="date" id="r-d" value="${repEstado.desde}"></div><div><label style="margin-top:0">Hasta</label><input type="date" id="r-h" value="${repEstado.hasta}"></div>
    <button class="btn pri" data-act="gen" style="align-self:flex-end">Generar</button><button class="btn verde" data-act="xls" style="align-self:flex-end">⬇ Exportar a Excel</button></div>
    <div class="rapidos" style="margin-top:10px"><button class="chip" data-act="rg" data-r="hoy">Hoy</button><button class="chip" data-act="rg" data-r="ayer">Ayer</button><button class="chip" data-act="rg" data-r="7">Últimos 7 días</button><button class="chip" data-act="rg" data-r="mes">Este mes</button><button class="chip" data-act="rg" data-r="mesant">Mes anterior</button></div></div><div id="rep"></div>`);
  acciones(main, {
    gen: () => { leerFechas(); cargar(); },
    rg: (d) => {
      const t = new Date(); let a = new Date(t), b = new Date(t);
      if (d.r === "ayer") { a.setDate(a.getDate() - 1); b = new Date(a); }
      else if (d.r === "7") a.setDate(a.getDate() - 6);
      else if (d.r === "mes") a = new Date(t.getFullYear(), t.getMonth(), 1);
      else if (d.r === "mesant") { a = new Date(t.getFullYear(), t.getMonth() - 1, 1); b = new Date(t.getFullYear(), t.getMonth(), 0); }
      $("#r-d").value = hoyISO(a); $("#r-h").value = hoyISO(b); leerFechas(); cargar();
    },
    xls: () => exportarExcel("ventas"),
  });
  const leerFechas = () => { repEstado = { desde: $("#r-d").value, hasta: $("#r-h").value }; };
  async function cargar() {
    if (!repEstado.desde || !repEstado.hasta || repEstado.desde > repEstado.hasta) return toast("Revisa el rango de fechas", true);
    let r;
    try { r = await api(`/api/reportes?desde=${repEstado.desde}&hasta=${repEstado.hasta}`); } catch (e) { return falla(e); }
    if (S.vista !== "reportes" || !$("#rep")) return;
    const s = r.resumen, max = (arr) => Math.max(1, ...arr.map((x) => x.ventas));
    const tabla = (titulo, arr, key, cols = ["Cuentas", "Ventas"], xt = false) => `<div class="tarjeta"><h3 style="font-size:15px;margin-bottom:8px">${titulo}</h3>${arr.length ? `<table><tr><th></th><th class="r">${cols[0]}</th><th class="r">${cols[1]}</th>${xt ? '<th class="r">Propinas</th>' : ""}</tr>${arr.map((x) => `<tr><td>${h(x[key])}<div class="barra"><i style="width:${(x.ventas / max(arr)) * 100}%"></i></div></td><td class="r dinero">${x.cantidad}</td><td class="r dinero">${money(x.ventas)}</td>${xt ? `<td class="r dinero">${money(x.extra)}</td>` : ""}</tr>`).join("")}</table>` : '<div class="muted">Sin datos</div>'}</div>`;
    $("#rep").innerHTML = `<div class="kpis"><div class="kpi"><small>Ventas</small><b>${money(s.ventas)}</b></div><div class="kpi"><small>Cuentas cerradas</small><b>${s.cuentas}</b></div><div class="kpi"><small>Ticket promedio</small><b>${money(s.ticket_promedio)}</b></div><div class="kpi"><small>Propinas (aparte)</small><b>${money(s.propinas)}</b></div></div>
      ${s.cuentas ? `<div class="dos-col">${tabla("Por día", r.por_dia, "fecha")}${tabla("Por método de pago", r.por_metodo, "nombre", ["Cuentas", "Ventas"], true)}${tabla("Por producto", r.por_producto, "nombre", ["Cant.", "Ventas"])}${tabla("Por mesero", r.por_mesero, "nombre")}${tabla("Por mesa", r.por_mesa, "nombre")}${tabla("Por hora", r.por_hora, "hora")}</div>` : '<div class="vacio">No hay cuentas cerradas en ese rango</div>'}
      <p class="muted" style="font-size:12px;margin-top:14px">Solo cuentan las cuentas cerradas en caja. Las ventas incluyen el envase de los domicilios; las propinas van aparte.</p>`;
  }
  cargar();
}
async function exportarExcel(tipo = "ventas") {
  const d = $(tipo === "ventas" ? "#r-d" : "#pe-d").value, hh = $(tipo === "ventas" ? "#r-h" : "#pe-h").value;
  if (!d || !hh || d > hh) return toast("Revisa el rango de fechas", true);
  if (window.pywebview && window.pywebview.api && window.pywebview.api.exportar_excel) {
    try { const r = await window.pywebview.api.exportar_excel(d, hh, tipo); if (r) toast("Excel guardado: " + r, false, 4500); } catch (e) { falla(e); }
  } else {
    const a = document.createElement("a"); a.href = `/api/${tipo === "ventas" ? "reportes" : "personal"}/excel?desde=${d}&hasta=${hh}`; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
  }
}

/* ================= MENÚ ================= */
const grupoATexto = (g) => `${g.nombre}${g.multi ? " [varias]" : ""}${g.depende ? ` [si ${g.depende.grupo}=${g.depende.valor}]` : ""}${g.cantidad > 1 ? " x" + g.cantidad : ""}: ${g.opciones.join(", ")}`;
function textoAGrupos(t) {
  return t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const mt = l.match(/^(.+?)(?:\s+x(\d+))?\s*:\s*(.+)$/);
    if (!mt) throw new Error(`Formato de opciones no válido: “${l}”. Usa: Nombre: opción1, opción2`);
    let nombre = mt[1].trim(); const g = { cantidad: +mt[2] || 1, opciones: mt[3].split(",").map((x) => x.trim()).filter(Boolean) };
    if (/\[varias\]/i.test(nombre)) { g.multi = true; nombre = nombre.replace(/\s*\[varias\]/i, ""); }
    const dp = nombre.match(/\s*\[si\s+(.+?)\s*=\s*(.+?)\]/i);
    if (dp) { g.depende = { grupo: dp[1].trim(), valor: dp[2].trim() }; nombre = nombre.replace(dp[0], ""); }
    return { nombre: nombre.trim(), ...g };
  });
}
async function vMenu() {
  let menu;
  const vv = S.vista;
  try { menu = await api("/api/menu?todos=1"); } catch (e) { return falla(e); }
  if (vv !== S.vista) return;
  S.menuEd = menu;
  const main = vista(`<div class="fila" style="margin-bottom:6px"><h1 class="crece" style="font-size:24px">Menú y precios</h1><button class="btn" data-act="ncat">+ Categoría</button></div>
    <p class="muted" style="margin:0 0 6px">Los cambios se reflejan al instante en el celular.</p><div class="menu-ed">${menu.map((c) => `
      <div class="cat-t"><h3>${h(c.nombre)}</h3><button class="btn peq" data-act="rcat" data-id="${c.id}">Renombrar</button><button class="btn peq" data-act="nprod" data-id="${c.id}">+ Producto</button></div>
      ${c.productos.map((p) => `<div class="fila-p ${p.activo ? "" : "inactivo"}"><span>${h(p.nombre)} ${p.encargo ? '<span class="badge">encargo</span>' : ""} ${p.activo ? "" : '<span class="badge" style="background:#555">oculto</span>'}</span><span class="pp dinero" style="color:var(--amarillo);font-weight:700;text-align:right">${money(p.precio)}</span><button class="btn peq" data-act="eprod" data-id="${p.id}">Editar</button><span></span></div>`).join("") || '<div class="muted" style="padding:6px 0">Sin productos</div>'}`).join("")}</div>`);
  acciones(main, {
    ncat: () => formCat(), rcat: (d) => formCat(S.menuEd.find((c) => c.id === +d.id)),
    nprod: (d) => formProd(null, +d.id), eprod: (d) => formProd(S.menuEd.flatMap((c) => c.productos).find((p) => p.id === +d.id)),
  });
}
function formCat(c) {
  const m = modal(c ? "Renombrar categoría" : "Nueva categoría", { clase: "medio" });
  m.cuerpo.innerHTML = `<label>Nombre</label><input id="c-n" value="${h(c ? c.nombre : "")}" autocomplete="off">`;
  m.pie.innerHTML = `${c ? '<button class="btn rojo peq" data-act="del">Eliminar</button><span style="flex:1"></span>' : ""}<button class="btn pri" data-act="ok">Guardar</button>`;
  acciones(m.el, {
    ok: async () => { try { await api("/api/categorias", "POST", { id: c && c.id, nombre: $("#c-n", m.el).value }); m.cerrar(); vMenu(); } catch (e) { falla(e); } },
    del: async () => { if (!(await confirmar("¿Eliminar la categoría?", "Eliminar"))) return; try { await api("/api/categorias/" + c.id, "DELETE"); m.cerrar(); vMenu(); } catch (e) { falla(e); } },
  });
}
function formProd(p, catId) {
  const m = modal(p ? "Editar producto" : "Nuevo producto", { clase: "" });
  const nuevo = !p; p = p || { nombre: "", precio: 0, descripcion: "", grupos: [], quitar: [], activo: 1, encargo: 0, categoria_id: catId };
  m.cuerpo.innerHTML = `<label style="margin-top:0">Nombre</label><input id="p-n" value="${h(p.nombre)}" autocomplete="off">
    <div class="fila"><div class="crece"><label>Categoría</label><select id="p-c">${S.menuEd.map((c) => `<option value="${c.id}" ${c.id === p.categoria_id ? "selected" : ""}>${h(c.nombre)}</option>`).join("")}</select></div><div style="width:150px"><label>Precio</label><input id="p-p" type="number" min="0" step="500" value="${p.precio}"></div></div>
    <label>Descripción (se muestra al mesero)</label><input id="p-d" value="${h(p.descripcion)}" autocomplete="off">
    <label>Opciones a elegir — una por línea: Nombre: op1, op2 &nbsp;(varias a la vez: Nombre [varias]: … · solo si otra se eligió: Nombre [si Otro=Valor]: …)</label><textarea id="p-g" rows="3" placeholder="Proteína: Carne de Res, Pollo, Birria">${h(p.grupos.map(grupoATexto).join("\n"))}</textarea>
    <label>Ingredientes que se pueden quitar (separados por coma)</label><input id="p-q" value="${h((p.quitar || []).join(", "))}" placeholder="Lechuga, Sour Cream, Tajín">
    <div class="fila" style="margin-top:12px"><label style="margin:0;text-transform:none;font-size:14px;color:var(--texto)"><input type="checkbox" id="p-a" style="width:auto" ${p.activo ? "checked" : ""}> Visible en el menú</label><label style="margin:0;text-transform:none;font-size:14px;color:var(--texto)"><input type="checkbox" id="p-e" style="width:auto" ${p.encargo ? "checked" : ""}> Solo por encargo</label></div>`;
  m.pie.innerHTML = `${nuevo ? "" : '<button class="btn rojo peq" data-act="del">Eliminar</button>'}<span style="flex:1"></span><button class="btn" data-act="no">Cancelar</button><button class="btn pri" data-act="ok">Guardar</button>`;
  acciones(m.el, {
    no: () => m.cerrar(),
    ok: async () => {
      try {
        const cuerpo = { id: nuevo ? undefined : p.id, nombre: $("#p-n", m.el).value, categoria_id: +$("#p-c", m.el).value, precio: +$("#p-p", m.el).value || 0, descripcion: $("#p-d", m.el).value, grupos: textoAGrupos($("#p-g", m.el).value), quitar: $("#p-q", m.el).value.split(",").map((x) => x.trim()).filter(Boolean), activo: $("#p-a", m.el).checked ? 1 : 0, encargo: $("#p-e", m.el).checked ? 1 : 0 };
        await api("/api/productos", "POST", cuerpo); m.cerrar(); toast("Guardado ✓"); vMenu();
      } catch (e) { falla(e); }
    },
    del: async () => { if (!(await confirmar(`¿Eliminar “${h(p.nombre)}”? Las ventas pasadas no se afectan.`, "Eliminar"))) return; try { await api("/api/productos/" + p.id, "DELETE"); m.cerrar(); vMenu(); } catch (e) { falla(e); } },
  });
}

/* ================= CONFIGURACIÓN ================= */
function tarjetaNativa() {
  let p = { permiso: true, lista: [] };
  try { p = JSON.parse(window.KatriNative.impresoras()); } catch (e) { /* ignorar */ }
  const act = window.KatriNative.impresoraActual();
  return `<div class="tarjeta" style="margin-top:14px"><h3 style="font-size:15px">Esta app (Android)</h3>
    <label>Dirección del PC del restaurante</label><input id="n-host" value="${h(window.KatriNative.servidor())}" placeholder="192.168.110.138" autocomplete="off">
    <label>Impresora Bluetooth de este celular (para imprimir cuando no hay PC)</label>
    <select id="n-imp"><option value="">— Ninguna —</option>${p.lista.map((x) => `<option value="${h(x.mac)}" ${x.mac === act ? "selected" : ""}>${h(x.nombre)}</option>`).join("")}</select>
    ${p.permiso ? (p.lista.length ? "" : '<p class="muted" style="font-size:12px;margin:6px 0 0">No hay impresoras emparejadas. Empareja la impresora en Ajustes de Android → Bluetooth (clave 0000 o 1234).</p>') : '<p style="color:#ff8a80;font-size:13px">Falta el permiso de Bluetooth: concédelo en Ajustes → Apps → Katri Locos → Permisos.</p>'}
    <div class="fila" style="margin-top:12px"><button class="btn pri" data-act="nguardar">Guardar</button><button class="btn" data-act="nprueba">Imprimir prueba</button></div></div>`;
}

async function vConfig() {
  if (window.KatriNative) {
    const main = vista(`<h1 style="font-size:24px;margin-bottom:12px">Ajustes de la app</h1>${tarjetaNativa()}<p class="muted" style="font-size:13px;margin-top:14px">El menú, las mesas y los reportes se cambian desde el programa del PC.</p>`);
    acciones(main, {
    nguardar: () => { window.KatriNative.fijarServidor($("#n-host").value); window.KatriNative.fijarImpresora($("#n-imp").value); toast("Guardado ✓"); OFF.intentarSync(false); },
    nprueba: async () => { window.KatriNative.fijarImpresora($("#n-imp").value); toast("Enviando prueba…", false, 2000); const pr = await OFF.imprimirNativo("PRUEBA DE IMPRESION\n================================\nKatri Locos Street Food\nSi lees esto, la impresora\nquedo bien configurada.\n================================"); if (pr.ok) toast("Prueba enviada ✓ Revisa el papel", false, 4000); else toast(pr.msg || "No se pudo imprimir", true, 7000); },
    });
    return;
  }
  let info, mesas;
  const vv = S.vista;
  let imp;
  try { [info, mesas, imp] = await Promise.all([api("/api/info"), api("/api/mesas"), api("/api/impresora")]); } catch (e) { return falla(e); }
  if (vv !== S.vista) return;
  S.info = info;
  const opsPuerto = imp.puertos.map((x) => `<option value="${h(x.puerto)}" ${x.puerto === imp.puerto ? "selected" : ""}>${h(x.puerto)}${x.tipo ? " · " + x.tipo : ""}</option>`).join("");
  const hayActual = !imp.puerto || imp.puertos.some((x) => x.puerto === imp.puerto);
  const main = vista(`<h1 style="font-size:24px;margin-bottom:12px">Configuración</h1>
    <div class="dos-col">
    <div class="tarjeta"><h3 style="font-size:15px">Negocio</h3><label>Nombre</label><input id="c-neg" value="${h(info.negocio)}"><label>Teléfono</label><input id="c-tel" value="${h(info.telefono)}"><div style="margin-top:12px"><button class="btn pri" data-act="gneg">Guardar</button></div></div>
    <div class="tarjeta"><h3 style="font-size:15px">Conexión del celular</h3><p class="muted" style="font-size:14px">El celular y este PC deben estar en el mismo wifi. En el navegador del celular abre:</p><div class="pre" style="font-size:16px;color:var(--amarillo)">${h(info.url_mesero)}</div><p class="muted" style="font-size:12px">Si no abre, permite el acceso cuando Windows pregunte por el firewall (redes privadas). Conviene asignar una IP fija a este PC en el router.</p></div></div>
    ${window.KatriNative ? tarjetaNativa() : ""}
    <div class="tarjeta" style="margin-top:14px"><h3 style="font-size:15px">Impresora de cocina (58 mm)</h3>
    <p class="muted" style="font-size:14px;margin-top:0">Cada pedido que llegue (del celular o de este PC) se imprime solo. Empareja la impresora en Windows y elige aquí su puerto COM.</p>
    <label>Puerto de la impresora</label>
    <select id="i-pto"><option value="">— Sin impresora —</option>${hayActual ? "" : `<option value="${h(imp.puerto)}" selected>${h(imp.puerto)} (no detectado)</option>`}${opsPuerto}</select>
    <label style="display:flex;gap:8px;align-items:center;text-transform:none"><input type="checkbox" id="i-til" ${imp.sin_tildes ? "checked" : ""} style="width:auto"> Quitar tildes y ñ (déjalo marcado si salen símbolos raros)</label>
    <div class="fila" style="margin-top:12px"><button class="btn pri" data-act="gimp">Guardar</button><button class="btn" data-act="pimp">Imprimir prueba</button><button class="btn" data-act="rimp">Actualizar puertos</button></div>
    ${imp.puertos.length ? "" : `<p class="muted" style="font-size:12px;margin-bottom:0">No se detectan puertos COM. Empareja la impresora en Windows (Bluetooth) y pulsa «Actualizar puertos».</p>`}</div>
    <div class="tarjeta" style="margin-top:14px"><div class="fila"><h3 class="crece" style="font-size:15px">Mesas y ubicaciones</h3><button class="btn peq" data-act="nmesa">+ Agregar mesa</button></div>
    <datalist id="ubis"><option>Adentro</option><option>Afuera</option><option>Terraza</option><option>Barra</option><option>Mesa alta afuera</option><option>Mesa alta adentro</option></datalist>
    <div class="lista-edit" style="margin-top:10px">${mesas.map((x) => filaMesa(x)).join("")}</div></div>`);
  acciones(main, {
    gneg: async () => { try { await api("/api/config", "POST", { negocio: $("#c-neg").value, telefono: $("#c-tel").value }); toast("Guardado ✓"); } catch (e) { falla(e); } },
    nguardar: () => { window.KatriNative.fijarServidor($("#n-host").value); window.KatriNative.fijarImpresora($("#n-imp").value); toast("Guardado ✓"); OFF.intentarSync(false); },
    nprueba: async () => { window.KatriNative.fijarImpresora($("#n-imp").value); toast("Enviando prueba…", false, 2000); const pr = await OFF.imprimirNativo("PRUEBA DE IMPRESION\n================================\nKatri Locos Street Food\nSi lees esto, la impresora\nquedo bien configurada.\n================================"); if (pr.ok) toast("Prueba enviada ✓ Revisa el papel", false, 4000); else toast(pr.msg || "No se pudo imprimir", true, 7000); },
    gimp: async () => { try { await api("/api/impresora", "POST", { puerto: $("#i-pto").value, sin_tildes: $("#i-til").checked }); toast("Impresora guardada ✓"); } catch (e) { falla(e); } },
    pimp: async () => {
      try {
        await api("/api/impresora", "POST", { puerto: $("#i-pto").value, sin_tildes: $("#i-til").checked });
        toast("Enviando prueba…", false, 2500);
        const r = await api("/api/impresora/prueba", "POST", {});
        if (r.ok) toast("Prueba enviada ✓ Revisa el papel", false, 4000); else toast(r.error || "No se pudo imprimir", true, 7000);
      } catch (e) { falla(e); }
    },
    rimp: () => vConfig(),
    gmesa: async (d, b) => { const f = b.closest(".fila-e"); try { await api("/api/mesas", "POST", { id: +d.id, nombre: $(".f-n", f).value, ubicacion: $(".f-u", f).value }); toast("Mesa guardada ✓"); } catch (e) { falla(e); } },
    dmesa: async (d) => { if (!(await confirmar("¿Eliminar esta mesa?", "Eliminar"))) return; try { await api("/api/mesas/" + d.id, "DELETE"); vConfig(); } catch (e) { falla(e); } },
    nmesa: async () => { try { const n = mesas.length + 1; await api("/api/mesas", "POST", { nombre: "Mesa " + n, ubicacion: "" }); vConfig(); } catch (e) { falla(e); } },
  });
}
const filaMesa = (x) => `<div class="fila-e"><input class="f-n" value="${h(x.nombre)}"><input class="f-u" list="ubis" value="${h(x.ubicacion)}" placeholder="Ubicación (ej. Mesa alta afuera)"><div class="fila"><button class="btn peq pri" data-act="gmesa" data-id="${x.id}">Guardar</button><button class="btn peq rojo" data-act="dmesa" data-id="${x.id}">✕</button></div></div>`;


/* ================= PERSONAL ================= */
const dur = (seg) => { const m = Math.floor((seg || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`; };
const fechaCorta = (ts) => `${ts.slice(8, 10)}/${ts.slice(5, 7)}`;
let perRango = { desde: hoyISO(), hasta: hoyISO() };

function vPersonal() {
  const main = vista(`<div class="fila" style="margin-bottom:12px"><h1 class="crece" style="font-size:24px">Personal</h1><button class="btn pri" data-act="nuevo">+ Agregar persona</button></div>
    <div id="per-cards"><div class="vacio">Cargando…</div></div>
    <h3 style="font-size:17px;margin:26px 0 8px">Pago por periodo</h3>
    <div class="tarjeta"><div class="fila"><div><label style="margin-top:0">Desde</label><input type="date" id="pe-d" value="${perRango.desde}"></div><div><label style="margin-top:0">Hasta</label><input type="date" id="pe-h" value="${perRango.hasta}"></div>
    <button class="btn pri" data-act="gen" style="align-self:flex-end">Calcular</button><button class="btn verde" data-act="xls" style="align-self:flex-end">⬇ Excel</button></div>
    <div class="rapidos" style="margin-top:10px"><button class="chip" data-act="rg" data-r="hoy">Hoy</button><button class="chip" data-act="rg" data-r="ayer">Ayer</button><button class="chip" data-act="rg" data-r="semana">Esta semana</button><button class="chip" data-act="rg" data-r="quincena">Quincena</button><button class="chip" data-act="rg" data-r="mes">Este mes</button><button class="chip" data-act="rg" data-r="mesant">Mes anterior</button></div></div>
    <div id="per-rep"></div>`);
  const leer = () => { perRango = { desde: $("#pe-d").value, hasta: $("#pe-h").value }; };
  acciones(main, {
    nuevo: () => formEmpleado(),
    editar: (d) => formEmpleado(S.personal.find((e) => e.id === +d.id)),
    entrada: async (d) => {
      try { const r = await api(`/api/personal/${d.id}/entrada`, "POST", {}); toast(`${r.nombre}: turno iniciado a las ${hora(r.entrada)} ✓`, false, 3500); cargarPersonal(); cargarPeriodo(); } catch (e) { falla(e); }
    },
    salida: async (d) => {
      try { const r = await api(`/api/personal/${d.id}/salida`, "POST", {}); toast(`${r.nombre}: salida a las ${hora(r.salida)} · ${dur(r.segundos)} · pagar ${money(r.pago)}`, false, 8000); cargarPersonal(); cargarPeriodo(); } catch (e) { falla(e); }
    },
    gen: () => { leer(); cargarPeriodo(); },
    xls: () => exportarExcel("personal"),
    rg: (d) => {
      const t = new Date(); let a = new Date(t), b = new Date(t);
      if (d.r === "ayer") { a.setDate(a.getDate() - 1); b = new Date(a); }
      else if (d.r === "semana") { a.setDate(a.getDate() - ((a.getDay() + 6) % 7)); }
      else if (d.r === "quincena") { if (t.getDate() <= 15) { a = new Date(t.getFullYear(), t.getMonth(), 1); b = new Date(t.getFullYear(), t.getMonth(), 15); } else { a = new Date(t.getFullYear(), t.getMonth(), 16); b = new Date(t.getFullYear(), t.getMonth() + 1, 0); } }
      else if (d.r === "mes") a = new Date(t.getFullYear(), t.getMonth(), 1);
      else if (d.r === "mesant") { a = new Date(t.getFullYear(), t.getMonth() - 1, 1); b = new Date(t.getFullYear(), t.getMonth(), 0); }
      $("#pe-d").value = hoyISO(a); $("#pe-h").value = hoyISO(b); leer(); cargarPeriodo();
    },
    turno: (d) => formTurno(S.turnosVista.find((t) => t.id === +d.id)),
    editini: (d) => { const e = S.personal.find((x) => x.id === +d.id); if (e && e.turno_abierto) formTurno({ id: e.turno_abierto.id, empleado: e.nombre, entrada: e.turno_abierto.entrada, salida: null, valor_hora: e.valor_hora }); },
  });
  cargarPersonal(); cargarPeriodo();
  timerRef = setInterval(() => { if (!pilaModales.length && S.vista === "personal") cargarPersonal(true); }, 15000);
}

async function cargarPersonal(silencioso) {
  let lista;
  try { lista = await api("/api/personal"); } catch (e) { if (!silencioso) falla(e); return; }
  const cont = $("#per-cards");
  if (!cont || S.vista !== "personal") return;
  S.personal = lista;
  cont.innerHTML = lista.length ? `<div class="rejilla" style="grid-template-columns:repeat(auto-fill,minmax(270px,1fr))">${lista.map((e) => {
    const t = e.turno_abierto;
    return `<div class="tarjeta" style="border:2px solid ${t ? "var(--verde)" : "var(--linea)"}">
      <div class="fila"><b class="crece" style="font-family:var(--titulo);text-transform:uppercase;font-size:19px">${h(e.nombre)}</b><span class="muted dinero" style="font-size:13px">${money(e.valor_hora)} / hora</span></div>
      ${t ? `<div style="margin:10px 0 2px;color:#7fd7a0;font-weight:700">● Trabajando desde las ${hora(t.entrada)} <button class="btn peq" data-act="editini" data-id="${e.id}" title="Cambiar la hora de inicio" style="margin-left:6px">✎ Cambiar hora</button></div><div class="fila" style="justify-content:space-between"><span style="font-size:22px;font-family:var(--titulo)">${dur(t.segundos)}</span><span class="dinero" style="color:var(--amarillo);font-weight:800;font-size:20px">${money(t.pago)}</span></div><div class="muted" style="font-size:12px">acumulado de este turno</div>` : `<div class="muted" style="margin:10px 0 2px">○ Fuera de turno</div>`}
      <div class="muted dinero" style="font-size:13px;margin-top:6px">Hoy: ${dur(e.hoy.segundos)} · ${money(e.hoy.pago)}</div>
      <div class="fila" style="margin-top:12px;flex-wrap:nowrap">${t ? `<button class="btn rojo crece" data-act="salida" data-id="${e.id}">Registrar salida</button>` : `<button class="btn verde crece" data-act="entrada" data-id="${e.id}">Iniciar turno</button>`}<button class="btn peq" data-act="editar" data-id="${e.id}">Editar</button></div></div>`;
  }).join("")}</div>` : '<div class="vacio">No hay personal. Toca “Agregar persona”.</div>';
}

async function cargarPeriodo() {
  const { desde, hasta } = perRango;
  if (!desde || !hasta || desde > hasta) return toast("Revisa el rango de fechas", true);
  let r;
  try { r = await api(`/api/turnos?desde=${desde}&hasta=${hasta}`); } catch (e) { return falla(e); }
  const cont = $("#per-rep");
  if (!cont || S.vista !== "personal") return;
  S.turnosVista = r.turnos;
  cont.innerHTML = `<div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))"><div class="kpi"><small>Total a pagar</small><b>${money(r.total_pago)}</b></div><div class="kpi"><small>Tiempo trabajado</small><b>${dur(r.total_segundos)}</b></div></div>
    ${r.empleados.length ? `<div class="tarjeta" style="overflow-x:auto"><table><tr><th>Persona</th><th class="r">Turnos</th><th class="r">Tiempo</th><th class="r">Valor/h</th><th class="r">A pagar</th></tr>
      ${r.empleados.map((e) => `<tr><td>${h(e.nombre)}</td><td class="r dinero">${e.turnos}</td><td class="r dinero">${dur(e.segundos)}</td><td class="r dinero">${money(e.valor_hora)}</td><td class="r dinero"><b style="color:var(--amarillo)">${money(e.pago)}</b></td></tr>`).join("")}
      <tr><td><b>TOTAL</b></td><td></td><td class="r dinero"><b>${dur(r.total_segundos)}</b></td><td></td><td class="r dinero"><b style="color:var(--amarillo)">${money(r.total_pago)}</b></td></tr></table></div>
    <h3 style="font-size:15px;margin:18px 0 8px">Detalle de turnos</h3>
    <div class="tarjeta" style="overflow-x:auto"><table><tr><th>Persona</th><th>Día</th><th>Entrada</th><th>Salida</th><th class="r">Tiempo</th><th class="r">Pago</th><th></th></tr>
      ${r.turnos.map((t) => `<tr><td>${h(t.empleado)}</td><td>${fechaCorta(t.entrada)}</td><td>${hora(t.entrada)}</td><td>${t.salida ? hora(t.salida) : '<span style="color:#7fd7a0">en curso</span>'}</td><td class="r dinero">${dur(t.segundos)}</td><td class="r dinero">${money(t.pago)}</td><td class="r"><button class="btn peq" data-act="turno" data-id="${t.id}">✎</button></td></tr>`).join("")}</table></div>` : '<div class="vacio">No hay turnos en ese periodo</div>'}
    <p class="muted" style="font-size:12px;margin-top:12px">El pago se calcula por minutos completos, con el valor de la hora vigente cuando se inició cada turno. Si alguien olvidó marcar, toca ✎ para corregir la hora.</p>`;
}

function formEmpleado(e) {
  const nuevo = !e;
  const m = modal(nuevo ? "Agregar persona" : "Editar persona", { clase: "medio" });
  m.cuerpo.innerHTML = `<label style="margin-top:0">Nombre</label><input id="e-n" value="${h(e ? e.nombre : "")}" autocomplete="off"><label>Valor de la hora (pesos)</label><input id="e-v" type="number" min="0" step="500" value="${e ? e.valor_hora : ""}" placeholder="Ej. 9000"><p class="muted" style="font-size:13px">Si cambias el valor, aplica a los turnos nuevos. Los turnos que ya empezaron o terminaron conservan el valor con el que se registraron.</p>`;
  m.pie.innerHTML = `${nuevo ? "" : '<button class="btn rojo peq" data-act="quitar">Quitar de la lista</button>'}<span style="flex:1"></span><button class="btn" data-act="no">Cancelar</button><button class="btn pri" data-act="ok">Guardar</button>`;
  setTimeout(() => $("#e-n", m.el).focus(), 50);
  acciones(m.el, {
    no: () => m.cerrar(),
    ok: async () => {
      try { await api("/api/personal", "POST", { id: e && e.id, nombre: $("#e-n", m.el).value, valor_hora: +$("#e-v", m.el).value || 0 }); m.cerrar(); toast("Guardado ✓"); cargarPersonal(); } catch (er) { falla(er); }
    },
    quitar: async () => {
      if (!(await confirmar(`¿Quitar a ${h(e.nombre)} de la lista? Sus pagos anteriores se conservan en los reportes.`, "Quitar"))) return;
      try { await api("/api/personal/" + e.id, "DELETE"); m.cerrar(); toast("Quitado de la lista"); cargarPersonal(); cargarPeriodo(); } catch (er) { falla(er); }
    },
  });
}

function formTurno(t) {
  if (!t) return;
  const m = modal(`Corregir turno · ${h(t.empleado)}`, { clase: "medio" });
  const iso = (ts) => (ts ? ts.slice(0, 16).replace(" ", "T") : "");
  m.cuerpo.innerHTML = `<label style="margin-top:0">Hora de inicio</label><input type="datetime-local" id="t-e" value="${iso(t.entrada)}"><label>Salida (déjala vacía si sigue trabajando)</label><input type="datetime-local" id="t-s" value="${iso(t.salida)}"><p class="muted" style="font-size:13px">Valor de la hora en este turno: ${money(t.valor_hora)}</p>`;
  m.pie.innerHTML = `<button class="btn rojo peq" data-act="borrar">Eliminar turno</button><span style="flex:1"></span><button class="btn" data-act="no">Cancelar</button><button class="btn pri" data-act="ok">Guardar</button>`;
  acciones(m.el, {
    no: () => m.cerrar(),
    ok: async () => { try { await api("/api/turnos/" + t.id, "POST", { entrada: $("#t-e", m.el).value, salida: $("#t-s", m.el).value }); m.cerrar(); toast("Turno corregido ✓"); cargarPersonal(); cargarPeriodo(); } catch (er) { falla(er); } },
    borrar: async () => { if (!(await confirmar("¿Eliminar este turno? No se puede deshacer.", "Eliminar"))) return; try { await api("/api/turnos/" + t.id, "DELETE"); m.cerrar(); toast("Turno eliminado"); cargarPersonal(); cargarPeriodo(); } catch (er) { falla(er); } },
  });
}

/* ---------------- arranque ---------------- */
(async function iniciar() {
  window.addEventListener("pywebviewready", iniciarBarra);
  if (S.enApp) iniciarBarra();
  try { S.info = await api("/api/info"); const sub = $("#tb-sub"); if (sub && S.info.negocio) sub.textContent = "· " + S.info.negocio; } catch (e) { /* ignorar */ }
  render();
  if (S.modo === "mesero" && !S.mesero) pedirNombre(true);
  if (S.modo === "mesero" && !S.enApp && typeof OFF !== "undefined") OFF.iniciar();
})();
