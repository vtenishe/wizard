/**
 * AMPS CCMC — steps/steps1-4a.js
 * Step render and bind logic for Steps 1 through 4a.
 */
(function () {
  'use strict';
  window.AMPS = window.AMPS || {};
  AMPS.steps = AMPS.steps || {};

  // ══════════════════════════════════════════════════════════════
  // STEP 0 — RUN INFORMATION
  // ══════════════════════════════════════════════════════════════
  AMPS.steps[0] = {
    onEnter: function () {
      var ui = AMPS.ui;
      ui.bindField('pi_name',         'pi_name');
      ui.bindField('pi_email',        'pi_email');
      ui.bindField('pi_institution',  'pi_institution');
      ui.bindField('coinvestigators', 'coinvestigators');
      ui.bindField('run_title',       'run_title');
      ui.bindField('run_description', 'run_description');
      ui.bindField('run_keywords',    'run_keywords');
      ui.bindSelect('run_purpose',    'run_purpose');
      // char counters
      bindCounter('run_description', 'desc-count', 30);
      bindCounter('run_title',       'title-count', 5);
    }
  };

  function bindCounter (fieldId, counterId, min) {
    var el = document.getElementById(fieldId);
    var ct = document.getElementById(counterId);
    if (!el || !ct) return;
    function upd () {
      var len  = el.value.length;
      ct.textContent = len + ' chars';
      ct.style.color = len < min ? 'var(--orange)' : 'var(--green)';
    }
    el.addEventListener('input', upd);
    upd();
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 1 — PARTICLE TYPE & SPECIES
  // ══════════════════════════════════════════════════════════════
  AMPS.steps[1] = {
    onEnter: function () {
      var ui = AMPS.ui;
      // Sim type cards
      bindOptCards('sim-type-cards', 'sim_type', ['SEP','GCR','COMBINED']);
      // Species checkboxes
      ui.bindCheckbox('sp-H',   'species_H');
      ui.bindCheckbox('sp-He',  'species_He');
      ui.bindCheckbox('sp-e',   'species_e');
      ui.bindCheckbox('sp-GCR', 'species_GCR');
      // Numeric fields
      ui.bindField('energy_min', 'energy_min', parseFloat);
      ui.bindField('energy_max', 'energy_max', parseFloat);
      ui.bindField('energy_bins','energy_bins', parseInt);
      ui.bindField('n_particles','n_particles', parseInt);
      // Pitch angle
      bindOptCards('pitch-cards', 'pitch_angle', ['ISOTROPIC','CONE30','UNIDIRECTIONAL']);
      // N-particles slider/input sync
      syncSlider('n_particles_slider', 'n_particles', 'np_display', formatMillions);
    }
  };

  function formatMillions (v) {
    var n = parseInt(v) || 0;
    return n >= 1e6 ? (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? (n/1e3).toFixed(0) + 'k' : n + '';
  }

  function syncSlider (sliderId, stateKey, displayId, formatter) {
    var sl = document.getElementById(sliderId);
    var dp = document.getElementById(displayId);
    if (!sl) return;
    sl.value = AMPS.get(stateKey);
    if (dp) dp.textContent = formatter ? formatter(sl.value) : sl.value;
    sl.addEventListener('input', function () {
      AMPS.set(stateKey, parseInt(sl.value));
      if (dp) dp.textContent = formatter ? formatter(sl.value) : sl.value;
      var fi = document.getElementById(stateKey);
      if (fi) fi.value = sl.value;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 2 — BACKGROUND FIELD
  // ══════════════════════════════════════════════════════════════
  AMPS.steps[2] = {
    onEnter: function () {
      var ui = AMPS.ui;
      bindOptCards('bfield-cards', 'bfield_model', ['TS05','TA15','BATSRUS','GAMERA','IGRF','DIPOLE'], refreshBfieldPanel);
      ui.bindSelect('ts_version',    'ts_version');
      ui.bindSelect('efield_model',  'efield_model');
      ui.bindCheckbox('corotation',  'corotation');
      ui.bindField('mhd_run_id',     'mhd_run_id');
      // TS05 scalar inputs
      ui.bindField('ts_dst',  'ts_dst',  parseFloat);
      ui.bindField('ts_pdyn', 'ts_pdyn', parseFloat);
      ui.bindField('ts_bz',   'ts_bz',   parseFloat);
      ui.bindField('ts_vx',   'ts_vx',   parseFloat);
      ui.bindField('ts_nsw',  'ts_nsw',  parseFloat);
      ui.bindField('ts_by',   'ts_by',   parseFloat);
      ui.bindField('ts_bx',   'ts_bx',   parseFloat);
      ui.bindField('ts_epoch','ts_epoch');
      // TS input mode tabs
      bindTogGroup('ts-input-tabs', 'ts_input_mode', refreshTSPanel);
      refreshBfieldPanel();
      refreshTSPanel();
    }
  };

  function refreshBfieldPanel () {
    var model = AMPS.get('bfield_model');
    var panels = {
      'TS05':    'bfield-ts-panel',
      'TA15':    'bfield-ts-panel',
      'BATSRUS': 'bfield-mhd-panel',
      'GAMERA':  'bfield-mhd-panel',
      'IGRF':    'bfield-simple-panel',
      'DIPOLE':  'bfield-simple-panel'
    };
    ['bfield-ts-panel','bfield-mhd-panel','bfield-simple-panel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var target = panels[model];
    if (target) { var el = document.getElementById(target); if (el) el.style.display = 'block'; }
  }

  function refreshTSPanel () {
    var mode = AMPS.get('ts_input_mode');
    ['scalar-panel','timeseries-panel','omniweb-panel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var map = { 'SCALAR': 'scalar-panel', 'TIME_SERIES': 'timeseries-panel', 'OMNIWEB': 'omniweb-panel' };
    var t = map[mode];
    if (t) { var el = document.getElementById(t); if (el) el.style.display = 'block'; }
    // Update Shue auto-compute when Bz or Pdyn changes
    if (AMPS.diagrams && AMPS.diagrams.shue) {
      setTimeout(AMPS.diagrams.shue, 50);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 3 — TEMPORAL VARIABILITY
  // ══════════════════════════════════════════════════════════════
  AMPS.steps[3] = {
    onEnter: function () {
      var ui = AMPS.ui;
      bindOptCards('temporal-cards', 'temporal_mode', ['STEADY_STATE','TIME_SERIES','COUPLED_MHD'], refreshTemporalPanel);
      ui.bindField('event_start',    'event_start');
      ui.bindField('event_end',      'event_end');
      ui.bindField('field_update_dt','field_update_dt', parseFloat);
      ui.bindField('inject_dt',      'inject_dt',       parseFloat);
      bindTogGroup('ts-driving-tabs', 'ts_driving_src', refreshDrivingPanel);
      ui.bindSelect('omni_cadence',  'omni_cadence');
      refreshTemporalPanel();
      refreshDrivingPanel();
      renderTimeline();
      // Re-render timeline when parameters change
      ['field_update_dt','inject_dt'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', renderTimeline);
      });
    }
  };

  function refreshTemporalPanel () {
    var mode = AMPS.get('temporal_mode');
    var el = document.getElementById('temporal-form');
    if (el) el.style.display = mode === 'STEADY_STATE' ? 'none' : 'block';
    var coupled = document.getElementById('temporal-coupled-notice');
    if (coupled) coupled.style.display = mode === 'COUPLED_MHD' ? 'block' : 'none';
  }

  function refreshDrivingPanel () {
    var src = AMPS.get('ts_driving_src');
    ['omni-driving-panel','file-driving-panel','scalar-driving-panel'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    var map = { 'OMNIWEB':'omni-driving-panel','FILE':'file-driving-panel','SCALAR':'scalar-driving-panel' };
    var t = map[src];
    if (t) { var el = document.getElementById(t); if (el) el.style.display = 'block'; }
  }

  function renderTimeline () {
    var track = document.getElementById('tl-track');
    if (!track) return;
    track.innerHTML = '';
    var fieldDt  = parseFloat(AMPS.get('field_update_dt')) || 5;
    var injectDt = parseFloat(AMPS.get('inject_dt'))       || 30;
    var totalMin = 120;   // show 2-hour window
    var W = 300;          // track width px
    // TS05 field-refresh ticks (blue dots)
    for (var t = 0; t <= totalMin; t += fieldDt) {
      var pct = t / totalMin;
      var tick = document.createElement('div');
      tick.className = 'tl-tick tl-tick-ts';
      tick.style.left = (pct * W) + 'px';
      var lbl = document.createElement('div');
      lbl.className = 'tl-label';
      lbl.style.left = (pct * W) + 'px';
      if (t % (fieldDt * 4) === 0) lbl.textContent = t + 'm';
      track.appendChild(tick);
      track.appendChild(lbl);
    }
    // Particle inject ticks (orange larger dots)
    for (var ti = 0; ti <= totalMin; ti += injectDt) {
      var pctI = ti / totalMin;
      var tickI = document.createElement('div');
      tickI.className = 'tl-tick tl-tick-inj';
      tickI.style.left = (pctI * W) + 'px';
      track.appendChild(tickI);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SHARED HELPERS
  // ══════════════════════════════════════════════════════════════

  /** Bind a group of option cards to a state key by their data-value attribute. */
  function bindOptCards (containerId, stateKey, validValues, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var current = AMPS.get(stateKey);
    container.querySelectorAll('.opt-card').forEach(function (card) {
      var v = card.getAttribute('data-value');
      if (!v) return;
      card.classList.toggle('sel', v === current);
      if (!card.classList.contains('disabled')) {
        card.addEventListener('click', function () {
          AMPS.set(stateKey, v);
          container.querySelectorAll('.opt-card').forEach(function (c) {
            c.classList.toggle('sel', c.getAttribute('data-value') === v);
          });
          if (onChange) onChange(v);
        });
      }
    });
  }

  /** Bind a toggle-button group to a state key by data-value attribute. */
  function bindTogGroup (containerId, stateKey, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var current = AMPS.get(stateKey);
    container.querySelectorAll('.tog-btn').forEach(function (btn) {
      var v = btn.getAttribute('data-value');
      if (!v) return;
      btn.classList.toggle('on', v === current);
      btn.addEventListener('click', function () {
        AMPS.set(stateKey, v);
        container.querySelectorAll('.tog-btn').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-value') === v);
        });
        if (onChange) onChange(v);
      });
    });
  }

  // Export helpers for reuse in steps 4b–7
  AMPS._bindOptCards  = bindOptCards;
  AMPS._bindTogGroup  = bindTogGroup;

}());
