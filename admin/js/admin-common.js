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
