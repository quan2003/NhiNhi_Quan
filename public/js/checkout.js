// public/js/checkout.js (ESM)
import { vnd, qs, create } from "./utils.js";
import { apiGet, apiPost } from "./api.js";
import {
  getCart,
  setQty,
  removeItem,
  clearCart,
  saveCart,
  loadCart,
} from "./cart.js";

let products = [];
let config = null;

/* ============ Promo ============ */
function promoActive() {
  return !!config?.promoActive && !!config?.promo?.percent;
}
function computeTotals(items) {
  let subtotal = 0;
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (p) subtotal += p.priceSell * (it.qty || 1);
  }
  const discount = promoActive()
    ? Math.round((subtotal * (config.promo.percent || 0)) / 100)
    : 0;
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}

/* ============ UI helpers ============ */
function switchTypeUI(type) {
  document.querySelectorAll("#typeFields > div[data-type]").forEach((div) => {
    div.classList.toggle("hidden", div.getAttribute("data-type") !== type);
  });
}
function setBankInfo() {
  const bn = qs("#bankName");
  const ba = qs("#bankAccName");
  const no = qs("#bankAccNumber");
  if (bn) bn.textContent = config?.bankName || "Chưa cập nhật";
  if (ba) ba.textContent = config?.bankAccountName || "Chưa cập nhật";
  if (no) no.textContent = config?.bankAccountNumber || "Chưa cập nhật";

  const pn = qs("#promoNote");
  if (pn) {
    pn.textContent = promoActive()
      ? `Khuyến mãi: giảm ${config.promo.percent}% tổng bill`
      : "";
  }
}

