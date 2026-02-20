
/* ═══════════════════════════════════════════════════════════════════
   AMPS CCMC — INLINE APPLICATION SCRIPT
   All interactive logic for the 9-step submission wizard.
   Separated into logical sections:
     1. State & Constants
     2. Wizard Navigation
     3. Step-specific handlers
     4. SVG diagram renderers (Box + Shue)
     5. Spectrum canvas
     6. Review & param file builder
     7. Init
═══════════════════════════════════════════════════════════════════ */

/* ── 1. GLOBAL STATE ─────────────────────────────────────────────── */
const S = {
  step: 1, done: new Set(),
  runName:'SEP_Sep2017_VanAllenProbeA', piName:'', piEmail:'', institution:'',
  species:'proton', charge:1, mass:1.0073,
  fieldModel:'TS05', dst:-142.0, pdyn:3.5, bz:-18.5, vx:-650.0, nsw:12.0, by:3.2, bx:0.0,
  epoch:'2017-09-10T16:00',
  boundaryType:'SHUE', shueMode:'auto',
  boxXmax:15, boxXmin:-60, boxYmax:25, boxYmin:-25, boxZmax:20, boxZmin:-20, boxRinner:2.0,
  shueR0:null, shueAlpha:null, xtail:-60, shueRinner:2.0,
  tempMode:'TIME_SERIES', eventStart:'2017-09-07T00:00', eventEnd:'2017-09-10T20:00',
  fieldDt:5, injectDt:30, tsSource:'omni',
  specType:'POWER_LAW', specJ0:10000, specGamma:3.5, specE0:10, specEmin:1, specEmax:1000,
  outputMode:'TRAJECTORY', fluxDt:1.0, trajLoaded:false,
  fluxType:'DIFFERENTIAL', outputCutoff:true, outputPitch:false,
  outputFormat:'NETCDF4', outputCoords:'GEO',
  energyBins:[1,5,10,30,100,300,1000],
};

const $ = id => document.getElementById(id);
const CX=200, CY=160, SC=5; // SVG canvas centre & scale

/* ── 2. WIZARD NAVIGATION ────────────────────────────────────────── */
function goStep(n) {
  if(n < 1 || n > 9) return;
  S.done.add(S.step);
  S.step = n;
  for(let i=1;i<=9;i++) {
    const p=$(`panel-${i}`); if(p) p.classList.toggle('active', i===n);
    const el=document.querySelectorAll('.wz-step')[i-1];
    if(el){ el.classList.remove('done','active');
      if(S.done.has(i)) el.classList.add('done');
      else if(i===n) el.classList.add('active'); }
  }
  $('btn-prev').disabled = n===1;
  $('btn-next').style.display = n<9?'inline-flex':'none';
  $('btn-submit').style.display = n===9?'inline-flex':'none';
  window.scrollTo({top:0,behavior:'smooth'});
  updateSidebar();
  if(n===9) buildReview();
}
function nextStep(){ goStep(S.step+1); }
function prevStep(){ goStep(S.step-1); }
function goToReview(){ goStep(9); }

// Init wizard step indicators
document.querySelectorAll('.wz-step').forEach((el,i)=>{
  el.addEventListener('click',()=>goStep(i+1));
});

/* ── 3a. SECTION COLLAPSE ────────────────────────────────────────── */
function toggleSection(id){
  const el=$(id); if(el) el.classList.toggle('closed');
}

/* ── 3b. STEP 1 HANDLERS ─────────────────────────────────────────── */
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

