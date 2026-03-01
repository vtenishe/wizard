/* =============================================================================
   FILE:    js/05-efield.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 5 — Electric-field model configuration.

   ╔═══════════════════════════════════════════════════════════════════════╗
   ║                        ARCHITECTURE OVERVIEW                        ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║                                                                     ║
   ║  The convection electric field in the inner magnetosphere is the    ║
   ║  dominant force (after magnetic Lorentz) controlling how energetic  ║
   ║  particles are transported radially.  AMPS models it as:           ║
   ║                                                                     ║
   ║    E_total = E_corotation + E_convection                           ║
   ║                                                                     ║
   ║  This module handles the UI for selecting and parameterising each  ║
   ║  component, plus a live SVG schematic that visualises the combined ║
   ║  field topology.                                                    ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  STATE PROPERTIES READ/WRITTEN  (from S in 01-state.js)            ║
   ║                                                                     ║
   ║  S.eFieldCoro      bool     include corotation E?                  ║
   ║  S.eFieldConvModel string   'VOLLAND_STERN' | 'WEIMER' | 'NONE'   ║
   ║  S.vsKpMode        string   'auto' (from Dst) | 'manual'          ║
   ║  S.vsKp            float    Kp index [0–9]                         ║
   ║  S.vsGamma         float    VS shielding exponent [1.5–3.0]       ║
   ║  S.vsA             float    VS intensity coefficient (computed)    ║
   ║  S.weimerMode      string   'auto' (TS05 drivers) | 'file'        ║
   ║  S.dst             float    (read-only here) Dst index [nT]       ║
   ║  S.bz              float    (read-only here) IMF Bz [nT]          ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  AMPS_PARAM.in KEYWORDS GENERATED (by 08-review.js from these S)  ║
   ║                                                                     ║
   ║  #ELECTRIC_FIELD                                                   ║
   ║  COROTATION_E      = YES | NO                                      ║
   ║  CONV_E_MODEL      = VOLLAND_STERN | WEIMER | NONE                ║
   ║  VS_KP             = AUTO | <float>                                ║
   ║  VS_GAMMA          = <float>                                       ║
   ║  VS_A              = <float>  (auto-computed from Kp)              ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  PHYSICAL BACKGROUND                                               ║
   ║                                                                     ║
   ║  1. COROTATION  E_coro = −(ω × r) × B                             ║
   ║     Earth's rotation drives charged particles to co-rotate.        ║
   ║     Excluding this is physically wrong for L < ~6 RE.              ║
   ║     Default: YES (strongly recommended).                           ║
   ║                                                                     ║
   ║  2. VOLLAND–STERN  (Volland 1973, Stern 1975)                      ║
   ║     Uniform dawn-to-dusk E, shielded by (L/L₀)^γ.                 ║
   ║     Parameterised by Kp alone — fast, analytically invertible.     ║
   ║     Kp auto-derived: Kp ≈ (−Dst/28 + 0.8)  (clamped 0–9).       ║
   ║     Intensity: A = 0.045 / (1 − 0.159·Kp + 0.0093·Kp²)³         ║
   ║                                                                     ║
   ║  3. WEIMER (2005)  statistical high-latitude E model               ║
   ║     Driven by IMF Bz, By, Pdyn, Vx — more realistic but slower.  ║
   ║     ~15% overhead vs. Volland–Stern.                               ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  DOM ELEMENTS TOUCHED                                              ║
   ║                                                                     ║
   ║  #ecoro-yes-btn / #ecoro-no-btn   — corotation toggle buttons     ║
   ║  #ecoro-off-warn                  — warning when coro=NO           ║
   ║  #kw-efield-coro                  — keyword preview strip          ║
   ║  .bnd-card[id^="econv-"]          — convection model cards         ║
   ║  #vs-panel / #weimer-panel        — parameter sub-panels           ║
   ║  .vs-kw-row / .weimer-kw-row      — keyword preview rows          ║
   ║  #vs-kp-input / #vs-gamma         — Volland–Stern param inputs    ║
   ║  #vs-kp-auto-display / #vs-a-display  — computed value displays   ║
   ║  #vs-kp-status                    — activity level badge           ║
   ║  #efield-svg                      — 200×200 SVG schematic         ║
   ║                                                                     ║
   ╠═══════════════════════════════════════════════════════════════════════╣
   ║  FUNCTION INDEX                                                    ║
   ║                                                                     ║
   ║  §1 INTERNAL HELPERS (pure, no DOM)                                ║
   ║     dstToKp(dst)           — empirical Dst→Kp conversion           ║
   ║     vsIntensityA(kp)       — VS intensity coefficient A(Kp)       ║
   ║                                                                     ║
   ║  §2 PUBLIC API (called from HTML)                                  ║
   ║     setCorotation(include) — toggle corotation on/off              ║
   ║     setConvModel(model)    — select convection model               ║
   ║     setVsKpMode(mode)      — auto vs manual Kp                    ║
   ║     vsParamChange()        — sync VS inputs → S, recompute A      ║
   ║     setWeimerMode(mode)    — auto vs file Weimer source            ║
   ║                                                                     ║
   ║  §3 SVG SCHEMATIC                                                  ║
   ║     drawEfieldSchematic()  — render live SVG from current S        ║
   ║                                                                     ║
   ╚═══════════════════════════════════════════════════════════════════════╝

   DEPENDS ON: 01-state.js (S, $, set), updateSidebar() from 02-wizard.js
   LAST UPDATED: 2026-03-01
============================================================================= */


