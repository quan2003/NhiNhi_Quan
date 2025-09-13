// public/js/track.js
// ESM module
import { toast } from "./toast.js";
import { vnd, qs } from "./utils.js";

/* ================== Confirm modal (no alert/confirm) ================== */
function confirmBox(message) {
  return new Promise((resolve) => {
    const box = document.getElementById("confirmBox");
    const msgEl = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");

    if (!box || !msgEl || !yesBtn || !noBtn) {
      const ok = window.confirm(message);
      resolve(ok);
      return;
    }

    msgEl.textContent = message;
    box.classList.remove("hidden");

    function cleanup(result) {
      box.classList.add("hidden");
      yesBtn.removeEventListener("click", onYes);
      yesBtn.removeEventListener("keydown", onYesKey);
      noBtn.removeEventListener("click", onNo);
      noBtn.removeEventListener("keydown", onNoKey);
      resolve(result);
    }
    function onYes(e) {
      e?.preventDefault?.();
      cleanup(true);
    }
    function onNo(e) {
      e?.preventDefault?.();
      cleanup(false);
    }
    function onYesKey(e) {
      if (e.key === "Enter") onYes(e);
      if (e.key === "Escape") onNo(e);
    }
    function onNoKey(e) {
      if (e.key === "Enter") onNo(e);
      if (e.key === "Escape") onNo(e);
    }

    yesBtn.addEventListener("click", onYes);
    yesBtn.addEventListener("keydown", onYesKey);
    noBtn.addEventListener("click", onNo);
    noBtn.addEventListener("keydown", onNoKey);
    yesBtn.focus();
  });
}

/* ================== Alert (one-button) ================== */
function alertBox(message) {
  return new Promise((resolve) => {
    const box = document.getElementById("confirmBox");
    const msgEl = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");

    if (!box || !msgEl || !yesBtn) {
      window.alert(message);
      return resolve();
    }

    const prevYesText = yesBtn.textContent;
    const prevNoDisplay = noBtn?.style?.display;

    msgEl.textContent = message;
    yesBtn.textContent = "Đã hiểu";
    if (noBtn) noBtn.style.display = "none";

    function cleanup() {
      box.classList.add("hidden");
      yesBtn.textContent = prevYesText;
      if (noBtn) noBtn.style.display = prevNoDisplay || "";
      yesBtn.removeEventListener("click", onOk);
      yesBtn.removeEventListener("keydown", onKey);
      resolve();
    }
    function onOk(e) {
      e?.preventDefault?.();
      cleanup();
    }
    function onKey(e) {
      if (e.key === "Enter" || e.key === "Escape") onOk(e);
    }

    box.classList.remove("hidden");
    yesBtn.addEventListener("click", onOk);
    yesBtn.addEventListener("keydown", onKey);
    yesBtn.focus();
  });
}