/* ── 3d. STEP 3 BACKGROUND FIELD MODEL ──────────────────────────── */
// Selects which empirical magnetic field model drives the simulation.
// Only TS05 is fully implemented in Year 1; T04s and T89 are stubs.
function selectFieldModel(model, card) {
  S.fieldModel = model;
  document.querySelectorAll('.model-sel-card').forEach(c => c.classList.remove('sel'));
  card.classList.add('sel');
  // Update the FIELD_MODEL keyword in the live preview
  const kv = $('kv-field-model');
  if (kv) kv.textContent = model;
  // Show/hide param fields based on model
  const ts05Fields = document.getElementById('ts05-fields-wrap');
  if (ts05Fields) ts05Fields.style.opacity = model === 'T89' ? '0.5' : '1';
  // For T89, show a info box
  const t89note = document.getElementById('t89-note');
  if (t89note) t89note.style.display = model === 'T89' ? 'block' : 'none';
  updateKwPreview();
  updateSidebar();
}

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
function bndSet(type){
  S.boundaryType=type;
  $('bc-box')?.classList.toggle('sel',type==='BOX');
  $('bc-shue')?.classList.toggle('sel',type==='SHUE');
  $('bnd-box-panel').style.display=type==='BOX'?'block':'none';
  $('bnd-shue-panel').style.display=type==='SHUE'?'block':'none';
  if(type==='SHUE') bndShueUpdate(); else bndBoxUpdate();
  updateSidebar();
}
function shueMode(m){
  S.shueMode=m;
  $('shue-auto-btn')?.classList.toggle('on',m==='auto');
  $('shue-manual-btn')?.classList.toggle('on',m==='manual');
  $('shue-manual-fields').style.display=m==='manual'?'block':'none';
  $('shue-auto-box').style.opacity=m==='manual'?'0.5':'1';
  bndShueUpdate();
}
function shueCalc(){
  const bz=S.bz, pd=Math.max(0.1,S.pdyn);
  const r0=Math.max(4,Math.min(15,(11.4+0.013*bz)*Math.pow(pd,-1/6.6)));
  const al=Math.max(0.3,Math.min(0.9,(0.58-0.007*bz)*(1+0.024*Math.log(pd))));
  return {r0,alpha:al};
}
function getShue(){
  if(S.shueMode==='manual'&&S.shueR0&&S.shueAlpha) return {r0:S.shueR0,alpha:S.shueAlpha};
  return shueCalc();
}
function shueR(r0,al,deg){
  const th=deg*Math.PI/180, d=1+Math.cos(th); return d<1e-9?Infinity:r0*Math.pow(2/d,al);
}
// Map GSM → SVG
const gx=re=>CX+re*SC, gz=re=>CY-re*SC, cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

function bndBoxUpdate(){
  const v=k=>parseFloat($(k)?.value)||0;
  S.boxXmax=v('box-xmax'); S.boxXmin=v('box-xmin'); S.boxYmax=v('box-ymax');
  S.boxYmin=v('box-ymin'); S.boxZmax=v('box-zmax'); S.boxZmin=v('box-zmin');
  S.boxRinner=v('box-rinner');
  // Draw rectangle
  const rx=cl(gx(S.boxXmin),5,390), ry=cl(gz(S.boxZmax),5,310);
  const rw=cl(gx(S.boxXmax),5,390)-rx, rh=cl(gz(S.boxZmin),5,310)-ry;
  const rect=$('box-rect');
  if(rect){ rect.setAttribute('x',rx); rect.setAttribute('y',ry);
            rect.setAttribute('width',Math.max(0,rw)); rect.setAttribute('height',Math.max(0,rh)); }
  const ib=$('inner-box'); if(ib) ib.setAttribute('r',S.boxRinner*SC);
  const sl=(id,t,x,y)=>{ const e=$(id); if(e){e.setAttribute('x',x);e.setAttribute('y',y);e.textContent=t;} };
  sl('box-lbl-xmax','Xmax='+S.boxXmax, cl(gx(S.boxXmax)+2,10,360), CY+14);
  sl('box-lbl-xmin','Xmin='+S.boxXmin, cl(gx(S.boxXmin)-34,5,300), CY+14);
  sl('box-lbl-zmax','Zmax='+S.boxZmax, CX+4, cl(gz(S.boxZmax)-3,14,306));
  sl('box-lbl-zmin','Zmin='+S.boxZmin, CX+4, cl(gz(S.boxZmin)+11,14,306));
  // Validation
  const vi=(id,ok,okTxt,failTxt)=>{ const e=$(id); if(e) e.innerHTML=ok?`<span class="v-ok">${okTxt}</span>`:`<span class="v-warn">${failTxt}</span>`; };
  vi('bv-xrange', S.boxXmax>9,  '✓ Dayside OK',       '⚠ Xmax < 9 RE');
  vi('bv-yrange', S.boxYmax>=15,'✓ Flanks OK',        '⚠ Y < 15 RE');
  vi('bv-zrange', S.boxZmax>12&&Math.abs(S.boxZmin)>12,'✓ Z range OK','⚠ |Z| < 12 RE');
  vi('bv-inner',  S.boxRinner>=1.5&&S.boxRinner<=3.5,  '✓ R_inner OK','⚠ Typical 1.5–3.5 RE');
  // KW
  ['xmax','xmin','ymax','ymin','zmax','zmin','rinner'].forEach(k=>{
    const e=$('kw-'+k); if(e) e.textContent=Number(S['box'+k.charAt(0).toUpperCase()+k.slice(1)]).toFixed(1);
  });
}