/* ═══════════════════════════════════════════════════════════════════════════
   §1  INTERNAL HELPERS — pure functions (no DOM, no side effects)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Convert Dst index to approximate Kp index.
 *
 * Uses a Burton-style empirical inversion:
 *     Kp ≈ (−Dst / 28 + 0.8)
 * clamped to [0, 9] and rounded to one decimal place.
 *
 * This is a rough proxy — fine for VS parameterisation in auto mode,
 * but not suitable for publication-quality Kp estimates.
 *
 * @param   {number} dst  — Dst index in nT (typically negative during storms)
 * @returns {number}        Kp in [0.0, 9.0]
 */
function dstToKp(dst) {
  return Math.max(0, Math.min(9, Math.round((-dst / 28 + 0.8) * 10) / 10));
}

/**
 * Compute the Volland–Stern intensity coefficient A from Kp.
 *
 * Formula (Maynard & Chen 1975):
 *     A = 0.045 / (1 − 0.159·Kp + 0.0093·Kp²)³
 *
 * A controls the overall strength of the dawn-to-dusk E field;
 * the potential is proportional to A·L^γ in the equatorial plane.
 * Higher Kp → stronger convection → larger A.
 *
 * Guard: if denominator ≤ 0 (Kp ≥ ~9.4, unphysical), returns baseline 0.045.
 *
 * @param   {number} kp  — Kp index [0–9]
 * @returns {number}       intensity coefficient A [kV/RE² units]
 */
function vsIntensityA(kp) {
  const d = Math.pow(1 - 0.159 * kp + 0.0093 * kp * kp, 3);
  return d > 0 ? 0.045 / d : 0.045;
}


/* ═══════════════════════════════════════════════════════════════════════════
   §2  PUBLIC API — UI handlers (read DOM inputs, write S, update DOM)

   Every function in this section follows the same pattern:
     1. Update S.property
     2. Sync DOM visual state (button highlights, panel visibility)
     3. Update keyword preview strips
     4. Call updateSidebar() and/or drawEfieldSchematic()
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Toggle corotation electric field on or off.
 *
 * Flow:
 *   1. Write S.eFieldCoro
 *   2. Toggle visual state of Yes/No buttons (.on class)
 *   3. Show/hide the "corotation off" warning banner
 *   4. Update keyword preview strip (#kw-efield-coro)
 *   5. Refresh sidebar summary
 *
 * @param {boolean|number} include — true/1 = include corotation, false/0 = exclude
 */
