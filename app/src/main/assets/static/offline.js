/* Katri Locos - modo SIN CONEXIÓN del celular.
   El celular lleva una copia de los datos y el mismo motor del programa del PC (Python en el navegador).
   Si el PC no responde, trabaja con la copia y guarda una cola; al volver la conexión la envía al PC. */
"use strict";
const OFF = (() => {
  const K_COLA = "katri_cola", K_COPIA = "katri_copia_ok";
  let py = null, motor = null, activo = false, sincronizando = false, pullT = null, banner = null, vigilante = null;

  const leerCola = () => { try { return JSON.parse(localStorage.getItem(K_COLA) || "[]"); } catch (e) { return []; } };
  const guardarCola = (c) => { try { localStorage.setItem(K_COLA, JSON.stringify(c)); } catch (e) { /* sin espacio */ } };
  const hayCopia = () => { try { return localStorage.getItem(K_COPIA) === "1"; } catch (e) { return false; } };
  const ts = () => { const d = new Date(), z = (x) => String(x).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };

  /* ---- puente con la app Android (si existe) ---- */
  const NATIVO = typeof window.KatriNative !== "undefined";
  const pend = new Map();
  window.__katri = {
    res: (id, st, body) => { const f = pend.get(id); if (f) { pend.delete(id); f({ status: st, body }); } },
    imp: (id, ok, msg) => { const f = pend.get(id); if (f) { pend.delete(id); f({ ok, msg }); } },
  };
  const idNuevo = () => Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  function viaNativa(metodo, path, cuerpo, limite) {
    return new Promise((ok) => { const id = idNuevo(); pend.set(id, ok); window.KatriNative.http(id, metodo, path, cuerpo === undefined ? "" : JSON.stringify(cuerpo), limite); });
  }
  function imprimirNativo(texto, sinTildes = true, doble = 2) {
    return new Promise((ok) => { const id = idNuevo(); pend.set(id, ok); window.KatriNative.imprimir(id, texto, sinTildes, doble); });
  }

  /* ---- llamada normal al PC (con tiempo límite) ---- */
  async function red(path, metodo, cuerpo, limite = 6000) {
    if (NATIVO) {
      const r = await viaNativa(metodo, path, cuerpo, limite);
      if (!r.status) { const er = new Error("Sin conexión con el PC"); er.red = true; throw er; }
      let d = {};
      try { d = JSON.parse(r.body); } catch (e) { /* vacío */ }
      if (r.status >= 400) { const er = new Error(d.error || "Error de conexión con el servidor"); er.http = r.status; throw er; }
      return d;
    }
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), limite);
    let r;
    try {
      r = await fetch(path, { method: metodo, headers: { "Content-Type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: ctl.signal });
    } catch (e) { const er = new Error("Sin conexión con el PC"); er.red = true; throw er; } finally { clearTimeout(t); }
    let d = {};
    try { d = await r.json(); } catch (e) { /* vacío */ }
    if (!r.ok) { const er = new Error(d.error || "Error de conexión con el servidor"); er.http = r.status; throw er; }
    return d;
  }

  /* ---- motor local (Python en el navegador) ---- */
  async function cargarMotor() {
    await new Promise((ok, mal) => { const s = document.createElement("script"); s.src = "/static/pyodide/pyodide.js"; s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar el motor")); document.head.appendChild(s); });
    py = await loadPyodide({ indexURL: "/static/pyodide/" });
    await py.loadPackage("sqlite3");
    py.FS.mkdir("/data"); py.FS.mount(py.FS.filesystems.IDBFS, {}, "/data");
    await new Promise((r) => py.FS.syncfs(true, () => r()));
    py.FS.mkdir("/app");
    for (const f of ["server.py", "impresora.py"]) {
      const t = await (await fetch("/py/" + f)).text();
      py.FS.writeFile("/app/" + f, t);
    }
    py.runPython(`
import sys, json
sys.path.insert(0, "/app")
import impresora, server
impresora.DESHABILITADA = True
server.LOCAL = True
server.USAR_WAL = False
server.DATA = "/data"
server.DB = "/data/katri.db"
server.init_db()
def servir(metodo, path, q, body):
    est, res = server.despachar(metodo, path, json.loads(q), json.loads(body))
    return json.dumps({"estado": est, "datos": res}, ensure_ascii=False)
`);
    return py;
  }
  const iniciarMotor = () => (motor = motor || cargarMotor().catch((e) => { motor = null; throw e; }));
  const persistir = () => new Promise((r) => py.FS.syncfs(false, () => r()));

  async function local(metodo, path, cuerpo) {
    await iniciarMotor();
    const u = new URL(path, location.origin);
    const q = Object.fromEntries(u.searchParams.entries());
    const out = JSON.parse(py.globals.get("servir")(metodo, u.pathname, JSON.stringify(q), JSON.stringify(cuerpo === undefined ? {} : cuerpo)));
    if (metodo !== "GET") await persistir();
    if (out.estado !== 200) { const er = new Error((out.datos && out.datos.error) || "Error"); er.http = out.estado; throw er; }
    return out.datos;
  }

  /* ---- copia desde el PC ---- */
  async function traerCopia() {
    if (sincronizando) return;
    const snap = await red("/api/snapshot", "GET", undefined, 20000);
    if ((activo && !sincronizando) || leerCola().length && !sincronizando) return; // llegó tarde: no pisar lo hecho sin conexión
    await local("POST", "/api/restaurar", snap);
    try { localStorage.setItem(K_COPIA, "1"); } catch (e) { /* ignorar */ }
  }
  function programarCopia(ms = 4000) {
    clearTimeout(pullT);
    pullT = setTimeout(async () => { if (!activo && !sincronizando && !leerCola().length) { try { await traerCopia(); } catch (e) { /* se reintenta luego */ } } }, ms);
  }

  /* ---- aviso arriba ---- */
  function pintarBanner() {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "off-banner";
      banner.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:9999;padding:6px 10px;font:600 13px system-ui,sans-serif;display:none;align-items:center;gap:8px;justify-content:center;background:#b3261e;color:#fff";
      banner.innerHTML = '<span id="off-txt"></span><button id="off-btn" style="border:1px solid #fff8;background:#0003;color:#fff;border-radius:8px;padding:3px 10px;font:inherit">Reintentar</button>';
      document.body.appendChild(banner);
      banner.querySelector("#off-btn").onclick = () => intentarSync(true);
    }
    const n = leerCola().length;
    banner.style.display = activo || n ? "flex" : "none";
    banner.style.background = sincronizando ? "#8a6d00" : "#b3261e";
    banner.querySelector("#off-txt").textContent = sincronizando ? "Enviando al PC…" : `Sin conexión con el PC · guardando en el celular${n ? ` (${n} pendiente${n > 1 ? "s" : ""})` : ""}`;
    document.body.style.paddingTop = banner.style.display === "flex" ? "30px" : "";
  }

  /* ---- enviar lo pendiente al PC ---- */
  async function intentarSync(manual) {
    if (sincronizando) return;
    try { await red("/api/info", "GET", undefined, 4000); } catch (e) { if (manual) toast("Todavía no hay conexión con el PC", true); return; }
    sincronizando = true; pintarBanner();
    try {
      const cola = leerCola();
      let res = { errores: [], aplicadas: 0 };
      if (cola.length) res = await red("/api/sincronizar", "POST", { ops: cola }, 60000);
      guardarCola([]);
      await traerCopia();
      activo = false; clearInterval(vigilante); vigilante = null;
      sincronizando = false; pintarBanner();
      if (typeof render === "function") render();
      if (res.errores && res.errores.length) avisoConflictos(res);
      else if (cola.length) toast(`Sincronizado ✓ ${res.aplicadas} cambio${res.aplicadas === 1 ? "" : "s"} enviados al PC`, false, 4000);
      else toast("Conexión con el PC recuperada ✓");
    } catch (e) {
      sincronizando = false; pintarBanner();
      if (manual) toast("No se pudo sincronizar: " + e.message, true);
    }
  }
  function avisoConflictos(res) {
    const m = modal("Revisa estos cambios", { clase: "medio" });
    m.cuerpo.innerHTML = `<p style="margin-top:0">Se enviaron ${res.aplicadas} cambio(s) al PC, pero <b>${res.errores.length}</b> no se pudieron aplicar (por ejemplo, porque la cuenta ya se cerró en el PC):</p>${res.errores.map((e) => `<div class="linea"><div class="t">${h(e.resumen)}<div class="d" style="color:#ff8a80">${h(e.error)}</div></div></div>`).join("")}`;
    m.pie.innerHTML = '<button class="btn pri" data-act="ok">Entendido</button>';
    acciones(m.el, { ok: () => m.cerrar() });
  }
  function entrarSinConexion() {
    if (!activo) { activo = true; vigilante = setInterval(() => intentarSync(false), 8000); }
    pintarBanner();
  }

  function resumir(metodo, p, b) {
    const r = [[/\/mesas\/(\d+)\/pedido/, (m) => `Pedido de la mesa (id ${m[1]})`], [/\/cuentas\/\d+\/pedido/, () => "Pedido agregado a una cuenta"], [/\/cuentas\/\d+\/cerrar/, () => "Cobro y cierre de una cuenta"],
      [/\/cuentas\/\d+\/anular/, () => "Anular una cuenta"], [/\/domicilios/, () => `Domicilio${b && b.cliente ? " de " + b.cliente : ""}${b && b.direccion ? " (" + b.direccion + ")" : ""}`],
      [/\/items\/\d+/, () => "Quitar un producto de una cuenta"], [/\/entrada/, () => "Inicio de turno"], [/\/salida/, () => "Salida de turno"],
      [/\/turnos/, () => "Cambio en un turno"], [/\/personal/, () => "Cambio en el personal"], [/\/productos|\/categorias/, () => "Cambio en el menú"], [/\/mesas/, () => "Cambio en las mesas"], [/\/config/, () => "Cambio de configuración"]];
    for (const [rx, f] of r) { const m = p.match(rx); if (m) return f(m); }
    return `${metodo} ${p}`;
  }

  /* ---- punto de entrada para api() ---- */
  async function llamar(path, metodo = "GET", cuerpo) {
    if (!activo) {
      try {
        const d = await red(path, metodo, cuerpo);
        if (metodo !== "GET") programarCopia();
        return d;
      } catch (e) {
        if (!e.red) throw e;
        entrarSinConexion();
      }
    }
    if (!hayCopia()) throw new Error("Sin conexión con el PC y aún no hay copia guardada. Abre la app una vez con conexión.");
    if (/\/api\/(reportes|personal)\/excel/.test(path)) throw new Error("El Excel solo se puede generar con conexión al PC");
    const d = await local(metodo, path, cuerpo);
    let impreso = false;
    if (NATIVO && metodo === "POST" && d && d.comanda) {
      const pr = await imprimirNativo(d.comanda);
      impreso = !!pr.ok;
      d.impresion = pr.ok ? { ok: true } : { ok: false, offline: true, error: "Sin conexión con el PC y no se pudo imprimir desde el celular: " + (pr.msg || "revisa la impresora") };
      if (/\/reimprimir$/.test(path)) { d.ok = !!pr.ok; d.error = pr.ok ? undefined : (pr.msg || "No se pudo imprimir"); }
    }
    if (metodo !== "GET") {
      const cola = leerCola();
      const u = new URL(path, location.origin);
      cola.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), metodo, path: u.pathname, query: Object.fromEntries(u.searchParams.entries()), body: cuerpo === undefined ? {} : cuerpo, ts: ts(), impreso, local: d, resumen: resumir(metodo, u.pathname, cuerpo) });
      guardarCola(cola); pintarBanner();
    }
    if (!NATIVO && d && d.impresion && metodo === "POST") d.impresion = { ok: false, offline: true, error: "Sin conexión con el PC: el pedido quedó guardado en el celular y se enviará al PC cuando vuelva la conexión." };
    return d;
  }

  function iniciar() {
    if (!hayCopia() && !navigator.onLine) return;
    setTimeout(() => { iniciarMotor().then(() => { if (!leerCola().length) programarCopia(1500); else intentarSync(false); }).catch(() => { /* sin motor: modo normal */ }); }, 1500);
    setInterval(() => { if (!activo && !sincronizando && !leerCola().length) programarCopia(10); }, 120000);
    window.addEventListener("online", () => { if (leerCola().length || activo) intentarSync(false); });
    if (leerCola().length) { activo = true; vigilante = setInterval(() => intentarSync(false), 8000); setTimeout(pintarBanner, 500); }
  }
  return { llamar, iniciar, red, local, imprimirNativo, get activo() { return activo; }, cola: leerCola, intentarSync, traerCopia };
})();