function bndShueUpdate(){
  const v=k=>parseFloat($(k)?.value);
  S.xtail=v('shue-xtail')||S.xtail;
  S.shueRinner=v('shue-rinner')||S.shueRinner;
  if(S.shueMode==='manual'){ S.shueR0=v('shue-r0-in')||null; S.shueAlpha=v('shue-alpha-in')||null; }
  const {r0,alpha}=getShue();
  // Update displays
  const set=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  set('shue-r0-val',r0.toFixed(2)); set('shue-alpha-val',alpha.toFixed(3));
  set('shue-bz-disp',`${S.bz} / ${S.pdyn}`);
  const rFlank=shueR(r0,alpha,90);
  set('shue-rflank-val',isFinite(rFlank)?rFlank.toFixed(1):'—');
  // Build path
  const xtSvgX=cl(gx(S.xtail),8,390);
  let upper=[],lower=[];
  for(let d=0;d<=180;d+=2){
    const r=shueR(r0,alpha,d); if(!isFinite(r)) continue;
    const th=d*Math.PI/180, gx2=r*Math.cos(th), gz2=r*Math.sin(th);
    if(gx2<S.xtail) continue;
    upper.push([cl(gx(gx2),5,390), cl(gz(gz2),5,310)]);
    lower.unshift([cl(gx(gx2),5,390), cl(gz(-gz2),5,310)]);
  }
  if(upper.length>1){
    let path=`M ${upper[0][0]},${upper[0][1]}`;
    upper.forEach(([x,y])=>path+=` L ${x},${y}`);
    const tailZ=shueR(r0,alpha,179.9)*Math.sin(179.9*Math.PI/180);
    path+=` L ${xtSvgX},${cl(gz(-tailZ),5,310)}`;
    lower.forEach(([x,y])=>path+=` L ${x},${y}`);
    path+=' Z';
    $('shue-path')?.setAttribute('d',path);
  }
  const tc=$('shue-tailcap');
  if(tc){ tc.setAttribute('x1',xtSvgX); tc.setAttribute('x2',xtSvgX); }
  const tl=$('shue-tailcap-lbl'); if(tl){ tl.setAttribute('x',xtSvgX+3); tl.textContent='Xtail='+S.xtail; }
  const ish=$('inner-shue'); if(ish) ish.setAttribute('r',S.shueRinner*SC);
  const r0line=$('shue-r0-line'); if(r0line) r0line.setAttribute('x2',cl(gx(r0),100,390));
  const r0lbl=$('shue-r0-lbl'); if(r0lbl){ r0lbl.setAttribute('x',gx(r0/2)); r0lbl.textContent='r₀='+r0.toFixed(1); }
  const svglbl=$('shue-svg-label'); if(svglbl) svglbl.textContent=`r₀=${r0.toFixed(2)} RE  α=${alpha.toFixed(3)}`;
  // Validation
  const vi=(id,ok,okT,failT)=>{ const e=$(id); if(e) e.innerHTML=ok?`<span class="v-ok">${okT}</span>`:`<span class="v-warn">${failT}</span>`; };
  vi('sv-r0',    r0>5&&r0<13,      `✓ r₀=${r0.toFixed(2)} RE`,   `⚠ r₀=${r0.toFixed(2)} — atypical`);
  vi('sv-alpha', alpha>0.4&&alpha<0.8, `✓ α=${alpha.toFixed(3)}`,`⚠ α=${alpha.toFixed(3)} — unusual`);
  vi('sv-tail',  S.xtail<-20,      `✓ Tail cap OK`,              `⚠ X_tail should be < -20 RE`);
  // KW strip
  const isM=S.shueMode==='manual';
  set('kw-shue-r0',    isM?r0.toFixed(2):'AUTO');
  set('kw-shue-alpha', isM?alpha.toFixed(3):'AUTO');
  set('kw-xtail',      S.xtail.toFixed(1));
  set('kw-shue-rinner',S.shueRinner.toFixed(1));
}

