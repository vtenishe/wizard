/**
 * AMPS CCMC Interface — Validation Module
 * amps-ccmc/js/validate.js
 *
 * Validates all form fields and step completeness.
 * Returns structured result objects: { ok, errors[], warnings[] }
 */
(function () {
  'use strict';
  window.AMPS = window.AMPS || {};

  var V = {};   // local namespace, exported as AMPS.validate

  // ── PRIMITIVES ─────────────────────────────────────────────────────────
  function ok(warnings) { return { ok: true,  errors: [], warnings: warnings || [] }; }
  function err(errors, warnings) { return { ok: false, errors: errors, warnings: warnings || [] }; }

  function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function notEmpty(s) { return s && s.trim().length > 0; }
  function isNum(v) { return !isNaN(parseFloat(v)) && isFinite(v); }
  function inRange(v, lo, hi) { return isNum(v) && v >= lo && v <= hi; }

  /** Attach error/warning visual state to a form field */
  function markField(id, state, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('field-ok', 'field-warn', 'field-err');
    if (state) el.classList.add('field-' + state);
    var hint = el.parentElement && el.parentElement.querySelector('.field-msg');
    if (hint) { hint.textContent = msg || ''; hint.className = 'field-msg ' + (state || ''); }
  }

  // ── STEP VALIDATORS ────────────────────────────────────────────────────

  /** Step 1: Run Information */
  V.step1 = function (s) {
    var errors = [], warnings = [];
    if (!notEmpty(s.pi_name))         errors.push('PI name is required.');
    if (!notEmpty(s.pi_email))        errors.push('PI email is required.');
    else if (!isEmail(s.pi_email))    errors.push('PI email address is not valid.');
    if (!notEmpty(s.pi_institution))  errors.push('Institution is required.');
    if (!notEmpty(s.run_title))       errors.push('Run title is required.');
    else if (s.run_title.length < 5)  errors.push('Run title must be at least 5 characters.');
    if (!notEmpty(s.run_description)) errors.push('Run description is required.');
    else if (s.run_description.length < 30) errors.push('Description should be at least 30 characters (currently ' + s.run_description.length + ').');
    if (!notEmpty(s.run_keywords))    warnings.push('Keywords help others discover your run.');
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  /** Step 2: Particle Type & Species */
  V.step2 = function (s) {
    var errors = [], warnings = [];
    var hasSpecies = s.species_H || s.species_He || s.species_e || s.species_GCR;
    if (!hasSpecies) errors.push('At least one particle species must be selected.');
    if (s.sim_type === 'GCR' && !s.species_GCR)
      errors.push('GCR simulation requires GCR proton species to be enabled.');
    if (s.sim_type === 'SEP' && s.species_GCR)
      warnings.push('GCR-p is selected in SEP mode. Consider using Combined mode.');
    if (!isNum(s.energy_min) || s.energy_min <= 0)
      errors.push('Energy minimum must be a positive number.');
    if (!isNum(s.energy_max) || s.energy_max <= 0)
      errors.push('Energy maximum must be a positive number.');
    if (isNum(s.energy_min) && isNum(s.energy_max) && parseFloat(s.energy_min) >= parseFloat(s.energy_max))
      errors.push('Energy minimum must be less than maximum.');
    if (!inRange(s.energy_bins, 5, 200))
      warnings.push('Energy bins outside typical range 5–200 (currently ' + s.energy_bins + ').');
    if (!inRange(s.n_particles, 10000, 10000000))
      errors.push('N_particles must be between 10,000 and 10,000,000.');
    if (s.n_particles < 100000)
      warnings.push('N_particles < 100,000 may produce statistically noisy flux maps.');
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  /** Step 3: Background Field */
  V.step3 = function (s) {
    var errors = [], warnings = [];
    if (s.bfield_model === 'TS05') {
      if (s.ts_input_mode === 'SCALAR') {
        if (!inRange(s.ts_dst, -600, 100))
          errors.push('Dst must be between −600 and +100 nT (current: ' + s.ts_dst + ').');
        if (!inRange(s.ts_pdyn, 0.1, 50))
          errors.push('P_dyn must be between 0.1 and 50 nPa (current: ' + s.ts_pdyn + ').');
        if (!inRange(s.ts_bz, -100, 50))
          errors.push('IMF Bz must be between −100 and +50 nT (current: ' + s.ts_bz + ').');
        if (!inRange(s.ts_vx, -1200, -200))
          errors.push('Vx must be between −1200 and −200 km/s (negative = anti-sunward).');
        if (!inRange(s.ts_nsw, 0.5, 100))
          warnings.push('Nsw = ' + s.ts_nsw + ' cm⁻³ is outside typical range 0.5–100.');
        if (!notEmpty(s.ts_epoch))
          errors.push('TS05 epoch timestamp is required for scalar mode.');
        if (s.ts_dst < -250)
          warnings.push('Dst < −250 nT: extreme storm; TS05 is calibrated to Dst > −600 nT.');
      }
      if (s.ts_input_mode === 'FILE' && !s.ts_file_name)
        warnings.push('No ts05_driving.txt file uploaded yet.');
    }
    if (s.bfield_model === 'BATSRUS' && !notEmpty(s.mhd_run_id))
      errors.push('BATS-R-US requires a CCMC run ID.');
    if (s.bfield_model === 'GAMERA' && !notEmpty(s.mhd_run_id))
      errors.push('GAMERA requires a CCMC run ID (e.g. Andrew_Marshall_121025_GM_1).');
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  /** Step 4a: Temporal Variability */
  V.step4a = function (s) {
    var errors = [], warnings = [];
    if (s.temporal_mode === 'TIME_SERIES') {
      if (!notEmpty(s.event_start)) errors.push('Event start date/time is required.');
      if (!notEmpty(s.event_end))   errors.push('Event end date/time is required.');
      if (notEmpty(s.event_start) && notEmpty(s.event_end)) {
        var t0 = new Date(s.event_start), t1 = new Date(s.event_end);
        if (isNaN(t0.getTime()))  errors.push('Event start date/time is invalid.');
        if (isNaN(t1.getTime()))  errors.push('Event end date/time is invalid.');
        if (!isNaN(t0.getTime()) && !isNaN(t1.getTime()) && t1 <= t0)
          errors.push('Event end must be after event start.');
        var daysSpan = (t1 - t0) / 86400000;
        if (daysSpan > 30) warnings.push('Event window > 30 days may require very large HPC allocation.');
      }
      if (!inRange(s.field_update_dt, 1, 120))
        errors.push('Field update Δt must be between 1 and 120 minutes.');
      if (!inRange(s.inject_dt, 5, 480))
        errors.push('Particle inject Δt must be between 5 and 480 minutes.');
      if (parseFloat(s.inject_dt) < parseFloat(s.field_update_dt))
        errors.push('Inject Δt must be ≥ Field update Δt.');
      if (parseFloat(s.field_update_dt) > 10)
        warnings.push('Field update Δt > 10 min may miss rapid storm onset dynamics.');
      if (s.ts_driving_src === 'FILE' && !s.ts_driving_file_name)
        warnings.push('ts05_driving.txt not yet uploaded.');
    }
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  /** Step 4b: Spectrum */
  V.step4b = function (s) {
    var errors = [], warnings = [];
    if (s.spectrum_type === 'BAND') {
      if (!inRange(s.band_gamma1, -5, -0.1))
        errors.push('Band γ₁ must be between −5 and −0.1 (got ' + s.band_gamma1 + ').');
      if (!inRange(s.band_gamma2, -8, -1))
        errors.push('Band γ₂ must be between −8 and −1 (got ' + s.band_gamma2 + ').');
      if (parseFloat(s.band_gamma2) >= parseFloat(s.band_gamma1))
        errors.push('γ₂ must be steeper (more negative) than γ₁.');
      if (!inRange(s.band_ebreak, 1, 2000))
        errors.push('Band E_break must be between 1 and 2000 MeV/n.');
      if (parseFloat(s.band_ebreak) < parseFloat(s.energy_min) ||
          parseFloat(s.band_ebreak) > parseFloat(s.energy_max))
        warnings.push('E_break (' + s.band_ebreak + ' MeV/n) is outside the simulation energy range.');
      if (!inRange(s.band_j0, 1, 1e9))
        errors.push('Band J₀ must be positive (>1).');
    }
    if (s.spectrum_type === 'TABLE') {
      if (!s.spectrum_file_H && s.species_H)
        warnings.push('No spectrum table uploaded for H+ yet.');
      if (!s.spectrum_file_He && s.species_He)
        warnings.push('No spectrum table uploaded for He2+ yet.');
    }
    if (s.spectrum_type === 'BADHWAR_ONEILL' && s.sim_type === 'SEP')
      errors.push('Badhwar–O\'Neill is a GCR model and cannot be used in SEP-only mode.');
    if (s.spectrum_type === 'MOTTL_NYMMIK' && s.sim_type === 'GCR')
      errors.push('Mottl & Nymmik is a SEP reference spectrum and cannot be used in GCR-only mode.');
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  /** Step 5: Domain Boundary + Output Domain */
  V.step5 = function (s) {
    var errors = [], warnings = [];
    // Domain boundary
    if (s.boundary_type === 'BOX') {
      if (parseFloat(s.box_xmax) <= 0) errors.push('Box X_max must be positive.');
      if (parseFloat(s.box_xmin) >= 0) errors.push('Box X_min must be negative (nightside).');
      if (parseFloat(s.box_xmax) < 9) warnings.push('X_max < 9 RE may clip dayside magnetopause.');
      if (parseFloat(s.box_xmin) > -30) warnings.push('X_min > −30 RE may truncate the magnetotail.');
      if (!inRange(s.box_rinner, 1.0, 4.0)) errors.push('R_inner must be between 1.0 and 4.0 RE.');
    }
    if (s.boundary_type === 'SHUE') {
      if (parseFloat(s.shue_xtail) >= -10)
        errors.push('Shue X_tail must be < −10 RE.');
      if (!inRange(s.shue_rinner, 1.0, 4.0))
        errors.push('Shue R_inner must be between 1.0 and 4.0 RE.');
      if (s.shue_mode === 'MANUAL') {
        if (!inRange(s.shue_r0, 4, 15))
          errors.push('Manual r₀ must be between 4 and 15 RE.');
        if (!inRange(s.shue_alpha, 0.3, 0.9))
          errors.push('Manual α must be between 0.3 and 0.9.');
      }
    }
    // Output mode
    if (s.output_mode === 'TRAJECTORY' && !notEmpty(s.trajectory_file_name))
      warnings.push('No trajectory file uploaded yet. Upload required before submission.');
    if (s.output_mode === 'SHELLS') {
      if (!inRange(s.shell_lat_step, 0.25, 10)) warnings.push('Lat step outside 0.25–10°.');
      if (!inRange(s.shell_lon_step, 0.25, 10)) warnings.push('Lon step outside 0.25–10°.');
      var nlat = Math.round((s.shell_lat_max - s.shell_lat_min) / s.shell_lat_step) + 1;
      var nlon = Math.round((s.shell_lon_max - s.shell_lon_min) / s.shell_lon_step) + 1;
      if (nlat * nlon > 100000) warnings.push('Grid has >100,000 cells — runtime will be long.');
    }
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  /** Step 6: Output Options */
  V.step6 = function (s) {
    var errors = [], warnings = [];
    if (notEmpty(s.email_notify) && !isEmail(s.email_notify))
      errors.push('Notification email address is not valid.');
    if (s.save_trajectories === 'ALL' && s.n_particles > 1000000)
      warnings.push('Saving ALL trajectories for >1M particles may generate tens of TB of output.');
    if (!s.cutoff_rigidity && s.output_mode === 'SHELLS')
      warnings.push('Cutoff rigidity map is recommended when running in Shell mode.');
    return errors.length ? err(errors, warnings) : ok(warnings);
  };

  // ── FULL RUN VALIDATION ────────────────────────────────────────────────
  /**
   * Run all step validators and return a summary.
   * @returns {{ steps: Object[], allOk: boolean }}
   */
  V.all = function () {
    var s = AMPS.state;
    var results = [
      V.step1(s), V.step2(s), V.step3(s),
      V.step4a(s), V.step4b(s), V.step5(s), V.step6(s)
    ];
    var allOk = results.every(function (r) { return r.ok; });
    return { steps: results, allOk: allOk };
  };

  // ── LIVE FIELD-LEVEL VALIDATION ────────────────────────────────────────
  /**
   * Called on input/change events for individual fields.
   * Updates visual state of the field element.
   */
  V.field = function (id, value) {
    var rules = {
      pi_email:         function (v) { return isEmail(v) ? null : 'Invalid email format.'; },
      ts_dst:           function (v) { return inRange(v,-600,100)  ? null : 'Range: −600 to +100 nT'; },
      ts_pdyn:          function (v) { return inRange(v,0.1,50)    ? null : 'Range: 0.1–50 nPa'; },
      ts_bz:            function (v) { return inRange(v,-100,50)   ? null : 'Range: −100 to +50 nT'; },
      ts_vx:            function (v) { return inRange(v,-1200,-200)? null : 'Range: −1200 to −200 km/s'; },
      ts_nsw:           function (v) { return inRange(v,0.5,100)   ? null : 'Range: 0.5–100 cm⁻³'; },
      energy_min:       function (v) { return v>0               ? null : 'Must be > 0'; },
      energy_max:       function (v) { return v>0               ? null : 'Must be > 0'; },
      band_gamma1:      function (v) { return inRange(v,-5,-0.1)   ? null : 'Range: −5 to −0.1'; },
      band_gamma2:      function (v) { return inRange(v,-8,-1)     ? null : 'Range: −8 to −1'; },
      band_ebreak:      function (v) { return inRange(v,1,2000)    ? null : 'Range: 1–2000 MeV/n'; },
      field_update_dt:  function (v) { return inRange(v,1,120)     ? null : 'Range: 1–120 min'; },
      inject_dt:        function (v) { return inRange(v,5,480)     ? null : 'Range: 5–480 min'; },
      box_xmax:         function (v) { return v>0 ? (v<9?'warn:< 9 RE clips magnetopause':null) : 'Must be positive'; },
      box_xmin:         function (v) { return v<0 ? null : 'Must be negative'; },
      box_rinner:       function (v) { return inRange(v,1,4)       ? null : 'Range: 1–4 RE'; },
      shue_r0:          function (v) { return inRange(v,4,15)      ? null : 'Range: 4–15 RE'; },
      shue_alpha:       function (v) { return inRange(v,0.3,0.9)   ? null : 'Range: 0.3–0.9'; },
      shue_xtail:       function (v) { return v<-10               ? null : 'Must be < −10 RE'; },
    };
    var rule = rules[id];
    if (!rule) return;
    var msg = rule(parseFloat(value) !== NaN ? parseFloat(value) : value);
    if (msg === null) {
      markField(id, 'ok', '');
    } else if (msg && msg.startsWith('warn:')) {
      markField(id, 'warn', msg.slice(5));
    } else {
      markField(id, 'err', msg);
    }
  };

  // ── EXPORT ─────────────────────────────────────────────────────────────
  AMPS.validate = V;

}());
