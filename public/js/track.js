// public/js/track.js
import { toast } from "./toast.js";
import { vnd, qs } from "./utils.js";
function confirmBox(message) {
  return new Promise((resolve) => {
    const box = document.getElementById("confirmBox");
    const msgEl = document.getElementById("confirmMessage");
    const yesBtn = document.getElementById("confirmYes");
    const noBtn = document.getElementById("confirmNo");

    msgEl.textContent = message;
    box.classList.remove("hidden");

    function cleanup(result) {
      box.classList.add("hidden");
      yesBtn.removeEventListener("click", onYes);
      noBtn.removeEventListener("click", onNo);
      resolve(result);
    }

    function onYes() {
      cleanup(true);
    }
    function onNo() {
      cleanup(false);
    }

    yesBtn.addEventListener("click", onYes);
    noBtn.addEventListener("click", onNo);
  });
}

/* ============== Helpers ============== */
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
  // Chỉ giữ A-Z a-z 0-9 _ -
  return (raw || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

function sanitizeTail(raw) {
  const d = (raw || "").replace(/\D/g, "");
  return d.slice(-4);
}

/* ============== API ============== */
async function lookup(id, phoneTail) {
  const q = new URLSearchParams({ id, phone: phoneTail });
  const r = await fetch("/api/orders/lookup?" + q.toString());
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/* ============== UI: paint status ============== */
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

  let pct = 0;
  if (status === "NEW") pct = 10;
  else if (status === "IN_PROGRESS") pct = 55;
  else if (status === "COMPLETED") pct = 100;

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
    } else {
      badge.classList.add("warn");
      badge.innerHTML = `<i data-lucide="x-circle"></i> Đã huỷ`;
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
      <td class="right">${vnd(amount)}</td>`;
    tb.appendChild(tr);
  }
}

/* ============== Refresh timer ============== */
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

/* ============== OTP helpers ============== */
function getOtpNodes() {
  const boxes = Array.from(document.querySelectorAll(".otp"));
  return boxes;
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

function validateInputs() {
  const idEl = qs("#orderId");
  const idWrap = qs("#idWrap");
  const idVal = sanitizeOrderId(idEl.value);
  const phoneVal = readOtpValue();

  idEl.value = idVal; // chuẩn hoá hiển thị
  const idOk = idVal.length >= 12 && idVal.length <= 24;
  const phoneOk = phoneVal.length === 4;

  idWrap.classList.toggle("error", !idOk);
  getOtpNodes().forEach((n) => n.classList.toggle("error", !phoneOk));

  return { idOk, phoneOk, idVal, phoneVal };
}

/* ============== Main runner ============== */
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

    // Guest actions
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
          toast.warning =
            toast.warning ||
            function (msg) {
              alert(msg);
            };
          toast.warning("Không huỷ được: " + (await r.text()));
          return;
        }
        toast.success =
          toast.success ||
          function (msg) {
            alert(msg);
          };
        toast.success("Đã huỷ đơn");
        run(true);
      });
      act.appendChild(btn);
    }
    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
    toast.error =
      toast.error ||
      function (msg) {
        alert(msg);
      };
    toast.error("Không tra cứu được: " + e.message);
  } finally {
    qs("#loading")?.classList.add("hidden");
    qs("#submitBtn")?.removeAttribute("disabled");
    qs("#refreshBtn")?.removeAttribute("disabled");
  }
}

/* ============== Boot ============== */
document.addEventListener("DOMContentLoaded", () => {
  const initId = getParam("orderId");
  const initPhone = getParam("phone");

  const idEl = qs("#orderId");
  const idWrap = qs("#idWrap");
  const idCounter = qs("#idCounter");
  const clearIdBtn = qs("#clearIdBtn");
  const pasteOtpBtn = qs("#pasteOtpBtn");

  // ===== ID field: live sanitize + counter + clear + paste
  const updateCounter = () => {
    const clean = sanitizeOrderId(idEl.value);
    if (idEl.value !== clean) idEl.value = clean;
    idCounter.textContent = `${clean.length}/24`;
    // trạng thái lỗi/ok realtime
    const ok = clean.length >= 12 && clean.length <= 24;
    idWrap.classList.toggle("error", !ok);
  };

  idEl.addEventListener("input", updateCounter);

  idEl.addEventListener("paste", (e) => {
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    const clean = sanitizeOrderId(txt);
    e.preventDefault();
    idEl.value = clean;
    updateCounter();
  });

  clearIdBtn.addEventListener("click", () => {
    idEl.value = "";
    updateCounter();
    idEl.focus();
  });

  // ===== OTP 4 ô: auto-advance, backspace, paste 4 số
  const otpNodes = getOtpNodes();

  otpNodes.forEach((box, idx) => {
    box.addEventListener("input", (e) => {
      // chỉ giữ số
      e.target.value = e.target.value.replace(/\D/g, "");
      // tự nhảy khi có số
      if (e.target.value && idx < otpNodes.length - 1) {
        otpNodes[idx + 1].focus();
        otpNodes[idx + 1].select?.();
      }
      validateInputs();
    });

    box.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && idx > 0) {
        otpNodes[idx - 1].focus();
      }
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

  pasteOtpBtn.addEventListener("click", async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const clean = sanitizeTail(txt);
      if (!clean) return;
      setOtpValue(clean);
      validateInputs();
    } catch {}
  });

  // Prefill từ query
  if (initId) idEl.value = sanitizeOrderId(initId);
  if (initPhone) setOtpValue(initPhone);
  updateCounter();
  validateInputs();

  const form = qs("#lookupForm");
  const refreshBtn = qs("#refreshBtn");

  // Copy mã đơn
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
      toast.info =
        toast.info ||
        function (msg) {
          alert(msg);
        };
      toast.info("Không thể sao chép, vui lòng chọn và copy thủ công.");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const { idOk, phoneOk, idVal, phoneVal } = validateInputs();
    if (!idOk || !phoneOk) {
      toast.warning =
        toast.warning ||
        function (msg) {
          alert(msg);
        };
      toast.warning(
        "Vui lòng nhập đúng Mã đơn (12–24 ký tự) và đủ 4 số cuối SĐT."
      );
      //
      // alert("Vui lòng nhập đúng Mã đơn (12–24 ký tự) và đủ 4 số cuối SĐT.");
      if (!idOk) idEl.focus();
      else otpNodes[0].focus();
      return;
    }

    currentId = idVal;
    currentTail = phoneVal;

    run(true);
    startIntervals();
    refreshBtn.removeAttribute("disabled");
  });

  refreshBtn?.addEventListener("click", () => {
    run(true);
    startIntervals();
  });

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
