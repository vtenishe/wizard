/* =============================================================================
   FILE:    js/03-bgfield.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 1 (Run Info), Step 2 (Particle Species), and
            Step 3 (Background Magnetic Field Model) handlers.

   BACKGROUND FIELD MODELS SUPPORTED
     TS05  — Tsyganenko & Sitnov (2005).
             8 scalar drivers: Dst, Pdyn, Bz, Vx, Nsw, By, Bx, epoch.
             Best accuracy for storm-time SEP runs.
             Directly couples to Shue boundary auto-compute (Step 4)
             and Weimer E-field auto-mode (Step 5).
             FIELD_MODEL = TS05

     T04s  — Tsyganenko (2004s) storm-time variant of T04.
             Same 8-driver interface as TS05; legacy compatibility.
             FIELD_MODEL = T04s

     T95m  — Tsyganenko (1995) modified.
             Requires only Dst and Kp — useful for surveys where full
             solar wind data are unavailable.
             FIELD_MODEL = T95m

     T15   — Tsyganenko & Andreeva (2015).
             Most complete empirical model; additionally requires
             GOES geostationary total-B (|B| ≥ 50 nT typical).
             FIELD_MODEL = T15

     BATSRUS — Block-Adaptive Tree Solar-wind Roe Upwind Scheme
               (Powell et al. 1999).  Upload 3-D CCMC run output (.cdf / .h5).
               AMPS tri-linearly interpolates B onto particle positions.
               FIELD_MODEL = BATSRUS

     GAMERA  — Grid Agnostic MHD for Extended Research Applications
               (Sorathia et al. 2020).  High-resolution curvilinear-mesh.
               Upload GAMERA .h5 output.  Beta support.
               FIELD_MODEL = GAMERA

   PUBLIC API (called from HTML)
     liveUpdate()            — sync Step 1 text fields to S on keyup
     goalHint(v)             — show/hide goal hint text
     charCount(el,cid,max)   — live character counter for textareas
     selectSpecies(key,card) — choose particle species
     updateRigidity()        — recompute and display rigidity range
     selectFieldModel(model) — switch active model card + show its form
     ts05Change()            — sync TS05/T04s inputs → S + update KW
     t95mChange()            — sync T95m inputs → S
     t15Change()             — sync T15 inputs → S
     mhdChange()             — sync MHD file-upload inputs → S
     validateTs05()          — flag out-of-range TS05 parameter inputs
     updateKwPreview()       — refresh AMPS_PARAM.in keyword-preview strip

   DEPENDS ON: 01-state.js (S, $, set), 02-wizard.js (updateSidebar)
=============================================================================*/

/* ── STEP 1 — RUN INFO ──────────────────────────────────────────────── */

function liveUpdate(){
  S.runName = $('run-name')?.value||S.runName;
  updateSidebar();
}
function goalHint(v){
  const hints = {
    storm_validation: 'Compare AMPS-predicted cutoff rigidity with Van Allen Probe particle data during storm main phase.',
    gcr_baseline:     'Compute galactic cosmic ray fluxes at LEO under quiet geomagnetic conditions (Dst ≈ 0 nT).',
    sep_radiation:    'Quantify SEP fluence and dose at ISS altitude during a major solar particle event.',
    parameter_study:  'Systematic sensitivity study: vary Dst, Pdyn, and spectral index to map uncertainty space.',
    custom:           'Describe your science goal in the text area above.',
  };
  const el=$('goal-hint'); if(el) el.textContent = hints[v]||'';
}
function charCount(el,cid,max){
  const n=el.value.length, c=$(cid);
  if(c){ c.textContent=n+'/'+max;
    c.className='char-count'+(n>max*0.9?' near':'')+(n>max?' over':''); }
}

