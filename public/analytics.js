document.addEventListener('DOMContentLoaded', () => {
  // Configuração das Abas Principais
  const menuItems = document.querySelectorAll('.menu-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabTitle = document.getElementById('tab-title');
  const tabDescription = document.getElementById('tab-description');

  const tabMeta = {
    dashboard: {
      title: 'Estatísticas e Teste A/B',
      desc: 'Acompanhe o desempenho das suas variações e otimize suas conversões.'
    },
    leads: {
      title: 'Banco de Dados de Leads',
      desc: 'Gerencie e exporte as informações coletadas dos seus clientes em tempo real.'
    },
    config: {
      title: 'Configurações de Textos e A/B',
      desc: 'Controle o conteúdo, as headlines e cores exibidas em cada variação.'
    },
    'form-builder': {
      title: 'Construtor de Formulário',
      desc: 'Personalize os campos de captura exibidos no modal da Landing Page.'
    }
  };

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      
      // Alterna classes nos botões do menu
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // Alterna visibilidade das abas
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`tab-content-${tab}`).classList.add('active');

      // Atualiza cabeçalho
      tabTitle.textContent = tabMeta[tab].title;
      tabDescription.textContent = tabMeta[tab].desc;

      // Executa recarregamentos específicos de aba
      if (tab === 'leads') {
        loadLeadsData();
      } else if (tab === 'dashboard') {
        fetchData();
      } else if (tab === 'form-builder') {
        renderBuilderFields();
      }
    });
  });

  // Configuração das Sub-Abas de Edição de Versão (A vs B)
  const versionTabBtns = document.querySelectorAll('.version-tab-btn');
  const versionEditContainers = document.querySelectorAll('.version-edit-container');

  versionTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const version = btn.getAttribute('data-version-edit');
      
      versionTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      versionEditContainers.forEach(c => c.classList.remove('active'));
      document.getElementById(`version-edit-container-${version}`).classList.add('active');
    });
  });

  // VARIAVEIS GLOBAIS DE ESTADO DO PAINEL
  let globalConfigs = {};
  let globalLeads = [];
  let globalStats = {};
  let funnelChartInstance = null;
  let builderFields = [];

  // ==========================================
  // CARREGAR DADOS GLOBAIS
  // ==========================================
  async function fetchData() {
    try {
      const response = await fetch('/api/admin/stats');
      if (!response.ok) throw new Error('Erro ao obter dados do servidor');
      const data = await response.json();
      
      globalConfigs = data.configs;
      globalLeads = data.leads;
      globalStats = data.stats;
      builderFields = [...(data.configs.fields || [])];

      // Preenche painel se estiver nas abas corretas
      populateDashboard();
      populateConfigForm();
    } catch (err) {
      console.error('Erro de requisição:', err);
    }
  }

  // ==========================================
  // SEÇÃO 1: METRICAS E GRAFICOS (DASHBOARD)
  // ==========================================
  function populateDashboard() {
    const statsA = globalStats.A || { visits: 0, clicks: 0, submissions: 0 };
    const statsB = globalStats.B || { visits: 0, clicks: 0, submissions: 0 };

    // KPI 1: Total Leads
    const totalLeads = globalLeads.length;
    document.getElementById('kpi-total-leads').textContent = totalLeads;

    // KPI 3: Visitas Totais
    const totalVisits = statsA.visits + statsB.visits;
    document.getElementById('kpi-total-visits').textContent = totalVisits;

    // Calcula taxas
    const crA = statsA.visits > 0 ? ((statsA.submissions / statsA.visits) * 100) : 0;
    const crB = statsB.visits > 0 ? ((statsB.submissions / statsB.visits) * 100) : 0;

    const ctrA = statsA.visits > 0 ? ((statsA.clicks / statsA.visits) * 100) : 0;
    const ctrB = statsB.visits > 0 ? ((statsB.clicks / statsB.visits) * 100) : 0;

    // KPI 2: Vencedor
    const kpiWinner = document.getElementById('kpi-winner');
    const kpiWinnerRate = document.getElementById('kpi-winner-rate');

    if (totalLeads === 0 || (crA === 0 && crB === 0)) {
      kpiWinner.textContent = 'Aguardando Dados';
      kpiWinnerRate.textContent = '0% CR';
      kpiWinnerRate.className = 'kpi-badge';
    } else if (crA > crB) {
      kpiWinner.textContent = 'Versão A';
      kpiWinnerRate.textContent = `${crA.toFixed(1)}% CR`;
      kpiWinnerRate.className = 'kpi-badge success';
    } else if (crB > crA) {
      kpiWinner.textContent = 'Versão B';
      kpiWinnerRate.textContent = `${crB.toFixed(1)}% CR`;
      kpiWinnerRate.className = 'kpi-badge success';
    } else {
      kpiWinner.textContent = 'Empate Técnico';
      kpiWinnerRate.textContent = `${crA.toFixed(1)}% CR`;
      kpiWinnerRate.className = 'kpi-badge info';
    }

    // Atualiza barras de conversão na lateral
    document.getElementById('rate-a-cr').textContent = `${crA.toFixed(1)}% CR`;
    document.getElementById('rate-a-ctr').textContent = `${ctrA.toFixed(1)}%`;
    document.getElementById('progress-a-cr').style.width = `${Math.min(crA, 100)}%`;

    document.getElementById('rate-b-cr').textContent = `${crB.toFixed(1)}% CR`;
    document.getElementById('rate-b-ctr').textContent = `${ctrB.toFixed(1)}%`;
    document.getElementById('progress-b-cr').style.width = `${Math.min(crB, 100)}%`;

    // Tabela resumo
    const tableBody = document.getElementById('stats-table-body');
    tableBody.innerHTML = `
      <tr>
        <td><strong>Versão A</strong> <span class="field-badge">${globalConfigs.versions?.A?.name || 'A'}</span></td>
        <td>${statsA.visits}</td>
        <td>${statsA.clicks}</td>
        <td>${ctrA.toFixed(1)}%</td>
        <td>${statsA.submissions}</td>
        <td><span class="success-text" style="font-weight:600">${crA.toFixed(1)}%</span></td>
      </tr>
      <tr>
        <td><strong>Versão B</strong> <span class="field-badge">${globalConfigs.versions?.B?.name || 'B'}</span></td>
        <td>${statsB.visits}</td>
        <td>${statsB.clicks}</td>
        <td>${ctrB.toFixed(1)}%</td>
        <td>${statsB.submissions}</td>
        <td><span class="success-text" style="font-weight:600">${crB.toFixed(1)}%</span></td>
      </tr>
    `;

    // Desenha Gráfico Funil Comparativo (Chart.js)
    renderFunnelChart(statsA, statsB);
  }

  function renderFunnelChart(statsA, statsB) {
    const ctx = document.getElementById('funnelChart').getContext('2d');
    
    if (funnelChartInstance) {
      funnelChartInstance.destroy();
    }

    funnelChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Visitas', 'Cliques CTA', 'Formulários (Leads)'],
        datasets: [
          {
            label: 'Versão A (Original)',
            data: [statsA.visits, statsA.clicks, statsA.submissions],
            backgroundColor: 'rgba(230, 198, 90, 0.85)',
            borderColor: '#E6C65A',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Versão B (Variação)',
            data: [statsB.visits, statsB.clicks, statsB.submissions],
            backgroundColor: 'rgba(59, 130, 246, 0.85)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#8da2c4',
              font: { family: 'Poppins' }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#8da2c4', font: { family: 'Poppins' } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#8da2c4', font: { family: 'Poppins' }, precision: 0 }
          }
        }
      }
    });
  }

  // Zerar estatísticas
  document.getElementById('reset-stats-btn').addEventListener('click', async () => {
    if (!confirm('ATENÇÃO: Deseja realmente resetar todas as métricas de visitas, cliques e conversões para ambas as versões? Os leads salvos continuarão no banco.')) {
      return;
    }
    
    try {
      const response = await fetch('/api/admin/stats/reset', { method: 'POST' });
      if (response.ok) {
        alert('Métricas zeradas com sucesso!');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  });

  // ==========================================
  // SEÇÃO 2: BANCO DE LEADS
  // ==========================================
  const searchInput = document.getElementById('leads-search');
  searchInput.addEventListener('input', () => {
    filterAndRenderLeadsTable();
  });

  function loadLeadsData() {
    filterAndRenderLeadsTable();
  }

  function filterAndRenderLeadsTable() {
    const term = searchInput.value.toLowerCase();
    const headersContainer = document.getElementById('leads-table-headers');
    const tableBody = document.getElementById('leads-table-body');
    const emptyState = document.getElementById('leads-empty-state');
    const fields = globalConfigs.fields || [];

    // 1. Configura cabeçalho da tabela dinamicamente
    headersContainer.innerHTML = '<th>Data/Hora</th><th>Versão</th>';
    fields.forEach(field => {
      const th = document.createElement('th');
      th.textContent = field.label;
      headersContainer.appendChild(th);
    });
    const thActions = document.createElement('th');
    thActions.textContent = 'Ações';
    headersContainer.appendChild(thActions);

    // 2. Filtra leads com base na pesquisa
    const filteredLeads = globalLeads.filter(lead => {
      if (!term) return true;
      if (lead.version.toLowerCase().includes(term)) return true;
      
      // Busca em todos os dados cadastrados no lead
      return Object.values(lead.data).some(val => 
        String(val).toLowerCase().includes(term)
      );
    });

    // 3. Renderiza linhas
    tableBody.innerHTML = '';
    
    if (filteredLeads.length === 0) {
      emptyState.classList.add('active');
      return;
    } else {
      emptyState.classList.remove('active');
    }

    // Ordenar leads por data decrescente (mais recente primeiro)
    filteredLeads.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    filteredLeads.forEach(lead => {
      const tr = document.createElement('tr');
      
      // Data/Hora
      const tdDate = document.createElement('td');
      tdDate.textContent = new Date(lead.timestamp).toLocaleString('pt-BR');
      tr.appendChild(tdDate);

      // Versão
      const tdVersion = document.createElement('td');
      const versionLabel = globalConfigs.versions?.[lead.version]?.name || lead.version;
      tdVersion.innerHTML = `<span class="field-badge">${versionLabel}</span>`;
      tr.appendChild(tdVersion);

      // Dados dinâmicos
      fields.forEach(field => {
        const td = document.createElement('td');
        td.textContent = lead.data[field.id] || '-';
        tr.appendChild(td);
      });

      // Ações (Excluir)
      const tdActions = document.createElement('td');
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-btn delete';
      deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
      deleteBtn.addEventListener('click', () => deleteLead(lead.id));
      
      tdActions.appendChild(deleteBtn);
      tr.appendChild(tdActions);

      tableBody.appendChild(tr);
    });
  }

  async function deleteLead(leadId) {
    if (!confirm('Deseja realmente remover este lead do banco de dados de forma definitiva?')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/leads/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId })
      });

      if (response.ok) {
        alert('Lead removido com sucesso!');
        await fetchData();
        filterAndRenderLeadsTable();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Exportar leads para CSV
  document.getElementById('export-leads-btn').addEventListener('click', () => {
    window.location.href = '/api/admin/leads/export';
  });


  // ==========================================
  // SEÇÃO 3: CONFIGURAÇÕES E TEXTOS (A/B)
  // ==========================================
  function populateConfigForm() {
    document.getElementById('ab-enabled-toggle').checked = !!globalConfigs.abEnabled;
    document.getElementById('global-whatsapp-url').value = globalConfigs.whatsappUrl || '';

    // Versão A
    const configA = globalConfigs.versions?.A || {};
    document.getElementById('ver-a-name').value = configA.name || '';
    document.getElementById('ver-a-pill').value = configA.pill || '';
    document.getElementById('ver-a-headline').value = configA.headline || '';
    document.getElementById('ver-a-subheadline').value = configA.subheadline || '';
    document.getElementById('ver-a-btnText').value = configA.btnText || '';
    document.getElementById('ver-a-btnColor').value = configA.btnColor || '';
    document.getElementById('ver-a-btnTextColor').value = configA.btnTextColor || '';
    document.getElementById('ver-a-whatsappUrl').value = configA.whatsappUrl || '';

    // Versão B
    const configB = globalConfigs.versions?.B || {};
    document.getElementById('ver-b-name').value = configB.name || '';
    document.getElementById('ver-b-pill').value = configB.pill || '';
    document.getElementById('ver-b-headline').value = configB.headline || '';
    document.getElementById('ver-b-subheadline').value = configB.subheadline || '';
    document.getElementById('ver-b-btnText').value = configB.btnText || '';
    document.getElementById('ver-b-btnColor').value = configB.btnColor || '';
    document.getElementById('ver-b-btnTextColor').value = configB.btnTextColor || '';
    document.getElementById('ver-b-whatsappUrl').value = configB.whatsappUrl || '';
  }

  document.getElementById('config-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const configsSubmit = {
      abEnabled: document.getElementById('ab-enabled-toggle').checked,
      whatsappUrl: document.getElementById('global-whatsapp-url').value.trim(),
      fields: builderFields, // mantém os mesmos campos
      versions: {
        A: {
          name: document.getElementById('ver-a-name').value.trim(),
          pill: document.getElementById('ver-a-pill').value.trim(),
          headline: document.getElementById('ver-a-headline').value.trim(),
          subheadline: document.getElementById('ver-a-subheadline').value.trim(),
          btnText: document.getElementById('ver-a-btnText').value.trim(),
          btnColor: document.getElementById('ver-a-btnColor').value.trim(),
          btnTextColor: document.getElementById('ver-a-btnTextColor').value.trim(),
          whatsappUrl: document.getElementById('ver-a-whatsappUrl').value.trim()
        },
        B: {
          name: document.getElementById('ver-b-name').value.trim(),
          pill: document.getElementById('ver-b-pill').value.trim(),
          headline: document.getElementById('ver-b-headline').value.trim(),
          subheadline: document.getElementById('ver-b-subheadline').value.trim(),
          btnText: document.getElementById('ver-b-btnText').value.trim(),
          btnColor: document.getElementById('ver-b-btnColor').value.trim(),
          btnTextColor: document.getElementById('ver-b-btnTextColor').value.trim(),
          whatsappUrl: document.getElementById('ver-b-whatsappUrl').value.trim()
        }
      }
    };

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: configsSubmit })
      });

      if (response.ok) {
        alert('Configurações salvas com sucesso!');
        fetchData();
      } else {
        alert('Erro ao salvar as configurações.');
      }
    } catch (err) {
      console.error(err);
      alert('Falha de rede.');
    }
  });


  // ==========================================
  // SEÇÃO 4: CONSTRUTOR DE FORMULÁRIO DINÂMICO
  // ==========================================
  function renderBuilderFields() {
    const list = document.getElementById('builder-fields-list');
    list.innerHTML = '';

    if (builderFields.length === 0) {
      list.innerHTML = '<p class="empty-state active">Nenhum campo no formulário. Adicione campos ao lado.</p>';
      return;
    }

    builderFields.forEach((field, index) => {
      const item = document.createElement('div');
      item.className = 'builder-field-item';

      const info = document.createElement('div');
      info.className = 'field-info';
      
      const title = document.createElement('span');
      title.className = 'field-title';
      title.textContent = field.label;
      
      if (field.required) {
        const reqBadge = document.createElement('span');
        reqBadge.className = 'field-badge required';
        reqBadge.textContent = 'Obrigatório';
        title.appendChild(reqBadge);
      }

      const meta = document.createElement('span');
      meta.className = 'field-meta';
      let metaText = `ID: ${field.id} | Tipo: ${field.type}`;
      if (field.placeholder) metaText += ` | Placeholder: "${field.placeholder}"`;
      if (field.options && field.options.length > 0) {
        metaText += ` | Opções: [${field.options.join(', ')}]`;
      }
      if (field.type === 'checkbox' && field.maxSelect) {
        metaText += ` | Limite Seleção: ${field.maxSelect}`;
      }
      meta.textContent = metaText;

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'field-actions';

      // Botão subir campo
      if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.className = 'action-btn';
        upBtn.innerHTML = `&uarr;`;
        upBtn.addEventListener('click', () => moveField(index, -1));
        actions.appendChild(upBtn);
      }

      // Botão descer campo
      if (index < builderFields.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.className = 'action-btn';
        downBtn.innerHTML = `&darr;`;
        downBtn.addEventListener('click', () => moveField(index, 1));
        actions.appendChild(downBtn);
      }

      // Botão Excluir
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-btn delete';
      deleteBtn.innerHTML = `&times;`;
      deleteBtn.addEventListener('click', () => removeBuilderField(index));
      actions.appendChild(deleteBtn);

      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function moveField(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= builderFields.length) return;
    
    // Swap
    const temp = builderFields[index];
    builderFields[index] = builderFields[target];
    builderFields[target] = temp;
    
    renderBuilderFields();
  }

  function removeBuilderField(index) {
    const field = builderFields[index];
    if (field.id === 'name' || field.id === 'whatsapp') {
      if (!confirm('Dica: O campo "Nome" e "WhatsApp" são primordiais para redirecionar de forma qualificada. Deseja mesmo removê-lo?')) {
        return;
      }
    }
    
    builderFields.splice(index, 1);
    renderBuilderFields();
  }

  // Manipula exibição dinâmica de campos de opções e limites
  const newFieldTypeSelect = document.getElementById('new-field-type');
  const optionsGroup = document.getElementById('new-field-options-group');
  const maxGroup = document.getElementById('new-field-max-group');
  const optionsTextarea = document.getElementById('new-field-options');

  newFieldTypeSelect.addEventListener('change', () => {
    const val = newFieldTypeSelect.value;
    if (val === 'radio' || val === 'checkbox') {
      optionsGroup.style.display = 'block';
      optionsTextarea.required = true;
    } else {
      optionsGroup.style.display = 'none';
      optionsTextarea.required = false;
    }

    if (val === 'checkbox') {
      maxGroup.style.display = 'block';
    } else {
      maxGroup.style.display = 'none';
    }
  });

  // Adicionar campo ao construtor
  document.getElementById('add-field-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const label = document.getElementById('new-field-label').value.trim();
    const id = document.getElementById('new-field-id').value.trim().replace(/[^a-zA-Z0-9_]/g, '');
    const type = document.getElementById('new-field-type').value;
    const placeholder = document.getElementById('new-field-placeholder').value.trim();
    const required = document.getElementById('new-field-required').checked;

    if (!id) {
      alert('Por favor insira um ID de campo válido.');
      return;
    }

    // Verifica duplicados
    if (builderFields.some(f => f.id === id)) {
      alert('Já existe um campo com este ID no formulário.');
      return;
    }

    let options = [];
    if (type === 'radio' || type === 'checkbox') {
      const rawOptions = optionsTextarea.value;
      options = rawOptions.split('\n').map(o => o.trim()).filter(o => o.length > 0);
      if (options.length === 0) {
        alert('Por favor, digite ao menos uma opção (uma por linha) para este tipo de campo.');
        return;
      }
    }

    let maxSelect = null;
    if (type === 'checkbox') {
      maxSelect = parseInt(document.getElementById('new-field-max').value) || 2;
    }

    const newField = { id, label, type, required, placeholder };
    if (options.length > 0) newField.options = options;
    if (maxSelect !== null) newField.maxSelect = maxSelect;

    builderFields.push(newField);
    renderBuilderFields();

    // Limpa formulário e reseta visibilidade
    document.getElementById('add-field-form').reset();
    optionsGroup.style.display = 'none';
    maxGroup.style.display = 'none';
    optionsTextarea.required = false;
  });

  // Salvar campos do formulário no servidor
  document.getElementById('save-form-fields-btn').addEventListener('click', async () => {
    globalConfigs.fields = builderFields;

    try {
      const response = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: globalConfigs })
      });

      if (response.ok) {
        alert('Estrutura do formulário salva com sucesso!');
        fetchData();
      } else {
        alert('Erro ao salvar os campos do formulário.');
      }
    } catch (err) {
      console.error(err);
      alert('Falha de rede.');
    }
  });

  // Inicializa dados gerais ao carregar
  fetchData();
});
