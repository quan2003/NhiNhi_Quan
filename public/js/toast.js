// public/js/toast.js
const HOST_ID = "toastHost";

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  return host;
}

function iconFor(type) {
  // Dùng Lucide nếu có
  const map = {
    success: '<i data-lucide="check-circle-2"></i>',
    error: '<i data-lucide="alert-triangle"></i>',
    info: '<i data-lucide="info"></i>',
    warning: '<i data-lucide="alert-circle"></i>',
  };
  return map[type] || map.info;
}

/**
 * toast({ type, title, message, timeout })
 * type: "success" | "error" | "info" | "warning"
 */
export function toast({
  type = "info",
  title = "",
  message = "",
  timeout = 3000,
} = {}) {
  const host = ensureHost();

  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.setAttribute("role", "status");
  item.innerHTML = `
    <div class="t-icon">${iconFor(type)}</div>
    <div class="t-content">
      ${title ? `<div class="t-title">${title}</div>` : ""}
      ${message ? `<div class="t-message">${message}</div>` : ""}
    </div>
    <button class="t-close" aria-label="Đóng">
      <i data-lucide="x"></i>
    </button>
  `;

  // Đóng khi click
  item.querySelector(".t-close")?.addEventListener("click", () => close());

  // Auto close
  let hideTimer = setTimeout(close, timeout);

  // Hover để tạm dừng auto close
  item.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  item.addEventListener(
    "mouseleave",
    () => (hideTimer = setTimeout(close, timeout))
  );

  function close() {
    item.classList.add("leaving");
    setTimeout(() => item.remove(), 180);
  }

  host.appendChild(item);

  // render icon lucide nếu có
  if (window.lucide) window.lucide.createIcons();

  return close;
}

// Helper nhanh
toast.success = (msg, title = "Thành công", timeout = 3000) =>
  toast({ type: "success", title, message: msg, timeout });

toast.error = (msg, title = "Có lỗi xảy ra", timeout = 3800) =>
  toast({ type: "error", title, message: msg, timeout });

toast.info = (msg, title = "Thông báo", timeout = 3200) =>
  toast({ type: "info", title, message: msg, timeout });

toast.warning = (msg, title = "Cảnh báo", timeout = 3500) =>
  toast({ type: "warning", title, message: msg, timeout });