/* ============ QR ============ */
function updateQR(amount) {
  const img = qs("#qrImg");
  const dl = qs("#qrDownload");
  const cap = qs("#qrCaption");

  if (!img) {
    console.error("QR image element not found");
    return;
  }

  const fixed = config?.qrFixedImage || null;
  const acc = encodeURIComponent(config?.bankAccountNumber || "Chưa có số TK");
  const bank = encodeURIComponent(config?.bankName || "Nhi Nhi Quán");
  const memo = encodeURIComponent("NhiNhi-Order");
  const data = `${bank}-${acc}-${amount}-${memo}`;
  const fallbackUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${data}`;

  img.onload = () => {
    if (dl) {
      dl.href = img.src;
      dl.download = "VietQR.png";
    }
    if (cap)
      cap.textContent = `Vui lòng chuyển đúng số tiền: ${vnd(
        amount
      )} — Nội dung: Tên + SĐT`;
  };
  img.onerror = () => {
    console.warn("Falling back to dynamic QR");
    img.src = fallbackUrl;
    if (dl) dl.href = fallbackUrl;
    if (cap)
      cap.textContent = `QR minh họa — Số tiền: ${vnd(
        amount
      )} — Nội dung: Tên + SĐT`;
  };

  if (fixed) {
    img.src = fixed;
  } else {
    img.src = fallbackUrl;
  }
}

/* ============ Cart render ============ */
function renderCart() {
  const items = getCart();
  const box = qs("#cartItems");
  if (box) box.innerHTML = "";

  if (!items.length) {
    box.innerHTML = '<div class="muted text-center">Giỏ hàng trống</div>';
    return;
  }

  items.forEach((it) => {
    const p = products.find((x) => x.id === it.productId);
    if (!p || !box) return;

    const row = create("div", { class: "row cart-item" });
    row.appendChild(create("div", { text: p.name, class: "cart-item-name" }));

    const controls = create("div", { class: "row cart-item-controls" });
    const input = create("input", {
      type: "number",
      min: "1",
      value: String(it.qty || 1),
      class: "input-field qty-input",
    });
    input.addEventListener("change", () => {
      const newQty = parseInt(input.value || "1", 10);
      setQty(it.productId, newQty);
      saveCart();
      renderCart();
    });

    const price = create("span", {
      text: vnd(p.priceSell * (it.qty || 1)),
      class: "cart-item-price",
    });
    const rm = create("button", { class: "btn outline danger", text: "Xoá" });
    rm.addEventListener("click", () => {
      if (confirm("Bạn có chắc muốn xóa món này?")) {
        removeItem(it.productId);
        saveCart();
        renderCart();
      }
    });

    controls.appendChild(input);
    controls.appendChild(price);
    controls.appendChild(rm);
    row.appendChild(controls);
    box.appendChild(row);
  });

  const { subtotal, discount, total } = computeTotals(items);
  const st = qs("#cartSubtotal");
  const dc = qs("#cartDiscount");
  const tt = qs("#cartTotal");
  if (st) st.textContent = vnd(subtotal);
  if (dc) dc.textContent = (discount ? "-" : "") + vnd(discount);
  if (tt) tt.textContent = vnd(total);

  const pay = document.querySelector("input[name=payment]:checked")?.value;
  const tbox = qs("#transferBox");
  if (tbox) tbox.classList.toggle("hidden", pay !== "TRANSFER");
  if (pay === "TRANSFER") updateQR(total);
}

/* ============ Form bindings ============ */
function bindForm() {
  const form = qs("#checkoutForm");
  if (!form) return;

  form.addEventListener("change", (e) => {
    if (e.target.name === "payment") {
      const { total } = computeTotals(getCart());
      const show = e.target.value === "TRANSFER";
      const tbox = qs("#transferBox");
      if (tbox) tbox.classList.toggle("hidden", !show);
      if (show) updateQR(total);
    }
    if (e.target.name === "orderType") {
      switchTypeUI(e.target.value);
    }
  });

  const btnCopy = qs("#qrCopy");
  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(config?.bankAccountNumber || "");
        window.__ui?.toast("Đã sao chép số tài khoản", "ok");
      } catch {
        window.__ui?.toast("Không sao chép được", "warn");
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const items = getCart();
    if (!items.length) return alert("Giỏ hàng trống");

    const orderType =
      form.querySelector("input[name=orderType]:checked")?.value || "TAKEAWAY";

    const meta = { orderType, note: qs("#note")?.value.trim() || "" };
    if (orderType === "TAKEAWAY") {
      const pAt = qs("#pickupAt")?.value;
      meta.scheduleAt = pAt ? new Date(pAt).toISOString() : null;
    } else if (orderType === "DINE_IN") {
      meta.tableNumber = qs("#tableNumber")?.value.trim() || "";
      meta.guests = Number(qs("#guests_dinein")?.value || 0);
    } else if (orderType === "RESERVE") {
      const rAt = qs("#reserveAt")?.value;
      if (!rAt) return alert("Vui lòng chọn thời gian đến cho Đặt trước");
      meta.scheduleAt = new Date(rAt).toISOString();
      meta.guests = Number(qs("#guests_reserve")?.value || 0);
    }

    const payload = {
      customer: {
        name: qs("#name")?.value.trim() || "",
        phone: qs("#phone")?.value.trim() || "",
        address: qs("#address")?.value.trim() || "",
      },
      items,
      paymentMethod:
        form.querySelector("input[name=payment]:checked")?.value || "COD",
      meta,
    };

    if (!payload.customer.name || !payload.customer.phone) {
      return alert("Vui lòng nhập họ tên và số điện thoại");
    }

    try {
      window.__ui?.showSpinner();
      const r = await apiPost("/api/orders", payload);
      window.__ui?.hideSpinner();

      const tail = payload.customer.phone.slice(-4);
      const link = `/track.html?orderId=${encodeURIComponent(
        r.orderId
      )}&phone=${encodeURIComponent(payload.customer.phone)}`;

      clearCart();
      saveCart(); // Lưu trạng thái rỗng
      renderCart();

      const result = qs("#result");
      if (result) {
        result.classList.remove("hidden");
        result.innerHTML = `
          <div class="card">
            Đặt hàng thành công!<br/>
            Mã đơn: <b>${r.orderId}</b><br/>
            ${
              promoActive()
                ? `Tạm tính: <b>${vnd(r.subtotal)}</b> · Giảm: <b>-${vnd(
                    r.discount
                  )}</b><br/>`
                : ""
            }
            <b>Tổng thanh toán: ${vnd(r.total)}</b><br/>
            Theo dõi: <a target="_blank" href="${link}">${link.replace(
          payload.customer.phone,
          "****" + tail
        )}</a>
          </div>
        `;
      }

      form.reset();
      const tbox = qs("#transferBox");
      if (tbox) tbox.classList.add("hidden");
      switchTypeUI("TAKEAWAY");
      window.__ui?.toast("Đơn đã tạo thành công!", "ok");
    } catch (err) {
      window.__ui?.hideSpinner();
      alert("Lỗi đặt hàng: " + err.message);
      window.__ui?.toast("Lỗi đặt hàng: " + err.message, "error", 3500);
    }
  });
}

/* ============ Start ============ */
async function start() {
  try {
    products = await apiGet("/api/products");
    config = await apiGet("/api/config");
    if (!config) {
      console.warn("Config not loaded, using defaults");
      config = {};
    }
  } catch (e) {
    console.error("Error loading config/products:", e);
    config = {};
  }
  setBankInfo();

  // Load cart from localStorage
  loadCart();

  const curType =
    document.querySelector("input[name=orderType]:checked")?.value ||
    "TAKEAWAY";
  switchTypeUI(curType);

  renderCart();
  bindForm();

  if (
    document.querySelector('input[name=payment][value="TRANSFER"]')?.checked
  ) {
    const { total } = computeTotals(getCart());
    const tbox = qs("#transferBox");
    if (tbox) tbox.classList.remove("hidden");
    updateQR(total);
  }
}

document.addEventListener("DOMContentLoaded", start);
