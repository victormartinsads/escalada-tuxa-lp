// ── Analytics Panel JS ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Tab Navigation ────────────────────────────────────────────────────────
  const tabs = {
    dashboard:    { title: 'Métricas',          desc: 'Acompanhe visitas, cliques e envios.' },
    leads:        { title: 'Banco de Leads',    desc: 'Visualize e exporte todos os leads capturados.' },
    config:       { title: 'Editar Textos',     desc: 'Edite os textos e o link de redirecionamento da página.' },
    'form-builder': { title: 'Editar Formulário', desc: 'Gerencie os campos do formulário de captura.' }
  };

  document.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-content-${tab}`).classList.add('active');
      document.getElementById('tab-title').textContent = tabs[tab]?.title || '';
      document.getElementById('tab-desc').textContent  = tabs[tab]?.desc  || '';
    });
  });

  // ── Load Stats ────────────────────────────────────────────────────────────
  let allLeads   = [];
  let allFields  = [];
  let funnelChart = null;

  async function loadStats() {
    try {
      const res  = await fetch('/api/stats');
      const data = await res.json();
      const s    = data.stats || {};
      allLeads   = data.leads || [];

      const visits      = s.visits      || 0;
      const clicks      = s.clicks      || 0;
      const submissions = s.submissions || 0;
      const cr  = visits ? ((submissions / visits) * 100).toFixed(1) : 0;
      const ctr = visits ? ((clicks / visits) * 100).toFixed(1)      : 0;
      const lc  = clicks ? ((submissions / clicks) * 100).toFixed(1) : 0;

      document.getElementById('kpi-visits').textContent      = visits;
      document.getElementById('kpi-clicks').textContent      = clicks;
      document.getElementById('kpi-submissions').textContent = submissions;
      document.getElementById('kpi-cr').textContent          = `${cr}%`;

      document.getElementById('rate-ctr').textContent = `${ctr}%`;
      document.getElementById('rate-cr').textContent  = `${cr}%`;
      document.getElementById('rate-lc').textContent  = `${lc}%`;

      // bar widths (cap at 100)
      document.getElementById('bar-ctr').style.width = `${Math.min(ctr, 100)}%`;
      document.getElementById('bar-cr').style.width  = `${Math.min(cr,  100)}%`;
      document.getElementById('bar-lc').style.width  = `${Math.min(lc,  100)}%`;

      renderFunnelChart(visits, clicks, submissions);
      renderLeadsTable(allLeads);
    } catch (err) {
      console.error('Erro ao carregar stats:', err);
    }
  }

  function renderFunnelChart(visits, clicks, submissions) {
    const ctx = document.getElementById('funnelChart').getContext('2d');
    if (funnelChart) funnelChart.destroy();

    funnelChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Visitas', 'Cliques no CTA', 'Leads Capturados'],
        datasets: [{
          label: 'Funil',
          data: [visits, clicks, submissions],
          backgroundColor: [
            'rgba(100,149,220,0.6)',
            'rgba(230,198,90,0.6)',
            'rgba(80,200,120,0.6)'
          ],
          borderColor: [
            'rgba(100,149,220,1)',
            'rgba(230,198,90,1)',
            'rgba(80,200,120,1)'
          ],
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#8A99AB', stepSize: 1 },
            grid:  { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            ticks: { color: '#C8D5E0' },
            grid:  { display: false }
          }
        }
      }
    });
  }

  // ── Leads Table ───────────────────────────────────────────────────────────
  function renderLeadsTable(leads) {
    const tbody   = document.getElementById('leads-table-body');
    const headers = document.getElementById('leads-table-headers');
    const empty   = document.getElementById('leads-empty');

    if (!leads.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    // Build dynamic headers from first lead
    const first     = leads[0];
    const dataKeys  = Object.keys(first).filter(k => !['id','timestamp'].includes(k));
    headers.innerHTML = '<th>Data/Hora</th>' + dataKeys.map(k => `<th>${k}</th>`).join('') + '<th>Ações</th>';

    tbody.innerHTML = leads.map(lead => {
      const dt  = new Date(lead.timestamp).toLocaleString('pt-BR');
      const cells = dataKeys.map(k => `<td>${lead[k] || '-'}</td>`).join('');
      return `<tr><td>${dt}</td>${cells}<td><button class="btn btn-sm" onclick="showLeadDetail(${lead.id})">Ver</button></td></tr>`;
    }).join('');
  }

  // Search filter
  document.getElementById('leads-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const filtered = allLeads.filter(l => JSON.stringify(l).toLowerCase().includes(q));
    renderLeadsTable(filtered);
  });

  // Export CSV
  document.getElementById('export-leads-btn').addEventListener('click', () => {
    if (!allLeads.length) return alert('Sem leads para exportar.');
    const keys  = Object.keys(allLeads[0]).filter(k => k !== 'id');
    const rows  = [keys.join(','), ...allLeads.map(l => keys.map(k => `"${(l[k]||'').toString().replace(/"/g,'""')}"`).join(','))];
    const blob  = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url   = URL.createObjectURL(blob);
    const a     = Object.assign(document.createElement('a'), { href: url, download: 'leads.csv' });
    a.click();
    URL.revokeObjectURL(url);
  });

  // Reset stats
  document.getElementById('reset-stats-btn').addEventListener('click', async () => {
    if (!confirm('Tem certeza? Isso apagará todos os leads e zerará as métricas.')) return;
    await fetch('/api/leads', { method: 'DELETE' });
    await loadStats();
  });

  // ── Load Config into Edit Form ─────────────────────────────────────────────
  async function loadConfig() {
    try {
      const res  = await fetch('/api/config');
      const data = await res.json();
      const page = data.page || {};

      document.getElementById('cfg-pill').value            = page.pill         || '';
      document.getElementById('cfg-headline').value        = page.headline     || '';
      document.getElementById('cfg-subheadline').value     = page.subheadline  || '';
      document.getElementById('cfg-btn-text').value        = page.btnText      || '';
      document.getElementById('cfg-btn-subtext').value     = page.btnSubtext   || '';
      document.getElementById('cfg-btn-color').value       = page.btnColor     || '';
      document.getElementById('cfg-btn-text-color').value  = page.btnTextColor || '';
      document.getElementById('cfg-whatsapp').value        = data.whatsappUrl  || '';
      document.getElementById('cfg-sheets-webhook').value  = data.googleSheetsWebhookUrl || '';

      allFields = data.fields || [];
      renderBuilderFields();
    } catch (err) {
      console.error('Erro ao carregar config:', err);
    }
  }

  // Save config
  document.getElementById('config-form').addEventListener('submit', async e => {
    e.preventDefault();
    const page = {
      pill:         document.getElementById('cfg-pill').value,
      headline:     document.getElementById('cfg-headline').value,
      subheadline:  document.getElementById('cfg-subheadline').value,
      btnText:      document.getElementById('cfg-btn-text').value,
      btnSubtext:   document.getElementById('cfg-btn-subtext').value,
      btnColor:     document.getElementById('cfg-btn-color').value,
      btnTextColor: document.getElementById('cfg-btn-text-color').value,
    };
    const whatsappUrl = document.getElementById('cfg-whatsapp').value;
    const googleSheetsWebhookUrl = document.getElementById('cfg-sheets-webhook').value;

    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page, whatsappUrl, googleSheetsWebhookUrl })
      });
      const data = await res.json();
      if (data.ok) showToast('Configurações salvas com sucesso!');
    } catch (err) {
      alert('Erro ao salvar.');
    }
  });

  // Test webhook
  const testBtn = document.getElementById('btn-test-webhook');
  const testResult = document.getElementById('webhook-test-result');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const webhookUrl = document.getElementById('cfg-sheets-webhook').value.trim();
      if (!webhookUrl) {
        testResult.textContent = '❌ Insira uma URL primeiro.';
        testResult.style.color = '#ef4444';
        return;
      }
      
      testBtn.disabled = true;
      testBtn.textContent = '⏳ Enviando...';
      testResult.textContent = '';
      
      try {
        const res = await fetch('/api/admin/test-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl })
        });
        const data = await res.json();
        if (data.ok) {
          testResult.textContent = `✅ Enviado! Status do webhook: ${data.status}`;
          testResult.style.color = '#22c55e';
        } else {
          testResult.textContent = `❌ Erro: ${data.error || 'Falha de conexão'}`;
          testResult.style.color = '#ef4444';
        }
      } catch (err) {
        testResult.textContent = `❌ Erro: ${err.message}`;
        testResult.style.color = '#ef4444';
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = '⚡ Enviar Lead de Teste';
      }
    });
  }

  // ── Form Builder ──────────────────────────────────────────────────────────
  function renderBuilderFields() {
    const list = document.getElementById('builder-fields-list');
    if (!allFields.length) {
      list.innerHTML = '<p style="color:#8A99AB;padding:16px 0">Nenhum campo cadastrado.</p>';
      return;
    }
    list.innerHTML = allFields.map((f, idx) => `
      <div class="field-item" data-idx="${idx}">
        <div class="field-item-info">
          <span class="field-item-label">${f.label}</span>
          <span class="field-item-type badge">${f.type}</span>
          ${f.required ? '<span class="badge badge-warn">obrigatório</span>' : ''}
        </div>
        <div class="field-item-actions">
          <button class="btn btn-sm" onclick="moveField(${idx}, -1)">↑</button>
          <button class="btn btn-sm" onclick="moveField(${idx}, 1)">↓</button>
          <button class="btn btn-sm btn-danger-sm" onclick="removeField(${idx})">Remover</button>
        </div>
      </div>
    `).join('');
  }

  window.removeField = (idx) => {
    allFields.splice(idx, 1);
    renderBuilderFields();
  };

  window.moveField = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= allFields.length) return;
    [allFields[idx], allFields[newIdx]] = [allFields[newIdx], allFields[idx]];
    renderBuilderFields();
  };

  document.getElementById('save-form-fields-btn').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: allFields })
      });
      const data = await res.json();
      if (data.ok) showToast('Formulário salvo com sucesso!');
    } catch (err) {
      alert('Erro ao salvar formulário.');
    }
  });

  // Show/hide options textarea
  const typeSelect    = document.getElementById('new-field-type');
  const optionsGroup  = document.getElementById('new-field-options-group');
  const maxGroup      = document.getElementById('new-field-max-group');

  typeSelect.addEventListener('change', () => {
    const hasOptions = ['radio', 'checkbox'].includes(typeSelect.value);
    optionsGroup.style.display = hasOptions ? 'flex' : 'none';
    maxGroup.style.display     = typeSelect.value === 'checkbox' ? 'flex' : 'none';
  });

  document.getElementById('add-field-form').addEventListener('submit', e => {
    e.preventDefault();
    const type = typeSelect.value;
    const newField = {
      id:          document.getElementById('new-field-id').value.trim(),
      label:       document.getElementById('new-field-label').value.trim(),
      type,
      required:    document.getElementById('new-field-required').checked,
      placeholder: document.getElementById('new-field-placeholder').value.trim()
    };

    if (['radio', 'checkbox'].includes(type)) {
      newField.options = document.getElementById('new-field-options').value
        .split('\n').map(o => o.trim()).filter(Boolean);
    }
    if (type === 'checkbox') {
      newField.maxSelect = parseInt(document.getElementById('new-field-max').value) || 2;
    }

    allFields.push(newField);
    renderBuilderFields();
    e.target.reset();
    optionsGroup.style.display = 'none';
    maxGroup.style.display     = 'none';
  });

  // ── Toast notification ────────────────────────────────────────────────────
  function showToast(msg) {
    let toast = document.getElementById('admin-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'admin-toast';
      toast.style.cssText = `
        position:fixed;bottom:24px;right:24px;background:#22c55e;color:#fff;
        padding:14px 22px;border-radius:10px;font-weight:600;font-size:14px;
        z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.4);
        opacity:0;transition:opacity 0.3s;pointer-events:none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  loadStats();
  loadConfig();
  setInterval(loadStats, 30000);
});
