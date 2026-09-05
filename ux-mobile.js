(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

  function makeCoach() {
    if ($('.ux-mobile-coach')) return $('.ux-mobile-coach');
    const app = $('.app-grid');
    if (!app) return null;

    const coach = document.createElement('section');
    coach.className = 'ux-mobile-coach';
    coach.setAttribute('aria-live', 'polite');
    coach.innerHTML = `
      <div class="ux-mobile-coach__copy">
        <span class="ux-mobile-coach__step">PRÁCTICA GUIADA</span>
        <strong class="ux-mobile-coach__title">Siguiente paso</strong>
        <span class="ux-mobile-coach__meta">Sigue la secuencia recomendada</span>
      </div>
      <div class="ux-mobile-coach__actions">
        <button class="ux-mobile-coach__config" type="button">Configurar</button>
        <button class="ux-mobile-coach__next" type="button">Próximo paso</button>
      </div>`;
    app.parentNode.insertBefore(coach, app);

    $('.ux-mobile-coach__config', coach)?.addEventListener('click', () => {
      const panel = $('.control-panel');
      if (!panel) return;
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.classList.add('ux-setup-highlight');
      setTimeout(() => panel.classList.remove('ux-setup-highlight'), 1600);
    });

    $('.ux-mobile-coach__next', coach)?.addEventListener('click', () => {
      const locate = $('#guideLocate');
      if (locate && !locate.hidden) locate.click();
      else $('.lab-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return coach;
  }

  function makeScenarioSummary() {
    if ($('.ux-mobile-summary')) return $('.ux-mobile-summary');
    const panel = $('.control-panel');
    const scenarioSummary = $('#scenarioSummary');
    if (!panel || !scenarioSummary) return null;

    const summary = document.createElement('div');
    summary.className = 'ux-mobile-summary';
    summary.innerHTML = `
      <div><strong>Escenario actual</strong><span>—</span></div>
      <button type="button">Ir al instrumento</button>`;
    scenarioSummary.insertAdjacentElement('afterend', summary);
    $('button', summary)?.addEventListener('click', () => $('.lab-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return summary;
  }

  function syncGuide() {
    const coach = makeCoach();
    if (!coach) return;
    const step = $('#guideStep')?.textContent?.trim() || 'Práctica guiada';
    const title = $('#guideTitle')?.textContent?.trim() || 'Siguiente paso';
    const percent = $('#guidePercent')?.textContent?.trim() || '0%';
    const state = $('#learningState')?.textContent?.trim() || '';
    $('.ux-mobile-coach__step', coach).textContent = step;
    $('.ux-mobile-coach__title', coach).textContent = title;
    $('.ux-mobile-coach__meta', coach).textContent = `${percent}${state ? ` · ${state}` : ''}`;
  }

  function syncScenario() {
    const summary = makeScenarioSummary();
    if (!summary) return;
    const scenario = $('#scenarioSelect');
    const plane = $('#planeSelect');
    const name = scenario?.selectedOptions?.[0]?.textContent?.trim() || 'Escenario';
    const planeName = plane?.selectedOptions?.[0]?.textContent?.trim() || '';
    $('strong', summary).textContent = name;
    $('span', summary).textContent = planeName;
  }

  function improveSemantics() {
    $('#screenMessage')?.setAttribute('aria-live', 'polite');
    $('#guideCard')?.setAttribute('aria-live', 'polite');
    $('#measurementGrid')?.setAttribute('aria-label', 'Puntos de la rejilla de iluminancia');

    $$('.view-tabs [data-view]').forEach(btn => {
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
    });

    $$('button').forEach(btn => {
      if (!btn.hasAttribute('type')) btn.setAttribute('type', 'button');
    });
  }

  function bindViewScrolling() {
    $$('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        requestAnimationFrame(() => {
          $$('.view-tabs [data-view]').forEach(tab => tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false'));
          if (isMobile()) setTimeout(() => $('.lab-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        });
      });
    });
  }

  function observeLearningState() {
    const targets = ['guideStep','guideTitle','guidePercent','learningState','scenarioSummary','runStatus','zeroStatus','sensorStatus']
      .map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length) return;
    const observer = new MutationObserver(() => {
      syncGuide();
      syncScenario();
    });
    targets.forEach(node => observer.observe(node, { childList: true, subtree: true, characterData: true }));
  }

  function bindConfiguration() {
    ['scenarioSelect','planeSelect','lightConditionSelect','positionSelect','angleSelect','sourceProfileSelect','rangeSelect']
      .map(id => document.getElementById(id)).filter(Boolean)
      .forEach(el => el.addEventListener('change', () => {
        syncScenario();
        syncGuide();
      }));
  }

  function keepFocusVisible() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab') document.documentElement.classList.add('ux-keyboard');
    }, { passive: true });
    document.addEventListener('pointerdown', () => document.documentElement.classList.remove('ux-keyboard'), { passive: true });
  }

  function init() {
    makeCoach();
    makeScenarioSummary();
    improveSemantics();
    bindViewScrolling();
    bindConfiguration();
    observeLearningState();
    keepFocusVisible();
    syncGuide();
    syncScenario();
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
