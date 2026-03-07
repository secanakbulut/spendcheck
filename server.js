import express from "express";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
const DATA_FILE = join(DATA_DIR, "expenses.json");

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// tiny json store. nothing fancy.
async function loadAll() {
  if (!existsSync(DATA_FILE)) return [];
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("could not read store, starting empty", e.message);
    return [];
  }
}

async function saveAll(rows) {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(rows, null, 2));
}

function makeId() {
  // good enough for a local file store
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

app.get("/api/expenses", async (_req, res) => {
  const rows = await loadAll();
  rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  res.json(rows);
});

app.post("/api/expenses", async (req, res) => {
  const { amount, category, date, note } = req.body || {};
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!category || typeof category !== "string") {
    return res.status(400).json({ error: "category required" });
  }
  if (!date || isNaN(Date.parse(date))) {
    return res.status(400).json({ error: "date must be a valid date" });
  }
  const row = {
    id: makeId(),
    amount: Math.round(amt * 100) / 100,
    category: category.trim().toLowerCase(),
    date: new Date(date).toISOString().slice(0, 10),
    note: (note || "").toString().slice(0, 200),
    createdAt: new Date().toISOString()
  };
  const rows = await loadAll();
  rows.push(row);
  await saveAll(rows);
  res.status(201).json(row);
});

app.delete("/api/expenses/:id", async (req, res) => {
  const rows = await loadAll();
  const next = rows.filter(r => r.id !== req.params.id);
  if (next.length === rows.length) return res.status(404).json({ error: "not found" });
  await saveAll(next);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`spendcheck running at http://localhost:${PORT}`);
});
