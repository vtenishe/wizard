/*
=====================================================================
FILE: js/07-spectrum-output.js
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
/* ── 3g. STEP 7 SPECTRUM ───────────────────────────────────────── */
// Select a spectrum model card, update state, and refresh the parameter UI + preview.
// NOTE: index.html calls setSpec(...) from onclick handlers, so this must exist in the modular build.
function setSpec(type,card){
  S.specType=type;
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('sel'));
  if(card) card.classList.add('sel');
  ['pl-form','plc-form','lis-form','band-form','table-form'].forEach(id=>{
    const m={'pl-form':'POWER_LAW','plc-form':'POWER_LAW_CUTOFF','lis-form':'LIS_FORCE_FIELD','band-form':'BAND','table-form':'TABLE'};
    const el=$(id); if(el) el.style.display=m[id]===type?'block':'none';
  });
  drawSpec();
}
// Render the small "Spectrum Preview" plot based on the currently selected model and parameters.
// The preview is intentionally qualitative (shape/relative scaling) and is not used for physics.
function drawSpec(){
  S.specJ0=parseFloat($('spec-j0')?.value)||S.specJ0;
  S.specGamma=parseFloat($('spec-gamma')?.value)||S.specGamma;
  S.specE0=parseFloat($('spec-e0')?.value)||S.specE0;
  S.specEmin=parseFloat($('spec-emin')?.value)||S.specEmin;
  S.specEmax=parseFloat($('spec-emax')?.value)||S.specEmax;
  S.specEc=parseFloat($('spec-ec')?.value)||S.specEc;
  S.specPhi=parseFloat($('spec-phi')?.value)||S.specPhi;
  S.specLisJ0=parseFloat($('lis-j0')?.value)||S.specLisJ0;
  S.specLisGamma=parseFloat($('lis-gamma')?.value)||S.specLisGamma;
  const canvas=$('spec-canvas'); if(!canvas) return;
  const W=canvas.parentElement.clientWidth||400, H=160;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#060e1c'; ctx.fillRect(0,0,W,H);
  const emin=Math.max(0.1,S.specEmin), emax=Math.min(1e5,S.specEmax);
  const lemin=Math.log10(emin), lemax=Math.log10(emax);
  const ljmin=-2, ljmax=8, pad=28;
  ctx.strokeStyle='#0d2040'; ctx.lineWidth=0.5;
  for(let le=Math.ceil(lemin);le<=Math.floor(lemax);le++){
    const x=((le-lemin)/(lemax-lemin))*(W-pad-10)+pad;
    ctx.beginPath(); ctx.moveTo(x,5); ctx.lineTo(x,H-18); ctx.stroke();
    ctx.fillStyle='#2a4060'; ctx.font='8px IBM Plex Mono';
    ctx.fillText('10^'+le,x-8,H-4);
  }
  for(let lj=ljmin;lj<=ljmax;lj+=2){
    const y=H-18-((lj-ljmin)/(ljmax-ljmin))*(H-22);
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(W-8,y); ctx.stroke();
    ctx.fillStyle='#2a4060'; ctx.font='7px IBM Plex Mono'; ctx.fillText('10^'+lj,1,y+3);
  }
  ctx.strokeStyle='#38c0ff'; ctx.lineWidth=2; ctx.beginPath();
  let started=false;
  for(let i=0;i<=300;i++){
    const le=lemin+(i/300)*(lemax-lemin), E=Math.pow(10,le);
    let J;
    if(S.specType==='POWER_LAW') {
      J=S.specJ0*Math.pow(E/(S.specE0||10),-(S.specGamma||3.5));
    } else if(S.specType==='POWER_LAW_CUTOFF') {
      const j0=parseFloat($('plc-j0')?.value)||S.specJ0;
      const gamma=parseFloat($('plc-gamma')?.value)||S.specGamma;
      const e0=parseFloat($('plc-e0')?.value)||S.specE0;
      const ec=S.specEc||500;
      J=j0*Math.pow(E/e0,-gamma)*Math.exp(-E/ec);
    } else if(S.specType==='LIS_FORCE_FIELD') {
      const jLis=S.specLisJ0||10000;
      const gammaLis=S.specLisGamma||2.7;
      const e0=parseFloat($('lis-e0')?.value)||S.specE0;
      const phi=S.specPhi||550;
      const M=938.272;
      const Ephi=E+phi;
      const Esq=E*E, Ephisq=Ephi*Ephi;
      const Jlis_at_Ephi=jLis*Math.pow(Ephi/e0,-gammaLis);
      J=Jlis_at_Ephi*(Esq+2*E*M)/(Ephisq+2*Ephi*M);
    } else if(S.specType==='BAND'){
      const g1=parseFloat($('band-gamma1')?.value)||3.5, g2=parseFloat($('band-gamma2')?.value)||1.5;
      const e0=parseFloat($('band-e0')?.value)||10, Eb=(g1-g2)*e0;
      J=E<Eb?S.specJ0*Math.pow(E/e0,-g1)*Math.exp(-E/e0):S.specJ0*Math.pow((g1-g2),g1-g2)*Math.exp(g2-g1)*Math.pow(E/e0,-g2);
    } else break;
    const lJ=Math.log10(Math.max(1e-4,J));
    const x=((le-lemin)/(lemax-lemin))*(W-pad-10)+pad;
    const y=H-18-((lJ-ljmin)/(ljmax-ljmin))*(H-22);
    if(!started){ ctx.moveTo(x,Math.max(5,Math.min(H-18,y))); started=true; }
    else ctx.lineTo(x,Math.max(5,Math.min(H-18,y)));
  }
  ctx.stroke();
}

