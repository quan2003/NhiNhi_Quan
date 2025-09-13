// ===== Admin Common (token + guards + fetch helpers) =====
function token() {
  return localStorage.getItem("adminToken");
}
function jsonHeaders() {
  return { "Content-Type": "application/json", "x-admin-token": token() || "" };
}
async function authGuard() {
  if (location.pathname.endsWith("/login.html")) return;
  if (!token()) location.href = "/admin/login.html";
}
document.addEventListener("DOMContentLoaded", authGuard);

// Đăng xuất (desktop)
const lo = document.getElementById("logout");
if (lo) {
  lo.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("adminToken");
    location.href = "/admin/login.html";
  });
}
window.__adminLogout = function () {
  localStorage.removeItem("adminToken");
  location.href = "/admin/login.html";
};

// Helpers fetch (trả lỗi rõ ràng)
window.__adminFetch = async (path, opts = {}) => {
  const r = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...jsonHeaders() },
  });
  const text = await r.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  if (!r.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      text ||
      `${r.status} ${r.statusText}`;
    const err = new Error(msg);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data ?? {};
};
window.__adminFetchRaw = async (path, opts = {}) => {
  const headers = new Headers(opts.headers || {});
  const t = token();
  if (t) headers.set("x-admin-token", t);
  return fetch(path, { ...opts, headers });
};
window.__headers = jsonHeaders;

/* ===================== Web Push setup ===================== */
(function setupWebPushButton() {
  if (location.pathname.endsWith("/login.html")) return;
  const container = document.querySelector("main.container") || document.body;
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "10px";
  wrap.style.margin = "0 0 10px 0";
  const btnOn = document.createElement("button");
  btnOn.className = "btn";
  btnOn.textContent = "📣 Bật thông báo trên điện thoại";
  const btnOff = document.createElement("button");
  btnOff.className = "btn";
  btnOff.textContent = "🔕 Tắt thông báo";
  btnOff.style.display = "none";
  wrap.appendChild(btnOn);
  wrap.appendChild(btnOff);
  container.prepend(wrap);

  const isSupported = () =>
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  const urlBase64ToUint8Array = (s) => {
    const p = "=".repeat((4 - (s.length % 4)) % 4);
    const b = (s + p).replace(/-/g, "+").replace(/_/g, "/");
    const r = atob(b);
    return Uint8Array.from([...r].map((c) => c.charCodeAt(0)));
  };

  async function getReg() {
    try {
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return reg;
    } catch (e) {
      console.error("SW register error:", e);
      return null;
    }
  }
  async function refreshButtons() {
    if (!isSupported()) {
      btnOn.disabled = true;
      btnOn.textContent = "Thiết bị không hỗ trợ Web Push";
      return;
    }
    try {
      const reg = await getReg();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        btnOn.textContent = "✅ Đã bật thông báo";
        btnOn.disabled = true;
        btnOff.style.display = "";
      } else {
        btnOn.textContent = "📣 Bật thông báo trên điện thoại";
        btnOn.disabled = false;
        btnOff.style.display = "none";
      }
    } catch (e) {
      console.warn(e);
    }
  }
  async function enablePush() {
    try {
      if (!isSupported()) return alert("Thiết bị không hỗ trợ Web Push.");
      if (Notification.permission === "default") {
        const p = await Notification.requestPermission();
        if (p !== "granted") return alert("Bạn đã chặn thông báo.");
      } else if (Notification.permission !== "granted")
        return alert("Bạn đã chặn thông báo.");

      const { publicKey } = await window.__adminFetch("/api/push/publicKey");
      if (!publicKey) return alert("Server chưa cấu hình Web Push.");
      const reg = await getReg();
      if (!reg) return alert("Không đăng ký được Service Worker.");

      const existed = await reg.pushManager.getSubscription();
      if (existed) {
        new Notification("Bạn đã bật thông báo rồi!");
        return refreshButtons();
      }

      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await window.__adminFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(sub),
      });

      new Notification("Đã bật thông báo đơn mới!");
      refreshButtons();
    } catch (e) {
      console.error(e);
      alert("Không bật được thông báo: " + (e?.message || e));
    }
  }
  async function disablePush() {
    try {
      const reg = await getReg();
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return refreshButtons();
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await window.__adminFetch("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      });
      alert("Đã tắt thông báo.");
      refreshButtons();
    } catch (e) {
      console.error(e);
      alert("Không tắt được thông báo: " + (e?.message || e));
    }
  }
  btnOn.addEventListener("click", enablePush);
  btnOff.addEventListener("click", disablePush);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => refreshButtons())
      .catch(() => {});
  }
})();

/* ===================== Mobile sheet menu ===================== */
(function setupMobileSheet() {
  const btn = document.getElementById("btnHamburger");
  const sheet = document.getElementById("mSheet");
  const back = document.getElementById("mBack");
  if (!btn || !sheet || !back) return;
  const firstLink = sheet.querySelector(".sheet-panel nav a");
  const setOpen = (open) => {
    sheet.classList.toggle("open", open);
    sheet.setAttribute("aria-hidden", open ? "false" : "true");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    document.body.classList.toggle("no-scroll", open);
    if (open) setTimeout(() => firstLink?.focus(), 0);
    else setTimeout(() => btn.focus(), 0);
  };
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    setOpen(!sheet.classList.contains("open"));
  });
  back.addEventListener("click", () => setOpen(false));
  sheet.querySelectorAll(".sheet-panel nav a").forEach((a) => {
    if (a.id === "logout_m") {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        setOpen(false);
        window.__adminLogout();
      });
    } else {
      a.addEventListener("click", () => setTimeout(() => setOpen(false), 10));
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
})();

/* ===================== Global Toast (top-right) ===================== */
(function installToast() {
  let wrap = document.getElementById("toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toastWrap";
    document.body.appendChild(wrap);
  }
  Object.assign(wrap.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "5000",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    pointerEvents: "none",
  });
  function show(kind, msg) {
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    Object.assign(el.style, {
      position: "relative",
      margin: "0",
      pointerEvents: "auto",
      background: "var(--card)",
      border: "1px solid var(--line)",
      color: "var(--text)",
      padding: "10px 14px",
      borderRadius: "10px",
      boxShadow: "0 10px 24px rgba(2,6,23,.35)",
      fontSize: "14px",
      opacity: "0",
      transform: "translateY(-6px)",
      transition: "opacity .18s ease, transform .18s ease",
    });
    if (kind === "success") el.style.borderColor = "rgba(34,197,94,.4)";
    else if (kind === "error") el.style.borderColor = "rgba(239,68,68,.4)";
    else if (kind === "warn") el.style.borderColor = "rgba(245,158,11,.4)";
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(-8px)";
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }
  window.toast = {
    success: (m) => show("success", m),
    warning: (m) => show("warn", m),
    error: (m) => show("error", m),
    info: (m) => show("", m),
  };
})();
