(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const FC = 10.764;

  const SUPABASE_URL = 'https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const ACCESS_SESSION_KEY = 'movida-sst-luxometro-session';
  const ACCESS_ATTEMPTS_KEY = 'movida-sst-luxometro-attempts';
  const MEMORY_KEY = 'movida-sst-luxometro-v2-memory';
  const ACCESS_DURATION = 20 * 60 * 1000;
  const BLOCK_DURATION = 15 * 60 * 1000;
  const MAX_ATTEMPTS = 5;

  const scenarios = {
    office: {
      name: 'Oficina · escritura, lectura y datos',
      task: 'Escritura, lectura y tratamiento de datos', ref: '34.2',
      norm: { required: 500, modified: 1000, uo: 0.60, ra: 80, ugr: 19, cyl: 150 },
      base: 535, variability: 11, pattern: 'uniform', defaultPlane: 'horizontal', defaultLight: 'electric', defaultLS: 'L1',
      planes: { horizontal: 1, vertical: 0.78, floor: 0.70 }
    },
    precision: {
      name: 'Área de inspección', task: 'Área de inspección en taller de maquinaria', ref: '26.6',
      norm: { required: 750, modified: 1000, uo: 0.70, ra: 80, ugr: 19, cyl: 150 },
      base: 870, variability: 20, pattern: 'center', defaultPlane: 'horizontal', defaultLight: 'electric', defaultLS: 'L1',
      planes: { horizontal: 1, vertical: 0.64, floor: 0.42 }
    },
    warehouse: {
      name: 'Almacén · estanterías, suelo', task: 'Almacenamiento en estanterías — suelo', ref: '13.5',
      norm: { required: 150, modified: 200, uo: 0.50, ra: 80, ugr: 25, cyl: null },
      base: 185, variability: 7, pattern: 'stripes', defaultPlane: 'floor', defaultLight: 'electric', defaultLS: 'L0',
      planes: { horizontal: 0.88, vertical: 0.54, floor: 1 }
    },
    corridor: {
      name: 'Pasillo logístico · circulación densa', task: 'Pasillo central logístico (circulación densa)', ref: '13.7',
      norm: { required: 300, modified: 500, uo: 0.60, ra: 80, ugr: 25, cyl: 100 },
      base: 345, variability: 8, pattern: 'longitudinal', defaultPlane: 'floor', defaultLight: 'electric', defaultLS: 'L0',
      planes: { horizontal: 0.90, vertical: 0.62, floor: 1 }
    },
    window: {
      name: 'Oficina próxima a ventana', task: 'Escritura, lectura y tratamiento de datos', ref: '34.2',
      norm: { required: 500, modified: 1000, uo: 0.60, ra: 80, ugr: 19, cyl: 150 },
      base: 650, variability: 28, pattern: 'window', defaultPlane: 'horizontal', defaultLight: 'mixed', defaultLS: 'L1',
      planes: { horizontal: 1, vertical: 1.05, floor: 0.70 }
    }
  };

  const sourceProfiles = {
    L0: { label: 'L0 · estándar', factor: 1.000 },
    L1: { label: 'L1 · LED luz de día', factor: 0.990 },
    L2: { label: 'L2 · LED roja', factor: 0.516 },
    L3: { label: 'L3 · LED ámbar', factor: 0.815 },
    L4: { label: 'L4 · LED verde', factor: 1.216 },
    L5: { label: 'L5 · LED azul', factor: 1.475 },
    L6: { label: 'L6 · LED morada', factor: 1.148 },
    L7: { label: 'L7 · estándar', factor: 1.000 },
    L8: { label: 'L8 · estándar', factor: 1.000 },
    L9: { label: 'L9 · estándar', factor: 1.000 }
  };

  const positionFactors = { correct: 1, shadow: 0.64, partial: 0.30 };
  const positionLabels = { correct: 'Correcta', shadow: 'Sombra del evaluador', partial: 'Sensor parcialmente cubierto' };
  const planeLabels = { horizontal: 'Horizontal · tarea', vertical: 'Vertical', floor: 'Nivel del suelo' };
  const areaLabels = { task: 'Área de tarea / actividad', immediate: 'Área circundante inmediata', background: 'Área de fondo' };

  const state = {
    powered: false, booting: false, conditioned: false, conditioning: false, zeroed: false, coverOn: false,
    running: false, hold: false, unit: 'lux', range: 'AUTO', readMode: 'live', rel: false, relReferenceLux: null, peakMode: false,
    scenario: 'office', plane: 'horizontal', lightCondition: 'electric', position: 'correct', angle: 0, lsProfile: 'L1', view: 'spot', guided: true,
    currentLux: null, displayedLux: null, minLux: null, maxLux: null, peakLux: null, elapsed: 0, runStartedAt: 0,
    grid: { length: 6, width: 4, area: 'task', rows: 0, cols: 0, cell: 0, readings: [], generated: false },
    cyl: { readings: { 0: null, 90: null, 180: null, 270: null }, height: 1.2 },
    memories: loadMemories(), memberName: 'integrante'
  };

  let measureTimer = null;
  let accessTimer = null;
  let toastTimer = null;

  function readJson(storage, key, fallback) { try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
  function writeJson(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); } catch {} }
  function loadMemories() { return readJson(localStorage, MEMORY_KEY, []).slice(0, 30); }
  function saveMemories() { writeJson(localStorage, MEMORY_KEY, state.memories.slice(0, 30)); }
  function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2500); }
  function fmtTime(sec) { const s = Math.max(0, Math.floor(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function unitLabel() { return state.unit === 'lux' ? 'lx' : 'fc'; }
  function toDisplay(lux) { return state.unit === 'lux' ? lux : lux / FC; }
  function rangeOptions() { return state.unit === 'lux' ? [20, 200, 2000, 20000, 200000] : [20, 200, 2000, 20000]; }
  function resolutionFor(range) { return ({ 20: .01, 200: .1, 2000: 1, 20000: 10, 200000: 100 })[range] || 1; }
  function effectiveRangeDisplay(lux = state.currentLux) {
    const val = Math.abs(toDisplay(Number.isFinite(lux) ? lux : scenarios[state.scenario].base));
    if (state.range !== 'AUTO') return Number(state.range);
    return rangeOptions().find(r => val <= r) || rangeOptions().at(-1);
  }
  function isOverload(lux = state.currentLux) { return Number.isFinite(lux) && Math.abs(toDisplay(lux)) > effectiveRangeDisplay(lux); }
  function roundedDisplayValue(lux) {
    if (!Number.isFinite(lux)) return null;
    const range = effectiveRangeDisplay(lux); const res = resolutionFor(range); const v = toDisplay(lux);
    return Math.round(v / res) * res;
  }
  function formatDisplayValue(lux) {
    if (!Number.isFinite(lux)) return '----';
    const v = roundedDisplayValue(lux); const range = effectiveRangeDisplay(lux); const res = resolutionFor(range);
    if (res < 0.1) return v.toFixed(2);
    if (res < 1) return v.toFixed(1);
    return Math.round(v).toLocaleString('es-ES');
  }

  function populateSourceProfiles() {
    $('sourceProfileSelect').innerHTML = Object.entries(sourceProfiles).map(([k, v]) => `<option value="${k}">${v.label} · ×${v.factor.toFixed(3)}</option>`).join('');
    $('sourceProfileSelect').value = state.lsProfile;
  }
  function populateRanges() {
    const current = state.range;
    $('rangeSelect').innerHTML = '<option value="AUTO">AUTO</option>' + rangeOptions().map(r => `<option value="${r}">0–${r.toLocaleString('es-ES')} ${state.unit === 'lux' ? 'lx' : 'fc'}</option>`).join('');
    state.range = current === 'AUTO' || rangeOptions().includes(Number(current)) ? current : 'AUTO';
    $('rangeSelect').value = state.range;
  }

  function scenario() { return scenarios[state.scenario]; }
  function resetMeasurements({ keepGrid = false } = {}) {
    stopMeasurement(); Object.assign(state, { currentLux: null, displayedLux: null, minLux: null, maxLux: null, peakLux: null, elapsed: 0, rel: false, relReferenceLux: null, readMode: 'live', peakMode: false });
    if (!keepGrid) { state.grid.readings = Array(state.grid.rows * state.grid.cols).fill(null); state.grid.generated = state.grid.rows > 0; }
    state.cyl.readings = { 0: null, 90: null, 180: null, 270: null };
  }

  function spatialFactorForIndex(index, rows = state.grid.rows, cols = state.grid.cols) {
    if (!rows || !cols) return 1;
    const r = Math.floor(index / cols), c = index % cols;
    const x = cols <= 1 ? .5 : c / (cols - 1), y = rows <= 1 ? .5 : r / (rows - 1);
    switch (scenario().pattern) {
      case 'center': {
        const d = Math.hypot(x - .5, y - .5) / .707; return 1.18 - .48 * clamp(d, 0, 1);
      }
      case 'stripes': return clamp(1.08 - (c % 3 === 1 ? .38 : 0) - .08 * y, .55, 1.15);
      case 'longitudinal': return .86 + .22 * Math.sin((x + .15) * Math.PI) - .05 * y;
      case 'window': return 1.55 - 1.02 * x + .08 * Math.sin(y * Math.PI);
      default: return .92 + .12 * Math.sin((x + .1) * Math.PI) + .04 * Math.cos(y * Math.PI * 2);
    }
  }

  function cosineInstrumentFactor(angle) {
    if (angle >= 60) return 0.94;
    if (angle >= 30) return 0.98;
    return 1;
  }

  function simulatedLux(spatial = 1) {
    if (!state.powered) return null;
    const t = performance.now() / 1000;
    if (state.coverOn) {
      const offset = state.zeroed ? 0.04 : 2.7;
      return Math.max(0, offset + Math.sin(t * 2.1) * 0.03);
    }
    const s = scenario();
    const plane = s.planes[state.plane] ?? 1;
    const position = positionFactors[state.position] ?? 1;
    const angleRad = state.angle * Math.PI / 180;
    const geometric = Math.max(0, Math.cos(angleRad));
    const cosineDeviation = cosineInstrumentFactor(state.angle);
    const spectral = sourceProfiles[state.lsProfile].factor;
    const conditioning = state.conditioned ? 1 : 1.02 + 0.012 * Math.sin(t / 2.3);
    const zeroOffset = state.zeroed ? 0 : 2.7;
    const wave = Math.sin(t * 1.8 + spatial * 4.2) * s.variability * .32;
    const jitter = (Math.random() - .5) * s.variability * .22;
    return Math.max(0, s.base * spatial * plane * position * geometric * cosineDeviation * spectral * conditioning + wave + jitter + zeroOffset);
  }

  function displaySourceLux() {
    let lux = state.currentLux;
    if (state.peakMode && Number.isFinite(state.peakLux)) lux = state.peakLux;
    else if (state.readMode === 'max' && Number.isFinite(state.maxLux)) lux = state.maxLux;
    else if (state.readMode === 'min' && Number.isFinite(state.minLux)) lux = state.minLux;
    if (state.rel && Number.isFinite(lux) && Number.isFinite(state.relReferenceLux)) lux -= state.relReferenceLux;
    return lux;
  }

  function sample() {
    if (!state.running || state.hold) return;
    const v = simulatedLux(1);
    state.currentLux = v; state.displayedLux = v;
    state.minLux = state.minLux == null ? v : Math.min(state.minLux, v);
    state.maxLux = state.maxLux == null ? v : Math.max(state.maxLux, v);
    state.peakLux = state.peakLux == null ? v : Math.max(state.peakLux, v);
    state.elapsed = (performance.now() - state.runStartedAt) / 1000;
    updateAll(false);
  }

  function powerToggle() {
    if (state.booting) return;
    if (state.powered) {
      stopMeasurement(); state.powered = false; state.conditioned = false; state.conditioning = false; state.zeroed = false; resetMeasurements({ keepGrid: true }); updateAll(); return;
    }
    state.booting = true; updateAll();
    setTimeout(() => { state.booting = false; state.powered = true; toast('Autocomprobación completada'); updateAll(); }, 850);
  }

  function conditionSensor() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    if (state.coverOn) return toast('Retira la tapa para exponer el detector a la luz');
    if (state.conditioned || state.conditioning) return;
    state.conditioning = true; updateAll(); toast('Simulando estabilización equivalente a 2 minutos');
    setTimeout(() => { state.conditioning = false; state.conditioned = true; updateAll(); toast('Sensor estabilizado'); }, 1800);
  }

  function zeroMeter() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    if (!state.coverOn) { toast('ZERO requiere el sensor cubierto con la tapa'); highlight('#sensorCapBtn'); return; }
    stopMeasurement(); $('screenMessage').textContent = 'ADJ';
    setTimeout(() => { state.zeroed = true; state.currentLux = 0; state.displayedLux = 0; updateAll(); toast('ZERO OK · retira la tapa antes de medir'); }, 900);
  }

  function startStopMeasurement() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    if (state.running) { stopMeasurement(); updateAll(); toast('Medición detenida'); return; }
    if (state.coverOn) return toast('Retira la tapa del fotodetector');
    if (!state.conditioned) toast('Consejo: estabiliza primero el detector');
    if (!state.zeroed) toast('Consejo: comprueba el cero antes de medir');
    state.running = true; state.hold = false; state.runStartedAt = performance.now(); state.elapsed = 0;
    state.minLux = null; state.maxLux = null; state.peakLux = null; sample(); clearInterval(measureTimer); measureTimer = setInterval(sample, 500); updateAll();
  }
  function stopMeasurement() { clearInterval(measureTimer); measureTimer = null; state.running = false; state.hold = false; }

  function toggleHold() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    if (!state.running) return toast('Inicia una medición para usar HOLD');
    state.hold = !state.hold; updateAll(); toast(state.hold ? 'HOLD · lectura retenida' : 'Lectura en vivo');
  }
  function cycleReadMode() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    state.readMode = state.readMode === 'live' ? 'max' : state.readMode === 'max' ? 'min' : 'live'; updateAll();
  }
  function toggleRel() {
    if (!state.powered || !Number.isFinite(state.currentLux)) return toast('Realiza una lectura antes de activar REL');
    state.rel = !state.rel; state.relReferenceLux = state.rel ? state.currentLux : null; updateAll(); toast(state.rel ? 'REL · referencia fijada' : 'REL desactivado');
  }
  function togglePeak() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    state.peakMode = !state.peakMode; updateAll(); toast(state.peakMode ? 'PEAK activado' : 'PEAK desactivado');
  }
  function cycleRange() {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    const opts = rangeOptions();
    if (state.range === 'AUTO') state.range = String(opts[0]);
    else { const i = opts.indexOf(Number(state.range)); state.range = String(opts[(i + 1) % opts.length]); }
    $('rangeSelect').value = state.range; updateAll();
  }
  function autoRange() { state.range = 'AUTO'; $('rangeSelect').value = 'AUTO'; updateAll(); toast('Rango automático'); }
  function changeUnit(unit) {
    state.unit = unit; state.range = 'AUTO'; populateRanges(); updateAll();
  }
  function cycleUnit() { changeUnit(state.unit === 'lux' ? 'fc' : 'lux'); }
  function cycleSource() {
    const keys = Object.keys(sourceProfiles); const i = keys.indexOf(state.lsProfile); state.lsProfile = keys[(i + 1) % keys.length]; $('sourceProfileSelect').value = state.lsProfile; resetMeasurements({ keepGrid: true }); updateAll();
  }

  function toggleCover() {
    state.coverOn = !state.coverOn; $('sensorCapBtn').setAttribute('aria-pressed', String(state.coverOn));
    if (state.coverOn) stopMeasurement(); updateAll(); toast(state.coverOn ? 'Tapa colocada' : 'Tapa retirada');
  }

  function requiredImmediate(taskEm) {
    if (taskEm >= 750) return 500;
    if (taskEm >= 500) return 300;
    if (taskEm >= 300) return 200;
    if (taskEm >= 200) return 150;
    return taskEm;
  }
  function normForArea(area = state.grid.area) {
    const n = scenario().norm;
    if (area === 'task') return { required: n.required, uo: n.uo, label: areaLabels.task };
    if (area === 'immediate') return { required: requiredImmediate(n.required), uo: .40, label: areaLabels.immediate };
    const immediate = requiredImmediate(n.required);
    return { required: immediate / 3, uo: .10, label: areaLabels.background };
  }

  function gridGeometry(length, width) {
    const L = clamp(Number(length) || 1, .5, 100), W = clamp(Number(width) || 1, .5, 100);
    const long = Math.max(L, W), short = Math.min(L, W), aspect = long / short;
    const relevant = aspect >= 2 ? short : long;
    const p = Math.min(10, 0.2 * Math.pow(5, Math.log10(relevant)));
    const nRelevant = Math.max(1, Math.round(relevant / p));
    const spacing = relevant / nRelevant;
    let nLong, nShort;
    if (aspect >= 2) { nShort = nRelevant; nLong = Math.max(1, Math.round(long / spacing)); }
    else { nLong = nRelevant; nShort = Math.max(1, Math.round(short / spacing)); }
    const rows = L >= W ? nLong : nShort;
    const cols = L >= W ? nShort : nLong;
    return { length: L, width: W, rows, cols, p, spacingL: L / rows, spacingW: W / cols };
  }

  function generateGrid() {
    const g = gridGeometry($('areaLength').value, $('areaWidth').value);
    state.grid = { ...state.grid, ...g, area: $('areaTypeSelect').value, readings: Array(g.rows * g.cols).fill(null), generated: true };
    renderGrid(); updateResults(); updateGuide(); toast(`Rejilla generada · ${g.rows * g.cols} puntos`);
  }

  function recordGridPoint(index) {
    if (!state.grid.generated) return toast('Genera primero la rejilla');
    if (!state.powered) return toast('Enciende primero el luxómetro');
    if (state.coverOn) return toast('Retira la tapa del sensor');
    if (!state.conditioned || !state.zeroed) toast('La lectura se registrará, pero la preparación está incompleta');
    const spatial = spatialFactorForIndex(index);
    const reading = simulatedLux(spatial);
    state.grid.readings[index] = reading;
    state.currentLux = reading; state.displayedLux = reading;
    renderGrid(); updateResults(); updateAll(false); toast(`P${index + 1}: ${formatDisplayValue(reading)} ${unitLabel()}`);
  }
  function recordNextGrid() {
    if (!state.grid.generated) return generateGrid();
    const i = state.grid.readings.findIndex(v => !Number.isFinite(v));
    if (i < 0) return toast('Rejilla completa');
    recordGridPoint(i);
  }
  function resetGridReadings() { if (!state.grid.generated) return; state.grid.readings = Array(state.grid.rows * state.grid.cols).fill(null); renderGrid(); updateResults(); toast('Lecturas de rejilla reiniciadas'); }
  function gridStats() {
    const vals = state.grid.readings.filter(Number.isFinite); if (!vals.length) return null;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length, min = Math.min(...vals), max = Math.max(...vals);
    return { count: vals.length, total: state.grid.readings.length, avg, min, max, uo: min / avg };
  }

  function recordCyl(dir) {
    if (!state.powered) return toast('Enciende primero el luxómetro');
    if (state.coverOn) return toast('Retira la tapa');
    const target = scenario().norm.cyl || scenario().norm.required * .30;
    const dirs = { 0: 1.14, 90: .93, 180: .84, 270: 1.06 };
    const spectral = sourceProfiles[state.lsProfile].factor;
    const position = positionFactors[state.position];
    const reading = Math.max(0, target * dirs[dir] * spectral * position + (Math.random() - .5) * target * .04);
    state.cyl.readings[dir] = reading; renderCyl(); toast(`${dir}° registrado · ${formatDisplayValue(reading)} ${unitLabel()}`);
  }
  function cylAverageLux() {
    const vals = Object.values(state.cyl.readings).filter(Number.isFinite); return vals.length === 4 ? vals.reduce((a, b) => a + b, 0) / 4 : null;
  }

  function setView(view) {
    state.view = view;
    ['spot', 'grid', 'cyl', 'results', 'memory'].forEach(v => { $(`${v}View`).hidden = v !== view; });
    $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'results') updateResults(); if (view === 'memory') renderMemory(); updateLesson();
  }

  function updateScenario() {
    state.scenario = $('scenarioSelect').value; const s = scenario();
    state.plane = s.defaultPlane; state.lightCondition = s.defaultLight; state.lsProfile = s.defaultLS;
    $('planeSelect').value = state.plane; $('lightConditionSelect').value = state.lightCondition; $('sourceProfileSelect').value = state.lsProfile;
    state.grid.generated = false; state.grid.rows = 0; state.grid.cols = 0; state.grid.readings = [];
    resetMeasurements(); renderGrid(); updateAll(); toast('Escenario actualizado');
  }

  function updateInstrument() {
    $('screen').classList.toggle('off', !state.powered && !state.booting);
    $('screen').classList.toggle('booting', state.booting);
    $('sensorRig').className = `sensor-rig ${state.coverOn ? 'covered' : ''} angle-${state.angle} position-${state.position}`;
    $('capLabel').textContent = state.coverOn ? 'Tapa colocada' : 'Tapa retirada';
    $('modeIndicator').textContent = state.range === 'AUTO' ? 'AUTO' : 'MANU'; $('sourceIndicator').textContent = state.lsProfile;
    $('holdIndicator').textContent = state.hold ? 'HOLD' : state.peakMode ? 'PEAK' : state.readMode === 'max' ? 'MAX' : state.readMode === 'min' ? 'MIN' : 'LIVE';
    $('rangeIndicator').textContent = state.range === 'AUTO' ? `AUTO ${effectiveRangeDisplay().toLocaleString('es-ES')}` : `${Number(state.range).toLocaleString('es-ES')}`;
    $('relIndicator').textContent = state.rel ? 'REL' : 'ABS'; $('timerIndicator').textContent = fmtTime(state.elapsed); $('mainUnit').textContent = unitLabel();
    $('minReading').textContent = formatDisplayValue(state.minLux); $('maxReading').textContent = formatDisplayValue(state.maxLux); $('peakReading').textContent = formatDisplayValue(state.peakLux);
    const screenLux = displaySourceLux();
    if (!state.powered) { $('mainReading').textContent = '----'; $('screenMessage').textContent = 'OFF'; $('analogBar').style.width = '0%'; }
    else if (state.booting) { $('mainReading').textContent = '8888'; $('screenMessage').textContent = 'SELF TEST'; }
    else if (isOverload(screenLux)) { $('mainReading').textContent = 'OL'; $('screenMessage').textContent = 'SUBE DE RANGO'; $('analogBar').style.width = '100%'; }
    else {
      $('mainReading').textContent = formatDisplayValue(screenLux);
      const pct = Number.isFinite(screenLux) ? clamp(Math.abs(toDisplay(screenLux)) / effectiveRangeDisplay(screenLux) * 100, 0, 100) : 0; $('analogBar').style.width = `${pct}%`;
      $('screenMessage').textContent = state.coverOn ? (state.zeroed ? '0.00 · CAP' : 'CAP · ZERO?') : state.running ? (state.hold ? 'DATA HOLD' : 'MEAS') : state.zeroed ? 'READY' : 'ZERO PEND.';
    }
    $('runBtn').classList.toggle('active', state.running); $('mobileRunBtn').classList.toggle('active', state.running);
    $('runBtn').querySelector('small').textContent = state.running ? 'DETENER' : 'MEDIR'; $('mobileRunBtn').innerHTML = `<span>${state.running ? '■' : '▶'}</span>${state.running ? 'Parar' : 'Medir'}`;
    $('sensorStatus').textContent = state.conditioning ? 'Estabilizando…' : state.conditioned ? 'Estabilizado' : 'Sin estabilizar';
    $('zeroStatus').textContent = state.zeroed ? 'ZERO OK' : 'Pendiente'; $('runStatus').textContent = !state.powered ? 'Apagado' : state.running ? state.hold ? 'HOLD' : 'Midiendo' : 'Listo';
  }

  function updateScenarioSummary() {
    const s = scenario();
    $('scenarioSummary').innerHTML = `<strong>${s.name}</strong><span>Referencia EN 12464-1:2022 · ${s.ref}</span><p>${s.task}</p>`;
    $('normTask').textContent = s.task;
    $('normValues').innerHTML = `<div><span>Ēm requerido</span><strong>${s.norm.required} lx</strong></div><div><span>Ēm modificado</span><strong>${s.norm.modified} lx</strong></div><div><span>U₀ tarea</span><strong>${s.norm.uo.toFixed(2)}</strong></div><div><span>Ra / UGRL</span><strong>${s.norm.ra} / ${s.norm.ugr}</strong></div>`;
    $('normNote').textContent = state.lightCondition === 'electric' ? 'La uniformidad puede compararse con el requisito del área seleccionada.' : 'Con aporte de luz natural, U₀ se muestra como indicador descriptivo y no se emite juicio de conformidad de uniformidad eléctrica.';
  }

  function metrologyIssues() {
    const flags = [];
    flags.push({ ok: state.powered, text: state.powered ? 'Equipo encendido' : 'Equipo apagado' });
    flags.push({ ok: state.conditioned, text: state.conditioned ? 'Detector estabilizado' : 'Detector sin estabilizar' });
    flags.push({ ok: state.zeroed, text: state.zeroed ? 'ZERO verificado' : 'ZERO pendiente' });
    flags.push({ ok: !state.coverOn, text: state.coverOn ? 'Tapa sobre el sensor' : 'Tapa retirada para medir' });
    flags.push({ ok: state.position === 'correct', text: positionLabels[state.position] });
    flags.push({ ok: state.angle === 0, text: state.angle === 0 ? 'Sensor alineado con el plano' : `Sensor inclinado ${state.angle}°` });
    flags.push({ ok: !isOverload(displaySourceLux()), text: isOverload(displaySourceLux()) ? 'Rango sobrecargado · OL' : 'Rango sin sobrecarga' });
    return flags;
  }
  function renderMetrologyFlags() {
    $('metrologyFlags').innerHTML = metrologyIssues().map(f => `<div class="flag ${f.ok ? 'ok' : 'warn'}"><b>${f.ok ? '✓' : '!'}</b><span>${f.text}</span></div>`).join('');
  }

  function renderGrid() {
    const grid = $('measurementGrid'); grid.innerHTML = '';
    if (!state.grid.generated) { $('gridMeta').innerHTML = '<span>Sin rejilla generada</span>'; $('gridInstruction').textContent = 'Introduce las dimensiones y pulsa Generar rejilla.'; return; }
    const g = state.grid; const stats = gridStats();
    $('gridMeta').innerHTML = `<span><b>${g.rows} × ${g.cols}</b> celdas</span><span><b>${g.rows * g.cols}</b> puntos</span><span>Celda aprox. <b>${g.spacingL.toFixed(2)} × ${g.spacingW.toFixed(2)} m</b></span><span>p máx. calculado <b>${g.p.toFixed(2)} m</b></span>`;
    grid.style.setProperty('--grid-cols', String(Math.min(g.cols, 8)));
    g.readings.forEach((v, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = Number.isFinite(v) ? 'point recorded' : 'point';
      b.innerHTML = `<span>P${i + 1}</span><strong>${formatDisplayValue(v)}</strong><small>${Number.isFinite(v) ? unitLabel() : 'pendiente'}</small>`;
      b.addEventListener('click', () => recordGridPoint(i)); grid.append(b);
    });
    const next = g.readings.findIndex(v => !Number.isFinite(v));
    $('gridInstruction').textContent = next < 0 ? `Rejilla completa · ${stats.count}/${stats.total} puntos.` : `Toca P${next + 1} o usa “Registrar siguiente punto”.`;
  }

  function renderCyl() {
    $$('#cylCompass button').forEach(b => { const v = state.cyl.readings[b.dataset.dir]; b.querySelector('strong').textContent = Number.isFinite(v) ? `${formatDisplayValue(v)} ${unitLabel()}` : '----'; });
    const avg = cylAverageLux(); $('cylAverage').textContent = Number.isFinite(avg) ? `${formatDisplayValue(avg)} ${unitLabel()}` : '----';
    const ref = scenario().norm.cyl; $('cylReference').textContent = ref ? `Referencia de la tarea: Ēm,z ${ref} lx` : 'La tabla de este escenario no aporta un valor cilíndrico específico.';
  }

  function updateResults() {
    const stats = gridStats(); const n = normForArea(); const natural = state.lightCondition !== 'electric';
    if (!stats) {
      $('resultHero').innerHTML = `<div class="result-empty"><strong>Aún no hay una rejilla medida</strong><p>Ve a “Rejilla EN”, genera los puntos y registra lecturas.</p></div>`;
      $('resultGrid').innerHTML = ''; return;
    }
    const enough = stats.avg >= n.required; const uPass = stats.uo >= n.uo; const complete = stats.count === stats.total;
    let badge = !complete ? 'Resultado provisional' : enough && (natural || uPass) ? 'Cumple la comparación didáctica' : 'Requiere revisión';
    let cls = !complete ? 'provisional' : enough && (natural || uPass) ? 'pass' : 'fail';
    $('resultHero').innerHTML = `<div class="verdict ${cls}"><span>${badge}</span><strong>${formatDisplayValue(stats.avg)} ${unitLabel()}</strong><small>${n.label} · ${stats.count}/${stats.total} puntos</small></div><button id="saveEvaluationBtn" type="button">Guardar evaluación</button>`;
    $('resultGrid').innerHTML = `
      <div><span>Promedio Ē</span><strong>${formatDisplayValue(stats.avg)} ${unitLabel()}</strong><small>Comparar didácticamente con ${n.required.toFixed(n.required < 100 ? 1 : 0)} lx</small></div>
      <div><span>Mínimo</span><strong>${formatDisplayValue(stats.min)} ${unitLabel()}</strong><small>Lectura menor registrada</small></div>
      <div><span>Máximo</span><strong>${formatDisplayValue(stats.max)} ${unitLabel()}</strong><small>Lectura mayor registrada</small></div>
      <div><span>Uniformidad U₀</span><strong>${stats.uo.toFixed(2)}</strong><small>${natural ? 'Indicador descriptivo · luz natural/mixta' : `Referencia ${n.uo.toFixed(2)} · ${uPass ? 'alcanzada' : 'no alcanzada'}`}</small></div>
      <div><span>Ēm requerido de tarea</span><strong>${scenario().norm.required} lx</strong><small>Tabla ${scenario().ref}</small></div>
      <div><span>Ēm modificado</span><strong>${scenario().norm.modified} lx</strong><small>No es un “máximo”; refleja contexto de la tabla</small></div>`;
    $('saveEvaluationBtn')?.addEventListener('click', saveEvaluation);
  }

  function saveSpot() {
    if (!Number.isFinite(state.currentLux)) return toast('Realiza primero una medición');
    state.memories.unshift({ type: 'Puntual', scenario: scenario().name, valueLux: state.currentLux, unit: state.unit, plane: planeLabels[state.plane], date: new Date().toISOString() });
    saveMemories(); renderMemory(); toast('Lectura guardada');
  }
  function saveEvaluation() {
    const stats = gridStats(); if (!stats) return;
    state.memories.unshift({ type: 'Rejilla', scenario: scenario().name, valueLux: stats.avg, minLux: stats.min, maxLux: stats.max, uo: stats.uo, points: `${stats.count}/${stats.total}`, area: areaLabels[state.grid.area], date: new Date().toISOString() });
    saveMemories(); renderMemory(); toast('Evaluación guardada');
  }
  function renderMemory() {
    if (!state.memories.length) { $('memoryList').innerHTML = '<div class="memory-empty">No hay prácticas guardadas.</div>'; return; }
    $('memoryList').innerHTML = state.memories.map((m, i) => `<article><span>${i + 1}</span><div><strong>${m.type} · ${m.scenario}</strong><small>${new Date(m.date).toLocaleString('es-ES')} ${m.area ? `· ${m.area}` : ''}</small></div><b>${formatMemoryLux(m.valueLux)} lx${Number.isFinite(m.uo) ? ` · U₀ ${m.uo.toFixed(2)}` : ''}</b></article>`).join('');
  }
  function formatMemoryLux(lux) { if (!Number.isFinite(lux)) return '----'; return lux < 100 ? lux.toFixed(1) : Math.round(lux).toLocaleString('es-ES'); }

  function updateLesson() {
    let kicker = 'PREPARACIÓN', title = 'Antes de medir', text = 'Inspecciona el sensor, retira la tapa para estabilizarlo y comprueba el cero antes de medir.';
    if (!state.powered) { }
    else if (!state.conditioned) { kicker = 'ESTABILIZACIÓN'; title = 'Deja responder al detector'; text = 'El manual de referencia recomienda exponer el detector a la luz antes de medir. Aquí puedes simular ese acondicionamiento sin esperar dos minutos reales.'; }
    else if (!state.zeroed) { kicker = 'ZERO'; title = 'Cero con el sensor tapado'; text = 'La puesta a cero se hace con la cubierta opaca sobre el detector. Si intentas hacer ZERO con luz incidente, el simulador lo rechaza.'; }
    else if (state.position !== 'correct' || state.angle > 0) { kicker = 'ERROR DE POSICIÓN'; title = 'El sensor también forma parte de la medición'; text = `La condición actual (${positionLabels[state.position]}, ${state.angle}°) altera la lectura. Corrige orientación, sombra y obstrucciones antes de interpretar.`; }
    else if (state.view === 'grid') { kicker = 'REJILLA'; title = 'Los puntos dependen del tamaño del área'; text = 'La rejilla se calcula con el método de tamaño máximo de celda de EN 12464-1. La malla 3×3 deja de ser una regla fija.'; }
    else if (state.view === 'cyl') { kicker = 'ESPACIO'; title = 'Iluminancia cilíndrica'; text = 'La aproximación usa cuatro iluminancias verticales ortogonales y las promedia. La altura de referencia cambia entre persona sentada y de pie.'; }
    else if (state.view === 'results') { kicker = 'INTERPRETACIÓN'; title = 'Promedio y uniformidad responden preguntas distintas'; text = state.lightCondition === 'electric' ? 'Compara la iluminancia media con el requisito y U₀ con la uniformidad mínima del área.' : 'Con luz natural o mixta, U₀ se conserva como descripción, pero el simulador evita aplicar el criterio de uniformidad de iluminación eléctrica.'; }
    else if (state.running) { kicker = 'MEDICIÓN'; title = 'Lee con contexto'; text = 'Comprueba unidad, rango, perfil LS, plano, posición del sensor y posible sobrecarga antes de registrar el número.'; }
    $('lessonKicker').textContent = kicker; $('lessonTitle').textContent = title; $('lessonText').textContent = text;
    $('learningState').textContent = !state.powered ? 'Equipo apagado' : state.running ? 'Midiendo' : state.zeroed ? 'Listo' : 'Preparación';
  }

  const guideSteps = [
    { title: 'Enciende el equipo', text: 'Pulsa POWER para iniciar la autocomprobación.', target: '#powerBtn', done: () => state.powered },
    { title: 'Retira la tapa y estabiliza', text: 'Con el sensor expuesto, pulsa 2m / ESTABILIZAR.', target: '#conditionBtn', done: () => state.conditioned },
    { title: 'Coloca la tapa', text: 'Cubre el fotodetector antes de ejecutar ZERO.', target: '#sensorCapBtn', done: () => state.coverOn || state.zeroed },
    { title: 'Ejecuta ZERO', text: 'Con la tapa colocada, pulsa ZERO con tapa o mantén HOLD/ZERO.', target: '#quickZeroBtn', done: () => state.zeroed },
    { title: 'Retira la tapa', text: 'El sensor debe quedar expuesto para medir.', target: '#sensorCapBtn', done: () => state.zeroed && !state.coverOn },
    { title: 'Alinea el sensor', text: 'Usa posición correcta y ángulo 0° sobre el plano elegido.', target: '#positionSelect', done: () => state.position === 'correct' && state.angle === 0 },
    { title: 'Realiza una lectura', text: 'Pulsa MEDIR y observa rango, unidad, mínimo, máximo y pico.', target: '#runBtn', done: () => Number.isFinite(state.currentLux) && state.elapsed > 0 },
    { title: 'Construye una rejilla', text: 'Abre Rejilla EN, genera la malla por dimensiones y registra al menos un punto.', target: '[data-view="grid"]', done: () => state.grid.readings.some(Number.isFinite) }
  ];
  function currentGuideIndex() { return guideSteps.findIndex(s => !s.done()); }
  function updateGuide() {
    const idx = currentGuideIndex(); const done = idx < 0 ? guideSteps.length : idx; const pct = Math.round(done / guideSteps.length * 100);
    $('guideProgress').style.width = `${pct}%`; $('guidePercent').textContent = `${pct}%`;
    if (idx < 0) { $('guideStep').textContent = 'Práctica guiada completada'; $('guideTitle').textContent = 'Ahora explora libremente'; $('guideText').textContent = 'Prueba otros escenarios, perfiles de fuente, errores angulares y áreas.'; $('guideLocate').hidden = true; return; }
    const s = guideSteps[idx]; $('guideStep').textContent = `Paso ${idx + 1} de ${guideSteps.length}`; $('guideTitle').textContent = s.title; $('guideText').textContent = s.text; $('guideLocate').hidden = !state.guided;
  }
  function locateGuide() { const idx = currentGuideIndex(); if (idx < 0) return; const el = document.querySelector(guideSteps[idx].target); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); highlightElement(el); }
  function highlight(sel) { const el = document.querySelector(sel); if (el) highlightElement(el); }
  function highlightElement(el) { el.classList.add('guide-target'); setTimeout(() => el.classList.remove('guide-target'), 1600); }

  function updateAll(full = true) {
    if (full) updateScenarioSummary();
    updateInstrument(); renderMetrologyFlags(); updateLesson(); updateGuide(); renderCyl();
    if (state.grid.generated) renderGrid(); if (state.view === 'results') updateResults();
    $('unitButtons').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.unit === state.unit));
    $('sourceIndicator').textContent = state.lsProfile;
  }

  function setLoginMessage(message, type = 'error') { $('loginMessage').textContent = message; $('loginMessage').classList.toggle('success', type === 'success'); }
  function getAttemptState() {
    const s = readJson(localStorage, ACCESS_ATTEMPTS_KEY, { count: 0, blockedUntil: 0 });
    if (s.blockedUntil && s.blockedUntil <= Date.now()) { localStorage.removeItem(ACCESS_ATTEMPTS_KEY); return { count: 0, blockedUntil: 0 }; }
    return s;
  }
  function blockedMessage(until) { const m = Math.max(1, Math.ceil((until - Date.now()) / 60000)); return `Demasiados intentos. Espera ${m} ${m === 1 ? 'minuto' : 'minutos'} antes de volver a intentar.`; }
  function recordFailedAttempt() {
    const s = getAttemptState(); const count = (s.count || 0) + 1;
    if (count >= MAX_ATTEMPTS) { const blockedUntil = Date.now() + BLOCK_DURATION; writeJson(localStorage, ACCESS_ATTEMPTS_KEY, { count: 0, blockedUntil }); return blockedMessage(blockedUntil); }
    writeJson(localStorage, ACCESS_ATTEMPTS_KEY, { count, blockedUntil: 0 }); return `No pudimos validar esos datos. Te ${MAX_ATTEMPTS - count === 1 ? 'queda 1 intento' : `quedan ${MAX_ATTEMPTS - count} intentos`}.`;
  }
  function openSimulator(member, persist = true) {
    const name = [member?.nombres, member?.apellidos].filter(Boolean).join(' ').trim() || member?.name || 'integrante';
    const expiresAt = member?.expiresAt || Date.now() + ACCESS_DURATION; state.memberName = name;
    if (persist) writeJson(sessionStorage, ACCESS_SESSION_KEY, { name, expiresAt });
    $('memberName').textContent = name; $('loginGate').hidden = true; $('appShell').hidden = false; $('appShell').setAttribute('aria-hidden', 'false'); document.body.classList.remove('auth-locked');
    clearTimeout(accessTimer); accessTimer = setTimeout(() => closeSession(true), Math.max(0, expiresAt - Date.now()));
  }
  function closeSession(expired = false) {
    stopMeasurement(); clearTimeout(accessTimer); sessionStorage.removeItem(ACCESS_SESSION_KEY); $('appShell').hidden = true; $('appShell').setAttribute('aria-hidden', 'true'); $('loginGate').hidden = false; document.body.classList.add('auth-locked'); $('memberLogin').reset(); setLoginMessage(expired ? 'Tu sesión de 20 minutos finalizó. Ingresa nuevamente.' : 'Sesión cerrada correctamente.', expired ? 'error' : 'success'); $('memberId').focus();
  }
  async function submitLogin(e) {
    e.preventDefault(); const cedula = $('memberId').value.replace(/\D/g, ''); const codigo = $('memberPassword').value.trim(); const attempts = getAttemptState();
    if (attempts.blockedUntil > Date.now()) return setLoginMessage(blockedMessage(attempts.blockedUntil));
    if (!cedula || !codigo) return setLoginMessage('Escribe tu cédula y tu clave para continuar.');
    $('loginSubmit').disabled = true; $('loginSubmit').querySelector('span').textContent = 'Verificando acceso…'; setLoginMessage('', 'success');
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/acceso_integrante`, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_cedula: cedula, p_codigo: codigo }) });
      if (!r.ok) throw new Error(`Access ${r.status}`); const payload = await r.json(); const member = Array.isArray(payload) ? payload[0] : payload;
      if (!member) { $('memberPassword').value = ''; return setLoginMessage(recordFailedAttempt()); }
      localStorage.removeItem(ACCESS_ATTEMPTS_KEY); $('memberLogin').reset(); openSimulator(member); toast(`Bienvenido, ${member.nombres || 'integrante'}`);
    } catch (err) { console.error(err); setLoginMessage('El servicio de acceso no está disponible en este momento. Intenta nuevamente en unos minutos.'); }
    finally { $('loginSubmit').disabled = false; $('loginSubmit').querySelector('span').textContent = 'Abrir laboratorio'; }
  }
  function initAccess() {
    const session = readJson(sessionStorage, ACCESS_SESSION_KEY, null);
    if (session?.expiresAt > Date.now()) return openSimulator(session, false);
    sessionStorage.removeItem(ACCESS_SESSION_KEY); const a = getAttemptState(); if (a.blockedUntil > Date.now()) setLoginMessage(blockedMessage(a.blockedUntil)); $('memberId').focus();
  }

  function bindLongPress(button, shortFn, longFn, ms = 650) {
    let timer = null, longDone = false;
    button.addEventListener('pointerdown', e => { if (e.button != null && e.button !== 0) return; longDone = false; timer = setTimeout(() => { longDone = true; longFn(); }, ms); });
    button.addEventListener('pointerup', () => { clearTimeout(timer); if (!longDone) shortFn(); });
    button.addEventListener('pointercancel', () => clearTimeout(timer)); button.addEventListener('pointerleave', () => clearTimeout(timer));
    button.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); shortFn(); } });
  }

  function bindEvents() {
    $('memberLogin').addEventListener('submit', submitLogin); $('logoutBtn').addEventListener('click', () => closeSession(false));
    $('togglePassword').addEventListener('click', () => { const show = $('memberPassword').type === 'password'; $('memberPassword').type = show ? 'text' : 'password'; $('togglePassword').textContent = show ? 'Ocultar' : 'Mostrar'; });
    $('scenarioSelect').addEventListener('change', updateScenario);
    $('planeSelect').addEventListener('change', e => { state.plane = e.target.value; resetMeasurements({ keepGrid: true }); updateAll(); });
    $('lightConditionSelect').addEventListener('change', e => { state.lightCondition = e.target.value; updateAll(); updateResults(); });
    $('positionSelect').addEventListener('change', e => { state.position = e.target.value; resetMeasurements({ keepGrid: true }); updateAll(); });
    $('angleSelect').addEventListener('change', e => { state.angle = Number(e.target.value); resetMeasurements({ keepGrid: true }); updateAll(); });
    $('sourceProfileSelect').addEventListener('change', e => { state.lsProfile = e.target.value; resetMeasurements({ keepGrid: true }); updateAll(); });
    $('rangeSelect').addEventListener('change', e => { state.range = e.target.value; updateAll(); });
    $$('#unitButtons button').forEach(b => b.addEventListener('click', () => changeUnit(b.dataset.unit)));

    $('powerBtn').addEventListener('click', powerToggle); $('conditionBtn').addEventListener('click', conditionSensor); $('sensorCapBtn').addEventListener('click', toggleCover); $('runBtn').addEventListener('click', startStopMeasurement); $('mobileRunBtn').addEventListener('click', startStopMeasurement);
    bindLongPress($('rangeBtn'), cycleRange, autoRange); $('unitBtn').addEventListener('click', cycleUnit); $('maxMinBtn').addEventListener('click', cycleReadMode); bindLongPress($('holdZeroBtn'), toggleHold, zeroMeter); bindLongPress($('relPeakBtn'), toggleRel, togglePeak); $('sourceBtn').addEventListener('click', cycleSource);
    $('quickZeroBtn').addEventListener('click', zeroMeter); $('quickPeakBtn').addEventListener('click', togglePeak); $('saveSpotBtn').addEventListener('click', saveSpot);

    $$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('areaTypeSelect').addEventListener('change', e => { state.grid.area = e.target.value; updateResults(); }); $('generateGridBtn').addEventListener('click', generateGrid); $('recordNextGridBtn').addEventListener('click', recordNextGrid); $('resetGridBtn').addEventListener('click', resetGridReadings);
    $$('#cylCompass button').forEach(b => b.addEventListener('click', () => recordCyl(b.dataset.dir))); $('cylHeightSelect').addEventListener('change', e => { state.cyl.height = Number(e.target.value); renderCyl(); });
    $('printReportBtn').addEventListener('click', () => { setView('results'); setTimeout(() => window.print(), 50); });
    $('clearMemoryBtn').addEventListener('click', () => { state.memories = []; saveMemories(); renderMemory(); toast('Memoria vaciada'); });
    $('manualBtn').addEventListener('click', () => $('manualDialog').showModal());
    $('guidedToggle').addEventListener('click', () => { state.guided = !state.guided; $('guidedToggle').classList.toggle('active', state.guided); $('guidedToggle').setAttribute('aria-pressed', String(state.guided)); updateGuide(); }); $('guideLocate').addEventListener('click', locateGuide);
  }

  function init() {
    populateSourceProfiles(); populateRanges(); bindEvents();
    $('scenarioSelect').value = state.scenario; $('planeSelect').value = state.plane; $('lightConditionSelect').value = state.lightCondition; $('positionSelect').value = state.position; $('angleSelect').value = String(state.angle); $('areaTypeSelect').value = state.grid.area;
    renderGrid(); renderCyl(); renderMemory(); setView('spot'); updateAll(); initAccess();
  }

  init();
})();