/* ── 3c. STEP 2 PARTICLE ─────────────────────────────────────────── */
const SPECIES={
  proton:  {Z:1,  A:1.0073,  label:'H⁺ Proton'},
  helium:  {Z:2,  A:4.0026,  label:'He²⁺ Alpha'},
  oxygen:  {Z:8,  A:15.999,  label:'O⁸⁺'},
  electron:{Z:-1, A:0.000549,label:'e⁻ Electron'},
  iron:    {Z:26, A:55.845,  label:'Fe²⁶⁺'},
  custom:  {Z:1,  A:1.0,     label:'Custom'},
};
function selectSpecies(key,card){
  const sp=SPECIES[key]; if(!sp) return;
  S.species=key; S.charge=sp.Z; S.mass=sp.A;
  document.querySelectorAll('.opt-card[id^="sp-"]').forEach(c=>c.classList.remove('sel'));
  if(card) card.classList.add('sel');
  $('custom-species-panel').style.display=key==='custom'?'block':'none';
  if(key!=='custom'){
    const ci=$('charge-input'), mi=$('mass-input');
    if(ci) ci.value=sp.Z; if(mi) mi.value=sp.A;
  }
  updateRigidity();
}
function updateRigidity(){
  const q=Math.abs(S.charge||1), A=S.mass||1;
  const E=100, mp=938.272;
  const Etot=E*A+A*mp, p=Math.sqrt(Etot**2-(A*mp)**2), R=p/(q*1000);
  const el=$('rigidity-info'); if(el) el.textContent=`R = ${R.toFixed(3)} GV at 100 MeV/n`;
}

/* ── 3d. STEP 3 TS05 ─────────────────────────────────────────────── */
function ts05Change(){
  const v = k => parseFloat($(k)?.value)||0;
  S.dst=v('ts05-dst'); S.pdyn=v('ts05-pdyn'); S.bz=v('ts05-bz');
  S.vx=v('ts05-vx');   S.nsw=v('ts05-nsw');   S.by=v('ts05-by'); S.bx=v('ts05-bx');
  S.epoch=$('ts05-epoch')?.value||S.epoch;
  validateTs05();
  updateKwPreview();
  bndShueUpdate(); // Shue params depend on Bz, Pdyn
  updateSidebar();
}
const TS05R={
  dst:{lo:-600,hi:50,wl:-300,wh:50},pdyn:{lo:0.1,hi:30,wl:0.5,wh:20},
  bz:{lo:-50,hi:20,wl:-30,wh:15},vx:{lo:-900,hi:-200,wl:-800,wh:-200},
  nsw:{lo:0.5,hi:80,wl:1,wh:50},by:{lo:-40,hi:40},bx:{lo:-40,hi:40},
};
function validateTs05(){
  Object.entries(TS05R).forEach(([key,r])=>{
    const v=S[key]; if(v===undefined) return;
    const el=$(`ts05-${key}`), st=$(`ts05-${key}-status`);
    if(!el) return;
    el.classList.remove('valid','warn','error');
    if(v<r.lo||v>r.hi){ el.classList.add('error'); if(st){st.textContent='✗ Out of TS05 range';st.style.color='var(--red)';} }
    else if((r.wl&&v<r.wl)||(r.wh&&v>r.wh)){ el.classList.add('warn'); if(st){st.textContent='⚠ Unusual — verify data source';st.style.color='var(--orange)';} }
    else{ el.classList.add('valid'); if(st){st.textContent='✓ Within normal range';st.style.color='var(--green)';} }
  });
}
function updateKwPreview(){
  const f=(v,d)=>Number(v).toFixed(d);
  const set=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  set('kv-dst', f(S.dst,1)); set('kv-pdyn',f(S.pdyn,2)); set('kv-bz',f(S.bz,2));
  set('kv-vx',  f(S.vx,1));  set('kv-nsw', f(S.nsw,2)); set('kv-by', f(S.by,2));
  set('kv-bx',  f(S.bx,2));  set('kv-epoch', S.epoch);
}

/* ── 3e. STEP 4 BOUNDARY ─────────────────────────────────────────── */

