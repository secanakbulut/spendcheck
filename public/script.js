// spendcheck frontend
// nothing too clever, just enough to be useful

const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const form = document.getElementById("add-form");
const msg = document.getElementById("form-msg");
const tableBody = document.querySelector("#expense-table tbody");

let dailyChart, monthChart;

// default the date input to today
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

// ---- math ----

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

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

// fill in missing days between min and max so the chart is honest
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

// least-squares linear regression
// slope = (n*Sxy - Sx*Sy) / (n*Sxx - Sx*Sx)
// intercept = (Sy - slope*Sx) / n
function linearRegression(ys) {
  const n = ys.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = ys[i];
    sx += x; sy += y; sxy += x * y; sxx += x * x;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function flagOutliers(rows) {
  // group amounts by category, flag if > mean + 2*sd
  const byCat = new Map();
  for (const r of rows) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r.amount);
  }
  const stats = new Map();
  for (const [cat, arr] of byCat) {
    if (arr.length < 3) { stats.set(cat, null); continue; }
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const sd = stdDev(arr);
    stats.set(cat, { mean, sd });
  }
  return rows.map(r => {
    const s = stats.get(r.category);
    const flagged = s && r.amount > s.mean + 2 * s.sd;
    return { ...r, flagged: !!flagged };
  });
}

// ---- render ----

function render(rows) {
  const flagged = flagOutliers(rows);
  renderTable(flagged);
  renderStats(rows);
  renderCharts(rows);
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  if (rows.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="hint">no expenses yet.</td></tr>';
    return;
  }
  for (const r of rows) {
    const tr = document.createElement("tr");
    if (r.flagged) tr.classList.add("flag");
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

function renderStats(rows) {
  const months = groupByMonth(rows);
  const totals = months.map(([, v]) => v);
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = months.find(([k]) => k === thisMonthKey);
  document.getElementById("stat-month").textContent = thisMonth ? fmt.format(thisMonth[1]) : fmt.format(0);

  const sd = stdDev(totals);
  document.getElementById("stat-std").textContent = totals.length >= 2 ? fmt.format(sd) : "--";

  const reg = linearRegression(totals);
  const forecastEl = document.getElementById("stat-forecast");
  const hintEl = document.getElementById("stat-forecast-hint");
  if (reg && totals.length >= 2) {
    const next = reg.slope * totals.length + reg.intercept;
    forecastEl.textContent = fmt.format(Math.max(0, next));
    const dir = reg.slope > 0 ? "trending up" : reg.slope < 0 ? "trending down" : "flat";
    hintEl.textContent = `${dir}, slope ${reg.slope.toFixed(2)}/mo`;
  } else {
    forecastEl.textContent = "--";
    hintEl.textContent = "need at least 2 months";
  }
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