/* ── 3f. STEP 5 TEMPORAL ─────────────────────────────────────────── */
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
function setTsSource(src){
  S.tsSource=src;
  ['omni','file','scalar'].forEach(s=>{ $(`ts-${s}-btn`)?.classList.toggle('on',s===src); });
  $('omni-panel').style.display=src==='omni'?'block':'none';
  $('file-panel').style.display=src==='file'?'block':'none';
}
function simulateOmniFetch(){
  const steps=['os-1','os-2','os-3','os-4'];
  steps.forEach(id=>{ const e=$(id); if(e){e.classList.remove('done');e.className='os-num pending'; e.textContent=e.textContent.replace('✓','○');} });
  const st=$('omni-status'); 
  if(st) st.innerHTML='<span style="color:var(--orange)">⏳ Querying OMNIWeb + WDC Kyoto…</span>';
  let i=0;
  const stepMsgs = [
    '⏳ Querying omniweb.gsfc.nasa.gov for 1-min OMNI…',
    '⏳ Querying wdc.kugi.kyoto-u.ac.jp for Dst / Sym-H…',
    '⏳ Merging streams and gap-filling…',
    '⏳ Generating preview and data quality report…'
  ];
  const adv=()=>{
    if(i>0){ const pe=$(steps[i-1]); if(pe){pe.className='os-num done';pe.textContent='✓';} }
    if(i<steps.length){ 
      const ce=$(steps[i]); if(ce){ce.className='os-num';ce.style.background='var(--orange)';ce.textContent='…';} 
      if(st) st.innerHTML=`<span style="color:var(--orange)">${stepMsgs[i]}</span>`;
      i++; setTimeout(adv,750); 
    }
    else{ 
      const cadence = $('omni-cadence')?.value || '5 min';
      const cadNum = cadence.includes('1 min') ? 1 : cadence.includes('1 hr') ? 60 : 5;
      const eventH = 80; // Sep 7-10 ~80 hours
      const rowCount = Math.round(eventH * 60 / cadNum);
      if(st) st.innerHTML=
        `<span class="ok">✓ Fetch complete</span> &nbsp; Time range: <span style="color:#fff;">2017-09-07 00:00 → 2017-09-10 20:00 UTC</span><br/>` +
        `${rowCount.toLocaleString()} rows @ ${cadNum} min cadence &nbsp;·&nbsp; ` +
        `<span class="warn">⚠ 1 gap 19:00–19:30 UTC Sep 10 — linear interpolation applied (6 rows)</span>`;
    }
  };
  adv();
}

