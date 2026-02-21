/* =============================================================================
   FILE:    js/07-spectrum-output.js
   PROJECT: AMPS CCMC Submission Interface  v3
   PURPOSE: Step 7 (Particle Source Spectrum), Step 8 (Output Domain),
            and Step 9 (Output Options & Energy Bins).

   STEP 7 — PARTICLE SOURCE SPECTRUM
     Defines the SEP / GCR flux assigned to particles that reach the outer
     domain boundary (set in Step 4).  Three spectral forms:

     POWER_LAW — J(E) = J₀ · (E / E₀)^(−γ)
       Parameters: J₀ [cm⁻² sr⁻¹ s⁻¹ MeV⁻¹], γ (spectral index), E₀ [MeV]
       Keyword: SPEC_TYPE = POWER_LAW

     BAND — Band et al. (1993) broken power-law
       Low-energy index α, high-energy index β, break energy E₀
       Good fit for large SEP events.
       Keyword: SPEC_TYPE = BAND

     TABLE — user-supplied E vs J table
       Upload a two-column ASCII file: energy [MeV] and flux.
       Keyword: SPEC_TYPE = TABLE

   Canvas rendering (drawSpec):
     Log–log plot on an HTML5 canvas element (#spec-canvas).
     Axes: x = Energy [MeV], y = Flux [cm⁻² sr⁻¹ s⁻¹ MeV⁻¹]
     Grid lines every decade; spectrum curve drawn in electric blue.
     Vertical dashed lines show the Emin / Emax energy window.
     Redrawn on every parameter change.

   STEP 8 — OUTPUT DOMAIN
     TRAJECTORY — compute flux at discrete spacecraft positions
                  from an uploaded trajectory file (Mode B / NAIRAS format)
     GRID_3D    — full 3-D grid output (cartesian or spherical)
     GRID_2D    — equatorial or meridional plane slice
     GRID_1D    — L-shell or radial profile

   STEP 9 — OUTPUT OPTIONS
     Energy bins      — user-editable list of energies [MeV]
                        with preset buttons: SEP standard / GCR / custom
     Flux type        — DIFFERENTIAL (default) | INTEGRAL
     Output fields    — cutoff rigidity, pitch-angle distribution
     File format      — NetCDF4 (default) | HDF5 | ASCII
     Coordinate frame — GEO | GSM | SM

   PUBLIC API (called from HTML onclick / oninput)
     setSpec(type, card)   — switch spectrum type card
     drawSpec()            — re-render the spectrum canvas
     setMode(m, card)      — switch output mode
     loadTrajExample()     — fill textarea with sample trajectory snippet
     setFluxType(t, btn)   — DIFFERENTIAL | INTEGRAL toggle
     applyBinPreset(k)     — load a preset energy bin set
     addBin()              — add a new energy bin input row
     removeBin(i)          — remove energy bin row at index i
     renderBins()          — re-render the entire energy bin list

   DEPENDS ON: 01-state.js (S, $, set)
=============================================================================*/

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
      const phi=S.specPhi||550; // modulation potential in MV
      const M=938.272; // proton rest mass in MeV
      // Force-field approximation: J(E,phi) = J_LIS(E+phi) * (E^2+2EM) / ((E+phi)^2+2(E+phi)M)
      const Ephi=E+phi;
      const Esq=E*E, Ephisq=Ephi*Ephi;
      const T=E/(E+M), Tphi=Ephi/(Ephi+M); // kinetic energy ratios
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
