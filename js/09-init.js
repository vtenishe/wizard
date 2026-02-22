/*
=====================================================================
FILE: js/09-init.js
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
   FILE:    js/09-init.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Application bootstrap — wires everything together after the DOM
            is fully parsed.

   BOOT SEQUENCE
     1. drawSvgGrid('shue-grid')  — paint background grid in the Shue SVG
     2. drawSvgGrid('box-grid')   — paint background grid in the BOX SVG
     3. bndShueUpdate()           — compute initial Shue r₀/α and draw curve
     4. Compute initial Kp from default Dst via dstToKp()
     5. Compute initial VS intensity A from Kp via vsIntensityA()
     6. Update auto-Kp display label in the VS panel
     7. renderBins()              — build initial energy bin list DOM
     8. drawSpec()                — draw initial spectrum canvas
     9. drawEfieldSchematic()     — draw initial efield SVG schematic
    10. updateSidebar()           — populate sidebar summary
   10a. applyFieldMethodConstraints() — enforce initial GRIDLESS constraints
        (disables MHD model cards, grays out E-field step indicator,
         shows gridless overlay in E-field panel).  Must run after
         updateSidebar() so that sidebar reflects the constrained state,
         and before goStep(1) so that the wizard strip is correct.
    11. goStep(1)                 — navigate to Step 1 (Run Info)

   NOTE: The DOMContentLoaded event is used (not window.onload) so that
         init runs as soon as the HTML tree is ready, without waiting for
         images or other resources.

   DEPENDS ON: all other modules (must be loaded last)
               Specifically added: 02a-calcmode.js (applyFieldMethodConstraints)
=============================================================================*/

/**
 * Application entry point.
 * Called once when the DOM is ready.
 */
function init() {
  /* ── 1–2. Background grids for SVG diagrams ── */
  drawSvgGrid('shue-grid');
  drawSvgGrid('box-grid');

  /* ── 3. Initial Shue magnetopause diagram ── */
  bndShueUpdate();

  /* ── 4–6. Volland–Stern initial Kp and intensity ── */
  S.vsKp = dstToKp(S.dst);          // derive Kp from default Dst = -142 nT
  S.vsA  = vsIntensityA(S.vsKp);
  const kpDisplay = $('vs-kp-auto-display');
  if (kpDisplay) kpDisplay.textContent = S.vsKp.toFixed(1);

  /* ── 7. Energy bin list ── */
  renderBins();

  /* ── 8. Spectrum canvas ── */
  drawSpec();

  /* ── 9. Electric field schematic ── */
  drawEfieldSchematic();

  /* ── 10. Sidebar summary ── */
  updateSidebar();

  /* ── 10a. Apply calculation mode constraints (added 2026-02-21) ────
   *  The default field method is GRIDLESS (analytic Tsyganenko).
   *  applyFieldMethodConstraints() propagates the consequences:
   *    - MHD model cards (BATSRUS, GAMERA) in Step 4 are disabled.
   *    - E-field step indicator in the wizard strip is grayed out.
   *    - E-field overlay is shown inside the Step 6 panel.
   *    - S.eFieldCoro and S.eFieldConvModel are forced off.
   *  This must run after updateSidebar() (so sidebar state is fresh)
   *  and before goStep(1) (so the wizard strip renders correctly).
   *  Defined in: js/02a-calcmode.js */
  applyFieldMethodConstraints();

  /* ── 11. Wizard to step 1 ── */
  goStep(1);
}

document.addEventListener('DOMContentLoaded', init);
