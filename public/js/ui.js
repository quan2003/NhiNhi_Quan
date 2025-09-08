// public/js/ui.js
export function initUI() {
  // ===== Theme (light/dark) =====
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.classList.toggle("theme-light", saved === "light");

  const switchEl = document.getElementById("themeSwitch");
  if (switchEl) {
    switchEl.checked = saved === "light";
    switchEl.addEventListener("change", () => {
      const isLight = switchEl.checked;
      document.documentElement.classList.toggle("theme-light", isLight);
      localStorage.setItem("theme", isLight ? "light" : "dark");
      try {
        if (window.lucide) window.lucide.createIcons();
      } catch {}
    });
  }

  // ===== Drawer (menu di động) =====
  const btn = document.getElementById("menuBtn");
  const drawer = document.getElementById("drawer");

  // tạo backdrop nếu chưa có
  let backdrop = document.querySelector(".drawer-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    document.body.appendChild(backdrop);
  }

  const openDrawer = () => {
    if (!drawer) return;
    drawer.classList.add("open");
    backdrop.classList.add("show");
    document.body.classList.add("no-scroll");
    drawer.setAttribute("aria-hidden", "false");
  };
  const closeDrawer = () => {
    if (!drawer) return;
    drawer.classList.remove("open");
    backdrop.classList.remove("show");
    document.body.classList.remove("no-scroll");
    drawer.setAttribute("aria-hidden", "true");
  };

  if (btn && drawer) {
    btn.addEventListener("click", (e) => {
      // KHÔNG preventDefault để không chặn điều hướng các control khác
      e.stopPropagation();
      drawer.classList.contains("open") ? closeDrawer() : openDrawer();
    });

    // Điều hướng khi bấm link trong drawer
    drawer.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;

      const href = a.getAttribute("href") || "";
      if (href.startsWith("#")) {
        // anchor/hash: để trình duyệt xử lý scroll; chỉ đóng drawer
        closeDrawer();
        return;
      }

      // link thật: điều hướng chủ động
      e.preventDefault();
      closeDrawer();
      setTimeout(() => {
        window.location.assign(a.href);
      }, 0);
    });
  }

  // click ra ngoài (backdrop) -> đóng
  backdrop.addEventListener("click", closeDrawer);

  // ESC -> đóng
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer?.classList.contains("open")) {
      closeDrawer();
    }
  });

  // ===== Toast root =====
  if (!document.getElementById("toastRoot")) {
    const r = document.createElement("div");
    r.id = "toastRoot";
    document.body.appendChild(r);
  }

  // ===== Spinner root =====
  if (!document.getElementById("spinner")) {
    const s = document.createElement("div");
    s.id = "spinner";
    s.innerHTML = '<div class="loader"></div>';
    document.body.appendChild(s);
  }

  // ===== Lucide icons =====
  if (window.lucide) window.lucide.createIcons();
}

export function toast(msg, type = "ok", timeout = 2500) {
  const root =
    document.getElementById("toastRoot") ||
    (() => {
      const r = document.createElement("div");
      r.id = "toastRoot";
      document.body.appendChild(r);
      return r;
    })();
  const el = document.createElement("div");
  el.className = "toast";
  if (type === "warn") el.style.borderLeftColor = "#f59e0b";
  if (type === "error") el.style.borderLeftColor = "#ef4444";
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(4px)";
    setTimeout(() => el.remove(), 250);
  }, timeout);
}

export function showSpinner() {
  const s = document.getElementById("spinner");
  if (s) s.classList.add("show");
}
export function hideSpinner() {
  const s = document.getElementById("spinner");
  if (s) s.classList.remove("show");
}

/* Expose to other scripts without import */
window.__ui = { toast, showSpinner, hideSpinner };
import { getCartCount } from "./cart.js";

function updateCartBadge() {
  const count = getCartCount();
  const el1 = document.getElementById("cartBadge");
  const el2 = document.getElementById("cartBadgeDrawer");
  if (el1) el1.textContent = count;
  if (el2) el2.textContent = count;
}

// chạy ngay khi load
updateCartBadge();

// nếu muốn auto cập nhật khi storage thay đổi (đa tab)
window.addEventListener("storage", (e) => {
  if (e.key === "cart_v1") updateCartBadge();
});

// expose cho chỗ khác gọi khi thêm/xoá giỏ hàng
window.__ui.updateCartBadge = updateCartBadge;
