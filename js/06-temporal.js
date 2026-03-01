/* =============================================================================
   FILE:    js/06-temporal.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 6 — Temporal variability of the background magnetic field.

   ╔═══════════════════════════════════════════════════════════════════════╗
   ║                        ARCHITECTURE OVERVIEW                        ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║                                                                     ║
   ║  AMPS can run the background B-field in three temporal modes:      ║
   ║                                                                     ║
   ║  STEADY_STATE   — single-epoch snapshot. B is frozen at the TS05   ║
   ║                   scalars from Step 3. Fastest; good for Störmer   ║
   ║                   cutoff maps and parameter sweeps.                ║
   ║                   Keyword: TEMPORAL_MODE = STEADY_STATE            ║
   ║                                                                     ║
   ║  TIME_SERIES    — pre-computed field updates every FIELD_UPDATE_DT ║
   ║                   minutes. Each update reads one row of             ║
   ║                   ts05_driving.txt (8 TS05 scalars). Particles     ║
   ║                   are injected every INJECT_DT minutes.            ║
   ║                   Recommended for storm-time SEP transport.        ║
   ║                   Keyword: TEMPORAL_MODE = TIME_SERIES             ║
   ║                                                                     ║
   ║  MHD_COUPLED    — self-consistent BATS-R-US / GAMERA evolution.   ║
   ║                   Not yet available; planned for 2026.             ║
   ║                   Keyword: TEMPORAL_MODE = MHD_COUPLED             ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  TIME_SERIES DATA PIPELINE                                         ║
   ║                                                                     ║
   ║  The driving data (ts05_driving.txt) can come from three sources:  ║
   ║                                                                     ║
   ║  'omni'   — OMNIWeb auto-fetch pipeline (simulated client-side):   ║
   ║             Step 1: Query omniweb.gsfc.nasa.gov for OMNI SW data   ║
   ║             Step 2: Query WDC Kyoto for Dst / Sym-H               ║
   ║             Step 3: Merge streams; detect and gap-fill             ║
   ║             Step 4: Generate preview table + data-quality report   ║
   ║             (Real fetch happens server-side on CCMC submission)    ║
   ║                                                                     ║
   ║  'file'   — User uploads a pre-built ts05_driving.txt             ║
   ║  'scalar' — Manual single-row scalar input (for testing)          ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  ts05_driving.txt FORMAT                                           ║
   ║                                                                     ║
   ║  One header line starting with '#'.                                ║
   ║  Data columns (space-delimited, one epoch per row):                ║
   ║    YYYY MM DD HH MM  Dst[nT]  Pdyn[nPa]  Bz[nT]  Vx[km/s]       ║
   ║    Nsw[cm⁻³]  By[nT]  Bx[nT]                                      ║
   ║  Timestamps must be strictly monotonically increasing.             ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  STATE PROPERTIES READ/WRITTEN  (from S in 01-state.js)           ║
   ║                                                                     ║
   ║  S.tempMode    string  'STEADY_STATE' | 'TIME_SERIES' | 'MHD_…'  ║
   ║  S.eventStart  string  ISO datetime  (event start)                 ║
   ║  S.eventEnd    string  ISO datetime  (event end)                   ║
   ║  S.fieldDt     number  field-update cadence [min]                  ║
   ║  S.injectDt    number  particle injection cadence [min]            ║
   ║  S.tsSource    string  'omni' | 'file' | 'scalar'                 ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  AMPS_PARAM.in KEYWORDS GENERATED (by 08-review.js)               ║
   ║                                                                     ║
   ║  #TEMPORAL                                                         ║
   ║  TEMPORAL_MODE     = STEADY_STATE | TIME_SERIES | MHD_COUPLED     ║
   ║  EVENT_START       = YYYY-MM-DDTHH:MM (TIME_SERIES only)          ║
   ║  EVENT_END         = YYYY-MM-DDTHH:MM (TIME_SERIES only)          ║
   ║  FIELD_UPDATE_DT   = <int> min                                     ║
   ║  INJECT_DT         = <int> min                                     ║
   ║  TS_INPUT_MODE     = OMNIWEB | FILE | SCALAR                      ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  DOM ELEMENTS TOUCHED                                              ║
   ║                                                                     ║
   ║  .temp-card[data-mode]   — temporal mode selection cards           ║
   ║  #ts-form                — TIME_SERIES config form (hidden in SS) ║
   ║  #field-update-dt        — FIELD_UPDATE_DT input                   ║
   ║  #inject-dt              — INJECT_DT input                         ║
   ║  #dt-warn                — warning: inject < field cadence         ║
   ║  #ts-timeline            — cadence visualisation timeline          ║
   ║  #ts-source-tog          — omni/file/scalar toggle group           ║
   ║  #omni-panel/#file-panel — source sub-panels                       ║
   ║  #event-start/#event-end — datetime pickers                        ║
   ║  #omni-cadence           — cadence dropdown (1min/5min/1hr)        ║
   ║  #omni-status            — fetch progress display                  ║
   ║  #os-1..#os-4            — 4-step progress indicators              ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  FUNCTION INDEX                                                    ║
   ║                                                                     ║
   ║  §1 MODE SELECTION                                                 ║
   ║     setTempMode(m)         — switch temporal mode card             ║
   ║                                                                     ║
   ║  §2 CADENCE MANAGEMENT                                            ║
   ║     checkDtPair()          — validate field vs inject cadence      ║
   ║     updateTimeline()       — redraw cadence visualisation          ║
   ║                                                                     ║
   ║  §3 DATA SOURCE                                                    ║
   ║     setTsSource(btn, src)  — switch omni/file/scalar source        ║
   ║     simulateOmniFetch()    — animate OMNIWeb pipeline display      ║
   ║                                                                     ║
   ╚═══════════════════════════════════════════════════════════════════════╝

   DEPENDS ON: 01-state.js (S, $), updateSidebar() from 02-wizard.js
   LAST UPDATED: 2026-03-01
============================================================================= */


