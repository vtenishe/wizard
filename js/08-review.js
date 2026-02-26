/*
=====================================================================
FILE: js/08-review.js
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
   FILE:    js/08-review.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 11 — Review, AMPS_PARAM.in file builder, run manifest,
            client-side validation, job submission, and sidebar summary.

   AMPS_PARAM.in FILE BUILDER  (buildReview)
     Generates a complete, commented AMPS_PARAM.in file from the current
     state object S.  Output is rendered into the #review-param element as
     colour-coded HTML using .kw-strip span classes, and can be:
       · Copied to clipboard  (copyParam)
       · Downloaded as a .in text file  (downloadParam)

     The param-file structure mirrors the AMPS v2025 input specification:
       #RUN_ID, #CALCULATION_MODE, #CUTOFF_RIGIDITY (conditional),
       #PARTICLE, #FIELD_MODEL + model-specific block,
       #DOMAIN_BOUNDARY, #ELECTRIC_FIELD, #TEMPORAL, #SPECTRUM, #OUTPUT

     CALCULATION_MODE SECTION (added 2026-02-21):
       Emitted unconditionally.  Contains:
         CALC_TARGET        — from S.calcQuantity
         FIELD_EVAL_METHOD  — from S.fieldMethod
         GRID_NX/NY/NZ + extents — only when fieldMethod === 'GRID_3D'

     CUTOFF_RIGIDITY SECTION (added 2026-02-21):
       Emitted only when S.calcQuantity is CUTOFF_RIGIDITY or BOTH.
       Contains:
         CUTOFF_EMIN, CUTOFF_EMAX, CUTOFF_MAX_PARTICLES, CUTOFF_NENERGY

     DENSITY_3D SECTION (added 2026-02-22):
       Emitted only when S.calcQuantity is DENSITY_3D.  Contains:
         DENS_EMIN, DENS_EMAX, DENS_NENERGY, DENS_ENERGY_SPACING

   RUN MANIFEST  (buildManifest)
     Lists all expected output files so users know what to retrieve after
     the run completes on the CCMC cluster.  Depends on output mode and
     energy bin count.

   VALIDATION  (buildValidation)
     Scans S for potentially dangerous or unusual configurations and
     returns an array of {level, text} warning objects:
       'ok'   — configuration looks standard
       'warn' — unusual but may be intentional (shown in amber)
       'error'— configuration will cause AMPS to fail (shown in red)

   SIDEBAR SUMMARY  (updateSidebar)
     Lightweight function called after every user interaction.
     Writes a one-line summary of each wizard step into the fixed
     right-hand sidebar for at-a-glance status.
     Also updates the progress bar fill (# done steps / 9).

   PUBLIC API
     buildReview()     — render full AMPS_PARAM.in preview into #review-param
     copyParam()       — copy plain-text param file to clipboard
     downloadParam()   — trigger browser download of amps_param.in
     buildManifest()   — return HTML string listing output files
     buildValidation() — return array of validation messages
     finalSubmit()     — submit the run to CCMC (triggers confirm dialog)
     updateSidebar()   — refresh the right-hand sidebar summary
     openHelpModal()   — show the help overlay

   DEPENDS ON: 01-state.js (S, $, set),
               03-bgfield.js (S.fieldModel),
               04-boundary.js (S.boundaryType, shueCalc),
               05-efield.js (S.eFieldCoro, S.eFieldConvModel)
=============================================================================*/

