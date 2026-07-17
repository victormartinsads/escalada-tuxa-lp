const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota amigável para o Analytics
app.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function readDB() {
  try {
    const tmpPath = path.join('/tmp', 'db.json');
    if (fs.existsSync(tmpPath)) {
      return JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
    }
  } catch (e) {
    console.error('Erro ao ler do /tmp/db.json:', e.message);
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    console.error('Erro ao ler db.json do root:', e.message);
    return { configs: { page: {}, fields: [], whatsappUrl: "", googleSheetsWebhookUrl: "" }, stats: { visits: 0, clicks: 0, submissions: 0 }, leads: [] };
  }
}

function writeDB(data) {
  let success = false;
  // Tentar escrever no path principal do root
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    success = true;
  } catch (err) {
    console.warn('Alerta: Não foi possível salvar em db.json principal (ambiente read-only).');
  }

  // Tentar escrever no /tmp para persistência na sessão atual (Vercel)
  try {
    const tmpPath = path.join('/tmp', 'db.json');
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    success = true;
  } catch (err) {
    console.error('Erro ao salvar em /tmp/db.json:', err.message);
  }
  return success;
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
  const whatsappUrl = process.env.WHATSAPP_URL || db.configs.whatsappUrl || "";
  const googleSheetsWebhookUrl = process.env.WEBHOOK_URL || process.env.GOOGLE_SHEETS_WEBHOOK_URL || db.configs.googleSheetsWebhookUrl || "";

  res.json({
    page: db.configs.page,
    fields: db.configs.fields,
    whatsappUrl: whatsappUrl,
    googleSheetsWebhookUrl: googleSheetsWebhookUrl
  });
});

// ── Save lead + submission ────────────────────────────────────────────────────
app.post('/api/submit', async (req, res) => {
  const db = readDB();
  const lead = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...req.body
  };
  db.leads.push(lead);
  db.stats.submissions++;
  writeDB(db);

  // Enviar para o Webhook (se configurado via painel ou env)
  const webhookUrl = process.env.WEBHOOK_URL || process.env.GOOGLE_SHEETS_WEBHOOK_URL || db.configs.googleSheetsWebhookUrl;
  const whatsappUrl = process.env.WHATSAPP_URL || db.configs.whatsappUrl || "";

  if (webhookUrl) {
    try {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lead.id,
          timestamp: lead.timestamp,
          ...req.body
        })
      }).catch(err => console.error('Erro ao enviar para o Webhook:', err.message));
    } catch (e) {
      console.error('Erro na chamada fetch do Webhook:', e.message);
    }
  }

  res.json({ ok: true, whatsappUrl: whatsappUrl });
});

// ── Analytics: get stats ──────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const db = readDB();
  res.json({ stats: db.stats, leads: db.leads });
});

// ── Analytics: update configs ─────────────────────────────────────────────────
app.post('/api/admin/config', (req, res) => {
  const db = readDB();
  const { page, fields, whatsappUrl, googleSheetsWebhookUrl } = req.body;
  if (page)                   db.configs.page                   = { ...db.configs.page, ...page };
  if (fields)                 db.configs.fields                 = fields;
  if (whatsappUrl !== undefined) db.configs.whatsappUrl         = whatsappUrl;
  if (googleSheetsWebhookUrl !== undefined) db.configs.googleSheetsWebhookUrl = googleSheetsWebhookUrl;
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
