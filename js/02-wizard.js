/* =============================================================================
   FILE:    js/02-wizard.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Wizard navigation — step transitions, DOM panel visibility,
            section accordion collapse/expand, and step-indicator strip updates.

   PUBLIC API (called from HTML onclick / keyboard handlers)
     goStep(n)        — navigate to wizard step n (1–10)
     nextStep()       — advance one step
     prevStep()       — go back one step
     goToReview()     — jump directly to step 10 (review & submit)
     toggleSection(id)— collapse or expand an accordion section card

   BEHAVIOUR
     · When navigating to step n:
         – S.done marks the current step as completed
         – The .panel-{n} element becomes visible; all others hidden
         – Wizard step indicators in .wz-step update: done / active / default
         – Prev button disabled on step 1; Next button hidden on step 10
         – Page scrolls to top (smooth)
         – Sidebar summary refreshes
         – Review step (10) triggers buildReview()
     · toggleSection flips the 'closed' CSS class which hides .sect-body
       and rotates the chevron icon via CSS transform.

   DEPENDS ON: 01-state.js (S, $, updateSidebar, buildReview)
=============================================================================*/

/**
 * Navigate the wizard to step n.
 * Marks the current step as done, activates panel n,
 * updates the step-indicator strip, and scrolls to top.
 * @param {number} n - target step (1–10)
 */
function goStep(n) {
  if (n < 1 || n > 10) return;
  S.done.add(S.step);   // mark current step completed before leaving
  S.step = n;

  /* ── Show/hide step content panels ── */
  for (let i = 1; i <= 10; i++) {
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
  if (btnNext)   btnNext.style.display           = n < 10 ? 'inline-flex' : 'none';
  if (btnSubmit) btnSubmit.style.display         = n === 10 ? 'inline-flex' : 'none';

  /* ── Side effects ── */
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateSidebar();
  if (n === 10) buildReview();  // re-render the param-file preview
}

/** Advance one wizard step. */
function nextStep() { goStep(S.step + 1); }

/** Go back one wizard step. */
function prevStep() { goStep(S.step - 1); }

/** Jump directly to the Review & Submit step. */
function goToReview() { goStep(10); }

/* ── Wizard step label click handlers (generated in HTML) ── */
/**
 * Jump to a step by clicking its label in the wizard strip.
 * Only allowed for already-completed steps or the next sequential step.
 * @param {number} n - target step number
 */
function wizClick(n) {
  if (S.done.has(n) || n === S.step || n === S.step + 1) goStep(n);
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
