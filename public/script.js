const fmt = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const form = document.getElementById("add-form");
const msg = document.getElementById("form-msg");
const tableBody = document.querySelector("#expense-table tbody");

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
  renderTable(rows);
}

async function deleteRow(id) {
  if (!confirm("delete this expense?")) return;
  await fetch(`/api/expenses/${id}`, { method: "DELETE" });
  await refresh();
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

refresh();
