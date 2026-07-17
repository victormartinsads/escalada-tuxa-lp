document.addEventListener('DOMContentLoaded', async () => {
  // ── DOM refs ──────────────────────────────────────────────────────────────
  const ctaBtn        = document.getElementById('hero-cta');
  const backdrop      = document.getElementById('modal-backdrop');
  const stepsWrap     = document.getElementById('modal-steps');
  const progressBar   = document.getElementById('modal-progress-bar');
  const btnBack       = document.getElementById('btn-back');
  const btnNext       = document.getElementById('btn-next');
  const pillText      = document.getElementById('pill-text');
  const headline      = document.getElementById('hero-headline');
  const subheadline   = document.getElementById('hero-subheadline');
  const btnSubtext    = document.getElementById('hero-btn-subtext');

  // ── State ─────────────────────────────────────────────────────────────────
  let formFields    = [];
  let steps         = [];
  let currentStep   = 0;
  let leadAnswers   = {};
  let whatsappUrl   = '';

  // ── Track visit ───────────────────────────────────────────────────────────
  fetch('/api/visit', { method: 'POST' }).catch(() => {});

  // ── Load config from server ───────────────────────────────────────────────
  async function loadConfig() {
    try {
      const res  = await fetch('/api/config');
      const data = await res.json();
      const page = data.page || {};

      // Apply texts
      if (page.pill)        pillText.textContent  = page.pill;
      if (page.headline)    headline.innerHTML    = page.headline;
      if (page.btnText) {
        const textSpan = ctaBtn.querySelector('.hero__cta-text');
        if (textSpan) textSpan.textContent = page.btnText;
        else ctaBtn.textContent = page.btnText;
      }
      if (page.btnSubtext) {
        const lines = page.btnSubtext.split('\n').filter(Boolean);
        btnSubtext.innerHTML = lines.map(l => `<span>${l}</span>`).join('');
      }
      if (page.btnColor)     ctaBtn.style.background = page.btnColor;
      if (page.btnTextColor) {
        ctaBtn.style.color = page.btnTextColor;
        const iconWrapper = ctaBtn.querySelector('.hero__cta-icon-wrapper');
        if (iconWrapper) iconWrapper.style.color = page.btnTextColor;
      }

      formFields  = data.fields  || [];
      whatsappUrl = data.whatsappUrl || '';

      buildSteps();
    } catch (err) {
      console.error('Erro ao carregar config:', err);
    }
  }

  // ── Build steps ───────────────────────────────────────────────────────────
  function buildSteps() {
    steps = [];

    const contactFields = formFields.filter(f => !f.options || f.options.length === 0);
    const questionFields = formFields.filter(f => f.options && f.options.length > 0);

    if (contactFields.length > 0) {
      steps.push({ type: 'contact', fields: contactFields });
    }

    questionFields.forEach(field => {
      steps.push({ type: 'question', field });
    });

    renderSteps();
    goTo(0);
  }

  // ── Render all steps into DOM ─────────────────────────────────────────────
  function renderSteps() {
    stepsWrap.innerHTML = '';

    steps.forEach((step, idx) => {
      const div = document.createElement('div');
      div.className = 'modal-step';
      div.id = `step-${idx}`;

      if (step.type === 'contact') {
        div.innerHTML = `
          <p class="step__title">Vamos começar!</p>
          <p class="step__desc">Preencha seus dados de contato para iniciarmos.</p>
          <div class="step__fields" id="contact-fields"></div>
        `;
        const fieldsWrap = div.querySelector('#contact-fields');
        step.fields.forEach(field => {
          const grp = document.createElement('div');
          grp.className = 'field-group';
          grp.innerHTML = `
            <label class="field-label" for="${field.id}">${field.label}</label>
            <input class="field-input" id="${field.id}" name="${field.id}" type="${field.type}"
              placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>
          `;
          const input = grp.querySelector('input');
          input.addEventListener('input', e => {
            leadAnswers[field.id] = e.target.value;
            if (field.type === 'tel') maskPhone(input);
            refreshNav();
          });
          fieldsWrap.appendChild(grp);
        });
      } else {
        const field = step.field;
        const isCheckbox = field.type === 'checkbox';
        const max = field.maxSelect || 999;

        div.innerHTML = `
          <p class="step__title">${field.label}</p>
          <p class="step__desc">${isCheckbox ? `Escolha até ${max} opções.` : 'Selecione uma opção.'}</p>
          <div class="options-list" id="opts-${idx}"></div>
        `;
        const list = div.querySelector(`#opts-${idx}`);
        field.options.forEach(opt => {
          const card = document.createElement('div');
          card.className = 'option-card';
          card.innerHTML = `
            <div class="option-marker ${isCheckbox ? 'square' : ''}"></div>
            <span class="option-text">${opt}</span>
          `;
          card.addEventListener('click', () => {
            if (isCheckbox) onCheckbox(card, field, opt, list, max);
            else             onRadio(card, field, opt, list, idx);
          });
          list.appendChild(card);
        });
      }

      stepsWrap.appendChild(div);
    });
  }

  function onRadio(card, field, val, list, stepIdx) {
    list.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    leadAnswers[field.id] = val;
    refreshNav();
    // auto-advance after brief delay
    setTimeout(() => {
      if (currentStep < steps.length - 1) goTo(currentStep + 1);
      else showSubmit();
    }, 300);
  }

  function onCheckbox(card, field, val, list, max) {
    const selected = leadAnswers[field.id] || [];
    if (card.classList.contains('selected')) {
      card.classList.remove('selected');
      leadAnswers[field.id] = selected.filter(v => v !== val);
    } else {
      if (selected.length >= max) {
        alert(`Selecione no máximo ${max} opções.`);
        return;
      }
      card.classList.add('selected');
      leadAnswers[field.id] = [...selected, val];
    }
    refreshNav();
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function goTo(idx) {
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`step-${idx}`);
    if (target) target.classList.add('active');
    currentStep = idx;

    restoreValues(idx);
    updateProgress();
    refreshNav();
  }

  function restoreValues(idx) {
    const step = steps[idx];
    if (!step) return;
    const div = document.getElementById(`step-${idx}`);
    if (!div) return;

    if (step.type === 'contact') {
      step.fields.forEach(f => {
        const inp = div.querySelector(`#${f.id}`);
        if (inp && leadAnswers[f.id]) inp.value = leadAnswers[f.id];
      });
    } else {
      const field = step.field;
      const val   = leadAnswers[field.id];
      if (!val) return;
      div.querySelectorAll('.option-card').forEach(card => {
        const txt = card.querySelector('.option-text').textContent;
        if (Array.isArray(val) ? val.includes(txt) : val === txt)
          card.classList.add('selected');
      });
    }
  }

  function updateProgress() {
    const pct = steps.length > 1
      ? Math.round((currentStep / (steps.length - 1)) * 100)
      : 0;
    progressBar.style.width = `${pct}%`;
  }

  function isStepValid(idx) {
    const step = steps[idx];
    if (!step) return false;

    if (step.type === 'contact') {
      return step.fields.every(f => {
        if (!f.required) return true;
        const v = leadAnswers[f.id] || '';
        if (f.type === 'email') return /\S+@\S+\.\S+/.test(v);
        return v.trim().length > 0;
      });
    } else {
      const v = leadAnswers[step.field.id];
      if (step.field.type === 'checkbox') return Array.isArray(v) && v.length > 0;
      return !!v;
    }
  }

  function showSubmit() {
    btnBack.style.display   = currentStep > 0 ? 'flex' : 'none';
    btnNext.style.display   = 'none';
    // replace next with submit
    let submitBtn = document.getElementById('btn-submit');
    if (!submitBtn) {
      submitBtn = document.createElement('button');
      submitBtn.id = 'btn-submit';
      submitBtn.className = 'modal__btn modal__btn--submit';
      submitBtn.textContent = 'Enviar e Agendar →';
      document.getElementById('modal-footer').appendChild(submitBtn);
      submitBtn.addEventListener('click', handleSubmit);
    }
    submitBtn.style.display = 'flex';
    submitBtn.disabled = !isStepValid(currentStep);
  }

  function refreshNav() {
    const isLast  = currentStep === steps.length - 1;
    const valid   = isStepValid(currentStep);
    const step    = steps[currentStep];
    const isRadio = step && step.type === 'question' && step.field.type === 'radio';

    btnBack.style.display = currentStep > 0 ? 'flex' : 'none';

    const submitBtn = document.getElementById('btn-submit');
    if (submitBtn) submitBtn.style.display = 'none';

    if (isLast) {
      btnNext.style.display  = 'none';
      showSubmit();
    } else {
      // for radio questions, hide "Avançar" until answered (auto-advance handles it)
      // but show it if they already answered (for back-navigation convenience)
      if (isRadio) {
        btnNext.style.display = valid ? 'flex' : 'none';
      } else {
        btnNext.style.display = 'flex';
      }
      btnNext.disabled = !valid;
    }
  }

  btnBack.addEventListener('click', () => { if (currentStep > 0) goTo(currentStep - 1); });
  btnNext.addEventListener('click', () => { if (currentStep < steps.length - 1) goTo(currentStep + 1); });

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    const submitBtn = document.getElementById('btn-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando…';
    }
    progressBar.style.width = '100%';

    // Format arrays as comma-separated strings
    const payload = {};
    Object.keys(leadAnswers).forEach(k => {
      const v = leadAnswers[k];
      payload[k] = Array.isArray(v) ? v.join(', ') : v;
    });

    try {
      const res  = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      // Meta Pixel Lead event
      if (window.fbq) {
        fbq('track', 'Lead');
      }

      let url = data.whatsappUrl || whatsappUrl;
      // Replace placeholders like {name}, {whatsapp}
      Object.keys(payload).forEach(k => {
        url = url.replace(`{${k}}`, encodeURIComponent(payload[k] || ''));
      });

      setTimeout(() => { window.location.href = url; }, 300);
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar. Tente novamente.');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar e Agendar →';
      }
    }
  }

  // ── Open modal ────────────────────────────────────────────────────────────
  ctaBtn.addEventListener('click', () => {
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
    fetch('/api/click', { method: 'POST' }).catch(() => {});
  });

  // Close on backdrop click
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) {
      backdrop.classList.remove('active');
      document.body.style.overflow = '';
    }
  });

  // ── Phone mask ────────────────────────────────────────────────────────────
  function maskPhone(inp) {
    let v = inp.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 10)      inp.value = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 5)  inp.value = `(${v.slice(0,2)}) ${v.slice(2,6)}-${v.slice(6)}`;
    else if (v.length > 2)  inp.value = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0)  inp.value = `(${v}`;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  await loadConfig();
});
