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
