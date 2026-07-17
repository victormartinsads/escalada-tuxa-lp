const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Helper para ler o banco de dados
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      // Se não existir por algum motivo, retorna uma estrutura padrão
      return { configs: {}, stats: {}, leads: [] };
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler db.json:', err);
    return { configs: {}, stats: {}, leads: [] };
  }
}

// Helper para salvar no banco de dados
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Erro ao gravar no db.json:', err);
    return false;
  }
}

// Rota principal da Landing Page (Interceptada antes do express.static para rodízio A/B)
app.get('/', (req, res) => {
  const db = readDb();
  let version = req.cookies.ab_version;

  // Se teste A/B estiver ativo e a versão no cookie não for válida, seleciona uma nova
  if (db.configs.abEnabled) {
    if (version !== 'A' && version !== 'B') {
      const visitsA = db.stats.A?.visits || 0;
      const visitsB = db.stats.B?.visits || 0;
      
      // Balanceamento de visitas (para dividir 50/50 de forma consistente)
      version = (visitsA <= visitsB) ? 'A' : 'B';
      
      // Define o cookie para expirar em 30 dias
      res.cookie('ab_version', version, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false });
    }
  } else {
    // Se o teste A/B estiver desativado, usa sempre a Versão A como padrão
    version = 'A';
    res.cookie('ab_version', 'A', { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false });
  }

  // Contabiliza a visita no banco de dados
  if (db.stats[version]) {
    db.stats[version].visits = (db.stats[version].visits || 0) + 1;
    writeDb(db);
  }

  // Carrega e renderiza o index.html com as substituições da versão
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    const config = db.configs.versions[version] || db.configs.versions.A;

    // Substitui placeholders do HTML pelos textos da versão ativa
    html = html.replace(/{{headline}}/g, config.headline);
    html = html.replace(/{{subheadline}}/g, config.subheadline);
    html = html.replace(/{{btnText}}/g, config.btnText);
    html = html.replace(/{{btnColor}}/g, config.btnColor);
    html = html.replace(/{{btnTextColor}}/g, config.btnTextColor);
    html = html.replace(/{{pill}}/g, config.pill);
    html = html.replace(/{{version}}/g, version);

    res.send(html);
  } else {
    res.status(404).send('Landing Page em desenvolvimento. Por favor, crie o arquivo public/index.html');
  }
});

// APIs do Painel de Administração / Analytics

// Retorna as métricas e os leads
app.get('/api/admin/stats', (req, res) => {
  const db = readDb();
  res.json({
    stats: db.stats,
    leads: db.leads,
    configs: db.configs
  });
});

// Atualiza as configurações de textos, botões e campos
app.post('/api/admin/config', (req, res) => {
  const db = readDb();
  const { configs } = req.body;
  if (!configs) {
    return res.status(400).json({ error: 'Dados de configuração inválidos.' });
  }
  db.configs = configs;
  writeDb(db);
  res.json({ success: true, configs: db.configs });
});

// Rota para contabilizar cliques nos botões CTA
app.post('/api/clicks', (req, res) => {
  const { version } = req.body;
  if (version !== 'A' && version !== 'B') {
    return res.status(400).json({ error: 'Versão inválida' });
  }

  const db = readDb();
  if (db.stats[version]) {
    db.stats[version].clicks = (db.stats[version].clicks || 0) + 1;
    writeDb(db);
  }
  res.json({ success: true });
});

