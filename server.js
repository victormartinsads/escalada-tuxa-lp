const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
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
function sha256(text) {
  if (!text) return '';
  const normalized = text.toString().trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizePhone(phone) {
  if (!phone) return '';
  let digits = phone.toString().replace(/\D/g, '');
  if (digits.length >= 10 && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  return digits;
}

async function sendMetaCAPIEvent(eventName, userData = {}, customData = {}, req) {
  const pixelId = '544051854616640';
  const accessToken = 'EAASAFa03R9QBSGDhZBGwOewHcgNUnv4Tzs36kKuCZCtapY7NHFSZA1rPJp1Mgqa57gsvUP6lA4SzLIFsjfB8d3PhZBkFm1ws0Up3Oy1u82i7xZB94gZCYqSuZAaPK99bvqavSZBrZA4iC2Yln5YBEW5atn7V2w4CqApiqXqgZBAr4d7JTO1ZCFkbPkpItZCTNR3C5gZDZD';
  
  const clientIp = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() : '';
  const clientUserAgent = req ? req.headers['user-agent'] : '';

  const eventData = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: 'https://escalada-tuxa-lp.vercel.app',
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: clientUserAgent,
      ...userData
    },
    custom_data: customData
  };

  // Usar o código de teste do gerenciador de eventos
  eventData.test_event_code = 'TEST71174';

  const url = `https://graph.facebook.com/v17.0/${pixelId}/events?access_token=${accessToken}`;
  
  try {
    const res = await postJSON(url, { data: [eventData] });
    console.log(`Meta CAPI [${eventName}] response status:`, res.status);
    return res;
  } catch (err) {
    console.error(`Erro ao enviar Meta CAPI [${eventName}]:`, err.message);
  }
}
function postJSON(urlStr, data) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      const body = JSON.stringify(data);
      
      const req = client.request(urlStr, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      }, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          resolve({ status: res.statusCode, data: responseData });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Tempo limite de conexão (Timeout) excedido ao conectar ao webhook.'));
      });

      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}
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

  // Enviar PageView para a Meta CAPI em background
  sendMetaCAPIEvent('PageView', {}, {}, req).catch((err) => console.error('Erro ao enviar PageView CAPI:', err.message));

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
  const googleSheetsWebhookUrl = process.env.WEBHOOK_URL || process.env.GOOGLE_SHEETS_WEBHOOK_URL || db.configs.googleSheetsWebhookUrl || "https://n8n.serveragenciaand.com/webhook/a681145c-c866-43f1-8a20-98a3dbb21a05";

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

  // Enviar Lead para Meta CAPI (Server-Side)
  try {
    const hashedEmail = sha256(req.body.email);
    const normalizedPhone = normalizePhone(req.body.whatsapp);
    const hashedPhone = sha256(normalizedPhone);
    const firstName = (req.body.name || '').split(' ')[0];
    const hashedFirstName = sha256(firstName);

    const userData = {
      em: hashedEmail ? [hashedEmail] : undefined,
      ph: hashedPhone ? [hashedPhone] : undefined,
      fn: hashedFirstName ? [hashedFirstName] : undefined
    };

    const customData = {
      role: req.body.role || '',
      revenue: req.body.revenue || '',
      operation_time: req.body.operation_time || '',
      employees: req.body.employees || '',
      reality: req.body.reality || '',
      obstacles: req.body.obstacles || ''
    };

    await sendMetaCAPIEvent('Lead', userData, customData, req);
  } catch (capiErr) {
    console.error('Erro ao enviar Lead CAPI:', capiErr.message);
  }

  // Enviar para o Webhook (se configurado via painel ou env)
  const webhookUrl = process.env.WEBHOOK_URL || process.env.GOOGLE_SHEETS_WEBHOOK_URL || db.configs.googleSheetsWebhookUrl || "https://n8n.serveragenciaand.com/webhook/a681145c-c866-43f1-8a20-98a3dbb21a05";
  const whatsappUrl = process.env.WHATSAPP_URL || db.configs.whatsappUrl || "";

  if (webhookUrl) {
    try {
      await postJSON(webhookUrl, {
        id: lead.id,
        timestamp: lead.timestamp,
        ...req.body
      });
    } catch (err) {
      console.error('Erro ao enviar para o Webhook:', err.message);
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

// ── Analytics: test webhook ───────────────────────────────────────────────────
app.post('/api/admin/test-webhook', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) {
    return res.status(400).json({ ok: false, error: 'URL do Webhook não fornecida.' });
  }

  const testPayload = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    name: "Lead Teste (Analytics)",
    email: "teste-webhook@tuxa.com.br",
    whatsapp: "(41) 98416-9584",
    role: "Proprietário(a)",
    revenue: "Acima de R$500 mil",
    operation_time: "Mais de 10 anos",
    employees: "Mais de 40",
    reality: "O restaurante cresce, mas tudo ainda depende de mim (Teste de Webhook).",
    obstacles: "Falta de liderança da equipe, Baixa produtividade",
    isTest: true
  };

  try {
    const response = await postJSON(webhookUrl, testPayload);
    res.json({
      ok: true,
      status: response.status,
      data: response.data
    });
  } catch (err) {
    res.json({
      ok: false,
      error: err.message
    });
  }
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
