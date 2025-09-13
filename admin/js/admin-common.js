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

// Helpers fetch
window.__adminFetch = async (path, opts = {}) => {
  const r = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...jsonHeaders() },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
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

  // Luôn đảm bảo reg đã active
  async function getReg() {
    try {
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js");
      }
      // Đợi SW active
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

      // Chờ SW ready rồi mới subscribe
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

  if (isSupported()) {
    // Đăng ký SW và đợi ready
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => refreshButtons())
      .catch(() => {});
  }
})();

/* ===================== Mobile sheet menu (giữ nguyên bản bạn đã có) ===================== */
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
    const isOpen = sheet.classList.contains("open");
    setOpen(!isOpen);
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
