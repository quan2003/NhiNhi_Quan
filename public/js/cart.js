// public/js/cart.js (ESM)
const KEY = "cart_v1";

/** Đọc giỏ hàng từ localStorage (mảng {productId, qty}) */
export function getCart() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Ghi giỏ hàng */
export function saveCart(arr) {
  localStorage.setItem(KEY, JSON.stringify(arr));
}

/** Thêm sản phẩm vào giỏ */
export function addToCart(productId, qty = 1) {
  const cart = getCart();
  const i = cart.findIndex((x) => x.productId === productId);
  if (i === -1) cart.push({ productId, qty: Math.max(1, +qty || 1) });
  else cart[i].qty = Math.max(1, (cart[i].qty || 1) + (+qty || 1));
  saveCart(cart);
  return cart;
}

/** Sửa số lượng */
export function setQty(productId, qty) {
  const cart = getCart();
  const i = cart.findIndex((x) => x.productId === productId);
  if (i !== -1) {
    cart[i].qty = Math.max(1, +qty || 1);
    saveCart(cart);
  }
  return cart;
}

/** Xoá 1 dòng */
export function removeItem(productId) {
  const cart = getCart().filter((x) => x.productId !== productId);
  saveCart(cart);
  return cart;
}

/** Xoá toàn bộ */
export function clearCart() {
  saveCart([]);
}

/** Tổng số món (để hiển thị badge trong header) */
export function getCartCount() {
  return getCart().reduce((s, it) => s + (it.qty || 0), 0);
}

/** Load giỏ hàng từ localStorage */
export function loadCart() {
  const savedCart = localStorage.getItem(KEY);
  if (savedCart) {
    const cart = JSON.parse(savedCart);
    if (Array.isArray(cart)) return cart;
  }
  return [];
}
