// public/js/ui.js
export function initUI() {
  // Theme
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.classList.toggle("theme-light", saved === "light");
  const switchEl = document.getElementById("themeSwitch");
  if (switchEl) {
    switchEl.checked = saved === "light";
    switchEl.addEventListener("change", () => {
      const isLight = switchEl.checked;
      document.documentElement.classList.toggle("theme-light", isLight);
      localStorage.setItem("theme", isLight ? "light" : "dark");
    });
  }

  // Drawer
  const btn = document.getElementById("menuBtn");
  const drawer = document.getElementById("drawer");
  if (btn && drawer) {
    btn.addEventListener("click", () => drawer.classList.toggle("open"));
    drawer
      .querySelectorAll("a")
      .forEach((a) =>
        a.addEventListener("click", () => drawer.classList.remove("open"))
      );
  }

  // Toast root
  if (!document.getElementById("toastRoot")) {
    const r = document.createElement("div");
    r.id = "toastRoot";
    document.body.appendChild(r);
  }

  // Spinner root
  if (!document.getElementById("spinner")) {
    const s = document.createElement("div");
    s.id = "spinner";
    s.innerHTML = '<div class="loader"></div>';
    document.body.appendChild(s);
  }

  // Lucide icons
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
