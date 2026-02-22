/*
=====================================================================
FILE: js/05-efield.js
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
   FILE:    js/05-efield.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 5 — Electric field model configuration.
            Handles corotation E, Volland–Stern convection E, and
            Weimer (2005) convection E, plus the live SVG schematic.

   ELECTRIC FIELD COMPONENTS

   1. COROTATION  (always physically correct for inner magnetosphere)
      E_coro = −(ω × r) × B
      Earth's rotation drives charged particles to co-rotate with the
      planet.  Excluding this is physically wrong for L < ~6 RE.
      Keyword: COROTATION_E = YES | NO
      Default: YES (strongly recommended)

   2. CONVECTION — VOLLAND–STERN  (default; robust; Kp-parameterised)
      Classical Volland (1973) / Stern (1975) model.
      Uniform dawn-to-dusk electric field shielded by a factor (L/L₀)^γ.
      Parameterised by Kp index alone — derived automatically from Dst
      via the empirical relation  Kp ≈ (−Dst/23)^0.5 − 0.5
      or entered manually.
      Parameters:
        Kp    — geomagnetic activity index [0–9]
        γ     — shielding exponent [1.5–3.0; default 2.0]
      Keyword: CONV_E_MODEL = VOLLAND_STERN
      Recommended for most SEP runs; fast; analytically invertible.

   3. CONVECTION — WEIMER (2005)  (advanced; IMF/solar-wind driven)
      Weimer (2005) statistical high-latitude electric-field model.
      Driven by IMF Bz, By, solar-wind Pdyn and Vx (read from Step 3
      TS05 drivers in auto mode, or from uploaded file in file mode).
      More realistic for event studies where IMF orientation matters.
      Keyword: CONV_E_MODEL = WEIMER
      Note: adds ~15% overhead vs. Volland–Stern.

   LIVE SVG SCHEMATIC  (#efield-svg, 200×200 px)
     Drawn by drawEfieldSchematic() whenever any E-field parameter changes.
     Corotation:     concentric dashed green circles  (like equipotentials)
     Volland–Stern:  pairs of offset blue/orange ellipses, scaled by Kp
     Weimer:         asymmetric arc pattern, scaled by |Bz|

   PUBLIC API (called from HTML onclick / oninput)
     setCorotation(include)  — toggle corotation on/off (bool or 0/1)
     setConvModel(model)     — 'VOLLAND_STERN' | 'WEIMER' | 'NONE'
     setVsKpMode(mode)       — 'auto' (from Dst) | 'manual' (user input)
     vsParamChange()         — sync VS parameter inputs → S + redraw
     setWeimerMode(mode)     — 'auto' (from TS05 drivers) | 'file' (upload)
     drawEfieldSchematic()   — render the SVG schematic from current S

   INTERNAL HELPERS
     dstToKp(dst)            — empirical Dst→Kp conversion
     vsIntensityA(kp)        — Volland–Stern intensity coefficient from Kp

   DEPENDS ON: 01-state.js (S, $, set)
=============================================================================*/

