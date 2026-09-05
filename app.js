(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const SUPABASE_URL = 'https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const ACCESS_SESSION_KEY = 'movida-sst-luxometro-session';
  const ACCESS_ATTEMPTS_KEY = 'movida-sst-luxometro-attempts';
  const TUTORIAL_SEEN_KEY = 'movida-sst-luxometro-tutorial-v1';
  const MEMORY_KEY = 'movida-sst-luxometro-memory';
  const ACCESS_DURATION = 20 * 60 * 1000;
  const BLOCK_DURATION = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 5;
  const FC_FACTOR = 10.764;

  const scenarios = {
    office: {
      name: 'Oficina administrativa',
      description: 'Iluminación general relativamente uniforme sobre un plano de trabajo horizontal.',
      task: 'Lectura, escritura y trabajo con pantalla', reference: [300, 750], base: 520, variability: 12,
      planes: { horizontal: 1, vertical: 0.82, circulation: 0.72 },
      grid: [0.86, 0.95, 0.91, 0.93, 1.08, 1.02, 0.82, 0.96, 0.88]
    },
    precision: {
      name: 'Mesa de inspección fina',
      description: 'Luz localizada intensa sobre una tarea pequeña, con caída rápida hacia los bordes.',
      task: 'Inspección visual de detalle', reference: [750, 1500], base: 1180, variability: 24,
      planes: { horizontal: 1, vertical: 0.48, circulation: 0.3 },
      grid: [0.42, 0.7, 0.45, 0.68, 1.18, 0.72, 0.4, 0.66, 0.43]
    },
    warehouse: {
      name: 'Almacén con estanterías',
      description: 'Distribución irregular: las estanterías generan zonas de sombra entre luminarias.',
      task: 'Identificación, tránsito y manipulación', reference: [150, 300], base: 205, variability: 9,
      planes: { horizontal: 0.92, vertical: 0.68, circulation: 1 },
      grid: [1.12, 0.58, 1.05, 0.82, 1.06, 0.62, 1.15, 0.72, 1.02]
    },
    corridor: {
      name: 'Pasillo de circulación',
      description: 'Nivel moderado a nivel de piso, con menor exigencia visual que una tarea de precisión.',
      task: 'Circulación y orientación', reference: [75, 200], base: 112, variability: 5,
      planes: { horizontal: 0.88, vertical: 0.58, circulation: 1 },
      grid: [0.92, 1.03, 0.88, 0.82, 1.1, 0.86, 0.78, 1.02, 0.8]
    },
    window: {
      name: 'Puesto próximo a una ventana',
      description: 'Aporte fuerte de luz natural en un lado y menor iluminancia al alejarse de la ventana.',
      task: 'Trabajo de oficina con luz natural lateral', reference: [300, 750], base: 680, variability: 38,
      planes: { horizontal: 1, vertical: 1.12, circulation: 0.68 },
      grid: [1.58, 1.2, 0.72, 1.44, 1.02, 0.62, 1.25, 0.88, 0.5]
    }
  };

  const positionEffects = {
    pending: { factor: 1, label: 'Pendiente', help: 'Selecciona cómo está ubicado' },
    correct: { factor: 1, label: 'Correcto', help: 'Sin sombra ni inclinación' },
    shadow: { factor: 0.64, label: 'Con sombra', help: 'El evaluador bloquea parte de la luz' },
    tilted: { factor: 0.82, label: 'Inclinado', help: 'No representa el plano elegido' },
    covered: { factor: 0.28, label: 'Cubierto', help: 'El difusor está obstruido' }
  };

  const planeLabels = { pending: 'Pendiente', horizontal: 'Horizontal', vertical: 'Vertical', circulation: 'Circulación' };
  const ranges = { AUTO: 2000, 200: 200, 2000: 2000, 20000: 20000, 200000: 200000 };
  const state = {
    powered: false, booting: false, running: false, hold: false, zeroed: false, zeroBusy: false,
    scenario: 'office', unit: 'lux', range: 'AUTO', plane: 'pending', position: 'pending', view: 'spot', returnView: 'spot',
    currentLux: null, displayedLux: null, minLux: null, maxLux: null, elapsed: 0, selectedPoint: 0,
    gridReadings: Array(9).fill(null), guided: true, memories: loadMemories(), menuCategory: null, menuIndex: 0,
    milestones: { power: false, zero: false, unit: false, range: false, plane: false, position: false, measured: false, grid: false, complete: false, saved: false }
  };

  const rootMenu = [
    { id: 'view', label: 'Visualización', value: () => viewLabel() },
    { id: 'unit', label: 'Unidad', value: () => state.unit === 'lux' ? 'LUX' : 'FC' },
    { id: 'range', label: 'Rango', value: () => state.range },
    { id: 'zero', label: 'Puesta a cero', value: () => state.zeroed ? 'OK' : 'PEND.' },
    { id: 'hold', label: 'Retener lectura', value: () => state.hold ? 'HOLD' : 'LIVE' },
    { id: 'memory', label: 'Memoria', value: () => String(state.memories.length) },
    { id: 'reset', label: 'Reiniciar malla', value: () => state.gridReadings.some(Number.isFinite) ? 'LISTO' : 'VACÍA' },
    { id: 'info', label: 'Información', value: () => 'MLX–PRO' }
  ];
  const choices = {
    view: [{ label: 'Lectura puntual', value: 'spot' }, { label: 'Malla de 9 puntos', value: 'grid' }, { label: 'Resultados', value: 'stats' }, { label: 'Historial', value: 'history' }],
    unit: [{ label: 'Lux (lx)', value: 'lux' }, { label: 'Foot-candle (fc)', value: 'fc' }],
    range: ['AUTO', '200', '2000', '20000', '200000'].map(value => ({ label: value === 'AUTO' ? 'Automático' : `0–${Number(value).toLocaleString('es-ES')} lx`, value }))
  };
  const guideSteps = [
    { key: 'power', title: 'Inspecciona y enciende', text: 'Revisa el sensor, el cable, la batería y el estado del difusor antes de pulsar Encender.', coach: 'Pulsa Encender para iniciar la autocomprobación.', target: '#quickPowerBtn' },
    { key: 'zero', title: 'Comprueba la puesta a cero', text: 'Pulsa Poner a cero. La tapa opaca debe cubrir completamente el fotodetector.', coach: 'Pulsa Poner a cero; el simulador comprobará el desplazamiento.', target: '#quickZeroBtn' },
    { key: 'unit', title: 'Trabaja en lux', text: 'Selecciona lux, la unidad SI de iluminancia: un lumen por metro cuadrado.', coach: 'Selecciona lux como unidad de trabajo.', target: '[data-setting="unit"][data-value="lux"]' },
    { key: 'range', title: 'Selecciona un rango', text: 'Elige 0–2.000 lx. Si aparece OL, el rango es insuficiente y la lectura no es válida.', coach: 'Selecciona el rango 0–2.000 lx.', target: '#quickRangeSelect' },
    { key: 'plane', title: 'Define el plano de la tarea', text: 'Selecciona Horizontal · mesa. El plano debe representar la superficie donde ocurre la tarea visual.', coach: 'Selecciona el plano horizontal de la mesa.', target: '#planeSelect' },
    { key: 'position', title: 'Ubica correctamente el sensor', text: 'Mantén el sensor en el plano, sin inclinación, obstrucciones ni sombra del evaluador.', coach: 'Selecciona Correcta y sin sombras.', target: '#positionSelect' },
    { key: 'measured', title: 'Realiza una lectura puntual', text: 'Pulsa Medir y espera a que la lectura se estabilice. Observa el mínimo y el máximo.', coach: 'Pulsa Medir para obtener una lectura estable.', target: '#quickRunBtn' },
    { key: 'grid', title: 'Abre la malla de medición', text: 'Pulsa Malla. Una lectura aislada no representa necesariamente toda el área.', coach: 'Pulsa Malla para ver los nueve puntos.', target: '[data-setting="view"][data-value="grid"]' },
    { key: 'complete', title: 'Registra los nueve puntos', text: 'Toca cada punto de la malla. El simulador calculará promedio, mínimo, máximo y uniformidad.', coach: 'Toca los puntos pendientes hasta completar 9 de 9.', target: '#measurementGrid .measurement-point:not(.recorded)' },
    { key: 'saved', title: 'Documenta el resultado', text: 'Pulsa Guardar para conservar el escenario, plano, promedio, uniformidad y condiciones del sensor.', coach: 'Pulsa Guardar para cerrar la práctica.', target: '#quickSaveBtn' }
  ];

  const lessonTopics = {
    unit: ['MAGNITUD', 'Lux no es brillo', 'La iluminancia es el flujo luminoso que llega a una superficie.', 'Permite cuantificar la luz incidente en el plano evaluado.', 'Lux y foot-candle expresan la misma magnitud en escalas distintas; 1 fc = 10,764 lx.'],
    plane: ['ESTRATEGIA', 'El plano responde a la tarea', 'Es la superficie real o imaginaria donde se desarrolla la tarea visual.', 'Evita medir en una altura u orientación que no representa el trabajo.', 'Una mesa suele evaluarse horizontalmente; una pantalla o tablero puede requerir un plano vertical.'],
    position: ['ERROR DE MEDICIÓN', 'Tu cuerpo también altera la lectura', 'La luz que alcanza el fotodetector puede cambiar por sombra, inclinación u obstrucción.', 'Ayuda a reconocer errores que sesgan el resultado antes de comparar valores.', 'Una lectura baja causada por mala posición no describe la iluminación real del puesto.'],
    range: ['CONFIGURACIÓN', 'Rango y resolución', 'El rango es el intervalo máximo que el equipo puede mostrar.', 'Evita sobrecarga y define la resolución visible.', 'Si aparece OL, sube de rango y repite. AUTO es útil, pero debes comprender qué está haciendo.']
  };

  let measureTimer = null;
  let accessTimer = null;
  let toastTimer = null;
  let tutorialIndex = 0;
  let lastGuideIndex = -1;

  function readJson(storage, key, fallback) { try { return JSON.parse(storage.getItem(key) || 'null') || fallback; } catch { return fallback; } }
  function writeJson(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch {} }
  function loadMemories() { return readJson(localStorage, MEMORY_KEY, []).slice(0, 12); }
  function saveMemories() { writeJson(localStorage, MEMORY_KEY, state.memories.slice(0, 12)); }
  function setLoginMessage(message, type = 'error') { $('loginMessage').textContent = message; $('loginMessage').classList.toggle('success', type === 'success'); }
  function showToast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500); }
  function pressKey(button) { if (!button) return; button.classList.add('pressed'); setTimeout(() => button.classList.remove('pressed'), 130); }
  function formatTime(seconds) { return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
  function formatLux(value, unit = state.unit) {
    if (!Number.isFinite(value)) return '----';
    const converted = unit === 'fc' ? value / FC_FACTOR : value;
    if (unit === 'fc') return converted < 100 ? converted.toFixed(1) : Math.round(converted).toString();
    if (converted < 100) return converted.toFixed(1);
    return Math.round(converted).toLocaleString('es-ES');
  }
  function unitLabel() { return state.unit === 'lux' ? 'lx' : 'fc'; }
  function viewLabel(view = state.view) { return ({ spot: 'PUNTUAL', grid: 'MALLA', stats: 'RESULT.', history: 'MEMORIA', menu: 'MENU', zero: 'ZERO' })[view] || 'PUNTUAL'; }

  function getAttemptState() {
    const stored = readJson(localStorage, ACCESS_ATTEMPTS_KEY, { count: 0, blockedUntil: 0 });
    if (stored.blockedUntil && stored.blockedUntil <= Date.now()) { localStorage.removeItem(ACCESS_ATTEMPTS_KEY); return { count: 0, blockedUntil: 0 }; }
    return stored;
  }
  function blockedMessage(until) { const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000)); return `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} antes de volver a intentar.`; }
  function recordFailedAttempt() {
    const current = getAttemptState(); const count = (current.count || 0) + 1;
    if (count >= MAX_ATTEMPTS) { const blockedUntil = Date.now() + BLOCK_DURATION; writeJson(localStorage, ACCESS_ATTEMPTS_KEY, { count: 0, blockedUntil }); return blockedMessage(blockedUntil); }
    writeJson(localStorage, ACCESS_ATTEMPTS_KEY, { count, blockedUntil: 0 });
    const remaining = MAX_ATTEMPTS - count; return `No pudimos validar esos datos. Revisa la cédula y la clave. Te ${remaining === 1 ? 'queda 1 intento' : `quedan ${remaining} intentos`}.`;
  }
  function openSimulator(member, persist = true) {
    const name = [member?.nombres, member?.apellidos].filter(Boolean).join(' ').trim() || member?.name || 'integrante';
    const expiresAt = member?.expiresAt || Date.now() + ACCESS_DURATION;
    if (persist) writeJson(sessionStorage, ACCESS_SESSION_KEY, { name, expiresAt });
    $('memberName').textContent = name; $('loginGate').hidden = true; $('appShell').hidden = false; $('appShell').setAttribute('aria-hidden', 'false'); document.body.classList.remove('auth-locked');
    clearTimeout(accessTimer); accessTimer = setTimeout(() => closeMemberSession(true), Math.max(0, expiresAt - Date.now()));
    setTimeout(() => { if (!localStorage.getItem(TUTORIAL_SEEN_KEY)) openTutorial(); }, 250);
  }
  function closeMemberSession(expired = false) {
    stopMeasurement(); clearTimeout(accessTimer); sessionStorage.removeItem(ACCESS_SESSION_KEY); $('appShell').hidden = true; $('appShell').setAttribute('aria-hidden', 'true'); $('loginGate').hidden = false; document.body.classList.add('auth-locked'); $('memberLogin').reset();
    setLoginMessage(expired ? 'Tu sesión de 20 minutos finalizó. Ingresa nuevamente para continuar.' : 'Sesión cerrada correctamente.', expired ? 'error' : 'success'); $('memberId').focus();
  }
  async function submitMemberLogin(event) {
    event.preventDefault(); const cedula = $('memberId').value.replace(/\D/g, ''); const codigo = $('memberPassword').value.trim(); const attempts = getAttemptState();
    if (attempts.blockedUntil > Date.now()) return setLoginMessage(blockedMessage(attempts.blockedUntil));
    if (!cedula || !codigo) return setLoginMessage('Escribe tu cédula y tu clave para continuar.');
    $('loginSubmit').disabled = true; $('loginSubmit').querySelector('span').textContent = 'Verificando acceso…'; setLoginMessage('', 'success');
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/acceso_integrante`, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_cedula: cedula, p_codigo: codigo }) });
      if (!response.ok) throw new Error(`Access service returned ${response.status}`);
      const payload = await response.json(); const member = Array.isArray(payload) ? payload[0] : payload;
      if (!member) { $('memberPassword').value = ''; return setLoginMessage(recordFailedAttempt()); }
      localStorage.removeItem(ACCESS_ATTEMPTS_KEY); $('memberLogin').reset(); openSimulator(member); showToast(`Bienvenido, ${member.nombres || 'integrante'}`);
    } catch (error) { console.error(error); setLoginMessage('El servicio de acceso no está disponible en este momento. Intenta nuevamente en unos minutos.'); }
    finally { $('loginSubmit').disabled = false; $('loginSubmit').querySelector('span').textContent = 'Abrir laboratorio'; }
  }
  function initializeAccessGate() {
    const session = readJson(sessionStorage, ACCESS_SESSION_KEY, null);
    if (session?.expiresAt > Date.now()) return openSimulator(session, false);
    sessionStorage.removeItem(ACCESS_SESSION_KEY); const attempts = getAttemptState(); if (attempts.blockedUntil > Date.now()) setLoginMessage(blockedMessage(attempts.blockedUntil)); $('memberId').focus();
  }

  function scenarioLux(point = state.selectedPoint) {
    const scenario = scenarios[state.scenario];
    const spatial = scenario.grid[point] || 1;
    const plane = scenario.planes[state.plane] || 1;
    const position = positionEffects[state.position].factor;
    const wave = Math.sin(Date.now() / 760 + point * 0.7) * scenario.variability;
    const jitter = (Math.random() - 0.5) * scenario.variability * 0.55;
    return Math.max(0, scenario.base * spatial * plane * position + wave + jitter);
  }
  function effectiveRange() {
    if (state.range !== 'AUTO') return ranges[state.range];
    const value = state.currentLux || scenarios[state.scenario].base;
    return [200, 2000, 20000, 200000].find(limit => value <= limit) || 200000;
  }
  function isOverload(value = state.currentLux) { return Number.isFinite(value) && value > effectiveRange(); }

  function powerToggle() {
    if (state.booting) return;
    if (state.powered) {
      stopMeasurement(); Object.assign(state, { powered: false, zeroed: false, hold: false, view: 'spot', currentLux: null, displayedLux: null });
      $('screen').className = 'screen off'; $('keypadHint').textContent = 'Comienza pulsando POWER.'; updateAll(); return;
    }
    state.booting = true; $('screen').className = 'screen booting'; $('keypadHint').textContent = 'Autocomprobación del fotodetector…';
    setTimeout(() => { state.booting = false; state.powered = true; state.milestones.power = true; $('screen').className = 'screen on'; $('keypadHint').textContent = 'Comprueba el cero con la tapa opaca.'; updateAll(); showToast('Autocomprobación completada'); }, 950);
  }
  function zeroMeter() {
    if (!state.powered) return needPower();
    if (state.zeroBusy) return;
    stopMeasurement(); state.zeroBusy = true; state.returnView = state.view === 'menu' ? 'spot' : state.view; state.view = 'zero'; $('zeroReading').textContent = '2.7 lx'; $('zeroMessage').textContent = 'Aplicando corrección con tapa opaca…'; updateView();
    setTimeout(() => { $('zeroReading').textContent = '0.0 lx'; $('zeroMessage').textContent = 'ZERO OK · Retira la tapa'; state.zeroed = true; state.zeroBusy = false; state.milestones.zero = true; updateAll(); showToast('Puesta a cero completada'); setTimeout(() => { if (state.view === 'zero') setView(state.returnView || 'spot'); }, 900); }, 1200);
  }
  function needPower() { showToast('Enciende primero el luxómetro'); highlight('#quickPowerBtn'); }
  function startMeasurement() {
    if (!state.powered) return needPower();
    if (!state.zeroed) { showToast('Comprueba primero la puesta a cero'); highlight('#quickZeroBtn'); return; }
    if (state.plane === 'pending') { showToast('Selecciona el plano de medición'); highlight('#planeSelect'); return; }
    if (state.position === 'pending') { showToast('Selecciona la posición del sensor'); highlight('#positionSelect'); return; }
    if (state.view === 'grid') { recordGridPoint(state.selectedPoint); return; }
    if (state.view === 'history' || state.view === 'stats' || state.view === 'menu' || state.view === 'zero') setView('spot');
    if (state.running) { state.hold = !state.hold; updateAll(); showToast(state.hold ? 'Lectura retenida · HOLD' : 'Lectura en vivo'); return; }
    state.running = true; state.hold = false; state.elapsed = 0; state.minLux = null; state.maxLux = null; state.milestones.measured = true; sample(); clearInterval(measureTimer); measureTimer = setInterval(sample, 500); updateAll();
  }
  function stopMeasurement() { clearInterval(measureTimer); measureTimer = null; state.running = false; state.hold = false; }
  function sample() {
    if (!state.running || state.hold) return;
    state.currentLux = scenarioLux(); state.displayedLux = state.currentLux; state.minLux = state.minLux == null ? state.currentLux : Math.min(state.minLux, state.currentLux); state.maxLux = state.maxLux == null ? state.currentLux : Math.max(state.maxLux, state.currentLux); state.elapsed += 1; updateReading(); updateLesson();
  }
  function recordGridPoint(index) {
    if (!state.powered) return needPower();
    if (!state.zeroed) { showToast('Comprueba primero la puesta a cero'); return; }
    if (state.plane === 'pending' || state.position === 'pending') { showToast('Define el plano y la posición del sensor'); return; }
    state.selectedPoint = index; const reading = scenarioLux(index); state.currentLux = reading; state.displayedLux = reading; state.gridReadings[index] = reading;
    state.minLux = state.minLux == null ? reading : Math.min(state.minLux, reading); state.maxLux = state.maxLux == null ? reading : Math.max(state.maxLux, reading);
    state.milestones.grid = true; state.milestones.measured = true; if (state.gridReadings.every(Number.isFinite)) state.milestones.complete = true;
    renderGrid(); updateStats(); updateReading(); updateGuide(); updateLesson(); showToast(`P${index + 1} registrado · ${formatLux(reading)} ${unitLabel()}`);
  }
  function resetGrid() { state.gridReadings = Array(9).fill(null); state.selectedPoint = 0; state.milestones.complete = false; renderGrid(); updateStats(); showToast('Malla reiniciada'); }
  function setSetting(setting, value) {
    if (!state.powered) return needPower();
    if (setting === 'view') return setView(value);
    if (setting === 'unit') { state.unit = value; if (value === 'lux') state.milestones.unit = true; }
    if (setting === 'range') { state.range = value; if (value === '2000') state.milestones.range = true; }
    updateAll();
  }
  function setPlane(value) { state.plane = value; if (value === 'horizontal') state.milestones.plane = true; resetReadingsForCondition(); updateAll(); }
  function setPosition(value) { state.position = value; if (value === 'correct') state.milestones.position = true; resetReadingsForCondition(); updateAll(); }
  function resetReadingsForCondition() { stopMeasurement(); state.currentLux = null; state.displayedLux = null; state.minLux = null; state.maxLux = null; state.gridReadings = Array(9).fill(null); state.milestones.complete = false; }
  function setView(view) {
    if (!state.powered) return needPower();
    if (!['spot', 'grid', 'stats', 'history'].includes(view)) return;
    if (view !== 'spot') stopMeasurement(); state.view = view; if (view === 'grid') state.milestones.grid = true; updateAll();
  }

  function updateReading() {
    if (!state.powered) return;
    const overload = isOverload(); $('mainReading').textContent = overload ? 'OL' : formatLux(state.displayedLux); $('mainUnit').textContent = unitLabel();
    $('minValue').textContent = formatLux(state.minLux); $('maxValue').textContent = formatLux(state.maxLux); $('pointValue').textContent = `P${state.selectedPoint + 1}`;
    $('elapsedValue').textContent = formatTime(state.elapsed); $('clockIndicator').textContent = formatTime(state.elapsed);
    const limit = effectiveRange(); const width = state.currentLux == null ? 0 : Math.min(100, state.currentLux / limit * 100); $('levelBar').style.width = `${width}%`;
    const marks = [0, limit * .25, limit * .5, limit].map(value => value >= 1000 ? `${value / 1000}k` : Math.round(value)); $$('#rangeScale span').forEach((el, i) => { el.textContent = marks[i]; });
    $('statusRun').textContent = overload ? 'OL' : state.hold ? 'HOLD' : state.running ? 'LIVE' : 'LISTO'; $('statusRun').classList.toggle('alert', overload);
  }
  function renderGrid() {
    const grid = $('measurementGrid'); grid.innerHTML = '';
    state.gridReadings.forEach((reading, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `measurement-point${Number.isFinite(reading) ? ' recorded' : ''}${state.selectedPoint === index ? ' selected' : ''}`; button.dataset.index = index;
      button.innerHTML = `<span>P${index + 1}</span><strong>${formatLux(reading)}</strong><small>${Number.isFinite(reading) ? unitLabel() : 'pendiente'}</small>`; button.addEventListener('click', () => recordGridPoint(index)); grid.append(button);
    });
    const count = state.gridReadings.filter(Number.isFinite).length; $('gridProgress').textContent = `${count} / 9`; $('gridInstruction').textContent = count === 9 ? 'Malla completa. Abre Resultados para interpretar.' : `Toca P${state.gridReadings.findIndex(value => !Number.isFinite(value)) + 1 || 1} para trasladar el sensor y registrar.`;
  }
  function statistics() {
    const values = state.gridReadings.filter(Number.isFinite); if (!values.length) return null;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length; const min = Math.min(...values); const max = Math.max(...values); return { count: values.length, avg, min, max, uniformity: min / avg };
  }
  function updateStats() {
    const stats = statistics(); $('statsCount').textContent = `${stats?.count || 0} puntos`; $('avgValue').textContent = formatLux(stats?.avg); $('avgUnit').textContent = unitLabel(); $('statsMin').textContent = formatLux(stats?.min); $('statsMax').textContent = formatLux(stats?.max); $('uniformityValue').textContent = stats ? stats.uniformity.toFixed(2) : '----';
    $('statsHint').textContent = !stats ? 'Registra varios puntos para caracterizar el área.' : stats.count < 9 ? `Resultado provisional con ${stats.count} puntos. Completa la malla.` : stats.uniformity < .6 ? 'La distribución simulada es poco uniforme: revisa zonas oscuras y disposición de luminarias.' : 'La distribución simulada es relativamente uniforme. Aún debes valorar la tarea y otros factores visuales.';
  }
  function renderHistory() {
    $('memoryCount').textContent = `${state.memories.length} ${state.memories.length === 1 ? 'registro' : 'registros'}`; const list = $('historyList'); list.innerHTML = '';
    if (!state.memories.length) { list.innerHTML = '<p>Sin mediciones guardadas</p>'; return; }
    state.memories.forEach((item, index) => { const row = document.createElement('div'); row.className = 'history-item'; row.innerHTML = `<span>${index + 1}</span><div><strong>${item.scenario}</strong><small>${item.plane} · ${item.points} punto${item.points === 1 ? '' : 's'}</small></div><b>${item.value} ${item.unit}</b>`; list.append(row); });
  }
  function saveResult() {
    if (!state.powered) return needPower(); const stats = statistics(); const valueLux = stats?.avg ?? state.displayedLux; if (!Number.isFinite(valueLux)) return showToast('Realiza al menos una medición antes de guardar');
    state.memories.unshift({ scenario: scenarios[state.scenario].name, plane: planeLabels[state.plane], position: positionEffects[state.position].label, points: stats?.count || 1, value: formatLux(valueLux), unit: unitLabel(), uniformity: stats ? stats.uniformity.toFixed(2) : null, date: new Date().toISOString() }); state.memories = state.memories.slice(0, 12); saveMemories(); state.milestones.saved = true; renderHistory(); updateGuide(); showToast('Resultado guardado en la memoria simulada');
  }

  function updateView() {
    ['spotView', 'gridView', 'statsView', 'historyView', 'menuView', 'zeroView'].forEach(id => { $(id).hidden = true; });
    const map = { spot: 'spotView', grid: 'gridView', stats: 'statsView', history: 'historyView', menu: 'menuView', zero: 'zeroView' }; if (state.powered && map[state.view]) $(map[state.view]).hidden = false;
    $('statusMode').textContent = viewLabel();
  }
  function updateControls() {
    $('directPowerState').textContent = state.powered ? 'ON' : 'OFF'; $('directPowerState').classList.toggle('on', state.powered); $('quickPowerBtn').querySelector('strong').textContent = state.powered ? 'Apagar' : 'Encender';
    $$('[data-setting]').forEach(button => button.classList.toggle('active', button.dataset.setting === 'view' ? button.dataset.value === state.view : button.dataset.setting === 'unit' ? button.dataset.value === state.unit : false));
    $('quickRangeSelect').value = state.range; $('planeSelect').value = state.plane; $('positionSelect').value = state.position; $('unitIndicator').textContent = state.unit.toUpperCase(); $('holdIndicator').textContent = state.hold ? 'HOLD' : 'LIVE'; $('rangeIndicator').textContent = state.range;
    $('summaryUnit').textContent = state.unit; $('summaryPlane').textContent = planeLabels[state.plane]; $('summaryPosition').textContent = positionEffects[state.position].label; $('summaryPositionHelp').textContent = positionEffects[state.position].help; $('summaryRange').textContent = state.range;
    $('quickRunBtn').querySelector('strong').textContent = state.running ? state.hold ? 'Continuar' : 'HOLD' : state.view === 'grid' ? 'Registrar' : 'Medir'; $('runBtn').querySelector('small').textContent = state.running ? state.hold ? 'Continuar' : 'HOLD' : 'Medir';
    $('sensorAssembly').className = `sensor-assembly position-${state.position}`;
  }
  function updateInterpretation() {
    const badge = $('qualityBadge'); const text = $('interpretationText'); badge.className = 'risk';
    if (!Number.isFinite(state.displayedLux)) { badge.classList.add('neutral'); badge.textContent = 'Sin medición'; text.textContent = 'Enciende, comprueba el cero y realiza una lectura.'; return; }
    if (isOverload()) { badge.classList.add('high'); badge.textContent = 'Sobrecarga'; text.textContent = 'La lectura supera el rango seleccionado. Aumenta el rango y repite; OL no es un resultado válido.'; return; }
    if (state.position !== 'correct') { badge.classList.add('high'); badge.textContent = 'Lectura sesgada'; text.textContent = `La posición “${positionEffects[state.position].label}” reduce artificialmente la lectura. Corrige el sensor antes de interpretar.`; return; }
    const scenario = scenarios[state.scenario]; const [low, high] = scenario.reference; const value = state.displayedLux;
    if (value < low) { badge.classList.add('medium'); badge.textContent = 'Bajo en práctica'; text.textContent = `Para este escenario didáctico, la lectura queda por debajo del intervalo de referencia ${low}–${high} lx. No es un dictamen normativo.`; }
    else if (value > high) { badge.classList.add('medium'); badge.textContent = 'Sobre referencia'; text.textContent = `La cantidad de luz supera la referencia pedagógica. Más lux no siempre significa mejor: revisa deslumbramiento y contraste.`; }
    else { badge.classList.add('low'); badge.textContent = 'En referencia'; text.textContent = `La lectura está dentro de la referencia pedagógica ${low}–${high} lx. Completa la malla y valora uniformidad y deslumbramiento.`; }
  }
  function updateLesson(topic) {
    if (topic && lessonTopics[topic]) { const [kicker, title, what, purpose, interpretation] = lessonTopics[topic]; setLesson(kicker, title, what, purpose, interpretation); return; }
    if (!state.powered) { setLesson('PREPARACIÓN', 'Antes de medir', 'Es la revisión previa del instrumento y su fotodetector.', 'Permite detectar daños, suciedad, batería insuficiente o una configuración inadecuada.', 'El difusor debe estar limpio, íntegro y con calibración vigente antes de comprobar el cero.'); }
    else if (!state.zeroed) { setLesson('VERIFICACIÓN', 'Puesta a cero con tapa', 'Es una comprobación del desplazamiento del equipo sin luz incidente.', 'Ayuda a evitar que un offset electrónico se sume a todas las lecturas.', 'La pantalla debe estabilizarse en 0.0 con el sensor completamente cubierto. No sustituye la calibración.'); }
    else if (state.view === 'grid') { setLesson('DISTRIBUCIÓN ESPACIAL', 'Una lectura no describe toda el área', 'La malla divide el área en puntos para observar variaciones de iluminancia.', 'Permite encontrar zonas oscuras que un promedio o un punto aislado pueden ocultar.', 'Completa todos los puntos y revisa promedio, mínimo y uniformidad.'); }
    else if (state.view === 'stats') { setLesson('ANÁLISIS', 'Promedio y uniformidad', 'Son indicadores resumidos de la magnitud y la distribución espacial.', 'Ayudan a distinguir “cantidad suficiente” de “distribución homogénea”.', 'La uniformidad Emin/Eprom se acerca a 1 cuando las lecturas son parecidas.'); }
    else { setLesson('LECTURA PUNTUAL', 'Iluminancia sobre el plano', 'La lectura indica cuánta luz llega al fotodetector en ese punto.', 'Describe la iluminación incidente exactamente donde está ubicado el sensor.', 'Antes de comparar, confirma unidad, rango, plano y ausencia de sombra.'); }
  }
  function setLesson(kicker, title, what, purpose, interpretation) { $('lessonKicker').textContent = kicker; $('lessonTitle').textContent = title; $('lessonText').textContent = what; $('lessonPurpose').textContent = purpose; $('lessonInterpret').textContent = interpretation; }
  function updateGuide() {
    $$('#guideChecklist li').forEach(item => { item.classList.toggle('done', !!state.milestones[item.dataset.guideKey]); item.classList.remove('current'); });
    const index = guideSteps.findIndex(step => !state.milestones[step.key]); const complete = index === -1; const currentIndex = complete ? guideSteps.length - 1 : index; const done = Object.values(state.milestones).filter(Boolean).length; const percent = Math.round(done / guideSteps.length * 100);
    $('guideProgress').style.width = `${percent}%`; $('guidePercent').textContent = `${percent}%`; $('guideCard').classList.toggle('complete', complete); $('guideProgress').parentElement.setAttribute('aria-valuenow', String(percent));
    if (complete) { $('guideStep').textContent = 'Práctica completada'; $('guideTitle').textContent = 'Recorrido profesional completo'; $('guideText').textContent = 'Ya puedes cambiar de escenario, provocar errores de posición y comparar resultados.'; $('locateStepBtn').hidden = true; $('guideCoach').classList.remove('show'); return; }
    const step = guideSteps[currentIndex]; $(`#guideChecklist li[data-guide-key="${step.key}"]`)?.classList.add('current'); $('guideStep').textContent = `Paso ${currentIndex + 1} de ${guideSteps.length}`; $('guideTitle').textContent = step.title; $('guideText').textContent = step.text; $('locateStepBtn').hidden = !state.guided;
    $('guideCoachStep').textContent = `SIGUIENTE · PASO ${currentIndex + 1} DE ${guideSteps.length}`; $('guideCoachTitle').textContent = step.title; $('guideCoachText').textContent = step.coach; $('guideCoach').classList.toggle('show', state.guided);
    if (lastGuideIndex !== currentIndex) { lastGuideIndex = currentIndex; }
  }
  function locateCurrentStep() { const step = guideSteps.find(item => !state.milestones[item.key]); if (!step) return; const target = document.querySelector(step.target); if (!target) return showToast('Completa primero la acción anterior'); target.scrollIntoView({ behavior: 'smooth', block: 'center' }); highlightElement(target); }
  function highlight(selector) { const el = document.querySelector(selector); if (el) highlightElement(el); }
  function highlightElement(el) { el.classList.add('guide-target'); setTimeout(() => el.classList.remove('guide-target'), 1800); }

  function openMenu() { if (!state.powered) return needPower(); stopMeasurement(); state.returnView = ['spot', 'grid', 'stats', 'history'].includes(state.view) ? state.view : 'spot'; state.view = 'menu'; state.menuCategory = null; state.menuIndex = 0; renderMenu(); updateAll(); }
  function renderMenu() {
    const items = state.menuCategory ? choices[state.menuCategory] : rootMenu; $('menuTitle').textContent = state.menuCategory ? rootMenu.find(i => i.id === state.menuCategory)?.label.toUpperCase() : 'CONFIGURACIÓN'; $('menuList').innerHTML = '';
    items.forEach((item, index) => { const button = document.createElement('button'); button.type = 'button'; button.className = index === state.menuIndex ? 'selected' : ''; const value = state.menuCategory ? (item.value === state[state.menuCategory] ? '✓' : '') : item.value(); button.innerHTML = `<span>${item.label}</span><strong>${value}</strong>`; button.addEventListener('click', () => { state.menuIndex = index; chooseMenu(); }); $('menuList').append(button); });
  }
  function moveMenu(delta) { if (state.view === 'grid') { state.selectedPoint = (state.selectedPoint + delta + 9) % 9; renderGrid(); return; } if (state.view !== 'menu') return; const items = state.menuCategory ? choices[state.menuCategory] : rootMenu; state.menuIndex = (state.menuIndex + delta + items.length) % items.length; renderMenu(); }
  function chooseMenu() {
    if (state.view === 'grid') return recordGridPoint(state.selectedPoint);
    if (state.view !== 'menu') return;
    if (state.menuCategory) { const choice = choices[state.menuCategory][state.menuIndex]; const category = state.menuCategory; state.menuCategory = null; state.menuIndex = 0; setSetting(category, choice.value); if (state.view === 'menu') renderMenu(); return; }
    const item = rootMenu[state.menuIndex];
    if (choices[item.id]) { state.menuCategory = item.id; state.menuIndex = Math.max(0, choices[item.id].findIndex(choice => choice.value === state[item.id])); renderMenu(); }
    else if (item.id === 'zero') zeroMeter(); else if (item.id === 'hold') { if (state.running) state.hold = !state.hold; else startMeasurement(); updateAll(); } else if (item.id === 'memory') setView('history'); else if (item.id === 'reset') { resetGrid(); renderMenu(); } else if (item.id === 'info') showToast('MLX–PRO 900 · Simulador didáctico');
  }
  function goBack() { if (state.view === 'menu' && state.menuCategory) { state.menuCategory = null; state.menuIndex = 0; renderMenu(); } else if (state.view === 'menu' || state.view === 'zero') setView(state.returnView || 'spot'); else setView('spot'); }

  function updateAll() {
    updateView(); updateControls(); updateReading(); renderGrid(); updateStats(); renderHistory(); updateInterpretation(); updateLesson(); updateGuide();
    $('learningStatus').textContent = !state.powered ? 'Equipo apagado' : state.zeroBusy ? 'Verificando cero' : state.running ? state.hold ? 'Lectura retenida' : 'Midiendo' : state.zeroed ? 'Listo para medir' : 'Cero pendiente';
  }
  function changeScenario() { state.scenario = $('scenarioSelect').value; $('scenarioName').textContent = scenarios[state.scenario].name; $('scenarioDescription').textContent = scenarios[state.scenario].description; resetReadingsForCondition(); updateAll(); showToast('Escenario cambiado; repite la medición'); }

  function openTutorial() { tutorialIndex = 0; renderTutorial(); $('tutorialDialog').showModal(); }
  function renderTutorial() { $$('[data-tutorial-step]').forEach((page, index) => { page.hidden = index !== tutorialIndex; }); $('tutorialCounter').textContent = `${tutorialIndex + 1} de 3`; $$('.tutorial-status i').forEach((dot, index) => dot.classList.toggle('active', index === tutorialIndex)); $('tutorialBackBtn').hidden = tutorialIndex === 0; $('tutorialNextBtn').hidden = tutorialIndex === 2; $('tutorialStartBtn').hidden = tutorialIndex !== 2; }
  function searchManual() { const query = $('manualSearch').value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); let found = 0; $$('.function-manual details').forEach(detail => { const haystack = detail.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); const match = !query || haystack.includes(query); detail.hidden = !match; if (match) found += 1; if (query && match) detail.open = true; }); $('manualEmpty').hidden = found > 0; }

  function bindEvents() {
    $('memberLogin').addEventListener('submit', submitMemberLogin); $('togglePassword').addEventListener('click', () => { const show = $('memberPassword').type === 'password'; $('memberPassword').type = show ? 'text' : 'password'; $('togglePassword').textContent = show ? 'Ocultar' : 'Mostrar'; $('togglePassword').setAttribute('aria-pressed', String(show)); }); $('logoutBtn').addEventListener('click', () => closeMemberSession(false));
    [$('powerBtn'), $('quickPowerBtn'), $('mobilePowerBtn')].forEach(button => button.addEventListener('click', () => { pressKey(button); powerToggle(); }));
    $('quickZeroBtn').addEventListener('click', zeroMeter); [$('runBtn'), $('quickRunBtn'), $('mobileRunBtn')].forEach(button => button.addEventListener('click', () => { pressKey(button); startMeasurement(); })); [$('saveBtn'), $('quickSaveBtn')].forEach(button => button.addEventListener('click', () => { pressKey(button); saveResult(); }));
    [$('menuBtn'), $('mobileMenuBtn')].forEach(button => button.addEventListener('click', openMenu)); $('upBtn').addEventListener('click', () => moveMenu(-1)); $('downBtn').addEventListener('click', () => moveMenu(1)); $('okBtn').addEventListener('click', chooseMenu); $('backBtn').addEventListener('click', goBack);
    $$('[data-setting]').forEach(button => button.addEventListener('click', () => setSetting(button.dataset.setting, button.dataset.value))); $('quickRangeSelect').addEventListener('change', event => setSetting('range', event.target.value)); $('planeSelect').addEventListener('change', event => setPlane(event.target.value)); $('positionSelect').addEventListener('change', event => setPosition(event.target.value)); $('scenarioSelect').addEventListener('change', changeScenario);
    $('guidedToggle').addEventListener('click', () => { state.guided = !state.guided; $('guidedToggle').classList.toggle('active', state.guided); $('guidedToggle').setAttribute('aria-pressed', String(state.guided)); updateGuide(); }); $('locateStepBtn').addEventListener('click', locateCurrentStep); $('guideCoachLocate').addEventListener('click', locateCurrentStep);
    [$('helpBtn'), $('mobileHelpBtn'), $('explainCurrentBtn')].forEach(button => button.addEventListener('click', () => $('helpDialog').showModal())); $('tutorialBtn').addEventListener('click', openTutorial); $('manualTutorialBtn').addEventListener('click', () => { $('helpDialog').close(); openTutorial(); });
    $$('.setting-explain').forEach(button => button.addEventListener('click', () => updateLesson(button.dataset.topic))); $('manualSearch').addEventListener('input', searchManual); $$('.manual-nav button').forEach(button => button.addEventListener('click', () => { const target = $(button.dataset.manualTarget); target.hidden = false; target.open = true; target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    $('tutorialBackBtn').addEventListener('click', () => { tutorialIndex = Math.max(0, tutorialIndex - 1); renderTutorial(); }); $('tutorialNextBtn').addEventListener('click', () => { tutorialIndex = Math.min(2, tutorialIndex + 1); renderTutorial(); }); $('tutorialStartBtn').addEventListener('click', () => { localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); state.guided = true; $('guidedToggle').classList.add('active'); $('tutorialDialog').close(); locateCurrentStep(); }); $('tutorialSkipBtn').addEventListener('click', () => localStorage.setItem(TUTORIAL_SEEN_KEY, '1'));
    document.addEventListener('keydown', event => {
      if ($('appShell').hidden || $('helpDialog').open || $('tutorialDialog').open || ['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const key = event.key.toLowerCase(); if (key === 'p') powerToggle(); else if (key === 'm') openMenu(); else if (key === 'arrowup') moveMenu(-1); else if (key === 'arrowdown') moveMenu(1); else if (key === 'enter') chooseMenu(); else if (key === ' ') { event.preventDefault(); startMeasurement(); } else if (key === 's') saveResult(); else if (key === 'escape') goBack();
    });
  }

  function init() { bindEvents(); renderGrid(); renderHistory(); updateAll(); initializeAccessGate(); }
  init();
})();
