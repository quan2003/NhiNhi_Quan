// admin/js/orders.js
(async function () {
  const tbl = document.querySelector("#tbl tbody");
  const statusSel = document.getElementById("status");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  const pageInfo = document.getElementById("pageInfo");
  let page = 1,
    pageSize = 10,
    total = 0;

  const typeLabel = (t) =>
    t === "DINE_IN" ? "Tại bàn" : t === "RESERVE" ? "Đặt trước" : "Mang đi";

  async function load() {
    const q = new URLSearchParams({ page, pageSize });
    const st = statusSel.value;
    if (st) q.set("status", st);
    const r = await window.__adminFetch("/api/orders?" + q.toString());
    total = r.total;
    pageInfo.textContent = `Trang ${r.page} / ${Math.max(
      1,
      Math.ceil(total / pageSize)
    )}`;
    draw(r.items);
  }

  function draw(items) {
    tbl.innerHTML = "";
    items.forEach((o) => {
      const tr = document.createElement("tr");
      const m = o.meta || {};
      tr.innerHTML = `
        <td>${o.id}</td>
        <td>${o.customer.name}<br/><span class="muted">${o.customer.phone} · ${
        o.customer.address || ""
      }</span></td>
        <td>${(o.total || 0).toLocaleString(
          "vi-VN"
        )}₫<br/><span class="muted">(${(o.subtotal || o.total).toLocaleString(
        "vi-VN"
      )}₫ − ${(o.discount || 0).toLocaleString("vi-VN")}₫)</span></td>
        <td>${o.paymentMethod === "TRANSFER" ? "Chuyển khoản" : "COD"}</td>
        <td>
          <div><b>${typeLabel(m.orderType)}</b></div>
          <div class="muted">
            ${m.tableNumber ? "Bàn: " + m.tableNumber + " · " : ""}Khách: ${
        m.guests || 0
      }<br/>
            ${
              m.scheduleAt
                ? "Lịch: " + new Date(m.scheduleAt).toLocaleString("vi-VN")
                : ""
            }
          </div>
        </td>
        <td>
          <select class="st">
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
        </td>
        <td>${new Date(o.createdAt).toLocaleString("vi-VN")}</td>
        <td>
          <details><summary>Chi tiết</summary><pre>${JSON.stringify(
            o.items,
            null,
            2
          )}</pre></details>
          <div style="margin-top:8px">
            <button class="btn del">Xoá</button>
          </div>
        </td>
      `;
      tr.querySelector(".st").addEventListener("change", async (e) => {
        try {
          await window.__adminFetch(`/api/orders/${o.id}`, {
            method: "PUT",
            body: JSON.stringify({ status: e.target.value }),
          });
          alert("Đã cập nhật trạng thái");
        } catch (err) {
          alert("Lỗi cập nhật: " + err.message);
        }
      });
      tr.querySelector(".del").addEventListener("click", async () => {
        if (!confirm("Xoá đơn này vĩnh viễn? (không thể hoàn tác)")) return;
        try {
          await window.__adminFetch(`/api/orders/${o.id}`, {
            method: "DELETE",
          });
          await load();
        } catch (e) {
          alert("Lỗi xoá: " + e.message);
        }
      });
      tbl.appendChild(tr);
    });
  }

  statusSel.addEventListener("change", () => {
    page = 1;
    load();
  });
  prev.addEventListener("click", () => {
    if (page > 1) {
      page--;
      load();
    }
  });
  next.addEventListener("click", () => {
    if (page < Math.ceil(total / pageSize)) {
      page++;
      load();
    }
  });

  await load();

  // ===== Realtime: nghe SSE để tự refresh khi có đơn mới
  function connectSSE() {
    const tk = localStorage.getItem("adminToken") || "";
    const es = new EventSource(
      `/api/orders/stream?token=${encodeURIComponent(tk)}`
    );

    es.onmessage = async (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "new_order" && data?.order) {
          const st = statusSel.value;
          const okByFilter = !st || st === (data.order.status || "NEW");
          if (page === 1 && okByFilter) {
            await load();
          } else {
            pageInfo.textContent = pageInfo.textContent + " • Có đơn mới!";
          }
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
})();
// === Nhận message từ SW để focus đơn
navigator.serviceWorker?.addEventListener?.("message", async (ev) => {
  if (ev?.data?.type === "focus_order" && ev.data.orderId) {
    await ensureRowAndHighlight(ev.data.orderId);
  }
});

// === Nếu mở trang từ link ?focus=ID (khi click notif)
(async function handleFocusParam() {
  const params = new URLSearchParams(location.search);
  const id = params.get("focus");
  if (id) await ensureRowAndHighlight(id);
})();

// Tải lại trang (nếu đang không ở trang 1) rồi tìm và highlight
async function ensureRowAndHighlight(orderId) {
  // đơn mới luôn xuất hiện trang 1 → chuyển về trang 1 nếu cần
  if (page !== 1) {
    page = 1;
    await load();
  }

  highlightRow(orderId);

  // Nếu lúc đó chưa thấy (do filter), xoá filter và thử lại
  if (!document.querySelector(`tr td:first-child:textEquals("${orderId}")`)) {
    if (statusSel.value) {
      statusSel.value = "";
      await load();
    }
    highlightRow(orderId);
  }
}

// Helper: highlight một hàng theo id (CSS tối giản)
function highlightRow(orderId) {
  const rows = Array.from(tbl.querySelectorAll("tr"));
  const tr = rows.find(
    (r) => r.firstElementChild?.textContent.trim() === orderId
  );
  if (!tr) return;
  tr.scrollIntoView({ behavior: "smooth", block: "center" });
  tr.style.transition = "background-color 0.3s ease";
  tr.style.backgroundColor = "rgba(72,187,120,0.25)"; // xanh nhạt
  setTimeout(() => {
    tr.style.backgroundColor = "";
  }, 2000);
}

// Poly nhỏ: chọn td theo text chuẩn xác
(function addTextEqualsSelector() {
  if (CSS && CSS.registerProperty) {
    /* no-op */
  }
  // selector tuỳ biến: td:first-child:textEquals("ID")
  if (!Element.prototype.matchesTextEqualsPatched) {
    const proto = Element.prototype;
    const origMatches = proto.matches;
    proto.matches = function (sel) {
      if (sel.startsWith('td:first-child:textEquals("')) {
        const m = sel.match(/^td:first-child:textEquals\("(.+)"\)$/);
        if (m && this.matches("td:first-child")) {
          return (this.textContent || "").trim() === m[1];
        }
      }
      return origMatches.call(this, sel);
    };
    proto.matchesTextEqualsPatched = true;
  }
})();
