// admin/js/promotions.js
(async function () {
  const f = document.getElementById("promoForm");
  const enabled = document.getElementById("enabled");
  const percent = document.getElementById("percent");
  const start = document.getElementById("start");
  const end = document.getElementById("end");

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

  async function load() {
    const s = await window.__adminFetch("/api/settings");
    const p = s.promo || {};
    enabled.value = String(!!p.enabled);
    percent.value = p.percent || 0;
    start.value = toLocalInput(p.start);
    end.value = toLocalInput(p.end);
  }

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      promo: {
        enabled: enabled.value === "true",
        percent: Number(percent.value || 0),
        start: isoLocal(start.value),
        end: isoLocal(end.value),
      },
    };
    await window.__adminFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    alert("Đã lưu cấu hình khuyến mãi!");
  });

  await load();
})();