/* ═══════════════════════════════════════════════════════════════════════════
   §1  MODE SELECTION — STEADY_STATE vs TIME_SERIES vs MHD_COUPLED
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Switch the temporal mode.
 *
 * Highlights the selected card and shows/hides the TIME_SERIES config form.
 * In STEADY_STATE mode, the form is hidden because no time stepping occurs.
 *
 * @param {string} m — 'STEADY_STATE' | 'TIME_SERIES' | 'MHD_COUPLED'
 */
function setTempMode(m) {
  S.tempMode = m;

  /* Highlight the selected card; cards use data-mode attribute for matching */
  document.querySelectorAll('.temp-card').forEach(c =>
    c.classList.toggle('sel', c.dataset.mode === m)
  );

  /* Show/hide the time-series configuration form.
     STEADY_STATE needs no temporal config; TIME_SERIES and MHD need it. */
  $('ts-form').style.display = m !== 'STEADY_STATE' ? 'block' : 'none';

  updateSidebar();
}


/* ═══════════════════════════════════════════════════════════════════════════
   §2  CADENCE MANAGEMENT — FIELD_UPDATE_DT vs INJECT_DT

   The field-update cadence (FIELD_UPDATE_DT) controls how often the
   background B-field is refreshed from the driving time series.
   The injection cadence (INJECT_DT) controls how often new test
   particles are injected at the boundary.

   Constraint: INJECT_DT ≥ FIELD_UPDATE_DT  (injecting faster than
   the field updates is wasteful and can cause numerical artefacts).
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Validate FIELD_UPDATE_DT vs INJECT_DT and update the timeline.
 *
 * Reads both values from their DOM inputs, writes to S, and shows
 * a warning if INJECT_DT < FIELD_UPDATE_DT (invalid configuration).
 *
 * Called from oninput handlers on #field-update-dt and #inject-dt.
 */