/* ── STEP 3 — BACKGROUND FIELD MODEL SELECTOR ──────────────────────── */
/*    The model selector uses a grid of .model-sel-card cards.           */
/*    Clicking a card calls selectFieldModel(name) which:                */
/*      1. Marks the chosen card as .sel (blue border + ✓)               */
/*      2. Shows the matching driving-parameter sub-form                  */
/*      3. Updates the MHD label if BATSRUS or GAMERA is chosen           */
/*      4. Refreshes the keyword-preview strip                            */

function selectFieldModel(model) {
  S.fieldModel = model;

  // ── Deselect all cards, mark chosen one ──
  document.querySelectorAll('.model-sel-card').forEach(c => c.classList.remove('sel'));
  const card = $(`msc-${model.toLowerCase()}`);
  if (card) card.classList.add('sel');

  // ── Show/hide model-specific driving-parameter forms ──
  const forms = { ts05: 'ts05-form', t95m: 't95m-form', t15: 't15-form', mhd: 'mhd-form' };
  Object.values(forms).forEach(id => {
    const el = $(id);
    if (el) el.style.display = 'none';
  });
  const isMhd  = (model === 'BATSRUS' || model === 'GAMERA');
  const isTs05 = (model === 'TS05' || model === 'T04s');

  if (isTs05) {
    $('ts05-form').style.display = 'block';
    const lbl = $('ts05-label');
    if (lbl) lbl.textContent = model === 'TS05'
      ? 'TS05 Driving Parameters'
      : 'T04s Driving Parameters (Dst, Pdyn, Bz, Vx, Nsw required)';
  } else if (model === 'T95m') {
    $('t95m-form').style.display = 'block';
  } else if (model === 'T15') {
    $('t15-form').style.display = 'block';
  } else if (isMhd) {
    $('mhd-form').style.display = 'block';
    const lbl = $('mhd-model-label');
    if (lbl) lbl.textContent = `${model} MHD Output`;
  }

  // ── Show/hide KW rows for each model ──
  document.querySelectorAll('.ts05-kw-row').forEach(r => r.style.display = isTs05 ? '' : 'none');
  document.querySelectorAll('.t95m-kw-row').forEach(r => r.style.display = model==='T95m' ? '' : 'none');
  document.querySelectorAll('.t15-kw-row').forEach(r  => r.style.display = model==='T15'  ? '' : 'none');
  document.querySelectorAll('.mhd-kw-row').forEach(r  => r.style.display = isMhd ? '' : 'none');

  // ── Update field-model value in KW strip ──
  const kv = $('kv-field-model');
  if (kv) kv.textContent = model;

  // Shue boundary auto-compute depends on TS05 Bz/Pdyn — recompute
  bndShueUpdate();

  updateSidebar();
}

/* t95mChange — called on T95m input change */
function t95mChange() {
  S.dst   = parseFloat($('t95m-dst')?.value)  || S.dst;
  S.t95Kp = parseFloat($('t95m-kp')?.value)   || S.t95Kp;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('kv-t95m-dst', Number(S.dst).toFixed(1));
  set('kv-t95m-kp',  Number(S.t95Kp).toFixed(1));
  updateSidebar();
}

/* t15Change — called on T15 input change */
function t15Change() {
  S.dst      = parseFloat($('t15-dst')?.value)   || S.dst;
  S.pdyn     = parseFloat($('t15-pdyn')?.value)  || S.pdyn;
  S.bz       = parseFloat($('t15-bz')?.value)    || S.bz;
  S.t15GoesB = parseFloat($('t15-goes')?.value)  || S.t15GoesB;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('kv-t15-dst',  Number(S.dst).toFixed(1));
  set('kv-t15-pdyn', Number(S.pdyn).toFixed(2));
  set('kv-t15-bz',   Number(S.bz).toFixed(1));
  set('kv-t15-goes', Number(S.t15GoesB).toFixed(1));
  bndShueUpdate();
  updateSidebar();
}

/* mhdChange — called on MHD interpolation setting change */
function mhdChange() {
  S.mhdInterp = $('mhd-interp')?.value || S.mhdInterp;
  const set = (id,v) => { const e=$(id); if(e) e.textContent=v; };
  set('kv-mhd-interp', S.mhdInterp);
  updateSidebar();
}