/* ── 3g. STEP 6 SPECTRUM ─────────────────────────────────────────── */
function setSpec(type,card){
  S.specType=type;
  document.querySelectorAll('.spec-card').forEach(c=>c.classList.remove('sel'));
  if(card) card.classList.add('sel');
  ['pl-form','band-form','table-form'].forEach(id=>{
    const m={'pl-form':'POWER_LAW','band-form':'BAND','table-form':'TABLE'};
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
    if(S.specType==='POWER_LAW') J=S.specJ0*Math.pow(E/(S.specE0||10),-(S.specGamma||3.5));
    else if(S.specType==='BAND'){
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
function drawSvgGrid(svgId){
  const g=document.getElementById(svgId); if(!g) return;
  let html='';
  for(let x=-60;x<=20;x+=5){
    const px=cl(gx(x),5,390);
    html+=`<line x1="${px}" y1="4" x2="${px}" y2="316" stroke="${x===0?'#1e3a5a':'#0c1e38'}" stroke-width="${x===0?1:0.5}" ${x!==0?'stroke-dasharray="3,5"':''}/>`;
    if(x%20===0&&x!==0) html+=`<text x="${px-8}" y="${CY+18}" fill="#1a3050" font-family="IBM Plex Mono" font-size="8">${x}RE</text>`;
  }
  for(let z=-35;z<=35;z+=5){
    const py=cl(gz(z),5,310);
    html+=`<line x1="4" y1="${py}" x2="396" y2="${py}" stroke="${z===0?'#1e3a5a':'#0c1e38'}" stroke-width="${z===0?1:0.5}" ${z!==0?'stroke-dasharray="3,5"':''}/>`;
    if(z%20===0&&z!==0) html+=`<text x="${CX+3}" y="${py+3}" fill="#1a3050" font-family="IBM Plex Mono" font-size="8">${z}RE</text>`;
  }
  g.innerHTML=html;
}

/* ── 5. REVIEW & PARAM FILE ──────────────────────────────────────── */
function buildReview(){
  const {r0,alpha}=getShue();
  const isM=S.shueMode==='manual';
  const f=(v,d)=>Number(v).toFixed(d);
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

#PARTICLE_SPECIES
SPECIES                ${S.species.toUpperCase()}
CHARGE                 ${S.charge}               ! elementary charge
MASS_AMU               ${S.mass}           ! atomic mass units

#BACKGROUND_FIELD
FIELD_MODEL            ${S.fieldModel}
TS05_DST               ${f(S.dst,1)}         ! nT ring current index
TS05_PDYN              ${f(S.pdyn,2)}          ! nPa dynamic pressure
TS05_BZ                ${f(S.bz,2)}         ! nT IMF Bz GSM
TS05_VX                ${f(S.vx,1)}       ! km/s solar wind Vx
TS05_NSW               ${f(S.nsw,2)}         ! cm-3 proton density
TS05_BY                ${f(S.by,2)}          ! nT IMF By
TS05_BX                ${f(S.bx,2)}          ! nT IMF Bx
EPOCH                  ${S.epoch}  ! UTC snapshot

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
SPECTRUM_TYPE          ${S.specType}
SPEC_J0                ${S.specJ0.toExponential(2)}   ! p/cm2/s/sr/(MeV/n)
SPEC_GAMMA             ${f(S.specGamma,2)}         ! spectral index
SPEC_E0                ${f(S.specE0,1)}          ! MeV/n pivot
SPEC_EMIN              ${f(S.specEmin,1)}          ! MeV/n
SPEC_EMAX              ${f(S.specEmax,1)}       ! MeV/n

#OUTPUT_DOMAIN
OUTPUT_MODE            ${S.outputMode}
FLUX_DT                ${f(S.fluxDt,1)}           ! min output cadence

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
  const chks=[
    {l:'Run name set',           ok:!!(S.runName?.trim())},
    {l:'PI email valid',         ok:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('pi-email')?.value||'')},
    {l:'Dst in TS05 range',      ok:S.dst>=-600&&S.dst<=50},
    {l:'Pdyn > 0.1 nPa',         ok:S.pdyn>0.1},
    {l:'Domain boundary set',    ok:['BOX','SHUE'].includes(S.boundaryType)},
    {l:'Shue r₀ plausible (5–13 RE)', ok:S.boundaryType!=='SHUE'||( r0>5&&r0<13)},
    {l:'Inject Δt ≥ Field Update', ok:S.tempMode==='STEADY_STATE'||S.injectDt>=S.fieldDt},
    {l:'Energy bins defined',    ok:S.energyBins.length>0},
    {l:'Spectrum type selected', ok:['POWER_LAW','BAND','TABLE'].includes(S.specType)},
    {l:'Output mode selected',   ok:['POINTS','TRAJECTORY','SHELLS'].includes(S.outputMode)},
    {l:'Trajectory file loaded', ok:S.outputMode!=='TRAJECTORY'||S.trajLoaded, warn:true},
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

/* ── 6. SIDEBAR ──────────────────────────────────────────────────── */
function updateSidebar(){
  const set=(id,v,cls)=>{ const e=$(id); if(e){e.textContent=v;if(cls)e.className='sb-v '+cls;} };
  set('sb-run-name', S.runName||'(not set)', S.runName?'':'o');
  set('sb-species',  S.species==='proton'?'H⁺ Proton':S.species==='helium'?'He²⁺':S.species==='electron'?'e⁻':S.species,'g');
  set('sb-field-model','TS05','g');
  set('sb-boundary', S.boundaryType==='SHUE'?'Shue 1998':'Box (GSM)','g');
  set('sb-temporal', S.tempMode.replace('_',' '),'');
  set('sb-spec-type', S.specType.replace('_',' '),'');
  set('sb-output-mode', S.outputMode.replace('_',' '),'g');
  const pct=Math.round((S.done.size/9)*100);
  const pf=$('progress-fill'); if(pf) pf.style.width=pct+'%';
  const pp=$('progress-pct'); if(pp) pp.textContent=pct+'%';
}

/* ── 7. HELP MODAL ───────────────────────────────────────────────── */
function openHelpModal(){ const m=$('help-modal'); if(m) m.style.display='flex'; }

/* ── 8. INIT ─────────────────────────────────────────────────────── */
function init(){
  drawSvgGrid('shue-grid');
  drawSvgGrid('box-grid');
  bndShueUpdate();
  updateTimeline();
  renderBins();
  drawSpec();
  updateSidebar();
  goStep(1);
}
document.addEventListener('DOMContentLoaded', init);
