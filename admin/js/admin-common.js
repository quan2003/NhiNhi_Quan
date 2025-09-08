// ===== Admin Common (token + guards + fetch helpers) =====

function token() {
  // DÙNG DUY NHẤT key 'adminToken'
  return localStorage.getItem("adminToken");
}

function jsonHeaders() {
  // Header cho JSON API
  return { "Content-Type": "application/json", "x-admin-token": token() || "" };
}

async function authGuard() {
  // Bỏ qua trang đăng nhập
  if (location.pathname.endsWith("/login.html")) return;
  if (!token()) location.href = "/admin/login.html";
}
document.addEventListener("DOMContentLoaded", authGuard);

// Đăng xuất
const lo = document.getElementById("logout");
if (lo) {
  lo.addEventListener("click", (e) => {
    e.preventDefault();
    localStorage.removeItem("adminToken");
    location.href = "/admin/login.html";
  });
}

// --- Helpers ---
// JSON fetch (tự gắn Content-Type: application/json)
window.__adminFetch = async (path, opts = {}) => {
  const r = await fetch(path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...jsonHeaders() },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

// RAW fetch cho FormData / multipart (KHÔNG gắn Content-Type)
window.__adminFetchRaw = async (path, opts = {}) => {
  const headers = new Headers(opts.headers || {});
  const t = token();
  if (t) headers.set("x-admin-token", t);
  const r = await fetch(path, { ...opts, headers });
  return r; // nơi gọi tự xử lý .ok/.json()
};

window.__headers = jsonHeaders;

/* ===================== Web Push setup ===================== */
// Yêu cầu: server có các route:
//   GET  /api/push/publicKey   (requireAdmin)
//   POST /api/push/subscribe   (requireAdmin)
// Đồng thời phải có file /sw.js ở thư mục public (service worker hiển thị notification).

(function setupWebPushButton() {
  // Chỉ thêm ở các trang admin (trừ trang login)
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

  function isSupported() {
    return (
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i)
      outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function getReg() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      return reg || (await navigator.serviceWorker.register("/sw.js"));
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
      if (!isSupported()) {
        alert("Thiết bị không hỗ trợ Web Push.");
        return;
      }

      // Xin quyền
      if (Notification.permission === "default") {
        const p = await Notification.requestPermission();
        if (p !== "granted") {
          alert("Bạn đã chặn thông báo.");
          return;
        }
      } else if (Notification.permission !== "granted") {
        alert("Bạn đã chặn thông báo.");
        return;
      }

      // Lấy VAPID public key từ server
      const { publicKey } = await window.__adminFetch("/api/push/publicKey");
      if (!publicKey) {
        alert("Server chưa cấu hình Web Push (thiếu VAPID_PUBLIC/PRIVATE).");
        return;
      }

      const reg = await getReg();
      if (!reg) {
        alert("Không đăng ký được Service Worker.");
        return;
      }

      // Nếu đã có subscription thì thôi
      const existed = await reg.pushManager.getSubscription();
      if (existed) {
        new Notification("Bạn đã bật thông báo rồi!");
        btnOn.textContent = "✅ Đã bật thông báo";
        btnOn.disabled = true;
        btnOff.style.display = "";
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Gửi subscription lên server
      await window.__adminFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify(sub),
      });

      new Notification("Đã bật thông báo đơn mới!");
      await refreshButtons();
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
      if (!sub) {
        await refreshButtons();
        return;
      }
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      // báo server xoá
      await window.__adminFetch("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      });
      await refreshButtons();
      alert("Đã tắt thông báo.");
    } catch (e) {
      console.error(e);
      alert("Không tắt được thông báo: " + (e?.message || e));
    }
  }

  btnOn.addEventListener("click", enablePush);
  btnOff.addEventListener("click", disablePush);

  // Lúc vào trang, cập nhật trạng thái nút
  if (isSupported()) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    refreshButtons();
  }
})();
