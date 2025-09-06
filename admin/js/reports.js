(async function () {
  const btnDaily = document.getElementById("btnDaily");
  const btnMonthly = document.getElementById("btnMonthly");
  const year = document.getElementById("year");
  year.value = new Date().getFullYear();

  let dailyChart, monthlyChart, yearlyChart;

  function moneyAxis(label) {
    return {
      type: "linear",
      position: label === "left" ? "left" : "right",
      ticks: { callback: (v) => v.toLocaleString("vi-VN") + "₫" },
      grid: label === "right" ? { drawOnChartArea: false } : undefined,
    };
  }

  // Daily (line) — có 2 trục Y: tiền & số đơn
  function renderDaily(data) {
    const labels = data.items.map((x) => x.date);
    const revenue = data.items.map((x) => x.revenue);
    const profit = data.items.map((x) => x.profit);
    const cost = data.items.map((x) => x.cost);
    const orders = data.items.map((x) => x.orders);

    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(document.getElementById("dailyChart"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Doanh thu", data: revenue, yAxisID: "yMoney" },
          { label: "Chi phí", data: cost, yAxisID: "yMoney" },
          { label: "Lợi nhuận", data: profit, yAxisID: "yMoney" },
          { label: "Số đơn", data: orders, yAxisID: "yCount" },
        ],
      },
      options: {
        responsive: true,
        scales: {
          yMoney: moneyAxis("left"),
          yCount: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Monthly (bar + line số đơn)
  function renderMonthly(data) {
    const labels = data.items.map((x) => "T" + x.month);
    const revenue = data.items.map((x) => x.revenue);
    const cost = data.items.map((x) => x.cost);
    const profit = data.items.map((x) => x.profit);
    const orders = data.items.map((x) => x.orders);

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(document.getElementById("monthlyChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Doanh thu", data: revenue, yAxisID: "yMoney" },
          { label: "Chi phí", data: cost, yAxisID: "yMoney" },
          { label: "Lợi nhuận", data: profit, yAxisID: "yMoney" },
          { label: "Số đơn", data: orders, type: "line", yAxisID: "yCount" },
        ],
      },
      options: {
        responsive: true,
        scales: {
          yMoney: moneyAxis("left"),
          yCount: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Yearly (bar + line số đơn)
  function renderYearly(data) {
    const labels = data.items.map((x) => String(x.year));
    const revenue = data.items.map((x) => x.revenue);
    const profit = data.items.map((x) => x.profit);
    const orders = data.items.map((x) => x.orders);

    if (yearlyChart) yearlyChart.destroy();
    yearlyChart = new Chart(document.getElementById("yearlyChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Doanh thu", data: revenue, yAxisID: "yMoney" },
          { label: "Lợi nhuận", data: profit, yAxisID: "yMoney" },
          { label: "Số đơn", data: orders, type: "line", yAxisID: "yCount" },
        ],
      },
      options: {
        responsive: true,
        scales: {
          yMoney: moneyAxis("left"),
          yCount: {
            type: "linear",
            position: "right",
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  }

  // Nút xem theo ngày
  btnDaily.addEventListener("click", async () => {
    const from = document.getElementById("from").value;
    const to = document.getElementById("to").value;
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const data = await window.__adminFetch(
      "/api/reports/daily?" + q.toString()
    );
    renderDaily(data);
  });

  // Nút xem theo tháng
  btnMonthly.addEventListener("click", async () => {
    const data = await window.__adminFetch(
      "/api/reports/monthly?year=" + encodeURIComponent(year.value)
    );
    renderMonthly(data);
  });

  // Tải biểu đồ theo năm ngay khi mở trang
  (async () => {
    const data = await window.__adminFetch("/api/reports/yearly");
    renderYearly(data);
  })();
})();
