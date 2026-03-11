const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const form = document.getElementById("add-form");
const msg = document.getElementById("form-msg");
const tableBody = document.querySelector("#expense-table tbody");

let dailyChart, monthChart;

document.querySelector('input[name="date"]').valueAsDate = new Date();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  msg.textContent = "";
  msg.classList.remove("err");
  try {
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "could not save");
    }
    form.reset();
    document.querySelector('input[name="date"]').valueAsDate = new Date();
    msg.textContent = "saved.";
    await refresh();
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add("err");
  }
});

async function refresh() {
  const res = await fetch("/api/expenses");
  const rows = await res.json();
  render(rows);
}

async function deleteRow(id) {
  if (!confirm("delete this expense?")) return;
  await fetch(`/api/expenses/${id}`, { method: "DELETE" });
  await refresh();
}

function monthKey(dateStr) { return dateStr.slice(0, 7); }

function groupByMonth(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = monthKey(r.date);
    m.set(k, (m.get(k) || 0) + r.amount);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

function groupByDay(rows) {
  const m = new Map();
  for (const r of rows) {
    m.set(r.date, (m.get(r.date) || 0) + r.amount);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

// fill missing days so the chart doesn't lie
function fillDays(daySeries) {
  if (daySeries.length === 0) return [];
  const out = [];
  const first = new Date(daySeries[0][0]);
  const last = new Date(daySeries[daySeries.length - 1][0]);
  const lookup = new Map(daySeries);
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push([key, lookup.get(key) || 0]);
  }
  return out;
}

function movingAverage(values, window) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
    out.push(Math.round(avg * 100) / 100);
  }
  return out;
}

function render(rows) {
  renderTable(rows);
  renderCharts(rows);
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5">no expenses yet.</td></tr>';
    return;
  }
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${escapeHtml(r.category)}</td>
      <td>${fmt.format(r.amount)}</td>
      <td>${escapeHtml(r.note || "")}</td>
      <td><button class="row-del" data-id="${r.id}">delete</button></td>
    `;
    tableBody.appendChild(tr);
  }
  tableBody.querySelectorAll(".row-del").forEach(b => {
    b.addEventListener("click", () => deleteRow(b.dataset.id));
  });
}

function renderCharts(rows) {
  const days = fillDays(groupByDay(rows));
  const dayLabels = days.map(([k]) => k);
  const dayValues = days.map(([, v]) => v);
  const movAvg = movingAverage(dayValues, 7);

  const monthData = groupByMonth(rows);
  const monthLabels = monthData.map(([k]) => k);
  const monthValues = monthData.map(([, v]) => v);

  const dailyCtx = document.getElementById("daily-chart");
  const monthCtx = document.getElementById("month-chart");

  if (dailyChart) dailyChart.destroy();
  if (monthChart) monthChart.destroy();

  dailyChart = new Chart(dailyCtx, {
    data: {
      labels: dayLabels,
      datasets: [
        {
          type: "bar",
          label: "daily spend",
          data: dayValues,
          backgroundColor: "rgba(47, 107, 94, 0.55)",
          borderRadius: 3
        },
        {
          type: "line",
          label: "7-day average",
          data: movAvg,
          borderColor: "#b94a3a",
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: chartOpts()
  });

  monthChart = new Chart(monthCtx, {
    type: "bar",
    data: {
      labels: monthLabels,
      datasets: [{
        label: "month total",
        data: monthValues,
        backgroundColor: "rgba(47, 107, 94, 0.7)",
        borderRadius: 4
      }]
    },
    options: chartOpts()
  });
}

function chartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { boxWidth: 12 } } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: v => "$" + v } },
      x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } }
    }
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

refresh();
