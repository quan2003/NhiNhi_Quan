// /admin/js/reports.js
// Chart.js v4, dùng __adminFetch (đã set x-admin-token) từ admin-common.js

(() => {
  const $ = (id) => document.getElementById(id);

  // Elements
  const btnDaily = $("btnDaily");
  const btnMonthly = $("btnMonthly");
  const year = $("year");
  const quickRanges = $("quickRanges");

  const dailyLoading = $("dailyLoading");
  const monthlyLoading = $("monthlyLoading");
  const yearlyLoading = $("yearlyLoading");

  const dailyEmpty = $("dailyEmpty");
  const monthlyEmpty = $("monthlyEmpty");
  const yearlyEmpty = $("yearlyEmpty");

  // KPI
  const kpiRevenue = $("kpiRevenue");
  const kpiCost = $("kpiCost");
  const kpiProfit = $("kpiProfit");
  const kpiOrders = $("kpiOrders");
  const kpiRevenueDelta = $("kpiRevenueDelta");
  const kpiCostDelta = $("kpiCostDelta");
  const kpiProfitDelta = $("kpiProfitDelta");
  const kpiOrdersDelta = $("kpiOrdersDelta");

  // Utils
  const showLoading = (el, on) => el && el.classList.toggle("show", !!on);
  const showEmpty = (el, on) => el && el.classList.toggle("show", !!on);
  const hasItems = (a) => Array.isArray(a) && a.length > 0;
  const vnd = (n) => (n ?? 0).toLocaleString("vi-VN") + "₫";

  // Dates helpers
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function rangeOf(key) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (key === "7") {
      const f = new Date(now);
      f.setDate(now.getDate() - 6);
      return { from: fmt(f), to: fmt(now) };
    }
    if (key === "30") {
      const f = new Date(now);
      f.setDate(now.getDate() - 29);
      return { from: fmt(f), to: fmt(now) };
    }
    if (key === "this-month") {
      return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) };
    }
    if (key === "prev-month") {
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) };
    }
    return {};
  }
  function prevPeriodOf({ from, to }) {
    // tạo kỳ trước có cùng số ngày, lùi về trước
    const f = new Date(from + "T00:00:00Z");
    const t = new Date(to + "T00:00:00Z");
    const days = Math.max(1, Math.round((t - f) / 86400000) + 1);
    const pTo = new Date(f);
    pTo.setDate(f.getDate() - 1);
    const pFrom = new Date(pTo);
    pFrom.setDate(pTo.getDate() - (days - 1));
    return { from: fmt(pFrom), to: fmt(pTo) };
  }

  // Chart instances
  let dailyChart, monthlyChart, yearlyChart;

  // Chart defaults
  Chart.defaults.color = "#e5e7eb";
  Chart.defaults.plugins.legend.position = "bottom";
  Chart.defaults.maintainAspectRatio = false;

  const COLORS = {
    revenue: "#22c55e",
    cost: "#ef4444",
    profit: "#f59e0b",
    orders: "#60a5fa",
  };

  const moneyAxis = (pos) => ({
    type: "linear",
    position: pos,
    ticks: { callback: (v) => v.toLocaleString("vi-VN") + "₫" },
    grid: { drawOnChartArea: pos === "left" },
  });
  const countAxis = (pos) => ({
    type: "linear",
    position: pos,
    ticks: { stepSize: 1, precision: 0 },
    grid: { drawOnChartArea: false },
  });

  // ===== KPI helpers =====
  function sumDaily(items) {
    return (items || []).reduce(
      (acc, x) => {
        acc.revenue += x.revenue || 0;
        acc.cost += x.cost || 0;
        acc.profit += x.profit ?? (x.revenue || 0) - (x.cost || 0);
        acc.orders += x.orders || 0;
        return acc;
      },
      { revenue: 0, cost: 0, profit: 0, orders: 0 }
    );
  }
  function pctDelta(cur, prev) {
    if (prev === undefined || prev === null) return "—";
    if (prev === 0) return cur === 0 ? "0%" : "+100%";
    const d = ((cur - prev) / prev) * 100;
    const sign = d > 0 ? "+" : "";
    return `${sign}${Math.round(d)}%`;
  }
  function updateKPI(curItems, prevItems) {
    const cur = sumDaily(curItems);
    const prev = sumDaily(prevItems);

    kpiRevenue.textContent = vnd(cur.revenue);
    kpiCost.textContent = vnd(cur.cost);
    kpiProfit.textContent = vnd(cur.profit);
    kpiOrders.textContent = String(cur.orders || 0);

    kpiRevenueDelta.textContent =
      "So với kỳ trước: " + pctDelta(cur.revenue, prev.revenue);
    kpiCostDelta.textContent =
      "So với kỳ trước: " + pctDelta(cur.cost, prev.cost);
    kpiProfitDelta.textContent =
      "So với kỳ trước: " + pctDelta(cur.profit, prev.profit);
    kpiOrdersDelta.textContent =
      "So với kỳ trước: " + pctDelta(cur.orders, prev.orders);
  }

  // ===== Renders =====
  function renderDaily(data) {
    const it = data?.items || [];
    showEmpty(dailyEmpty, !hasItems(it));
    if (!hasItems(it)) {
      dailyChart?.destroy();
      return;
    }
    dailyChart?.destroy();
    dailyChart = new Chart($("dailyChart"), {
      type: "line",
      data: {
        labels: it.map((x) => x.date),
        datasets: [
          {
            label: "Doanh thu",
            data: it.map((x) => x.revenue),
            borderColor: COLORS.revenue,
            yAxisID: "yMoney",
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
          {
            label: "Chi phí",
            data: it.map((x) => x.cost),
            borderColor: COLORS.cost,
            yAxisID: "yMoney",
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
          {
            label: "Lợi nhuận",
            data: it.map((x) => x.profit),
            borderColor: COLORS.profit,
            yAxisID: "yMoney",
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
          {
            label: "Số đơn",
            data: it.map((x) => x.orders),
            borderColor: COLORS.orders,
            yAxisID: "yCount",
            fill: false,
            tension: 0.25,
            pointRadius: 3,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        interaction: { mode: "index", intersect: false },
        plugins: {
          tooltip: {
            backgroundColor: "rgba(0,0,0,.8)",
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${
                  ctx.dataset.yAxisID === "yMoney"
                    ? vnd(ctx.parsed.y)
                    : ctx.parsed.y
                }`,
            },
          },
        },
        scales: { yMoney: moneyAxis("left"), yCount: countAxis("right") },
        animation: { duration: 750, easing: "easeOutQuart" },
      },
    });
  }

  function renderMonthly(data) {
    const it = data?.items || [];
    showEmpty(monthlyEmpty, !hasItems(it));
    if (!hasItems(it)) {
      monthlyChart?.destroy();
      return;
    }
    monthlyChart?.destroy();
    monthlyChart = new Chart($("monthlyChart"), {
      type: "bar",
      data: {
        labels: it.map((x) => "T" + x.month),
        datasets: [
          {
            label: "Doanh thu",
            data: it.map((x) => x.revenue),
            backgroundColor: COLORS.revenue,
            yAxisID: "yMoney",
          },
          {
            label: "Chi phí",
            data: it.map((x) => x.cost),
            backgroundColor: COLORS.cost,
            yAxisID: "yMoney",
          },
          {
            label: "Lợi nhuận",
            data: it.map((x) => x.profit),
            backgroundColor: COLORS.profit,
            yAxisID: "yMoney",
          },
          {
            label: "Số đơn",
            data: it.map((x) => x.orders),
            type: "line",
            borderColor: COLORS.orders,
            yAxisID: "yCount",
            tension: 0.25,
            pointRadius: 3,
            pointHoverRadius: 6,
            fill: false,
          },
        ],
      },
      options: {
        scales: { yMoney: moneyAxis("left"), yCount: countAxis("right") },
        animation: { duration: 750, easing: "easeOutQuart" },
      },
    });
  }

  function renderYearly(data) {
    const it = data?.items || [];
    showEmpty(yearlyEmpty, !hasItems(it));
    if (!hasItems(it)) {
      yearlyChart?.destroy();
      return;
    }
    yearlyChart?.destroy();
    yearlyChart = new Chart($("yearlyChart"), {
      type: "bar",
      data: {
        labels: it.map((x) => String(x.year)),
        datasets: [
          {
            label: "Doanh thu",
            data: it.map((x) => x.revenue),
            backgroundColor: COLORS.revenue,
            yAxisID: "yMoney",
          },
          {
            label: "Lợi nhuận",
            data: it.map((x) => x.profit),
            backgroundColor: COLORS.profit,
            yAxisID: "yMoney",
          },
          {
            label: "Số đơn",
            data: it.map((x) => x.orders),
            type: "line",
            borderColor: COLORS.orders,
            yAxisID: "yCount",
            tension: 0.25,
            pointRadius: 3,
            pointHoverRadius: 6,
            fill: false,
          },
        ],
      },
      options: {
        scales: { yMoney: moneyAxis("left"), yCount: countAxis("right") },
        animation: { duration: 750, easing: "easeOutQuart" },
      },
    });
  }

  // ===== Fetchers =====
  async function fetchDaily(range) {
    const q = new URLSearchParams(range).toString();
    showLoading(dailyLoading, true);
    try {
      return await window.__adminFetch(`/api/reports/daily?${q}`);
    } finally {
      showLoading(dailyLoading, false);
    }
  }
  async function fetchMonthly(y) {
    showLoading(monthlyLoading, true);
    try {
      return await window.__adminFetch(
        `/api/reports/monthly?year=${encodeURIComponent(y)}`
      );
    } finally {
      showLoading(monthlyLoading, false);
    }
  }
  async function fetchYearly() {
    showLoading(yearlyLoading, true);
    try {
      return await window.__adminFetch(`/api/reports/yearly`);
    } finally {
      showLoading(yearlyLoading, false);
    }
  }

  // ===== Actions =====
  function setActiveChip(el) {
    document
      .querySelectorAll("#quickRanges .chip")
      .forEach((c) => c.classList.remove("active"));
    el?.classList.add("active");
  }
  quickRanges?.addEventListener("click", async (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;

    // cập nhật trạng thái hiển thị
    setActiveChip(b);

    const r = rangeOf(b.dataset.range);
    document.getElementById("from").value = r.from || "";
    document.getElementById("to").value = r.to || "";

    try {
      showLoading(dailyLoading, true);
      const data = await window.__adminFetch(
        "/api/reports/daily?" + new URLSearchParams(r).toString()
      );
      renderDaily(data);
      if (!hasItems(data?.items))
        showToast("Không có dữ liệu trong khoảng thời gian này.");
    } catch (e) {
      console.error("Daily quick-range error:", e);
      toggleEmpty(dailyEmpty, true);
      showToast("Lỗi khi tải dữ liệu báo cáo theo ngày.");
    } finally {
      showLoading(dailyLoading, false);
    }
  });
  // default date inputs = 7 ngày
  (function setDefaultDates() {
    const r = rangeOf("7");
    $("from").value = r.from;
    $("to").value = r.to;
    setActiveChip(document.querySelector('#quickRanges .chip[data-range="7"]'));
  })();

  // năm mặc định
  year.value = new Date().getFullYear();

  // load init (daily+monthly+yearly) + KPI
  (async () => {
    try {
      const r = { from: $("from").value, to: $("to").value };
      const prevR = prevPeriodOf(r);
      const [d, prevD, m, y] = await Promise.all([
        fetchDaily(r),
        fetchDaily(prevR),
        fetchMonthly(year.value),
        fetchYearly(),
      ]);
      renderDaily(d);
      updateKPI(d.items, prevD.items);
      renderMonthly(m);
      renderYearly(y);
    } catch (e) {
      console.error("Init reports error:", e);
      showEmpty(dailyEmpty, true);
      showEmpty(monthlyEmpty, true);
      showEmpty(yearlyEmpty, true);
    }
  })();

  // Theo ngày: nút Xem
  btnDaily.addEventListener("click", async () => {
    const r = { from: $("from").value, to: $("to").value };
    const prevR = prevPeriodOf(r);
    try {
      const [d, prevD] = await Promise.all([fetchDaily(r), fetchDaily(prevR)]);
      renderDaily(d);
      updateKPI(d.items, prevD.items);
    } catch (e) {
      console.error("Daily error:", e);
      showEmpty(dailyEmpty, true);
    }
  });

  // Theo ngày: chips nhanh
  quickRanges?.addEventListener("click", async (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    setActiveChip(b);
    const r = rangeOf(b.dataset.range);
    $("from").value = r.from || "";
    $("to").value = r.to || "";
    const prevR = prevPeriodOf(r);
    try {
      const [d, prevD] = await Promise.all([fetchDaily(r), fetchDaily(prevR)]);
      renderDaily(d);
      updateKPI(d.items, prevD.items);
    } catch (e) {
      console.error("Daily quick-range error:", e);
      showEmpty(dailyEmpty, true);
    }
  });

  // Theo tháng
  btnMonthly.addEventListener("click", async () => {
    try {
      const m = await fetchMonthly(year.value);
      renderMonthly(m);
    } catch (e) {
      console.error("Monthly error:", e);
      showEmpty(monthlyEmpty, true);
    }
  });
})();
