// admin/js/orders.js
(async function () {
  const tbl = document.querySelector("#tbl tbody");
  const statusSel = document.getElementById("status");
  const qInput = document.getElementById("q");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const pageInfo = document.getElementById("pageInfo");

  // Drawer refs
  const drawer = document.getElementById("detailDrawer");
  const dBack = document.getElementById("detailBack");
  const dClose = document.getElementById("d_close");
  const dInvoiceBtn = document.getElementById("d_invoice");
  const d_id = document.getElementById("d_id");
  const d_customer = document.getElementById("d_customer");
  const d_contact = document.getElementById("d_contact");
  const d_address = document.getElementById("d_address");
  const d_type = document.getElementById("d_type");
  const d_schedule = document.getElementById("d_schedule");
  const d_table = document.getElementById("d_table");
  const d_pay = document.getElementById("d_pay");
  const d_note = document.getElementById("d_note");
  const d_items = document.getElementById("d_items");
  const d_sub = document.getElementById("d_sub");
  const d_disc = document.getElementById("d_disc");
  const d_total = document.getElementById("d_total");

  let page = 1,
    pageSize = 10,
    total = 0;

  // deep search
  let keyword = "";
  let deepMode = false;
  let deepItems = [];
  let deepTotal = 0;

  // cache sản phẩm (để phòng đơn cũ thiếu đơn giá)
  let productMap = null;
  async function ensureProducts() {
    if (productMap) return productMap;
    const r = await window.__adminFetch("/api/products");
    productMap = {};
    for (const p of r.items || r || []) {
      productMap[p.id] = { name: p.name, priceSell: p.priceSell || 0 };
    }
    return productMap;
  }

  // ===== Toast nho nhỏ
  (function () {
    const wrap = document.getElementById("toastWrap");
    function show(kind, msg) {
      const el = document.createElement("div");
      el.className = "toast " + (kind || "");
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-6px)";
        setTimeout(() => el.remove(), 220);
      }, 2600);
    }
    window.toast = {
      success: (m) => show("success", m),
      warning: (m) => show("warn", m),
      error: (m) => show("error", m),
      info: (m) => show("", m),
    };
  })();

  // ===== Modal confirm
  window.showConfirm = function (
    title,
    message,
    okText = "OK",
    cancelText = "Huỷ"
  ) {
    const back = document.getElementById("confirmBackdrop");
    const t = document.getElementById("confirmTitle");
    const m = document.getElementById("confirmMsg");
    const ok = document.getElementById("confirmOk");
    const cancel = document.getElementById("confirmCancel");
    t.textContent = title || "Xác nhận";
    m.textContent = message || "";
    ok.textContent = okText;
    cancel.textContent = cancelText;
    back.style.display = "flex";
    return new Promise((res) => {
      const done = (v) => {
        back.style.display = "none";
        cleanup();
        res(v);
      };
      const onKey = (e) => {
        if (e.key === "Escape") done(false);
      };
      const onOk = () => done(true);
      const onCancel = () => done(false);
      const cleanup = () => {
        ok.removeEventListener("click", onOk);
        cancel.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKey);
      };
      ok.addEventListener("click", onOk);
      cancel.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKey);
    });
  };

  const typeLabel = (t) =>
    t === "DINE_IN" ? "Tại bàn" : t === "RESERVE" ? "Đặt trước" : "Mang đi";
  const money = (n) => (n || 0).toLocaleString("vi-VN") + "₫";
  const stClass = (st) =>
    st === "NEW"
      ? "badge info"
      : st === "IN_PROGRESS"
      ? "badge warn"
      : st === "COMPLETED"
      ? "badge success"
      : st === "CANCELED"
      ? "badge danger"
      : "badge gray";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const busy = (v) => (document.body.style.cursor = v ? "progress" : "");

  function matches(o, s) {
    if (!s) return true;
    s = s.toLowerCase();
    return (
      (o.id || "").toLowerCase().includes(s) ||
      (o.customer?.phone || "").toLowerCase().includes(s) ||
      (o.customer?.name || "").toLowerCase().includes(s)
    );
  }

  async function fetchPage(p, st, qParam) {
    const qs = new URLSearchParams({ page: p, pageSize });
    if (st) qs.set("status", st);
    if (qParam) qs.set("q", qParam);
    return await window.__adminFetch("/api/orders?" + qs.toString());
  }

  function renderRow(o) {
    const m = o.meta || {};
    const subtotal = o.subtotal ?? o.total ?? 0;
    const discount = o.discount ?? 0;
    const pmBadge =
      o.paymentMethod === "TRANSFER"
        ? `<span class="badge info">Chuyển khoản</span>`
        : `<span class="badge gray">COD</span>`;
    const scheduleText = m.scheduleAt
      ? new Date(m.scheduleAt).toLocaleString("vi-VN")
      : "";

    const tr = document.createElement("tr");
    tr.dataset.id = o.id;
    tr.innerHTML = `
      <td data-label="Mã">
        <div style="display:flex; align-items:center; gap:8px;">
          <code style="background:rgba(148,163,184,.12); padding:2px 6px; border-radius:6px;">${
            o.id
          }</code>
          <button class="btn ghost btnCopyId">Copy</button>
        </div>
      </td>
      <td data-label="Khách">
        <div><b>${o.customer?.name || ""}</b></div>
        <div class="muted">${o.customer?.phone || ""} · ${
      o.customer?.address || ""
    }</div>
      </td>
      <td data-label="Tổng">
        <div><b>${money(o.total ?? subtotal - discount)}</b></div>
        <div class="muted">(${money(subtotal)} − ${money(discount)})</div>
      </td>
      <td data-label="Thanh toán">${pmBadge}</td>
      <td data-label="Loại - Lịch">
        <div><b>${typeLabel(m.orderType)}</b></div>
        <div class="muted">
          ${m.tableNumber ? "Bàn: " + m.tableNumber + " · " : ""}Khách: ${
      m.guests || 0
    }<br/>
          ${scheduleText ? "Lịch: " + scheduleText : ""}
        </div>
      </td>
      <td data-label="Trạng thái">
        <select class="st" aria-label="Trạng thái đơn">
          <option value="NEW" ${
            o.status === "NEW" ? "selected" : ""
          }>Mới</option>
          <option value="IN_PROGRESS" ${
            o.status === "IN_PROGRESS" ? "selected" : ""
          }>Đang làm</option>
          <option value="COMPLETED" ${
            o.status === "COMPLETED" ? "selected" : ""
          }>Hoàn tất</option>
          <option value="CANCELED" ${
            o.status === "CANCELED" ? "selected" : ""
          }>Đã huỷ</option>
        </select>
        <div class="${stClass(
          o.status
        )}" style="margin-top:6px; display:inline-flex">
          ${
            o.status === "NEW"
              ? "Mới"
              : o.status === "IN_PROGRESS"
              ? "Đang làm"
              : o.status === "COMPLETED"
              ? "Hoàn tất"
              : "Đã huỷ"
          }
        </div>
      </td>
      <td data-label="Tạo lúc">${new Date(o.createdAt).toLocaleString(
        "vi-VN"
      )}</td>
      <td data-label="Thao tác">
        <div class="cell-actions">
          <button class="btn ghost view">Chi tiết</button>
          <button class="btn danger del">Xoá</button>
        </div>
      </td>
    `;

    tr.querySelector(".btnCopyId")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(o.id);
        window.toast?.success?.("Đã sao chép: " + o.id);
      } catch {
        window.toast?.info?.("Không sao chép được, thử Ctrl+C.");
      }
    });

    tr.querySelector(".view")?.addEventListener("click", () => openDetail(o));

    tr.querySelector(".st").addEventListener("change", async (e) => {
      const newSt = e.target.value;
      try {
        await window.__adminFetch(`/api/orders/${o.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: newSt }),
        });
        o.status = newSt;
        const badge = tr.querySelector(".badge");
        badge.className = stClass(newSt);
        badge.textContent =
          newSt === "NEW"
            ? "Mới"
            : newSt === "IN_PROGRESS"
            ? "Đang làm"
            : newSt === "COMPLETED"
            ? "Hoàn tất"
            : "Đã huỷ";
        window.toast?.success?.("Đã cập nhật trạng thái");
      } catch (err) {
        window.toast?.error?.(
          "Lỗi cập nhật: " + (err?.message || "Không rõ lỗi")
        );
      }
    });

    tr.querySelector(".del").addEventListener("click", async () => {
      const ok = await (window.showConfirm?.(
        "Xoá đơn",
        `Xoá đơn ${o.id}?`,
        "Xoá",
        "Huỷ"
      ) ?? Promise.resolve(confirm("Xoá?")));
      if (!ok) return;
      try {
        await window.__adminFetch(`/api/orders/${o.id}`, { method: "DELETE" });
        tr.remove();
        window.toast?.success?.("Đã xoá đơn " + o.id);
      } catch (e) {
        window.toast?.error?.("Lỗi xoá: " + (e?.message || "Không rõ lỗi"));
      }
    });

    return tr;
  }

  async function load() {
    deepMode = keyword.trim().length >= 2;

    if (deepMode) {
      try {
        busy(true);
        const st = statusSel.value;
        const first = await fetchPage(1, st, keyword);
        total = first.total || 0;

        const looksServerFiltered = (first.items || []).every((it) =>
          matches(it, keyword)
        );
        deepItems = looksServerFiltered
          ? first.items || []
          : (first.items || []).filter((it) => matches(it, keyword));

        const maxPages = Math.min(Math.ceil(total / pageSize), 30);
        for (let p = 2; p <= maxPages; p++) {
          const r = await fetchPage(
            p,
            st,
            looksServerFiltered ? keyword : null
          );
          deepItems.push(
            ...((looksServerFiltered
              ? r.items
              : (r.items || []).filter((it) => matches(it, keyword))) || [])
          );
          await sleep(30);
        }
        deepTotal = deepItems.length;

        const pages = Math.max(1, Math.ceil(deepTotal / pageSize));
        if (page > pages) page = pages;
        const start = (page - 1) * pageSize;
        draw(deepItems.slice(start, start + pageSize));
        pageInfo.textContent = `Trang ${page} / ${pages} • ${deepTotal} kết quả`;
      } finally {
        busy(false);
      }
      return;
    }

    const st = statusSel.value;
    const r = await fetchPage(page, st, "");
    total = r.total;

    const items = (r.items || []).filter((it) => matches(it, keyword));
    draw(items);
    pageInfo.textContent = `Trang ${r.page} / ${Math.max(
      1,
      Math.ceil(total / pageSize)
    )}`;
  }

  function draw(items) {
    tbl.innerHTML = "";
    if (!items.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="8" class="muted" style="padding:16px">Không có dữ liệu phù hợp</td>`;
      tbl.appendChild(tr);
      return;
    }
    items.forEach((o) => tbl.appendChild(renderRow(o)));
  }

  // ===== Detail drawer
  let currentOrder = null;

  function priceOf(it) {
    const p = it.price ?? it.unitPrice;
    if (typeof p === "number" && !Number.isNaN(p)) return p;
    const found = productMap?.[it.productId];
    return found ? found.priceSell || 0 : 0;
  }
  function nameOf(it) {
    return (
      it.name ||
      it.productName ||
      it.product?.name ||
      productMap?.[it.productId]?.name ||
      it.productId ||
      "Món"
    );
  }

  async function openDetail(o) {
    currentOrder = o;
    await ensureProducts();

    const m = o.meta || {};
    d_id.textContent = o.id;
    d_customer.textContent = o.customer?.name || "";
    d_contact.textContent = o.customer?.phone || "";
    d_address.textContent = o.customer?.address || "";
    d_type.textContent = typeLabel(m.orderType) || "";
    d_schedule.textContent = m.scheduleAt
      ? new Date(m.scheduleAt).toLocaleString("vi-VN")
      : "";
    d_table.textContent = `${
      m.tableNumber ? "Bàn " + m.tableNumber : "—"
    } • Khách: ${m.guests || 0}`;
    d_pay.innerHTML =
      o.paymentMethod === "TRANSFER"
        ? `<span class="badge info">Chuyển khoản</span>`
        : `<span class="badge gray">COD</span>`;
    d_note.textContent = m.note || m.notes || "";

    d_items.innerHTML = "";
    let subtotal = 0;
    for (const it of o.items || []) {
      const qty = it.qty || 1;
      const unit = priceOf(it);
      subtotal += qty * unit;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:left">${nameOf(it)}${
        it.note ? ` <span class="muted">(${it.note})</span>` : ""
      }</td>
        <td style="text-align:center">${qty}</td>
        <td style="text-align:right">${money(qty * unit)}</td>
      `;
      d_items.appendChild(tr);
    }
    const discount = o.discount || 0;
    const totalV = o.total ?? Math.max(0, subtotal - discount);
    d_sub.textContent = money(o.subtotal ?? subtotal);
    d_disc.textContent = money(discount);
    d_total.textContent = money(totalV);

    // KHÔNG disable nút xem hoá đơn — để server quyết định quyền xem
    // dInvoiceBtn.disabled = o.status !== "COMPLETED";

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  dBack?.addEventListener("click", closeDetail);
  dClose?.addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });

  // ===== XEM HOÁ ĐƠN (Admin): mở tab trước, fetch sau để tránh chặn popup
  dInvoiceBtn?.addEventListener("click", async () => {
    if (!currentOrder) return;

    // mở tab ngay khi click
    const w = window.open("", "_blank");
    if (!w) {
      window.toast?.warning?.(
        "Trình duyệt đang chặn cửa sổ. Hãy cho phép popup."
      );
      return;
    }

    try {
      // gọi API server (chỉ trả về khi COMPLETED)
      const inv = await window.__adminFetch(
        `/api/orders/invoice/${currentOrder.id}`
      );

      const money = (n) => (n || 0).toLocaleString("vi-VN") + "₫";
      const typeLabel = (t) =>
        t === "DINE_IN" ? "Tại bàn" : t === "RESERVE" ? "Đặt trước" : "Mang đi";
      const rows = (inv.items || [])
        .map((it) => {
          const qty = it.qty || 1;
          const unit = it.priceSell ?? it.price ?? it.unitPrice ?? 0;
          const name = it.name || it.productName || it.productId || "Món";
          return `<tr><td>${name}${
            it.note ? ` (${it.note})` : ""
          }</td><td style="text-align:center">${qty}</td><td style="text-align:right">${money(
            qty * unit
          )}</td></tr>`;
        })
        .join("");

      const html = `
<!doctype html><html><head><meta charset="utf-8">
<title>Hóa đơn ${inv.id}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px;color:#111;background:#fff}
  .hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  h1{font-size:18px;margin:0} .muted{color:#6b7280}
  table{width:100%;border-collapse:collapse;margin-top:10px}
  th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:14px}
  .total{margin-top:10px;border:1px dashed #d1d5db;padding:8px;border-radius:10px}
  .toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;background:#fff;padding-bottom:6px}
  .toolbar button{padding:6px 10px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer}
</style>
</head><body>
  <div class="toolbar"><button onclick="window.close()">Đóng</button></div>
  <div class="hd">
    <h1>HỆ THỐNG QUAY NƯỚNG GÀ VỊT NHI NHI</h1>
    <div class="muted">Mã đơn: <b>${inv.id}</b><br/>Lúc: ${new Date(
        inv.createdAt
      ).toLocaleString("vi-VN")}</div>
  </div>
  <div>Khách: <b>${inv.customer?.name || ""}</b>${
        inv.customer?.phone ? " — " + inv.customer.phone : ""
      }</div>
  <div class="muted">${inv.customer?.address || ""}</div>
  <div class="muted">Loại: ${typeLabel(inv.meta?.orderType) || ""} ${
        inv.meta?.tableNumber ? "• Bàn " + inv.meta.tableNumber : ""
      } ${inv.meta?.guests ? "• Khách: " + inv.meta.guests : ""}</div>
  <table>
    <thead><tr><th style="text-align:left">Món</th><th>SL</th><th style="text-align:right">Thành tiền</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">
    <div>Tạm tính: <b>${money(inv.subtotal)}</b></div>
    <div>Giảm: <b>${money(inv.discount)}</b></div>
    <div>Tổng: <b style="font-size:18px">${money(inv.total)}</b></div>
    <div class="muted">Thanh toán: ${
      inv.paymentMethod === "TRANSFER" ? "Chuyển khoản" : "COD"
    }</div>
  </div>
</body></html>`;
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      try {
        w.close();
      } catch {}
      const msg = e?.message || "";
      if (msg.includes("403"))
        window.toast?.warning?.("Hoá đơn chỉ có sau khi đơn đã Hoàn tất.");
      else window.toast?.error?.("Không mở được hoá đơn: " + msg);
    }
  });

  // ===== Bộ events chung
  statusSel.addEventListener("change", () => {
    page = 1;
    load();
  });
  let qTimer = 0;
  qInput?.addEventListener?.("input", () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      keyword = (qInput.value || "").trim();
      page = 1;
      load();
    }, 220);
  });
  prev.addEventListener("click", () => {
    const pages = deepMode
      ? Math.max(1, Math.ceil(deepTotal / pageSize))
      : Math.max(1, Math.ceil(total / pageSize));
    if (page > 1) {
      page--;
      load();
    }
  });
  next.addEventListener("click", () => {
    const pages = deepMode
      ? Math.max(1, Math.ceil(deepTotal / pageSize))
      : Math.max(1, Math.ceil(total / pageSize));
    if (page < pages) {
      page++;
      load();
    }
  });

  await load();

  // ===== SSE realtime
  function upsertRow(order) {
    if (deepMode) return;
    const st = statusSel.value;
    const okByFilter = !st || st === (order.status || "NEW");
    if (!okByFilter) return;
    if (page === 1) {
      const old = tbl.querySelector(`tr[data-id="${order.id}"]`);
      const fresh = renderRow(order);
      if (old) tbl.replaceChild(fresh, old);
      else tbl.insertBefore(fresh, tbl.firstChild);
    } else {
      pageInfo.textContent = pageInfo.textContent + " • Có cập nhật!";
    }
  }
  function removeRow(id) {
    const tr = tbl.querySelector(`tr[data-id="${id}"]`);
    if (tr) tr.remove();
  }
  function connectSSE() {
    const tk = localStorage.getItem("adminToken") || "";
    const es = new EventSource(
      `/api/orders/stream?token=${encodeURIComponent(tk)}`
    );
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (!data) return;
        if (data.type === "new_order" && data.order) {
          if (!deepMode && page === 1) {
            upsertRow(data.order);
            window.toast?.info?.("Có đơn mới");
          } else {
            pageInfo.textContent += " • Có đơn mới!";
          }
        }
        if (data.type === "order_updated" && data.order) {
          upsertRow(data.order);
          window.toast?.info?.(`Đơn ${data.order.id} vừa cập nhật`);
        }
        if (data.type === "order_deleted" && data.orderId) {
          removeRow(data.orderId);
          window.toast?.info?.(`Đơn ${data.orderId} đã xoá`);
        }
      } catch {}
    };
    es.onerror = () => {
      try {
        es.close();
      } catch {}
      setTimeout(connectSSE, 3000);
    };
  }
  connectSSE();

  // Focus qua SW / query
  navigator.serviceWorker?.addEventListener?.("message", async (ev) => {
    if (ev?.data?.type === "focus_order" && ev.data.orderId) {
      await ensureRowAndHighlight(ev.data.orderId);
    }
  });
  (async function handleFocusParam() {
    const params = new URLSearchParams(location.search);
    const id = params.get("focus");
    if (id) await ensureRowAndHighlight(id);
  })();

  async function ensureRowAndHighlight(orderId) {
    if (page !== 1 && !deepMode) {
      page = 1;
      await load();
    }
    highlightRow(orderId);
    if (
      !tbl.querySelector(`tr[data-id="${orderId}"]`) &&
      statusSel.value &&
      !deepMode
    ) {
      statusSel.value = "";
      await load();
      highlightRow(orderId);
    }
  }
  function highlightRow(orderId) {
    const tr = tbl.querySelector(`tr[data-id="${orderId}"]`);
    if (!tr) return;
    tr.scrollIntoView({ behavior: "smooth", block: "center" });
    tr.style.transition = "background-color .3s ease";
    tr.style.backgroundColor = "rgba(34,197,94,0.22)";
    setTimeout(() => (tr.style.backgroundColor = ""), 2000);
  }
})();
