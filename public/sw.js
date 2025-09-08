// public/sw.js

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {}

  const n = data.notification || {};
  const orderId = n?.data?.orderId;

  /** Gợi ý actions: Chrome/Edge/Android hỗ trợ; iOS Safari hiện chưa hiển thị buttons. */
  const actions = [
    { action: "open-orders", title: "Xem đơn" },
    // Có thể thêm: { action: "mute", title: "Tạm ẩn" } (tự xử lý phía dưới)
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