function setCorotation(include) {
  S.eFieldCoro = include;

  /* Toggle button highlight */
  $('ecoro-yes-btn')?.classList.toggle('on', include);
  $('ecoro-no-btn')?.classList.toggle('on', !include);

  /* Show warning when corotation is excluded (physically unusual) */
  const warn = $('ecoro-off-warn');
  if (warn) warn.style.display = !include ? 'block' : 'none';

  /* Update keyword preview strip */
  const kw = $('kw-efield-coro');
  if (kw) kw.textContent = include ? 'YES' : 'NO';

  updateSidebar();
}

/**
 * Select the convection electric-field model.
 *
 * Manages the three-card selection UI (Volland–Stern / Weimer / None)
 * and shows/hides the corresponding parameter panels and keyword rows.
 *
 * Flow:
 *   1. Write S.eFieldConvModel
 *   2. Highlight selected card, deselect others
 *   3. Show matching parameter panel, hide others
 *   4. Show/hide keyword preview rows for each model
 *   5. Update keyword preview strip (#kw-efield-conv)
 *   6. Redraw SVG schematic + refresh sidebar
 *
 * @param {string} model — 'VOLLAND_STERN' | 'WEIMER' | 'NONE'
 */
function setConvModel(model) {
  S.eFieldConvModel = model;

  /* Card selection: CSS class "sel" gives the blue border highlight.
     Card IDs are lowercase-hyphenated: econv-volland-stern, econv-weimer, econv-none */
  document.querySelectorAll('.bnd-card[id^="econv-"]').forEach(c => c.classList.remove('sel'));
  $(`econv-${model.toLowerCase().replace('_', '-')}`)?.classList.add('sel');

  /* Show/hide parameter sub-panels */
  $('vs-panel').style.display     = model === 'VOLLAND_STERN' ? 'block' : 'none';
  $('weimer-panel').style.display = model === 'WEIMER'        ? 'block' : 'none';

  /* Show/hide keyword preview rows matching each model */
  document.querySelectorAll('.vs-kw-row').forEach(r =>
    r.style.display = model === 'VOLLAND_STERN' ? '' : 'none');
  document.querySelectorAll('.weimer-kw-row').forEach(r =>
    r.style.display = model === 'WEIMER' ? '' : 'none');

  /* Update the main model keyword strip */
  const kw = $('kw-efield-conv');
  if (kw) kw.textContent = model;

  drawEfieldSchematic();
  updateSidebar();
}

/**
 * Switch Volland–Stern Kp source between AUTO and MANUAL.
 *
 * AUTO mode:   Kp is computed from S.dst via dstToKp().
 *              The user sees a read-only computed value in #vs-kp-auto-display.
 * MANUAL mode: The user types Kp directly into #vs-kp-input.
 *
 * After switching, calls vsParamChange() to recompute A and refresh displays.
 *
 * @param {string} mode — 'auto' | 'manual'
 */
function setVsKpMode(mode) {
  S.vsKpMode = mode;

  /* Toggle button highlight */
  $('vs-kp-auto-btn')?.classList.toggle('on', mode === 'auto');
  $('vs-kp-man-btn')?.classList.toggle('on',  mode === 'manual');

  /* Show the appropriate input row */
  $('vs-kp-auto-row').style.display   = mode === 'auto'   ? 'flex' : 'none';
  $('vs-kp-manual-row').style.display = mode === 'manual' ? 'flex' : 'none';

  /* Recompute Kp, A, and refresh everything */
  vsParamChange();
}

/**
 * Synchronise Volland–Stern parameters from DOM inputs → S, and recompute.
 *
 * Called whenever any VS-related input changes: Kp value, γ slider, or
 * the auto/manual mode toggle.
 *
 * Pipeline:
 *   1. Read Kp — from #vs-kp-input (manual) or dstToKp(S.dst) (auto)
 *   2. Read γ from #vs-gamma input
 *   3. Recompute A = vsIntensityA(Kp)
 *   4. Write computed values to display elements
 *   5. Update keyword preview strips (VS_KP, VS_GAMMA, VS_A)
 *   6. Set activity-level badge (🟢 Quiet / 🟡 Moderate / 🔴 Storm)
 *   7. Redraw SVG schematic
 */
