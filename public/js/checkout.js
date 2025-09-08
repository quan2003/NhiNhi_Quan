// public/js/checkout.js (ESM) — phiên bản bỏ alert + banner thành công ở TRÊN form
import { vnd, qs, create } from "./utils.js";
import { apiGet, apiPost } from "./api.js";
import { getCart, setQty, removeItem, clearCart } from "./cart.js";

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

  if (!img) return;

  const fixed = config?.qrFixedImage || null;
  const acc = encodeURIComponent(config?.bankAccountNumber || "");
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
    img.src = fallbackUrl;
    if (dl) dl.href = fallbackUrl;
    if (cap)
      cap.textContent = `QR minh họa — Số tiền: ${vnd(
        amount
      )} — Nội dung: Tên + SĐT`;
  };

  img.src = fixed || fallbackUrl;
}
// ===== Custom Confirm (Promise-based) =====
function confirmBox(message = "Bạn có chắc?") {
  return new Promise((resolve) => {
    // backdrop
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      position:fixed; inset:0; z-index:9999;
      display:grid; place-items:center;
      background:rgba(0,0,0,.45);
      animation:fadeIn .15s ease;
    `;

    // dialog
    const dlg = document.createElement("div");
    dlg.style.cssText = `
      width:min(92vw,380px); border-radius:14px;
      background:var(--surface); color:var(--text);
      border:1px solid var(--border); box-shadow:var(--shadow);
      padding:16px; animation:scaleIn .15s ease;
    `;
    dlg.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <i data-lucide="help-circle"></i>
        <b style="font-size:16px">Xác nhận</b>
      </div>
      <div style="color:var(--muted);margin-bottom:14px">${message}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="cfCancel" class="btn outline">Huỷ</button>
        <button id="cfOk" class="btn danger">Xoá</button>
      </div>
    `;
    wrap.appendChild(dlg);
    document.body.appendChild(wrap);
    if (window.lucide) window.lucide.createIcons();

    const done = (val) => {
      wrap.remove();
      resolve(val);
    };
    dlg.querySelector("#cfCancel").addEventListener("click", () => done(false));
    dlg.querySelector("#cfOk").addEventListener("click", () => done(true));
    // close on backdrop click
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap) done(false);
    });
    // ESC to close
    document.addEventListener("keydown", function onKey(ev) {
      if (ev.key === "Escape") {
        done(false);
        document.removeEventListener("keydown", onKey);
      }
    });
  });
}

/* ============ Cart render ============ */
function renderCart() {
  const items = getCart();
  const box = qs("#cartItems");
  if (box) box.innerHTML = "";

  if (!items.length && box) {
    box.innerHTML = '<div class="muted text-center">Giỏ hàng trống</div>';
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
      setQty(it.productId, parseInt(input.value || "1", 10));
      renderCart();
    });

    const price = create("span", {
      text: vnd(p.priceSell * (it.qty || 1)),
      class: "cart-item-price",
    });

    const rm = create("button", { class: "btn outline danger", text: "Xoá" });
    rm.addEventListener("click", async () => {
      const ok = await confirmBox("Bạn có chắc muốn xoá món này?");
      if (!ok) return;
      removeItem(it.productId);
      renderCart();
      window.toast?.info?.("Đã xoá 1 món khỏi giỏ.");
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

/* ============ Success banner (hiển thị TRÊN form) ============ */
function showSuccessBanner({ orderId, subtotal, discount, total }, phone) {
  const section = document.querySelector(".checkout-section");
  if (!section) return;

  // Nếu đã có banner, gỡ bỏ để tạo mới
  section.querySelector("#successBanner")?.remove();

  const tail = (phone || "").slice(-4);
  const link = `/track.html?orderId=${encodeURIComponent(
    orderId
  )}&phone=${encodeURIComponent(phone || "")}`;
  const linkMasked = link.replace(phone || "", "****" + tail);

  const banner = document.createElement("div");
  banner.id = "successBanner";
  banner.className = "card";
  banner.style.cssText =
    "margin-bottom:12px;border-left:6px solid var(--accent);background:linear-gradient(0deg,rgba(56,161,105,.08),rgba(56,161,105,.08));";
  banner.innerHTML = `
    <div class="row" style="gap:8px;align-items:center">
      <i data-lucide="check-circle-2"></i>
      <h3 class="section-title" style="margin:0">Đặt hàng thành công!</h3>
    </div>
    <p style="margin:.5rem 0 0 0">Mã đơn: <b>${orderId}</b></p>
    ${
      typeof subtotal === "number" && typeof discount === "number"
        ? `<p style="margin:.25rem 0 0 0">Tạm tính: <b>${vnd(
            subtotal
          )}</b> · Giảm: <b>-${vnd(discount)}</b></p>`
        : ""
    }
    <p style="margin:.25rem 0 .25rem 0"><b>Tổng thanh toán: ${vnd(
      total
    )}</b></p>
    <p style="margin:0">Theo dõi: <a href="${link}" target="_blank">${linkMasked}</a></p>
  `;

  section.prepend(banner);
  if (window.lucide) window.lucide.createIcons();
  banner.scrollIntoView({ behavior: "smooth", block: "start" });
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
        window.toast?.success("Đã sao chép số tài khoản.");
      } catch {
        window.toast?.error("Không thể sao chép. Vui lòng copy thủ công.");
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const items = getCart();
    if (!items.length) {
      window.toast?.warning("Giỏ hàng đang trống. Vui lòng thêm món trước.");
      return;
    }

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
      if (!rAt) {
        window.toast?.warning("Vui lòng chọn thời gian đến cho Đặt trước.");
        return;
      }
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
      window.toast?.warning("Vui lòng nhập họ tên và số điện thoại.");
      return;
    }

    try {
      window.__ui?.showSpinner?.();
      const r = await apiPost("/api/orders", payload);
      window.__ui?.hideSpinner?.();

      // dọn giỏ + render lại
      clearCart();
      renderCart();

      // Ẩn khối QR (sẽ hiện lại nếu chọn Chuyển khoản)
      const tbox = qs("#transferBox");
      if (tbox) tbox.classList.add("hidden");

      // ✅ Hiển thị banner thành công Ở TRÊN form (không dùng #result ở dưới nút nữa)
      showSuccessBanner(
        {
          orderId: r.orderId,
          subtotal: r.subtotal,
          discount: r.discount,
          total: r.total,
        },
        payload.customer.phone
      );

      // Nếu chọn chuyển khoản thì bật QR lại với đúng tổng
      if (payload.paymentMethod === "TRANSFER") {
        const { total } = computeTotals(items);
        if (tbox) tbox.classList.remove("hidden");
        updateQR(total || r.total || 0);
      }

      // Reset form về mặc định
      form.reset();
      switchTypeUI("TAKEAWAY");

      // Toast nhỏ gọn
      window.toast?.success(`Đơn đã tạo: ${r.orderId}`);
    } catch (err) {
      window.__ui?.hideSpinner?.();
      window.toast?.error("Lỗi đặt hàng: " + (err?.message || "Không rõ lỗi"));
    }
  });
}

/* ============ Start ============ */
async function start() {
  try {
    products = await apiGet("/api/products");
    config = await apiGet("/api/config");
    if (!config) config = {};
  } catch (e) {
    config = {};
  }
  setBankInfo();

  const curType =
    document.querySelector("input[name=orderType]:checked")?.value ||
    "TAKEAWAY";
  switchTypeUI(curType);

  renderCart();
  bindForm();

  // Nếu mặc định đang chọn chuyển khoản → hiển thị QR ngay
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