/* ── 3h. STEP 7 OUTPUT DOMAIN ────────────────────────────────────── */
function setMode(m,card){
  S.outputMode=m;
  document.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('sel'));
  if(card) card.classList.add('sel');
  ['panel-mode-a','panel-mode-b','panel-mode-c'].forEach(id=>{
    const map={'panel-mode-a':'POINTS','panel-mode-b':'TRAJECTORY','panel-mode-c':'SHELLS'};
    const el=$(id); if(el) el.style.display=map[id]===m?'block':'none';
  });
  updateSidebar();
}
/**
 * Update POINTS-mode freeform list.
 * The UI accepts one point per line. We keep the raw text here so that:
 *   (a) the Review step can embed it into the generated AMPS_PARAM.in (human readable), and
 *   (b) the backend can optionally write it into a sidecar file (points.txt) for ingestion.
 *
 * NOTE: This wizard is a front-end; the definitive parsing/validation should happen in the backend.
 */
function updatePoints(){
  const ta=$('points-text');
  if(!ta) return;
  S.pointsText=ta.value||'';
  // Trigger sidebar refresh / review refresh hooks, if present.
  if(typeof liveUpdate==='function') liveUpdate();
  if(typeof updateSidebar==='function') updateSidebar();
}

/**
 * Update SHELLS-mode configuration.
 * We store:
 *   - shellCount: number of altitude shells
 *   - shellResDeg: angular resolution in degrees
 *   - shellAltsKm: array of altitudes (km) length = shellCount
 *
 * Also shows/hides altitude fields in the UI so users don’t accidentally edit inactive shells.
 */
function updateShells(){
  const sel=$('shell-count');
  const res=$('shell-res-deg');
  const n=Math.max(1, Math.min(5, parseInt(sel?.value||'1',10)));
  const d=Math.max(1, parseInt(res?.value||'1',10));

  S.shellCount=n;
  S.shellResDeg=d;
  S.shellAltsKm=[];

  for(let i=1;i<=5;i++){
    const wrap=$(`shell-alt-wrap-${i}`);
    if(wrap) wrap.style.display = (i<=n) ? 'block' : 'none';
    const inp=$(`shell-alt-${i}`);
    if(i<=n){
      const v=parseFloat(inp?.value||'0');
      S.shellAltsKm.push(isFinite(v)?v:0);
    }
  }

  if(typeof liveUpdate==='function') liveUpdate();
  if(typeof updateSidebar==='function') updateSidebar();
}

function loadTrajExample(){
  S.trajLoaded=true;
  const dz=$('traj-dropzone');
  if(dz){ dz.classList.add('loaded');
    dz.innerHTML='<div class="dz-icon">✅</div><div class="dz-primary" style="color:var(--green)">VanAllenProbeA_sep2017.txt</div><div class="dz-sub">14,412 rows · Gregorian format · 2017-09-07 → 2017-09-10 UTC</div>'; }
  $('traj-preview-panel').style.display='block';
}

/* ── 3i. STEP 8 OUTPUT OPTIONS ───────────────────────────────────── */
function setFluxType(t,btn){
  S.fluxType=t;
  document.querySelectorAll('.flux-type-btn').forEach(b=>b.classList.remove('on'));
  if(btn) btn.classList.add('on');
}
const PRESETS={
  default:[1,5,10,30,100,300,1000],
  fine:[1,2,3,5,7,10,15,20,30,50,70,100,200,300,500,1000],
  goes:[5,10,30,50,60,100,300,500],
  broad:[1,10,100,1000],
};
function applyBinPreset(k){ if(PRESETS[k]){ S.energyBins=[...PRESETS[k]]; renderBins(); } }
function addBin(){
  const inp=$('new-bin-val'); if(!inp) return;
  const v=parseFloat(inp.value);
  if(v>0&&!S.energyBins.includes(v)){ S.energyBins.push(v); renderBins(); inp.value=''; }
}
function removeBin(i){ S.energyBins.splice(i,1); renderBins(); }
function renderBins(){
  S.energyBins.sort((a,b)=>a-b);
  const c=$('ebin-list'); if(!c) return; c.innerHTML='';
  const jAtE=E=>S.specJ0*Math.pow(E/(S.specE0||10),-(S.specGamma||3.5));
  const maxJ=Math.max(...S.energyBins.map(jAtE));
  S.energyBins.forEach((e,i)=>{
    const pct=Math.max(5,Math.min(100,(Math.log10(jAtE(e))-Math.log10(1e-3))/(Math.log10(maxJ+1)-Math.log10(1e-3))*100));
    const row=document.createElement('div'); row.className='ebin-row';
    row.innerHTML=`<span class="ebin-range" style="color:#38c0ff">${e} MeV/n</span>
      <div class="ebin-bar-wrap"><div class="ebin-bar" style="width:${pct.toFixed(0)}%"></div></div>
      <span style="font-size:10px;color:var(--text-dim)">${jAtE(e).toExponential(1)} p/cm²/s/sr/(MeV/n)</span>
      <span class="ebin-del" onclick="removeBin(${i})" title="Remove">✕</span>`;
    c.appendChild(row);
  });
  const ts=$('total-output-size'); if(ts) ts.textContent=`~${(S.energyBins.length*0.8).toFixed(1)} GB output`;
}

/* ── 4. SVG GRID INIT ────────────────────────────────────────────── */