function dstToKp(dst) {
  return Math.max(0, Math.min(9, Math.round((-dst / 28 + 0.8) * 10) / 10));
}
function vsIntensityA(kp) {
  const d = Math.pow(1 - 0.159*kp + 0.0093*kp*kp, 3);
  return d > 0 ? 0.045/d : 0.045;
}
function setCorotation(include) {
  S.eFieldCoro = include;
  $('ecoro-yes-btn')?.classList.toggle('on', include);
  $('ecoro-no-btn')?.classList.toggle('on', !include);
  const warn = $('ecoro-off-warn'); if (warn) warn.style.display = !include ? 'block' : 'none';
  const kw = $('kw-efield-coro'); if (kw) kw.textContent = include ? 'YES' : 'NO';
  updateSidebar();
}
function setConvModel(model) {
  S.eFieldConvModel = model;
  document.querySelectorAll('.bnd-card[id^="econv-"]').forEach(c => c.classList.remove('sel'));
  $(`econv-${model.toLowerCase().replace('_','-')}`)?.classList.add('sel');
  $('vs-panel').style.display     = model === 'VOLLAND_STERN' ? 'block' : 'none';
  $('weimer-panel').style.display = model === 'WEIMER'        ? 'block' : 'none';
  document.querySelectorAll('.vs-kw-row').forEach(r =>
    r.style.display = model === 'VOLLAND_STERN' ? '' : 'none');
  document.querySelectorAll('.weimer-kw-row').forEach(r =>
    r.style.display = model === 'WEIMER' ? '' : 'none');
  const kw = $('kw-efield-conv'); if (kw) kw.textContent = model;
  drawEfieldSchematic();
  updateSidebar();
}
function setVsKpMode(mode) {
  S.vsKpMode = mode;
  $('vs-kp-auto-btn')?.classList.toggle('on', mode === 'auto');
  $('vs-kp-man-btn')?.classList.toggle('on',  mode === 'manual');
  $('vs-kp-auto-row').style.display   = mode === 'auto'   ? 'flex' : 'none';
  $('vs-kp-manual-row').style.display = mode === 'manual' ? 'flex' : 'none';
  vsParamChange();
}
function vsParamChange() {
  if (S.vsKpMode === 'manual') S.vsKp = parseFloat($('vs-kp-input')?.value) ?? S.vsKp;
  else { S.vsKp = dstToKp(S.dst); const d=$('vs-kp-auto-display'); if(d) d.textContent=S.vsKp.toFixed(1); }
  S.vsGamma = parseFloat($('vs-gamma')?.value) || S.vsGamma;
  S.vsA = vsIntensityA(S.vsKp);
  const set=(id,v)=>{const e=$(id);if(e)e.textContent=v;};
  set('vs-a-display', S.vsA.toFixed(4));
  set('kw-vs-kp',     S.vsKpMode==='auto' ? 'AUTO' : S.vsKp.toFixed(1));
  set('kw-vs-gamma',  S.vsGamma.toFixed(1));
  set('kw-vs-a',      S.vsA.toFixed(4));
  const st=$('vs-kp-status');
  if(st){
    if(S.vsKp<2){st.textContent='🟢 Quiet';st.style.color='var(--green)';}
    else if(S.vsKp<5){st.textContent='🟡 Moderate';st.style.color='var(--orange)';}
    else{st.textContent='🔴 Storm';st.style.color='var(--red)';}
  }
  drawEfieldSchematic();
}
function setWeimerMode(mode) {
  S.weimerMode = mode;
  $('weimer-auto-btn')?.classList.toggle('on', mode==='auto');
  $('weimer-file-btn')?.classList.toggle('on', mode==='file');
  $('weimer-auto-panel').style.display = mode==='auto' ? 'block' : 'none';
  $('weimer-file-panel').style.display = mode==='file' ? 'block' : 'none';
}
function drawEfieldSchematic() {
  const svg=$('efield-svg'); if(!svg) return;
  const CX=100,CY=100; let h='';
  if(S.eFieldCoro){
    for(let r=20;r<=85;r+=22)
      h+=`<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="rgba(45,212,160,.2)" stroke-width="1" stroke-dasharray="4,4"/>`;
    h+=`<text x="128" y="38" font-size="9" fill="rgba(45,212,160,.55)" font-family="IBM Plex Mono">corot.</text>`;
  }
  if(S.eFieldConvModel==='VOLLAND_STERN'){
    const kp=S.vsKp||5, sc=0.55+kp*0.06;
    [18,36,58].forEach(d=>{
      const off=d*sc*0.35;
      h+=`<ellipse cx="${CX-off}" cy="${CY}" rx="${d}" ry="${d*.75}" fill="none" stroke="rgba(56,192,255,.28)" stroke-width="1.2" transform="rotate(-12,${CX},${CY})"/>`;
      h+=`<ellipse cx="${CX+off}" cy="${CY}" rx="${d}" ry="${d*.75}" fill="none" stroke="rgba(255,154,60,.28)" stroke-width="1.2" transform="rotate(12,${CX},${CY})"/>`;
    });
    h+=`<text x="8" y="105" font-size="9" fill="rgba(56,192,255,.65)" font-family="IBM Plex Mono">Dawn+</text>`;
    h+=`<text x="148" y="105" font-size="9" fill="rgba(255,154,60,.65)" font-family="IBM Plex Mono">Dusk−</text>`;
    h+=`<text x="46" y="192" font-size="8" fill="rgba(255,208,75,.6)" font-family="IBM Plex Mono">Kp=${kp.toFixed(1)} γ=${S.vsGamma.toFixed(1)}</text>`;
  } else if(S.eFieldConvModel==='WEIMER'){
    const r1=38+Math.min(3,Math.abs(S.bz||0)/8)*12;
    h+=`<path d="M${CX},${CY-r1} A${r1},${r1*.85} -20 0,1 ${CX+r1*.65},${CY}" fill="none" stroke="rgba(139,111,247,.45)" stroke-width="1.5"/>`;
    h+=`<path d="M${CX},${CY-r1} A${r1},${r1*.85} 20 0,0 ${CX-r1*.65},${CY}" fill="none" stroke="rgba(139,111,247,.45)" stroke-width="1.5"/>`;
    h+=`<text x="30" y="192" font-size="8" fill="rgba(139,111,247,.65)" font-family="IBM Plex Mono">Weimer Bz=${(S.bz||0).toFixed(1)} nT</text>`;
  }
  h+=`<circle cx="${CX}" cy="${CY}" r="6" fill="#1a88d4"/>`;
  h+=`<line x1="${CX}" y1="${CY}" x2="168" y2="${CY}" stroke="rgba(255,208,75,.18)" stroke-width="1" stroke-dasharray="3,4"/>`;
  h+=`<text x="164" y="107" font-size="9" fill="rgba(255,208,75,.45)" font-family="IBM Plex Mono">☀</text>`;
  svg.innerHTML=h;
}

