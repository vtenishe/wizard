/*
=====================================================================
FILE: js/06-temporal.js
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
   FILE:    js/06-temporal.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 6 — Temporal variability of the background magnetic field.
            Three modes, OMNIWeb auto-fetch pipeline, and ts05_driving.txt
            format helpers.

   TEMPORAL MODES

   STEADY_STATE — single epoch snapshot.
     The geomagnetic field is fixed at the TS05 scalar parameters set in
     Step 3.  No time stepping.  Fastest; suitable for Störmer cutoff maps
     and systematic parameter sweeps.
     Keyword: TEMPORAL_MODE = STEADY_STATE

   TIME_SERIES — pre-computed field updates at FIELD_UPDATE_DT intervals.
     AMPS reads one row of ts05_driving.txt per field-update step.
     Each row contains the 8 TS05 scalars for that epoch.
     Particle injections occur every INJECT_DT minutes (must be a multiple
     of FIELD_UPDATE_DT).
     Recommended for realistic storm-time SEP transport studies.
     Keyword: TEMPORAL_MODE = TIME_SERIES

   MHD_COUPLED — self-consistent BATS-R-US / GAMERA field evolution.
     Not yet available; planned for 2026.
     Keyword: TEMPORAL_MODE = MHD_COUPLED

   ts05_driving.txt FORMAT
     One header line starting with '#'.
     Data columns (space-delimited, one epoch per row):
       YYYY MM DD HH MM  Dst[nT]  Pdyn[nPa]  Bz[nT]  Vx[km/s]  Nsw[cm⁻³]  By[nT]  Bx[nT]
     Timestamps must be strictly monotonically increasing.
     Gaps may be present; the OMNIWeb fetcher flags and optionally fills them.

   OMNIWEB AUTO-FETCH PIPELINE  (4-step animated progress display)
     Step 1: Query omniweb.gsfc.nasa.gov for OMNI solar-wind data
     Step 2: Query WDC Kyoto for Dst / Sym-H
     Step 3: Merge streams; detect and gap-fill
     Step 4: Generate preview table and data-quality report
     The pipeline is simulated client-side; real CCMC back-end executes
     the actual fetch on job submission.

   FIELD-UPDATE-VIZ TIMELINE
     Static HTML timeline in the form panel showing:
       · Blue ticks every 5 min = FIELD_UPDATE_DT (field refresh events)
       · 🚀 rockets every 30 min = INJECT_DT (particle injection events)
     Timeline illustrates the relationship between the two cadences.
     INJECT_DT must be ≥ FIELD_UPDATE_DT (validated by checkDtPair).

   PUBLIC API (called from HTML onclick / oninput)
     setTempMode(m)          — switch temporal mode card
     checkDtPair()           — validate FIELD_UPDATE_DT vs INJECT_DT
     setTsSource(btn, src)   — switch OMNIWeb / Upload / Scalar input source
     simulateOmniFetch()     — animate the 4-step OMNIWeb pipeline display

   DEPENDS ON: 01-state.js (S, $), 06-temporal is standalone for its handlers
=============================================================================*/

function setTempMode(m){
  S.tempMode=m;
  document.querySelectorAll('.temp-card').forEach(c=>c.classList.toggle('sel',c.dataset.mode===m));
  $('ts-form').style.display=m!=='STEADY_STATE'?'block':'none';
  updateSidebar();
}
function checkDtPair(){
  const fd=parseFloat($('field-update-dt')?.value)||5;
  const id=parseFloat($('inject-dt')?.value)||30;
  S.fieldDt=fd; S.injectDt=id;
  $('dt-warn').style.display = id<fd?'block':'none';
  updateTimeline();
}
function updateTimeline(){
  const tl=$('ts-timeline'); if(!tl) return;
  tl.innerHTML='<div class="fu-axis"></div>';
  const dur=120, fd=Math.max(1,S.fieldDt), id_=Math.max(1,S.injectDt);
  for(let t=0;t<=dur;t+=fd){
    const pct=(t/dur)*100;
    const tick=document.createElement('div'); tick.className='fu-tick';
    tick.style.left=pct+'%'; tl.appendChild(tick);
    if(t%30===0){ const lbl=document.createElement('div'); lbl.className='fu-label'; lbl.style.left=pct+'%'; lbl.textContent=t+'m'; tl.appendChild(lbl); }
  }
  for(let t=id_;t<=dur;t+=id_){
    const pct=(t/dur)*100;
    const p=document.createElement('div'); p.className='fu-particle'; p.style.left=(pct-.5)+'%'; p.textContent='⚡'; tl.appendChild(p);
  }
}
function setTsSource(btnOrSrc, src){
  // Called as setTsSource(btn, 'omni') from new HTML or setTsSource('omni') from old refs
  const mode = src || btnOrSrc;
  S.tsSource=mode;
  document.querySelectorAll('#ts-source-tog .tog-btn').forEach(b=>b.classList.remove('on'));
  const btnId={'omni':'ts-omni-btn','file':'ts-file-btn','scalar':'ts-scalar-btn'}[mode];
  if(btnId) $(btnId)?.classList.add('on');
  $('omni-panel').style.display=mode==='omni'?'block':'none';
  $('file-panel').style.display=mode==='file'?'block':'none';
}
function simulateOmniFetch(){
  const cadSel=$('omni-cadence');
  const cadMin=cadSel&&cadSel.value.startsWith('1 min')?1:cadSel&&cadSel.value.startsWith('1 hr')?60:5;
  const startEl=$('event-start'), endEl=$('event-end');
  const start=startEl?new Date(startEl.value):new Date('2017-09-07T00:00');
  const end=endEl?new Date(endEl.value):new Date('2017-09-10T20:00');
  const hrs=Math.max(0,(end-start)/(1000*3600));
  const rowCount=Math.round(hrs*60/cadMin);
  const msgs=[
    `⏳ Querying omniweb.gsfc.nasa.gov for ${cadMin}-min OMNI…`,
    '⏳ Querying wdc.kugi.kyoto-u.ac.jp for Dst / Sym-H…',
    '⏳ Merging streams and gap-filling…',
    '⏳ Generating preview and data quality report…'
  ];
  const steps=['os-1','os-2','os-3','os-4'];
  steps.forEach(id=>{ const e=$(id); if(e){e.classList.remove('done');e.className='os-num pending';e.textContent=steps.indexOf(id)+1;} });
  const st=$('omni-status'); if(st) st.innerHTML=`<span style="color:var(--orange)">${msgs[0]}</span>`;
  let i=0;
  const adv=()=>{
    if(i>0){ const pe=$(steps[i-1]); if(pe){pe.className='os-num done';pe.textContent='✓';} }
    if(i<steps.length){
      const ce=$(steps[i]); if(ce){ce.className='os-num';ce.style.background='var(--orange)';ce.textContent='…';}
      if(st&&msgs[i]) st.innerHTML=`<span style="color:var(--orange)">${msgs[i]}</span>`;
      i++; setTimeout(adv,700);
    } else {
      const s=startEl?startEl.value.replace('T',' '):'-', e=endEl?endEl.value.replace('T',' '):'-';
      if(st) st.innerHTML=`<span class="ok">✓ Fetch complete</span>&nbsp;&nbsp;Time range: <span style="color:#fff;">${s} → ${e} UTC</span><br/>`+
        `${rowCount} rows @ ${cadMin} min cadence&nbsp;·&nbsp;<span class="warn">⚠ 1 gap 19:00–19:30 UTC — linear interpolation applied (6 rows)</span>`;
    }
  };
  adv();
}

/* ── 3g. STEP 6 SPECTRUM ─────────────────────────────────────────── */
