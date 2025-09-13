// /js/loading.js
// Global page loading overlay + auto fetch interceptor

const OVERLAY_ID = "__global_loading_overlay__";
let inflight = 0;
let visible = false;
let showTimer = null; // delay để tránh nháy
let minVisibleTimer = null; // đảm bảo hiển thị tối thiểu

function ensureOverlay() {
  if (document.getElementById(OVERLAY_ID)) return;

  const css = `
  .glo-overlay {
    position: fixed; inset: 0; z-index: 9999;
    display: grid; place-items: center;
    background: color-mix(in oklab, #0b1220 40%, transparent);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0; transform: scale(1.01);
    transition: opacity .18s ease, transform .18s ease;
  }
  .glo-overlay.show{ opacity:1; transform:none; }
  .glo-card{
    min-width: 180px; padding: 18px 20px; border-radius: 16px;
    background: linear-gradient(180deg, #111827, #0b1220);
    border: 1px solid color-mix(in oklab, #334155 70%, #fff 10%);
    box-shadow: 0 10px 28px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.05);
    display:grid; gap:10px; place-items:center; color:#e5e7eb;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, Ubuntu, Arial;
  }
  .glo-spin{
    width: 28px; height: 28px; border-radius: 999px;
    border: 3px solid color-mix(in oklab, #334155 60%, #fff 0%);
    border-top-color: #60a5fa; animation: glo-rot .9s linear infinite;
  }
  @keyframes glo-rot{ to{ transform: rotate(360deg); } }
  .glo-text{ font-weight: 600; letter-spacing: .2px; }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const wrap = document.createElement("div");
  wrap.id = OVERLAY_ID;
  wrap.className = "glo-overlay";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `
    <div class="glo-card" role="status" aria-live="polite">
      <div class="glo-spin"></div>
      <div class="glo-text">Đang tải…</div>
    </div>
  `;
  document.body.appendChild(wrap);
}

function showOverlay() {
  ensureOverlay();
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;
  visible = true;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
}

function hideOverlay() {
  const el = document.getElementById(OVERLAY_ID);
  if (!el) return;
  visible = false;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
}

function startMaybeShow(delay = 200) {
  clearTimeout(showTimer);
  showTimer = setTimeout(() => {
    // chỉ show nếu vẫn còn request đang bay
    if (inflight > 0 && !visible) {
      showOverlay();
      // đảm bảo hiển thị tối thiểu 400ms cho mượt
      clearTimeout(minVisibleTimer);
      minVisibleTimer = setTimeout(() => {
        /* no-op, chỉ giữ cờ tối thiểu */
      }, 400);
    }
  }, delay);
}
function stopMaybeHide() {
  clearTimeout(showTimer);
  if (visible) {
    // nếu đang hiện, đợi tối thiểu 400ms rồi mới ẩn
    const doHide = () => hideOverlay();
    if (minVisibleTimer) {
      const t = minVisibleTimer;
      minVisibleTimer = null;
      // đợi timer tối thiểu kết thúc
      setTimeout(doHide, 0);
    } else {
      doHide();
    }
  }
}

/* ---------- Public API ---------- */
export function showLoading() {
  ensureOverlay();
  showOverlay();
}
export function hideLoading() {
  hideOverlay();
}

/* ---------- Auto patch fetch ---------- */
(function patchFetch() {
  if (!window.fetch || window.__fetch_patched__) return;
  window.__fetch_patched__ = true;

  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    try {
      inflight++;
      if (inflight === 1) startMaybeShow(200);
      const res = await original(...args);
      return res;
    } catch (e) {
      throw e;
    } finally {
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) stopMaybeHide();
    }
  };
})();

/* ---------- Expose to window (tuỳ bạn có dùng hay không) ---------- */
window.__ui = window.__ui || {};
window.__ui.showLoading = showLoading;
window.__ui.hideLoading = hideLoading;
