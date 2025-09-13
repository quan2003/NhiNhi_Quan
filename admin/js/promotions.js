// /admin/js/promotions.js
(async function () {
  const f = document.getElementById("promoForm");
  const enabled = document.getElementById("enabled");
  const percent = document.getElementById("percent");
  const start = document.getElementById("start");
  const end = document.getElementById("end");
  const saveBtn = document.getElementById("saveBtn");
  const clearTimeBtn = document.getElementById("clearTime");
  const statusChip = document.getElementById("statusChip");
  const scheduleNote = document.getElementById("scheduleNote");
  const toast = document.getElementById("toast");

  function showToast(msg, ms = 1600) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), ms);
  }

  function isoLocal(dt) {
    // convert datetime-local (no TZ) to ISO string
    if (!dt) return null;
    const d = new Date(dt);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }
  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtLocal(iso) {
    try {
      return new Date(iso).toLocaleString("vi-VN");
    } catch {
      return "";
    }
  }

  function updateChip(promo) {
    // promo: { enabled, percent, start, end }
    const now = Date.now();
    const inWindow =
      (!promo.start || new Date(promo.start).getTime() <= now) &&
      (!promo.end || new Date(promo.end).getTime() >= now);

    statusChip.classList.remove("ok", "warn", "off");
    if (!promo.enabled) {
      statusChip.classList.add("off");
      statusChip.textContent = "Đang tắt";
    } else if (promo.enabled && inWindow && (promo.percent || 0) > 0) {
      statusChip.classList.add("ok");
      statusChip.textContent = `Đang áp dụng · ${promo.percent}%`;
    } else {
      statusChip.classList.add("warn");
      statusChip.textContent = "Bật nhưng ngoài khung giờ";
    }

    const note =
      (promo.start ? `Từ: ${fmtLocal(promo.start)}` : "Không đặt bắt đầu") +
      " · " +
      (promo.end ? `Đến: ${fmtLocal(promo.end)}` : "Không đặt kết thúc");
    scheduleNote.textContent = note;
  }

  function clampPercent() {
    let v = Number(percent.value || 0);
    if (isNaN(v)) v = 0;
    if (v < 0) v = 0;
    if (v > 100) v = 100;
    percent.value = String(v);
  }

  async function load() {
    const s = await window.__adminFetch("/api/settings");
    const p = s?.promo || {};
    enabled.value = String(!!p.enabled);
    percent.value = p.percent || 0;
    start.value = toLocalInput(p.start);
    end.value = toLocalInput(p.end);
    updateChip({
      enabled: !!p.enabled,
      percent: Number(p.percent || 0),
      start: p.start || null,
      end: p.end || null,
    });
  }

  // Percent preset buttons
  document.querySelectorAll(".preset button[data-p]").forEach((btn) => {
    btn.addEventListener("click", () => {
      percent.value = btn.getAttribute("data-p");
      clampPercent();
    });
  });

  percent.addEventListener("change", clampPercent);
  percent.addEventListener("input", () => {
    // mobile: keep it clean while typing
    if (percent.value.length > 3) clampPercent();
  });

  clearTimeBtn?.addEventListener("click", () => {
    start.value = "";
    end.value = "";
  });

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    clampPercent();

    // Basic validations
    const pVal = Number(percent.value || 0);
    if (pVal <= 0 || pVal > 100) {
      showToast("Phần trăm phải trong khoảng 1–100%");
      percent.focus();
      return;
    }
    if (start.value && end.value) {
      const sTime = new Date(start.value).getTime();
      const eTime = new Date(end.value).getTime();
      if (isNaN(sTime) || isNaN(eTime) || eTime < sTime) {
        showToast("Khoảng thời gian không hợp lệ (kết thúc ≥ bắt đầu).");
        end.focus();
        return;
      }
    }

    const body = {
      promo: {
        enabled: enabled.value === "true",
        percent: pVal,
        start: isoLocal(start.value),
        end: isoLocal(end.value),
      },
    };

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Đang lưu...";
      await window.__adminFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      updateChip(body.promo);
      showToast("Đã lưu cấu hình khuyến mãi!");
    } catch (err) {
      showToast("Lỗi lưu cấu hình");
      console.error(err);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Lưu cấu hình";
    }
  });

  await load();
})();
