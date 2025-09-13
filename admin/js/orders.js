(async function () {
  // ===== DOM =====
  const tbl = document.querySelector("#tbl tbody");
  const statusSel = document.getElementById("status");
  const qInput = document.getElementById("q");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const pageInfo = document.getElementById("pageInfo");
  const btnCreate = document.getElementById("btnCreate");

  const toast = window.toast || {
    success: (m) => alert(m),
    error: (m) => alert(m),
    info: (m) => alert(m),
    warning: (m) => alert(m),
  };

  const centerToast = (msg, ms = 1600) => {
    const wrap = document.getElementById("centerToast");
    const box = document.getElementById("centerToastMsg");
    if (!wrap || !box) return alert(msg);
    box.textContent = msg;
    wrap.style.display = "flex";
    setTimeout(() => (wrap.style.display = "none"), ms);
  };

  // ===== Helpers =====
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
  const asArray = (r) => (Array.isArray(r) ? r : (r && r.items) || []);
  const asPageObj = (r, fallback = {}) => {
    const items = asArray(r);
    const total = typeof r?.total === "number" ? r.total : items.length;
    const page = typeof r?.page === "number" ? r.page : fallback.page || 1;
    return { items, total, page };
  };
  function matches(o, s) {
    if (!s) return true;
    s = s.toLowerCase();
    return (
      (o.id || "").toLowerCase().includes(s) ||
      (o.customer?.phone || "").toLowerCase().includes(s) ||
      (o.customer?.name || "").toLowerCase().includes(s)
    );
  }
  function escapeHtml(s) {
    return (s || "").replace(
      /[&<>\"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        }[m])
    );
  }

  // ===== Products cache =====
  let productMap = null,
    productList = [];
  async function ensureProducts() {
    if (productMap) return productMap;
    try {
      const r = await window.__adminFetch("/api/products");
      const list = asArray(r);
      productMap = {};
      productList = list.map((p) => ({
        id: p.id,
        name: p.name,
        priceSell: p.priceSell || p.price || p.unitPrice || 0,
      }));
      for (const p of productList) productMap[p.id] = p;
    } catch {
      productMap = {};
      productList = [];
      toast.error("Không tải được danh sách sản phẩm.");
    }
    return productMap;
  }

  // ===== Pagination state =====
  let page = 1,
    pageSize = 10,
    total = 0;
  let keyword = "";
  let deepMode = false;
  let deepItems = [];
  let deepTotal = 0;

  async function fetchPage(p, st, qParam) {
    const qs = new URLSearchParams({ page: p, pageSize });
    if (st) qs.set("status", st);
    if (qParam) qs.set("q", qParam);
    const r = await window.__adminFetch("/api/orders?" + qs.toString());
    return asPageObj(r, { page: p });
  }

  function draw(items) {
    tbl.innerHTML = "";
    if (!items.length) {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td colspan="8" class="muted" style="padding:16px">Không có dữ liệu phù hợp</td>';
      tbl.appendChild(tr);
      return;
    }
    items.forEach((o) => tbl.appendChild(renderRow(o)));
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
    tr.dataset.id = o.id || "";
    tr.innerHTML = `
      <td data-label="Mã">
        <div style="display:flex;align-items:center;gap:8px">
          <code style="background:rgba(148,163,184,.12);padding:2px 6px;border-radius:6px">${
            o.id || ""
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
        <div class="muted">${
          m.tableNumber ? "Bàn: " + m.tableNumber + " · " : ""
        }Khách: ${m.guests || 0}<br/>${
      scheduleText ? "Lịch: " + scheduleText : ""
    }</div>
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
        )}" style="margin-top:6px;display:inline-flex">
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
      <td data-label="Tạo lúc">${
        o.createdAt ? new Date(o.createdAt).toLocaleString("vi-VN") : ""
      }</td>
      <td data-label="Thao tác">
        <div class="cell-actions">
          <button class="btn ghost view">Chi tiết</button>
          <button class="btn ghost edit">Sửa</button>
          <button class="btn danger del">Xoá</button>
        </div>
      </td>
    `;
    tr.querySelector(".btnCopyId")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(o.id || "");
        toast.success("Đã sao chép: " + (o.id || ""));
      } catch {
        toast.info("Không sao chép được, thử Ctrl+C.");
      }
    });
    tr.querySelector(".view")?.addEventListener("click", () => openDetail(o));
    tr.querySelector(".edit")?.addEventListener("click", () =>
      openForm("edit", o)
    );
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
        toast.success("Đã cập nhật trạng thái");
      } catch (err) {
        toast.error("Lỗi cập nhật: " + (err?.message || "Không rõ lỗi"));
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
        centerToast("Đã xoá đơn " + o.id);
      } catch (e) {
        toast.error("Lỗi xoá: " + (e?.message || "Không rõ lỗi"));
      }
    });
    return tr;
  }

  async function load() {
    try {
      const st = statusSel.value;
      const kw = (keyword || "").trim();
      deepMode = kw.length >= 2;
      if (deepMode) {
        busy(true);
        const first = await fetchPage(1, st, kw);
        total = first.total || 0;
        const looksFiltered = (first.items || []).every((it) =>
          matches(it, kw)
        );
        deepItems = looksFiltered
          ? first.items || []
          : (first.items || []).filter((it) => matches(it, kw));
        const maxPages = Math.min(Math.ceil(total / pageSize), 30);
        for (let p = 2; p <= maxPages; p++) {
          const r = await fetchPage(p, st, looksFiltered ? kw : null);
          const items = looksFiltered
            ? r.items
            : (r.items || []).filter((it) => matches(it, kw));
          deepItems.push(...(items || []));
          await sleep(30);
        }
        deepTotal = deepItems.length;
        const pages = Math.max(1, Math.ceil(deepTotal / pageSize));
        if (page > pages) page = pages;
        const start = (page - 1) * pageSize;
        draw(deepItems.slice(start, start + pageSize));
        pageInfo.textContent = `Trang ${page} / ${pages} • ${deepTotal} kết quả`;
        return;
      }
      const r = await fetchPage(page, st, "");
      total = r.total || 0;
      const items = (r.items || []).filter((it) => matches(it, keyword));
      draw(items);
      pageInfo.textContent = `Trang ${r.page || page} / ${Math.max(
        1,
        Math.ceil(total / pageSize)
      )}`;
    } catch (e) {
      toast.error(
        "Không tải được danh sách: " + (e?.message || "Lỗi không rõ")
      );
    } finally {
      busy(false);
    }
  }

  // ===== Detail drawer =====
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
  let currentOrder = null;

  function priceOf(it) {
    const p = it?.price ?? it?.unitPrice ?? it?.priceSell;
    if (typeof p === "number" && !Number.isNaN(p)) return p;
    const found = productMap?.[it?.productId || ""];
    return found ? found.priceSell || 0 : 0;
  }
  function nameOf(it) {
    return (
      it?.name ||
      it?.productName ||
      it?.product?.name ||
      productMap?.[it?.productId || ""]?.name ||
      it?.productId ||
      "Món"
    );
  }

  async function openDetail(o) {
    currentOrder = o;
    await ensureProducts();
    const m = o.meta || {};
    d_id.textContent = o.id || "";
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
      const qty = it.qty || 1,
        unit = priceOf(it);
      subtotal += qty * unit;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td style="text-align:left">${nameOf(it)}${
        it.note ? ` <span class="muted">(${it.note})</span>` : ""
      }</td><td style="text-align:center">${qty}</td><td style="text-align:right">${money(
        qty * unit
      )}</td>`;
      d_items.appendChild(tr);
    }
    const discount = o.discount || 0;
    const totalV = o.total ?? Math.max(0, subtotal - discount);
    d_sub.textContent = money(o.subtotal ?? subtotal);
    d_disc.textContent = money(discount);
    d_total.textContent = money(totalV);
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
    if (e.key === "Escape") {
      closeDetail();
      closeForm();
    }
  });

  // ===== INVOICE popup =====
  dInvoiceBtn?.addEventListener("click", async () => {
    if (!currentOrder) return;
    const w = window.open("", "_blank");
    if (!w) return toast.warning("Trình duyệt chặn popup.");
    try {
      const inv = await window.__adminFetch(
        `/api/orders/invoice/${currentOrder.id}`
      );
      const rows = (inv.items || [])
        .map((it) => {
          const qty = it.qty || 1,
            unit = it.priceSell ?? it.price ?? it.unitPrice ?? 0;
          const name = it.name || it.productName || it.productId || "Món";
          return `<tr><td>${name}${
            it.note ? ` (${it.note})` : ""
          }</td><td style="text-align:center">${qty}</td><td style="text-align:right">${money(
            qty * unit
          )}</td></tr>`;
        })
        .join("");
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hóa đơn ${
        inv.id || ""
      }</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:16px;color:#111;background:#fff}
.hd{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}h1{font-size:18px;margin:0}.muted{color:#6b7280}
table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:14px}
.total{margin-top:10px;border:1px dashed #d1d5db;padding:8px;border-radius:10px}.toolbar{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;background:#fff;padding-bottom:6px}
.toolbar button{padding:6px 10px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;cursor:pointer}</style></head><body>
<div class="toolbar"><button onclick="window.close()">Đóng</button></div>
<div class="hd"><h1>HỆ THỐNG QUAY NƯỚNG GÀ VỊT NHI NHI</h1>
<div class="muted">Mã đơn: <b>${inv.id || ""}</b><br/>Lúc: ${
        inv.createdAt ? new Date(inv.createdAt).toLocaleString("vi-VN") : ""
      }</div></div>
<div>Khách: <b>${inv.customer?.name || ""}</b>${
        inv.customer?.phone ? " — " + inv.customer.phone : ""
      }</div>
<div class="muted">${inv.customer?.address || ""}</div>
<div class="muted">Loại: ${typeLabel(inv.meta?.orderType) || ""} ${
        inv.meta?.tableNumber ? "• Bàn " + inv.meta.tableNumber : ""
      } ${inv.meta?.guests ? "• Khách: " + inv.meta.guests : ""}</div>
<table><thead><tr><th style="text-align:left">Món</th><th>SL</th><th style="text-align:right">Thành tiền</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><div>Tạm tính: <b>${money(
        inv.subtotal
      )}</b></div><div>Giảm: <b>${money(
        inv.discount
      )}</b></div><div>Tổng: <b style="font-size:18px">${money(
        inv.total
      )}</b></div><div class="muted">Thanh toán: ${
        inv.paymentMethod === "TRANSFER" ? "Chuyển khoản" : "COD"
      }</div></div>
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
        toast.warning("Hoá đơn chỉ có sau khi đơn đã Hoàn tất.");
      else toast.error("Không mở được hoá đơn: " + msg);
    }
  });

  // ===== FORM: Create / Edit =====
  const formDrawer = document.getElementById("formDrawer");
  const formBack = document.getElementById("formBack");
  const formClose = document.getElementById("formClose");
  const formSave = document.getElementById("formSave");
  const formTitle = document.getElementById("formTitle");
  const f_name = document.getElementById("f_name");
  const f_phone = document.getElementById("f_phone");
  const f_address = document.getElementById("f_address");
  const f_type = document.getElementById("f_type");
  const f_table = document.getElementById("f_table");
  const f_guests = document.getElementById("f_guests");
  const f_schedule = document.getElementById("f_schedule");
  const f_payment = document.getElementById("f_payment");
  const f_note = document.getElementById("f_note");
  const f_rows = document.getElementById("f_rows");
  const f_addRow = document.getElementById("f_addRow");
  const f_sub = document.getElementById("f_sub");
  const f_disc = document.getElementById("f_disc");
  const f_total = document.getElementById("f_total");
  let formMode = "create";
  let editingOrderId = null;

  function toLocalDatetime(iso) {
    const d = new Date(iso);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  function openForm(mode = "create", order = null) {
    formMode = mode;
    editingOrderId = order?.id || null;
    formTitle.textContent =
      mode === "create" ? "Tạo đơn" : `Sửa đơn ${editingOrderId || ""}`;
    f_name.value = order?.customer?.name || "";
    f_phone.value = order?.customer?.phone || "";
    f_address.value = order?.customer?.address || "";
    f_type.value = order?.meta?.orderType || "TAKE_AWAY";
    f_table.value = order?.meta?.tableNumber || "";
    f_guests.value = order?.meta?.guests || "";
    f_schedule.value = order?.meta?.scheduleAt
      ? toLocalDatetime(order.meta.scheduleAt)
      : "";
    f_payment.value = order?.paymentMethod || "COD";
    f_note.value = order?.meta?.note || order?.meta?.notes || "";
    f_rows.innerHTML = "";
    const items = order?.items?.length ? order.items : [];
    if (items.length)
      items.forEach((it) =>
        addRow({
          productId: it.productId,
          qty: it.qty || 1,
          note: it.note || "",
          priceSell: it.priceSell ?? it.price ?? it.unitPrice ?? undefined,
        })
      );
    else addRow();
    recomputeFormTotal();
    formDrawer.classList.add("open");
    formDrawer.setAttribute("aria-hidden", "false");
  }
  function closeForm() {
    formDrawer.classList.remove("open");
    formDrawer.setAttribute("aria-hidden", "true");
  }
  formBack.addEventListener("click", closeForm);
  formClose.addEventListener("click", closeForm);
  btnCreate.addEventListener("click", async () => {
    await ensureProducts();
    openForm("create");
  });

  function addRow(initial = null) {
    const tr = document.createElement("tr");
    const prodOptions =
      `<option value="">— Chọn món —</option>` +
      productList
        .map(
          (p) =>
            `<option value="${p.id}" data-price="${
              p.priceSell || 0
            }">${escapeHtml(p.name)}</option>`
        )
        .join("");
    tr.innerHTML = `
      <td>
        <select class="select f_prod">${prodOptions}</select>
        <div class="muted f_note_wrap"><input class="input f_note" placeholder="Ghi chú món (tuỳ chọn)"></div>
      </td>
      <td style="text-align:right"><input class="input f_price" type="number" min="0" step="1000" disabled></td>
      <td style="text-align:center"><input class="input f_qty" type="number" min="1" value="1" disabled></td>
      <td style="text-align:right"><b class="f_line">0₫</b></td>
      <td style="text-align:center"><button class="btn danger f_remove" title="Xoá món">✕</button></td>
    `;
    const sel = tr.querySelector(".f_prod");
    const price = tr.querySelector(".f_price");
    const qty = tr.querySelector(".f_qty");
    const note = tr.querySelector(".f_note");
    const line = tr.querySelector(".f_line");
    const rmBtn = tr.querySelector(".f_remove");

    const enableInputs = (on) => {
      price.disabled = !on;
      qty.disabled = !on;
    };
    const updateLine = () => {
      const q = parseInt(qty.value || "1", 10) || 1;
      const pr = parseInt(price.value || "0", 10) || 0;
      line.textContent = money(q * pr);
      recomputeFormTotal();
    };
    const patchFromProduct = () => {
      const pid = sel.value;
      if (!pid) {
        price.value = "";
        qty.value = 1;
        line.textContent = money(0);
        enableInputs(false);
        return recomputeFormTotal();
      }
      const p = productMap?.[pid];
      price.value = (p?.priceSell || 0).toString();
      enableInputs(true);
      updateLine();
    };

    sel.addEventListener("change", patchFromProduct);
    qty.addEventListener("input", updateLine);
    price.addEventListener("input", updateLine);
    rmBtn.addEventListener("click", () => {
      tr.remove();
      recomputeFormTotal();
    });

    f_rows.appendChild(tr);
    if (initial?.productId) {
      sel.value = initial.productId;
      price.value = (
        initial.priceSell ??
        productMap?.[initial.productId]?.priceSell ??
        0
      ).toString();
      qty.value = initial.qty || 1;
      if (initial.note) note.value = initial.note;
      enableInputs(true);
      updateLine();
    }
  }
  f_addRow.addEventListener("click", () => addRow());

  function recomputeFormTotal() {
    let subtotal = 0;
    [...f_rows.querySelectorAll("tr")].forEach((tr) => {
      const pid = tr.querySelector(".f_prod").value;
      if (!pid) return;
      const q = parseInt(tr.querySelector(".f_qty").value || "1", 10) || 1;
      const pr = parseInt(tr.querySelector(".f_price").value || "0", 10) || 0;
      subtotal += q * pr;
    });
    f_sub.textContent = money(subtotal);
    f_disc.textContent = money(0);
    f_total.textContent = money(subtotal);
  }

  function buildPayloadFromForm() {
    const items = [...f_rows.querySelectorAll("tr")]
      .map((tr) => {
        const productId = tr.querySelector(".f_prod").value;
        if (!productId) return null;
        const qty = parseInt(tr.querySelector(".f_qty").value || "1", 10) || 1;
        const priceNum =
          parseInt(tr.querySelector(".f_price").value || "0", 10) || 0;
        const note = tr.querySelector(".f_note").value.trim();
        const p = productMap?.[productId] || {};
        return {
          productId,
          name: p.name,
          qty,
          priceSell: priceNum,
          price: priceNum,
          unitPrice: priceNum,
          ...(note ? { note } : {}),
        };
      })
      .filter(Boolean);

    let subtotal = 0;
    items.forEach((it) => (subtotal += it.qty * it.priceSell));

    const meta = {
      orderType: f_type.value,
      tableNumber: f_table.value || undefined,
      guests: parseInt(f_guests.value || "0", 10) || 0,
      scheduleAt: f_schedule.value
        ? new Date(f_schedule.value).toISOString()
        : undefined,
      note: f_note.value || undefined,
    };
    const customer = {
      name: f_name.value || "",
      phone: f_phone.value || "",
      address: f_address.value || "",
    };

    // "Tại bàn" chỉ nhập số bàn => tự đặt tên khách
    if (meta.orderType === "DINE_IN" && meta.tableNumber && !customer.name) {
      customer.name = `Bàn ${meta.tableNumber}`;
    }
    return {
      status: "NEW",
      customer,
      items,
      subtotal,
      discount: 0,
      total: subtotal,
      paymentMethod: f_payment.value,
      meta,
    };
  }

  // ---- Chuẩn bị các format fallback cho backend khác nhau
  function toLegacyFlat(p) {
    return {
      customerName: p.customer?.name || "",
      customerPhone: p.customer?.phone || "",
      address: p.customer?.address || "",
      paymentMethod: p.paymentMethod,
      orderType: p.meta?.orderType,
      tableNumber: p.meta?.tableNumber,
      guests: p.meta?.guests || 0,
      scheduleAt: p.meta?.scheduleAt,
      note: p.meta?.note,
      subtotal: p.subtotal,
      discount: p.discount,
      total: p.total,
      lines: (p.items || []).map((it) => ({
        productId: it.productId,
        quantity: it.qty,
        unitPrice: it.priceSell,
        note: it.note,
      })),
    };
  }

  async function postOrderWithFallback(payload) {
    console.debug("POST /api/orders payload", payload);
    try {
      return await window.__adminFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (e1) {
      const msg1 = (e1 && e1.message) || "";
      // Nếu backend kêu thiếu items hoặc không hiểu format => thử format "legacy"
      if (e1.status === 400 && /items|lines|body/i.test(msg1)) {
        const alt1 = toLegacyFlat(payload);
        console.debug("Retry with legacy flat payload", alt1);
        try {
          return await window.__adminFetch("/api/orders", {
            method: "POST",
            body: JSON.stringify(alt1),
          });
        } catch (e2) {
          const msg2 = (e2 && e2.message) || "";
          // Thử thêm kiểu bọc { order: ... }
          const alt2 = { order: payload };
          console.debug("Retry with {order: payload}", alt2);
          try {
            return await window.__adminFetch("/api/orders", {
              method: "POST",
              body: JSON.stringify(alt2),
            });
          } catch (e3) {
            throw new Error(msg2 || e3?.message || msg1 || "400 Bad Request");
          }
        }
      }
      throw e1;
    }
  }

  formSave.addEventListener("click", async () => {
    try {
      await ensureProducts();
      const payload = buildPayloadFromForm();
      if (!payload.items.length)
        return toast.warning("Hãy thêm ít nhất 1 món.");
      const res = await postOrderWithFallback(payload);
      if (formMode === "create") toast.success("Đã tạo đơn " + (res?.id || ""));
      else toast.success("Đã lưu thay đổi");
      closeForm();
      page = 1;
      await load();
    } catch (e) {
      toast.error("Không lưu được: " + (e?.message || "Lỗi không rõ"));
    }
  });

  // ===== Events chung =====
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

  await ensureProducts();
  await load();

  // ===== SSE realtime =====
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
            toast.info("Có đơn mới");
          } else {
            pageInfo.textContent += " • Có đơn mới!";
          }
        }
        if (data.type === "order_updated" && data.order) {
          upsertRow(data.order);
          toast.info(`Đơn ${data.order.id} vừa cập nhật`);
        }
        if (data.type === "order_deleted" && data.orderId) {
          removeRow(data.orderId);
          toast.info(`Đơn ${data.orderId} đã xoá`);
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

  // Focus từ SW / query
  navigator.serviceWorker?.addEventListener?.("message", async (ev) => {
    if (ev?.data?.type === "focus_order" && ev.data.orderId)
      await ensureRowAndHighlight(ev.data.orderId);
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

  // Confirm modal
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
})();