function buildReview(){
  const {r0,alpha}=getShue();
  const isM=S.shueMode==='manual';
  const f=(v,d)=>Number(v).toFixed(d);
  /* ── Output-domain block assembly (Step 9) ───────────────────────────
   *  The UI supports three output domains:
   *    - POINTS: a free-form list of points entered in the UI
   *    - TRAJECTORY: an uploaded/selected spacecraft trajectory file
   *    - SHELLS: one or more spherical shells for global maps
   *
   *  We assemble the domain-specific lines here to keep the template below
   *  readable and to avoid deeply nested template literals.
   */
  const fluxLine = `FLUX_DT                ${f(S.fluxDt,1)}           ! min (trajectory cadence; ignored for POINTS/SHELLS)`;

    /*
    OUTPUT DOMAIN EMISSION
    ----------------------
    The Output Domain step defines WHERE the model is evaluated and what the output
    cadence/representation should be. This affects the generated AMPS_PARAM.in.

    Modes implemented here:
      - POINTS: user-provided list of locations (one point per line).
      - TRAJECTORY: uploaded trajectory file with time-tagged samples.
      - SHELLS: one or more spherical shells defined by altitude(s) and angular resolution.

    Strategy:
      - Keep the UI layer simple: store raw text for POINTS and numeric arrays for SHELLS.
      - Perform light sanitization (trim empty lines / ignore comment lines starting with '#').
      - Emit explicit BEGIN/END blocks so the backend parser can read variable-length lists.
  */
let outDomainExtra = '';
  if (S.outputMode === 'POINTS') {
        // Parse the multiline textbox. We treat each non-empty, non-comment line as a point record.
    // The backend decides how to interpret the columns (e.g., lat lon alt_km).
    const raw = (S.pointsText || '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    const n = raw.length;
        // Emit each point as a single line starting with the POINT keyword.
    const body = raw.map(l => `POINT                 ${l}`).join('\n');
    outDomainExtra =
      `N_POINTS               ${n}                 ! number of points provided below\n` +
      `POINTS_BEGIN\n` +
      `${body || '! (no points specified)'}\n` +
      `POINTS_END`;
  } else if (S.outputMode === 'SHELLS') {
    const n = Math.max(1, Math.min(5, parseInt(S.shellCount || 1, 10)));
    const res = parseInt(S.shellResDeg || 1, 10);
    const alts = (Array.isArray(S.shellAltsKm) ? S.shellAltsKm : [])
      .slice(0, n)
      .map(v => f(parseFloat(v) || 0, 1));
    outDomainExtra =
      `SHELL_COUNT            ${n}                 ! number of shells\n` +
      `SHELL_ALTS_KM          ${alts.join(' ')}          ! km; one altitude per shell\n` +
      `SHELL_RES_DEG          ${res}                 ! deg; angular resolution (lat/lon)`;
  }

  /* ── Assemble the AMPS_PARAM.in text ─────────────────────────────────
   *  The array elements are joined with '\n'.  Conditional blocks use
   *  ternary expressions to emit model-specific sub-sections or empty
   *  strings based on the current state. */
  const txt=[
`! ═══════════════════════════════════════════════════════════════
! AMPS_PARAM.in — generated by CCMC Runs-on-Request interface
! Run: ${S.runName||'unnamed'}
! ═══════════════════════════════════════════════════════════════

#RUN_INFO
RUN_ID                 ${S.runName||'unnamed'}
PI_NAME                ${S.piName||'Unknown'}
PI_EMAIL               ${S.piEmail||'unknown@unknown.edu'}
SCIENCE_GOAL           ${$('science-goal')?.value||'custom'}

! ── Calculation mode (Step 2) ──────────────────────────────────
! CALC_TARGET: what the run computes (cutoff rigidity, flux, or both).
! FIELD_EVAL_METHOD: how B/E are evaluated (analytic vs grid interpolation).
! GRID_* keywords are only emitted when FIELD_EVAL_METHOD = GRID_3D.
#CALCULATION_MODE
CALC_TARGET            ${S.calcQuantity}
FIELD_EVAL_METHOD      ${S.fieldMethod}`,

/* ── Conditional: 3-D grid dimensions and spatial extent ──
 *  Only emitted when FIELD_EVAL_METHOD = GRID_3D.
 *  The grid is a regular Cartesian mesh in GSM coordinates. */
S.fieldMethod==='GRID_3D'?`GRID_NX                ${S.gridNx}
GRID_NY                ${S.gridNy}
GRID_NZ                ${S.gridNz}
GRID_XMIN              ${f(S.gridXmin,1)}         ! RE GSM
GRID_XMAX              ${f(S.gridXmax,1)}
GRID_YMIN              ${f(S.gridYmin,1)}
GRID_YMAX              ${f(S.gridYmax,1)}
GRID_ZMIN              ${f(S.gridZmin,1)}
GRID_ZMAX              ${f(S.gridZmax,1)}`:'',

/* ── Conditional: cutoff rigidity parameters ──
 *  Emitted when CALC_TARGET is CUTOFF_RIGIDITY or BOTH.
 *  Omitted for FLUX and DENSITY_3D (no cutoff computation). */
(S.calcQuantity==='CUTOFF_RIGIDITY'||S.calcQuantity==='BOTH')?`
! ── Cutoff rigidity scan (Step 2, Section C) ───────────────────
! Energy range and particle budget for backward-tracing cutoff search.
#CUTOFF_RIGIDITY
CUTOFF_EMIN            ${f(S.cutoffEmin,1)}          ! MeV/n
CUTOFF_EMAX            ${f(S.cutoffEmax,1)}       ! MeV/n
CUTOFF_MAX_PARTICLES   ${S.cutoffMaxParticles}              ! per injection point
CUTOFF_NENERGY         ${S.cutoffNenergy}               ! log-spaced energy bins`:'',

/* ── Conditional: 3-D ion density sampling parameters ──
 *  Emitted only when CALC_TARGET is DENSITY_3D.
 *  Defines the energy binning for energy-resolved density output. */
S.calcQuantity==='DENSITY_3D'?`
! ── 3-D ion density sampling (Step 2, Section D) ──────────────
! Energy-resolved density bins for forward-modeled particle transport.
#DENSITY_3D
DENS_EMIN              ${f(S.densEmin,1)}          ! MeV/n
DENS_EMAX              ${f(S.densEmax,1)}       ! MeV/n
DENS_NENERGY           ${S.densNenergy}               ! energy bins
DENS_ENERGY_SPACING    ${S.densEnergySpacing}           ! LOG or LINEAR`:'',
	/* NOTE ON NAMING CONSISTENCY -------------------------------------------------
	 * The website supports multiple background magnetic-field models (T96, T15, TS05,
	 * etc.). However, the *driving inputs* are shared physical quantities (Dst, Pdyn,
	 * IMF components, solar-wind Vx, solar-wind density). Older versions incorrectly
	 * prefixed these keys with a particular model ID (e.g., TS05_DST) even when
	 * FIELD_MODEL was not TS05, leading to confusing output like:
	 *   FIELD_MODEL T96 + TS05_* parameters
	 *
	 * To keep the generated AMPS input file stable and model-agnostic, we emit
	 * *generic* parameter names in the generated AMPS_PARAM.in. The backend/solver can
	 * interpret (or ignore) these fields depending on FIELD_MODEL.
	 *
	 * IMPORTANT: This note is a *code comment only*. It must NOT be emitted into the
	 * generated input file.
	 * -------------------------------------------------------------------------- */
	`
#PARTICLE_SPECIES
SPECIES                ${S.species.toUpperCase()}
CHARGE                 ${S.charge}               ! elementary charge
MASS_AMU               ${S.mass}           ! atomic mass units

#BACKGROUND_FIELD
FIELD_MODEL            ${S.fieldModel}
DST                    ${f(S.dst,1)}         ! nT ring current index (Dst)
PDYN                   ${f(S.pdyn,2)}          ! nPa solar-wind dynamic pressure
IMF_BZ                 ${f(S.bz,2)}         ! nT IMF Bz (GSM)
SW_VX                  ${f(S.vx,1)}       ! km/s solar-wind Vx
SW_N                   ${f(S.nsw,2)}         ! cm-3 solar-wind proton density
IMF_BY                 ${f(S.by,2)}          ! nT IMF By
IMF_BX                 ${f(S.bx,2)}          ! nT IMF Bx
EPOCH                  ${S.epoch}  ! UTC snapshot
! TS05 advanced inputs (optional; for reproducibility / TS05 W-variable runs)
! TS05_TILT_RAD          ${Number(S.ts05TiltRad||0).toFixed(4)}
! TS05_IMFFLAG           ${S.ts05ImfFlag==null?'':S.ts05ImfFlag}
! TS05_ISWFLAG           ${S.ts05SwFlag==null?'':S.ts05SwFlag}
! TS05_W1                ${S.ts05W1==null?'':Number(S.ts05W1).toFixed(2)}
! TS05_W2                ${S.ts05W2==null?'':Number(S.ts05W2).toFixed(2)}
! TS05_W3                ${S.ts05W3==null?'':Number(S.ts05W3).toFixed(2)}
! TS05_W4                ${S.ts05W4==null?'':Number(S.ts05W4).toFixed(2)}
! TS05_W5                ${S.ts05W5==null?'':Number(S.ts05W5).toFixed(2)}
! TS05_W6                ${S.ts05W6==null?'':Number(S.ts05W6).toFixed(2)}

#DOMAIN_BOUNDARY
BOUNDARY_TYPE          ${S.boundaryType}${S.boundaryType==='SHUE'?'  ! Shue et al. 1998 magnetopause':'  ! rectangular box in GSM'}`,
S.boundaryType==='BOX'?`DOMAIN_X_MAX           ${f(S.boxXmax,1)}         ! RE dayside
DOMAIN_X_MIN           ${f(S.boxXmin,1)}        ! RE nightside
DOMAIN_Y_MAX           ${f(S.boxYmax,1)}         ! RE dusk
DOMAIN_Y_MIN           ${f(S.boxYmin,1)}        ! RE dawn
DOMAIN_Z_MAX           ${f(S.boxZmax,1)}         ! RE north
DOMAIN_Z_MIN           ${f(S.boxZmin,1)}        ! RE south
R_INNER                ${f(S.boxRinner,1)}           ! RE inner loss sphere`:
`SHUE_R0                ${isM?f(r0,2):'AUTO'}            ! RE; AUTO = from TS05 Bz,Pdyn
SHUE_ALPHA             ${isM?f(alpha,3):'AUTO'}         ! flaring; AUTO = from TS05
DOMAIN_X_TAIL          ${f(S.xtail,1)}        ! RE nightside cap
R_INNER                ${f(S.shueRinner,1)}           ! RE inner loss sphere`,
`
#TEMPORAL
TEMPORAL_MODE          ${S.tempMode}`,
S.tempMode!=='STEADY_STATE'?`EVENT_START            ${S.eventStart}   ! UTC
EVENT_END              ${S.eventEnd}   ! UTC
FIELD_UPDATE_DT        ${S.fieldDt}                ! min
INJECT_DT              ${S.injectDt}               ! min
TS_INPUT_MODE          ${S.tsSource==='omni'?'OMNIWEB':S.tsSource==='file'?'FILE':'SCALAR'}`:
`EPOCH                  ${S.epoch}`,
`
#SPECTRUM
SPECTRUM_TYPE          ${S.specType}`,
S.specType==='POWER_LAW'?`SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA             ${f(S.specGamma,2)}         ! spectral index
SPEC_E0                ${f(S.specE0,1)}          ! MeV/n pivot`:
S.specType==='POWER_LAW_CUTOFF'?`SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA             ${f(S.specGamma,2)}         ! spectral index
SPEC_E0                ${f(S.specE0,1)}          ! MeV/n pivot
SPEC_EC                ${f(S.specEc,1)}        ! MeV/n exponential cutoff`:
S.specType==='LIS_FORCE_FIELD'?`SPEC_LIS_J0            ${S.specLisJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n) LIS normalization
SPEC_LIS_GAMMA         ${f(S.specLisGamma,2)}         ! LIS spectral index
SPEC_E0                ${f($('lis-e0')?.value||S.specE0,1)}          ! MeV/n pivot
SPEC_PHI               ${f(S.specPhi,0)}          ! MV solar modulation potential`:
S.specType==='BAND'?`SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA1            ${f(parseFloat($('band-gamma1')?.value)||3.5,2)}         ! low-energy index
SPEC_GAMMA2            ${f(parseFloat($('band-gamma2')?.value)||1.5,2)}         ! high-energy index
SPEC_E0                ${f(parseFloat($('band-e0')?.value)||10,1)}          ! MeV/n break energy`:
S.specType==='TABLE'?`SPEC_TABLE_FILE        sep_spectrum_H+.txt  ! user-provided E vs J table`:``,
`SPEC_EMIN              ${f(S.specEmin,1)}          ! MeV/n
SPEC_EMAX              ${f(S.specEmax,1)}       ! MeV/n

#OUTPUT_DOMAIN
OUTPUT_MODE            ${S.outputMode}
${fluxLine}
${outDomainExtra}

#OUTPUT_OPTIONS
FLUX_TYPE              ${S.fluxType}
OUTPUT_CUTOFF          ${$('output-cutoff')?.checked?'T':'F'}                    ! cutoff rigidity maps
OUTPUT_PITCH           ${$('output-pitch')?.checked?'T':'F'}                    ! pitch angle distributions
OUTPUT_FORMAT          ${$('output-format')?.value||S.outputFormat}
OUTPUT_COORDS          ${$('output-coords')?.value||S.outputCoords}
ENERGY_BINS            ${S.energyBins.join(' ')}   ! MeV/n

#NUMERICAL
N_PARTICLES            10000              ! test particles per injection
MAX_BOUNCE             500                ! max mirror reflections
DT_TRACE               1.0               ! s integration step
PITCH_ISOTROPIC        T                 ! isotropic injection

#END`
].join('\n');

  const el=$('review-param'); if(!el) return;
  el.innerHTML=txt
    .replace(/^(#\w[\w_]*)/gm,'<span class="r-section">$1</span>')
    .replace(/^(! .+)/gm,'<span class="r-comment">$1</span>')
    .replace(/(AUTO)/g,'<span class="r-auto">AUTO</span>');

  buildManifest(); buildValidation();
  return txt;
}

function copyParam(){ navigator.clipboard.writeText(buildReview().replace(/<[^>]+>/g,'')).then(()=>{ const b=$('copy-param'); if(b){b.textContent='✓ Copied';setTimeout(()=>{b.textContent='📋 Copy';},2000);} }); }
function downloadParam(){
  const txt=(buildReview()||'').replace(/<[^>]+>/g,'');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
  a.download='AMPS_PARAM.in'; a.click();
}

function buildManifest(){
  const tb=$('manifest-tbody'); if(!tb) return;
  const files=[
    {name:'AMPS_PARAM.in',      role:'Main configuration',            req:true, auto:true,  ok:true},
    {name:'AMPS_MANIFEST.json', role:'Run metadata (auto-generated)', req:true, auto:true,  ok:true},
    {name:'trajectory.txt',     role:'Spacecraft trajectory (Mode B)',req:S.outputMode==='TRAJECTORY', auto:false, ok:S.trajLoaded},
    {name:'points.txt',         role:'Point list (Mode A)',             req:S.outputMode==='POINTS', auto:false, ok:!!(S.pointsText&&S.pointsText.trim())},
    {name:'ts05_driving.txt',   role:'TS05 time-series drivers',      req:S.tempMode==='TIME_SERIES'&&S.tsSource==='file', auto:S.tsSource==='omni', ok:true},
    {name:'sep_spectrum_H+.txt',role:'Spectrum table (if TABLE mode)',req:S.specType==='TABLE', auto:false, ok:S.specType!=='TABLE'},
  ];
  tb.innerHTML=files.filter(f=>f.req||f.auto).map(f=>`
    <tr>
      <td style="font-family:var(--font-mono);color:var(--text)">${f.name}</td>
      <td style="color:var(--text-dim)">${f.role}</td>
      <td style="color:${f.req?'var(--text)':'var(--text-muted)'}">${f.req?'Required':'Optional'}</td>
      <td style="color:${f.auto?'var(--green)':'var(--text-dim)'}">${f.auto?'Auto-generated':'User upload'}</td>
      <td class="${f.ok?'vt-pass':'vt-fail'}">${f.ok?'✓ READY':'✗ MISSING'}</td>
    </tr>`).join('');
}

function buildValidation(){
  const {r0,alpha}=getShue();

  /* ── Validation checks ─────────────────────────────────────────────
   *  Each check is an object {l: label, ok: boolean, warn?: boolean}.
   *    ok=true  → PASS (green)
   *    ok=false, warn=false → FAIL / fatal (red) — blocks submission
   *    ok=false, warn=true  → WARNING (amber)    — allows submission
   *
   *  New checks added for Step 2 (Calculation Mode):
   *    - Calc target must be a recognized keyword.
   *    - Field method must be a recognized keyword.
   *    - Cutoff Emin must be strictly less than Emax (skipped if FLUX).
   *    - Cutoff max particles must be at least 50 (skipped if FLUX).
   *    - Gridless mode must not be paired with an MHD field model
   *      (BATSRUS/GAMERA require grid interpolation).
   * ──────────────────────────────────────────────────────────────────── */
  const chks=[
    /* ── Step 1: Run info ── */
    {l:'Run name set',           ok:!!(S.runName?.trim())},
    {l:'PI email valid',         ok:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('pi-email')?.value||'')},

    /* ── Step 2: Calculation mode ──
     *  These ensure the two top-level choices are valid and mutually
     *  consistent.  The gridless+Tsyganenko check prevents the user
     *  from submitting an impossible configuration (MHD model needs
     *  a grid, but gridless was selected).
     *  The DENSITY_3D checks ensure grid mode is active and that the
     *  density energy range is valid. */
    {l:'Calc target selected',   ok:['CUTOFF_RIGIDITY','FLUX','BOTH','DENSITY_3D'].includes(S.calcQuantity)},
    {l:'Field method selected',  ok:['GRIDLESS','GRID_3D'].includes(S.fieldMethod)},
    {l:'Cutoff Emin < Emax',     ok:S.calcQuantity!=='CUTOFF_RIGIDITY'&&S.calcQuantity!=='BOTH'||(S.cutoffEmin<S.cutoffEmax)},
    {l:'Cutoff particles ≥ 50',  ok:S.calcQuantity!=='CUTOFF_RIGIDITY'&&S.calcQuantity!=='BOTH'||(S.cutoffMaxParticles>=50)},
    {l:'Density Emin < Emax',    ok:S.calcQuantity!=='DENSITY_3D'||(S.densEmin<S.densEmax)},
    {l:'Density → 3-D Grid required', ok:S.calcQuantity!=='DENSITY_3D'||S.fieldMethod==='GRID_3D'},
    {l:'Gridless → Tsyganenko only', ok:S.fieldMethod!=='GRIDLESS'||!['BATSRUS','GAMERA'].includes(S.fieldModel)},

    /* ── Step 3–5: Field, boundary ── */
    {l:'Dst in TS05 range',      ok:S.dst>=-600&&S.dst<=50},
    {l:'Pdyn > 0.1 nPa',         ok:S.pdyn>0.1},
    {l:'Domain boundary set',    ok:['BOX','SHUE'].includes(S.boundaryType)},
    {l:'Shue r₀ plausible (5–13 RE)', ok:S.boundaryType!=='SHUE'||( r0>5&&r0<13)},

    /* ── Step 7–10: Temporal, spectrum, output ── */
    {l:'Inject Δt ≥ Field Update', ok:S.tempMode==='STEADY_STATE'||S.injectDt>=S.fieldDt},
    {l:'Energy bins defined',    ok:S.energyBins.length>0},
    {l:'Spectrum type selected', ok:['POWER_LAW','POWER_LAW_CUTOFF','LIS_FORCE_FIELD','BAND','TABLE'].includes(S.specType)},
    {l:'Output mode selected',   ok:['POINTS','TRAJECTORY','SHELLS'].includes(S.outputMode)},
    {l:'Trajectory file loaded', ok:S.outputMode!=='TRAJECTORY'||S.trajLoaded, warn:true},
    {l:'Point list provided',    ok:S.outputMode!=='POINTS'||!!(S.pointsText&&S.pointsText.trim())},
    {l:'Shell altitudes set',    ok:S.outputMode!=='SHELLS'||(Array.isArray(S.shellAltsKm)&&S.shellAltsKm.length>=1&&S.shellAltsKm.slice(0,Math.max(1,parseInt(S.shellCount||1,10))).every(v=>parseFloat(v)>0))},
  ];
  const pass=chks.filter(c=>c.ok).length;
  const fail=chks.filter(c=>!c.ok&&!c.warn).length;
  const warn=chks.filter(c=>!c.ok&&c.warn).length;
  const rs=$('review-summary');
  if(rs) rs.innerHTML=`<span class="v-ok">✓ ${pass} passed</span> · <span class="v-warn">⚠ ${warn} warning</span> · <span class="v-err">✗ ${fail} fatal</span>`;
  const rc=$('review-checks'); if(rc){ rc.innerHTML='';
    chks.forEach(c=>{ const d=document.createElement('div');
      d.className='review-item '+(c.ok?'ri-ok':c.warn?'ri-warn':'');
      d.innerHTML=`<div class="ri-label">${c.l}</div><div class="ri-val">${c.ok?'✓ PASS':c.warn?'⚠ WARN':'✗ FAIL'}</div>`;
      rc.appendChild(d); }); }
  const sb=$('submit-btn-final'); if(sb) sb.disabled=fail>0;
}

function finalSubmit(){
  const m=$('submit-modal'); if(m) m.style.display='flex';
}

/* ── 6. SIDEBAR ──────────────────────────────────────────────────────
 *  updateSidebar() writes a one-line summary of each wizard step into
 *  the fixed right-hand sidebar.  It is called after every user
 *  interaction that changes state (input change, card click, etc.).
 *
 *  The local `set` function is a sidebar-scoped wrapper around the
 *  global `set()` in 01-state.js, but adds a 'sb-v' class prefix
 *  for sidebar-specific CSS styling (green/orange/red badges).
 *
 *  Progress bar: the bar fill is (done steps / 10) × 100%.
 *  There are 10 completable steps (1–10); step 11 is Review and is
 *  not itself "completable" — it's the terminal state.
 * ──────────────────────────────────────────────────────────────────── */
function updateSidebar(){
  const set=(id,v,cls)=>{ const e=$(id); if(e){e.textContent=v;if(cls)e.className='sb-v '+cls;} };

  /* ── Step 1: Run name ── */
  set('sb-run-name', S.runName||'(not set)', S.runName?'':'o');

  /* ── Step 2: Calculation mode (added 2026-02-21) ──
   *  Two sidebar rows: 'Calc target' and 'Field method'.
   *  prettyCalcTarget maps the raw state keyword to a human-readable
   *  label for the sidebar badge. */
  const prettyCalcTarget = {
    CUTOFF_RIGIDITY: 'CUTOFF RIGIDITY',
    FLUX: 'PARTICLE FLUX',
    BOTH: 'CUTOFF + FLUX',
    DENSITY_3D: '3-D ION DENSITY'
  };
  set('sb-calc-target', prettyCalcTarget[S.calcQuantity] || S.calcQuantity, 'g');
  set('sb-field-method', S.fieldMethod === 'GRIDLESS' ? 'Gridless (analytic)' : '3-D Grid', S.fieldMethod === 'GRIDLESS' ? 'g' : '');

  /* ── Step 3: Species ── */
  set('sb-species',  S.species==='proton'?'H⁺ Proton':S.species==='helium'?'He²⁺':S.species==='electron'?'e⁻':S.species,'g');

  /* ── Step 4: Background B-field ── */
  // Sidebar must reflect the actual user-selected background B-field model.
  // (Previously this was hard-coded to 'TS05', which made the review summary incorrect.)
  const prettyField = {
    TS05: 'TS05 (Tsyganenko 2005)',
    T04S: 'T04s (Tsyganenko 2004 storm)',
    T96:  'T96 (Tsyganenko 1996)',
    T95M: 'T95m (modified Tsyganenko 1995)',
    T15:  'T15 (Tsyganenko 2015)',
    BATSRUS: 'BATSRUS (MHD input)',
    GAMERA:  'GAMERA (MHD input)'
  };
  set('sb-field-model', prettyField[S.fieldModel] || S.fieldModel || '—', 'g');

  /* ── Step 5: Boundary ── */
  set('sb-boundary', S.boundaryType==='SHUE'?'Shue 1998':'Box (GSM)','g');

  /* ── Step 6: E-field — disabled in gridless mode (added 2026-02-21) ──
   *  When S.fieldMethod is 'GRIDLESS', the E-field is physically excluded
   *  from the simulation.  The sidebar shows "N/A (gridless)" in orange
   *  to indicate that this step was intentionally skipped.
   *  In GRID_3D mode, the sidebar shows the active E-field components
   *  (e.g. "Coro+VS(Kp)" or "Coro+Weimer"). */
  if (S.fieldMethod === 'GRIDLESS') {
    set('sb-efield', 'N/A (gridless)', 'o');
  } else {
    const efParts = [];
    if (S.eFieldCoro) efParts.push('Coro');
    if (S.eFieldConvModel === 'VOLLAND_STERN') efParts.push('VS(Kp)');
    else if (S.eFieldConvModel === 'WEIMER') efParts.push('Weimer');
    set('sb-efield', efParts.length ? efParts.join('+') : 'None', efParts.length ? 'g' : 'o');
  }

  /* ── Steps 7–10: Temporal, spectrum, output ── */
  set('sb-temporal', S.tempMode.replace('_',' '),'');
  const prettySpec = {
    POWER_LAW: 'POWER LAW',
    POWER_LAW_CUTOFF: 'PL + EXP CUTOFF',
    LIS_FORCE_FIELD: 'LIS + FORCE-FIELD',
    BAND: 'BAND FUNCTION',
    TABLE: 'TABLE FILE'
  };
  set('sb-spec-type', prettySpec[S.specType] || S.specType.replace('_',' '),'');
  set('sb-output-mode', S.outputMode.replace('_',' '),'g');

  /* ── Progress bar ──
   *  Denominator is 10: steps 1–10 are completable; step 11 (Review)
   *  is the terminal state and is not included in the progress count.
   *  (Changed from 9 to 10 when Step 2 "Calc Mode" was inserted.) */
  const pct=Math.round((S.done.size/10)*100);
  const pf=$('progress-fill'); if(pf) pf.style.width=pct+'%';
  const pp=$('progress-pct'); if(pp) pp.textContent=pct+'%';
}

/* ── 7. HELP MODAL ───────────────────────────────────────────────── */
function openHelpModal(){ const m=$('help-modal'); if(m) m.style.display='flex'; }
