const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ──────────────────────────────────────────────────────────────────
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── Track visit ───────────────────────────────────────────────────────────────
app.post('/api/visit', (req, res) => {
  const db = readDB();
  db.stats.visits++;
  writeDB(db);
  res.json({ ok: true });
});

// ── Track CTA click ───────────────────────────────────────────────────────────
app.post('/api/click', (req, res) => {
  const db = readDB();
  db.stats.clicks++;
  writeDB(db);
  res.json({ ok: true });
});

// ── Get page config ───────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const db = readDB();
  res.json({ page: db.configs.page, fields: db.configs.fields, whatsappUrl: db.configs.whatsappUrl });
});

// ── Save lead + submission ────────────────────────────────────────────────────
app.post('/api/submit', (req, res) => {
  const db = readDB();
  const lead = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...req.body
  };
  db.leads.push(lead);
  db.stats.submissions++;
  writeDB(db);
  res.json({ ok: true, whatsappUrl: db.configs.whatsappUrl });
});

// ── Analytics: get stats ──────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const db = readDB();
  res.json({ stats: db.stats, leads: db.leads });
});

// ── Analytics: update configs ─────────────────────────────────────────────────
app.post('/api/admin/config', (req, res) => {
  const db = readDB();
  const { page, fields, whatsappUrl } = req.body;
  if (page)        db.configs.page        = { ...db.configs.page, ...page };
  if (fields)      db.configs.fields      = fields;
  if (whatsappUrl) db.configs.whatsappUrl = whatsappUrl;
  writeDB(db);
  res.json({ ok: true });
});

// ── Clear leads (analytics use) ───────────────────────────────────────────────
app.delete('/api/leads', (req, res) => {
  const db = readDB();
  db.leads = [];
  db.stats = { visits: 0, clicks: 0, submissions: 0 };
  writeDB(db);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('\n==================================================');
  console.log(` Servidor rodando na porta ${PORT}`);
  console.log(` Landing Page ativa em: http://localhost:${PORT}`);
  console.log(` Painel de Analytics em: http://localhost:${PORT}/analytics`);
  console.log('==================================================\n');
});
