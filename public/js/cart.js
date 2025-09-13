// public/js/cart.js (ESM)
const KEY = "cart_v1";
const PING_KEY = KEY + ":ping"; // ping để đồng bộ giữa nhiều tab

const read = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => ({
      productId: String(x.productId),
      qty: Math.max(1, ~~x.qty || 1),
    }));
  } catch {
    return [];
  }
};
const countOf = (arr) => arr.reduce((s, it) => s + (it.qty || 0), 0);

function emitChange(reason = "update") {
  const items = read();
  const detail = { items, count: countOf(items), reason, ts: Date.now() };
  // báo cho toàn bộ UI trong tab hiện tại
  window.dispatchEvent(new CustomEvent("cart:change", { detail }));
  // ping sang các tab khác (để kích hoạt 'storage')
  try {
    localStorage.setItem(PING_KEY, String(detail.ts));
  } catch {}
}

/* ==== API công khai ==== */
export function getCart() {
  return read();
}
export function getCartCount() {
  return countOf(read());
}

export function saveCart(arr) {
  localStorage.setItem(KEY, JSON.stringify(arr));
  emitChange("save");
}

export function addToCart(productId, qty = 1) {
  const cart = read();
  const i = cart.findIndex((x) => x.productId === productId);
  if (i === -1) cart.push({ productId, qty: Math.max(1, +qty || 1) });
  else cart[i].qty = Math.max(1, (cart[i].qty || 1) + (+qty || 1));
  saveCart(cart);
  return cart;
}

export function setQty(productId, qty) {
  const cart = read();
  const i = cart.findIndex((x) => x.productId === productId);
  if (i !== -1) {
    cart[i].qty = Math.max(1, +qty || 1);
    saveCart(cart);
  } else {
    emitChange("noop");
  }
  return cart;
}

export function removeItem(productId) {
  const cart = read().filter((x) => x.productId !== productId);
  saveCart(cart);
  return cart;
}

export function clearCart() {
  saveCart([]);
}

/* Đăng ký lắng nghe tiện lợi */
export function onCartChange(handler) {
  const fn = (e) => handler?.(e.detail);
  window.addEventListener("cart:change", fn);
  // đồng bộ giữa các tab
  const onStorage = (e) => {
    if (e.key === KEY || e.key === PING_KEY) emitChange("storage");
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("cart:change", fn);
    window.removeEventListener("storage", onStorage);
  };
}

/* Phát 1 lần khi nạp trang để UI hydrate ngay */
queueMicrotask(() => emitChange("init"));
