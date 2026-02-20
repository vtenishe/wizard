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
    11. goStep(1)                 — navigate to Step 1 (Run Info)

   NOTE: The DOMContentLoaded event is used (not window.onload) so that
         init runs as soon as the HTML tree is ready, without waiting for
         images or other resources.

   DEPENDS ON: all other modules (must be loaded last)
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

  /* ── 11. Wizard to step 1 ── */
  goStep(1);
}

document.addEventListener('DOMContentLoaded', init);