function vsParamChange() {
  /* ── 1. Read Kp ─────────────────────────────────────────────────────── */
  if (S.vsKpMode === 'manual') {
    S.vsKp = parseFloat($('vs-kp-input')?.value) ?? S.vsKp;
  } else {
    /* AUTO: derive Kp from Dst (which was set in Step 3 B-field config) */
    S.vsKp = dstToKp(S.dst);
    const d = $('vs-kp-auto-display');
    if (d) d.textContent = S.vsKp.toFixed(1);
  }

  /* ── 2. Read shielding exponent γ ───────────────────────────────────── */
  S.vsGamma = parseFloat($('vs-gamma')?.value) || S.vsGamma;

  /* ── 3. Recompute intensity coefficient A ───────────────────────────── */
  S.vsA = vsIntensityA(S.vsKp);

  /* ── 4–5. Update display elements and keyword preview strips ────────── */
  const setText = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  setText('vs-a-display', S.vsA.toFixed(4));
  setText('kw-vs-kp',     S.vsKpMode === 'auto' ? 'AUTO' : S.vsKp.toFixed(1));
  setText('kw-vs-gamma',  S.vsGamma.toFixed(1));
  setText('kw-vs-a',      S.vsA.toFixed(4));

  /* ── 6. Activity-level badge ────────────────────────────────────────── */
  const st = $('vs-kp-status');
  if (st) {
    if      (S.vsKp < 2) { st.textContent = '🟢 Quiet';    st.style.color = 'var(--green)';  }
    else if (S.vsKp < 5) { st.textContent = '🟡 Moderate'; st.style.color = 'var(--orange)'; }
    else                  { st.textContent = '🔴 Storm';    st.style.color = 'var(--red)';    }
  }

  /* ── 7. Redraw schematic ────────────────────────────────────────────── */
  drawEfieldSchematic();
}

/**
 * Switch Weimer (2005) input data source between AUTO and FILE modes.
 *
 * AUTO: solar-wind drivers are read from the TS05 inputs set in Step 3.
 *       This is the simplest option — no extra file needed.
 * FILE: user uploads a Weimer-format driving file with time-dependent
 *       IMF and solar-wind data.
 *
 * @param {string} mode — 'auto' | 'file'
 */
function setWeimerMode(mode) {
  S.weimerMode = mode;

  /* Toggle button highlight */
  $('weimer-auto-btn')?.classList.toggle('on', mode === 'auto');
  $('weimer-file-btn')?.classList.toggle('on', mode === 'file');

  /* Show matching sub-panel */
  $('weimer-auto-panel').style.display = mode === 'auto' ? 'block' : 'none';
  $('weimer-file-panel').style.display = mode === 'file' ? 'block' : 'none';
}


/* ═══════════════════════════════════════════════════════════════════════════
   §3  SVG SCHEMATIC — live visualisation of the E-field topology

   The schematic is a 200×200 SVG (#efield-svg) drawn entirely in JS.
   It is redrawn from scratch whenever any E-field parameter changes.

   Visual language:
     • Dashed green circles   → corotation equipotentials (concentric)
     • Blue/orange ellipses   → Volland–Stern dawn(+)/dusk(−) convection lobes
     • Purple arcs            → Weimer asymmetric high-latitude pattern
     • Central blue dot       → Earth
     • Dashed yellow line     → sun direction (sunward = right)

   The schematic is QUALITATIVE, not quantitative — it gives the user
   a visual sense of the field topology and how parameters affect it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Render the electric-field SVG schematic from current state.
 *
 * Builds SVG innerHTML from scratch each call.  Uses string concatenation
 * rather than DOM APIs — the SVG is small enough that this is faster
 * than diffing/updating individual elements.
 *
 * Sections drawn (all conditional on current S):
 *   1. Corotation rings      — if S.eFieldCoro
 *   2. Volland–Stern lobes   — if S.eFieldConvModel === 'VOLLAND_STERN'
 *   3. Weimer arcs           — if S.eFieldConvModel === 'WEIMER'
 *   4. Earth dot + sun line  — always
 */
