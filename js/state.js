/**
 * AMPS CCMC Interface — State Management
 * amps-ccmc/js/state.js
 *
 * Single source of truth for all form values.
 * Persists to localStorage with debounced writes.
 * All other modules read/write via AMPS.state API.
 */
(function () {
  'use strict';

  // ── DEFAULT STATE (full schema for all 7 wizard steps) ─────────────────
  var DEFAULTS = {

    /* ── Step 1: Run Information ─────────────────────────────────── */
    pi_name:         '',
    pi_email:        '',
    pi_institution:  '',
    coinvestigators: '',
    run_title:       '',
    run_description: '',
    run_keywords:    '',
    run_purpose:     'SCIENCE',   // VALIDATION | SCIENCE | OPERATIONAL | OTHER

    /* ── Step 2: Particle Type & Species ─────────────────────────── */
    sim_type:        'SEP',       // SEP | GCR | COMBINED
    species_H:       true,        // H+ (SEP primary)
    species_He:      false,       // He2+ (SEP secondary)
    species_e:       false,       // electrons (TBD)
    species_GCR:     false,       // GCR protons
    energy_min:      10,          // MeV/n
    energy_max:      1000,        // MeV/n
    energy_bins:     20,
    n_particles:     1000000,
    pitch_angle:     'ISOTROPIC', // ISOTROPIC | CONE30 | UNIDIRECTIONAL | CUSTOM
    pitch_cone_half: 30,          // degrees (for CONE30)

    /* ── Step 3: Background Field Model ──────────────────────────── */
    bfield_model:    'TS05',      // TS05 | TA15 | BATSRUS | GAMERA | IGRF | DIPOLE
    ts_version:      'TS05',      // TS05 | TA15 | T01 | T96
    ts_input_mode:   'SCALAR',    // SCALAR | TIME_SERIES | OMNIWEB
    ts_dst:          -142.0,      // nT
    ts_pdyn:         3.5,         // nPa
    ts_bz:          -18.5,        // nT  (IMF Bz GSM)
    ts_vx:          -650.0,       // km/s
    ts_nsw:          12.0,        // cm-3
    ts_by:           3.2,         // nT
    ts_bx:           0.0,         // nT
    ts_epoch:        '2017-09-07T23:30',
    ts_source_label: 'WDC Kyoto + OMNIWeb (Sep 2017)',
    efield_model:    'VXB',       // NONE | VXB | MHD
    corotation:      true,
    mhd_run_id:      '',

    /* ── Step 4a: Temporal Variability ───────────────────────────── */
    temporal_mode:   'TIME_SERIES', // STEADY_STATE | TIME_SERIES | COUPLED_MHD
    event_start:     '2017-09-10T12:00',
    event_end:       '2017-09-14T00:00',
    field_update_dt: 5.0,          // minutes
    inject_dt:       30.0,         // minutes
    ts_driving_src:  'OMNIWEB',    // OMNIWEB | FILE | SCALAR
    omni_cadence:    '5min',       // 1min | 5min | 1hr

    /* ── Step 4b: Spectrum ───────────────────────────────────────── */
    spectrum_type:   'BAND',      // MOTTL_NYMMIK | BAND | TABLE | GOES_AUTO | BADHWAR_ONEILL
    band_gamma1:    -1.6,         // low-energy power-law index
    band_gamma2:    -3.2,         // high-energy power-law index
    band_ebreak:     110.0,       // MeV/n break energy
    band_j0:         32000,       // cm-2 s-1 sr-1 (MeV/n)-1
    gcr_phi:         550,         // MV solar modulation potential (Badhwar-ONeill)
    gcr_model:       'BO2014',    // BO2014 | ISO15390
    spectrum_file_H:  null,
    spectrum_file_He: null,

    /* ── Step 5: Domain Boundary ──────────────────────────────────── */
    boundary_type:   'SHUE',     // BOX | SHUE
    // Box parameters (GSM, RE)
    box_xmax:        15.0,
    box_xmin:       -60.0,
    box_ymax:        25.0,
    box_ymin:       -25.0,
    box_zmax:        20.0,
    box_zmin:       -20.0,
    box_rinner:       2.0,
    // Shue parameters
    shue_mode:       'AUTO',     // AUTO | MANUAL
    shue_r0:          8.56,      // RE (used when MANUAL)
    shue_alpha:       0.617,     // (used when MANUAL)
    shue_xtail:      -60.0,      // RE flat nightside cap
    shue_rinner:      2.0,       // RE inner loss sphere

    /* ── Step 5: Output Domain ────────────────────────────────────── */
    output_mode:     'TRAJECTORY',  // POINTS | TRAJECTORY | SHELLS
    // Mode A — individual points
    output_coord:    'GEO',         // GEO | GSM | SM
    points_count:    1,             // number of point entries
    points_data:     '0.0 0.0 500', // lat lon alt per line
    // Mode B — spacecraft trajectory
    trajectory_coord:'GEO',
    trajectory_file_name: '',
    flux_dt:          1.0,          // min along track
    extra_shell_alt:  500.0,        // km (0 = no extra shell)
    // Mode C — spherical shells
    n_shells:         1,
    shell_1_alt:      500.0,        // km
    shell_2_alt:      0.0,          // 0 = disabled
    shell_3_alt:      0.0,
    shell_lat_min:   -90.0,
    shell_lat_max:    90.0,
    shell_lat_step:    2.0,
    shell_lon_min:  -180.0,
    shell_lon_max:   180.0,
    shell_lon_step:    2.0,

    /* ── Step 6: Output Options ───────────────────────────────────── */
    output_format:     'ASCII',   // ASCII | CDF | NETCDF4 | HDF5
    kamodo_output:     true,
    cutoff_rigidity:   true,
    save_trajectories: 'NONE',   // NONE | SAMPLE_1000 | ALL
    dist_function:     false,    // output phase-space distribution
    colormap:          'VIRIDIS',// RAINBOW | VIRIDIS | PLASMA | INFERNO
    email_notify:      '',
    special_request:   '',

    /* ── Internal / meta ──────────────────────────────────────────── */
    amps_version:      '2025.1',
    ccmc_run_id:       '',        // assigned at submission
    submission_time:   '',
    step_visited:      [false, false, false, false, false, false, false],
    step_valid:        [false, false, false, false, false, false, false]
  };

  // ── MODULE INIT ────────────────────────────────────────────────────────
  window.AMPS = window.AMPS || {};

  /** Deep-copy of default values */
  AMPS.defaults = JSON.parse(JSON.stringify(DEFAULTS));

  /** Live state (mutations happen here) */
  AMPS.state = JSON.parse(JSON.stringify(DEFAULTS));

  // ── PERSISTENCE ────────────────────────────────────────────────────────
  var _saveTimer = null;

  AMPS.save = function () {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () {
      try { localStorage.setItem('amps_run_state', JSON.stringify(AMPS.state)); }
      catch (e) { /* quota exceeded / private mode — silently ignore */ }
    }, 800);
  };

  AMPS.load = function () {
    try {
      var raw = localStorage.getItem('amps_run_state');
      if (raw) {
        var saved = JSON.parse(raw);
        // Merge saved over defaults so new fields added later get their defaults
        AMPS.state = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), saved);
        return true;
      }
    } catch (e) { /* corrupted storage — start fresh */ }
    return false;
  };

  AMPS.reset = function () {
    AMPS.state = JSON.parse(JSON.stringify(DEFAULTS));
    try { localStorage.removeItem('amps_run_state'); } catch (e) {}
  };

  // ── FIELD ACCESS ───────────────────────────────────────────────────────
  /**
   * Read a value (with optional fallback to default).
   * @param {string} key
   * @param {*}      fallback  returned if key is undefined/null
   */
  AMPS.get = function (key, fallback) {
    var v = AMPS.state[key];
    return (v !== undefined && v !== null) ? v
           : (fallback !== undefined ? fallback : AMPS.defaults[key]);
  };

  /**
   * Write a value, persist, and trigger UI updates.
   * @param {string} key
   * @param {*}      val
   * @param {boolean} [silent]  skip sidebar refresh if true
   */
  AMPS.set = function (key, val, silent) {
    AMPS.state[key] = val;
    AMPS.save();
    if (!silent) {
      if (typeof AMPS.ui !== 'undefined' && AMPS.ui.refreshSidebar) {
        AMPS.ui.refreshSidebar();
      }
    }
  };

  /**
   * Batch-set multiple keys at once.
   * @param {Object} obj  { key: value, ... }
   */
  AMPS.setMany = function (obj) {
    Object.keys(obj).forEach(function (k) { AMPS.state[k] = obj[k]; });
    AMPS.save();
    if (typeof AMPS.ui !== 'undefined' && AMPS.ui.refreshSidebar) {
      AMPS.ui.refreshSidebar();
    }
  };

  /**
   * Mark a wizard step as visited/valid.
   * @param {number} stepIdx  0-based
   * @param {boolean} valid
   */
  AMPS.setStepValid = function (stepIdx, valid) {
    AMPS.state.step_valid[stepIdx] = valid;
    AMPS.state.step_visited[stepIdx] = true;
    AMPS.save();
  };

  /** True if all required steps have been validated. */
  AMPS.allStepsValid = function () {
    // Steps 0–5 must be valid; step 6 (output options) is optional
    return AMPS.state.step_valid.slice(0, 6).every(Boolean);
  };

  // Expose defaults for external reference
  AMPS.DEFAULTS = DEFAULTS;

}());