// Rota para capturar leads, incrementar envio e retornar a URL do WhatsApp
app.post('/api/leads', (req, res) => {
  const { version, data } = req.body;
  if (version !== 'A' && version !== 'B') {
    return res.status(400).json({ error: 'Versão inválida' });
  }

  const db = readDb();
  
  // Incrementa a conversão (envio de formulário) da versão correspondente
  if (db.stats[version]) {
    db.stats[version].submissions = (db.stats[version].submissions || 0) + 1;
  }

  // Cria e insere o Lead
  const newLead = {
    id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    version: version,
    data: data || {}
  };

  db.leads.push(newLead);
  writeDb(db);

  // Determinar link do WhatsApp de redirecionamento
  let baseWhatsappUrl = db.configs.versions[version]?.whatsappUrl || db.configs.whatsappUrl;
  
  // Substitui placeholders de texto de forma inteligente
  // Exemplo de WhatsApp URL: https://wa.me/5541984169584?text=Olá {name}, vim do site...
  if (baseWhatsappUrl) {
    try {
      let urlObj = new URL(baseWhatsappUrl);
      let textParam = urlObj.searchParams.get('text') || '';
      
      // Substitui placeholders como {name}, {email}, {whatsapp} no parâmetro de texto
      Object.keys(newLead.data).forEach(key => {
        const val = newLead.data[key];
        const placeholder = `{${key}}`;
        if (textParam.includes(placeholder)) {
          textParam = textParam.replace(new RegExp(placeholder, 'g'), val);
        }
      });

      urlObj.searchParams.set('text', textParam);
      baseWhatsappUrl = urlObj.toString();
    } catch (e) {
      // Se não for uma URL válida completa, faz uma substituição simples de texto
      Object.keys(newLead.data).forEach(key => {
        const val = encodeURIComponent(newLead.data[key]);
        baseWhatsappUrl = baseWhatsappUrl.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
      });
    }
  } else {
    baseWhatsappUrl = "https://api.whatsapp.com/send/?phone=5541984169584&text=Olá,%20vim%20do%20site%20e%20quero%20mais%20informações.";
  }

  res.json({ success: true, redirectUrl: baseWhatsappUrl });
});

// Rota para exportar leads para arquivo CSV
app.get('/api/admin/leads/export', (req, res) => {
  const db = readDb();
  const leads = db.leads || [];
  const fields = db.configs.fields || [];

  if (leads.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
    return res.send('\ufeffData,Versao\n'); // Envia BOM do Excel
  }

  // Gera cabeçalho dinâmico do CSV
  let headers = ['Data', 'Versao'];
  fields.forEach(field => {
    headers.push(field.label);
  });
  
  let csvContent = '\ufeff' + headers.join(',') + '\n'; // BOM + headers

  leads.forEach(lead => {
    let row = [];
    const dateStr = new Date(lead.timestamp).toLocaleString('pt-BR');
    row.push(`"${dateStr.replace(/"/g, '""')}"`);
    row.push(`"${lead.version}"`);

    fields.forEach(field => {
      const val = lead.data[field.id] || '';
      row.push(`"${val.replace(/"/g, '""')}"`);
    });

    csvContent += row.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=leads_tuxa.csv');
  res.send(csvContent);
});

// Rota para excluir um lead
app.post('/api/admin/leads/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'ID do lead ausente' });
  }

  const db = readDb();
  const initialLength = db.leads.length;
  db.leads = db.leads.filter(lead => lead.id !== id);

  if (db.leads.length === initialLength) {
    return res.status(404).json({ error: 'Lead não encontrado' });
  }

  writeDb(db);
  res.json({ success: true });
});

// Rota para resetar as estatísticas
app.post('/api/admin/stats/reset', (req, res) => {
  const db = readDb();
  db.stats = {
    A: { visits: 0, clicks: 0, submissions: 0 },
    B: { visits: 0, clicks: 0, submissions: 0 }
  };
  writeDb(db);
  res.json({ success: true, stats: db.stats });
});

// Serve arquivos estáticos da pasta "public" (depois de interceptar a rota principal "/")
app.use(express.static(path.join(__dirname, 'public')));

// Servir a página de Analytics no endpoint amigável
app.get('/analytics', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'analytics.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Servidor rodando na porta ${PORT}`);
  console.log(` Landing Page ativa em: http://localhost:${PORT}`);
  console.log(` Painel de Analytics em: http://localhost:${PORT}/analytics`);
  console.log(`==================================================`);
});