function checkDtPair() {
  /* Read current values (default to safe fallbacks) */
  const fd = parseFloat($('field-update-dt')?.value) || 5;   // field cadence [min]
  const id = parseFloat($('inject-dt')?.value)       || 30;  // inject cadence [min]

  S.fieldDt  = fd;
  S.injectDt = id;

  /* Show warning if injection is faster than field updates */
  $('dt-warn').style.display = id < fd ? 'block' : 'none';

  /* Redraw the cadence timeline visualisation */
  updateTimeline();
}

/**
 * Redraw the cadence visualisation timeline.
 *
 * The timeline is a horizontal strip (#ts-timeline) spanning 120 simulated
 * minutes, showing:
 *   • Blue vertical ticks at every FIELD_UPDATE_DT — field refresh events
 *   • ⚡ markers at every INJECT_DT — particle injection events
 *   • Time labels at 30-minute intervals
 *
 * This gives users an intuitive feel for the relationship between the
 * two cadences (e.g. "the field updates 6× between each injection").
 *
 * Implementation: clears and rebuilds the DOM each call.
 * Performance is fine — the timeline has at most ~120 elements.
 */
function updateTimeline() {
  const tl = $('ts-timeline');
  if (!tl) return;

  /* Start with the base axis line */
  tl.innerHTML = '<div class="fu-axis"></div>';

  const dur = 120;                                // display window [min]
  const fd  = Math.max(1, S.fieldDt);             // field cadence [min], min 1
  const id_ = Math.max(1, S.injectDt);            // inject cadence [min], min 1

  /* ── Field-update ticks (blue) ─────────────────────────────────────── */
  for (let t = 0; t <= dur; t += fd) {
    const pct = (t / dur) * 100;

    /* Blue tick mark */
    const tick = document.createElement('div');
    tick.className = 'fu-tick';
    tick.style.left = pct + '%';
    tl.appendChild(tick);

    /* Time labels every 30 minutes */
    if (t % 30 === 0) {
      const lbl = document.createElement('div');
      lbl.className = 'fu-label';
      lbl.style.left = pct + '%';
      lbl.textContent = t + 'm';
      tl.appendChild(lbl);
    }
  }

  /* ── Injection markers (⚡) ─────────────────────────────────────────── */
  for (let t = id_; t <= dur; t += id_) {
    const pct = (t / dur) * 100;
    const p = document.createElement('div');
    p.className = 'fu-particle';
    p.style.left = (pct - 0.5) + '%';  // slight offset for centering
    p.textContent = '⚡';
    tl.appendChild(p);
  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   §3  DATA SOURCE — OMNIWeb / File upload / Scalar

   Controls which source provides the ts05_driving.txt data for
   TIME_SERIES mode.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Switch the time-series input source.
 *
 * Manages the three-way toggle (OMNIWeb / Upload / Scalar) and
 * shows/hides the corresponding sub-panels.
 *
 * Note: Accepts either (btn, src) or (src) calling conventions for
 * backward compatibility with both new and old HTML event handlers.
 *
 * @param {HTMLElement|string} btnOrSrc — button element or source string
 * @param {string}             [src]    — 'omni' | 'file' | 'scalar'
 */
function setTsSource(btnOrSrc, src) {
  /* Support both calling conventions:
     setTsSource(btn, 'omni')  — new HTML (passes button + source)
     setTsSource('omni')       — old refs (just source string) */
  const mode = src || btnOrSrc;
  S.tsSource = mode;

  /* Toggle button highlights in the source selector group */
  document.querySelectorAll('#ts-source-tog .tog-btn').forEach(b => b.classList.remove('on'));
  const btnId = { omni: 'ts-omni-btn', file: 'ts-file-btn', scalar: 'ts-scalar-btn' }[mode];
  if (btnId) $(btnId)?.classList.add('on');

  /* Show/hide source-specific panels */
  $('omni-panel').style.display = mode === 'omni' ? 'block' : 'none';
  $('file-panel').style.display = mode === 'file' ? 'block' : 'none';
}

/**
 * Animate the 4-step OMNIWeb fetch pipeline display.
 *
 * This is a CLIENT-SIDE SIMULATION — the actual OMNIWeb API calls
 * happen on the CCMC server when the job is submitted.  This animation
 * gives the user a preview of what will happen and validates their
 * time range / cadence selections.
 *
 * Pipeline steps (animated with 700ms delays):
 *   1. "Querying omniweb.gsfc.nasa.gov for OMNI data…"
 *   2. "Querying wdc.kugi.kyoto-u.ac.jp for Dst / Sym-H…"
 *   3. "Merging streams and gap-filling…"
 *   4. "Generating preview and data quality report…"
 *
 * On completion, displays:
 *   - Time range confirmation
 *   - Row count and cadence
 *   - Simulated gap detection report (hardcoded demo gap)
 *
 * Reads: #omni-cadence (dropdown), #event-start, #event-end (datetime inputs)
 * Writes: #os-1..#os-4 (step indicators), #omni-status (status text)
 */
function simulateOmniFetch() {
  /* ── Read configuration from DOM ────────────────────────────────────── */
  const cadSel = $('omni-cadence');
  const cadMin = cadSel && cadSel.value.startsWith('1 min') ? 1
               : cadSel && cadSel.value.startsWith('1 hr')  ? 60
               : 5;  // default: 5 min

  const startEl = $('event-start');
  const endEl   = $('event-end');
  const start   = startEl ? new Date(startEl.value) : new Date('2017-09-07T00:00');
  const end     = endEl   ? new Date(endEl.value)   : new Date('2017-09-10T20:00');

  /* Calculate expected row count */
  const hrs      = Math.max(0, (end - start) / (1000 * 3600));
  const rowCount = Math.round(hrs * 60 / cadMin);

  /* ── Pipeline messages ──────────────────────────────────────────────── */
  const msgs = [
    `⏳ Querying omniweb.gsfc.nasa.gov for ${cadMin}-min OMNI…`,
    '⏳ Querying wdc.kugi.kyoto-u.ac.jp for Dst / Sym-H…',
    '⏳ Merging streams and gap-filling…',
    '⏳ Generating preview and data quality report…'
  ];

  /* Step indicator element IDs */
  const steps = ['os-1', 'os-2', 'os-3', 'os-4'];

  /* ── Reset all step indicators to "pending" state ───────────────────── */
  steps.forEach(id => {
    const e = $(id);
    if (e) {
      e.classList.remove('done');
      e.className = 'os-num pending';
      e.textContent = steps.indexOf(id) + 1;
    }
  });

  /* Show first message */
  const st = $('omni-status');
  if (st) st.innerHTML = `<span style="color:var(--orange)">${msgs[0]}</span>`;

  /* ── Animate steps with 700ms delays ────────────────────────────────── */
  let i = 0;
  const adv = () => {
    /* Mark previous step as done (✓) */
    if (i > 0) {
      const pe = $(steps[i - 1]);
      if (pe) { pe.className = 'os-num done'; pe.textContent = '✓'; }
    }

    if (i < steps.length) {
      /* Highlight current step as active (…) */
      const ce = $(steps[i]);
      if (ce) { ce.className = 'os-num'; ce.style.background = 'var(--orange)'; ce.textContent = '…'; }

      /* Update status message */
      if (st && msgs[i]) st.innerHTML = `<span style="color:var(--orange)">${msgs[i]}</span>`;

      i++;
      setTimeout(adv, 700);  // advance to next step after delay
    } else {
      /* ── All steps complete — show summary report ───────────────────── */
      const s = startEl ? startEl.value.replace('T', ' ') : '-';
      const e = endEl   ? endEl.value.replace('T', ' ')   : '-';

      if (st) {
        st.innerHTML =
          `<span class="ok">✓ Fetch complete</span>&nbsp;&nbsp;` +
          `Time range: <span style="color:#fff;">${s} → ${e} UTC</span><br/>` +
          `${rowCount} rows @ ${cadMin} min cadence&nbsp;·&nbsp;` +
          `<span class="warn">⚠ 1 gap 19:00–19:30 UTC — linear interpolation applied (6 rows)</span>`;
      }
    }
  };

  adv();  // kick off the animation chain
}

/* ── END OF 06-temporal.js (Step 6: Spectrum comment is vestigial) ──── */
