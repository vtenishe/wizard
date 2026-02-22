/*
=====================================================================
FILE: js/02-wizard.js
INTENT:
  JavaScript logic for the AMPS web wizard (static site). This module
  implements a focused part of the UI: state updates, model selection,
  preview rendering, or navigation.

METHODS / DESIGN:
  - Reads/writes the shared state object `S` (defined in js/01-state.js).
  - Uses direct DOM manipulation (no framework) for portability.
  - Functions are intentionally small and side-effectful: they update `S`
    and then update the DOM so the UI always reflects the current state.

IMPLEMENTATION NOTES:
  - Prefer pure helpers for formatting and mapping, but keep UI updates
    local so it’s clear which elements are affected.
  - Avoid introducing new global names unless necessary; when you do,
    document them here and in-line.
  - Keep behavior consistent between modular (index.html + js/*.js) and
    standalone (AMPS_Interface.html) entrypoints.

LAST UPDATED: 2026-02-21
=====================================================================
*/
/* =============================================================================
   FILE:    js/02-wizard.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Wizard navigation — step transitions, DOM panel visibility,
            section accordion collapse/expand, and step-indicator strip updates.

   PUBLIC API (called from HTML onclick / keyboard handlers)
     goStep(n)        — navigate to wizard step n (1–11)
     nextStep()       — advance one step
     prevStep()       — go back one step
     goToReview()     — jump directly to step 11 (review & submit)
     toggleSection(id)— collapse or expand an accordion section card

   BEHAVIOUR
     · When navigating to step n:
         – S.done marks the current step as completed
         – The .panel-{n} element becomes visible; all others hidden
         – Wizard step indicators in .wz-step update: done / active / default
         – Prev button disabled on step 1; Next button hidden on step 11
         – Page scrolls to top (smooth)
         – Sidebar summary refreshes
         – Review step (11) triggers buildReview()
     · Step 6 (E-Field) is automatically skipped when S.fieldMethod
       is 'GRIDLESS' (set in Step 2).  See goStep() for details.
     · toggleSection flips the 'closed' CSS class which hides .sect-body
       and rotates the chevron icon via CSS transform.

   DEPENDS ON: 01-state.js (S, $, updateSidebar, buildReview)
=============================================================================*/

/**
 * Navigate the wizard to step n.
 * Marks the current step as done, activates panel n,
 * updates the step-indicator strip, and scrolls to top.
 *
 * GRIDLESS E-FIELD HANDLING (added 2026-02-21):
 *   When S.fieldMethod === 'GRIDLESS' (set in Step 2), the electric
 *   field is physically excluded from the simulation.  Step 6 (E-Field)
 *   is still navigable by direct click on the wizard strip — this
 *   shows the panel with a gridless-overlay message explaining why
 *   E-field is excluded and how to enable it (switch to GRID_3D).
 *
 *   However, the sequential Next/Prev buttons skip step 6 automatically
 *   so the user doesn't have to click through an empty step during
 *   the normal linear workflow.  This skip is implemented in
 *   nextStep() and prevStep(), NOT in goStep() itself.
 *
 * @param {number} n - target step (1–11)
 */
function goStep(n) {
  if (n < 1 || n > 11) return;

  S.done.add(S.step);   // mark current step completed before leaving
  S.step = n;

  /* ── Show/hide step content panels ── */
  for (let i = 1; i <= 11; i++) {
    const panel = $(`panel-${i}`);
    if (panel) panel.classList.toggle('active', i === n);
  }

  /* ── Update wizard step-indicator strip ── */
  const steps = document.querySelectorAll('.wz-step');
  steps.forEach((el, idx) => {
    const stepNum = idx + 1;
    el.classList.remove('done', 'active');
    if (S.done.has(stepNum)) el.classList.add('done');
    else if (stepNum === n) el.classList.add('active');
  });

  /* ── Action bar buttons ── */
  const btnPrev   = $('btn-prev');
  const btnNext   = $('btn-next');
  const btnSubmit = $('btn-submit');
  if (btnPrev)   btnPrev.disabled                = (n === 1);
  if (btnNext)   btnNext.style.display           = n < 11 ? 'inline-flex' : 'none';
  if (btnSubmit) btnSubmit.style.display         = n === 11 ? 'inline-flex' : 'none';

  /* ── Side effects ── */
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateSidebar();
  if (n === 11) buildReview();  // re-render the param-file preview
}

/** Advance one wizard step.
 *  In gridless mode, skip step 6 (E-Field is excluded). */
function nextStep() {
  let next = S.step + 1;
  if (next === 6 && S.fieldMethod === 'GRIDLESS') next = 7;
  goStep(next);
}

/** Go back one wizard step.
 *  In gridless mode, skip step 6 (E-Field is excluded). */
function prevStep() {
  let prev = S.step - 1;
  if (prev === 6 && S.fieldMethod === 'GRIDLESS') prev = 5;
  goStep(prev);
}

/** Jump directly to the Review & Submit step. */
function goToReview() { goStep(11); }

/* ── Wizard step label click handlers (generated in HTML) ── */
/**
 * Jump to a step by clicking its label in the wizard strip.
 * Only allowed for already-completed steps or the next sequential step.
 * @param {number} n - target step number
 */
function wizClick(n) {
  /*
   * INDEX.HTML (modular build) originally enforced a linear “wizard order”
   * by allowing navigation only to:
   *   - the current step,
   *   - the next step, or
   *   - previously completed steps (tracked in S.done).
   *
   * However, the standalone version allows RANDOM ACCESS to any step, and
   * that interaction is preferred for development + power-user workflows.
   *
   * We therefore remove gating here: any step label can jump directly to
   * that step. The rest of the wizard still:
   *   - marks the current step “done” when leaving (goStep adds S.step to S.done)
   *   - updates step strip styling (done/active)
   *   - rebuilds Review (step 10) on entry
   */
  goStep(n);
}

/* ── Section accordion ──────────────────────────────────────────────── */
/**
 * Toggle the collapsed/expanded state of a .sect accordion card.
 * Toggling the 'closed' CSS class hides .sect-body and rotates .chevron.
 * @param {string} id - element ID of the .sect container
 */
function toggleSection(id) {
  const el = $(id);
  if (el) el.classList.toggle('closed');
}
