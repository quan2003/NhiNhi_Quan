// public/js/track.js
import { vnd, qs } from "./utils.js";

function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name) || "";
}
function typeLabel(t) {
  return t === "DINE_IN"
    ? "Tại bàn"
    : t === "RESERVE"
    ? "Đặt trước"
    : "Mang đi";
}

async function lookup(id, phoneTail) {
  const q = new URLSearchParams({ id, phone: phoneTail });
  const r = await fetch("/api/orders/lookup?" + q.toString());
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function paintSteps(status) {
  const map = {
    NEW: ["st-new"],
    IN_PROGRESS: ["st-new", "st-prog"],
    COMPLETED: ["st-new", "st-prog", "st-done"],
    CANCELED: [],
  };
  const done = new Set(map[status] || []);
  ["st-new", "st-prog", "st-done"].forEach((id) => {
    const el = qs("#" + id);
    el.style.fontWeight = done.has(id) ? "700" : "400";
    el.style.opacity = done.has(id) ? "1" : ".6";
  });
}

let currentId = "",
  currentTail = "";

async function run() {
  try {
    const data = await lookup(currentId, currentTail);
    qs("#resultBox").classList.remove("hidden");
    qs("#r_id").textContent = data.id;
    qs("#r_name").textContent = data.customer?.name || "";
    qs("#r_phone").textContent = data.customer?.phoneMasked || "";
    qs("#r_type").textContent = typeLabel(data.meta?.orderType);
    qs("#r_sched").textContent = data.meta?.scheduleAt
      ? new Date(data.meta.scheduleAt).toLocaleString("vi-VN")
      : "—";
    qs("#r_table").textContent = data.meta?.tableNumber || "—";
    qs("#r_guests").textContent = data.meta?.guests || 0;
    qs("#r_time").textContent = new Date(data.createdAt).toLocaleString(
      "vi-VN"
    );
    qs("#r_pay").textContent =
      data.paymentMethod === "TRANSFER" ? "Chuyển khoản" : "COD";
    qs("#r_total").textContent = vnd(data.total);
    qs("#r_sub").textContent = vnd(data.subtotal || data.total);
    qs("#r_disc").textContent = "-" + vnd(data.discount || 0);
    qs("#r_items").textContent = JSON.stringify(data.items || [], null, 2);
    paintSteps(data.status);

    const act = qs("#guestActions");
    act.innerHTML = "";
    if (data.status === "NEW") {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Huỷ đơn";
      btn.addEventListener("click", async () => {
        if (!confirm("Bạn muốn huỷ đơn này?")) return;
        const q = new URLSearchParams({ phone: currentTail });
        const r = await fetch(
          `/api/orders/guest/${encodeURIComponent(currentId)}?` + q.toString(),
          { method: "DELETE" }
        );
        if (!r.ok) {
          alert("Không huỷ được: " + (await r.text()));
          return;
        }
        alert("Đã huỷ đơn");
        run();
      });
      act.appendChild(btn);
    }
  } catch (e) {
    alert("Không tra cứu được: " + e.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const initId = getParam("orderId");
  const initPhone = getParam("phone");
  if (initId) qs("#orderId").value = initId;
  if (initPhone) qs("#phoneTail").value = (initPhone || "").slice(-4);

  const form = qs("#lookupForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    currentId = qs("#orderId").value.trim();
    currentTail = qs("#phoneTail").value.trim().slice(-4);
    run();
    setInterval(run, 10000);
  });

  if (initId && initPhone) {
    currentId = initId;
    currentTail = (initPhone || "").slice(-4);
    run();
    setInterval(run, 10000);
  }
});
