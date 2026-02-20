/**
 * AMPS CCMC — ui.js
 * Wizard navigation, sidebar live-refresh, toast notifications,
 * modal dialogs, HPC compute estimator, keyboard shortcuts.
 */
(function () {
  'use strict';
  window.AMPS = window.AMPS || {};
  AMPS.ui = {};

  var currentStep = 0;   // 0-based index
  var STEP_COUNT  = 7;

  var STEP_META = [
    { id: 'step-1', label: '1 · Run Info',      icon: '📋' },
    { id: 'step-2', label: '2 · Particles',      icon: '⚛️'  },
    { id: 'step-3', label: '3 · B-Field',        icon: '🧲'  },
    { id: 'step-4a',label: '4a · Temporal',      icon: '⏱️'  },
    { id: 'step-4b',label: '4b · Spectrum',      icon: '📊'  },
    { id: 'step-5', label: '5 · Domain',         icon: '🔲'  },
    { id: 'step-6', label: '6 · Output',         icon: '📁'  },
    { id: 'step-7', label: '7 · Review',         icon: '🚀'  }
  ];

  // ── INIT ──────────────────────────────────────────────────────────────
  AMPS.ui.init = function () {
    buildWizardNav();
    bindNavButtons();
    bindKeyboard();
    AMPS.ui.goTo(0);
    AMPS.ui.refreshSidebar();
  };

  // ── WIZARD NAV BUILD ──────────────────────────────────────────────────
  function buildWizardNav () {
    var nav = document.getElementById('wizard-nav');
    if (!nav) return;
    nav.innerHTML = '';
    STEP_META.forEach(function (m, i) {
      var btn = document.createElement('button');
      btn.className = 'wz-step';
      btn.id = 'wz-' + i;
      btn.setAttribute('aria-label', m.label);
      btn.innerHTML =
        '<span class="wz-num">' + (i + 1) + '</span>' +
        '<span class="wz-label">' + m.label + '</span>';
      btn.addEventListener('click', function () { AMPS.ui.goTo(i); });
      nav.appendChild(btn);
      if (i < STEP_META.length - 1) {
        var sep = document.createElement('span');
        sep.className = 'wz-connector';
        sep.textContent = '›';
        nav.appendChild(sep);
      }
    });
  }

  // ── NAVIGATION ────────────────────────────────────────────────────────
  AMPS.ui.goTo = function (idx) {
    idx = Math.max(0, Math.min(STEP_COUNT - 1, idx));

    // Run validation on the step we're leaving
    if (idx !== currentStep) {
      runStepValidation(currentStep);
    }

    // Hide current, show next
    var panels = document.querySelectorAll('.step-panel');
    panels.forEach(function (p) { p.classList.remove('active'); });
    var target = document.getElementById(STEP_META[idx].id);
    if (target) target.classList.add('active');

    // Update wizard nav
    document.querySelectorAll('.wz-step').forEach(function (btn, i) {
      btn.classList.remove('active', 'done', 'has-errors');
      if (i < idx) {
        btn.classList.add(AMPS.state.step_valid[i] ? 'done' : 'has-errors');
      } else if (i === idx) {
        btn.classList.add('active');
      }
      var num = btn.querySelector('.wz-num');
      if (num) {
        if (i < idx && AMPS.state.step_valid[i])      num.textContent = '✓';
        else if (i < idx && !AMPS.state.step_valid[i]) num.textContent = '!';
        else                                            num.textContent = i + 1;
      }
    });

    // Update nav buttons
    var prevBtn = document.getElementById('btn-prev');
    var nextBtn = document.getElementById('btn-next');
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) {
      if (idx === STEP_COUNT - 1) {
        nextBtn.textContent = '🚀 Submit Run';
        nextBtn.className   = 'btn btn-submit';
        nextBtn.onclick = function () { AMPS.ui.openSubmitModal(); };
      } else {
        nextBtn.textContent = 'Next →';
        nextBtn.className   = 'btn btn-primary';
        nextBtn.onclick = function () { AMPS.ui.next(); };
      }
    }

    // Scroll nav item into view
    var activeBtn = document.getElementById('wz-' + idx);
    if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

    // Scroll main content to top
    var mc = document.getElementById('main-col');
    if (mc) mc.scrollTop = 0;

    // Mark as visited
    AMPS.state.step_visited[idx] = true;

    // Trigger step-specific render hook
    if (typeof AMPS.steps !== 'undefined' && AMPS.steps[idx] && AMPS.steps[idx].onEnter) {
      AMPS.steps[idx].onEnter();
    }

    currentStep = idx;
    AMPS.ui.refreshSidebar();
  };

  AMPS.ui.next = function () { AMPS.ui.goTo(currentStep + 1); };
  AMPS.ui.prev = function () { AMPS.ui.goTo(currentStep - 1); };
  AMPS.ui.current = function () { return currentStep; };

  function bindNavButtons () {
    var p = document.getElementById('btn-prev');
    var n = document.getElementById('btn-next');
    if (p) p.addEventListener('click', AMPS.ui.prev);
    if (n) n.addEventListener('click', AMPS.ui.next);
  }

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────
  function bindKeyboard () {
    document.addEventListener('keydown', function (e) {
      // Only when not in an input
      if (['INPUT','TEXTAREA','SELECT'].indexOf(document.activeElement.tagName) !== -1) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') AMPS.ui.next();
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   AMPS.ui.prev();
      if (e.key === 'Escape') AMPS.ui.closeModal();
    });
  }

  // ── STEP VALIDATION RUNNER ─────────────────────────────────────────────
  function runStepValidation (idx) {
    if (!AMPS.validate) return;
    var validators = [
      AMPS.validate.step1, AMPS.validate.step2, AMPS.validate.step3,
      AMPS.validate.step4a, AMPS.validate.step4b, AMPS.validate.step5,
      AMPS.validate.step6, function () { return { ok: true, errors: [], warnings: [] }; }
    ];
    if (validators[idx]) {
      var result = validators[idx](AMPS.state);
      AMPS.setStepValid(idx, result.ok);
      AMPS.ui.showStepBanner(idx, result);
    }
  }

  // Show validation banner at top of a step panel
  AMPS.ui.showStepBanner = function (stepIdx, result) {
    var bannerId = 'banner-step-' + stepIdx;
    var banner   = document.getElementById(bannerId);
    if (!banner) return;

    if (result.errors.length > 0) {
      banner.className = 'step-val-banner banner-err';
      banner.innerHTML = '❌ <span>' + result.errors[0] +
        (result.errors.length > 1 ? ' (+' + (result.errors.length - 1) + ' more)' : '') + '</span>';
    } else if (result.warnings.length > 0) {
      banner.className = 'step-val-banner banner-warn';
      banner.innerHTML = '⚠️ <span>' + result.warnings[0] +
        (result.warnings.length > 1 ? ' (+' + (result.warnings.length - 1) + ' more)' : '') + '</span>';
    } else if (AMPS.state.step_visited[stepIdx]) {
      banner.className = 'step-val-banner banner-ok';
      banner.innerHTML = '✓ <span>All fields valid</span>';
    } else {
      banner.className = 'step-val-banner banner-idle hidden';
    }
  };

  // ── SIDEBAR REFRESH ────────────────────────────────────────────────────
  AMPS.ui.refreshSidebar = function () {
    var s = AMPS.state;

    sv('sb-pi',       s.pi_name || '—');
    sv('sb-run',      s.run_title ? s.run_title.slice(0, 30) : '—');
    sv('sb-sim',      s.sim_type + ' / ' + (s.species_H ? 'H⁺ ' : '') + (s.species_He ? 'He²⁺ ' : '') + (s.species_GCR ? 'GCR' : ''));
    sv('sb-e-range',  s.energy_min + '–' + s.energy_max + ' MeV/n');
    sv('sb-bfield',   s.bfield_model + ' / ' + s.ts_input_mode);
    sv('sb-temporal', s.temporal_mode.replace('_',' '));
    sv('sb-spectrum', s.spectrum_type);
    sv('sb-boundary', s.boundary_type === 'BOX' ? 'Box (GSM)' : 'Shue 1998');
    sv('sb-output',   s.output_mode);
    sv('sb-format',   s.output_format);

    // Progress
    var done = s.step_valid.filter(Boolean).length;
    var pct  = Math.round(done / 7 * 100);
    var fill = document.getElementById('sb-prog-fill');
    if (fill) fill.style.width = pct + '%';
    sv('sb-progress-pct', pct + '%');

    // HPC estimate
    updateHPCEstimate();

    // AMPS_PARAM.in preview
    updateParamPreview();
  };

  function sv (id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ── HPC ESTIMATE ──────────────────────────────────────────────────────
  function updateHPCEstimate () {
    var s = AMPS.state;
    var N = parseInt(s.n_particles) || 1000000;

    // Base cost model (rough empirical scaling):
    // SBU ≈ N_particles × energy_bins × duration_factor × boundary_factor
    var eRange = (parseFloat(s.energy_max) - parseFloat(s.energy_min)) || 990;
    var durationH = 72; // default
    if (s.temporal_mode === 'TIME_SERIES' && s.event_start && s.event_end) {
      var dt = new Date(s.event_end) - new Date(s.event_start);
      if (!isNaN(dt)) durationH = Math.max(1, dt / 3600000);
    }
    var binF  = (parseInt(s.energy_bins) || 20) / 20;
    var bndF  = s.boundary_type === 'SHUE' ? 0.8 : 1.0;
    var modeF = s.temporal_mode === 'STEADY_STATE' ? 0.4 : s.temporal_mode === 'COUPLED_MHD' ? 3.0 : 1.0;
    var specF = (s.species_He ? 1.8 : 1.0) * (s.species_GCR ? 2.5 : 1.0);

    var sbu = Math.round((N / 1e6) * binF * (durationH / 72) * bndF * modeF * specF * 5200);
    var gbOut= Math.round((N / 1e6) * binF * (durationH / 72) * 52 * (s.dist_function ? 4 : 1));
    var queueDays = sbu > 20000 ? '3–7' : sbu > 5000 ? '1–3' : '< 1';

    animCount('est-sbu',    formatSBU(sbu));
    animCount('est-output', gbOut + ' GB');
    animCount('est-queue',  queueDays + 'd');
    animCount('est-particles', (N / 1e6).toFixed(1) + 'M');
  }

  function formatSBU (n) {
    if (n >= 1000000) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1000)    return Math.round(n / 100) / 10 + 'k';
    return n + '';
  }

  function animCount (id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.textContent !== val) {
      el.classList.add('updating');
      setTimeout(function () { el.textContent = val; el.classList.remove('updating'); }, 150);
    }
  }

  // ── AMPS_PARAM.IN PREVIEW ─────────────────────────────────────────────
  function updateParamPreview () {
    var el = document.getElementById('param-preview');
    if (!el) return;
    var s  = AMPS.state;
    var lines = [];

    function kw (key, val, comment) {
      var pad = Math.max(1, 20 - key.length);
      lines.push('<span class="kw-key">' + key + '</span>' +
                 ' '.repeat(pad) +
                 '<span class="kw-val">' + val + '</span>' +
                 (comment ? '  <span class="kw-comment">! ' + comment + '</span>' : ''));
    }
    function sec (name) {
      lines.push('<span class="kw-section">#' + name + '</span>');
    }

    sec('RUN_INFO');
    kw('RUN_TITLE',    '"' + (s.run_title || '...') + '"');
    kw('PI',           '"' + (s.pi_name   || '...') + '"');
    lines.push('');

    sec('PARTICLE');
    kw('SIM_TYPE',     s.sim_type);
    if (s.species_H)   kw('SPECIES_H',  'ON');
    if (s.species_He)  kw('SPECIES_HE', 'ON');
    if (s.species_GCR) kw('SPECIES_GCR','ON');
    kw('E_MIN',        s.energy_min + '', 'MeV/n');
    kw('E_MAX',        s.energy_max + '', 'MeV/n');
    kw('E_BINS',       s.energy_bins + '');
    kw('N_PARTICLES',  s.n_particles + '');
    lines.push('');

    sec('BFIELD');
    kw('BFIELD_MODEL',  s.bfield_model);
    if (s.bfield_model === 'TS05') {
      kw('TS_VERSION',  s.ts_version);
      kw('TS_INPUT',    s.ts_input_mode);
      if (s.ts_input_mode === 'SCALAR') {
        kw('TS_DST',    s.ts_dst + '', 'nT');
        kw('TS_PDYN',   s.ts_pdyn + '', 'nPa');
        kw('TS_BZ',     s.ts_bz  + '', 'nT');
        kw('TS_VX',     s.ts_vx  + '', 'km/s');
        kw('TS_NSW',    s.ts_nsw + '', 'cm-3');
        kw('TS_BY',     s.ts_by  + '', 'nT');
        kw('TS_BX',     s.ts_bx  + '', 'nT');
        kw('TS_EPOCH',  s.ts_epoch || '...');
      } else if (s.ts_input_mode === 'TIME_SERIES') {
        kw('TS_FILE',   's.ts05_driving.txt');
      } else {
        kw('TS_OMNIWEB','AUTO');
      }
    }
    lines.push('');

    sec('TEMPORAL');
    kw('TEMPORAL_MODE', s.temporal_mode);
    if (s.temporal_mode !== 'STEADY_STATE') {
      kw('EVENT_START',  s.event_start || '...');
      kw('EVENT_END',    s.event_end   || '...');
      kw('FIELD_DT',     s.field_update_dt + '', 'min');
      kw('INJECT_DT',    s.inject_dt + '', 'min');
    }
    lines.push('');

    sec('SPECTRUM');
    kw('SPECTRUM_TYPE', s.spectrum_type);
    if (s.spectrum_type === 'BAND') {
      kw('BAND_GAMMA1',  s.band_gamma1 + '');
      kw('BAND_GAMMA2',  s.band_gamma2 + '');
      kw('BAND_EBREAK',  s.band_ebreak + '', 'MeV/n');
      kw('BAND_J0',      s.band_j0 + '');
    }
    lines.push('');

    sec('DOMAIN_BOUNDARY');
    kw('BOUNDARY_TYPE', s.boundary_type);
    if (s.boundary_type === 'BOX') {
      kw('DOMAIN_X_MAX', s.box_xmax + '', 'RE');
      kw('DOMAIN_X_MIN', s.box_xmin + '', 'RE');
      kw('DOMAIN_Y_MAX', s.box_ymax + '', 'RE');
      kw('DOMAIN_Y_MIN', s.box_ymin + '', 'RE');
      kw('DOMAIN_Z_MAX', s.box_zmax + '', 'RE');
      kw('DOMAIN_Z_MIN', s.box_zmin + '', 'RE');
      kw('R_INNER',      s.box_rinner + '', 'RE');
    } else {
      kw('SHUE_R0',    s.shue_mode === 'MANUAL' ? s.shue_r0 + '' : 'AUTO');
      kw('SHUE_ALPHA', s.shue_mode === 'MANUAL' ? s.shue_alpha + '' : 'AUTO');
      kw('X_TAIL',     s.shue_xtail + '', 'RE');
      kw('R_INNER',    s.shue_rinner + '', 'RE');
    }
    lines.push('');

    sec('OUTPUT_DOMAIN');
    kw('OUTPUT_MODE',   s.output_mode);
    if (s.output_mode === 'TRAJECTORY') kw('FLUX_DT', s.flux_dt + '', 'min');
    if (s.output_mode === 'SHELLS') {
      kw('N_SHELLS',    s.n_shells + '');
      kw('SHELL_1_ALT', s.shell_1_alt + '', 'km');
    }
    lines.push('');

    sec('OUTPUT_OPTIONS');
    kw('OUTPUT_FORMAT', s.output_format);
    kw('CUTOFF_RIGIDITY',   s.cutoff_rigidity   ? 'YES' : 'NO');
    kw('KAMODO_OUTPUT',     s.kamodo_output     ? 'YES' : 'NO');
    kw('SAVE_TRAJECTORIES', s.save_trajectories);

    el.innerHTML = lines.join('\n');
  }

  // ── TOAST NOTIFICATIONS ──────────────────────────────────────────────
  AMPS.ui.toast = function (msg, type, duration) {
    type = type || 'info';
    duration = duration || 4000;
    var icons = { ok: '✓', warn: '⚠', error: '✕', info: 'ℹ' };
    var container = document.getElementById('toast-container');
    if (!container) return;

    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML =
      '<span class="toast-icon">' + (icons[type] || 'ℹ') + '</span>' +
      '<span class="toast-msg">' + msg + '</span>' +
      '<span class="toast-close" onclick="this.parentElement.remove()">×</span>';
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('removing');
      setTimeout(function () { if (toast.parentElement) toast.remove(); }, 300);
    }, duration);
  };

  // ── MODAL ──────────────────────────────────────────────────────────────
  AMPS.ui.openModal = function (title, body, buttons) {
    var backdrop = document.getElementById('modal-backdrop');
    var mTitle   = document.getElementById('modal-title');
    var mBody    = document.getElementById('modal-body');
    var mFooter  = document.getElementById('modal-footer');
    if (!backdrop) return;

    mTitle.textContent = title;
    mBody.innerHTML    = body;
    mFooter.innerHTML  = '';
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className   = b.cls || 'btn btn-secondary';
      btn.textContent = b.label;
      btn.onclick     = b.action;
      mFooter.appendChild(btn);
    });

    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  AMPS.ui.closeModal = function () {
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
    document.body.style.overflow = '';
  };

  AMPS.ui.openSubmitModal = function () {
    var allValid = AMPS.allStepsValid();
    if (!allValid) {
      AMPS.ui.toast('Please complete all required steps before submitting.', 'warn', 5000);
      // Navigate to first invalid step
      for (var i = 0; i < 7; i++) {
        if (!AMPS.state.step_valid[i]) { AMPS.ui.goTo(i); break; }
      }
      return;
    }
    AMPS.ui.openModal(
      '🚀 Submit Run to CCMC HPC',
      '<p>Your run configuration is complete and ready for submission.</p>' +
      '<div style="margin:14px 0;padding:12px;background:var(--bg-inset);border-radius:8px;font-size:12px;">' +
      '<strong>' + AMPS.state.run_title + '</strong><br>' +
      '<span style="color:var(--text-dim)">PI: ' + AMPS.state.pi_name + ' · ' + AMPS.state.pi_institution + '</span><br>' +
      '<span style="color:var(--text-dim)">Model: AMPS 2025 · ' + AMPS.state.sim_type + ' · ' + AMPS.state.temporal_mode.replace('_',' ') + '</span>' +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-dim)">By submitting you agree to the CCMC Runs-on-Request terms. A confirmation will be sent to <strong>' + AMPS.state.pi_email + '</strong>.</p>',
      [
        { label: 'Cancel',     cls: 'btn btn-ghost', action: AMPS.ui.closeModal },
        { label: '🚀 Submit',  cls: 'btn btn-submit', action: AMPS.ui.doSubmit }
      ]
    );
  };

  AMPS.ui.doSubmit = function () {
    AMPS.ui.closeModal();
    AMPS.ui.goTo(7);   // Step 7 = review/confirmation
    if (typeof AMPS.submit !== 'undefined') {
      AMPS.submit.run();
    }
  };

  // ── UTILITY: bind an input to state ──────────────────────────────────
  AMPS.ui.bindField = function (id, stateKey, transform) {
    var el = document.getElementById(id);
    if (!el) return;
    // Set initial value from state
    var initVal = AMPS.get(stateKey);
    if (initVal !== undefined && initVal !== null) el.value = initVal;
    // Bind events
    el.addEventListener('input', function () {
      var v = transform ? transform(el.value) : el.value;
      AMPS.set(stateKey, v);
      if (AMPS.validate && AMPS.validate.field) AMPS.validate.field(id, v);
    });
    el.addEventListener('change', function () {
      var v = transform ? transform(el.value) : el.value;
      AMPS.set(stateKey, v);
    });
  };

  AMPS.ui.bindCheckbox = function (id, stateKey) {
    var el = document.getElementById(id);
    if (!el) return;
    el.checked = !!AMPS.get(stateKey);
    el.addEventListener('change', function () { AMPS.set(stateKey, el.checked); });
  };

  AMPS.ui.bindSelect = function (id, stateKey) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = AMPS.get(stateKey) || '';
    el.addEventListener('change', function () { AMPS.set(stateKey, el.value); });
  };

  // ── DOWNLOAD PARAM FILE ───────────────────────────────────────────────
  AMPS.ui.downloadParam = function () {
    if (!AMPS.paramfile) return;
    var content = AMPS.paramfile.generate();
    var blob    = new Blob([content], { type: 'text/plain' });
    var a       = document.createElement('a');
    a.href      = URL.createObjectURL(blob);
    a.download  = 'AMPS_PARAM.in';
    a.click();
    URL.revokeObjectURL(a.href);
    AMPS.ui.toast('AMPS_PARAM.in downloaded ✓', 'ok');
  };

  // ── DOWNLOAD JSON STATE ───────────────────────────────────────────────
  AMPS.ui.downloadState = function () {
    var blob = new Blob([JSON.stringify(AMPS.state, null, 2)], { type: 'application/json' });
    var a    = document.createElement('a');
    a.href   = URL.createObjectURL(blob);
    a.download = 'amps_run_config.json';
    a.click();
    URL.revokeObjectURL(a.href);
    AMPS.ui.toast('Configuration JSON downloaded ✓', 'ok');
  };

  AMPS.ui.loadState = function (jsonStr) {
    try {
      var parsed = JSON.parse(jsonStr);
      AMPS.state = Object.assign(JSON.parse(JSON.stringify(AMPS.DEFAULTS)), parsed);
      AMPS.save();
      window.location.reload();
    } catch (e) {
      AMPS.ui.toast('Failed to load configuration: ' + e.message, 'error');
    }
  };

}());
