// public/sw.js

// ======== PUSH HANDLERS ========
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {}

  const n = data.notification || {};
  const orderId = n?.data?.orderId;

  /** Actions: Chrome/Edge/Android hỗ trợ; iOS Safari hiện chưa hiển thị buttons. */
  const actions = [
    { action: "open-orders", title: "Xem đơn" },
    // { action: "mute", title: "Tạm ẩn" }, // ví dụ bổ sung nếu muốn
  ];

  const options = {
    body: n.body || "",
    icon: "/img/logo.jpg",
    badge: "/img/logo.jpg",
    requireInteraction: true, // giữ thông báo tới khi người dùng tương tác
    actions,
    tag: orderId ? `order-${orderId}` : "order", // gom nhóm theo đơn, tránh trùng
    renotify: true,
    data: {
      ...n.data,
      // URL đích: thêm orderId để trang admin biết cần focus đơn nào
      targetUrl: orderId
        ? `/admin/orders.html?focus=${encodeURIComponent(orderId)}`
        : "/admin/orders.html",
    },
  };

  event.waitUntil(
    self.registration.showNotification(n.title || "Thông báo", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Nếu bấm action cụ thể
  if (event.action === "open-orders") {
    return event.waitUntil(openOrFocus(event.notification?.data?.targetUrl));
  }

  // Nếu bấm vào phần thân thông báo → cùng hành vi
  return event.waitUntil(openOrFocus(event.notification?.data?.targetUrl));
});

/** Mở tab mới / focus tab cũ; gửi postMessage để UI highlight mã đơn. */
async function openOrFocus(url = "/admin/orders.html") {
  const all = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  // Nếu tab đã mở sẵn trang admin → focus và postMessage
  for (const client of all) {
    if (client.url.includes("/admin/")) {
      client.focus();
      try {
        const u = new URL(url, self.location.origin);
        const orderId = u.searchParams.get("focus");
        if (orderId) client.postMessage({ type: "focus_order", orderId });
      } catch {}
      return;
    }
  }

  // Chưa có tab admin → mở tab mới
  await clients.openWindow(url);
}

// ======== RE-SUBSCRIBE NỀN KHI TOKEN HẾT HẠN ========

// Tiny helper để lấy applicationServerKey
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i)
    outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// Lưu adminToken vào IndexedDB để SW tự gọi API requireAdmin khi re-subscribe
const DB_NAME = "nnq-sw";
const DB_STORE = "kv";

function idbPut(key, value) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => {
      const tx = req.result.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => {
      const tx = req.result.transaction(DB_STORE, "readonly");
      const g = tx.objectStore(DB_STORE).get(key);
      g.onsuccess = () => resolve(g.result);
      g.onerror = () => reject(g.error);
    };
    req.onerror = () => reject(req.error);
  });
}

// Nhận token từ trang (sau khi đăng nhập) để SW dùng trong fetch requireAdmin
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SET_ADMIN_TOKEN") {
    idbPut("adminToken", String(event.data.token || ""));
  }
});

// Khi subscription thay đổi/hết hạn → tự đăng ký lại + báo server
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const adminToken = (await idbGet("adminToken")) || "";
        const r = await fetch("/api/push/publicKey", {
          headers: { "x-admin-token": adminToken },
        });
        const { publicKey } = await r.json();
        if (!publicKey) return;

        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": adminToken,
          },
          body: JSON.stringify(newSub),
        });

        // Báo UI (nếu đang mở) để cập nhật nút
        const all = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        all.forEach((c) => c.postMessage({ type: "PUSH_READY" }));
      } catch (e) {
        console.warn("pushsubscriptionchange re-subscribe failed:", e);
      }
    })()
  );
});