function drawEfieldSchematic() {
  const svg = $('efield-svg');
  if (!svg) return;

  const CX = 100, CY = 100;  // centre of 200×200 SVG viewport
  let h = '';

  /* ── 1. Corotation equipotentials — concentric dashed green rings ──── */
  if (S.eFieldCoro) {
    for (let r = 20; r <= 85; r += 22)
      h += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" `
         + `stroke="rgba(45,212,160,.2)" stroke-width="1" stroke-dasharray="4,4"/>`;
    h += `<text x="128" y="38" font-size="9" fill="rgba(45,212,160,.55)" `
       + `font-family="IBM Plex Mono">corot.</text>`;
  }

  /* ── 2. Volland–Stern dawn/dusk convection lobes ───────────────────── */
  if (S.eFieldConvModel === 'VOLLAND_STERN') {
    const kp = S.vsKp || 5;
    const sc = 0.55 + kp * 0.06;  // scale: higher Kp → larger lobes

    /* Three nested ellipse pairs at increasing radii (qualitative) */
    [18, 36, 58].forEach(d => {
      const off = d * sc * 0.35;  // dawn/dusk offset from centre
      /* Dawn lobe (blue, left of centre, tilted −12° for aesthetic) */
      h += `<ellipse cx="${CX - off}" cy="${CY}" rx="${d}" ry="${d * .75}" `
         + `fill="none" stroke="rgba(56,192,255,.28)" stroke-width="1.2" `
         + `transform="rotate(-12,${CX},${CY})"/>`;
      /* Dusk lobe (orange, right of centre, tilted +12°) */
      h += `<ellipse cx="${CX + off}" cy="${CY}" rx="${d}" ry="${d * .75}" `
         + `fill="none" stroke="rgba(255,154,60,.28)" stroke-width="1.2" `
         + `transform="rotate(12,${CX},${CY})"/>`;
    });

    /* Labels and parameter display */
    h += `<text x="8" y="105" font-size="9" fill="rgba(56,192,255,.65)" `
       + `font-family="IBM Plex Mono">Dawn+</text>`;
    h += `<text x="148" y="105" font-size="9" fill="rgba(255,154,60,.65)" `
       + `font-family="IBM Plex Mono">Dusk−</text>`;
    h += `<text x="46" y="192" font-size="8" fill="rgba(255,208,75,.6)" `
       + `font-family="IBM Plex Mono">Kp=${kp.toFixed(1)} γ=${S.vsGamma.toFixed(1)}</text>`;

  /* ── 3. Weimer asymmetric arcs ─────────────────────────────────────── */
  } else if (S.eFieldConvModel === 'WEIMER') {
    /* Arc radius scales with |Bz|: stronger southward IMF → bigger pattern.
       Capped at 3 increments to keep arcs inside the 200×200 viewport. */
    const r1 = 38 + Math.min(3, Math.abs(S.bz || 0) / 8) * 12;
    /* Dawn-side arc (sweeps clockwise from north to east) */
    h += `<path d="M${CX},${CY - r1} A${r1},${r1 * .85} -20 0,1 ${CX + r1 * .65},${CY}" `
       + `fill="none" stroke="rgba(139,111,247,.45)" stroke-width="1.5"/>`;
    /* Dusk-side arc (sweeps counter-clockwise from north to west) */
    h += `<path d="M${CX},${CY - r1} A${r1},${r1 * .85} 20 0,0 ${CX - r1 * .65},${CY}" `
       + `fill="none" stroke="rgba(139,111,247,.45)" stroke-width="1.5"/>`;
    h += `<text x="30" y="192" font-size="8" fill="rgba(139,111,247,.65)" `
       + `font-family="IBM Plex Mono">Weimer Bz=${(S.bz || 0).toFixed(1)} nT</text>`;
  }

  /* ── 4. Earth dot + sun direction marker (always drawn) ────────────── */
  h += `<circle cx="${CX}" cy="${CY}" r="6" fill="#1a88d4"/>`;
  h += `<line x1="${CX}" y1="${CY}" x2="168" y2="${CY}" `
     + `stroke="rgba(255,208,75,.18)" stroke-width="1" stroke-dasharray="3,4"/>`;
  h += `<text x="164" y="107" font-size="9" fill="rgba(255,208,75,.45)" `
     + `font-family="IBM Plex Mono">☀</text>`;

  svg.innerHTML = h;
}
