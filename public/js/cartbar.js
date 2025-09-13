import {
  getCart,
  addToCart,
  setQty,
  removeItem,
  onCartChange,
} from "./cart.js";

/* ================== DOM refs ================== */
const bar = document.getElementById("cartFab");
const bCount = document.getElementById("mf_count");
const bTotal = document.getElementById("mf_total");
const bOpen = document.getElementById("mf_open");

const sheet = document.getElementById("cartSheet");
const sClose = document.getElementById("mf_close");
const sItems = document.getElementById("mf_items");
const sSub = document.getElementById("mf_sub");
const sDisc = document.getElementById("mf_disc");
const sTot = document.getElementById("mf_tot");

// NEW: checkout anchor
const sCheckout = document.getElementById("mf_checkout");

/* ================== Utils ================== */
const isMobile = () => window.matchMedia("(max-width: 980px)").matches;
const vnd = (n = 0) =>
  (n || 0).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + "đ";

/* ================== Catalog cache ================== */
let CATALOG = new Map();

async function ensureCatalog() {
  if (CATALOG.size) return;
  try {
    const res = await fetch("/api/products");
    const data = await res.json();
    (data || []).forEach((x) => {
      const id =
        x.id ?? x._id ?? x.code ?? x.slug ?? String(x.name ?? Math.random());
      const price = x.priceSell ?? x.price ?? x.basePrice ?? 0;
      CATALOG.set(String(id), { name: x.name || "Sản phẩm", price });
    });
  } catch (_) {
    // yên lặng nếu API chưa sẵn
  }
}

function calcTotal(cart) {
  return cart.reduce((s, it) => {
    const p = CATALOG.get(String(it.productId));
    const price = p?.price ?? 0;
    return s + price * (it.qty || 0);
  }, 0);
}
function calcCount(cart) {
  return cart.reduce((s, i) => s + (i.qty || 0), 0);
}

/* ================== UI: Bar (mobile footer) ================== */
function updateBar() {
  if (!bar) return;

  if (!isMobile()) {
    bar.classList.add("hidden");
    sheet?.classList.remove("open");
    sheet?.setAttribute?.("aria-hidden", "true");
    return;
  }

  const cart = getCart();
  const count = calcCount(cart);
  const total = calcTotal(cart);

  if (bCount) bCount.textContent = String(count);
  if (bTotal) bTotal.textContent = vnd(total);

  bar.classList.toggle("hidden", count === 0);
}

/* ================== UI: Bottom sheet ================== */
function renderSheet() {
  if (!sheet || !sItems) return;

  const cart = getCart();
  const total = calcTotal(cart);

  sItems.innerHTML = cart
    .map((it) => {
      const pid = String(it.productId);
      const p = CATALOG.get(pid) || { name: "Sản phẩm", price: 0 };
      const line = p.price * (it.qty || 1);

      return `
        <div class="sheet-item" data-id="${pid}">
          <span class="name">${p.name}</span>
          <div class="right">
            <button class="icon-btn" data-act="dec" data-id="${pid}" aria-label="Giảm số lượng">
              <i data-lucide="minus"></i>
            </button>
            <span class="qty-pill" data-role="qty">${it.qty}</span>
            <button class="icon-btn" data-act="inc" data-id="${pid}" aria-label="Tăng số lượng">
              <i data-lucide="plus"></i>
            </button>
            <span class="price">${vnd(line)}</span>
            <button class="icon-btn danger" data-act="rm" data-id="${pid}" aria-label="Xóa">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  if (sSub) sSub.textContent = vnd(total);
  if (sDisc) sDisc.textContent = vnd(0);
  if (sTot) sTot.textContent = vnd(total);

  // Re-hydrate icons trong sheet để nhẹ hơn
  try {
    window.lucide?.createIcons?.();
  } catch (_) {}
}

function openSheet() {
  if (!isMobile()) {
    location.href = "/checkout.html";
    return;
  }
  sheet?.classList.add("open");
  sheet?.setAttribute?.("aria-hidden", "false");
}

function closeSheet() {
  sheet?.classList.remove("open");
  sheet?.setAttribute?.("aria-hidden", "true");
}

/* ================== Events ================== */

// Event delegation cho +/-/🗑 — dùng pointerdown để tap mượt
const handleItemAction = (e) => {
  const btn = e.target.closest?.("button[data-act]");
  if (!btn || !sItems?.contains(btn)) return;

  // tránh delay click mobile
  if (e.type === "pointerdown") e.preventDefault();

  const { id, act } = btn.dataset;
  if (!id) return;

  if (act === "inc") {
    addToCart(id, 1);
  } else if (act === "dec") {
    const item = getCart().find((x) => String(x.productId) === String(id));
    if (!item) return;
    const next = (item.qty || 1) - 1;
    next > 0 ? setQty(id, next) : removeItem(id);
  } else if (act === "rm") {
    removeItem(id);
  }
};
sItems?.addEventListener("pointerdown", handleItemAction, { passive: false });
sItems?.addEventListener("click", handleItemAction); // fallback

// Mở/đóng sheet
bOpen?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  openSheet();
});
bOpen?.addEventListener("click", openSheet); // fallback

sClose?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  closeSheet();
});
sClose?.addEventListener("click", closeSheet);

// Checkout: “tap là đi” (pointerdown)
function goCheckout() {
  // Để mượt có thể đóng sheet rồi đi sau 60–80ms:
  // closeSheet(); setTimeout(() => (location.href = "/checkout.html"), 60);
  location.href = "/checkout.html";
}
sCheckout?.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  goCheckout();
});
sCheckout?.addEventListener("click", (e) => {
  e.preventDefault();
  goCheckout();
});

// ESC để đóng
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSheet();
});

// Cập nhật UI khi giỏ thay đổi
onCartChange(() => {
  ensureCatalog().then(() => {
    updateBar();
    if (isMobile()) renderSheet();
  });
});

// Khởi tạo lần đầu
ensureCatalog().then(() => {
  updateBar();
  if (isMobile()) renderSheet();
});

// Khi resize: cập nhật bar (và close sheet nếu chuyển sang desktop)
let _resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    updateBar();
    if (!isMobile()) closeSheet();
  }, 120);
});