/* ================== Helpers ================== */
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
function sanitizeOrderId(raw) {
  return (raw || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}
function sanitizeTail(raw) {
  const d = (raw || "").replace(/\D/g, "");
  return d.slice(-4);
}

/* ================== API ================== */
async function lookup(id, phoneTail) {
  const q = new URLSearchParams({ id, phone: phoneTail });
  const r = await fetch("/api/orders/lookup?" + q.toString());
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function lookupByPhone(phoneTailOrFull, days = 7) {
  const q = new URLSearchParams({ phone: phoneTailOrFull, days: String(days) });
  const r = await fetch("/api/orders/phone?" + q.toString());
  if (!r.ok) throw new Error(await r.text());
  return r.json(); // { items: [...] }
}

/* ================== Paint status ================== */
function paintSteps(status) {
  const done =
    {
      NEW: ["st-new"],
      IN_PROGRESS: ["st-new", "st-prog"],
      COMPLETED: ["st-new", "st-prog", "st-done"],
    }[status] || [];

  ["st-new", "st-prog", "st-done"].forEach((id) => {
    const el = qs("#" + id);
    if (!el) return;
    el.classList.toggle("done", done.includes(id));
    el.style.opacity = done.includes(id) ? "1" : ".6";
  });

  const fill = qs("#progressFill");
  const bar = qs("#statusBar");
  const runner = qs("#progressRunner");
  let pct =
    status === "NEW"
      ? 10
      : status === "IN_PROGRESS"
      ? 55
      : status === "COMPLETED"
      ? 100
      : 0;

  if (fill) fill.style.width = pct + "%";

  if (runner) {
    if (status === "COMPLETED") {
      runner.classList.remove("moving");
      runner.innerHTML = `<i data-lucide="check-circle-2"></i>`;
      bar?.classList.remove("moving");
    } else {
      runner.innerHTML = `<i data-lucide="shopping-cart"></i>`;
      if (status === "IN_PROGRESS") {
        runner.classList.add("moving");
        bar?.classList.add("moving");
      } else {
        runner.classList.remove("moving");
        bar?.classList.remove("moving");
      }
    }
    const safePct = Math.min(99, Math.max(1, pct));
    runner.style.left = safePct + "%";
  }

  const badge = qs("#statusBadge");
  if (badge) {
    badge.classList.remove("info", "success", "warn");
    if (status === "COMPLETED") {
      badge.classList.add("success");
      badge.innerHTML = `<i data-lucide="check-circle-2"></i> Đã hoàn tất`;
    } else if (status === "IN_PROGRESS") {
      badge.classList.add("info");
      badge.innerHTML = `<i data-lucide="chef-hat"></i> Đang chế biến`;
    } else if (status === "NEW") {
      badge.classList.add("warn");
      badge.innerHTML = `<i data-lucide="clock"></i> Mới tạo`;
    } else if (status === "CANCELED") {
      badge.classList.add("warn");
      badge.innerHTML = `<i data-lucide="x-circle"></i> Đã huỷ`;
    } else {
      badge.classList.add("warn");
      badge.textContent = `Trạng thái: ${status || "—"}`;
    }
  }
  if (window.lucide) window.lucide.createIcons();
}

function setPayBadge(method) {
  const pay = qs("#payBadge");
  const label = method === "TRANSFER" ? "Chuyển khoản" : "Tiền mặt/COD";
  if (pay) {
    pay.classList.toggle("success", method === "TRANSFER");
    pay.classList.toggle("warn", method !== "TRANSFER");
    pay.innerHTML = `<i data-lucide="credit-card"></i> ${label}`;
    if (window.lucide) window.lucide.createIcons();
  }
}

function resolveUnitPrice(it) {
  return Number(
    it.unitPrice ??
      it.price ??
      it.priceSell ??
      it.product?.unitPrice ??
      it.product?.price ??
      it.product?.priceSell ??
      0
  );
}
function resolveAmount(it, qty, price) {
  return Number(it.amount ?? it.total ?? qty * price);
}
function renderItems(items = []) {
  const tb = qs("#itemsTbody");
  if (!tb) return;
  tb.innerHTML = "";
  if (!items.length) {
    tb.innerHTML = `<tr><td colspan="4" class="muted">Chưa có món.</td></tr>`;
    return;
  }
  for (const it of items) {
    const tr = document.createElement("tr");
    const name = it.name || it.productName || it.product?.name || "Món";
    const qty = Number(it.qty ?? it.quantity ?? 1);
    const price = resolveUnitPrice(it);
    const amount = resolveAmount(it, qty, price);
    tr.innerHTML = `
      <td>${name}</td>
      <td class="right">${qty}</td>
      <td class="right">${vnd(price)}</td>
      <td class="right">${vnd(amount)}</td>
    `;
    tb.appendChild(tr);
  }
}

/* ================== Refresh timer ================== */
let currentId = "",
  currentTail = "";
let refreshInterval = null,
  countdownInterval = null,
  counter = 10;
const REFRESH_MS = 10000;

function stopIntervals() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
function startIntervals() {
  stopIntervals();
  counter = REFRESH_MS / 1000;
  const cdEl = qs("#countdown");
  if (cdEl) cdEl.textContent = counter;
  refreshInterval = setInterval(() => run(), REFRESH_MS);
  countdownInterval = setInterval(() => {
    counter = counter <= 1 ? REFRESH_MS / 1000 : counter - 1;
    if (cdEl) cdEl.textContent = counter;
  }, 1000);
}

/* ================== OTP helpers ================== */
function getOtpNodes() {
  return Array.from(document.querySelectorAll(".otp"));
}
function readOtpValue() {
  return getOtpNodes()
    .map((n) => (n.value || "").replace(/\D/g, ""))
    .join("")
    .slice(0, 4);
}
function setOtpValue(str) {
  const digits = (str || "").replace(/\D/g, "").slice(0, 4).split("");
  const nodes = getOtpNodes();
  nodes.forEach((n, i) => (n.value = digits[i] || ""));
  if (nodes[digits.length]) nodes[digits.length].focus();
}

/* ================== Validation & Results list ================== */
function validateInputs() {
  const idEl = qs("#orderId");
  const idWrap = qs("#idWrap");
  const idVal = sanitizeOrderId(idEl?.value || "");
  if (idEl) idEl.value = idVal;

  const phoneVal = readOtpValue();
  const idOk = idVal.length >= 12 && idVal.length <= 24;
  const phoneOk = phoneVal.length === 4;
  const formOk = (idOk && phoneOk) || (!idVal && phoneOk);

  idWrap?.classList.toggle("error", !!idVal && !idOk);
  getOtpNodes().forEach((n) => n.classList.toggle("error", !phoneOk));
  return { idOk, phoneOk, idVal, phoneVal, formOk };
}

// status → lớp & icon
function statusStyle(status) {
  switch (status) {
    case "COMPLETED":
      return { cls: "success", icon: "check-circle-2", text: "Hoàn tất" };
    case "IN_PROGRESS":
      return { cls: "warn", icon: "chef-hat", text: "Đang làm" };
    case "CANCELED":
      return { cls: "danger", icon: "x-circle", text: "Đã huỷ" };
    default:
      return { cls: "outline", icon: "clock", text: "Mới" };
  }
}

// Hiển thị danh sách đơn theo SĐT
async function renderPhoneResults(list, last4) {
  const box = qs("#resultBox");
  box?.classList.remove("hidden");
  const title = qs("#statusBadge");
  if (title) {
    title.classList.remove("success", "warn");
    title.classList.add("info");
    title.innerHTML = `<i data-lucide="list"></i> Chọn đơn cần xem`;
  }

  // reset vùng chi tiết cũ
  qs("#r_id").textContent = "";
  qs("#r_name").textContent = "";
  qs("#r_phone").textContent = "";
  qs("#r_type").textContent = "";
  qs("#r_sched").textContent = "—";
  qs("#r_table").textContent = "—";
  qs("#r_guests").textContent = "0";
  qs("#r_time").textContent = "—";
  qs("#r_total").textContent = vnd(0);
  qs("#r_sub").textContent = vnd(0);
  qs("#r_disc").textContent = "-" + vnd(0);
  qs(
    "#itemsTbody"
  ).innerHTML = `<tr><td colspan="4" class="muted">Chọn 1 đơn để xem chi tiết.</td></tr>`;

  const wrap = qs("#guestActions");
  if (!wrap) return;
  wrap.innerHTML = "";

  const listEl = document.createElement("div");
  listEl.className = "order-list";
  wrap.appendChild(listEl);

  if (!list?.length) {
    await alertBox(
      "Không tìm thấy đơn nào khớp 4 số SĐT trong 7 ngày gần đây."
    );
    listEl.innerHTML = `<div class="muted">Không có đơn phù hợp.</div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  list.forEach((o) => {
    const st = statusStyle(o.status);
    const when = new Date(o.createdAt).toLocaleString("vi-VN");
    const type = typeLabel(o.meta?.orderType);

    const href = `/track.html?orderId=${encodeURIComponent(
      o.id
    )}&phone=${encodeURIComponent(last4)}`;
    const chip = document.createElement("a");
    chip.className = `order-chip ${st.cls}`;
    chip.href = href;
    chip.rel = "noopener";
    chip.innerHTML = `
      <div class="chip-icon"><i data-lucide="${st.icon}"></i></div>
      <div class="chip-body">
        <div class="chip-id">${o.id}</div>
        <div class="chip-meta">${when} · ${type} · ${
      o.customer?.phoneMasked || ""
    }</div>
      </div>
      <div class="chip-amt">${vnd(Number(o.total || 0))}</div>
    `;
    listEl.appendChild(chip);
  });

  if (window.lucide) window.lucide.createIcons();
}

/* ================== Main runner ================== */
async function run(showLoading = false) {
  try {
    if (showLoading) {
      qs("#loading")?.classList.remove("hidden");
      qs("#submitBtn")?.setAttribute("disabled", "disabled");
      qs("#refreshBtn")?.setAttribute("disabled", "disabled");
    }

    const data = await lookup(currentId, currentTail);

    qs("#resultBox")?.classList.remove("hidden");
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
    qs("#r_total").textContent = vnd(Number(data.total || 0));
    qs("#r_sub").textContent = vnd(Number(data.subtotal ?? data.total ?? 0));
    qs("#r_disc").textContent = "-" + vnd(Number(data.discount || 0));

    setPayBadge(data.paymentMethod);
    paintSteps(data.status);
    renderItems(data.items || []);

    const act = qs("#guestActions");
    act.innerHTML = "";
    if (data.status === "NEW") {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.innerHTML = `<i data-lucide="x"></i> Huỷ đơn`;
      btn.addEventListener("click", async () => {
        if (!(await confirmBox("Bạn muốn huỷ đơn này?"))) return;

        btn.setAttribute("disabled", "disabled");
        const q = new URLSearchParams({ phone: currentTail });
        const r = await fetch(
          `/api/orders/guest/${encodeURIComponent(currentId)}?` + q.toString(),
          { method: "DELETE" }
        );
        btn.removeAttribute("disabled");
        if (!r.ok) {
          (
            toast.warning ||
            ((msg) => {
              alert(msg);
            })
          )("Không huỷ được: " + (await r.text()));
          return;
        }
        (
          toast.success ||
          ((msg) => {
            alert(msg);
          })
        )("Đã huỷ đơn");
        run(true);
      });
      act.appendChild(btn);
    }
    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
    (
      toast.error ||
      ((msg) => {
        alert(msg);
      })
    )("Không tra cứu được: " + e.message);
  } finally {
    qs("#loading")?.classList.add("hidden");
    qs("#submitBtn")?.removeAttribute("disabled");
    qs("#refreshBtn")?.removeAttribute("disabled");
  }
}

/* ================== Boot ================== */
document.addEventListener("DOMContentLoaded", () => {
  const initId = getParam("orderId");
  const initPhone = getParam("phone");

  const idEl = qs("#orderId");
  const idWrap = qs("#idWrap");
  const idCounter = qs("#idCounter");
  const clearIdBtn = qs("#clearIdBtn");
  const pasteOtpBtn = qs("#pasteOtpBtn");

  // counter + sanitize + error state
  const updateCounter = () => {
    const clean = sanitizeOrderId(idEl.value);
    if (idEl.value !== clean) idEl.value = clean;
    if (idCounter) idCounter.textContent = `${clean.length}/24`;
    const ok = clean.length >= 12 && clean.length <= 24;
    idWrap?.classList.toggle("error", !!clean && !ok);
  };

  idEl.addEventListener("input", updateCounter);
  idEl.addEventListener("paste", (e) => {
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    const clean = sanitizeOrderId(txt);
    e.preventDefault();
    idEl.value = clean;
    updateCounter();
  });
  clearIdBtn?.addEventListener("click", () => {
    idEl.value = "";
    updateCounter();
    idEl.focus();
  });

  // OTP 4 ô
  const otpNodes = getOtpNodes();
  otpNodes.forEach((box, idx) => {
    box.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "");
      if (e.target.value && idx < otpNodes.length - 1) {
        otpNodes[idx + 1].focus();
        otpNodes[idx + 1].select?.();
      }
      validateInputs();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0)
        otpNodes[idx - 1].focus();
      if (e.key === "ArrowLeft" && idx > 0) otpNodes[idx - 1].focus();
      if (e.key === "ArrowRight" && idx < otpNodes.length - 1)
        otpNodes[idx + 1].focus();
    });
    box.addEventListener("paste", (e) => {
      const txt = (e.clipboardData || window.clipboardData).getData("text");
      const clean = sanitizeTail(txt);
      if (clean.length >= 2) {
        e.preventDefault();
        setOtpValue(clean);
        validateInputs();
      }
    });
  });

  pasteOtpBtn?.addEventListener("click", async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const clean = sanitizeTail(txt);
      if (!clean) return;
      setOtpValue(clean);
      validateInputs();
    } catch {}
  });

  // prefill from query
  if (initId) idEl.value = sanitizeOrderId(initId);
  if (initPhone) setOtpValue(initPhone);
  updateCounter();
  validateInputs();

  const form = qs("#lookupForm");
  const refreshBtn = qs("#refreshBtn");

  // copy mã đơn
  const copyBtn = qs("#copyIdBtn");
  copyBtn?.addEventListener("click", async () => {
    const id = qs("#r_id")?.textContent?.trim();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      copyBtn.innerHTML = `<i data-lucide="check"></i>`;
      setTimeout(() => {
        copyBtn.innerHTML = `<i data-lucide="copy"></i>`;
        if (window.lucide) window.lucide.createIcons();
      }, 1200);
      if (window.lucide) window.lucide.createIcons();
    } catch {
      (
        toast.info ||
        ((msg) => {
          alert(msg);
        })
      )("Không thể sao chép, vui lòng chọn và copy thủ công.");
    }
  });

  // Submit: cho phép bỏ trống mã đơn
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const { idOk, phoneOk, idVal, phoneVal, formOk } = validateInputs();
    if (!formOk) {
      (
        toast.warning ||
        ((msg) => {
          alert(msg);
        })
      )("Vui lòng nhập đủ 4 số cuối SĐT (Mã đơn có thể bỏ trống).");
      if (!phoneOk) otpNodes[0]?.focus();
      return;
    }

    // Có mã đơn → flow chi tiết
    if (idOk) {
      currentId = idVal;
      currentTail = phoneVal;
      run(true);
      startIntervals();
      refreshBtn?.removeAttribute("disabled");
      return;
    }

    // Không có mã đơn → tra cứu theo 4 số SĐT
    try {
      qs("#loading")?.classList.remove("hidden");
      qs("#submitBtn")?.setAttribute("disabled", "disabled");
      const data = await lookupByPhone(phoneVal, 7);
      await renderPhoneResults(data.items || [], phoneVal);
    } catch (err) {
      (
        toast.error ||
        ((msg) => {
          alert(msg);
        })
      )("Không tra cứu được theo SĐT: " + err.message);
    } finally {
      qs("#loading")?.classList.add("hidden");
      qs("#submitBtn")?.removeAttribute("disabled");
    }
  });

  // làm mới
  refreshBtn?.addEventListener("click", () => {
    run(true);
    startIntervals();
  });

  // Auto-run nếu có đủ query
  if (initId && initPhone) {
    currentId = sanitizeOrderId(initId);
    currentTail = sanitizeTail(initPhone);
    idEl.value = currentId;
    setOtpValue(currentTail);
    run(true);
    startIntervals();
    refreshBtn?.removeAttribute("disabled");
  }

  if (window.lucide) window.lucide.createIcons();
});
