document.addEventListener('DOMContentLoaded', () => {
  const ctaButton = document.getElementById('cta-button');
  const leadModal = document.getElementById('lead-modal');
  const modalClose = document.getElementById('modal-close');
  const leadForm = document.getElementById('lead-form');
  const stepsContainer = document.getElementById('steps-container');
  const prevBtn = document.getElementById('prev-step-btn');
  const nextBtn = document.getElementById('next-step-btn');
  const submitBtn = document.getElementById('submit-btn');
  
  const stepIndicator = document.getElementById('modal-step-indicator');
  const percentIndicator = document.getElementById('modal-percent-indicator');
  const progressBarFill = document.getElementById('modal-progress-bar-fill');

  const activeVersion = document.body.getAttribute('data-version') || 'A';
  
  let formFields = [];
  let steps = []; // Array que armazena os grupos de campos por etapa
  let activeStepIndex = 0;
  const leadAnswers = {};

  // 1. Carrega campos e configura as etapas do formulário
  async function loadFormConfig() {
    try {
      const response = await fetch('/api/admin/stats');
      if (!response.ok) throw new Error('Falha ao obter dados.');
      const data = await response.json();
      formFields = data.configs.fields || [];
      
      buildFormSteps();
    } catch (err) {
      console.error('Erro de requisição:', err);
      // Fallback em caso de erro
      formFields = [
        { id: 'name', label: 'Nome Completo', type: 'text', required: true, placeholder: 'Digite seu nome completo' },
        { id: 'email', label: 'E-mail Profissional', type: 'email', required: true, placeholder: 'Digite seu melhor e-mail' },
        { id: 'whatsapp', label: 'WhatsApp', type: 'tel', required: true, placeholder: '(00) 00000-0000' }
      ];
      buildFormSteps();
    }
  }

  // Divide os campos dinâmicos em etapas (Etapa 0 = Contatos, Etapas seguintes = Perguntas com opções)
  function buildFormSteps() {
    steps = [];
    
    // Filtra campos de contato (sem opções como radio ou checkbox)
    const contactFields = formFields.filter(f => !f.options || f.options.length === 0);
    
    // Se houver campos de contato, agrupa-os no Passo 0
    if (contactFields.length > 0) {
      steps.push({
        type: 'contact',
        title: 'Vamos começar!',
        subtitle: 'Preencha seus dados de contato para iniciarmos a sessão estratégica.',
        fields: contactFields
      });
    }

    // Cada campo de múltipla escolha (com opções) vira uma etapa individual
    const questionFields = formFields.filter(f => f.options && f.options.length > 0);
    questionFields.forEach((field, index) => {
      steps.push({
        type: 'question',
        field: field
      });
    });

    renderSteps();
    showStep(0);
  }

  // Renderiza todo o HTML das etapas no container
  function renderSteps() {
    stepsContainer.innerHTML = '';

    steps.forEach((step, stepIndex) => {
      const stepDiv = document.createElement('div');
      stepDiv.className = `form-step step-${stepIndex}`;
      stepDiv.setAttribute('data-step-index', stepIndex);

      if (step.type === 'contact') {
        // Renderiza etapa de contatos
        stepDiv.innerHTML = `
          <h3 class="step-title">${step.title}</h3>
          <p class="step-desc">${step.subtitle}</p>
          <div class="form-group-list"></div>
        `;
        
        const list = stepDiv.querySelector('.form-group-list');
        step.fields.forEach(field => {
          const group = document.createElement('div');
          group.className = 'form-group';
          
          const label = document.createElement('label');
          label.className = 'form-label';
          label.setAttribute('for', field.id);
          label.textContent = field.label;
          
          const input = document.createElement('input');
          input.className = 'form-input';
          input.id = field.id;
          input.name = field.id;
          input.type = field.type;
          input.required = !!field.required;
          input.placeholder = field.placeholder || '';
          
          // Evento de alteração para salvar no estado local
          input.addEventListener('input', (e) => {
            leadAnswers[field.id] = e.target.value;
            validateCurrentStep();
          });

          // Adiciona máscara se for telefone
          if (field.type === 'tel' || field.id.toLowerCase().includes('whatsapp') || field.id.toLowerCase().includes('telefone')) {
            input.addEventListener('input', (e) => maskPhone(e.target));
          }

          group.appendChild(label);
          group.appendChild(input);
          list.appendChild(group);
        });

      } else {
        // Renderiza etapa de pergunta múltipla escolha (Respondi)
        const field = step.field;
        const isMultiSelect = field.type === 'checkbox';
        const maxSelect = field.maxSelect || 999;
        
        stepDiv.innerHTML = `
          <h3 class="step-title">${field.label}</h3>
          <p class="step-desc">${isMultiSelect ? `Escolha até ${maxSelect} opções abaixo.` : 'Selecione uma das opções abaixo.'}</p>
          <div class="options-grid"></div>
        `;

        const grid = stepDiv.querySelector('.options-grid');
        field.options.forEach(opt => {
          const card = document.createElement('div');
          card.className = 'option-card';
          
          // Estrutura visual da opção (círculo para radio, quadrado para checkbox)
          const indicator = document.createElement('div');
          indicator.className = isMultiSelect ? 'option-square' : 'option-circle';
          
          const labelSpan = document.createElement('span');
          labelSpan.className = 'option-label-text';
          labelSpan.textContent = opt;

          card.appendChild(indicator);
          card.appendChild(labelSpan);
          
          // Evento de clique no cartão de opção
          card.addEventListener('click', () => {
            if (isMultiSelect) {
              handleCheckboxClick(card, field, opt);
            } else {
              handleRadioClick(card, field, opt);
            }
          });

          grid.appendChild(card);
        });
      }

      stepsContainer.appendChild(stepDiv);
    });
  }

  // Manipula clique em múltipla escolha simples (Radio) -> AUTO AVANÇO
  function handleRadioClick(card, field, val) {
    const parent = card.parentElement;
    parent.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    
    card.classList.add('selected');
    leadAnswers[field.id] = val;
    
    validateCurrentStep();

    // Aguarda um pequeno delay de 350ms para feedback visual antes do auto-avanço
    setTimeout(() => {
      if (activeStepIndex === steps.length - 1) {
        // Se for a última etapa, foca no envio
        showSubmitButtonOnly();
      } else {
        goToStep(activeStepIndex + 1);
      }
    }, 320);
  }

  // Manipula clique em múltipla escolha múltipla (Checkbox)
  function handleCheckboxClick(card, field, val) {
    const maxSelect = field.maxSelect || 999;
    let selectedList = leadAnswers[field.id] || [];
    
    if (card.classList.contains('selected')) {
      card.classList.remove('selected');
      selectedList = selectedList.filter(item => item !== val);
    } else {
      // Valida limite máximo de escolhas
      if (selectedList.length >= maxSelect) {
        alert(`Você pode selecionar no máximo ${maxSelect} opções nesta pergunta.`);
        return;
      }
      card.classList.add('selected');
      selectedList.push(optNormalized(val));
    }
    
    // Normaliza para string ou array
    leadAnswers[field.id] = selectedList;
    validateCurrentStep();
  }

  // Retorna string limpa
  function optNormalized(val) {
    return val;
  }

  // Exibe a etapa correspondente
  function showStep(index) {
    activeStepIndex = index;
    
    const allSteps = document.querySelectorAll('.form-step');
    allSteps.forEach(s => s.classList.remove('active'));
    
    const targetStep = document.querySelector(`.form-step.step-${index}`);
    if (targetStep) targetStep.classList.add('active');

    // Restaura valores já preenchidos ao voltar/avançar
    restoreStepValues(index);

    // Atualiza Progresso e Navegação
    updateProgress();
    validateCurrentStep();
  }

  function restoreStepValues(index) {
    const step = steps[index];
    if (!step) return;

    const stepDiv = document.querySelector(`.form-step.step-${index}`);
    if (!stepDiv) return;

    if (step.type === 'contact') {
      step.fields.forEach(field => {
        const input = stepDiv.querySelector(`#${field.id}`);
        if (input && leadAnswers[field.id]) {
          input.value = leadAnswers[field.id];
        }
      });
    } else {
      const field = step.field;
      const val = leadAnswers[field.id];
      if (!val) return;

      const isMulti = field.type === 'checkbox';
      const cards = stepDiv.querySelectorAll('.option-card');
      
      cards.forEach(card => {
        const text = card.querySelector('.option-label-text').textContent;
        if (isMulti) {
          if (Array.isArray(val) && val.includes(text)) {
            card.classList.add('selected');
          }
        } else {
          if (val === text) {
            card.classList.add('selected');
          }
        }
      });
    }
  }

  // Avança de etapa
  function goToStep(index) {
    if (index >= 0 && index < steps.length) {
      showStep(index);
    }
  }

  // Valida e ativa/desativa os botões de controle
  function validateCurrentStep() {
    const step = steps[activeStepIndex];
    let isValid = true;

    if (!step) return;

    if (step.type === 'contact') {
      // Valida se todos os campos obrigatórios de contato estão preenchidos
      isValid = step.fields.every(field => {
        if (!field.required) return true;
        const val = leadAnswers[field.id] || '';
        if (field.type === 'email') {
          return /\S+@\S+\.\S+/.test(val);
        }
        return val.trim().length > 0;
      });
    } else {
      // Valida perguntas de múltipla escolha
      const field = step.field;
      if (field.required) {
        const val = leadAnswers[field.id];
        if (field.type === 'checkbox') {
          isValid = Array.isArray(val) && val.length > 0;
        } else {
          isValid = !!val;
        }
      }
    }

    // Configura botões de controle
    prevBtn.style.display = activeStepIndex > 0 ? 'block' : 'none';
    
    const isLastStep = activeStepIndex === steps.length - 1;
    
    if (isLastStep) {
      nextBtn.style.display = 'none';
      submitBtn.style.display = 'block';
      submitBtn.disabled = !isValid;
    } else {
      submitBtn.style.display = 'none';
      
      // Se for pergunta de auto-avanço (radio), esconde botão "Avançar" para manter o visual Respondi,
      // a menos que o usuário já tenha respondido anteriormente e queira apenas pular.
      const isRadio = step.type === 'question' && step.field.type === 'radio';
      if (isRadio) {
        nextBtn.style.display = leadAnswers[step.field.id] ? 'block' : 'none';
      } else {
        nextBtn.style.display = 'block';
      }
      
      nextBtn.disabled = !isValid;
    }
  }

  function showSubmitButtonOnly() {
    prevBtn.style.display = 'block';
    nextBtn.style.display = 'none';
    submitBtn.style.display = 'block';
    submitBtn.disabled = false;
  }

  // Atualiza a barra de progresso dourada
  function updateProgress() {
    const totalSteps = steps.length;
    const progressPercent = totalSteps > 0 ? Math.round((activeStepIndex / totalSteps) * 100) : 0;
    
    percentIndicator.textContent = `${progressPercent}% concluído`;
    progressBarFill.style.width = `${progressPercent}%`;

    if (activeStepIndex === 0) {
      stepIndicator.textContent = 'Identificação';
    } else {
      stepIndicator.textContent = `Pergunta ${activeStepIndex} de ${totalSteps - 1}`;
    }
  }

  // Evento dos Botões de Navegação
  prevBtn.addEventListener('click', () => {
    goToStep(activeStepIndex - 1);
  });

  nextBtn.addEventListener('click', () => {
    goToStep(activeStepIndex + 1);
  });

  // 2. Abertura do Modal
  ctaButton.addEventListener('click', (e) => {
    e.preventDefault();
    leadModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Registra clique via API
    try {
      fetch('/api/clicks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: activeVersion })
      });
    } catch (err) {
      console.error(err);
    }
  });

  // Fechamento
  function closeModal() {
    leadModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  modalClose.addEventListener('click', closeModal);
  leadModal.addEventListener('click', (e) => {
    if (e.target === leadModal) closeModal();
  });

  // Máscara de telefone
  function maskPhone(input) {
    let value = input.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length > 10) {
      input.value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 5) {
      input.value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
    } else if (value.length > 2) {
      input.value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
      input.value = `(${value}`;
    }
  }

  // 3. Envio do Formulário Final
  leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    submitBtn.querySelector('.submit-btn-text').textContent = 'REDIRECIONANDO...';

    // Ajusta formato dos arrays de escolha múltipla para strings amigáveis separadas por vírgula antes de enviar
    const formattedData = {};
    Object.keys(leadAnswers).forEach(key => {
      const val = leadAnswers[key];
      if (Array.isArray(val)) {
        formattedData[key] = val.join(', ');
      } else {
        formattedData[key] = val;
      }
    });

    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: activeVersion,
          data: formattedData
        })
      });

      if (!response.ok) throw new Error('Erro ao registrar lead');
      const data = await response.json();

      if (data.success && data.redirectUrl) {
        // Avança a barra para 100% antes de ir
        percentIndicator.textContent = '100% concluído';
        progressBarFill.style.width = '100%';
        
        setTimeout(() => {
          window.location.href = data.redirectUrl;
        }, 300);
      } else {
        throw new Error('URL de redirecionamento inválida');
      }

    } catch (err) {
      console.error(err);
      alert('Erro ao enviar respostas. Por favor, revise os dados ou tente novamente.');
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
      submitBtn.querySelector('.submit-btn-text').textContent = 'FINALIZAR E REDIRECIONAR';
    }
  });

  // Inicializa a configuração do formulário
  loadFormConfig();
});
